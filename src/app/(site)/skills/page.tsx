import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { Container } from '@/components/ui/misc';
import { SkillsClient } from '@/features/skills/client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Skill plan'), robots: { index: false } };
}

export default async function SkillsPage() {
  const t = await getT();
  return (
    <Container className="py-10 md:py-14">
      <div className="mb-8 flex max-w-2xl flex-col gap-3">
        <h1 className="font-display text-[32px] leading-tight font-semibold tracking-tight sm:text-4xl">
          {t('Skill plan')}
        </h1>
        <p className="text-ink-muted text-lg">
          {t(
            'For the job you want: the skills your CV already shows, what’s missing, and what to learn first.',
          )}
        </p>
      </div>
      <SkillsClient />
    </Container>
  );
}
