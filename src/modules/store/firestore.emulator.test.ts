import { describe, expect, it } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { driver } from '@/modules/resume/fixtures';
import { FirestoreUserStore } from './firestore';
import { MAX_VERSIONS } from './types';

/**
 * The Firestore store against the real emulator (`npm run test:store`, in CI). The in-memory
 * store used by every other test can't show Firestore's own behaviour — for example that
 * snapshot.get('ai.action') reads a path, not the field named "ai.action".
 */
const on = !!process.env.FIRESTORE_EMULATOR_HOST;
const store = () => {
  const app = getApps()[0] ?? initializeApp({ projectId: 'demo-aicv' });
  return new FirestoreUserStore(getFirestore(app));
};
const uid = () => `u-${Math.random().toString(36).slice(2)}`;

describe.skipIf(!on)('Firestore store (emulator)', () => {
  it('monthly counters with dotted names count up to the limit, by weight, and release', async () => {
    const s = store();
    const u = uid();
    expect(await s.reserveUsage(u, '2026-11', 'ai.action', 3, 1)).toBe(true);
    expect(await s.reserveUsage(u, '2026-11', 'ai.action', 3, 1)).toBe(true);
    expect(await s.reserveUsage(u, '2026-11', 'ai.action', 3, 2)).toBe(false);
    expect(await s.reserveUsage(u, '2026-11', 'ai.action', 3, 1)).toBe(true);
    expect(await s.reserveUsage(u, '2026-11', 'ai.action', 3, 1)).toBe(false);
    expect(await s.reserveUsage(u, '2026-11', 'pdf.download', -1, 1)).toBe(true);
    expect(await s.getUsage(u, '2026-11')).toEqual({ 'ai.action': 3, 'pdf.download': 1 });
    await s.releaseUsage(u, '2026-11', 'ai.action', 1);
    expect((await s.getUsage(u, '2026-11'))['ai.action']).toBe(2);
  });

  it('CV versions: one automatic per session, named kept, renamed, deleted, gone with the CV', async () => {
    const s = store();
    const u = uid();
    await s.putDoc(u, { ...driver, updatedAt: '2026-11-15T09:00:00.000Z' }, 10);
    await s.putDoc(u, { ...driver, updatedAt: '2026-11-15T09:00:01.000Z', title: 'A' }, 10);
    await s.putDoc(u, { ...driver, updatedAt: '2026-11-15T09:00:02.000Z', title: 'B' }, 10);
    let v = await s.listVersions(u, driver.id);
    expect(v.map((x) => [x.kind, x.doc.title])).toEqual([['auto', driver.title]]);
    const named = await s.addVersion(u, driver.id, { kind: 'named', name: 'Mine', doc: driver });
    expect(named).toMatchObject({ kind: 'named', name: 'Mine' });
    const id = (named as { id: string }).id;
    expect(await s.renameVersion(u, driver.id, id, 'Renamed')).toBe(true);
    expect((await s.getVersion(u, driver.id, id))?.name).toBe('Renamed');
    for (let i = 0; i < MAX_VERSIONS + 2; i++)
      await s.addVersion(u, driver.id, { kind: 'restore', name: `R${i}`, doc: driver });
    v = await s.listVersions(u, driver.id);
    expect(v.filter((x) => x.kind === 'named')).toHaveLength(1);
    expect(v.filter((x) => x.kind !== 'named')).toHaveLength(MAX_VERSIONS);
    expect(await s.deleteVersion(u, driver.id, id)).toBe(true);
    expect(await s.getVersion(u, driver.id, id)).toBeNull();
    await s.deleteDoc(u, driver.id, '2026-11-16T00:00:00.000Z');
    expect(await s.listVersions(u, driver.id)).toEqual([]);
  }, 30_000);
});
