import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support/test';
import { seedDocument } from './support/seed';
import { driver } from '../src/modules/resume/fixtures';

/**
 * Accessibility sweep over the main pages at the project's width (desktop and phone): no axe
 * violation of any impact on WCAG 2.0/2.1 A and AA rules (follow-up to the independent audit).
 */
const PAGES = [
  '/',
  '/templates',
  '/templates/clarity',
  '/cv-for',
  '/how-to',
  '/cv-for/nurses-and-carers',
  '/start',
  '/cv/import',
  '/makeover',
  '/documents',
  '/jobs',
  '/letters',
  '/premium',
  '/help',
  '/privacy',
  '/terms',
  '/signin',
  `/cv/${driver.id}`,
  `/cv/${driver.id}/guided`,
  `/cv/${driver.id}/download`,
];

test('main pages have no accessibility violations', async ({ page }) => {
  test.setTimeout(240_000);
  await seedDocument(page, driver);
  const found: string[] = [];
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    for (const v of r.violations)
      found.push(
        `${path}: ${v.id} (${v.impact}) ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
      );
  }
  expect(found).toEqual([]);
});
