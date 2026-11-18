import { describe, expect, it } from 'vitest';
import { jobInput, type Job } from './schema';
import { planJobMove, resolveJobBoard, type JobBoardMove, type JobBoardState } from './board';

const job = (id: string, patch: Partial<Job> = {}): Job => ({
  ...jobInput.parse({ title: id }),
  id,
  createdAt: '2026-11-18T10:00:00.000Z',
  updatedAt: '2026-11-18T10:00:00.000Z',
  ...patch,
});
const jobs = [job('a'), job('b'), job('c', { stage: 'applied' })];
const board = (): JobBoardState => ({
  revision: 4,
  columns: { saved: ['a', 'b'], applied: ['c'], interview: [], offer: [], closed: [] },
});
const move = (patch: Partial<JobBoardMove> = {}): JobBoardMove => ({
  jobId: 'a',
  fromStage: 'saved',
  toStage: 'applied',
  beforeId: 'c',
  revision: 4,
  expectedJobUpdatedAt: jobs[0]!.updatedAt,
  ...patch,
});

describe('job board reconciliation', () => {
  it('uses automatic ordering for legacy jobs without persisting anything', () => {
    const result = resolveJobBoard([job('older'), job('newer', { updatedAt: '2026-11-19' })]);
    expect(result.revision).toBe(0);
    expect(result.columns.saved).toEqual(['newer', 'older']);
  });
  it('preserves manual ordering on content edits and prepends new jobs', () => {
    const saved = board();
    expect(
      resolveJobBoard([job('b', { updatedAt: '2026-11-20' }), job('a'), job('new')], saved).columns
        .saved,
    ).toEqual(['new', 'a', 'b']);
    expect(saved.columns.saved).toEqual(['a', 'b']);
  });
  it('uses current stages, removes duplicate placements, and retains unobserved IDs', () => {
    const saved = board();
    saved.columns.saved = ['a', 'b', 'hidden'];
    saved.columns.applied = ['a', 'c', 'a'];
    const result = resolveJobBoard([job('a', { stage: 'applied' }), job('b'), jobs[2]!], saved);
    expect(result.columns.saved).toEqual(['b', 'hidden']);
    expect(result.columns.applied).toEqual(['a', 'c']);
  });
});

describe('job board move intent', () => {
  it('inserts before an anchor and advances the board revision exactly once', () => {
    const result = planJobMove(jobs, board(), move());
    expect(result.changed).toBe(true);
    expect(result.stageChanged).toBe(true);
    expect(result.board.columns.saved).toEqual(['b']);
    expect(result.board.columns.applied).toEqual(['a', 'c']);
    expect(result.board.revision).toBe(5);
    expect(jobs[0]!.stage).toBe('saved');
  });
  it('reorders within a column without a stage transition', () => {
    const result = planJobMove(jobs, board(), move({ toStage: 'saved', beforeId: null }));
    expect(result.board.columns.saved).toEqual(['b', 'a']);
    expect(result.stageChanged).toBe(false);
  });
  it('supports empty destinations and unchanged placement without writes', () => {
    expect(
      planJobMove(jobs, board(), move({ toStage: 'offer', beforeId: null })).board.columns.offer,
    ).toEqual(['a']);
    const unchanged = planJobMove(jobs, board(), move({ toStage: 'saved', beforeId: 'b' }));
    expect(unchanged.changed).toBe(false);
    expect(unchanged.board.revision).toBe(4);
    const legacy = planJobMove(
      [jobs[0]!],
      undefined,
      move({ revision: 0, toStage: 'saved', beforeId: null }),
    );
    expect(legacy.changed).toBe(false);
  });
  it.each([
    { revision: 3 },
    { fromStage: 'offer' },
    { expectedJobUpdatedAt: 'old' },
    { beforeId: 'missing' },
    { beforeId: 'b' },
  ] as Partial<JobBoardMove>[])('rejects stale or inconsistent moves: %j', (patch) => {
    expect(() => planJobMove(jobs, board(), move(patch))).toThrow();
  });
  it('rejects self-anchors and missing jobs', () => {
    expect(() => planJobMove(jobs, board(), move({ beforeId: 'a' }))).toThrow();
    expect(() => planJobMove(jobs, board(), move({ jobId: 'missing' }))).toThrow();
  });
});
