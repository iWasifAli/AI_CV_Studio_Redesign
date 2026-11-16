import { expect, test } from './support/test';
import { seedDocument } from './support/seed';
import { driver } from '../src/modules/resume/fixtures';

/** Gap audit S-01: edit the CV by instruction, with every change reviewed first and one Undo. */
test('ask AI to edit: review changes, untick one, apply in one step, undo', async ({ page }) => {
  const doc = { ...structuredClone(driver), id: 'edit-instruction' };
  await seedDocument(page, doc);
  await page.goto(`/cv/${doc.id}`);
  const box = page.getByTestId('edit-by-instruction');
  await box
    .getByTestId('edit-instruction')
    .fill('Make my profile shorter, put Education first and add my award');
  await box.getByTestId('edit-run').click();
  const changes = box.getByTestId('edit-changes');
  await expect(changes.getByRole('checkbox')).toHaveCount(2);
  await expect(box.getByTestId('edit-not-done')).toContainText('award');
  await expect(changes).toContainText('Profile');

  // Keep the shorter profile, leave the section order as it is.
  const boxes = changes.getByRole('checkbox');
  await boxes.nth(1).uncheck();
  await box.getByRole('button', { name: 'Apply the ticked changes' }).click();

  const stored = () =>
    page.evaluate(
      (k) => JSON.parse(localStorage.getItem(`cvstudio:v1:doc:${k}`)!),
      doc.id,
    ) as Promise<typeof doc>;
  await expect.poll(async () => (await stored()).basics.summary).not.toBe(driver.basics.summary);
  const after = await stored();
  expect(driver.basics.summary.startsWith(after.basics.summary.replace(/\.$/, ''))).toBe(true);
  expect(after.sections.map((s) => s.id)).toEqual(driver.sections.map((s) => s.id));

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await stored()).basics.summary).toBe(driver.basics.summary);
});
