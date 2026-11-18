import { expect, test } from './support/test';

test('the how-to page has three tutorials with captions and steps', async ({ page }) => {
  await page.goto('/how-to');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How to use AI CV Studio');
  await expect(page.locator('video')).toHaveCount(3);
  await expect(page.locator('video track[kind="captions"]')).toHaveCount(3);
  await expect(
    page.getByRole('heading', { name: 'Upload your CV and see it redesigned' }),
  ).toBeVisible();
  for (const v of ['start', 'makeover', 'designs']) {
    const r = await page.request.get(`/videos/${v}.mp4`);
    expect(r.status()).toBe(200);
    expect((await page.request.get(`/videos/${v}.vtt`)).status()).toBe(200);
  }
});
