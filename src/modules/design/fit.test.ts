import { describe, expect, it } from 'vitest';
import { FIXTURES } from '@/modules/resume/fixtures';
import type { ResumeDocument } from '@/modules/resume/schema';
import { cutSuggestions, meetsTarget } from './fit';

const exp = (id: string, end: string, bullets: number) => ({
  id,
  role: `Role ${id}`,
  organization: `Org ${id}`,
  location: '',
  start: '2000',
  end,
  current: false,
  bullets: Array.from({ length: bullets }, (_, i) => `Point ${i + 1}`),
});

describe('fit to pages', () => {
  it('meets the target', () => {
    expect(meetsTarget(2, 1)).toBe(false);
    expect(meetsTarget(2, 2)).toBe(true);
    expect(meetsTarget(9, 0)).toBe(true);
  });

  it('suggests trimming long jobs; applying keeps the first points only', () => {
    const cuts = cutSuggestions(FIXTURES.extreme);
    const trim = cuts.find((c) => c.label.startsWith('Keep the first 6 of 12 points'))!;
    expect(trim).toBeDefined();
    const after = trim.apply!(FIXTURES.extreme);
    const items = after.sections[0]!.items as { bullets: string[] }[];
    expect(items[0]!.bullets).toHaveLength(6);
    // The original is untouched.
    expect(
      (FIXTURES.extreme.sections[0]!.items as { bullets: string[] }[])[0]!.bullets,
    ).toHaveLength(12);
  });

  it('suggests optional sections, old jobs and a long profile — nothing for a lean CV', () => {
    expect(cutSuggestions(FIXTURES.driver)).toEqual([]);
    const doc = structuredClone(FIXTURES.driver) as ResumeDocument;
    doc.basics.summary = 'x'.repeat(700);
    doc.sections = [
      {
        id: 'e',
        title: 'Experience',
        hidden: false,
        kind: 'experience',
        items: [exp('a', '2025', 2), exp('b', '2020', 2), exp('c', '2005', 5), exp('d', '1999', 1)],
      },
      {
        id: 'r',
        title: 'References',
        hidden: false,
        kind: 'references',
        items: [{ id: 'r1', name: 'A', role: '', organization: '', contact: '' }],
      },
    ] as ResumeDocument['sections'];
    const labels = cutSuggestions(doc).map((c) => c.label);
    expect(labels[0]).toBe('Leave out “References”');
    expect(labels).toContain('Keep the first 3 of 5 points for Role c at Org c');
    expect(labels).toContain('Leave out 2 jobs that ended more than 15 years ago');
    expect(labels.at(-1)).toMatch(/Shorten the profile/);
    const hidden = cutSuggestions(doc)[0]!.apply!(doc);
    expect(hidden.sections[1]!.hidden).toBe(true);
    const old = cutSuggestions(doc).find((c) => c.key === 'old-e')!.apply!(doc);
    expect(old.sections[0]!.items).toHaveLength(2);
  });
});
