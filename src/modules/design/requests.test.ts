import { describe, expect, it } from 'vitest';
import { FIXTURES } from '@/modules/resume/fixtures';
import { candidateSpecs } from './designer';
import { requestsIn } from './requests';
import { toFlat } from './vocab';

// The gap audit's live test (G-01), word for word.
const ASK =
  'Three columns: a narrow left rail with skills, a wide middle column for experience, and a narrow right rail with education and certifications. Dark green header band with my name in capitals, square bullets, skill bars, numbered section headings, cream paper, dates on the left.';

describe('AI Designer accountability (gap audit G-01)', () => {
  it('reads the requests the vocabulary can express', () => {
    const labels = requestsIn(ASK).map((a) => a.label);
    for (const want of [
      'square bullets',
      'numbered headings',
      'dates on the left',
      'skill bars',
      'cream paper',
      'name in capitals',
      'a header band',
      'skills on the left',
      'education on the right',
      'certifications on the right',
    ])
      expect(labels).toContain(want);
  });

  it('applies what the model dropped and names what cannot be done', () => {
    const doc = FIXTURES.engineer;
    // What the model returned in the audit: three columns, band, capitals, cream, green, but
    // round bullets, rule-after headings, dates on the right, nothing about education.
    const [c] = candidateSpecs(
      [
        {
          name: 'Precision Rails',
          explanation: 'Three columns with a green band.',
          startFrom: 'mosaic',
          choices: {
            layout: 'rails',
            header: 'band',
            nameCase: 'upper',
            paper: 'cream',
            accent: '#1f6f4a',
            sideSections: ['skills'],
            thirdSections: ['certifications'],
            bullets: 'disc',
            headings: 'rule-after',
            entries: 'dates-right',
          },
          unmet: ['Skill bars need skill levels.'],
        },
      ],
      doc.design,
      { description: ASK, doc },
    );
    const f = toFlat(c!.spec) as Record<string, unknown>;
    expect(f.bullets).toBe('square');
    expect(f.headings).toBe('numbered');
    expect(f.entries).toBe('dates-left');
    expect(c!.done).toEqual(
      expect.arrayContaining(['square bullets', 'numbered headings', 'dates on the left']),
    );
    // Education can't go in a narrow rail: said so, with the reason.
    expect(c!.unmet.join(' ')).toMatch(/Education stays in the main column/);
    // Skill bars: the model's own note is kept, not repeated.
    expect(c!.unmet.filter((u) => /bars/i.test(u))).toHaveLength(1);
  });

  it('adds nothing when there is no description', () => {
    const doc = FIXTURES.engineer;
    const [c] = candidateSpecs(
      [{ name: 'A', explanation: '', startFrom: 'clarity', choices: {}, unmet: [] }],
      doc.design,
    );
    expect(c!.done).toEqual([]);
    expect(c!.unmet).toEqual([]);
  });
});
