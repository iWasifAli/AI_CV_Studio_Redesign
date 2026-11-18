'use client';

import { useWorkspaceState, useWorkspaceTask, useWorkspace } from '@/features/workspace/context';

import { useWorkspaceAcknowledge } from '@/features/workspace/use-acknowledge';
import {
  isNewerCanonical,
  reconcileCanonicalFields,
} from '@/features/workspace/canonical-reconciliation';
import { sameSnapshotValue } from '@/features/workspace/equality';

import { useWorkspaceTitle } from '@/features/workspace/use-title';
import { useT } from '@/i18n/client';
import Link from '@/features/workspace/navigation';
import { useWorkspaceRouter as useRouter } from '@/features/workspace/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ExternalLink, Trash2 } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextArea, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { CheckboxField } from '@/features/editor/fields';
import {
  JOB_OUTCOMES,
  JOB_STAGES,
  OUTCOME_LABEL,
  STAGE_LABEL,
  type Job,
  type JobOutcome,
  type JobStage,
} from '@/modules/jobs/schema';
import { getRepository } from '@/modules/storage/repository';
import { jobsApi, JobsError, type ConflictDetails } from './api';
import { revisionOf } from './workspace-state';
import { ConflictNotice } from './conflict-notice';
import { JobTools } from './job-tools';
import { CompanyBrief } from './company-brief';
import { RemindersCard } from './reminders-card';
import { useEntitlements } from '@/features/account/entitlements';

type Draft = Pick<
  Job,
  | 'title'
  | 'company'
  | 'location'
  | 'url'
  | 'advert'
  | 'stage'
  | 'outcome'
  | 'notes'
  | 'appliedOn'
  | 'documentIds'
>;
const pick = (j: Job): Draft => ({
  title: j.title,
  company: j.company,
  location: j.location,
  url: j.url,
  advert: j.advert,
  stage: j.stage,
  outcome: j.outcome ?? '',
  notes: j.notes,
  appliedOn: j.appliedOn,
  documentIds: j.documentIds,
});

/** CV list from this browser's repository (updates when CVs sync in). */
function useCvList() {
  const repo = typeof window === 'undefined' ? null : getRepository();
  const version = useSyncExternalStore(
    (cb) => repo?.subscribe(cb) ?? (() => {}),
    () => (repo ? JSON.stringify(repo.list().map((d) => d.id + d.updatedAt)) : ''),
    () => '',
  );
  return useMemo(() => (repo ? repo.list() : []), [repo, version]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function JobDetail({ id }: { id: string }) {
  const t = useT();
  const { ownerUid } = useWorkspace();
  const [job, setJob] = useWorkspaceState<Job | null>('jobs.JobDetail.job', null, { dirty: false });
  const [error, setError] = useWorkspaceState<string | null>('jobs.JobDetail.error', null, {
    dirty: false,
  });
  useEffect(() => {
    let live = true;
    jobsApi.get(id, { ownerUid }).then(
      (j) => {
        if (live) setJob((current) => (!current || isNewerCanonical(current, j) ? j : current));
      },
      (e: Error) => {
        if (live) setError(e.message);
      },
    );
    return () => {
      live = false;
    };
  }, [id, ownerUid, setJob, setError]);
  if (!job)
    return error ? (
      <Banner tone="error" title={error} action={<Link href="/jobs">{t('Back to jobs')}</Link>} />
    ) : (
      <div className="skeleton h-96 rounded-lg" aria-busy="true" aria-label={t('Loading')} />
    );
  return <JobDetailForm initial={job} />;
}

export function JobDetailForm({ initial }: { initial: Job }) {
  const t = useT();
  const router = useRouter();
  const runTask = useWorkspaceTask();
  const { ownerUid, store, tabId, routeKey } = useWorkspace();
  const acknowledgeDraft = useWorkspaceAcknowledge<Draft>('jobs.JobDetail.draft');
  const [conflict, setConflict] = useWorkspaceState<ConflictDetails | null>(
    'jobs.JobDetail.conflict',
    null,
    { dirty: false },
  );
  const toast = useToast();
  const cvs = useCvList();
  const { ent } = useEntitlements();
  const [job, setJob] = useWorkspaceState<Job>('jobs.JobDetail.job', initial, { dirty: false });
  const [draft, setDraft] = useWorkspaceState<Draft>('jobs.JobDetail.draft', () => pick(initial), {
    dirty: true,
  });
  const [error, setError] = useWorkspaceState<string | null>('jobs.JobDetail.error', null, {
    dirty: false,
  });
  useWorkspaceTitle([draft.title, draft.company].filter(Boolean).join(' · '));
  const [saving, setSaving] = useState(false);
  const baseline = useRef(pick(job));
  useEffect(() => {
    const canonical = isNewerCanonical(job, initial) ? initial : job;
    if (canonical !== job) setJob(canonical);
    const acknowledged =
      store && tabId
        ? (store.getTab(tabId)?.features[`${routeKey}:jobs.JobDetail.draft`]?.baseline?.value as
            Draft | undefined)
        : undefined;
    const previous = acknowledged ?? baseline.current;
    const next = pick(canonical);
    if (!sameSnapshotValue(previous, next)) {
      setDraft((current) => reconcileCanonicalFields(current, previous, next));
      acknowledgeDraft(next);
    }
    baseline.current = next;
  }, [initial, job, store, tabId, routeKey, setJob, setDraft, acknowledgeDraft]);

  const acceptJob = (next: Job) => {
    let accepted = false;
    setJob((current) => {
      accepted = isNewerCanonical(current, next);
      return accepted ? next : current;
    });
    return accepted;
  };

  const dirty = JSON.stringify(pick(job)) !== JSON.stringify(draft);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => d && { ...d, [k]: v });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await runTask('jobs.JobDetail.save', async (signal) => {
        const next = await jobsApi.update(job.id, draft, {
          signal,
          ownerUid,
          expectedRevision: revisionOf(job),
        });
        if (acceptJob(next)) {
          setDraft((current) => reconcileCanonicalFields(current, draft, pick(next)));
          baseline.current = pick(next);
          acknowledgeDraft(pick(next));
        }
        setConflict(null);
        toast.show({ tone: 'success', message: 'Saved' });
      });
    } catch (e) {
      if (e instanceof JobsError && e.status === 409) setConflict(e.details ?? {});
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Remove “${job.title}” from your jobs?`)) return;
    try {
      await runTask('jobs.JobDetail.remove', (signal) =>
        jobsApi.remove(job.id, { signal, ownerUid, expectedRevision: revisionOf(job) }),
      );
      toast.show({ tone: 'success', message: 'Job removed' });
      router.push('/jobs');
    } catch (e) {
      if (e instanceof JobsError && e.status === 409) setConflict(e.details ?? {});
      setError((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-24">
      <Link href="/jobs" className="text-primary inline-flex items-center gap-1.5 font-semibold">
        <ArrowLeft aria-hidden size={18} /> {t('All jobs')}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] leading-tight font-semibold tracking-tight">
            {job.title}
          </h1>
          <p className="text-ink-muted">
            {[job.company, job.location].filter(Boolean).join(' · ')}
          </p>
        </div>
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-1.5 font-semibold"
          >
            {t('Open the advert')} <ExternalLink aria-hidden size={16} />
          </a>
        )}
      </div>
      <ConflictNotice
        details={conflict}
        onKeepDraft={
          conflict?.current
            ? () => {
                setJob(conflict.current as Job);
                setConflict(null);
              }
            : undefined
        }
      />
      {error && (
        <Banner tone="error" title={t('That didn’t work')} onDismiss={() => setError(null)}>
          {t(error)}
        </Banner>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="text-lg font-semibold">{t('Where you are')}</h2>
            <div role="radiogroup" aria-label={t('Stage')} className="flex flex-wrap gap-2">
              {JOB_STAGES.map((s: JobStage) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={draft.stage === s}
                  onClick={() => set('stage', s)}
                  className={
                    draft.stage === s
                      ? 'border-primary bg-primary-soft text-primary min-h-10 rounded-full border-2 px-3.5 text-sm font-semibold'
                      : 'border-line-strong bg-surface hover:bg-sunken min-h-10 rounded-full border px-3.5 text-sm font-semibold'
                  }
                >
                  {STAGE_LABEL[s]}
                </button>
              ))}
            </div>
            {draft.stage === 'closed' && (
              <label className="flex max-w-sm flex-col gap-1.5">
                <span className="text-sm font-semibold">
                  {t('How did it end?')}{' '}
                  <span className="text-ink-muted font-normal">{t('(optional)')}</span>
                </span>
                <select
                  className="border-line-strong bg-surface h-11 rounded-md border px-3"
                  value={draft.outcome}
                  onChange={(e) => set('outcome', e.target.value as JobOutcome | '')}
                  data-testid="job-outcome"
                >
                  <option value="">{t('Not said')}</option>
                  {JOB_OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {OUTCOME_LABEL[o]}
                    </option>
                  ))}
                </select>
                <span className="text-ink-muted text-sm">
                  {t('It helps your results: a “no” counts as a reply, silence doesn’t.')}
                </span>
              </label>
            )}
            <TextField
              label={t('Applied on')}
              optional
              type="date"
              value={draft.appliedOn}
              onChange={(e) => set('appliedOn', e.target.value)}
              containerClassName="max-w-[220px]"
            />
            <TextArea
              label={t('Notes')}
              optional
              rows={4}
              hint={t('Contacts, interview times, what to follow up.')}
              value={draft.notes}
              onChange={(e) => set('notes', e.target.value)}
              maxLength={4000}
            />
          </Card>

          {ent?.features.reminders !== false && <RemindersCard job={job} onJobChange={acceptJob} />}

          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-lg font-semibold">{t('CVs for this job')}</h2>
            {/* A picker, not a record: only ticked CVs are linked (audit F-13). */}
            {cvs.length > 0 && (
              <p className="text-ink-muted text-sm">
                {t('Tick the CVs you used or plan to use. Only ticked CVs are linked to this job.')}
              </p>
            )}
            {job.sent && (
              <p className="text-ink-muted text-sm" data-testid="job-sent">
                {t('Sent with “{title}”{v}', { title: job.sent.title, v: ' ' })}
                {job.sent.designId ? `in ${job.sent.designName}` : 'in a design of your own'}
                {t('. Your results count this application under that CV and design.')}
              </p>
            )}
            {cvs.length === 0 ? (
              <p className="text-ink-muted text-sm">
                {t('You have no CVs yet.')}{' '}
                <Link href="/start" className="text-primary font-semibold">
                  {t('Create one')}
                </Link>
                .
              </p>
            ) : (
              <ul className="flex flex-col gap-1" data-testid="job-cvs">
                {cvs.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3">
                    <CheckboxField
                      label={c.title || c.name || t('Untitled CV')}
                      checked={draft.documentIds.includes(c.id)}
                      onChange={(v) =>
                        set(
                          'documentIds',
                          v
                            ? [...draft.documentIds, c.id].slice(0, 10)
                            : draft.documentIds.filter((x) => x !== c.id),
                        )
                      }
                    />
                    <Link
                      href={`/cv/${c.id}`}
                      className="text-primary shrink-0 text-sm font-semibold"
                    >
                      {t('Open')}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <JobTools
            job={job}
            onJobChange={(j) => {
              acceptJob(j);
            }}
          />
          <CompanyBrief
            job={job}
            onJobChange={(j) => {
              acceptJob(j);
            }}
          />
        </div>

        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-lg font-semibold">{t('The job')}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label={t('Job title')}
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              maxLength={160}
            />
            <TextField
              label={t('Company')}
              optional
              value={draft.company}
              onChange={(e) => set('company', e.target.value)}
              maxLength={160}
            />
            <TextField
              label={t('Location')}
              optional
              value={draft.location}
              onChange={(e) => set('location', e.target.value)}
              maxLength={120}
            />
            <TextField
              label={t('Link to the advert')}
              optional
              type="url"
              value={draft.url}
              onChange={(e) => set('url', e.target.value)}
              maxLength={500}
            />
          </div>
          <TextArea
            label={t('The job advert')}
            optional
            rows={14}
            hint={t(
              'Paste the full advert. It’s used to check your CV against the job and to write a letter.',
            )}
            value={draft.advert}
            onChange={(e) => set('advert', e.target.value)}
            maxLength={20000}
          />
          <Button
            variant="ghost"
            icon={<Trash2 aria-hidden size={18} />}
            onClick={remove}
            className="self-start"
          >
            {t('Remove this job')}
          </Button>
        </Card>
      </div>

      <div className="border-line bg-surface/95 fixed right-0 bottom-[var(--shell-bottom,0px)] left-[var(--shell-left,0px)] z-20 border-t backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center justify-end gap-3 px-4 py-3 md:px-8">
          <span className="text-ink-muted text-sm" aria-live="polite">
            {dirty ? t('Unsaved changes') : t('All changes saved')}
          </span>
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => setDraft(pick(job))}>
            {t('Discard')}
          </Button>
          <Button disabled={!dirty} loading={saving} onClick={save}>
            {t('Save changes')}
          </Button>
        </div>
      </div>
    </div>
  );
}
