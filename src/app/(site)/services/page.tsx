import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getBusinessConfig } from '@/modules/billing/server';
import { PolicyPage } from '../_policy';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Services and prices'), alternates: { canonical: '/services' } };
}
export const dynamic = 'force-dynamic';

const FREE_SERVICES: { name: string; text: string }[] = [
  {
    name: 'CV builder',
    text: 'Build a CV in your own words with free designs, PDF download and a share link.',
  },
  {
    name: 'CV check and score',
    text: 'A score out of 100, ATS read-back and advice on what to fix before you send it.',
  },
  {
    name: 'CV standards',
    text: 'Convert your CV to the Gulf, European, UK, US, South Asian or neutral standard.',
  },
  {
    name: 'CV makeover',
    text: 'Upload an existing CV and see it in a clean, professional design. No sign-up needed to look.',
  },
  {
    name: 'Job tracker',
    text: 'Track applications on a drag-and-drop board, with reminders and a tailored application kit.',
  },
  {
    name: 'Cover letters and LinkedIn',
    text: 'Letters, a LinkedIn profile draft and a one-page portfolio from your own CV facts.',
  },
];

export default async function ServicesPage() {
  const t = await getT();
  const cfg = (await getBusinessConfig()).value;
  const passes = cfg.passes.filter((p) => p.active).sort((a, z) => a.days - z.days);
  return (
    <PolicyPage title={t('Services and prices')}>
      <p>
        {t(
          'Everything below is a digital service on aicvstudio.app. Prices are in Pakistani rupees (PKR).',
        )}
      </p>
      <ul className="list-none! pl-0!" data-testid="services-list">
        {FREE_SERVICES.map((s) => (
          <li key={s.name}>
            <strong>{t(s.name)}</strong> — {t('Free')}.
            <br />
            {t(s.text)}
          </li>
        ))}
        {passes.map((p) => (
          <li key={p.id}>
            <strong>{t('Premium pass: {label}', { label: p.label })}</strong> — PKR{' '}
            {p.pricePkr.toLocaleString('en-PK')}.
            <br />
            {t(
              'All Premium designs, more AI help and job-match keywords for {days} days. One-time payment, no auto-renewal.',
              { days: p.days },
            )}
          </li>
        ))}
      </ul>
      <p>
        <Link href="/premium">{t('Buy Premium')}</Link> · <Link href="/refund">{t('Refunds')}</Link>{' '}
        · <Link href="/delivery">{t('Delivery')}</Link> ·{' '}
        <Link href="/contact">{t('Contact')}</Link>
      </p>
    </PolicyPage>
  );
}
