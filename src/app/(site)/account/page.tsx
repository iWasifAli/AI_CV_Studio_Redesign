import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { Container } from '@/components/ui/misc';
import { AccountScreen } from '@/features/account/account-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Your account'), robots: { index: false } };
}

export default async function AccountPage() {
  const t = await getT();
  return (
    <Container className="max-w-[760px] py-10 md:py-14">
      <h1 className="font-display mb-6 text-[32px] leading-tight font-semibold tracking-tight sm:text-4xl">
        {t('Account')}
      </h1>
      <AccountScreen />
    </Container>
  );
}
