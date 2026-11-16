import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { Container } from '@/components/ui/misc';
import { TemplateGallery } from '@/features/gallery/template-gallery';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Designs') };
}

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getT();
  // Load test (catalogue Part B): the list repeated to N cards, only on test servers.
  const raw = (await searchParams).seed;
  const seed =
    process.env.E2E_TEST_HOOKS === '1' && typeof raw === 'string'
      ? Math.max(0, Math.min(1000, Number(raw) || 0))
      : 0;
  return (
    <Container className="py-10 md:py-14">
      <h1 className="font-display text-[32px] leading-tight font-semibold tracking-tight sm:text-4xl">
        {t('Designs')}
      </h1>
      <p className="text-ink-muted mt-3 max-w-2xl text-lg">
        {t(
          'Find a design by mood, occasion or kind of work. Each is shown with your own CV when you have one, each has a plain ATS version for online application forms, and you can switch at any time without losing a word.',
        )}
      </p>
      <div className="mt-8">
        <TemplateGallery seed={seed || undefined} />
      </div>
    </Container>
  );
}
