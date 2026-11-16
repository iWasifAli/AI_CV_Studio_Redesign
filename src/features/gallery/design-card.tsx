'use client';

import { useT } from '@/i18n/client';
import Link from 'next/link';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crown, Heart } from 'lucide-react';
import { cn } from '@/lib/cn';
import { DocumentPreview } from '@/features/preview/document-preview';
import type { ResumeDocument } from '@/modules/resume/schema';
import { themesFor } from '@/modules/design/themes';
import type { CatalogueItem } from './catalogue-model';
import { useShown } from './design-usage';
import { docInDesign } from './doc-in-design';

/** Live previews are built only while the list is at rest, one at a time (smooth scrolling). */
let lastScroll = 0;
let lastGrant = 0;
if (typeof window !== 'undefined')
  window.addEventListener('scroll', () => void (lastScroll = performance.now()), {
    capture: true,
    passive: true,
  });
const REST_MS = 300;
const GAP_MS = 120;

/**
 * Mounts its child only while the card is on (or near) the screen and the list has stopped
 * scrolling — so flicking through hundreds of designs builds nothing, and previews that leave the
 * screen are dropped again. Memory stays bounded however long the list is.
 */
function WhenVisible({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const tryOn = () => {
      const now = performance.now();
      if (now - lastScroll < REST_MS || now - lastGrant < GAP_MS) {
        t = setTimeout(
          tryOn,
          Math.max(REST_MS - (now - lastScroll), GAP_MS - (now - lastGrant), 30),
        );
        return;
      }
      lastGrant = now;
      setOn(true);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        clearTimeout(t);
        if (e?.isIntersecting) t = setTimeout(tryOn, 60);
        else setOn(false);
      },
      { rootMargin: '100px 0px' },
    );
    io.observe(el);
    return () => {
      clearTimeout(t);
      io.disconnect();
    };
  }, []);
  return (
    <div ref={ref} className="absolute inset-0" data-live={on ? '' : undefined}>
      {on && children}
    </div>
  );
}

function LivePreview({
  base,
  sample,
  id,
  theme,
  title,
}: {
  base: ResumeDocument;
  sample?: string;
  id: CatalogueItem['id'];
  theme: string;
  title: string;
}) {
  const doc = useMemo(() => docInDesign(base, id, theme, sample), [base, id, theme, sample]);
  return <DocumentPreview doc={doc} firstPageOnly decorative debounceMs={0} title={title} />;
}

export type CardProps = {
  item: CatalogueItem;
  /** The CV every card shows (built into this design only while the card is on screen). */
  base: ResumeDocument;
  sample?: string;
  theme: string;
  onTheme: (theme: string) => void;
  favourite: boolean;
  onFavourite: () => void;
  comparing: boolean;
  canCompare: boolean;
  onCompare: () => void;
  /** Gallery page: a link to the design's page. Editor: opens the preview. */
  href?: string;
  onOpen?: () => void;
  current?: boolean;
  showPremium: boolean;
  priority?: boolean;
  label: string;
};

export const DesignCard = memo(function DesignCard(p: CardProps) {
  const tx = useT();
  const { item } = p;
  const ref = useRef<HTMLLIElement>(null);
  useShown(ref, item.id);
  const themes = themesFor(item.id);
  const name = tx(item.meta.name);
  const thumb = (
    <>
      {/* Stored thumbnail first; the person's own CV renders over it while the card is on screen. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static webp */}
      <img
        src={`/templates/${item.id}.webp`}
        alt=""
        width={595}
        height={842}
        fetchPriority={p.priority ? 'high' : 'auto'}
        loading={p.priority ? 'eager' : 'lazy'}
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-top"
      />
      <WhenVisible>
        <LivePreview
          base={p.base}
          sample={p.sample}
          id={item.id}
          theme={p.theme}
          title={tx('{name} design with {label}', { name, label: p.label })}
        />
      </WhenVisible>
      {p.current && (
        <span className="bg-primary text-on-primary shadow-1 absolute top-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
          <Check aria-hidden size={12} strokeWidth={3} /> {tx('In use')}
        </span>
      )}
      {p.showPremium && (
        <span className="bg-ink/85 absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white">
          <Crown aria-hidden size={12} /> {tx('Premium')}
        </span>
      )}
    </>
  );
  const frameClass =
    'bg-surface shadow-page hover:ring-primary relative block aspect-[595/842] w-full overflow-hidden rounded-[4px] hover:ring-2 focus-visible:ring-2';

  return (
    <li ref={ref} className="flex min-w-0 flex-col gap-2" data-design={item.id} data-key={item.key}>
      <div className="relative">
        {p.href ? (
          <Link
            href={p.href}
            className={frameClass}
            aria-label={tx('{name}: see this design', { name })}
          >
            {thumb}
          </Link>
        ) : (
          <button
            type="button"
            onClick={p.onOpen}
            className={frameClass}
            aria-label={tx('Preview {name}', { name })}
          >
            {thumb}
          </button>
        )}
        <button
          type="button"
          onClick={p.onFavourite}
          aria-pressed={p.favourite}
          aria-label={tx('Favourite: {name}', { name })}
          className="bg-surface/90 shadow-1 hover:bg-surface absolute top-2 right-2 z-[2] inline-flex size-9 items-center justify-center rounded-full"
        >
          <Heart
            aria-hidden
            size={18}
            className={p.favourite ? 'fill-danger text-danger' : 'text-ink-muted'}
          />
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="leading-tight font-semibold">
          {name} <span className="text-ink-muted text-sm font-normal">· {tx(item.meta.style)}</span>
        </p>
        <p className="text-xs" data-testid="design-label">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 font-semibold',
              item.label === 'ats'
                ? 'bg-success-soft text-success'
                : 'bg-accent-soft text-accent-ink',
            )}
          >
            {item.label === 'ats'
              ? tx('ATS-friendly')
              : tx('Creative — plain ATS version included')}
          </span>
        </p>
        <div
          role="radiogroup"
          aria-label={tx('Colours for {name}', { name })}
          className="flex flex-wrap gap-1"
        >
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={p.theme === t.id}
              aria-label={tx(t.name)}
              title={tx(t.name)}
              onClick={() => p.onTheme(t.id)}
              className={cn(
                'inline-flex size-7 items-center justify-center rounded-full border-2',
                p.theme === t.id ? 'border-ink' : 'border-transparent',
              )}
            >
              <span
                className="size-5 rounded-full"
                style={{
                  background: `linear-gradient(135deg, ${t.ink} 0 50%, ${t.accent} 50% 100%)`,
                }}
              />
            </button>
          ))}
        </div>
        <label className="text-ink-muted inline-flex min-h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            aria-label={tx('Compare {name}', { name })}
            checked={p.comparing}
            disabled={!p.comparing && !p.canCompare}
            onChange={p.onCompare}
          />
          {tx('Compare')}
        </label>
      </div>
    </li>
  );
});
