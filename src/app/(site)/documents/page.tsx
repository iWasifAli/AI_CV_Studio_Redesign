import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/misc';
import { Suspense } from 'react';
import { DocumentsHubClient } from '@/features/library/client';

export const metadata: Metadata = { title: 'Documents', robots: { index: false } };

export default async function DocumentsPage() {
  const t = await getT();
  return (
    <Container className="py-10 md:py-14">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-[32px] leading-tight font-semibold tracking-tight sm:text-4xl">
          {t('Documents')}
        </h1>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/letters/new" variant="secondary">
            {t('New letter')}
          </ButtonLink>
          <ButtonLink href="/start">{t('New CV')}</ButtonLink>
        </div>
      </div>
      <Suspense>
        <DocumentsHubClient />
      </Suspense>
    </Container>
  );
}
