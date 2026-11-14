import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { expect, test } from './support/test';
import { seedDocument } from './support/seed';
import { driver } from '../src/modules/resume/fixtures';

/** Spec §10.1 "Document set export": CV + letter + added documents as one PDF or one ZIP. */

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwHwyBDAYGAG7uB/kFb4G1AAAAAElFTkSuQmCC',
  'base64',
);
async function pdf(pages: number) {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage();
  return Buffer.from(await d.save());
}

test('CV with certificates downloads as a ZIP, in the chosen order', async ({ page }) => {
  await seedDocument(page, driver);
  await page.goto(`/cv/${driver.id}/download`);
  await page.getByTestId('pack-open').click();
  const dialog = page.getByTestId('pack-dialog');
  await expect(dialog).toBeVisible();
  await page.getByTestId('pack-files').setInputFiles([
    { name: 'Licence.png', mimeType: 'image/png', buffer: PNG },
    { name: 'First aid.pdf', mimeType: 'application/pdf', buffer: await pdf(2) },
  ]);
  await expect(page.getByTestId('pack-order')).toHaveText('Your CV → Licence.png → First aid.pdf');
  await page.getByRole('button', { name: 'Move First aid.pdf up' }).click();
  await expect(page.getByTestId('pack-order')).toHaveText('Your CV → First aid.pdf → Licence.png');
  const axe = await new AxeBuilder({ page }).include('[data-testid="pack-dialog"]').analyze();
  expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual(
    [],
  );

  await dialog.getByRole('radio', { name: 'ZIP of separate files' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('pack-download').click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/-Application\.zip$/);
  const zip = await JSZip.loadAsync(await readFile((await dl.path())!));
  const names = Object.keys(zip.files);
  expect(names).toHaveLength(3);
  expect(names[0]).toMatch(/^01-.*-CV\.pdf$/);
  expect(names[1]).toBe('02-First-aid.pdf');
  expect(names[2]).toBe('03-Licence.png');
  await expect(dialog).toBeHidden();
});

test('a saved letter, the CV and a certificate merge into one PDF', async ({ page }) => {
  const created = await page.request.post('/api/letters', {
    data: {
      type: 'thank-you',
      answers: { role: 'Driver', organisation: 'City Buses' },
      paragraphs: ['Thank you for the interview on Monday.'],
    },
  });
  const { letter } = (await created.json()) as { letter: { id: string } };
  const form = {
    document: JSON.stringify(driver),
    format: 'pdf',
    letter: `letter:${letter.id}`,
    files: { name: 'cert.pdf', mimeType: 'application/pdf', buffer: await pdf(3) },
  };
  const r = await page.request.post('/api/pack', { multipart: form });
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toBe('application/pdf');
  const merged = await PDFDocument.load(await r.body());
  // CV (1+ pages) + letter (1 page) + certificate (3 pages).
  expect(merged.getPageCount()).toBeGreaterThanOrEqual(5);

  // Files are checked by their content, not their name.
  const fake = await page.request.post('/api/pack', {
    multipart: {
      document: JSON.stringify(driver),
      format: 'pdf',
      files: { name: 'virus.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ....') },
    },
  });
  expect(fake.status()).toBe(400);
  expect(((await fake.json()) as { error: { message: string } }).error.message).toContain(
    'isn’t a PDF, PNG or JPG',
  );
  // Someone else's letter can't be used.
  const other = await page.request.post('/api/pack', {
    multipart: { document: JSON.stringify(driver), format: 'pdf', letter: 'letter:not-mine' },
  });
  expect(other.status()).toBe(404);
});

test.describe('visitor', () => {
  test.use({ as: 'visitor' });
  test('is asked to sign in', async ({ page }) => {
    const r = await page.request.post('/api/pack', {
      multipart: { document: JSON.stringify(driver), format: 'pdf' },
    });
    expect(r.status()).toBe(401);
  });
});
