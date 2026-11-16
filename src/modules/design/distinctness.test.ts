import { describe, expect, it } from 'vitest';
import { DESIGN_IDS } from '@/modules/resume/ids';
import { DEFAULT_CONFIG } from '@/modules/billing/config';
import accepted from './distinctness-accepted.json';
import { designSpec } from './catalogue';
import { FIXTURES } from '@/modules/resume/fixtures';
import {
  THRESHOLD,
  distance,
  nearestPairs,
  pairKey,
  signature,
  specSignature,
} from './distinctness';

describe('distinctness', () => {
  it('colour and font do not change the signature', () => {
    const s = designSpec('margin', FIXTURES.teacher.design);
    const recoloured = {
      ...s,
      color: { ...s.color, accent: '#aa0000', mode: 'duo' as const },
      type: { ...s.type, pair: 'classic' as const },
    };
    expect(distance(specSignature(s), specSignature(recoloured))).toBe(0);
  });

  it('a graphic copy with other ornaments (frame, artwork, markers) is flagged', () => {
    expect(distance(signature('terra'), signature('copper'))).toBeLessThan(THRESHOLD);
    expect(distance(signature('violet'), signature('tangerine'))).toBeLessThan(THRESHOLD);
  });

  it('a design is identical to itself and differs from others', () => {
    expect(distance(signature('neon'), signature('neon'))).toBe(0);
    expect(distance(signature('neon'), signature('clarity'))).toBeGreaterThan(0.8);
  });

  it('no two live designs are closer than the threshold, unless the owner accepted the pair', () => {
    const live = DESIGN_IDS.filter(
      (id) => DEFAULT_CONFIG.designs.find((d) => d.id === id)?.enabled,
    );
    const ok = new Set(accepted.map((p) => pairKey(p.a, p.b)));
    const tooClose = nearestPairs(live)
      .filter((p) => p.distance < THRESHOLD && !ok.has(pairKey(p.a, p.b)))
      .map((p) => `${p.a}~${p.b} ${p.distance}`);
    expect(tooClose).toEqual([]);
  });

  it('every listed pair is decided or awaiting the owner, still exists and is still close', () => {
    for (const p of accepted) {
      expect(['accepted', 'awaiting']).toContain(p.decision);
      if (p.decision === 'accepted') expect(p.decidedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(DESIGN_IDS).toContain(p.a);
      expect(DESIGN_IDS).toContain(p.b);
      expect(distance(signature(p.a as never), signature(p.b as never))).toBeLessThan(THRESHOLD);
    }
  });
});
