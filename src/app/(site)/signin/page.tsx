import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Container } from '@/components/ui/misc';
import { SignInScreen } from '@/features/account/signin-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Sign in'), robots: { index: false } };
}

export default function SignInPage() {
  return (
    <Container className="py-10 md:py-16">
      <Suspense>
        <SignInScreen />
      </Suspense>
    </Container>
  );
}
