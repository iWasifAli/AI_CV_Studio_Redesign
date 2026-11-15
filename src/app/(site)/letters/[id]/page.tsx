import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Container } from '@/components/ui/misc';
import { LetterScreenClient } from '@/features/letters/client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Letter'), robots: { index: false } };
}

export default async function LetterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Container className="max-w-[1280px] py-8 md:py-10">
      <Suspense>
        <LetterScreenClient id={id} />
      </Suspense>
    </Container>
  );
}
