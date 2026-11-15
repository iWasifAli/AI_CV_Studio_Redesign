import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CreateDocument } from '@/features/start/create-document';
import { StudioLoading } from '@/features/studio/with-document';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Create your CV'), robots: { index: false } };
}

export default function Page() {
  return (
    <Suspense fallback={<StudioLoading />}>
      <CreateDocument />
    </Suspense>
  );
}
