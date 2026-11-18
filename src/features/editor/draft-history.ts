import { safeParseResumeDocument, type ResumeDocument } from '@/modules/resume/schema';
import { initHistory, LIMIT, type History } from './history';

export type DraftHistory = {
  history: History<ResumeDocument>;
  baseRevision: string;
  recovery: History<ResumeDocument> | null;
  recoveries?: History<ResumeDocument>[];
};

const bounded = (h: History<ResumeDocument>): History<ResumeDocument> => ({
  ...h,
  past: (Array.isArray(h.past) ? h.past : [])
    .slice(-LIMIT)
    .filter((d) => d?.id === h.present.id && safeParseResumeDocument(d).success),
  future: (Array.isArray(h.future) ? h.future : [])
    .slice(0, LIMIT)
    .filter((d) => d?.id === h.present.id && safeParseResumeDocument(d).success),
  lastKey: null,
  lastAt: 0,
});

/** A different canonical revision is never overwritten by a restored draft. */
export function restoreDraftHistory(
  saved: DraftHistory | null,
  canonical: ResumeDocument,
): DraftHistory {
  if (
    !saved ||
    !safeParseResumeDocument(saved.history?.present).success ||
    saved.history.present.id !== canonical.id
  )
    return { history: initHistory(canonical), baseRevision: canonical.updatedAt, recovery: null };
  const matches =
    saved.baseRevision === canonical.updatedAt ||
    JSON.stringify(saved.history.present) === JSON.stringify(canonical);
  const kept = [saved.recovery, ...(Array.isArray(saved.recoveries) ? saved.recoveries : [])]
    .filter(
      (h): h is History<ResumeDocument> =>
        !!h && safeParseResumeDocument(h.present).success && h.present.id === canonical.id,
    )
    .map(bounded);
  if (
    !matches &&
    !kept.some((h) => JSON.stringify(h.present) === JSON.stringify(saved.history.present))
  )
    kept.push(bounded(saved.history));
  return {
    history: matches ? bounded(saved.history) : initHistory(canonical),
    baseRevision: canonical.updatedAt,
    recovery: kept[0] ?? null,
    recoveries: kept.slice(1),
  };
}
