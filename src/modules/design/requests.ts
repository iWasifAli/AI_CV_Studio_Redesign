import type { ResumeDocument } from '@/modules/resume/schema';
import { normalise } from './normalise';
import { COMPACT_KINDS, type DesignSpecV2 } from './spec';
import { applyFlat, toFlat, type FieldName } from './vocab';

/**
 * Accountability for the AI Designer (gap audit G-01): the requests a description makes that the
 * design vocabulary can express are read here, deterministically, and every candidate is checked
 * against them. A request the model missed is applied; one the design rules can't honour is named,
 * with the reason. So nothing the person asked for disappears without a word.
 */

type FieldAsk = { kind: 'field'; field: FieldName; value: string; label: string };
type PlaceAsk = { kind: 'place'; section: string; side: 'left' | 'right'; label: string };
export type Ask = FieldAsk | PlaceAsk;

const F = (field: FieldName, value: string, label: string, re: RegExp) => ({
  field,
  value,
  label,
  re,
});

/** Phrases → vocabulary values. Order matters only within one field (first match wins). */
const PHRASES = [
  F('bullets', 'square', 'square bullets', /\bsquare bullet/),
  F('bullets', 'disc', 'round bullets', /\b(round|circle|circular|dot) bullet/),
  F('bullets', 'dash', 'dash bullets', /\b(dash|dashed) bullet|\bdashes as bullets/),
  F('bullets', 'arrow', 'arrow bullets', /\barrow bullet/),
  F('bullets', 'check', 'tick bullets', /\b(check|tick)(mark)? bullet/),
  F('bullets', 'diamond', 'diamond bullets', /\bdiamond bullet/),
  F('bullets', 'none', 'no bullet markers', /\bno bullets?\b|\bwithout bullets?\b/),
  F(
    'headings',
    'numbered',
    'numbered headings',
    /\bnumbered (section )?headings?|\bheadings? (are |with )?numbered/,
  ),
  F(
    'headings',
    'underline',
    'underlined headings',
    /\bunderlined (section )?headings?|\bheadings? underlined/,
  ),
  F(
    'headings',
    'boxed',
    'boxed headings',
    /\bboxed (section )?headings?|\bheadings? in (outlined )?boxes/,
  ),
  F(
    'headings',
    'filled',
    'headings in coloured bars',
    /\b(filled|colou?red) (bar |box )?headings?|\bheadings? in colou?red (bars|boxes)/,
  ),
  F(
    'headings',
    'icon',
    'icons by the headings',
    /\bheadings? with icons?|\bicons? (next to|beside|by) (the )?(section )?headings?/,
  ),
  F(
    'headingCase',
    'upper',
    'headings in capitals',
    /\b(capital|uppercase|upper-case) headings?|\bheadings? in (capitals|caps|upper ?case)/,
  ),
  F(
    'nameCase',
    'upper',
    'name in capitals',
    /\bname in (all )?(capitals|caps|upper ?case)|\b(capital|uppercase) name/,
  ),
  F(
    'entries',
    'dates-left',
    'dates on the left',
    /\bdates? (on|to|at) the left|\bleft[- ]hand dates?/,
  ),
  F(
    'entries',
    'dates-right',
    'dates on the right',
    /\bdates? (on|to|at) the right|\bright[- ]hand dates?/,
  ),
  F('entries', 'timeline-dots', 'a timeline', /\btimeline\b/),
  F('skills', 'bars', 'skill bars', /\bskills? bars?\b|\bskills? as bars|\bbars for (my )?skills/),
  F('skills', 'dots', 'skill dots', /\bskills? (as )?dots\b|\bdots for (my )?skills/),
  F(
    'skills',
    'tags',
    'skills as tags',
    /\bskills? as (tags|chips|pills)|\bskill (tags|chips|pills)/,
  ),
  F('paper', 'cream', 'cream paper', /\bcream (paper|background|page)/),
  F('paper', 'tint', 'tinted paper', /\btinted (paper|background|page)/),
  F('photoShape', 'circle', 'a round photo', /\b(round|circular|circle) (photo|picture|portrait)/),
  F('photoShape', 'square', 'a square photo', /\bsquare (photo|picture|portrait)/),
  F(
    'header',
    'band',
    'a header band',
    /\bheader band|\bband (across|at) the top|\bcolou?red header\b|\bbanner\b/,
  ),
  F('align', 'center', 'a centred name', /\bcent(re|er)(d|ed) name|\bname (in the )?cent(re|er)/),
];

const SECTION_WORDS: Record<string, string> = {
  skills: 'skills',
  languages: 'languages',
  certifications: 'certifications',
  certificates: 'certifications',
  licences: 'licences',
  licenses: 'licences',
  awards: 'awards',
  education: 'education',
  experience: 'experience',
  projects: 'projects',
  volunteering: 'volunteering',
};

/** The vocabulary requests in a description (English). */
export function requestsIn(description: string): Ask[] {
  const d = description.toLowerCase().replace(/\s+/g, ' ');
  const out: Ask[] = [];
  const seen = new Set<FieldName>();
  for (const p of PHRASES) {
    if (seen.has(p.field) || !p.re.test(d)) continue;
    seen.add(p.field);
    out.push({ kind: 'field', field: p.field, value: p.value, label: p.label });
  }
  // "a narrow right rail with education and certifications", "skills on the left"
  const clauses = d.split(/[.;]| and a | and the |, (?=a |the )/);
  for (const c of clauses) {
    const side = /\b(left)\b/.test(c) ? 'left' : /\b(right)\b/.test(c) ? 'right' : null;
    if (!side || !/\b(rail|column|sidebar|side)\b/.test(c)) continue;
    for (const [word, kind] of Object.entries(SECTION_WORDS))
      if (
        new RegExp(`\\b${word}\\b`).test(c) &&
        !out.some((a) => a.kind === 'place' && a.section === kind)
      )
        out.push({ kind: 'place', section: kind, side, label: `${kind} on the ${side}` });
  }
  return out;
}

const placeOf = (spec: DesignSpecV2, section: string): 'left' | 'right' | null => {
  const t = spec.layout.type;
  const inSide = (spec.placement.side as string[]).includes(section);
  const inThird = ((spec.placement.third ?? []) as string[]).includes(section);
  if (t === 'rails') return inSide ? 'left' : inThird ? 'right' : null;
  if (t === 'sidebar-left') return inSide ? 'left' : null;
  if (t === 'sidebar-right' || t === 'two-equal') return inSide ? 'right' : null;
  return null;
};

export type Accounted = { spec: DesignSpecV2; done: string[]; unmet: string[] };

/**
 * Hold one candidate to the requests: apply what is missing, run the design rules, and account for
 * each request as done or not possible (with the reason).
 */
export function holdToRequests(
  spec: DesignSpecV2,
  asks: Ask[],
  doc: ResumeDocument | undefined,
  from: string,
): Accounted {
  if (!asks.length) return { spec, done: [], unmet: [] };
  const flat = toFlat(spec) as Record<string, unknown>;
  const changes: Record<string, unknown> = {};
  const unmet: string[] = [];
  for (const a of asks) {
    if (a.kind === 'field') {
      if (flat[a.field] !== a.value) changes[a.field] = a.value;
      continue;
    }
    if (!(COMPACT_KINDS as readonly string[]).includes(a.section)) {
      unmet.push(
        `${cap(a.section)} stays in the main column: narrow columns only hold short sections (skills, languages, certifications, licences, awards).`,
      );
      continue;
    }
    if (placeOf(spec, a.section) === a.side) continue;
    const t = spec.layout.type;
    const field =
      t === 'rails'
        ? a.side === 'left'
          ? 'sideSections'
          : 'thirdSections'
        : (t === 'sidebar-left' && a.side === 'left') ||
            ((t === 'sidebar-right' || t === 'two-equal') && a.side === 'right')
          ? 'sideSections'
          : null;
    if (!field) {
      unmet.push(`${cap(a.label)}: this layout has no ${a.side}-hand column.`);
      continue;
    }
    const cur = (
      field === 'sideSections' ? spec.placement.side : (spec.placement.third ?? [])
    ) as string[];
    const other = (
      field === 'sideSections' ? (spec.placement.third ?? []) : spec.placement.side
    ) as string[];
    changes[field] = [...new Set([...cur, a.section])];
    changes[field === 'sideSections' ? 'thirdSections' : 'sideSections'] = other.filter(
      (k) => k !== a.section,
    );
  }
  let next = spec;
  if (Object.keys(changes).length) {
    next = applyFlat(spec, changes).spec;
    if (JSON.stringify(next) !== JSON.stringify(spec))
      next = {
        ...next,
        baseId: undefined,
        designId: undefined,
        origin: (spec.origin ?? from) as never,
      };
  }
  // The design rules have the last word (e.g. no skill bars without skill levels).
  const ruled = normalise(next, doc);
  const final = toFlat(ruled.spec) as Record<string, unknown>;
  const done: string[] = [];
  for (const a of asks) {
    if (a.kind === 'place') {
      if (
        (COMPACT_KINDS as readonly string[]).includes(a.section) &&
        placeOf(ruled.spec, a.section) === a.side
      )
        done.push(a.label);
      continue;
    }
    if (final[a.field] === a.value) done.push(a.label);
    else
      unmet.push(
        ruled.unmet.find((u) => u.toLowerCase().includes(a.value.toLowerCase())) ??
          `${cap(a.label)}: not possible with this layout.`,
      );
  }
  return { spec: next, done, unmet };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
