'use client';

import { useT } from '@/i18n/client';
import { HeaderPicture, HeadingPicture, LayoutPicture } from './studio-pictures';
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Bookmark, Minimize2, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAccount } from '@/features/account/account-context';
import type { PreviewStatus } from '@/features/preview/document-preview';
import { cn } from '@/lib/cn';
import { migrateV1 } from '@/modules/design/catalogue';
import { normalise } from '@/modules/design/normalise';
import {
  BACKGROUNDS,
  COMPACT_KINDS,
  CONTAINERS,
  DATE_FORMATS,
  DECOR_KINDS,
  DIVIDERS,
  ENTRY_LAYOUTS,
  HEADER_STYLES,
  HEADING_STYLES,
  INKS,
  LAYOUTS,
  MARKERS,
  type CompactKind,
  type DesignSpecV2,
} from '@/modules/design/spec';
import { DENSITY } from '@/modules/templates/design';
import { currentDesignId } from '@/modules/design/catalogue';
import { DESIGN_META } from '@/modules/design/designs';
import { ops } from '@/modules/resume/ops';
import type { DocumentEditor } from './use-document-editor';
import { cutSuggestions, meetsTarget, type Cut, type PageTarget } from '@/modules/design/fit';
import { Segmented } from '@/components/ui/segmented';
import {
  CommunityGallery,
  MySharedDesigns,
  ShareDesign,
  useCommunity,
} from '@/features/community/community';

type Opt<T extends string | number> = { value: T; label: string };
const words = (v: string) => v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, ' ');
const opts = <T extends string>(vals: readonly T[], labels: Partial<Record<T, string>> = {}) =>
  vals.map((v) => ({ value: v, label: labels[v] ?? words(v) }));

const LAYOUT_LABEL: Partial<Record<(typeof LAYOUTS)[number], string>> = {
  single: 'One column',
  'sidebar-left': 'Side column left',
  'sidebar-right': 'Side column right',
  'two-equal': 'Two columns',
  rails: 'Three columns',
  'label-column': 'Headings in the margin',
  timeline: 'Timeline',
};
const KIND_LABEL: Record<CompactKind, string> = {
  skills: 'Skills',
  languages: 'Languages',
  certifications: 'Certificates',
  licences: 'Licences',
  awards: 'Awards',
};

/** A row of choices (radio group of chips). */
function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
  picture,
}: {
  label: string;
  value: T;
  options: Opt<T>[];
  onChange: (v: T) => void;
  /** Picture tiles (level 2): a small drawing of each choice above its label. */
  picture?: (v: T) => ReactNode;
}) {
  const tx = useT();
  const id = useId();
  if (picture)
    return (
      <div className="flex flex-col gap-1.5">
        <p id={id} className="text-sm font-semibold">
          {tx(label)}
        </p>
        <div
          role="radiogroup"
          aria-labelledby={id}
          className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1.5"
          data-testid="picture-tiles"
        >
          {options.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={o.value === value}
              onClick={() => onChange(o.value)}
              className={cn(
                'text-ink-muted flex flex-col items-center gap-1 rounded-lg border p-1.5 text-center text-xs leading-tight',
                o.value === value
                  ? 'border-primary bg-primary-soft text-primary font-semibold'
                  : 'border-line-strong bg-surface hover:bg-sunken',
              )}
            >
              {picture(o.value)}
              <span>{tx(o.label)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  return (
    <div className="flex flex-col gap-1.5">
      <p id={id} className="text-sm font-semibold">
        {tx(label)}
      </p>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-h-9 rounded-full border px-3 text-sm',
              o.value === value
                ? 'border-primary bg-primary-soft text-primary font-semibold'
                : 'border-line-strong bg-surface hover:bg-sunken',
            )}
          >
            {tx(o.label)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const tx = useT();
  return (
    <label className="flex min-h-9 items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="accent-primary size-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {tx(label)}
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const tx = useT();
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      <span className="flex justify-between">
        {tx(label)}
        <span className="text-ink-muted font-normal tabular-nums">
          {value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-primary min-h-9"
      />
    </label>
  );
}

function Group({
  title,
  children,
  open,
}: {
  title: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details className="border-line rounded-md border px-3 py-2" open={open}>
      <summary className="cursor-pointer py-1 font-semibold">{title}</summary>
      <div className="flex flex-col gap-4 py-3">{children}</div>
    </details>
  );
}

type Saved = { id: string; name: string; spec: DesignSpecV2 };

/**
 * Design Studio (complete-studio-spec §7.7), levels 2 ("Adjust") and 3 ("Fine-tune"), bound to
 * Design Spec v2 fields. A catalogue design stays attached while only its overridable choices
 * change; any other change makes it a custom design (composed), with one click back.
 */
export function DesignStudio({
  editor,
  status,
}: {
  editor: DocumentEditor;
  status: PreviewStatus | null;
}) {
  const tx = useT();
  const { doc, update } = editor;
  const account = useAccount();
  const spec = useMemo(() => doc.design.v2 ?? migrateV1(doc.design), [doc.design]);
  const attached = !!(spec.baseId || spec.designId) && !spec.atsSafe;
  const baseId =
    currentDesignId({ ...doc.design, v2: spec }) ?? spec.origin ?? doc.design.templateId;
  const base = DESIGN_META[baseId];
  const notes = useMemo(() => normalise(spec, doc).unmet, [spec, doc]);

  /** Change the spec. `keepBase`: the change is one the catalogue design accepts as it is. */
  const edit = useCallback(
    (fn: (s: DesignSpecV2) => void, opt: { keepBase?: boolean; key?: string } = {}) => {
      update((x) => {
        const cur = x.design.v2 ?? migrateV1(x.design);
        const next = structuredClone(cur);
        fn(next);
        if (!opt.keepBase) {
          next.origin = cur.designId ?? cur.baseId ?? cur.origin;
          next.baseId = undefined;
          next.designId = undefined;
        }
        return ops.setSpec(x, next);
      }, opt.key);
    },
    [update],
  );

  // ---- Fit to one page
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  const [fitting, setFitting] = useState(false);
  const [fitReport, setFitReport] = useState<string | null>(null);
  const [target, setTarget] = useState<PageTarget>(1);
  const [cuts, setCuts] = useState<Cut[]>([]);
  const pagesWord = (n: number) => (n === 1 ? 'one page' : `${n} pages`);
  const waitForLayout = async (prev: PreviewStatus | null) => {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (statusRef.current && statusRef.current !== prev) return statusRef.current;
    }
    return statusRef.current;
  };
  const fit = async () => {
    setCuts([]);
    if (target === 0) {
      setFitReport('No page limit is set, so nothing needs to change.');
      return;
    }
    if (!statusRef.current || meetsTarget(statusRef.current.pages, target)) {
      setFitReport(`It already fits on ${pagesWord(target)}.`);
      return;
    }
    setFitting(true);
    setFitReport(null);
    const steps: [string, (s: DesignSpecV2) => void, boolean][] = [
      [
        'compact spacing',
        (s) => {
          const d = DENSITY.compact;
          s.spacing = { density: 'compact', sectionGapPt: d.sectionGapPt, itemGapPt: d.itemGapPt };
          s.type.basePt = Math.min(s.type.basePt, d.bodyPt);
          s.type.lineHeight = Math.min(s.type.lineHeight, d.lineHeight);
          s.page.marginMm = Math.min(s.page.marginMm, d.marginMm);
        },
        true,
      ],
      ['skills as a list', (s) => void (s.lists.skills.style = 'inline'), true],
      [
        'smaller gaps',
        (s) => {
          s.spacing.sectionGapPt = Math.max(6, s.spacing.sectionGapPt * 0.75);
          s.spacing.itemGapPt = Math.max(3, s.spacing.itemGapPt * 0.7);
        },
        false,
      ],
      ['narrower margins', (s) => void (s.page.marginMm = Math.min(s.page.marginMm, 11)), false],
      [
        'narrower side column',
        (s) => void (s.layout.sideWidthPct = Math.max(24, s.layout.sideWidthPct - 4)),
        false,
      ],
      [
        'slightly smaller text',
        (s) => {
          s.type.basePt = 9.5;
          s.type.lineHeight = 1.32;
        },
        false,
      ],
    ];
    const done: string[] = [];
    for (const [label, step, keepBase] of steps) {
      if (meetsTarget(statusRef.current?.pages ?? 1, target)) break;
      if (attached && !keepBase) break;
      const prev = statusRef.current;
      edit(step, { keepBase });
      done.push(label);
      await waitForLayout(prev);
    }
    const pages = statusRef.current?.pages ?? 0;
    setFitting(false);
    const changed = done.length ? ` Changed: ${done.join(', ')}.` : '';
    if (meetsTarget(pages, target)) {
      setFitReport(`Now fits on ${pagesWord(target)}.${changed}`);
      return;
    }
    // Spacing alone wasn't enough: suggest content cuts (never made without the person).
    setCuts(cutSuggestions(docRef.current));
    setFitReport(
      `Still ${pages} pages.${changed}${attached ? ' Adjusting the design further (below) or' : ''} Leaving something out will help — the ideas below are only suggestions. Undo puts any change back.`,
    );
  };
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  const applyCut = (c: Cut) => {
    if (!c.apply) return;
    update((x) => c.apply!(x));
    setCuts((cs) => cs.filter((x) => x.key !== c.key));
  };

  // ---- Saved designs
  const [saved, setSaved] = useState<Saved[] | null>(null);
  const [name, setName] = useState('');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const signedIn = account.status === 'signedIn';
  const community = useCommunity();
  const [shareTick, setShareTick] = useState(0);
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    fetch('/api/designs', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { designs: [] }))
      .then((j: { designs: Saved[] }) => live && setSaved(j.designs))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [signedIn]);
  const save = async () => {
    setSaveMsg(null);
    const r = await fetch('/api/designs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, spec }),
    });
    const j = (await r.json().catch(() => null)) as
      | { design: Saved }
      | { error: { message: string } }
      | null;
    if (!r.ok || !j || 'error' in j) {
      setSaveMsg((j && 'error' in j && j.error.message) || 'That didn’t work. Please try again.');
      return;
    }
    setSaved((s) => [j.design, ...(s ?? [])]);
    setName('');
    setSaveMsg(`Saved “${j.design.name}”.`);
  };
  const remove = async (id: string) => {
    const r = await fetch(`/api/designs/${id}`, { method: 'DELETE' });
    if (r.ok) setSaved((s) => (s ?? []).filter((d) => d.id !== id));
  };

  const present = new Set(doc.sections.filter((s) => !s.hidden).map((s) => s.kind as string));
  const placeKinds = COMPACT_KINDS.filter((k) => present.has(k));
  const sideLayout = ['sidebar-left', 'sidebar-right', 'two-equal', 'rails'].includes(
    spec.layout.type,
  );

  return (
    <section aria-labelledby="studio-h" className="flex flex-col gap-4" data-testid="design-studio">
      <div>
        <h3 id="studio-h" className="text-[17px] font-semibold">
          {tx('Design Studio')}
        </h3>
        <p className="text-ink-muted text-sm" data-testid="studio-base">
          {spec.atsSafe
            ? tx('ATS-safe version: one plain column that every screening system reads.')
            : attached
              ? tx('Based on {name}. Changing a choice below makes it your own design.', {
                  name: base.name,
                })
              : tx('Your own design, started from {name}.', { name: base.name })}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Toggle
          label={tx('ATS-safe version')}
          checked={spec.atsSafe}
          onChange={(v) => edit((s) => void (s.atsSafe = v), { keepBase: true })}
        />
        <Segmented
          label={tx('Page target')}
          value={String(target) as '1' | '2' | '0'}
          onChange={(v) => {
            setTarget(Number(v) as PageTarget);
            setFitReport(null);
            setCuts([]);
          }}
          options={[
            { value: '1', label: '1 page' },
            { value: '2', label: '2 pages' },
            { value: '0', label: 'No limit' },
          ]}
        />
        <Button
          size="sm"
          variant="secondary"
          icon={<Minimize2 aria-hidden size={16} />}
          onClick={() => void fit()}
          loading={fitting}
          disabled={target === 0}
          data-testid="fit-pages"
        >
          {target === 2 ? tx('Fit to 2 pages') : tx('Fit to one page')}
        </Button>
        {!attached && !spec.atsSafe && (
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw aria-hidden size={16} />}
            onClick={() => update((x) => ops.useDesign(x, baseId))}
          >
            {tx('Back to {name}', { name: base.name })}
          </Button>
        )}
      </div>
      {fitReport && (
        <p
          className="bg-sunken rounded-md px-3 py-2 text-sm"
          role="status"
          data-testid="fit-report"
        >
          {fitReport}
        </p>
      )}
      {cuts.length > 0 && (
        <ul
          className="flex flex-col gap-1.5 text-sm"
          data-testid="fit-cuts"
          aria-label={tx('Ideas to save space')}
        >
          {cuts.map((c) => (
            <li key={c.key} className="flex flex-wrap items-center justify-between gap-2">
              <span>{tx(c.label)}</span>
              {c.apply && (
                <Button size="sm" variant="ghost" onClick={() => applyCut(c)}>
                  {tx('Do this')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {spec.atsSafe && (
        <p className="text-ink-muted flex items-start gap-1.5 text-sm">
          <ShieldCheck aria-hidden size={16} className="text-primary mt-0.5 shrink-0" />
          {tx('Your other choices are kept. Untick to go back to them.')}
        </p>
      )}
      {notes.length > 0 && (
        <ul className="text-ink-muted list-disc pl-5 text-sm" data-testid="studio-notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      <Group title={tx('Layout')} open>
        <Choice
          label={tx('Columns')}
          value={spec.layout.type}
          options={opts(LAYOUTS, LAYOUT_LABEL)}
          onChange={(v) => edit((s) => void (s.layout.type = v))}
          picture={(v) => <LayoutPicture value={v} />}
        />
        {sideLayout && (
          <>
            <Choice
              label={tx('Side column colour')}
              value={spec.layout.sideFill}
              options={opts(['none', 'tint', 'solid', 'deep'] as const, {
                none: 'None',
                tint: 'Light',
                solid: 'Medium',
                deep: 'Dark',
              })}
              onChange={(v) => edit((s) => void (s.layout.sideFill = v))}
            />
            <Toggle
              label={tx('Colour runs to the page edge')}
              checked={spec.layout.sideBleed}
              onChange={(v) => edit((s) => void (s.layout.sideBleed = v))}
            />
            <Toggle
              label={tx('Keep the side column on every page')}
              checked={spec.layout.continuation === 'keep-columns'}
              onChange={(v) =>
                edit((s) => void (s.layout.continuation = v ? 'keep-columns' : 'full-width'))
              }
            />
          </>
        )}
      </Group>

      <Group title={tx('Header')}>
        <Choice
          label={tx('Style')}
          value={spec.header.style}
          options={opts(HEADER_STYLES, {
            band: 'Colour band',
            'in-sidebar': 'Beside the side column',
          })}
          onChange={(v) => edit((s) => void (s.header.style = v))}
          picture={(v) => <HeaderPicture value={v} />}
        />
        {(spec.header.style === 'band' || spec.header.style === 'in-sidebar') && (
          <Choice
            label={tx('Band')}
            value={spec.header.band}
            options={opts(['solid', 'gradient', 'angled'] as const)}
            onChange={(v) => edit((s) => void (s.header.band = v))}
          />
        )}
        <Choice
          label={tx('Name size')}
          value={spec.header.name.size}
          options={opts(['S', 'M', 'L', 'XL'] as const, {
            S: 'Small',
            M: 'Medium',
            L: 'Large',
            XL: 'Huge',
          })}
          onChange={(v) => edit((s) => void (s.header.name.size = v))}
        />
        <Choice
          label={tx('Name letters')}
          value={spec.header.name.case}
          options={opts(['normal', 'upper', 'small-caps'] as const, {
            upper: 'Capitals',
            'small-caps': 'Small capitals',
          })}
          onChange={(v) => edit((s) => void (s.header.name.case = v))}
        />
        <Toggle
          label={tx('Surname in the accent colour')}
          checked={spec.header.name.twoTone}
          onChange={(v) => edit((s) => void (s.header.name.twoTone = v))}
        />
        <Choice
          label={tx('Contact details')}
          value={spec.header.contact.layout}
          options={opts(['inline', 'stacked', 'grid-2'] as const, {
            inline: 'In a row',
            stacked: 'One per line',
            'grid-2': 'Two columns',
          })}
          onChange={(v) => edit((s) => void (s.header.contact.layout = v))}
        />
        <Toggle
          label={tx('Icons for phone, email and links')}
          checked={spec.header.contact.icons}
          onChange={(v) => edit((s) => void (s.header.contact.icons = v))}
        />
        {doc.basics.photo && (
          <>
            <Choice
              label={tx('Photo shape')}
              value={spec.header.photo.shape}
              options={opts(['circle', 'rounded', 'square'] as const)}
              onChange={(v) => edit((s) => void (s.header.photo.shape = v))}
            />
            <Choice
              label={tx('Photo position')}
              value={spec.header.photo.position}
              options={opts(['header-left', 'header-right', 'side-top', 'overlap'] as const, {
                'header-left': 'Left',
                'header-right': 'Right',
                'side-top': 'Top of side column',
                overlap: 'Over the band',
              })}
              onChange={(v) => edit((s) => void (s.header.photo.position = v))}
            />
          </>
        )}
      </Group>

      <Group title={tx('Colours')}>
        <Choice
          label={tx('Colour use')}
          value={spec.color.mode}
          options={opts(['mono', 'accent', 'duo'] as const, {
            mono: 'Black and white',
            accent: 'One colour',
            duo: 'Two colours',
          })}
          onChange={(v) =>
            edit((s) => {
              s.color.mode = v;
              if (v === 'duo' && !s.color.secondary) s.color.secondary = '#9a4a12';
            })
          }
        />
        {spec.color.mode === 'duo' && (
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="color"
              value={spec.color.secondary ?? '#9a4a12'}
              onChange={(e) =>
                edit((s) => void (s.color.secondary = e.target.value), { key: 'studio.second' })
              }
              className="size-9 cursor-pointer rounded-full border-0 bg-transparent p-0"
            />
            {tx('Second colour (headings)')}
          </label>
        )}
        <Choice
          label={tx('Text colour')}
          value={spec.color.ink}
          options={opts(INKS)}
          onChange={(v) => edit((s) => void (s.color.ink = v))}
        />
        <Choice
          label={tx('Paper')}
          value={spec.page.background}
          options={opts(BACKGROUNDS, { tint: 'Tinted' })}
          onChange={(v) => edit((s) => void (s.page.background = v))}
        />
      </Group>

      <Group title={tx('Headings')}>
        <Choice
          label={tx('Style')}
          value={spec.headings.style}
          options={opts(HEADING_STYLES, {
            'rule-after': 'Line after',
            'bar-left': 'Bar on the left',
            filled: 'Coloured box',
          })}
          onChange={(v) => edit((s) => void (s.headings.style = v))}
          picture={(v) => <HeadingPicture value={v} />}
        />
        <Choice
          label={tx('Letters')}
          value={spec.headings.case}
          options={opts(['normal', 'upper', 'small-caps'] as const, {
            upper: 'Capitals',
            'small-caps': 'Small capitals',
          })}
          onChange={(v) => edit((s) => void (s.headings.case = v))}
        />
        <Choice
          label={tx('Colour')}
          value={spec.headings.color}
          options={opts(['accent', 'ink'] as const, { accent: 'Accent', ink: 'Text colour' })}
          onChange={(v) => edit((s) => void (s.headings.color = v))}
        />
        <Toggle
          label={tx('Icons next to headings')}
          checked={spec.icons.sections}
          onChange={(v) => edit((s) => void (s.icons.sections = v))}
        />
      </Group>

      <Group title={tx('Bullets, dates and skills')}>
        <Choice
          label={tx('Bullets')}
          value={spec.bullets.marker}
          options={opts(MARKERS)}
          onChange={(v) => edit((s) => void (s.bullets.marker = v))}
        />
        <Choice
          label={tx('Dates')}
          value={spec.entries.layout}
          options={opts(ENTRY_LAYOUTS, {
            'dates-right': 'On the right',
            'dates-left': 'On the left',
            stacked: 'Under the title',
            'timeline-dots': 'Timeline',
          })}
          onChange={(v) => edit((s) => void (s.entries.layout = v))}
        />
        <Choice
          label={tx('Date style')}
          value={spec.entries.dateFormat}
          options={opts(DATE_FORMATS)}
          onChange={(v) => edit((s) => void (s.entries.dateFormat = v))}
        />
        <Choice
          label={tx('Job lines start with')}
          value={spec.entries.lead}
          options={opts(['role', 'organisation'] as const, {
            role: 'Job title',
            organisation: 'Employer',
          })}
          onChange={(v) => edit((s) => void (s.entries.lead = v))}
        />
        <Choice
          label={tx('Skills')}
          value={spec.lists.skills.style}
          options={opts(['tags', 'inline', 'columns', 'grouped-list'] as const, {
            tags: 'Labels',
            inline: 'A list',
            'grouped-list': 'One per line',
          })}
          onChange={(v) =>
            edit((s) => void (s.lists.skills.style = v), {
              keepBase: v === 'tags' || v === 'inline',
            })
          }
        />
        <Choice
          label={tx('Short items per row (languages, certificates, licences)')}
          value={spec.lists.compactColumns}
          options={[
            { value: 1 as const, label: 'One' },
            { value: 2 as const, label: 'Two' },
            { value: 3 as const, label: 'Three' },
          ]}
          onChange={(v) => edit((s) => void (s.lists.compactColumns = v))}
        />
      </Group>

      <Group title={tx('Spacing and lines')}>
        <Choice
          label={tx('Sections')}
          value={spec.sections.container}
          options={opts(CONTAINERS, {
            none: 'Plain',
            card: 'Cards',
            outlined: 'Outlined',
            'tinted-heading': 'Tinted headings',
          })}
          onChange={(v) => edit((s) => void (s.sections.container = v))}
        />
        <Choice
          label={tx('Between sections')}
          value={spec.sections.divider}
          options={opts(DIVIDERS, { 'accent-line': 'Coloured line', space: 'Extra space' })}
          onChange={(v) => edit((s) => void (s.sections.divider = v))}
        />
      </Group>

      <Group title={tx('Extras')}>
        <Choice
          label={tx('Decoration')}
          value={
            spec.decor.kind.startsWith('signature:')
              ? 'none'
              : (spec.decor.kind as (typeof DECOR_KINDS)[number])
          }
          options={opts(DECOR_KINDS, {
            'top-bar': 'Top bar',
            'side-stripe': 'Side stripe',
            'corner-shapes': 'Shapes',
            'dot-grid': 'Dots',
            'watermark-initials': 'Initials',
          })}
          onChange={(v) => edit((s) => void (s.decor.kind = v))}
        />
        <Toggle
          label={tx('Page numbers')}
          checked={spec.furniture.pageNumbers}
          onChange={(v) => edit((s) => void (s.furniture.pageNumbers = v))}
        />
        <Toggle
          label={tx('My name at the top of later pages')}
          checked={spec.furniture.runningHeader}
          onChange={(v) => edit((s) => void (s.furniture.runningHeader = v))}
        />
        <Choice
          label={tx('QR code')}
          value={spec.extras.qr}
          options={opts(['none', 'portfolio', 'linkedin'] as const, {
            portfolio: 'My website',
            linkedin: 'LinkedIn',
          })}
          onChange={(v) => edit((s) => void (s.extras.qr = v))}
        />
        <Toggle
          label={tx('“References available on request”')}
          checked={spec.extras.referencesLine}
          onChange={(v) => edit((s) => void (s.extras.referencesLine = v))}
        />
      </Group>

      <Group title={tx('Fine-tune')}>
        <Slider
          label={tx('Page margin')}
          unit=" mm"
          min={10}
          max={22}
          step={1}
          value={spec.page.marginMm}
          onChange={(v) => edit((s) => void (s.page.marginMm = v), { key: 'studio.margin' })}
        />
        <Slider
          label={tx('Text size')}
          unit=" pt"
          min={9.5}
          max={12}
          step={0.1}
          value={spec.type.basePt}
          onChange={(v) => edit((s) => void (s.type.basePt = v), { key: 'studio.size' })}
        />
        <Slider
          label={tx('Line spacing')}
          unit=""
          min={1.3}
          max={1.6}
          step={0.02}
          value={spec.type.lineHeight}
          onChange={(v) => edit((s) => void (s.type.lineHeight = v), { key: 'studio.lh' })}
        />
        <Slider
          label={tx('Space between sections')}
          unit=" pt"
          min={6}
          max={28}
          step={1}
          value={spec.spacing.sectionGapPt}
          onChange={(v) => edit((s) => void (s.spacing.sectionGapPt = v), { key: 'studio.sgap' })}
        />
        <Slider
          label={tx('Space between entries')}
          unit=" pt"
          min={3}
          max={18}
          step={0.5}
          value={spec.spacing.itemGapPt}
          onChange={(v) => edit((s) => void (s.spacing.itemGapPt = v), { key: 'studio.igap' })}
        />
        {sideLayout && (
          <Slider
            label={tx('Side column width')}
            unit="%"
            min={spec.layout.type === 'rails' ? 20 : 24}
            max={spec.layout.type === 'rails' ? 27 : 40}
            step={1}
            value={spec.layout.sideWidthPct}
            onChange={(v) => edit((s) => void (s.layout.sideWidthPct = v), { key: 'studio.side' })}
          />
        )}
        {sideLayout && placeKinds.length > 0 && (
          <div className="flex flex-col gap-2" data-testid="placement">
            <p className="text-sm font-semibold">{tx('Where sections go')}</p>
            {placeKinds.map((k) => {
              const where = spec.placement.side.includes(k)
                ? 'side'
                : spec.placement.third.includes(k)
                  ? 'third'
                  : 'main';
              return (
                <label key={k} className="flex items-center justify-between gap-3 text-sm">
                  {KIND_LABEL[k]}
                  <select
                    className="border-line-strong bg-surface h-9 rounded-md border px-2"
                    value={where}
                    onChange={(e) =>
                      edit((s) => {
                        s.placement.side = s.placement.side.filter((x) => x !== k);
                        s.placement.third = s.placement.third.filter((x) => x !== k);
                        if (e.target.value === 'side') s.placement.side.push(k);
                        if (e.target.value === 'third') s.placement.third.push(k);
                      })
                    }
                  >
                    <option value="main">{tx('Main column')}</option>
                    <option value="side">{tx('Side column')}</option>
                    {spec.layout.type === 'rails' && (
                      <option value="third">{tx('Right column')}</option>
                    )}
                  </select>
                </label>
              );
            })}
          </div>
        )}
      </Group>

      <div className="border-line flex flex-col gap-2 border-t pt-4">
        <p className="font-semibold">{tx('My designs')}</p>
        {!signedIn ? (
          <p className="text-ink-muted text-sm">
            {tx('Sign in to save designs and use them on any CV.')}
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                className="border-line-strong bg-surface h-10 min-w-0 flex-1 rounded-md border px-3 text-sm"
                placeholder={tx('Name this design')}
                aria-label={tx('Design name')}
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
              />
              <Button
                size="sm"
                icon={<Bookmark aria-hidden size={16} />}
                onClick={() => void save()}
                disabled={!name.trim()}
              >
                {tx('Save as my design')}
              </Button>
            </div>
            {saveMsg && (
              <p className="text-sm" role="status" data-testid="save-design-msg">
                {saveMsg}
              </p>
            )}
            {saved && saved.length > 0 && (
              <ul className="flex flex-col gap-1.5" data-testid="my-designs">
                {saved.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                    <button
                      type="button"
                      className="text-primary min-h-9 font-semibold hover:underline"
                      onClick={() => update((x) => ops.setSpec(x, d.spec))}
                    >
                      {tx('Use “{name}”', { name: d.name })}
                    </button>
                    {community && (
                      <ShareDesign design={d} onShared={() => setShareTick((t) => t + 1)} />
                    )}
                    <button
                      type="button"
                      aria-label={tx('Delete {name}', { name: d.name })}
                      className="text-ink-muted hover:text-danger inline-flex size-9 items-center justify-center"
                      onClick={() => void remove(d.id)}
                    >
                      <Trash2 aria-hidden size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {community && <MySharedDesigns tick={shareTick} />}
          </>
        )}
      </div>
      {community && (
        <CommunityGallery
          doc={doc}
          onUse={(d) => {
            update((x) => ops.setSpec(x, d.spec));
            void fetch('/api/community/used', { method: 'POST' }).catch(() => {});
          }}
        />
      )}
    </section>
  );
}
