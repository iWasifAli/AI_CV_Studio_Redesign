import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { Container } from '@/components/ui/misc';
import { ProfileSetup } from '@/features/profile/profile-setup';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Career profile'), robots: { index: false } };
}

export default async function ProfilePage() {
  const t = await getT();
  return (
    <Container className="max-w-[900px] py-10 md:py-14">
      <div className="mb-8 flex max-w-2xl flex-col gap-3">
        <h1 className="font-display text-[32px] leading-tight font-semibold tracking-tight sm:text-4xl">
          {t('Your career profile')}
        </h1>
        <p className="text-ink-muted text-lg">
          {t(
            'One master record of your experience, education and skills. Every CV — including ones tailored for a job — starts from it, so you only keep your facts up to date in one place.',
          )}
        </p>
      </div>
      <ProfileSetup />
    </Container>
  );
}
