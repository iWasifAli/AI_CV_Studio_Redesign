'use client';

import { useEffect, useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/** The browser's install offer, kept until the person asks (it can only be used once). */
let saved: PromptEvent | null = null;
if (typeof window !== 'undefined')
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    saved = e as PromptEvent;
  });

const standalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);
const isIos = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * "Install the app" (spec §11.5): a button where the browser offers installing, steps for
 * iPhone and iPad (Share → Add to Home Screen), and nothing once it's installed.
 */
export function InstallApp() {
  const [state, setState] = useState<'unknown' | 'prompt' | 'ios' | 'installed' | 'other'>(
    'unknown',
  );
  useEffect(() => {
    const pick = () =>
      setState(standalone() ? 'installed' : saved ? 'prompt' : isIos() ? 'ios' : 'other');
    pick();
    const onPrompt = () => setTimeout(pick, 0);
    const onInstalled = () => setState('installed');
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (state === 'unknown') return null;
  return (
    <section
      aria-labelledby="install-h"
      className="border-line bg-surface flex flex-col gap-2 rounded-lg border p-5"
      data-testid="install-app"
    >
      <h2 id="install-h" className="flex items-center gap-2 font-semibold">
        <Smartphone aria-hidden size={18} className="text-primary" /> The app on your phone or
        computer
      </h2>
      {state === 'installed' ? (
        <p className="text-ink-muted text-sm">You’re using the installed app.</p>
      ) : state === 'prompt' ? (
        <>
          <p className="text-ink-muted text-sm">
            Open AI CV Studio from your home screen like any app. CVs you’ve opened work without a
            connection too.
          </p>
          <Button
            size="sm"
            className="self-start"
            icon={<Download aria-hidden size={16} />}
            onClick={async () => {
              const e = saved;
              if (!e) return;
              saved = null;
              await e.prompt();
              const c = await e.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
              setState(c.outcome === 'accepted' ? 'installed' : 'other');
            }}
          >
            Install the app
          </Button>
        </>
      ) : state === 'ios' ? (
        <p className="text-ink-muted text-sm">
          In Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
        </p>
      ) : (
        <p className="text-ink-muted text-sm">
          In Chrome or Edge, choose <strong>Install</strong> in the address bar or the browser menu.
          On iPhone and iPad, use Safari: <strong>Share</strong> →{' '}
          <strong>Add to Home Screen</strong>.
        </p>
      )}
    </section>
  );
}
