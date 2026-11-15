import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

/** The browser extension (extension/): what it opens, and that it asks for little. */
const created: string[] = [];
const listeners: Record<string, (...a: unknown[]) => void> = {};
const on = (name: string) => ({
  addListener: (f: (...a: unknown[]) => void) => (listeners[name] = f),
});
vi.stubGlobal('chrome', {
  tabs: { create: ({ url }: { url: string }) => created.push(url) },
  action: { onClicked: on('action') },
  runtime: { onInstalled: on('installed') },
  contextMenus: { create: vi.fn(), onClicked: on('menu') },
});
createRequire(import.meta.url)('../../extension/background.js');
const ext = (globalThis as unknown as { __cvStudioExtension: { saveable: (u: string) => boolean } })
  .__cvStudioExtension;

describe('browser extension', () => {
  it('opens the job tracker with the advert address', () => {
    listeners.action!({ url: 'https://www.rozee.pk/job/123?ref=a&b=c' });
    expect(created.pop()).toBe(
      'https://aicvstudio.app/jobs?new=1&url=https%3A%2F%2Fwww.rozee.pk%2Fjob%2F123%3Fref%3Da%26b%3Dc&source=extension',
    );
    listeners.menu!({ menuItemId: 'save-link', linkUrl: 'https://jobs.example.com/9' }, {});
    expect(created.pop()).toContain('url=https%3A%2F%2Fjobs.example.com%2F9');
  });

  it('never passes browser pages, files or the studio itself', () => {
    expect(ext.saveable('chrome://settings')).toBe(false);
    expect(ext.saveable('file:///C:/cv.pdf')).toBe(false);
    expect(ext.saveable('https://aicvstudio.app/jobs')).toBe(false);
    listeners.action!({ url: 'chrome://newtab' });
    expect(created.pop()).toBe('https://aicvstudio.app/jobs?new=1&source=extension');
  });

  it('asks only for activeTab and context menus', () => {
    const m = JSON.parse(readFileSync('extension/manifest.json', 'utf8')) as {
      manifest_version: number;
      permissions: string[];
      host_permissions?: string[];
      content_scripts?: unknown;
    };
    expect(m.manifest_version).toBe(3);
    expect(m.permissions.sort()).toEqual(['activeTab', 'contextMenus']);
    expect(m.host_permissions).toBeUndefined();
    expect(m.content_scripts).toBeUndefined();
  });
});
