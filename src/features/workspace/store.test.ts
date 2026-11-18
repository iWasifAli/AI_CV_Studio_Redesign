import { describe, expect, it } from 'vitest';
import { WorkspaceStore } from './store';
import { MemoryWorkspacePersistence } from './storage';
import { entityKey, routeInfo, workspaceHref } from './routes';

async function setup() {
  const persistence = new MemoryWorkspacePersistence();
  const store = await WorkspaceStore.open('alice', persistence, null, '/studio');
  return { store, persistence };
}

describe('workspace navigation', () => {
  it('classifies editable identities independently of panels and refuses external routes', () => {
    expect(entityKey('/cv/a/guided?tab=design')).toBe('cv:a');
    expect(entityKey('/cv/a/download')).toBe('cv:a');
    expect(entityKey('/letters/new?type=cover')).toBeNull();
    expect(routeInfo('/account')).toBeNull();
    expect(routeInfo('//evil.example/cv/a')).toBeNull();
    expect(workspaceHref('/cv/a?tab=design#name', 'one')).toBe(
      '/cv/a?tab=design&_workspace=one#name',
    );
  });
  it('isolates same-route forms and focuses an existing saved document', async () => {
    const { store } = await setup();
    const a = store.add('/letters/new').id;
    store.writeFeature(a, '/letters/new:subject', 'First', true);
    const b = store.add('/letters/new').id;
    store.writeFeature(b, '/letters/new:subject', 'Second', true);
    expect(store.readFeature(a, '/letters/new:subject')).toBe('First');
    expect(store.readFeature(b, '/letters/new:subject')).toBe('Second');
    const cv = store.add('/cv/resume').id;
    expect(store.add('/cv/resume/download').id).toBe(cv);
    expect(store.getSnapshot().session.activeTabId).toBe(cv);
  });
  it('keeps closed drafts recoverable and always leaves an open home tab', async () => {
    const { store } = await setup();
    const id = store.getSnapshot().session.activeTabId;
    store.writeFeature(id, 'letter', 'Draft', true);
    store.close(id);
    expect(store.getSnapshot().session.tabs).toHaveLength(1);
    expect(store.getSnapshot().session.tabs[0]?.href).toBe('/studio');
    const restored = store.reopen(id);
    expect(restored?.id).toBe(id);
    expect(store.readFeature(id, 'letter')).toBe('Draft');
  });
  it('restores committed state without sharing a writable session between windows', async () => {
    const { store, persistence } = await setup();
    const tab = store.add('/letters/new');
    store.writeFeature(tab.id, 'draft', { text: 'Keep me' }, true);
    await store.flush();
    const restored = await WorkspaceStore.open(
      'alice',
      persistence,
      store.getSnapshot().session.instanceId,
      '/studio',
    );
    expect(restored.getSnapshot().session.instanceId).not.toBe(
      store.getSnapshot().session.instanceId,
    );
    expect(restored.readFeature(tab.id, 'draft')).toEqual({ text: 'Keep me' });
    const other = await WorkspaceStore.open(
      'bob',
      persistence,
      store.getSnapshot().session.instanceId,
      '/studio',
    );
    expect(other.getSnapshot().session.tabs.some((t) => t.id === tab.id)).toBe(false);
  });
});

describe('workspace task lifecycle', () => {
  it('finishes in its original closed tab without selecting it', async () => {
    const { store } = await setup();
    const origin = store.add('/makeover').id;
    let finish!: (value: string) => void;
    const task = store.runTask(
      origin,
      'upload',
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const other = store.add('/jobs').id;
    store.close(origin);
    finish('done');
    await expect(task).resolves.toBe('done');
    expect(store.getSnapshot().session.activeTabId).toBe(other);
    expect(
      store.getSnapshot().session.closedTabs.find((t) => t.id === origin)?.tasks.upload?.status,
    ).toBe('complete');
  });
  it('rejects late task results and writes after owner invalidation', async () => {
    const { store } = await setup();
    const tab = store.getSnapshot().session.activeTabId;
    let finish!: () => void;
    const task = store.runTask(
      tab,
      'ai',
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    store.invalidate();
    finish();
    await expect(task).rejects.toMatchObject({ name: 'AbortError' });
    store.writeFeature(tab, 'draft', 'late', true);
    expect(store.readFeature(tab, 'draft')).toBeUndefined();
  });
  it('restores pending work as interrupted without executing it again', async () => {
    const { store, persistence } = await setup();
    const tab = store.getSnapshot().session.activeTabId;
    let finish!: () => void;
    const task = store.runTask(
      tab,
      'ai',
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await store.flush();
    const next = await WorkspaceStore.open(
      'alice',
      persistence,
      store.getSnapshot().session.instanceId,
      '/studio',
    );
    expect(next.getSnapshot().session.tabs[0]?.tasks.ai?.status).toBe('interrupted');
    finish();
    await task;
  });
  it('retains work in memory and reports a failed durable save', async () => {
    const { store, persistence } = await setup();
    persistence.save = async () => {
      throw new Error('Quota exceeded');
    };
    const id = store.getSnapshot().session.activeTabId;
    store.writeFeature(id, 'draft', 'Keep this', true);
    await expect(store.flush()).rejects.toThrow('Quota exceeded');
    expect(store.getSnapshot().persistence).toBe('error');
    expect(store.readFeature(id, 'draft')).toBe('Keep this');
  });
});

describe('malformed recovery data', () => {
  it('skips invalid tabs and snapshot entries while preserving valid drafts', async () => {
    const { store, persistence } = await setup();
    const session = structuredClone(store.getSnapshot().session);
    const raw = session as unknown as { tabs: unknown[] };
    raw.tabs.push({ id: 'bad', href: '//outside.example/cv' });
    Object.assign(session.tabs[0]!.features, {
      broken: 9,
      future: { version: 2, value: 'future' },
      draft: { version: 1, value: 'kept', dirty: true, updatedAt: 1 },
    });
    await persistence.save(session);
    const restored = await WorkspaceStore.open('alice', persistence, session.instanceId, '/studio');
    expect(restored.getSnapshot().session.tabs).toHaveLength(1);
    expect(restored.readFeature(restored.active().id, 'draft')).toBe('kept');
    expect(restored.hasFeature(restored.active().id, 'broken')).toBe(false);
    restored.invalidate();
    store.invalidate();
  });
});
