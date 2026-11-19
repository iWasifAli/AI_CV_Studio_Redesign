import { describe, expect, it } from 'vitest';
import { advertFingerprint } from './advert';
import { applyJobPatch } from './server';
import { jobInput, type Job } from './schema';

describe('report advert provenance', () => {
  it('identifies the exact advert including whitespace and case', async () => {
    expect(await advertFingerprint('Advert')).toHaveLength(64);
    expect(await advertFingerprint('Advert')).toBe(await advertFingerprint('Advert'));
    expect(await advertFingerprint('Advert')).not.toBe(await advertFingerprint('advert'));
    expect(await advertFingerprint('Advert')).not.toBe(await advertFingerprint('Advert '));
  });
  it('invalidates saved matches only when the advert changes', () => {
    const job: Job = {
      ...jobInput.parse({ title: 'Driver', advert: 'Old advert' }),
      id: 'j',
      createdAt: '',
      updatedAt: '',
      match: { at: '', sourceTitle: 'CV', summary: '', requirements: [], keywords: [] },
    };
    expect(applyJobPatch(job, { notes: 'A note' })).toHaveProperty('match', job.match);
    expect(applyJobPatch(job, { advert: 'New advert' })).not.toHaveProperty('match');
  });
});
