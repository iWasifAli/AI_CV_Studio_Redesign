/**
 * Browser-only photo originals, scoped to the captured account (null means guest).
 * Unknown-owner legacy entries are discarded; the editor can still frame its saved photo.
 * Reads and writes fail soft. Explicit owner cleanup reports storage failures to sign-out.
 */
import type { Crop } from './photo-field';

const DB = 'cv-photo-originals';
const STORE = 'originals';
const MAX_KEEP = 30;
const epochs = new Map<string, number>();
const ownerKey = (uid: string | null) => (uid === null ? 'guest' : `account:${uid}`);
type Entry = { key: string; owner: string; blob: Blob; crop: Crop; at: number };

function origin(owner: string, isLive?: () => boolean) {
  const epoch = epochs.get(owner) ?? 0;
  return () => epoch === (epochs.get(owner) ?? 0) && (isLive?.() ?? true);
}

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    let blocked = false;
    req.onupgradeneeded = () => {
      const existing = req.result.objectStoreNames.contains(STORE);
      const store = existing
        ? req.transaction!.objectStore(STORE)
        : req.result.createObjectStore(STORE, { keyPath: 'key' });
      // Version 1 has no trustworthy owner, including for guest photos. Never adopt those rows.
      if (existing) store.clear();
      store.createIndex('owner', 'owner');
    };
    req.onsuccess = () => {
      const db = req.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      blocked = true;
      reject(new Error('Close the other app windows to clear local files.'));
    };
  });
}

export async function photoKey(dataUrl: string): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(dataUrl);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash).slice(0, 16), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
  } catch {
    return `len-${dataUrl.length}-${dataUrl.slice(-32)}`;
  }
}

export async function loadOriginal(
  dataUrl: string,
  ownerUid: string | null = null,
  isLive?: () => boolean,
): Promise<{ blob: Blob; crop: Crop } | null> {
  const owner = ownerKey(ownerUid);
  const live = origin(owner, isLive);
  let db: IDBDatabase | null = null;
  try {
    if (!live()) return null;
    const key = JSON.stringify([owner, await photoKey(dataUrl)]);
    if (!live()) return null;
    db = await open();
    if (!db || !live()) return null;
    return await new Promise((resolve) => {
      const tx = db!.transaction(STORE);
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const e = req.result as Entry | undefined;
        resolve(live() && e?.owner === owner ? { blob: e.blob, crop: e.crop } : null);
      };
      tx.onabort = tx.onerror = req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

export async function saveOriginal(
  dataUrl: string,
  blob: Blob,
  crop: Crop,
  ownerUid: string | null = null,
  isLive?: () => boolean,
): Promise<void> {
  const owner = ownerKey(ownerUid);
  const live = origin(owner, isLive);
  let db: IDBDatabase | null = null;
  try {
    if (!live()) return;
    const key = JSON.stringify([owner, await photoKey(dataUrl)]);
    if (!live()) return;
    db = await open();
    if (!db || !live()) return;
    await new Promise<void>((resolve) => {
      const tx = db!.transaction(STORE, 'readwrite');
      tx.oncomplete = tx.onabort = tx.onerror = () => resolve();
      const store = tx.objectStore(STORE);
      store.put({ key, owner, blob, crop, at: Date.now() } satisfies Entry);
      const all = store.index('owner').getAll(owner);
      all.onsuccess = () => {
        if (!live()) {
          tx.abort();
          return;
        }
        const list = (all.result as Entry[]).sort((a, b) => b.at - a.at);
        for (const old of list.slice(MAX_KEEP)) store.delete(old.key);
      };
    });
  } catch {
    // Originals are optional; the cropped photo remains in the CV.
  } finally {
    db?.close();
  }
}

/** Clear one account's originals, fencing its already-started writes in this app window. */
export async function clearPhotoOriginals(ownerUid: string | null): Promise<void> {
  const owner = ownerKey(ownerUid);
  epochs.set(owner, (epochs.get(owner) ?? 0) + 1);
  const db = await open();
  if (!db) return;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
      const store = tx.objectStore(STORE);
      const keys = store.index('owner').getAllKeys(owner);
      keys.onsuccess = () => {
        for (const key of keys.result) store.delete(key);
      };
    });
  } finally {
    db.close();
  }
}

/** The original, scaled so its longer side is at most 1600 px (enough for any crop). */
export async function shrinkForKeeping(bitmap: ImageBitmap): Promise<Blob | null> {
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9));
  } catch {
    return null;
  }
}
