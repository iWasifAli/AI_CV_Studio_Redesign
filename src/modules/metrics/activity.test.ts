import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryUserStore } from '@/modules/store/memory';
import { getUserStore } from '@/modules/store';
import { noteCompose, notePdf, notePremium, noteReveal, noteUse } from './activity';

const g = globalThis as unknown as { __cvStudioStore?: unknown };
const counts = async () => {
  const day = new Date().toISOString().slice(0, 10);
  return (await getUserStore().getMetrics(day, day))[0]?.counts ?? {};
};
const record = async (uid: string) =>
  (await getUserStore().listActivity('2000-01-01', 100)).find((a) => a.uid === uid);

beforeEach(() => {
  g.__cvStudioStore = new MemoryUserStore();
});

describe('activity', () => {
  it('records tools by day and never throws', async () => {
    await noteUse('u1', 'cv');
    await noteUse('u1', 'cv');
    await noteUse('u1', 'jobs');
    const a = await record('u1');
    expect(Object.keys(a!.tools).sort()).toEqual(['cv', 'jobs']);
    expect(a!.weeks).toEqual([0]);
  });

  it('counts a replaced first design and the free try', async () => {
    await noteCompose('u2', true);
    expect((await counts()).designer_first_replaced).toBeUndefined();
    await noteCompose('u2', true);
    expect((await counts()).designer_first_replaced).toBe(1);
    const a = await record('u2');
    expect(a!.freeComposeAt).toBeDefined();
  });

  it('counts a PDF after a reveal once, within 24 hours', async () => {
    await notePdf('u3');
    expect((await counts()).makeover_download_24h).toBeUndefined();
    await noteReveal('u3');
    await notePdf('u3');
    await notePdf('u3');
    expect((await counts()).makeover_download_24h).toBe(1);
  });

  it('keeps the first bought pass', async () => {
    await notePremium('u4', new Date('2026-11-01T00:00:00Z'));
    await notePremium('u4', new Date('2026-11-10T00:00:00Z'));
    expect((await record('u4'))!.premiumAt).toBe('2026-11-01T00:00:00.000Z');
  });

  it('is removed with the account', async () => {
    await noteUse('u5', 'cv');
    await getUserStore().deleteUserData('u5');
    expect(await record('u5')).toBeUndefined();
  });
});
