'use client';
import { Fragment, useSyncExternalStore, type ReactNode } from 'react';
import { useAccount } from '@/features/account/account-context';
import { useEntitlements } from '@/features/account/entitlements';
import { activeTab } from '@/features/workspace/active';
import { TabStrip } from '@/features/workspace/tab-strip';
import { StudioLoading } from './with-document';

/** Full-screen CV routes share the same workspace slots and account remount boundary as site pages. */
export function StudioWorkspace({ children }: { children: ReactNode }) {
  const { user, status } = useAccount();
  const { ent } = useEntitlements();
  const epoch = useSyncExternalStore(
    activeTab.subscribe,
    () => activeTab.get().epoch,
    () => 0,
  );
  // Creation routes must not run once as a visitor and again when the initial session arrives.
  if (status === 'loading') return <StudioLoading />;
  return (
    <div className="studio-workspace flex h-dvh flex-col">
      {status === 'signedIn' && ent?.features.workspaceTabs && <TabStrip />}
      <div className="min-h-0 flex-1 [&>div]:h-full [&>div]:min-h-0">
        <Fragment key={`${user?.uid ?? 'visitor'}:${epoch}`}>{children}</Fragment>
      </div>
    </div>
  );
}
