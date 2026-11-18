'use client';

import { useT } from '@/i18n/client';
import { useEffect, useState } from 'react';
import { Banner } from '@/components/ui/banner';
import { ButtonLink } from '@/components/ui/button';
import { AdminHeading } from './admin-shell';
import { adminGet } from './api';
import { numberStatus, MIN_BASE, type Num } from '@/modules/metrics/numbers';

type Overview = {
  month: string;
  users: {
    total: number;
    recent: { uid: string; email: string | null; lastSeenAt: string | null }[];
  };
  usage: Record<'pdf.download' | 'import.cv' | 'ai.action', number>;
  premium: { active: number; total: number };
  payments: { pending: number };
  product?: Num[];
  numbers: {
    from: string;
    newAccounts: number;
    visitorsAtDownload: number;
    pdfs: number;
    hitDownloadLimit: number;
    words?: number;
    shareViews?: number;
    portfolioViews?: number;
    invitesJoined?: number;
    inviteRewards?: number;
    couponsUsed?: number;
    imports: number;
    importsWithAi: number;
    importFailures: number;
    aiActions: number;
    aiFailures: number;
    aiCallsToday: number;
    aiDailyBudget: number;
    aiCost?: Record<'month' | 'today', { usd: number; pkr: number; tokens: number }>;
    makeover?: {
      landing: number;
      started: number;
      revealed: number;
      previews: number;
      failed: number;
      saved: number;
      designSwitches: number;
      scoreShares?: number;
      scansRead: number;
      polish: number;
    };
    premiumRequests: number;
    premiumApproved: number;
    premiumRejected: number;
    avgApprovalMinutes: number | null;
    daily: { day: string; accounts: number; pdfs: number; imports: number; ai: number }[];
  };
  config: { version: number; sales: boolean; ai: boolean; maintenance: boolean };
  aiProvider: string;
};

export function AdminOverview() {
  const t = useT();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    adminGet<Overview>('/api/admin/overview').then(setData, (e: Error) => setError(e.message));
  }, []);
  return (
    <>
      <AdminHeading title={t('Overview')} intro="How the studio is doing this month." />
      {error && (
        <Banner tone="error" title={t('Could not load the overview')}>
          {error}
        </Banner>
      )}
      {!data && !error && <div className="skeleton h-40 rounded-lg" aria-busy="true" />}
      {data && (
        <div className="flex flex-col gap-6">
          {data.payments.pending > 0 && (
            <Banner
              tone="warning"
              title={t('{pending} payment{v1} waiting for a check', {
                pending: data.payments.pending,
                v1: data.payments.pending === 1 ? '' : 's',
              })}
              action={
                <ButtonLink href="/admin/payments" size="sm">
                  {t('Review payments')}
                </ButtonLink>
              }
            />
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="admin-stats">
            <Stat label={t('Accounts')} value={data.users.total} />
            <Stat label={t('Premium active')} value={data.premium.active} />
            <Stat
              label={t('PDF downloads ({month})', { month: data.month })}
              value={data.usage['pdf.download']}
            />
            <Stat
              label={t('AI actions ({month})', { month: data.month })}
              value={data.usage['ai.action']}
            />
          </div>
          {data.product && <ProductNumbers list={data.product} />}
          <Numbers n={data.numbers} />
          <section className="border-line bg-surface rounded-lg border p-5">
            <h2 className="mb-3 text-lg font-semibold">{t('Switches')}</h2>
            <ul className="flex flex-wrap gap-2 text-sm">
              <Flag on={data.config.sales} label={t('Premium sales')} />
              <Flag on={data.config.ai} label={t('AI help (setting)')} />
              <Flag
                on={data.aiProvider !== 'off'}
                label={t('AI server: {aiProvider}', { aiProvider: data.aiProvider })}
              />
              <Flag
                on={!data.config.maintenance}
                label={data.config.maintenance ? t('Maintenance mode') : t('Open')}
              />
            </ul>
            <p className="text-ink-muted mt-3 text-sm">
              {t('Settings version {version}.', { version: data.config.version })}
            </p>
          </section>
          <section className="border-line bg-surface rounded-lg border p-5">
            <h2 className="mb-3 text-lg font-semibold">{t('Recently active')}</h2>
            {data.users.recent.length === 0 ? (
              <p className="text-ink-muted text-sm">{t('No accounts yet.')}</p>
            ) : (
              <ul className="divide-line divide-y text-sm">
                {data.users.recent.map((u) => (
                  <li key={u.uid} className="flex justify-between gap-4 py-2">
                    <span className="truncate">{u.email ?? u.uid}</span>
                    <span className="text-ink-muted shrink-0">{when(u.lastSeenAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-line bg-surface rounded-lg border p-4">
      <p className="text-ink-muted text-sm">{label}</p>
      <p className="font-display mt-1 text-3xl font-semibold tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <li
      className={
        on
          ? 'rounded-full bg-[#e3f1e6] px-3 py-1 font-semibold text-[#1f5c2e]'
          : 'bg-sunken text-ink-muted rounded-full px-3 py-1 font-semibold'
      }
    >
      {on ? '● ' : '○ '}
      {label}
    </li>
  );
}

export function when(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

/** Landing → upload → reveal → saved (spec §16 R5). */
function Funnel({ m }: { m: NonNullable<Overview['numbers']['makeover']> }) {
  const t = useT();
  const steps: [string, number][] = [
    ['Home page visits', m.landing],
    ['Uploads', m.started],
    ['Reveals', m.revealed],
    ['Saved to an account', m.saved],
  ];
  return (
    <div className="border-line mt-5 border-t pt-4" data-testid="makeover-funnel">
      <h3 className="font-semibold">{t('Instant Makeover')}</h3>
      <ol className="mt-2 grid gap-3 sm:grid-cols-4">
        {steps.map(([label, v], i) => (
          <li key={label}>
            <span className="text-ink-muted block text-sm">{label}</span>
            <span className="text-lg font-semibold tabular-nums">{v}</span>
            {i > 0 && (
              <span className="text-ink-muted ml-2 text-sm">{pct(v, steps[i - 1]![1])}</span>
            )}
          </li>
        ))}
      </ol>
      <p className="text-ink-muted mt-2 text-sm" data-testid="score-shares">
        {t('{n} CV scores shared', { n: m.scoreShares ?? 0 })}
      </p>
      <p className="text-ink-muted mt-2 text-sm">
        {t(
          '{failed} failed · {previews} previews · {scansRead} scans or photos read ·{v} {designSwitches} design switches · {polish} polish checks',
          {
            failed: m.failed,
            previews: m.previews,
            scansRead: m.scansRead,
            v: ' ',
            designSwitches: m.designSwitches,
            polish: m.polish,
          },
        )}
      </p>
    </div>
  );
}

function Numbers({ n }: { n: Overview['numbers'] }) {
  const t = useT();
  const budgetUse = n.aiDailyBudget ? n.aiCallsToday / n.aiDailyBudget : 0;
  const rows: [string, string, string?][] = [
    ['New accounts', String(n.newAccounts)],
    [
      'Visitors asked to sign in at download',
      String(n.visitorsAtDownload),
      n.visitorsAtDownload
        ? `${pct(n.newAccounts, n.visitorsAtDownload + n.newAccounts)} became accounts (approx.)`
        : undefined,
    ],
    [
      'PDF downloads',
      String(n.pdfs),
      n.hitDownloadLimit ? `${n.hitDownloadLimit} stopped by the monthly limit` : undefined,
    ],
    [
      'CV imports',
      String(n.imports),
      `${pct(n.imports, n.imports + n.importFailures)} succeeded · ${pct(n.importsWithAi, n.imports)} sorted by AI`,
    ],
    ['AI actions', String(n.aiActions), n.aiFailures ? `${n.aiFailures} failed` : undefined],
    ['Word downloads', String(n.words ?? 0)],
    [
      'Shared CVs and portfolios opened',
      String((n.shareViews ?? 0) + (n.portfolioViews ?? 0)),
      `${n.shareViews ?? 0} share links · ${n.portfolioViews ?? 0} portfolio pages`,
    ],
    [
      'Invites',
      `${n.invitesJoined ?? 0} joined`,
      `${n.inviteRewards ?? 0} rewards given · ${n.couponsUsed ?? 0} discount codes used`,
    ],
    [
      'Premium',
      `${n.premiumApproved} approved`,
      `${n.premiumRequests} requests · ${n.premiumRejected} rejected${n.avgApprovalMinutes !== null ? ` · approved in ${fmtMinutes(n.avgApprovalMinutes)} on average` : ''}`,
    ],
  ];
  return (
    <section className="border-line bg-surface rounded-lg border p-5" data-testid="admin-numbers">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('Last 30 days')}</h2>
        <span className="text-ink-muted text-sm">
          {t('Counts only — no CV content is recorded.')}
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value, note]) => (
          <div key={label}>
            <dt className="text-ink-muted text-sm">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {value}
              {note && <span className="text-ink-muted ml-2 text-sm font-normal">{note}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {n.makeover && <Funnel m={n.makeover} />}
      <div className="mt-5">
        <p className="text-sm">
          {t('AI calls today:')} <strong className="tabular-nums">{n.aiCallsToday}</strong>{' '}
          {t('of{v} {v2} daily budget', { v: ' ', v2: n.aiDailyBudget.toLocaleString() })}
        </p>
        <div
          className="bg-sunken mt-1.5 h-2 overflow-hidden rounded-full"
          role="meter"
          aria-label={t('AI daily budget used')}
          aria-valuemin={0}
          aria-valuemax={n.aiDailyBudget}
          aria-valuenow={n.aiCallsToday}
        >
          <div
            className={budgetUse >= 0.8 ? 'bg-danger h-full' : 'bg-primary h-full'}
            style={{ width: `${Math.min(100, budgetUse * 100)}%` }}
          />
        </div>
        {budgetUse >= 0.8 && (
          <p className="text-danger mt-1 text-sm font-semibold">
            {t('Over 80% of today’s AI budget is used.')}
          </p>
        )}
        {n.aiCost && (
          <p className="mt-3 text-sm" data-testid="ai-cost">
            {t('AI cost (estimate):')}{' '}
            <strong className="tabular-nums">
              {t('Rs {v}', { v: n.aiCost.month.pkr.toLocaleString() })}
            </strong>{' '}
            {t('in 30 days (${v}, {v2} tokens) · today Rs {v3}', {
              v: n.aiCost.month.usd.toFixed(2),
              v2: n.aiCost.month.tokens.toLocaleString(),
              v3: n.aiCost.today.pkr.toLocaleString(),
            })}
          </p>
        )}
      </div>
    </section>
  );
}

function fmtMinutes(m: number) {
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} days`;
}

function show(n: Num, v: number | null) {
  if (v === null) return '—';
  if (n.unit === 'percent') return `${Math.round(v * 1000) / 10}%`;
  if (n.unit === 'seconds')
    return n.key === 'timeToReveal' && v > 60 ? 'over 60 s' : `under ${v} s`;
  return (Math.round(v * 10) / 10).toString();
}
function showTarget(n: Num) {
  if (n.unit === 'percent') return `${Math.round(n.target * 100)}%`;
  if (n.unit === 'seconds') return `under ${n.target} s`;
  return `${n.target} or more`;
}

const TONE = {
  ok: { label: 'On target', cls: 'bg-[#e3f1e6] text-[#1f5c2e]' },
  below: { label: 'Below target', cls: 'bg-[#fbe9e7] text-[#8a2a1b]' },
  few: { label: 'Not enough data yet', cls: 'bg-sunken text-ink-muted' },
} as const;

/** The nine product numbers with their targets (spec §17.2). */
function ProductNumbers({ list }: { list: Num[] }) {
  const t = useT();
  return (
    <section className="border-line bg-surface rounded-lg border p-5" data-testid="product-numbers">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('Product numbers')}</h2>
        <span className="text-ink-muted text-sm">
          {t('Targets from the plan. Shown once at least {MIN_BASE} accounts or makeovers count.', {
            MIN_BASE: MIN_BASE,
          })}
        </span>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
        {list.map((n) => {
          const st = numberStatus(n);
          return (
            <li
              key={n.key}
              className="border-line rounded-md border p-3"
              data-testid={`number-${n.key}`}
              data-status={st}
            >
              <h3 className="text-sm font-semibold">{t(n.label)}</h3>
              <span
                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[st].cls}`}
              >
                {TONE[st].label}
              </span>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{show(n, n.value)}</p>
              <p className="text-ink-muted text-sm">
                {t('Target {showTarget} · based on {v}', {
                  showTarget: showTarget(n),
                  v: n.base.toLocaleString(),
                })}
              </p>
              <p className="text-ink-muted mt-1 text-xs">{n.definition}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
