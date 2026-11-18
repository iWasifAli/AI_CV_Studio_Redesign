'use client';

import { useWorkspaceState, useWorkspaceScope } from '@/features/workspace/context';

import { useT } from '@/i18n/client';
import Link from '@/features/workspace/navigation';
import { useSearchParams } from 'next/navigation';
import { useWorkspaceRouter as useRouter } from '@/features/workspace/navigation';
import { useEffect, useMemo } from 'react';
import { ArrowLeft, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isPremiumDesign, useEntitlements } from '@/features/account/entitlements';
import { DocumentPreview } from '@/features/preview/document-preview';
import { specOf } from '@/modules/design/designer';
import { DESIGN_META, FAMILY_LABEL } from '@/modules/design/designs';
import { PortfolioPage } from '@/features/portfolio/portfolio-page';
import { FAMILY_THEME, THEME_INFO } from '@/modules/portfolio/themes';
import { buildLetterHtml } from '@/modules/letters/build-letter';
import { ops } from '@/modules/resume/ops';
import type { DesignId } from '@/modules/resume/schema';
import { getRepository } from '@/modules/storage/repository';
import { SAMPLES, inDesign, onlineSafe, useShowWith, type SampleId } from './template-gallery';
import { inTheme, themeById } from '@/modules/design/themes';
import { noteChosen, notePreviewed } from './design-usage';
import { noteRecent } from './use-favourites';

const SAMPLE_LETTER = {
  greeting: 'Dear Hiring Manager,',
  paragraphs: [
    'I am writing to apply for the role advertised on your website. My CV is attached; this letter uses the same colours and fonts, so the two look like one application.',
    'You can write your own letter, or let AI help draft one from your CV for a job you add — it only uses facts from your CV.',
  ],
  closing: 'Kind regards,',
  tone: 'warm' as const,
  email: { subject: '', body: '' },
  documentId: '',
  updatedAt: '',
};

/**
 * One design (complete-studio-spec §8.6): the two-page view with the person's own CV or a sample,
 * the ATS-safe version, the matching cover letter, and one button: "Use this design".
 */
export function DesignDetail({ id }: { id: DesignId }) {
  const t = useT();
  const meta = DESIGN_META[id];
  const router = useRouter();
  const scope = useWorkspaceScope();
  const params = useSearchParams();
  const { ent } = useEntitlements();
  const own = useShowWith();
  const [choice, setChoice] = useWorkspaceState<string | null>(
    'gallery.DesignDetail.choice',
    null,
    { dirty: false },
  );
  const show =
    choice ??
    (params.get('cv') ? `own:${params.get('cv')}` : own[0] ? `own:${own[0].id}` : 'sample:teacher');
  const [view, setView] = useWorkspaceState<'design' | 'ats' | 'letter' | 'portfolio'>(
    'gallery.DesignDetail.view',
    'design',
    { dirty: false },
  );

  const theme = themeById(params.get('theme') ?? undefined)?.id;
  const { doc, ownId } = useMemo(() => {
    if (show.startsWith('own:')) {
      const d = getRepository().get(show.slice(4));
      if (d) return { doc: inTheme(inDesign(d, id), theme), ownId: d.id };
    }
    const k = (show.split(':')[1] ?? 'teacher') as SampleId;
    return {
      doc: inTheme(inDesign((SAMPLES[k] ?? SAMPLES.teacher).doc, id, k), theme),
      ownId: null,
    };
  }, [show, id, theme]);
  useEffect(() => notePreviewed(id, theme), [id, theme]);
  const ats = useMemo(() => ops.setSpec(doc, { ...specOf(doc.design), atsSafe: true }), [doc]);
  const letter = useMemo(
    () =>
      typeof window === 'undefined'
        ? ''
        : buildLetterHtml(
            doc,
            SAMPLE_LETTER,
            { title: '', company: '' },
            {
              fonts: { kind: 'url', baseUrl: window.location.origin },
            },
          ),
    [doc],
  );
  const premium = ent !== null && ent.plan !== 'premium' && isPremiumDesign(ent, id);

  function use() {
    if (ownId) {
      const cv = getRepository().get(ownId);
      if (cv) {
        getRepository().save(inTheme(ops.useDesign(cv, id), theme));
        noteChosen(id, theme, Date.now(), scope);
        noteRecent(id, scope);
        router.push(`/cv/${ownId}`);
        return;
      }
    }
    noteChosen(id, theme, Date.now(), scope);
    noteRecent(id, scope);
    router.push(`/start?design=${id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/templates"
        className="text-primary inline-flex items-center gap-1 self-start font-semibold"
      >
        <ArrowLeft aria-hidden size={16} /> {t('All designs')}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-display text-[32px] leading-tight font-semibold tracking-tight">
            {t(meta.name)} <span className="text-ink-muted font-normal">· {t(meta.style)}</span>
          </h1>
          <p className="text-ink-muted mt-2 text-lg">{t(meta.description)}</p>
          <p className="text-ink-muted mt-1 text-sm">
            {t(FAMILY_LABEL[meta.family].name)} – {t(FAMILY_LABEL[meta.family].hint)} ·{' '}
            {meta.columns > 1 ? t('{n} columns', { n: meta.columns }) : t('1 column')}
            {meta.photo ? ` · ${t('photo')}` : ''} ·{' '}
            {onlineSafe(meta)
              ? t('best for online applications')
              : meta.family === 'graphic'
                ? t('creative: made to be seen by people; download its ATS PDF for online forms')
                : t('has an ATS-safe version for online forms')}
          </p>
          {premium && (
            <p className="bg-accent-soft mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm">
              <Crown aria-hidden size={14} />{' '}
              {t('A Premium design. You can try it freely; downloading it needs Premium.')}
            </p>
          )}
        </div>
        <Button onClick={use} data-testid="use-design">
          {ownId ? t('Use this design for my CV') : t('Use this design')}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex max-w-full min-w-0 flex-col gap-1.5 text-sm font-semibold">
          {t('Show it with')}
          <select
            value={show}
            onChange={(e) => setChoice(e.target.value)}
            className="border-line-strong bg-surface min-h-11 w-full max-w-full truncate rounded-md border px-3 text-[15px] font-normal sm:w-auto sm:max-w-md"
          >
            {own.map((c) => (
              <option key={c.id} value={`own:${c.id}`}>
                {t('My CV: {label}', { label: c.label })}
              </option>
            ))}
            {(Object.keys(SAMPLES) as SampleId[]).map((k) => (
              <option key={k} value={`sample:${k}`}>
                {t('An example {v} CV', { v: SAMPLES[k].label.toLowerCase() })}
              </option>
            ))}
          </select>
        </label>
        <div role="tablist" aria-label={t('View')} className="flex gap-1">
          {(
            [
              ['design', 'The design'],
              ['ats', 'ATS-safe version'],
              ['letter', 'Matching cover letter'],
              ['portfolio', 'Matching portfolio page'],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={
                view === v
                  ? 'bg-primary text-on-primary rounded-full px-3 py-1.5 text-sm font-semibold'
                  : 'border-line-strong text-ink-muted hover:bg-sunken rounded-full border px-3 py-1.5 text-sm font-semibold'
              }
            >
              {t(l)}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl" role="tabpanel">
        {view === 'design' && (
          <DocumentPreview
            doc={doc}
            debounceMs={0}
            title={t('{name} design, all pages', { name: meta.name })}
          />
        )}
        {view === 'ats' && (
          <>
            <p className="text-ink-muted mb-3 text-sm">
              {t(
                'One plain column with standard headings, for online application forms and screening software. Turn it on or off any time in the Design Studio.',
              )}
            </p>
            <DocumentPreview
              doc={ats}
              debounceMs={0}
              title={t('{name}, ATS-safe version', { name: meta.name })}
            />
          </>
        )}
        {view === 'portfolio' && (
          <>
            <p className="text-ink-muted mb-3 text-sm">
              {t(
                'Your portfolio page (Premium) uses the {name}{v} theme with this design: {v2}.{v3}',
                {
                  name: THEME_INFO[FAMILY_THEME[meta.family]].name,
                  v: ' ',
                  v2: THEME_INFO[FAMILY_THEME[meta.family]].hint.toLowerCase(),
                  v3: ' ',
                },
              )}
              <a
                href={`/portfolio-themes/${FAMILY_THEME[meta.family]}`}
                target="_blank"
                rel="noopener"
                className="text-primary font-semibold underline underline-offset-4"
              >
                {t('Open a full-size sample')}
              </a>
            </p>
            <section
              className="border-line h-[720px] overflow-auto rounded-lg border"
              aria-label={t('Portfolio page in the {name} theme', {
                name: THEME_INFO[FAMILY_THEME[meta.family]].name,
              })}
              tabIndex={0}
              data-testid="portfolio-theme-view"
            >
              <PortfolioPage
                doc={doc}
                theme={FAMILY_THEME[meta.family]}
                portfolio={{ slug: 'sample', showEmail: false, showPhone: false }}
                embedded
              />
            </section>
          </>
        )}
        {view === 'letter' && letter && (
          <iframe
            title={t('Cover letter in the {name} colours and fonts', { name: meta.name })}
            sandbox="allow-scripts"
            srcDoc={letter}
            className="shadow-page aspect-[210/297] w-full rounded-[4px] bg-white"
          />
        )}
      </div>
    </div>
  );
}
