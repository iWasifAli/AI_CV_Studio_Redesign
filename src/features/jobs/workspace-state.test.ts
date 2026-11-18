import { describe, expect, it } from 'vitest';
import { creationIntent, keepLaterEdits, revisionOf } from './workspace-state';

describe('workflow snapshots', () => {
  it('reuses a creation UUID for equivalent payloads and rotates it for changed input', () => {
    const first = creationIntent(null, { title: 'Engineer', company: 'Acme' });
    expect(first.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(creationIntent(first, { company: 'Acme', title: 'Engineer' })).toEqual(first);
    expect(creationIntent(first, { title: 'Designer', company: 'Acme' }).key).not.toBe(first.key);
    expect(
      creationIntent(JSON.parse(JSON.stringify(first)), { title: 'Engineer', company: 'Acme' }),
    ).toEqual(first);
  });
  it('retains edits made during an outstanding request, including edits from a remount', () => {
    const submitted = { notes: 'before', fields: ['a'] };
    const later = { notes: 'after', fields: ['a'] };
    const saved = { notes: 'normalized', fields: ['a'] };
    expect(keepLaterEdits(later, submitted, saved)).toBe(later);
    expect(keepLaterEdits(structuredClone(submitted), submitted, saved)).toBe(saved);
  });
  it('treats legacy resources as revision zero', () => {
    expect(revisionOf({ id: 'legacy' })).toBe(0);
    expect(revisionOf({ revision: 4 })).toBe(4);
  });
});
