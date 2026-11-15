import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { StudioHomeClient } from '@/features/studio-home/client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Home'), robots: { index: false } };
}

export default function StudioPage() {
  return <StudioHomeClient />;
}
