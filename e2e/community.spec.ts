import type { APIRequestContext, Browser } from '@playwright/test';
import { expect, test } from './support/test';
import { apiSignUp, makeAdmin, setConfig, uniqueEmail } from './support/auth';
import { seedDocument } from './support/seed';
import { DEFAULT_CONFIG } from '../src/modules/billing/config';
import { FIXTURES } from '../src/modules/resume/fixtures';
import { parseSpec } from '../src/modules/design/spec';

/** R10 Community designs: shared, reviewed in the Console, then usable by others. */
test.describe.configure({ mode: 'serial' });

const ON = {
  ...DEFAULT_CONFIG,
  features: { ...DEFAULT_CONFIG.features, community: true, designStudio: true },
};
const on = (r: APIRequestContext, v: boolean) => setConfig(r, v ? ON : DEFAULT_CONFIG);
test.afterAll(async ({ request }) => {
  await on(request, false);
});

async function adminPage(browser: Browser) {
  const context = await browser.newContext();
  const email = await apiSignUp(context.request, uniqueEmail('admin'));
  await makeAdmin(context.request, email);
  return { context, page: await context.newPage() };
}

test('share → review in the Console → others use it; a declined one says why', async ({
  page,
  request,
  browser,
}) => {
  // Off by default: nothing can be shared and the gallery is empty.
  await on(request, false);
  expect((await page.request.post('/api/community', { data: {} })).status()).toBe(403);
  expect(
    ((await (await page.request.get('/api/community')).json()) as { designs: [] }).designs,
  ).toEqual([]);
  await on(request, true);

  // Save two designs, then share them.
  const spec = parseSpec({ layout: { type: 'sidebar-left', sideWidthPct: 32 } });
  const saved: string[] = [];
  for (const name of ['Bold sidebar', 'Second look']) {
    const r = await page.request.post('/api/designs', {
      data: { name, spec: name === 'Bold sidebar' ? spec : parseSpec({}) },
    });
    saved.push(((await r.json()) as { design: { id: string } }).design.id);
  }
  const doc = { ...structuredClone(FIXTURES.nurse), id: 'community-cv' };
  await seedDocument(page, doc);
  await page.goto(`/cv/${doc.id}`);
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByRole('button', { name: 'Share Bold sidebar with the community' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share with the community' });
  await dialog.getByLabel('One line about it (optional)').fill('Visit www.spam.com now');
  await dialog.getByRole('button', { name: 'Share for review' }).click();
  await expect(dialog).toContainText('can’t include links');
  await dialog.getByLabel('One line about it (optional)').fill('A strong left column for nurses');
  await dialog.getByRole('button', { name: 'Share for review' }).click();
  await expect(page.getByTestId('share-done')).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('my-shared')).toContainText('Bold sidebar — Waiting for review');
  // The same design can't be shared twice.
  const again = await page.request.post('/api/community', {
    data: { designId: saved[0], name: 'Bold sidebar again' },
  });
  expect(again.status()).toBe(409);
  await page.request.post('/api/community', {
    data: { designId: saved[1], name: 'Second look' },
  });
  // Not shown to anyone yet.
  expect(((await (await request.get('/api/community')).json()) as { designs: [] }).designs).toEqual(
    [],
  );

  // The owner reviews: previews on three sample CVs, approve one, decline one with a reason.
  const { context, page: admin } = await adminPage(browser);
  await admin.goto('/admin/designs');
  const items = admin.getByTestId('review-item');
  await expect(items).toHaveCount(2);
  const bold = items.filter({ hasText: 'Bold sidebar' });
  await expect(bold.locator('iframe')).toHaveCount(3);
  await bold.getByRole('button', { name: 'Approve' }).click();
  await expect(admin.getByText('“Bold sidebar” is now in the Community gallery.')).toBeVisible();
  const second = admin.getByTestId('review-item').filter({ hasText: 'Second look' });
  await second.getByLabel('Reason (for declining)').fill('Too close to an existing design');
  await second.getByRole('button', { name: 'Decline' }).click();
  await expect(admin.getByTestId('review-empty')).toBeVisible();
  await admin.getByRole('radio', { name: 'Approved' }).click();
  await admin.getByRole('button', { name: 'Feature' }).click();
  await expect(admin.getByTestId('review-item')).toContainText('Featured');
  await context.close();

  // The designer sees the outcome; anyone can now use the approved one.
  const mine = (await (await page.request.get('/api/community/mine')).json()) as {
    designs: { name: string; status: string; reason: string | null }[];
  };
  expect(mine.designs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'Bold sidebar', status: 'approved' }),
      expect.objectContaining({ status: 'rejected', reason: 'Too close to an existing design' }),
    ]),
  );
  const pub = (await (await request.get('/api/community')).json()) as {
    designs: { name: string; featured: boolean; uid?: string }[];
  };
  expect(pub.designs.map((d) => d.name)).toEqual(['Bold sidebar']);
  expect(pub.designs[0]!.featured).toBe(true);
  expect(pub.designs[0]!.uid).toBeUndefined();

  const other = await browser.newContext();
  await apiSignUp(other.request, uniqueEmail('other'));
  const otherPage = await other.newPage();
  const theirs = { ...structuredClone(FIXTURES.teacher), id: 'community-other' };
  await seedDocument(otherPage, theirs);
  await otherPage.goto(`/cv/${theirs.id}`);
  await otherPage.getByRole('tab', { name: 'Design' }).click();
  const gallery = otherPage.getByTestId('community-gallery');
  await expect(gallery).toContainText('Bold sidebar');
  await gallery.getByRole('button', { name: 'Use “Bold sidebar”' }).click();
  await expect(otherPage.getByTestId('studio-base')).toContainText('Your own design');
  await other.close();
});
