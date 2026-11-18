'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';

export type FinderItem = {
  slug: string;
  title: string;
  summary: string;
  /** Everything searchable about the guide, lower-cased on the server. */
  text: string;
  category: string;
};
export type FinderGroup = { id: string; title: string; blurb: string; items: FinderItem[] };

/** Search box plus the guides grouped by topic. Typing shows matching guides across all topics. */
export function GuideFinder({ groups }: { groups: FinderGroup[] }) {
  const [q, setQ] = useState('');
  const inputId = useId();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const all = groups.flatMap((g) => g.items);
  const hits = words.length ? all.filter((i) => words.every((w) => i.text.includes(w))) : [];

  const card = (f: FinderItem) => (
    <li key={f.slug} className="border-line bg-surface flex flex-col rounded-2xl border p-5 sm:p-6">
      <h3 className="text-lg font-semibold">
        <Link href={`/how-to/${f.slug}`} className="hover:underline">
          {f.title}
        </Link>
      </h3>
      <p className="text-ink-muted mt-1.5 text-[15px] leading-relaxed">{f.summary}</p>
      <Link
        href={`/how-to/${f.slug}`}
        className="text-violet mt-4 inline-flex items-center gap-1.5 font-semibold underline-offset-2 hover:underline"
      >
        Read the guide <ArrowRight aria-hidden size={16} />
      </Link>
    </li>
  );

  return (
    <div>
      <label htmlFor={inputId} className="sr-only">
        Search the guides
      </label>
      <div className="border-line-strong bg-surface focus-within:border-violet flex items-center gap-3 rounded-xl border px-4">
        <Search aria-hidden size={20} className="text-ink-subtle" />
        <input
          id={inputId}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search: for example ATS, letters, download, German"
          className="min-h-12 w-full bg-transparent text-[16px] outline-none"
        />
      </div>
      <div aria-live="polite" className="mt-6">
        {words.length > 0 ? (
          hits.length > 0 ? (
            <>
              <p className="text-ink-muted text-sm">
                {hits.length} {hits.length === 1 ? 'guide' : 'guides'} found
              </p>
              <ul className="mt-3 grid gap-4 sm:grid-cols-2">{hits.map(card)}</ul>
            </>
          ) : (
            <p className="text-ink-muted">
              Nothing found for that. Try a shorter word, or{' '}
              <Link href="/help" className="text-violet font-semibold underline">
                read the Help questions
              </Link>
              .
            </p>
          )
        ) : (
          <div className="flex flex-col gap-12">
            {groups.map((g) => (
              <section key={g.id} aria-labelledby={`g-${g.id}`}>
                <h3 id={`g-${g.id}`} className="font-display text-2xl font-semibold">
                  {g.title}
                </h3>
                <p className="text-ink-muted mt-1">{g.blurb}</p>
                <ul className="mt-4 grid gap-4 sm:grid-cols-2">{g.items.map(card)}</ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
