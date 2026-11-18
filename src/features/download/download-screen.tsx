'use client';

import { workspaceFetch as fetch } from '@/features/workspace/request';

import {
  useWorkspaceState,
  useWorkspaceTask,
  useWorkspaceDownload,
} from '@/features/workspace/context';

import { useT } from '@/i18n/client';
import { tierDesignId } from '@/modules/design/catalogue';
import { DESIGN_META } from '@/modules/design/designs';
import Link from '@/features/workspace/navigation';
import { useState } from 'react';
import {
  ArrowLeft,
  Crown,
  Download,
  FileJson,
  FileText,
  LogIn,
  Printer,
  ScanText,
} from 'lucide-react';
import { specOf } from '@/modules/design/designer';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { useAccount } from '@/features/account/account-context';
import { PackButton } from '@/features/export/pack-dialog';
import { isPremiumDesign, remaining, useEntitlements } from '@/features/account/entitlements';
import { ops } from '@/modules/resume/ops';
import { getRepository } from '@/modules/storage/repository';
import { useToast } from '@/components/ui/toast';
import { DocumentPreview, type PreviewStatus } from '@/features/preview/document-preview';
import { PreviewStatusLine } from '@/features/editor/editor-screen';
import { pdfFilename } from '@/modules/export/filename';
import type { ResumeDocument } from '@/modules/resume/schema';
import { buildDocumentHtml } from '@/modules/templates/build-document';
import { HealthPanel } from '@/features/quality/health-panel';
import { SharePanel } from '@/features/share/share-panel';

type Blocked = {
  code: 'SIGN_IN_REQUIRED' | 'PREMIUM_REQUIRED' | 'LIMIT_REACHED' | 'DISABLED';
  message: string;
};

export function DownloadScreen({ doc: initialDoc }: { doc: ResumeDocument }) {
  const t = useT();
  const toast = useToast();
  const account = useAccount();
  const { ent, refresh } = useEntitlements();
  const runTask = useWorkspaceTask();
  const saveBlob = useWorkspaceDownload();
  const [repository] = useState(getRepository);
  const [doc, setDoc] = useState(initialDoc);
  const [status, setStatus] = useState<PreviewStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyWord, setBusyWord] = useState(false);
  const [busyAts, setBusyAts] = useState(false);
  const [failed, setFailed] = useWorkspaceState<string | null>(
    'download.downloadscreen.failed',
    null,
  );
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const editHref = `/cv/${doc.id}`;
  const here = `/cv/${doc.id}/download`;
  const signedOut = account.status === 'signedOut';
  const designId = tierDesignId(doc.design);
  const customDesign = designId === null;
  const lockedDesign = ent
    ? ent.plan !== 'premium' && (customDesign || isPremiumDesign(ent, designId))
    : false;
  const left = ent && ent.plan !== 'visitor' ? remaining(ent, 'pdf.download') : null;

  /** Switch to the first free design (keeps all content), from the locked-design card. */
  function switchToFreeDesign() {
    const free = ent?.designs.find((d) => d.enabled && d.tier === 'free');
    if (!free) return;
    const next = ops.useDesign(doc, free.id);
    repository.save(next);
    setDoc(next);
    setBlocked(null);
    toast.show({
      message: `Switched to ${DESIGN_META[free.id].name}. Your words are unchanged.`,
      tone: 'success',
    });
  }

  const downloadPdf = () => download('pdf');
  async function download(kind: 'pdf' | 'docx' | 'ats') {
    const setB = kind === 'pdf' ? setBusy : kind === 'ats' ? setBusyAts : setBusyWord;
    setB(true);
    setFailed(null);
    try {
      await runTask(`download.screen.${kind}`, async (signal) => {
        // The ATS PDF: the same words in one plain column, in reading order (Dual CV Export).
        const document =
          kind === 'ats' ? ops.setSpec(doc, { ...specOf(doc.design), atsSafe: true }) : doc;
        const res = await fetch(kind === 'docx' ? '/api/docx' : '/api/pdf', {
          method: 'POST',
          signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ document }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: { code?: string; message?: string };
          } | null;
          signal.throwIfAborted();
          const code = body?.error?.code;
          if (
            code === 'SIGN_IN_REQUIRED' ||
            code === 'PREMIUM_REQUIRED' ||
            code === 'LIMIT_REACHED' ||
            code === 'DISABLED'
          ) {
            setBlocked({ code, message: body?.error?.message ?? '' });
            refresh();
            return;
          }
          throw new Error(body?.error?.message ?? 'We couldn’t create the file just now.');
        }
        const name = pdfFilename(doc.basics.name);
        const blob = await res.blob();
        signal.throwIfAborted();
        saveBlob(
          blob,
          kind === 'pdf'
            ? name
            : kind === 'ats'
              ? name.replace(/\.pdf$/, '-ATS.pdf')
              : name.replace(/\.pdf$/, '.docx'),
        );
        refresh();
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setFailed(
        e instanceof Error && e.message !== 'Failed to fetch'
          ? e.message
          : 'You seem to be offline, or our PDF service is busy.',
      );
    } finally {
      setB(false);
    }
  }

  function print() {
    const html = buildDocumentHtml(doc, {
      fonts: { kind: 'url', baseUrl: window.location.origin },
      autoPrint: true,
    });
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const w = window.open(url, '_blank');
    if (!w) toast.show({ message: 'Please allow pop-ups to print your CV', tone: 'error' });
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function backup() {
    const file = {
      app: 'ai-cv-studio',
      version: 1,
      exportedAt: new Date().toISOString(),
      documents: [doc],
    };
    saveBlob(
      new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
      pdfFilename(doc.basics.name).replace(/\.pdf$/, '-backup.json'),
    );
  }

  return (
    <div className="bg-paper flex min-h-[calc(100dvh-var(--workspace-tab-height,0px))] flex-col">
      <header className="border-line bg-surface flex h-16 items-center gap-3 border-b px-2 sm:px-4">
        <Link
          href={editHref}
          className="hover:bg-sunken inline-flex h-11 items-center gap-2 rounded-md px-3 text-[15px] font-semibold"
        >
          <ArrowLeft aria-hidden size={20} /> {t('Back to editing')}
        </Link>
      </header>
      <div className="mx-auto grid w-full max-w-[1200px] flex-1 gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[minmax(0,420px)_1fr]">
        <main id="main" className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[32px] leading-tight font-semibold tracking-tight">
              {t('Ready to send')}
            </h1>
            <p className="text-ink-muted">
              {t('A last look before you download. Your PDF will look exactly like the preview.')}
            </p>
          </div>

          <HealthPanel doc={doc} pages={status?.pages} />

          {/* Beside the check, not only under the preview: on a phone the preview is further down
              (gap audit follow-up). */}
          {status?.emailWraps && (
            <Banner tone="warning" title={t('Your email breaks onto two lines in this design')}>
              <span data-testid="download-email-wraps">
                {t(
                  'It is too long for the side column. For online applications, download the ATS PDF, or choose a design with contact details across the top to keep it whole.',
                )}
              </span>
            </Banner>
          )}

          {failed && (
            <Banner
              tone="error"
              title={t('We couldn’t create the PDF')}
              action={
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={downloadPdf}>
                    {t('Try again')}
                  </Button>
                  {!signedOut && !lockedDesign && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Printer aria-hidden size={16} />}
                      onClick={print}
                    >
                      {t('Print or save as PDF')}
                    </Button>
                  )}
                </div>
              }
            >
              {failed}{' '}
              {!signedOut &&
                !lockedDesign &&
                t('You can also use your browser’s print window and choose “Save as PDF”.')}
            </Banner>
          )}

          {(blocked?.code === 'PREMIUM_REQUIRED' || lockedDesign) && (
            <section
              aria-labelledby="premium-h"
              data-gate="premium-design"
              className="border-accent/40 bg-accent-soft flex flex-col gap-3 rounded-lg border p-5"
            >
              <h2 id="premium-h" className="flex items-center gap-2 text-lg font-semibold">
                <Crown aria-hidden size={20} className="text-accent-ink" />{' '}
                {designId === null
                  ? t('Custom designs are part of Premium')
                  : t('{name} is a Premium design', { name: DESIGN_META[designId].name })}
              </h2>
              <p className="text-ink-muted">
                {t(
                  'Premium unlocks every design, AI writing help and more downloads. Or switch to a free design — your words stay exactly the same.',
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {ent?.features.sales && (
                  <ButtonLink
                    href={`/premium?next=${encodeURIComponent(here)}`}
                    icon={<Crown aria-hidden size={18} />}
                  >
                    {t('See Premium')}
                  </ButtonLink>
                )}
                <Button variant="secondary" onClick={switchToFreeDesign}>
                  {t('Use a free design instead')}
                </Button>
              </div>
            </section>
          )}

          {blocked?.code === 'LIMIT_REACHED' && (
            <Banner
              tone="warning"
              title={t('Monthly download limit reached')}
              action={
                ent?.features.sales ? (
                  <ButtonLink
                    size="sm"
                    href={`/premium?next=${encodeURIComponent(here)}`}
                    icon={<Crown aria-hidden size={16} />}
                  >
                    {t('See Premium')}
                  </ButtonLink>
                ) : undefined
              }
            >
              {t(blocked.message)}
            </Banner>
          )}
          {blocked?.code === 'DISABLED' && <Banner tone="warning">{t(blocked.message)}</Banner>}

          <div className="flex flex-col gap-3">
            {signedOut || blocked?.code === 'SIGN_IN_REQUIRED' ? (
              <>
                <ButtonLink
                  size="lg"
                  href={`/signin?next=${encodeURIComponent(here)}`}
                  icon={<LogIn aria-hidden size={20} />}
                >
                  {t('Sign in to download')}
                </ButtonLink>
                <p className="text-ink-muted text-sm">
                  {t(
                    'A free account saves your CV safely and lets you download it as a PDF. It takes under a minute.',
                  )}
                </p>
              </>
            ) : (
              <>
                <Button
                  size="lg"
                  icon={<Download aria-hidden size={20} />}
                  loading={busy}
                  loadingText={t('Preparing your PDF…')}
                  disabled={lockedDesign || account.status === 'loading'}
                  onClick={downloadPdf}
                >
                  {t('Download PDF')}
                </Button>
                <Button
                  variant="secondary"
                  icon={<ScanText aria-hidden size={18} />}
                  loading={busyAts}
                  loadingText={t('Preparing your ATS PDF…')}
                  disabled={account.status === 'loading' || busy}
                  onClick={() => download('ats')}
                  data-testid="download-ats"
                >
                  {t('ATS PDF (plain, one column)')}
                </Button>
                <p className="text-ink-muted max-w-md text-sm" data-testid="dual-export-hint">
                  {t(
                    'Two versions of the same CV: the PDF above exactly as designed, for people; the ATS PDF in one plain column with the text in reading order, for online application forms. No format can promise every system reads it perfectly.',
                  )}
                </p>
                <Button
                  variant="secondary"
                  icon={<FileText aria-hidden size={18} />}
                  loading={busyWord}
                  loadingText={t('Preparing your Word file…')}
                  disabled={account.status === 'loading' || busy}
                  onClick={() => download('docx')}
                >
                  {t('Download Word (.docx)')}
                </Button>
                <p className="text-ink-muted max-w-md text-sm" data-testid="word-hint">
                  {t(
                    'The Word file has the same words and your colour in a simple, editable one-column layout, not the layout of this design. Use it when an employer asks for Word or you want to edit the text elsewhere.',
                  )}
                </p>
                {account.status === 'signedIn' && !lockedDesign && (
                  <PackButton cv={doc} label={t('CV with certificates (one PDF or ZIP)')} />
                )}
                {left !== null && Number.isFinite(left) && (
                  <p className="text-ink-muted text-sm" data-testid="downloads-left">
                    {t('{left} of {v} downloads left this month.', {
                      left: left,
                      v: ent!.limits['pdf.download'],
                    })}
                  </p>
                )}
              </>
            )}
            <Button variant="secondary" icon={<FileJson aria-hidden size={18} />} onClick={backup}>
              {t('Save a backup file')}
            </Button>
            <p className="text-ink-muted text-sm">
              {t(
                'A backup file lets you open this CV in another browser, even without an account.',
              )}
            </p>
          </div>
          {account.status === 'signedIn' && <SharePanel docId={doc.id} />}
          {account.status === 'signedIn' && (
            <Link
              href={`/linkedin?doc=${encodeURIComponent(doc.id)}`}
              className="text-primary inline-flex items-center gap-1.5 font-semibold"
            >
              {t('Update your LinkedIn profile from this CV →')}
            </Link>
          )}
        </main>
        <section
          aria-label={t('Final preview')}
          className="bg-sunken flex flex-col gap-3 rounded-lg p-4 sm:p-8"
        >
          <PreviewStatusLine status={status} />
          <DocumentPreview doc={doc} onStatus={setStatus} title={t('Final preview of your CV')} />
        </section>
      </div>
    </div>
  );
}
