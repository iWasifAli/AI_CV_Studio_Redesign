import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { JsonLd } from '@/components/seo/json-ld';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/misc';
import { SITE_URL } from '@/lib/seo';
import { ARTICLES, VIDEO_SECONDS, articleBySlug, type Shot } from '@/features/learn/articles';

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = articleBySlug((await params).slug);
  if (!a) return {};
  return {
    title: `${a.title}: how to use it | AI CV Studio`,
    description: `${a.summary} ${a.forWho}`,
    alternates: { canonical: `/how-to/${a.slug}` },
  };
}

function Screen({ shot }: { shot: Shot }) {
  return (
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/learn/${shot.file}.webp`}
        alt={shot.alt}
        width={1280}
        height={800}
        loading="lazy"
        decoding="async"
        className="border-line w-full rounded-xl border"
      />
      <figcaption className="text-ink-muted mt-2 text-sm">{shot.caption}</figcaption>
    </figure>
  );
}

export default async function LearnArticlePage({ params }: Props) {
  const a = articleBySlug((await params).slug);
  if (!a) notFound();
  const url = `${SITE_URL}/how-to/${a.slug}`;
  const related = a.related.map((s) => articleBySlug(s)).filter((x) => x !== undefined);
  const inSteps = new Set(a.steps.flatMap((s) => (s.shot === undefined ? [] : [s.shot])));
  const loose = a.shots.filter((_, i) => !inSteps.has(i));

  return (
    // The guides are written in English; the surrounding studio text still follows the chosen language.
    <div lang="en">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'HowTo',
              name: a.title,
              description: a.summary,
              step: a.steps.map((s, i) => ({
                '@type': 'HowToStep',
                position: i + 1,
                name: s.title,
                text: s.text,
              })),
            },
            ...(a.video
              ? [
                  {
                    '@type': 'VideoObject',
                    name: a.title,
                    description: a.summary,
                    thumbnailUrl: `${SITE_URL}/videos/${a.video}.webp`,
                    contentUrl: `${SITE_URL}/videos/${a.video}.mp4`,
                    uploadDate: '2026-11-18',
                    duration: `PT${VIDEO_SECONDS[a.video]}S`,
                  },
                ]
              : []),
            {
              '@type': 'FAQPage',
              mainEntity: a.faqs.map((f) => ({
                '@type': 'Question',
                name: f.q,
                acceptedAnswer: { '@type': 'Answer', text: f.a },
              })),
            },
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
                {
                  '@type': 'ListItem',
                  position: 2,
                  name: 'How to use',
                  item: `${SITE_URL}/how-to`,
                },
                { '@type': 'ListItem', position: 3, name: a.title, item: url },
              ],
            },
          ],
        }}
      />
      <Container className="max-w-[860px] py-10 md:py-14">
        <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
          <Link href="/how-to" className="hover:underline">
            How to use
          </Link>{' '}
          / <span aria-current="page">{a.title}</span>
        </nav>
        <h1 className="font-display mt-3 text-[34px] leading-tight font-semibold tracking-tight sm:text-5xl">
          {a.title}
        </h1>
        <p className="text-ink-muted mt-4 max-w-2xl text-lg leading-relaxed">{a.summary}</p>
        <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed">
          <strong>Who it is for: </strong>
          {a.forWho}
        </p>
        <div className="mt-6">
          <ButtonLink href={a.open.href} iconAfter={<ArrowRight aria-hidden size={18} />}>
            {a.open.label}
          </ButtonLink>
        </div>

        {a.video && (
          <section aria-labelledby="video" className="mt-12">
            <h2 id="video" className="font-display text-2xl font-semibold">
              Watch it in {VIDEO_SECONDS[a.video]} seconds
            </h2>
            <div className="border-line bg-surface mt-4 w-full max-w-[300px] overflow-hidden rounded-2xl border">
              <video
                controls
                playsInline
                preload="none"
                poster={`/videos/${a.video}.webp`}
                width={540}
                height={960}
                className="block aspect-[9/16] w-full bg-black"
              >
                <source src={`/videos/${a.video}.mp4`} type="video/mp4" />
                <track
                  kind="captions"
                  src={`/videos/${a.video}.vtt`}
                  srcLang="en"
                  label="English"
                  default
                />
              </video>
            </div>
          </section>
        )}

        <section aria-labelledby="steps" className="mt-12">
          <h2 id="steps" className="font-display text-2xl font-semibold sm:text-3xl">
            Step by step
          </h2>
          <ol className="mt-6 flex flex-col gap-8">
            {a.steps.map((s, i) => (
              <li key={s.title} className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="bg-primary text-on-primary inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold">{s.title}</h3>
                    <p className="text-ink-muted mt-1 leading-relaxed">{s.text}</p>
                  </div>
                </div>
                {s.shot !== undefined && (
                  <div className="sm:pl-11">
                    <Screen shot={a.shots[s.shot]!} />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>

        {loose.length > 0 && (
          <section aria-labelledby="more-shots" className="mt-12">
            <h2 id="more-shots" className="font-display text-2xl font-semibold">
              More screens
            </h2>
            <div className="mt-4 flex flex-col gap-6">
              {loose.map((sh) => (
                <Screen key={sh.file} shot={sh} />
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="tips" className="bg-primary-soft/55 mt-12 rounded-2xl p-6 sm:p-8">
          <h2 id="tips" className="font-display text-2xl font-semibold">
            Tips
          </h2>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 leading-relaxed">
            {a.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="faq" className="mt-12">
          <h2 id="faq" className="font-display text-2xl font-semibold">
            Questions
          </h2>
          <dl className="mt-4 flex flex-col gap-5">
            {a.faqs.map((f) => (
              <div key={f.q}>
                <dt className="font-semibold">{f.q}</dt>
                <dd className="text-ink-muted mt-1 leading-relaxed">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="next" className="mt-12">
          <h2 id="next" className="font-display text-2xl font-semibold">
            Next
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {related.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/how-to/${r.slug}`}
                  className="border-line bg-surface hover:border-violet block h-full rounded-xl border p-4"
                >
                  <span className="font-semibold">{r.title}</span>
                  <span className="text-ink-muted mt-1 block text-sm">{r.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6">
            <Link
              href="/how-to"
              className="text-violet font-semibold underline-offset-2 hover:underline"
            >
              All guides
            </Link>
          </p>
        </section>
      </Container>
    </div>
  );
}
