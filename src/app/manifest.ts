import type { MetadataRoute } from 'next';

/** Installable web app (spec §11.5): opens on the studio home, full screen like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/studio',
    name: 'AI CV Studio',
    short_name: 'CV Studio',
    description: 'Make, design and send your CV — and keep your job search in one place.',
    start_url: '/studio?source=app',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#faf8f4',
    theme_color: '#faf8f4',
    categories: ['productivity', 'business'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Documents',
        url: '/documents',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      { name: 'Jobs', url: '/jobs', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
