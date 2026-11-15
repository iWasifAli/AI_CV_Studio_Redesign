'use client';

import { useT } from '@/i18n/client';
import { useCallback, useEffect, useState } from 'react';
import { Check, Star, Trash2, X } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { useToast } from '@/components/ui/toast';
import { DocumentPreview } from '@/features/preview/document-preview';
import type { DesignSpecV2 } from '@/modules/design/spec';
import { FIXTURES } from '@/modules/resume/fixtures';
import { ops } from '@/modules/resume/ops';
import { AdminHeading } from './admin-shell';
import { adminGet, adminSend } from './api';

type Item = {
  id: string;
  name: string;
  description: string;
  credit: string | null;
  spec: DesignSpecV2;
  status: 'pending' | 'approved' | 'rejected' | 'removed';
  featured: boolean;
  reason?: string;
  checks: { notes: string[] };
  createdAt: string;
};
type Tab = 'pending' | 'approved' | 'rejected';

/** Three sample CVs every shared design is checked on: short, a teacher with a photo, dense. */
const SAMPLES = [FIXTURES.driver, FIXTURES.teacher, FIXTURES.engineer];

/**
 * Console → Design review (spec §15): shared designs wait here. Each is shown on three sample CVs
 * with the automated check results; approving puts it in the Community gallery.
 */
export function AdminDesignReview() {
  const tx = useT();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('pending');
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    (t: Tab) =>
      adminGet<{ designs: Item[] }>(`/api/admin/community?status=${t}`).then(
        (r) => setItems(r.designs),
        (e: Error) => setError(e.message),
      ),
    [],
  );
  useEffect(() => {
    void load(tab);
  }, [load, tab]);

  const act = async (
    d: Item,
    action: 'approve' | 'reject' | 'feature' | 'unfeature' | 'remove',
  ) => {
    setBusy(`${d.id}:${action}`);
    setError(null);
    try {
      await adminSend(`/api/admin/community/${d.id}`, 'POST', {
        action,
        reason: reasons[d.id] ?? '',
      });
      toast.show({
        tone: 'success',
        message:
          action === 'approve'
            ? `“${d.name}” is now in the Community gallery.`
            : action === 'reject'
              ? `“${d.name}” was declined.`
              : action === 'remove'
                ? `“${d.name}” was taken down.`
                : 'Saved.',
      });
      await load(tab);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <AdminHeading
        title={tx('Design review')}
        intro="Designs people share wait here. Nothing is shown to others until you approve it."
      />
      <Segmented
        label={tx('Show')}
        value={tab}
        onChange={(t) => {
          setItems(null);
          setTab(t);
        }}
        options={[
          { value: 'pending', label: 'Waiting' },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Declined' },
        ]}
        className="mb-5 max-w-md"
      />
      {error && <Banner tone="error" title={error} onDismiss={() => setError(null)} />}
      {!items && !error && <div className="skeleton h-40 rounded-lg" aria-busy="true" />}
      {items && items.length === 0 && (
        <p className="text-ink-muted" data-testid="review-empty">
          {tab === 'pending' ? tx('Nothing is waiting for review.') : tx('None yet.')}
        </p>
      )}
      <ul className="flex flex-col gap-6" data-testid="review-list">
        {items?.map((d) => (
          <li
            key={d.id}
            className="border-line bg-surface flex flex-col gap-4 rounded-lg border p-5"
            data-testid="review-item"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">
                  {d.name}{' '}
                  {d.featured && <span className="text-primary text-sm">{tx('· Featured')}</span>}
                </h2>
                <p className="text-ink-muted text-sm">
                  {d.credit ? `By ${d.credit}` : tx('Anonymous')} ·{' '}
                  {new Date(d.createdAt).toLocaleDateString('en-GB')}
                </p>
                {d.description && <p className="mt-1">{tx(d.description)}</p>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3" aria-label={tx('On three sample CVs')}>
              {SAMPLES.map((cv) => (
                <div key={cv.id} className="border-line overflow-hidden rounded-md border">
                  <DocumentPreview
                    doc={ops.setSpec(cv, d.spec)}
                    firstPageOnly
                    decorative
                    lazy
                    title={tx('{name} on a sample CV', { name: d.name })}
                  />
                </div>
              ))}
            </div>
            <div className="text-sm">
              <p className="font-semibold">{tx('Automatic checks')}</p>
              {d.checks.notes.length ? (
                <ul className="text-ink-muted list-disc pl-5">
                  {d.checks.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-muted">{tx('Valid design; nothing was adjusted.')}</p>
              )}
            </div>
            {d.status === 'rejected' && d.reason && (
              <p className="text-sm">
                <span className="font-semibold">{tx('Reason given:')}</span> {d.reason}
              </p>
            )}
            <div className="flex flex-wrap items-end gap-2">
              {d.status !== 'approved' && (
                <Button
                  size="sm"
                  icon={<Check aria-hidden size={16} />}
                  loading={busy === `${d.id}:approve`}
                  onClick={() => void act(d, 'approve')}
                >
                  {tx('Approve')}
                </Button>
              )}
              {d.status === 'approved' && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Star aria-hidden size={16} />}
                  loading={busy?.startsWith(`${d.id}:`) && busy.endsWith('feature')}
                  onClick={() => void act(d, d.featured ? 'unfeature' : 'feature')}
                >
                  {d.featured ? tx('Stop featuring') : tx('Feature')}
                </Button>
              )}
              {d.status === 'pending' && (
                <>
                  <TextField
                    label={tx('Reason (for declining)')}
                    className="min-w-60"
                    maxLength={300}
                    value={reasons[d.id] ?? ''}
                    onChange={(e) => setReasons({ ...reasons, [d.id]: e.target.value })}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<X aria-hidden size={16} />}
                    disabled={(reasons[d.id] ?? '').trim().length < 3}
                    loading={busy === `${d.id}:reject`}
                    onClick={() => void act(d, 'reject')}
                  >
                    {tx('Decline')}
                  </Button>
                </>
              )}
              {d.status === 'approved' && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 aria-hidden size={16} />}
                  loading={busy === `${d.id}:remove`}
                  onClick={() => void act(d, 'remove')}
                >
                  {tx('Take down')}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
