'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { DocumentEditor } from '@/features/editor/use-document-editor';
import type { ResumeDocument } from '@/modules/resume/schema';
import { AtsPanel, type KeywordEntry } from './ats-panel';
import type { AtsWorkspace } from './ats-workspace';
import { CommentsPanel } from '@/features/share/comments-panel';
import { HealthPanel } from './health-panel';
import { ProofreadPanel } from './proofread-panel';
import { QuantifyPanel } from './quantify-panel';
import { GapPanel } from './gap-panel';

/**
 * The editor's Check tab (spec §11.3): the CV health check and the ATS check together. Every
 * finding has a "Show me" that opens the field, or the Design tab for layout fixes.
 */
export function CheckPanel({
  doc,
  pages,
  onShow,
  onDesign,
  apply,
  editor,
  ats,
  setAts,
  keywordEntry,
}: {
  doc: ResumeDocument;
  editor?: DocumentEditor;
  ats: AtsWorkspace;
  setAts: Dispatch<SetStateAction<AtsWorkspace>>;
  keywordEntry: KeywordEntry;
  pages?: number;
  onShow: (ref: string) => void;
  onDesign: () => void;
  /** Change the CV as one undo step (proofreading fixes). */
  apply?: (fn: (d: ResumeDocument) => ResumeDocument) => void;
}) {
  return (
    <div className="flex flex-col gap-5 pb-6">
      <CommentsPanel docId={doc.id} onShow={onShow} />
      <HealthPanel doc={doc} pages={pages} onShow={onShow} />
      {apply && <ProofreadPanel doc={doc} onShow={onShow} apply={apply} />}
      {apply && <QuantifyPanel doc={doc} onShow={onShow} apply={apply} />}
      {apply && <GapPanel doc={doc} apply={apply} />}
      <AtsPanel
        doc={doc}
        editor={editor}
        onShow={onShow}
        onDesign={onDesign}
        state={ats}
        setState={setAts}
        entry={keywordEntry}
      />
    </div>
  );
}
