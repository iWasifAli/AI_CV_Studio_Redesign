import { describe, expect, it } from 'vitest';
import { driver } from '@/modules/resume/fixtures';
import { BrowserDocumentRepository, MemoryStore } from '@/modules/storage/repository';
import { EditorPersistence } from '@/features/editor/persistence';
import { activeTab } from './active';

describe('workspace switch persistence boundary', () => {
  it('flushes before another editor reads the same document and revokes the old writer', () => {
    const repo = new BrowserDocumentRepository(new MemoryStore());
    repo.save(driver);
    const old = new EditorPersistence(repo, driver);
    const pending = { ...driver, basics: { ...driver.basics, summary: 'Pending words' } };
    const off = activeTab.beforeSwitch(() => {
      old.persist(pending);
      old.revoke();
    });
    activeTab.set('replacement', true);
    const initial = repo.get(driver.id)!;
    const replacement = new EditorPersistence(repo, initial);
    expect(initial.basics.summary).toBe('Pending words');
    expect(replacement.persist({ ...initial, title: 'New editor' })).toBe(true);
    expect(old.persist(driver)).toBe(false);
    off();
  });
});
