import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './support/test';
import { seedDocument } from './support/seed';
import { driver } from '../src/modules/resume/fixtures';

/** Spec §9.1: version history — kept per editing session, named versions, compare, go back. */

const noSerious = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
    [],
  );
};
type Meta = { id: string; kind: string; name?: string };
const versions = async (page: Page) =>
  (
    (await (await page.request.get(`/api/documents/${driver.id}/versions`)).json()) as {
      versions: Meta[];
    }
  ).versions;
const serverHeadline = async (page: Page) => {
  const r = await page.request.get(`/api/documents/${driver.id}`);
  return r.ok() ? ((await r.json()) as { doc: typeof driver }).doc.basics.headline : null;
};

test('history: kept before editing, named, compared, and going back can be undone', async ({
  page,
  isMobile,
}) => {
  await seedDocument(page, driver);
  await page.goto(`/cv/${driver.id}`);
  await expect.poll(() => serverHeadline(page), { timeout: 15_000 }).toBe(driver.basics.headline);

  // An editing session: the CV as it was before it is kept, once.
  const headline = page.getByLabel('Job title you want');
  await headline.fill('Senior Delivery Driver');
  await expect.poll(() => serverHeadline(page), { timeout: 15_000 }).toBe('Senior Delivery Driver');
  await headline.fill('Senior Delivery Driver (HGV)');
  await expect
    .poll(() => serverHeadline(page), { timeout: 15_000 })
    .toBe('Senior Delivery Driver (HGV)');
  expect((await versions(page)).map((v) => v.kind)).toEqual(['auto']);

  await page.getByRole('button', { name: 'Version history' }).click();
  const dialog = page.getByRole('dialog', { name: 'Version history' });
  const list = dialog.getByTestId('versions');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('Before your edits');
  await expect(list).toContainText('Clarity');
  await noSerious(page);

  // Save a named version.
  await dialog.getByLabel('Save this version as').fill('Before tailoring for Acme');
  await dialog.getByRole('button', { name: 'Save version' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list.getByRole('listitem').first()).toContainText('Before tailoring for Acme');

  // Compare the automatic version with now.
  await dialog.getByRole('button', { name: /^Compare with now: Before your edits/ }).click();
  const compare = dialog.getByTestId('compare');
  await expect(compare.getByTestId('changes')).toContainText(
    'Changed job title you want · Your details',
  );
  await expect(compare.getByTestId('changes')).toContainText(
    `${driver.basics.headline} → Senior Delivery Driver (HGV)`,
  );
  await expect(compare.locator('iframe[title="The CV then"]:not([aria-hidden])')).toHaveCount(1);
  // Side by side on wide screens; on phones, Then or Now at a time.
  if (!isMobile)
    await expect(compare.locator('iframe[title="The CV now"]:not([aria-hidden])')).toHaveCount(1);
  await noSerious(page);

  // Go back: asks first, keeps the current CV in history, and Undo brings it back.
  await compare.getByRole('button', { name: 'Go back to this version' }).click();
  await compare.getByRole('button', { name: 'Yes, go back' }).click();
  await expect(dialog).toBeHidden();
  await expect(headline).toHaveValue(driver.basics.headline);
  await expect.poll(() => serverHeadline(page), { timeout: 15_000 }).toBe(driver.basics.headline);
  const after = await versions(page);
  expect(after.map((v) => v.kind).sort()).toEqual(['auto', 'named', 'restore']);
  expect(after.find((v) => v.kind === 'restore')?.name).toMatch(
    /^Before going back to Before your edits/,
  );
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(headline).toHaveValue('Senior Delivery Driver (HGV)');

  // Rename and delete.
  await page.getByRole('button', { name: 'Version history' }).click();
  await dialog.getByRole('button', { name: 'Rename Before tailoring for Acme' }).click();
  await dialog.getByLabel('Version name').fill('Generic CV');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(list).toContainText('Generic CV');
  await dialog.getByRole('button', { name: /^Delete Generic CV/ }).click();
  await expect(list).not.toContainText('Generic CV');
  expect((await versions(page)).some((v) => v.kind === 'named')).toBe(false);
});

test('versions are private, checked, and need an account', async ({ page, browser }) => {
  await seedDocument(page, driver);
  await page.goto(`/cv/${driver.id}`);
  await expect.poll(() => serverHeadline(page), { timeout: 15_000 }).toBe(driver.basics.headline);
  const r = await page.request.post(`/api/documents/${driver.id}/versions`, {
    data: { kind: 'named', name: 'Mine', document: driver },
  });
  expect(r.status()).toBe(201);
  const vid = ((await r.json()) as { version: Meta }).version.id;
  // A name is needed; a different CV can't be stored under this one; unknown CVs are refused.
  expect(
    (
      await page.request.post(`/api/documents/${driver.id}/versions`, {
        data: { kind: 'named', name: '   ', document: driver },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post(`/api/documents/${driver.id}/versions`, {
        data: { kind: 'named', name: 'x', document: { ...driver, id: 'other-cv' } },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post('/api/documents/no-such-cv/versions', {
        data: { kind: 'named', name: 'x', document: { ...driver, id: 'no-such-cv' } },
      })
    ).status(),
  ).toBe(404);
  // Another account sees nothing and can't touch it.
  const other = await browser.newContext();
  const { apiSignUp } = await import('./support/auth');
  await apiSignUp(other.request);
  expect(
    (
      (await (await other.request.get(`/api/documents/${driver.id}/versions`)).json()) as {
        versions: unknown[];
      }
    ).versions,
  ).toEqual([]);
  expect((await other.request.get(`/api/documents/${driver.id}/versions/${vid}`)).status()).toBe(
    404,
  );
  expect((await other.request.delete(`/api/documents/${driver.id}/versions/${vid}`)).status()).toBe(
    404,
  );
  await other.close();
  expect((await page.request.get(`/api/documents/${driver.id}/versions/${vid}`)).status()).toBe(
    200,
  );
  // Deleting the CV deletes its versions.
  await page.request.delete(`/api/documents/${driver.id}`);
  expect(await versions(page)).toEqual([]);
});

test('phone: history opens full width, Then and Now switch, nothing scrolls sideways', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Phone layout');
  await seedDocument(page, driver);
  await page.goto(`/cv/${driver.id}`);
  await expect.poll(() => serverHeadline(page), { timeout: 15_000 }).toBe(driver.basics.headline);
  await page.request.post(`/api/documents/${driver.id}/versions`, {
    data: { kind: 'named', name: 'First draft', document: { ...driver, title: 'First draft' } },
  });
  await page.getByRole('button', { name: 'Version history' }).click();
  const dialog = page.getByRole('dialog', { name: 'Version history' });
  await dialog.getByRole('button', { name: /^Compare with now: First draft/ }).click();
  await expect(dialog.getByTestId('changes')).toContainText('Changed CV name');
  await dialog.getByRole('button', { name: 'Now', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Now', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );
  await noSerious(page);
});

test.describe('visitor', () => {
  test.use({ as: 'visitor' });
  test('has no history button, and the API refuses', async ({ page, request }) => {
    await seedDocument(page, driver);
    await page.goto(`/cv/${driver.id}`);
    await expect(page.getByLabel('Job title you want')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Version history' })).toHaveCount(0);
    expect((await request.get(`/api/documents/${driver.id}/versions`)).status()).toBe(401);
  });
});
