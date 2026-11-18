import { clearPhotoOriginals } from '@/features/editor/photo-originals';
import type { WorkspaceSession } from './model';

/** Remove only this owner's auxiliary feature caches; account entities are cleared separately. */
export async function clearWorkspaceCaches(uid: string, sessions: WorkspaceSession[]) {
  await clearPhotoOriginals(uid);
  const pending = new Set<string>();
  for (const session of sessions) {
    if (session.ownerUid !== uid || !Array.isArray(session.tabs)) continue;
    for (const tab of [...session.tabs, ...(session.closedTabs ?? [])]) {
      try {
        const url = new URL(tab.href, 'https://workspace.invalid');
        const key = url.searchParams.get('pending');
        if (url.pathname === '/makeover' && key && /^[a-zA-Z0-9-]{20,80}$/.test(key))
          pending.add(key);
      } catch {}
    }
  }
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    const storage = globalThis[name];
    if (!storage) continue;
    const remove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;
      const scoped = [
        'cv.design.recent:',
        'cv.design.lastChoice:',
        'cvstudio:v1:linkedin-review:',
        'cvs_makeover:',
      ].some((prefix) => key.startsWith(`${prefix}${uid}/`));
      let preview = false;
      if (key.startsWith('cvstudio:portfolio-preview:')) {
        try {
          preview = JSON.parse(storage.getItem(key) ?? 'null')?.ownerUid === uid;
        } catch {}
      }
      if (
        scoped ||
        preview ||
        key === `cvstudio:workspace-window:${uid}` ||
        key.startsWith(`cvstudio:workspace-peer:${uid}:`) ||
        [...pending].some((id) => key === `cvs_makeover:${id}`)
      )
        remove.push(key);
    }
    for (const key of remove) storage.removeItem(key);
  }
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('cvs_makeover_file', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('f');
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('Close the other app windows to clear local files.'));
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('f', 'readwrite');
      const cursor = tx.objectStore('f').openCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        if (
          typeof entry.key === 'string' &&
          (entry.key.startsWith(`${uid}/`) || pending.has(entry.key))
        )
          entry.delete();
        entry.continue();
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}
