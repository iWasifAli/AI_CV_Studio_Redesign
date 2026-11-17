import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/figtree';
import '@fontsource-variable/fraunces';
import '@/styles/globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { AccountProvider } from '@/features/account/account-context';
import { ServiceWorker } from '@/features/app/service-worker';
import { I18nProvider } from '@/i18n/client';
import { DICTS } from '@/i18n/dicts';
import { getLang, getT } from '@/i18n/server';
import { OG_IMAGE, SITE_URL } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: {
      default: `AI CV Studio — ${t('A professional CV in your own words')}`,
      template: '%s · AI CV Studio',
    },
    description: t(
      'Tell us what you do, answer a few simple questions, and get a professional CV you can edit and download as a PDF.',
    ),
    metadataBase: new URL(SITE_URL),
    applicationName: 'AI CV Studio',
    // Link previews (WhatsApp, LinkedIn, X, …). The title and description fall back to the page's own.
    openGraph: {
      type: 'website',
      siteName: 'AI CV Studio',
      locale: (await getLang()) === 'de' ? 'de_DE' : 'en_GB',
      images: [{ ...OG_IMAGE, alt: t('AI CV Studio: write with AI, design a professional CV') }],
    },
    twitter: { card: 'summary_large_image', images: [OG_IMAGE.url] },
    appleWebApp: { capable: true, title: 'CV Studio', statusBarStyle: 'default' },
  };
}

export const viewport: Viewport = {
  themeColor: '#faf8f4',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang}>
      <body>
        <I18nProvider lang={lang} dict={DICTS[lang]}>
          <ToastProvider>
            <AccountProvider>{children}</AccountProvider>
            <ServiceWorker />
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
