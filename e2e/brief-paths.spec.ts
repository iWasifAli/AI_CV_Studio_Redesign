import { expect, test } from './support/test';
import { seedDocument } from './support/seed';
import { driver } from '../src/modules/resume/fixtures';

/** Spec §10.2 Company brief and §10.3 Career paths. */
const ADVERT =
  'Parcel Express is a family-run courier serving Leicester. We value safety and friendly service. You will deliver parcels across the city each day with our handheld scanner. A full UK driving licence is required.';

test('Premium: a company brief on a job, from the advert and the CV', async ({ page }) => {
  await seedDocument(page, driver);
  const r = await page.request.post('/api/jobs', {
    data: { title: 'Delivery Driver', company: 'Parcel Express', advert: ADVERT },
  });
  const { job } = (await r.json()) as { job: { id: string } };
  await page.goto(`/jobs/${job.id}`);
  const card = page.getByTestId('company-brief');
  await card.getByLabel('Text from their website (optional)').fill('We have 40 vans.');
  await card.getByRole('button', { name: 'Make the brief' }).click();
  const body = page.getByTestId('brief-body');
  await expect(body).toContainText('Parcel Express', { timeout: 30_000 });
  await expect(body.getByRole('heading', { name: 'Questions to ask them' })).toBeVisible();
  await expect(body.getByRole('heading', { name: 'How you fit' })).toBeVisible();
  // Kept on the job.
  await page.reload();
  await expect(page.getByTestId('brief-body')).toContainText('Parcel Express');
  await expect(page.getByRole('button', { name: 'Make it again' })).toBeVisible();
});

test('Premium: career paths, and planning the skills for one of them', async ({ page }) => {
  await seedDocument(page, driver);
  await page.goto('/skills');
  const paths = page.getByTestId('career-paths');
  await paths.getByLabel('Anything you’d like more of? (optional)').fill('working with people');
  await paths.getByRole('button', { name: 'Show me' }).click();
  const list = page.getByTestId('paths');
  await expect(list.getByRole('listitem')).toHaveCount(2, { timeout: 30_000 });
  await expect(list).toContainText('Within reach');
  await list
    .getByRole('listitem')
    .filter({ hasText: 'Team Leader' })
    .getByRole('button', { name: 'Plan the skills for this role' })
    .click();
  await expect(page.getByRole('textbox', { name: /role/i }).first()).toHaveValue('Team Leader');

  // A claim the CV doesn't support is marked for the person to check, not stated as fact.
  const made = await page.request.post('/api/coach/paths', {
    data: { document: driver, interests: 'ZZ-PATH' },
  });
  const j = (await made.json()) as { paths: { why: string }[]; findings: number };
  expect(j.findings).toBeGreaterThan(0);
  expect(j.paths[0]!.why).toContain('{{?');
});

test.describe('free account', () => {
  test.use({ as: 'free' });
  test('both are Premium', async ({ page }) => {
    await seedDocument(page, driver);
    await page.goto('/skills');
    await expect(page.getByTestId('career-paths')).toContainText(
      'Career paths are part of Premium',
    );
    expect(
      (await page.request.post('/api/coach/paths', { data: { document: driver } })).status(),
    ).toBe(402);
  });
});
