import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, X } from 'lucide-react';
import { JsonLd } from '@/components/seo/json-ld';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/misc';
import { GUIDES, guideBySlug } from '@/features/guides/guides';
import { SITE_URL } from '@/lib/seo';
import { DESIGN_META, isDesignId } from '@/modules/design/designs';
import { PRESETS } from '@/modules/resume/presets';

/** What each kind of section is for, in a line (shared by every guide). */
const SECTION_NOTE: Record<string, string> = {
  experience: 'Your jobs, newest first, with what you did and what it achieved.',
  education: 'Courses and qualifications, with the place and year.',
  skills: 'A short list of what you can do, using the words the job advert uses.',
  languages: 'Languages you speak, and how well.',
  licences: 'Licences you hold, with the category and any renewal date.',
  certifications: 'Registrations, tickets and certificates, with the body that issued them.',
  projects: 'Things you built or organised, and what came of them.',
  volunteering: 'Unpaid work that shows responsibility and initiative.',
  awards: 'Recognition you have received, with the year.',
};

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const g = guideBySlug((await params).slug);
  if (!g) return { title: 'Guide not found', robots: { index: false } };
  return {
    title: g.metaTitle,
    description: g.metaDescription,
    alternates: { canonical: `/cv-for/${g.slug}` },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const g = guideBySlug((await params).slug);
  if (!g) notFound();
  const preset = PRESETS[g.preset];
  const design = preset.design.templateId;
  const designName = isDesignId(design) ? DESIGN_META[design].name : null;
  const others = GUIDES.filter((o) => o.slug !== g.slug);
  const start = `/start?work=${g.preset}`;

  return (
    // The guides are written in English; the surrounding studio text still follows the chosen language.
    <div lang="en">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'AI CV Studio', item: `${SITE_URL}/` },
            { '@type': 'ListItem', position: 2, name: 'CV guides', item: `${SITE_URL}/cv-for` },
            {
              '@type': 'ListItem',
              position: 3,
              name: g.short,
              item: `${SITE_URL}/cv-for/${g.slug}`,
            },
          ],
        }}
      />
      <Container className="max-w-[860px] py-10 md:py-14">
        <p className="text-violet text-sm font-bold tracking-wider uppercase">CV guide</p>
        <h1 className="font-display mt-2 text-[34px] leading-tight font-semibold tracking-tight sm:text-5xl">
          {g.title}
        </h1>
        <p className="text-ink-muted mt-4 max-w-2xl text-lg leading-relaxed">{g.intro}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href={start} size="lg" iconAfter={<ArrowRight aria-hidden size={18} />}>
            Start my CV
          </ButtonLink>
          <ButtonLink href="/makeover" size="lg" variant="secondary">
            Upload the CV I have
          </ButtonLink>
        </div>

        <section aria-labelledby="order" className="mt-14">
          <h2 id="order" className="font-display text-2xl font-semibold sm:text-3xl">
            What goes on it, in order
          </h2>
          <p className="text-ink-muted mt-2">
            This is the order the studio sets up for this kind of work. You can add, remove and
            reorder sections at any time.
          </p>
          <ol className="border-line bg-surface mt-5 divide-y divide-[var(--color-line)] rounded-lg border">
            {preset.sections.map((s, i) => (
              <li key={s.kind + s.title} className="flex gap-4 p-4">
                <span className="bg-primary text-on-primary inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-ink-muted text-[15px]">{SECTION_NOTE[s.kind] ?? ''}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="tips" className="mt-14">
          <h2 id="tips" className="font-display text-2xl font-semibold sm:text-3xl">
            What makes it work
          </h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {g.tips.map((t) => (
              <li key={t.title} className="border-line bg-surface rounded-lg border p-5">
                <h3 className="font-semibold">{t.title}</h3>
                <p className="text-ink-muted mt-1.5 text-[15px] leading-relaxed">{t.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="wording" className="mt-14">
          <h2 id="wording" className="font-display text-2xl font-semibold sm:text-3xl">
            Example wording
          </h2>
          <p className="text-ink-muted mt-2">
            These are the examples the studio shows while you type. They are prompts, not text to
            copy: replace them with what is true for you.
          </p>
          <dl className="border-line bg-primary-soft/40 mt-5 grid gap-4 rounded-lg border p-5 text-[15px]">
            <div>
              <dt className="text-ink-muted text-xs font-bold tracking-wider uppercase">
                Job title
              </dt>
              <dd className="mt-1">{preset.headlineExample}</dd>
            </div>
            <div>
              <dt className="text-ink-muted text-xs font-bold tracking-wider uppercase">
                Personal summary
              </dt>
              <dd className="mt-1">{preset.hints.summary.replace(/^e\.g\.\s*/i, '')}</dd>
            </div>
            <div>
              <dt className="text-ink-muted text-xs font-bold tracking-wider uppercase">
                A line under a job
              </dt>
              <dd className="mt-1">{preset.hints.bullet.replace(/^e\.g\.\s*/i, '')}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="skills" className="mt-14">
          <h2 id="skills" className="font-display text-2xl font-semibold sm:text-3xl">
            Skills people in this line of work list
          </h2>
          <p className="text-ink-muted mt-2">
            The studio suggests these. Add only the ones that are true for you, and match the words
            in the job advert.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2">
            {preset.suggestedSkills.map((s) => (
              <li
                key={s}
                className="border-line bg-surface rounded-full border px-3.5 py-1.5 text-[15px] font-semibold"
              >
                {s}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="mistakes" className="mt-14">
          <h2 id="mistakes" className="font-display text-2xl font-semibold sm:text-3xl">
            Common mistakes
          </h2>
          <ul className="mt-5 flex flex-col gap-3">
            {g.mistakes.map((m) => (
              <li key={m} className="flex gap-3">
                <X aria-hidden size={20} className="text-coral mt-0.5 shrink-0" />
                <span className="text-ink-muted">{m}</span>
              </li>
            ))}
          </ul>
        </section>

        {designName && (
          <section aria-labelledby="design" className="mt-14">
            <h2 id="design" className="font-display text-2xl font-semibold sm:text-3xl">
              A design that suits this work
            </h2>
            <div className="mt-5 flex flex-col items-start gap-6 sm:flex-row">
              <Link
                href={`/templates/${design}`}
                className="border-line bg-surface shadow-1 block w-44 shrink-0 overflow-hidden rounded-md border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static webp */}
                <img
                  src={`/templates/${design}.webp`}
                  alt={`${designName} design, shown with a sample CV`}
                  width={595}
                  height={842}
                  loading="lazy"
                  decoding="async"
                  className="block aspect-[595/842] w-full object-cover object-top"
                />
              </Link>
              <div className="flex flex-col gap-3">
                <p className="text-ink-muted leading-relaxed">
                  When you choose this kind of work, the studio starts you in{' '}
                  <strong className="text-ink">{designName}</strong>. You can switch to any other
                  design at any time without losing a word, and every design has a plain ATS version
                  for online application forms.
                </p>
                <div className="flex flex-wrap gap-3">
                  <ButtonLink href={`/templates/${design}`} variant="secondary">
                    See {designName}
                  </ButtonLink>
                  <ButtonLink href="/templates" variant="ghost">
                    Browse all designs
                  </ButtonLink>
                </div>
              </div>
            </div>
          </section>
        )}

        <section
          aria-labelledby="ready"
          className="bg-primary-soft/55 mt-16 rounded-2xl p-7 sm:p-9"
        >
          <h2 id="ready" className="font-display text-2xl font-semibold sm:text-3xl">
            Ready to write yours?
          </h2>
          <p className="text-ink-muted mt-2 max-w-xl">
            Answer a few simple questions, or upload the CV you already have. You see the result
            before you sign in, and you can download a PDF when you are happy.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={start} size="lg" iconAfter={<ArrowRight aria-hidden size={18} />}>
              Start my CV
            </ButtonLink>
            <ButtonLink href="/makeover" size="lg" variant="secondary">
              Upload the CV I have
            </ButtonLink>
          </div>
        </section>

        <nav aria-labelledby="more" className="mt-14">
          <h2 id="more" className="font-display text-xl font-semibold">
            Guides for other kinds of work
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {others.map((o) => (
              <li key={o.slug}>
                <Link
                  href={`/cv-for/${o.slug}`}
                  className="border-line-strong bg-surface hover:border-violet hover:text-violet inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[15px] font-semibold transition-colors"
                >
                  {o.short}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </div>
  );
}
