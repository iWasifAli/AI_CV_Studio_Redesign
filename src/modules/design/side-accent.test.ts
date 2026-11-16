import { describe, expect, it } from 'vitest';
import { contrast } from '@/modules/templates/color';
import { composeTemplate, contrastPairs } from './compose';
import { parseSpec } from './spec';

describe('accent text on a pale side fill', () => {
  for (const fill of ['solid', 'tint'] as const)
    for (const accent of ['#0e7c86', '#2f6b4f', '#1e4f7a', '#b4532a', '#6b3a75', '#0f766e'])
      it(`${fill} fill, accent ${accent}: side headings stay at 4.5:1`, () => {
        const spec = parseSpec({
          layout: { type: 'sidebar-left', sideFill: fill },
          headings: { color: 'accent' },
          color: { accent, mode: 'accent' },
        });
        const pair = contrastPairs(spec).find((p) => p.what === 'side heading')!;
        expect(contrast(pair.fg, pair.bg)).toBeGreaterThanOrEqual(4.5);
        // When the page accent had to be darkened for the side column, the side column draws it.
        const css = composeTemplate(spec).css;
        const m = css.match(/\.cv-aside,\.cv-third\{--accent:(#[0-9a-f]{6})/);
        if (m) expect(m[1]).toBe(pair.fg);
      });
});
