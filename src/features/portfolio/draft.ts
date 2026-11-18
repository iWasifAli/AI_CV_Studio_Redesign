import type {
  PortfolioProject,
  PortfolioSection,
  PortfolioTheme,
} from '@/modules/portfolio/themes';

/** The settings form, also handed to the preview tab through sessionStorage. */
export type PortfolioDraft = {
  slug: string;
  docId: string;
  published: boolean;
  showEmail: boolean;
  showPhone: boolean;
  theme: PortfolioTheme;
  sections: PortfolioSection[];
  projects: PortfolioProject[];
  contact: boolean;
};

const KEY = 'cvstudio:portfolio-preview:';
const DAY = 86_400_000;

/** Each preview gets an immutable, opaque handoff; unrelated tabs cannot replace it. */
export function saveDraft(draft: PortfolioDraft, ownerUid: string | null = null): string {
  const key = crypto.randomUUID();
  const value = JSON.stringify({ version: 1, ownerUid, draft, at: Date.now() });
  try {
    localStorage.setItem(KEY + key, value);
  } catch {}
  try {
    sessionStorage.setItem(KEY + key, value);
  } catch {}
  return key;
}

export function readDraft(
  key: string | null,
  ownerUid: string | null = null,
): PortfolioDraft | null {
  if (!key || !/^[a-zA-Z0-9-]{20,80}$/.test(key)) return null;
  try {
    const raw = sessionStorage.getItem(KEY + key) ?? localStorage.getItem(KEY + key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (
      value.version !== 1 ||
      value.ownerUid !== ownerUid ||
      !Number.isFinite(value.at) ||
      Date.now() - value.at > DAY
    )
      return null;
    return value.draft?.docId && Array.isArray(value.draft.projects) ? value.draft : null;
  } catch {
    return null;
  }
}
