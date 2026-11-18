import { describe, expect, it } from 'vitest';
import { healthCheck } from '@/modules/quality/health';
import * as F from '@/modules/resume/fixtures';
import type { ResumeDocument } from './schema';
import { applyStandard, standardForMarket, standardGaps, standardOf } from './standards';

const cv = () => structuredClone(F.FIXTURES.engineer) as ResumeDocument;

describe('CV standards', () => {
  it('derives the standard from the country', () => {
    expect(standardForMarket('AE')?.id).toBe('gulf');
    expect(standardForMarket('PK')?.id).toBe('southasia');
    expect(standardForMarket('DE')?.id).toBe('europe');
    expect(standardForMarket('US')?.id).toBe('us');
    expect(standardForMarket('MY')).toBeUndefined();
  });

  it('the person’s own choice wins over the country', () => {
    const d = cv();
    d.market = 'AE';
    d.standard = 'uk';
    expect(standardOf(d)?.id).toBe('uk');
  });

  it('converting sets paper and photo and leaves the text alone', () => {
    const d = cv();
    d.basics.photo = 'data:image/jpeg;base64,AAAA';
    const us = applyStandard(d, 'us');
    expect(us.design.pageSize).toBe('Letter');
    expect(us.design.options.showPhoto).toBe(false);
    expect(us.sections).toEqual(d.sections);
    expect(us.basics).toEqual(d.basics);
    const gulf = applyStandard(us, 'gulf');
    expect(gulf.design.pageSize).toBe('A4');
    expect(gulf.design.options.showPhoto).toBe(true);
  });

  it('suggests what the Gulf standard expects but the CV lacks', () => {
    const d = applyStandard(cv(), 'gulf');
    expect(standardGaps(d).join(' ')).toMatch(/photo/i);
    expect(standardGaps(d).join(' ')).toMatch(/nationality, visa status, notice period/);
    expect(standardGaps(applyStandard(cv(), 'uk'))).toEqual([]);
  });

  it('Gulf and Pakistan: nationality and date of birth are not flagged', () => {
    for (const standard of ['gulf', 'southasia'] as const) {
      const d = applyStandard(cv(), standard);
      d.basics.summary += ' Nationality: Pakistani. Date of birth: 9 August 1987.';
      expect(healthCheck(d).findings.map((f) => f.id)).not.toContain('personal-details');
    }
  });

  it('Gulf: religion and passport numbers are still flagged', () => {
    const d = applyStandard(cv(), 'gulf');
    d.basics.summary += ' Passport number: AB1234567.';
    expect(healthCheck(d).findings.map((f) => f.id)).toContain('personal-details');
  });

  it('the UK and US standards flag a photo and personal details', () => {
    const d = applyStandard(cv(), 'uk');
    d.basics.photo = 'data:image/jpeg;base64,AAAA';
    d.design.options.showPhoto = true;
    d.basics.summary += ' Date of birth: 1 May 1990.';
    const ids = healthCheck(d).findings.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(['personal-details', 'photo-country']));
  });
});
