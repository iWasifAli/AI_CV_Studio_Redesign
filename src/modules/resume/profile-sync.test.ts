import { describe, expect, it } from 'vitest';
import { driver } from './fixtures';
import { cvFromProfile, makeProfile } from './profile';
import { applyToProfile, profileChanges } from './profile-sync';
import type { ExperienceItem } from './schema';

const profile = makeProfile(driver);
const cv = cvFromProfile(profile);
const exp = cv.sections.find((s) => s.kind === 'experience')!;

function edit(fn: (d: typeof cv) => void) {
  const d = structuredClone(cv);
  fn(d);
  return d;
}

describe('update your profile too', () => {
  it('finds facts edited in the CV that the profile still has as before', () => {
    const now = edit((d) => {
      d.basics.phone = '07700 111222';
      d.basics.summary = 'Tailored summary'; // a CV's own choice: never synced
      const job = d.sections.find((s) => s.id === exp.id)!.items[0] as ExperienceItem;
      job.role = 'Senior Van Driver';
      job.bullets[1] = 'Planned routes for 3 drivers each morning';
    });
    const ch = profileChanges(cv, now, profile);
    expect(ch.map((c) => c.kind)).toEqual(['basics', 'field', 'line']);
    const next = applyToProfile(profile, ch);
    const job = next.sections.find((s) => s.id === exp.id)!.items[0] as ExperienceItem;
    expect(next.basics.phone).toBe('07700 111222');
    expect(next.basics.summary).toBe(profile.basics.summary);
    expect(job.role).toBe('Senior Van Driver');
    expect(job.bullets).toContain('Planned routes for 3 drivers each morning');
    expect(job.bullets).toHaveLength(
      (profile.sections.find((s) => s.id === exp.id)!.items[0] as ExperienceItem).bullets.length,
    );
  });

  it('ignores reordering, items only in the CV, and facts the profile already changed', () => {
    const reordered = edit((d) => {
      const job = d.sections.find((s) => s.id === exp.id)!.items[0] as ExperienceItem;
      job.bullets.reverse();
    });
    // Moving points is a CV's own choice, not an edit of a fact.
    expect(profileChanges(cv, reordered, profile)).toEqual([]);

    const changedProfile = structuredClone(profile);
    changedProfile.basics.phone = 'already new';
    const now = edit((d) => (d.basics.phone = '07700 111222'));
    expect(profileChanges(cv, now, changedProfile)).toEqual([]);
  });
});

describe('new entries', () => {
  it('offers an entry added in a CV to the profile, and adds it there', async () => {
    const { FIXTURES } = await import('./fixtures');
    const profile = structuredClone(FIXTURES.driver);
    const before = structuredClone(profile);
    const now = structuredClone(profile);
    const exp = now.sections.find((s) => s.kind === 'experience')!;
    (exp.items as unknown[]).push({
      id: 'new-job',
      role: 'Night Driver',
      organization: 'Moonlight Couriers',
      location: '',
      start: '2015-01',
      end: '2016-01',
      current: false,
      bullets: ['Night routes'],
    });
    const changes = profileChanges(before, now, profile);
    expect(changes).toEqual([
      expect.objectContaining({ kind: 'item', itemId: 'new-job', label: 'Night Driver' }),
    ]);
    const updated = applyToProfile(profile, changes);
    const items = updated.sections.find((s) => s.id === exp.id)!.items as { id: string }[];
    expect(items.at(-1)!.id).toBe('new-job');
    // Removing an entry from a CV is tailoring, not a fact to sync.
    const fewer = structuredClone(profile);
    fewer.sections.find((s) => s.kind === 'experience')!.items.pop();
    expect(profileChanges(profile, fewer, profile)).toEqual([]);
  });
});
