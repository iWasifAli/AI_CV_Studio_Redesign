import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { Container } from '@/components/ui/misc';
import { TemplateGallery } from '@/features/gallery/template-gallery';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Designs') };
}

export default async function TemplatesPage() {
  const t = await getT();
  return (
    <Container className="py-10 md:py-14">
      <h1 className="font-display text-[32px] leading-tight font-semibold tracking-tight sm:text-4xl">
        {t('Designs')}
      </h1>
      <p className="text-ink-muted mt-3 max-w-2xl text-lg">
        {t(
          '52 designs in 9 families, including 20 graphic designs made to stand out to people. Each is shown with your own CV when you have one, each has a plain ATS version for online application forms, and you can switch at any time without losing a word.',
        )}
      </p>
      <div className="mt-8">
        <TemplateGallery />
      </div>
    </Container>
  );
}
