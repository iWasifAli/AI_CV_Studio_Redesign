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
