'use client';
import Link from 'next/link';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { CircleAlert, CircleCheck, Info, Lock, ScanSearch } from 'lucide-react';
import { useT } from '@/i18n/client';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { useAccount } from '@/features/account/account-context';
import { remaining, useEntitlements } from '@/features/account/entitlements';
import { useRequestScope } from '@/features/account/use-request-scope';
import type { DocumentEditor } from '@/features/editor/use-document-editor';
import { jobsApi } from '@/features/jobs/api';
import { advertFingerprint } from '@/modules/jobs/advert';
import type { Job } from '@/modules/jobs/schema';
import type { AtsCheck, AtsReport } from '@/modules/quality/ats';
import type { ResumeDocument } from '@/modules/resume/schema';
import { atsReport, contentIdentity, pdfIdentity, type AtsWorkspace } from './ats-workspace';
import { KeywordPanel } from './keyword-panel';

const ICON = { pass: CircleCheck, 'needs-work': CircleAlert, info: Info } as const;
const TONE = { pass: 'text-success', 'needs-work': 'text-danger', info: 'text-primary' } as const;
const LABEL = { pass: 'Pass', 'needs-work': 'Needs work', info: 'Good to know' } as const;
export type KeywordEntry = { jobId: string; fromMatch: boolean };

export function AtsPanel({
  doc,
  editor,
  onShow,
  onDesign,
  state,
  setState,
  entry,
}: {
  doc: ResumeDocument;
  editor?: DocumentEditor;
  onShow: (ref: string) => void;
  onDesign: () => void;
  state: AtsWorkspace;
  setState: Dispatch<SetStateAction<AtsWorkspace>>;
  entry: KeywordEntry;
}) {
  const tx = useT();
  const account = useAccount();
  const { ent, refresh } = useEntitlements();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; premium?: boolean } | null>(null);
  const { jobId, report } = state;
  const identity = `${account.user?.uid ?? 'visitor'}:${doc.id}:${jobId}`;
  const { begin, cancel } = useRequestScope(identity);
  const { begin: beginLoading, cancel: cancelLoading } = useRequestScope(
    `${account.user?.uid ?? 'visitor'}:${doc.id}`,
  );
  const signedIn = account.status === 'signedIn';
  const premium = ent?.plan === 'premium';
  const documentId = doc.id;
  useEffect(() => {
    if (!signedIn) return;
    const request = beginLoading();
    setState((s) => ({ ...s, verified: false }));
    jobsApi
      .list()
      .then(async (r) => {
        const fingerprints = new Map(
          await Promise.all(
            r.jobs.map(async (j) => [j.id, await advertFingerprint(j.advert)] as const),
          ),
        );
        if (!request.valid()) return;
        setJobs(r.jobs.filter((j) => j.advert.trim().length >= 80));
        setState((s) => {
          const kw = s.report?.keywords;
          const verified = !!kw?.jobId && kw.advertFingerprint === fingerprints.get(kw.jobId);
          if (!s.entryConsumed && entry.jobId) {
            if (verified && kw?.jobId === entry.jobId)
              return { ...s, entryConsumed: true, verified };

            const job = r.jobs.find((j) => j.id === entry.jobId);
            const match = job?.match;
            if (
              entry.fromMatch &&
              job &&
              match?.sourceDocumentId === documentId &&
              match.advertFingerprint === fingerprints.get(job.id)
            ) {
              const keywords = {
                jobTitle: job.title,
                jobId: job.id,
                advertFingerprint: match.advertFingerprint,
                present: [],
                missing: match.keywords.map((k) => ({ term: k.term })),
              };
              return {
                ...s,
                entryConsumed: true,
                jobId: job.id,
                report: { at: match.at, checks: [], sample: [], keywords },
                pdf: '',
                content: s.content,
                picked: [],
                result: null,
                verified: true,
              };
            }
            if (entry.fromMatch)
              setProblem({
                message: 'This match report is outdated. Run the ATS check for current keywords.',
              });
            return { ...s, entryConsumed: true, jobId: job?.id ?? s.jobId, verified };
          }
          return { ...s, verified };
        });
      })
      .catch(() => {
        if (request.valid()) setProblem({ message: 'You seem to be offline. Please try again.' });
      });
    return cancelLoading;
  }, [signedIn, account.user?.uid, documentId, beginLoading, cancelLoading, entry, setState]);
  const left = ent ? remaining(ent, 'ats.check') : 0;
  const run = async () => {
    const request = begin();
    const before = contentIdentity(doc);
    const pdf = pdfIdentity(doc);
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch('/api/quality/ats', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: request.signal,
        body: JSON.stringify({ document: doc, jobId: premium ? jobId : '' }),
      });
      const json = (await response.json().catch(() => null)) as {
        report?: AtsReport;
        error?: { message: string };
      } | null;
      if (!request.valid()) return;
      const parsed = atsReport.safeParse(json?.report);
      if (!response.ok || !parsed.success) {
        setProblem({
          message: json?.error?.message ?? 'We couldn’t check this CV just now.',
          premium: response.status === 402,
        });
        return;
      }
      // A late check describes its captured PDF; coverage is always recomputed from the live CV.
      setState((s) => ({
        ...s,
        report: parsed.data,
        content: before,
        pdf,
        picked: [],
        result: null,
        verified: !!parsed.data.keywords?.advertFingerprint,
      }));
      refresh();
    } catch {
      if (request.valid()) setProblem({ message: 'You seem to be offline. Please try again.' });
    } finally {
      if (request.valid()) setBusy(false);
    }
  };
  if (ent && !ent.features.atsCheck) return null;
  const go = (c: AtsCheck) => (c.where === 'design' ? onDesign() : c.where && onShow(c.where));
  const toFix = report?.checks.filter((c) => c.status === 'needs-work').length ?? 0;
  return (
    <section
      aria-labelledby="ats-h"
      className="border-line bg-surface shadow-1 flex flex-col gap-4 rounded-lg border p-5"
      data-testid="ats"
    >
      <div>
        <h2 id="ats-h" className="flex items-center gap-2 font-semibold">
          <ScanSearch aria-hidden size={18} className="text-primary" /> {tx('ATS check')}
        </h2>
        <p className="text-ink-muted text-sm">
          {tx(
            'Many employers screen CVs with software first. We make your PDF, read it back the way that software does, and tell you what it sees.',
          )}
        </p>
      </div>

      {!signedIn ? (
        <p className="text-ink-muted text-sm">
          <Link
            href={`/signin?next=/cv/${doc.id}?tab=check`}
            className="text-primary font-semibold"
          >
            {tx('Sign in')}
          </Link>{' '}
          {tx('to run the ATS check.')}
        </p>
      ) : (
        <>
          {jobs.length > 0 && (
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              <span className="flex items-center gap-1.5">
                {tx('Check keywords for a job')} {!premium && <Lock aria-hidden size={14} />}
              </span>
              <select
                className="border-line-strong bg-surface min-h-11 rounded-md border px-3 text-[15px] font-normal disabled:opacity-60"
                value={premium ? jobId : ''}
                disabled={!premium}
                onChange={(e) => {
                  cancel();
                  setBusy(false);
                  setState((s) => ({
                    ...s,
                    jobId: e.target.value,
                    report: null,
                    picked: [],
                    result: null,
                    verified: false,
                  }));
                }}
              >
                <option value="">{tx('No job — readability only')}</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                    {j.company ? ` — ${j.company}` : ''}
                  </option>
                ))}
              </select>
              {!premium && (
                <span className="text-ink-muted font-normal">
                  {tx('Job keywords are part of')}{' '}
                  <Link href="/premium" className="text-primary font-semibold">
                    {tx('Premium')}
                  </Link>
                  .
                </span>
              )}
            </label>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={report ? 'secondary' : 'primary'}
              icon={<ScanSearch aria-hidden size={18} />}
              loading={busy}
              disabled={busy || (ent !== null && left === 0)}
              onClick={run}
            >
              {report ? tx('Check again') : tx('Run the ATS check')}
            </Button>
            {ent && Number.isFinite(left) && (
              <span className="text-ink-muted text-sm" data-testid="ats-left">
                {tx('{left} of {v} left this month', { left: left, v: ent.limits['ats.check'] })}
              </span>
            )}
          </div>
        </>
      )}

      {problem && (
        <Banner
          tone="error"
          title={problem.message}
          action={
            problem.premium ? (
              <ButtonLink href="/premium" size="sm">
                {tx('See Premium')}
              </ButtonLink>
            ) : undefined
          }
        />
      )}

      {report && (
        <div className="flex flex-col gap-4" aria-live="polite" data-testid="ats-report">
          {state.pdf && state.pdf !== pdfIdentity(doc) && (
            <p className="bg-warning-soft rounded-md p-3 text-sm" role="status">
              {tx('Your CV changed. Run the ATS check again to refresh the PDF findings.')}
            </p>
          )}
          {report.checks.length > 0 && (
            <p className="font-semibold">
              {toFix
                ? tx('{toFix} thing{v1} to fix for screening software', {
                    toFix: toFix,
                    v1: toFix === 1 ? '' : 's',
                  })
                : tx('Screening software reads this CV well.')}
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {report.checks.map((c) => {
              const Icon = ICON[c.status];
              return (
                <li
                  key={c.id}
                  className="flex items-start gap-2.5"
                  data-check={c.id}
                  data-status={c.status}
                >
                  <Icon aria-hidden size={20} className={`${TONE[c.status]} mt-0.5 shrink-0`} />
                  <div className="min-w-0">
                    <p className="font-semibold">
                      <span className="sr-only">{LABEL[c.status]}: </span>
                      {c.title}
                    </p>
                    <p className="text-ink-muted text-sm">{c.detail}</p>
                    {c.examples && c.examples.length > 0 && (
                      <ul className="text-ink-muted mt-1 text-sm">
                        {c.examples.map((e) => (
                          <li key={e} className="truncate">
                            “{e}”
                          </li>
                        ))}
                      </ul>
                    )}
                    {c.fix && <p className="mt-1 text-sm">{c.fix}</p>}
                    {c.where && c.status !== 'pass' && (
                      <button
                        type="button"
                        onClick={() => go(c)}
                        className="text-primary mt-1 text-sm font-semibold underline underline-offset-4"
                      >
                        {c.where === 'design' ? tx('Open the Design tab') : tx('Show me')}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {report.keywords && (
            <KeywordPanel
              doc={doc}
              editor={editor}
              state={state}
              setState={setState}
              onShow={onShow}
              busyCheck={busy}
            />
          )}

          {report.sample.length > 0 && (
            <details className="text-sm">
              <summary className="text-primary cursor-pointer font-semibold">
                {tx('What the software reads first')}
              </summary>
              <pre className="bg-sunken mt-2 overflow-x-auto rounded-md p-3 text-xs whitespace-pre-wrap">
                {report.sample.join('\n')}
              </pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
