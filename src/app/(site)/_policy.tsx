import type { ReactNode } from 'react';
import { Container } from '@/components/ui/misc';

/** Shared look for the policy pages (privacy, terms, refund, delivery, contact, services). */
export function PolicyPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <Container className="max-w-[760px] py-10 md:py-14">
      <article className="text-ink-muted [&_a]:text-primary [&_h2]:text-ink [&_strong]:text-ink flex flex-col gap-4 text-[17px] leading-relaxed [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-2 [&_ul]:list-disc [&_ul]:pl-6">
        <h1 className="font-display text-ink text-[32px] leading-tight font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        {updated && <p className="text-sm">{updated}</p>}
        {children}
      </article>
    </Container>
  );
}
