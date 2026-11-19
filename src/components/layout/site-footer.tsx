'use client';

import { useT } from '@/i18n/client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Container } from '@/components/ui/misc';
import { LanguageSwitch } from '@/i18n/language-switch';
import { Logo } from './logo';

type Contact = { email: string; phone: string };
let contactPromise: Promise<Contact> | null = null;
/** The public email and phone, read once per page load (they are edited in the admin console). */
function loadContact(): Promise<Contact> {
  contactPromise ??= fetch('/api/contact')
    .then((r) => (r.ok ? (r.json() as Promise<Contact>) : { email: '', phone: '' }))
    .catch(() => ({ email: '', phone: '' }));
  return contactPromise;
}

export function SiteFooter() {
  const t = useT();
  const [contact, setContact] = useState<Contact | null>(null);
  useEffect(() => {
    let live = true;
    loadContact().then((c) => live && setContact(c));
    return () => {
      live = false;
    };
  }, []);
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
        {contact && (contact.email || contact.phone) && (
          <span data-testid="footer-contact" className="flex flex-wrap gap-x-4">
            {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
            {contact.phone && (
              <a href={`tel:+${contact.phone.replace(/\D/g, '')}`}>{contact.phone}</a>
            )}
          </span>
        )}
        <LanguageSwitch />
      </Container>
    </footer>
  );
}
