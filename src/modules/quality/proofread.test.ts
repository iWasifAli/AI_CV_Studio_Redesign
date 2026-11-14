import { describe, expect, it } from 'vitest';
import { createMockProvider } from '@/modules/ai/providers/mock';
import { runTask } from '@/modules/ai/run';
import { driver } from '@/modules/resume/fixtures';
import { ops } from '@/modules/resume/ops';
import type { ExperienceItem, ResumeDocument } from '@/modules/resume/schema';
import {
  checkIssues,
  fixedText,
  fixPatch,
  proofLines,
  proofText,
  type RawIssue,
} from './proofread';

const models = { fast: 'f', smart: 's' };
const exp = driver.sections.find((s) => s.kind === 'experience')!;
const job = exp.items[0] as ExperienceItem;
const withBullet = (t: string): ResumeDocument =>
  ops.updateItem(driver, exp.id, job.id, { bullets: [t, ...job.bullets.slice(1)] });
const apply = (d: ResumeDocument, p: NonNullable<ReturnType<typeof fixPatch>>) =>
  'basics' in p ? ops.updateBasics(d, p.basics) : ops.updateItem(d, p.sectionId, p.itemId, p.patch);

describe('proofreading: the lines', () => {
  it('one line per field the person wrote; contact details and hidden sections left out', () => {
    const lines = proofLines(driver);
    expect(lines[0]).toMatchObject({
      id: 'L1',
      text: driver.basics.headline,
      where: 'Job title you want',
    });
    expect(lines.some((l) => l.text === driver.basics.email)).toBe(false);
    expect(lines.find((l) => l.text === job.bullets[0])).toMatchObject({
      where: `${exp.title} › ${job.role}, ${job.organization}`,
      ref: `${exp.id}/${job.id}`,
      field: { kind: 'item', key: 'bullets', index: 0 },
    });
    const hidden = {
      ...driver,
      sections: driver.sections.map((s) => (s.id === exp.id ? { ...s, hidden: true } : s)),
    };
    expect(proofLines(hidden).some((l) => l.text === job.bullets[0])).toBe(false);
    expect(proofText(lines.slice(0, 1))).toBe(`L1: ${driver.basics.headline}`);
  });
});

describe('proofreading: what the AI may say', () => {
  const doc = withBullet('Recieved parcels and and loaded vans');
  const lines = proofLines(doc);
  const line = lines.find((l) => l.text.startsWith('Recieved'))!.id;
  const issue = (o: Partial<RawIssue>): RawIssue => ({
    line,
    kind: 'spelling',
    quote: 'Recieved',
    fix: 'Received',
    why: 'Spelling.',
    ...o,
  });

  it('keeps issues whose words are really on that line, once', () => {
    const out = checkIssues(
      [
        issue({}),
        issue({}),
        issue({ quote: 'Delivered' }), // not on the line
        issue({ line: 'L999' }), // no such line
        issue({ fix: 'Recieved' }), // no change
        issue({ fix: 'by {{?45%}}' }), // the guard found a new fact
        issue({ quote: 'and', fix: 'x'.repeat(200) }), // a rewrite, not a fix
        issue({ kind: 'repetition', quote: 'and and', fix: 'and' }),
      ],
      lines,
    );
    expect(out.map((i) => [i.quote, i.fix])).toEqual([
      ['Recieved', 'Received'],
      ['and and', 'and'],
    ]);
    expect(out[0]).toMatchObject({ where: `${exp.title} › ${job.role}, ${job.organization}` });
  });

  it('a fix changes only the quoted words, and only while they are still there', () => {
    const [spell, twice] = checkIssues(
      [issue({}), issue({ kind: 'repetition', quote: 'and and', fix: 'and' })],
      lines,
    );
    let d = apply(doc, fixPatch(doc, spell!, lines)!);
    d = apply(d, fixPatch(d, twice!, lines)!);
    const bullets = (d.sections.find((s) => s.id === exp.id)!.items[0] as ExperienceItem).bullets;
    expect(bullets[0]).toBe('Received parcels and loaded vans');
    expect(bullets.slice(1)).toEqual(job.bullets.slice(1));
    // Already fixed (or edited by the person): nothing to change.
    expect(fixPatch(d, spell!, lines)).toBeNull();
  });

  it('keeps a profile’s paragraph breaks', () => {
    expect(
      fixedText('First line.\n\nSecond  recieved line.', 'Second recieved', 'Second received'),
    ).toBe('First line.\n\nSecond received line.');
    expect(fixedText('abc', 'x.*', 'y')).toBeNull();
  });

  it('end to end with the demo AI: real issues kept, a made-up quote and an invented number dropped', async () => {
    const d = withBullet('Recieved parcels and and loaded vans ZZ-PROOF');
    const ls = proofLines(d);
    const r = await runTask('quality.proofread', { lines: proofText(ls) }, 0, {
      provider: createMockProvider(),
      models,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const kept = checkIssues(r.result.issues, ls);
    expect(kept.map((i) => [i.kind, i.quote, i.fix])).toEqual([
      ['spelling', 'Recieved', 'Received'],
      ['repetition', 'and and', 'and'],
    ]);
  });
});
