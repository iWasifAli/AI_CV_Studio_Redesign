import { describe, expect, it } from 'vitest';
import { accountGeneration, leaveSession, onSessionLeaving } from './session-lifecycle';
import { EditorPersistence } from '@/features/editor/persistence';
import { driver } from '@/modules/resume/fixtures';
import { BrowserDocumentRepository, MemoryStore } from '@/modules/storage/repository';

describe('account departure order', () => {
  it('flushes pending edits before removing account data, then revokes departing history', () => {
    const repo = new BrowserDocumentRepository(new MemoryStore());
    repo.save(driver);
    const editor = new EditorPersistence(repo, driver);
    const snapshot = editor.capture(driver)!;
    const pending = { ...driver, basics: { ...driver.basics, summary: 'Last typed words' } };
    let flushed = false;
    const off = onSessionLeaving(() => {
      flushed = editor.persist(pending);
      editor.revoke();
    });
    const generation = accountGeneration();
    leaveSession();
    expect(accountGeneration()).toBe(generation + 1);
    expect(flushed).toBe(true);
    expect(repo.get(driver.id)?.basics.summary).toBe('Last typed words');
    repo.remove(driver.id);
    expect(editor.persist(driver)).toBe(false);
    expect(editor.commit(snapshot, driver, () => pending)).toBeNull();
    expect(repo.get(driver.id)).toBeNull();
    off();
  });
});
