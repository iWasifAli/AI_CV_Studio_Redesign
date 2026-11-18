'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getRepository, setRepositoryOwner } from '@/modules/storage/repository';
import { clearClientSession, signOutEverywhere } from './firebase-client';
import { CloudSync, type SyncState } from './sync';
import { ACCOUNT_SESSION_KEY, LocalAccountIdentity } from './local-identity';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/client';
import type { AccountExitParticipant, ExitReport } from '@/features/workspace/lifecycle';
import { clearWorkspaceCaches } from '@/features/workspace/clear-caches';
import { downloadWorkspaceRecovery } from '@/features/workspace/recovery';

export type AccountUser = {
  uid: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  picture: string | null;
  admin: boolean;
};

type AccountValue = {
  status: 'loading' | 'signedOut' | 'signedIn' | 'offline';
  /** In offline mode only uid identifies local data; it grants no server authentication. */
  user: AccountUser | null;
  sync: SyncState;
  /** True once the first account↔device merge after sign-in has finished. */
  synced: boolean;
  refresh: () => Promise<void>;
  signOut: (everywhere?: boolean) => Promise<boolean>;
  registerExit: (participant: AccountExitParticipant) => () => void;
  flushForExit: (expectedUid?: string) => Promise<void>;
  endLocalSession: (expectedUid?: string) => void;
  finishAccountDeletion: () => Promise<void>;
};

const Ctx = createContext<AccountValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [status, setStatus] = useState<AccountValue['status']>('loading');
  const [sync, setSync] = useState<SyncState>('idle');
  const [syncedFor, setSyncedFor] = useState<string | null>(null);
  const engine = useRef<CloudSync | null>(null);
  const authGeneration = useRef(0);
  const lookupRevision = useRef(0);
  const [localIdentity] = useState(() => new LocalAccountIdentity());
  const identity = useRef<string | null>(null);
  const participant = useRef<AccountExitParticipant | null>(null);
  const signingOut = useRef<Promise<boolean> | null>(null);
  const [exitPrompt, setExitPrompt] = useState<ExitReport | null>(null);
  const [exportProblem, setExportProblem] = useState('');
  const [exporting, setExporting] = useState(false);
  const resolveExit = useRef<((choice: 'stay' | 'retry' | 'discard') => void) | null>(null);
  const t = useT();

  const applyUser = useCallback(
    (next: AccountUser | null) => {
      localIdentity.verified(next?.uid ?? null);
      if (identity.current !== (next?.uid ?? null)) {
        authGeneration.current++;
        engine.current?.stop();
        engine.current = null;
        setRepositoryOwner(next?.uid ?? null);
        identity.current = next?.uid ?? null;
        setSyncedFor(null);
      }
      setUser(next);
      setStatus(next ? 'signedIn' : 'signedOut');
    },
    [localIdentity],
  );
  const endLocalSession = useCallback(
    (expectedUid?: string) => {
      if (expectedUid && expectedUid !== identity.current) return;
      try {
        engine.current?.clearAccountDocuments();
      } finally {
        applyUser(null);
        setSync('idle');
      }
    },
    [applyUser],
  );
  const registerExit = useCallback((next: AccountExitParticipant) => {
    participant.current = next;
    return () => {
      if (participant.current === next) participant.current = null;
    };
  }, []);
  const flushForExit = useCallback(async (expectedUid?: string) => {
    if (expectedUid && expectedUid !== identity.current)
      throw new DOMException('Account session ended', 'AbortError');
    await engine.current?.flushPending();
  }, []);

  const requireVerification = useCallback(() => {
    localIdentity.forceUnknown();
    authGeneration.current++;
    engine.current?.stop();
    engine.current = null;
    setRepositoryOwner(null);
    identity.current = null;
    setUser(null);
    setSyncedFor(null);
    setSync('idle');
    setStatus('loading');
  }, [localIdentity]);

  const restoreOffline = useCallback(() => {
    const owner = localIdentity.offlineOwner(navigator.onLine);
    authGeneration.current++;
    engine.current?.stop();
    engine.current = null;
    setRepositoryOwner(owner);
    identity.current = owner;
    // Cache no profile, verification, admin or plan claims. This uid only unlocks local CVs.
    setUser(
      owner
        ? { uid: owner, email: null, name: null, emailVerified: false, picture: null, admin: false }
        : null,
    );
    setStatus(owner ? 'offline' : 'signedOut');
    setSyncedFor(null);
    setSync(owner ? 'offline' : 'idle');
  }, [localIdentity]);

  const refresh = useCallback(async () => {
    const revision = ++lookupRevision.current;
    if (!navigator.onLine) {
      restoreOffline();
      return;
    }
    // Keep the known local owner while re-verifying online; cloud sync remains stopped.
    const generation = authGeneration.current;
    const current = () =>
      generation === authGeneration.current && revision === lookupRevision.current;
    try {
      const r = await fetch('/api/me', { cache: 'no-store' });
      if (!current()) return;
      if (r.status === 401 || r.status === 403) {
        applyUser(null);
        return;
      }
      if (!r.ok) throw new Error('Account verification unavailable');
      const j = (await r.json()) as { user: AccountUser | null };
      if (!current()) return;
      if (j.user !== null && (!j.user || typeof j.user.uid !== 'string'))
        throw new Error('Invalid account response');
      applyUser(j.user);
      // Reconnect and visibility checks verify the cookie before starting another cloud merge.
      if (j.user && engine.current) void engine.current.fullSync();
    } catch {
      if (!current()) return;
      if (!navigator.onLine) restoreOffline();
      else setStatus((s) => (s === 'loading' ? 'signedOut' : s));
    }
  }, [applyUser, restoreOffline]);

  useEffect(() => {
    const lookup = lookupRevision;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => {
      window.clearTimeout(timer);
      lookup.current++;
    };
  }, [refresh]);

  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === 'visible' && !signingOut.current) void refresh();
    };
    const online = () => {
      if (!signingOut.current) void refresh();
    };
    const offline = () => {
      if (!signingOut.current) restoreOffline();
    };
    const changed = (event: StorageEvent) => {
      if ((event.key === ACCOUNT_SESSION_KEY || event.key === null) && !signingOut.current) {
        if (localIdentity.sessionChanged(event.newValue)) requireVerification();
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('storage', changed);
    return () => {
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('storage', changed);
    };
  }, [localIdentity, refresh, requireVerification, restoreOffline]);

  // An offline local owner must never start cloud sync before server verification.
  const uid = user?.uid ?? null;
  useEffect(() => {
    if (!uid || status !== 'signedIn') return;
    const s = new CloudSync(uid, getRepository());
    engine.current = s;
    const off = s.onState(setSync);
    void s.start().finally(() => {
      if (engine.current === s) setSyncedFor(uid);
    });
    return () => {
      off();
      s.stop();
      if (engine.current === s) engine.current = null;
    };
  }, [uid, status]);

  const answerExit = useCallback((choice: 'stay' | 'retry' | 'discard') => {
    const resolve = resolveExit.current;
    resolveExit.current = null;
    setExitPrompt(null);
    resolve?.(choice);
  }, []);

  const signOut = useCallback(
    (everywhere = false): Promise<boolean> => {
      if (signingOut.current) return signingOut.current;
      const work = async () => {
        authGeneration.current++;
        const ownerUid = identity.current;
        const exit = participant.current;
        const syncEngine = engine.current;
        try {
          for (;;) {
            let report: ExitReport = { hasWork: false };
            if (exit) report = await exit.prepare();
            else {
              try {
                await syncEngine?.flushPending();
              } catch {
                report = {
                  hasWork: true,
                  problem:
                    'Some CVs could not sync. Retry or download a recovery copy before leaving.',
                };
              }
            }
            if (!report.hasWork && !report.problem) break;
            setExportProblem('');
            setExitPrompt(report);
            const choice = await new Promise<'stay' | 'retry' | 'discard'>((resolve) => {
              resolveExit.current = resolve;
            });
            if (choice === 'stay') {
              exit?.cancel();
              return false;
            }
            if (choice === 'discard') break;
          }
          syncEngine?.stop();
          await signOutEverywhere(everywhere, ownerUid ?? undefined);
          // The server session has ended. Always gate local recovery to its original account,
          // even if the browser cannot clear IndexedDB at this moment.
          try {
            if (exit) await exit.commit();
            else if (ownerUid) await clearWorkspaceCaches(ownerUid, []);
          } finally {
            endLocalSession(ownerUid ?? undefined);
          }
          return true;
        } catch (error) {
          if (identity.current) {
            exit?.cancel();
            if (syncEngine && engine.current === syncEngine) void syncEngine.start();
          }
          throw error;
        }
      };
      const pending = work().finally(() => {
        signingOut.current = null;
      });
      signingOut.current = pending;
      return pending;
    },
    [endLocalSession],
  );

  const finishAccountDeletion = useCallback(async () => {
    // The DELETE confirmation already authorizes clearing this account's local work.
    const owner = identity.current;
    authGeneration.current++;
    engine.current?.stop();
    try {
      const exit = participant.current;
      if (exit) await exit.commit();
      else if (owner) await clearWorkspaceCaches(owner, []);
      await clearClientSession();
    } finally {
      endLocalSession(owner ?? undefined);
    }
  }, [endLocalSession]);

  const exportRecovery = async () => {
    setExporting(true);
    setExportProblem('');
    try {
      if (participant.current) await participant.current.exportRecovery();
      else await downloadWorkspaceRecovery([], getRepository().exportAll());
    } catch {
      setExportProblem('The recovery download failed. Your local work has been kept.');
    } finally {
      setExporting(false);
    }
  };

  const synced = uid !== null && syncedFor === uid;
  const value = useMemo(
    () => ({
      status,
      user,
      sync,
      synced,
      refresh,
      signOut,
      registerExit,
      flushForExit,
      endLocalSession,
      finishAccountDeletion,
    }),
    [
      status,
      user,
      sync,
      synced,
      refresh,
      signOut,
      registerExit,
      flushForExit,
      endLocalSession,
      finishAccountDeletion,
    ],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog
        open={!!exitPrompt}
        onClose={() => answerExit('stay')}
        title="Keep your work before signing out"
      >
        <p>
          {t(
            'Some workspace drafts or background work are only on this device. Signing out clears these tabs and drafts from this device.',
          )}
        </p>
        {exitPrompt?.problem && <p role="alert">{t(exitPrompt.problem)}</p>}
        <p className="text-ink-muted text-sm">
          {t(
            'Downloading a recovery copy keeps you signed in. Review the copy before choosing to discard local work.',
          )}
        </p>
        {exportProblem && <p role="alert">{t(exportProblem)}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => answerExit('stay')}>{t('Stay signed in')}</Button>
          <Button variant="secondary" onClick={() => answerExit('retry')}>
            {t('Retry saving')}
          </Button>
          <Button
            variant="secondary"
            loading={exporting}
            onClick={() => {
              void exportRecovery();
            }}
          >
            {t('Download recovery copy')}
          </Button>
          <Button variant="ghost" onClick={() => answerExit('discard')}>
            {t('Discard local work and sign out')}
          </Button>
        </div>
      </Dialog>
    </Ctx.Provider>
  );
}

export function useAccount(): AccountValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAccount must be used inside <AccountProvider>');
  return v;
}

/** Re-render when this device's documents change (e.g. after a sync pulls new CVs). */
export function useRepositoryVersion(): number {
  const uid = useAccount().user?.uid;
  const [n, setN] = useState(0);
  useEffect(() => getRepository().subscribe(() => setN((x) => x + 1)), [uid]);
  return n;
}
