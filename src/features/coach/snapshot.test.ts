import { expect, it } from 'vitest';
import { newerConversation } from './snapshot';
it('retains a newer saved account conversation when an older read completes', () => {
  const current = { revision: 4, thread: null };
  expect(
    newerConversation(current, { revision: 3, thread: { messages: [], updatedAt: 'old' } }),
  ).toBe(current);
});
it('uses a clear tombstone revision and accepts a later conversation', () => {
  const old = { revision: 2, thread: { messages: [], updatedAt: 'old' } };
  const cleared = newerConversation(old, { revision: 3, thread: null });
  expect(cleared).toEqual({ revision: 3, thread: null });
  expect(newerConversation(cleared, { revision: 4, thread: old.thread }).revision).toBe(4);
});
