import { describe, expect, it } from 'vitest';
import type { JobBoardState } from '@/modules/jobs/board';
import type { Job } from '@/modules/jobs/schema';
import {
  keyboardBoardPosition,
  createBoardRequestScope,
  makeBoardMove,
  previewBoardMove,
  reorderAnchor,
  reconcileBoardRefreshJobs,
} from './board-ui-state';

const jobs = [
  { id: 'a', stage: 'saved', updatedAt: '2026-11-18T10:00:00Z' },
  { id: 'b', stage: 'saved', updatedAt: '2026-11-18T11:00:00Z' },
  { id: 'c', stage: 'saved', updatedAt: '2026-11-18T12:00:00Z' },
  { id: 'd', stage: 'applied', updatedAt: '2026-11-18T13:00:00Z' },
] as Job[];
const board: JobBoardState = {
  revision: 7,
  columns: {
    saved: ['a', 'hidden', 'b', 'c'],
    applied: ['d'],
    interview: [],
    offer: [],
    closed: [],
  },
};

describe('board movement intent', () => {
  it('appends a stage selection with the confirmed revision and job timestamp', () => {
    expect(makeBoardMove(jobs, board, 'b', 'interview', null)).toEqual({
      jobId: 'b',
      fromStage: 'saved',
      toStage: 'interview',
      beforeId: null,
      revision: 7,
      expectedJobUpdatedAt: '2026-11-18T11:00:00Z',
    });
  });

  it('does not request unchanged positions, self drops, missing jobs or stale anchors', () => {
    expect(makeBoardMove(jobs, board, 'c', 'saved', null)).toBeNull();
    expect(makeBoardMove(jobs, board, 'a', 'saved', 'hidden')).toBeNull();
    expect(makeBoardMove(jobs, board, 'a', 'saved', 'b')).toBeNull();
    expect(makeBoardMove(jobs, board, 'a', 'saved', 'a')).toBeNull();
    expect(makeBoardMove(jobs, board, 'missing', 'offer', null)).toBeNull();
    expect(makeBoardMove(jobs, board, 'a', 'offer', 'd')).toBeNull();
  });

  it('keeps unobserved IDs and leaves confirmed data untouched during a preview', () => {
    const move = makeBoardMove(jobs, board, 'b', 'applied', 'd')!;
    const preview = previewBoardMove(jobs, board, move);
    expect(preview.board.columns.saved).toEqual(['a', 'hidden', 'c']);
    expect(preview.board.columns.applied).toEqual(['b', 'd']);
    expect(preview.jobs.find((job) => job.id === 'b')).toMatchObject({
      stage: 'applied',
      updatedAt: '2026-11-18T11:00:00Z',
    });
    expect(board.columns.saved).toEqual(['a', 'hidden', 'b', 'c']);
    expect(jobs[1]!.stage).toBe('saved');
    expect(preview.board.revision).toBe(7);
  });

  it('reorders without altering the job object or its history', () => {
    const move = makeBoardMove(jobs, board, 'c', 'saved', 'a')!;
    const preview = previewBoardMove(jobs, board, move);
    expect(preview.board.columns.saved).toEqual(['c', 'a', 'hidden', 'b']);
    expect(preview.jobs[2]).toBe(jobs[2]);
  });

  it('uses visible neighbors for up/down controls without deleting hidden IDs', () => {
    expect(reorderAnchor(['a', 'b', 'c'], 'b', 'up')).toBe('a');
    expect(reorderAnchor(['a', 'b', 'c'], 'a', 'down')).toBe('c');
    expect(reorderAnchor(['a', 'b', 'c'], 'b', 'down')).toBeNull();
    expect(reorderAnchor(['a', 'b', 'c'], 'a', 'up')).toBeUndefined();
    expect(reorderAnchor(['a', 'b', 'c'], 'c', 'down')).toBeUndefined();
    expect(reorderAnchor([], 'a', 'up')).toBeUndefined();
  });

  it('moves a keyboard insertion gap down and across empty columns', () => {
    const columns = { ...board.columns, saved: ['a', 'b', 'c'] };
    expect(
      keyboardBoardPosition(columns, 'a', { stage: 'saved', beforeId: 'b' }, 'ArrowDown'),
    ).toEqual({ stage: 'saved', beforeId: 'c' });
    expect(
      keyboardBoardPosition(columns, 'a', { stage: 'applied', beforeId: 'd' }, 'ArrowRight'),
    ).toEqual({ stage: 'interview', beforeId: null });
    expect(
      keyboardBoardPosition(columns, 'a', { stage: 'interview', beforeId: null }, 'ArrowLeft'),
    ).toEqual({ stage: 'applied', beforeId: 'd' });
    expect(
      keyboardBoardPosition(columns, 'a', { stage: 'saved', beforeId: 'b' }, 'ArrowUp'),
    ).toBeNull();
    expect(
      keyboardBoardPosition(columns, 'a', { stage: 'closed', beforeId: null }, 'ArrowRight'),
    ).toBeNull();
  });
});

describe('account board request lifetime', () => {
  it('invalidates every captured request when its account session ends', () => {
    const scope = createBoardRequestScope();
    scope.open();
    const load = scope.capture();
    const move = scope.capture();
    expect(load()).toBe(true);
    scope.close();
    expect(load()).toBe(false);
    expect(move()).toBe(false);
    expect(scope.capture()()).toBe(false);
  });

  it('does not revive old requests when a session reopens', () => {
    const scope = createBoardRequestScope();
    scope.open();
    const recovery = scope.capture();
    scope.close();
    scope.open();
    expect(recovery()).toBe(false);
    expect(scope.capture()()).toBe(true);
  });
});

describe('refresh reconciliation', () => {
  it('retains only additions made after the refresh started, without restoring deleted records', () => {
    const added = { ...jobs[0]!, id: 'new' };
    const updated = { ...jobs[1]!, notes: 'server wins' };
    const before = jobs.slice(0, 2);
    expect(reconcileBoardRefreshJobs([updated], before, [added, ...before])).toEqual([
      added,
      updated,
    ]);
  });

  it('uses the server record when a concurrent addition is already in the response', () => {
    const added = { ...jobs[0]!, id: 'new' };
    const saved = { ...added, notes: 'server version' };
    expect(reconcileBoardRefreshJobs([saved, ...jobs], jobs, [added, ...jobs])).toEqual([
      saved,
      ...jobs,
    ]);
  });
});
