import 'server-only';
import { cookies, headers } from 'next/headers';
import {
  DEFAULT_LANG,
  LANG_COOKIE,
  fromAcceptLanguage,
  isLang,
  makeT,
  type Lang,
  type T,
} from './core';
import { DICTS } from './dicts';

/**
 * The interface language for this request: the person's choice (cookie), otherwise English.
 * The browser's language is only used to offer German, never to switch silently.
 */
export async function getLang(): Promise<Lang> {
  try {
    const c = (await cookies()).get(LANG_COOKIE)?.value;
    if (isLang(c)) return c;
  } catch {
    // Outside a request (scripts, tests).
  }
  return DEFAULT_LANG;
}

/** A browser asking for German (to offer the switch). */
export async function browserPrefersGerman(): Promise<boolean> {
  try {
    return fromAcceptLanguage((await headers()).get('accept-language')) === 'de';
  } catch {
    return false;
  }
}

export async function getT(): Promise<T> {
  return makeT(DICTS[await getLang()]);
}

export function tFor(lang: Lang): T {
  return makeT(DICTS[lang]);
}
