import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './support/test';
import { seedDocument } from './support/seed';
import { driver } from '../src/modules/resume/fixtures';

/** Spec §9.3: quantify prompts — ask about a point with no number; add only the person's answer. */

const POINT = 'Plan routes each morning to meet timed delivery slots';
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

test('premium: ask, answer, review and use; only the answer is added; one AI action', async ({
  page,
  isMobile,
}) => {
  await seedDocument(page, driver);
  await page.goto(`/cv/${driver.id}?tab=check`);
  const card = page.getByTestId('quantify');
  await expect(card).toContainText('5 points have no number');
  const item = card.getByRole('listitem').filter({ hasText: POINT });
  await expect(item).toContainText('Work history › Multi-drop Van Driver, Swift Logistics');
  await item.getByRole('button', { name: 'Ask me' }).click();
  const answer = item.getByLabel('About how many times did you do this in a week?');
  await expect(answer).toBeVisible();
  await noSerious(page);
  // Nothing to add until something is answered.
  await expect(item.getByRole('button', { name: 'Add to my point' })).toBeDisabled();
  await answer.fill('about 45 drops a day');
  await item.getByRole('button', { name: 'Add to my point' }).click();
  const review = item.getByTestId('quantify-review');
  await expect(review).toContainText(`${POINT} (about 45 drops a day)`);
  // Change the answer: the point is made again from the new one.
  await review.getByRole('button', { name: 'Change my answers' }).click();
  await answer.fill('about 40 drops a day');
  await item.getByRole('button', { name: 'Add to my point' }).click();
  await expect(review).toContainText(`${POINT} (about 40 drops a day)`);
  await review.getByRole('button', { name: 'Use this' }).click();
  await expect(card.getByTestId('quantify-done')).toContainText('Point updated');
  await expect(card).toContainText('4 points have no number');
  if (!isMobile)
    await expect(preview(page).getByText(`${POINT} (about 40 drops a day)`)).toBeVisible();
  // Asking was one AI action; adding the answers is part of it.
  expect(await aiUsed(page)).toBe(1);
  // Undo puts the old point back.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(card).toContainText('5 points have no number');
});

test('a number nobody gave is shown as a question, never added as fact', async ({ page }) => {
  await seedDocument(page, driver);
  await page.goto(`/cv/${driver.id}?tab=check`);
  const item = page.getByTestId('quantify').getByRole('listitem').filter({ hasText: POINT });
  await item.getByRole('button', { name: 'Ask me' }).click();
  await item
    .getByLabel('About how many times did you do this in a week?')
    .fill('about 30 ZZ-QUANT');
  await item.getByRole('button', { name: 'Add to my point' }).click();
  const review = item.getByTestId('quantify-review');
  await expect(review.locator('mark')).toContainText('add the real number');
  await expect(review).not.toContainText('45');
  await expect(review.locator('[data-needs-input]')).toBeVisible();
});

test('a point changed after asking is not overwritten', async ({ page, isMobile }) => {
  await seedDocument(page, driver);
  await page.goto(`/cv/${driver.id}?tab=check`);
  const card = page.getByTestId('quantify');
  const item = card.getByRole('listitem').filter({ hasText: POINT });
  await item.getByRole('button', { name: 'Ask me' }).click();
  await item.getByLabel('About how many times did you do this in a week?').fill('about 45');
  await item.getByRole('button', { name: 'Add to my point' }).click();
  await expect(item.getByTestId('quantify-review')).toBeVisible();
  // The person edits the point in the form meanwhile.
  await (
    isMobile
      ? page.getByRole('navigation', { name: 'Editor views' }).getByRole('button', { name: 'Edit' })
      : page.getByRole('tab', { name: 'Content' })
  ).click();
  await page
    .getByRole('button', { name: 'Multi-drop Van Driver Swift Logistics', exact: true })
    .click();
  const points = page.getByLabel('What did you do?').first();
  await points.fill((await points.inputValue()).replace(POINT, 'Planned routes every morning'));
  await (
    isMobile
      ? page
          .getByRole('navigation', { name: 'Editor views' })
          .getByRole('button', { name: 'Check' })
      : page.getByRole('tab', { name: 'Check' })
  ).click();
  // The old point is no longer listed; the edited one is.
  await expect(card.getByRole('listitem').filter({ hasText: POINT })).toHaveCount(0);
  await expect(
    card.getByRole('listitem').filter({ hasText: 'Planned routes every morning' }),
  ).toHaveCount(1);
});

test('the API checks what it is given', async ({ page }) => {
  const post = (data: unknown) => page.request.post('/api/quality/quantify', { data });
  expect((await post({ mode: 'ask', point: 'Delivered 120 parcels a day' })).status()).toBe(400);
  expect((await post({ mode: 'insert', point: POINT, answers: [] })).status()).toBe(400);
  expect((await post({ mode: 'other', point: POINT })).status()).toBe(400);
  expect((await post({ mode: 'ask', point: POINT })).status()).toBe(200);
});

test.describe('free account', () => {
  test.use({ as: 'free' });
  test('sees how many points have no number and that questions are Premium', async ({ page }) => {
    await seedDocument(page, driver);
    await page.goto(`/cv/${driver.id}?tab=check`);
    await expect(page.getByTestId('quantify-premium')).toContainText('5 points have no number');
    const ask = await page.request.post('/api/quality/quantify', {
      data: { mode: 'ask', point: POINT },
    });
    expect(ask.status()).toBe(402);
    const add = await page.request.post('/api/quality/quantify', {
      data: { mode: 'insert', point: POINT, answers: [{ question: 'How many?', answer: '45' }] },
    });
    expect(add.status()).toBe(402);
  });
});

test.describe('visitor', () => {
  test.use({ as: 'visitor' });
  test('is asked to sign in; the API refuses', async ({ page }) => {
    await seedDocument(page, driver);
    await page.goto(`/cv/${driver.id}?tab=check`);
    await expect(page.getByTestId('quantify')).toContainText('to get questions for your points');
    const r = await page.request.post('/api/quality/quantify', {
      data: { mode: 'ask', point: POINT },
    });
    expect(r.status()).toBe(401);
  });
});
