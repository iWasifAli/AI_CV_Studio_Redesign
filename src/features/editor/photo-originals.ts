/**
 * Originals of chosen photos, kept only in this browser (IndexedDB), so the framing can be redone
 * after a reload. Keyed by a hash of the cropped photo the CV holds. Nothing is uploaded.
 * Every call fails soft: without storage the editor simply reframes the saved photo itself.
 */
import type { Crop } from './photo-field';

const DB = 'cv-photo-originals';
const STORE = 'originals';
const MAX_KEEP = 30;

type Entry = { key: string; blob: Blob; crop: Crop; at: number };

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
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

export async function loadOriginal(dataUrl: string): Promise<{ blob: Blob; crop: Crop } | null> {
  const db = await open();
  if (!db) return null;
  const key = await photoKey(dataUrl);
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => {
        const e = req.result as Entry | undefined;
        resolve(e ? { blob: e.blob, crop: e.crop } : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveOriginal(dataUrl: string, blob: Blob, crop: Crop): Promise<void> {
  const db = await open();
  if (!db) return;
  const key = await photoKey(dataUrl);
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.put({ key, blob, crop, at: Date.now() } satisfies Entry);
      // Keep the newest few only.
      const all = store.getAll();
      all.onsuccess = () => {
        const list = (all.result as Entry[]).sort((a, b) => b.at - a.at);
        for (const old of list.slice(MAX_KEEP)) store.delete(old.key);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
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
