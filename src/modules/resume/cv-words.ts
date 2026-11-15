/**
 * Fixed words printed on the CV itself (default section names, "Present", "Contact", level
 * words, key-number labels). They follow the CV's own language (doc.locale), not the interface
 * language: a German interface can still edit an English CV, and the other way round.
 */

const DE: Record<string, string> = {
  // Section names (defaults; the person can rename any section)
  Profile: 'Profil',
  'Work history': 'Berufserfahrung',
  Experience: 'Berufserfahrung',
  Volunteering: 'Ehrenamt',
  Education: 'Ausbildung',
  Skills: 'Kenntnisse',
  Languages: 'Sprachen',
  Certifications: 'Zertifikate',
  'Registration & certifications': 'Zulassungen & Zertifikate',
  Licences: 'Führerscheine',
  Awards: 'Auszeichnungen',
  Projects: 'Projekte',
  More: 'Weiteres',
  Publications: 'Veröffentlichungen',
  'Courses and training': 'Weiterbildungen',
  Memberships: 'Mitgliedschaften',
  'Conferences and talks': 'Konferenzen & Vorträge',
  Patents: 'Patente',
  'Military service': 'Wehrdienst',
  Internships: 'Praktika',
  Interests: 'Interessen',
  'Key achievements': 'Wichtigste Erfolge',
  References: 'Referenzen',
  Strengths: 'Stärken',
  Testimonials: 'Empfehlungen',
  'Personal details': 'Persönliche Daten',
  Declaration: 'Erklärung',
  // Words the designs print
  Present: 'heute',
  Contact: 'Kontakt',
  'Curriculum vitae': 'Lebenslauf',
  'The story of': 'Die Geschichte von',
  'See more of my work': 'Mehr von meiner Arbeit',
  'Your name': 'Ihr Name',
  Signature: 'Unterschrift',
  'Profile photo': 'Profilfoto',
  // Letters
  'Dear Hiring Manager,': 'Sehr geehrte Damen und Herren,',
  'Kind regards,': 'Mit freundlichen Grüßen',
  'Yours sincerely,': 'Mit freundlichen Grüßen',
  'Application:': 'Bewerbung als',
  Application: 'Bewerbung',
  // Levels
  Basic: 'Grundkenntnisse',
  Conversational: 'Gute Kenntnisse',
  Working: 'Gut',
  Good: 'Gut',
  Advanced: 'Fortgeschritten',
  Expert: 'Experte',
  Fluent: 'Fließend',
  Native: 'Muttersprache',
  beginner: 'Anfänger',
  basic: 'Grundkenntnisse',
  good: 'gut',
  'very good': 'sehr gut',
  expert: 'Experte',
  // Key numbers
  'Year of experience': 'Jahr Erfahrung',
  'Years of experience': 'Jahre Erfahrung',
  'Roles held': 'Positionen',
  Certification: 'Zertifikat',
};

const DICTS: Record<string, Record<string, string>> = { de: DE };

export const cvLang = (locale: string | undefined) =>
  ((locale || 'en').split('-')[0] ?? 'en').toLowerCase();

/** Translator for words printed on a CV in the given locale; English and unknown text pass through. */
export function cvWords(locale: string | undefined): (text: string) => string {
  const dict = DICTS[cvLang(locale)];
  return dict ? (text) => dict[text] ?? text : (text) => text;
}

/** All default section names in every CV language, so a rename can tell defaults from the person's own names. */
export function defaultTitleIn(title: string, toLocale: string): string | null {
  const t = title.trim();
  const en =
    t in DE
      ? t
      : Object.values(DICTS)
          .map((d) => Object.keys(d).find((k) => d[k] === t))
          .find(Boolean);
  return en ? cvWords(toLocale)(en) : null;
}

/** CV languages offered in the editor. */
export const CV_LANGUAGES = [
  { locale: 'en-GB', label: 'English' },
  { locale: 'de-DE', label: 'Deutsch' },
] as const;

/**
 * The CV switched to another language: its locale changes, and section names the person never
 * changed (still a default in any CV language) follow. Their own words are left alone — use the
 * translate tool for those.
 */
export function withCvLanguage<D extends { locale: string; sections: { title: string }[] }>(
  doc: D,
  locale: string,
): D {
  if (cvLang(doc.locale) === cvLang(locale)) return doc;
  return {
    ...doc,
    locale,
    sections: doc.sections.map((s) => {
      const next = defaultTitleIn(s.title, locale);
      return next ? { ...s, title: next } : s;
    }),
  };
}
