import { z } from 'zod';
import { buildSource, guardText } from '@/modules/ai/guard';
import { digestPlain, profileDigest } from '@/modules/jobs/digest';
import { cvHasTerm } from '@/modules/jobs/match';
import { inlinePatch, type InlineField } from '@/modules/resume/inline-edit';
import { ops } from '@/modules/resume/ops';
import type { ResumeDocument } from '@/modules/resume/schema';
import { itemName } from '@/modules/resume/versions';

const term = z.string().trim().min(1).max(60);
const key = (s: string) => s.normalize('NFKC').toLocaleLowerCase();
export const keywordSelection = z
  .array(term)
  .min(1)
  .max(25)
  .transform((terms) => {
    const seen = new Set<string>();
    return terms.filter((t) => !seen.has(key(t)) && seen.add(key(t)));
  });

export const keywordRewriteOutput = z.object({
  changes: z
    .array(
      z.object({
        target: z.string().max(240),
        after: z.string().max(2000),
        keywords: z.array(term).max(25),
      }),
    )
    .max(12),
  skipped: z.array(z.object({ term, reason: z.string().trim().min(1).max(240) })).max(25),
});
export const keywordRewriteResult = z.object({
  patches: z
    .array(
      z.object({
        target: z.string().max(240),
        before: z.string().max(1500),
        after: z.string().min(1).max(1500),
        where: z.string().max(500),
        ref: z.string().max(240),
      }),
    )
    .max(12),
  included: z.array(term).max(25),
  skipped: z.array(z.object({ term, reason: z.string().max(240) })).max(25),
});
export type KeywordPatch = z.infer<typeof keywordRewriteResult>['patches'][number];
export type KeywordRewriteResult = z.infer<typeof keywordRewriteResult>;
export type KeywordField = {
  target: string;
  before: string;
  max: number;
  where: string;
  ref: string;
  field: InlineField;
  protected: boolean;
};

/** Only these existing passages are writable. Metadata is never a model-selected edit. */
export function keywordFields(doc: ResumeDocument): KeywordField[] {
  const fields: KeywordField[] = [];
  const add = (
    target: string,
    before: string,
    max: number,
    where: string,
    ref: string,
    field: InlineField,
  ) => {
    fields.push({
      target,
      before,
      max,
      where,
      ref,
      field,
      protected: guardText(before, buildSource([])).findings.length > 0,
    });
  };
  add('basics.summary', doc.basics.summary, 1500, 'Profile', 'basics/summary', {
    kind: 'basics',
    key: 'summary',
  });
  for (const section of doc.sections) {
    if (
      section.hidden ||
      !['experience', 'volunteering', 'internships', 'military', 'projects'].includes(section.kind)
    )
      continue;
    for (const raw of section.items) {
      const item = raw as unknown as { id: string; bullets?: string[] };
      item.bullets?.forEach((before, index) => {
        if (!before.trim()) return;
        add(
          `${section.id}/${item.id}/bullets/${index}`,
          before,
          600,
          `${section.title} › ${itemName(raw)}`.slice(0, 500),
          `${section.id}/${item.id}`,
          { kind: 'item', sectionId: section.id, itemId: item.id, key: 'bullets', index },
        );
      });
    }
  }
  return fields;
}

/** All originals must still match. Return the original reference on any conflict. */
export function applyKeywordPatches(doc: ResumeDocument, patches: KeywordPatch[]): ResumeDocument {
  const fields = new Map(keywordFields(doc).map((f) => [f.target, f]));
  const seen = new Set<string>();
  for (const p of patches) {
    const f = fields.get(p.target);
    if (
      !f ||
      f.before !== p.before ||
      seen.has(p.target) ||
      !p.after.trim() ||
      p.after.length > f.max
    )
      return doc;
    seen.add(p.target);
  }
  return patches.reduce((next, p) => {
    const patch = inlinePatch(next, fields.get(p.target)!.field, p.after);
    if (!patch) return next;
    return 'basics' in patch
      ? ops.updateBasics(next, patch.basics)
      : ops.updateItem(next, patch.sectionId, patch.itemId, patch.patch);
  }, doc);
}

// New words may connect the confirmed skills to existing text, never create another claim.
const CONNECTORS =
  'skills include includes knowledge of and in using with including experience Kenntnisse umfassen umfasst und mit in sowie einschließlich darunter'.toLocaleLowerCase();
const words = (s: string) =>
  s
    .normalize('NFKC')
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) ?? [];
const glue = new Set(words(CONNECTORS));
export function canPlaceKeyword(
  field: Pick<KeywordField, 'target' | 'before'>,
  term: string,
): boolean {
  if (field.target === 'basics.summary') return true;
  // A confirmed skill alone does not establish its use at a particular job. Only qualify a
  // bullet with a term anchored in its own text; otherwise use the generic profile.
  return words(term).some((w) => w.length >= 4 && !glue.has(w) && cvHasTerm(field.before, w));
}

export function checkKeywordRewrite(
  doc: ResumeDocument,
  selected: string[],
  raw: unknown,
): KeywordRewriteResult {
  const parsed = keywordRewriteOutput.safeParse(raw);
  const changes = parsed.success ? parsed.data.changes : [];
  const fields = new Map(keywordFields(doc).map((f) => [f.target, f]));
  const duplicates = new Set(
    changes
      .filter((c, i) => changes.findIndex((x) => x.target === c.target) !== i)
      .map((c) => c.target),
  );
  const selectedByKey = new Map(selected.map((t) => [key(t), t]));
  const plain = digestPlain(profileDigest(doc));
  const patches: KeywordPatch[] = [];
  for (const c of changes) {
    const f = fields.get(c.target);
    const after = c.after.trim();
    const confirmed = c.keywords.map((t) => selectedByKey.get(key(t)));
    if (
      !f ||
      duplicates.has(c.target) ||
      !after ||
      after === f.before.trim() ||
      after.length > f.max ||
      /[{}]/.test(after)
    )
      continue;
    if (!confirmed.length || confirmed.some((t) => !t)) continue;
    const terms = confirmed as string[];
    if (!terms.some((t) => !cvHasTerm(plain, t) && cvHasTerm(after, t))) continue;
    // Token membership alone cannot prevent swapping metrics or attributing a qualification
    // differently. Preserve the complete original fact-bearing span verbatim.
    if (f.protected && !after.includes(f.before.trim())) continue;
    if (terms.some((t) => cvHasTerm(after, t) && !canPlaceKeyword(f, t))) continue;
    const original = f.before.trim();
    const retainsOriginal = !original || after.includes(original);
    const addition = original && retainsOriginal ? after.replace(original, '') : after;
    const permitted = new Set(
      words([...(retainsOriginal ? [] : [f.before]), ...terms, CONNECTORS].join(' ')),
    );
    if (words(addition).some((w) => !permitted.has(w))) continue;
    // Appended text cannot reuse a metric/name from the original to make a new achievement.
    if (
      guardText(addition, buildSource([...(retainsOriginal ? [] : [f.before]), ...terms])).findings
        .length
    )
      continue;
    if (guardText(after, buildSource([f.before, ...terms])).findings.length) continue;
    patches.push({ target: f.target, before: f.before, after, where: f.where, ref: f.ref });
  }
  const candidate = digestPlain(profileDigest(applyKeywordPatches(doc, patches)));
  const included = selected.filter((t) => !cvHasTerm(plain, t) && cvHasTerm(candidate, t));
  const skipped = selected
    .filter((t) => !included.includes(t))
    .map((t) => ({
      term: t,
      reason:
        (parsed.success
          ? parsed.data.skipped.find((s) => key(s.term) === key(t))?.reason
          : undefined) ?? 'No safe, natural replacement was returned.',
    }));
  return { patches, included, skipped };
}
