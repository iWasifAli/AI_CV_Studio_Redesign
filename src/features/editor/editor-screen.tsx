'use client';
import { RecoveryBanner } from '@/features/editor/recovery-banner';

import { useWorkspaceState } from '@/features/workspace/context';

import { useT } from '@/i18n/client';
import { AiDocProvider } from '@/features/ai/context';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, Eye, ListChecks, Palette, PenLine } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { ButtonLink } from '@/components/ui/button';
import { Tabs, tabId, tabPanelId } from '@/components/ui/tabs';
import { cn } from '@/lib/cn';
import { DocumentPreview, type PreviewStatus } from '@/features/preview/document-preview';
import { StudioBar } from '@/features/studio/studio-bar';
import { ops } from '@/modules/resume/ops';
import type { ResumeDocument } from '@/modules/resume/schema';
import { ContentPanel, type ContentPanelHandle } from './content-panel';
import { DesignPanel } from './design-panel';
import { CheckPanel } from '@/features/quality/check-panel';
import { findInlineField, inlinePatch } from '@/modules/resume/inline-edit';
import { ProfileSyncBanner } from './profile-sync-banner';
import { useDocumentEditor } from './use-document-editor';
import { VersionHistoryButton } from './version-history';
import { TranslateButton } from '@/features/translate/translate-dialog';
import { useAccount } from '@/features/account/account-context';

type View = 'content' | 'design' | 'check' | 'preview';

export function PreviewStatusLine({
  status,
  onCompact,
}: {
  status: PreviewStatus | null;
  onCompact?: () => void;
}) {
  const tx = useT();
  if (!status) return <p className="text-ink-muted h-6 text-sm">{tx('Preparing preview…')}</p>;
  return (
    <div
      className="text-ink-muted flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 text-sm"
      aria-live="polite"
    >
      <span data-testid="page-count">
        {status.pages} {status.pages === 1 ? 'page' : 'pages'}
      </span>
      {status.nearlyFits && onCompact && (
        <span>
          {tx('· Only a little runs onto page 2.')}{' '}
          <button
            type="button"
            onClick={onCompact}
            className="text-primary font-semibold underline underline-offset-4"
          >
            {tx('Fit on one page')}
          </button>
        </span>
      )}
      {status.emailWraps && (
        <span className="basis-full" data-testid="email-wraps">
          {tx(
            'Your email is too long for this design’s side column, so it breaks onto two lines. Designs with contact details across the top keep it whole.',
          )}
        </span>
      )}
    </div>
  );
}

export function EditorScreen({ initial }: { initial: ResumeDocument }) {
  const tx = useT();
  const editor = useDocumentEditor(initial);
  const { doc, update } = editor;
  const signedIn = useAccount().status === 'signedIn';
  const params = useSearchParams();
  const [welcome, setWelcome] = useWorkspaceState(
    'editor.editorscreen.welcome',
    params.get('welcome') === '1',
  );
  // ?tab=design opens the Look panel straight away (Studio Home and next-best-step links).
  const [view, setView] = useWorkspaceState<View>('editor.editorscreen.view', () => {
    const t = params.get('tab');
    return t === 'design' || t === 'check' ? t : 'content';
  });
  const [status, setStatus] = useState<PreviewStatus | null>(null);
  const content = useRef<ContentPanelHandle>(null);
  const panelTab = view === 'preview' ? 'content' : view;

  const onSelect = (ref: string, text?: string) => {
    // Text that is one field is edited right there on the page (keep the focus in the preview).
    if (text && findInlineField(doc, ref, text)) return;
    setView('content');
    content.current?.reveal(ref);
  };
  const inlineEdit = {
    can: (ref: string, text: string) => !!findInlineField(doc, ref, text),
    commit: (ref: string, original: string, text: string) => {
      update((d) => {
        const f = findInlineField(d, ref, original);
        const p = f && inlinePatch(d, f, text);
        if (!p) return d;
        return 'basics' in p
          ? ops.updateBasics(d, p.basics)
          : ops.updateItem(d, p.sectionId, p.itemId, p.patch);
      }, `inline.${ref}.${Date.now()}`);
    },
  };
  // Drag on the page: before/after the target, as one undo step.
  const onMove = (m: { kind: 'sec' | 'item'; ref: string; to: string; after: boolean }) => {
    const place = (from: number, t: number) =>
      from < t ? (m.after ? t : t - 1) : m.after ? t + 1 : t;
    update((d) => {
      if (m.kind === 'sec') {
        const from = d.sections.findIndex((s) => s.id === m.ref);
        const t = d.sections.findIndex((s) => s.id === m.to);
        return from < 0 || t < 0 ? d : ops.moveSectionTo(d, m.ref, place(from, t));
      }
      const [sid, iid] = m.ref.split('/');
      const [tsid, tid] = m.to.split('/');
      if (!sid || !iid || sid !== tsid) return d;
      const items = d.sections.find((s) => s.id === sid)?.items ?? [];
      const from = items.findIndex((i) => i.id === iid);
      const t = items.findIndex((i) => i.id === tid);
      return from < 0 || t < 0 ? d : ops.moveItemTo(d, sid, iid, place(from, t));
    }, `move.${Date.now()}`);
  };
  const compact = () => update((d) => ops.setDesign(d, { density: 'compact' }));
  // Links from the CV check open the editor at a field: /cv/:id?focus=<sectionId>/<itemId>.
  const focus = params.get('focus');
  useEffect(() => {
    if (!focus) return;
    const t = window.setTimeout(() => content.current?.reveal(focus), 300);
    return () => window.clearTimeout(t);
  }, [focus]);

  const download = (
    <ButtonLink
      href={`/cv/${doc.id}/download`}
      // Save now: the download page reads this CV from storage before the editor unmounts, so
      // a change made in the last moment would otherwise be missing from the PDF.
      onClick={() => editor.flush()}
      size="sm"
      className="sm:h-11 sm:px-4"
      icon={<Download aria-hidden size={18} />}
    >
      {tx('Download')}
    </ButtonLink>
  );

  return (
    <AiDocProvider value={doc}>
      <div className="bg-paper flex h-[calc(100dvh-var(--workspace-tab-height,0px))] flex-col">
        <StudioBar
          editor={editor}
          backHref="/documents"
          backLabel={tx('Back to Documents')}
          pageHeading
          action={
            <>
              {signedIn && <TranslateButton doc={editor.doc} />}
              {signedIn && <VersionHistoryButton editor={editor} />}
              {download}
            </>
          }
        />
        <RecoveryBanner editor={editor} />
        <div className="flex min-h-0 flex-1">
          <main
            id="main"
            className={cn(
              'border-line min-h-0 w-full overflow-y-auto pb-24 lg:w-[460px] lg:shrink-0 lg:border-r lg:pb-8',
              view === 'preview' && 'hidden lg:block',
            )}
          >
            <div className="bg-paper/95 sticky top-0 z-10 hidden px-5 pt-3 backdrop-blur lg:block">
              <Tabs
                label={tx('Edit your CV')}
                idBase="editor"
                value={panelTab}
                onChange={(v) => setView(v)}
                tabs={[
                  { value: 'content', label: 'Content', icon: <PenLine aria-hidden size={18} /> },
                  { value: 'design', label: 'Design', icon: <Palette aria-hidden size={18} /> },
                  { value: 'check', label: 'Check', icon: <ListChecks aria-hidden size={18} /> },
                ]}
              />
            </div>
            <div
              role="tabpanel"
              id={tabPanelId('editor', panelTab)}
              aria-labelledby={tabId('editor', panelTab)}
              className="px-4 pt-4 sm:px-5"
            >
              <h2 className="sr-only">
                {panelTab === 'content'
                  ? tx('Content')
                  : panelTab === 'design'
                    ? tx('Design')
                    : tx('Check')}
              </h2>
              {doc.role === 'profile' && (
                <Banner
                  tone="info"
                  title={tx('This is your career profile')}
                  className="mb-4"
                  action={
                    <ButtonLink href="/documents" size="sm" variant="secondary">
                      {tx('Make a CV from it')}
                    </ButtonLink>
                  }
                >
                  {tx(
                    'Keep all your experience here — even things you leave off some CVs. New and tailored CVs are copies of it, so update facts here first.',
                  )}
                </Banner>
              )}
              <ProfileSyncBanner doc={doc} />
              {welcome && doc.role !== 'profile' && (
                <Banner
                  tone="success"
                  title={tx('Your CV is ready')}
                  onDismiss={() => setWelcome(false)}
                  className="mb-4"
                >
                  {tx(
                    'Check the preview, change anything you like, then download it. Everything saves automatically.',
                  )}
                </Banner>
              )}
              {panelTab === 'content' ? (
                <ContentPanel ref={content} editor={editor} />
              ) : panelTab === 'design' ? (
                <DesignPanel editor={editor} status={status} />
              ) : (
                <CheckPanel
                  doc={doc}
                  pages={status?.pages}
                  onShow={(ref) => {
                    setView('content');
                    window.setTimeout(() => content.current?.reveal(ref), 50);
                  }}
                  onDesign={() => setView('design')}
                  apply={(fn) => update(fn, `proofread.${Date.now()}`)}
                />
              )}
            </div>
          </main>

          <section
            aria-label={tx('Preview')}
            className={cn(
              'bg-sunken min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-24 lg:block lg:px-10 lg:pt-6 lg:pb-10',
              view === 'preview' ? 'block' : 'hidden',
            )}
          >
            <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">
              <PreviewStatusLine
                status={status}
                onCompact={doc.design.density !== 'compact' ? compact : undefined}
              />
              <DocumentPreview
                doc={doc}
                onStatus={setStatus}
                onSelect={onSelect}
                inlineEdit={inlineEdit}
                onMove={onMove}
                title={tx('Preview of your CV. Click any part to edit it.')}
              />
            </div>
          </section>
        </div>

        <nav
          aria-label={tx('Editor views')}
          className="border-line bg-surface fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {(
            [
              ['content', 'Edit', PenLine],
              ['design', 'Design', Palette],
              ['check', 'Check', ListChecks],
              ['preview', 'Preview', Eye],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              aria-current={view === v ? 'page' : undefined}
              onClick={() => setView(v)}
              className={cn(
                'flex h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold',
                view === v ? 'text-primary' : 'text-ink-muted',
              )}
            >
              <Icon aria-hidden size={22} />
              {tx(label)}
            </button>
          ))}
        </nav>
      </div>
    </AiDocProvider>
  );
}
