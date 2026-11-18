'use client';

import { useCallback } from 'react';
import { useWorkspace } from './context';

/** A server save acknowledges its submitted value; newer edits remain dirty. */
export function useWorkspaceAcknowledge<T>(key: string) {
  const { store, tabId, routeKey } = useWorkspace();
  return useCallback(
    (value: T) => {
      if (!store || !tabId || !store.isLive()) return;
      const fullKey = `${routeKey}:${key}`;
      const feature = store.getTab(tabId)?.features[fullKey];
      if (feature) store.markClean(tabId, fullKey, { [fullKey]: { ...feature, value } });
    },
    [store, tabId, routeKey, key],
  );
}
