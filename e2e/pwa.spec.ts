import { expect, test } from './support/test';
import { seedDocument } from './support/seed';
import { driver } from '../src/modules/resume/fixtures';

/** Spec §11.5: installable web app with an offline shell. */
test.use({ as: 'free', serviceWorkers: 'allow' });

test('the manifest makes the studio installable', async ({ page, request }) => {
  const m = (await (await request.get('/manifest.webmanifest')).json()) as {
    name: string;
    start_url: string;
    display: string;
    icons: { src: string; sizes: string; purpose: string }[];
  };
  expect(m).toMatchObject({ name: 'AI CV Studio', display: 'standalone' });
  expect(m.start_url).toMatch(/^\/studio/);
  expect(m.icons.map((i) => `${i.sizes}/${i.purpose}`)).toEqual(
    expect.arrayContaining(['192x192/any', '512x512/any', '512x512/maskable']),
  );
  for (const i of m.icons) expect((await request.get(i.src)).ok()).toBe(true);
  await page.goto('/help');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest/);
  await expect(page.getByTestId('install-app')).toBeVisible();
});

test('pages opened before still open offline; others show the offline page', async ({
  page,
  context,
}) => {
  // Reload is intentional; allow the workspace prompt if a snapshot is still being saved.
  page.on('dialog', (dialog) => {
    if (dialog.type() === 'beforeunload') void dialog.accept();
    else void dialog.dismiss();
  });
  await seedDocument(page, driver);
  await page.goto('/studio');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  // Once the worker controls the page, opened pages are kept.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.goto(`/cv/${driver.id}`);
  await expect(page.getByRole('textbox', { name: 'CV name' })).toHaveValue(driver.title);
  await page.goto('/help');

  await context.setOffline(true);
  await page.goto(`/cv/${driver.id}`);
  await expect(page.getByRole('textbox', { name: 'CV name' })).toHaveValue(driver.title, {
    timeout: 15_000,
  });
  await page.goto('/premium');
  await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible();
  await expect(page.getByRole('link', { name: driver.title })).toBeVisible();
  await context.setOffline(false);
});
