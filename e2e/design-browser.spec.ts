import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/test';
import { seedDocument } from './support/seed';
import { ops } from '../src/modules/resume/ops';
import { teacher } from '../src/modules/resume/fixtures';

/** Catalogue task, Parts A and B: the Design tab, the full design browser, favourites, compare. */

async function openEditor(page: Page, id: string, design: Parameters<typeof ops.useDesign>[1]) {
  const doc = ops.useDesign({ ...teacher, id }, design);
  await seedDocument(page, doc);
  await page.goto(`/cv/${id}`);
  await designView(page);
  return doc;
}

/** Desktop: the Design tab; phone: the Design button in the bottom bar. */
async function designView(page: Page) {
  const tab = page.getByRole('tab', { name: 'Design' });
  const bar = page.getByRole('navigation', { name: 'Editor views' }).getByRole('button', {
    name: 'Design',
  });
  await expect(tab.or(bar).first()).toBeVisible();
  if (await bar.isVisible()) await bar.click();
  else await tab.click();
}

const storedDesign = (page: Page, id: string) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(`cvstudio:v1:doc:${k}`)!).design, id);

test('Design tab: at most 8 thumbnails; open, filter, preview and apply in 4 taps; one Undo', async ({
  page,
  isMobile,
}) => {
  await openEditor(page, 'browser-apply', 'clarity');
  const list = page.getByTestId('design-shortlist');
  await expect(list.getByTestId('current-design')).toContainText('Clarity');
  const thumbs = await list.locator('img').count();
  expect(thumbs).toBeLessThanOrEqual(8);
  await expect(list.getByText('Recommended for you')).toBeVisible();

  let taps = 0;
  const tap = async (l: Locator) => {
    taps++;
    await l.click();
  };
  await tap(page.getByTestId('browse-designs'));
  const dialog = page.getByRole('dialog', { name: 'All designs' });
  await expect(dialog.getByTestId('design-grid').locator('li').first()).toBeVisible();
  await tap(
    dialog
      .getByRole('group', { name: 'Mood and occasion' })
      .getByRole('button', { name: 'Academic' }),
  );
  const cards = dialog.getByTestId('design-grid').locator('li[data-design]');
  await expect(cards.first()).toBeVisible();
  const first = await cards.first().getAttribute('data-design');
  await tap(cards.first().getByRole('button', { name: /^Preview / }));
  const preview = page.getByRole('dialog').filter({ has: page.getByTestId('design-preview') });
  await expect(
    preview
      .getByTestId('design-preview')
      .locator('iframe[data-active]')
      .contentFrame()
      .locator('h1'),
  ).toContainText('Grace');
  await tap(preview.getByTestId('use-design'));
  expect(taps).toBeLessThanOrEqual(4);

  // Applied: the shortlist shows it as current; the words are unchanged.
  await expect(page.getByTestId('current-design')).not.toContainText('Clarity');
  await expect
    .poll(async () => {
      const d = await storedDesign(page, 'browser-apply');
      return d.v2?.designId ?? d.templateId;
    })
    .toBe(first);
  if (isMobile) await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(
    page.locator('iframe[data-active]').first().contentFrame().locator('h1'),
  ).toContainText('Grace');
  if (isMobile) await designView(page);

  // One Undo puts the previous design back.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('current-design')).toContainText('Clarity');
});

test('colour themes recolour the preview and are applied with the design', async ({ page }) => {
  await openEditor(page, 'browser-theme', 'clarity');
  await page.getByTestId('browse-designs').click();
  const dialog = page.getByRole('dialog', { name: 'All designs' });
  await dialog.getByTestId('design-search').fill('terra');
  const card = dialog.locator('li[data-design="terra"]');
  await card.getByRole('radio', { name: 'Forest' }).click();
  await expect(card.getByRole('radio', { name: 'Forest' })).toHaveAttribute('aria-checked', 'true');
  await card.getByRole('button', { name: /^Preview / }).click();
  const frame = page.getByTestId('design-preview').locator('iframe[data-active]').contentFrame();
  await expect
    .poll(() => frame.locator('style').evaluateAll((s) => s.map((x) => x.textContent).join('')))
    .toContain('--g-ink:#183a2c');
  await page.getByTestId('use-design').click();
  await expect
    .poll(() => storedDesign(page, 'browser-theme'))
    .toMatchObject({ templateId: 'terra', accent: '#2f6b4f', palette: { theme: 'forest' } });
});

test.describe('favourites and compare as a visitor (kept on this device)', () => {
  test.use({ as: 'visitor' });
  test('heart, favourites filter, reload; compare two designs side by side', async ({ page }) => {
    await page.goto('/templates');
    const grid = page.getByTestId('design-grid');
    await grid
      .locator('li[data-design="terra"]')
      .getByRole('button', { name: 'Favourite: Terra' })
      .click();
    await page.reload();
    await page.getByRole('button', { name: 'Favourites', exact: true }).click();
    await expect(grid.locator('li[data-design]')).toHaveCount(1);
    await expect(grid.locator('li[data-design="terra"]')).toBeVisible();
    await page.getByRole('button', { name: 'Favourites', exact: true }).click();

    await grid.getByRole('checkbox', { name: 'Compare Terra' }).check();
    await grid.getByRole('checkbox', { name: 'Compare Neon' }).check();
    await expect(page.getByTestId('compare-tray')).toContainText('2 of 4');
    await page.getByTestId('compare-tray').getByRole('button', { name: 'Compare' }).click();
    const view = page.getByTestId('compare-view');
    await expect(view.locator('li')).toHaveCount(2);
    await expect(view.locator('iframe[data-active]')).toHaveCount(2);
    const axe = await new AxeBuilder({ page }).include('[data-testid="compare-view"]').analyze();
    expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual(
      [],
    );
  });
});

test('signed in: favourites are kept in the account', async ({ page }) => {
  await page.goto('/templates');
  await page
    .getByTestId('design-grid')
    .locator('li[data-design="coral"]')
    .getByRole('button', { name: 'Favourite: Coral' })
    .click();
  await expect
    .poll(
      async () =>
        ((await (await page.request.get('/api/me/favourites')).json()) as { ids: string[] }).ids,
    )
    .toContain('coral');
});

test('the design browser has no serious accessibility problems', async ({ page }) => {
  await openEditor(page, 'browser-axe', 'clarity');
  await page.getByTestId('browse-designs').click();
  await expect(page.getByTestId('design-grid').locator('li').first()).toBeVisible();
  const r = await new AxeBuilder({ page }).include('dialog[open]').analyze();
  expect(r.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
});
