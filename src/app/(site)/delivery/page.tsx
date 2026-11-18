import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PolicyPage } from '../_policy';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Service delivery policy'), alternates: { canonical: '/delivery' } };
}

const UPDATED = '18 November 2026';

export default async function DeliveryPage() {
  const t = await getT();
  return (
    <PolicyPage
      title={t('Service delivery policy')}
      updated={t('Last updated {UPDATED}', { UPDATED })}
    >
      <p>
        {t(
          'AI CV Studio sells digital services only. Nothing is posted, so there is no shipping and no delivery charge.',
        )}
      </p>
      <h2>{t('Free services')}</h2>
      <p>
        {t(
          'Creating an account, building CVs, the free designs, the CV check and the job tracker are available immediately after you sign up.',
        )}
      </p>
      <h2>{t('Premium passes')}</h2>
      <ul>
        <li>
          {t(
            'Premium is switched on in your account once we confirm your payment. Payments we check by hand are normally confirmed within 24 hours; if we need more details we tell you why.',
          )}
        </li>
        <li>
          {t(
            'The days of your pass start when Premium is switched on, not when you pay. You can see the end date on your Account page.',
          )}
        </li>
        <li>
          {t(
            'You get an on-screen confirmation and, if you allow it, an email. You do not need to wait for anything to arrive.',
          )}
        </li>
      </ul>
      <h2>{t('If something goes wrong')}</h2>
      <p>
        {t('If your payment went through but Premium is not active after 24 hours, tell us on the')}{' '}
        <Link href="/contact">{t('Contact page')}</Link>{' '}
        {t('with your order number. We will activate it or refund you under our')}{' '}
        <Link href="/refund">{t('refund policy')}</Link>.
      </p>
    </PolicyPage>
  );
}
