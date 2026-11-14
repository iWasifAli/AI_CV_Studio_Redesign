/**
 * Explain a gap (spec §9.3, coach.gap): finds breaks of more than six months between dated
 * roles, asks what happened, and offers neutral wording of the person's own answer. Wording is
 * always the person's choice; nothing is added to the CV without them.
 */
import type { ResumeDocument } from '@/modules/resume/schema';

export const GAP_MONTHS = 6;

export const GAP_REASONS = [
  ['caring', 'Caring for family'],
  ['health', 'Health'],
  ['study', 'Study or training'],
  ['travel', 'Travel'],
  ['relocation', 'Moving country or city'],
  ['search', 'Looking for work'],
  ['parental', 'Parental leave'],
  ['volunteering', 'Volunteering'],
  ['business', 'Own project or business'],
  ['other', 'Something else'],
] as const;
export type GapReason = (typeof GAP_REASONS)[number][0];

export type Gap = {
  /** "2019-04..2020-02" — stable while the dates don't change. */
  key: string;
  /** First month of the gap and last month of it (yyyy-mm). */
  from: string;
  to: string;
  months: number;
  /** "after Delivery Driver at Swift" / "before Teacher at Oak School". */
  after: string;
  before: string;
};

type Dated = { label: string; s: number; e: number };

/** "2021-03" / "2021" → month number (year*12 + month-1); null when missing. */
function month(v: unknown, end = false): number | null {
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(typeof v === 'string' ? v : '');
  if (!m) return null;
  const mm = m[2] ? Number(m[2]) - 1 : end ? 11 : 0;
  return Number(m[1]) * 12 + mm;
}
const ym = (n: number) => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;

const ROLES = ['experience', 'internships', 'volunteering', 'military'] as const;

/** Breaks of more than six months between the dated roles and studies of a CV. */
export function findGaps(doc: ResumeDocument, now = new Date()): Gap[] {
  const today = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const spans: Dated[] = [];
  for (const s of doc.sections) {
    if (s.hidden) continue;
    if ((ROLES as readonly string[]).includes(s.kind)) {
      for (const it of s.items as {
        role: string;
        organization: string;
        start: string;
        end: string;
        current: boolean;
      }[]) {
        const st = month(it.start);
        if (st === null) continue;
        const e = it.current ? today : (month(it.end, true) ?? st);
        const label = [it.role, it.organization].filter(Boolean).join(' at ') || 'a role';
        spans.push({ label, s: st, e: Math.max(st, e) });
      }
    }
    if (s.kind === 'education') {
      for (const it of s.items as {
        qualification: string;
        institution: string;
        start: string;
        end: string;
      }[]) {
        const e = month(it.end, true);
        const st = month(it.start) ?? e;
        if (st === null || e === null) continue;
        const label = [it.qualification, it.institution].filter(Boolean).join(' at ') || 'study';
        spans.push({ label, s: st, e: Math.max(st, e) });
      }
    }
  }
  if (!spans.length) return [];
  spans.sort((a, b) => a.s - b.s);
  const gaps: Gap[] = [];
  // Walk in time order, keeping the latest end so far (overlapping roles cover each other).
  let reach = spans[0]!;
  for (const sp of spans.slice(1)) {
    const missing = sp.s - reach.e - 1;
    if (missing > GAP_MONTHS) {
      const from = ym(reach.e + 1);
      const to = ym(sp.s - 1);
      gaps.push({
        key: `${from}..${to}`,
        from,
        to,
        months: missing,
        after: reach.label,
        before: sp.label,
      });
    }
    if (sp.e > reach.e) reach = sp;
  }
  // A break that runs until now.
  const sinceLast = today - reach.e - 1;
  if (sinceLast > GAP_MONTHS) {
    const from = ym(reach.e + 1);
    gaps.push({
      key: `${from}..now`,
      from,
      to: '',
      months: sinceLast,
      after: reach.label,
      before: '',
    });
  }
  return gaps.reverse(); // most recent first
}

/** "about 8 months", "about 2 years". */
export function gapLength(months: number): string {
  if (months < 18) return `about ${months} months`;
  const y = Math.round(months / 12);
  return `about ${y} years`;
}

/**
 * Wording without AI: a neutral line from the reason the person picked and their own words.
 * Used as the free option and as a fallback when AI isn't available.
 */
export function plainWording(reason: GapReason, answer: string): string {
  const a = answer.replace(/\s+/g, ' ').trim().replace(/[.]+$/, '');
  const base: Record<GapReason, string> = {
    caring: 'Career break to care for a family member',
    health: 'Career break for health reasons, now fully ready to return to work',
    study: 'Career break for study and training',
    travel: 'Career break for travel',
    relocation: 'Career break while moving and settling in a new place',
    search: 'Looking for the right next role',
    parental: 'Parental leave',
    volunteering: 'Career break for volunteering',
    business: 'Career break to work on my own project',
    other: 'Career break',
  };
  // The person's own words come after the plain reason, if they wrote any.
  return a && reason !== 'health' ? `${base[reason]}: ${a}` : base[reason];
}

/** The gap as a "Career break" entry for the experience section, with the person's line. */
export function careerBreak(gap: Gap, line: string, id: string) {
  return {
    id,
    role: 'Career break',
    organization: '',
    location: '',
    start: gap.from,
    end: gap.to,
    current: gap.to === '',
    bullets: [line.replace(/\s+/g, ' ').trim().slice(0, 300)],
  };
}

/**
 * The CV with a "Career break" entry for this gap, placed among the jobs by date (newest first).
 * Returns null when the CV has no experience section to put it in.
 */
export function addCareerBreak(
  doc: ResumeDocument,
  gap: Gap,
  line: string,
  id: string,
): ResumeDocument | null {
  const sec = doc.sections.find((s) => s.kind === 'experience' && !s.hidden);
  if (!sec) return null;
  const items = sec.items as { start: string }[];
  const entry = careerBreak(gap, line, id);
  let at = items.findIndex((it) => (month(it.start) ?? 0) < (month(gap.from) ?? 0));
  if (at < 0) at = items.length;
  const next = [...items];
  next.splice(at, 0, entry);
  return {
    ...doc,
    updatedAt: new Date().toISOString(),
    sections: doc.sections.map((s) => (s.id === sec.id ? ({ ...s, items: next } as typeof s) : s)),
  };
}
