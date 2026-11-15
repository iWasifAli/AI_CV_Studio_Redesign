'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { DEFAULT_LANG, makeT, type Dict, type Lang, type T } from './core';

type Ctx = { lang: Lang; t: T };
const I18n = createContext<Ctx>({ lang: DEFAULT_LANG, t: makeT(null) });

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
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useT(): T {
  return useContext(I18n).t;
}
export function useLang(): Lang {
  return useContext(I18n).lang;
}
