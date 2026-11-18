import { sameSnapshotValue } from './equality';

/** Three-way merge: only fields still equal to the acknowledged/submitted value are clean. */
export function reconcileCanonicalFields<T extends object>(current: T, baseline: T, next: T): T {
  const merged = { ...current };
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (sameSnapshotValue(current[key], baseline[key])) merged[key] = next[key];
  }
  return merged;
}

/** Revisions win over timestamps; legacy records without revisions use their server timestamp. */
export function isNewerCanonical(
  current: { revision?: number; updatedAt: string },
  next: { revision?: number; updatedAt: string },
): boolean {
  if (current.revision !== undefined || next.revision !== undefined)
    return (next.revision ?? 0) > (current.revision ?? 0);
  return next.updatedAt > current.updatedAt;
}
