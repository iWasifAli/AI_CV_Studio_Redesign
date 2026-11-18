import { beforeEach, expect, it, vi } from 'vitest';
import { readDraft, saveDraft, type PortfolioDraft } from './draft';
const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  };
};
beforeEach(() => {
  vi.stubGlobal('localStorage', storage());
  vi.stubGlobal('sessionStorage', storage());
});
const draft = (slug: string): PortfolioDraft => ({
  slug,
  docId: 'cv',
  published: false,
  showEmail: false,
  showPhone: false,
  theme: 'auto',
  sections: [],
  projects: [],
  contact: false,
});
it('opens exactly the requested preview without another tab replacing it', () => {
  const first = saveDraft(draft('first'), 'owner-a');
  const second = saveDraft(draft('second'), 'owner-a');
  expect(first).not.toBe(second);
  expect(readDraft(first, 'owner-a')?.slug).toBe('first');
  expect(readDraft(second, 'owner-a')?.slug).toBe('second');
});
it('does not expose a preview to another account or fall back to the latest draft', () => {
  const key = saveDraft(draft('private'), 'owner-a');
  expect(readDraft(key, 'owner-b')).toBeNull();
  expect(readDraft(null, 'owner-a')).toBeNull();
});
it('expires preview handoffs', () => {
  const key = saveDraft(draft('old'), 'owner-a');
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 86_400_001);
  expect(readDraft(key, 'owner-a')).toBeNull();
  vi.restoreAllMocks();
});
