'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, ChevronDown, GripVertical } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useT } from '@/i18n/client';
import {
  JOB_OUTCOMES,
  JOB_STAGES,
  OUTCOME_LABEL,
  STAGE_LABEL,
  type Job,
  type JobOutcome,
  type JobStage,
} from '@/modules/jobs/schema';
import { reorderAnchor } from './board-ui-state';

const selectClass = 'border-line-strong bg-surface h-11 min-w-0 flex-1 rounded-sm border px-2';
const actionClass =
  'border-line-strong bg-surface hover:bg-sunken inline-flex min-h-11 min-w-11 flex-1 items-center justify-center gap-1 rounded-sm border px-2 text-sm disabled:opacity-45';
const fmt = (date: string) =>
  new Date(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

type Props = {
  job: Job;
  ids: string[];
  pending: boolean;
  dragging: boolean;
  reducedMotion: boolean;
  onMove: (jobId: string, stage: JobStage, beforeId: string | null, control: string) => void;
  onOutcome: (jobId: string, outcome: JobOutcome | '') => Promise<void>;
  reminder: (job: Job) => ReactNode;
};

export function EnhancedBoardCard({
  job,
  ids,
  pending,
  dragging,
  reducedMotion,
  onMove,
  onOutcome,
  reminder,
}: Props) {
  const t = useT();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: job.id,
    data: { kind: 'job', stage: job.stage },
    disabled: pending,
  });
  const up = reorderAnchor(ids, job.id, 'up');
  const down = reorderAnchor(ids, job.id, 'down');
  const disabled = pending || dragging;

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: isDragging ? undefined : CSS.Transform.toString(transform),
        transition: reducedMotion ? undefined : transition,
      }}
      className={`border-line bg-surface relative rounded-md border p-4 shadow-sm ${isDragging ? 'border-primary border-dashed opacity-30' : ''}`}
      data-testid="job-card"
      data-job-id={job.id}
    >
      <div className="flex items-start gap-2">
        <Link
          href={`/jobs/${job.id}`}
          className="flex min-h-11 min-w-0 flex-1 items-center leading-snug font-semibold break-words underline-offset-2 hover:underline"
        >
          {job.title}
        </Link>
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t('Drag {title}', { title: job.title })}
          title={t('Drag {title}', { title: job.title })}
          aria-roledescription={t('Draggable job')}
          disabled={pending}
          data-board-control="drag"
          className="text-ink-muted hover:bg-sunken -mt-2 -mr-2 flex h-11 w-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm active:cursor-grabbing disabled:opacity-45"
        >
          <GripVertical aria-hidden size={19} />
        </button>
      </div>
      <JobCardInfo job={job} reminder={reminder} />
      <details className="border-line mt-3 border-t pt-2">
        <summary className="text-ink-muted flex min-h-11 cursor-pointer list-none items-center justify-between rounded-sm text-sm font-medium">
          {t('Actions')}
          <ChevronDown aria-hidden size={16} />
        </summary>
        <div className="flex flex-col gap-3 pt-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-muted">{t('Move to')}</span>
            <select
              className={selectClass}
              value={job.stage}
              disabled={disabled}
              data-board-control="stage"
              aria-label={t('Stage for {title}', { title: job.title })}
              onChange={(event) => onMove(job.id, event.target.value as JobStage, null, 'stage')}
            >
              {JOB_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {t(STAGE_LABEL[stage])}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className={actionClass}
              disabled={disabled || up === undefined}
              data-board-control="up"
              aria-label={t('Move {title} up', { title: job.title })}
              onClick={() => up !== undefined && onMove(job.id, job.stage, up, 'up')}
            >
              <ArrowUp aria-hidden size={15} />
              {t('Move up')}
            </button>
            <button
              type="button"
              className={actionClass}
              disabled={disabled || down === undefined}
              data-board-control="down"
              aria-label={t('Move {title} down', { title: job.title })}
              onClick={() => down !== undefined && onMove(job.id, job.stage, down, 'down')}
            >
              <ArrowDown aria-hidden size={15} />
              {t('Move down')}
            </button>
          </div>
        </div>
      </details>
      {job.stage === 'closed' && (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-ink-muted">{t('Ended')}</span>
          <select
            className={selectClass}
            value={job.outcome ?? ''}
            disabled={disabled}
            aria-label={t('How it ended: {title}', { title: job.title })}
            onChange={(event) => void onOutcome(job.id, event.target.value as JobOutcome | '')}
          >
            <option value="">{t('Not said')}</option>
            {JOB_OUTCOMES.map((outcome) => (
              <option key={outcome} value={outcome}>
                {t(OUTCOME_LABEL[outcome])}
              </option>
            ))}
          </select>
        </label>
      )}
    </article>
  );
}

function JobCardInfo({ job, reminder }: { job: Job; reminder: (job: Job) => ReactNode }) {
  const t = useT();
  return (
    <>
      {(job.company || job.location) && (
        <p className="text-ink-muted mt-1 text-sm break-words">
          {[job.company, job.location].filter(Boolean).join(' · ')}
        </p>
      )}
      <p className="text-ink-subtle mt-2 text-xs">
        {job.appliedOn
          ? t('Applied {v0}', { v0: fmt(job.appliedOn) })
          : t('Added {v0}', { v0: fmt(job.createdAt) })}
      </p>
      {reminder(job)}
    </>
  );
}

/** The overlay is presentation only, so it adds no duplicate links or form controls. */
export function BoardDragPreview({
  job,
  reminder,
}: {
  job: Job;
  reminder: (job: Job) => ReactNode;
}) {
  return (
    <div
      aria-hidden
      className="border-primary bg-surface pointer-events-none rounded-md border p-4 shadow-xl"
    >
      <p className="leading-snug font-semibold break-words">{job.title}</p>
      <JobCardInfo job={job} reminder={reminder} />
    </div>
  );
}
