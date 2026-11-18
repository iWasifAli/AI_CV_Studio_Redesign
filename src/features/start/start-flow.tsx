'use client';

import { useSearchParams } from 'next/navigation';
import { useWorkspaceRouter as useRouter } from '@/features/workspace/navigation';
import { useState } from 'react';
import type { PresetId } from '@/modules/resume/professions';
import { DescribeBox } from './describe-box';
import { ProfessionPicker } from './profession-picker';

export function StartFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState<PresetId | null>(null);

  function choose(id: PresetId) {
    setBusy(id);
    const design = params.get('design');
    router.push(
      `/cv/new?work=${id}${design ? `&design=${encodeURIComponent(design)}` : ''}&creation=${crypto.randomUUID()}`,
    );
  }

  return (
    <>
      <DescribeBox onCreate={(href) => router.push(`${href}&creation=${crypto.randomUUID()}`)} />
      <ProfessionPicker onChoose={choose} busy={busy} />
    </>
  );
}
