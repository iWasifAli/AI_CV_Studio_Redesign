import { NextResponse } from 'next/server';
import { apiError, readJson, requestId } from '@/lib/http';
import { LANG_COOKIE, isLang } from '@/i18n/core';

export const runtime = 'nodejs';

/** POST { lang } → remembers the interface language in a cookie (a year). */
export async function POST(req: Request) {
  const rid = requestId();
  const body = await readJson(req, 1024);
  const lang = body.ok ? (body.value as { lang?: unknown })?.lang : null;
  if (!isLang(lang)) return apiError('INVALID_INPUT', 'Unknown language.', rid);
  const res = NextResponse.json({ lang }, { headers: { 'Cache-Control': 'no-store' } });
  res.cookies.set(LANG_COOKIE, lang, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
