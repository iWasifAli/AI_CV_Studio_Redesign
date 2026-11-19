import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { expect, test } from './support/test';
import { seedDocument } from './support/seed';
import { driver } from '../src/modules/resume/fixtures';

/** Spec §10.1: email signature and business card from the CV. */
test.use({ as: 'free' });

test('signature and card from a CV: preview, copy, and an 85 × 55 mm two-sided PDF', async ({
  page,
}) => {
  await seedDocument(page, driver);
  await page.goto('/presence');
  await page.getByRole('link', { name: 'Make them' }).click();
  await expect(page).toHaveURL(/\/presence\/card$/);
  const sig = page.getByTestId('signature-preview');
  await expect(sig).toContainText(driver.basics.name);
  await expect(sig).toContainText(driver.basics.email);
  await page.getByTestId('card-options').getByLabel('Email').uncheck();
  await expect(sig).not.toContainText(driver.basics.email);
  await page.getByLabel('Your page (for the QR code)').fill('http://bad');
  await expect(page.getByText('Use a full link starting with https://')).toBeVisible();
  await page.getByLabel('Your page (for the QR code)').fill('https://aicvstudio.app/p/imran');
  const card = page.frameLocator('iframe[title^="Business card preview"]');
  await expect(card.getByText('aicvstudio.app/p/imran')).toBeVisible();
  await expect(card.locator('.qr img')).toBeVisible();

  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download the card (PDF)' }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/Business-Card\.pdf$/);
  const pdf = await PDFDocument.load(await readFile((await dl.path())!));
  expect(pdf.getPageCount()).toBe(2);
  const { width, height } = pdf.getPage(0).getSize();
  // 85 × 55 mm in points.
  expect(Math.round(width)).toBe(241);
  expect(Math.round(height)).toBe(156);
});

test('the card API needs an account and a safe link', async ({ page, browser, baseURL }) => {
  const bad = await page.request.post('/api/card', {
    data: { document: driver, options: { url: 'javascript:alert(1)' } },
  });
  expect(bad.status()).toBe(400);
  const ctx = await browser.newContext({ baseURL });
  expect((await ctx.request.post('/api/card', { data: {} })).status()).toBe(401);
  await ctx.close();
});
