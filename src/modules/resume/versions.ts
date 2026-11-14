import { currentDesignId } from '@/modules/design/catalogue';
import { DESIGN_META } from '@/modules/design/designs';
import { FONT_PAIRS } from '@/modules/templates/fonts';
import type { DocVersion, VersionKind } from '@/modules/store/types';
import type { ResumeDocument } from './schema';

/**
 * CV versions (spec §9.1): naming and "what changed" between two versions. Pure, shared by the
 * server (labels) and the History panel (comparison).
 */

/** A version name: plain text, one line, at most 60 characters. */
export function cleanVersionName(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim();
}

/** A version in the History list, without the CV itself. */
export type VersionMeta = {
  id: string;
  savedAt: string;
  kind: VersionKind;
  name?: string;
  title: string;
  design: string;
};
export const versionMeta = (v: DocVersion): VersionMeta => ({
  id: v.id,
  savedAt: v.savedAt,
  kind: v.kind,
  ...(v.name ? { name: v.name } : {}),
  title: v.doc?.title ?? '',
  design: v.doc ? designNameOf(v.doc) : '',
});

export function designNameOf(doc: ResumeDocument): string {
  const id = currentDesignId(doc.design);
  return (id && DESIGN_META[id]?.name) || 'Your own design';
}

export type Change = {
  /** Where on the CV, in words ("Work history › Driver, Acme"). */
  where: string;
  kind: 'added' | 'removed' | 'changed';
  /** The field ("Job title", "a point"), when it is narrower than `where`. */
  what?: string;
  before?: string;
  after?: string;
};

const FIELD: Record<string, string> = {
  name: 'Name',
  headline: 'Headline',
  email: 'Email',
  phone: 'Phone',
  location: 'Location',
  summary: 'Profile',
  role: 'Job title',
  organization: 'Organisation',
  qualification: 'Qualification',
  institution: 'Institution',
  start: 'Start',
  end: 'End',
  current: 'Current',
  label: 'Label',
  language: 'Language',
  fluency: 'Fluency',
  level: 'Level',
  issuer: 'Issued by',
  date: 'Date',
  detail: 'Detail',
  link: 'Link',
  contact: 'Contact',
  title: 'Title',
  subtitle: 'Subtitle',
  text: 'Text',
  quote: 'Quote',
  value: 'Value',
  place: 'Place',
};
const LIST: Record<string, [string, string]> = {
  bullets: ['a point', 'points'],
  details: ['a detail', 'details'],
  keywords: ['a skill', 'skills'],
};

type Item = Record<string, unknown> & { id: string };

/** A short name for an entry, from its main fields. */
export function itemName(item: Item): string {
  const s = (k: string) => (typeof item[k] === 'string' ? (item[k] as string).trim() : '');
  const main =
    s('role') || s('qualification') || s('name') || s('title') || s('label') || s('language');
  const second = s('organization') || s('institution') || s('issuer') || s('subtitle');
  const quote = s('quote');
  return (
    [main || (quote ? `“${quote.slice(0, 40)}…”` : ''), second].filter(Boolean).join(', ') ||
    'An entry'
  );
}

const shown = (v: unknown) =>
  typeof v === 'boolean' ? (v ? 'Yes' : 'No') : typeof v === 'string' ? v : '';

function compareItem(where: string, a: Item, b: Item, out: Change[]) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (k === 'id' || k === 'levels') continue;
    const x = a[k];
    const y = b[k];
    if (Array.isArray(x) || Array.isArray(y)) {
      const xs = (Array.isArray(x) ? x : []).map(String);
      const ys = (Array.isArray(y) ? y : []).map(String);
      const [one] = LIST[k] ?? ['an item', 'items'];
      for (const t of xs)
        if (!ys.includes(t)) out.push({ where, kind: 'removed', what: one, before: t });
      for (const t of ys)
        if (!xs.includes(t)) out.push({ where, kind: 'added', what: one, after: t });
      const same = xs.filter((t) => ys.includes(t));
      const sameOrder = ys.filter((t) => xs.includes(t));
      if (same.join('\n') !== sameOrder.join('\n'))
        out.push({ where, kind: 'changed', what: `Order of ${LIST[k]?.[1] ?? 'items'}` });
      continue;
    }
    if (shown(x) !== shown(y))
      out.push({
        where,
        kind: 'changed',
        what: FIELD[k] ?? k,
        before: shown(x),
        after: shown(y),
      });
  }
}

/**
 * What changed from `before` to `after`, in reading order: the CV's name, your details, each
 * section and entry (matched by id, so a renamed job is "changed", not removed and added), section
 * order, and the design.
 */
export function diffDocs(before: ResumeDocument, after: ResumeDocument): Change[] {
  const out: Change[] = [];
  if (before.title !== after.title)
    out.push({ where: 'CV name', kind: 'changed', before: before.title, after: after.title });

  const ba = before.basics as unknown as Record<string, unknown>;
  const bb = after.basics as unknown as Record<string, unknown>;
  for (const k of ['name', 'headline', 'email', 'phone', 'location', 'summary']) {
    if (shown(ba[k]) !== shown(bb[k]))
      out.push({
        where: k === 'summary' ? 'Profile' : 'Your details',
        kind: 'changed',
        what: k === 'summary' ? undefined : k === 'headline' ? 'Job title you want' : FIELD[k],
        before: shown(ba[k]),
        after: shown(bb[k]),
      });
  }
  if (!!before.basics.photo !== !!after.basics.photo)
    out.push({
      where: 'Your details',
      kind: after.basics.photo ? 'added' : 'removed',
      what: 'Photo',
    });
  else if (before.basics.photo !== after.basics.photo)
    out.push({ where: 'Your details', kind: 'changed', what: 'Photo' });
  const links = (d: ResumeDocument) => d.basics.links.map((l) => `${l.label} ${l.url}`.trim());
  for (const l of links(before))
    if (!links(after).includes(l))
      out.push({ where: 'Your details', kind: 'removed', what: 'a link', before: l });
  for (const l of links(after))
    if (!links(before).includes(l))
      out.push({ where: 'Your details', kind: 'added', what: 'a link', after: l });

  const prev = new Map(before.sections.map((s) => [s.id, s]));
  const next = new Map(after.sections.map((s) => [s.id, s]));
  for (const s of after.sections) {
    const p = prev.get(s.id);
    if (!p) {
      out.push({ where: s.title, kind: 'added', what: 'Section' });
      continue;
    }
    if (p.title !== s.title)
      out.push({
        where: s.title,
        kind: 'changed',
        what: 'Section name',
        before: p.title,
        after: s.title,
      });
    if (p.hidden !== s.hidden)
      out.push({ where: s.title, kind: 'changed', what: s.hidden ? 'Hidden' : 'Shown again' });
    const pi = new Map((p.items as Item[]).map((i) => [i.id, i]));
    const ni = new Set((s.items as Item[]).map((i) => i.id));
    for (const i of p.items as Item[])
      if (!ni.has(i.id))
        out.push({ where: `${s.title} › ${itemName(i)}`, kind: 'removed', what: 'Entry' });
    for (const i of s.items as Item[]) {
      const old = pi.get(i.id);
      if (!old) out.push({ where: `${s.title} › ${itemName(i)}`, kind: 'added', what: 'Entry' });
      else compareItem(`${s.title} › ${itemName(i)}`, old, i, out);
    }
    const order = (xs: Item[]) => xs.map((i) => i.id).filter((id) => pi.has(id) && ni.has(id));
    if (order(p.items as Item[]).join() !== order(s.items as Item[]).join())
      out.push({ where: s.title, kind: 'changed', what: 'Order of entries' });
  }
  for (const s of before.sections)
    if (!next.has(s.id)) out.push({ where: s.title, kind: 'removed', what: 'Section' });
  const order = (d: ResumeDocument) =>
    d.sections.map((s) => s.id).filter((id) => prev.has(id) && next.has(id));
  if (order(before).join() !== order(after).join())
    out.push({ where: 'Sections', kind: 'changed', what: 'Order of sections' });

  const da = designNameOf(before);
  const db = designNameOf(after);
  if (da !== db) out.push({ where: 'Design', kind: 'changed', before: da, after: db });
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const look = (d: ResumeDocument) => ({
    Colour: d.design.accent,
    Font: FONT_PAIRS[d.design.fontPair]?.label ?? d.design.fontPair,
    Spacing: cap(d.design.density),
    Paper: d.design.pageSize,
  });
  const la = look(before);
  const lb = look(after);
  for (const k of Object.keys(la) as (keyof typeof la)[])
    if (la[k] !== lb[k])
      out.push({ where: 'Design', kind: 'changed', what: k, before: la[k], after: lb[k] });
  if (
    da === db &&
    JSON.stringify(before.design.v2 ?? null) !== JSON.stringify(after.design.v2 ?? null)
  )
    out.push({ where: 'Design', kind: 'changed', what: 'Layout and style details' });
  return out;
}
