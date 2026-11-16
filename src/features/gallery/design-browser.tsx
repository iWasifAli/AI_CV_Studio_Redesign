'use client';

import { useT } from '@/i18n/client';
import { useEffect, useId, useMemo, useState } from 'react';
import { Columns3, Heart, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/cn';
import { isPremiumDesign, useEntitlements } from '@/features/account/entitlements';
import { DocumentPreview } from '@/features/preview/document-preview';
import { FAMILIES, FAMILY_LABEL } from '@/modules/design/designs';
import { DESIGN_TAGS, TAG_LABEL } from '@/modules/design/lifecycle';
import { themesFor } from '@/modules/design/themes';
import { PROFESSIONS, type PresetId } from '@/modules/resume/professions';
import type { DesignId, ResumeDocument } from '@/modules/resume/schema';
import {
  NO_FILTERS,
  SORTS,
  SORT_LABEL,
  activeFilterCount,
  catalogueItems,
  filterItems,
  seeded,
  sortItems,
  type CatalogueItem,
  type Filters,
  type Sort,
} from './catalogue-model';
import { DesignCard } from './design-card';
import { docInDesign } from './doc-in-design';
import { newVisit, notePreviewed } from './design-usage';
import { useFavourites, usePopularity } from './use-favourites';

export const MAX_COMPARE = 4;

export type BrowserProps = {
  /** The CV every card shows. */
  base: ResumeDocument;
  /** Sample CV id when `base` is an example (adds a sample photo). */
  sample?: string;
  /** Whose CV it is, for titles ("your CV", "an example teacher CV"). */
  label: string;
  preset: PresetId | null;
  current?: DesignId | null;
  /** Editor: apply the design (one undo step). Gallery page: undefined (cards link to pages). */
  onUse?: (id: DesignId, theme: string) => void;
  /** Gallery page: link for a card. */
  hrefFor?: (id: DesignId, theme: string) => string;
  /** Load test only: repeat the catalogue to this many cards. */
  seed?: number;
  /** Extra controls in the toolbar (the gallery's "Show the designs with"). */
  extra?: React.ReactNode;
};

/**
 * All designs, at any catalogue size: search, mood and occasion tags, filters, sort, colour
 * themes, favourites and compare. Cards show a stored thumbnail at once and the person's own CV
 * only while on screen.
 */
export function DesignBrowser(p: BrowserProps) {
  const tx = useT();
  const ids = useId();
  const { ent } = useEntitlements();
  const favs = useFavourites();
  const popularity = usePopularity();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<Sort>('best');
  const [themes, setThemes] = useState<Record<string, string>>({});
  const [compare, setCompare] = useState<string[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [preview, setPreview] = useState<CatalogueItem | null>(null);
  const [comparing, setComparing] = useState(false);
  useEffect(() => newVisit(), []);
  const { base, sample, current, seed } = p;

  const all = useMemo(() => {
    const items = catalogueItems(ent?.designs ?? null, current ?? undefined);
    return seed ? seeded(items, seed) : items;
  }, [ent, current, seed]);
  const shown = useMemo(
    () =>
      sortItems(filterItems(all, filters, favs.set), sort, {
        preset: p.preset,
        popularity,
      }),
    [all, filters, favs.set, sort, p.preset, popularity],
  );

  // Documents per design and theme, kept while the CV is the same.

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const toggleTag = (t: (typeof DESIGN_TAGS)[number]) =>
    set({
      tags: filters.tags.includes(t) ? filters.tags.filter((x) => x !== t) : [...filters.tags, t],
    });
  const themeOf = (id: string) => themes[id] ?? 'own';
  const open = (d: CatalogueItem) => {
    notePreviewed(d.id, themeOf(d.id) === 'own' ? undefined : themeOf(d.id));
    setPreview(d);
  };
  const premium = (id: string) =>
    ent !== null && ent.plan !== 'premium' && isPremiumDesign(ent, id);
  const count = activeFilterCount(filters);

  const moreFilters = (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label={tx('Design families')} className="flex flex-wrap gap-1.5">
        {(['all', ...FAMILIES] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filters.family === f}
            title={f === 'all' ? undefined : tx(FAMILY_LABEL[f].hint)}
            onClick={() => set({ family: f })}
            className={cn(
              'min-h-9 rounded-full border px-3 text-sm font-semibold transition-colors',
              filters.family === f
                ? 'bg-primary text-on-primary border-transparent'
                : 'border-line-strong text-ink-muted hover:bg-sunken',
            )}
          >
            {f === 'all' ? tx('All designs') : FAMILY_LABEL[f].name}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <Segmented
          label={tx('Columns')}
          value={filters.columns}
          onChange={(columns) => set({ columns })}
          options={[
            { value: 'any', label: 'Any' },
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3', label: '3' },
          ]}
        />
        <Segmented
          label={tx('Photo')}
          value={filters.photo}
          onChange={(photo) => set({ photo })}
          options={[
            { value: 'any', label: 'Any' },
            { value: 'with', label: 'With' },
            { value: 'without', label: 'Without' },
          ]}
        />
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {tx('Suits')}
          <select
            value={filters.work}
            onChange={(e) => set({ work: e.target.value as PresetId | '' })}
            className="border-line-strong bg-surface min-h-11 rounded-md border px-3 text-[15px] font-normal"
          >
            <option value="">{tx('Any kind of work')}</option>
            {PROFESSIONS.map((x) => (
              <option key={x.id} value={x.id}>
                {tx(x.name)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-[15px]">
          <input
            type="checkbox"
            checked={filters.online}
            onChange={(e) => set({ online: e.target.checked })}
            className="size-5"
          />
          {tx('Best for online applications')}
        </label>
      </div>
      {count > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setFilters(NO_FILTERS)}
        >
          {tx('Clear all filters')}
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3" role="search" aria-label={tx('Find a design')}>
        <div className="flex flex-wrap items-end gap-3">
          {p.extra}
          <label className="relative min-w-0 flex-1 basis-48">
            <span className="sr-only">{tx('Search designs')}</span>
            <Search
              aria-hidden
              size={18}
              className="text-ink-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
            />
            <input
              type="search"
              value={filters.text}
              onChange={(e) => set({ text: e.target.value })}
              placeholder={tx('Search designs')}
              data-testid="design-search"
              className="border-line-strong bg-surface min-h-11 w-full rounded-md border pr-3 pl-10 text-[15px]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            <span className="sr-only sm:not-sr-only">{tx('Order')}</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label={tx('Order')}
              data-testid="design-sort"
              className="border-line-strong bg-surface min-h-11 rounded-md border px-3 text-[15px] font-normal"
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {tx(SORT_LABEL[s])}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="secondary"
            onClick={() => setDrawer((v) => !v)}
            aria-expanded={drawer}
            aria-controls={`${ids}-filters`}
            data-testid="design-filters"
          >
            <SlidersHorizontal aria-hidden size={18} />
            {tx('Filters')}
            {count > 0 && (
              <span className="bg-primary text-on-primary rounded-full px-1.5 text-xs">
                {count}
              </span>
            )}
          </Button>
        </div>
        {/* Mood and occasion: always one tap away. */}
        <div
          role="group"
          aria-label={tx('Mood and occasion')}
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
        >
          <button
            type="button"
            aria-pressed={filters.favouritesOnly}
            onClick={() => set({ favouritesOnly: !filters.favouritesOnly })}
            className={cn(
              'inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-sm font-semibold',
              filters.favouritesOnly
                ? 'bg-primary text-on-primary border-transparent'
                : 'border-line-strong text-ink-muted hover:bg-sunken',
            )}
          >
            <Heart aria-hidden size={14} /> {tx('Favourites')}
          </button>
          {DESIGN_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={filters.tags.includes(t)}
              onClick={() => toggleTag(t)}
              className={cn(
                'min-h-9 shrink-0 rounded-full border px-3 text-sm font-semibold',
                filters.tags.includes(t)
                  ? 'bg-primary text-on-primary border-transparent'
                  : 'border-line-strong text-ink-muted hover:bg-sunken',
              )}
            >
              {tx(TAG_LABEL[t])}
            </button>
          ))}
        </div>
        {drawer && (
          <>
            {/* Phone: a drawer from the bottom. Wider screens: a panel under the toolbar. */}
            <div
              className="fixed inset-0 z-40 bg-black/40 sm:hidden"
              onClick={() => setDrawer(false)}
              aria-hidden
            />
            <div
              id={`${ids}-filters`}
              className="bg-surface sm:border-line fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-xl p-4 shadow-lg sm:static sm:z-auto sm:max-h-none sm:rounded-lg sm:border sm:shadow-none"
              role="region"
              aria-label={tx('Filters')}
            >
              <div className="mb-3 flex items-center justify-between sm:hidden">
                <h2 className="font-semibold">{tx('Filters')}</h2>
                <button
                  type="button"
                  onClick={() => setDrawer(false)}
                  aria-label={tx('Close filters')}
                  className="hover:bg-sunken inline-flex size-10 items-center justify-center rounded-md"
                >
                  <X aria-hidden size={20} />
                </button>
              </div>
              {moreFilters}
              <Button className="mt-4 w-full sm:hidden" onClick={() => setDrawer(false)}>
                {tx('Show {n} designs', { n: String(shown.length) })}
              </Button>
            </div>
          </>
        )}
        <p
          className="text-ink-muted text-sm"
          id={`${ids}-count`}
          aria-live="polite"
          data-testid="design-count"
        >
          {tx('{n} designs', { n: String(shown.length) })}
        </p>
      </div>

      <ul
        className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-5 md:grid-cols-3 xl:grid-cols-4"
        aria-describedby={`${ids}-count`}
        data-testid="design-grid"
      >
        {shown.map((d, i) => (
          <DesignCard
            key={d.key}
            item={d}
            base={base}
            sample={sample}
            theme={themeOf(d.id)}
            onTheme={(t) => setThemes((m) => ({ ...m, [d.id]: t }))}
            favourite={favs.set.has(d.id)}
            onFavourite={() => favs.toggle(d.id)}
            comparing={compare.includes(d.key)}
            canCompare={compare.length < MAX_COMPARE}
            onCompare={() =>
              setCompare((c) => (c.includes(d.key) ? c.filter((x) => x !== d.key) : [...c, d.key]))
            }
            href={p.hrefFor?.(d.id, themeOf(d.id))}
            onOpen={p.hrefFor ? undefined : () => open(d)}
            current={d.id === p.current}
            showPremium={premium(d.id)}
            priority={i < 2}
            label={p.label}
          />
        ))}
      </ul>
      {shown.length === 0 && (
        <p className="text-ink-muted">{tx('No design matches all of these. Try fewer filters.')}</p>
      )}

      {compare.length > 0 && (
        <div
          className="bg-surface border-line sticky bottom-0 z-30 -mx-4 flex items-center justify-between gap-3 border-t px-4 py-3"
          data-testid="compare-tray"
        >
          <span className="text-sm">
            {tx('{n} of {max} picked to compare', {
              n: String(compare.length),
              max: String(MAX_COMPARE),
            })}
          </span>
          <span className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCompare([])}>
              {tx('Clear')}
            </Button>
            <Button size="sm" disabled={compare.length < 2} onClick={() => setComparing(true)}>
              <Columns3 aria-hidden size={16} /> {tx('Compare')}
            </Button>
          </span>
        </div>
      )}

      <Dialog
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview ? tx('{name} design', { name: tx(preview.meta.name) }) : ''}
        className="h-[100dvh] max-h-none w-screen max-w-none rounded-none sm:h-[92vh] sm:w-[min(100vw-2rem,64rem)] sm:rounded-xl"
      >
        {preview && (
          <PreviewBody
            item={preview}
            base={base}
            sample={sample}
            theme={themeOf(preview.id)}
            onTheme={(t) => setThemes((m) => ({ ...m, [preview.id]: t }))}
            premium={premium(preview.id)}
            current={preview.id === p.current}
            onUse={
              p.onUse
                ? () => {
                    p.onUse!(preview.id, themeOf(preview.id));
                    setPreview(null);
                  }
                : undefined
            }
          />
        )}
      </Dialog>

      <Dialog
        open={comparing}
        onClose={() => setComparing(false)}
        title={tx('Compare designs')}
        className="h-[100dvh] max-h-none w-screen max-w-none rounded-none sm:h-[92vh] sm:w-[min(100vw-2rem,90rem)] sm:rounded-xl"
      >
        <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="compare-view">
          {compare
            .map((k) => all.find((d) => d.key === k))
            .filter((d): d is CatalogueItem => !!d)
            .map((d) => (
              <li key={d.key} className="flex flex-col gap-2">
                <p className="font-semibold">{tx(d.meta.name)}</p>
                <div className="bg-surface shadow-page overflow-hidden rounded-[4px]">
                  <Themed
                    base={base}
                    sample={sample}
                    id={d.id}
                    theme={themeOf(d.id)}
                    firstPageOnly
                    title={tx('{name} design with {label}', {
                      name: tx(d.meta.name),
                      label: p.label,
                    })}
                  />
                </div>
                <p className="text-xs">
                  {d.label === 'ats'
                    ? tx('ATS-friendly')
                    : tx('Creative — plain ATS version included')}
                </p>
                {p.onUse ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      p.onUse!(d.id, themeOf(d.id));
                      setComparing(false);
                    }}
                  >
                    {tx('Use this design')}
                  </Button>
                ) : (
                  p.hrefFor && (
                    <a
                      className="text-primary text-sm font-semibold"
                      href={p.hrefFor(d.id, themeOf(d.id))}
                    >
                      {tx('See {name}', { name: tx(d.meta.name) })}
                    </a>
                  )
                )}
              </li>
            ))}
        </ul>
      </Dialog>
    </div>
  );
}

function Themed({
  base,
  sample,
  id,
  theme,
  firstPageOnly,
  title,
}: {
  base: ResumeDocument;
  sample?: string;
  id: DesignId;
  theme: string;
  firstPageOnly?: boolean;
  title: string;
}) {
  const doc = useMemo(() => docInDesign(base, id, theme, sample), [base, id, theme, sample]);
  return <DocumentPreview doc={doc} firstPageOnly={firstPageOnly} debounceMs={0} title={title} />;
}

function PreviewBody({
  item,
  base,
  sample,
  theme,
  onTheme,
  premium,
  current,
  onUse,
}: {
  item: CatalogueItem;
  base: ResumeDocument;
  sample?: string;
  theme: string;
  onTheme: (t: string) => void;
  premium: boolean;
  current: boolean;
  onUse?: () => void;
}) {
  const tx = useT();
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-muted text-sm">
          {tx(item.meta.style)} ·{' '}
          {item.label === 'ats' ? tx('ATS-friendly') : tx('Creative — plain ATS version included')}
          {premium ? ` · ${tx('Premium')}` : ''}
        </p>
        <div role="radiogroup" aria-label={tx('Colours')} className="flex gap-1">
          {themesFor(item.id).map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={theme === t.id}
              aria-label={tx(t.name)}
              title={tx(t.name)}
              onClick={() => onTheme(t.id)}
              className={cn(
                'inline-flex size-9 items-center justify-center rounded-full border-2',
                theme === t.id ? 'border-ink' : 'border-transparent',
              )}
            >
              <span
                className="size-6 rounded-full"
                style={{
                  background: `linear-gradient(135deg, ${t.ink} 0 50%, ${t.accent} 50% 100%)`,
                }}
              />
            </button>
          ))}
        </div>
        {onUse && (
          <Button onClick={onUse} data-testid="use-design" disabled={current && theme === 'own'}>
            {current && theme === 'own' ? tx('In use') : tx('Use this design')}
          </Button>
        )}
      </div>
      {/* Pages 1 and 2 of the person's CV in this design. */}
      <div className="bg-sunken -mx-5 max-h-[calc(100dvh-10rem)] overflow-y-auto px-4 py-4 sm:max-h-[calc(92vh-10rem)]">
        <div className="mx-auto max-w-[640px]" data-testid="design-preview">
          <Themed
            base={base}
            sample={sample}
            id={item.id}
            theme={theme}
            title={tx('Preview of the {name} design', { name: tx(item.meta.name) })}
          />
        </div>
      </div>
    </div>
  );
}
