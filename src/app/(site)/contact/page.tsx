import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { getBusinessConfig } from '@/modules/billing/server';
import { PolicyPage } from '../_policy';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Contact us'), alternates: { canonical: '/contact' } };
}
export const dynamic = 'force-dynamic';

export default async function ContactPage() {
  const t = await getT();
  const { email, phone, address, hours } = (await getBusinessConfig()).value.support;
  const digits = phone.replace(/\D/g, '');
  return (
    <PolicyPage title={t('Contact us')}>
      <p>{t('Questions about your CV, a payment, a refund or your privacy? Reach us here.')}</p>
      <ul className="list-none! pl-0!" data-testid="contact-details">
        {email && (
          <li>
            <strong>{t('Email')}:</strong> <a href={`mailto:${email}`}>{email}</a>
          </li>
        )}
        {phone && (
          <li>
            <strong>{t('Phone and WhatsApp')}:</strong> <a href={`tel:+${digits}`}>{phone}</a>
            {digits.length >= 10 && (
              <>
                {' '}
                (<a href={`https://wa.me/${digits}`}>{t('Message us on WhatsApp')}</a>)
              </>
            )}
          </li>
        )}
        {address && (
          <li>
            <strong>{t('Address')}:</strong> <span className="whitespace-pre-line">{address}</span>
          </li>
        )}
        {hours && (
          <li>
            <strong>{t('Hours')}:</strong> {hours}
          </li>
        )}
      </ul>
      <p>
        {t(
          'For a payment question, include your order number and the email on your account so we can find it quickly.',
        )}
      </p>
    </PolicyPage>
  );
}
