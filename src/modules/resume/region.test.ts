import { describe, expect, it } from 'vitest';
import { defaultPageSize } from './create';
import { regionFrom } from './region';

describe('paper size by where the person is (audit F-02)', () => {
  it('uses the time zone before the browser language', () => {
    expect(regionFrom('Asia/Karachi', 'en-US')).toBe('PK');
    expect(regionFrom('Europe/London', 'en-US')).toBe('GB');
    expect(regionFrom('America/Chicago', 'en-US')).toBe('US');
    expect(regionFrom('America/Toronto', 'en-GB')).toBe('CA');
    expect(regionFrom('Asia/Tokyo', 'en-US')).toBe('GB');
    expect(regionFrom(undefined, 'en-US')).toBe('US');
    expect(defaultPageSize(`en-${regionFrom('Asia/Karachi', 'en-US')}`)).toBe('A4');
    expect(defaultPageSize(`en-${regionFrom('America/New_York', 'en-US')}`)).toBe('Letter');
  });
});
