'use client';

import { workspaceFetch as fetch } from '@/features/workspace/request';

import {
  useWorkspaceState,
  useWorkspaceTask,
  useWorkspaceDownload,
} from '@/features/workspace/context';

import { useT } from '@/i18n/client';
import { useRef, useState } from 'react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Segmented } from '@/components/ui/segmented';
import { CheckboxField } from '@/features/editor/fields';
import { useEntitlements } from '@/features/account/entitlements';
import {
  PACK_MAX_FILE_BYTES,
  PACK_MAX_FILES,
  PACK_MAX_TOTAL_BYTES,
} from '@/modules/export/pack-limits';
import type { ResumeDocument } from '@/modules/resume/schema';

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 1024 * 1024 ? 2 : 1)} MB`;

/**
 * "Download as one file": the CV, the letter (when there is one) and certificates or other
 * documents the person adds, as one PDF or one ZIP (spec §10.1). Added files are not saved.
 */
export function PackButton({
  cv,
  letter,
  label = 'Download as one file',
  variant = 'secondary',
}: {
  cv: ResumeDocument | null;
  /** "job:<id>" or "letter:<id>" when a written letter goes in the pack. */
  letter?: string | null;
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  const tx = useT();
  const { ent } = useEntitlements();
  const [open, setOpen] = useWorkspaceState('export.packdialog.open', false);
  if (!cv || (ent && ent.features.pack === false)) return null;
  return (
    <>
      <Button variant={variant} size="sm" onClick={() => setOpen(true)} data-testid="pack-open">
        {tx(label)}
      </Button>
      {open && <PackDialog cv={cv} letter={letter ?? null} onClose={() => setOpen(false)} />}
    </>
  );
}

function PackDialog({
  cv,
  letter,
  onClose,
}: {
  cv: ResumeDocument;
  letter: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const [format, setFormat] = useWorkspaceState<'pdf' | 'zip'>('export.packdialog.format', 'pdf');
  const [withLetter, setWithLetter] = useWorkspaceState('export.packdialog.withLetter', !!letter);
  const [files, setFiles] = useWorkspaceState<File[]>('export.packdialog.files', [], {
    dirty: true,
  });
  const [problem, setProblem] = useWorkspaceState<string | null>('export.packdialog.problem', null);
  const runTask = useWorkspaceTask();
  const saveBlob = useWorkspaceDownload();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const total = files.reduce((n, f) => n + f.size, 0);

  const add = (list: FileList | null) => {
    setProblem(null);
    const next = [...files];
    for (const f of Array.from(list ?? [])) {
      if (
        !/\.(pdf|png|jpe?g)$/i.test(f.name) &&
        !/^(application\/pdf|image\/(png|jpeg))$/.test(f.type)
      ) {
        setProblem(`“${f.name}” isn’t a PDF, PNG or JPG file.`);
        continue;
      }
      if (f.size > PACK_MAX_FILE_BYTES) {
        setProblem(`“${f.name}” is larger than 5 MB.`);
        continue;
      }
      if (next.length >= PACK_MAX_FILES) {
        setProblem(`You can add up to ${PACK_MAX_FILES} documents.`);
        break;
      }
      next.push(f);
    }
    if (next.reduce((n, f) => n + f.size, 0) > PACK_MAX_TOTAL_BYTES) {
      setProblem('The documents are too large together (15 MB at most).');
      return;
    }
    setFiles(next);
    if (input.current) input.current.value = '';
  };
  const move = (i: number, by: -1 | 1) =>
    setFiles((fs) => {
      const next = [...fs];
      const j = i + by;
      if (j < 0 || j >= next.length) return fs;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const download = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await runTask('export.packdialog.download', async (signal) => {
        const body = new FormData();
        body.set('document', JSON.stringify(cv));
        body.set('format', format);
        if (letter && withLetter) body.set('letter', letter);
        files.forEach((f) => body.append('files', f, f.name));
        const r = await fetch('/api/pack', { method: 'POST', signal, body });
        if (!r.ok) {
          const j = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
          signal.throwIfAborted();
          setProblem(j?.error?.message ?? 'We couldn’t put your pack together just now.');
          return;
        }
        const name =
          /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ??
          `Application.${format}`;
        const blob = await r.blob();
        signal.throwIfAborted();
        saveBlob(blob, name);
        onClose();
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setProblem('You seem to be offline. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const order = [
    'Your CV',
    ...(letter && withLetter ? ['Your letter'] : []),
    ...files.map((f) => f.name),
  ];

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('Download as one file')}
      className="w-[min(36rem,94vw)]!"
    >
      <div className="flex flex-col gap-4" data-testid="pack-dialog">
        <p className="text-ink-muted text-sm">
          {t('Put your CV')}
          {letter ? ', your letter' : ''}{' '}
          {t(
            'and any certificates or references into one file to send or upload. The documents you add are used for this download only and are not saved.',
          )}
        </p>
        <Segmented
          label={t('File type')}
          value={format}
          onChange={setFormat}
          options={[
            { value: 'pdf', label: 'One PDF' },
            { value: 'zip', label: 'ZIP of separate files' },
          ]}
        />
        {letter && (
          <CheckboxField
            label={t('Include the letter')}
            checked={withLetter}
            onChange={setWithLetter}
          />
        )}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{t('Added documents')}</h3>
            <span className="text-ink-muted text-sm">
              {t('{length} of {PACK_MAX_FILES} · {mb} of 15 MB', {
                length: files.length,
                PACK_MAX_FILES: PACK_MAX_FILES,
                mb: mb(total),
              })}
            </span>
          </div>
          {files.length > 0 && (
            <ol className="divide-line border-line mt-2 divide-y rounded-md border text-sm">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="text-ink-muted shrink-0">{mb(f.size)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={t('Move {name} up', { name: f.name })}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => move(i, 1)}
                    disabled={i === files.length - 1}
                    aria-label={t('Move {name} down', { name: f.name })}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFiles((fs) => fs.filter((_, k) => k !== i))}
                    aria-label={t('Remove {name}', { name: f.name })}
                  >
                    {t('Remove')}
                  </Button>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-2">
            <input
              ref={input}
              type="file"
              multiple
              accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
              className="hidden"
              aria-label={t('Add certificates or other documents')}
              data-testid="pack-files"
              onChange={(e) => add(e.target.files)}
            />
            <Button variant="secondary" size="sm" onClick={() => input.current?.click()}>
              {t('Add certificates or other documents')}
            </Button>
          </div>
          <p className="text-ink-muted mt-1 text-xs">{t('PDF, PNG or JPG, up to 5 MB each.')}</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold">{t('In this order')}</h3>
          <p className="text-ink-muted text-sm" data-testid="pack-order">
            {order.join(' → ')}
          </p>
        </div>
        {problem && (
          <Banner tone="error" title={t('Something needs a look')}>
            {t(problem)}
          </Banner>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button onClick={download} disabled={busy} data-testid="pack-download">
            {busy
              ? t('Putting it together…')
              : format === 'pdf'
                ? t('Download PDF')
                : t('Download ZIP')}
          </Button>
        </div>
        <p className="text-ink-muted text-xs">{t('Counts as one PDF download.')}</p>
      </div>
    </Dialog>
  );
}
