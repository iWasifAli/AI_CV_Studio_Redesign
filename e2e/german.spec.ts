import { expect, test } from './support/test';
import { seedDocument } from './support/seed';
import { driver } from '../src/modules/resume/fixtures';

const preview = (page: import('@playwright/test').Page) =>
  page.locator('iframe[title]:not([aria-hidden])').first().contentFrame();

test.describe('German', () => {
  test.use({ as: 'visitor' });

  test('the footer switch turns the whole interface German and back', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const sw = page.getByTestId('language-switch').first();
    await sw.getByRole('button', { name: 'Deutsch' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Lebenslauf');
    await expect(page.getByText('Drei Schritte', { exact: false })).toBeVisible();
    // The brand is never translated.
    await expect(page.getByText('KI CV Studio')).toHaveCount(0);
    // Stays German on other pages (cookie).
    await page.goto('/templates');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await page
      .getByTestId('language-switch')
      .first()
      .getByRole('button', { name: 'English' })
      .click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

test.describe('German CV', () => {
  test.use({ as: 'free' });

  test('a new CV made in German has German section names', async ({ page, context, baseURL }) => {
    test.skip(test.info().project.name !== 'desktop', 'Desktop only');
    await context.addCookies([{ name: 'lang', value: 'de', url: baseURL! }]);
    await page.goto('/cv/new?work=driver');
    await page.waitForURL(/\/cv\/[^/]+\/guided/);
    await page.goto(page.url().replace(/\/guided.*$/, ''));
    await expect(page.getByTestId('cv-language')).toHaveValue('de');
  });

  test('switching the CV language changes headings and dates on the CV', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'Form and preview side by side on desktop');
    await seedDocument(page, driver);
    await page.goto(`/cv/${driver.id}`);
    const cv = preview(page);
    await expect(cv.getByText('Present').first()).toBeVisible();
    await page.getByTestId('cv-language').selectOption('de');
    await expect(cv.getByText('heute', { exact: false }).first()).toBeVisible();
    await expect(cv.getByText('Berufserfahrung', { exact: false }).first()).toBeVisible();
    await expect(cv.getByText(/\d{2}\/\d{4}/).first()).toBeVisible();
    await page.getByTestId('cv-language').selectOption('en');
    await expect(cv.getByText('Present').first()).toBeVisible();
  });
});
