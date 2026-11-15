'use client';
import { browserRegion } from '@/modules/resume/region';
import { useLang } from '@/i18n/client';

import { isSpecDesign } from '@/modules/design/designs';
import { ops } from '@/modules/resume/ops';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { createDocument } from '@/modules/resume/create';
import { PRESET_IDS, type PresetId } from '@/modules/resume/professions';
import {
  DENSITIES,
  FONT_PAIR_IDS,
  TEMPLATE_IDS,
  type Density,
  type FontPairId,
  type TemplateId,
} from '@/modules/resume/schema';
import { ensureContrast } from '@/modules/templates/color';
import { getRepository } from '@/modules/storage/repository';
import { StudioLoading } from '@/features/studio/with-document';

/** Creates a new CV from a profession preset (and optional design), then opens the guided flow. */
export function CreateDocument() {
  const router = useRouter();
  const params = useSearchParams();
  const done = useRef(false);
  const lang = useLang();

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const work = params.get('work');
    const design = params.get('design');
    const preset: PresetId = PRESET_IDS.includes(work as PresetId) ? (work as PresetId) : 'general';
    // The CV starts in the interface language; the region (from the time zone) sets the paper size.
    const region = browserRegion();
    const locale =
      lang === 'de'
        ? `de-${['DE', 'AT', 'CH', 'LU', 'LI'].includes(region) ? region : 'DE'}`
        : `en-${region}`;
    const doc = createDocument(preset, { locale });
    if (TEMPLATE_IDS.includes(design as TemplateId)) doc.design.templateId = design as TemplateId;
    // From "Describe what you need" (validated; anything unexpected is ignored).
    const accent = params.get('accent');
    if (accent && /^#[0-9a-fA-F]{6}$/.test(accent))
      doc.design.accent = ensureContrast(accent.toLowerCase());
    const font = params.get('font');
    if (FONT_PAIR_IDS.includes(font as FontPairId)) doc.design.fontPair = font as FontPairId;
    const density = params.get('density');
    if (DENSITIES.includes(density as Density)) doc.design.density = density as Density;
    const title = params
      .get('title')
      ?.replace(/[{}<>]/g, '')
      .trim()
      .slice(0, 120);
    if (title) doc.basics.headline = title;
    // A spec-only catalogue design (R7) from the gallery: applied after the colour and spacing.
    const next = design && isSpecDesign(design) ? ops.useDesign(doc, design) : doc;
    getRepository().save(next);
    router.replace(`/cv/${next.id}/guided`);
  }, [params, router, lang]);

  return <StudioLoading />;
}
