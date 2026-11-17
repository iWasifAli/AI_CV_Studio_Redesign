import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Container } from '@/components/ui/misc';
import { JsonLd } from '@/components/seo/json-ld';
import { SITE_URL } from '@/lib/seo';
import { DesignDetail } from '@/features/gallery/design-detail';
import { DESIGN_IDS } from '@/modules/resume/ids';
import { DESIGN_META, isDesignId } from '@/modules/design/designs';

export function generateStaticParams() {
  return DESIGN_IDS.map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!isDesignId(id)) return { title: 'Design' };
  const d = DESIGN_META[id];
  const image = {
    url: `/templates/${id}.webp`,
    width: 595,
    height: 842,
    alt: `${d.name} CV design`,
  };
  return {
    title: `${d.name} CV design`,
    description: d.description,
    alternates: { canonical: `/templates/${id}` },
    openGraph: {
      type: 'website',
      siteName: 'AI CV Studio',
      title: `${d.name} CV design · AI CV Studio`,
      description: d.description,
      images: [image],
    },
    twitter: { card: 'summary_large_image', images: [image.url] },
  };
}

export default async function DesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isDesignId(id)) notFound();
  return (
    <Container className="py-10 md:py-14">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'AI CV Studio', item: `${SITE_URL}/` },
            { '@type': 'ListItem', position: 2, name: 'Designs', item: `${SITE_URL}/templates` },
            {
              '@type': 'ListItem',
              position: 3,
              name: DESIGN_META[id].name,
              item: `${SITE_URL}/templates/${id}`,
            },
          ],
        }}
      />
      <Suspense>
        <DesignDetail id={id} />
      </Suspense>
    </Container>
  );
}
