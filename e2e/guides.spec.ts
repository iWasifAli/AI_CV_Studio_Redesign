import { expect, test } from './support/test';

test('a profession guide has real content and leads into the studio', async ({ page }) => {
  await page.goto('/cv-for/drivers');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('drivers');
  await expect(page.getByRole('heading', { name: 'What goes on it, in order' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Common mistakes' })).toBeVisible();
  await expect(page).toHaveTitle(/Driver CV guide/);
  await page.getByRole('link', { name: 'Start my CV' }).first().click();
  await expect(page).toHaveURL(/\/start\?work=driver/);
});

test('the guides index lists every guide and unknown slugs 404', async ({ page }) => {
  await page.goto('/cv-for');
  await expect(page.getByRole('link', { name: /Students & first jobs/ })).toBeVisible();
  const res = await page.goto('/cv-for/not-a-real-guide');
  expect(res?.status()).toBe(404);
});
