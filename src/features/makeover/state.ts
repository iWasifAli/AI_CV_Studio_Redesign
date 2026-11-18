'use client';

import type { Coverage } from '@/modules/import/coverage';
import type { ImportKind } from '@/modules/import/extract';
import type { ImportReport } from '@/modules/import/parse';
import type { Chip } from '@/modules/makeover/polish';
import type { Profile } from '@/modules/makeover/profile';
import type { ContentStats, Ranked } from '@/modules/makeover/rank';
import type { DesignId, ResumeDocument } from '@/modules/resume/schema';

/** What /api/makeover returns. */
export type MakeoverResult = {
  makeoverId: string;
  mode: 'full' | 'preview';
  previewFor: 'visitor' | 'limit' | null;
  document: ResumeDocument;
  report: ImportReport;
  method: 'ai' | 'rules';
  kind: ImportKind;
  scanned: boolean;
  photo: boolean;
  /** The person's photo cut from the original ('' when none was found). */
  portrait?: string;
  lines: string[];
  coverage: Coverage;
  profile: Profile;
  stats: ContentStats;
  ranking: Ranked[];
  counts: Record<Chip, number>;
  ai: boolean;
};

export const ACCEPT =
  '.pdf,.docx,.doc,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp,image/heic,image/heif';
export const ACCEPT_RE = /\.(pdf|docx|doc|jpe?g|png|webp|heic|heif)$/i;
export const MAX_BYTES = 10 * 1024 * 1024;

/** Checks the browser can do before uploading (the server checks the bytes again). */
export function fileProblem(f: File): string | null {
  if (!ACCEPT_RE.test(f.name) && !/^image\//.test(f.type))
    return 'Please choose a PDF, a Word file (.docx or .doc) or a photo of your CV (JPG, PNG or HEIC).';
  if (f.size > MAX_BYTES) return 'That file is larger than 10 MB. Please choose a smaller file.';
  if (f.size === 0) return 'That file is empty.';
  return null;
}

// Explicit opaque handoffs avoid a landing page in one tab consuming another tab's file.
const handoffs = new Map<string, File>();
export function handOff(file: File, scope: string | null = null): string {
  const key = scope ? crypto.randomUUID() : 'guest';
  handoffs.set(key, file);
  return key;
}
export function takeHandOff(key = 'guest'): File | null {
  const file = handoffs.get(key) ?? null;
  handoffs.delete(key);
  return file;
}

/** A makeover kept through sign-in / sign-up (this browser only, for a day). */
export type Pending = {
  result: MakeoverResult;
  doc: ResumeDocument;
  templateId: DesignId;
  action: 'download' | 'edit';
  at: number;
};
const KEY = 'cvs_makeover';
const pendingKey = (scope: string | null) => (scope ? `${KEY}:${scope}` : KEY);
const DAY = 86_400_000;

export function savePending(p: Omit<Pending, 'at'>, scope: string | null = null) {
  try {
    localStorage.setItem(pendingKey(scope), JSON.stringify({ ...p, at: Date.now() }));
  } catch {
    // Storage full or blocked: the person can upload again after signing in.
  }
}
export function loadPending(scope: string | null = null): Pending | null {
  try {
    const raw = localStorage.getItem(pendingKey(scope));
    if (!raw) return null;
    const p = JSON.parse(raw) as Pending;
    if (!p?.result?.makeoverId || Date.now() - p.at > DAY) {
      localStorage.removeItem(pendingKey(scope));
      return null;
    }
    return p;
  } catch {
    return null;
  }
}
export function clearPending(scope: string | null = null) {
  void savePendingFile(null, scope);
  try {
    localStorage.removeItem(pendingKey(scope));
  } catch {
    // ignore
  }
}

/**
 * The original file, kept in this browser (IndexedDB) beside the pending makeover so the
 * before/after view still works after sign-in. Fails soft; removed with the pending makeover.
 */
const FILE_DB = 'cvs_makeover_file';
function fileDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(FILE_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('f');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
export async function savePendingFile(
  file: File | null,
  scope: string | null = null,
): Promise<void> {
  const db = await fileDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction('f', 'readwrite');
      if (file) tx.objectStore('f').put(file, scope ?? 'file');
      else tx.objectStore('f').delete(scope ?? 'file');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
export async function loadPendingFile(scope: string | null = null): Promise<File | null> {
  const db = await fileDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db
        .transaction('f')
        .objectStore('f')
        .get(scope ?? 'file');
      req.onsuccess = () => resolve(req.result instanceof File ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
