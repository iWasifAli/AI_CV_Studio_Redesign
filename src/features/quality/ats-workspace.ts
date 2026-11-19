'use client';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { useDraftSlot } from '@/features/workspace/use-draft';
import { documentContent } from '@/features/editor/persistence';
import type { ResumeDocument } from '@/modules/resume/schema';
import type { AtsReport } from '@/modules/quality/ats';
import { keywordRewriteResult, type KeywordRewriteResult } from '@/modules/quality/keyword-rewrite';

const keywords = z.object({
  jobTitle: z.string(),
  jobId: z.string().optional(),
  advertFingerprint: z.string().optional(),
  present: z.array(z.string()).max(25),
  missing: z
    .array(
      z.object({
        term: z.string(),
        line: z.object({ text: z.string(), ref: z.string() }).optional(),
      }),
    )
    .max(25),
});
const report = z.object({
  at: z.string(),
  sample: z.array(z.string()),
  keywords: keywords.optional(),
  checks: z.array(
    z.object({
      id: z.enum(['readable', 'contact', 'jobs', 'order', 'headings', 'layout', 'length']),
      title: z.string(),
      detail: z.string(),
      status: z.enum(['pass', 'needs-work', 'info']),
      fix: z.string().optional(),
      where: z.string().optional(),
      examples: z.array(z.string()).optional(),
    }),
  ),
});
export const atsReport = report;
const saved = z.object({
  content: z.string(),
  pdf: z.string(),
  jobId: z.string(),
  report: report.nullable(),
  picked: z.array(z.string().max(60)).max(25),
  result: keywordRewriteResult.nullable(),
});
export type AtsWorkspace = {
  content: string;
  pdf: string;
  jobId: string;
  report: AtsReport | null;
  picked: string[];
  result: KeywordRewriteResult | null;
  entryConsumed: boolean;
  verified: boolean;
};
/** Compact expiry keys for UI restoration only; editor writes use exact full snapshots. */
function compact(text: string) {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x85ebca6b);
  }
  return `${text.length}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
}
export const contentIdentity = (doc: ResumeDocument) => compact(documentContent(doc));
export const pdfIdentity = (doc: ResumeDocument) =>
  compact(JSON.stringify([contentIdentity(doc), doc.design]));

/** Lives with the editor, including when Content/Look hides the Check panel. */
export function useAtsWorkspace(doc: ResumeDocument) {
  const slot = useDraftSlot<unknown>(`quality.ats.${doc.id}`);
  const [state, setState] = useState<AtsWorkspace>(() => ({
    content: '',
    pdf: '',
    jobId: doc.jobId ?? '',
    report: null,
    picked: [],
    result: null,
    entryConsumed: false,
    verified: false,
  }));
  const [restored, setRestored] = useState<typeof slot | null>(null);
  if (restored !== slot) {
    setRestored(slot);
    const parsed = saved.safeParse(slot.read());
    if (parsed.success && parsed.data.content === contentIdentity(doc) && !state.report) {
      setState({ ...parsed.data, entryConsumed: state.entryConsumed, verified: false });
    }
  }
  useEffect(() => {
    if (!state.report) return;
    slot.write({ ...state, content: contentIdentity(doc) });
  }, [slot, state, doc]);
  return [state, setState] as const;
}
