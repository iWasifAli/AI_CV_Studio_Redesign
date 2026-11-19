import { z } from 'zod';
import { apiError, readJson, requestId } from '@/lib/http';
import { getLang } from '@/i18n/server';
import { aiModels, getAiProvider } from '@/modules/ai/config';
import { textLanguage } from '@/modules/ai/language';
import { sharedAiLimiter } from '@/modules/ai/limits';
import { runTask } from '@/modules/ai/run';
import { denialCode, getBusinessConfig, planFor, reserve } from '@/modules/billing/server';
import { currentUser } from '@/modules/identity/session';
import { advertFingerprint } from '@/modules/jobs/advert';
import { digestPlain, profileDigest } from '@/modules/jobs/digest';
import { cvHasTerm } from '@/modules/jobs/match';
import { aiBudgetSpent, track } from '@/modules/metrics/server';
import {
  canPlaceKeyword,
  checkKeywordRewrite,
  keywordFields,
  keywordSelection,
} from '@/modules/quality/keyword-rewrite';
import { safeParseResumeDocument } from '@/modules/resume/schema';
import { getUserStore } from '@/modules/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;
const input = z.object({
  jobId: z.string().regex(/^[\w-]{1,64}$/),
  advertFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  keywords: keywordSelection,
});
const json = (value: unknown) => Response.json(value, { headers: { 'Cache-Control': 'no-store' } });

/** One AI action for a useful batch; the editor alone owns persistence and Undo. */
export async function POST(req: Request) {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return apiError('SIGN_IN_REQUIRED', 'Please sign in.', rid);
  const [{ plan }, { value: cfg }] = await Promise.all([planFor(user), getBusinessConfig()]);
  if (plan !== 'premium')
    return apiError('PREMIUM_REQUIRED', 'Keyword rewriting is part of Premium.', rid);
  if (!cfg.features.ai || !cfg.features.atsCheck)
    return apiError('DISABLED', 'Keyword rewriting is switched off right now.', rid);
  const raw = await readJson(req, 512 * 1024);
  if (!raw.ok) return apiError(raw.code, 'Invalid request.', rid);
  const body = (raw.value ?? {}) as Record<string, unknown>;
  const parsed = input.safeParse(body);
  const document = safeParseResumeDocument(body.document);
  if (!parsed.success || !document.success)
    return apiError('INVALID_INPUT', 'Choose a CV, job and up to 25 keywords.', rid);
  const { jobId, keywords, advertFingerprint: expected } = parsed.data;
  const job = await getUserStore().getJob(user.uid, jobId);
  if (!job) return apiError('NOT_FOUND', 'Job not found.', rid);
  if (job.advert.trim().length < 80)
    return apiError('INVALID_INPUT', 'Paste the job advert first.', rid);
  if ((await advertFingerprint(job.advert)) !== expected)
    return apiError('CONFLICT', 'The job advert changed. Check keywords again.', rid);
  if (keywords.some((t) => !cvHasTerm(job.advert, t)))
    return apiError('INVALID_INPUT', 'Choose keywords from the current job advert.', rid);
  const doc = document.data;
  const plain = digestPlain(profileDigest(doc));
  const missing = keywords.filter((t) => !cvHasTerm(plain, t));
  if (!missing.length)
    return json({
      patches: [],
      included: [],
      skipped: keywords.map((term) => ({ term, reason: 'Already in your CV.' })),
    });
  const { provider } = getAiProvider();
  if (!provider) return apiError('AI_UNAVAILABLE', 'AI help is switched off right now.', rid);
  if (!sharedAiLimiter()(`keyword-rewrite:${user.uid}`).ok || (await aiBudgetSpent()))
    return apiError('RATE_LIMITED', 'Too many AI requests. Please wait a little.', rid);
  const gate = await reserve(user, 'ai.action');
  if (!gate.decision.ok) return apiError(denialCode(gate.decision), gate.decision.message, rid);
  let usable = false;
  try {
    const uiLanguage = await getLang();
    let fieldBytes = 0;
    const fields = keywordFields(doc)
      .filter((field) => {
        fieldBytes += field.before.length + field.target.length;
        return fieldBytes <= 24_000;
      })
      .slice(0, 300);
    const r = await runTask(
      'quality.rewriteKeywords',
      {
        advert: job.advert.slice(0, 12_000),
        keywords: missing,
        fields: fields.map(({ target, before, max, protected: locked }) => ({
          target,
          before,
          max,
          protected: locked,
          eligibleKeywords: missing.filter((term) => canPlaceKeyword({ target, before }, term)),
        })),
        contentLanguage: textLanguage(plain) ?? (doc.locale.startsWith('de') ? 'de' : 'en'),
        adviceLanguage: uiLanguage,
      },
      0,
      { provider, models: aiModels(), timeoutMs: 20_000 },
    );
    if (!r.ok) {
      await track('ai_fail');
      return apiError(
        'AI_UNAVAILABLE',
        'We couldn’t rewrite this CV just now. Please try again.',
        rid,
      );
    }
    const latest = await getUserStore().getJob(user.uid, jobId);
    if (!latest || latest.advert !== job.advert)
      return apiError('CONFLICT', 'The job advert changed. Check keywords again.', rid);
    const result = checkKeywordRewrite(doc, missing, r.result);
    usable = result.patches.length > 0 && result.included.length > 0;
    await track(usable ? 'ai_ok' : 'ai_fail');
    return json(result);
  } catch {
    await track('ai_fail');
    return apiError(
      'AI_UNAVAILABLE',
      'We couldn’t rewrite this CV just now. Please try again.',
      rid,
    );
  } finally {
    if (!usable) await gate.release();
  }
}
