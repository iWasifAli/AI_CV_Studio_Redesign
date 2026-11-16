import 'server-only';
import type { DesignSpec } from '@/modules/resume/schema';
import { tierDesignId } from '@/modules/design/catalogue';
import type { SessionUser } from '@/modules/identity/session';
import { getUserStore } from '@/modules/store';
import {
  DEFAULT_CONFIG,
  parseConfig,
  type BusinessConfig,
  type Metered,
  type PlanId,
} from './config';
import { canUse, canUseDesign, monthKey, type Decision } from './gate';

/** Server side of the entitlement gate: config (cached), plan, usage, reservations. */

const CONFIG_AREA = 'business';
const CACHE_MS = 60_000;
type Cached = { at: number; value: BusinessConfig; version: number };
/**
 * Kept on globalThis: pages and API routes are separate module copies in the server bundle, so a
 * module variable cleared by a settings save in an API route would leave pages on the old
 * settings for up to a minute.
 */
const box = globalThis as unknown as { __cvStudioConfig?: Cached | null };

export async function getBusinessConfig(
  fresh = false,
): Promise<{ value: BusinessConfig; version: number }> {
  let cache = box.__cvStudioConfig ?? null;
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache;
  try {
    const stored = await getUserStore().getConfig(CONFIG_AREA);
    cache = {
      at: Date.now(),
      value: stored ? parseConfig(stored.value) : DEFAULT_CONFIG,
      version: stored?.version ?? 0,
    };
  } catch (e) {
    console.error(
      JSON.stringify({ level: 'error', area: 'config', message: (e as Error).message }),
    );
    cache = { at: Date.now(), value: cache?.value ?? DEFAULT_CONFIG, version: cache?.version ?? 0 };
  }
  box.__cvStudioConfig = cache;
  return cache;
}

export function invalidateConfigCache() {
  box.__cvStudioConfig = null;
}

/**
 * The person's plan. Read once per request: the same session object asks for it in the design
 * check and the allowance check (gap audit G-10: each database read costs ~0.2 s on production).
 */
const planOnce = new WeakMap<
  SessionUser,
  Promise<{ plan: PlanId; passExpiresAt: string | null }>
>();
export function planFor(
  user: SessionUser | null,
): Promise<{ plan: PlanId; passExpiresAt: string | null }> {
  if (!user) return Promise.resolve({ plan: 'visitor', passExpiresAt: null });
  let p = planOnce.get(user);
  if (!p) {
    p = getUserStore()
      .getPass(user.uid)
      .then((pass) =>
        pass && pass.expiresAt > new Date().toISOString()
          ? { plan: 'premium' as const, passExpiresAt: pass.expiresAt }
          : { plan: 'free' as const, passExpiresAt: pass?.expiresAt ?? null },
      );
    p.catch(() => planOnce.delete(user));
    planOnce.set(user, p);
  }
  return p;
}

/**
 * Grant or extend Premium. An active pass is extended from its end, so buying again early never
 * loses days; otherwise the pass starts now. Returns the new expiry.
 */
export async function grantPass(
  uid: string,
  days: number,
  by: string,
  source: 'manual' | 'admin' | 'referral',
  note?: string,
): Promise<string> {
  const store = getUserStore();
  const cur = await store.getPass(uid);
  const now = new Date();
  const from = cur && cur.expiresAt > now.toISOString() ? new Date(cur.expiresAt) : now;
  const expiresAt = new Date(from.getTime() + days * 86_400_000).toISOString();
  await store.setPass(uid, {
    plan: 'premium',
    expiresAt,
    source,
    grantedBy: by,
    grantedAt: now.toISOString(),
    ...(note ? { note: note.slice(0, 200) } : {}),
  });
  return expiresAt;
}

/**
 * Whether the plan includes a capability at all (switches on, limit not 0), without counting a
 * use: for actions that are part of a counted one (AI Designer refines follow a compose).
 */
export async function includes(user: SessionUser | null, cap: Metered): Promise<Decision> {
  const [{ value: cfg }, { plan }] = await Promise.all([getBusinessConfig(), planFor(user)]);
  return canUse(user ? plan : 'visitor', cfg, cap, 0);
}

/** Reserve one use of a metered capability. Call release() if the work then fails. */
/**
 * Reserves `weight` uses of a metered capability (spec §14: some AI actions cost more than one,
 * e.g. the application kit = 3). Released with the same weight if the action fails.
 */
export async function reserve(
  user: SessionUser | null,
  cap: Metered,
  weight = 1,
): Promise<{ decision: Decision; release: () => Promise<void>; plan: PlanId }> {
  const noop = async () => {};
  const month = monthKey();
  // Settings, plan and this month's usage are read side by side, not one after another.
  const [{ value: cfg }, { plan }, usage] = await Promise.all([
    getBusinessConfig(),
    planFor(user),
    user ? getUserStore().getUsage(user.uid, month) : Promise.resolve({} as Record<string, number>),
  ]);
  if (!user) return { decision: canUse('visitor', cfg, cap, 0), release: noop, plan };
  const pre = canUse(plan, cfg, cap, usage[cap] ?? 0);
  if (!pre.ok) return { decision: pre, release: noop, plan };
  const limit = cfg.plans[plan].limits[cap];
  const got = await getUserStore().reserveUsage(user.uid, month, cap, limit, weight);
  if (!got) return { decision: canUse(plan, cfg, cap, limit), release: noop, plan };
  return {
    decision: { ok: true },
    plan,
    release: () => getUserStore().releaseUsage(user.uid, month, cap, weight),
  };
}

export async function checkDesign(user: SessionUser | null, design: DesignSpec): Promise<Decision> {
  const [{ value: cfg }, { plan }] = await Promise.all([getBusinessConfig(), planFor(user)]);
  const id = tierDesignId(design);
  // A design customised in the Design Studio (no longer a catalogue design) is a Premium
  // "Designer" feature.
  if (id === null)
    return plan === 'premium'
      ? { ok: true }
      : {
          ok: false,
          reason: 'premium',
          message:
            'Custom designs are part of Premium. Go back to a catalogue design or the ATS-safe version to download free.',
        };
  return canUseDesign(plan, cfg, id);
}

/** What the browser may show: plan, limits, usage and the public catalogue. */
export async function entitlementsFor(user: SessionUser | null) {
  const [{ value: cfg }, { plan, passExpiresAt }] = await Promise.all([
    getBusinessConfig(),
    planFor(user),
  ]);
  const usage = user ? await getUserStore().getUsage(user.uid, monthKey()) : {};
  return {
    plan,
    planLabel: cfg.plans[plan].label,
    passExpiresAt,
    limits: cfg.plans[plan].limits,
    usage: {
      'pdf.download': usage['pdf.download'] ?? 0,
      'import.cv': usage['import.cv'] ?? 0,
      'ai.action': usage['ai.action'] ?? 0,
      'design.ai': usage['design.ai'] ?? 0,
      'ats.check': usage['ats.check'] ?? 0,
    },
    designs: cfg.designs,
    passes: cfg.passes.filter((p) => p.active),
    features: {
      ai: cfg.features.ai,
      import: cfg.features.import,
      sales: cfg.features.sales,
      signups: cfg.features.signups,
      maintenance: cfg.features.maintenance,
      designStudio: cfg.features.designStudio,
      designer: cfg.features.designer,
      atsCheck: cfg.features.atsCheck,
      letters: cfg.features.letters,
      kit: cfg.features.kit,
      mockInterview: cfg.features.mockInterview,
      coach: cfg.features.coach,
      stories: cfg.features.stories,
      skillGap: cfg.features.skillGap,
      jobFromUrl: cfg.features.jobFromUrl,
      reminders: cfg.features.reminders,
      shareComments: cfg.features.shareComments,
      portfolioContact: cfg.features.portfolioContact,
      linkedinReview: cfg.features.linkedinReview,
      jobInsights: cfg.features.jobInsights,
      proofread: cfg.features.proofread,
      quantify: cfg.features.quantify,
      pack: cfg.features.pack,
      gapCoach: cfg.features.gapCoach,
      community: cfg.features.community,
      translate: cfg.features.translate,
      companyBrief: cfg.features.companyBrief,
      careerPaths: cfg.features.careerPaths,
    },
    aiWeights: cfg.aiWeights,
    hiddenLetterTypes: cfg.content.hiddenLetterTypes,
    designerPrompts: cfg.content.designerPrompts ?? [],
    announcement: cfg.announcement.enabled ? cfg.announcement.text : null,
  };
}
export type Entitlements = Awaited<ReturnType<typeof entitlementsFor>>;

/** Error envelope for a denied decision (docs/engineering/api-contracts.md). */
export function denialCode(d: Exclude<Decision, { ok: true }>) {
  return d.reason === 'sign_in'
    ? ('SIGN_IN_REQUIRED' as const)
    : d.reason === 'premium'
      ? ('PREMIUM_REQUIRED' as const)
      : d.reason === 'limit'
        ? ('LIMIT_REACHED' as const)
        : ('DISABLED' as const);
}
