/**
 * Drafts: unsaved input kept per account and per workspace tab, in this browser window only
 * (sessionStorage). Saved records stay canonical; a draft is just what was typed and not yet
 * saved, so switching tabs or reloading doesn't lose it.
 */
const PREFIX = 'aicv.draft:';
const MAX_BYTES = 200_000;

const k = (uid: string, tab: string, name: string) => `${PREFIX}${uid}:${tab}:${name}`;

export function readDraft<T>(uid: string, tab: string, name: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(k(uid, tab, name));
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

export function writeDraft(uid: string, tab: string, name: string, value: unknown): void {
  try {
    const raw = JSON.stringify(value);
    if (raw.length > MAX_BYTES) return;
    sessionStorage.setItem(k(uid, tab, name), raw);
  } catch {
    // Storage full or blocked: the draft is simply not kept.
  }
}

export function clearDraft(uid: string, tab: string, name: string): void {
  try {
    sessionStorage.removeItem(k(uid, tab, name));
  } catch {}
}

/** Remove every draft of one tab (when it is closed) or of everything (when signing out). */
export function clearTabDrafts(uid: string, tab: string): void {
  removeWhere((key) => key.startsWith(`${PREFIX}${uid}:${tab}:`));
}
export function clearAllDrafts(): void {
  removeWhere((key) => key.startsWith(PREFIX));
}
function removeWhere(test: (key: string) => boolean) {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && test(key)) keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch {}
}
