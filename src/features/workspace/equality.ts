/** Equality for supported snapshot values. Distinct files are never treated as equal. */
export function sameSnapshotValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (a instanceof Blob || b instanceof Blob) return false;
  if (a instanceof Date || b instanceof Date)
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  if (a instanceof Set || b instanceof Set)
    return (
      a instanceof Set &&
      b instanceof Set &&
      a.size === b.size &&
      [...a].every((value) => b.has(value))
    );
  if (a instanceof Map || b instanceof Map)
    return (
      a instanceof Map &&
      b instanceof Map &&
      a.size === b.size &&
      [...a].every(([key, value]) => b.has(key) && sameSnapshotValue(value, b.get(key)))
    );
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, i) => sameSnapshotValue(value, b[i]))
    );
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.entries(left).every(
      ([key, value]) => Object.hasOwn(right, key) && sameSnapshotValue(value, right[key]),
    )
  );
}
