'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ResumeDocument } from '@/modules/resume/schema';
import { getRepository } from '@/modules/storage/repository';
import { commit, redo as redoH, undo as undoH, type History } from './history';

import { useWorkspaceTitle } from '@/features/workspace/use-title';
import { useWorkspace } from '@/features/workspace/context';
import { restoreDraftHistory, type DraftHistory } from './draft-history';

export type SaveState = 'saved' | 'saving' | 'error';

export type DocumentEditor = {
  doc: ResumeDocument;
  /** Apply an edit. `key` groups rapid typing in one field into a single undo step. */
  update: (fn: (d: ResumeDocument) => ResumeDocument, key?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saveState: SaveState;
  flush: () => void;
  recovery: ResumeDocument | null;
  recover: () => void;
  dismissRecovery: () => void;
};

const SAVE_DELAY = 400;

export function useDocumentEditor(initial: ResumeDocument): DocumentEditor {
  const { store, tabId } = useWorkspace();
  const [repository] = useState(getRepository);
  // Editor and guided routes share one entity history within their owning tab.
  const key = `editor.document.${initial.id}.history`;
  const [restored] = useState(() =>
    restoreDraftHistory(
      store && tabId ? ((store.readFeature(tabId, key) as DraftHistory | undefined) ?? null) : null,
      initial,
    ),
  );
  const [local, setLocal] = useState(restored);
  const [restoredUnsaved] = useState(
    () => JSON.stringify(restored.history.present) !== JSON.stringify(initial),
  );
  const mounted = useRef(true);
  const snapshotRef = useRef(restored);
  const initialized = useRef(false);
  const getSnapshot = useCallback(
    () =>
      !initialized.current
        ? restored
        : store && tabId
          ? ((store.readFeature(tabId, key) as DraftHistory | undefined) ?? restored)
          : local,
    [store, tabId, key, restored, local],
  );
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    getSnapshot,
    () => restored,
  );
  const history = snapshot.history;
  useWorkspaceTitle(history.present.role === 'profile' ? 'Career profile' : history.present.title);
  const historyRef = useRef<History<ResumeDocument>>(restored.history);
  const write = useCallback(
    (next: DraftHistory, dirty: boolean) => {
      if (store && !store.isLive()) return;
      snapshotRef.current = next;
      historyRef.current = next.history;
      if (store && tabId) {
        store.writeFeature(tabId, key, next, dirty);
        if (!dirty) store.markClean(tabId, key);
      } else setLocal(next);
    },
    [store, tabId, key],
  );
  useLayoutEffect(() => {
    mounted.current = true;
    initialized.current = true;
    if (store && tabId) {
      const dirty = !!restored.recovery || restoredUnsaved;
      store.writeFeature(tabId, key, restored, dirty);
      if (!dirty) store.markClean(tabId, key);
    }
    return () => {
      mounted.current = false;
    };
  }, [store, tabId, key, restored, restoredUnsaved]);
  const apply = useCallback(
    (next: History<ResumeDocument>) => {
      write({ ...snapshotRef.current, history: next }, true);
    },
    [write],
  );
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const pending = useRef<ResumeDocument | null>(restoredUnsaved ? restored.history.present : null);
  const timer = useRef<number | null>(null);

  const persist = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const doc = pending.current;
    if (!doc) return;
    if (store && !store.isLive()) return;
    try {
      const canonical = repository.get(doc.id);
      if (
        !canonical ||
        (canonical.updatedAt !== snapshotRef.current.baseRevision &&
          JSON.stringify(canonical) !== JSON.stringify(doc))
      ) {
        if (canonical) write(restoreDraftHistory(snapshotRef.current, canonical), true);
        else write({ ...snapshotRef.current, recovery: historyRef.current }, true);
        pending.current = null;
        setSaveState('error');
        return;
      }
      repository.save(doc);
      write(
        { ...snapshotRef.current, baseRevision: doc.updatedAt },
        !!snapshotRef.current.recovery,
      );
      pending.current = null;
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [store, write, repository]);

  useEffect(() => {
    persist();
    return store?.registerFlusher(persist);
  }, [store, persist]);

  const schedule = useCallback(
    (doc: ResumeDocument) => {
      pending.current = doc;
      setSaveState('saving');
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(persist, SAVE_DELAY);
    },
    [persist],
  );

  const update = useCallback(
    (fn: (d: ResumeDocument) => ResumeDocument, key?: string) => {
      if (!mounted.current || (store && !store.isLive())) return;
      const h = historyRef.current;
      const next = fn(h.present);
      if (next === h.present) return;
      const stamped = {
        ...next,
        updatedAt: new Date(
          Math.max(Date.now(), Date.parse(h.present.updatedAt) + 1),
        ).toISOString(),
      };
      apply(commit(h, stamped, key ?? null, Date.now()));
      schedule(stamped);
    },
    [apply, schedule, store],
  );

  // Undo and redo are new edits for saving and sync: without a fresh time stamp, the account's
  // newer copy (the edit being undone) would win the next sync and bring the change back.
  const restamp = (n: History<ResumeDocument>) => ({
    ...n,
    present: {
      ...n.present,
      updatedAt: new Date(
        Math.max(Date.now(), Date.parse(historyRef.current.present.updatedAt) + 1),
      ).toISOString(),
    },
  });
  const undo = useCallback(() => {
    if (!mounted.current || (store && !store.isLive())) return;
    const h = historyRef.current;
    const u = undoH(h);
    if (u === h) return;
    const n = restamp(u);
    apply(n);
    schedule(n.present);
  }, [apply, schedule, store]);

  const redo = useCallback(() => {
    if (!mounted.current || (store && !store.isLive())) return;
    const h = historyRef.current;
    const r = redoH(h);
    if (r === h) return;
    const n = restamp(r);
    apply(n);
    schedule(n.present);
  }, [apply, schedule, store]);

  // Keyboard shortcuts: Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl+Y.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (store && (!store.isLive() || store.active().id !== tabId)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, store, tabId]);

  // Save immediately when the tab is hidden or closed; warn only if saving failed.
  useEffect(() => {
    const onHide = () => persist();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      persist();
      if (pending.current) e.preventDefault();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      persist();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [persist]);

  return {
    recovery: snapshot.recovery?.present ?? null,
    recover: () => {
      const recovery = snapshotRef.current.recovery;
      if (!recovery) return;
      write(
        {
          ...snapshotRef.current,
          recovery: snapshotRef.current.recoveries?.[0] ?? null,
          recoveries: snapshotRef.current.recoveries?.slice(1) ?? [],
        },
        true,
      );
      update(() => recovery.present);
    },
    dismissRecovery: () => {
      const remaining = snapshotRef.current.recoveries ?? [];
      write(
        { ...snapshotRef.current, recovery: remaining[0] ?? null, recoveries: remaining.slice(1) },
        !!pending.current || remaining.length > 0,
      );
    },
    doc: history.present,
    update,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    saveState,
    flush: persist,
  };
}
