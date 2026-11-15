import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { EditorPage } from '@/features/studio/screens';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Edit your CV'), robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorPage id={id} />;
}
