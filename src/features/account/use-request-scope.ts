'use client';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { activeTab } from '@/features/workspace/active';
import { accountGeneration, onSessionLeaving } from './session-lifecycle';

/** A response belongs to one mounted screen, account session and request generation. */
export function useRequestScope(identity: string) {
  const current = useRef(identity);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  const cancel = useCallback(() => {
    request.current?.abort();
    request.current = null;
  }, []);
  useEffect(() => {
    mounted.current = true;
    const off = onSessionLeaving(cancel);
    return () => {
      mounted.current = false;
      cancel();
      off();
    };
  }, [cancel]);
  useLayoutEffect(() => {
    current.current = identity;
    return cancel;
  }, [identity, cancel]);
  const begin = useCallback(() => {
    cancel();
    const controller = new AbortController();
    request.current = controller;
    const owner = current.current;
    const generation = accountGeneration();
    const epoch = activeTab.get().epoch;
    return {
      signal: controller.signal,
      valid: () =>
        mounted.current &&
        !controller.signal.aborted &&
        current.current === owner &&
        generation === accountGeneration() &&
        epoch === activeTab.get().epoch,
    };
  }, [cancel]);
  return { begin, cancel };
}
