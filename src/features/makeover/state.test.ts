import { expect, it, vi } from 'vitest';
import {
  handOff,
  takeHandOff,
  loadPending,
  savePending,
  clearPending,
  type Pending,
} from './state';
it('keeps two file handoffs separate and consumes each once', () => {
  const a = new File(['a'], 'a.pdf'),
    b = new File(['b'], 'b.pdf');
  const first = handOff(a, 'scope-a'),
    second = handOff(b, 'scope-b');
  expect(takeHandOff(first)).toBe(a);
  expect(takeHandOff(first)).toBeNull();
  expect(takeHandOff(second)).toBe(b);
});
it('isolates pending makeovers and clearing by scope', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  });
  const pending = (id: string) =>
    ({ result: { makeoverId: id }, doc: {}, templateId: 'clarity', action: 'edit' }) as Omit<
      Pending,
      'at'
    >;
  savePending(pending('a'), 'scope-a');
  savePending(pending('b'), 'scope-b');
  expect(loadPending('scope-a')?.result.makeoverId).toBe('a');
  expect(loadPending('scope-b')?.result.makeoverId).toBe('b');
  clearPending('scope-a');
  expect(loadPending('scope-a')).toBeNull();
  expect(loadPending('scope-b')?.result.makeoverId).toBe('b');
});
