/** Serializable creation receipt: keep with the form until a different payload is submitted. */
export type CreationIntent = { key: string; payload: string };
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value;
export function creationIntent(previous: CreationIntent | null, input: unknown): CreationIntent {
  const payload = JSON.stringify(canonical(input));
  return previous?.payload === payload ? previous : { key: crypto.randomUUID(), payload };
}
/** Functional snapshot setters compare against submitted inputs, including after a remount. */
export function keepLaterEdits<T>(current: T, submitted: T, result: T): T {
  return JSON.stringify(current) === JSON.stringify(submitted) ? result : current;
}
export function revisionOf(resource: object): number {
  return (resource as { revision?: number }).revision ?? 0;
}
