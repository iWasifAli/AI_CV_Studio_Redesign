import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { PortfolioSettings } from '@/features/portfolio/portfolio-settings';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Your portfolio page'), alternates: { canonical: '/portfolio' } };
}

export default function PortfolioSettingsPage() {
  return <PortfolioSettings />;
}
