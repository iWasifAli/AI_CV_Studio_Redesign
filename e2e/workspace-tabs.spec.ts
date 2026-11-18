import type { APIRequestContext } from '@playwright/test';
import { expect, test } from './support/test';
import { setConfig } from './support/auth';
import { DEFAULT_CONFIG } from '../src/modules/billing/config';

/** Workspace tabs: several places open at once, each remembering where it was. */
test.describe.configure({ mode: 'serial' });

const ON = { ...DEFAULT_CONFIG, features: { ...DEFAULT_CONFIG.features, workspaceTabs: true } };
const on = (r: APIRequestContext, v: boolean) => setConfig(r, v ? ON : DEFAULT_CONFIG);
test.afterAll(async ({ request }) => {
  await on(request, false);
});

test('off by default: no tab strip', async ({ page, request }) => {
  await on(request, false);
  await page.goto('/studio');
  await expect(page.locator('[data-shell="studio"]')).toBeVisible();
  await expect(page.getByTestId('tab-strip')).toHaveCount(0);
});

test('tabs remember their own page, switch, close and survive a reload', async ({
  page,
  request,
}) => {
  await on(request, true);
  await page.goto('/studio');
  const strip = page.getByTestId('tab-strip');
  await expect(strip).toBeVisible();
  await expect(strip.getByTestId('tab')).toHaveCount(1);

  // A second tab, taken to Jobs; the first stays on Home.
  await strip.getByTestId('tab-new').click();
  await expect(strip.getByTestId('tab')).toHaveCount(2);
  await page.goto('/jobs');
  await expect(strip.getByTestId('tab').nth(1)).toContainText('Jobs');
  await expect(strip.getByTestId('tab').nth(0)).toContainText('Home');

  // Back to the first tab: its page opens. Then the second again.
  await strip.getByTestId('tab').nth(0).click();
  await expect(page).toHaveURL(/\/studio/);
  await strip.getByTestId('tab').nth(1).click();
  await expect(page).toHaveURL(/\/jobs/);

  // Reload keeps both tabs and the active one.
  await page.reload();
  await expect(page.getByTestId('tab-strip').getByTestId('tab')).toHaveCount(2);
  await expect(page.getByTestId('tab-strip').getByRole('tab', { selected: true })).toContainText(
    'Jobs',
  );

  // Closing the active tab moves to the other one's page.
  await page.getByTestId('tab-strip').getByTestId('tab-close').nth(1).click();
  await expect(page).toHaveURL(/\/studio/);
  await expect(page.getByTestId('tab-strip').getByTestId('tab')).toHaveCount(1);
});
