import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllDrafts, clearDraft, clearTabDrafts, readDraft, writeDraft } from './drafts';

// A tiny sessionStorage stand-in (the unit tests run in Node).
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { sessionStorage: Storage }).sessionStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  } as Storage;
});

describe('workspace drafts', () => {
  it('keeps a draft per account, tab and name', () => {
    writeDraft('u1', 'tabA', 'to', 'Acme Ltd');
    writeDraft('u1', 'tabB', 'to', 'Beta Inc');
    writeDraft('u2', 'tabA', 'to', 'Other');
    expect(readDraft('u1', 'tabA', 'to')).toBe('Acme Ltd');
    expect(readDraft('u1', 'tabB', 'to')).toBe('Beta Inc');
    expect(readDraft('u2', 'tabA', 'to')).toBe('Other');
    expect(readDraft('u1', 'tabA', 'missing')).toBeUndefined();
  });
  it('stores objects and clears one draft', () => {
    writeDraft('u', 't', 'a', { x: 1 });
    expect(readDraft('u', 't', 'a')).toEqual({ x: 1 });
    clearDraft('u', 't', 'a');
    expect(readDraft('u', 't', 'a')).toBeUndefined();
  });
  it('closing a tab removes only its drafts; signing out removes all', () => {
    writeDraft('u', 'a', 'n', 1);
    writeDraft('u', 'a', 'm', 2);
    writeDraft('u', 'b', 'n', 3);
    store.set('aicv.tabs:u', '{}');
    clearTabDrafts('u', 'a');
    expect(readDraft('u', 'a', 'n')).toBeUndefined();
    expect(readDraft('u', 'a', 'm')).toBeUndefined();
    expect(readDraft('u', 'b', 'n')).toBe(3);
    clearAllDrafts();
    expect(readDraft('u', 'b', 'n')).toBeUndefined();
    expect(store.get('aicv.tabs:u')).toBe('{}');
  });
  it('refuses a draft that is too large instead of failing', () => {
    writeDraft('u', 't', 'big', 'x'.repeat(300_000));
    expect(readDraft('u', 't', 'big')).toBeUndefined();
  });
  it('survives corrupt stored text', () => {
    store.set('aicv.draft:u:t:bad', '{not json');
    expect(readDraft('u', 't', 'bad')).toBeUndefined();
  });
});
