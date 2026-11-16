import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryUserStore } from '@/modules/store/memory';
import {
  __setSender,
  flushUsage,
  newVisit,
  noteChosen,
  notePreviewed,
  noteShown,
} from '@/features/gallery/design-usage';
import { aggregate, popularity, summarise, type UsageNote } from './usage';

const mem = new Map<string, string>();
(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
} as Storage;

let sent: UsageNote[][] = [];
beforeEach(() => {
  sent = [];
  mem.clear();
  __setSender((events) => void sent.push(events));
});

describe('design usage (browser side): once per action', () => {
  it('a card is counted as shown once per visit, however often it scrolls into view', () => {
    noteShown('neon');
    noteShown('neon');
    noteShown('terra');
    flushUsage();
    expect(sent.flat()).toEqual([
      { id: 'neon', kind: 'shown' },
      { id: 'terra', kind: 'shown' },
    ]);
    newVisit();
    noteShown('neon');
    flushUsage();
    expect(sent.flat().filter((e) => e.id === 'neon')).toHaveLength(2);
  });

  it('choosing another design within 5 minutes counts the first as left quickly', () => {
    const t = 1_000_000;
    noteChosen('neon', undefined, t);
    noteChosen('terra', undefined, t + 60_000);
    noteChosen('clarity', undefined, t + 60_000 + 6 * 60_000); // after 6 minutes: not counted
    noteChosen('clarity', undefined, t + 60_000 + 7 * 60_000); // same design again: not counted
    flushUsage();
    expect(sent.flat()).toEqual([
      { id: 'neon', kind: 'chosen' },
      { id: 'neon', kind: 'switched' },
      { id: 'terra', kind: 'chosen' },
      { id: 'clarity', kind: 'chosen' },
      { id: 'clarity', kind: 'chosen' },
    ]);
  });

  it('notes go out in batches of at most 80', () => {
    for (let i = 0; i < 100; i++) notePreviewed('neon');
    flushUsage();
    expect(sent.map((b) => b.length)).toEqual([80, 20]);
  });
});

describe('design usage (server side)', () => {
  it('aggregates, drops unknown designs and events, and keeps themes apart', () => {
    const c = aggregate([
      { id: 'neon', kind: 'shown' },
      { id: 'neon', kind: 'chosen', theme: 'ocean' },
      { id: 'nope', kind: 'shown' },
      { id: 'neon', kind: 'bogus' as never },
    ]);
    expect(c).toEqual({ neon: { shown: 1, chosen: 1 }, 'neon@ocean': { chosen: 1 } });
  });

  it('30-day table sums days; popularity rewards keeping and downloading', async () => {
    const store = new MemoryUserStore();
    await store.bumpDesignUsage('2026-11-01', { neon: { chosen: 2, downloaded: 1 } });
    await store.bumpDesignUsage('2026-11-02', {
      neon: { chosen: 1, switched: 1 },
      terra: { shown: 4 },
    });
    const { rows } = summarise(await store.getDesignUsage('2026-11-01', '2026-11-30'));
    const neon = rows.find((r) => r.id === 'neon')!;
    expect(neon).toMatchObject({ chosen: 3, switchedAway: 1, downloaded: 1, shown: 0 });
    expect(rows.find((r) => r.id === 'terra')?.shown).toBe(4);
    expect(popularity(rows).neon).toBe(3 + 2 - 1);
    expect(popularity(rows).terra).toBe(0);
  });
});
