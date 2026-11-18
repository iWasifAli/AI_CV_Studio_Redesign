import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as cache from './photo-originals';

type Row = {
  key: string;
  owner?: string;
  blob: Blob;
  crop: { zoom: number; x: number; y: number };
  at: number;
};
// Asynchronous IndexedDB boundary double, including atomic transaction rollback and owner indexes.
function database() {
  const rows = new Map<string, Row>();
  let version = 1;
  const connections: { close: ReturnType<typeof vi.fn> }[] = [];
  function transaction(mode: IDBTransactionMode = 'readonly', upgrade = false) {
    const data = upgrade ? rows : new Map(rows);
    let pending = 0;
    let ended = false;
    const tx = {
      oncomplete: null as (() => void) | null,
      onabort: null as (() => void) | null,
      onerror: null as (() => void) | null,
      abort() {
        if (!ended) {
          ended = true;
          queueMicrotask(() => tx.onabort?.());
        }
      },
      objectStore: () => store,
    };
    const finish = () => {
      if (pending || ended || upgrade) return;
      ended = true;
      if (mode === 'readwrite') {
        rows.clear();
        for (const [key, row] of data) rows.set(key, row);
      }
      tx.oncomplete?.();
    };
    function request<T>(result: T) {
      pending++;
      const req = {
        result,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };
      queueMicrotask(() => {
        if (!ended) req.onsuccess?.();
        pending--;
        queueMicrotask(finish);
      });
      return req;
    }
    const store = {
      get: (key: string) => request(data.get(key)),
      put: (row: Row) => {
        data.set(row.key, row);
        return request(row.key);
      },
      delete: (key: string) => {
        data.delete(key);
        return request(undefined);
      },
      clear: () => {
        data.clear();
        return request(undefined);
      },
      getAll: () => request([...data.values()]),
      indexNames: { contains: () => false },
      createIndex: () => {},
      index: () => ({
        getAll: (owner: string) => request([...data.values()].filter((r) => r.owner === owner)),
        getAllKeys: (owner: string) =>
          request([...data.values()].filter((r) => r.owner === owner).map((r) => r.key)),
      }),
    };
    queueMicrotask(finish);
    return tx;
  }
  const factory = {
    open: (_name: string, next = version) => {
      const db = {
        close: vi.fn(),
        transaction: (_store: string, mode?: IDBTransactionMode) => transaction(mode),
        objectStoreNames: { contains: () => true },
        createObjectStore: () => transaction('readwrite', true).objectStore(),
      };
      connections.push(db);
      const req = {
        result: db,
        transaction: transaction('readwrite', true),
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onupgradeneeded: null as (() => void) | null,
        onblocked: null as (() => void) | null,
      };
      queueMicrotask(() => {
        if (next > version) {
          version = next;
          req.onupgradeneeded?.();
        }
        queueMicrotask(() => req.onsuccess?.());
      });
      return req;
    },
  };
  return { factory, rows, connections };
}
let db: ReturnType<typeof database>;
const crop = { zoom: 2, x: 0.3, y: 0.4 };
const photo = 'data:image/jpeg;base64,same-photo';
beforeEach(() => {
  db = database();
  vi.stubGlobal('indexedDB', db.factory);
  let tick = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => ++tick);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('isolates the same cropped photo for two accounts and a guest', async () => {
  await cache.saveOriginal(photo, new Blob(['alice']), crop, 'alice');
  expect(await cache.loadOriginal(photo, 'bob')).toBeNull();
  expect(await cache.loadOriginal(photo, null)).toBeNull();
  await cache.saveOriginal(photo, new Blob(['bob']), crop, 'bob');
  await cache.saveOriginal(photo, new Blob(['guest']), crop, null);
  for (const [uid, text] of [
    ['alice', 'alice'],
    ['bob', 'bob'],
    [null, 'guest'],
  ] as const)
    expect(await (await cache.loadOriginal(photo, uid))?.blob.text()).toBe(text);
});
it('never adopts an unowned legacy original into any account or guest cache', async () => {
  db.rows.set(await cache.photoKey(photo), {
    key: await cache.photoKey(photo),
    blob: new Blob(['unknown owner']),
    crop,
    at: 1,
  });
  expect(await cache.loadOriginal(photo, 'alice')).toBeNull();
  expect(await cache.loadOriginal(photo)).toBeNull();
  expect(db.rows.size).toBe(0);
});
it('retains the newest 30 per owner without evicting another account or guest', async () => {
  await cache.saveOriginal('bob-photo', new Blob(['bob']), crop, 'bob');
  await cache.saveOriginal('guest-photo', new Blob(['guest']), crop);
  for (let i = 0; i < 31; i++)
    await cache.saveOriginal(`alice-${i}`, new Blob([String(i)]), crop, 'alice');
  expect(await cache.loadOriginal('alice-0', 'alice')).toBeNull();
  expect(await cache.loadOriginal('alice-30', 'alice')).not.toBeNull();
  expect(await cache.loadOriginal('bob-photo', 'bob')).not.toBeNull();
  expect(await cache.loadOriginal('guest-photo')).not.toBeNull();
});
it('clears only the requested owner, including with no workspace sessions', async () => {
  for (const uid of ['alice', 'bob', null])
    await cache.saveOriginal(photo, new Blob([uid ?? 'guest']), crop, uid);
  await cache.clearPhotoOriginals('alice');
  expect(await cache.loadOriginal(photo, 'alice')).toBeNull();
  expect(await cache.loadOriginal(photo, 'bob')).not.toBeNull();
  expect(await cache.loadOriginal(photo)).not.toBeNull();
  await cache.clearPhotoOriginals(null);
  expect(await cache.loadOriginal(photo)).toBeNull();
  expect(await cache.loadOriginal(photo, 'bob')).not.toBeNull();
});
it('does not write after the originating operation aborts while hashing', async () => {
  const controller = new AbortController();
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
    controller.abort();
    return digest(...args);
  });
  await cache.saveOriginal(
    photo,
    new Blob(['late']),
    crop,
    'alice',
    () => !controller.signal.aborted,
  );
  expect(await cache.loadOriginal(photo, 'alice')).toBeNull();
});
it('a clear fences an already-started delayed save even without a live callback', async () => {
  let resolve!: (buffer: ArrayBuffer) => void;
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = cache.saveOriginal(photo, new Blob(['late']), crop, 'alice');
  // The original implementation opens storage before it hashes.
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await cache.clearPhotoOriginals('alice');
  resolve(new Uint8Array(32).buffer);
  await pending;
  expect(db.rows.size).toBe(0);
});
it('does not return an original after its originating owner becomes inactive', async () => {
  await cache.saveOriginal(photo, new Blob(['alice']), crop, 'alice');
  let live = true;
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
    live = false;
    return digest(...args);
  });
  expect(await cache.loadOriginal(photo, 'alice', () => live)).toBeNull();
});
it('fails soft without storage and releases database connections after use', async () => {
  await cache.saveOriginal(photo, new Blob(['alice']), crop, 'alice');
  await cache.loadOriginal(photo, 'alice');
  expect(db.connections.every((connection) => connection.close.mock.calls.length === 1)).toBe(true);
  vi.stubGlobal('indexedDB', undefined);
  await expect(cache.saveOriginal(photo, new Blob(['x']), crop, 'alice')).resolves.toBeUndefined();
  expect(await cache.loadOriginal(photo, 'alice')).toBeNull();
});
