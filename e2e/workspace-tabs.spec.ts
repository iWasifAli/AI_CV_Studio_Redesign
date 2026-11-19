import type { APIRequestContext } from '@playwright/test';
import { expect, test } from './support/test';
import { setConfig } from './support/auth';
import { DEFAULT_CONFIG } from '../src/modules/billing/config';

/** Workspace tabs: several places open at once, each remembering where it was. */
test.describe.configure({ mode: 'serial' });

const ON = { ...DEFAULT_CONFIG, features: { ...DEFAULT_CONFIG.features, workspaceTabs: true } };
const OFF = { ...DEFAULT_CONFIG, features: { ...DEFAULT_CONFIG.features, workspaceTabs: false } };
const on = (r: APIRequestContext, v: boolean) => setConfig(r, v ? ON : OFF);
test.afterAll(async ({ request }) => {
  await setConfig(request, DEFAULT_CONFIG);
});

test('on by default, and the admin switch can turn it off', async ({ page, request }) => {
  expect(DEFAULT_CONFIG.features.workspaceTabs).toBe(true);
  await setConfig(request, DEFAULT_CONFIG);
  await page.goto('/studio');
  await expect(page.getByTestId('tab-strip')).toBeVisible();
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
  await expect(page.getByTestId('tab-strip').locator('[aria-current="page"]')).toContainText(
    'Jobs',
  );

  // Closing the active tab moves to the other one's page.
  await page.getByTestId('tab-strip').getByTestId('tab-close').nth(1).click();
  await expect(page).toHaveURL(/\/studio/);
  await expect(page.getByTestId('tab-strip').getByTestId('tab')).toHaveCount(1);
});

test('unsaved input stays with its own tab through a switch and a reload', async ({
  page,
  request,
}) => {
  await on(request, true);
  await page.goto('/letters/new?type=cover');
  const strip = page.getByTestId('tab-strip');
  await expect(strip).toBeVisible();
  const to = page.getByLabel('Who it’s to').first();
  await expect(to).toBeVisible();
  await to.fill('Acme Ltd');

  // A second tab on the same kind of page starts empty and keeps its own text.
  await strip.getByTestId('tab-new').click();
  await page.goto('/letters/new?type=cover');
  const second = page.getByLabel('Who it’s to').first();
  await expect(second).toHaveValue('');
  await second.fill('Beta Inc');

  // Switching back shows the first tab's text, and the second keeps its own after a reload.
  await strip.getByTestId('tab').nth(0).click();
  await expect(page.getByLabel('Who it’s to').first()).toHaveValue('Acme Ltd');
  await strip.getByTestId('tab').nth(1).click();
  await page.reload();
  await expect(page.getByLabel('Who it’s to').first()).toHaveValue('Beta Inc');

  // Closing the second tab throws its draft away; opening a new one does not bring it back.
  await page.getByTestId('tab-strip').getByTestId('tab-close').nth(1).click();
  await page.getByTestId('tab-strip').getByTestId('tab-new').click();
  await page.goto('/letters/new?type=cover');
  await expect(page.getByLabel('Who it’s to').first()).toHaveValue('');
});

test('slow work finished in a tab you left does not pull you away; the tab shows ready', async ({
  page,
  request,
}) => {
  await on(request, true);
  // Make the save slow enough to leave the tab while it runs.
  await page.route('**/api/letters', async (route) => {
    if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await page.goto('/letters/new?type=cover');
  const strip = page.getByTestId('tab-strip');
  await expect(strip).toBeVisible();
  const form = page.getByRole('form', { name: 'Cover letter' });
  await form.getByLabel('The role you’re applying for').fill('Delivery Driver');
  await form.getByRole('button', { name: 'Write it myself' }).click();

  // Leave for a new tab while it is still working.
  await strip.getByTestId('tab-new').click();
  await expect(page).toHaveURL(/\/studio/);
  await expect(strip.getByTestId('tab-ready')).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/studio/); // still where we are

  // The first tab now opens the finished letter and the badge goes away.
  await strip.getByTestId('tab').nth(0).click();
  await expect(page).toHaveURL(/\/letters\/[\w-]+$/);
  await expect(strip.getByTestId('tab-ready')).toHaveCount(0);

  // A closed tab can be brought back.
  await strip.getByTestId('tab-close').nth(0).click();
  await strip.getByTestId('tab-reopen').click();
  await expect(page).toHaveURL(/\/letters\/[\w-]+$/);
});
