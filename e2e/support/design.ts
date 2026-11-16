import { expect, type Page } from '@playwright/test';

/**
 * Applies a design from the editor's Design tab through "Browse all designs" (catalogue Part A):
 * search for it by name, open its preview and use it. The Design view must already be open.
 */
export async function chooseDesign(page: Page, name: string) {
  await page.getByTestId('browse-designs').click();
  const dialog = page.getByRole('dialog', { name: 'All designs' });
  await dialog.getByTestId('design-search').fill(name);
  const card = dialog.locator(`li[data-design="${name.toLowerCase()}"]`);
  await card.getByRole('button', { name: `Preview ${name}` }).click();
  await page.getByTestId('use-design').click();
  await expect(dialog).toBeHidden();
}
