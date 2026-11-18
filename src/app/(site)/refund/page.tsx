import { getT } from '@/i18n/server';
import { rich } from '@/i18n/rich';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getBusinessConfig } from '@/modules/billing/server';
import { PolicyPage } from '../_policy';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Refund and cancellation policy'), alternates: { canonical: '/refund' } };
}
export const dynamic = 'force-dynamic';

const UPDATED = '18 November 2026';

export default async function RefundPage() {
  const t = await getT();
  const { email } = (await getBusinessConfig()).value.support;
  const contact = <Link href="/contact">{email || t('our Contact page')}</Link>;
  return (
    <PolicyPage
      title={t('Refund and cancellation policy')}
      updated={t('Last updated {UPDATED}', { UPDATED })}
    >
      <p>
        {t(
          'AI CV Studio is free to use. Premium is an optional, one-time digital pass for a set number of days. This page explains when you can get your money back.',
        )}
      </p>
      <h2>{t('Cancelling')}</h2>
      <ul>
        <li>
          {t(
            'A Premium pass never renews by itself, so there is nothing to cancel and nothing is charged again unless you buy a new pass.',
          )}
        </li>
        <li>{t('Your free CVs and account stay yours whether or not you buy Premium.')}</li>
      </ul>
      <h2>{t('When we refund you in full')}</h2>
      <ul>
        <li>{t('You paid and your Premium was not activated.')}</li>
        <li>{t('You were charged more than once for the same pass.')}</li>
        <li>
          {t(
            'Premium does not work as described and we could not fix it within 3 working days of your report.',
          )}
        </li>
        <li>
          {t(
            'You ask within 24 hours of paying and you have not used any Premium design, download or allowance.',
          )}
        </li>
      </ul>
      <h2>{t('When we do not refund')}</h2>
      <ul>
        <li>
          {t(
            'You have already used the pass (for example downloaded CVs in a Premium design) and it worked as described.',
          )}
        </li>
        <li>{t('You changed your mind after using Premium, or the pass has ended.')}</li>
        <li>
          {t(
            'A discount code or free days given as a reward are not paid for, so they have no refund value.',
          )}
        </li>
      </ul>
      <h2>{t('How to ask for a refund')}</h2>
      <p>
        {rich(
          t,
          'Contact us at {contact} within 7 days of your payment with your order number and the email on your account. We reply within 2 working days.',
          { contact },
        )}
      </p>
      <h2>{t('How and when you get the money')}</h2>
      <p>
        {t(
          'Approved refunds go back to the account or wallet you paid from, normally within 7 to 10 working days. Your bank or wallet may take a little longer to show it.',
        )}
      </p>
      <p>
        {t('See also our')} <Link href="/terms">{t('terms of use')}</Link> {t('and')}{' '}
        <Link href="/delivery">{t('service delivery policy')}</Link>.
      </p>
    </PolicyPage>
  );
}
