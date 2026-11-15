import type { Metadata } from 'next';
import { OfflineScreen } from '@/features/app/offline-screen';

export const metadata: Metadata = { title: 'Offline', robots: { index: false } };

export default function Page() {
  return <OfflineScreen />;
}
