import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseConfig } from '@/modules/billing/config';
import { canUseDesign } from '@/modules/billing/gate';
import { filterEntries } from '@/features/admin/design-catalogue';
import { DESIGN_IDS } from '@/modules/resume/ids';
import { FIXTURES } from '@/modules/resume/fixtures';
import { candidateSpecs, nearestCatalogue } from './designer';
import { designSpec } from './catalogue';
import { DESIGN_TAGS, designLabel, isLive, keepsWorking, normaliseEntry } from './lifecycle';

describe('design lifecycle', () => {
  it('older entries get a status from the on/off switch, default tags and a date', () => {
    const on = normaliseEntry({ id: 'neon', enabled: true, tier: 'free' });
    expect(on).toMatchObject({ status: 'live', enabled: true, isNew: false });
    expect(on.tags).toContain('creative');
    expect(on.addedAt).toBe('2026-11-15');
    expect(normaliseEntry({ id: 'clarity', enabled: false, tier: 'free' }).status).toBe('draft');
  });

  it('status and the switch stay in step; an older editor flipping the switch wins', () => {
    expect(
      normaliseEntry({ id: 'clarity', enabled: false, tier: 'free', status: 'retired' }),
    ).toMatchObject({ status: 'retired', enabled: false });
    expect(
      normaliseEntry({ id: 'clarity', enabled: true, tier: 'free', status: 'retired' }),
    ).toMatchObject({ status: 'live', enabled: true });
    expect(
      normaliseEntry({ id: 'clarity', enabled: false, tier: 'free', status: 'live' }),
    ).toMatchObject({ status: 'draft', enabled: false });
  });

  it('every design has tags from the list and a label', () => {
    for (const id of DESIGN_IDS) {
      const e = normaliseEntry({ id, enabled: true, tier: 'free' });
      expect(e.tags.length, id).toBeGreaterThan(0);
      for (const t of e.tags) expect(DESIGN_TAGS).toContain(t);
      expect(['ats', 'creative']).toContain(designLabel(id));
    }
    expect(designLabel('neon')).toBe('creative');
    expect(designLabel('clarity')).toBe('ats');
  });

  it('a stored config from before keeps working and gains the new fields', () => {
    const old = structuredClone(DEFAULT_CONFIG) as unknown as { designs: object[] };
    old.designs = DESIGN_IDS.map((id) => ({ id, enabled: id !== 'terra', tier: 'free' }));
    const cfg = parseConfig(old);
    expect(cfg.designs.find((d) => d.id === 'terra')).toMatchObject({ status: 'draft' });
    expect(cfg.designs.find((d) => d.id === 'neon')).toMatchObject({ status: 'live' });
  });

  it('a retired design still downloads for CVs that use it; a draft does not', () => {
    const cfg = structuredClone(DEFAULT_CONFIG);
    const set = (status: 'retired' | 'draft') =>
      (cfg.designs = cfg.designs.map((d) =>
        d.id === 'terra' ? normaliseEntry({ ...d, status, enabled: false }) : d,
      ));
    set('retired');
    expect(canUseDesign('free', cfg, 'terra').ok).toBe(true);
    expect(isLive(cfg.designs.find((d) => d.id === 'terra'))).toBe(false);
    set('draft');
    expect(canUseDesign('free', cfg, 'terra').ok).toBe(false);
    expect(keepsWorking(cfg.designs.find((d) => d.id === 'terra'))).toBe(false);
  });

  it('the AI Designer never starts from a design that is not offered', () => {
    const current = FIXTURES.teacher.design;
    const offered = (id: string) => id !== 'heritage';
    const list = candidateSpecs(
      [{ name: 'X', explanation: 'x', startFrom: 'heritage', choices: {}, unmet: [] }] as never,
      current,
      { offered },
    );
    expect(list[0]!.startFrom).not.toBe('heritage');
    expect(nearestCatalogue(designSpec('heritage', current), current, offered)).not.toBe(
      'heritage',
    );
  });

  it('admin filter: text, status and tag', () => {
    const list = DESIGN_IDS.map((id) =>
      normaliseEntry({ id, enabled: id !== 'ruby', tier: 'free' }),
    );
    expect(
      filterEntries(list, { text: 'terra', status: 'all', tag: 'all' }).map((d) => d.id),
    ).toEqual(['terra']);
    expect(filterEntries(list, { text: '', status: 'draft', tag: 'all' }).map((d) => d.id)).toEqual(
      ['ruby'],
    );
    const academic = filterEntries(list, { text: '', status: 'all', tag: 'academic' });
    expect(academic.every((d) => d.tags.includes('academic'))).toBe(true);
    expect(academic.length).toBeGreaterThan(0);
  });
});
