import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '@/modules/resume/create';
import { MemoryStore } from './repository';

let storage: MemoryStore;
beforeEach(() => {
  vi.resetModules();
  storage = new MemoryStore();
  vi.stubGlobal('window', { localStorage: storage });
});
afterEach(() => vi.unstubAllGlobals());

describe('production repository ownership', () => {
  it('adopts guest documents and hides unsynced account documents after account replacement', async () => {
    const { getRepository, setRepositoryOwner } = await import('./repository');
    const guest = createDocument('general');
    getRepository().save(guest);
    setRepositoryOwner('alice');
    const alice = getRepository();
    const offline = createDocument('general');
    alice.save(offline);
    expect(alice.list()).toHaveLength(2);
    setRepositoryOwner('bob');
    expect(getRepository().list()).toEqual([]);
    expect(getRepository().get(offline.id)).toBeNull();
    expect(getRepository().exportAll().documents).toEqual([]);
    setRepositoryOwner(null);
    expect(getRepository().list()).toEqual([]);
    setRepositoryOwner('alice');
    expect(
      getRepository()
        .list()
        .map((d) => d.id)
        .sort(),
    ).toEqual([guest.id, offline.id].sort());
  });
  it('fences old handles even after signing back into the same account', async () => {
    const { getRepository, setRepositoryOwner } = await import('./repository');
    setRepositoryOwner('alice');
    const old = getRepository();
    const doc = createDocument('general');
    old.save(doc);
    setRepositoryOwner('bob');
    expect(() => old.save({ ...doc, title: 'Late result' })).toThrowError(
      expect.objectContaining({ name: 'AbortError' }),
    );
    expect(() => old.remove(doc.id)).toThrowError(expect.objectContaining({ name: 'AbortError' }));
    expect(old.get(doc.id)).toBeNull();
    setRepositoryOwner('alice');
    expect(() => old.save(doc)).toThrowError(expect.objectContaining({ name: 'AbortError' }));
    expect(getRepository().get(doc.id)?.title).toBe('My CV');
  });
  it('persists owner metadata across a reload and prevents guessed-id overwrite or deletion', async () => {
    let api = await import('./repository');
    api.setRepositoryOwner('alice');
    const doc = createDocument('general');
    api.getRepository().save(doc);
    vi.resetModules();
    api = await import('./repository');
    expect(api.getRepository().list()).toEqual([]);
    api.setRepositoryOwner('bob');
    expect(() => api.getRepository().save({ ...doc, title: 'Collision' })).toThrow();
    expect(() => api.getRepository().remove(doc.id)).toThrow();
    api.setRepositoryOwner('alice');
    expect(api.getRepository().get(doc.id)?.title).toBe('My CV');
  });
  it('migrates successfully synced legacy documents before adopting guest documents', async () => {
    const doc = createDocument('general');
    storage.setItem(`cvstudio:v1:doc:${doc.id}`, JSON.stringify(doc));
    storage.setItem('cvstudio:v1:sync:alice', JSON.stringify([doc.id]));
    const { getRepository, setRepositoryOwner } = await import('./repository');
    setRepositoryOwner('bob');
    expect(getRepository().list()).toEqual([]);
    setRepositoryOwner('alice');
    expect(getRepository().get(doc.id)?.id).toBe(doc.id);
  });
});
