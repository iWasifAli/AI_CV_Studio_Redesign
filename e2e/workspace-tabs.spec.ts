import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import { driver } from '../src/modules/resume/fixtures';
import { apiSignUp, EMULATOR, PASSWORD } from './support/auth';
import { seedDocument } from './support/seed';
import { expect, test } from './support/test';

// Both existing desktop/mobile projects run these scenarios. The parent owns the server flag.
test.skip(process.env.WORKSPACE_TABS_ENABLED !== '1', 'Requires WORKSPACE_TABS_ENABLED=1');

const coverRoute = '/letters/new?type=cover';
const workspaces = (page: Page) => page.getByRole('tablist', { name: 'Workspaces' });
const strip = (page: Page) => page.getByTestId('workspace-tabs');
const workspace = (page: Page, id: string) =>
  workspaces(page).locator(`[id="workspace-tab-${id}"]`);
const coverForm = (page: Page) => page.getByRole('form', { name: 'Cover letter', exact: true });
const roleInput = (page: Page) => coverForm(page).getByLabel('The role you’re applying for');
const exitPrompt = (page: Page) =>
  page.getByRole('dialog', { name: 'Keep your work before signing out' });

async function activeId(page: Page) {
  const selected = workspaces(page).getByRole('tab', { selected: true });
  await expect(selected).toBeVisible();
  const id = (await selected.getAttribute('id'))!.replace(/^workspace-tab-/, '');
  await expect(page).toHaveURL((url) => url.searchParams.get('_workspace') === id);
  return id;
}

async function selectWorkspace(page: Page, id: string) {
  await workspace(page, id).click();
  await expect(workspace(page, id)).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL((url) => url.searchParams.get('_workspace') === id);
}

async function newHome(page: Page) {
  const count = await workspaces(page).getByRole('tab').count();
  await strip(page).getByRole('button', { name: 'New workspace', exact: true }).click();
  await expect(workspaces(page).getByRole('tab')).toHaveCount(count + 1);
  await expect(page).toHaveURL((url) => url.pathname === '/studio');
  return activeId(page);
}

async function chooseCoverLetter(page: Page) {
  await page.getByRole('button', { name: 'Create', exact: true }).filter({ visible: true }).click();
  await page
    .getByRole('dialog', { name: 'Create', exact: true })
    .getByRole('link', { name: /Cover letter/ })
    .click();
  await expect(coverForm(page)).toBeVisible();
  await expect(page).toHaveURL(
    (url) => url.pathname === '/letters/new' && url.searchParams.get('type') === 'cover',
  );
}

async function openInAppTab(page: Page, link: Locator) {
  await link.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Link actions' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Open in app tab', exact: true }).click();
  await expect(menu).toBeHidden();
}

async function signOut(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole('button', { name: 'Profile menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  } else {
    await page.getByTestId('quick-sign-out').click();
  }
}

// Reload is deliberate in recovery tests; accept the browser's unsaved-work navigation prompt.
function allowReload(page: Page) {
  page.on('dialog', (dialog) => {
    if (dialog.type() === 'beforeunload') void dialog.accept();
    else void dialog.dismiss();
  });
}

async function attachWorkspaceLayout(page: Page, info: TestInfo, name: string) {
  await strip(page).scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const path = info.outputPath(`${info.project.name}-${name}.png`);
  await page.screenshot({ path, animations: 'disabled', fullPage: false });
  await info.attach(`${info.project.name}-${name}`, { path, contentType: 'image/png' });
}

/** Hold only the generation POST; let the real API produce and return its normal result. */
async function delayGeneration(page: Page, url: string) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route(url, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    requests++;
    await gate;
    const response = await route.fetch();
    await route.fulfill({ response });
  });
  return {
    release,
    started: () => expect.poll(() => requests).toBe(1),
    requestCount: () => requests,
    dispose: async () => {
      release();
      await page.unrouteAll({ behavior: 'wait' });
    },
  };
}

test.describe('signed-in workspaces', () => {
  test.beforeEach(async ({ page }) => allowReload(page));

  test('desktop/mobile strip exposes its selected panel, keyboard navigation and reachable controls', async ({
    page,
  }, testInfo) => {
    await page.goto('/studio');
    const first = await activeId(page);
    await expect(workspaces(page).getByRole('tab')).toHaveCount(1);
    await attachWorkspaceLayout(page, testInfo, 'workspace-home-initial');
    const second = await newHome(page);
    const third = await newHome(page);
    await attachWorkspaceLayout(page, testInfo, 'workspace-multiple-tabs');
    const selected = workspace(page, third);
    await expect(selected).toBeInViewport({ ratio: 1 });
    const panelId = await selected.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    await expect(page.getByRole('tabpanel')).toHaveAttribute('id', panelId!);
    await expect(page.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      `workspace-tab-${third}`,
    );
    await expect(selected).toHaveAttribute('tabindex', '0');
    await expect(workspace(page, first)).toHaveAttribute('tabindex', '-1');

    await selected.focus();
    await page.keyboard.press('Home');
    await expect(workspace(page, first)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(workspace(page, first)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(workspace(page, second)).toBeFocused();
    await page.keyboard.press('End');
    await expect(workspace(page, third)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(workspace(page, first)).toBeFocused();

    await expect(
      strip(page).getByRole('button', { name: 'New workspace', exact: true }),
    ).toBeInViewport();
    await expect(
      strip(page).getByRole('button', { name: 'Recently closed workspaces' }),
    ).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(1);
    const axe = await new AxeBuilder({ page })
      .include('[data-testid="workspace-tabs"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
      [],
    );
  });

  test('two copies of the same new-letter route retain independent drafts through tab changes and reload', async ({
    page,
  }) => {
    await page.goto(coverRoute);
    const first = await activeId(page);
    await roleInput(page).fill('Driver — first workspace');
    await coverForm(page).getByLabel('Who it’s to').fill('First recipient');
    const second = await newHome(page);
    await chooseCoverLetter(page);
    expect(await activeId(page)).toBe(second);
    await expect(roleInput(page)).toHaveValue('');
    await roleInput(page).fill('Designer — second workspace');
    await coverForm(page).getByLabel('Who it’s to').fill('Second recipient');

    await selectWorkspace(page, first);
    await expect(roleInput(page)).toHaveValue('Driver — first workspace');
    await expect(coverForm(page).getByLabel('Who it’s to')).toHaveValue('First recipient');
    await selectWorkspace(page, second);
    await expect(roleInput(page)).toHaveValue('Designer — second workspace');
    await page.reload();
    await expect(workspaces(page).getByRole('tab')).toHaveCount(2);
    expect(await activeId(page)).toBe(second);
    await expect(roleInput(page)).toHaveValue('Designer — second workspace');
    await selectWorkspace(page, first);
    await expect(roleInput(page)).toHaveValue('Driver — first workspace');
    await expect(coverForm(page).getByLabel('Who it’s to')).toHaveValue('First recipient');
  });

  test('closing and reopening a draft preserves it; closing the last workspace creates Home', async ({
    page,
  }) => {
    await page.goto(coverRoute);
    const draft = await activeId(page);
    await roleInput(page).fill('Reopen this unsaved role');
    const home = await newHome(page);
    await selectWorkspace(page, draft);
    await workspace(page, draft).focus();
    await page.keyboard.press('Delete');
    await expect(workspace(page, draft)).toHaveCount(0);
    expect(await activeId(page)).toBe(home);
    await strip(page).getByRole('button', { name: 'Recently closed workspaces' }).click();
    await page.getByRole('button', { name: 'Reopen Letters', exact: true }).click();
    expect(await activeId(page)).toBe(draft);
    await expect(roleInput(page)).toHaveValue('Reopen this unsaved role');

    // Remove the draft again, then the final Home. A fresh Home must remain usable.
    await workspace(page, draft).focus();
    await page.keyboard.press('Delete');
    await workspace(page, home).focus();
    await page.keyboard.press('Delete');
    await expect(workspaces(page).getByRole('tab')).toHaveCount(1);
    await expect(page).toHaveURL((url) => url.pathname === '/studio');
    expect(await activeId(page)).not.toBe(home);
  });

  test('the root link context menu opens an internal destination in another app tab', async ({
    page,
    context,
  }) => {
    await page.goto(coverRoute);
    const original = await activeId(page);
    await roleInput(page).fill('Keep this draft');
    const pagesBefore = context.pages().length;
    await openInAppTab(page, page.getByRole('link', { name: 'All letter types', exact: true }));
    await expect(workspaces(page).getByRole('tab')).toHaveCount(2);
    await expect(page).toHaveURL(
      (url) => url.pathname === '/letters/new' && !url.searchParams.has('type'),
    );
    expect(await activeId(page)).not.toBe(original);
    expect(context.pages()).toHaveLength(pagesBefore);
    await selectWorkspace(page, original);
    await expect(roleInput(page)).toHaveValue('Keep this draft');
  });

  test('opening the same saved CV twice focuses its existing workspace across site/editor layouts', async ({
    page,
    isMobile,
  }, testInfo) => {
    const response = await page.request.put(`/api/documents/${driver.id}`, {
      data: { document: driver },
    });
    expect(response.ok(), await response.text()).toBe(true);
    await page.goto('/documents');
    const documents = await activeId(page);
    const cvLink = page.getByRole('link', { name: `Open ${driver.title}`, exact: true });
    await openInAppTab(page, cvLink);
    await expect(page).toHaveURL((url) => url.pathname === `/cv/${driver.id}`);
    await expect(page.getByRole('link', { name: 'Back to Documents' })).toBeVisible();
    const editor = await activeId(page);
    await expect(workspaces(page).getByRole('tab')).toHaveCount(2);
    await expect(page.getByLabel('Full name', { exact: true })).toHaveValue(driver.basics.name);
    if (!isMobile) {
      const preview = page
        .locator('iframe[title^="Preview of your CV"]:not([aria-hidden])')
        .contentFrame();
      await expect(preview.locator('.cv-page h1')).toHaveText(driver.basics.name);
    }
    await expect(workspace(page, editor)).toBeInViewport({ ratio: 1 });
    await workspace(page, editor).click({ trial: true });
    await expect.poll(async () => (await strip(page).boundingBox())?.y).toBe(0);
    await attachWorkspaceLayout(page, testInfo, 'workspace-cv-editor');
    await selectWorkspace(page, documents);
    await openInAppTab(page, cvLink);
    expect(await activeId(page)).toBe(editor);
    await expect(workspaces(page).getByRole('tab')).toHaveCount(2);
    await expect(page).toHaveURL((url) => url.pathname === `/cv/${driver.id}`);
  });

  test('two seeded CVs keep independent edits and undo/redo histories after switching and reloading', async ({
    page,
  }) => {
    const firstDoc = { ...driver, id: 'workspace-cv-first', title: 'First workspace CV' };
    const secondDoc = {
      ...driver,
      id: 'workspace-cv-second',
      title: 'Second workspace CV',
      basics: { ...driver.basics, name: 'Second original name' },
    };
    await seedDocument(page, firstDoc);
    await seedDocument(page, secondDoc);
    await page.goto('/documents');
    const documents = await activeId(page);
    await openInAppTab(
      page,
      page.getByRole('link', { name: `Open ${firstDoc.title}`, exact: true }),
    );
    const first = await activeId(page);
    const name = page.getByLabel('Full name', { exact: true });
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    const redo = page.getByRole('button', { name: 'Redo', exact: true });
    await expect(name).toHaveValue(driver.basics.name);
    await name.fill('First edited name');

    await selectWorkspace(page, documents);
    await openInAppTab(
      page,
      page.getByRole('link', { name: `Open ${secondDoc.title}`, exact: true }),
    );
    const second = await activeId(page);
    expect(second).not.toBe(first);
    await expect(name).toHaveValue('Second original name');
    await name.fill('Second edited name');

    await selectWorkspace(page, first);
    await expect(name).toHaveValue('First edited name');
    await undo.click();
    await expect(name).toHaveValue(driver.basics.name);
    await selectWorkspace(page, second);
    await expect(name).toHaveValue('Second edited name');
    await page.reload();
    expect(await activeId(page)).toBe(second);
    await expect(name).toHaveValue('Second edited name');
    await undo.click();
    await expect(name).toHaveValue('Second original name');
    await redo.click();
    await expect(name).toHaveValue('Second edited name');

    // The inactive CV's redo stack must survive the other CV's edits and a browser reload.
    await selectWorkspace(page, first);
    await expect(name).toHaveValue(driver.basics.name);
    await redo.click();
    await expect(name).toHaveValue('First edited name');
    await page.reload();
    expect(await activeId(page)).toBe(first);
    await expect(name).toHaveValue('First edited name');
    await undo.click();
    await expect(name).toHaveValue(driver.basics.name);
    await redo.click();
    await expect(name).toHaveValue('First edited name');
    await selectWorkspace(page, second);
    await expect(name).toHaveValue('Second edited name');
  });

  test('an uploaded file survives switching and reload while its interrupted task is not replayed', async ({
    page,
    isMobile,
  }) => {
    const filePath = join(process.cwd(), 'src/modules/import/__fixtures__/word-sales.docx');
    const originalBytes = await readFile(filePath);
    await page.goto('/makeover');
    const origin = await activeId(page);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let uploadRequests = 0;
    await page.route('**/api/makeover', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      uploadRequests++;
      // Leave the request in flight until reload interrupts it; do not manufacture a result.
      await gate;
      await route.abort().catch(() => {});
    });
    try {
      await page.getByTestId('makeover-file').setInputFiles(filePath);
      await expect.poll(() => uploadRequests).toBe(1);
      await expect(workspace(page, origin).getByLabel('Working')).toBeVisible();
      const home = await newHome(page); // Flush the selected File and running task before reload.
      await expect(workspace(page, origin).getByLabel('Working')).toBeVisible();
      await page.reload();
      release();
      expect(await activeId(page)).toBe(home);
      await expect(workspace(page, origin).getByLabel('Needs attention')).toBeVisible();
      await expect(workspace(page, origin).getByLabel('Working')).toHaveCount(0);
      await selectWorkspace(page, origin);
      await expect(page.getByTestId('makeover-file')).toBeAttached();
      await expect(page.getByTestId('makeover-progress')).toHaveCount(0);
      await strip(page).getByRole('button', { name: 'Workspace activity' }).click();
      await expect(strip(page).getByRole('status')).toContainText(
        'Interrupted when the app closed',
      );

      // Recovery exposes the actual persisted Blob bytes, not just a surviving filename.
      await signOut(page, isMobile);
      const prompt = exitPrompt(page);
      await expect(prompt).toBeVisible();
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        prompt.getByRole('button', { name: 'Download recovery copy' }).click(),
      ]);
      const archivePath = await download.path();
      expect(archivePath).not.toBeNull();
      const archive = await JSZip.loadAsync(await readFile(archivePath!));
      const attachments = archive.file(/^files\/.*word-sales\.docx$/);
      expect(attachments.length).toBeGreaterThan(0);
      for (const attachment of attachments)
        expect(await attachment.async('nodebuffer')).toEqual(originalBytes);
      const drafts = await archive.file('workspace-drafts.json')!.async('string');
      expect(drafts).toContain(origin);
      expect(drafts).toContain(attachments[0]!.name);
      await prompt.getByRole('button', { name: 'Stay signed in', exact: true }).click();
      await expect(prompt).toBeHidden();
      expect(uploadRequests).toBe(1);
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });

  test('an external job link is read once and reload keeps the result without replaying AI', async ({
    page,
    baseURL,
  }) => {
    let calls = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/jobs/fetch' && request.method() === 'POST')
        calls++;
    });
    const link = `${baseURL!.replace('localhost', '127.0.0.1')}/api/test/job-page/plain`;
    await page.goto(`/jobs?new=1&url=${encodeURIComponent(link)}`);
    const origin = await activeId(page);
    const form = page.getByRole('form', { name: 'Add a job' });
    await expect(form.getByTestId('job-read')).toBeVisible();
    await expect(form.getByLabel('Job title')).toHaveValue('Van Driver');
    const other = await newHome(page); // Switching flushes the completed form before reload.
    await selectWorkspace(page, origin);
    await page.reload();
    await expect(form.getByLabel('Job title')).toHaveValue('Van Driver');
    await expect(form.getByTestId('job-read')).toBeVisible();
    await selectWorkspace(page, other);
    await selectWorkspace(page, origin);
    expect(calls).toBe(1);
  });

  test('LinkedIn generation preserves an edited result when its target changes after remount', async ({
    page,
  }) => {
    await seedDocument(page, driver);
    await page.goto(`/linkedin?doc=${driver.id}`);
    const origin = await activeId(page);
    const target = page.getByLabel('The kind of role you want next');
    const result = page.getByTestId('linkedin-result');
    await target.fill('transport planning');
    await page.getByRole('button', { name: 'Write my LinkedIn profile', exact: true }).click();
    await expect(result.getByLabel('About', { exact: true })).toHaveValue(
      /open to transport planning roles/,
    );
    await result.getByLabel('Headline', { exact: true }).fill('My own transport planning headline');
    await target.fill('warehouse management');
    const delayed = await delayGeneration(page, '**/api/ai/linkedin.write');
    try {
      await page.getByRole('button', { name: 'Write again', exact: true }).click();
      await delayed.started();
      await expect(workspace(page, origin).getByLabel('Working')).toBeVisible();
      const foreground = await newHome(page);
      await chooseCoverLetter(page);
      await roleInput(page).fill('Unrelated foreground letter');
      await selectWorkspace(page, origin);
      // The result itself stays unchanged during this request: the target guard must protect it.
      await target.fill('fleet scheduling');
      await selectWorkspace(page, foreground);
      delayed.release();
      await expect(workspace(page, origin).getByLabel('Complete')).toBeVisible();
      expect(await activeId(page)).toBe(foreground);
      await expect(roleInput(page)).toHaveValue('Unrelated foreground letter');
      await selectWorkspace(page, origin);
      await expect(target).toHaveValue('fleet scheduling');
      await expect(result.getByLabel('Headline', { exact: true })).toHaveValue(
        'My own transport planning headline',
      );
      await expect(result.getByLabel('About', { exact: true })).toHaveValue(
        /open to transport planning roles/,
      );
      await expect(
        page.getByRole('heading', { name: 'Generated suggestion', exact: true }),
      ).toBeVisible();
      await expect(page.getByText(/open to warehouse management roles/)).toBeVisible();
      await page.getByRole('button', { name: 'Use this suggestion', exact: true }).click();
      await expect(result.getByLabel('About', { exact: true })).toHaveValue(
        /open to warehouse management roles/,
      );
      await expect(target).toHaveValue('fleet scheduling');
      await expect(
        page.getByRole('heading', { name: 'Generated suggestion', exact: true }),
      ).toHaveCount(0);
      expect(delayed.requestCount()).toBe(1);
    } finally {
      await delayed.dispose();
    }
  });

  test('Story generation preserves a manual draft when generation notes change after remount', async ({
    page,
  }) => {
    await seedDocument(page, driver);
    await page.goto('/stories');
    const origin = await activeId(page);
    await page.getByRole('button', { name: 'New story', exact: true }).click();
    const editor = page.getByTestId('story-editor');
    await editor.getByLabel('Title', { exact: true }).fill('My own delivery story');
    await editor
      .getByLabel('Action', { exact: true })
      .fill('I checked every delivery slot myself.');
    await editor.getByLabel('Anything to add?').fill('The depot manager thanked me for it.');
    const delayed = await delayGeneration(page, '**/api/stories/draft');
    try {
      await editor.getByRole('button', { name: 'Draft with AI', exact: true }).click();
      await delayed.started();
      await expect(workspace(page, origin).getByLabel('Working')).toBeVisible();
      const foreground = await newHome(page);
      await chooseCoverLetter(page);
      await roleInput(page).fill('Keep the other tab’s letter');
      await selectWorkspace(page, origin);
      // Change only generation input, so comparing the story draft alone cannot pass this test.
      await editor
        .getByLabel('Anything to add?')
        .fill('Use my revised notes about route planning.');
      await selectWorkspace(page, foreground);
      delayed.release();
      await expect(workspace(page, origin).getByLabel('Complete')).toBeVisible();
      expect(await activeId(page)).toBe(foreground);
      await expect(roleInput(page)).toHaveValue('Keep the other tab’s letter');
      await selectWorkspace(page, origin);
      await expect(editor.getByLabel('Title', { exact: true })).toHaveValue(
        'My own delivery story',
      );
      await expect(editor.getByLabel('Action', { exact: true })).toHaveValue(
        'I checked every delivery slot myself.',
      );
      await expect(editor.getByLabel('Anything to add?')).toHaveValue(
        'Use my revised notes about route planning.',
      );
      const suggestion = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: /^Suggested story:/ }) });
      await expect(suggestion).toContainText('The depot manager thanked me for it.');
      await suggestion.getByRole('button', { name: 'Use this story', exact: true }).click();
      await expect(editor.getByLabel('Action', { exact: true })).toHaveValue(/thanked me/);
      await expect(editor.getByLabel('Anything to add?')).toHaveValue(
        'Use my revised notes about route planning.',
      );
      expect(delayed.requestCount()).toBe(1);
    } finally {
      await delayed.dispose();
    }
  });

  test('LinkedIn and Story generation automatically apply unchanged origin inputs across remounts', async ({
    page,
  }) => {
    await seedDocument(page, driver);
    // Each workflow gets its own task and background completion; no explicit suggestion action.
    for (const kind of ['linkedin', 'story'] as const) {
      await page.goto(kind === 'linkedin' ? `/linkedin?doc=${driver.id}` : '/stories');
      const origin = await activeId(page);
      if (kind === 'linkedin') {
        await page.getByLabel('The kind of role you want next').fill('transport planning');
      } else {
        await page.getByRole('button', { name: 'New story', exact: true }).click();
        await page
          .getByTestId('story-editor')
          .getByLabel('Anything to add?')
          .fill('The depot manager thanked me for it.');
      }
      const delayed = await delayGeneration(
        page,
        kind === 'linkedin' ? '**/api/ai/linkedin.write' : '**/api/stories/draft',
      );
      try {
        await page
          .getByRole('button', {
            name: kind === 'linkedin' ? 'Write my LinkedIn profile' : 'Draft with AI',
            exact: true,
          })
          .click();
        await delayed.started();
        const foreground = await newHome(page);
        await selectWorkspace(page, origin); // Remount without changing any generation input.
        await selectWorkspace(page, foreground);
        delayed.release();
        await expect(workspace(page, origin).getByLabel('Complete')).toBeVisible();
        expect(await activeId(page)).toBe(foreground);
        await expect(page).toHaveURL((url) => url.pathname === '/studio');
        await selectWorkspace(page, origin);
        if (kind === 'linkedin') {
          await expect(
            page.getByTestId('linkedin-result').getByLabel('About', { exact: true }),
          ).toHaveValue(/open to transport planning roles/);
          await expect(
            page.getByRole('button', { name: 'Use this suggestion', exact: true }),
          ).toHaveCount(0);
        } else {
          await expect(
            page.getByTestId('story-editor').getByLabel('Action', { exact: true }),
          ).toHaveValue(/thanked me/);
          await expect(
            page.getByRole('button', { name: 'Use this story', exact: true }),
          ).toHaveCount(0);
        }
        expect(delayed.requestCount()).toBe(1);
      } finally {
        await delayed.dispose();
      }
    }
  });

  test('browser back/forward restores route drafts and workspace identity without adding tabs', async ({
    page,
  }) => {
    await page.goto(coverRoute);
    const first = await activeId(page);
    await roleInput(page).fill('History draft');
    await page.getByRole('link', { name: 'All letter types', exact: true }).click();
    await page.getByRole('link', { name: /^Resignation letter/ }).click();
    await page
      .getByRole('form', { name: 'Resignation letter' })
      .getByLabel('Your current role')
      .fill('History resignation');
    await page.goBack();
    await expect(page).toHaveURL(
      (url) => url.pathname === '/letters/new' && !url.searchParams.has('type'),
    );
    await page.goBack();
    await expect(roleInput(page)).toHaveValue('History draft');
    expect(await activeId(page)).toBe(first);
    await page.goForward();
    await expect(page).toHaveURL(
      (url) => url.pathname === '/letters/new' && !url.searchParams.has('type'),
    );
    await page.goForward();
    await expect(
      page.getByRole('form', { name: 'Resignation letter' }).getByLabel('Your current role'),
    ).toHaveValue('History resignation');
    await expect(workspaces(page).getByRole('tab')).toHaveCount(1);
    const second = await newHome(page);
    await page.goBack();
    expect(await activeId(page)).toBe(first);
    await expect(workspaces(page).getByRole('tab')).toHaveCount(2);
    await page.goForward();
    expect(await activeId(page)).toBe(second);
  });

  test('a global account visit preserves the existing tabs and their drafts', async ({ page }) => {
    await page.goto(coverRoute);
    const draft = await activeId(page);
    await roleInput(page).fill('Keep through account settings');
    const home = await newHome(page); // Controlled navigation flushes the draft before the full visit.
    await page.goto('/account');
    await expect(page.getByRole('region', { name: 'Account actions' })).toBeVisible();
    await expect(workspaces(page)).toHaveCount(0);
    await page
      .getByRole('region', { name: 'Account actions' })
      .getByRole('link', { name: 'Documents', exact: true })
      .click();
    await expect(workspaces(page).getByRole('tab')).toHaveCount(2);
    expect(await activeId(page)).toBe(home);
    await selectWorkspace(page, draft);
    await expect(roleInput(page)).toHaveValue('Keep through account settings');
  });

  test('a delayed creation completes in its original tab without stealing navigation or another draft', async ({
    page,
  }) => {
    await page.goto(coverRoute);
    const origin = await activeId(page);
    await roleInput(page).fill('Background delivery role');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = false;
    let createdId = '';
    let createRequests = 0;
    await page.route('**/api/letters', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      createRequests++;
      started = true;
      await gate;
      // Forward the real write after the UI unmounts; no manufactured API success.
      const response = await route.fetch();
      const body = (await response.json()) as { letter: { id: string } };
      createdId = body.letter.id;
      await route.fulfill({ response });
    });
    try {
      await coverForm(page).getByRole('button', { name: 'Write it myself' }).click();
      await expect.poll(() => started).toBe(true);
      await expect(workspace(page, origin).getByLabel('Working')).toBeVisible();
      const other = await newHome(page);
      await chooseCoverLetter(page);
      await roleInput(page).fill('Foreground design role');
      release();
      await expect(workspace(page, origin).getByLabel('Complete')).toBeVisible();
      expect(await activeId(page)).toBe(other);
      await expect(roleInput(page)).toHaveValue('Foreground design role');
      expect(createRequests).toBe(1);
      expect(createdId).not.toBe('');
      await selectWorkspace(page, origin);
      await expect(page).toHaveURL((url) => url.pathname === `/letters/${createdId}`);
      await expect(page.getByLabel('Subject', { exact: true })).toHaveValue(
        'Application: Background delivery role',
      );
      await selectWorkspace(page, other);
      await expect(roleInput(page)).toHaveValue('Foreground design role');
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });

  test('another window’s draft triggers Stay, Retry, recovery download and explicit discard at signout', async ({
    page,
    context,
    isMobile,
  }) => {
    await page.goto(coverRoute);
    const draft = await activeId(page);
    await roleInput(page).fill('Draft from the other browser window');
    const sibling = await context.newPage();
    allowReload(sibling);
    try {
      await sibling.goto('/studio');
      await activeId(sibling);
      await expect(workspaces(sibling).getByRole('tab')).toHaveCount(1);
      const me = (await (await sibling.request.get('/api/me')).json()) as { user: { uid: string } };
      // Restored windows may share tab IDs, but each owns a separate writable session.
      const sessionKey = `cvstudio:workspace-window:${me.user.uid}`;
      const originalSession = await page.evaluate((key) => sessionStorage.getItem(key), sessionKey);
      const siblingSession = await sibling.evaluate(
        (key) => sessionStorage.getItem(key),
        sessionKey,
      );
      expect(originalSession).toBeTruthy();
      expect(siblingSession).toBeTruthy();
      expect(siblingSession).not.toBe(originalSession);
      let deletions = 0;
      sibling.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/session' && request.method() === 'DELETE')
          deletions++;
      });
      await signOut(sibling, isMobile);
      const prompt = exitPrompt(sibling);
      await expect(prompt).toBeVisible();
      for (const name of [
        'Stay signed in',
        'Retry saving',
        'Download recovery copy',
        'Discard local work and sign out',
      ])
        await expect(prompt.getByRole('button', { name, exact: true })).toBeVisible();
      await prompt.getByRole('button', { name: 'Stay signed in', exact: true }).click();
      await expect(prompt).toBeHidden();
      await roleInput(page).fill('Still editable after Stay');
      await expect(roleInput(page)).toHaveValue('Still editable after Stay');
      expect(deletions).toBe(0);

      await signOut(sibling, isMobile);
      await expect(prompt).toBeVisible();
      await prompt.getByRole('button', { name: 'Retry saving', exact: true }).click();
      // Saving to this device does not authorize dropping the other window's unsaved form.
      await expect(prompt.getByRole('button', { name: 'Download recovery copy' })).toBeVisible();
      const [download] = await Promise.all([
        sibling.waitForEvent('download'),
        prompt.getByRole('button', { name: 'Download recovery copy' }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/^cv-studio-recovery-.*\.zip$/);
      const archivePath = await download.path();
      expect(archivePath).not.toBeNull();
      const archive = await JSZip.loadAsync(await readFile(archivePath!));
      expect(archive.file('cv-backup.json')).not.toBeNull();
      const restored = await archive.file('workspace-drafts.json')!.async('string');
      expect(restored).toContain('Still editable after Stay');
      expect(restored).toContain(draft);
      const sessions = JSON.parse(restored) as { ownerUid: string }[];
      expect(sessions.length).toBeGreaterThanOrEqual(2);
      expect(sessions.every((session) => session.ownerUid === me.user.uid)).toBe(true);
      await expect(prompt).toBeVisible();
      expect(deletions).toBe(0);
      expect((await (await sibling.request.get('/api/me')).json()).user.uid).toBe(me.user.uid);

      await prompt
        .getByRole('button', { name: 'Discard local work and sign out', exact: true })
        .click();
      await expect(sibling).toHaveURL((url) => url.pathname === '/');
      await expect(workspaces(sibling)).toHaveCount(0);
      await expect(workspaces(page)).toHaveCount(0);
      expect(deletions).toBe(1);
      expect((await (await sibling.request.get('/api/me')).json()).user).toBeNull();
    } finally {
      await sibling.close();
    }
  });

  test('replacing the account cannot load another owner’s draft, and returning restores only that owner’s work', async ({
    page,
  }) => {
    await page.goto(coverRoute);
    const first = await activeId(page);
    const owner = (await (await page.request.get('/api/me')).json()).user as {
      uid: string;
      email: string;
    };
    await roleInput(page).fill('Private draft belonging to the first account');
    const ownerHref = page.url();
    await newHome(page); // Commit the first owner's snapshot before replacement.
    await apiSignUp(page.request);
    await page.goto(ownerHref);
    await expect(roleInput(page)).toHaveValue('');
    expect(await activeId(page)).not.toBe(first);
    await roleInput(page).fill('Second account’s private draft');
    await newHome(page);

    const signedIn = await page.request.post(
      `${EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-key`,
      { data: { email: owner.email, password: PASSWORD, returnSecureToken: true } },
    );
    expect(signedIn.ok()).toBe(true);
    const { idToken } = (await signedIn.json()) as { idToken: string };
    expect((await page.request.post('/api/session', { data: { idToken } })).ok()).toBe(true);
    await page.goto(ownerHref);
    expect(await activeId(page)).toBe(first);
    await expect(roleInput(page)).toHaveValue('Private draft belonging to the first account');
    await expect(roleInput(page)).not.toHaveValue('Second account’s private draft');
  });
});

test.describe('visitors', () => {
  test.use({ as: 'visitor' });
  test('guest job and letter routes do not expose workspace tabs or creation controls', async ({
    page,
  }) => {
    await page.goto('/jobs');
    await expect(
      page.getByRole('heading', { name: 'Sign in to track your applications' }),
    ).toBeVisible();
    await expect(workspaces(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New workspace', exact: true })).toHaveCount(0);
    await page.goto(coverRoute);
    await expect(
      page.getByRole('heading', { name: 'Sign in to write and keep letters' }),
    ).toBeVisible();
    await expect(workspaces(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New workspace', exact: true })).toHaveCount(0);
  });
});

test.describe('review regression: restored server records and saved forms', () => {
  test.beforeEach(async ({ page }) => allowReload(page));

  for (const unsaved of [false, true]) {
    test(`portfolio restores current privacy settings with unsaved address=${unsaved}`, async ({
      page,
    }, info) => {
      await seedDocument(page, driver);
      await page.goto('/portfolio');
      await expect
        .poll(async () => (await page.request.get(`/api/documents/${driver.id}`)).status())
        .toBe(200);
      const slug = `review-${info.project.name}-${Date.now().toString(36)}`;
      await page.getByLabel('Your address').fill(slug);
      await page.getByLabel('Show my email address').check();
      await page.getByRole('button', { name: 'Create my page' }).click();
      await expect(page.getByTestId('portfolio-live')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
      if (unsaved) await page.getByLabel('Your address').fill(`${slug}-draft`);
      const current = (await (await page.request.get('/api/portfolio')).json()).portfolio;
      expect(
        (
          await page.request.put('/api/portfolio', {
            data: { ...current, published: false, showEmail: false, showPhone: false },
          })
        ).ok(),
      ).toBe(true);
      let release!: () => void;
      if (unsaved) {
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        await page.route('**/api/portfolio', async (route) => {
          if (route.request().method() === 'GET') await gate;
          await route.continue();
        });
      }
      try {
        await page.reload();
        if (unsaved)
          await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
      } finally {
        release?.();
      }
      await expect(page.getByLabel('Page is published')).not.toBeChecked();
      await expect(page.getByLabel('Show my email address')).not.toBeChecked();
      await expect(page.getByLabel('Your address')).toHaveValue(unsaved ? `${slug}-draft` : slug);
      if (unsaved) {
        await page.getByRole('button', { name: 'Save changes' }).click();
        await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
        const saved = (await (await page.request.get('/api/portfolio')).json()).portfolio;
        expect(saved).toMatchObject({ slug: `${slug}-draft`, published: false, showEmail: false });
      }
    });
  }

  test('letter reload refreshes saved content and tone while retaining a personal edit', async ({
    page,
  }) => {
    const created = await page.request.post('/api/letters', {
      data: {
        type: 'cover',
        subject: 'Application',
        greeting: 'Original greeting',
        paragraphs: ['Original paragraph'],
        tone: 'warm',
      },
    });
    expect(created.ok()).toBe(true);
    const { letter } = await created.json();
    await page.goto(`/letters/${letter.id}`);
    await expect(page.getByLabel('Greeting')).toHaveValue('Original greeting');
    expect(
      (
        await page.request.put(`/api/letters/${letter.id}`, {
          data: {
            greeting: 'Remote greeting',
            paragraphs: ['Remote paragraph'],
            tone: 'formal',
            expectedRevision: letter.revision,
          },
        })
      ).ok(),
    ).toBe(true);
    await page.reload();
    await expect(page.getByLabel('Greeting')).toHaveValue('Remote greeting');
    await expect(page.getByLabel('Paragraph 1', { exact: true })).toHaveValue('Remote paragraph');
    await page.getByText('Your answers and a new AI draft', { exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Formal', exact: true })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeEnabled();
    await page.getByLabel('Greeting').fill('My personal greeting');
    expect(
      (
        await page.request.put(`/api/letters/${letter.id}`, {
          data: {
            greeting: 'Another remote greeting',
            paragraphs: ['Newest paragraph'],
          },
        })
      ).ok(),
    ).toBe(true);
    await page.reload();
    await expect(page.getByLabel('Greeting')).toHaveValue('My personal greeting');
    await expect(page.getByLabel('Paragraph 1', { exact: true })).toHaveValue('Newest paragraph');
    await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeDisabled();
  });

  test('job reload updates stage and revision without replacing unsaved notes', async ({
    page,
  }) => {
    const created = await page.request.post('/api/jobs', {
      data: { title: 'Engineer', notes: 'Original notes' },
    });
    expect(created.ok()).toBe(true);
    const { job } = await created.json();
    await page.goto(`/jobs/${job.id}`);
    await expect(page.getByLabel(/^Notes/)).toHaveValue('Original notes');
    await page.getByLabel(/^Notes/).fill('My unsaved notes');
    expect(
      (
        await page.request.put(`/api/jobs/${job.id}`, {
          data: { stage: 'applied', expectedRevision: job.revision },
        })
      ).ok(),
    ).toBe(true);
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Applied', exact: true })).toBeChecked();
    await expect(page.getByLabel(/^Notes/)).toHaveValue('My unsaved notes');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
    const latest = (await (await page.request.get(`/api/jobs/${job.id}`)).json()).job;
    expect(latest).toMatchObject({ stage: 'applied', notes: 'My unsaved notes' });
    expect(latest.revision).toBeGreaterThan(job.revision);
  });

  test('saved story and job forms allow sign-out without a false recovery prompt', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/stories');
    await page.getByRole('button', { name: 'New story', exact: true }).click();
    await page
      .getByTestId('story-editor')
      .getByLabel('Title', { exact: true })
      .fill('Reduced delays');
    await page
      .getByTestId('story-editor')
      .getByLabel('Action', { exact: true })
      .fill('I improved scheduling.');
    await page.getByRole('button', { name: 'Save story', exact: true }).click();
    await expect(page.getByTestId('story-editor')).toBeHidden();
    await page.goto('/jobs?new=1');
    await page.getByLabel('Job title', { exact: true }).fill('Engineer');
    await page.getByRole('button', { name: 'Save job', exact: true }).click();
    await expect(page.getByRole('form', { name: 'Add a job' })).toBeHidden();
    await signOut(page, isMobile);
    await expect(exitPrompt(page)).toBeHidden();
    await expect(workspaces(page)).toBeHidden();
  });

  test('skill plans can switch from a typed role back to a saved job', async ({ page }) => {
    await seedDocument(page, driver);
    const created = await page.request.post('/api/jobs', { data: { title: 'Engineer' } });
    expect(created.ok()).toBe(true);
    const { job } = await created.json();
    await page.goto('/skills?role=Planner');
    await expect(page.getByLabel('The role', { exact: true })).toHaveValue('Planner');
    await page.getByLabel('One of my jobs', { exact: true }).check();
    await expect(page.getByLabel('Job', { exact: true })).toBeEnabled();
    await expect(page.getByLabel('Job', { exact: true })).toHaveValue(job.id);
    await page.getByLabel('A role I’d like', { exact: true }).check();
    await expect(page.getByLabel('The role', { exact: true })).toHaveValue('Planner');
  });
});
