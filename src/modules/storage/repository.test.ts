import { expect, it } from 'vitest';
import { driver } from '@/modules/resume/fixtures';
import { BrowserDocumentRepository, MemoryStore } from './repository';

it('exposes missed changes before subscribing and publishes revisions after storage changes', () => {
  const repo = new BrowserDocumentRepository(new MemoryStore());
  const rendered = repo.revision;
  repo.save(driver);
  expect(repo.revision).not.toBe(rendered);
  const seen: Array<[number, boolean]> = [];
  const off = repo.subscribe(() => seen.push([repo.revision, !!repo.get(driver.id)]));
  const subscribed = repo.revision;
  repo.list();
  expect(repo.revision).toBe(subscribed);
  repo.save({ ...driver, title: 'Updated' });
  repo.remove(driver.id);
  expect(seen).toEqual([
    [subscribed + 1, true],
    [subscribed + 2, false],
  ]);
  off();
});
