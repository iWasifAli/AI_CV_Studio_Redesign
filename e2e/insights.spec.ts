import AxeBuilder from '@axe-core/playwright';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './support/test';
import { driver } from '../src/modules/resume/fixtures';
import type { ResumeDocument } from '../src/modules/resume/schema';

/** R9.10: application analytics — sent, replies, interviews and offers, by CV and design. */

const noSerious = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
    [],
  );
};

const putCv = async (request: APIRequestContext, doc: ResumeDocument) => {
  const r = await request.put(`/api/documents/${doc.id}`, { data: { document: doc } });
  expect(r.ok()).toBe(true);
};

type Job = { id: string; sent?: { title: string; designName: string } | null };
const addJob = async (request: APIRequestContext, data: Record<string, unknown>) =>
  ((await (await request.post('/api/jobs', { data })).json()) as { job: Job }).job;
const update = async (request: APIRequestContext, id: string, data: Record<string, unknown>) =>
  ((await (await request.put(`/api/jobs/${id}`, { data })).json()) as { job: Job }).job;

test('no applications yet: the page explains how results add up', async ({ page }) => {
  await page.goto('/jobs/insights');
  await expect(page.getByRole('heading', { name: 'Your application results' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No applications sent yet' })).toBeVisible();
  await noSerious(page);
  // A saved job alone is not an application.
  await addJob(page.request, { title: 'Courier' });
  await page.reload();
  await expect(page.getByText('you have 1 saved job waiting')).toBeVisible();
});

test('results by CV and design, outcomes, the CV recorded as sent', async ({ page }) => {
  const r = page.request;
  const main: ResumeDocument = { ...driver, id: 'ins-main', title: 'Main CV' };
  const bold: ResumeDocument = {
    ...driver,
    id: 'ins-bold',
    title: 'Bold CV',
    design: { ...driver.design, templateId: 'ledger' },
  };
  await putCv(r, main);
  await putCv(r, bold);

  // 1. Sent with the main CV (Clarity): still waiting.
  const a = await addJob(r, { title: 'Van Driver', company: 'Swift', documentIds: [main.id] });
  const a2 = await update(r, a.id, { stage: 'applied' });
  expect(a2.sent).toMatchObject({ title: 'Main CV', designName: 'Clarity' });
  // 2. A tailored copy of the main CV, in Ledger: an interview.
  const b = await addJob(r, { title: 'HGV Driver', company: 'Northline', stage: 'applied' });
  const tailored: ResumeDocument = {
    ...driver,
    id: 'ins-tailored',
    title: 'Grace — HGV Driver (Northline)',
    jobId: b.id,
    parentId: main.id,
    design: { ...driver.design, templateId: 'ledger' },
  };
  await putCv(r, tailored);
  await update(r, b.id, { documentIds: [tailored.id] });
  await update(r, b.id, { stage: 'interview' });
  // 3. Bold CV: closed without saying how it ended (asked on the page).
  const c = await addJob(r, { title: 'Courier', company: 'Pace', documentIds: [bold.id] });
  await update(r, c.id, { stage: 'applied' });
  await update(r, c.id, { stage: 'closed' });
  // 4. Never applied: not counted.
  const d = await addJob(r, { title: 'Warehouse', company: 'Depot' });
  await update(r, d.id, { stage: 'closed', outcome: 'not_applied' });
  // 5. Applied with no CV ticked.
  await addJob(r, { title: 'Delivery', company: 'Quick', stage: 'applied' });

  // The board links to the results; a closed card asks how it ended.
  await page.goto('/jobs');
  await expect(page.getByRole('link', { name: 'Your results' })).toBeVisible();
  await expect(page.getByLabel('How it ended: Warehouse')).toHaveValue('not_applied');

  await page.getByRole('link', { name: 'Your results' }).click();
  await expect(page).toHaveURL(/\/jobs\/insights$/);
  const box = page.getByTestId('insights');
  await expect(box.getByTestId('stat-sent')).toContainText('4');
  await expect(box.getByTestId('stat-replies')).toContainText('1');
  await expect(box.getByTestId('stat-replies')).toContainText('25% of sent');
  await expect(box.getByTestId('stat-interviews')).toContainText('1');
  await expect(box.getByTestId('stat-waiting')).toContainText('2');
  await expect(box.getByTestId('stat-waiting')).toContainText('1 closed with no answer');
  // The interview came the same day it was sent: one answer is too few for a typical time.
  await expect(box.getByTestId('reply-time')).toContainText('Once two employers have answered');

  // Tables on wide screens, stacked lines on phones.
  const phone = test.info().project.name === 'mobile';
  const rows = (id: string) =>
    phone
      ? box.getByTestId(`${id}-list`).getByRole('listitem')
      : box.getByTestId(id).getByRole('row');
  const byCv = (label: string | RegExp) => rows('by-cv').filter({ hasText: label });
  await expect(byCv('Tailored copies of “Main CV”')).toContainText('1');
  await expect(byCv(/^Main CV/)).toHaveCount(1);
  await expect(byCv('Bold CV')).toBeVisible();
  await expect(byCv('No CV linked')).toBeVisible();
  await expect(byCv('Bold CV')).toContainText('Too few to compare yet');
  const byDesign = (label: string) => rows('by-design').filter({ hasText: label });
  await expect(byDesign('Ledger')).toContainText('2');
  await expect(byDesign('Clarity')).toBeVisible();
  // Gaps: the closed job without an outcome, and the application without a CV.
  await expect(box.getByTestId('no-cv')).toContainText('Delivery');
  await noSerious(page);

  // Telling it the Courier job was a "no" makes it a reply.
  await box.getByLabel('How it ended: Courier').selectOption('rejected');
  await expect(box.getByTestId('stat-replies')).toContainText('2');
  await expect(box.getByTestId('stat-replies')).toContainText('50% of sent');
  await expect(box.getByLabel('How it ended: Courier')).toHaveCount(0);

  // Redesigning the main CV later doesn't rewrite history: job 1 stays under Clarity.
  await putCv(r, {
    ...main,
    updatedAt: new Date().toISOString(),
    design: { ...main.design, templateId: 'atelier' },
  });
  await update(r, a.id, { notes: 'Rang them on Monday' });
  await page.reload();
  await expect(byDesign('Clarity')).toBeVisible();
  await expect(byDesign('Atelier')).toHaveCount(0);

  // The job page says which CV and design were recorded, and asks how a closed job ended.
  await page.goto(`/jobs/${c.id}`);
  await expect(page.getByTestId('job-sent')).toContainText('Sent with “Bold CV” in Ledger');
  await expect(page.getByTestId('job-outcome')).toHaveValue('rejected');

  // Home sums it up.
  await page.goto('/studio');
  await expect(page.getByTestId('home-results')).toContainText('4 sent · 2 replies');
  await page.getByTestId('home-results').getByRole('link', { name: 'See your results' }).click();
  await expect(page).toHaveURL(/\/jobs\/insights$/);

  // Phones: the page fits the screen (tables scroll inside their card).
  await page.setViewportSize({ width: 360, height: 780 });
  await page.reload();
  await expect(page.getByTestId('stat-sent')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('each account sees only its own results', async ({ page, browser }) => {
  await addJob(page.request, { title: 'Driver', stage: 'applied' });
  expect(
    (
      (await (await page.request.get('/api/jobs/insights')).json()) as {
        insights: { sent: number };
      }
    ).insights.sent,
  ).toBe(1);
  const other = await browser.newContext();
  const { apiSignUp } = await import('./support/auth');
  await apiSignUp(other.request);
  const res = await other.request.get('/api/jobs/insights');
  expect(((await res.json()) as { insights: { sent: number } }).insights.sent).toBe(0);
  await other.close();
});

test.describe('visitor', () => {
  test.use({ as: 'visitor' });
  test('is asked to sign in, and the API refuses', async ({ page, request }) => {
    await page.goto('/jobs/insights');
    await expect(page.getByRole('heading', { name: 'Sign in to see your results' })).toBeVisible();
    expect((await request.get('/api/jobs/insights')).status()).toBe(401);
  });
});
