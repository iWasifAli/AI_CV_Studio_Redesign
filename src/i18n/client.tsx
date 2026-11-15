'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { DEFAULT_LANG, makeT, type Dict, type Lang, type T } from './core';

type Ctx = { lang: Lang; t: T };
const I18n = createContext<Ctx>({ lang: DEFAULT_LANG, t: makeT(null) });

/** The translator for messages that arrive outside React (API error messages). */
let active: T | null = null;
let patched = false;

/**
 * The server writes its error messages in English. In another language, the message in a failed
 * `/api/` JSON response is translated before any screen reads it, so every error banner, toast
 * and field shows it in the person's language without each screen having to.
 */
function translateApiErrors(t: T | null) {
  active = t;
  if (patched) return;
  patched = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await original(input, init);
    const t = active;
    if (!t || res.ok || !(res.headers.get('content-type') ?? '').includes('application/json'))
      return res;
    try {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(raw, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return res;
      const body = (await res.clone().json()) as { error?: { message?: unknown } } | null;
      const message = body?.error?.message;
      if (typeof message !== 'string') return res;
      const translated = t(message);
      if (translated === message) return res;
      const headers = new Headers(res.headers);
      headers.delete('content-length');
      headers.delete('content-encoding');
      return new Response(
        JSON.stringify({ ...body, error: { ...body!.error, message: translated } }),
        {
          status: res.status,
          statusText: res.statusText,
          headers,
        },
      );
    } catch {
      return res;
    }
  };
}

/** Set once in the root layout with the request's language and its dictionary. */
export function I18nProvider({
  lang,
  dict,
  children,
}: {
  lang: Lang;
  dict: Dict | null;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ lang, t: makeT(dict) }), [lang, dict]);
  if (typeof window !== 'undefined') {
    translateApiErrors(lang === DEFAULT_LANG ? null : value.t);
  }
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useT(): T {
  return useContext(I18n).t;
}
export function useLang(): Lang {
  return useContext(I18n).lang;
}
