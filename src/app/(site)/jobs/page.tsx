import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { JobsBoard } from '@/features/jobs/jobs-board';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Job tracker'), robots: { index: false } };
}

export default async function JobsPage() {
  const t = await getT();
  return (
    <div className="w-full min-w-0 px-5 py-8 sm:px-8 md:py-10">
      <div className="mb-6 flex max-w-2xl flex-col gap-2">
        <h1 className="font-display text-[32px] leading-tight font-semibold tracking-tight sm:text-4xl">
          {t('Job tracker')}
        </h1>
        <p className="text-ink-muted text-lg">
          {t('Every job you’re going for, where you are with it, and which CV you sent.')}
        </p>
      </div>
      <Suspense>
        <JobsBoard />
      </Suspense>
    </div>
  );
}
