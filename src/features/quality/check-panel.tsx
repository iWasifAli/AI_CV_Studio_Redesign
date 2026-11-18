'use client';

import { workspaceFetch as fetch } from '@/features/workspace/request';

import { useWorkspaceState, useWorkspaceTask } from '@/features/workspace/context';

import { useT } from '@/i18n/client';
import Link from '@/features/workspace/navigation';
import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, Info, Lock, ScanSearch } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { useAccount } from '@/features/account/account-context';
import { remaining, useEntitlements } from '@/features/account/entitlements';
import { jobsApi } from '@/features/jobs/api';
import type { Job } from '@/modules/jobs/schema';
import type { AtsCheck, AtsReport } from '@/modules/quality/ats';
import { ops } from '@/modules/resume/ops';
import type { ResumeDocument } from '@/modules/resume/schema';
import { CommentsPanel } from '@/features/share/comments-panel';
import { HealthPanel } from './health-panel';
import { ProofreadPanel } from './proofread-panel';
import { QuantifyPanel } from './quantify-panel';
import { GapPanel } from './gap-panel';

const ICON = { pass: CircleCheck, 'needs-work': CircleAlert, info: Info } as const;
const TONE = { pass: 'text-success', 'needs-work': 'text-danger', info: 'text-primary' } as const;
const LABEL = { pass: 'Pass', 'needs-work': 'Needs work', info: 'Good to know' } as const;

/**
 * The editor's Check tab (spec §11.3): the CV health check and the ATS check together. Every
 * finding has a "Show me" that opens the field, or the Design tab for layout fixes.
 */
export function CheckPanel({
  doc,
  pages,
  onShow,
  onDesign,
  apply,
}: {
  doc: ResumeDocument;
  pages?: number;
  onShow: (ref: string) => void;
  onDesign: () => void;
  /** Change the CV as one undo step (proofreading fixes). */
  apply?: (fn: (d: ResumeDocument) => ResumeDocument) => void;
}) {
  return (
    <div className="flex flex-col gap-5 pb-6">
      <CommentsPanel docId={doc.id} onShow={onShow} />
      <HealthPanel doc={doc} pages={pages} onShow={onShow} />
      {apply && <ProofreadPanel doc={doc} onShow={onShow} apply={apply} />}
      {apply && <QuantifyPanel doc={doc} onShow={onShow} apply={apply} />}
      {apply && <GapPanel doc={doc} apply={apply} />}
      <AtsPanel doc={doc} onShow={onShow} onDesign={onDesign} apply={apply} />
    </div>
  );
}

function AtsPanel({
  doc,
  onShow,
  onDesign,
  apply,
}: {
  doc: ResumeDocument;
  onShow: (ref: string) => void;
  onDesign: () => void;
  apply?: (fn: (d: ResumeDocument) => ResumeDocument) => void;
}) {
  const tx = useT();
  const [picked, setPicked] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const account = useAccount();
  const { ent, refresh } = useEntitlements();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobId, setJobId] = useWorkspaceState('quality.checkpanel.jobId', doc.jobId ?? '');
  const runTask = useWorkspaceTask();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useWorkspaceState<AtsReport | null>(
    'quality.checkpanel.report',
    null,
  );
  const [problem, setProblem] = useWorkspaceState<{ message: string; premium?: boolean } | null>(
    'quality.checkpanel.problem',
    null,
  );
  const signedIn = account.status === 'signedIn';
  const premium = ent?.plan === 'premium';
  useEffect(() => {
    if (!signedIn) return;
    jobsApi.list().then(
      (r) => setJobs(r.jobs.filter((j) => j.advert.trim().length >= 80)),
      () => setJobs([]),
    );
  }, [signedIn]);
  if (ent && !ent.features.atsCheck) return null;
  const left = ent ? remaining(ent, 'ats.check') : 0;

  const run = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await runTask('quality.checkpanel.run', async (signal) => {
        const r = await fetch('/api/quality/ats', {
          method: 'POST',
          signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ document: doc, jobId: premium ? jobId : '' }),
        });
        const j = (await r.json().catch(() => null)) as {
          report?: AtsReport;
          error?: { message: string };
        } | null;
        signal.throwIfAborted();
        if (!r.ok || !j?.report) {
          setProblem({
            message: j?.error?.message ?? 'We couldn’t check this CV just now.',
            premium: r.status === 402,
          });
          return;
        }
        setReport(j.report);
        refresh();
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setProblem({ message: 'You seem to be offline. Please try again.' });
    } finally {
      setBusy(false);
    }
  };
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
                onChange={(e) => setJobId(e.target.value)}
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
          <p className="font-semibold">
            {toFix
              ? tx('{toFix} thing{v1} to fix for screening software', {
                  toFix: toFix,
                  v1: toFix === 1 ? '' : 's',
                })
              : tx('Screening software reads this CV well.')}
          </p>
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
            <div
              className="border-line flex flex-col gap-3 border-t pt-4"
              data-testid="ats-keywords"
            >
              <h3 className="font-semibold">
                {tx('Keywords for {jobTitle}', { jobTitle: report.keywords.jobTitle })}
              </h3>
              {report.keywords.present.length > 0 && (
                <div>
                  <p className="text-ink-muted mb-1.5 text-sm">
                    {tx('In your CV ({length})', { length: report.keywords.present.length })}
                  </p>
                  <ul className="flex flex-wrap gap-1.5" aria-label={tx('Keywords in your CV')}>
                    {report.keywords.present.map((t) => (
                      <li
                        key={t}
                        className="bg-success-soft text-success rounded-full px-2.5 py-1 text-sm font-semibold"
                      >
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {report.keywords.missing.length > 0 && (
                <div>
                  <p className="text-ink-muted mb-1.5 text-sm">
                    {tx('Not in your CV ({length}). Add a word only where it’s true for you.', {
                      length: report.keywords.missing.length,
                    })}
                  </p>
                  <ul className="flex flex-col gap-2" aria-label={tx('Keywords not in your CV')}>
                    {report.keywords.missing.map((m) => (
                      <li key={m.term} className="text-sm">
                        {apply && !added.includes(m.term) ? (
                          <label className="inline-flex min-h-8 cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={picked.includes(m.term)}
                              onChange={(e) =>
                                setPicked((p) =>
                                  e.target.checked ? [...p, m.term] : p.filter((x) => x !== m.term),
                                )
                              }
                              data-testid="keyword-pick"
                            />
                            <span className="bg-sunken rounded-full px-2.5 py-1 font-semibold">
                              {m.term}
                            </span>
                          </label>
                        ) : (
                          <span className="bg-sunken rounded-full px-2.5 py-1 font-semibold">
                            {added.includes(m.term) ? '✓ ' : ''}
                            {m.term}
                          </span>
                        )}
                        {m.line && (
                          <span className="text-ink-muted mt-1 block">
                            {tx('You may already show this: “{text}”{v}', {
                              text: m.line.text,
                              v: ' ',
                            })}
                            <button
                              type="button"
                              onClick={() => onShow(m.line!.ref)}
                              className="text-primary font-semibold underline underline-offset-4"
                            >
                              {tx('Show me')}
                            </button>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {apply && (
                    <div className="mt-3 flex flex-col gap-1.5">
                      <Button
                        variant="secondary"
                        disabled={picked.length === 0}
                        onClick={() => {
                          apply((d) => ops.addKeywords(d, picked));
                          setAdded((a) => [...a, ...picked]);
                          setPicked([]);
                        }}
                        data-testid="keyword-add"
                      >
                        {tx('Add ticked words to my skills')}
                      </Button>
                      <p className="text-ink-muted text-xs">
                        {tx(
                          'Tick only the words that are true for you. They go in your Skills section. Run the check again to see your match.',
                        )}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <details className="text-sm">
            <summary className="text-primary cursor-pointer font-semibold">
              {tx('What the software reads first')}
            </summary>
            <pre className="bg-sunken mt-2 overflow-x-auto rounded-md p-3 text-xs whitespace-pre-wrap">
              {report.sample.join('\n')}
            </pre>
          </details>
        </div>
      )}
    </section>
  );
}
