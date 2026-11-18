import { safeParseResumeDocument, type ResumeDocument } from '@/modules/resume/schema';

/**
 * Storage boundary. Features talk to DocumentRepository only; Phase 6 adds a server
 * implementation behind the same interface (see docs/engineering/data-model.md).
 */
export type DocumentSummary = Pick<
  ResumeDocument,
  'id' | 'title' | 'updatedAt' | 'createdAt' | 'presetId'
> & {
  name: string;
  templateId: ResumeDocument['design']['templateId'];
  role: 'cv' | 'profile';
  jobId?: string;
};

export type RepositoryEvent = { type: 'save' | 'remove'; id: string };

export interface DocumentRepository {
  /** Notified after every local save/remove (used by cloud sync). Returns an unsubscribe. */
  subscribe(listener: (e: RepositoryEvent) => void): () => void;
  list(): DocumentSummary[];
  get(id: string): ResumeDocument | null;
  save(doc: ResumeDocument): void;
  remove(id: string): void;
  exportAll(): BackupFile;
  importAll(backup: unknown): { added: number; skipped: number };
}

export type BackupFile = {
  app: 'ai-cv-studio';
  version: 1;
  exportedAt: string;
  documents: ResumeDocument[];
};

const PREFIX = 'cvstudio:v1:doc:';
const OWNER_PREFIX = 'cvstudio:v1:doc-owner:';
const LEGACY_SYNC_PREFIX = 'cvstudio:v1:sync:';

/** Omit for isolated repositories; production instances capture their account generation. */
export type RepositoryAccess = { ownerUid: string | null; isCurrent: () => boolean };
const staleOwner = () =>
  new DOMException('This document belongs to a different account session.', 'AbortError');

const QUARANTINE = 'cvstudio:v1:quarantine:';

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key'> & { readonly length: number };

export class BrowserDocumentRepository implements DocumentRepository {
  private listeners = new Set<(e: RepositoryEvent) => void>();
  constructor(
    private readonly store: KV,
    private readonly access?: RepositoryAccess,
  ) {
    if (!access) return;
    // Migrate the old successful-sync map before treating any remaining unowned CVs as guests.
    const legacy = new Map<string, string | null>();
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key?.startsWith(LEGACY_SYNC_PREFIX)) continue;
      let ids: unknown;
      try {
        ids = JSON.parse(store.getItem(key) ?? '[]');
      } catch {
        continue;
      }
      if (!Array.isArray(ids)) continue;
      const uid = key.slice(LEGACY_SYNC_PREFIX.length);
      for (const id of ids)
        if (typeof id === 'string')
          legacy.set(id, legacy.has(id) && legacy.get(id) !== uid ? null : uid);
    }
    for (const [id, uid] of legacy) {
      if (store.getItem(OWNER_PREFIX + id) === null)
        store.setItem(OWNER_PREFIX + id, uid === null ? '{"conflict":true}' : JSON.stringify(uid));
    }
    if (access.ownerUid)
      for (const key of this.keys()) {
        const id = key.slice(PREFIX.length);
        if (
          store.getItem(OWNER_PREFIX + id) === null ||
          store.getItem(OWNER_PREFIX + id) === 'null'
        )
          store.setItem(OWNER_PREFIX + id, JSON.stringify(access.ownerUid));
      }
  }

  private visible(id: string) {
    if (!this.access) return true;
    if (!this.access.isCurrent()) return false;
    const owner = this.store.getItem(OWNER_PREFIX + id);
    return owner === null
      ? this.access.ownerUid === null
      : owner === JSON.stringify(this.access.ownerUid);
  }
  private writable(id: string) {
    if (!this.access) return;
    if (!this.access.isCurrent()) throw staleOwner();
    const owner = this.store.getItem(OWNER_PREFIX + id);
    if (owner !== null && owner !== JSON.stringify(this.access.ownerUid)) throw staleOwner();
  }

  subscribe(listener: (e: RepositoryEvent) => void) {
    this.listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (!this.access?.isCurrent() || !event.key?.startsWith(PREFIX)) return;
      const id = event.key.slice(PREFIX.length);
      if (this.visible(id)) listener({ type: event.newValue === null ? 'remove' : 'save', id });
    };
    if (this.access && typeof window !== 'undefined')
      window.addEventListener?.('storage', onStorage);
    return () => {
      this.listeners.delete(listener);
      if (this.access && typeof window !== 'undefined')
        window.removeEventListener?.('storage', onStorage);
    };
  }

  private emit(e: RepositoryEvent) {
    this.listeners.forEach((l) => l(e));
  }

  private keys(): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.store.length; i++) {
      const k = this.store.key(i);
      if (k?.startsWith(PREFIX)) out.push(k);
    }
    return out;
  }

  get(id: string): ResumeDocument | null {
    if (!this.visible(id)) return null;
    const raw = this.store.getItem(PREFIX + id);
    if (!raw) return null;
    try {
      const parsed = safeParseResumeDocument(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      /* fall through */
    }
    // Never silently drop user data: move unreadable documents aside for recovery.
    this.store.setItem(QUARANTINE + id, raw);
    this.store.removeItem(PREFIX + id);
    return null;
  }

  list(): DocumentSummary[] {
    return this.keys()
      .map((k) => this.get(k.slice(PREFIX.length)))
      .filter((d): d is ResumeDocument => d !== null)
      .map((d) => ({
        id: d.id,
        title: d.title,
        updatedAt: d.updatedAt,
        createdAt: d.createdAt,
        presetId: d.presetId,
        name: d.basics.name,
        templateId: d.design.templateId,
        role: d.role ?? 'cv',
        ...(d.jobId ? { jobId: d.jobId } : {}),
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  save(doc: ResumeDocument): void {
    this.writable(doc.id);
    // Claim first: a failed metadata write must never leave an unowned account document.
    if (this.access)
      this.store.setItem(OWNER_PREFIX + doc.id, JSON.stringify(this.access.ownerUid));
    this.store.setItem(PREFIX + doc.id, JSON.stringify(doc));
    this.emit({ type: 'save', id: doc.id });
  }

  remove(id: string): void {
    this.writable(id);
    this.store.removeItem(PREFIX + id);
    this.emit({ type: 'remove', id });
  }

  exportAll(): BackupFile {
    const documents = this.keys()
      .map((k) => this.get(k.slice(PREFIX.length)))
      .filter((d): d is ResumeDocument => d !== null);
    return { app: 'ai-cv-studio', version: 1, exportedAt: new Date().toISOString(), documents };
  }

  importAll(backup: unknown): { added: number; skipped: number } {
    const docs = (backup as Partial<BackupFile> | null)?.documents;
    if ((backup as Partial<BackupFile> | null)?.app !== 'ai-cv-studio' || !Array.isArray(docs)) {
      throw new Error('This file is not an AI CV Studio backup.');
    }
    let added = 0;
    let skipped = 0;
    for (const raw of docs.slice(0, 200)) {
      const parsed = safeParseResumeDocument(raw);
      if (!parsed.success) {
        skipped++;
        continue;
      }
      let doc = parsed.data;
      // Never overwrite: an existing id gets a fresh copy instead.
      if (this.store.getItem(PREFIX + doc.id))
        doc = { ...doc, id: `${doc.id}-${Date.now().toString(36)}` };
      this.save(doc);
      added++;
    }
    return { added, skipped };
  }
}

/** In-memory KV for tests and for browsers where storage is unavailable. */
export class MemoryStore implements KV {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return Array.from(this.m.keys())[i] ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

let singleton: DocumentRepository | null = null;
let productionStorage: KV | null = null;
let ownerUid: string | null = null;
let generation = 0;

/** The repository for this browser. Falls back to memory if storage is blocked. */
export function getRepository(): DocumentRepository {
  if (singleton) return singleton;
  let store: KV;
  if (productionStorage) store = productionStorage;
  else
    try {
      window.localStorage.setItem('cvstudio:probe', '1');
      window.localStorage.removeItem('cvstudio:probe');
      store = window.localStorage;
    } catch {
      store = new MemoryStore();
    }
  productionStorage = store;
  const capturedGeneration = generation;
  const capturedOwner = ownerUid;
  singleton = new BrowserDocumentRepository(store, {
    ownerUid: capturedOwner,
    isCurrent: () => generation === capturedGeneration && ownerUid === capturedOwner,
  });
  return singleton;
}

/**
 * Call synchronously before publishing an auth identity change. Existing handles become inert
 * for reads and throw AbortError for mutations. Owner metadata includes unsynced local saves.
 * No documents are deleted: explicit sign-out cleanup must use the current handle first.
 */
export function setRepositoryOwner(uid: string | null): void {
  if (uid === ownerUid) return;
  generation++;
  ownerUid = uid;
  singleton = null;
  // Adoption is synchronous, so a guest CV cannot be adopted by a later unrelated account.
  getRepository();
}
