/**
 * Edit the CV by instruction (gap audit S-01). The AI never rewrites the CV wholesale: it proposes
 * small, named changes to the fields listed here, the person reviews each one (before → after) and
 * applies the ones they want in one undo step. Contact details, dates, links and photos are never
 * offered for AI edits.
 */
import type { ResumeDocument } from './schema';

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Text fields of items the AI may rewrite (dates, links and flags are not offered). */
const TEXT_KEYS = [
  'role',
  'organization',
  'qualification',
  'institution',
  'label',
  'fluency',
  'name',
  'issuer',
  'detail',
  'title',
  'subtitle',
  'text',
] as const;
const LIST_KEYS = ['bullets', 'details', 'keywords'] as const;
const BASICS = ['headline', 'summary'] as const;

export type EditField = { id: string; where: string; text: string };
export type EditList = { id: string; where: string; size: number };
export type EditSection = { id: string; title: string; kind: string; hidden: boolean };

/**
 * What the AI may change, with stable ids:
 *  - `basics.headline`, `basics.summary`;
 *  - `<section>/<item>/<key>` for an item's text field;
 *  - `<section>/<item>/<list>/<n>` for one bullet, detail or skill;
 *  - lists (`<section>/<item>/<list>`) to add to; sections to move, rename, hide or show.
 */
export function editableParts(doc: ResumeDocument): {
  fields: EditField[];
  lists: EditList[];
  sections: EditSection[];
} {
  const fields: EditField[] = [];
  const lists: EditList[] = [];
  for (const k of BASICS)
    fields.push({
      id: `basics.${k}`,
      where: k === 'summary' ? 'Profile' : 'Headline',
      text: doc.basics[k],
    });
  for (const s of doc.sections) {
    for (const item of s.items) {
      const rec = item as Record<string, unknown>;
      const head = clean(
        String(rec.role ?? rec.qualification ?? rec.name ?? rec.title ?? rec.label ?? ''),
      );
      const where = head ? `${s.title} › ${head}` : s.title;
      for (const key of TEXT_KEYS) {
        const v = rec[key];
        if (typeof v === 'string' && v.trim())
          fields.push({ id: `${s.id}/${item.id}/${key}`, where: `${where} › ${key}`, text: v });
      }
      for (const key of LIST_KEYS) {
        const v = rec[key];
        if (!Array.isArray(v)) continue;
        lists.push({ id: `${s.id}/${item.id}/${key}`, where: `${where} › ${key}`, size: v.length });
        (v as string[]).forEach((x, n) => {
          if (x.trim())
            fields.push({
              id: `${s.id}/${item.id}/${key}/${n}`,
              where: `${where} › ${key}`,
              text: x,
            });
        });
      }
    }
  }
  const sections = doc.sections.map((s) => ({
    id: s.id,
    title: s.title,
    kind: s.kind,
    hidden: s.hidden,
  }));
  return { fields, lists, sections };
}

export type EditChange =
  | { op: 'set'; target: string; text: string; why: string }
  | { op: 'remove'; target: string; why: string }
  | { op: 'add'; target: string; text: string; why: string }
  | { op: 'move'; target: string; before: string; why: string }
  | { op: 'rename'; target: string; text: string; why: string }
  | { op: 'hide' | 'show'; target: string; why: string };

/** One change as the person sees it: what, where, before → after. */
export type ChangeView = { where: string; before: string; after: string; why: string };

type Loc =
  | { kind: 'basics'; key: (typeof BASICS)[number] }
  | { kind: 'text'; s: number; i: number; key: string }
  | { kind: 'entry'; s: number; i: number; key: string; n: number }
  | { kind: 'list'; s: number; i: number; key: string }
  | { kind: 'section'; s: number };

function locate(doc: ResumeDocument, target: string): Loc | null {
  if (target === 'basics.headline' || target === 'basics.summary')
    return { kind: 'basics', key: target.slice(7) as 'headline' | 'summary' };
  const [sid, iid, key, n] = target.split('/');
  const s = doc.sections.findIndex((x) => x.id === sid);
  if (s < 0) return null;
  if (iid === undefined) return { kind: 'section', s };
  const items = doc.sections[s]!.items as Record<string, unknown>[];
  const i = items.findIndex((x) => x.id === iid);
  if (i < 0 || !key) return null;
  const v = items[i]![key];
  if ((TEXT_KEYS as readonly string[]).includes(key) && typeof v === 'string' && n === undefined)
    return { kind: 'text', s, i, key };
  if ((LIST_KEYS as readonly string[]).includes(key) && Array.isArray(v)) {
    if (n === undefined) return { kind: 'list', s, i, key };
    const k = Number(n);
    return Number.isInteger(k) && k >= 0 && k < v.length
      ? { kind: 'entry', s, i, key, n: k }
      : null;
  }
  return null;
}

const itemOf = (doc: ResumeDocument, l: { s: number; i: number }) =>
  doc.sections[l.s]!.items[l.i] as Record<string, unknown>;

/** Before → after for one change, or why it can't be applied. */
export function describeChange(
  doc: ResumeDocument,
  c: EditChange,
): { ok: true; view: ChangeView } | { ok: false; reason: string } {
  const l = locate(doc, c.target);
  if (!l) return { ok: false, reason: 'It points to something that is not in this CV.' };
  const section = 's' in l ? doc.sections[l.s]! : null;
  const where = (extra = '') =>
    l.kind === 'basics'
      ? l.key === 'summary'
        ? 'Profile'
        : 'Headline'
      : `${section!.title}${extra ? ` › ${extra}` : ''}`;
  const head = (it: Record<string, unknown>) =>
    clean(String(it.role ?? it.qualification ?? it.name ?? it.title ?? it.label ?? ''));
  switch (c.op) {
    case 'set': {
      if (l.kind === 'basics')
        return {
          ok: true,
          view: { where: where(), before: doc.basics[l.key], after: c.text, why: c.why },
        };
      if (l.kind === 'text')
        return {
          ok: true,
          view: {
            where: where(head(itemOf(doc, l))),
            before: String(itemOf(doc, l)[l.key]),
            after: c.text,
            why: c.why,
          },
        };
      if (l.kind === 'entry')
        return {
          ok: true,
          view: {
            where: where(head(itemOf(doc, l))),
            before: (itemOf(doc, l)[l.key] as string[])[l.n]!,
            after: c.text,
            why: c.why,
          },
        };
      return { ok: false, reason: 'Only a text can be rewritten.' };
    }
    case 'remove':
      if (l.kind !== 'entry')
        return { ok: false, reason: 'Only a single point or skill can be removed.' };
      return {
        ok: true,
        view: {
          where: where(head(itemOf(doc, l))),
          before: (itemOf(doc, l)[l.key] as string[])[l.n]!,
          after: '',
          why: c.why,
        },
      };
    case 'add':
      if (l.kind !== 'list')
        return { ok: false, reason: 'Points and skills can only be added to a list.' };
      return {
        ok: true,
        view: { where: where(head(itemOf(doc, l))), before: '', after: c.text, why: c.why },
      };
    case 'move': {
      if (l.kind !== 'section') return { ok: false, reason: 'Only sections can be moved.' };
      const b = c.before === 'end' ? null : doc.sections.find((x) => x.id === c.before);
      if (c.before !== 'end' && !b)
        return { ok: false, reason: 'The place to move it to is not in this CV.' };
      return {
        ok: true,
        view: {
          where: section!.title,
          before: 'Section order',
          after: b ? `Moved above “${b.title}”` : 'Moved to the end',
          why: c.why,
        },
      };
    }
    case 'rename':
      if (l.kind !== 'section') return { ok: false, reason: 'Only sections can be renamed.' };
      return {
        ok: true,
        view: { where: section!.title, before: section!.title, after: c.text, why: c.why },
      };
    case 'hide':
    case 'show':
      if (l.kind !== 'section')
        return { ok: false, reason: 'Only sections can be hidden or shown.' };
      return {
        ok: true,
        view: {
          where: section!.title,
          before: c.op === 'hide' ? 'Shown' : 'Hidden',
          after: c.op === 'hide' ? 'Hidden' : 'Shown',
          why: c.why,
        },
      };
  }
}

/**
 * Applies the chosen changes in order and returns the new CV. Removals are applied last, from the
 * end of each list, so earlier positions stay valid; ids never change.
 */
export function applyChanges(doc: ResumeDocument, changes: EditChange[]): ResumeDocument {
  const out = structuredClone(doc);
  const removals: { sid: string; iid: string; key: string; n: number }[] = [];
  for (const c of changes) {
    const l = locate(out, c.target);
    if (!l) continue;
    if (c.op === 'set') {
      const text = l.kind === 'basics' && l.key === 'summary' ? c.text.trim() : clean(c.text);
      if (l.kind === 'basics') out.basics[l.key] = text;
      else if (l.kind === 'text') itemOf(out, l)[l.key] = text;
      else if (l.kind === 'entry') (itemOf(out, l)[l.key] as string[])[l.n] = text;
    } else if (c.op === 'remove' && l.kind === 'entry') {
      const sec = out.sections[l.s]!;
      removals.push({ sid: sec.id, iid: sec.items[l.i]!.id, key: l.key, n: l.n });
    } else if (c.op === 'add' && l.kind === 'list') {
      (itemOf(out, l)[l.key] as string[]).push(clean(c.text));
    } else if (c.op === 'rename' && l.kind === 'section') {
      out.sections[l.s]!.title = clean(c.text);
    } else if ((c.op === 'hide' || c.op === 'show') && l.kind === 'section') {
      out.sections[l.s]!.hidden = c.op === 'hide';
    } else if (c.op === 'move' && l.kind === 'section') {
      const [moved] = out.sections.splice(l.s, 1);
      const at = c.before === 'end' ? -1 : out.sections.findIndex((x) => x.id === c.before);
      if (at < 0) out.sections.push(moved!);
      else out.sections.splice(at, 0, moved!);
    }
  }
  removals
    .sort((a, b) => b.n - a.n)
    .forEach((r) => {
      // Found again by id: a move in the same batch may have changed the section's position.
      const item = out.sections.find((x) => x.id === r.sid)?.items.find((x) => x.id === r.iid) as
        | Record<string, unknown>
        | undefined;
      const list = item?.[r.key] as string[] | undefined;
      if (list && r.n < list.length) list.splice(r.n, 1);
    });
  return out;
}

/** Compact text of the CV for the AI: every editable part with its id. */
export function editPrompt(doc: ResumeDocument): string {
  const { fields, lists, sections } = editableParts(doc);
  return [
    'SECTIONS (id | title | kind | hidden):',
    ...sections.map((s) => `${s.id} | ${s.title} | ${s.kind} | ${s.hidden ? 'hidden' : 'shown'}`),
    '',
    'FIELDS (id | where | text):',
    ...fields.map((f) => `${f.id} | ${f.where} | ${clean(f.text)}`),
    '',
    'LISTS you may add to (id | where | entries):',
    ...lists.map((l) => `${l.id} | ${l.where} | ${l.size}`),
  ].join('\n');
}
