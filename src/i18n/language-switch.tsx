'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Languages } from 'lucide-react';
import { LANGS, LANG_NAME, type Lang } from './core';
import { useLang, useT } from './client';

export async function setLanguage(lang: Lang) {
  await fetch('/api/lang', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lang }),
  });
}

/** "English · Deutsch": switches the whole interface (kept in a cookie) and reloads the data. */
export function LanguageSwitch({ className }: { className?: string }) {
  const lang = useLang();
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div
      role="group"
      aria-label={t('Language')}
      className={`inline-flex items-center gap-1.5 text-sm ${className ?? ''}`}
      data-testid="language-switch"
    >
      <Languages aria-hidden size={16} className="text-ink-subtle" />
      {LANGS.map((l, i) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          {i > 0 && (
            <span aria-hidden className="text-ink-subtle">
              ·
            </span>
          )}
          <button
            type="button"
            lang={l}
            aria-pressed={l === lang}
            disabled={pending}
            onClick={() =>
              start(async () => {
                await setLanguage(l);
                router.refresh();
              })
            }
            className={
              l === lang
                ? 'text-ink font-semibold'
                : 'text-ink-muted hover:text-ink underline-offset-2 hover:underline'
            }
          >
            {LANG_NAME[l]}
          </button>
        </span>
      ))}
    </div>
  );
}
