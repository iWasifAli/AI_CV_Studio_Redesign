'use client';

import { useT } from '@/i18n/client';
import { useMemo } from 'react';
import { Check, Crown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { DocumentPreview } from '@/features/preview/document-preview';
import { recommend, type CatalogueItem } from '@/features/gallery/catalogue-model';
import { recentDesigns } from '@/features/gallery/use-favourites';
import { DESIGN_META } from '@/modules/design/designs';
import { designLabel } from '@/modules/design/lifecycle';
import { ops } from '@/modules/resume/ops';
import type { DesignId, ResumeDocument } from '@/modules/resume/schema';

/** The Design tab never shows more thumbnails than this (catalogue Part A). */
export const MAX_THUMBS = 8;

/**
 * Which designs the Design tab shows: the current one, up to two of the person's saved or recent
 * designs, then recommendations — never more than MAX_THUMBS in all.
 */
export function shortlist(
  items: CatalogueItem[],
  ctx: {
    current: DesignId | null;
    preset: ResumeDocument['presetId'] | null;
    popularity: Record<string, number>;
    favourites: string[];
    recent: string[];
  },
): { mine: CatalogueItem[]; recommended: CatalogueItem[] } {
  const live = new Map(items.map((d) => [d.id, d]));
  const mine: CatalogueItem[] = [];
  for (const id of [...ctx.favourites, ...ctx.recent]) {
    const d = live.get(id as DesignId);
    if (!d || d.id === ctx.current || mine.some((x) => x.id === d.id)) continue;
    mine.push(d);
    if (mine.length === 2) break;
  }
  const room = Math.min(6, MAX_THUMBS - 1 - mine.length);
  const recommended = recommend(
    items.filter((d) => !mine.some((x) => x.id === d.id)),
    { preset: ctx.preset ?? null, popularity: ctx.popularity, current: ctx.current },
    room,
  );
  return { mine, recommended };
}

export function DesignShortlist({
  doc,
  mine: base,
  current,
  items,
  popularity,
  favourites,
  showPremium,
  onUse,
}: {
  doc: ResumeDocument;
  /** The CV as the thumbnails show it (rebuilt only when the words or own style change). */
  mine: ResumeDocument;
  current: DesignId | null;
  items: CatalogueItem[];
  popularity: Record<string, number>;
  favourites: string[];
  showPremium: (id: string) => boolean;
  onUse: (id: DesignId) => void;
}) {
  const tx = useT();
  const list = useMemo(
    () =>
      shortlist(items, {
        current,
        preset: doc.presetId ?? null,
        popularity,
        favourites,
        recent: typeof window === 'undefined' ? [] : recentDesigns(),
      }),
    [items, current, doc.presetId, popularity, favourites],
  );
  const docs = useMemo(() => {
    const m = new Map<DesignId, ResumeDocument>();
    for (const d of [...list.mine, ...list.recommended]) m.set(d.id, ops.useDesign(base, d.id));
    return m;
  }, [list, base]);
  const meta = current ? DESIGN_META[current] : null;

  const thumb = (d: CatalogueItem) => {
    const selected = current === d.id;
    return (
      <button
        key={d.id}
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={`${tx(d.meta.style)} · ${tx(d.meta.name)}${showPremium(d.id) ? ' · Premium' : ''}`}
        onClick={() => onUse(d.id)}
        className={cn(
          'group flex flex-col gap-2 rounded-lg p-1.5 text-left transition-colors',
          selected ? 'bg-primary-soft ring-primary ring-2' : 'hover:bg-sunken',
        )}
      >
        <span className="bg-surface shadow-1 ring-line relative block overflow-hidden rounded-[3px] ring-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- static thumbnails */}
          <img
            src={`/templates/${d.id}.webp`}
            alt=""
            width={397}
            height={562}
            className="absolute inset-0 h-full w-full object-cover object-top"
            loading="lazy"
          />
          <DocumentPreview
            doc={docs.get(d.id)!}
            firstPageOnly
            decorative
            lazy
            debounceMs={300}
            title={tx('Your CV in the {name} design', { name: tx(d.meta.name) })}
          />
          {showPremium(d.id) && (
            <span className="bg-ink/85 absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white">
              <Crown aria-hidden size={12} /> {tx('Premium')}
            </span>
          )}
        </span>
        <span className="px-1 pb-1">
          <span className="text-ink block text-sm font-semibold">{tx(d.meta.style)}</span>
          <span className="text-ink-muted block text-xs">
            {tx(d.meta.name)}
            {d.meta.photo ? ` · ${tx('Photo')}` : ''}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div
      role="radiogroup"
      aria-label={tx('Design')}
      className="flex flex-col gap-4"
      data-testid="design-shortlist"
    >
      {meta && (
        <div
          className="border-line flex items-center gap-3 rounded-lg border p-2"
          data-testid="current-design"
        >
          <span className="bg-surface ring-line relative block w-16 shrink-0 overflow-hidden rounded-[3px] ring-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- static thumbnail */}
            <img
              src={`/templates/${meta.id}.webp`}
              alt=""
              width={397}
              height={562}
              className="block h-auto w-full"
            />
          </span>
          <span className="min-w-0">
            <span className="text-ink-muted block text-xs">{tx('In use')}</span>
            <span className="flex items-center gap-1 font-semibold">
              <Check aria-hidden size={14} className="text-primary" /> {tx(meta.name)}
              <span className="text-ink-muted font-normal">· {tx(meta.style)}</span>
            </span>
            <span className="text-ink-muted block text-xs">
              {designLabel(meta) === 'ats'
                ? tx('ATS-friendly')
                : tx('Creative — plain ATS version included')}
            </span>
          </span>
        </div>
      )}
      {list.mine.length > 0 && (
        <section className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">{tx('Your saved and recent designs')}</h4>
          <div className="grid grid-cols-2 gap-3">{list.mine.map(thumb)}</div>
        </section>
      )}
      {list.recommended.length > 0 && (
        <section className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">{tx('Recommended for you')}</h4>
          <div className="grid grid-cols-2 gap-3">{list.recommended.map(thumb)}</div>
        </section>
      )}
    </div>
  );
}
