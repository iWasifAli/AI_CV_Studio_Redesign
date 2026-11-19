/**
 * Workspace tabs: several places open at once in the signed-in app, each remembering where it was.
 *
 * A tab is a slot with its own route; only the active one is on screen. Saved CVs, jobs and
 * letters stay the one source of truth, so two tabs can never edit the same record at once (only
 * the active tab is mounted). This module is the pure model; the strip in tab-strip.tsx draws it.
 */
export type Tab = {
  id: string;
  href: string;
  /** Automatic destination title, translated by the view. */
  title: string;
  /** A personal workspace name, displayed exactly as entered. */
  customTitle?: string;
  ready?: boolean;
};
export type TabsState = { tabs: Tab[]; active: string };

export const MAX_TABS = 8;
export const MAX_TAB_NAME_LENGTH = 64;
const HOME = '/studio';

const TITLES: Record<string, string> = {
  studio: 'Home',
  documents: 'Documents',
  start: 'New CV',
  cv: 'CV',
  profile: 'Career profile',
  makeover: 'CV makeover',
  jobs: 'Jobs',
  letters: 'Letters',
  templates: 'Designs',
  presence: 'Presence',
  portfolio: 'Portfolio',
  linkedin: 'LinkedIn',
  coach: 'Coach',
  skills: 'Skills',
  stories: 'Stories',
  account: 'Account',
  premium: 'Premium',
  help: 'Help',
};

/** App paths only (same origin, no scheme); anything else is not a tab destination. */
export function isTabHref(href: string): boolean {
  return (
    typeof href === 'string' &&
    href.startsWith('/') &&
    !href.startsWith('//') &&
    !href.includes('\\') &&
    href.length <= 2048 &&
    !/^\/(api|admin|auth|signin)(\/|$|\?)/.test(href)
  );
}

export function titleFor(href: string): string {
  const first = href.split(/[?#]/)[0]!.split('/').filter(Boolean)[0] ?? '';
  const base = TITLES[first] ?? 'Page';
  if (first === 'letters' && /\/new(\?|$)/.test(href)) return 'New letter';
  if (first === 'jobs' && /[?&]new=1/.test(href)) return 'New job';
  return base;
}

const newId = () => crypto.randomUUID();
const make = (href: string): Tab => ({ id: newId(), href, title: titleFor(href) });

export function initial(href: string = HOME): TabsState {
  const tab = make(isTabHref(href) ? href : HOME);
  return { tabs: [tab], active: tab.id };
}

/** The active tab moved to a new page (ordinary navigation inside the tab). */
export function visit(state: TabsState, href: string): TabsState {
  if (!isTabHref(href)) return state;
  const current = state.tabs.find((t) => t.id === state.active);
  if (!current || current.href === href) return state;
  return {
    ...state,
    tabs: state.tabs.map((t) =>
      t.id === state.active ? { ...t, href, title: titleFor(href) } : t,
    ),
  };
}

/** A new tab, made active. Refused (state unchanged) at the limit. */
export function open(state: TabsState, href: string = HOME): TabsState {
  if (state.tabs.length >= MAX_TABS || !isTabHref(href)) return state;
  const tab = make(href);
  return { tabs: [...state.tabs, tab], active: tab.id };
}

export function activate(state: TabsState, id: string): TabsState {
  if (!state.tabs.some((t) => t.id === id)) return state;
  return {
    active: id,
    tabs: state.tabs.map((t) => (t.id === id && t.ready ? { ...t, ready: false } : t)),
  };
}

const customName = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const name = value.trim();
  return name && Array.from(name).length <= MAX_TAB_NAME_LENGTH ? name : undefined;
};

/** Metadata changes retain identity, route and readiness, including on inactive tabs. */
export function rename(state: TabsState, tabId: string, nameOrNull: string | null): TabsState {
  const tab = state.tabs.find((t) => t.id === tabId);
  const name = nameOrNull === null ? undefined : customName(nameOrNull);
  if (!tab || (nameOrNull !== null && !name) || tab.customTitle === name) return state;
  const next = { ...tab };
  if (name) next.customTitle = name;
  else delete next.customTitle;
  return { ...state, tabs: state.tabs.map((t) => (t.id === tabId ? next : t)) };
}

/** Move the existing object to its destination's position; never recreate a tab or activate it. */
export function reorder(state: TabsState, tabId: string, overId: string): TabsState {
  const from = state.tabs.findIndex((tab) => tab.id === tabId);
  const to = state.tabs.findIndex((tab) => tab.id === overId);
  if (from < 0 || to < 0 || from === to) return state;
  const tabs = [...state.tabs];
  tabs.splice(to, 0, tabs.splice(from, 1)[0]!);
  return { ...state, tabs };
}

/**
 * Work started in a tab finished after the person left it: that tab now points at the finished
 * record and shows "ready". If the tab is the one on screen (or gone) nothing changes.
 */
export function settle(state: TabsState, id: string, href: string): TabsState {
  if (!isTabHref(href) || state.active === id || !state.tabs.some((t) => t.id === id)) return state;
  return {
    ...state,
    tabs: state.tabs.map((t) =>
      t.id === id ? { ...t, href, title: titleFor(href), ready: true } : t,
    ),
  };
}

/** Close a tab. The last tab is replaced by Home. Closing the active one moves to its neighbour. */
export function close(state: TabsState, id: string): TabsState {
  const i = state.tabs.findIndex((t) => t.id === id);
  if (i < 0) return state;
  const tabs = state.tabs.filter((t) => t.id !== id);
  if (!tabs.length) return initial();
  if (state.active !== id) return { tabs, active: state.active };
  return { tabs, active: tabs[Math.min(i, tabs.length - 1)]!.id };
}

/** Read saved tabs back safely: anything malformed is dropped, never trusted. */
export function parse(raw: string | null): TabsState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as TabsState;
    if (!v || !Array.isArray(v.tabs) || typeof v.active !== 'string') return null;
    const tabs: Tab[] = [];
    for (const t of v.tabs.slice(0, MAX_TABS)) {
      if (
        t &&
        typeof t.id === 'string' &&
        t.id.length <= 64 &&
        typeof t.href === 'string' &&
        isTabHref(t.href) &&
        !tabs.some((x) => x.id === t.id)
      ) {
        const name = customName(t.customTitle);
        tabs.push({
          id: t.id,
          href: t.href,
          title: titleFor(t.href),
          ready: t.ready === true,
          ...(name ? { customTitle: name } : {}),
        });
      }
    }
    if (!tabs.length) return null;
    return { tabs, active: tabs.some((t) => t.id === v.active) ? v.active : tabs[0]!.id };
  } catch {
    return null;
  }
}
