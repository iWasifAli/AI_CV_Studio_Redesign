import { describe, expect, it } from 'vitest';
import { FIXTURES } from '@/modules/resume/fixtures';
import type { ResumeDocument } from '@/modules/resume/schema';
import { addCareerBreak, findGaps, gapLength, plainWording } from './gaps';

const NOW = new Date('2026-11-15T00:00:00Z');
const job = (id: string, start: string, end: string, current = false) => ({
  id,
  role: `Role ${id}`,
  organization: `Org ${id}`,
  location: '',
  start,
  end,
  current,
  bullets: ['Did things'],
});
function cv(items: ReturnType<typeof job>[]): ResumeDocument {
  const d = structuredClone(FIXTURES.driver) as ResumeDocument;
  d.sections = [
    { id: 'exp', kind: 'experience', title: 'Experience', hidden: false, items },
  ] as ResumeDocument['sections'];
  return d;
}

describe('gaps', () => {
  it('finds breaks over six months, newest first, ignoring overlaps', () => {
    const d = cv([
      job('c', '2024-03', '', true),
      job('b', '2019-01', '2022-06'),
      job('x', '2020-01', '2020-05'), // inside b: covers nothing new
      job('a', '2015-01', '2018-03'),
    ]);
    const gaps = findGaps(d, NOW);
    expect(gaps.map((g) => [g.from, g.to, g.months])).toEqual([
      ['2022-07', '2024-02', 20],
      ['2018-04', '2018-12', 9],
    ]);
    expect(gaps[0]!.after).toBe('Role b at Org b');
    expect(gaps[0]!.before).toBe('Role c at Org c');
  });

  it('ignores short breaks and counts a break that runs until now', () => {
    const d = cv([job('b', '2023-01', '2025-12'), job('a', '2020-01', '2022-09')]);
    const gaps = findGaps(d, NOW);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ from: '2026-01', to: '', key: '2026-01..now' });
    expect(gaps[0]!.months).toBe(10);
  });

  it('years without months are read generously', () => {
    expect(
      findGaps(
        cv([job('b', '2020', '2022', false), job('a', '2018', '2019')]),
        new Date('2022-12-01'),
      ),
    ).toEqual([]);
  });

  it('words the length and a plain line; health details stay out', () => {
    expect(gapLength(8)).toBe('about 8 months');
    expect(gapLength(26)).toBe('about 2 years');
    expect(plainWording('caring', 'looked after my mother.')).toBe(
      'Career break to care for a family member: looked after my mother',
    );
    expect(plainWording('health', 'surgery')).not.toMatch(/surgery/);
  });

  it('adds a career break among the jobs by date', () => {
    const d = cv([job('c', '2024-03', '', true), job('a', '2015-01', '2022-06')]);
    const g = findGaps(d, NOW)[0]!;
    const next = addCareerBreak(d, g, 'Career break to care for a family member', 'cb1')!;
    const items = next.sections[0]!.items as { id: string; role: string; start: string }[];
    expect(items.map((i) => i.id)).toEqual(['c', 'cb1', 'a']);
    expect(items[1]).toMatchObject({ role: 'Career break', start: '2022-07' });
    expect(findGaps(next, NOW)).toEqual([]);
  });
});
