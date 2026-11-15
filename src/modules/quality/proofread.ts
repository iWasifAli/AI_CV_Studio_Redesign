import { inlinePatch, type InlineField } from '@/modules/resume/inline-edit';
import { itemName } from '@/modules/resume/versions';
import type { ResumeDocument } from '@/modules/resume/schema';

/**
 * Proofread the whole CV (spec §9.3 `quality.proofread`): the CV as numbered lines, each line one
 * field the person wrote, so a fix can be applied exactly where it belongs. The AI may only quote
 * words that are really in a line and replace those words; the app checks both, and the person
 * accepts each fix one by one.
 */

export const ISSUE_KINDS = [
  'spelling',
  'grammar',
  'punctuation',
  'capitals',
  'consistency',
  'repetition',
] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];
export const ISSUE_LABEL: Record<IssueKind, string> = {
  spelling: 'Spelling',
  grammar: 'Grammar',
  punctuation: 'Punctuation',
  capitals: 'Capital letters',
  consistency: 'Consistency',
  repetition: 'Repeated words',
};

export type ProofLine = {
  id: string;
  text: string;
  field: InlineField;
  /** Where on the CV, in words ("Work history › Driver, Acme"). */
  where: string;
  /** For "Show me": basics/... or sectionId/itemId. */
  ref: string;
  /** The line belongs to a job the person still does (its points are in the present tense). */
  current?: boolean;
};

const TEXT_KEYS = [
  'role',
  'organization',
  'qualification',
  'institution',
  'label',
  'language',
  'fluency',
  'name',
  'issuer',
  'detail',
  'title',
  'subtitle',
  'text',
  'quote',
  'value',
  'place',
] as const;
const LIST_KEYS = ['bullets', 'details', 'keywords'] as const;

/** Every piece of text the person wrote, one field per line (hidden sections left out). */
export function proofLines(doc: ResumeDocument): ProofLine[] {
  const out: ProofLine[] = [];
  const add = (text: string, field: InlineField, where: string, ref: string) => {
    const t = text.replace(/\s+/g, ' ').trim();
    if (t.length < 2 || out.length >= 400) return;
    out.push({ id: `L${out.length + 1}`, text: t, field, where, ref });
  };
  add(
    doc.basics.headline,
    { kind: 'basics', key: 'headline' },
    'Job title you want',
    'basics/contact',
  );
  add(doc.basics.summary, { kind: 'basics', key: 'summary' }, 'Profile', 'basics/summary');
  for (const s of doc.sections) {
    if (s.hidden) continue;
    for (const raw of s.items) {
      const item = raw as unknown as Record<string, unknown> & { id: string };
      const where = `${s.title} › ${itemName(item)}`;
      const ref = `${s.id}/${item.id}`;
      const from = out.length;
      for (const key of TEXT_KEYS) {
        const v = item[key];
        if (typeof v === 'string')
          add(v, { kind: 'item', sectionId: s.id, itemId: item.id, key }, where, ref);
      }
      for (const key of LIST_KEYS) {
        const v = item[key];
        if (Array.isArray(v))
          (v as string[]).forEach((x, index) =>
            add(x, { kind: 'item', sectionId: s.id, itemId: item.id, key, index }, where, ref),
          );
      }
      if (item.current === true) for (let k = from; k < out.length; k++) out[k]!.current = true;
    }
  }
  return out;
}

/**
 * The lines as the AI sees them: "L3: text"; a line of a job the person still does is marked
 * "(current job)", so its points are kept in the present tense (audit F-21).
 */
export const proofText = (lines: ProofLine[]) =>
  lines.map((l) => `${l.id}${l.current ? ' (current job)' : ''}: ${l.text}`).join('\n');

/**
 * The CV in parts of about `size` lines for checking side by side (much faster than one long
 * call, audit F-11). A job's lines always stay in one part, so tense checks see the whole job.
 */
export function proofChunks(lines: ProofLine[], size = 24): ProofLine[][] {
  const groups: ProofLine[][] = [];
  for (const l of lines) {
    const last = groups[groups.length - 1];
    if (last && last[0]!.ref === l.ref) last.push(l);
    else groups.push([l]);
  }
  const out: ProofLine[][] = [];
  for (const g of groups) {
    const last = out[out.length - 1];
    if (last && last.length + g.length <= size) last.push(...g);
    else out.push([...g]);
  }
  return out;
}

export type RawIssue = { line: string; kind: IssueKind; quote: string; fix: string; why: string };
export type Issue = RawIssue & { where: string; ref: string; text: string };

const norm = (s: string) => s.replace(/\s+/g, ' ');

/**
 * Keeps only issues the app can stand behind: the line exists, the quoted words are really in it,
 * the fix changes something, is not a rewrite of the whole line, and carries no {{?…}} marker
 * (a fact the guard couldn't find). One issue per line and quote; at most 40.
 */
export function checkIssues(raw: RawIssue[], lines: ProofLine[]): Issue[] {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const seen = new Set<string>();
  const out: Issue[] = [];
  for (const r of raw) {
    const l = byId.get(/L\d+/.exec(r.line)?.[0] ?? r.line.trim());
    const quote = norm(r.quote).trim();
    const fix = norm(r.fix).trim();
    if (!l || !quote || !l.text.includes(quote)) continue;
    if (fix === quote || fix.includes('{{?') || fix.length > quote.length * 3 + 40) continue;
    if (quote.length > 300) continue;
    const key = `${l.id}\n${quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      line: l.id,
      kind: r.kind,
      quote,
      fix,
      why: r.why.replace(/\s+/g, ' ').trim().slice(0, 200),
      where: l.where,
      ref: l.ref,
      text: l.text,
    });
    if (out.length >= 40) break;
  }
  return out;
}

/** The line's text with the fix in place of the first occurrence of the quote. */
export function fixedText(text: string, quote: string, fix: string): string | null {
  // Spaces in the quote match any run of whitespace, so a profile keeps its paragraph breaks.
  const pattern = quote
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  if (!pattern) return null;
  const m = new RegExp(pattern).exec(text);
  if (!m) return null;
  return text.slice(0, m.index) + fix + text.slice(m.index + m[0].length);
}

/** Current text of a field in the CV (it may have changed since the check). */
export function fieldText(doc: ResumeDocument, f: InlineField): string | null {
  if (f.kind === 'basics') return doc.basics[f.key];
  const item = doc.sections
    .find((s) => s.id === f.sectionId)
    ?.items.find((i) => i.id === f.itemId) as Record<string, unknown> | undefined;
  if (!item) return null;
  const v = item[f.key];
  if (f.index === undefined) return typeof v === 'string' ? v : null;
  return Array.isArray(v) && typeof v[f.index] === 'string' ? (v[f.index] as string) : null;
}

/**
 * The patch that applies one fix to the CV as it is now, or null when that text has changed since
 * the check (the person edited it, or a fix before this one already changed those words).
 */
export function fixPatch(doc: ResumeDocument, issue: Issue, lines: ProofLine[]) {
  const l = lines.find((x) => x.id === issue.line);
  if (!l) return null;
  const now = fieldText(doc, l.field);
  if (now === null) return null;
  const next = fixedText(now, issue.quote, issue.fix);
  if (next === null) return null;
  return inlinePatch(doc, l.field, next);
}
