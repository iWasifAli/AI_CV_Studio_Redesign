import 'server-only';

/**
 * The person's photo from an uploaded CV (spec §6.2: "a photo in the original is cropped out and
 * offered"). Never invented and never kept on the server: the result goes back in the reply and the
 * person decides whether to use it.
 *  - PDF with text: the images embedded on page 1; the best portrait-like one.
 *  - Word: the pictures in the file; the best portrait-like one.
 *  - Scan or phone photo: the box the vision step reported, cut from the page image.
 * Returns a square JPEG data URL (480 px, under 300 KB) or ''. Any failure gives ''.
 */
const SIZE = 480;
type Raw = {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  channels: number;
};

export type PortraitInput = {
  bytes: Uint8Array;
  kind: string;
  mime: string;
  scanned: boolean;
  /** From the vision step: [ymin, xmin, ymax, xmax] in 0–1000 of the page. */
  box?: number[];
};

async function sharpLib() {
  return (await import('sharp')).default;
}

/** A plausible head-and-shoulders photo: not tiny, not a banner or a page-sized scan. */
export function portraitLike(w: number, h: number): boolean {
  const aspect = w / h;
  if (Math.min(w, h) < 80) return false;
  if (aspect < 0.6 || aspect > 1.4) return false;
  // A whole scanned page (A4/Letter shaped and large) is not a portrait.
  if (Math.max(w, h) > 1400 && Math.abs(aspect - 0.707) < 0.06) return false;
  return true;
}

/** Prefer larger and squarer images. */
function score(w: number, h: number): number {
  const squareness = Math.min(w, h) / Math.max(w, h);
  return Math.min(w, h) * (0.5 + squareness);
}

async function encode(
  input: Buffer | Raw,
  crop?: { left: number; top: number; width: number; height: number },
) {
  const sharp = await sharpLib();
  let img =
    'channels' in input
      ? sharp(Buffer.from(input.data), {
          raw: {
            width: input.width,
            height: input.height,
            channels: input.channels as 1 | 2 | 3 | 4,
          },
        })
      : sharp(input, { failOn: 'none' }).rotate();
  if (crop) img = img.extract(crop);
  for (const quality of [84, 74, 64]) {
    const out = await img
      .clone()
      .resize(SIZE, SIZE, { fit: 'cover', position: 'north' })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (out.length <= 290_000) return `data:image/jpeg;base64,${out.toString('base64')}`;
  }
  return '';
}

/**
 * A picture, not a drawn effect: Chrome and Word store soft shadows, glows and gradients as images
 * too. Those are smooth (low sharpness) and carry little detail (low entropy).
 */
async function photoLike(img: Buffer | Raw): Promise<boolean> {
  const sharp = await sharpLib();
  const s = await (
    'channels' in img
      ? sharp(Buffer.from(img.data), {
          raw: { width: img.width, height: img.height, channels: img.channels as 1 | 2 | 3 | 4 },
        })
      : sharp(img, { failOn: 'none' })
  ).stats();
  return s.sharpness >= 0.6 && s.entropy >= 1.5;
}

async function fromPdf(bytes: Uint8Array): Promise<string> {
  const { extractImages } = await import('unpdf');
  const images = ((await extractImages(new Uint8Array(bytes), 1)) as Raw[])
    .filter((i) => portraitLike(i.width, i.height))
    .sort((a, b) => score(b.width, b.height) - score(a.width, a.height));
  for (const img of images.slice(0, 6)) if (await photoLike(img)) return encode(img);
  return '';
}

async function fromDocx(bytes: Uint8Array): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytes);
  const sharp = await sharpLib();
  let best: { buf: Buffer; s: number } | null = null;
  for (const f of Object.values(zip.files)) {
    if (!/^word\/media\/.+\.(jpe?g|png|webp)$/i.test(f.name)) continue;
    const buf = Buffer.from(await f.async('uint8array'));
    const m = await sharp(buf).metadata();
    if (!m.width || !m.height || !portraitLike(m.width, m.height)) continue;
    if (!(await photoLike(buf))) continue;
    const s = score(m.width, m.height);
    if (!best || s > best.s) best = { buf, s };
  }
  return best ? encode(best.buf) : '';
}

/** Cut the vision box out of a page image, widened a little and made square. */
async function fromBox(page: Buffer | Raw, box: number[]): Promise<string> {
  const sharp = await sharpLib();
  const meta =
    'channels' in page
      ? { width: page.width, height: page.height }
      : await sharp(page, { failOn: 'none' })
          .rotate()
          .metadata()
          .then((m) => ({
            width: m.autoOrient?.width ?? m.width ?? 0,
            height: m.autoOrient?.height ?? m.height ?? 0,
          }));
  if (!meta.width || !meta.height) return '';
  const [ymin, xmin, ymax, xmax] = box as [number, number, number, number];
  let left = (xmin / 1000) * meta.width;
  let top = (ymin / 1000) * meta.height;
  let w = ((xmax - xmin) / 1000) * meta.width;
  let h = ((ymax - ymin) / 1000) * meta.height;
  if (w < 40 || h < 40) return '';
  // Square around the box, keeping the top (the face) in view.
  const side = Math.min(Math.max(w, h) * 1.04, meta.width, meta.height);
  left = Math.max(0, Math.min(meta.width - side, left + w / 2 - side / 2));
  top = Math.max(0, Math.min(meta.height - side, top + h / 2 - side / 2));
  w = h = side;
  return encode(page, {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.floor(w),
    height: Math.floor(h),
  });
}

export async function findPortrait(input: PortraitInput): Promise<string> {
  try {
    const work = (async () => {
      if (input.kind === 'docx') return fromDocx(input.bytes);
      if (input.mime === 'application/pdf') {
        if (!input.scanned) return fromPdf(input.bytes);
        if (!input.box?.length) return '';
        const { extractImages } = await import('unpdf');
        const page = ((await extractImages(new Uint8Array(input.bytes), 1)) as Raw[]).sort(
          (a, b) => b.width * b.height - a.width * a.height,
        )[0];
        return page ? fromBox(page, input.box) : '';
      }
      if (/^image\/(jpeg|png|webp)$/.test(input.mime) && input.box?.length)
        return fromBox(Buffer.from(input.bytes), input.box);
      return '';
    })();
    const timeout = new Promise<string>((resolve) => setTimeout(() => resolve(''), 6_000));
    return await Promise.race([work, timeout]);
  } catch (e) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        area: 'import',
        event: 'portrait_failed',
        reason: String(e).slice(0, 200),
      }),
    );
    return '';
  }
}
