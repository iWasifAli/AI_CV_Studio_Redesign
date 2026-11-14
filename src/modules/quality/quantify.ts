import { inlinePatch, type InlineField } from '@/modules/resume/inline-edit';
import { itemName } from '@/modules/resume/versions';
import type { ResumeDocument } from '@/modules/resume/schema';

/**
 * Quantify prompts (spec §9.3 `write.quantifyAsk`): points with no number get a question or two
 * ("About how many parcels a day?"), and only the person's answer is added to the point.
 */

/** Sections whose points describe work done. */
const KINDS = new Set([
  'experience',
  'volunteering',
  'internships',
  'military',
  'projects',
  'achievements',
]);
const NUMBER_WORDS =
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundreds?|thousands?|millions?|dozens?|half|double|twice|triple)\b/i;

/** True when a point already has a number, a percentage or a number word. */
export const hasNumber = (text: string) =>
  /\d/.test(text) || NUMBER_WORDS.test(text) || /%/.test(text);

export type Unmeasured = {
  sectionId: string;
  itemId: string;
  index: number;
  text: string;
  /** The entry in words ("Work history › Driver, Acme"). */
  where: string;
  /** The entry's own title, for the question ("Driver at Acme"). */
  job: string;
  ref: string;
};

/** Points without a number, in CV order (hidden sections left out; at most 30). */
export function unmeasured(doc: ResumeDocument): Unmeasured[] {
  const out: Unmeasured[] = [];
  for (const s of doc.sections) {
    if (s.hidden || !KINDS.has(s.kind)) continue;
    for (const raw of s.items) {
      const item = raw as unknown as Record<string, unknown> & { id: string; bullets?: string[] };
      const job = [item.role || item.name || item.title, item.organization]
        .filter((x) => typeof x === 'string' && x)
        .join(' at ');
      (item.bullets ?? []).forEach((t, index) => {
        const text = t.replace(/\s+/g, ' ').trim();
        if (text.length < 15 || hasNumber(text) || out.length >= 30) return;
        out.push({
          sectionId: s.id,
          itemId: item.id,
          index,
          text,
          where: `${s.title} › ${itemName(item)}`,
          job: String(job),
          ref: `${s.id}/${item.id}`,
        });
      });
    }
  }
  return out;
}

/** Answers worth sending: trimmed, one line each, at most 3. */
export function cleanAnswers(raw: unknown): { question: string; answer: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => ({
      question: String((a as { question?: unknown })?.question ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200),
      answer: String((a as { answer?: unknown })?.answer ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200),
    }))
    .filter((a) => a.question && a.answer)
    .slice(0, 3);
}

/**
 * The patch that puts the new point in place of the old one, or null when that point has changed
 * since (it was edited, moved or removed).
 */
export function quantifyPatch(doc: ResumeDocument, p: Unmeasured, next: string) {
  const item = doc.sections
    .find((s) => s.id === p.sectionId)
    ?.items.find((i) => i.id === p.itemId) as { bullets?: string[] } | undefined;
  const now = item?.bullets?.[p.index];
  if (now === undefined || now.replace(/\s+/g, ' ').trim() !== p.text) return null;
  const field: InlineField = {
    kind: 'item',
    sectionId: p.sectionId,
    itemId: p.itemId,
    key: 'bullets',
    index: p.index,
  };
  return inlinePatch(doc, field, next);
}
