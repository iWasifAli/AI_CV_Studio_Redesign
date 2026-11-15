/**
 * CV translation (spec §10.1, §13.2 "Locked tokens"): the CV's words go to the model with names,
 * employers, places, dates, numbers, emails and links taken out — never sent, so they can't be
 * changed — and come back as a reviewed copy in the new language. Pure functions, shared by the
 * browser (review screen) and the server (the AI task).
 */
import type { ResumeDocument, Section } from '@/modules/resume/schema';

export const LANGUAGES = [
  ['de', 'German', 'Deutsch', 'de-DE'],
  ['fr', 'French', 'Français', 'fr-FR'],
  ['es', 'Spanish', 'Español', 'es-ES'],
  ['it', 'Italian', 'Italiano', 'it-IT'],
  ['nl', 'Dutch', 'Nederlands', 'nl-NL'],
  ['pt', 'Portuguese', 'Português', 'pt-PT'],
  ['pl', 'Polish', 'Polski', 'pl-PL'],
  ['tr', 'Turkish', 'Türkçe', 'tr-TR'],
  ['en', 'English', 'English', 'en-GB'],
] as const;
export type LanguageCode = (typeof LANGUAGES)[number][0];
export const languageOf = (code: string) => LANGUAGES.find((l) => l[0] === code) ?? null;

/** One piece of text to translate, addressed by where it sits in the CV. */
export type Piece = { id: string; text: string };

/** Item fields that hold words to translate (names, employers, schools and places don't). */
const TEXT_KEYS = new Set([
  'role',
  'qualification',
  'label',
  'title',
  'subtitle',
  'description',
  'fluency',
  'language',
  'text',
  'quote',
  'value',
  'statement',
]);
const LIST_KEYS = new Set(['bullets', 'details', 'keywords', 'highlights']);

/** Every translatable text in the CV, with a stable id. */
export function collectPieces(doc: ResumeDocument): Piece[] {
  const out: Piece[] = [];
  const add = (id: string, text: unknown) => {
    if (typeof text === 'string' && /\p{L}/u.test(text)) out.push({ id, text });
  };
  add('b.headline', doc.basics.headline);
  add('b.summary', doc.basics.summary);
  doc.sections.forEach((s, si) => {
    if (s.hidden) return;
    add(`s${si}.title`, s.title);
    (s.items as Record<string, unknown>[]).forEach((it, ii) => {
      for (const [k, v] of Object.entries(it)) {
        if (TEXT_KEYS.has(k)) add(`s${si}.i${ii}.${k}`, v);
        else if (LIST_KEYS.has(k) && Array.isArray(v))
          v.forEach((line, li) => add(`s${si}.i${ii}.${k}.${li}`, line));
      }
    });
  });
  return out;
}

/** The CV with translated pieces put back, in the new language. */
export function applyPieces(
  doc: ResumeDocument,
  pieces: Piece[],
  lang: { code: string; locale: string; name: string },
  newId: string,
): ResumeDocument {
  const map = new Map(pieces.map((p) => [p.id, p.text]));
  const get = (id: string, fallback: string) => {
    const v = map.get(id);
    return typeof v === 'string' && v.trim() ? v : fallback;
  };
  const now = new Date().toISOString();
  const copy = structuredClone(doc);
  copy.id = newId;
  copy.title = `${doc.title || doc.basics.name || 'CV'} (${lang.name})`.slice(0, 120);
  copy.locale = lang.locale;
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.parentId = doc.id;
  delete copy.role;
  copy.basics.headline = get('b.headline', copy.basics.headline);
  copy.basics.summary = get('b.summary', copy.basics.summary);
  copy.sections = copy.sections.map((s, si) => {
    if (s.hidden) return s;
    const items = (s.items as Record<string, unknown>[]).map((it, ii) => {
      const next: Record<string, unknown> = { ...it };
      for (const [k, v] of Object.entries(it)) {
        if (TEXT_KEYS.has(k) && typeof v === 'string') next[k] = get(`s${si}.i${ii}.${k}`, v);
        else if (LIST_KEYS.has(k) && Array.isArray(v))
          next[k] = v.map((line, li) =>
            typeof line === 'string' ? get(`s${si}.i${ii}.${k}.${li}`, line) : line,
          );
      }
      return next;
    });
    return { ...s, title: get(`s${si}.title`, s.title), items } as Section;
  });
  return copy;
}

// ---- Locked tokens ----

/**
 * What never goes to the model: emails, links, phone numbers, dates, numbers with units, and the
 * names, employers, schools and places in the CV.
 */
const PATTERNS = [
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, // email
  /\bhttps?:\/\/\S+|\bwww\.\S+/g, // link
  /\+?\d[\d\s().-]{6,}\d/g, // phone
  /[£$€₹₨]\s?\d[\d,.]*(?:\s?(?:k|m|bn))?|\d[\d,.]*\s?(?:%|k\b|m\b|bn\b)|\b\d+(?:[.,]\d+)*\b/gi, // numbers
];

export function lockedWords(doc: ResumeDocument): string[] {
  const words = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === 'string' && v.trim().length > 1) words.add(v.trim());
  };
  add(doc.basics.name);
  add(doc.basics.location);
  for (const s of doc.sections)
    for (const it of s.items as Record<string, unknown>[])
      for (const k of ['organization', 'institution', 'location', 'issuer', 'name', 'publisher'])
        add(it[k]);
  // Longest first, so "Swift Logistics Ltd" is locked before "Swift".
  return [...words].sort((a, b) => b.length - a.length);
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replaces locked parts with ⟦1⟧, ⟦2⟧…; returns the text and what each token stands for. */
export function lock(text: string, words: string[]): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  let out = text;
  const put = (m: string) => {
    tokens.push(m);
    return `⟦${tokens.length}⟧`;
  };
  for (const w of words) {
    if (!out.includes(w)) continue;
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc(w)}(?![\\p{L}\\p{N}])`, 'gu'), put);
  }
  // Patterns run only on the text between tokens already placed.
  for (const p of PATTERNS)
    out = out
      .split(/(⟦\d+⟧)/)
      .map((part) => (/^⟦\d+⟧$/.test(part) ? part : part.replace(p, put)))
      .join('');
  return { text: out, tokens };
}

/**
 * Puts the locked parts back. Returns null when the translation lost, added or duplicated a
 * token — the original text is kept for that piece then.
 */
export function unlock(text: string, tokens: string[]): string | null {
  const seen = [...text.matchAll(/⟦(\d+)⟧/g)].map((m) => Number(m[1]));
  const want = tokens.map((_, i) => i + 1);
  if (seen.length !== want.length || [...seen].sort((a, b) => a - b).join() !== want.join())
    return null;
  return text.replace(/⟦(\d+)⟧/g, (_, n: string) => tokens[Number(n) - 1]!);
}
