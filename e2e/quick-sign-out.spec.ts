import { expect, test } from './support/test';

test.describe('quick sign-out', () => {
  test.use({ as: 'free' });

  test('one tap from any signed-in page, on desktop and on a phone', async ({ page }, info) => {
    await page.goto('/documents');
    if (info.project.name === 'mobile') {
      await page.getByRole('button', { name: 'Profile menu' }).click();
      await page.getByRole('menuitem', { name: 'Sign out' }).click();
    } else {
      await page.getByTestId('quick-sign-out').click();
    }
    await expect(page).toHaveURL(/\/$/);
    // The visitor home page, not the studio.
    await expect(page.getByRole('heading', { level: 1, name: /Your Studio/ })).toBeVisible();
  });
});
