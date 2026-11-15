'use client';

import { useT } from '@/i18n/client';
import { useEffect, useState } from 'react';
import { Share2, Users } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { TextArea, TextField } from '@/components/ui/field';
import { CheckboxField } from '@/features/editor/fields';
import { useEntitlements } from '@/features/account/entitlements';
import { DocumentPreview } from '@/features/preview/document-preview';
import type { DesignSpecV2 } from '@/modules/design/spec';
import { ops } from '@/modules/resume/ops';
import type { ResumeDocument } from '@/modules/resume/schema';

export type CommunityItem = {
  id: string;
  name: string;
  description: string;
  credit: string | null;
  featured: boolean;
  spec: DesignSpecV2;
};
type Mine = { id: string; name: string; status: string; reason: string | null };

const STATUS: Record<string, string> = {
  pending: 'Waiting for review',
  approved: 'In the Community gallery',
  rejected: 'Not accepted',
};

/** True when sharing and the gallery are switched on in the Console. */
export function useCommunity() {
  const { ent } = useEntitlements();
  return !!ent && ent.features.community === true;
}

/** "Share" on one saved design: name, a line about it, and whether to show your first name. */
export function ShareDesign({
  design,
  onShared,
}: {
  design: { id: string; name: string };
  onShared: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(design.name);
  const [description, setDescription] = useState('');
  const [credit, setCredit] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const submit = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await fetch('/api/community', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ designId: design.id, name, description, credit }),
      });
      const j = (await r.json().catch(() => null)) as { error?: { message: string } } | null;
      if (!r.ok) {
        setProblem(j?.error?.message ?? 'That didn’t work. Please try again.');
        return;
      }
      setDone(true);
      onShared();
    } catch {
      setProblem('You seem to be offline. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        aria-label={`Share ${design.name} with the community`}
        className="text-ink-muted hover:text-primary inline-flex size-9 items-center justify-center"
        onClick={() => {
          setDone(false);
          setOpen(true);
        }}
      >
        <Share2 aria-hidden size={16} />
      </button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title={t('Share with the community')}>
          {done ? (
            <div className="flex flex-col gap-3" data-testid="share-done">
              <p>
                {t(
                  'Thank you! “{name}” is waiting for review. Once it’s approved, others can use it from the Community designs.',
                  { name: name },
                )}
              </p>
              <Button className="self-end" onClick={() => setOpen(false)}>
                {t('Done')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-ink-muted text-sm">
                {t(
                  'Only the design is shared — never your CV or its content. We check every design before others can see it.',
                )}
              </p>
              <TextField
                label={t('Design name')}
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <TextArea
                label={t('One line about it (optional)')}
                rows={2}
                maxLength={200}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <CheckboxField
                label={t('Show my first name as the designer')}
                checked={credit}
                onChange={setCredit}
              />
              {problem && <Banner tone="error" title={problem} />}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  {t('Cancel')}
                </Button>
                <Button loading={busy} disabled={name.trim().length < 3} onClick={submit}>
                  {t('Share for review')}
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}

/** Where the account's shared designs are in review. */
export function MySharedDesigns({ tick }: { tick: number }) {
  const t = useT();
  const [list, setList] = useState<Mine[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/community/mine', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { designs: [] }))
      .then((j: { designs: Mine[] }) => live && setList(j.designs))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [tick]);
  if (!list?.length) return null;
  return (
    <div className="text-sm" data-testid="my-shared">
      <p className="font-semibold">{t('Shared with the community')}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {list.map((d) => (
          <li key={d.id}>
            {d.name} — <span className="text-ink-muted">{STATUS[d.status] ?? d.status}</span>
            {d.reason && <span className="text-ink-muted"> ({d.reason})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Approved community designs, shown on the person's own CV, with "Use". */
export function CommunityGallery({
  doc,
  onUse,
}: {
  doc: ResumeDocument;
  onUse: (d: CommunityItem) => void;
}) {
  const t = useT();
  const [list, setList] = useState<CommunityItem[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/community')
      .then((r) => (r.ok ? r.json() : { designs: [] }))
      .then((j: { designs: CommunityItem[] }) => live && setList(j.designs))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!list?.length) return null;
  return (
    <div className="border-line flex flex-col gap-3 border-t pt-4" data-testid="community-gallery">
      <p className="flex items-center gap-2 font-semibold">
        <Users aria-hidden size={16} className="text-primary" /> {t('Community designs')}
      </p>
      <ul className="grid grid-cols-2 gap-3">
        {list.map((d) => (
          <li key={d.id} className="flex flex-col gap-1.5">
            <div className="border-line overflow-hidden rounded-md border">
              <DocumentPreview
                doc={ops.setSpec(doc, d.spec)}
                firstPageOnly
                decorative
                lazy
                title={`${d.name} on your CV`}
              />
            </div>
            <p className="text-sm font-semibold">
              {d.name}
              {d.featured && <span className="text-primary"> {t('· Featured')}</span>}
            </p>
            <p className="text-ink-muted text-xs">{d.credit ? `By ${d.credit}` : 'Community'}</p>
            <Button size="sm" variant="secondary" onClick={() => onUse(d)}>
              {t('Use “{name}”', { name: d.name })}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
