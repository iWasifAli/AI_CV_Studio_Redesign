import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Container } from '@/components/ui/misc';
import { NewLetterClient } from '@/features/letters/client';

export const metadata: Metadata = { title: 'New letter', robots: { index: false } };

export default async function NewLetterPage() {
  const t = await getT();
  return (
    <Container className="py-10 md:py-14">
      <div className="mb-8 flex max-w-2xl flex-col gap-3">
        <h1 className="font-display text-[32px] leading-tight font-semibold tracking-tight sm:text-4xl">
          {t('Write a letter')}
        </h1>
        <p className="text-ink-muted text-lg">
          {t('Answer a few questions and get a letter in the same design as your CV.')}
        </p>
      </div>
      <Suspense>
        <NewLetterClient />
      </Suspense>
    </Container>
  );
}
