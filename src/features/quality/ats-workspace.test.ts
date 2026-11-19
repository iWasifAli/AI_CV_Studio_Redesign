import { describe, expect, it } from 'vitest';
import { driver } from '@/modules/resume/fixtures';
import { contentIdentity, pdfIdentity } from './ats-workspace';

describe('compact report snapshots', () => {
  it('keeps photo and long-CV provenance compact while detecting changes', () => {
    const doc = {
      ...driver,
      basics: { ...driver.basics, photo: `data:image/png;base64,${'A'.repeat(100_000)}` },
    };
    expect(contentIdentity(doc).length).toBeLessThan(80);
    expect(pdfIdentity(doc).length).toBeLessThan(80);
    expect(contentIdentity(doc)).not.toBe(
      contentIdentity({ ...doc, basics: { ...doc.basics, photo: `${doc.basics.photo}A` } }),
    );
    expect(contentIdentity(doc)).toBe(contentIdentity({ ...doc, title: 'Renamed' }));
    expect(pdfIdentity(doc)).not.toBe(
      pdfIdentity({ ...doc, design: { ...doc.design, accent: '#112233' } }),
    );
  });
});
