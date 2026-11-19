'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { settledWork } from './active';
import { useTabScope } from './use-draft';

/**
 * Where to go when slow work (an AI draft, a tailored CV) finishes. If the person is still on the
 * screen that started it, go there as before. If they have moved to another tab meanwhile, do not
 * pull the page they are on away: the starting tab is pointed at the result and shows "ready".
 */
export function useGoWhenDone(): (href: string) => void {
  const router = useRouter();
  // The tab this screen belongs to (known at once, or as soon as the strip has started).
  const { tab } = useTabScope();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return (href) => {
    if (alive.current || tab === null) router.push(href);
    else settledWork.emit(tab, href);
  };
}
