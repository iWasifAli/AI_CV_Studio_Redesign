'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResumeDocument } from '@/modules/resume/schema';
import { activeTab } from '@/features/workspace/active';
import { onSessionLeaving } from '@/features/account/session-lifecycle';
import { EditorPersistence, type EditorSnapshot } from './persistence';
import { getRepository } from '@/modules/storage/repository';
import { commit, initHistory, redo as redoH, undo as undoH, type History } from './history';

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
  captureSnapshot: () => { document: ResumeDocument; snapshot: EditorSnapshot } | null;
  commitSnapshot: (
    snapshot: EditorSnapshot,
    edit: (d: ResumeDocument) => ResumeDocument,
  ) => boolean;
};

const SAVE_DELAY = 400;

export function useDocumentEditor(initial: ResumeDocument): DocumentEditor {
  const [history, setHistory] = useState<History<ResumeDocument>>(() => initHistory(initial));
  const historyRef = useRef<History<ResumeDocument>>(history);
  const apply = useCallback((next: History<ResumeDocument>) => {
    historyRef.current = next;
    setHistory(next);
  }, []);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const alive = useRef(true);
  const pending = useRef<ResumeDocument | null>(null);
  const timer = useRef<number | null>(null);
  const storage = useRef<EditorPersistence | null>(null);
  if (storage.current == null) storage.current = new EditorPersistence(getRepository(), initial);

  const persist = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const doc = pending.current;
    if (!doc) return;
    try {
      if (storage.current!.persist(doc)) {
        pending.current = null;
        setSaveState('saved');
      } else setSaveState('error');
    } catch {
      setSaveState('error');
    }
  }, []);

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
      if (!alive.current || !storage.current!.owned) return;
      const h = historyRef.current;
      const next = fn(h.present);
      if (next === h.present) return;
      const stamped = { ...next, updatedAt: new Date().toISOString() };
      apply(commit(h, stamped, key ?? null, Date.now()));
      schedule(stamped);
    },
    [apply, schedule],
  );

  // Undo and redo are new edits for saving and sync: without a fresh time stamp, the account's
  // newer copy (the edit being undone) would win the next sync and bring the change back.
  const restamp = (n: History<ResumeDocument>) => ({
    ...n,
    present: { ...n.present, updatedAt: new Date().toISOString() },
  });
  const undo = useCallback(() => {
    if (!alive.current || !storage.current!.owned) return;
    const h = historyRef.current;
    const u = undoH(h);
    if (u === h) return;
    const n = restamp(u);
    apply(n);
    schedule(n.present);
  }, [apply, schedule]);

  const redo = useCallback(() => {
    if (!alive.current || !storage.current!.owned) return;
    const h = historyRef.current;
    const r = redoH(h);
    if (r === h) return;
    const n = restamp(r);
    apply(n);
    schedule(n.present);
  }, [apply, schedule]);

  const captureSnapshot = useCallback(() => {
    if (!alive.current) return null;
    const document = historyRef.current.present;
    const snapshot = storage.current!.capture(document);
    if (!snapshot) {
      setSaveState('error');
      return null;
    }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    setSaveState('saved');
    return { document, snapshot };
  }, []);
  const commitSnapshot = useCallback(
    (snapshot: EditorSnapshot, edit: (d: ResumeDocument) => ResumeDocument) => {
      if (!alive.current) return false;
      const h = historyRef.current;
      const next = storage.current!.commit(snapshot, h.present, edit);
      if (!next) return false;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      pending.current = null;
      apply(commit(h, next, null, Date.now()));
      setSaveState('saved');
      return true;
    },
    [apply],
  );
  useEffect(
    () =>
      onSessionLeaving(() => {
        persist();
        storage.current!.revoke();
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = null;
        pending.current = null;
      }),
    [persist],
  );

  useEffect(
    () =>
      activeTab.beforeSwitch(() => {
        // Run before the replacement editor reads storage, not in passive unmount cleanup.
        persist();
        storage.current!.revoke();
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = null;
        pending.current = null;
      }),
    [persist],
  );

  // Keyboard shortcuts: Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl+Y.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
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
  }, [undo, redo]);

  // Save immediately when the tab is hidden or closed; warn only if saving failed.
  useEffect(() => {
    alive.current = true;
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
      alive.current = false;
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [persist]);

  return {
    doc: history.present,
    update,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    saveState,
    flush: persist,
    captureSnapshot,
    commitSnapshot,
  };
}
