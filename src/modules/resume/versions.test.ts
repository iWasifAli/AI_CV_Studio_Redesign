import { afterEach, describe, expect, it, vi } from 'vitest';
import { driver } from '@/modules/resume/fixtures';
import { MemoryUserStore } from '@/modules/store/memory';
import { AUTO_VERSION_EVERY_MS, MAX_NAMED_VERSIONS, MAX_VERSIONS } from '@/modules/store/types';
import { ops } from './ops';
import type { ResumeDocument } from './schema';
import { cleanVersionName, diffDocs, itemName, versionMeta } from './versions';

const at = (d: ResumeDocument, iso: string) => ({ ...d, updatedAt: iso });

describe('CV versions: when they are kept', () => {
  afterEach(() => vi.useRealTimers());

  it('one automatic version per editing session, not one per autosave', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-15T09:00:00Z') });
    const s = new MemoryUserStore();
    await s.putDoc('u', at(driver, '2026-11-15T09:00:00.000Z'), 10);
    // A burst of autosaves: only the CV as it was before the first one is kept.
    for (let i = 1; i <= 20; i++) {
      vi.setSystemTime(new Date(Date.UTC(2026, 10, 15, 9, 0, i * 5)));
      await s.putDoc(
        'u',
        {
          ...at(driver, `2026-11-15T09:00:${String(i * 2).padStart(2, '0')}.000Z`),
          title: `Edit ${i}`,
        },
        10,
      );
    }
    let v = await s.listVersions('u', driver.id);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: 'auto', doc: { title: driver.title } });
    // After a quiet spell, the next session starts with a new version of the CV as it was.
    vi.setSystemTime(Date.now() + AUTO_VERSION_EVERY_MS);
    await s.putDoc('u', { ...at(driver, '2026-11-15T10:00:00.000Z'), title: 'Next session' }, 10);
    v = await s.listVersions('u', driver.id);
    expect(v.map((x) => x.doc.title)).toEqual(['Edit 20', driver.title]);
  });

  it('named and before-restore versions; the named limit; pruning keeps named ones', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-15T09:00:00Z') });
    const s = new MemoryUserStore();
    await s.putDoc('u', driver, 10);
    const named = await s.addVersion('u', driver.id, {
      kind: 'named',
      name: 'Before Acme',
      doc: driver,
    });
    expect(named).toMatchObject({ kind: 'named', name: 'Before Acme' });
    for (let i = 1; i < MAX_NAMED_VERSIONS; i++)
      await s.addVersion('u', driver.id, { kind: 'named', name: `N${i}`, doc: driver });
    expect(
      await s.addVersion('u', driver.id, { kind: 'named', name: 'one more', doc: driver }),
    ).toBe('limit');
    // Lots of automatic and restore versions push out the oldest automatic ones only.
    for (let i = 0; i < MAX_VERSIONS + 5; i++)
      await s.addVersion('u', driver.id, { kind: 'restore', name: `R${i}`, doc: driver });
    const all = await s.listVersions('u', driver.id);
    expect(all.filter((x) => x.kind === 'named')).toHaveLength(MAX_NAMED_VERSIONS);
    expect(all.filter((x) => x.kind !== 'named')).toHaveLength(MAX_VERSIONS);
    const id = (named as { id: string }).id;
    expect(await s.renameVersion('u', driver.id, id, 'Renamed')).toBe(true);
    expect((await s.getVersion('u', driver.id, id))?.name).toBe('Renamed');
    const restoreId = all.find((x) => x.kind === 'restore')!.id;
    expect(await s.renameVersion('u', driver.id, restoreId, 'x')).toBe(false);
    expect(await s.deleteVersion('u', driver.id, id)).toBe(true);
    expect(await s.getVersion('u', driver.id, id)).toBeNull();
    // Another account sees nothing; deleting the CV deletes its versions.
    expect(await s.listVersions('other', driver.id)).toEqual([]);
    await s.deleteDoc('u', driver.id, '2026-11-16T00:00:00.000Z');
    expect(await s.listVersions('u', driver.id)).toEqual([]);
  });

  it('names are plain text, one line, at most 60 characters', () => {
    expect(cleanVersionName('  Before\nAcme‮  ')).toBe('Before Acme');
    expect(cleanVersionName('x'.repeat(80))).toHaveLength(60);
    expect(cleanVersionName(42)).toBe('');
  });

  it('the list shows the label, title and design without the CV', () => {
    expect(versionMeta({ id: 'v1', savedAt: 's', kind: 'auto', doc: driver })).toEqual({
      id: 'v1',
      savedAt: 's',
      kind: 'auto',
      title: driver.title,
      design: 'Clarity',
    });
  });
});

describe('CV versions: what changed', () => {
  const job = driver.sections.find((s) => s.kind === 'experience')!;
  const first = job.items[0] as { id: string; role: string; bullets: string[] };

  it('the same CV has no changes', () => {
    expect(diffDocs(driver, structuredClone(driver))).toEqual([]);
  });

  it('lists details, entries, points, sections, order and design in words', () => {
    let d = ops.updateBasics(driver, { headline: 'Senior Driver' });
    d = ops.updateItem(d, job.id, first.id, {
      role: 'HGV Driver',
      bullets: [...first.bullets.slice(1), 'Trained two new drivers'],
    });
    d = ops.setDesign(d, { templateId: 'ledger', accent: '#7a1f1f' });
    d = { ...d, sections: [...d.sections].reverse() };
    const c = diffDocs(driver, d);
    const where = `${job.title} › HGV Driver, ${(first as unknown as { organization: string }).organization}`;
    expect(c).toEqual(
      expect.arrayContaining([
        {
          where: 'Your details',
          kind: 'changed',
          what: 'Job title you want',
          before: driver.basics.headline,
          after: 'Senior Driver',
        },
        { where, kind: 'changed', what: 'Job title', before: first.role, after: 'HGV Driver' },
        { where, kind: 'removed', what: 'a point', before: first.bullets[0] },
        { where, kind: 'added', what: 'a point', after: 'Trained two new drivers' },
        { where: 'Sections', kind: 'changed', what: 'Order of sections' },
        { where: 'Design', kind: 'changed', before: 'Clarity', after: 'Ledger' },
        {
          where: 'Design',
          kind: 'changed',
          what: 'Colour',
          before: driver.design.accent,
          after: '#7a1f1f',
        },
      ]),
    );
  });

  it('added and removed sections and entries; hidden sections', () => {
    const removed = { ...driver, sections: driver.sections.filter((s) => s.id !== job.id) };
    expect(diffDocs(driver, removed)).toContainEqual({
      where: job.title,
      kind: 'removed',
      what: 'Section',
    });
    expect(diffDocs(removed, driver)).toContainEqual({
      where: job.title,
      kind: 'added',
      what: 'Section',
    });
    const hidden = {
      ...driver,
      sections: driver.sections.map((s) => (s.id === job.id ? { ...s, hidden: true } : s)),
    };
    expect(diffDocs(driver, hidden)).toContainEqual({
      where: job.title,
      kind: 'changed',
      what: 'Hidden',
    });
    const fewer = ops.removeItem(driver, job.id, first.id);
    expect(diffDocs(driver, fewer)).toContainEqual(
      expect.objectContaining({ kind: 'removed', what: 'Entry' }),
    );
  });

  it('names entries from their main fields', () => {
    expect(itemName({ id: 'x', qualification: 'BSc', institution: 'NUST' })).toBe('BSc, NUST');
    expect(itemName({ id: 'x' })).toBe('An entry');
  });
});
