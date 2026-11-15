import { getT } from '@/i18n/server';
import { ButtonLink } from '@/components/ui/button';
import { Logo } from '@/components/layout/logo';

export default async function NotFound() {
  const t = await getT();
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center"
    >
      <Logo />
      <h1 className="font-display text-3xl font-semibold">
        {t('We couldn&apos;t find that page')}
      </h1>
      <p className="text-ink-muted max-w-md">
        {t('The link may be old or mistyped. Your saved CVs are safe.')}
      </p>
      <div className="flex gap-3">
        <ButtonLink href="/">{t('Go to the home page')}</ButtonLink>
        <ButtonLink href="/documents" variant="secondary">
          {t('Documents')}
        </ButtonLink>
      </div>
    </main>
  );
}
