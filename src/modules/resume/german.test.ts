import { describe, expect, it } from 'vitest';
import { buildSource, guardText } from '@/modules/ai/guard';
import { languageRule, outputLanguage, textLanguage } from '@/modules/ai/language';
import { detectCvLocale, findDates, headingOf, parseCv } from '@/modules/import/parse';
import { LETTER_TYPE, starterLetter } from '@/modules/letters/types';
import { createDocument } from './create';
import { cvWords, withCvLanguage } from './cv-words';
import { formatRange } from './dates';
import { toRenderModel } from '@/modules/templates/render-model';

describe('German CVs', () => {
  it('prints German dates and words', () => {
    expect(formatRange('2019-03', '', true, 'de-DE')).toBe('03/2019 – heute');
    expect(formatRange('2015', '2018-11', false, 'de-AT')).toBe('2015 – 11/2018');
    expect(formatRange('2019-03', '', true, 'en-GB')).toBe('Mar 2019 – Present');
    expect(cvWords('de-DE')('Contact')).toBe('Kontakt');
    expect(cvWords('en-GB')('Contact')).toBe('Contact');
  });

  it('creates German CVs with German section names', () => {
    const doc = createDocument('driver', { locale: 'de-DE' });
    expect(doc.title).toBe('Mein Lebenslauf');
    expect(doc.sections.map((s) => s.title)).toContain('Berufserfahrung');
    expect(doc.design.pageSize).toBe('A4');
  });

  it('switches the CV language, renaming only default section names', () => {
    const doc = createDocument('general', { locale: 'en-GB' });
    doc.sections[0]!.title = 'Where I have worked';
    const de = withCvLanguage(doc, 'de-DE');
    expect(de.locale).toBe('de-DE');
    expect(de.sections[0]!.title).toBe('Where I have worked');
    expect(de.sections.slice(1).map((s) => s.title)).not.toContain('Skills');
    const back = withCvLanguage(de, 'en-GB');
    expect(back.sections.map((s) => s.title)).toEqual(doc.sections.map((s) => s.title));
  });

  it('renders German key numbers and the profile heading', () => {
    const doc = createDocument('general', { locale: 'de-DE' });
    doc.basics.summary = 'Zuverlässiger Fahrer.';
    const m = toRenderModel(doc);
    expect(m.sections[0]!.title).toBe('Profil');
  });

  it('reads German headings and dates', () => {
    expect(headingOf('Berufserfahrung')?.kind).toBe('experience');
    expect(headingOf('BERUFLICHER WERDEGANG')?.kind).toBe('experience');
    expect(headingOf('Persönliche Daten')?.kind).toBe('contact');
    expect(headingOf('Sprachkenntnisse')?.kind).toBe('languages');
    expect(headingOf('Hobbies')?.title).toBe('Interests');
    expect(findDates('03/2019 – heute')).toMatchObject({ start: '2019-03', current: true });
    expect(findDates('März 2017 bis Februar 2019')).toMatchObject({
      start: '2017-03',
      end: '2019-02',
    });
    expect(findDates('seit 10/2020')).toMatchObject({ start: '2020-10', current: true });
    expect(findDates('01.04.2016 – 31.12.2018')).toMatchObject({
      start: '2016-04',
      end: '2018-12',
    });
  });

  it('parses a German CV and detects its language', () => {
    const lines = [
      'Anna Schmidt',
      'Pflegefachkraft',
      'anna.schmidt@example.de · +49 170 1234567 · Berlin',
      'Berufserfahrung',
      'Pflegefachkraft',
      'Charité Berlin',
      '03/2019 – heute',
      '• Betreuung von bis zu 8 Patienten pro Schicht und Dokumentation der Pflege',
      'Ausbildung',
      'Ausbildung zur Pflegefachkraft',
      'Pflegeschule Berlin',
      '2016 – 2019',
      'Sprachen',
      'Deutsch (Muttersprache), Englisch (fließend)',
    ];
    expect(detectCvLocale(lines, 'en-GB')).toBe('de-DE');
    expect(detectCvLocale(lines, 'en-AT')).toBe('de-AT');
    const { doc } = parseCv(lines, { locale: 'de-DE' });
    const exp = doc.sections.find((s) => s.kind === 'experience');
    expect(exp?.title).toBe('Berufserfahrung');
    expect(exp?.items[0]).toMatchObject({ start: '2019-03', current: true });
    const langs = doc.sections.find((s) => s.kind === 'languages');
    expect(langs?.items).toHaveLength(2);
    expect(
      detectCvLocale(
        ['I managed the team and delivered the project for the client in London'],
        'de-DE',
      ),
    ).toBe('en-GB');
  });
});

describe('German AI output', () => {
  it('writes CV text in the CV’s language and advice in the interface language', () => {
    const german = {
      bullets: ['Betreuung von Kunden und Bearbeitung der Bestellungen für die Filiale'],
    };
    expect(textLanguage(german.bullets[0]!)).toBe('de');
    expect(outputLanguage('write.improveBullets', german, 'en')).toBe('de');
    expect(
      outputLanguage(
        'write.improveBullets',
        { bullets: ['Managed the team and the rota for the store'] },
        'de',
      ),
    ).toBe('en');
    expect(outputLanguage('coach.chat', { message: 'hi' }, 'de')).toBe('de');
    expect(outputLanguage('import.structure', german, 'de')).toBeNull();
    expect(languageRule('de')).toContain('German');
    expect(languageRule('en')).toBe('');
  });

  it('does not take German nouns for invented names, but still checks names and numbers', () => {
    const source = buildSource([
      'Ich habe Pakete zugestellt und Kunden bei Swift Logistics betreut. 120 Pakete am Tag.',
    ]);
    const ok = guardText(
      'Zustellung von täglich 120 Paketen und freundliche Betreuung der Kunden.',
      source,
    );
    expect(ok.findings).toEqual([]);
    const bad = guardText('Zustellung für die Deutsche Post mit 300 Paketen am Tag.', source);
    expect(bad.findings.map((f) => f.kind).sort()).toEqual(['name', 'number']);
  });
});

describe('German letters', () => {
  it('starts German letters in German', () => {
    const s = starterLetter(
      LETTER_TYPE.cover,
      { role: 'Pflegefachkraft', organisation: 'Charité' },
      {},
      'de-DE',
    );
    expect(s.subject).toBe('Bewerbung als Pflegefachkraft');
    expect(s.paragraphs[0]).toBe(
      'hiermit bewerbe ich mich um die Stelle als Pflegefachkraft bei Charité.',
    );
    expect(cvWords('de-DE')('Dear Hiring Manager,')).toBe('Sehr geehrte Damen und Herren,');
  });
});
