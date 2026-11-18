import { describe, expect, it } from 'vitest';
import * as F from '@/modules/resume/fixtures';
import { ops } from './ops';
import type { ResumeDocument } from './schema';

const cv = () => structuredClone(F.FIXTURES.engineer) as ResumeDocument;
const all = (d: ResumeDocument) =>
  d.sections.flatMap((s) => (s.kind === 'skills' ? s.items.flatMap((g) => g.keywords) : []));

describe('ops.addKeywords', () => {
  it('adds new words to the skills section and skips ones already there', () => {
    const d = cv();
    const before = all(d);
    const out = ops.addKeywords(d, ['Zebra handling', ' zebra HANDLING ', before[0] ?? 'x', '']);
    const after = all(out);
    expect(after.filter((k) => k.toLowerCase() === 'zebra handling')).toHaveLength(1);
    expect(after.length).toBe(before.length + 1 + (before[0] ? 0 : 1));
  });
  it('creates a skills section when there is none', () => {
    const d = cv();
    d.sections = d.sections.filter((s) => s.kind !== 'skills');
    const out = ops.addKeywords(d, ['Forklift', 'Inventory']);
    expect(all(out)).toEqual(['Forklift', 'Inventory']);
  });
  it('un-hides a hidden skills section and leaves the rest alone', () => {
    const d = cv();
    d.sections = d.sections.map((s) => (s.kind === 'skills' ? { ...s, hidden: true } : s));
    const out = ops.addKeywords(d, ['Zebra handling']);
    expect(out.sections.find((s) => s.kind === 'skills')?.hidden).toBe(false);
    expect(out.sections.filter((s) => s.kind !== 'skills')).toEqual(
      d.sections.filter((s) => s.kind !== 'skills'),
    );
  });
  it('does nothing when every word is already present', () => {
    const d = cv();
    expect(ops.addKeywords(d, [])).toBe(d);
  });
});
