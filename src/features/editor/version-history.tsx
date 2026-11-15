'use client';

import { useT } from '@/i18n/client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, History, Pencil, RotateCcw, Star, Trash2 } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { DocumentPreview } from '@/features/preview/document-preview';
import { parseResumeDocument, type ResumeDocument } from '@/modules/resume/schema';
import { diffDocs, type Change, type VersionMeta } from '@/modules/resume/versions';
import type { DocumentEditor } from './use-document-editor';

/** Version history for a CV (spec §9.1): save, compare and go back. Signed-in accounts only. */

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    cache: 'no-store',
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  });
  const j = (await r.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!r.ok || !j) throw new Error(j?.error?.message || 'That didn’t work. Please try again.');
  return j;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function versionLabel(v: VersionMeta) {
  if (v.kind === 'named') return v.name || 'Saved version';
  if (v.kind === 'restore') return v.name || 'Before going back to an earlier version';
  return 'Before your edits';
}

export function VersionHistoryButton({ editor }: { editor: DocumentEditor }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        label={t('Version history')}
        icon={<History aria-hidden size={20} />}
        onClick={() => {
          editor.flush();
          setOpen(true);
        }}
      />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('Version history')}
        className="w-[min(100vw-1rem,72rem)]!"
      >
        <VersionHistory editor={editor} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function VersionHistory({ editor, onDone }: { editor: DocumentEditor; onDone: () => void }) {
  const t = useT();
  const { doc } = editor;
  const toast = useToast();
  const base = `/api/documents/${encodeURIComponent(doc.id)}/versions`;
  const [list, setList] = useState<VersionMeta[] | null>(null);
  const [maxNamed, setMaxNamed] = useState(20);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState<{ meta: VersionMeta; doc: ResumeDocument } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(() => {
    call<{ versions: VersionMeta[]; maxNamed: number }>(base).then(
      (r) => {
        setList(r.versions);
        setMaxNamed(r.maxNamed);
      },
      (e: Error) => setError(e.message),
    );
  }, [base]);
  useEffect(load, [load]);

  const save = async () => {
    setBusy('save');
    setError('');
    try {
      await call(base, {
        method: 'POST',
        body: JSON.stringify({ kind: 'named', name, document: doc }),
      });
      setName('');
      toast.show({ tone: 'success', message: 'Version saved' });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const view = async (meta: VersionMeta) => {
    setBusy(meta.id);
    setError('');
    try {
      const r = await call<{ version: VersionMeta & { doc: unknown } }>(
        `${base}/${encodeURIComponent(meta.id)}`,
      );
      setOpen({ meta, doc: parseResumeDocument(r.version.doc) });
      setConfirm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const restore = async () => {
    if (!open) return;
    setBusy('restore');
    setError('');
    const label = `${versionLabel(open.meta)} (${when(open.meta.savedAt)})`;
    try {
      // Keep the CV as it is now first, so going back can itself be undone from History.
      await call(base, {
        method: 'POST',
        body: JSON.stringify({
          kind: 'restore',
          name: `Before going back to ${label}`.slice(0, 60),
          document: doc,
        }),
      });
      const back = open.doc;
      editor.update(() => ({ ...back, id: doc.id }), `restore.${Date.now()}`);
      toast.show({
        tone: 'success',
        message: 'Your CV is back to that version. Undo, or History, brings the newer one back.',
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
    }
  };

  const remove = async (v: VersionMeta) => {
    setBusy(v.id);
    try {
      await call(`${base}/${encodeURIComponent(v.id)}`, { method: 'DELETE' });
      setList((l) => l?.filter((x) => x.id !== v.id) ?? l);
      if (open?.meta.id === v.id) setOpen(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const rename = async () => {
    if (!renaming) return;
    setBusy(renaming.id);
    try {
      const r = await call<{ name: string }>(`${base}/${encodeURIComponent(renaming.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: renaming.name }),
      });
      setList((l) => l?.map((x) => (x.id === renaming.id ? { ...x, name: r.name } : x)) ?? l);
      setRenaming(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  if (open)
    return (
      <Compare
        meta={open.meta}
        then={open.doc}
        now={doc}
        confirm={confirm}
        busy={busy === 'restore'}
        error={error}
        onBack={() => {
          setOpen(null);
          setError('');
        }}
        onAsk={() => setConfirm(true)}
        onCancel={() => setConfirm(false)}
        onRestore={() => void restore()}
      />
    );

  const named = list?.filter((v) => v.kind === 'named').length ?? 0;
  return (
    <div className="flex flex-col gap-5">
      <p className="text-ink-muted -mt-2">
        {t(
          'Your CV is kept as it was before each editing session. Save a version yourself before a big change, compare any version with now, and go back if you need to.',
        )}
      </p>
      {error && (
        <Banner tone="error" title={t('That didn’t work')} onDismiss={() => setError('')}>
          {t(error)}
        </Banner>
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-sm font-semibold">{t('Save this version as')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder={t('For example: Before tailoring for Acme')}
            className="border-line-strong bg-surface h-11 rounded-md border px-3"
            data-autofocus
          />
        </label>
        <Button
          type="submit"
          disabled={!name.trim() || named >= maxNamed}
          loading={busy === 'save'}
          icon={<Star aria-hidden size={18} />}
        >
          {t('Save version')}
        </Button>
      </form>
      {named >= maxNamed && (
        <p className="text-ink-muted text-sm">
          {t(
            'You have {maxNamed} named versions, the most a CV can keep. Delete one to save another.',
            { maxNamed: maxNamed },
          )}
        </p>
      )}

      {!list ? (
        <div className="skeleton h-40 rounded-lg" aria-busy="true" aria-label={t('Loading')} />
      ) : list.length === 0 ? (
        <p className="text-ink-muted border-line rounded-lg border border-dashed p-6 text-center">
          {t('No earlier versions yet. They appear here as you edit this CV over time.')}
        </p>
      ) : (
        <ul className="divide-line border-line divide-y rounded-lg border" data-testid="versions">
          {list.map((v) => (
            <li key={v.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                {renaming?.id === v.id ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void rename();
                    }}
                  >
                    <input
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: v.id, name: e.target.value })}
                      maxLength={60}
                      aria-label={t('Version name')}
                      className="border-line-strong bg-surface h-9 min-w-0 flex-1 rounded-md border px-2"
                      autoFocus
                    />
                    <Button type="submit" size="sm" loading={busy === v.id}>
                      {t('Save')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setRenaming(null)}
                    >
                      {t('Cancel')}
                    </Button>
                  </form>
                ) : (
                  <p className="flex items-center gap-1.5 font-semibold">
                    {v.kind === 'named' && (
                      <Star aria-hidden size={15} className="text-primary shrink-0" />
                    )}
                    <span className="truncate">{versionLabel(v)}</span>
                  </p>
                )}
                <p className="text-ink-muted text-sm">
                  {when(v.savedAt)} · {v.design}
                  {v.title !== doc.title && v.title ? ` · “${v.title}”` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === v.id && !renaming}
                  onClick={() => void view(v)}
                  aria-label={t('Compare with now: {v0}, {v1}', {
                    v0: versionLabel(v),
                    v1: when(v.savedAt),
                  })}
                >
                  {t('Compare')}
                </Button>
                {v.kind === 'named' && renaming?.id !== v.id && (
                  <IconButton
                    label={t('Rename {v0}', { v0: versionLabel(v) })}
                    icon={<Pencil aria-hidden size={18} />}
                    size="sm"
                    onClick={() => setRenaming({ id: v.id, name: v.name ?? '' })}
                  />
                )}
                <IconButton
                  label={t('Delete {v0}, {v1}', { v0: versionLabel(v), v1: when(v.savedAt) })}
                  icon={<Trash2 aria-hidden size={18} />}
                  size="sm"
                  onClick={() => void remove(v)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-ink-subtle text-sm">
        {t(
          'The last 30 automatic versions are kept, plus up to {maxNamed} you name. Deleting this CV deletes its versions.',
          { maxNamed: maxNamed },
        )}
      </p>
    </div>
  );
}

function Compare({
  meta,
  then,
  now,
  confirm,
  busy,
  error,
  onBack,
  onAsk,
  onCancel,
  onRestore,
}: {
  meta: VersionMeta;
  then: ResumeDocument;
  now: ResumeDocument;
  confirm: boolean;
  busy: boolean;
  error: string;
  onBack: () => void;
  onAsk: () => void;
  onCancel: () => void;
  onRestore: () => void;
}) {
  const t = useT();
  const changes = useMemo(() => diffDocs(then, now), [then, now]);
  const [side, setSide] = useState<'then' | 'now'>('then');
  return (
    <div className="flex flex-col gap-4" data-testid="compare">
      <button
        type="button"
        onClick={onBack}
        className="text-primary -mt-2 inline-flex items-center gap-1.5 self-start font-semibold"
      >
        <ArrowLeft aria-hidden size={18} /> {t('All versions')}
      </button>
      <div>
        <h3 className="text-lg font-semibold">
          {versionLabel(meta)} · {when(meta.savedAt)}
        </h3>
        <p className="text-ink-muted text-sm">{t('Compared with your CV now.')}</p>
      </div>
      {error && <Banner tone="error" title={error} />}
      <div className="flex flex-col gap-4">
        <section aria-labelledby="changes-h" className="flex flex-col gap-2">
          <h4 id="changes-h" className="font-semibold">
            {t('What changed since then')}
          </h4>
          {changes.length === 0 ? (
            <p className="text-ink-muted text-sm">
              {t('Nothing: this version is the same as now.')}
            </p>
          ) : (
            <ul
              className="border-line flex max-h-[30vh] flex-col gap-2 overflow-y-auto rounded-lg border p-3 text-sm"
              data-testid="changes"
              tabIndex={0}
              aria-label={t('Changes')}
            >
              {changes.map((c, i) => (
                <ChangeLine key={i} c={c} />
              ))}
            </ul>
          )}
        </section>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex gap-1 md:hidden" role="group" aria-label={t('Show')}>
            {(['then', 'now'] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={side === s ? 'primary' : 'secondary'}
                aria-pressed={side === s}
                onClick={() => setSide(s)}
              >
                {s === 'then' ? t('Then') : t('Now')}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {(['then', 'now'] as const).map((s) => (
              <figure key={s} className={cn('flex flex-col gap-1', side !== s && 'hidden md:flex')}>
                <figcaption className="text-sm font-semibold">
                  {s === 'then' ? t('Then') : t('Now')}
                </figcaption>
                <div className="bg-sunken max-h-[60vh] overflow-y-auto rounded-lg p-2">
                  <DocumentPreview
                    doc={s === 'then' ? then : now}
                    title={s === 'then' ? t('The CV then') : t('The CV now')}
                  />
                </div>
              </figure>
            ))}
          </div>
        </div>
      </div>
      {confirm ? (
        <div
          className="border-line bg-sunken flex flex-col gap-3 rounded-lg border p-4"
          role="group"
          aria-label={t('Go back')}
        >
          <p>
            {t(
              'Go back to this version? Your CV as it is now is kept in History first, and Undo works too.',
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onRestore} loading={busy} icon={<RotateCcw aria-hidden size={18} />}>
              {t('Yes, go back')}
            </Button>
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              {t('Cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          className="self-start"
          variant="secondary"
          onClick={onAsk}
          disabled={changes.length === 0}
          icon={<RotateCcw aria-hidden size={18} />}
        >
          {t('Go back to this version')}
        </Button>
      )}
    </div>
  );
}

function ChangeLine({ c }: { c: Change }) {
  const tx = useT();
  const verb = c.kind === 'added' ? 'Added' : c.kind === 'removed' ? 'Removed' : 'Changed';
  return (
    <li className="flex flex-col gap-0.5">
      <span>
        <span
          className={cn(
            'font-semibold',
            c.kind === 'added' && 'text-success',
            c.kind === 'removed' && 'text-danger',
          )}
        >
          {tx(verb)}
        </span>{' '}
        {c.what ? `${c.what.charAt(0).toLowerCase()}${c.what.slice(1)} · ` : ''}
        <span className="text-ink-muted">{c.where}</span>
      </span>
      {c.before && c.after ? (
        <span className="text-ink-muted break-words">
          <del>{c.before.slice(0, 160)}</del> →{' '}
          <ins className="no-underline">{c.after.slice(0, 160)}</ins>
        </span>
      ) : c.before || c.after ? (
        <span className="text-ink-muted break-words">“{(c.before || c.after)!.slice(0, 160)}”</span>
      ) : null}
    </li>
  );
}
