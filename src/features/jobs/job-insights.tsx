'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, Lock } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { useAccount } from '@/features/account/account-context';
import { FEW, pct, type Group, type Insights } from '@/modules/jobs/insights';
import { JOB_OUTCOMES, OUTCOME_LABEL, type JobOutcome } from '@/modules/jobs/schema';
import { JobsError, jobsApi } from './api';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const weekLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** R9.10 application analytics: what happened to the applications the person sent. */
export function JobInsights() {
  const account = useAccount();
  const toast = useToast();
  const [data, setData] = useState<{ insights: Insights; total: number } | null>(null);
  const [error, setError] = useState<{ message: string; off: boolean } | null>(null);

  const load = useCallback(() => {
    jobsApi
      .insights()
      .then(setData, (e: Error) =>
        setError({ message: e.message, off: e instanceof JobsError && e.reason === 'disabled' }),
      );
  }, []);
  useEffect(() => {
    if (account.status === 'signedIn') load();
  }, [account.status, load]);

  const setOutcome = async (id: string, outcome: JobOutcome) => {
    try {
      await jobsApi.update(id, { outcome });
      toast.show({ tone: 'success', message: 'Saved' });
      load();
    } catch (e) {
      setError({ message: (e as Error).message, off: false });
    }
  };

  if (account.status === 'loading')
    return <div className="skeleton h-72 rounded-lg" aria-busy="true" aria-label="Loading" />;
  if (account.status === 'signedOut')
    return (
      <Card className="flex flex-col items-start gap-3 p-6">
        <Lock aria-hidden className="text-primary" />
        <h2 className="text-xl font-semibold">Sign in to see your results</h2>
        <p className="text-ink-muted">
          Track your applications, and see which CVs and designs get replies and interviews.
        </p>
        <ButtonLink href="/signin?next=/jobs/insights">Sign in or create a free account</ButtonLink>
      </Card>
    );
  if (error && !data)
    return (
      <Banner tone={error.off ? 'info' : 'error'} title={error.message}>
        {error.off ? 'Your job tracker still works as usual.' : undefined}
      </Banner>
    );
  if (!data)
    return <div className="skeleton h-72 rounded-lg" aria-busy="true" aria-label="Loading" />;

  const s = data.insights;
  if (s.sent === 0)
    return (
      <div className="border-line-strong bg-surface flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center">
        <BarChart3 aria-hidden size={28} className="text-primary" />
        <h2 className="text-xl font-semibold">No applications sent yet</h2>
        <p className="text-ink-muted max-w-md">
          When you send an application, move the job to <strong>Applied</strong> and tick the CV you
          sent. Your replies and interviews will add up here
          {s.saved ? ` — you have ${plural(s.saved, 'saved job')} waiting` : ''}.
        </p>
        <ButtonLink href="/jobs" variant="secondary">
          Go to your jobs
        </ButtonLink>
      </div>
    );

  const replyRate = pct(s.replies, s.sent);
  const interviewRate = pct(s.interviews, s.sent);
  const maxWeek = Math.max(1, ...s.weeks.map((w) => w.count));
  return (
    <div className="flex flex-col gap-6" data-testid="insights">
      {error && (
        <Banner tone="error" title="That didn’t work" onDismiss={() => setError(null)}>
          {error.message}
        </Banner>
      )}
      <section aria-labelledby="totals" className="flex flex-col gap-3">
        <h2 id="totals" className="sr-only">
          Totals
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Applications sent" value={s.sent} testId="stat-sent" />
          <Stat
            label="Replies"
            value={s.replies}
            note={replyRate !== null ? `${replyRate}% of sent` : undefined}
            testId="stat-replies"
          />
          <Stat
            label="Interviews"
            value={s.interviews}
            note={interviewRate !== null ? `${interviewRate}% of sent` : undefined}
            testId="stat-interviews"
          />
          <Stat label="Offers" value={s.offers} testId="stat-offers" />
          <Stat
            label="Still waiting"
            value={s.waiting}
            note={s.noReply ? `${s.noReply} closed with no answer` : undefined}
            testId="stat-waiting"
          />
        </dl>
        <p className="text-ink-muted text-sm" data-testid="reply-time">
          {s.medianDaysToReply !== null
            ? `Replies usually came ${s.medianDaysToReply === 0 ? 'the same day' : `${plural(s.medianDaysToReply, 'day')} after you applied`} (the middle value).`
            : 'Once two employers have answered, you’ll see how long replies usually take.'}
        </p>
      </section>

      {(s.missingOutcome.length > 0 || s.noCv.length > 0) && (
        <Card className="flex flex-col gap-4 p-5" data-testid="insights-gaps">
          <h2 className="text-lg font-semibold">Fill in the gaps for truer numbers</h2>
          {s.missingOutcome.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm">
                How did these end? A “no” from an employer counts as a reply; silence doesn’t.
              </p>
              <ul className="flex flex-col gap-2">
                {s.missingOutcome.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Link href={`/jobs/${j.id}`} className="text-primary font-semibold">
                      {j.title}
                      {j.company ? ` · ${j.company}` : ''}
                    </Link>
                    <select
                      className="border-line-strong bg-surface h-9 rounded-sm border px-1.5"
                      aria-label={`How it ended: ${j.title}`}
                      defaultValue=""
                      onChange={(e) =>
                        e.target.value && void setOutcome(j.id, e.target.value as JobOutcome)
                      }
                    >
                      <option value="" disabled>
                        Choose…
                      </option>
                      {JOB_OUTCOMES.map((o) => (
                        <option key={o} value={o}>
                          {OUTCOME_LABEL[o]}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {s.noCv.length > 0 && (
            <p className="text-sm" data-testid="no-cv">
              {plural(s.noCv.length, 'application')} {s.noCv.length === 1 ? 'has' : 'have'} no CV
              ticked, so {s.noCv.length === 1 ? 'it' : 'they'} can’t be compared:{' '}
              {s.noCv.map((j, i) => (
                <span key={j.id}>
                  {i > 0 && ', '}
                  <Link href={`/jobs/${j.id}`} className="text-primary font-semibold">
                    {j.title}
                  </Link>
                </span>
              ))}
              . Open the job and tick the CV you sent.
            </p>
          )}
        </Card>
      )}

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">From sent to offer</h2>
        <ul className="flex flex-col gap-2" data-testid="funnel">
          {(
            [
              ['Sent', s.sent],
              ['Replies', s.replies],
              ['Interviews', s.interviews],
              ['Offers', s.offers],
            ] as const
          ).map(([label, n]) => (
            <li
              key={label}
              className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] items-center gap-3"
            >
              <span className="text-sm font-semibold">{label}</span>
              <span className="bg-sunken h-3 overflow-hidden rounded-full" aria-hidden>
                <span
                  className="bg-primary block h-full rounded-full"
                  style={{ width: `${Math.max(n ? 2 : 0, (100 * n) / s.sent)}%` }}
                />
              </span>
              <span className="text-right text-sm tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">Applications per week</h2>
        <div
          className="flex h-28 items-end gap-1.5"
          role="img"
          aria-label={`Applications per week for the last 12 weeks: ${s.weeks.map((w) => `${weekLabel(w.start)} ${w.count}`).join(', ')}`}
          data-testid="weeks"
        >
          {s.weeks.map((w) => (
            <div key={w.start} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
              {w.count > 0 && (
                <span className="text-ink-muted text-center text-xs tabular-nums">{w.count}</span>
              )}
              <span
                className={w.count ? 'bg-primary rounded-t-sm' : 'bg-line rounded-t-sm'}
                style={{ height: w.count ? `${(70 * w.count) / maxWeek}%` : '2px' }}
              />
            </div>
          ))}
        </div>
        <div className="text-ink-subtle flex justify-between text-xs" aria-hidden>
          <span>{weekLabel(s.weeks[0]!.start)}</span>
          <span>This week</span>
        </div>
      </Card>

      <GroupTable
        title="By CV"
        hint="Tailored copies made for each job are counted together, so you can see whether tailoring helps."
        rows={s.byCv}
        testId="by-cv"
      />
      <GroupTable
        title="By design"
        hint="The design each CV had when you applied."
        rows={s.byDesign}
        testId="by-design"
      />
      <p className="text-ink-muted text-sm">
        Small numbers can mislead: one or two replies more is often luck. Rates appear once a row
        has {FEW} or more applications. Only you can see these numbers.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  testId,
}: {
  label: string;
  value: number;
  note?: string;
  testId: string;
}) {
  return (
    <div
      className="border-line bg-surface flex flex-col gap-0.5 rounded-lg border p-4"
      data-testid={testId}
    >
      <dt className="text-ink-muted text-sm">{label}</dt>
      <dd className="font-display text-3xl font-semibold tabular-nums">{value}</dd>
      {note && <dd className="text-ink-muted text-xs">{note}</dd>}
    </div>
  );
}

function GroupTable({
  title,
  hint,
  rows,
  testId,
}: {
  title: string;
  hint: string;
  rows: Group[];
  testId: string;
}) {
  const cell = (n: number, of: number) => {
    const p = of >= FEW ? pct(n, of) : null;
    return (
      <>
        {n}
        {p !== null && <span className="text-ink-muted"> ({p}%)</span>}
      </>
    );
  };
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-ink-muted text-sm">{hint}</p>
      </div>
      {/* Focusable so keyboard users can scroll it sideways on narrow screens. */}
      <ul className="flex flex-col sm:hidden" data-testid={`${testId}-list`}>
        {rows.map((r) => (
          <li key={r.key} className="border-line border-b py-2 text-sm last:border-0">
            <p className="font-semibold">{r.label}</p>
            <p className="text-ink-muted tabular-nums">
              {r.sent} sent · {r.replies} {r.replies === 1 ? 'reply' : 'replies'}
              {r.sent >= FEW ? ` (${pct(r.replies, r.sent)}%)` : ''} · {r.interviews}{' '}
              {r.interviews === 1 ? 'interview' : 'interviews'} · {r.offers}{' '}
              {r.offers === 1 ? 'offer' : 'offers'}
            </p>
            {r.sent < FEW && <p className="text-ink-subtle text-xs">Too few to compare yet</p>}
          </li>
        ))}
      </ul>
      <div
        className="focus-visible:outline-primary hidden overflow-x-auto rounded-sm focus-visible:outline-2 sm:block"
        tabIndex={0}
        role="region"
        aria-label={`${title}: table`}
      >
        <table className="w-full min-w-[520px] text-sm" data-testid={testId}>
          <thead>
            <tr className="text-ink-muted border-line border-b text-left">
              <th scope="col" className="py-2 pr-3 font-semibold">
                {title === 'By CV' ? 'CV' : 'Design'}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                Sent
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                Replies
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                Interviews
              </th>
              <th scope="col" className="py-2 pl-2 text-right font-semibold">
                Offers
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-line border-b last:border-0">
                <th scope="row" className="py-2 pr-3 text-left font-semibold">
                  {r.label}
                  {r.sent < FEW && (
                    <span className="text-ink-subtle block text-xs font-normal">
                      Too few to compare yet
                    </span>
                  )}
                </th>
                <td className="px-2 py-2 text-right tabular-nums">{r.sent}</td>
                <td className="px-2 py-2 text-right tabular-nums">{cell(r.replies, r.sent)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{cell(r.interviews, r.sent)}</td>
                <td className="py-2 pl-2 text-right tabular-nums">{r.offers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Back link for the results page. */
export function BackToJobs() {
  return (
    <Link href="/jobs" className="text-primary inline-flex items-center gap-1.5 font-semibold">
      <ArrowLeft aria-hidden size={18} /> All jobs
    </Link>
  );
}
