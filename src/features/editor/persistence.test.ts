import { describe, expect, it } from 'vitest';
import { driver } from '@/modules/resume/fixtures';
import { BrowserDocumentRepository, MemoryStore } from '@/modules/storage/repository';
import { EditorPersistence } from './persistence';

function setup() {
  const repo = new BrowserDocumentRepository(new MemoryStore());
  const doc = structuredClone(driver);
  repo.save(doc);
  return { doc, repo, storage: new EditorPersistence(repo, doc) };
}
describe('guarded editor persistence', () => {
  it('flushes pending text before capturing and commits one immediate persisted replacement', () => {
    const { doc, repo, storage } = setup();
    const typed = { ...doc, basics: { ...doc.basics, summary: 'Typed text' } };
    const snapshot = storage.capture(typed)!;
    expect(repo.get(doc.id)?.basics.summary).toBe('Typed text');
    const live = { ...typed, title: 'New name', design: { ...typed.design, accent: '#112233' } };
    const next = storage.commit(snapshot, live, (d) => ({
      ...d,
      basics: { ...d.basics, summary: 'Rewritten text' },
    }));
    expect(next?.title).toBe('New name');
    expect(next?.design.accent).toBe('#112233');
    expect(repo.get(doc.id)?.basics.summary).toBe('Rewritten text');
  });
  it('checks the baseline before flushing and never overwrites newer external content', () => {
    const { doc, repo, storage } = setup();
    repo.save({ ...doc, basics: { ...doc.basics, summary: 'Other window' } });
    expect(storage.capture({ ...doc, title: 'Pending title' })).toBeNull();
    expect(repo.get(doc.id)?.basics.summary).toBe('Other window');
  });
  it('rejects changed live content, external revisions and deletion before applying', () => {
    for (const mode of ['live', 'external', 'deleted']) {
      const { doc, repo, storage } = setup();
      const snapshot = storage.capture(doc)!;
      const live =
        mode === 'live' ? { ...doc, basics: { ...doc.basics, summary: 'New personal edit' } } : doc;
      if (mode === 'external') repo.save({ ...doc, title: 'Other window' });
      if (mode === 'deleted') repo.remove(doc.id);
      expect(storage.commit(snapshot, live, (d) => ({ ...d, title: 'AI' }))).toBeNull();
      if (mode === 'deleted') expect(repo.get(doc.id)).toBeNull();
    }
  });
  it('revokes saves, captures and commits before account cleanup', () => {
    const { doc, repo, storage } = setup();
    const snapshot = storage.capture(doc)!;
    storage.revoke();
    repo.remove(doc.id);
    expect(storage.persist(doc)).toBe(false);
    expect(storage.capture(doc)).toBeNull();
    expect(storage.commit(snapshot, doc, (d) => ({ ...d, title: 'Old account' }))).toBeNull();
    expect(repo.get(doc.id)).toBeNull();
  });
  it('does not acknowledge failed storage writes', () => {
    const { doc, repo, storage } = setup();
    const snapshot = storage.capture(doc)!;
    repo.save = () => {
      throw new Error('quota');
    };
    expect(storage.commit(snapshot, doc, (d) => ({ ...d, title: 'Unsaved' }))).toBeNull();
    expect(storage.capture({ ...doc, title: 'Unsaved' })).toBeNull();
  });
});
