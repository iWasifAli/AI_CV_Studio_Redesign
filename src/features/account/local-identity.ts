/** A local data owner, never proof of authentication or an entitlement. */
export const ACCOUNT_SESSION_KEY = 'cvstudio:account-session';
type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function ownerFromRecord(raw: string | null): string | null {
  try {
    const record = JSON.parse(raw ?? 'null') as { uid?: unknown; nonce?: unknown } | null;
    return record &&
      typeof record.uid === 'string' &&
      record.uid.length > 0 &&
      record.uid.length <= 128 &&
      typeof record.nonce === 'string' &&
      record.nonce.length > 0
      ? record.uid
      : null;
  } catch {
    return null;
  }
}

export class LocalAccountIdentity {
  // undefined allows cold offline recovery; null explicitly locks this window until verification.
  private owner: string | null | undefined;
  constructor(private storage: () => StorageAccess = () => localStorage) {}

  verified(uid: string | null): void {
    this.owner = uid;
    let storage: StorageAccess | undefined;
    try {
      storage = this.storage();
      if (uid === null) storage.removeItem(ACCOUNT_SESSION_KEY);
      else if (ownerFromRecord(storage.getItem(ACCOUNT_SESSION_KEY)) !== uid)
        storage.setItem(ACCOUNT_SESSION_KEY, JSON.stringify({ uid, nonce: crypto.randomUUID() }));
    } catch {
      // Never leave a previous owner's marker usable after a failed switch or logout write.
      try {
        if (uid === null)
          storage?.setItem(
            ACCOUNT_SESSION_KEY,
            JSON.stringify({ uid: null, nonce: crypto.randomUUID() }),
          );
        else storage?.removeItem(ACCOUNT_SESSION_KEY);
      } catch {}
    }
  }

  offlineOwner(online: boolean): string | null {
    if (online) return null;
    if (this.owner !== undefined) return this.owner;
    try {
      const storage = this.storage();
      const raw = storage.getItem(ACCOUNT_SESSION_KEY);
      const uid = ownerFromRecord(raw);
      // If this marker cannot be revoked, do not unlock cached account data from it.
      if (uid && raw) storage.setItem(ACCOUNT_SESSION_KEY, raw);
      this.owner = uid;
    } catch {
      this.owner = null;
    }
    return this.owner;
  }

  forceUnknown(): void {
    this.owner = null;
  }

  /** Cross-window signals can revoke access, but cannot authenticate the announced owner. */
  sessionChanged(raw: string | null): boolean {
    if (ownerFromRecord(raw) === this.owner) return false;
    this.forceUnknown();
    return true;
  }
}
