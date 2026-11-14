import { beforeEach, describe, expect, it } from 'vitest';
import { driver } from '@/modules/resume/fixtures';
import type { ResumeDocument } from '@/modules/resume/schema';
import { MemoryUserStore } from '@/modules/store/memory';
import { FEW, factsOf, insights, pct, reachedOf, trackStage, wasSent } from './insights';
import type { Job, SentWith } from './schema';
import { applyJobPatch, newJobHistory, withSent } from './server';

const job = (o: Partial<Job> = {}): Job => ({
  id: 'j1',
  title: 'Driver',
  company: 'Acme',
  location: '',
  url: '',
  advert: '',
  stage: 'saved',
  outcome: '',
  notes: '',
  appliedOn: '',
  documentIds: [],
  interviewNotes: [],
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...o,
});
const at = (d: string) => new Date(`${d}T12:00:00Z`);

describe('application analytics: stage history', () => {
  it('stamps each stage the first day it is reached, and Applied when skipped', () => {
    let j = job();
    j = applyJobPatch(j, { stage: 'applied' }, at('2026-11-02')) as Job;
    expect(j.reached).toEqual({ applied: '2026-11-02' });
    expect(j.appliedOn).toBe('2026-11-02');
    j = applyJobPatch(j, { stage: 'interview' }, at('2026-11-09')) as Job;
    expect(j.reached).toEqual({ applied: '2026-11-02', interview: '2026-11-09' });
    const skip = applyJobPatch(job(), { stage: 'offer' }, at('2026-11-05')) as Job;
    expect(skip.reached).toEqual({ applied: '2026-11-05', offer: '2026-11-05' });
  });

  it('closing keeps the furthest stage; moving back is a correction', () => {
    let j = job({
      stage: 'interview',
      reached: { applied: '2026-11-01', interview: '2026-11-04' },
    });
    j = applyJobPatch(j, { stage: 'closed', outcome: 'rejected' }, at('2026-11-10')) as Job;
    expect(j.reached).toEqual({
      applied: '2026-11-01',
      interview: '2026-11-04',
      closed: '2026-11-10',
    });
    expect(j.outcome).toBe('rejected');
    // Re-opened at Applied: the interview was a mistake, so it is forgotten, and so is the outcome.
    j = applyJobPatch(j, { stage: 'applied' }, at('2026-11-11')) as Job;
    expect(j.reached).toEqual({ applied: '2026-11-01' });
    expect(j.outcome).toBe('');
    // Back to Saved: no longer sent.
    j = applyJobPatch(j, { stage: 'saved', appliedOn: '' }, at('2026-11-11')) as Job;
    expect(j.reached).toEqual({});
    expect(wasSent(j)).toBe(false);
  });

  it('an outcome only sticks while closed', () => {
    const j = applyJobPatch(job({ stage: 'applied' }), { outcome: 'rejected' }) as Job;
    expect(j.outcome).toBe('');
    expect('error' in (applyJobPatch(job(), { outcome: 'hired!' }) as object)).toBe(true);
  });

  it('works out the history of jobs from before R9.10 (days unknown)', () => {
    expect(reachedOf(job({ stage: 'interview', appliedOn: '2026-10-03' }))).toEqual({
      applied: '2026-10-03',
      interview: '',
    });
    expect(reachedOf(job({ stage: 'applied' }))).toEqual({ applied: '' });
    expect(reachedOf(job({ stage: 'closed' }))).toEqual({ closed: '' });
    expect(wasSent(job({ stage: 'closed' }))).toBe(false);
    expect(wasSent(job({ stage: 'closed', appliedOn: '2026-10-03' }))).toBe(true);
    // A legacy interview counts, but never for timing.
    const f = factsOf(job({ stage: 'interview', appliedOn: '2026-10-03' }));
    expect(f).toMatchObject({ replied: true, interview: true, daysToReply: null });
  });

  it('a new job added straight into a later stage gets its history', () => {
    const j = newJobHistory(job({ stage: 'applied', appliedOn: '2026-11-01' }), at('2026-11-03'));
    expect(j.reached).toEqual({ applied: '2026-11-01' });
    expect(newJobHistory(job()).reached).toEqual({});
  });
});

describe('application analytics: what counts', () => {
  it('a reply is an interview, an offer or a "no"; silence is not', () => {
    const base = { reached: { applied: '2026-11-01' }, appliedOn: '2026-11-01' };
    expect(factsOf(job({ ...base, stage: 'applied' }))).toMatchObject({
      replied: false,
      waiting: true,
    });
    const no = job({
      ...base,
      stage: 'closed',
      outcome: 'rejected',
      reached: { applied: '2026-11-01', closed: '2026-11-08' },
    });
    expect(factsOf(no)).toMatchObject({ replied: true, interview: false, daysToReply: 7 });
    const silent = job({ ...base, stage: 'closed', outcome: 'no_reply' });
    expect(factsOf(silent)).toMatchObject({ replied: false, waiting: false });
    const offer = job({
      ...base,
      stage: 'closed',
      outcome: 'accepted',
      reached: { applied: '2026-11-01', interview: '2026-11-04', offer: '2026-11-20' },
    });
    expect(factsOf(offer)).toMatchObject({
      replied: true,
      interview: true,
      offer: true,
      daysToReply: 3,
    });
    expect(wasSent(job({ ...base, stage: 'closed', outcome: 'not_applied' }))).toBe(false);
  });
});

const cv = (id: string, designId: string | null, o: Partial<SentWith> = {}): SentWith => ({
  cvId: id,
  title: `CV ${id}`,
  tailored: false,
  designId,
  designName: designId ? designId[0]!.toUpperCase() + designId.slice(1) : 'Your own design',
  ...o,
});

describe('application analytics: totals and groups', () => {
  it('counts sent, replies, interviews, offers, waiting and no answer, by CV and design', () => {
    const jobs: Job[] = [
      job({
        id: 'a',
        stage: 'applied',
        appliedOn: '2026-11-10',
        reached: { applied: '2026-11-10' },
      }),
      job({
        id: 'b',
        stage: 'interview',
        appliedOn: '2026-11-02',
        reached: { applied: '2026-11-02', interview: '2026-11-06' },
      }),
      job({
        id: 'c',
        stage: 'closed',
        outcome: 'rejected',
        appliedOn: '2026-11-03',
        reached: { applied: '2026-11-03', closed: '2026-11-13' },
      }),
      job({
        id: 'd',
        stage: 'closed',
        appliedOn: '2026-10-01',
        reached: { applied: '2026-10-01', closed: '2026-11-01' },
      }),
      job({ id: 'e', stage: 'saved' }),
      job({ id: 'f', stage: 'closed', outcome: 'not_applied' }),
    ];
    const sent: Record<string, SentWith | null> = {
      a: cv('1', 'clarity'),
      b: cv('t1', 'clarity', { tailored: true, baseId: '1', baseTitle: 'CV 1' }),
      c: cv('t2', null, { tailored: true, baseId: '1', baseTitle: 'CV 1' }),
      d: null,
    };
    const r = insights(jobs, (j) => sent[j.id] ?? null, at('2026-11-14'));
    expect(r).toMatchObject({
      sent: 4,
      replies: 2,
      interviews: 1,
      offers: 0,
      waiting: 1,
      noReply: 1,
      saved: 1,
      medianDaysToReply: 7, // 4 and 10 days
    });
    expect(r.byCv.map((g) => [g.label, g.sent, g.replies, g.interviews])).toEqual([
      ['Tailored copies of “CV 1”', 2, 2, 1],
      ['CV 1', 1, 0, 0],
      ['No CV linked', 1, 0, 0],
    ]);
    expect(r.byDesign.map((g) => [g.label, g.sent, g.replies])).toEqual([
      ['Clarity', 2, 1],
      ['Your own designs', 1, 1],
      ['No CV linked', 1, 0],
    ]);
    expect(r.missingOutcome.map((j) => j.id)).toEqual(['d']);
    expect(r.noCv.map((j) => j.id)).toEqual(['d']);
    // 12 weeks ending this week (Mon 9 Nov 2026), from Mon 24 Aug.
    expect(r.weeks).toHaveLength(12);
    expect(r.weeks.at(-1)).toEqual({ start: '2026-11-09', count: 1 });
    expect(r.weeks.at(-2)).toEqual({ start: '2026-11-02', count: 2 });
    expect(r.weeks[0]!.start).toBe('2026-08-24');
    expect(r.weeks.find((w) => w.start === '2026-09-28')?.count).toBe(1);
    expect(r.weeks.reduce((n, w) => n + w.count, 0)).toBe(4);
  });

  it('no median from a single answer; rates need something to divide', () => {
    const one = job({
      stage: 'interview',
      appliedOn: '2026-11-01',
      reached: { applied: '2026-11-01', interview: '2026-11-05' },
    });
    expect(insights([one], () => null).medianDaysToReply).toBeNull();
    expect(pct(1, 3)).toBe(33);
    expect(pct(0, 0)).toBeNull();
    expect(FEW).toBe(5);
  });
});

describe('application analytics: the CV sent', () => {
  const store = new MemoryUserStore();
  beforeEach(() => {
    (globalThis as { __cvStudioStore?: unknown }).__cvStudioStore = store;
  });
  const doc = (o: Partial<ResumeDocument>): ResumeDocument => ({ ...driver, ...o });

  it('records the CV linked when applied, as it was, and follows a change of CV', async () => {
    await store.putDoc('u1', doc({ id: 'cv-a', title: 'Main CV' }), 50);
    await store.putDoc(
      'u1',
      doc({
        id: 'cv-t',
        title: 'Tailored',
        jobId: 'j1',
        parentId: 'cv-a',
        updatedAt: driver.updatedAt,
      }),
      50,
    );
    const saved = job({ documentIds: ['cv-a'] });
    // Not sent yet: nothing recorded.
    expect((await withSent('u1', null, saved)).sent).toBeUndefined();
    const applied = applyJobPatch(saved, { stage: 'applied' }) as Job;
    const s1 = await withSent('u1', saved, applied);
    expect(s1.sent).toMatchObject({ cvId: 'cv-a', title: 'Main CV', tailored: false });
    expect(s1.sent?.designName).toBeTruthy();
    // The CV is redesigned later: the record keeps the design it had.
    const later = { ...s1, notes: 'called them' };
    expect((await withSent('u1', s1, later)).sent).toBe(s1.sent);
    // Linking the tailored copy (last linked wins) records it, under its base CV.
    const relinked = { ...s1, documentIds: ['cv-a', 'cv-t'] };
    const s2 = await withSent('u1', s1, relinked);
    expect(s2.sent).toMatchObject({
      cvId: 'cv-t',
      tailored: true,
      baseId: 'cv-a',
      baseTitle: 'Main CV',
    });
    // Nothing linked: recorded as no CV, and asked again next time.
    const none = await withSent('u1', s2, { ...s2, documentIds: [] });
    expect(none.sent).toBeNull();
    // Other accounts' CVs are never found.
    expect((await withSent('u2', null, { ...applied })).sent).toBeNull();
  });
});
