import type { WorkspaceSession } from './model';

export interface WorkspacePersistence {
  load(uid: string, instanceId?: string | null): Promise<WorkspaceSession | null>;
  list(uid: string): Promise<WorkspaceSession[]>;
  save(session: WorkspaceSession, epoch?: number): Promise<void>;
  epoch(uid: string): Promise<number>;
  fence(uid: string): Promise<number>;
  clear(uid: string): Promise<void>;
  removeInstance(uid: string, instanceId: string): Promise<void>;
}

export class MemoryWorkspacePersistence implements WorkspacePersistence {
  private sessions = new Map<string, WorkspaceSession>();
  private epochs = new Map<string, number>();
  async list(uid: string) {
    return structuredClone([...this.sessions.values()].filter((s) => s.ownerUid === uid));
  }
  async load(uid: string, instanceId?: string | null) {
    const sessions = await this.list(uid);
    return (
      sessions.find((s) => s.instanceId === instanceId) ??
      sessions.sort((a, b) => b.updatedAt - a.updatedAt)[0] ??
      null
    );
  }
  async save(session: WorkspaceSession, epoch = 0) {
    if (epoch !== (await this.epoch(session.ownerUid)))
      throw new DOMException('Workspace session ended', 'AbortError');
    this.sessions.set(`${session.ownerUid}:${session.instanceId}`, structuredClone(session));
  }
  async epoch(uid: string) {
    return this.epochs.get(uid) ?? 0;
  }
  async fence(uid: string) {
    const next = (await this.epoch(uid)) + 1;
    this.epochs.set(uid, next);
    return next;
  }
  async removeInstance(uid: string, instanceId: string) {
    this.sessions.delete(`${uid}:${instanceId}`);
  }
  async clear(uid: string) {
    await this.fence(uid);
    for (const [key, session] of this.sessions)
      if (session.ownerUid === uid) this.sessions.delete(key);
  }
}

type StoredSession = {
  key: string;
  ownerUid: string;
  instanceId: string;
  updatedAt: number;
  data: unknown;
  blobIds: string[];
};
type StoredBlob = { id: string; ownerUid: string; value: Blob };
const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('Browser storage is unavailable'));
  });
const complete = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Could not save this workspace'));
  });

/** Files live separately so snapshots stay small; all writes and owner fences share a transaction. */
export class IndexedDbWorkspacePersistence implements WorkspacePersistence {
  private db: Promise<IDBDatabase> | null = null;
  private blobIds = new WeakMap<Blob, Map<string, string>>();
  private open() {
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('cvstudio-workspaces', 1);
      r.onupgradeneeded = () => {
        const sessions = r.result.createObjectStore('sessions', { keyPath: 'key' });
        sessions.createIndex('ownerUid', 'ownerUid');
        const blobs = r.result.createObjectStore('blobs', { keyPath: 'id' });
        blobs.createIndex('ownerUid', 'ownerUid');
        r.result.createObjectStore('owners');
        r.result.createObjectStore('quarantine', { autoIncrement: true });
      };
      r.onsuccess = () => {
        r.result.onversionchange = () => {
          r.result.close();
          this.db = null;
        };
        resolve(r.result);
      };
      r.onerror = () => reject(r.error ?? new Error('Browser storage is unavailable'));
      r.onblocked = () => reject(new Error('Close older app windows to enable workspace saving.'));
    }).catch((error: unknown) => {
      this.db = null;
      throw error;
    });
    return this.db;
  }
  private encode(value: unknown, ownerUid: string, scope: string, blobs: StoredBlob[]): unknown {
    if (value instanceof Blob) {
      let ids = this.blobIds.get(value);
      if (!ids) this.blobIds.set(value, (ids = new Map()));
      let id = ids.get(scope);
      if (!id) {
        id = `${scope}:${crypto.randomUUID()}`;
        ids.set(scope, id);
      }
      blobs.push({ id, ownerUid, value });
      return {
        __workspaceType: 'blob',
        id,
        name: typeof File !== 'undefined' && value instanceof File ? value.name : null,
        lastModified:
          typeof File !== 'undefined' && value instanceof File ? value.lastModified : null,
        type: value.type,
      };
    }
    if (value instanceof Set)
      return {
        __workspaceType: 'set',
        values: [...value].map((v) => this.encode(v, ownerUid, scope, blobs)),
      };
    if (value instanceof Map)
      return {
        __workspaceType: 'map',
        values: [...value].map(([k, v]) => [
          this.encode(k, ownerUid, scope, blobs),
          this.encode(v, ownerUid, scope, blobs),
        ]),
      };
    if (value instanceof Date) return { __workspaceType: 'date', value: value.toISOString() };
    if (Array.isArray(value)) return value.map((v) => this.encode(v, ownerUid, scope, blobs));
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, this.encode(v, ownerUid, scope, blobs)]),
      );
    return value;
  }
  private decode(value: unknown, blobs: Map<string, Blob>): unknown {
    if (Array.isArray(value)) return value.map((v) => this.decode(v, blobs));
    if (!value || typeof value !== 'object') return value;
    const v = value as Record<string, unknown>;
    if (v.__workspaceType === 'blob' && typeof v.id === 'string') {
      const blob = blobs.get(v.id);
      if (!blob) return null;
      return typeof v.name === 'string'
        ? new File([blob], v.name, { type: blob.type, lastModified: Number(v.lastModified) || 0 })
        : blob;
    }
    if (v.__workspaceType === 'set' && Array.isArray(v.values))
      return new Set(v.values.map((x) => this.decode(x, blobs)));
    if (v.__workspaceType === 'map' && Array.isArray(v.values))
      return new Map(v.values.map((x) => this.decode(x, blobs)) as [unknown, unknown][]);
    if (v.__workspaceType === 'date' && typeof v.value === 'string') return new Date(v.value);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, this.decode(x, blobs)]));
  }
  async list(uid: string) {
    const db = await this.open();
    const tx = db.transaction(['sessions', 'blobs'], 'readonly');
    const done = complete(tx);
    const [sessions, files] = await Promise.all([
      request(tx.objectStore('sessions').index('ownerUid').getAll(uid)) as Promise<StoredSession[]>,
      request(tx.objectStore('blobs').index('ownerUid').getAll(uid)) as Promise<StoredBlob[]>,
    ]);
    await done;
    const blobs = new Map(files.map((b) => [b.id, b.value]));
    return sessions.map((s) => {
      try {
        const decoded = this.decode(s.data, blobs) as WorkspaceSession | null;
        if (!decoded || decoded.ownerUid !== uid || typeof decoded.instanceId !== 'string')
          throw new Error('Invalid recovery record');
        return decoded;
      } catch {
        return {
          version: 0,
          ownerUid: s.ownerUid,
          instanceId: s.instanceId,
          updatedAt: s.updatedAt,
          tabs: [],
          closedTabs: [],
          activeTabId: '',
          recoveryData: s.data,
        } as unknown as WorkspaceSession;
      }
    });
  }
  async load(uid: string, instanceId?: string | null) {
    const sessions = await this.list(uid);
    return (
      sessions.find((s) => s?.ownerUid === uid && s.instanceId === instanceId) ??
      sessions.filter((s) => s?.ownerUid === uid).sort((a, b) => b.updatedAt - a.updatedAt)[0] ??
      null
    );
  }
  async save(session: WorkspaceSession, epoch = 0) {
    const db = await this.open();
    const blobs: StoredBlob[] = [];
    const key = `${session.ownerUid}:${session.instanceId}`;
    const data = this.encode(session, session.ownerUid, key, blobs);
    const tx = db.transaction(['sessions', 'blobs', 'owners'], 'readwrite');
    const done = complete(tx);
    const [currentEpoch, previous] = await Promise.all([
      request(tx.objectStore('owners').get(session.ownerUid)),
      request(tx.objectStore('sessions').get(key)) as Promise<StoredSession | undefined>,
    ]);
    if ((currentEpoch ?? 0) !== epoch) {
      tx.abort();
      await done.catch(() => {});
      throw new DOMException('Workspace session ended', 'AbortError');
    }
    const blobIds = [...new Set(blobs.map((b) => b.id))];
    for (const blob of blobs) tx.objectStore('blobs').put(blob);
    for (const id of previous?.blobIds ?? [])
      if (!blobIds.includes(id)) tx.objectStore('blobs').delete(id);
    tx.objectStore('sessions').put({
      key,
      ownerUid: session.ownerUid,
      instanceId: session.instanceId,
      updatedAt: session.updatedAt,
      data,
      blobIds,
    } satisfies StoredSession);
    await done;
  }
  async epoch(uid: string) {
    const db = await this.open();
    return (
      ((await request(db.transaction('owners').objectStore('owners').get(uid))) as
        number | undefined) ?? 0
    );
  }
  async fence(uid: string) {
    const db = await this.open();
    const tx = db.transaction('owners', 'readwrite');
    const done = complete(tx);
    const next =
      (((await request(tx.objectStore('owners').get(uid))) as number | undefined) ?? 0) + 1;
    tx.objectStore('owners').put(next, uid);
    await done;
    return next;
  }
  async removeInstance(uid: string, instanceId: string) {
    const db = await this.open();
    const tx = db.transaction(['sessions', 'blobs'], 'readwrite');
    const done = complete(tx);
    const key = `${uid}:${instanceId}`;
    const previous = (await request(tx.objectStore('sessions').get(key))) as
      StoredSession | undefined;
    for (const id of previous?.blobIds ?? []) tx.objectStore('blobs').delete(id);
    tx.objectStore('sessions').delete(key);
    await done;
  }
  async clear(uid: string) {
    const db = await this.open();
    const tx = db.transaction(['owners', 'sessions', 'blobs'], 'readwrite');
    const done = complete(tx);
    const [epoch, sessions, blobs] = await Promise.all([
      request(tx.objectStore('owners').get(uid)),
      request(tx.objectStore('sessions').index('ownerUid').getAllKeys(uid)),
      request(tx.objectStore('blobs').index('ownerUid').getAllKeys(uid)),
    ]);
    tx.objectStore('owners').put((Number(epoch) || 0) + 1, uid);
    for (const key of sessions) tx.objectStore('sessions').delete(key);
    for (const key of blobs) tx.objectStore('blobs').delete(key);
    await done;
  }
}
