import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LinkedinScreen } from '@/features/linkedin/linkedin-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Your LinkedIn profile'), alternates: { canonical: '/linkedin' } };
}

export default function LinkedinPage() {
  return (
    <Suspense>
      <LinkedinScreen />
    </Suspense>
  );
}
