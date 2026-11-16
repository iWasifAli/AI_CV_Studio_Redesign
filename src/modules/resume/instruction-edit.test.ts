import { describe, expect, it } from 'vitest';
import { runTask } from '@/modules/ai/run';
import { createMockProvider } from '@/modules/ai/providers/mock';
import { FIXTURES } from './fixtures';
import {
  applyChanges,
  describeChange,
  editPrompt,
  editableParts,
  type EditChange,
} from './instruction-edit';

const doc = FIXTURES.driver;
const exp = doc.sections.find((s) => s.kind === 'experience')!;
const job = exp.items[0]!;
const edu = doc.sections.find((s) => s.kind === 'education')!;

describe('edit by instruction (S-01)', () => {
  it('offers text, points and sections — never contact details, dates or links', () => {
    const { fields, lists, sections } = editableParts(doc);
    const ids = fields.map((f) => f.id);
    expect(ids).toContain('basics.summary');
    expect(ids).toContain(`${exp.id}/${job.id}/role`);
    expect(ids).toContain(`${exp.id}/${job.id}/bullets/0`);
    expect(ids.some((i) => /email|phone|start|end|url|photo/.test(i))).toBe(false);
    expect(lists.map((l) => l.id)).toContain(`${exp.id}/${job.id}/bullets`);
    expect(sections).toHaveLength(doc.sections.length);
    expect(editPrompt(doc)).toContain(`${exp.id}/${job.id}/bullets/0 |`);
  });

  it('applies set, add, remove, rename, hide and move together; ids are kept', () => {
    const changes: EditChange[] = [
      { op: 'set', target: 'basics.summary', text: 'Safe, reliable driver.', why: '' },
      { op: 'set', target: `${exp.id}/${job.id}/bullets/0`, text: 'Delivered parcels', why: '' },
      { op: 'remove', target: `${exp.id}/${job.id}/bullets/1`, why: '' },
      { op: 'add', target: `${exp.id}/${job.id}/bullets`, text: 'Kept the van clean', why: '' },
      { op: 'rename', target: exp.id, text: 'Experience', why: '' },
      { op: 'move', target: edu.id, before: exp.id, why: '' },
      { op: 'hide', target: edu.id, why: '' },
    ];
    const out = applyChanges(doc, changes);
    expect(out.basics.summary).toBe('Safe, reliable driver.');
    const e2 = out.sections.find((s) => s.id === exp.id)!;
    const b = (e2.items[0] as { bullets: string[] }).bullets;
    expect(b[0]).toBe('Delivered parcels');
    expect(b).not.toContain((job as { bullets: string[] }).bullets[1]);
    expect(b.at(-1)).toBe('Kept the van clean');
    expect(e2.title).toBe('Experience');
    const order = out.sections.map((s) => s.id);
    expect(order.indexOf(edu.id)).toBe(order.indexOf(exp.id) - 1);
    expect(out.sections.find((s) => s.id === edu.id)!.hidden).toBe(true);
    // The original is untouched.
    expect(doc.basics.summary).not.toBe('Safe, reliable driver.');
  });

  it('refuses changes that point at nothing or at the wrong kind of thing', () => {
    expect(describeChange(doc, { op: 'set', target: 'basics.email', text: 'x', why: '' }).ok).toBe(
      false,
    );
    expect(
      describeChange(doc, { op: 'remove', target: `${exp.id}/${job.id}/role`, why: '' }).ok,
    ).toBe(false);
    expect(
      describeChange(doc, {
        op: 'set',
        target: `${exp.id}/${job.id}/bullets/99`,
        text: 'x',
        why: '',
      }).ok,
    ).toBe(false);
    expect(describeChange(doc, { op: 'move', target: edu.id, before: 'nope', why: '' }).ok).toBe(
      false,
    );
    const ok = describeChange(doc, {
      op: 'set',
      target: 'basics.summary',
      text: 'New',
      why: 'shorter',
    });
    expect(ok).toMatchObject({
      ok: true,
      view: { where: 'Profile', after: 'New', why: 'shorter' },
    });
  });

  it('the offline AI shortens the profile, moves Education and says what it did not do', async () => {
    const r = await runTask(
      'cv.edit',
      {
        instruction: 'Make my profile shorter, put education first and add my award',
        cv: editPrompt(doc),
      },
      0,
      { provider: createMockProvider(), models: { fast: 'fast', smart: 'smart' } },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ops = r.result.changes.map((c) => c.op);
    expect(ops).toContain('set');
    expect(ops).toContain('move');
    expect(r.result.notDone.join(' ')).toMatch(/award/i);
  });
});
