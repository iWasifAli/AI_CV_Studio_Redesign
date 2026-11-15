import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { OfflineScreen } from '@/features/app/offline-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Offline'), robots: { index: false } };
}

export default function Page() {
  return <OfflineScreen />;
}
