'use client';

import { useT } from '@/i18n/client';
import { useEffect, useId, useRef, useState } from 'react';
import { Eraser, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

const W = 600;
const H = 200;

/** Trim transparent edges and scale to at most 600×200, as a PNG data URL (under ~60 KB). */
function finish(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3]! > 16) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return '';
  const pad = 6;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width - 1, x1 + pad);
  y1 = Math.min(height - 1, y1 + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const scale = Math.min(1, W / w, H / h);
  const out = document.createElement('canvas');
  out.width = Math.round(w * scale);
  out.height = Math.round(h * scale);
  out.getContext('2d')?.drawImage(canvas, x0, y0, w, h, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

/**
 * A signature for the declaration: drawn with a finger, pen or mouse, or a photo of a signature
 * on white paper (the white is made transparent). Stored with the CV as a small PNG.
 */
export function SignatureField({
  value,
  onChange,
}: {
  value: string;
  onChange: (dataUrl: string) => void;
}) {
  const t = useT();
  const id = useId();
  const pad = useRef<HTMLCanvasElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const [editing, setEditing] = useState(!value);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = pad.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1b2333';
  }, [editing]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * e.currentTarget.width,
      y: ((e.clientY - r.top) / r.height) * e.currentTarget.height,
    };
  };

  async function upload(f: File) {
    setError(null);
    try {
      if (!/^image\/(png|jpeg|webp)$/.test(f.type))
        throw new Error('Please choose a PNG or JPG image.');
      const bmp = await createImageBitmap(f);
      const c = document.createElement('canvas');
      const scale = Math.min(1, 1200 / bmp.width, 400 / bmp.height);
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close();
      // Paper → transparent, ink → dark.
      const img = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < img.data.length; i += 4) {
        const lum = 0.3 * img.data[i]! + 0.59 * img.data[i + 1]! + 0.11 * img.data[i + 2]!;
        const a = lum > 190 ? 0 : Math.min(255, Math.round((190 - lum) * 2.2));
        img.data[i] = 27;
        img.data[i + 1] = 35;
        img.data[i + 2] = 51;
        img.data[i + 3] = a;
      }
      ctx.putImageData(img, 0, 0);
      const url = finish(c);
      if (!url) throw new Error('No signature found in that picture.');
      onChange(url);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That picture could not be used.');
    }
  }

  return (
    <div className="col-span-2 flex flex-col gap-2" data-testid="signature-field">
      <p id={id} className="text-sm font-semibold">
        {t('Signature')} <span className="text-ink-subtle font-normal">{t('(optional)')}</span>
      </p>
      {!editing && value ? (
        <div className="flex flex-wrap items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
          <img
            src={value}
            alt={t('Your signature')}
            className="border-line h-14 max-w-56 rounded border bg-white object-contain p-1"
          />
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            {t('Sign again')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onChange('')}>
            {t('Remove')}
          </Button>
        </div>
      ) : (
        <>
          <canvas
            ref={pad}
            width={W}
            height={H}
            aria-labelledby={id}
            role="img"
            className="border-line-strong w-full max-w-md touch-none rounded-md border bg-white"
            style={{ aspectRatio: `${W} / ${H}` }}
            data-testid="signature-pad"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drawing.current = true;
              const ctx = e.currentTarget.getContext('2d')!;
              const p = point(e);
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p.x + 0.1, p.y + 0.1);
              ctx.stroke();
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              const ctx = e.currentTarget.getContext('2d')!;
              const p = point(e);
              ctx.lineTo(p.x, p.y);
              ctx.stroke();
            }}
            onPointerUp={(e) => {
              drawing.current = false;
              const url = finish(e.currentTarget);
              if (url) onChange(url);
            }}
          />
          <p className="text-ink-muted text-sm">
            {t(
              'Sign in the box with your finger, a pen or the mouse, or upload a photo of your signature on white paper.',
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              icon={<Eraser aria-hidden size={16} />}
              onClick={() => {
                const c = pad.current;
                c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
                onChange('');
              }}
            >
              {t('Clear')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Upload aria-hidden size={16} />}
              onClick={() => file.current?.click()}
            >
              {t('Upload a picture')}
            </Button>
            {value && (
              <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
                {t('Done')}
              </Button>
            )}
          </div>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = '';
            }}
          />
        </>
      )}
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
