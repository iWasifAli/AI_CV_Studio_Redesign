import { describe, expect, it } from 'vitest';
import { numberStatus, productNumbers, revealBucket, withUse, type Activity } from './numbers';

const NOW = new Date('2026-11-15T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const get = (list: ReturnType<typeof productNumbers>, key: string) =>
  list.find((n) => n.key === key)!;

function acct(uid: string, startedDaysAgo: number, extra: Partial<Activity> = {}): Activity {
  const since = daysAgo(startedDaysAgo).slice(0, 10);
  return { uid, since, lastDay: since, weeks: [0], tools: {}, ...extra };
}

describe('withUse', () => {
  it('starts a record and marks the week and tool', () => {
    const a = withUse(null, 'u1', 'pdf', NOW);
    expect(a).toMatchObject({ uid: 'u1', since: '2026-11-15', lastDay: '2026-11-15', weeks: [0] });
    expect(a.tools.pdf).toBe('2026-11-15');
  });
  it('adds later weeks once and keeps them sorted', () => {
    let a = withUse(null, 'u1', null, new Date('2026-10-01T00:00:00Z'));
    a = withUse(a, 'u1', 'cv', new Date('2026-10-23T10:00:00Z')); // day 22 → week 3
    a = withUse(a, 'u1', 'jobs', new Date('2026-10-24T10:00:00Z'));
    expect(a.weeks).toEqual([0, 3]);
    expect(a.lastDay).toBe('2026-10-24');
    expect(Object.keys(a.tools).sort()).toEqual(['cv', 'jobs']);
  });
  it('does not change the record it was given', () => {
    const a = withUse(null, 'u1', null, NOW);
    const b = withUse(a, 'u1', 'cv', NOW);
    expect(a.tools).toEqual({});
    expect(b.tools.cv).toBeDefined();
  });
});

describe('revealBucket', () => {
  it('puts times in the right bucket', () => {
    expect(revealBucket(4_000)).toBe('makeover_ms_10');
    expect(revealBucket(19_999)).toBe('makeover_ms_20');
    expect(revealBucket(25_000)).toBe('makeover_ms_30');
    expect(revealBucket(45_000)).toBe('makeover_ms_60');
    expect(revealBucket(90_000)).toBe('makeover_ms_more');
  });
});

describe('productNumbers', () => {
  it('has nine numbers with the plan’s targets', () => {
    const list = productNumbers({}, [], NOW);
    expect(list.map((n) => n.key)).toEqual([
      'makeoverCompletion',
      'timeToReveal',
      'revealToAccount',
      'revealToDownload',
      'designerMatch',
      'designerToPremium',
      'toolsPerUser',
      'week4Return',
      'freeToPremium',
    ]);
    expect(list.map((n) => n.target)).toEqual([0.9, 30, 0.35, 0.5, 0.6, 0.08, 3, 0.25, 0.04]);
    expect(list.every((n) => numberStatus(n) === 'few')).toBe(true);
  });

  it('computes the counter-based numbers', () => {
    const list = productNumbers(
      {
        makeover_start: 20,
        makeover_reveal: 18,
        makeover_preview: 10,
        makeover_saved_visitor: 4,
        makeover_download_24h: 9,
        design_compose: 10,
        designer_first_replaced: 3,
        makeover_ms_10: 5,
        makeover_ms_20: 8,
        makeover_ms_30: 4,
        makeover_ms_more: 1,
      },
      [],
      NOW,
    );
    expect(get(list, 'makeoverCompletion').value).toBeCloseTo(0.9);
    expect(numberStatus(get(list, 'makeoverCompletion'))).toBe('ok');
    expect(get(list, 'revealToAccount').value).toBeCloseTo(0.4);
    expect(get(list, 'revealToDownload').value).toBeCloseTo(0.5);
    expect(get(list, 'designerMatch').value).toBeCloseTo(0.7);
    // 18 timed: the 9th falls in the "under 20 s" bucket.
    expect(get(list, 'timeToReveal').value).toBe(20);
    expect(numberStatus(get(list, 'timeToReveal'))).toBe('ok');
  });

  it('marks a slow median as below target', () => {
    const list = productNumbers({ makeover_ms_60: 6, makeover_ms_10: 2 }, [], NOW);
    expect(get(list, 'timeToReveal').value).toBe(60);
    expect(numberStatus(get(list, 'timeToReveal'))).toBe('below');
  });

  it('computes the account cohorts', () => {
    const acts: Activity[] = [
      // Started 40 days ago, back in week 4 (week index 3), bought on day 10.
      acct('a', 40, { weeks: [0, 3], lastDay: daysAgo(15).slice(0, 10), premiumAt: daysAgo(30) }),
      // Started 35 days ago, never came back.
      acct('b', 35),
      // Started 50 days ago, back in week 2 only; bought after 40 days (too late).
      acct('c', 50, { weeks: [0, 1], premiumAt: daysAgo(10) }),
      // Started 10 days ago: too new for week 4 or the 30-day number.
      acct('d', 10, {
        lastDay: daysAgo(1).slice(0, 10),
        tools: {
          cv: daysAgo(1).slice(0, 10),
          pdf: daysAgo(2).slice(0, 10),
          jobs: daysAgo(3).slice(0, 10),
        },
      }),
    ];
    const list = productNumbers({}, acts, NOW);
    const w4 = get(list, 'week4Return');
    expect(w4.base).toBe(3);
    expect(w4.value).toBeCloseTo(1 / 3);
    const fp = get(list, 'freeToPremium');
    expect(fp.base).toBe(3);
    expect(fp.value).toBeCloseTo(1 / 3);
    // Active in the last 30 days: a (lastDay 15 days ago, no tools) and d (3 tools).
    const tools = get(list, 'toolsPerUser');
    expect(tools.base).toBe(2);
    expect(tools.value).toBeCloseTo(1.5);
  });

  it('counts designer → Premium only within 7 days of the free try', () => {
    const acts: Activity[] = [
      acct('a', 60, { freeComposeAt: daysAgo(20), premiumAt: daysAgo(17) }),
      acct('b', 60, { freeComposeAt: daysAgo(20), premiumAt: daysAgo(5) }),
      acct('c', 60, { freeComposeAt: daysAgo(20) }),
      acct('d', 60, { freeComposeAt: daysAgo(3) }), // too recent to judge
    ];
    const n = get(productNumbers({}, acts, NOW), 'designerToPremium');
    expect(n.base).toBe(3);
    expect(n.value).toBeCloseTo(1 / 3);
  });
});
