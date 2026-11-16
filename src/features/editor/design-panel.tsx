'use client';

import { useT } from '@/i18n/client';
import { Check, Crown } from 'lucide-react';
import { isPremiumDesign, useEntitlements } from '@/features/account/entitlements';
import { useId, useMemo, useState } from 'react';
import { SelectableCard } from '@/components/ui/card';
import { StyleAssist } from '@/features/ai/style-assist';
import { CheckboxField } from './fields';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/cn';
import { ops } from '@/modules/resume/ops';
import { browserRegion } from '@/modules/resume/region';
import { FONT_PAIR_IDS, type DesignId, type DesignSpec } from '@/modules/resume/schema';
import { contrast } from '@/modules/templates/color';
import { ACCENT_PALETTE } from '@/modules/templates/design';
import { FONT_PAIRS } from '@/modules/templates/fonts';
import { currentDesignId } from '@/modules/design/catalogue';
import { getTemplate } from '@/modules/templates/registry';
import { DESIGN_META } from '@/modules/design/designs';
import { LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { catalogueItems } from '@/features/gallery/catalogue-model';
import { DesignBrowser } from '@/features/gallery/design-browser';
import { noteChosen } from '@/features/gallery/design-usage';
import { noteRecent, useFavourites, usePopularity } from '@/features/gallery/use-favourites';
import { inTheme } from '@/modules/design/themes';
import { DesignShortlist } from './design-shortlist';
import type { DocumentEditor } from './use-document-editor';
import { DesignStudio } from './design-studio';
import { Designer } from './designer';
import type { PreviewStatus } from '@/features/preview/document-preview';

const FONT_DESCRIPTIONS: Record<(typeof FONT_PAIR_IDS)[number], string> = {
  modern: 'Clean and contemporary',
  classic: 'Traditional and trustworthy',
  humanist: 'Friendly and warm',
  executive: 'Elegant and refined',
  technical: 'Precise and orderly',
  editorial: 'Crisp and editorial',
  bold: 'Strong and direct',
  rounded: 'Soft and approachable',
};

function Group({
  title,
  children,
  hint,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const tx = useT();
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div>
        <h3 id={id} className="text-[17px] font-semibold">
          {tx(title)}
        </h3>
        {hint && <p className="text-ink-muted text-sm">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function DesignPanel({
  editor,
  status = null,
}: {
  editor: DocumentEditor;
  status?: PreviewStatus | null;
}) {
  const tx = useT();
  const { doc, update } = editor;
  const d = doc.design;
  const set = (patch: Partial<DesignSpec>) => update((x) => ops.setDesign(x, patch));
  const template = getTemplate(d.templateId);
  const { ent } = useEntitlements();
  const showPremium = (id: string) =>
    ent !== null && ent.plan !== 'premium' && isPremiumDesign(ent, id);
  const current = currentDesignId(d);
  const meta = current ? DESIGN_META[current] : null;
  const [browsing, setBrowsing] = useState(false);
  const favs = useFavourites();
  const popularity = usePopularity();
  const items = useMemo(
    () => catalogueItems(ent?.designs ?? null, current ?? undefined),
    [ent, current],
  );
  // One undo step: the design and its colour theme change together.
  const use = (id: DesignId, theme = 'own') => {
    update((x) => inTheme(ops.useDesign(x, id), theme === 'own' ? undefined : theme));
    noteChosen(id, theme === 'own' ? undefined : theme);
    noteRecent(id);
  };
  const retired = !!current && ent?.designs.find((x) => x.id === current)?.status === 'retired';
  // The person's CV as the picker previews show it: rebuilt only when the words or their own
  // colour, font, spacing or paper change — not when they pick a design.
  const mineKey = JSON.stringify([
    doc.basics,
    doc.sections,
    d.accent,
    d.fontPair,
    d.density,
    d.pageSize,
  ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt by content key only
  const mine = useMemo(() => doc, [mineKey]);
  const customLow = contrast(d.accent, '#ffffff') < 4.5;

  return (
    <div className="flex flex-col gap-8">
      {ent?.features.designer ? (
        <Designer editor={editor} />
      ) : (
        <StyleAssist
          doc={doc}
          onApply={(c) =>
            set({
              templateId: c.templateId,
              accent: c.accent,
              fontPair: c.fontPair,
              density: c.density,
            })
          }
        />
      )}
      <Group title={tx('Look')} hint={tx('Your words stay the same — only the design changes.')}>
        {retired && (
          <p
            data-testid="design-retired"
            className="bg-sunken text-ink-muted rounded-lg px-3 py-2 text-sm"
          >
            {tx('This design has been retired — you can keep it or choose another.')}
          </p>
        )}
        <DesignShortlist
          doc={doc}
          current={current}
          items={items}
          popularity={popularity}
          favourites={favs.ids}
          showPremium={showPremium}
          onUse={use}
          mine={mine}
        />
        <Button
          variant="secondary"
          onClick={() => setBrowsing(true)}
          data-testid="browse-designs"
          className="self-start"
        >
          <LayoutGrid aria-hidden size={18} /> {tx('Browse all designs')}
        </Button>
        <Dialog
          open={browsing}
          onClose={() => setBrowsing(false)}
          title={tx('All designs')}
          className="h-[100dvh] max-h-none w-screen max-w-none rounded-none sm:h-[94vh] sm:w-[min(100vw-2rem,80rem)] sm:rounded-xl"
        >
          <DesignBrowser
            base={mine}
            label="your CV"
            preset={doc.presetId ?? null}
            current={current}
            onUse={(id, theme) => {
              use(id, theme);
              setBrowsing(false);
            }}
          />
        </Dialog>
        <p className="text-ink-muted text-sm">
          {meta ? tx(meta.description) : tx('Your own design, made in the Design Studio below.')}
        </p>
        {meta && showPremium(meta.id) && (
          <p
            className="text-ink-muted bg-accent-soft rounded-md px-3 py-2 text-sm"
            data-gate="premium-note"
          >
            <Crown aria-hidden size={14} className="text-accent-ink mr-1 inline" />
            {tx(
              'You can try this Premium design freely. Downloading it needs Premium — or pick a free design.',
            )}
          </p>
        )}
        {(meta?.photo ?? true) && doc.basics.photo && (
          <CheckboxField
            label={tx('Show my photo')}
            checked={d.options.showPhoto !== false}
            onChange={(showPhoto) => set({ options: { showPhoto } })}
          />
        )}
      </Group>

      <Group title={tx('Colour')}>
        <div role="radiogroup" aria-label={tx('Accent colour')} className="flex flex-wrap gap-2">
          {ACCENT_PALETTE.map((c) => {
            const selected = d.accent.toLowerCase() === c.hex;
            return (
              <button
                key={c.hex}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={c.name}
                title={c.name}
                onClick={() => set({ accent: c.hex })}
                className={cn(
                  'inline-flex size-11 items-center justify-center rounded-full border-2 transition-transform hover:scale-105',
                  selected ? 'border-ink' : 'border-transparent',
                )}
              >
                <span
                  className="inline-flex size-8 items-center justify-center rounded-full text-white"
                  style={{ background: c.hex }}
                >
                  {selected && <Check aria-hidden size={16} strokeWidth={3} />}
                </span>
              </button>
            );
          })}
          <label className="border-line-strong bg-surface hover:bg-sunken inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border pr-4 pl-1.5 text-sm font-semibold">
            <input
              type="color"
              value={d.accent}
              onChange={(e) =>
                update((x) => ops.setDesign(x, { accent: e.target.value }), 'design.accent')
              }
              className="size-8 cursor-pointer rounded-full border-0 bg-transparent p-0"
              aria-label={tx('Choose any colour')}
            />
            {tx('Other')}
          </label>
        </div>
        {customLow && (
          <p className="text-ink-muted text-sm">
            {tx(
              'This colour is quite light, so we use a slightly darker shade for text to keep it readable.',
            )}
          </p>
        )}
      </Group>

      <Group title={tx('Font')}>
        <div
          role="radiogroup"
          aria-label={tx('Font')}
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {FONT_PAIR_IDS.map((id) => (
            <SelectableCard
              key={id}
              role="radio"
              aria-checked={d.fontPair === id}
              selected={d.fontPair === id}
              onClick={() => set({ fontPair: id })}
              className="p-3"
            >
              <span className="font-semibold">{tx(FONT_PAIRS[id].label)}</span>
              <span className="text-ink-muted pr-6 text-sm">{tx(FONT_DESCRIPTIONS[id])}</span>
            </SelectableCard>
          ))}
        </div>
      </Group>

      <Group title={tx('Layout')}>
        <Segmented
          label={tx('Spacing')}
          value={d.density}
          onChange={(density) => set({ density })}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'airy', label: 'Airy' },
          ]}
        />
        <Segmented
          label={tx('Paper size')}
          value={d.pageSize}
          onChange={(pageSize) => set({ pageSize })}
          options={[
            { value: 'A4', label: 'A4 (most countries)' },
            { value: 'Letter', label: 'Letter (US, Canada)' },
          ]}
        />
        {/* CVs made before paper followed the country may still be on Letter (verification round,
            observation 5): offer A4 when the CV's country, or this browser's, uses it. */}
        {d.pageSize === 'Letter' &&
          (() => {
            const where = doc.market ?? browserRegion();
            return where && where !== 'US' && where !== 'CA' ? (
              <p className="text-ink-muted -mt-2 text-sm" data-testid="paper-hint">
                {tx('Letter is the US and Canadian size; most other countries use A4.')}{' '}
                <button
                  type="button"
                  className="text-primary font-semibold underline-offset-2 hover:underline"
                  onClick={() => set({ pageSize: 'A4' })}
                >
                  {tx('Use A4')}
                </button>
              </p>
            ) : null;
          })()}
        {template.support.headerAlign.length > 1 && (
          <Segmented
            label={tx('Name position')}
            value={d.options.headerAlign ?? template.support.defaults.headerAlign}
            onChange={(headerAlign) => set({ options: { headerAlign } })}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Centre' },
            ]}
          />
        )}
        {template.support.skillStyle.length > 1 && (
          <Segmented
            label={tx('Skills shown as')}
            value={d.options.skillStyle ?? template.support.defaults.skillStyle}
            onChange={(skillStyle) => set({ options: { skillStyle } })}
            options={[
              { value: 'inline', label: 'A list' },
              { value: 'tags', label: 'Labels' },
            ]}
          />
        )}
      </Group>
      {ent?.features.designStudio && <DesignStudio editor={editor} status={status} />}
    </div>
  );
}
