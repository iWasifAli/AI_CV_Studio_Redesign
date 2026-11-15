'use client';

import { useEffect } from 'react';

/** Registers the service worker (installable app and offline shell) in production builds. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const register = () =>
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Without it the site works exactly as before.
      });
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}
