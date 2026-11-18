'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { forwardRef, useMemo, type ComponentProps } from 'react';
import { useWorkspace } from './context';
import { routeInfo, routeScope, workspaceHref } from './routes';

export function useWorkspaceRouter(): ReturnType<typeof useRouter> {
  const router = useRouter();
  const { store, tabId, routeKey } = useWorkspace();
  return useMemo(() => {
    if (!store || !tabId) return router;
    const go = (
      method: 'push' | 'replace',
      href: string,
      options?: Parameters<typeof router.push>[1],
    ) => {
      if (!store.isLive() || store.getSnapshot().frozen) return;
      // A task may outlive its screen while the user is on account/help/billing.
      if (
        routeInfo(routeKey) &&
        typeof window !== 'undefined' &&
        !routeInfo(window.location.pathname)
      )
        return;
      const origin = store.getTab(tabId);
      if (!origin || (routeInfo(routeKey) && routeScope(origin.href) !== routeKey)) return;
      if (!routeInfo(href)) {
        if (store.getSnapshot().session.activeTabId === tabId) router[method](href, options);
        return;
      }
      const tab = store.navigate(tabId, href);
      if (tab)
        void store
          .flush()
          .catch(() => {})
          .then(() => {
            if (
              store.isLive() &&
              store.getSnapshot().session.activeTabId === tab.id &&
              store.getTab(tab.id)?.href === tab.href
            )
              router[method](workspaceHref(tab.href, tab.id), { scroll: false, ...options });
          });
    };
    return {
      ...router,
      push: (href, options) => go('push', href, options),
      replace: (href, options) => go('replace', href, options),
      back: () => {
        if (store.isLive() && store.getSnapshot().session.activeTabId === tabId) router.back();
      },
      forward: () => {
        if (store.isLive() && store.getSnapshot().session.activeTabId === tabId) router.forward();
      },
      refresh: () => {
        if (store.isLive() && store.getSnapshot().session.activeTabId === tabId) router.refresh();
      },
    };
  }, [router, store, tabId, routeKey]);
}

export const WorkspaceLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof Link>>(
  function WorkspaceLink({ href, onClick, ...props }, ref) {
    const router = useWorkspaceRouter();
    const { store } = useWorkspace();
    return (
      <Link
        ref={ref}
        href={href}
        {...props}
        onClick={(event) => {
          onClick?.(event);
          if (
            !store ||
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            props.target ||
            props.download ||
            typeof href !== 'string' ||
            !routeInfo(href)
          )
            return;
          event.preventDefault();
          if (props.replace) router.replace(href, { scroll: props.scroll });
          else router.push(href, { scroll: props.scroll });
        }}
      />
    );
  },
);
export default WorkspaceLink;
