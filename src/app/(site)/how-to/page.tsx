import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { JsonLd } from '@/components/seo/json-ld';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/misc';
import { SITE_URL } from '@/lib/seo';
import { ARTICLES } from '@/features/learn/articles';

export const metadata: Metadata = {
  title: 'How to use AI CV Studio: features and video tutorials',
  description:
    'See everything AI CV Studio does and learn it in minutes: start a CV from your kind of work, upload the CV you have to see it redesigned, and switch designs without losing a word.',
  alternates: { canonical: '/how-to' },
};

type Tutorial = {
  id: 'start' | 'makeover' | 'designs';
  title: string;
  summary: string;
  steps: string[];
  seconds: number;
  cta: { href: string; label: string };
};

/** The videos are screen recordings with the steps burned in as captions; the steps are repeated here as text. */
const TUTORIALS: Tutorial[] = [
  {
    id: 'start',
    title: 'Start a CV from your kind of work',
    summary: 'No CV yet? Pick the work you do and answer simple questions, one step at a time.',
    steps: [
      'Open Start and choose the closest kind of work (driving, teaching, healthcare, shops and hotels, trades, office, technology and more).',
      'The studio sets up the right sections and a matching design for that work.',
      'Answer one short step at a time: about you, then your work, education and skills. You can change anything later.',
      'Use Peek at any time to see how the page looks.',
    ],
    seconds: 13,
    cta: { href: '/start', label: 'Start my CV' },
  },
  {
    id: 'makeover',
    title: 'Upload your CV and see it redesigned',
    summary: 'Already have a CV? Drop in the PDF or Word file and see it in a new design.',
    steps: [
      'Open Upload CV and choose your PDF, Word file or a photo of a paper CV (up to 10 MB).',
      'The studio reads it and lays it out again. No sign-in is needed to see the result.',
      'Your words are checked against your file: nothing is added that is not in your CV.',
      'Use Your original and Your new CV to compare. Sign in to save and download it.',
    ],
    seconds: 21,
    cta: { href: '/makeover', label: 'Upload my CV' },
  },
  {
    id: 'designs',
    title: 'Switch designs, keep every word',
    summary: 'Write your CV once, then try any design. Your words never change.',
    steps: [
      'Open your CV and tap Design at the bottom.',
      'Browse the designs recommended for your kind of work, or search by mood and style.',
      'Tap a design to try it. Use Preview to see the whole page.',
      'Every design has a plain ATS version for online application forms.',
    ],
    seconds: 18,
    cta: { href: '/templates', label: 'Browse designs' },
  },
];

const iso = (s: number) => `PT${s}S`;

export default function HowToPage() {
  return (
    // The tutorials are written in English; the surrounding studio text still follows the chosen language.
    <div lang="en">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': TUTORIALS.map((t) => ({
            '@type': 'VideoObject',
            name: t.title,
            description: t.summary,
            thumbnailUrl: `${SITE_URL}/videos/${t.id}.webp`,
            contentUrl: `${SITE_URL}/videos/${t.id}.mp4`,
            uploadDate: '2026-11-18',
            duration: iso(t.seconds),
          })),
        }}
      />
      <Container className="max-w-[920px] py-10 md:py-14">
        <p className="text-violet text-sm font-bold tracking-wider uppercase">Tutorials</p>
        <h1 className="font-display mt-2 text-[34px] leading-tight font-semibold tracking-tight sm:text-5xl">
          How to use AI CV Studio
        </h1>
        <p className="text-ink-muted mt-4 max-w-2xl text-lg leading-relaxed">
          Everything the studio does, in one place. Every guide has a short video, the steps with
          real screens, tips and answers. The videos use a sample CV, not anyone&apos;s real one.
        </p>

        <section id="features" aria-labelledby="features-h" className="mt-12 scroll-mt-24">
          <h2 id="features-h" className="font-display text-2xl font-semibold sm:text-3xl">
            What is inside
          </h2>
          <p className="text-ink-muted mt-2 max-w-2xl">
            Each guide has the steps with real screens, tips and answers. Start with the first
            three; the rest help once you are applying for jobs.
          </p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {ARTICLES.map((f) => (
              <li
                key={f.slug}
                className="border-line bg-surface flex flex-col rounded-2xl border p-5 sm:p-6"
              >
                <h3 className="text-lg font-semibold">
                  <Link href={`/how-to/${f.slug}`} className="hover:underline">
                    {f.title}
                  </Link>
                </h3>
                <p className="text-ink-muted mt-1.5 text-[15px] leading-relaxed">{f.summary}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <Link
                    href={`/how-to/${f.slug}`}
                    className="text-violet inline-flex items-center gap-1.5 font-semibold underline-offset-2 hover:underline"
                  >
                    Read the guide <ArrowRight aria-hidden size={16} />
                  </Link>
                  <Link
                    href={f.open.href}
                    className="text-ink-muted font-semibold underline-offset-2 hover:underline"
                  >
                    {f.open.label}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <h2 className="font-display mt-16 text-2xl font-semibold sm:text-3xl">Video tutorials</h2>

        <div className="mt-12 flex flex-col gap-16">
          {TUTORIALS.map((t, i) => (
            <section key={t.id} aria-labelledby={`t-${t.id}`} className="grid gap-8 md:grid-cols-2">
              <div className="border-line bg-surface mx-auto w-full max-w-[300px] overflow-hidden rounded-2xl border md:max-w-none">
                <video
                  controls
                  playsInline
                  preload="none"
                  poster={`/videos/${t.id}.webp`}
                  width={540}
                  height={960}
                  className="block aspect-[9/16] w-full bg-black"
                >
                  <source src={`/videos/${t.id}.mp4`} type="video/mp4" />
                  <track
                    kind="captions"
                    src={`/videos/${t.id}.vtt`}
                    srcLang="en"
                    label="English"
                    default
                  />
                </video>
              </div>
              <div className="flex flex-col justify-center">
                <p className="text-ink-muted text-sm font-bold">Tutorial {i + 1}</p>
                <h2
                  id={`t-${t.id}`}
                  className="font-display mt-1 text-2xl font-semibold sm:text-3xl"
                >
                  {t.title}
                </h2>
                <p className="text-ink-muted mt-2">{t.summary}</p>
                <ol className="mt-5 flex list-decimal flex-col gap-2.5 pl-5 text-[15.5px] leading-relaxed marker:font-bold">
                  {t.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <div className="mt-6">
                  <ButtonLink href={t.cta.href} iconAfter={<ArrowRight aria-hidden size={18} />}>
                    {t.cta.label}
                  </ButtonLink>
                </div>
              </div>
            </section>
          ))}
        </div>

        <section aria-labelledby="more" className="bg-primary-soft/55 mt-16 rounded-2xl p-7 sm:p-9">
          <h2 id="more" className="font-display text-2xl font-semibold sm:text-3xl">
            More help
          </h2>
          <p className="text-ink-muted mt-2 max-w-xl">
            Read the CV guide for your kind of work, or see the answers to common questions.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/cv-for" variant="secondary">
              CV guides by profession
            </ButtonLink>
            <ButtonLink href="/help" variant="secondary">
              Help and questions
            </ButtonLink>
          </div>
          <p className="text-ink-muted mt-5 text-sm">
            Follow short tips on Instagram:{' '}
            <Link
              href="https://www.instagram.com/aicvstudio.app/"
              className="text-violet font-semibold underline-offset-2 hover:underline"
              rel="noopener"
            >
              @aicvstudio.app
            </Link>
          </p>
        </section>
      </Container>
    </div>
  );
}
