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
    applicationName: 'AI CV Studio',
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
