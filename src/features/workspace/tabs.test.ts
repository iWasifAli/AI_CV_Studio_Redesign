import { describe, expect, it } from 'vitest';
import {
  MAX_TABS,
  activate,
  close,
  initial,
  isTabHref,
  open,
  settle,
  parse,
  titleFor,
  visit,
  rename,
  reorder,
  type TabsState,
} from './tabs';

describe('workspace tabs model', () => {
  it('starts with one Home tab', () => {
    const s = initial();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0]!.title).toBe('Home');
    expect(s.active).toBe(s.tabs[0]!.id);
  });
  it('visiting moves only the active tab', () => {
    let s = open(initial(), '/jobs');
    const jobsTab = s.active;
    s = visit(s, '/cv/abc');
    expect(s.tabs.find((t) => t.id === jobsTab)!.href).toBe('/cv/abc');
    expect(s.tabs[0]!.href).toBe('/studio');
  });
  it('titles come from the destination, with letter and job forms named', () => {
    expect(titleFor('/letters/new?type=cover')).toBe('New letter');
    expect(titleFor('/jobs?new=1')).toBe('New job');
    expect(titleFor('/nowhere')).toBe('Page');
  });
  it('refuses a new tab at the limit and keeps the active one', () => {
    let s = initial();
    for (let i = 0; i < MAX_TABS + 3; i++) s = open(s, '/jobs');
    expect(s.tabs).toHaveLength(MAX_TABS);
  });
  it('closing the active tab moves to its neighbour; the last tab becomes Home', () => {
    let s = initial();
    s = open(s, '/jobs');
    s = open(s, '/letters');
    const [a, b, c] = s.tabs.map((t) => t.id) as [string, string, string];
    expect(s.active).toBe(c);
    s = close(s, c);
    expect(s.active).toBe(b);
    s = close(s, a);
    expect(s.active).toBe(b);
    s = close(s, b);
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0]!.href).toBe('/studio');
  });
  it('activating an unknown tab changes nothing', () => {
    const s = initial();
    expect(activate(s, 'nope')).toBe(s);
  });
  it('only same-origin app paths are tab destinations', () => {
    for (const bad of [
      'https://evil.test',
      '//evil.test',
      '/api/me',
      '/admin',
      '\\x',
      'javascript:1',
    ])
      expect(isTabHref(bad)).toBe(false);
    expect(isTabHref('/cv/1?x=1#y')).toBe(true);
    expect(visit(initial(), 'https://evil.test').tabs[0]!.href).toBe('/studio');
  });
  it('parse drops anything malformed and repairs the active tab', () => {
    expect(parse('nope')).toBeNull();
    expect(parse(JSON.stringify({ tabs: [], active: 'x' }))).toBeNull();
    const s = parse(
      JSON.stringify({
        tabs: [
          { id: 'a', href: '/jobs', title: 'x' },
          { id: 'a', href: '/cv/1', title: 'dup' },
          { id: 'b', href: 'https://evil.test', title: 'bad' },
        ],
        active: 'gone',
      }),
    )!;
    expect(s.tabs.map((t) => t.id)).toEqual(['a']);
    expect(s.active).toBe('a');
    expect(s.tabs[0]!.title).toBe('Jobs');
  });
});

describe('settle and ready', () => {
  it('marks a tab the person left as ready, pointing at the result', () => {
    const a = initial('/letters/new?type=cover');
    const s1 = open(a, '/documents');
    const left = a.tabs[0]!.id;
    const s2 = settle(s1, left, '/letters/abc');
    const t = s2.tabs.find((x) => x.id === left)!;
    expect(t).toMatchObject({ href: '/letters/abc', title: 'Letters', ready: true });
    expect(activate(s2, left).tabs.find((x) => x.id === left)!.ready).toBe(false);
  });
  it('does nothing for the tab on screen, a missing tab or a bad link', () => {
    const a = initial('/jobs');
    expect(settle(a, a.active, '/letters/x')).toBe(a);
    expect(settle(a, 'nope', '/letters/x')).toBe(a);
    const b = open(a, '/documents');
    expect(settle(b, a.tabs[0]!.id, 'https://evil.example')).toBe(b);
  });
});

const workspaces = (): TabsState => ({
  active: 'b',
  tabs: [
    { id: 'a', href: '/letters/new?type=cover', title: 'New letter', ready: true },
    { id: 'b', href: '/jobs', title: 'Jobs' },
    { id: 'c', href: '/documents', title: 'Documents' },
  ],
});

describe('personal workspace names', () => {
  it('names an inactive tab without activating it or changing its destination or ready state', () => {
    const before = workspaces();
    const after = rename(before, 'a', '  Bewerbung München 📄  ');
    expect(after.active).toBe('b');
    expect(after.tabs[0]).toEqual({
      id: 'a',
      href: '/letters/new?type=cover',
      title: 'New letter',
      ready: true,
      customTitle: 'Bewerbung München 📄',
    });
    expect(after.tabs[1]).toBe(before.tabs[1]);
    expect(before.tabs[0]).not.toHaveProperty('customTitle');
  });

  it('keeps a name through navigation and reset reveals the latest automatic title', () => {
    const named = rename(workspaces(), 'b', 'Monday applications');
    const arrived = visit(named, '/letters/new?type=cover');
    expect(arrived.tabs[1]).toMatchObject({
      title: 'New letter',
      customTitle: 'Monday applications',
    });
    const reset = rename(arrived, 'b', null);
    expect(reset.tabs[1]).toMatchObject({ title: 'New letter', href: '/letters/new?type=cover' });
    expect(reset.tabs[1]).not.toHaveProperty('customTitle');
  });

  it('keeps the name and readiness of a background result', () => {
    const next = settle(rename(workspaces(), 'a', 'Acme'), 'a', '/letters/result');
    expect(next.tabs[0]).toEqual({
      id: 'a',
      href: '/letters/result',
      title: 'Letters',
      ready: true,
      customTitle: 'Acme',
    });
  });

  it('supports 64 Unicode characters without counting surrogate pairs twice', () => {
    expect(rename(workspaces(), 'a', '📄'.repeat(64)).tabs[0]!.customTitle).toBe('📄'.repeat(64));
  });

  it('allows identical labels for independent workspaces', () => {
    const after = rename(rename(workspaces(), 'a', 'Applications'), 'b', 'Applications');
    expect(after.tabs.slice(0, 2).map((tab) => tab.customTitle)).toEqual([
      'Applications',
      'Applications',
    ]);
    expect(after.tabs.map((tab) => tab.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not change state for missing tabs, invalid names, or unchanged names', () => {
    const state = rename(workspaces(), 'a', 'Acme');
    expect(rename(state, 'missing', 'Other')).toBe(state);
    expect(rename(state, 'a', '')).toBe(state);
    expect(rename(state, 'a', '   ')).toBe(state);
    expect(rename(state, 'a', 'x'.repeat(65))).toBe(state);
    expect(rename(state, 'a', '  Acme  ')).toBe(state);
    expect(rename(state, 'b', null)).toBe(state);
  });

  it('restores custom names and order while retaining automatic route titles', () => {
    const state = {
      active: 'a',
      tabs: [
        { id: 'c', href: '/documents', title: 'untrusted automatic title' },
        { id: 'a', href: '/jobs', customTitle: '  My applications  ', ready: true },
      ],
    };
    expect(parse(JSON.stringify(state))).toEqual({
      active: 'a',
      tabs: [
        { id: 'c', href: '/documents', title: 'Documents', ready: false },
        { id: 'a', href: '/jobs', title: 'Jobs', customTitle: 'My applications', ready: true },
      ],
    });
  });

  it.each([null, 42, {}, '', '   ', 'x'.repeat(65)])(
    'ignores invalid custom metadata %j without discarding its workspace',
    (customTitle) => {
      const state = workspaces();
      const restored = parse(
        JSON.stringify({ ...state, tabs: [{ ...state.tabs[0], customTitle }] }),
      );
      expect(restored!.tabs).toHaveLength(1);
      expect(restored!.tabs[0]).toMatchObject({ id: 'a', title: 'New letter', ready: true });
      expect(restored!.tabs[0]).not.toHaveProperty('customTitle');
    },
  );
});

describe('workspace ordering', () => {
  it('moves a tab to either end while preserving active identity and tab objects', () => {
    const before = workspaces();
    const first = reorder(before, 'c', 'a');
    expect(first.tabs.map((tab) => tab.id)).toEqual(['c', 'a', 'b']);
    expect(first.active).toBe('b');
    expect(first.tabs[0]).toBe(before.tabs[2]);
    const last = reorder(first, 'c', 'b');
    expect(last.tabs.map((tab) => tab.id)).toEqual(['a', 'b', 'c']);
    expect(last.tabs[0]).toBe(before.tabs[0]);
    expect(before.tabs.map((tab) => tab.id)).toEqual(['a', 'b', 'c']);
  });

  it('preserves newer results and names when a pending drag commits', () => {
    const latest = settle(rename(workspaces(), 'a', 'Acme'), 'a', '/letters/result');
    const moved = reorder(latest, 'a', 'c');
    expect(moved.tabs.map((tab) => tab.id)).toEqual(['b', 'c', 'a']);
    expect(moved.tabs[2]).toEqual({
      id: 'a',
      href: '/letters/result',
      title: 'Letters',
      ready: true,
      customTitle: 'Acme',
    });
    expect(moved.active).toBe('b');
  });

  it('closing the active tab chooses its neighbour in the reordered list', () => {
    const reordered = reorder(workspaces(), 'c', 'b');
    const next = close(reordered, 'b');
    expect(next.active).toBe('c');
    expect(next.tabs.map((tab) => tab.id)).toEqual(['a', 'c']);
  });

  it('ignores unknown or identical source and destination IDs', () => {
    const state = workspaces();
    expect(reorder(state, 'a', 'a')).toBe(state);
    expect(reorder(state, 'missing', 'b')).toBe(state);
    expect(reorder(state, 'a', 'missing')).toBe(state);
  });
});
