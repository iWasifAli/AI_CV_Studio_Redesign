'use client';

import { useT } from '@/i18n/client';
import { useWorkspaceDownload } from '@/features/workspace/context';
import { Button } from '@/components/ui/button';
import type { DocumentEditor } from './use-document-editor';

/** Restoring is always an explicit new edit against the canonical document. */
export function RecoveryBanner({ editor }: { editor: DocumentEditor }) {
  const t = useT();
  const download = useWorkspaceDownload();
  if (!editor.recovery) return null;
  return (
    <section role="status" className="bg-warning-soft flex flex-wrap items-center gap-3 p-3">
      <p>{t('A newer saved CV was found. Your earlier draft is kept for recovery.')}</p>
      <Button size="sm" onClick={editor.recover}>
        {t('Restore my draft')}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          download(
            new Blob(
              [
                JSON.stringify({
                  app: 'ai-cv-studio',
                  version: 1,
                  exportedAt: new Date().toISOString(),
                  documents: [editor.recovery],
                }),
              ],
              { type: 'application/json' },
            ),
            'CV-draft-recovery.json',
          )
        }
      >
        {t('Download draft')}
      </Button>
      <Button size="sm" variant="secondary" onClick={editor.dismissRecovery}>
        {t('Keep saved CV')}
      </Button>
    </section>
  );
}
