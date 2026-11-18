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
