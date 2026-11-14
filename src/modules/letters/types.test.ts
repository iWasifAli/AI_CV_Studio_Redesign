import { describe, expect, it } from 'vitest';
import { LETTER_TYPES, LETTER_TYPE, fill, missingAnswers, starterLetter } from './types';

describe('letter types', () => {
  it('has the seven library letters, a general cover letter, a statement and a bio', () => {
    expect(LETTER_TYPES.map((t) => t.id)).toEqual([
      'cover',
      'resignation',
      'reference',
      'thank-you',
      'follow-up',
      'offer-accept',
      'salary',
      'networking',
      'personal-statement',
      'bio',
    ]);
    for (const t of LETTER_TYPES) {
      expect(t.questions.length).toBeGreaterThanOrEqual(3);
      expect(t.questions.length).toBeLessThanOrEqual(5);
      expect(t.questions.some((q) => q.required || q.options)).toBe(true);
      // Every placeholder names a question (or a CV detail).
      const ids = new Set([...t.questions.map((q) => q.id), 'name', 'headline', 'location']);
      for (const line of [...t.starter, t.subject])
        for (const m of line.matchAll(/\{(\w+)/g)) expect(ids, `${t.id}: ${m[1]}`).toContain(m[1]);
    }
  });

  it('fills answers, drops lines with a missing answer, and handles optional prefixes', () => {
    expect(
      fill('role of {role}{organisation: at }.', { role: 'Driver', organisation: 'Acme' }),
    ).toBe('role of Driver at Acme.');
    expect(fill('role of {role}{organisation: at }.', { role: 'Driver' })).toBe('role of Driver.');
    expect(fill('{thanks}', {})).toBeNull();
    expect(fill('meet me{when:} to', { when: 'yesterday' })).toBe('meet me yesterday to');
    expect(fill('meet me{when:} to', {})).toBe('meet me to');
  });

  it('builds a complete starter draft from the required answers alone', () => {
    for (const t of LETTER_TYPES) {
      const answers = Object.fromEntries(
        t.questions.filter((q) => q.required).map((q) => [q.id, `X-${q.id}`]),
      );
      expect(missingAnswers(t, answers)).toEqual([]);
      const s = starterLetter(t, answers, { name: 'Sam Lee', headline: 'Driver', location: '' });
      expect(s.paragraphs.length, t.id).toBeGreaterThanOrEqual(t.form === 'statement' ? 1 : 2);
      expect(s.paragraphs.join(' ')).not.toMatch(/[{}]/);
      expect(s.subject).not.toMatch(/[{}]/);
    }
    const bio = starterLetter(
      LETTER_TYPE.bio,
      {},
      {
        name: 'Sam Lee',
        headline: 'Delivery Driver',
        location: 'Leicester',
      },
    );
    expect(bio.paragraphs[0]).toBe('Sam Lee, Delivery Driver, based in Leicester.');
    expect(bio.subject).toBe('About Sam Lee');
    const r = starterLetter(LETTER_TYPE.resignation, {
      role: 'Driver',
      organisation: 'Swift',
      lastDay: '31 December 2026',
    });
    expect(r.paragraphs[0]).toContain(
      'my role as Driver at Swift. My last working day will be 31 December 2026.',
    );
    expect(r.subject).toBe('Resignation');
  });
});
