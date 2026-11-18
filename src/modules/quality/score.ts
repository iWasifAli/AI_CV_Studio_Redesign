import type { ExperienceItem, ResumeDocument } from '@/modules/resume/schema';
import { standardGaps, standardOf } from '@/modules/resume/standards';
import { healthCheck, type Finding } from './health';

/**
 * The CV score: one number out of 100 made of four parts that anyone can follow. It is worked out
 * from the CV's own checks (no AI, no random element), so the same CV always scores the same and
 * every lost point has a reason. It judges the CV, never the person.
 *
 *   Completeness (30)  the basics every CV needs: contact, profile, jobs or study, skills
 *   Content (35)       wording and structure problems found by the health check
 *   Results (15)       how many job lines show a number (a figure, %, amount, time)
 *   Standard fit (20)  how well it follows the chosen CV standard (photo, personal details, length)
 */
export type ScorePart = {
  id: 'completeness' | 'content' | 'results' | 'fit';
  label: string;
  points: number;
  max: number;
  why: string[];
};
export type CvScore = {
  total: number;
  parts: ScorePart[];
  grade: 'Strong' | 'Good' | 'Needs work' | 'Weak';
  top: Finding[];
};

const FIT_IDS = new Set(['personal-details', 'photo-country', 'length']);
const HAS_NUMBER = /\d/;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n * 10) / 10;

export function scoreCv(doc: ResumeDocument, opts: { pages?: number; now?: Date } = {}): CvScore {
  const { findings } = healthCheck(doc, opts);
  const b = doc.basics;
  const live = doc.sections.filter((s) => !s.hidden && s.items.length > 0);
  const has = (...kinds: string[]) => live.some((s) => kinds.includes(s.kind));

  // Completeness (30)
  const why1: string[] = [];
  let c = 0;
  const add = (ok: boolean, pts: number, missing: string) => {
    if (ok) c += pts;
    else why1.push(missing);
  };
  add(!!b.name.trim(), 4, 'Add your name');
  add(!!b.email.trim(), 5, 'Add an email address');
  add(!!b.phone.trim(), 3, 'Add a phone number');
  add(!!b.location.trim(), 2, 'Add your town or city');
  add(b.summary.trim().length >= 60, 6, 'Write a short profile (two or three sentences)');
  add(has('experience', 'education', 'projects'), 6, 'Add your work history or education');
  add(has('skills'), 4, 'Add a skills section');

  // Content (35): every finding that is not about the standard costs points.
  const content = findings.filter((f) => !FIT_IDS.has(f.id));
  const lost2 = content.reduce((n, f) => n + (f.severity === 'fix' ? 7 : 3.5), 0);
  const p2 = clamp(35 - lost2, 0, 35);

  // Results (15): the share of job bullets that carry a number. No jobs: full marks (students).
  const bullets = live
    .filter((s) => s.kind === 'experience')
    .flatMap((s) => (s.items as ExperienceItem[]).flatMap((it) => it.bullets));
  const withNumber = bullets.filter((x) => HAS_NUMBER.test(x)).length;
  // A third of lines with a figure is already strong; reaching it earns the full 15.
  const ratio = bullets.length ? clamp(withNumber / bullets.length / (1 / 3), 0, 1) : 1;
  const p3 = 15 * ratio;
  const why3 =
    bullets.length && ratio < 1
      ? [`Only ${withNumber} of ${bullets.length} job lines show a number`]
      : [];

  // Standard fit (20)
  const std = standardOf(doc);
  const fitFindings = findings.filter((f) => FIT_IDS.has(f.id));
  const gaps = standardGaps(doc);
  const lost4 = fitFindings.length * 6 + gaps.length * 3;
  const p4 = clamp(20 - lost4, 0, 20);
  const why4 = [...fitFindings.map((f) => f.title), ...gaps];

  const parts: ScorePart[] = [
    { id: 'completeness', label: 'Completeness', points: round(c), max: 30, why: why1 },
    {
      id: 'content',
      label: 'Wording and structure',
      points: round(p2),
      max: 35,
      why: content.map((f) => f.title),
    },
    { id: 'results', label: 'Results with numbers', points: round(p3), max: 15, why: why3 },
    {
      id: 'fit',
      label: std ? `Fit to ${std.name.split(' (')[0]}` : 'Fit for employers',
      points: round(p4),
      max: 20,
      why: why4,
    },
  ];
  const total = Math.round(parts.reduce((n, p) => n + p.points, 0));
  const grade = total >= 85 ? 'Strong' : total >= 70 ? 'Good' : total >= 50 ? 'Needs work' : 'Weak';
  const top = [...findings]
    .sort((a, z) => (a.severity === z.severity ? 0 : a.severity === 'fix' ? -1 : 1))
    .slice(0, 3);
  return { total, parts, grade, top };
}
