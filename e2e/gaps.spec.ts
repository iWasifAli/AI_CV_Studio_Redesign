import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './support/test';
import { seedDocument } from './support/seed';
import { driver } from '../src/modules/resume/fixtures';
import type { ResumeDocument } from '../src/modules/resume/schema';

/** Spec §9.3 "Explain a gap": breaks over six months, the person's answer, calm wording. */

function withGap(id: string): ResumeDocument {
  const d = structuredClone(driver) as ResumeDocument;
  d.id = id;
  d.sections = [
    {
      id: 'exp',
      kind: 'experience',
      title: 'Experience',
      hidden: false,
      items: [
        {
          id: 'j2',
          role: 'Delivery Driver',
          organization: 'Swift Logistics',
          location: 'Leicester',
          start: '2023-05',
          end: '',
          current: true,
          bullets: ['Delivered parcels on time'],
        },
        {
          id: 'j1',
          role: 'Van Driver',
          organization: 'City Couriers',
          location: 'Leicester',
          start: '2018-02',
          end: '2022-01',
          current: false,
          bullets: ['Drove routes across the city'],
        },
      ],
    },
  ] as ResumeDocument['sections'];
  return d;
}

async function openCheck(page: Page, doc: ResumeDocument) {
  await seedDocument(page, doc);
  await page.goto(`/cv/${doc.id}?tab=check`);
  await expect(page.getByTestId('gaps')).toBeVisible({ timeout: 15_000 });
}
// Phones show the preview on its own tab: count the entry there only on desktop.
const roles = (page: Page) =>
  test.info().project.name === 'mobile'
    ? Promise.resolve(-1)
    : page
        .frameLocator('iframe[data-active][title^="Preview of your CV"]')
        .first()
        .getByText('Career break', { exact: true })
        .count();

test.describe('free account', () => {
  test.use({ as: 'free' });
  test('a gap is found; simple wording is added as a career break and undone', async ({ page }) => {
    await openCheck(page, withGap('gap-free'));
    const gap = page.getByTestId('gap');
    await expect(gap).toHaveCount(1);
    await expect(gap).toContainText('Feb 2022 – Apr 2023');
    await expect(gap).toContainText('Between Van Driver at City Couriers and Delivery Driver');
    // No AI on the free plan: the simple wording is offered.
    await expect(gap.getByRole('button', { name: 'Suggest wording' })).toBeDisabled();
    await gap.getByText('Caring for family').click();
    await gap.getByLabel('In a few words (optional)').fill('looked after my father');
    await gap.getByRole('button', { name: 'Suggest wording' }).click();
    const cvLine = page.getByTestId('gap-wording').getByRole('textbox');
    await expect(cvLine).toHaveValue(
      'Career break to care for a family member: looked after my father',
    );
    const axe = await new AxeBuilder({ page }).include('[data-testid="gaps"]').analyze();
    expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual(
      [],
    );
    await expect.poll(() => roles(page)).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Add as a career break' }).click();
    await expect(page.getByTestId('gap-added')).toBeVisible();
    await expect(page.getByTestId('gap')).toHaveCount(0);
    await expect.poll(() => roles(page)).not.toBe(0);
    await page.keyboard.press('Control+z');
    await expect.poll(() => roles(page)).toBeLessThanOrEqual(0);
    await expect(page.getByTestId('gap')).toHaveCount(1);
  });

  test('the API needs an AI allowance', async ({ page }) => {
    const r = await page.request.post('/api/coach/gap', {
      data: { reason: 'travel', answer: 'Travelled', length: 'about 9 months' },
    });
    expect(r.status()).toBe(402);
  });
});

test('Premium: AI wording uses only the answer and keeps health private', async ({ page }) => {
  await openCheck(page, withGap('gap-premium'));
  const gap = page.getByTestId('gap');
  await gap.getByText('Study or training').click();
  await gap.getByLabel('In a few words (optional)').fill('evening bookkeeping course');
  await gap.getByRole('button', { name: 'Suggest wording' }).click();
  await expect(page.getByTestId('gap-wording').getByRole('textbox')).toHaveValue(
    /evening bookkeeping course/,
  );
  await expect(page.getByTestId('gap-interview')).toContainText('ready for my next role');

  const health = await page.request.post('/api/coach/gap', {
    data: { reason: 'health', answer: 'Cancer treatment', length: 'about 9 months' },
  });
  const h = (await health.json()) as { cvLine: string };
  expect(h.cvLine).not.toMatch(/cancer/i);
  // An invented fact is caught by the truth guard.
  const made = await page.request.post('/api/coach/gap', {
    data: { reason: 'other', answer: 'Moved house ZZ-GAP', length: 'about 9 months' },
  });
  const m = (await made.json()) as { cvLine: string; findings: number };
  expect(m.findings).toBeGreaterThan(0);
  expect((await page.request.post('/api/coach/gap', { data: { reason: 'nope' } })).status()).toBe(
    400,
  );
});
