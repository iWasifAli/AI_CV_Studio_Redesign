import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';
import { SITE_URL } from '@/lib/seo';
import Link from 'next/link';
import { Suspense } from 'react';
import { InvitedNote } from '@/features/referrals/invited-note';
import {
  ArrowRight,
  Download,
  FileCheck2,
  Layers,
  MessageSquareText,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/misc';
import { StudioPreview } from '@/features/home/studio-preview';
import { LandingDrop } from '@/features/makeover/landing-drop';
import { ContinueCardClient } from '@/features/library/client';
import { PROFESSIONS } from '@/modules/resume/professions';
import { DEFAULT_CONFIG } from '@/modules/billing/config';
import { isLive } from '@/modules/design/lifecycle';

const DESIGN_COUNT = DEFAULT_CONFIG.designs.filter(isLive).length;

/** Real designs from the catalogue (their stored thumbnails), each showing the same sample CV. */
const SHOWCASE = [
  { id: 'atelier', name: 'Atelier', note: 'Elegant' },
  { id: 'violet', name: 'Violet', note: 'Creative' },
  { id: 'heritage', name: 'Heritage', note: 'Classic' },
  { id: 'terra', name: 'Terra', note: 'Warm' },
  { id: 'folio', name: 'Folio', note: 'Editorial' },
] as const;

const PILLARS = [
  {
    icon: Sparkles,
    title: 'Writing help that stays honest',
    body: 'Improve and tighten your wording. It never invents jobs, dates, qualifications or numbers.',
  },
  {
    icon: Layers,
    title: 'Professional designs',
    body: 'Each design shows your own CV, so you choose by what it really looks like.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Make it yours',
    body: 'Change colours, columns, headings and spacing — and see the page update as you go.',
  },
  {
    icon: FileCheck2,
    title: 'More than a CV',
    body: 'Cover letters and a job tracker sit alongside your CV, in the same place.',
  },
];

const STEPS = [
  {
    icon: Upload,
    title: 'Upload the CV you have',
    body: 'A PDF, a Word file or a photo of a paper CV. No CV yet? Tell us what you do and answer a few simple questions instead.',
  },
  {
    icon: Palette,
    title: 'Pick a design',
    body: 'We choose designs that suit your kind of work and show your CV in each one. Change colours, fonts or the whole look in one tap.',
  },
  {
    icon: Download,
    title: 'Download and send',
    body: 'Get a PDF that looks exactly like the preview and prints perfectly.',
  },
];

const PROMISES = [
  {
    icon: ShieldCheck,
    title: 'Honest by design',
    body: 'Our writing help improves your words. It never invents jobs, dates, qualifications or numbers.',
  },
  {
    icon: FileCheck2,
    title: 'Readable by hiring systems',
    body: 'Every design keeps real, selectable text, and each one comes with a plain one-column ATS version for online application forms.',
  },
  {
    icon: MessageSquareText,
    title: 'Yours, wherever you are',
    body: 'Without an account your CV stays in this browser; signed in, it is saved to your account too. You can download a backup at any time.',
  },
];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: { absolute: t('AI CV Studio — Build and design a professional CV') },
    description: t(
      'Upload your CV or answer a few questions, improve the wording with AI that never invents facts, choose from {n} designs and download a PDF.',
      { n: DESIGN_COUNT },
    ),
    alternates: { canonical: '/' },
  };
}

export default async function HomePage() {
  const t = await getT();
  return (
    <div className="landing bg-paper">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Organization',
              '@id': `${SITE_URL}/#org`,
              name: 'AI CV Studio',
              url: SITE_URL,
              logo: `${SITE_URL}/icons/icon-512.png`,
            },
            {
              '@type': 'WebSite',
              '@id': `${SITE_URL}/#site`,
              url: SITE_URL,
              name: 'AI CV Studio',
              publisher: { '@id': `${SITE_URL}/#org` },
            },
            {
              '@type': 'WebApplication',
              name: 'AI CV Studio',
              url: SITE_URL,
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Any (web browser)',
              description:
                'Build, improve and design a professional CV with AI help that never invents facts, then download it as a PDF.',
              publisher: { '@id': `${SITE_URL}/#org` },
            },
          ],
        }}
      />
      <section className="relative overflow-hidden">
        {/* Soft colour behind the studio picture: lavender into peach, kept pale. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-40 h-[560px] w-[760px] opacity-70 blur-2xl"
          style={{
            background:
              'radial-gradient(ellipse at center, #e9dbf5 0%, #f8e4de 46%, transparent 72%)',
          }}
        />
        <Container className="relative grid grid-cols-[minmax(0,1fr)] items-center gap-12 pt-10 pb-16 md:pt-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10 lg:pt-16 lg:pb-24">
          <div className="landing-rise flex min-w-0 flex-col items-start gap-6">
            <Suspense>
              <InvitedNote />
            </Suspense>
            {/* The "Continue" card loads after the page; its space is kept before the first paint
                when this browser has a saved CV, so the hero doesn't jump (audit F-17). */}
            <div className="hidden w-full has-[a]:block" suppressHydrationWarning>
              <script
                dangerouslySetInnerHTML={{
                  __html: `try{for(var i=0;i<localStorage.length;i++)if((localStorage.key(i)||'').indexOf('cvstudio:v1:doc:')===0){var s=document.currentScript.parentNode.style;s.display='block';s.minHeight='66px';break}}catch(e){}`,
                }}
              />
              <ContinueCardClient />
            </div>
            <span className="bg-accent-soft text-accent-ink inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold">
              <Sparkles aria-hidden size={15} /> {t('A complete CV design studio')}
            </span>
            <h1 className="font-display text-ink text-[44px] leading-[1.04] font-semibold tracking-tight sm:text-6xl lg:text-[68px]">
              {t('Your Career.')}
              <br />
              {t('Your Story.')}
              <br />
              <span className="text-violet italic">{t('Your Studio.')}</span>
            </h1>
            <p className="text-ink-muted max-w-[32rem] text-lg leading-relaxed">
              {t(
                'Write with AI that never makes things up, choose from {n} professional designs, and make every detail your own — all in one studio.',
                { n: DESIGN_COUNT },
              )}
            </p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <ButtonLink href="/start" size="lg" iconAfter={<ArrowRight aria-hidden size={18} />}>
                {t('Open CV Studio')}
              </ButtonLink>
              <ButtonLink href="/templates" size="lg" variant="secondary">
                {t('Explore templates')}
              </ButtonLink>
            </div>
            <div className="w-full max-w-[32rem]">
              <LandingDrop />
            </div>
            <p className="text-ink-subtle text-sm">
              {t('No sign-in needed to see the result. Works on your phone.')}
            </p>
          </div>
          <StudioPreview />
        </Container>
      </section>

      <section aria-labelledby="pillars" id="studio">
        <h2 id="pillars" className="sr-only">
          {t('What the studio gives you')}
        </h2>
        <Container className="py-4 lg:py-8">
          <ul className="border-line grid gap-8 border-y py-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-[var(--color-line)]">
            {PILLARS.map((p) => (
              <li key={p.title} className="flex flex-col gap-2 lg:px-7 lg:first:pl-0 lg:last:pr-0">
                <p.icon aria-hidden size={26} className="text-accent" />
                <h3 className="text-base font-semibold">{t(p.title)}</h3>
                <p className="text-ink-muted text-[15px]">{t(p.body)}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="designs">
        <Container className="py-14 lg:py-20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-3 md:max-w-xl">
              <h2
                id="designs"
                className="font-display text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                {t('Designs for')} <span className="text-violet italic">{t('every career')}</span>
              </h2>
              <p className="text-ink-muted text-lg">
                {t('Real designs from the studio, shown with the same sample CV.')}
              </p>
            </div>
            <ButtonLink
              href="/templates"
              variant="secondary"
              iconAfter={<ArrowRight aria-hidden size={18} />}
            >
              {t('Browse all designs')}
            </ButtonLink>
          </div>
          <ul className="mt-10 grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-5">
            {SHOWCASE.map((d, i) => (
              <li key={d.id} className="max-md:last:hidden">
                <Link
                  href="/templates"
                  className="group flex flex-col gap-3 rounded-lg focus-visible:outline-offset-4"
                >
                  <span className="border-line bg-surface shadow-1 group-hover:shadow-page block overflow-hidden rounded-md border transition-[transform,box-shadow] duration-300 ease-[var(--ease-studio)] group-hover:-translate-y-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static webp */}
                    <img
                      src={`/templates/${d.id}.webp`}
                      alt={t('{name} design, shown with a sample CV', { name: d.name })}
                      width={595}
                      height={842}
                      loading={i < 3 ? 'eager' : 'lazy'}
                      decoding="async"
                      className="block aspect-[595/842] w-full object-cover object-top"
                    />
                  </span>
                  <span className="flex items-baseline justify-between px-0.5">
                    <span className="text-[15px] font-semibold">{d.name}</span>
                    <span className="text-ink-subtle text-sm">{t(d.note)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="how" id="how" className="px-4 sm:px-6">
        <div className="bg-primary-soft/55 mx-auto max-w-[1180px] rounded-3xl py-14 lg:py-16">
          <Container>
            <h2
              id="how"
              className="font-display text-center text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              {t('From the CV you have to one you’re proud of')}
            </h2>
            <ol className="mt-12 grid gap-8 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex flex-col items-start gap-3">
                  <div className="flex items-center gap-3">
                    <span className="bg-primary text-on-primary inline-flex size-10 items-center justify-center rounded-full text-base font-bold">
                      {i + 1}
                    </span>
                    <s.icon aria-hidden size={22} className="text-violet" />
                  </div>
                  <h3 className="text-lg font-semibold">{t(s.title)}</h3>
                  <p className="text-ink-muted">{t(s.body)}</p>
                </li>
              ))}
            </ol>
          </Container>
        </div>
      </section>

      <section aria-labelledby="every-job">
        <Container className="py-16 lg:py-20">
          <div className="flex flex-col gap-3 md:max-w-2xl">
            <h2
              id="every-job"
              className="font-display text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              {t('Made for every kind of work')}
            </h2>
            <p className="text-ink-muted text-lg">
              {t(
                'Choose yours and we’ll ask the right questions — licences for drivers, registration for nurses, projects for students.',
              )}
            </p>
          </div>
          <ul className="mt-8 flex flex-wrap gap-3">
            {PROFESSIONS.filter((p) => p.id !== 'general').map((p) => (
              <li key={p.id}>
                <Link
                  href={`/start?work=${p.id}`}
                  className="border-line-strong bg-surface text-ink hover:border-violet hover:bg-primary-soft hover:text-violet inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] font-semibold transition-colors"
                >
                  {t(p.name)}
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="promise">
        <Container className="pb-4">
          <h2
            id="promise"
            className="font-display text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            {t('What we promise')}
          </h2>
          <ul className="mt-8 grid gap-6 md:grid-cols-3">
            {PROMISES.map((p) => (
              <li
                key={p.title}
                className="border-line bg-surface flex flex-col gap-3 rounded-lg border p-6"
              >
                <p.icon aria-hidden size={24} className="text-violet" />
                <h3 className="text-lg font-semibold">{t(p.title)}</h3>
                <p className="text-ink-muted">{t(p.body)}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="cta">
        <Container className="flex flex-col items-start gap-6 py-16 md:flex-row md:items-center md:justify-between lg:py-24">
          <div className="flex flex-col gap-2">
            <h2 id="cta" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {t('Ready to tell your story beautifully?')}
            </h2>
            <p className="text-ink-muted text-lg">
              {t('Start now — you can stop and come back whenever you like.')}
            </p>
          </div>
          <ButtonLink href="/start" size="lg" iconAfter={<ArrowRight aria-hidden size={18} />}>
            {t('Create my CV')}
          </ButtonLink>
        </Container>
      </section>
    </div>
  );
}
