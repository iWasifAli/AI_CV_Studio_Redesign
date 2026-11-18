import { describe, expect, it } from 'vitest';
import { createDocument } from '@/modules/resume/create';
import { commit, initHistory, LIMIT } from './history';
import { restoreDraftHistory } from './draft-history';

describe('workspace document history recovery', () => {
  it('restores undo and redo when the canonical revision matches', () => {
    const doc = createDocument('general');
    const draft = { ...doc, title: 'Unsaved words' };
    const history = commit(initHistory(doc), draft, 'title', 5);
    const restored = restoreDraftHistory(
      { history, baseRevision: doc.updatedAt, recovery: null },
      doc,
    );
    expect(restored.history.present.title).toBe('Unsaved words');
    expect(restored.history.past[0]?.title).toBe(doc.title);
  });
  it('keeps a conflicting draft for explicit recovery without replacing the canonical CV', () => {
    const doc = createDocument('general');
    const history = commit(initHistory(doc), { ...doc, title: 'My draft' }, null, 5);
    const canonical = { ...doc, title: 'Newer account edit', updatedAt: '2099-01-01T00:00:00Z' };
    const restored = restoreDraftHistory(
      { history, baseRevision: doc.updatedAt, recovery: null },
      canonical,
    );
    expect(restored.history.present.title).toBe('Newer account edit');
    expect(restored.history.past).toEqual([]);
    expect(restored.recovery?.present.title).toBe('My draft');
    expect(restoreDraftHistory(restored, canonical).recovery?.present.title).toBe('My draft');
  });
  it('recognizes a completed save after a crash before the snapshot revision was updated', () => {
    const doc = createDocument('general');
    const saved = { ...doc, title: 'Saved', updatedAt: '2099-01-01T00:00:00Z' };
    const history = commit(initHistory(doc), saved, null, 5);
    const restored = restoreDraftHistory(
      { history, baseRevision: doc.updatedAt, recovery: null },
      saved,
    );
    expect(restored.recovery).toBeNull();
    expect(restored.history.past).toHaveLength(1);
  });
  it('bounds restored stacks and resets typing coalescing across mounts', () => {
    const doc = createDocument('general');
    const history = {
      ...initHistory(doc),
      past: Array(120).fill(doc),
      future: Array(120).fill(doc),
      lastKey: 'title',
      lastAt: 20,
    };
    const restored = restoreDraftHistory(
      { history, baseRevision: doc.updatedAt, recovery: null },
      doc,
    );
    expect(restored.history.past).toHaveLength(LIMIT);
    expect(restored.history.future).toHaveLength(LIMIT);
    expect(restored.history.lastKey).toBeNull();
  });
});

it('isolates a corrupt history snapshot instead of crashing document restoration', () => {
  const doc = createDocument('general');
  const broken = { history: { present: null }, baseRevision: doc.updatedAt, recovery: null };
  expect(restoreDraftHistory(broken as never, doc).history.present.id).toBe(doc.id);
});

it('retains an unresolved draft when the canonical CV changes again', () => {
  const doc = createDocument('general');
  const history = commit(initHistory(doc), { ...doc, title: 'Original unsaved draft' }, null, 1);
  const second = { ...doc, title: 'Account version two', updatedAt: '2098-01-01T00:00:00Z' };
  const restored = restoreDraftHistory(
    { history, baseRevision: doc.updatedAt, recovery: null },
    second,
  );
  const third = { ...second, title: 'Account version three', updatedAt: '2099-01-01T00:00:00Z' };
  const again = restoreDraftHistory(restored, third);
  expect(
    [
      again.recovery,
      ...('recoveries' in again ? (again.recoveries as (typeof history)[]) : []),
    ].map((h) => h?.present.title),
  ).toContain('Original unsaved draft');
});
