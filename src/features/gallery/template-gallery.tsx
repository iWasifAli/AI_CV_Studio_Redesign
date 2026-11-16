'use client';

import { designLabel } from '@/modules/design/lifecycle';
import { useT } from '@/i18n/client';
import { useEffect, useMemo, useState } from 'react';
import type { DesignMeta } from '@/modules/design/designs';
import { DESIGNS } from '@/modules/design/designs';
import { FIXTURES, PHOTO_FOR, withPhoto } from '@/modules/resume/fixtures';
import { ops } from '@/modules/resume/ops';
import type { DesignId, ResumeDocument } from '@/modules/resume/schema';
import { getRepository } from '@/modules/storage/repository';
import { DesignBrowser } from './design-browser';

/** Example CVs the gallery can show when the visitor has none of their own. */
export const SAMPLES = {
  driver: { label: 'Driver', doc: FIXTURES.driver },
  teacher: { label: 'Teacher', doc: FIXTURES.teacher },
  graduate: { label: 'Graduate', doc: FIXTURES.graduate },
  engineer: { label: 'Engineer', doc: FIXTURES.engineer },
} as const;
export type SampleId = keyof typeof SAMPLES;

/** A CV shown in a design: the sample (with a sample photo when the design has one) or the person's own. */
export function inDesign(doc: ResumeDocument, id: DesignId, sample?: string): ResumeDocument {
  const meta = DESIGNS.find((d) => d.id === id)!;
  const base = sample && meta.photo ? withPhoto(doc, PHOTO_FOR[sample] ?? 'a') : doc;
  return ops.useDesign(base, id);
}

/** "ATS-friendly" designs read cleanly as they are; the others come with a plain ATS version. */
export function onlineSafe(d: DesignMeta): boolean {
  return designLabel(d) === 'ats';
}

/** "Show with": the person's own CVs on this device, then the samples. */
export function useShowWith() {
  const [own, setOwn] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    const list = getRepository()
      .list()
      .slice(0, 5)
      .map((c) => ({ id: c.id, label: c.title || c.name || 'My CV' }));
    // Read once from this device's storage after mount (not available during server render).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser storage
    setOwn(list);
  }, []);
  return own;
}

export function TemplateGallery({ seed }: { seed?: number } = {}) {
  const tx = useT();
  const own = useShowWith();
  const [show, setShow] = useState<string>('sample:teacher');

  // Default to the person's newest CV once it is known.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follow the one-time storage read
    if (own[0]) setShow(`own:${own[0].id}`);
  }, [own]);

  const { base, sample, label } = useMemo(() => {
    if (show.startsWith('own:')) {
      const doc = getRepository().get(show.slice(4));
      if (doc) return { base: doc, sample: undefined, label: 'your CV' };
    }
    const k = (show.split(':')[1] ?? 'teacher') as SampleId;
    const s = SAMPLES[k] ?? SAMPLES.teacher;
    return { base: s.doc, sample: k, label: `an example ${s.label.toLowerCase()} CV` };
  }, [show]);
  const cv = show.startsWith('own:') ? show.slice(4) : null;

  return (
    <DesignBrowser
      base={base}
      sample={sample}
      label={label}
      preset={base.presetId ?? null}
      seed={seed}
      hrefFor={(id, theme) => {
        const q = new URLSearchParams();
        if (cv) q.set('cv', cv);
        if (theme !== 'own') q.set('theme', theme);
        const s = q.toString();
        return `/templates/${id}${s ? `?${s}` : ''}`;
      }}
      extra={
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {tx('Show the designs with')}
          <select
            value={show}
            onChange={(e) => setShow(e.target.value)}
            className="border-line-strong bg-surface min-h-11 rounded-md border px-3 text-[15px] font-normal"
          >
            {own.map((c) => (
              <option key={c.id} value={`own:${c.id}`}>
                {tx('My CV: {label}', { label: c.label })}
              </option>
            ))}
            {(Object.keys(SAMPLES) as SampleId[]).map((k) => (
              <option key={k} value={`sample:${k}`}>
                {tx('An example {v} CV', { v: SAMPLES[k].label.toLowerCase() })}
              </option>
            ))}
          </select>
        </label>
      }
    />
  );
}
