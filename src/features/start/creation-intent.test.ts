import { describe, expect, it } from 'vitest';
import { createDocument } from '@/modules/resume/create';
import { BrowserDocumentRepository, MemoryStore } from '@/modules/storage/repository';
import { completeCreationIntent } from './creation-intent';

describe('CV creation intent', () => {
  it('durably records the allocated document before the first repository write', async () => {
    const repo = new BrowserDocumentRepository(new MemoryStore());
    const intent = createDocument('general');
    let durable = false;
    repo.subscribe(() => {
      expect(durable).toBe(true);
    });
    await completeCreationIntent(
      intent,
      repo,
      async () => {
        durable = true;
      },
      new AbortController().signal,
    );
    expect(repo.list().map((d) => d.id)).toEqual([intent.id]);
  });
  it('replays the same id and preserves edits made after a completed creation', async () => {
    const repo = new BrowserDocumentRepository(new MemoryStore());
    const intent = createDocument('general');
    await completeCreationIntent(intent, repo, async () => {}, new AbortController().signal);
    repo.save({ ...intent, title: 'Edited after creation' });
    const restored = await completeCreationIntent(
      intent,
      repo,
      async () => {},
      new AbortController().signal,
    );
    expect(repo.list()).toHaveLength(1);
    expect(restored.title).toBe('Edited after creation');
  });
  it('does not create when durable intent storage fails or the owner is invalidated', async () => {
    const repo = new BrowserDocumentRepository(new MemoryStore());
    const intent = createDocument('general');
    await expect(
      completeCreationIntent(
        intent,
        repo,
        async () => {
          throw new Error('disk full');
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('disk full');
    const controller = new AbortController();
    await expect(
      completeCreationIntent(
        intent,
        repo,
        async () => {
          controller.abort();
        },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(repo.list()).toEqual([]);
  });
});
