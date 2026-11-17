import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { Container } from '@/components/ui/misc';
import { PremiumScreen } from '@/features/premium/premium-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t('Premium'),
    alternates: { canonical: '/premium' },
    description:
      'Every CV design, more downloads and honest AI writing help — a one-time pass, no subscription.',
  };
}

export default function PremiumPage() {
  return (
    <Container className="max-w-[960px] py-10 md:py-14">
      <PremiumScreen />
    </Container>
  );
}
