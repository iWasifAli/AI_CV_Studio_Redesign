import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './support/test';
import { seedDocument } from './support/seed';
import { driver } from '../src/modules/resume/fixtures';
import { ops } from '../src/modules/resume/ops';
import type { ExperienceItem } from '../src/modules/resume/schema';

/** Spec §9.3: proofread the whole CV; each fix accepted one by one. */

const exp = driver.sections.find((s) => s.kind === 'experience')!;
const job = exp.items[0] as ExperienceItem;
const doc = ops.updateItem(driver, exp.id, job.id, {
  bullets: [
    'Recieved around 120 parcels a day and and loaded them in route order',
    'Kept the van clean ZZ-PROOF',
    ...job.bullets.slice(1),
  ],
});
const noSerious = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
    [],
  );
};
const aiUsed = async (page: Page) =>
  (
    (await (await page.request.get('/api/me/entitlements')).json()) as {
      usage: Record<string, number>;
    }
  ).usage['ai.action'] ?? 0;
const preview = (page: Page) =>
  page.locator('iframe[title^="Preview of your CV"]:not([aria-hidden])').contentFrame();

test('premium: proofread, fix one, leave one; nothing invented; Undo puts a fix back', async ({
  page,
  isMobile,
}) => {
  await seedDocument(page, doc);
  await page.goto(`/cv/${doc.id}?tab=check`);
  const panel = page.getByTestId('proofread');
  await panel.getByRole('button', { name: 'Proofread my CV' }).click();
  const result = panel.getByTestId('proofread-result');
  await expect(result).toContainText('2 things to look at');
  const items = result.getByRole('listitem');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Spelling');
  await expect(items.nth(0)).toContainText(`${exp.title} › ${job.role}, ${job.organization}`);
  await expect(items.nth(0).locator('del')).toHaveText('Recieved');
  await expect(items.nth(0).locator('ins')).toHaveText('Received');
  await expect(items.nth(1)).toContainText('Repeated words');
  // The made-up quote and the "fix" that adds a number are never shown.
  await expect(result).not.toContainText('45%');
  await expect(result).not.toContainText('words not on the line');
  expect(await aiUsed(page)).toBe(1);
  await noSerious(page);

  // Fix the spelling: only those words change.
  await items.nth(0).getByRole('button', { name: 'Fix it' }).click();
  await expect(items.nth(0)).toContainText('Fixed. Undo puts it back.');
  await expect(result).toContainText('1 thing to look at');
  if (!isMobile)
    await expect(
      preview(page).getByText(
        'Received around 120 parcels a day and and loaded them in route order',
      ),
    ).toBeVisible();
  // Leave the other one.
  await items.nth(1).getByRole('button', { name: 'Leave it' }).click();
  await expect(items.nth(1)).toContainText('Left as it is.');
  await expect(result).toContainText('All done.');
  // Undo puts the fix back.
  await page.getByRole('button', { name: 'Undo' }).click();
  if (!isMobile)
    await expect(
      preview(page).getByText(
        'Recieved around 120 parcels a day and and loaded them in route order',
      ),
    ).toBeVisible();

  // Proofread again: the person then edits that point before fixing — the fix is not applied.
  await panel.getByRole('button', { name: 'Proofread again' }).click();
  await expect(result).toContainText('2 things to look at');
  await items.nth(0).getByRole('button', { name: 'Show me' }).click();
  const points = page.getByLabel('What did you do?').first();
  await expect(points).toBeVisible();
  const text = await points.inputValue();
  await points.fill(text.replace('Recieved around', 'Took in around'));
  await (
    isMobile
      ? page
          .getByRole('navigation', { name: 'Editor views' })
          .getByRole('button', { name: 'Check' })
      : page.getByRole('tab', { name: 'Check' })
  ).click();
  await panel.getByRole('listitem').nth(0).getByRole('button', { name: 'Fix it' }).click();
  await expect(panel.getByRole('listitem').nth(0)).toContainText(
    'This text has changed since the check',
  );
  expect(await aiUsed(page)).toBe(2);
});

test('a CV with nothing to fix says so', async ({ page }) => {
  await seedDocument(page, driver);
  await page.goto(`/cv/${driver.id}?tab=check`);
  await page.getByTestId('proofread').getByRole('button', { name: 'Proofread my CV' }).click();
  await expect(page.getByTestId('proofread-result')).toContainText(
    /No mistakes found in \d+ lines/,
  );
});

test.describe('free account', () => {
  test.use({ as: 'free' });
  test('sees that proofreading is Premium; the API refuses', async ({ page }) => {
    await seedDocument(page, doc);
    await page.goto(`/cv/${doc.id}?tab=check`);
    await expect(page.getByTestId('proofread-premium')).toBeVisible();
    const r = await page.request.post('/api/quality/proofread', { data: { document: doc } });
    expect(r.status()).toBe(402);
  });
});

test.describe('visitor', () => {
  test.use({ as: 'visitor' });
  test('is asked to sign in; the API refuses', async ({ page }) => {
    await seedDocument(page, doc);
    await page.goto(`/cv/${doc.id}?tab=check`);
    await expect(page.getByTestId('proofread')).toContainText('to proofread your CV');
    const r = await page.request.post('/api/quality/proofread', { data: { document: doc } });
    expect(r.status()).toBe(401);
  });
});
