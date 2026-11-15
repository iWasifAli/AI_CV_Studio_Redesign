import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PortfolioPreview } from '@/features/portfolio/portfolio-preview';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t('Preview your portfolio page'),
    robots: { index: false, follow: false },
  };
}

export default function PortfolioPreviewRoute() {
  return (
    <Suspense>
      <PortfolioPreview />
    </Suspense>
  );
}
