import { describe, expect, it } from 'vitest';
import { assertSafeZip, MAX_DOCX_UNPACKED } from './extract';

/** A minimal zip with one stored entry that only *claims* `claimed` bytes. */
function zip(claimed: number, entries = 1): Uint8Array {
  const name = new TextEncoder().encode('a.xml');
  const cd = 46 + name.length;
  const out = new Uint8Array(cd * entries + 22);
  const v = new DataView(out.buffer);
  for (let n = 0; n < entries; n++) {
    const o = n * cd;
    v.setUint32(o, 0x02014b50, true);
    v.setUint32(o + 24, claimed, true);
    v.setUint16(o + 28, name.length, true);
    out.set(name, o + 46);
  }
  const e = cd * entries;
  v.setUint32(e, 0x06054b50, true);
  v.setUint16(e + 10, entries, true);
  v.setUint32(e + 16, 0, true);
  return out;
}

describe('assertSafeZip', () => {
  it('accepts an ordinary file', () => expect(() => assertSafeZip(zip(200_000))).not.toThrow());
  it('refuses a file that unpacks to too much', () =>
    expect(() => assertSafeZip(zip(MAX_DOCX_UNPACKED + 1))).toThrow());
  it('refuses a huge number of entries', () =>
    expect(() => assertSafeZip(zip(10, 2500))).toThrow());
  it('refuses a damaged directory', () =>
    expect(() => assertSafeZip(new Uint8Array(40))).toThrow());
});
