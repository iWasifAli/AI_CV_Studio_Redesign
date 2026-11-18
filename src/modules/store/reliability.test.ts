import { describe, expect, it } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { MemoryUserStore } from './memory';
import { FirestoreUserStore } from './firestore';
import type { UserStore } from './types';
import { jobInput } from '@/modules/jobs/schema';
import { savedLetterInput } from '@/modules/letters/schema';

const job = (id = 'a') => ({
  ...jobInput.parse({ title: 'Driver' }),
  id,
  createdAt: 'now',
  updatedAt: 'now',
});
const letter = (id = 'a') => ({
  ...savedLetterInput.parse({ type: 'cover' }),
  id,
  createdAt: 'now',
  updatedAt: 'now',
});
const key = 'ac88ac13-c70f-4ea3-b7a2-efb7c9e76b86';
function contract(make: () => UserStore) {
  it.each(['jobs', 'letters'] as const)(
    '%s create is atomic, replayable and quota safe',
    async (kind) => {
      const s = make(),
        uid = crypto.randomUUID();
      const create = (id: string, fingerprint = 'payload', receipt = key) =>
        kind === 'jobs'
          ? s.createJob(uid, job(id), 1, { key: receipt, fingerprint })
          : s.createLetter(uid, letter(id), 1, { key: receipt, fingerprint });
      const results = await Promise.all([create('a'), create('b')]);
      expect(results[0]).toEqual(results[1]);
      expect(results[0]).toMatchObject({ ok: true, value: { revision: 1 } });
      if (!results[0]!.ok) throw new Error('Creation failed');
      const winner = results[0]!.value.id;
      expect(await create('c', 'different')).toMatchObject({ ok: false, reason: 'conflict' });
      expect(await create('c', 'payload', crypto.randomUUID())).toMatchObject({
        ok: false,
        reason: 'limit',
      });
      if (kind === 'jobs') {
        await s.updateJob(uid, winner, (cur) => ({ ...cur, notes: 'new' }));
        expect(await create('d')).toMatchObject({ ok: true, value: { notes: 'new', revision: 2 } });
        await s.deleteJob(uid, winner);
      } else {
        await s.updateLetter(uid, winner, (cur) => ({ ...cur, subject: 'new' }));
        expect(await create('d')).toMatchObject({
          ok: true,
          value: { subject: 'new', revision: 2 },
        });
        await s.deleteLetter(uid, winner);
      }
      expect(await create('e')).toMatchObject({ ok: false, reason: 'conflict' });
      await s.deleteUserData(uid);
      expect(await create('f')).toMatchObject({ ok: true });
      await s.deleteUserData(uid);
    },
    30_000,
  );
  it('allows only one concurrent conditional job/letter write and rejects forged revisions', async () => {
    const s = make(),
      uid = crypto.randomUUID();
    await s.putJob(uid, { ...job(), revision: 900 });
    await s.putLetter(uid, { ...letter(), revision: 900 });
    expect((await s.getJob(uid, 'a'))?.revision).toBe(1);
    for (const kind of ['job', 'letter']) {
      const writes = await Promise.allSettled(
        [1, 2].map((n) =>
          kind === 'job'
            ? s.updateJob(uid, 'a', (cur) => ({ ...cur, notes: String(n), revision: 900 }), 1)
            : s.updateLetter(uid, 'a', (cur) => ({ ...cur, subject: String(n), revision: 900 }), 1),
        ),
      );
      expect(writes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(writes.find((x) => x.status === 'rejected')).toMatchObject({
        reason: { current: { revision: 2 } },
      });
    }
    const editedJob = await s.updateJob(
      uid,
      'a',
      (current) => {
        current.revision = 900;
        return current;
      },
      2,
    );
    const editedLetter = await s.updateLetter(
      uid,
      'a',
      (current) => {
        current.revision = 900;
        return current;
      },
      2,
    );
    expect(editedJob?.revision).toBe(3);
    expect(editedLetter?.revision).toBe(3);
    await s.deleteJob(uid, 'a');
    await expect(s.updateJob(uid, 'a', (cur) => cur, 3)).rejects.toMatchObject({ current: null });
    await s.deleteUserData(uid);
  }, 30_000);
  it.each(['jobs', 'letters'] as const)(
    '%s quota also serializes independent legacy creates',
    async (kind) => {
      const s = make(),
        uid = crypto.randomUUID();
      const results = await Promise.all(
        ['a', 'b', 'c'].map((id) =>
          kind === 'jobs' ? s.createJob(uid, job(id), 1) : s.createLetter(uid, letter(id), 1),
        ),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok && r.reason === 'limit')).toHaveLength(2);
      await s.deleteUserData(uid);
    },
    30_000,
  );
  it('scopes receipts by account and operation', async () => {
    const s = make(),
      uid = crypto.randomUUID(),
      other = crypto.randomUUID();
    const receipt = { key, fingerprint: 'payload' };
    expect(await s.createJob(uid, job(), 1, receipt)).toMatchObject({ ok: true });
    expect(await s.createLetter(uid, letter(), 1, receipt)).toMatchObject({ ok: true });
    expect(await s.createJob(other, job(), 1, receipt)).toMatchObject({ ok: true });
    await s.deleteUserData(uid);
    await s.deleteUserData(other);
  }, 30_000);
  it('increments board stage/reminder writes but not order-only moves; stale deletes are fenced', async () => {
    const s = make(),
      uid = crypto.randomUUID();
    await s.putJob(uid, job());
    await s.putJob(uid, job('b'));
    const input = {
      jobId: 'a',
      fromStage: 'saved' as const,
      toStage: 'saved' as const,
      beforeId: null,
      revision: 0,
      expectedJobUpdatedAt: 'now',
      expectedRevision: 1,
    };
    const ordered = await s.moveJobOnBoard(uid, input, (cur) => cur);
    expect(ordered.job.revision).toBe(1);
    const moved = await s.moveJobOnBoard(
      uid,
      { ...input, toStage: 'applied', revision: ordered.board.revision },
      (cur) => ({ ...cur, stage: 'applied' }),
    );
    expect(moved.job.revision).toBe(2);
    await s.updateJob(uid, 'a', (cur) => ({ ...cur, reminders: [] }));
    expect((await s.getJob(uid, 'a'))?.revision).toBe(3);
    await expect(s.deleteJob(uid, 'a', 2)).rejects.toMatchObject({ current: { revision: 3 } });
    await expect(
      s.moveJobOnBoard(uid, { ...input, revision: moved.board.revision }, (cur) => cur),
    ).rejects.toMatchObject({ current: { revision: 3 } });
    await s.deleteUserData(uid);
  }, 30_000);
  it('retains a nullable Coach envelope across clears and rejects a late reply', async () => {
    const s = make(),
      uid = crypto.randomUUID();
    expect(await s.getCoachState(uid)).toEqual({ thread: null, revision: 0 });
    await s.putCoachThread(uid, { messages: [], updatedAt: 'now' });
    await s.deleteCoachThread(uid, 1);
    expect(await s.getCoachState(uid)).toEqual({ thread: null, revision: 2 });
    await expect(
      s.putCoachThread(uid, { messages: [], updatedAt: 'late' }, 1),
    ).rejects.toMatchObject({ current: { thread: null, revision: 2 } });
    await s.deleteUserData(uid);
  }, 30_000);
}
describe('workspace reliability memory', () => contract(() => new MemoryUserStore()));
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('workspace reliability Firestore', () =>
  contract(
    () =>
      new FirestoreUserStore(
        getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-aicv' })),
      ),
  ),
);

it('memory resolves the live bucket inside the account lock after a queued account deletion', async () => {
  const s = new MemoryUserStore();
  await s.putJob('u', job());
  let unlock!: () => void;
  let entered!: () => void;
  const held = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const editing = s.updateJob('u', 'a', async (current) => {
    entered();
    await held;
    return current;
  });
  await started;
  const deleting = s.deleteUserData('u');
  const creating = s.createJob('u', job('after'), 1);
  unlock();
  await Promise.all([editing, deleting]);
  expect(await creating).toMatchObject({ ok: true });
  expect(await s.getJob('u', 'after')).toMatchObject({ id: 'after', revision: 1 });
});
