import type { ResumeDocument } from '@/modules/resume/schema';
import type { DocumentRepository } from '@/modules/storage/repository';

/** A retry resumes the already allocated id, including after a save/navigation crash. */
export async function completeCreationIntent(
  intent: ResumeDocument,
  repo: DocumentRepository,
  persistIntent: () => Promise<void>,
  signal: AbortSignal,
): Promise<ResumeDocument> {
  signal.throwIfAborted();
  await persistIntent();
  signal.throwIfAborted();
  const existing = repo.get(intent.id);
  if (existing) return existing;
  repo.save(intent);
  return intent;
}
