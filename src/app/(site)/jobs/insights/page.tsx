import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { Container } from '@/components/ui/misc';
import { BackToJobs, JobInsights } from '@/features/jobs/job-insights';

export const metadata: Metadata = { title: 'Your application results', robots: { index: false } };

export default async function JobInsightsPage() {
  const t = await getT();
  return (
    <Container className="max-w-[1100px] py-10 md:py-14">
      <div className="mb-6 flex max-w-2xl flex-col gap-3">
        <BackToJobs />
        <h1 className="font-display text-[32px] leading-tight font-semibold tracking-tight sm:text-4xl">
          {t('Your application results')}
        </h1>
        <p className="text-ink-muted text-lg">
          {t('What happened to the applications you sent, and which CVs and designs got answers.')}
        </p>
      </div>
      <JobInsights />
    </Container>
  );
}
