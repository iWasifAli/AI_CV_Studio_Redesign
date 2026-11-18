import { describe, expect, it } from 'vitest';
import { MemoryStore } from '@/modules/storage/repository';
import { ACCOUNT_SESSION_KEY, LocalAccountIdentity } from './local-identity';

describe('offline local identity', () => {
  it('restores only a previously verified owner, and only while offline', () => {
    const storage = new MemoryStore();
    const first = new LocalAccountIdentity(() => storage);
    expect(first.offlineOwner(false)).toBeNull();
    first.verified('account-a');
    const restored = new LocalAccountIdentity(() => storage);
    expect(restored.offlineOwner(true)).toBeNull();
    expect(restored.offlineOwner(false)).toBe('account-a');
    expect(Object.keys(JSON.parse(storage.getItem(ACCOUNT_SESSION_KEY)!)).sort()).toEqual([
      'nonce',
      'uid',
    ]);
  });

  it('clears cached ownership after authoritative signed-out even before local restoration', () => {
    const storage = new MemoryStore();
    new LocalAccountIdentity(() => storage).verified('account-a');
    const cold = new LocalAccountIdentity(() => storage);
    cold.verified(null);
    expect(cold.offlineOwner(false)).toBeNull();
    expect(new LocalAccountIdentity(() => storage).offlineOwner(false)).toBeNull();
    expect(storage.getItem(ACCOUNT_SESSION_KEY) ?? '').not.toContain('account-a');
  });

  it('replaces the old cached identity after a verified account switch', () => {
    const storage = new MemoryStore();
    const owner = new LocalAccountIdentity(() => storage);
    owner.verified('account-a');
    owner.verified('account-b');
    expect(owner.offlineOwner(false)).toBe('account-b');
    expect(new LocalAccountIdentity(() => storage).offlineOwner(false)).toBe('account-b');
    expect(storage.getItem(ACCOUNT_SESSION_KEY) ?? '').not.toContain('account-a');
  });

  it('keeps a forced unknown owner locked until server verification', () => {
    const storage = new MemoryStore();
    const owner = new LocalAccountIdentity(() => storage);
    owner.verified('account-a');
    owner.forceUnknown();
    expect(owner.offlineOwner(false)).toBeNull();
    owner.verified('account-b');
    expect(owner.offlineOwner(false)).toBe('account-b');
  });

  it.each([null, JSON.stringify({ uid: 'account-b', nonce: 'switch' }), 'invalid'])(
    'revokes local access on a foreign session change (%s)',
    (event) => {
      const storage = new MemoryStore();
      const owner = new LocalAccountIdentity(() => storage);
      owner.verified('account-a');
      expect(owner.sessionChanged(event)).toBe(true);
      expect(owner.offlineOwner(false)).toBeNull();
    },
  );

  it('does not revoke or rebroadcast an unchanged verified owner', () => {
    const storage = new MemoryStore();
    const owner = new LocalAccountIdentity(() => storage);
    owner.verified('account-a');
    const before = storage.getItem(ACCOUNT_SESSION_KEY)!;
    owner.verified('account-a');
    expect(storage.getItem(ACCOUNT_SESSION_KEY)).toBe(before);
    expect(owner.sessionChanged(before)).toBe(false);
    expect(owner.offlineOwner(false)).toBe('account-a');
  });

  it.each(['invalid', '{}', '{"uid":""}', '{"uid":42,"nonce":"a"}', '{"uid":"account-a"}'])(
    'rejects malformed cached identity (%s)',
    (record) => {
      const storage = new MemoryStore();
      storage.setItem(ACCOUNT_SESSION_KEY, record);
      expect(new LocalAccountIdentity(() => storage).offlineOwner(false)).toBeNull();
    },
  );

  it('fails closed when storage cannot be read or revoked', () => {
    const inaccessible = new LocalAccountIdentity(() => {
      throw new Error('blocked');
    });
    expect(inaccessible.offlineOwner(false)).toBeNull();
    const storage = new MemoryStore();
    new LocalAccountIdentity(() => storage).verified('account-a');
    const readOnly = {
      getItem: storage.getItem.bind(storage),
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const owner = new LocalAccountIdentity(() => readOnly);
    expect(owner.offlineOwner(false)).toBeNull();
    owner.verified(null);
    expect(owner.offlineOwner(false)).toBeNull();
    expect(new LocalAccountIdentity(() => readOnly).offlineOwner(false)).toBeNull();
  });

  it('removes the previous owner if caching a verified replacement fails', () => {
    const storage = new MemoryStore();
    new LocalAccountIdentity(() => storage).verified('account-a');
    const owner = new LocalAccountIdentity(() => ({
      getItem: storage.getItem.bind(storage),
      removeItem: storage.removeItem.bind(storage),
      setItem: () => {
        throw new Error('quota exceeded');
      },
    }));
    owner.verified('account-b');
    expect(owner.offlineOwner(false)).toBe('account-b');
    expect(new LocalAccountIdentity(() => storage).offlineOwner(false)).toBeNull();
  });

  it('overwrites the previous owner when logout cannot remove its marker', () => {
    const storage = new MemoryStore();
    new LocalAccountIdentity(() => storage).verified('account-a');
    const owner = new LocalAccountIdentity(() => ({
      getItem: storage.getItem.bind(storage),
      setItem: storage.setItem.bind(storage),
      removeItem: () => {
        throw new Error('remove blocked');
      },
    }));
    owner.verified(null);
    expect(owner.offlineOwner(false)).toBeNull();
    expect(new LocalAccountIdentity(() => storage).offlineOwner(false)).toBeNull();
    expect(storage.getItem(ACCOUNT_SESSION_KEY)).not.toContain('account-a');
  });
});
