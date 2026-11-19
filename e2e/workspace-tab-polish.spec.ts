import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/test';
import { apiSignUp, setConfig } from './support/auth';
import { DEFAULT_CONFIG } from '../src/modules/billing/config';

test.beforeEach(async ({ request }) => {
  await setConfig(request, {
    ...DEFAULT_CONFIG,
    features: { ...DEFAULT_CONFIG.features, workspaceTabs: true },
  });
});

const tabs = (page: Page) => page.getByTestId('tab-strip').getByTestId('tab');
const items = (page: Page) => page.getByTestId('tab-strip').locator('li[data-tab-id]');
const editor = (page: Page) => page.getByRole('textbox', { name: 'Workspace name', exact: true });

async function nameTab(page: Page, tab: Locator, name: string) {
  await tab.focus();
  await tab.press('F2');
  await editor(page).fill(name);
  await editor(page).press('Enter');
}

async function tabMenu(page: Page, index: number) {
  await items(page).nth(index).getByTestId('tab-menu').click();
  return page.getByRole('menu', { name: 'Workspace actions' });
}

async function mouseDrag(page: Page, from: Locator, to: Locator, cancel = false) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error('Both drag targets must be visible');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
}

test('a personal name survives navigation and reload, and Reset name follows the destination', async ({
  page,
}) => {
  await page.goto('/studio');
  await nameTab(page, tabs(page).first(), '  Monday applications 📄  ');
  await expect(tabs(page).first()).toHaveText('Monday applications 📄');
  await page.goto('/documents');
  await expect(tabs(page).first()).toHaveText('Monday applications 📄');
  await page.reload();
  await expect(tabs(page).first()).toHaveText('Monday applications 📄');
  const menu = await tabMenu(page, 0);
  await menu.getByRole('menuitem', { name: 'Reset name', exact: true }).click();
  await expect(tabs(page).first()).toHaveText('Documents');
  await expect(tabs(page).first()).toBeFocused();
});

test('inline naming supports cancel, empty validation, blur, and composition without submitting early', async ({
  page,
}) => {
  await page.goto('/studio');
  await tabs(page).first().press('F2');
  await editor(page).fill('Cancelled');
  await editor(page).press('Escape');
  await expect(tabs(page).first()).toHaveText('Home');
  await expect(tabs(page).first()).toBeFocused();

  await tabs(page).first().press('F2');
  await editor(page).fill('   ');
  await editor(page).press('Enter');
  await expect(editor(page)).toBeVisible();
  await expect(editor(page)).toHaveAttribute('aria-invalid', 'true');
  await page.locator('h1').click();
  await expect(tabs(page).first()).toHaveText('Home');

  const menu = await tabMenu(page, 0);
  await menu.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await editor(page).fill('東京');
  await editor(page).evaluate((input) => {
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }),
    );
  });
  await expect(editor(page)).toBeVisible();
  await editor(page).evaluate((input) => {
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '東京' }));
  });
  await page.locator('h1').click();
  await expect(tabs(page).first()).toHaveText('東京');
});

test('moving and naming an inactive workspace preserves both independent drafts and restores order', async ({
  page,
}) => {
  await page.goto('/letters/new?type=cover');
  await page.getByLabel('Who it’s to').first().fill('Acme Ltd');
  await nameTab(page, tabs(page).first(), 'Acme');
  const firstId = await items(page).first().getAttribute('data-tab-id');
  await page.getByTestId('tab-new').click();
  await page.goto('/letters/new?type=cover');
  await page.getByLabel('Who it’s to').first().fill('Beta Inc');
  await nameTab(page, tabs(page).nth(1), 'Beta');
  const field = page.getByLabel('Who it’s to').first();
  const handle = await field.elementHandle();

  const menu = await tabMenu(page, 0);
  await expect(menu.getByRole('menuitem', { name: 'Move left', exact: true })).toBeDisabled();
  await menu.getByRole('menuitem', { name: 'Move right', exact: true }).click();
  await expect(tabs(page)).toHaveText(['Beta', 'Acme']);
  await expect(tabs(page).nth(0)).toHaveAttribute('aria-current', 'page');
  await expect(tabs(page).nth(1)).toBeFocused();
  await expect(field).toHaveValue('Beta Inc');
  expect(await handle!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(items(page).nth(1)).toHaveAttribute('data-tab-id', firstId!);

  await nameTab(page, tabs(page).nth(1), 'Acme draft');
  await expect(field).toHaveValue('Beta Inc');
  await page.reload();
  await expect(tabs(page)).toHaveText(['Beta', 'Acme draft']);
  await tabs(page).nth(1).click();
  await expect(page.getByLabel('Who it’s to').first()).toHaveValue('Acme Ltd');
});

test('mouse dragging reorders without switching, and Escape and outside drops cancel', async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(isMobile, 'Mouse gestures are verified on desktop; touch has its own test');
  await page.goto('/studio');
  await nameTab(page, tabs(page).first(), 'First');
  await page.getByTestId('tab-new').click();
  await nameTab(page, tabs(page).nth(1), 'Second');
  await page.getByTestId('tab-new').click();
  await nameTab(page, tabs(page).nth(2), 'Third');
  await mouseDrag(page, tabs(page).nth(0), tabs(page).nth(2));
  await expect(tabs(page)).toHaveText(['Second', 'Third', 'First']);
  await expect(tabs(page).nth(1)).toHaveAttribute('aria-current', 'page');
  await mouseDrag(page, tabs(page).nth(2), tabs(page).nth(0), true);
  await expect(tabs(page)).toHaveText(['Second', 'Third', 'First']);
  const first = await tabs(page).nth(2).boundingBox();
  await page.mouse.move(first!.x + 20, first!.y + 20);
  await page.mouse.down();
  await page.mouse.move(first!.x - 150, first!.y + 150, { steps: 12 });
  await page.mouse.up();
  await expect(tabs(page)).toHaveText(['Second', 'Third', 'First']);
  await page.reload();
  await expect(tabs(page)).toHaveText(['Second', 'Third', 'First']);
  await page.screenshot({ path: testInfo.outputPath('tab-rail-desktop.png') });
});

test('workspace menus support arrow keys, Escape restoration, and normal Tab traversal', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/studio');
  await nameTab(page, tabs(page).first(), 'First');
  await page.getByTestId('tab-new').click();
  const trigger = page.getByTestId('tab-menu').first();
  await trigger.focus();
  await trigger.press('Enter');
  const menu = page.getByRole('menu', { name: 'Workspace actions' });
  await expect(menu.getByRole('menuitem', { name: /^Rename/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Reset name', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Move right', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(menu.getByRole('menuitem', { name: /^Rename/ })).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'Move right', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('tab-close').first()).toBeFocused();
  await expect(menu).toHaveCount(0);
  await trigger.press('Enter');
  await page.keyboard.press('Shift+Tab');
  await expect(tabs(page).first()).toBeFocused();
  await trigger.press('Enter');
  await expect(menu).toBeVisible();
  // A focus scroll can report after the menu opens, with its anchor already in place.
  await page.getByTestId('tab-scroll').dispatchEvent('scroll');
  await expect(menu).toBeVisible();
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width - 20, height: viewport.height - 20 });
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});

test('releasing a dragged tab over a disabled action still completes the move', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Mouse release is verified on desktop');
  await page.goto('/studio');
  await nameTab(page, tabs(page).first(), 'First');
  await page.getByTestId('tab-new').click();
  await nameTab(page, tabs(page).last(), 'Second');
  await mouseDrag(page, tabs(page).first(), items(page).last().getByTestId('tab-menu'));
  await expect(page.getByTestId('tab-drag-preview')).toHaveCount(0);
  await expect(tabs(page)).toHaveText(['Second', 'First']);
  await expect(tabs(page).first()).toHaveAttribute('aria-current', 'page');
});

test('dragging at the rail edge scrolls to hidden tabs without moving the page', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop edge scrolling complements the mobile touch gesture test');
  await page.goto('/studio');
  await nameTab(page, tabs(page).first(), 'First');
  for (let i = 1; i < 8; i++) await page.getByTestId('tab-new').click();
  const activeId = await items(page).last().getAttribute('data-tab-id');
  const scroller = page.getByTestId('tab-scroll');
  await scroller.evaluate((node) => {
    node.scrollLeft = 0;
  });
  await page.evaluate(() => {
    window.scrollTo(0, 100);
  });
  const top = await page.evaluate(() => scrollY);
  const source = await tabs(page).first().boundingBox();
  const viewport = await scroller.boundingBox();
  await page.mouse.move(source!.x + 24, source!.y + 22);
  await page.mouse.down();
  await page.mouse.move(viewport!.x + viewport!.width - 10, source!.y + 22, { steps: 12 });
  await expect(page.getByTestId('tab-drag-preview')).toBeVisible();
  await expect.poll(() => scroller.evaluate((node) => node.scrollLeft)).toBeGreaterThan(100);
  await page.mouse.up();
  await expect(page.getByTestId('tab-drag-preview')).toHaveCount(0);
  await expect(tabs(page).first()).not.toHaveText('First');
  await expect(items(page).filter({ has: page.locator('[aria-current="page"]') })).toHaveAttribute(
    'data-tab-id',
    activeId!,
  );
  expect(await page.evaluate(() => scrollY)).toBe(top);
});

test('touch swipes scroll the rail, while holding a tab allows reordering', async ({
  page,
  context,
  isMobile,
}) => {
  test.skip(!isMobile, 'Touch gesture verified on mobile');
  await page.goto('/studio');
  await nameTab(page, tabs(page).first(), 'First');
  for (const name of ['Second', 'Third', 'Fourth']) {
    await page.getByTestId('tab-new').click();
    await nameTab(page, tabs(page).last(), name);
  }
  const scroller = page.getByTestId('tab-scroll');
  await scroller.evaluate((element) => {
    element.scrollLeft = 0;
  });
  const client = await context.newCDPSession(page);
  const rect = await scroller.boundingBox();
  const y = rect!.y + rect!.height / 2;
  const start = rect!.x + rect!.width - 15;
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: start, y }],
  });
  for (let i = 1; i <= 8; i++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: start - i * 18, y }],
    });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(20);
  await expect(tabs(page)).toHaveText(['First', 'Second', 'Third', 'Fourth']);

  await scroller.evaluate((element) => {
    element.scrollLeft = 0;
  });
  const a = await tabs(page).first().boundingBox();
  const x = a!.x + 28;
  const target = rect!.x + rect!.width - 20;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await expect(page.getByTestId('tab-drag-preview')).toBeVisible();
  for (let i = 1; i <= 12; i++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + ((target - x) * i) / 12, y }],
    });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(tabs(page).first()).toHaveText('Second');
  await expect(page.locator('[data-testid="tab"][aria-current="page"]')).toHaveText('Fourth');
  await client.detach();
});

test('a background result arriving during inline editing retains the name and moved destination', async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/letters', async (route) => {
    if (route.request().method() === 'POST') await held;
    await route.continue();
  });
  await page.goto('/letters/new?type=cover');
  const form = page.getByRole('form', { name: 'Cover letter' });
  await form.getByLabel('The role you’re applying for').fill('Delivery Driver');
  const posting = page.waitForRequest(
    (request) => request.url().endsWith('/api/letters') && request.method() === 'POST',
  );
  await form.getByRole('button', { name: 'Write it myself' }).click();
  await posting;
  await page.getByTestId('tab-new').click();
  await tabs(page).first().press('F2');
  await editor(page).fill('Acme application');
  release();
  await expect(page.getByTestId('tab-ready')).toBeVisible({ timeout: 15000 });
  await expect(editor(page)).toHaveValue('Acme application');
  await editor(page).press('Enter');
  const menu = await tabMenu(page, 0);
  await menu.getByRole('menuitem', { name: 'Move right', exact: true }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(tabs(page).last()).toContainText('Acme application');
  await expect(page.getByTestId('tab-ready')).toBeVisible();
  await tabs(page).last().click();
  await expect(page).toHaveURL(/\/letters\/[\w-]+$/);
  await expect(page.getByTestId('tab-ready')).toHaveCount(0);
});

test('reopening a closed workspace preserves its personal name', async ({ page }) => {
  await page.goto('/documents');
  await nameTab(page, tabs(page).first(), 'My shortlist');
  await page.getByTestId('tab-close').first().click();
  await page.getByTestId('tab-reopen').click();
  await expect(tabs(page).last()).toHaveText('My shortlist');
  await expect(page).toHaveURL(/\/documents$/);
});

test('eight workspaces fit narrow screens with visible actions, accessible menus, and reduced motion', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/studio');
  for (let i = 1; i < 8; i++) await page.getByTestId('tab-new').click();
  await expect(page.getByTestId('tab-new')).toBeDisabled();
  const count = await items(page).count();
  await nameTab(page, tabs(page).last(), 'A long personal workspace name that truncates safely');
  await expect(page.getByTestId('tab-new')).toBeInViewport();
  const menu = await tabMenu(page, count - 1);
  await expect(menu).toBeInViewport({ ratio: 1 });
  await expect(menu.getByRole('menuitem', { name: 'Move right', exact: true })).toBeDisabled();
  const results = await new AxeBuilder({ page }).include('[data-testid="tab-strip"]').analyze();
  expect(
    results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'),
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('tab-rail-narrow.png') });
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const transition = await tabs(page)
    .last()
    .evaluate((node) => getComputedStyle(node).transitionDuration);
  expect(transition.split(',').every((time) => Number.parseFloat(time) <= 0.001)).toBe(true);
  // 200% desktop zoom leaves the same 360px layout checked above.
  await page.setViewportSize({ width: 720, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await expect(page.getByTestId('tab-new')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const zoomedMenu = await tabMenu(page, count - 1);
  await expect(zoomedMenu).toBeInViewport({ ratio: 1 });
});

test('another account does not inherit personal names, inline editing, or closed workspace history', async ({
  page,
  context,
}) => {
  await page.goto('/documents');
  await nameTab(page, tabs(page).first(), 'Private shortlist');
  await page.getByTestId('tab-close').first().click();
  await expect(page.getByTestId('tab-reopen')).toBeVisible();
  await tabs(page).first().press('F2');
  await editor(page).fill('Uncommitted private name');
  await apiSignUp(context.request);
  await page.reload();
  await expect(tabs(page)).toHaveText(['Home']);
  await expect(editor(page)).toHaveCount(0);
  await expect(page.getByTestId('tab-reopen')).toHaveCount(0);
  await expect(page.getByRole('menu', { name: 'Workspace actions' })).toHaveCount(0);
});

test('German controls translate while personal names remain literal', async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    {
      name: 'lang',
      value: 'de',
      url: baseURL!,
    },
  ]);
  await page.goto('/studio');
  await expect(tabs(page).first()).toHaveText('Start');
  await tabs(page).first().press('F2');
  const input = page.getByRole('textbox', { name: 'Name des Arbeitsbereichs', exact: true });
  await input.fill('Home');
  await input.press('Enter');
  await expect(tabs(page).first()).toHaveText('Home');
  await items(page).first().getByTestId('tab-menu').click();
  await expect(page.getByRole('menuitem', { name: 'Umbenennen', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Name zurücksetzen', exact: true }).click();
  await expect(tabs(page).first()).toHaveText('Start');
});
