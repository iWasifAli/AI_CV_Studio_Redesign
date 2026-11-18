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

test('every guide opens, its screenshots load, and the steps are numbered', async ({ page }) => {
  const { ARTICLES } = await import('../src/features/learn/articles');
  await page.goto('/how-to');
  await expect(page.getByRole('link', { name: 'Read the guide' })).toHaveCount(ARTICLES.length);
  for (const a of ARTICLES) {
    await page.goto(`/how-to/${a.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: a.title })).toBeVisible();
    await expect(page.locator('ol > li h3')).toHaveCount(a.steps.length);
    for (const s of a.shots) {
      expect((await page.request.get(`/learn/${s.file}.webp`)).status(), s.file).toBe(200);
    }
  }
});
