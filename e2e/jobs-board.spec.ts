import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './support/test';
import { setConfig } from './support/auth';
import { DEFAULT_CONFIG } from '../src/modules/billing/config';
import type { Job } from '../src/modules/jobs/schema';
import type { JobBoardState } from '../src/modules/jobs/board';

// These tests use screen coordinates and exact focus on the board, so they run without the
// workspace tab strip (it adds a row above the page); the strip has its own spec.
const NO_TABS = {
  ...DEFAULT_CONFIG,
  features: { ...DEFAULT_CONFIG.features, workspaceTabs: false },
};
test.beforeEach(async ({ request }) => {
  await setConfig(request, NO_TABS);
});
test.afterAll(async ({ request }) => {
  await setConfig(request, DEFAULT_CONFIG);
});

type BoardResponse = { jobs: Job[]; board: JobBoardState };
const read = async (page: Page): Promise<BoardResponse> =>
  (await page.request.get('/api/jobs')).json();
const card = (page: Page, id: string) => page.locator(`[data-job-id="${id}"]`);
const seed = async (page: Page) => {
  for (const title of ['Founding Engineer', 'Platform Engineer', 'Frontend Engineer']) {
    const response = await page.request.post('/api/jobs', {
      data: { title, company: 'Example company', location: 'Remote' },
    });
    expect(response.ok()).toBe(true);
  }
  await page.goto('/jobs');
  await expect(page.getByTestId('jobs-board')).toHaveAttribute('data-enhanced', 'true');
  return read(page);
};

test.describe('enhanced job board', () => {
  test('keyboard reorder and move to an empty stage persist without changing reorder timestamps', async ({
    page,
  }) => {
    const initial = await seed(page);
    const [first, second] = initial.board.columns.saved;
    const original = initial.jobs.find((job) => job.id === first)!;
    const handle = card(page, first!).getByRole('button', {
      name: `Drag ${original.title}`,
      exact: true,
    });
    await handle.focus();
    await page.keyboard.press('Space');
    await expect(handle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('jobs-board').getByRole('status')).toContainText(
      /Saved, position \d+\./,
    );
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('jobs-board').getByRole('status')).toContainText('position 2.');
    await page.keyboard.press('Space');
    await expect
      .poll(async () => (await read(page)).board.columns.saved.slice(0, 2))
      .toEqual([second, first]);
    expect((await read(page)).jobs.find((job) => job.id === first)?.updatedAt).toBe(
      original.updatedAt,
    );
    await expect(handle).toBeFocused();
    await expect(handle).not.toHaveAttribute('aria-pressed', 'true');
    await expect(handle).toBeEnabled();
    await page.keyboard.press('Space');
    await expect(handle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('jobs-board').getByRole('status')).toContainText(
      /Saved, position \d+\./,
    );
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('jobs-board').getByRole('status')).toContainText(
      'Applied, position 1.',
    );
    await page.keyboard.press('Space');
    await expect
      .poll(async () => (await read(page)).jobs.find((job) => job.id === first)?.stage)
      .toBe('applied');
    const moved = (await read(page)).jobs.find((job) => job.id === first)!;
    expect(moved.appliedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(moved.reached?.applied).toBe(moved.appliedOn);
    await page.reload();
    await expect(page.locator('[data-stage="applied"]')).toContainText(original.title);
    expect((await read(page)).board.columns.applied).toEqual([first]);
  });

  test('cancel and unchanged drops make no requests and preserve focus', async ({ page }) => {
    const initial = await seed(page);
    const id = initial.board.columns.saved[0]!;
    const handle = card(page, id).getByRole('button', { name: /^Drag / });
    let writes = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/jobs/board/move')) writes++;
    });
    await handle.focus();
    await page.keyboard.press('Space');
    await expect(handle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('jobs-board').getByRole('status')).toContainText(
      /Saved, position \d+\./,
    );
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('jobs-board').getByRole('status')).toContainText(
      'Applied, position 1.',
    );
    await page.keyboard.press('Escape');
    await expect(handle).not.toHaveAttribute('aria-pressed', 'true');
    await expect(handle).toBeFocused();
    await expect(handle).not.toHaveAttribute('aria-pressed', 'true');
    await expect(handle).toBeEnabled();
    await page.keyboard.press('Space');
    await expect(handle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('jobs-board').getByRole('status')).toContainText(
      /Saved, position \d+\./,
    );
    await page.keyboard.press('Space');
    await expect(handle).not.toHaveAttribute('aria-pressed', 'true');
    await expect(handle).toBeFocused();
    expect(writes).toBe(0);
    expect((await read(page)).board).toEqual(initial.board);
  });

  test('mouse dragging moves a card between columns', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Touch is checked separately');
    const initial = await seed(page);
    const id = initial.board.columns.saved[0]!;
    const from = await card(page, id)
      .getByRole('button', { name: /^Drag / })
      .boundingBox();
    const to = await page.locator('[data-stage="applied"]').boundingBox();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(from!.x + from!.width / 2 + 12, from!.y + from!.height / 2, { steps: 3 });
    await page.mouse.move(to!.x + to!.width / 2, to!.y + 130, { steps: 20 });
    await page.mouse.up();
    await expect
      .poll(async () => (await read(page)).jobs.find((job) => job.id === id)?.stage)
      .toBe('applied');
  });

  test('an outside drop cancels and another tab’s change is reconciled before a retry', async ({
    page,
    context,
    isMobile,
  }) => {
    test.skip(isMobile, 'Mouse cancellation is checked on desktop');
    const initial = await seed(page);
    const id = initial.board.columns.saved[0]!;
    const handle = card(page, id).getByRole('button', { name: /^Drag / });
    const box = await handle.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 12, box!.y + box!.height / 2);
    await page.mouse.move(400, 40, { steps: 15 });
    await page.mouse.up();
    expect((await read(page)).board).toEqual(initial.board);
    await expect(handle).toBeFocused();

    const anotherTab = await context.newPage();
    await anotherTab.goto('/jobs');
    await expect(anotherTab.getByTestId('jobs-board')).toBeVisible();
    await card(anotherTab, id).locator('summary').click();
    await card(anotherTab, id)
      .getByLabel(/^Stage for /)
      .selectOption('applied');
    await expect(card(anotherTab, id).getByRole('button', { name: /^Drag / })).toBeEnabled();
    const response = page.waitForResponse((value) => value.url().endsWith('/api/jobs/board/move'));
    const stageControl = card(page, id).getByLabel(/^Stage for /);
    if (!(await stageControl.isVisible())) await card(page, id).locator('summary').click();
    await stageControl.selectOption('interview');
    expect((await response).status()).toBe(409);
    await expect(page.locator('[data-stage="applied"]')).toContainText(
      initial.jobs.find((job) => job.id === id)!.title,
    );
    await expect(handle).toBeEnabled();
    expect((await read(page)).board.revision).toBe(1);
    await anotherTab.close();
  });

  test('touch hold reorders while normal swiping scrolls the board', async ({
    page,
    context,
    isMobile,
  }) => {
    test.skip(!isMobile, 'Real touch sensor is exercised on the phone project');
    const initial = await seed(page);
    const [first, second] = initial.board.columns.saved;
    const handle = await card(page, first!)
      .getByRole('button', { name: /^Drag / })
      .boundingBox();
    const target = await card(page, second!).boundingBox();
    const session = await context.newCDPSession(page);
    const x = handle!.x + handle!.width / 2;
    const y = handle!.y + handle!.height / 2;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(300); // The intentional 250ms touch activation hold.
    for (let step = 1; step <= 12; step++)
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y + ((target!.y + target!.height - 16 - y) * step) / 12 }],
      });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect
      .poll(async () => (await read(page)).board.columns.saved.slice(0, 2))
      .toEqual([second, first]);
    await expect(card(page, first!).getByRole('button', { name: /^Drag / })).toBeFocused();
    const region = page.getByRole('region', { name: 'Application stages' });
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = await region.boundingBox();
    // Swipe the lane header at a human gesture speed, away from drag handles.
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 260, y: box!.y + 24 }],
    });
    for (let step = 1; step <= 10; step++) {
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      );
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 260 - step * 18, y: box!.y + 24 }],
      });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await session.detach();
  });

  test('Actions reorder controls and closed outcomes use the existing job flow', async ({
    page,
  }) => {
    const initial = await seed(page);
    const [first, second] = initial.board.columns.saved;
    await card(page, first!).locator('summary').click();
    const down = card(page, first!).getByRole('button', { name: /^Move .+ down$/ });
    await down.click();
    await expect
      .poll(async () => (await read(page)).board.columns.saved.slice(0, 2))
      .toEqual([second, first]);
    await expect(down).toBeFocused();
    await card(page, first!)
      .getByLabel(/^Stage for /)
      .selectOption('closed');
    const outcome = card(page, first!).getByLabel(/^How it ended:/);
    await expect(outcome).toBeEnabled();
    await outcome.selectOption('rejected');
    await expect
      .poll(async () => (await read(page)).jobs.find((job) => job.id === first)?.outcome)
      .toBe('rejected');
  });

  test('uncertain commits reconcile without replay; failed reconciliation locks movement until retry', async ({
    page,
  }) => {
    const initial = await seed(page);
    const id = initial.board.columns.saved[0]!;
    await page.route('**/api/jobs/board/move', async (route) => {
      await route.fetch();
      await route.fulfill({ status: 503, json: { error: { message: 'Connection interrupted' } } });
    });
    await card(page, id).locator('summary').click();
    await card(page, id)
      .getByLabel(/^Stage for /)
      .selectOption('applied');
    await expect(page.locator('[data-stage="applied"]')).toContainText(
      initial.jobs.find((job) => job.id === id)!.title,
    );
    await expect(card(page, id).getByRole('button', { name: /^Drag / })).toBeEnabled();
    await expect(card(page, id).getByLabel(/^Stage for /)).toBeFocused();
    expect((await read(page)).board.revision).toBe(1);
    await page.unroute('**/api/jobs/board/move');
    await page.route('**/api/jobs/board/move', (route) =>
      route.fulfill({ status: 500, json: { error: { message: 'Save failed' } } }),
    );
    await page.route('**/api/jobs', (route) =>
      route.fulfill({ status: 503, json: { error: { message: 'Refresh failed' } } }),
    );
    await card(page, id)
      .getByLabel(/^Stage for /)
      .selectOption('interview');
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
    await expect(card(page, id).getByRole('button', { name: /^Drag / })).toBeDisabled();
    await page.unroute('**/api/jobs');
    await page.unroute('**/api/jobs/board/move');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(card(page, id).getByRole('button', { name: /^Drag / })).toBeEnabled();
    expect((await read(page)).jobs.find((job) => job.id === id)?.stage).toBe('applied');
  });

  test('a dismissed move error returns with Retry if reconciliation fails', async ({ page }) => {
    const initial = await seed(page);
    const id = initial.board.columns.saved[0]!;
    let release!: () => void;
    let captured!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      captured = resolve;
    });
    await page.route('**/api/jobs/board/move', (route) =>
      route.fulfill({ status: 500, json: { error: { message: 'Save failed' } } }),
    );
    await page.route('**/api/jobs', async (route) => {
      captured();
      await gate;
      await route.fulfill({ status: 503, json: { error: { message: 'Refresh failed' } } });
    });
    try {
      await card(page, id).locator('summary').click();
      await card(page, id)
        .getByLabel(/^Stage for /)
        .selectOption('applied');
      await started;
      await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
      release();
      await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
    } finally {
      release();
    }
  });

  test('reconciliation retains a card added after its server snapshot was read', async ({
    page,
  }) => {
    const initial = await seed(page);
    const id = initial.board.columns.saved[0]!;
    let release!: () => void;
    let captured!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      captured = resolve;
    });
    await page.route('**/api/jobs/board/move', (route) =>
      route.fulfill({ status: 500, json: { error: { message: 'Save failed' } } }),
    );
    await page.route('**/api/jobs', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      captured();
      await gate;
      await route.fulfill({ response });
    });
    try {
      await card(page, id).locator('summary').click();
      await card(page, id)
        .getByLabel(/^Stage for /)
        .selectOption('applied');
      await started;
      await page.getByRole('button', { name: 'Add a job', exact: true }).click();
      await page.getByLabel('Job title', { exact: true }).fill('Newly added role');
      await page.getByRole('button', { name: 'Save job', exact: true }).click();
      await expect(page.getByRole('link', { name: 'Newly added role', exact: true })).toBeVisible();
      release();
      await expect(card(page, id).getByRole('button', { name: /^Drag / })).toBeEnabled();
      await expect(page.getByRole('link', { name: 'Newly added role', exact: true })).toBeVisible();
      await expect(page.getByTestId('jobs-count')).toHaveText('4 jobs');
    } finally {
      release();
    }
  });

  test('a delayed creation response does not duplicate a job already returned by recovery', async ({
    page,
  }) => {
    const initial = await seed(page);
    const id = initial.board.columns.saved[0]!;
    let releaseRefresh!: () => void;
    let releaseCreation!: () => void;
    let refreshStarted!: () => void;
    let creationCommitted!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    const creationGate = new Promise<void>((resolve) => {
      releaseCreation = resolve;
    });
    const refreshing = new Promise<void>((resolve) => {
      refreshStarted = resolve;
    });
    const created = new Promise<void>((resolve) => {
      creationCommitted = resolve;
    });
    await page.route('**/api/jobs/board/move', (route) =>
      route.fulfill({ status: 500, json: { error: { message: 'Save failed' } } }),
    );
    await page.route('**/api/jobs', async (route) => {
      if (route.request().method() === 'GET') {
        refreshStarted();
        await refreshGate;
        return route.fulfill({ response: await route.fetch() });
      }
      const response = await route.fetch();
      creationCommitted();
      await creationGate;
      return route.fulfill({ response });
    });
    try {
      await card(page, id).locator('summary').click();
      await card(page, id)
        .getByLabel(/^Stage for /)
        .selectOption('applied');
      await refreshing;
      await page.getByRole('button', { name: 'Add a job', exact: true }).click();
      await page.getByLabel('Job title', { exact: true }).fill('Delayed creation');
      await page.getByRole('button', { name: 'Save job', exact: true }).click();
      await created;
      releaseRefresh();
      await expect(card(page, id).getByRole('button', { name: /^Drag / })).toBeEnabled();
      await expect(page.getByTestId('jobs-count')).toHaveText('4 jobs');
      releaseCreation();
      await expect(page.getByRole('form', { name: 'Add a job' })).toHaveCount(0);
      await expect(page.getByTestId('jobs-count')).toHaveText('4 jobs');
      await expect(page.getByRole('link', { name: 'Delayed creation', exact: true })).toHaveCount(
        1,
      );
    } finally {
      releaseRefresh();
      releaseCreation();
    }
  });

  test('responsive board has no page overflow and passes accessibility checks', async ({
    page,
    isMobile,
  }, testInfo) => {
    await seed(page);
    for (const width of isMobile ? [390] : [390, 834, 1440, 2770]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
      await page.screenshot({
        path: `.tmp-shots/jobs-board-${testInfo.project.name}-${width}.png`,
        fullPage: true,
      });
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.getByLabel('Jump to stage').selectOption('closed');
    await expect
      .poll(async () => {
        const region = await page.getByRole('region', { name: 'Application stages' }).boundingBox();
        const lane = await page.locator('[data-stage="closed"]').boundingBox();
        return lane!.x >= region!.x && lane!.x + lane!.width <= region!.x + region!.width + 1;
      })
      .toBe(true);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(
      axe.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'),
    ).toEqual([]);
  });
});
