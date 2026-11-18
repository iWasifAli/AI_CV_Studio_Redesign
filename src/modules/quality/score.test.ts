import { describe, expect, it } from 'vitest';
import * as F from '@/modules/resume/fixtures';
import type { ResumeDocument } from '@/modules/resume/schema';
import { applyStandard } from '@/modules/resume/standards';
import { scoreCv } from './score';

const cv = (k: keyof typeof F.FIXTURES = 'engineer') =>
  structuredClone(F.FIXTURES[k]) as ResumeDocument;

describe('scoreCv', () => {
  it('is deterministic and parts add up to the total', () => {
    const a = scoreCv(cv());
    expect(scoreCv(cv())).toEqual(a);
    expect(Math.round(a.parts.reduce((n, p) => n + p.points, 0))).toBe(a.total);
    expect(a.parts.reduce((n, p) => n + p.max, 0)).toBe(100);
    expect(a.total).toBeGreaterThanOrEqual(0);
    expect(a.total).toBeLessThanOrEqual(100);
  });
  it('an empty CV scores low and says what to add', () => {
    const d = cv();
    d.basics = { ...d.basics, name: '', email: '', phone: '', location: '', summary: '' };
    d.sections = [];
    const s = scoreCv(d);
    expect(s.total).toBeLessThan(50);
    expect(s.parts[0]!.why.length).toBeGreaterThan(3);
  });
  it('a complete fixture scores higher than an empty CV', () => {
    const empty = cv();
    empty.sections = [];
    empty.basics.summary = '';
    expect(scoreCv(cv()).total).toBeGreaterThan(scoreCv(empty).total);
  });
  it('personal details cost points under the UK standard but not the Gulf one', () => {
    const base = cv();
    base.basics.summary += ' Date of birth: 1 May 1990. Nationality: Pakistani.';
    const uk = scoreCv(applyStandard(base, 'uk')).parts.find((p) => p.id === 'fit')!;
    const gulf = scoreCv(applyStandard(base, 'gulf')).parts.find((p) => p.id === 'fit')!;
    expect(uk.why.join(' ')).toMatch(/personal details/i);
    expect(gulf.why.join(' ')).not.toMatch(/consider removing/i);
  });
  it('numbers in job lines raise the Results part', () => {
    const d = cv();
    for (const s of d.sections)
      if (s.kind === 'experience')
        for (const it of s.items) it.bullets = ['Did tasks', 'Helped team'];
    const low = scoreCv(d).parts.find((p) => p.id === 'results')!.points;
    for (const s of d.sections)
      if (s.kind === 'experience')
        for (const it of s.items) it.bullets = ['Cut costs 20%', 'Led 5 engineers'];
    expect(scoreCv(d).parts.find((p) => p.id === 'results')!.points).toBeGreaterThan(low);
  });
});
