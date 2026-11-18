'use client';

import { workspaceFetch } from '@/features/workspace/request';

import { useWorkspaceRouter as useRouter } from '@/features/workspace/navigation';
import { useWorkspaceScope } from '@/features/workspace/context';
import { useEffect } from 'react';
import { DropZone } from './drop-zone';
import { handOff } from './state';

/** The home page drop zone: hands the file to /makeover, which starts at once. */
export function LandingDrop() {
  const router = useRouter();
  const scope = useWorkspaceScope();
  useEffect(() => {
    // Funnel: landing → upload → reveal → saved (Admin overview).
    try {
      if (sessionStorage.getItem('cvs_lv')) return;
      sessionStorage.setItem('cvs_lv', '1');
    } catch {
      // Counted every time when storage is blocked; harmless.
    }
    void workspaceFetch('/api/metrics/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'landing_view' }),
      keepalive: true,
    }).catch(() => {});
  }, []);
  return (
    <DropZone
      id="landing-file"
      compact
      onFile={(f) => {
        const key = handOff(f, scope);
        router.push(scope ? `/makeover?handoff=${encodeURIComponent(key)}` : '/makeover');
      }}
    />
  );
}
