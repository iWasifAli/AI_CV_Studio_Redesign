import { describe, expect, it } from 'vitest';
import { createMockProvider } from '@/modules/ai/providers/mock';
import { runTask } from '@/modules/ai/run';
import { driver } from '@/modules/resume/fixtures';
import { ops } from '@/modules/resume/ops';
import type { ExperienceItem } from '@/modules/resume/schema';
import { cleanAnswers, hasNumber, quantifyPatch, unmeasured } from './quantify';

const models = { fast: 'f', smart: 's' };
const exp = driver.sections.find((s) => s.kind === 'experience')!;
const job = exp.items[0] as ExperienceItem;

describe('quantify prompts: which points', () => {
  it('a number, a percentage or a number word counts', () => {
    expect(hasNumber('Delivered around 120 parcels a day')).toBe(true);
    expect(hasNumber('Cut waiting times by a third with 5% fewer errors')).toBe(true);
    expect(hasNumber('Trained two new drivers')).toBe(true);
    expect(hasNumber('Planned routes each morning')).toBe(false);
  });

  it('lists points with no number from work sections, in CV order, with the job', () => {
    const list = unmeasured(driver);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((p) => !hasNumber(p.text))).toBe(true);
    const first = list[0]!;
    expect(first).toMatchObject({
      sectionId: exp.id,
      itemId: job.id,
      job: `${job.role} at ${job.organization}`,
      where: `${exp.title} › ${job.role}, ${job.organization}`,
    });
    expect(job.bullets[first.index]).toBe(first.text);
    // Hidden sections are left out.
    const hidden = { ...driver, sections: driver.sections.map((s) => ({ ...s, hidden: true })) };
    expect(unmeasured(hidden)).toEqual([]);
  });

  it('answers are cleaned: one line, both parts, at most 3', () => {
    expect(
      cleanAnswers([
        { question: 'How many?', answer: ' about\n40 ' },
        { question: 'How often?', answer: '' },
        { question: '', answer: 'x' },
        'nonsense',
        { question: 'a', answer: 'b' },
        { question: 'c', answer: 'd' },
        { question: 'e', answer: 'f' },
      ]),
    ).toEqual([
      { question: 'How many?', answer: 'about 40' },
      { question: 'a', answer: 'b' },
      { question: 'c', answer: 'd' },
    ]);
    expect(cleanAnswers('x')).toEqual([]);
  });

  it('replaces only that point, and refuses when it has changed since', () => {
    const p = unmeasured(driver)[0]!;
    const patch = quantifyPatch(driver, p, `${p.text} for 40 shops a week`);
    expect(patch).toMatchObject({ sectionId: exp.id, itemId: job.id });
    const d = ops.updateItem(
      driver,
      exp.id,
      job.id,
      (patch as { patch: Record<string, unknown> }).patch,
    );
    const bullets = (d.sections.find((s) => s.id === exp.id)!.items[0] as ExperienceItem).bullets;
    expect(bullets[p.index]).toBe(`${p.text} for 40 shops a week`);
    expect(bullets.filter((_, i) => i !== p.index)).toEqual(
      job.bullets.filter((_, i) => i !== p.index),
    );
    expect(quantifyPatch(d, p, 'again')).toBeNull();
  });
});

describe('quantify prompts: the AI task', () => {
  const point = 'Planned routes each morning to meet timed delivery slots';

  it('asks questions without numbers in them', async () => {
    const r = await runTask('write.quantify', { mode: 'ask', point, job: 'Driver at Swift' }, 0, {
      provider: createMockProvider(),
      models,
    });
    expect(r.ok && r.result.questions.length).toBeGreaterThan(0);
    expect(r.ok && r.result.questions.every((q) => !/\d/.test(q.question + q.hint))).toBe(true);
  });

  it('adds only the answers; a number nobody gave is marked, not added', async () => {
    const ok = await runTask(
      'write.quantify',
      {
        mode: 'insert',
        point,
        job: 'Driver',
        answers: [{ question: 'How many?', answer: '45 drops a day' }],
      },
      0,
      { provider: createMockProvider(), models },
    );
    expect(ok.ok && ok.result.point).toContain('45 drops a day');
    expect(ok.ok && ok.result.point).not.toContain('{{?');
    const bad = await runTask(
      'write.quantify',
      {
        mode: 'insert',
        point,
        job: 'Driver',
        answers: [{ question: 'How many?', answer: 'about 30 ZZ-QUANT' }],
      },
      0,
      { provider: createMockProvider(), models },
    );
    expect(bad.ok && bad.result.point).toContain('{{?');
    expect(bad.ok && bad.findings.map((f) => f.value)).toContain('45');
  });
});
