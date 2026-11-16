import { NextResponse } from 'next/server';
import { apiError, createRateLimiter, readJson, requestId } from '@/lib/http';
import { aiModels, getAiProvider } from '@/modules/ai/config';
import { sharedAiLimiter } from '@/modules/ai/limits';
import { runTask } from '@/modules/ai/run';
import { getBusinessConfig } from '@/modules/billing/server';
import { currentUser } from '@/modules/identity/session';
import { fetchJobPage } from '@/modules/jobs/fetch';
import { fromExtract, fromPlainPage, fromPosting, type JobFromUrl } from '@/modules/jobs/from-url';
import { PageError, readPage, type PageInfo } from '@/modules/jobs/page';
import { PASTE_HINT, routeJobLink } from '@/modules/jobs/sites';
import { jobAllowance } from '@/modules/jobs/server';
import { aiBudgetSpent, track } from '@/modules/metrics/server';
import { getUserStore } from '@/modules/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const noStore = { headers: { 'Cache-Control': 'no-store' } };
const g = globalThis as { __jobUrlLimiter?: ReturnType<typeof createRateLimiter> };
const limiter = (g.__jobUrlLimiter ??= createRateLimiter({ capacity: 20, refillPerMinute: 2 }));

/**
 * POST { url } → { job }: the job read from its advert page, for the person to check and save.
 * Signed in and within the plan's job limit (spec §14: not an AI action). The page is fetched
 * safely (modules/jobs/fetch.ts); its JSON-LD JobPosting is used when there is one, otherwise
 * the fast AI reads the page text as data, and every value is checked against the page.
 */
export async function POST(req: Request) {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return apiError('SIGN_IN_REQUIRED', 'Please sign in to save jobs.', rid);
  const { value: cfg } = await getBusinessConfig();
  if (!cfg.features.jobFromUrl)
    return apiError('DISABLED', 'Reading jobs from links is switched off right now.', rid, {
      reason: 'disabled',
    });
  const body = await readJson(req, 4 * 1024);
  if (!body.ok) return apiError(body.code, 'Invalid request.', rid);
  const b = (body.value ?? {}) as { url?: unknown; text?: unknown };
  const pasted = typeof b.text === 'string' ? b.text.trim().slice(0, 14_000) : '';
  const given = String(b.url ?? '')
    .trim()
    .slice(0, 500);
  if (!given && !pasted) return apiError('INVALID_INPUT', 'Paste the link to the job advert.', rid);
  if (!given && pasted.length < 80)
    return apiError('INVALID_INPUT', 'Paste the whole advert text (at least a few lines).', rid);
  // Job sites: a search page with one job open becomes that job's page; lists and sites that
  // don't allow reading get a plain message pointing to pasting the advert text.
  const route = pasted ? null : routeJobLink(given);
  if (route?.kind === 'refuse') {
    await track('job_url_fail');
    return apiError('UNPROCESSABLE', route.message, rid, { reason: route.reason });
  }
  const url = route?.url ?? given;

  const [{ max }, existing] = await Promise.all([
    jobAllowance(user),
    getUserStore().listJobs(user.uid),
  ]);
  if (max !== -1 && existing.length >= max)
    return apiError(
      max === 0 ? 'PREMIUM_REQUIRED' : 'LIMIT_REACHED',
      max === 0
        ? 'The job tracker isn’t included in your plan.'
        : `Your plan tracks up to ${max} jobs. Remove one you no longer need, or get Premium for more.`,
      rid,
      { reason: max === 0 ? 'premium' : 'limit', limit: max },
    );
  if (!limiter(user.uid).ok)
    return apiError('RATE_LIMITED', 'Too many links at once. Please wait a minute.', rid);

  // Advert text pasted by the person: read it like a page, nothing is fetched.
  if (pasted) {
    const info = { title: '', siteName: '', text: pasted, posting: null };
    const job = await readWithAi(info, given, user.uid, cfg);
    if (job === 'not_a_job')
      return apiError(
        'UNPROCESSABLE',
        'That text doesn’t look like a job advert. Paste the advert itself.',
        rid,
        { reason: 'not_a_job' },
      );
    await track('job_text');
    return NextResponse.json({ job: job ?? fromPlainPage(given, info) }, noStore);
  }

  let page;
  try {
    page = await fetchJobPage(url);
  } catch (e) {
    await track('job_url_fail');
    const msg = e instanceof PageError ? e.message : `The page couldn’t be read. ${PASTE_HINT}`;
    return apiError(
      e instanceof PageError && e.code === 'BAD_URL' ? 'INVALID_INPUT' : 'UNPROCESSABLE',
      msg,
      rid,
      {
        reason: e instanceof PageError ? e.code.toLowerCase() : 'network',
      },
    );
  }
  const info = readPage(page.html);
  if (info.text.length < 40 && !info.posting) {
    await track('job_url_fail');
    return apiError(
      'UNPROCESSABLE',
      `That page has no advert text we can read (it may need JavaScript or a sign-in). ${PASTE_HINT}`,
      rid,
      { reason: 'empty' },
    );
  }

  let job: JobFromUrl | null = fromPosting(page.url, info);
  if (!job) {
    const r = await readWithAi(info, page.url, user.uid, cfg);
    if (r === 'not_a_job') {
      await track('job_url_fail');
      return apiError(
        'UNPROCESSABLE',
        `That page doesn’t look like one job advert. ${PASTE_HINT}`,
        rid,
        { reason: 'not_a_job' },
      );
    }
    job = r ?? fromPlainPage(page.url, info);
  }
  await track(
    job.via === 'structured'
      ? 'job_url_structured'
      : job.via === 'ai'
        ? 'job_url_ai'
        : 'job_url_page',
  );
  return NextResponse.json({ job }, noStore);
}

/** The fast AI reads the text as data; every value is checked against it (null: no AI today). */
async function readWithAi(
  info: PageInfo,
  url: string,
  uid: string,
  cfg: Awaited<ReturnType<typeof getBusinessConfig>>['value'],
): Promise<JobFromUrl | 'not_a_job' | null> {
  const { provider } = getAiProvider();
  const aiOk =
    provider &&
    cfg.features.ai &&
    sharedAiLimiter()(`joburl:${uid}`).ok &&
    !(await aiBudgetSpent());
  if (!aiOk) return null;
  const r = await runTask(
    'jobs.extract',
    {
      url: url || 'https://pasted.text',
      pageTitle: info.title,
      siteName: info.siteName,
      text: info.text.slice(0, 14_000),
    },
    0,
    { provider, models: aiModels(), timeoutMs: 20_000 },
  );
  await track(r.ok ? 'ai_ok' : 'ai_fail');
  if (!r.ok) return null;
  return fromExtract(url, info, r.result) ?? 'not_a_job';
}
