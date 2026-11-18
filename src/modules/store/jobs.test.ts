import { describe, expect, it } from 'vitest';
import { jobInput, type Job } from '@/modules/jobs/schema';
import type { JobBoardMove } from '@/modules/jobs/board';
import { MemoryUserStore } from './memory';

const job = (id = 'a'): Job => ({
  ...jobInput.parse({ title: id }),
  id,
  createdAt: '2026-11-18T10:00:00.000Z',
  updatedAt: '2026-11-18T10:00:00.000Z',
});
const move = (revision = 0): JobBoardMove => ({
  jobId: 'a',
  fromStage: 'saved',
  toStage: 'applied',
  beforeId: null,
  revision,
  expectedJobUpdatedAt: job().updatedAt,
});

describe('atomic job storage and board ordering', () => {
  it('merges overlapping scoped edits against the latest job', async () => {
    const s = new MemoryUserStore();
    await s.putJob('u', job());
    await Promise.all([
      s.updateJob('u', 'a', async (cur) => {
        await Promise.resolve();
        return { ...cur, stage: 'applied' };
      }),
      s.updateJob('u', 'a', (cur) => ({ ...cur, notes: 'new note' })),
    ]);
    expect(await s.getJob('u', 'a')).toMatchObject({ stage: 'applied', notes: 'new note' });
  });
  it('never resurrects deleted jobs or crosses account boundaries', async () => {
    const s = new MemoryUserStore();
    await s.putJob('u', job());
    await s.deleteJob('u', 'a');
    let called = false;
    expect(
      await s.updateJob('u', 'a', (cur) => {
        called = true;
        return cur;
      }),
    ).toBeNull();
    expect(called).toBe(false);
    await s.putJob('other', job());
    expect(await s.updateJob('u', 'a', (cur) => cur)).toBeNull();
    await expect(s.moveJobOnBoard('u', move(), (cur) => cur)).rejects.toThrow();
  });
  it('commits stage and order together and preserves a later scoped edit', async () => {
    const s = new MemoryUserStore();
    await s.putJob('u', job());
    await Promise.all([
      s.moveJobOnBoard('u', move(), async (cur) => {
        await Promise.resolve();
        return { ...cur, stage: 'applied' };
      }),
      s.updateJob('u', 'a', (cur) => ({ ...cur, notes: 'kept' })),
    ]);
    const result = await s.getJobBoard('u');
    expect(result.jobs[0]).toMatchObject({ stage: 'applied', notes: 'kept' });
    expect(result.board.columns.applied).toEqual(['a']);
    expect(result.board.revision).toBe(1);
  });
  it('order-only edits never run stage logic or change the job timestamp', async () => {
    const s = new MemoryUserStore();
    await s.putJob('u', job('a'));
    await s.putJob('u', job('b'));
    const before = await s.getJob('u', 'a');
    let called = false;
    await s.moveJobOnBoard('u', { ...move(), toStage: 'saved' }, (cur) => {
      called = true;
      return cur;
    });
    expect(called).toBe(false);
    expect(await s.getJob('u', 'a')).toEqual(before);
    expect((await s.getJobBoard('u')).board.columns.saved).toEqual(['b', 'a']);
  });
  it('a failed stage transformation commits neither job nor ordering', async () => {
    const s = new MemoryUserStore();
    await s.putJob('u', job());
    await expect(
      s.moveJobOnBoard('u', move(), () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    expect((await s.getJobBoard('u')).board.revision).toBe(0);
    expect((await s.getJob('u', 'a'))?.stage).toBe('saved');
  });
  it('conflicting moves do not both commit, and account deletion clears ordering', async () => {
    const s = new MemoryUserStore();
    await s.putJob('u', job());
    const results = await Promise.allSettled([
      s.moveJobOnBoard('u', move(), (cur) => ({ ...cur, stage: 'applied' })),
      s.moveJobOnBoard('u', move(), (cur) => ({ ...cur, stage: 'applied' })),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await s.deleteUserData('u');
    expect(await s.getJobBoard('u')).toMatchObject({ jobs: [], board: { revision: 0 } });
  });
});
