'use client';

import { useEffect } from 'react';
import { useWorkspace } from './context';
import { routeScope } from './routes';

/** Entity names distinguish parallel saved documents and applications in the strip. */
export function useWorkspaceTitle(title: string | undefined) {
  const { store, tabId, routeKey } = useWorkspace();
  useEffect(() => {
    if (!store || !tabId || !title?.trim()) return;
    const tab = store.getTab(tabId);
    if (tab && routeScope(tab.href) === routeKey) store.setTitle(tabId, title.trim());
  }, [store, tabId, routeKey, title]);
}
