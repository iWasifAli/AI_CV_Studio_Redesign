import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Container } from '@/components/ui/misc';
import { AuthAction } from '@/features/account/auth-action';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Your account'), robots: { index: false } };
}

export default function AuthActionPage() {
  return (
    <Container className="py-10 md:py-16">
      <Suspense>
        <AuthAction />
      </Suspense>
    </Container>
  );
}
