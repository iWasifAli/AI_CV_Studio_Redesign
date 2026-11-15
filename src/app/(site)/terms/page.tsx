import { getT } from '@/i18n/server';
import { rich } from '@/i18n/rich';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui/misc';
import { getBusinessConfig } from '@/modules/billing/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Terms of use') };
}
// Reads the support email from settings (cached 60 s on the server); not baked in at build time.
export const dynamic = 'force-dynamic';

const UPDATED = '12 November 2026';

export default async function TermsPage() {
  const t = await getT();
  const { support } = (await getBusinessConfig()).value;
  const contact = support.email ? (
    <a href={`mailto:${support.email}`}>{support.email}</a>
  ) : (
    t('the contact details on our Help page')
  );
  return (
    <Container className="max-w-[760px] py-10 md:py-14">
      <article className="text-ink-muted [&_a]:text-primary [&_h2]:text-ink [&_strong]:text-ink flex flex-col gap-4 text-[17px] leading-relaxed [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-2 [&_ul]:list-disc [&_ul]:pl-6">
        <h1 className="font-display text-ink text-[32px] leading-tight font-semibold tracking-tight sm:text-4xl">
          {t('Terms of use')}
        </h1>
        <p className="text-sm">{t('Last updated {UPDATED}', { UPDATED: UPDATED })}</p>
        <p>
          {t(
            'These terms explain what you can expect from AI CV Studio and what we expect from you. By creating an account or using the studio you agree to them. Our',
          )}{' '}
          <Link href="/privacy">{t('privacy notice')}</Link>{' '}
          {t('explains how we handle your information.')}
        </p>

        <h2>{t('Your account')}</h2>
        <ul>
          <li>{t('You must be 18 or older to create an account.')}</li>
          <li>
            {t(
              'Keep your sign-in details to yourself. You are responsible for what happens in your account.',
            )}
          </li>
          <li>{t('You can delete your account at any time on the Account page.')}</li>
        </ul>

        <h2>{t('Your CVs are yours')}</h2>
        <p>
          {t(
            'Everything you write stays yours. We only store and process it to provide the studio — to save it, show it, make your PDF and, when you ask, suggest wording.',
          )}
        </p>
        <p>
          {t(
            'You are responsible for what your CV says. Only include true information about yourself. Our AI help is designed not to add facts, and it asks you when a detail is missing — but always read suggestions before you use them, and check your CV before you send it.',
          )}
        </p>

        <h2>{t('Free and Premium')}</h2>
        <ul>
          <li>
            {t('A free account includes the features and monthly allowances shown on the{v}', {
              v: ' ',
            })}
            <Link href="/premium">{t('Premium page')}</Link>
            {t('. Allowances reset each calendar month.')}
          </li>
          <li>
            <strong>{t('Premium is a one-time pass')}</strong>{' '}
            {t(
              'for the number of days you choose. It does not renew automatically and nothing is charged without you paying for a new pass.',
            )}
          </li>
          <li>
            {t(
              'We check payments by hand. Premium starts when your payment is approved. If we can’t find your payment, we tell you why so you can check the details.',
            )}
          </li>
          <li>
            {rich(
              t,
              'If you paid and did not receive Premium, contact us at {contact} with your order number. We will either give you the Premium you paid for or refund the payment.',
              { contact },
            )}
          </li>
          <li>
            {t(
              'When a pass ends, your CVs stay in your account. CVs in a Premium design can be switched to a free design with your words kept.',
            )}
          </li>
          <li>
            {t(
              'We may change prices and allowances for future passes; a pass you already bought keeps what it included.',
            )}
          </li>
        </ul>

        <h2>{t('Discount codes and invites')}</h2>
        <p>
          {t(
            'Discount codes work only on the passes and dates shown when you apply them, and can’t be exchanged for money. When a friend who joined with your invite link has their first Premium pass approved, you get the Premium days shown on your Account page; each friend counts once, and inviting yourself or using fake accounts doesn’t count. We may change or end offers for future purchases at any time.',
          )}
        </p>
        <h2>{t('Fair use')}</h2>
        <p>{t('Please don’t:')}</p>
        <ul>
          <li>{t('use the studio to create false documents or to impersonate someone else;')}</li>
          <li>
            {t('try to get around limits, access other people’s accounts, or disrupt the service;')}
          </li>
          <li>{t('use automated tools to make large numbers of requests.')}</li>
        </ul>
        <p>{t('We may limit or close accounts that break these rules.')}</p>

        <h2>{t('Availability')}</h2>
        <p>
          {t(
            'We work to keep the studio running and your CVs safe, but we can’t promise it will always be available or free of errors. Keep a downloaded copy of any CV you rely on.',
          )}
        </p>

        <h2>{t('Our responsibility')}</h2>
        <p>
          {t(
            'The studio helps you present your experience; it can’t guarantee interviews or jobs. As far as the law allows, we are not responsible for indirect losses. Nothing in these terms limits rights you have by law.',
          )}
        </p>

        <h2>{t('Changes and contact')}</h2>
        <p>
          {rich(
            t,
            'If we change these terms, we will update the date above and, for important changes, tell you in the studio. Questions? Contact us at {contact}.',
            { contact },
          )}
        </p>
      </article>
    </Container>
  );
}
