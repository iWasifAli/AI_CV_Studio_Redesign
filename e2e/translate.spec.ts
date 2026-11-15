import { expect, test } from './support/test';
import { seedDocument } from './support/seed';
import { driver } from '../src/modules/resume/fixtures';

/** Spec §10.1 Translation: reviewed side by side, saved as a new CV, facts never changed. */

test('Premium: translate a CV, review it beside the original, save it as a new CV', async ({
  page,
}) => {
  await seedDocument(page, driver);
  await page.goto(`/cv/${driver.id}`);
  await page.getByTestId('translate-open').click();
  const dialog = page.getByRole('dialog', { name: 'Translate this CV' });
  await dialog.getByLabel('Translate into').selectOption('de');
  await dialog.getByRole('button', { name: 'Translate' }).click();
  const review = page.getByTestId('translate-review');
  await expect(review).toBeVisible({ timeout: 30_000 });
  // The demo AI marks its text with [GE]; names and numbers come back exactly.
  const summary = review.getByRole('textbox', { name: /^Translation of: / }).nth(1);
  await expect(summary).toHaveValue(/^\[GE\] /);
  await page.getByTestId('translate-create').click();
  await expect(page).not.toHaveURL(new RegExp(driver.id));
  await expect(page).toHaveURL(/\/cv\/[\w-]+$/);
  await expect(page.getByRole('textbox', { name: 'CV name' })).toHaveValue(/\(Deutsch\)$/);
  await expect(page.getByLabel('Full name')).toHaveValue(driver.basics.name);
});

test('the API never changes names, employers or numbers, and keeps what it can’t translate', async ({
  page,
}) => {
  const doc = structuredClone(driver);
  doc.basics.summary = `Driver for 7 years at ${(doc.sections[0]!.items[0] as { organization: string }).organization}. ZZ-DROP`;
  const r = await page.request.post('/api/translate', { data: { document: doc, language: 'fr' } });
  expect(r.status()).toBe(200);
  const j = (await r.json()) as {
    pieces: { id: string; original: string; text: string; kept: boolean }[];
  };
  const s = j.pieces.find((p) => p.id === 'b.summary')!;
  expect(s.kept).toBe(true);
  expect(s.text).toBe('');
  const head = j.pieces.find((p) => p.id === 'b.headline')!;
  expect(head.text).toBe(`[FR] ${driver.basics.headline}`);
  // Every number in the original is still in each translation.
  for (const p of j.pieces.filter((x) => !x.kept))
    for (const n of p.original.match(/\d+/g) ?? []) expect(p.text).toContain(n);
  expect(
    (
      await page.request.post('/api/translate', { data: { document: doc, language: 'xx' } })
    ).status(),
  ).toBe(400);
});

test.describe('free account', () => {
  test.use({ as: 'free' });
  test('translation is Premium', async ({ page }) => {
    await seedDocument(page, driver);
    await page.goto(`/cv/${driver.id}`);
    await page.getByTestId('translate-open').click();
    await expect(page.getByRole('dialog', { name: 'Translate this CV' })).toContainText(
      'Translation is part of Premium',
    );
  });
});
