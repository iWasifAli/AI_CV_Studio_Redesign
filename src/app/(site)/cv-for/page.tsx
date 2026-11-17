import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui/misc';
import { GUIDES } from '@/features/guides/guides';

export const metadata: Metadata = {
  title: 'CV guides for every kind of work',
  description:
    'Plain-English guides to writing a CV for drivers, teachers, nurses, shop and hotel staff, tradespeople, office workers, developers, managers and students.',
  alternates: { canonical: '/cv-for' },
};

export default function GuidesIndex() {
  return (
    // The guides are written in English; the surrounding studio text still follows the chosen language.
    <div lang="en">
      <Container className="max-w-[860px] py-10 md:py-14">
        <h1 className="font-display text-[34px] leading-tight font-semibold tracking-tight sm:text-5xl">
          CV guides for every kind of work
        </h1>
        <p className="text-ink-muted mt-4 max-w-2xl text-lg leading-relaxed">
          What to put on your CV, in what order and how to word it, written for the kind of work you
          do. Each guide shows the same starting point the studio gives you.
        </p>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/cv-for/${g.slug}`}
                className="border-line bg-surface hover:border-violet block h-full rounded-lg border p-5 transition-colors"
              >
                <h2 className="text-lg font-semibold">{g.short}</h2>
                <p className="text-ink-muted mt-1.5 text-[15px] leading-relaxed">{g.title}</p>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </div>
  );
}
