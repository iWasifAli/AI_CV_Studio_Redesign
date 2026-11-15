import { describe, expect, it } from 'vitest';
import { fromAcceptLanguage, makeT } from './core';

describe('i18n core', () => {
  const t = makeT({
    'Hello {name}': 'Hallo {name}',
    'Uses the {name}{v} theme': 'Stil {name}{v} hier',
  });
  it('translates by the English text and falls back to it', () => {
    expect(t('Hello {name}', { name: 'Ada' })).toBe('Hallo Ada');
    expect(t('Not in the dictionary')).toBe('Not in the dictionary');
    expect(t(undefined)).toBe('');
    expect(makeT(null)('Hello {name}', { name: 'Ada' })).toBe('Hello Ada');
  });
  it('never makes a double space from a space placeholder', () => {
    expect(makeT(null)('Uses the {name}{v} theme', { name: 'Clean', v: ' ' })).toBe(
      'Uses the Clean theme',
    );
    expect(t('Uses the {name}{v} theme', { name: 'Clean', v: ' ' })).toBe('Stil Clean hier');
  });
  it('reads Accept-Language', () => {
    expect(fromAcceptLanguage('de-DE,de;q=0.9,en;q=0.8')).toBe('de');
    expect(fromAcceptLanguage('fr-FR')).toBeNull();
  });
});

describe('edge spaces', () => {
  it('keeps a leading or trailing space of the source text', () => {
    const t = makeT({ 'Due:': 'Fällig:' });
    expect(t('Due: ')).toBe('Fällig: ');
    expect(makeT(null)(' Part of Premium.')).toBe(' Part of Premium.');
  });
});
