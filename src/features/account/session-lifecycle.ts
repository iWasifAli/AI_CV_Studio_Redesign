/** Notify editors before account data is removed, including while sign-out is still awaiting I/O. */
const listeners = new Set<() => void>();
let generation = 0;
export const accountGeneration = () => generation;
export function onSessionLeaving(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function leaveSession() {
  generation++;
  for (const listener of [...listeners]) listener();
}
