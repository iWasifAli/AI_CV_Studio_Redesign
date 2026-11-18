'use client';

import { useWorkspaceTask, useWorkspace, useWorkspaceDownload } from '@/features/workspace/context';

import { useT } from '@/i18n/client';
import Link from '@/features/workspace/navigation';
import { useMemo, useState } from 'react';
import { Copy, Download, FileText, Mail, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ScaledPage, resolvePage } from '@/features/letters/scaled-page';
import { DocumentPreview } from '@/features/preview/document-preview';
import { pdfFilename } from '@/modules/export/filename';
import type { Job } from '@/modules/jobs/schema';
import { buildLetterHtml } from '@/modules/letters/build-letter';
import { getRepository } from '@/modules/storage/repository';
import { jobAiApi, JobsError, workspaceRequest } from './api';
import { PackButton } from '@/features/export/pack-dialog';

type Problem = { message: string; premium?: boolean };

/**
 * The application kit (spec §10, §11.3): one button makes a CV tailored to this job, a cover
 * letter and an email; they are shown side by side and downloaded together.
 */
export function KitSection({
  job,
  disabled,
  loading,
  onCreate,
  onProblem,
  refresh,
  weight = 3,
}: {
  weight?: number;
  job: Job;
  disabled: boolean;
  loading: boolean;
  onCreate: () => void;
  onProblem: (p: Problem | null) => void;
  refresh: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const runTask = useWorkspaceTask();
  const { ownerUid } = useWorkspace();
  const downloadFile = useWorkspaceDownload();
  const [busy, setBusy] = useState(false);
  const cv = useMemo(
    () => (job.kit && typeof window !== 'undefined' ? getRepository().get(job.kit.cvId) : null),
    [job.kit],
  );
  const letter = job.letter;
  const html = useMemo(
    () =>
      cv && letter
        ? buildLetterHtml(cv, letter, job, {
            fonts: { kind: 'url', baseUrl: window.location.origin },
          })
        : '',
    [cv, letter, job],
  );

  const downloadAll = async () => {
    if (!cv || !letter) return;
    setBusy(true);
    onProblem(null);
    try {
      await runTask('jobs.KitSection.pdf', async (signal) => {
        const r = await fetch(
          '/api/pdf',
          workspaceRequest(
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ document: cv }),
            },
            { signal, ownerUid },
          ),
        );
        signal.throwIfAborted();
        if (!r.ok) {
          const j = (await r.json().catch(() => null)) as { error?: { message: string } } | null;
          throw new JobsError(
            j?.error?.message ?? 'We couldn’t create the PDF just now.',
            r.status,
          );
        }
        const blob = await r.blob();
        signal.throwIfAborted();
        downloadFile(blob, pdfFilename(cv.basics.name));
        const l = await jobAiApi.letterPdf(job.id, cv, { signal, ownerUid });
        const name = (cv.basics.name || 'Cover').replace(/[^\p{L}\p{N}]+/gu, '-');
        downloadFile(l, `${name}-Cover-Letter.pdf`);
        toast.show({ tone: 'success', message: 'Your CV and letter are ready to download' });
        refresh();
      });
    } catch (e) {
      onProblem(
        e instanceof JobsError
          ? { message: e.message, premium: e.status === 402 }
          : { message: 'You seem to be offline. Please try again.' },
      );
    } finally {
      setBusy(false);
    }
  };
  const copyEmail = async () => {
    if (!letter?.email) return;
    try {
      await navigator.clipboard.writeText(`${letter.email.subject}\n\n${letter.email.body}`);
      toast.show({ tone: 'success', message: 'Email copied' });
    } catch {
      toast.show({ tone: 'error', message: 'Couldn’t copy. Select the text and copy it.' });
    }
  };

  return (
    <section
      id="kit"
      aria-labelledby="kit-h"
      className="bg-primary-soft/50 border-primary/20 flex scroll-mt-20 flex-col gap-4 rounded-xl border p-4"
      data-testid="kit"
    >
      <div>
        <h3 id="kit-h" className="flex items-center gap-2 font-semibold">
          <Package aria-hidden size={18} className="text-primary" /> {t('Application kit')}
        </h3>
        <p className="text-ink-muted text-sm">
          {t(
            'A CV tailored to this job, a cover letter and a covering email — made together, from your own facts. Uses {weight} AI action',
            { weight: weight },
          )}
          {weight === 1 ? '' : 's'}.
        </p>
      </div>

      {job.kit && letter && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <figure className="flex flex-col gap-2">
            {cv ? (
              <Link
                href={`/cv/${cv.id}`}
                className="bg-surface shadow-page ring-primary block overflow-hidden rounded-[4px] hover:ring-2"
                aria-label={t('Open the tailored CV: {title}', { title: cv.title })}
              >
                <div className="pointer-events-none">
                  <DocumentPreview
                    doc={cv}
                    firstPageOnly
                    decorative
                    debounceMs={0}
                    title={t('Tailored CV')}
                  />
                </div>
              </Link>
            ) : (
              <p className="text-ink-muted bg-surface rounded-md p-3 text-sm">
                {t(
                  'The tailored CV isn’t on this device yet. It appears once your account has synced.',
                )}
              </p>
            )}
            <figcaption className="flex items-center gap-1.5 text-sm font-semibold">
              <FileText aria-hidden size={16} /> {t('Tailored CV')}
            </figcaption>
          </figure>
          <figure className="flex flex-col gap-2">
            {html && cv ? (
              <a href="#letter" aria-label={t('Edit the cover letter')} className="block">
                <ScaledPage
                  title={t('Cover letter in the kit')}
                  html={html}
                  widthMm={resolvePage(cv).widthMm}
                  heightMm={resolvePage(cv).heightMm}
                />
              </a>
            ) : null}
            <figcaption className="flex items-center gap-1.5 text-sm font-semibold">
              <FileText aria-hidden size={16} /> {t('Cover letter')}
            </figcaption>
          </figure>
          <figure className="flex flex-col gap-2">
            <div className="bg-surface border-line flex aspect-[210/297] flex-col gap-1 overflow-hidden rounded-md border p-3">
              <p className="text-[11px] leading-snug font-semibold">{letter.email.subject}</p>
              <p className="text-ink-muted overflow-hidden text-[11px] leading-snug whitespace-pre-line">
                {letter.email.body}
              </p>
            </div>
            <figcaption className="flex items-center gap-1.5 text-sm font-semibold">
              <Mail aria-hidden size={16} /> {t('Email')}
            </figcaption>
          </figure>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant={job.kit ? 'ghost' : 'primary'}
          icon={<Package aria-hidden size={18} />}
          disabled={disabled}
          loading={loading}
          onClick={onCreate}
        >
          {job.kit ? t('Make a new kit') : t('Create the kit')}
        </Button>
        {job.kit && letter && (
          <>
            <Button
              variant="secondary"
              icon={<Download aria-hidden size={18} />}
              disabled={!cv || busy}
              loading={busy}
              onClick={downloadAll}
            >
              {t('Download CV and letter')}
            </Button>
            <PackButton cv={cv} letter={`job:${job.id}`} label={t('One file with certificates')} />
            <Button variant="secondary" icon={<Copy aria-hidden size={18} />} onClick={copyEmail}>
              {t('Copy email')}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
