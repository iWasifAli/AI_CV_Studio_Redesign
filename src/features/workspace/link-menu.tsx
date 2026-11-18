'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CopyPlus } from 'lucide-react';
import { useT } from '@/i18n/client';
import { useWorkspace } from './context';
import { routeInfo, workspaceHref } from './routes';

export function OpenWorkspaceButton({ href, label }: { href: string; label?: string }) {
  const { store } = useWorkspace();
  const router = useRouter();
  const t = useT();
  if (!store || !routeInfo(href)) return null;
  return (
    <button
      type="button"
      aria-label={`${t('Open in app tab')}${label ? `: ${t(label)}` : ''}`}
      title={t('Open in app tab')}
      className="text-ink-muted hover:bg-sunken hover:text-primary flex size-11 shrink-0 items-center justify-center rounded-md"
      onClick={() => {
        const tab = store.add(href);
        void store
          .flush()
          .catch(() => {})
          .then(() => {
            if (
              store.isLive() &&
              store.getSnapshot().session.activeTabId === tab.id &&
              store.getTab(tab.id)?.href === tab.href
            )
              router.push(workspaceHref(tab.href, tab.id), { scroll: false });
          });
      }}
    >
      <CopyPlus size={16} aria-hidden />
    </button>
  );
}

/** The same explicit action is available on tool, document and job links throughout the app. */
export function WorkspaceLinkMenu() {
  const { store } = useWorkspace();
  const router = useRouter();
  const t = useT();
  const [menu, setMenu] = useState<{
    href: string;
    x: number;
    y: number;
    source: HTMLElement;
  } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!store) return;
    const open = (event: MouseEvent) => {
      if (event.shiftKey || store.getSnapshot().frozen) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.download ||
        anchor.origin !== window.location.origin
      )
        return;
      const href = anchor.pathname + anchor.search + anchor.hash;
      if (!routeInfo(href)) return;
      event.preventDefault();
      const bounds = anchor.getBoundingClientRect();
      setMenu({
        href,
        x: Math.max(8, Math.min(event.clientX || bounds.left, window.innerWidth - 248)),
        y: Math.max(8, Math.min(event.clientY || bounds.bottom, window.innerHeight - 112)),
        source: anchor,
      });
    };
    document.addEventListener('contextmenu', open);
    return () => document.removeEventListener('contextmenu', open);
  }, [store]);
  useEffect(() => {
    if (!menu) return;
    root.current?.querySelector('button')?.focus();
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setMenu(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);
  if (!menu || !store) return null;
  const dismiss = () => {
    menu.source.focus();
    setMenu(null);
  };
  return (
    <div
      ref={root}
      role="menu"
      aria-label={t('Link actions')}
      style={{ left: menu.x, top: menu.y }}
      className="border-line bg-paper fixed z-[100] w-60 rounded-md border p-1 shadow-lg"
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Tab') dismiss();
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          const buttons = [...(root.current?.querySelectorAll('button') ?? [])];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[
            (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length
          ]?.focus();
        }
      }}
    >
      <button
        role="menuitem"
        type="button"
        className="hover:bg-sunken min-h-11 w-full rounded px-3 text-left text-sm"
        onClick={() => {
          const tab = store.add(menu.href);
          dismiss();
          void store
            .flush()
            .catch(() => {})
            .then(() => {
              if (
                store.isLive() &&
                store.getSnapshot().session.activeTabId === tab.id &&
                store.getTab(tab.id)?.href === tab.href
              )
                router.push(workspaceHref(tab.href, tab.id), { scroll: false });
            });
        }}
      >
        {t('Open in app tab')}
      </button>
      <button
        role="menuitem"
        type="button"
        className="hover:bg-sunken min-h-11 w-full rounded px-3 text-left text-sm"
        onClick={() => {
          window.open(menu.href, '_blank', 'noopener,noreferrer');
          dismiss();
        }}
      >
        {t('Open in browser tab')}
      </button>
    </div>
  );
}
