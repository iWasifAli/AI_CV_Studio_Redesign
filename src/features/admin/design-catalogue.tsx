'use client';

import { useT } from '@/i18n/client';
import { useEffect, useMemo, useState } from 'react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import type { BusinessConfig } from '@/modules/billing/config';
import { DESIGN_META, FAMILY_LABEL } from '@/modules/design/designs';
import {
  DESIGN_STATUSES,
  DESIGN_TAGS,
  TAG_LABEL,
  designLabel,
  type DesignEntry,
  type DesignStatus,
  type DesignTag,
} from '@/modules/design/lifecycle';
import type { DesignId } from '@/modules/resume/schema';
import { cn } from '@/lib/cn';
import { adminGet, adminSend } from './api';

type ConfigResponse = { version: number; value: BusinessConfig };
export type UsageRow = {
  id: string;
  shown: number;
  previewed: number;
  chosen: number;
  switchedAway: number;
  downloaded: number;
};

const STATUS_LABEL: Record<DesignStatus, string> = {
  draft: 'Draft',
  live: 'Live',
  retired: 'Retired',
};

/** Pure filter used by the table (unit-tested). */
export function filterEntries(
  list: DesignEntry[],
  q: { text: string; status: DesignStatus | 'all'; tag: DesignTag | 'all' },
): DesignEntry[] {
  const text = q.text.trim().toLowerCase();
  return list.filter((d) => {
    if (q.status !== 'all' && d.status !== q.status) return false;
    if (q.tag !== 'all' && !d.tags.includes(q.tag)) return false;
    if (!text) return true;
    const m = DESIGN_META[d.id];
    return (
      d.id.includes(text) ||
      m.name.toLowerCase().includes(text) ||
      m.style.toLowerCase().includes(text) ||
      FAMILY_LABEL[m.family].name.toLowerCase().includes(text)
    );
  });
}

/**
 * Admin → Designs → Catalogue: every design with its status, tier and tags, plus 30-day usage.
 * Edits are saved as a new version of the business settings (kept in History, audited).
 */
export function AdminDesignCatalogue() {
  const tx = useT();
  const toast = useToast();
  const [base, setBase] = useState<ConfigResponse | null>(null);
  const [draft, setDraft] = useState<DesignEntry[] | null>(null);
  const [usage, setUsage] = useState<Record<string, UsageRow>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<DesignStatus | 'all'>('all');
  const [tag, setTag] = useState<DesignTag | 'all'>('all');
  const [picked, setPicked] = useState<Set<DesignId>>(new Set());

  useEffect(() => {
    adminGet<ConfigResponse>('/api/admin/config').then(
      (r) => {
        setBase(r);
        setDraft(structuredClone(r.value.designs) as DesignEntry[]);
      },
      (e: Error) => setError(e.message),
    );
    adminGet<{ rows: UsageRow[] }>('/api/admin/design-usage?days=30').then(
      (r) => setUsage(Object.fromEntries(r.rows.map((x) => [x.id, x]))),
      () => undefined,
    );
  }, []);

  const shown = useMemo(
    () => (draft ? filterEntries(draft, { text, status, tag }) : []),
    [draft, text, status, tag],
  );
  const dirty = !!draft && !!base && JSON.stringify(draft) !== JSON.stringify(base.value.designs);
  const freeLive = !!draft?.some((d) => d.status === 'live' && d.tier === 'free');

  const edit = (ids: Iterable<DesignId>, fn: (d: DesignEntry) => void) =>
    setDraft((list) => {
      if (!list) return list;
      const want = new Set(ids);
      return list.map((d) => {
        if (!want.has(d.id)) return d;
        const next = structuredClone(d);
        fn(next);
        next.enabled = next.status === 'live';
        return next;
      });
    });

  const save = async () => {
    if (!base || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const value = { ...base.value, designs: draft };
      const r = await adminSend<{ version: number; changes: string[] }>(
        '/api/admin/config',
        'PUT',
        { baseVersion: base.version, value },
      );
      toast.show({
        tone: 'success',
        message: `Saved as version ${r.version} (${r.changes.length} change${r.changes.length === 1 ? '' : 's'}).`,
      });
      setBase({ version: r.version, value: structuredClone(value) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!draft)
    return error ? (
      <Banner tone="error" title={tx('Could not load the designs')}>
        {error}
      </Banner>
    ) : (
      <div className="skeleton h-64 rounded-lg" aria-busy="true" />
    );

  const allShownPicked = shown.length > 0 && shown.every((d) => picked.has(d.id));
  const counts = Object.fromEntries(
    DESIGN_STATUSES.map((s) => [s, draft.filter((d) => d.status === s).length]),
  ) as Record<DesignStatus, number>;

  return (
    <div className="flex flex-col gap-4 pb-28" data-testid="design-catalogue">
      <p className="text-ink-muted text-sm">
        {tx('{v0} live · {v1} draft · {v2} retired', {
          v0: String(counts.live),
          v1: String(counts.draft),
          v2: String(counts.retired),
        })}
        {' — '}
        {tx(
          'Retired designs are hidden from the gallery, suggestions and the AI Designer; CVs that already use one keep it and can still download it.',
        )}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label={tx('Search')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          containerClassName="w-56"
          data-testid="catalogue-search"
        />
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {tx('Status')}
          <select
            className="border-line-strong bg-surface h-10 rounded-sm border px-2 font-normal"
            value={status}
            onChange={(e) => setStatus(e.target.value as DesignStatus | 'all')}
            data-testid="catalogue-status-filter"
          >
            <option value="all">{tx('All')}</option>
            {DESIGN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tx(STATUS_LABEL[s])}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {tx('Tag')}
          <select
            className="border-line-strong bg-surface h-10 rounded-sm border px-2 font-normal"
            value={tag}
            onChange={(e) => setTag(e.target.value as DesignTag | 'all')}
            data-testid="catalogue-tag-filter"
          >
            <option value="all">{tx('All')}</option>
            {DESIGN_TAGS.map((t) => (
              <option key={t} value={t}>
                {tx(TAG_LABEL[t])}
              </option>
            ))}
          </select>
        </label>
      </div>

      {picked.size > 0 && (
        <div
          className="bg-sunken flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm"
          data-testid="catalogue-bulk"
        >
          <strong>{tx('{v0} selected', { v0: String(picked.size) })}</strong>
          <BulkSelect
            label={tx('Set status')}
            options={DESIGN_STATUSES.map((s) => [s, tx(STATUS_LABEL[s])])}
            onPick={(v) => edit(picked, (d) => void (d.status = v as DesignStatus))}
            testId="bulk-status"
          />
          <BulkSelect
            label={tx('Set tier')}
            options={[
              ['free', tx('Free')],
              ['premium', tx('Premium')],
            ]}
            onPick={(v) => edit(picked, (d) => void (d.tier = v as 'free' | 'premium'))}
            testId="bulk-tier"
          />
          <BulkSelect
            label={tx('Add tag')}
            options={DESIGN_TAGS.map((t) => [t, tx(TAG_LABEL[t])])}
            onPick={(v) =>
              edit(picked, (d) => {
                if (!d.tags.includes(v as DesignTag)) d.tags.push(v as DesignTag);
              })
            }
            testId="bulk-add-tag"
          />
          <BulkSelect
            label={tx('Remove tag')}
            options={DESIGN_TAGS.map((t) => [t, tx(TAG_LABEL[t])])}
            onPick={(v) => edit(picked, (d) => void (d.tags = d.tags.filter((x) => x !== v)))}
            testId="bulk-remove-tag"
          />
          <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>
            {tx('Clear selection')}
          </Button>
        </div>
      )}

      {!freeLive && <Banner tone="warning" title={tx('Keep at least one design free and live.')} />}
      {error && <Banner tone="error" title={error} onDismiss={() => setError(null)} />}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="text-ink-muted text-left">
              <th className="py-2 pr-2">
                <input
                  type="checkbox"
                  aria-label={tx('Select all shown')}
                  checked={allShownPicked}
                  onChange={(e) =>
                    setPicked(
                      e.target.checked
                        ? new Set([...picked, ...shown.map((d) => d.id)])
                        : new Set([...picked].filter((id) => !shown.some((d) => d.id === id))),
                    )
                  }
                />
              </th>
              <th className="py-2 pr-3 font-semibold">{tx('Design')}</th>
              <th className="py-2 pr-3 font-semibold">{tx('Status')}</th>
              <th className="py-2 pr-3 font-semibold">{tx('Tier')}</th>
              <th className="py-2 pr-3 font-semibold">{tx('Tags')}</th>
              <th className="py-2 pr-3 text-right font-semibold" title={tx('Last 30 days')}>
                {tx('Shown')}
              </th>
              <th className="py-2 pr-3 text-right font-semibold">{tx('Previewed')}</th>
              <th className="py-2 pr-3 text-right font-semibold">{tx('Chosen')}</th>
              <th
                className="py-2 pr-3 text-right font-semibold"
                title={tx('Chosen, then changed to another design within 5 minutes')}
              >
                {tx('Left quickly')}
              </th>
              <th className="py-2 pr-3 text-right font-semibold">{tx('Downloaded')}</th>
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {shown.map((d) => {
              const m = DESIGN_META[d.id];
              const u = usage[d.id];
              return (
                <tr key={d.id} data-testid={`catalogue-row-${d.id}`}>
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      aria-label={tx('Select {v0}', { v0: m.name })}
                      checked={picked.has(d.id)}
                      onChange={(e) => {
                        const next = new Set(picked);
                        if (e.target.checked) next.add(d.id);
                        else next.delete(d.id);
                        setPicked(next);
                      }}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element -- small static thumbnail */}
                      <img
                        src={`/templates/${d.id}.webp`}
                        alt=""
                        width={40}
                        height={56}
                        loading="lazy"
                        className="border-line h-14 w-10 rounded-sm border object-cover object-top"
                      />
                      <span>
                        <span className="block font-semibold">{m.name}</span>
                        <span className="text-ink-muted block text-xs">
                          {FAMILY_LABEL[m.family].name} ·{' '}
                          {designLabel(m) === 'ats' ? tx('ATS-friendly') : tx('Creative')} ·{' '}
                          {tx('added {v0}', { v0: d.addedAt })}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      aria-label={tx('{v0} status', { v0: m.name })}
                      className="border-line-strong bg-surface h-9 rounded-sm border px-2"
                      value={d.status}
                      onChange={(e) =>
                        edit([d.id], (x) => void (x.status = e.target.value as DesignStatus))
                      }
                    >
                      {DESIGN_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {tx(STATUS_LABEL[s])}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      aria-label={tx('{v0} tier', { v0: m.name })}
                      className="border-line-strong bg-surface h-9 rounded-sm border px-2"
                      value={d.tier}
                      onChange={(e) =>
                        edit([d.id], (x) => void (x.tier = e.target.value as 'free' | 'premium'))
                      }
                    >
                      <option value="free">{tx('Free')}</option>
                      <option value="premium">{tx('Premium')}</option>
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="flex flex-wrap gap-1">
                      {DESIGN_TAGS.map((t) => {
                        const on = d.tags.includes(t);
                        return (
                          <button
                            key={t}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              edit([d.id], (x) => {
                                x.tags = on ? x.tags.filter((y) => y !== t) : [...x.tags, t];
                              })
                            }
                            className={cn(
                              'rounded-full border px-2 py-0.5 text-xs',
                              on
                                ? 'bg-primary text-on-primary border-transparent'
                                : 'border-line text-ink-muted',
                            )}
                          >
                            {tx(TAG_LABEL[t])}
                          </button>
                        );
                      })}
                    </span>
                  </td>
                  <Num v={u?.shown} />
                  <Num v={u?.previewed} />
                  <Num v={u?.chosen} />
                  <Num v={u?.switchedAway} />
                  <Num v={u?.downloaded} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <p className="text-ink-muted">{tx('No design matches.')}</p>}

      <div className="bg-surface border-line fixed inset-x-0 bottom-0 z-20 border-t px-4 py-3 md:left-60">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-3">
          {dirty && <span className="text-ink-muted text-sm">{tx('Unsaved changes')}</span>}
          <Button
            onClick={save}
            disabled={!dirty || saving || !freeLive}
            data-testid="catalogue-save"
          >
            {saving ? tx('Saving…') : tx('Save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Num({ v }: { v?: number }) {
  return <td className="py-2 pr-3 text-right tabular-nums">{v ?? 0}</td>;
}

function BulkSelect({
  label,
  options,
  onPick,
  testId,
}: {
  label: string;
  options: [string, string][];
  onPick: (v: string) => void;
  testId: string;
}) {
  return (
    <select
      aria-label={label}
      className="border-line-strong bg-surface h-9 rounded-sm border px-2"
      value=""
      data-testid={testId}
      onChange={(e) => {
        if (e.target.value) onPick(e.target.value);
      }}
    >
      <option value="">{label}…</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
