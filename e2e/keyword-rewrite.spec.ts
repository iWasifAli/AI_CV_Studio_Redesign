import { createHash } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './support/test';
import { seedDocument } from './support/seed';
import { setConfig } from './support/auth';
import { DEFAULT_CONFIG } from '../src/modules/billing/config';
import { driver } from '../src/modules/resume/fixtures';
import type { ResumeDocument } from '../src/modules/resume/schema';

const ADVERT =
  'Forklift and Cold chain skills are essential for delivery work. Plan delivery routes carefully and provide reliable customer service every day.';
const fingerprint = createHash('sha256').update(ADVERT).digest('hex');
const key = `cvstudio:v1:doc:${driver.id}`;
const summary = (page: Page) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).basics.summary as string, key);
const kw = (page: Page) => page.getByTestId('ats-keywords');
const pick = (page: Page, term = 'Forklift') =>
  kw(page).getByRole('checkbox', { name: term, exact: true });
const rewrite = (page: Page) => page.getByTestId('keyword-rewrite');

async function openKeywords(page: Page, doc: ResumeDocument = driver) {
  await page.addInitScript((doc) => {
    const marker = `keyword-test-seeded:${doc.id}`;
    if (sessionStorage.getItem(marker)) return;
    sessionStorage.setItem(marker, '1');
    if (!localStorage.getItem(`cvstudio:v1:doc:${doc.id}`))
      localStorage.setItem(`cvstudio:v1:doc:${doc.id}`, JSON.stringify(doc));
  }, doc);
  await page.goto('/documents');
  const response = await page.request.post('/api/jobs', {
    data: { title: 'Delivery Driver', advert: ADVERT },
  });
  expect(response.ok()).toBe(true);
  const { job } = await response.json();
  await page.route('**/api/quality/ats', (route) =>
    route.fulfill({
      json: {
        report: {
          at: new Date().toISOString(),
          checks: [],
          sample: ['PDF source'],
          keywords: {
            jobTitle: job.title,
            jobId: job.id,
            advertFingerprint: fingerprint,
            present: [],
            missing: [{ term: 'Forklift' }, { term: 'Cold chain' }],
          },
        },
      },
    }),
  );
  await page.goto(`/cv/${doc.id}?tab=check`);
  await page.getByLabel('Check keywords for a job').selectOption(job.id);
  await page.getByRole('button', { name: 'Run the ATS check' }).click();
  await expect(pick(page)).toBeVisible();
  if (await rewrite(page).count()) await expect(rewrite(page)).toBeDisabled();
  return job;
}

/** Hold a genuine API result so concurrent editor/window actions are deterministic. */
async function holdRewrite(page: Page) {
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((r) => {
    release = r;
  });
  const ready = new Promise<void>((r) => {
    started = r;
  });
  await page.route('**/api/quality/keywords/rewrite', async (route) => {
    const response = await route.fetch();
    started();
    await waiting;
    await route.fulfill({ response }).catch(() => {});
  });
  return { release, ready };
}

test.beforeEach(async ({ request }) => {
  await setConfig(request, DEFAULT_CONFIG);
});

test('selected keywords rewrite the saved CV in one Undo/Redo step and follow live coverage', async ({
  page,
  isMobile,
}) => {
  await openKeywords(page);
  await pick(page).check();
  await pick(page, 'Cold chain').check();
  await rewrite(page).click();
  await expect(page.getByTestId('keyword-result')).toContainText('Included: Forklift, Cold chain');
  await expect.poll(() => summary(page)).toContain('Skills include Forklift, Cold chain.');
  await expect(kw(page).getByRole('list', { name: 'Keywords in your CV' })).toContainText(
    'Forklift',
  );
  await expect(page.getByTestId('ats-report')).toContainText('Your CV changed.');
  if (!isMobile)
    await expect(
      page
        .locator('iframe[title^="Preview of your CV"]:not([aria-hidden])')
        .contentFrame()
        .getByText(/Skills include Forklift, Cold chain/),
    ).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => summary(page)).toBe(driver.basics.summary);
  await expect(pick(page)).toBeVisible();
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => summary(page)).toContain('Forklift');
  await expect(kw(page).getByRole('list', { name: 'Keywords in your CV' })).toContainText(
    'Cold chain',
  );
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
    [],
  );
  await page.screenshot({
    path: test.info().outputPath('keyword-rewrite.png'),
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByTestId('keyword-result')).toBeVisible();
  await expect(kw(page).getByRole('list', { name: 'Keywords in your CV' })).toContainText(
    'Forklift',
  );
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('the job match entry opens its recorded CV even after choosing another source', async ({
  page,
}) => {
  const other = { ...driver, id: `${driver.id}-other`, title: 'Another CV' };
  await seedDocument(page, driver);
  await seedDocument(page, other);
  await page.goto('/documents');
  const response = await page.request.post('/api/jobs', {
    data: { title: 'Delivery Driver', advert: ADVERT },
  });
  const { job } = await response.json();
  expect(
    (await page.request.post(`/api/jobs/${job.id}/match`, { data: { document: driver } })).ok(),
  ).toBe(true);
  await page.goto(`/jobs/${job.id}`);
  await page.getByLabel('Use this CV').selectOption(other.id);
  const link = page.getByTestId('match-keyword-rewrite');
  await expect(link).toHaveAttribute(
    'href',
    `/cv/${driver.id}?tab=check&job=${job.id}&keywords=match#ats-keywords`,
  );
  let atsRequests = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/api/quality/ats')) atsRequests++;
  });
  await link.click();
  await expect(kw(page)).toBeVisible();
  await expect(kw(page).getByRole('checkbox', { name: /forklift/i })).not.toBeChecked();
  expect(atsRequests).toBe(0);
  await kw(page)
    .getByRole('checkbox', { name: /forklift/i })
    .check();
  await rewrite(page).click();
  await expect.poll(() => summary(page)).toContain('forklift');
  expect(
    await page.evaluate(
      (id) => JSON.parse(localStorage.getItem(`cvstudio:v1:doc:${id}`)!).basics.summary,
      other.id,
    ),
  ).toBe(driver.basics.summary);
});

test('a pending personal edit rejects the late rewrite', async ({ page, isMobile }) => {
  await openKeywords(page);
  const held = await holdRewrite(page);
  await pick(page).check();
  await rewrite(page).click();
  await held.ready;
  // Content remains editable while the request is running. Leaving Check cancels its request.
  await (
    isMobile
      ? page.getByRole('button', { name: 'Edit', exact: true })
      : page.getByRole('tab', { name: 'Content', exact: true })
  ).click();
  await page.getByLabel('A short introduction', { exact: true }).fill('My newer personal profile');
  held.release();
  await expect.poll(() => summary(page)).toBe('My newer personal profile');
  await (
    isMobile
      ? page.getByRole('button', { name: 'Check', exact: true })
      : page.getByRole('tab', { name: 'Check', exact: true })
  ).click();
  await expect(pick(page)).toBeVisible();
  await expect(page.getByTestId('keyword-result')).toHaveCount(0);
});

test('a failed overlapping ATS check clears the cancelled rewrite spinner', async ({ page }) => {
  await openKeywords(page);
  const held = await holdRewrite(page);
  await pick(page).check();
  await rewrite(page).click();
  await held.ready;
  await page.route('**/api/quality/ats', (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'Check unavailable' } } }),
  );
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(page.getByTestId('ats')).toContainText('Check unavailable');
  await expect(rewrite(page)).toBeEnabled();
  held.release();
  await expect(page.getByTestId('keyword-result')).toHaveCount(0);
  expect(await summary(page)).toBe(driver.basics.summary);
  await page.unroute('**/api/quality/keywords/rewrite');
  await rewrite(page).click();
  await expect.poll(() => summary(page)).toContain('Forklift');
});

test('switching workspaces before the save debounce preserves a writable editor', async ({
  page,
  isMobile,
}) => {
  await openKeywords(page);
  await page.getByTestId('tab-new').click();
  await page.goto(`/cv/${driver.id}`);
  const tabs = page.getByTestId('tab-strip').getByTestId('tab');
  await tabs.first().click();
  await (
    isMobile
      ? page.getByRole('button', { name: 'Edit', exact: true })
      : page.getByRole('tab', { name: 'Content', exact: true })
  ).click();
  const input = page.getByLabel('A short introduction', { exact: true });
  await input.fill('Flushed at workspace switch');
  await tabs.nth(1).click();
  await (
    isMobile
      ? page.getByRole('button', { name: 'Edit', exact: true })
      : page.getByRole('tab', { name: 'Content', exact: true })
  ).click();
  await expect(input).toHaveValue('Flushed at workspace switch');
  await input.fill('Saved by the replacement editor');
  await expect.poll(() => summary(page)).toBe('Saved by the replacement editor');
  await page.reload();
  await (
    isMobile
      ? page.getByRole('button', { name: 'Edit', exact: true })
      : page.getByRole('tab', { name: 'Content', exact: true })
  ).click();
  await expect(input).toHaveValue('Saved by the replacement editor');
});

test('external updates and deletion cannot be overwritten by a late result', async ({ page }) => {
  await openKeywords(page);
  for (const mode of ['external', 'deleted']) {
    const held = await holdRewrite(page);
    await pick(page).check();
    await rewrite(page).click();
    await held.ready;
    await page.evaluate(
      ({ key, mode }) => {
        if (mode === 'deleted') localStorage.removeItem(key);
        else {
          const d = JSON.parse(localStorage.getItem(key)!);
          d.basics.summary = 'Changed in another window';
          localStorage.setItem(key, JSON.stringify(d));
        }
      },
      { key, mode },
    );
    held.release();
    await expect(kw(page)).toContainText('Your CV changed while rewriting.');
    if (mode === 'external') {
      await expect.poll(() => summary(page)).toBe('Changed in another window');
      // Restore the original baseline to exercise deletion independently.
      await page.evaluate(({ key, doc }) => localStorage.setItem(key, JSON.stringify(doc)), {
        key,
        doc: driver,
      });
    } else expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
    await page.unroute('**/api/quality/keywords/rewrite');
  }
});

test('Cancel and an offline failure leave the CV unchanged and permit retry', async ({ page }) => {
  await openKeywords(page);
  const held = await holdRewrite(page);
  await pick(page).check();
  await rewrite(page).click();
  await held.ready;
  await kw(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  held.release();
  await expect(rewrite(page)).toBeEnabled();
  expect(await summary(page)).toBe(driver.basics.summary);
  await page.unroute('**/api/quality/keywords/rewrite');
  await page.route('**/api/quality/keywords/rewrite', (route) =>
    route.abort('internetdisconnected'),
  );
  await rewrite(page).click();
  await expect(kw(page)).toContainText('Check your connection and try again.');
  expect(await summary(page)).toBe(driver.basics.summary);
  await page.unroute('**/api/quality/keywords/rewrite');
  await rewrite(page).click();
  await expect.poll(() => summary(page)).toContain('Forklift');
});

test('safe partial output applies together and explains skipped terms; an empty response leaves text unchanged', async ({
  page,
}) => {
  await openKeywords(page);
  const before = await summary(page);
  await page.route('**/api/quality/keywords/rewrite', (route) =>
    route.fulfill({
      json: {
        patches: [
          {
            target: 'basics.summary',
            before,
            after: `${before} Skills include Forklift.`,
            where: 'Profile',
            ref: 'basics/summary',
          },
        ],
        included: ['Forklift'],
        skipped: [{ term: 'Cold chain', reason: 'No safe, natural replacement was returned.' }],
      },
    }),
  );
  await pick(page).check();
  await pick(page, 'Cold chain').check();
  await rewrite(page).click();
  await expect(page.getByTestId('keyword-result')).toContainText('Not inserted');
  await expect.poll(() => summary(page)).toContain('Forklift');
  await expect(pick(page, 'Cold chain')).toBeChecked();
  await page.route('**/api/quality/keywords/rewrite', (route) =>
    route.fulfill({
      json: {
        patches: [],
        included: [],
        skipped: [{ term: 'Cold chain', reason: 'No safe, natural replacement was returned.' }],
      },
    }),
  );
  await rewrite(page).click();
  await expect(page.getByTestId('keyword-result')).toContainText('No changes were applied');
});

test('keyword selection survives workspace switching without replaying a request', async ({
  page,
}) => {
  await openKeywords(page);
  await pick(page).check();
  const strip = page.getByTestId('tab-strip');
  await strip.getByTestId('tab-new').click();
  await page.goto('/jobs');
  await strip.getByTestId('tab').first().click();
  await expect(pick(page)).toBeChecked();
  await expect(rewrite(page)).toBeEnabled();
  await page.reload();
  await expect(pick(page)).toBeChecked();
});

test('a changed advert requires a fresh check before applying keywords', async ({ page }) => {
  const job = await openKeywords(page);
  await pick(page).check();
  expect(
    (
      await page.request.put(`/api/jobs/${job.id}`, { data: { advert: `${ADVERT} New detail.` } })
    ).ok(),
  ).toBe(true);
  await rewrite(page).click();
  await expect(kw(page)).toContainText('The job advert changed.');
  expect(await summary(page)).toBe(driver.basics.summary);
  await expect(rewrite(page)).toBeDisabled();
});

test('an empty career profile can receive confirmed skills without making a copy', async ({
  page,
}) => {
  const doc = { ...driver, role: 'profile' as const, basics: { ...driver.basics, summary: '' } };
  await openKeywords(page, doc);
  await pick(page).check();
  await rewrite(page).click();
  await expect.poll(() => summary(page)).toBe('Skills include Forklift.');
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).role, key)).toBe(
    'profile',
  );
});

test('AI preference off keeps the simple Skills fallback', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cvstudio.ai', 'off'));
  await openKeywords(page);
  await expect(rewrite(page)).toHaveCount(0);
  await pick(page).check();
  await page.getByTestId('keyword-add').click();
  await expect(kw(page).getByRole('list', { name: 'Keywords in your CV' })).toContainText(
    'Forklift',
  );
  expect(await summary(page)).toBe(driver.basics.summary);
});

test('signing out while rewriting cannot restore the departed account document', async ({
  page,
}) => {
  await openKeywords(page);
  const held = await holdRewrite(page);
  await pick(page).check();
  await rewrite(page).click();
  await held.ready;
  await page.goto('/account');
  await page.locator('main').getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  held.release();
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  await page.keyboard.press('Control+z');
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
});

test('a legacy match asks for a fresh report instead of linking an arbitrary CV', async ({
  page,
}) => {
  await seedDocument(page, driver);
  await page.goto('/documents');
  const response = await page.request.post('/api/jobs', {
    data: { title: 'Delivery Driver', advert: ADVERT },
  });
  const { job } = await response.json();
  expect(
    (await page.request.post(`/api/jobs/${job.id}/match`, { data: { document: driver } })).ok(),
  ).toBe(true);
  await page.route(`**/api/jobs/${job.id}`, async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    delete json.job.match.sourceDocumentId;
    delete json.job.match.advertFingerprint;
    await route.fulfill({ json });
  });
  await page.goto(`/jobs/${job.id}`);
  await expect(page.getByTestId('match')).toContainText('Check again to open keyword rewriting');
  await expect(page.getByTestId('match-keyword-rewrite')).toHaveCount(0);
});
