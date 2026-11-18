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
  // Search narrows the list across topics.
  await page.getByRole('searchbox', { name: 'Search the guides' }).fill('ats');
  await expect(page.getByRole('link', { name: 'Read the guide' }).first()).toBeVisible();
  const found = await page.getByRole('link', { name: 'Read the guide' }).count();
  expect(found).toBeGreaterThan(0);
  expect(found).toBeLessThan(ARTICLES.length);
  await page.getByRole('searchbox', { name: 'Search the guides' }).fill('zzzz');
  await expect(page.getByText('Nothing found for that')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search the guides' }).fill('');
  for (const a of ARTICLES) {
    await page.goto(`/how-to/${a.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: a.title })).toBeVisible();
    await expect(page.locator('ol > li h3')).toHaveCount(a.steps.length);
    await expect(page.locator('video')).toHaveCount(a.video ? 1 : 0);
    if (a.video) expect((await page.request.get(`/videos/${a.video}.mp4`)).status()).toBe(200);
    for (const s of a.shots) {
      expect((await page.request.get(`/learn/${s.file}.webp`)).status(), s.file).toBe(200);
    }
  }
});

test('the home page links to the guides', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'See everything it can do' })).toBeVisible();
  await page.getByRole('link', { name: /Open the guides/ }).click();
  await expect(page).toHaveURL(/\/how-to$/);
});
