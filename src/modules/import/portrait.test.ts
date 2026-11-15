import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { findPortrait, portraitLike } = await import('./portrait');

const fx = (n: string) => new Uint8Array(readFileSync(join(__dirname, '__fixtures__', n)));
const decode = async (url: string) => {
  expect(url).toMatch(/^data:image\/jpeg;base64,/);
  const buf = Buffer.from(url.split(',')[1]!, 'base64');
  expect(buf.length).toBeLessThan(300_000);
  return sharp(buf).metadata();
};

describe('photo found in an uploaded CV', () => {
  it('knows a portrait from a banner, a speck or a whole scanned page', () => {
    expect(portraitLike(360, 420)).toBe(true);
    expect(portraitLike(600, 90)).toBe(false);
    expect(portraitLike(40, 40)).toBe(false);
    expect(portraitLike(2480, 3508)).toBe(false);
  });

  it('takes the portrait (not the logo) from a text PDF', async () => {
    const url = await findPortrait({
      bytes: fx('cv-with-photo.pdf'),
      kind: 'pdf',
      mime: 'application/pdf',
      scanned: false,
    });
    const m = await decode(url);
    expect([m.width, m.height]).toEqual([480, 480]);
  });

  it('takes the portrait from a Word file', async () => {
    const url = await findPortrait({
      bytes: fx('cv-with-photo.docx'),
      kind: 'docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      scanned: false,
    });
    expect((await decode(url)).width).toBe(480);
  });

  it('cuts the vision box out of a phone photo, and gives nothing without a box', async () => {
    const page = await sharp({
      create: { width: 1000, height: 1400, channels: 3, background: '#ffffff' },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 200, height: 240, channels: 3, background: '#884422' },
          })
            .png()
            .toBuffer(),
          left: 700,
          top: 100,
        },
      ])
      .jpeg()
      .toBuffer();
    const bytes = new Uint8Array(page);
    const url = await findPortrait({
      bytes,
      kind: 'image',
      mime: 'image/jpeg',
      scanned: true,
      box: [71, 700, 243, 900],
    });
    const buf = Buffer.from(url.split(',')[1]!, 'base64');
    const { dominant } = await sharp(buf).stats();
    expect(dominant.r).toBeGreaterThan(dominant.b); // the brown box, not the white page
    expect(await findPortrait({ bytes, kind: 'image', mime: 'image/jpeg', scanned: true })).toBe(
      '',
    );
  });

  it('a CV without pictures gives no photo', async () => {
    expect(
      await findPortrait({
        bytes: fx('two-column.pdf'),
        kind: 'pdf',
        mime: 'application/pdf',
        scanned: false,
      }),
    ).toBe('');
  });
});
