/**
 * Interface languages (spec: German UI and German CV support). English source text is the key
 * ("gettext" style): `t('Download PDF')` returns the German text when the dictionary has it, and
 * the English otherwise, so a missing translation never breaks a screen.
 * Placeholders: `t('{n} downloads left', { n: 3 })`.
 */
export const LANGS = ['en', 'de'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'en';
export const LANG_COOKIE = 'lang';
export const LANG_NAME: Record<Lang, string> = { en: 'English', de: 'Deutsch' };

export type Dict = Record<string, string>;
export type Vars = Record<string, string | number | null | undefined>;
export type T = (text: string, vars?: Vars) => string;

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}

/** Normalises whitespace so JSX text that wraps over lines still finds its translation. */
export const keyOf = (s: string) => s.replace(/\s+/g, ' ').trim();

export function translate(dict: Dict | null, text: string, vars?: Vars): string {
  const k = keyOf(text);
  const out = (dict && dict[k]) || k;
  if (!vars) return out;
  return out.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

export function makeT(dict: Dict | null): T {
  return (text, vars) => translate(dict, text, vars);
}

/** The first supported language in an Accept-Language header, or null. */
export function fromAcceptLanguage(header: string | null): Lang | null {
  if (!header) return null;
  for (const part of header.split(',')) {
    const code = part.split(';')[0]!.trim().slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return null;
}
