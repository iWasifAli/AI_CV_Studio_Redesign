'use client';

import { useT } from '@/i18n/client';
import { useEffect, useMemo, useState } from 'react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { applyToProfile, describeChange, profileChanges } from '@/modules/resume/profile-sync';
import type { ResumeDocument } from '@/modules/resume/schema';
import { getRepository } from '@/modules/storage/repository';

/**
 * "Update your profile too?" — shown in a CV made from the career profile once the person pauses
 * after changing a fact the profile still has as before.
 */
export function ProfileSyncBanner({ doc }: { doc: ResumeDocument }) {
  const tx = useT();
  const toast = useToast();
  // The CV as it was when the editor opened (or after the last answer).
  const [baseline, setBaseline] = useState(doc);
  const [settled, setSettled] = useState(doc);
  // Ask only after a pause, never mid-typing.
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(doc), 1500);
    return () => window.clearTimeout(t);
  }, [doc]);
  const profile = useMemo(() => {
    if (doc.role === 'profile' || !doc.parentId) return null;
    const p = getRepository().get(doc.parentId);
    return p?.role === 'profile' ? p : null;
    // The profile is re-read when the settled CV changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.parentId, doc.role, settled]);
  const changes = useMemo(
    () => (profile ? profileChanges(baseline, settled, profile) : []),
    [profile, settled, baseline],
  );
  if (!changes.length) return null;
  const n = changes.length;
  const done = () => setBaseline(settled);
  return (
    <Banner
      tone="info"
      title={`Update your career profile too?`}
      className="mb-4"
      action={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              getRepository().save(applyToProfile(profile!, changes));
              toast.show({ tone: 'success', message: 'Career profile updated' });
              done();
            }}
          >
            {tx('Update profile')}
          </Button>
          <Button size="sm" variant="ghost" onClick={done}>
            {tx('Only this CV')}
          </Button>
        </div>
      }
    >
      {changes.every((c) => c.kind === 'item')
        ? `You added ${n === 1 ? 'an entry' : `${n} entries`} that your career profile doesn’t have`
        : `You changed ${n === 1 ? 'something' : `${n} things`} that your career profile also has`}
      {changes[0] ? ` (${describeChange(changes[0])})` : ''}
      {tx('. Every new CV starts from the profile.')}
    </Banner>
  );
}
