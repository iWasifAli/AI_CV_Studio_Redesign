import { safeParseResumeDocument, type ResumeDocument } from '@/modules/resume/schema';
import type { DocumentRepository } from '@/modules/storage/repository';

const serialize = (d: ResumeDocument) => {
  const parsed = safeParseResumeDocument(d);
  if (!parsed.success) throw new Error('Invalid document');
  return JSON.stringify(parsed.data);
};

/** Title and design may change while a content-only operation is in flight. */
export const documentContent = (d: ResumeDocument) =>
  JSON.stringify({
    id: d.id,
    basics: d.basics,
    sections: d.sections,
    role: d.role,
    jobId: d.jobId,
    locale: d.locale,
    presetId: d.presetId,
  });
export type EditorSnapshot = { content: string; owner: object };

/** Synchronous local compare/save guard; cloud and other windows keep their existing sync policy. */
export class EditorPersistence {
  private baseline: string;
  private active = true;
  private owner = {};
  constructor(
    private repo: DocumentRepository,
    initial: ResumeDocument,
  ) {
    this.baseline = serialize(initial);
  }
  revoke() {
    this.active = false;
  }
  get owned() {
    return this.active;
  }
  persist(doc: ResumeDocument): boolean {
    if (!this.active) return false;
    try {
      const stored = this.repo.get(doc.id);
      if (!stored || serialize(stored) !== this.baseline) return false;
      const serialized = serialize(doc);
      if (serialized !== this.baseline) this.repo.save(doc);
      this.baseline = serialized;
      return true;
    } catch {
      return false;
    }
  }
  capture(live: ResumeDocument): EditorSnapshot | null {
    return this.persist(live) ? { content: documentContent(live), owner: this.owner } : null;
  }
  commit(
    snapshot: EditorSnapshot,
    live: ResumeDocument,
    edit: (d: ResumeDocument) => ResumeDocument,
  ): ResumeDocument | null {
    if (!this.active || snapshot.owner !== this.owner || snapshot.content !== documentContent(live))
      return null;
    const candidate = edit(live);
    if (candidate === live) return null;
    const next = { ...candidate, updatedAt: new Date().toISOString() };
    return this.persist(next) ? next : null;
  }
}
