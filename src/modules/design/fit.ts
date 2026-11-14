/**
 * "Fit to pages" (spec §9.2): after spacing changes, content cuts are only ever suggested. Each
 * suggestion says what it would do; the person applies it (undo puts it back).
 */
import type { ResumeDocument, Section } from '@/modules/resume/schema';

export const PAGE_TARGETS = [1, 2, 0] as const; // 0 = no limit
export type PageTarget = (typeof PAGE_TARGETS)[number];

export type Cut = {
  key: string;
  label: string;
  /** Returns the changed document; absent for advice the person carries out themselves. */
  apply?: (doc: ResumeDocument) => ResumeDocument;
};

/** Sections that are often left out when space is short, least important first. */
const OPTIONAL: Section['kind'][] = [
  'references',
  'interests',
  'testimonials',
  'personalDetails',
  'declaration',
  'conferences',
  'memberships',
  'courses',
  'strengths',
];

const MAX_POINTS = 3;
const MAX_RECENT_POINTS = 6;
const OLDER_JOB_INDEX = 2; // jobs after the two most recent

const year = (d: unknown) => {
  const m = /^(\d{4})/.exec(typeof d === 'string' ? d : '');
  return m ? Number(m[1]) : null;
};

function withSection(doc: ResumeDocument, id: string, fn: (s: Section) => Section): ResumeDocument {
  return { ...doc, sections: doc.sections.map((s) => (s.id === id ? fn(s) : s)) };
}

/** Content cuts that would free space, most useful (and least painful) first; at most 6. */
export function cutSuggestions(doc: ResumeDocument): Cut[] {
  const cuts: Cut[] = [];
  const visible = doc.sections.filter((s) => !s.hidden);

  // References: "available on request" is understood; the section can go.
  for (const kind of OPTIONAL) {
    const s = visible.find((x) => x.kind === kind && x.items.length);
    if (!s) continue;
    cuts.push({
      key: `hide-${s.id}`,
      label: `Leave out “${s.title}”`,
      apply: (d) => withSection(d, s.id, (x) => ({ ...x, hidden: true })),
    });
  }

  // Jobs with many points: keep the first few.
  for (const s of visible) {
    if (!['experience', 'volunteering', 'internships', 'military'].includes(s.kind)) continue;
    const items = s.items as {
      id: string;
      role: string;
      organization: string;
      bullets: string[];
    }[];
    items.forEach((it, i) => {
      const n = it.bullets.filter((b) => b.trim()).length;
      // Recent jobs keep up to six points; older ones three.
      const keep = i < OLDER_JOB_INDEX ? MAX_RECENT_POINTS : MAX_POINTS;
      if (n <= keep) return;
      cuts.push({
        key: `trim-${it.id}`,
        label: `Keep the first ${keep} of ${n} points for ${it.role || 'an older job'}${it.organization ? ` at ${it.organization}` : ''}`,
        apply: (d) =>
          withSection(
            d,
            s.id,
            (x) =>
              ({
                ...x,
                items: (x.items as typeof items).map((y) =>
                  y.id === it.id
                    ? { ...y, bullets: y.bullets.filter((b) => b.trim()).slice(0, keep) }
                    : y,
                ),
              }) as Section,
          ),
      });
    });
  }

  // Jobs that ended more than 15 years ago.
  const now = new Date().getFullYear();
  for (const s of visible) {
    if (s.kind !== 'experience') continue;
    const items = s.items as { id: string; role: string; end: unknown; current: boolean }[];
    if (items.length < 4) continue;
    const old = items.filter((it) => !it.current && (year(it.end) ?? now) < now - 15);
    if (!old.length || old.length === items.length) continue;
    cuts.push({
      key: `old-${s.id}`,
      label: `Leave out ${old.length === 1 ? 'the job' : `${old.length} jobs`} that ended more than 15 years ago`,
      apply: (d) =>
        withSection(
          d,
          s.id,
          (x) =>
            ({
              ...x,
              items: (x.items as typeof items).filter((y) => !old.some((o) => o.id === y.id)),
            }) as Section,
        ),
    });
  }

  // A long profile: point to it (rewriting is the person's, or the AI's on request).
  if (doc.basics.summary.length > 650)
    cuts.push({
      key: 'summary',
      label: 'Shorten the profile to 3–4 lines (it is the longest paragraph)',
    });

  return cuts.slice(0, 6);
}

/** True when `pages` meets the target (0 = no limit). */
export const meetsTarget = (pages: number, target: PageTarget) => target === 0 || pages <= target;
