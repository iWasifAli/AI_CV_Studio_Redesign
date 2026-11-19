import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support/test';

/** Payment-provider requirements: policies, contact details and at least 7 services are public. */

for (const [path, heading] of [
  ['/privacy', 'Privacy'],
  ['/terms', 'Terms of use'],
  ['/refund', 'Refund and cancellation policy'],
  ['/delivery', 'Service delivery policy'],
  ['/contact', 'Contact us'],
  ['/services', 'Services and prices'],
] as const) {
  test(`${path} is public and accessible`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations).toEqual([]);
  });
}

test('the services page lists at least 8 services with prices', async ({ page }) => {
  await page.goto('/services');
  expect(await page.getByTestId('services-list').locator('li').count()).toBeGreaterThanOrEqual(8);
  await expect(page.getByTestId('services-list')).toContainText('PKR');
});

test('the footer links to every policy', async ({ request }) => {
  // The server-rendered page, so a signed-in test account's redirect cannot hide the footer.
  const html = await (await request.get('/')).text();
  for (const href of ['/privacy', '/terms', '/refund', '/delivery', '/services', '/contact'])
    expect(html).toContain(`href="${href}"`);
});

test('the operator, governing law, complaints and the footer contact are shown', async ({
  page,
  request,
  browser,
}) => {
  const { setConfig } = await import('./support/auth');
  const { DEFAULT_CONFIG } = await import('../src/modules/billing/config');
  await setConfig(request, {
    ...DEFAULT_CONFIG,
    support: {
      ...DEFAULT_CONFIG.support,
      operator: 'Test Operator',
      phone: '+92 300 1234567',
      address: 'House 1, Fateh Jang',
    },
  });
  try {
    await page.goto('/contact');
    await expect(page.getByTestId('operator')).toContainText('Test Operator');
    await expect(page.getByRole('heading', { name: 'Complaints' })).toBeVisible();
    // The footer is for visitors: look at it in a signed-out window.
    const visitor = await browser.newPage();
    await visitor.goto('/contact');
    await expect(visitor.getByTestId('footer-contact')).toContainText('+92 300 1234567');
    await visitor.close();
    await page.goto('/terms');
    await expect(page.getByText('operated by Test Operator')).toBeVisible();
    await expect(page.getByText('governed by the laws of Pakistan')).toBeVisible();
    await page.goto('/refund');
    await expect(page.getByText('applies only when you change your mind')).toBeVisible();
    await page.goto('/privacy');
    await expect(page.getByText(/Last updated/)).toBeVisible();
  } finally {
    await setConfig(request, DEFAULT_CONFIG);
  }
});

test('Premium shows the prices even before sales open', async ({ page }) => {
  await page.goto('/premium');
  await expect(page.getByText(/PKR\s?199/).first()).toBeVisible();
});
