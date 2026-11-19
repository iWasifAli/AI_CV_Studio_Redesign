import { describe, expect, it } from 'vitest';
import { driver } from '@/modules/resume/fixtures';
import type { ExperienceItem, ResumeDocument } from '@/modules/resume/schema';
import {
  applyKeywordPatches,
  checkKeywordRewrite,
  keywordFields,
  keywordSelection,
} from './keyword-rewrite';

function fixture() {
  const doc = structuredClone(driver);
  doc.basics.summary = 'Delivery professional focused on reliable service.';
  const section = doc.sections.find((s) => s.kind === 'experience')!;
  const item = section.items[0] as ExperienceItem;
  item.bullets = ['Planned daily delivery routes', 'Reduced defects by 20%, costs by 5%'];
  doc.sections.push({
    id: 'projects',
    kind: 'projects',
    title: 'Projects',
    hidden: false,
    items: [
      {
        id: 'project',
        name: 'Delivery improvement',
        role: '',
        link: '',
        start: '',
        end: '',
        bullets: ['Reviewed delivery schedules'],
      },
    ],
  });
  return {
    doc,
    target: `${section.id}/${item.id}/bullets/0`,
    metric: `${section.id}/${item.id}/bullets/1`,
  };
}

describe('keyword rewrite validation', () => {
  it('normalizes explicit confirmations and bounds the selection', () => {
    expect(keywordSelection.parse([' Cold chain ', 'cold CHAIN', 'Forklift'])).toEqual([
      'Cold chain',
      'Forklift',
    ]);
    for (const value of [[], [' '], ['x'.repeat(61)], Array(26).fill('word')])
      expect(keywordSelection.safeParse(value).success).toBe(false);
  });

  it('offers the profile and visible work/project bullets, with exact original text', () => {
    const { doc, target } = fixture();
    const fields = keywordFields(doc);
    expect(fields.find((f) => f.target === target)).toMatchObject({
      before: 'Planned daily delivery routes',
      max: 600,
    });
    expect(fields.some((f) => f.target === 'projects/project/bullets/0')).toBe(true);
    expect(fields.some((f) => /organization|role|headline|keywords/.test(f.target))).toBe(false);
    doc.sections.find((s) => s.id === 'projects')!.hidden = true;
    expect(keywordFields(doc).some((f) => f.target.startsWith('projects/'))).toBe(false);
    doc.basics.summary = '';
    expect(keywordFields(doc).find((f) => f.target === 'basics.summary')?.before).toBe('');
  });

  it('validates a multi-passage batch and applies it without changing other content', () => {
    const { doc, target } = fixture();
    const result = checkKeywordRewrite(doc, ['Cold chain', 'Route optimisation', 'Forklift'], {
      changes: [
        {
          target: 'basics.summary',
          after: `${doc.basics.summary} Skills include Cold chain.`,
          keywords: ['Cold chain'],
        },
        {
          target,
          after: 'Planned daily delivery routes using Route optimisation',
          keywords: ['Route optimisation'],
        },
      ],
      skipped: [{ term: 'Forklift', reason: 'No natural place in the current text.' }],
    });
    expect(result.patches).toHaveLength(2);
    expect(result.included).toEqual(['Cold chain', 'Route optimisation']);
    expect(result.skipped).toEqual([
      { term: 'Forklift', reason: 'No natural place in the current text.' },
    ]);
    const next = applyKeywordPatches(doc, result.patches);
    expect(next.basics.summary).toContain('Cold chain');
    expect(
      (next.sections.find((s) => s.kind === 'experience')!.items[0] as ExperienceItem).bullets[0],
    ).toContain('Route optimisation');
    expect({ ...next, basics: doc.basics, sections: doc.sections }).toEqual(doc);
    expect(next.sections.map((s) => s.id)).toEqual(doc.sections.map((s) => s.id));
    expect(doc.basics.summary).not.toContain('Cold chain');
  });

  it('can populate an empty profile from confirmed skills without creating sections', () => {
    const { doc } = fixture();
    doc.role = 'profile';
    doc.basics.summary = '';
    const r = checkKeywordRewrite(doc, ['Cold chain'], {
      changes: [
        { target: 'basics.summary', after: 'Skills include Cold chain.', keywords: ['Cold chain'] },
      ],
      skipped: [],
    });
    expect(applyKeywordPatches(doc, r.patches).basics.summary).toBe('Skills include Cold chain.');
    expect(applyKeywordPatches(doc, r.patches).role).toBe('profile');
  });

  it('drops duplicate/hidden/unknown targets, unconfirmed terms, noops and oversized rewrites', () => {
    const { doc, target } = fixture();
    const raw = (t: string, after: string, keywords = ['Cold chain']) => ({
      target: t,
      after,
      keywords,
    });
    doc.sections.find((s) => s.id === 'projects')!.hidden = true;
    for (const changes of [
      [raw(target, 'Cold chain deliveries'), raw(target, 'Cold chain planning')],
      [raw('basics.headline', 'Cold chain professional')],
      [raw('projects/project/bullets/0', 'Cold chain schedules')],
      [raw(target, 'Planned daily delivery routes')],
      [raw(target, `Cold chain ${'a'.repeat(600)}`)],
      [raw(target, 'Cold chain deliveries', ['Unconfirmed'])],
      [raw(target, 'Planned daily delivery routes for {{?a real employer}} Cold chain')],
    ]) {
      const r = checkKeywordRewrite(doc, ['Cold chain'], { changes, skipped: [] });
      expect(r.patches).toEqual([]);
      expect(r.included).toEqual([]);
      expect(r.skipped.map((s) => s.term)).toEqual(['Cold chain']);
    }
  });

  it('protects factual associations and cannot borrow facts from another bullet', () => {
    const { doc, target, metric } = fixture();
    for (const change of [
      {
        target: metric,
        after: 'Reduced defects by 5%, costs by 20% using Cold chain',
        keywords: ['Cold chain'],
      },
      {
        target,
        after: 'Planned daily delivery routes with 20% lower costs using Cold chain',
        keywords: ['Cold chain'],
      },
      {
        target,
        after: 'Planned daily delivery routes at Amazon using Cold chain',
        keywords: ['Cold chain'],
      },
      { target, after: 'Certified in Cold chain deliveries', keywords: ['Cold chain'] },
    ])
      expect(
        checkKeywordRewrite(doc, ['Cold chain'], { changes: [change], skipped: [] }).patches,
      ).toEqual([]);
    const safe = checkKeywordRewrite(doc, ['Cost optimisation'], {
      changes: [
        {
          target: metric,
          after: 'Reduced defects by 20%, costs by 5% using Cost optimisation',
          keywords: ['Cost optimisation'],
        },
      ],
      skipped: [],
    });
    expect(safe.patches).toHaveLength(1);
  });

  it('makes a whole batch a no-op if one original target changed or disappeared', () => {
    const { doc, target } = fixture();
    const r = checkKeywordRewrite(doc, ['Cold chain', 'Route optimisation'], {
      changes: [
        {
          target: 'basics.summary',
          after: `${doc.basics.summary} Skills include Cold chain.`,
          keywords: ['Cold chain'],
        },
        {
          target,
          after: 'Planned daily delivery routes using Route optimisation',
          keywords: ['Route optimisation'],
        },
      ],
      skipped: [],
    });
    expect(r.patches).toHaveLength(2);
    const changed = structuredClone(doc);
    (changed.sections.find((s) => s.kind === 'experience')!.items[0] as ExperienceItem).bullets[0] =
      'Newer personal edit';
    expect(applyKeywordPatches(changed, r.patches)).toBe(changed);
    const removed: ResumeDocument = { ...doc, sections: [] };
    expect(applyKeywordPatches(removed, r.patches)).toBe(removed);
    const invalid = [...r.patches, { ...r.patches[0]!, target: 'basics.email' }];
    expect(applyKeywordPatches(doc, invalid)).toBe(doc);
  });

  it('reports actual coverage and keeps safe patches when another is rejected', () => {
    const { doc, target } = fixture();
    const r = checkKeywordRewrite(doc, ['Cold chain', 'Forklift'], {
      changes: [
        {
          target: 'basics.summary',
          after: `${doc.basics.summary} Skills include Cold chain.`,
          keywords: ['Cold chain'],
        },
        { target, after: 'Planned 500 daily deliveries using Forklift', keywords: ['Forklift'] },
      ],
      skipped: [],
    });
    expect(r.patches).toHaveLength(1);
    expect(r.included).toEqual(['Cold chain']);
    expect(r.skipped[0]?.term).toBe('Forklift');
  });
});

describe('keyword rewrite review regressions', () => {
  it('does not reuse old metrics or ordinary words to invent another achievement', () => {
    const { doc } = fixture();
    doc.basics.summary = 'Reduced defects by 20%, costs by 5%';
    for (const addition of [
      '. Increased sales by 20% using Forklift.',
      '. Increased sales using Forklift.',
      '. Reduced costs using Forklift.',
    ]) {
      const r = checkKeywordRewrite(doc, ['Forklift'], {
        changes: [
          {
            target: 'basics.summary',
            after: doc.basics.summary + addition,
            keywords: ['Forklift'],
          },
        ],
        skipped: [],
      });
      expect(r.patches).toEqual([]);
    }
  });
  it('keeps a confirmed new skill in the profile when the selected role has no evidence of it', () => {
    const { doc, target } = fixture();
    expect(
      checkKeywordRewrite(doc, ['Forklift'], {
        changes: [
          { target, after: 'Planned daily delivery routes using Forklift', keywords: ['Forklift'] },
        ],
        skipped: [],
      }).patches,
    ).toEqual([]);
  });
});
