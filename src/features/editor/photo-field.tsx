'use client';

import { useT } from '@/i18n/client';
import { useEffect, useId, useRef, useState } from 'react';
import { Eye, EyeOff, ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ops } from '@/modules/resume/ops';
import { getTemplate } from '@/modules/templates/registry';
import type { DocumentEditor } from './use-document-editor';
import { loadOriginal, saveOriginal, shrinkForKeeping } from './photo-originals';

const SIZE = 480;

export type Crop = { zoom: number; x: number; y: number };
/** Default framing: centred, biased upwards for portraits (faces sit in the upper part). */
export const DEFAULT_CROP: Crop = { zoom: 1, x: 0.5, y: 0.38 };

function checkFile(file: File) {
  if (!/^image\/(jpeg|png|webp|heic|heif|gif)$/i.test(file.type))
    throw new Error('Please choose a photo (JPG, PNG or WebP).');
  if (file.size > 15_000_000)
    throw new Error('This photo is too large. Please choose one under 15 MB.');
}

/**
 * Crops a square from the image: zoom 1 = the largest square, up to 3 = a third of it;
 * x/y (0–1) place the square within the free space. Resized and compressed in the browser.
 */
export function cropToDataUrl(bitmap: ImageBitmap | HTMLImageElement, crop: Crop): string {
  const w = bitmap.width;
  const h = bitmap.height;
  const side = Math.min(w, h) / Math.min(3, Math.max(1, crop.zoom));
  const sx = (w - side) * Math.min(1, Math.max(0, crop.x));
  const sy = (h - side) * Math.min(1, Math.max(0, crop.y));
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not process this photo.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE);
  let quality = 0.86;
  let url = canvas.toDataURL('image/jpeg', quality);
  while (url.length > 300_000 && quality > 0.5) {
    quality -= 0.08;
    url = canvas.toDataURL('image/jpeg', quality);
  }
  return url;
}

/** Crop to a square, resize and compress in the browser. Nothing is uploaded anywhere. */
export async function imageFileToDataUrl(file: File, crop: Crop = DEFAULT_CROP): Promise<string> {
  checkFile(file);
  const bitmap = await createImageBitmap(file);
  const url = cropToDataUrl(bitmap, crop);
  bitmap.close();
  return url;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="text-ink-muted w-20 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-primary w-full max-w-56"
      />
    </label>
  );
}

export function PhotoField({ editor }: { editor: DocumentEditor }) {
  const t = useT();
  const { doc, update } = editor;
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The picture the framing is cut from: the original chosen on this device (kept in IndexedDB),
  // or, without it, the saved photo itself (then zooming in only).
  const original = useRef<ImageBitmap | null>(null);
  const originalBlob = useRef<Blob | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [fromSaved, setFromSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photo = doc.basics.photo;
  const supports = getTemplate(doc.design.templateId).photo !== 'none';
  const hidden = doc.design.options.showPhoto === false;

  // Reopened editor: find this photo's original on this device, or frame the saved photo.
  useEffect(() => {
    if (!photo || original.current) return;
    let cancelled = false;
    void (async () => {
      try {
        const kept = await loadOriginal(photo);
        const blob = kept?.blob ?? (await (await fetch(photo)).blob());
        const bitmap = await createImageBitmap(blob);
        if (cancelled || original.current) return bitmap.close();
        original.current = bitmap;
        originalBlob.current = blob;
        setFromSaved(!kept);
        setCrop(kept?.crop ?? { zoom: 1, x: 0.5, y: 0.5 });
      } catch {
        // No framing controls; the photo still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photo]);

  function keep(url: string, next: Crop) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (originalBlob.current) void saveOriginal(url, originalBlob.current, next);
    }, 300);
  }

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      checkFile(file);
      const bitmap = await createImageBitmap(file);
      original.current?.close();
      original.current = bitmap;
      originalBlob.current = await shrinkForKeeping(bitmap);
      setFromSaved(false);
      setCrop(DEFAULT_CROP);
      const url = cropToDataUrl(bitmap, DEFAULT_CROP);
      keep(url, DEFAULT_CROP);
      update((d) =>
        ops.setDesign(ops.updateBasics(d, { photo: url }), { options: { showPhoto: true } }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not use this photo.');
    } finally {
      setBusy(false);
    }
  }

  function reframe(next: Crop) {
    setCrop(next);
    if (!original.current) return;
    const url = cropToDataUrl(original.current, next);
    keep(url, next);
    update((d) => ops.updateBasics(d, { photo: url }));
  }

  return (
    <div className="flex flex-col gap-2">
      <p id={`${id}-label`} className="text-ink text-sm font-semibold">
        {t('Photo')} <span className="text-ink-subtle font-normal">{t('(optional)')}</span>
      </p>
      <div className="flex items-center gap-4">
        <div className="border-line bg-sunken text-ink-subtle flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
            <img src={photo} alt={t('Your photo')} className="size-full object-cover" />
          ) : (
            <ImagePlus aria-hidden size={24} />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            loadingText={t('Preparing…')}
            onClick={() => input.current?.click()}
            aria-describedby={`${id}-hint`}
          >
            {photo ? t('Change photo') : t('Add a photo')}
          </Button>
          {photo && supports && (
            <Button
              size="sm"
              variant="ghost"
              icon={hidden ? <Eye aria-hidden size={16} /> : <EyeOff aria-hidden size={16} />}
              onClick={() => update((d) => ops.setDesign(d, { options: { showPhoto: hidden } }))}
              data-testid="photo-visibility"
            >
              {hidden ? t('Show on CV') : t('Hide on CV')}
            </Button>
          )}
          {photo && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 aria-hidden size={16} />}
              onClick={() => {
                original.current?.close();
                original.current = null;
                originalBlob.current = null;
                setCrop(null);
                update((d) => ops.updateBasics(d, { photo: '' }));
              }}
            >
              {t('Remove')}
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />
      </div>
      {photo && crop && (
        <fieldset className="flex flex-col gap-1.5" data-testid="photo-crop">
          <legend className="text-ink mb-1 text-sm font-semibold">{t('Frame your photo')}</legend>
          {fromSaved && (
            <p className="text-ink-muted text-sm" data-testid="photo-crop-saved">
              {t(
                'Framing the saved photo: you can zoom in and move it. To zoom out further, choose the original photo again.',
              )}
            </p>
          )}
          <Slider
            label={t('Zoom')}
            value={crop.zoom}
            min={1}
            max={3}
            step={0.05}
            onChange={(zoom) => reframe({ ...crop, zoom })}
          />
          <Slider
            label={t('Left–right')}
            value={crop.x}
            min={0}
            max={1}
            step={0.01}
            onChange={(x) => reframe({ ...crop, x })}
          />
          <Slider
            label={t('Up–down')}
            value={crop.y}
            min={0}
            max={1}
            step={0.01}
            onChange={(y) => reframe({ ...crop, y })}
          />
        </fieldset>
      )}
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {t(error)}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-ink-muted text-sm">
          {photo && !supports
            ? t('This design doesn’t show photos. Pick one marked “Photo” in Design to show it.')
            : photo && hidden
              ? t('Your photo is hidden on the CV. Choose “Show on CV” to bring it back.')
              : t('Some countries expect a photo, others prefer none. It’s saved with this CV.')}
        </p>
      )}
    </div>
  );
}
