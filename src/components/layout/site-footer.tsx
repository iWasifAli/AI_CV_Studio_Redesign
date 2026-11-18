'use client';

import { useT } from '@/i18n/client';
import Link from 'next/link';
import { Container } from '@/components/ui/misc';
import { LanguageSwitch } from '@/i18n/language-switch';
import { Logo } from './logo';

export function SiteFooter() {
  const t = useT();
  return (
    <footer className="border-line bg-surface mt-24 border-t">
      <Container className="flex flex-col gap-8 py-10 md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-sm flex-col gap-3">
          <Logo />
          <p className="text-ink-muted text-sm">
            {t(
              'A professional CV in your own words. Honest by design, and kept safe in your account.',
            )}
          </p>
        </div>
        <nav aria-label={t('Footer')} className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
          <Link className="text-ink-muted hover:text-ink" href="/start">
            {t('Create a CV')}
          </Link>
          <Link className="text-ink-muted hover:text-ink" href="/templates">
            {t('Designs')}
          </Link>
          <Link className="text-ink-muted hover:text-ink" href="/how-to">
            {t('How to use')}
          </Link>
          <Link className="text-ink-muted hover:text-ink" href="/cv-for">
            {t('CV guides')}
          </Link>
          <Link className="text-ink-muted hover:text-ink" href="/help">
            {t('Help')}
          </Link>
          <Link className="text-ink-muted hover:text-ink" href="/privacy">
            {t('Privacy')}
          </Link>
          <Link className="text-ink-muted hover:text-ink" href="/premium">
            {t('Premium')}
          </Link>
          <Link className="text-ink-muted hover:text-ink" href="/terms">
            {t('Terms')}
          </Link>
          <Link className="text-ink-muted hover:text-ink" href="/refund">
            {t('Refunds')}
          </Link>
          <Link className="text-ink-muted hover:text-ink" href="/delivery">
            {t('Delivery')}
          </Link>
          <Link className="text-ink-muted hover:text-ink" href="/services">
            {t('Services and prices')}
          </Link>
          <Link className="text-ink-muted hover:text-ink" href="/contact">
            {t('Contact')}
          </Link>
        </nav>
      </Container>
      <Container className="border-line text-ink-subtle flex flex-wrap items-center justify-between gap-3 border-t py-5 text-xs">
        <span>{t('© {v} AI CV Studio', { v: new Date().getFullYear() })}</span>
        <LanguageSwitch />
      </Container>
    </footer>
  );
}
