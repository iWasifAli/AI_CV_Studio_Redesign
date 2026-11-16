'use client';

import { useT } from '@/i18n/client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Segmented } from '@/components/ui/segmented';
import { AdminHeading } from './admin-shell';
import { AdminDesignCatalogue } from './design-catalogue';
import { AdminDesignReview } from './design-review';

/** Admin → Designs: the catalogue (status, tier, tags, usage) and shared designs waiting for review. */
export function AdminDesigns() {
  const tx = useT();
  const params = useSearchParams();
  const [tab, setTab] = useState<'catalogue' | 'shared'>(
    params.get('tab') === 'shared' ? 'shared' : 'catalogue',
  );
  return (
    <>
      <Segmented
        label={tx('Designs')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'catalogue', label: tx('Catalogue') },
          { value: 'shared', label: tx('Shared by people') },
        ]}
        className="mb-5 max-w-md"
      />
      {tab === 'catalogue' ? (
        <>
          <AdminHeading
            title={tx('Designs')}
            intro="Which designs are live, their tier and tags, and how people use them. Every save is kept in History."
          />
          <AdminDesignCatalogue />
        </>
      ) : (
        <AdminDesignReview />
      )}
    </>
  );
}
