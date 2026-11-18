'use client';

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragMoveEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Briefcase } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useT } from '@/i18n/client';
import type { JobBoardState } from '@/modules/jobs/board';
import {
  JOB_STAGES,
  STAGE_LABEL,
  type Job,
  type JobOutcome,
  type JobStage,
} from '@/modules/jobs/schema';
import { keyboardBoardPosition, makeBoardMove, type BoardPosition } from './board-ui-state';
import { BoardDragPreview, EnhancedBoardCard } from './enhanced-board-card';

type Props = {
  jobs: Job[];
  board: JobBoardState;
  pending: boolean;
  onMove: (jobId: string, stage: JobStage, beforeId: string | null) => Promise<void>;
  onOutcome: (jobId: string, outcome: JobOutcome | '') => Promise<void>;
  reminder: (job: Job) => ReactNode;
};

const laneId = (stage: JobStage) => `jobs-lane:${stage}`;
const subscribeReady = () => () => {};
const subscribeMotion = (notify: () => void) => {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
const motionSnapshot = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Prefer a card under the pointer, then the lane, and never snap an outside drop back in. */
const boardCollision: CollisionDetection = (args) => {
  if (args.pointerCoordinates) {
    const hits = pointerWithin(args);
    const lane = hits.find(
      (hit) =>
        args.droppableContainers.find((item) => item.id === hit.id)?.data.current?.kind === 'lane',
    );
    if (!lane) return [];
    const stage = args.droppableContainers.find((item) => item.id === lane.id)?.data.current?.stage;
    const cards = hits.filter(
      (hit) =>
        args.droppableContainers.find((item) => item.id === hit.id)?.data.current?.kind === 'job' &&
        args.droppableContainers.find((item) => item.id === hit.id)?.data.current?.stage === stage,
    );
    return cards.length ? cards : [lane];
  }
  const centerX = args.collisionRect.left + args.collisionRect.width / 2;
  const centerY = args.collisionRect.top + args.collisionRect.height / 2;
  const lane = args.droppableContainers.find((container) => {
    if (container.data.current?.kind !== 'lane') return false;
    const rect = args.droppableRects.get(container.id);
    return (
      rect &&
      centerX >= rect.left &&
      centerX <= rect.right &&
      centerY >= rect.top &&
      centerY <= rect.bottom
    );
  });
  if (!lane) return [];
  const cards = args.droppableContainers.filter(
    (container) =>
      container.data.current?.kind === 'job' &&
      container.data.current?.stage === lane.data.current?.stage &&
      container.id !== args.active.id,
  );
  return closestCenter({ ...args, droppableContainers: cards.length ? cards : [lane] });
};

export function EnhancedBoard({ jobs, board, pending, onMove, onOutcome, reminder }: Props) {
  const t = useT();
  const ready = useSyncExternalStore(
    subscribeReady,
    () => true,
    () => false,
  );
  const reducedMotion = useSyncExternalStore(subscribeMotion, motionSnapshot, () => false);
  const root = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const keyboardDrag = useRef(false);
  const dropMessage = useRef('');
  const destinationRef = useRef<BoardPosition | null>(null);
  const [destination, setDestination] = useState<BoardPosition | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [jumpStage, setJumpStage] = useState<JobStage>('saved');
  const byId = new Map(jobs.map((job) => [job.id, job]));
  // Hidden IDs remain in persisted metadata; only visible cards participate in hit testing.
  const columns = Object.fromEntries(
    JOB_STAGES.map((stage) => [stage, board.columns[stage].filter((id) => byId.has(id))]),
  ) as Record<JobStage, string[]>;
  const activeJob = activeId ? byId.get(activeId) : undefined;

  const updateDestination = (next: BoardPosition | null) => {
    const old = destinationRef.current;
    if (old?.stage === next?.stage && old?.beforeId === next?.beforeId) return;
    destinationRef.current = next;
    setDestination(next);
  };

  const coordinates: KeyboardCoordinateGetter = (
    event,
    { active, currentCoordinates, context },
  ) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) return;
    event.preventDefault();
    const current = destinationRef.current;
    if (!current) return;
    const next = keyboardBoardPosition(columns, String(active), current, event.code);
    if (!next) return;
    // Re-enabling after a save can precede dnd-kit's next measurement frame. Read the
    // mounted nodes so the first arrow key still works during that handoff.
    const rectFor = (id: string) =>
      context.droppableContainers.get(id)?.node.current?.getBoundingClientRect() ??
      context.droppableRects.get(id);
    const source = context.collisionRect ?? context.activeNode?.getBoundingClientRect();
    const rect = rectFor(next.beforeId ?? laneId(next.stage));
    const lane = rectFor(laneId(next.stage));
    if (!rect || !lane || !source) return;
    updateDestination(next);
    const lastId = columns[next.stage].filter((id) => id !== String(active)).at(-1);
    const last = lastId ? rectFor(lastId) : undefined;
    const targetY = next.beforeId
      ? rect.top + rect.height / 2
      : last
        ? last.bottom + 8
        : lane.top + 40;
    return {
      x: currentCoordinates.x + lane.left + lane.width / 2 - (source.left + source.width / 2),
      y: currentCoordinates.y + targetY - (source.top + source.height / 2),
    };
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: coordinates,
      scrollBehavior: reducedMotion ? 'auto' : 'smooth',
    }),
  );

  const restoreFocus = (jobId: string, control = 'drag') => {
    requestAnimationFrame(() => {
      const card = Array.from(
        root.current?.querySelectorAll<HTMLElement>('[data-job-id]') ?? [],
      ).find((node) => node.dataset.jobId === jobId);
      const target = card?.querySelector<HTMLElement>(`[data-board-control="${control}"]`);
      const disclosure = target?.closest('details');
      if (disclosure) disclosure.open = true;
      const focusTarget = target?.matches(':disabled')
        ? card?.querySelector<HTMLElement>('a')
        : target;
      focusTarget?.focus({ preventScroll: true });
      focusTarget?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    });
  };

  const commit = async (
    jobId: string,
    stage: JobStage,
    beforeId: string | null,
    control: string,
  ) => {
    await onMove(jobId, stage, beforeId);
    restoreFocus(jobId, control);
  };

  const hover = ({ active, over }: DragMoveEvent) => {
    if (keyboardDrag.current) return;
    if (!over) {
      updateDestination(null);
      return;
    }
    const stage = over.data.current?.stage as JobStage | undefined;
    if (!stage || !JOB_STAGES.includes(stage)) {
      updateDestination(null);
      return;
    }
    const ids = columns[stage].filter((id) => id !== String(active.id));
    if (over.data.current?.kind === 'lane') {
      updateDestination({ stage, beforeId: null });
      return;
    }
    // Returning over the source card restores its original insertion gap.
    if (over.id === active.id) {
      const original = columns[stage];
      updateDestination({
        stage,
        beforeId: original[original.indexOf(String(active.id)) + 1] ?? null,
      });
      return;
    }
    const index = ids.indexOf(String(over.id));
    const rect = active.rect.current.translated;
    const after = rect && rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2;
    updateDestination({ stage, beforeId: ids[index + (after ? 1 : 0)] ?? null });
  };

  const announcePosition = (id: string) => {
    const position = destinationRef.current;
    if (!position) return t('Outside the board. Drop to cancel.');
    const ids = columns[position.stage].filter((item) => item !== id);
    const index = position.beforeId === null ? ids.length : ids.indexOf(position.beforeId);
    return t('{title}, {stage}, position {position}.', {
      title: byId.get(id)?.title ?? '',
      stage: t(STAGE_LABEL[position.stage]),
      position: index + 1,
    });
  };

  return (
    <div
      ref={root}
      className="min-w-0"
      data-testid="jobs-board"
      data-enhanced="true"
      aria-busy={pending}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-muted text-sm">
          {t('Drag a handle to move a job, or use Actions.')}
        </p>
        <label className="flex items-center gap-2 text-sm lg:hidden">
          <span>{t('Jump to stage')}</span>
          <select
            className="border-line-strong bg-surface h-11 rounded-sm border px-2"
            value={jumpStage}
            onChange={(event) => {
              const stage = event.target.value as JobStage;
              setJumpStage(stage);
              const lane = root.current?.querySelector<HTMLElement>(`[data-stage="${stage}"]`);
              if (lane && scroll.current)
                scroll.current.scrollTo({
                  left:
                    lane.getBoundingClientRect().left -
                    scroll.current.getBoundingClientRect().left +
                    scroll.current.scrollLeft,
                  behavior: reducedMotion ? 'auto' : 'smooth',
                });
            }}
          >
            {JOB_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {t(STAGE_LABEL[stage])} ({columns[stage].length})
              </option>
            ))}
          </select>
        </label>
      </div>
      {jobs.length === 0 && (
        <div className="mb-4">
          <h2 className="font-semibold">{t('No jobs yet')}</h2>
          <p className="text-ink-muted mt-1 text-sm">
            {t('Add a job to start tracking your applications.')}
          </p>
        </div>
      )}
      <DndContext
        id="enhanced-jobs-board"
        sensors={sensors}
        collisionDetection={boardCollision}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        autoScroll
        accessibility={{
          restoreFocus: false,
          screenReaderInstructions: {
            draggable: t(
              'Press Space or Enter to pick up a job. Use Up and Down to reorder, Left and Right to change stage, Space or Enter to drop, and Escape to cancel.',
            ),
          },
          announcements: {
            onDragStart: ({ active }) =>
              t('Picked up {title}.', { title: byId.get(String(active.id))?.title ?? '' }),
            onDragMove: ({ active }) => announcePosition(String(active.id)),
            onDragOver: ({ active }) => announcePosition(String(active.id)),
            onDragEnd: () => dropMessage.current,
            onDragCancel: () => t('Move cancelled. The job has not moved.'),
          },
        }}
        onDragStart={({ active, activatorEvent }) => {
          if (pending) return;
          const id = String(active.id);
          const job = byId.get(id);
          if (!job) return;
          keyboardDrag.current = activatorEvent instanceof KeyboardEvent;
          setActiveId(id);
          const ids = columns[job.stage];
          updateDestination({ stage: job.stage, beforeId: ids[ids.indexOf(id) + 1] ?? null });
        }}
        onDragMove={hover}
        onDragOver={hover}
        onDragCancel={({ active }) => {
          setActiveId(null);
          updateDestination(null);
          restoreFocus(String(active.id));
        }}
        onDragEnd={(event) => {
          const { active, over } = event;
          if (!keyboardDrag.current) hover(event);
          const target = destinationRef.current;
          const shouldMove =
            target &&
            (over || keyboardDrag.current) &&
            makeBoardMove(jobs, board, String(active.id), target.stage, target.beforeId);
          dropMessage.current = shouldMove
            ? t('Dropped. Saving the job position.')
            : t('Move cancelled. The job has not moved.');
          setActiveId(null);
          if (target && shouldMove)
            void commit(String(active.id), target.stage, target.beforeId, 'drag');
          else restoreFocus(String(active.id));
          updateDestination(null);
        }}
      >
        <div
          ref={scroll}
          role="region"
          aria-label={t('Application stages')}
          tabIndex={0}
          className="relative overflow-x-auto overscroll-x-contain rounded-lg pb-3"
        >
          <div className="flex min-w-full items-stretch gap-4">
            {JOB_STAGES.map((stage) => (
              <BoardLane
                key={stage}
                stage={stage}
                count={columns[stage].length}
                pending={pending}
                highlighted={activeId !== null && destination?.stage === stage}
              >
                <SortableContext items={columns[stage]} strategy={verticalListSortingStrategy}>
                  {columns[stage].map((id) => {
                    const job = byId.get(id)!;
                    return (
                      <div key={id} className="relative">
                        {activeId &&
                          destination?.stage === stage &&
                          destination.beforeId === id && <InsertionMarker />}
                        <EnhancedBoardCard
                          job={job}
                          ids={columns[stage]}
                          pending={pending}
                          dragging={activeId !== null}
                          reducedMotion={reducedMotion}
                          onMove={(jobId, toStage, beforeId, control) =>
                            void commit(jobId, toStage, beforeId, control)
                          }
                          onOutcome={onOutcome}
                          reminder={reminder}
                        />
                      </div>
                    );
                  })}
                  <div className="relative min-h-24 flex-1">
                    {activeId && destination?.stage === stage && destination.beforeId === null && (
                      <InsertionMarker />
                    )}
                    {columns[stage].length === 0 && (
                      <div
                        className={`border-line-strong text-ink-muted flex min-h-40 items-center justify-center gap-2 rounded-md border border-dashed p-5 text-center text-sm ${activeId && destination?.stage === stage ? 'border-primary bg-primary-soft/40' : ''}`}
                      >
                        <Briefcase aria-hidden size={17} />
                        {activeId ? t('Drop here') : t('No jobs in this stage')}
                      </div>
                    )}
                  </div>
                </SortableContext>
              </BoardLane>
            ))}
          </div>
        </div>
        {ready &&
          createPortal(
            <DragOverlay dropAnimation={null} style={{ pointerEvents: 'none' }}>
              {activeJob ? <BoardDragPreview job={activeJob} reminder={reminder} /> : null}
            </DragOverlay>,
            document.body,
          )}
      </DndContext>
    </div>
  );
}

function BoardLane({
  stage,
  count,
  pending,
  highlighted,
  children,
}: {
  stage: JobStage;
  count: number;
  pending: boolean;
  highlighted: boolean;
  children: ReactNode;
}) {
  const t = useT();
  const { setNodeRef } = useDroppable({
    id: laneId(stage),
    data: { kind: 'lane', stage },
    disabled: pending,
  });
  return (
    <section
      data-stage={stage}
      aria-labelledby={`stage-${stage}`}
      className={`bg-sunken/60 flex h-[max(32rem,calc(100dvh-17rem))] min-w-[280px] flex-1 flex-col rounded-lg border ${highlighted ? 'border-primary' : 'border-line'}`}
    >
      <h2
        id={`stage-${stage}`}
        className="flex shrink-0 items-center justify-between gap-2 px-4 py-4 text-sm font-semibold"
      >
        {t(STAGE_LABEL[stage])}
        <span className="bg-surface text-ink-muted min-w-6 rounded-sm px-1.5 py-0.5 text-center text-xs font-medium">
          {count}
        </span>
      </h2>
      <div
        ref={setNodeRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-y-contain px-3 pt-1 pb-4"
      >
        {children}
      </div>
    </section>
  );
}

function InsertionMarker() {
  return (
    <div
      aria-hidden
      className="bg-primary pointer-events-none absolute -top-2 right-0 left-0 z-10 h-1 rounded-full"
    />
  );
}
