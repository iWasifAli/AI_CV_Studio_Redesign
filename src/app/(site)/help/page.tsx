import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui/misc';
import { getBusinessConfig } from '@/modules/billing/server';
import { InstallApp } from '@/features/app/install-app';

export const metadata: Metadata = { title: 'Help' };

// Reads the support email from settings (cached 60 s on the server); not baked in at build time.
export const dynamic = 'force-dynamic';

export default async function HelpPage() {
  const t = await getT();
  const cfg = (await getBusinessConfig()).value;
  const { email } = cfg.support;
  const FAQ = cfg.content.faq;
  return (
    <Container className="max-w-[760px] py-10 md:py-14">
      <h1 className="font-display text-[32px] leading-tight font-semibold tracking-tight sm:text-4xl">
        {t('Help')}
      </h1>
      <p className="text-ink-muted mt-3 text-lg">
        {t('Short answers to the questions people ask most.')}
      </p>
      <div className="divide-line border-line bg-surface mt-8 flex flex-col divide-y rounded-lg border">
        {FAQ.map((item) => (
          <details
            key={item.q}
            className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm text-[17px] font-semibold">
              {item.q}
              <span
                aria-hidden
                className="text-ink-subtle text-xl transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="text-ink-muted mt-3">{item.a}</p>
          </details>
        ))}
      </div>
      <div className="mt-8">
        <InstallApp />
      </div>
      {email && (
        <p className="mt-8" data-testid="support-contact">
          {t('Still stuck? Email us at{v}', { v: ' ' })}
          <a
            href={`mailto:${email}`}
            className="text-primary font-semibold underline underline-offset-4"
          >
            {email}
          </a>
          .
        </p>
      )}
      <p className="text-ink-muted mt-4">
        {t('Read how we handle your information in our{v}', { v: ' ' })}
        <Link href="/privacy" className="text-primary font-semibold underline underline-offset-4">
          {t('privacy notice')}
        </Link>{' '}
        {t('and the{v}', { v: ' ' })}
        <Link href="/terms" className="text-primary font-semibold underline underline-offset-4">
          {t('terms of use')}
        </Link>
        .
      </p>
    </Container>
  );
}
