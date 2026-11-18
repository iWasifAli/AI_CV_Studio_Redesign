'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import { useWorkspace } from './context';

/** Read the originating UI at completion, including after that workspace has remounted. */
export function useCurrentWorkspaceValue<T>(key: string, value: T): () => T {
  const { store, tabId, routeKey } = useWorkspace();
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  }, [value]);
  const fullKey = `${routeKey}:${key}`;
  return useCallback(() => {
    if (store && tabId && store.hasFeature(tabId, fullKey))
      return store.readFeature(tabId, fullKey) as T;
    return latest.current;
  }, [store, tabId, fullKey]);
}
