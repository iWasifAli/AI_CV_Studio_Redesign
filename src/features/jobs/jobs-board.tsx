'use client';

import { useT } from '@/i18n/client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { BarChart3, Bell, Briefcase, Link2, Lock, Plus, X } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextArea, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { useAccount } from '@/features/account/account-context';
import { useEntitlements } from '@/features/account/entitlements';
import type { JobFromUrl } from '@/modules/jobs/from-url';
import {
  JOB_OUTCOMES,
  JOB_STAGES,
  OUTCOME_LABEL,
  STAGE_LABEL,
  type Job,
  type JobOutcome,
  type JobStage,
} from '@/modules/jobs/schema';
import { JobsError, jobsApi } from './api';

const fmt = (d: string) =>
  new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Job tracker board: one column per stage (stacked on phones), move with a select. */
export function JobsBoard() {
  const t = useT();
  const account = useAccount();
  const { ent } = useEntitlements();
  const toast = useToast();
  const [data, setData] = useState<{ jobs: Job[]; max: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  // The Create sheet and Studio Home link here with ?new=1 to open the form straight away.
  const params = useSearchParams();
  const router = useRouter();
  const wantsNew = params.get('new') === '1';
  const adding = opened || wantsNew;
  const setAdding = (v: boolean) => {
    setOpened(v);
    if (!v && wantsNew) router.replace('/jobs', { scroll: false });
  };

  const load = useCallback(() => {
    jobsApi.list().then(setData, (e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    if (account.status === 'signedIn') load();
  }, [account.status, load]);

  const move = async (job: Job, patch: { stage?: JobStage; outcome?: JobOutcome }) => {
    setData(
      (d) => d && { ...d, jobs: d.jobs.map((j) => (j.id === job.id ? { ...j, ...patch } : j)) },
    );
    try {
      const next = await jobsApi.update(job.id, patch);
      setData((d) => d && { ...d, jobs: d.jobs.map((j) => (j.id === job.id ? next : j)) });
      toast.show({
        tone: 'success',
        message: patch.stage ? `Moved to ${STAGE_LABEL[patch.stage]}` : 'Saved',
      });
    } catch (e) {
      setError((e as Error).message);
      load();
    }
  };

  if (account.status === 'loading')
    return <div className="skeleton h-72 rounded-lg" aria-busy="true" aria-label={t('Loading')} />;
  if (account.status === 'signedOut')
    return (
      <Card className="flex flex-col items-start gap-3 p-6">
        <Lock aria-hidden className="text-primary" />
        <h2 className="text-xl font-semibold">{t('Sign in to track your applications')}</h2>
        <p className="text-ink-muted">
          {t(
            'Keep every job you’re interested in, where you are with it, and which CV you sent — on any device.',
          )}
        </p>
        <ButtonLink href="/signin?next=/jobs">{t('Sign in or create a free account')}</ButtonLink>
      </Card>
    );
  if (!data)
    return error ? (
      <Banner tone="error" title={error} />
    ) : (
      <div className="skeleton h-72 rounded-lg" aria-busy="true" aria-label={t('Loading')} />
    );

  const full = data.max !== -1 && data.jobs.length >= data.max;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-muted" data-testid="jobs-count">
          {data.max === -1
            ? t('{length} job{v1}', {
                length: data.jobs.length,
                v1: data.jobs.length === 1 ? '' : 's',
              })
            : t('{length} of {max} jobs', { length: data.jobs.length, max: data.max })}
        </p>
        <div className="flex flex-wrap gap-2">
          {ent?.features.jobInsights !== false && data.jobs.length > 0 && (
            <ButtonLink
              href="/jobs/insights"
              variant="secondary"
              icon={<BarChart3 aria-hidden size={18} />}
            >
              {t('Your results')}
            </ButtonLink>
          )}
          {!adding && (
            <Button
              icon={<Plus aria-hidden size={18} />}
              onClick={() => setAdding(true)}
              disabled={full}
            >
              {t('Add a job')}
            </Button>
          )}
        </div>
      </div>
      {full && !adding && (
        <Banner
          tone="info"
          title={t('Your plan tracks up to {max} jobs at a time.', { max: data.max })}
          action={
            ent?.features.sales ? (
              <ButtonLink href="/premium" size="sm">
                {t('See Premium')}
              </ButtonLink>
            ) : undefined
          }
        >
          {t('Remove a job you no longer need to add another.')}
        </Banner>
      )}
      {error && (
        <Banner tone="error" title={t('That didn’t work')} onDismiss={() => setError(null)}>
          {t(error)}
        </Banner>
      )}
      {adding && (
        <AddJob
          initialUrl={wantsNew ? (params.get('url') ?? '') : ''}
          canFetch={ent?.features.jobFromUrl !== false}
          onCancel={() => setAdding(false)}
          onAdded={(job) => {
            setAdding(false);
            setData((d) => d && { ...d, jobs: [job, ...d.jobs] });
            toast.show({ tone: 'success', message: 'Job added' });
          }}
        />
      )}
      {data.jobs.length === 0 && !adding ? (
        <div className="border-line-strong bg-surface flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center">
          <Briefcase aria-hidden size={28} className="text-primary" />
          <h2 className="text-xl font-semibold">{t('No jobs yet')}</h2>
          <p className="text-ink-muted max-w-md">
            {t(
              'Add a job you’re interested in. Paste the advert too — it lets you check how well your CV matches and write a letter for it.',
            )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5" data-testid="jobs-board">
          {JOB_STAGES.map((stage) => {
            const jobs = data.jobs.filter((j) => j.stage === stage);
            return (
              <section
                key={stage}
                aria-labelledby={`stage-${stage}`}
                className="bg-sunken/60 flex flex-col gap-2 rounded-lg p-3"
                data-stage={stage}
              >
                <h2
                  id={`stage-${stage}`}
                  className="flex items-center justify-between px-1 text-sm font-semibold"
                >
                  {STAGE_LABEL[stage]}
                  <span className="text-ink-muted font-normal">{jobs.length}</span>
                </h2>
                {jobs.map((j) => (
                  <article
                    key={j.id}
                    className="border-line bg-surface rounded-md border p-3"
                    data-testid="job-card"
                  >
                    <Link
                      href={`/jobs/${j.id}`}
                      className="font-semibold underline-offset-2 hover:underline"
                    >
                      {j.title}
                    </Link>
                    {(j.company || j.location) && (
                      <p className="text-ink-muted text-sm">
                        {[j.company, j.location].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <p className="text-ink-subtle mt-1 text-xs">
                      {j.appliedOn
                        ? t('Applied {v0}', { v0: fmt(j.appliedOn) })
                        : t('Added {v0}', { v0: fmt(j.createdAt) })}
                    </p>
                    <NextReminder job={j} />
                    <label className="mt-2 flex items-center gap-2 text-sm">
                      <span className="text-ink-muted">{t('Move to')}</span>
                      <select
                        className="border-line-strong bg-surface h-9 min-w-0 flex-1 rounded-sm border px-1.5"
                        value={j.stage}
                        aria-label={t('Stage for {title}', { title: j.title })}
                        onChange={(e) => void move(j, { stage: e.target.value as JobStage })}
                      >
                        {JOB_STAGES.map((s) => (
                          <option key={s} value={s}>
                            {STAGE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    {j.stage === 'closed' && (
                      <label className="mt-2 flex items-center gap-2 text-sm">
                        <span className="text-ink-muted">{t('Ended')}</span>
                        <select
                          className="border-line-strong bg-surface h-9 min-w-0 flex-1 rounded-sm border px-1.5"
                          value={j.outcome ?? ''}
                          aria-label={t('How it ended: {title}', { title: j.title })}
                          onChange={(e) => void move(j, { outcome: e.target.value as JobOutcome })}
                        >
                          <option value="">{t('Not said')}</option>
                          {JOB_OUTCOMES.map((o) => (
                            <option key={o} value={o}>
                              {OUTCOME_LABEL[o]}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddJob({
  onCancel,
  onAdded,
  initialUrl = '',
  canFetch = true,
}: {
  onCancel: () => void;
  onAdded: (j: Job) => void;
  initialUrl?: string;
  canFetch?: boolean;
}) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [url, setUrl] = useState(initialUrl);
  const [advert, setAdvert] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // R9.5: fill the form from the advert's link (the person checks it, then saves).
  const [reading, setReading] = useState(false);
  const [read, setRead] = useState<{ host: string; via: JobFromUrl['via'] } | null>(null);
  const fill = async (link = url) => {
    if (!/^https?:\/\/\S+\.\S+/i.test(link.trim())) {
      setError('Paste the full link to the job advert, starting with https://');
      return;
    }
    setReading(true);
    setError(null);
    setRead(null);
    try {
      const job = await jobsApi.fromUrl(link.trim());
      setTitle(job.title);
      setCompany(job.company);
      setLocation(job.location);
      setUrl(job.url);
      setAdvert(job.advert);
      setRead({ host: new URL(job.url).hostname.replace(/^www\./, ''), via: job.via });
    } catch (err) {
      // Show where to go next: the advert text box.
      setPasteHelp(true);
      setError(err instanceof JobsError ? err.message : 'That didn’t work. Please try again.');
    } finally {
      setReading(false);
    }
  };
  // When a site can't be read: fill the form from the advert text the person pasted instead.
  const [pasteHelp, setPasteHelp] = useState(false);
  const [readingText, setReadingText] = useState(false);
  const fillFromText = async () => {
    setReadingText(true);
    setError(null);
    try {
      const job = await jobsApi.fromText(
        advert,
        /^https?:\/\//i.test(url.trim()) ? url.trim() : '',
      );
      if (job.title) setTitle(job.title);
      if (job.company) setCompany(job.company);
      if (job.location) setLocation(job.location);
      if (job.advert) setAdvert(job.advert);
      setRead({ host: '', via: job.via });
      setPasteHelp(false);
    } catch (err) {
      setError(err instanceof JobsError ? err.message : 'That didn’t work. Please try again.');
    } finally {
      setReadingText(false);
    }
  };
  const started = useRef(false);
  useEffect(() => {
    if (initialUrl && canFetch && !started.current) {
      started.current = true;
      void fill(initialUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl, canFetch]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onAdded(await jobsApi.create({ title, company, location, url, advert }));
    } catch (err) {
      setError(err instanceof JobsError ? err.message : 'That didn’t work. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="flex flex-col gap-4" aria-label={t('Add a job')}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('Add a job')}</h2>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('Close')}
            icon={<X aria-hidden size={18} />}
            onClick={onCancel}
          />
        </div>
        {canFetch && (
          <div className="bg-primary-soft/40 flex flex-col gap-2 rounded-lg p-3">
            <div className="flex flex-wrap items-end gap-2">
              <TextField
                label={t('Link to the advert')}
                containerClassName="min-w-0 flex-1"
                type="url"
                inputMode="url"
                placeholder={t('https://')}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void fill();
                  }
                }}
                maxLength={500}
              />
              <Button
                variant="secondary"
                icon={<Link2 aria-hidden size={18} />}
                loading={reading}
                disabled={reading || !url.trim()}
                onClick={() => fill()}
              >
                {t('Fill in from the link')}
              </Button>
            </div>
            {read ? (
              <p className="text-sm" role="status" data-testid="job-read">
                {read.host
                  ? t('Filled in from {host}', { host: read.host })
                  : t('Filled in from the advert text')}
                {read.via === 'page'
                  ? ' — we couldn’t pick out the advert, so the whole page text is below. Trim it to the advert.'
                  : '. Check it before you save.'}
              </p>
            ) : (
              <p className="text-ink-muted text-sm">
                {t('Paste a job’s link and we’ll fill in the title, company and advert for you.')}
              </p>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label={t('Job title')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={160}
          />
          <TextField
            label={t('Company')}
            optional
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            maxLength={160}
          />
          <TextField
            label={t('Location')}
            optional
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={120}
          />
          {!canFetch && (
            <TextField
              label={t('Link to the advert')}
              optional
              type="url"
              inputMode="url"
              placeholder={t('https://')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              maxLength={500}
            />
          )}
        </div>
        <TextArea
          label={t('The job advert')}
          optional
          hint={t(
            'Paste the advert text. It stays private and is used to check your CV against it and to write a letter.',
          )}
          rows={pasteHelp ? 8 : 5}
          value={advert}
          onChange={(e) => setAdvert(e.target.value)}
          maxLength={20000}
          autoFocus={pasteHelp}
        />
        {canFetch && (
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            loading={readingText}
            disabled={readingText || advert.trim().length < 80}
            onClick={fillFromText}
            data-testid="job-fill-from-text"
          >
            {t('Fill in from the advert text')}
          </Button>
        )}
        {error && (
          <p role="alert" className="text-danger text-sm">
            {t(error)}
          </p>
        )}
        <div className="flex gap-3">
          <Button type="submit" loading={busy}>
            {t('Save job')}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            {t('Cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** The job's next open reminder on its card ("Due" when today or earlier). */
function NextReminder({ job }: { job: Job }) {
  const tx = useT();
  const r = (job.reminders ?? [])
    .filter((x) => !x.done)
    .sort((a, b) => a.on.localeCompare(b.on))[0];
  if (!r) return null;
  const today = new Date().toLocaleDateString('en-CA');
  const due = r.on <= today;
  return (
    <p
      className={`mt-1 flex items-center gap-1 text-xs ${due ? 'text-warning font-semibold' : 'text-ink-muted'}`}
      data-testid="card-reminder"
    >
      <Bell aria-hidden size={12} />
      {due ? tx('Due: ') : `${fmt(r.on)}: `}
      {r.note}
    </p>
  );
}
