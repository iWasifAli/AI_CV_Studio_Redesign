/**
 * Captures the real screens used in the learning centre (/how-to/<feature>).
 * Run: npm run build && npx playwright test -c playwright.learn.config.ts
 * Output: .learn-shots/<slug>-<n>.png (then `node scripts/learn/pack.mjs` converts to public/learn/*.webp).
 * Only sample data is used; nothing here is anyone's real CV.
 */
import { test, expect } from '../../e2e/support/test';
import { seedDocument } from '../../e2e/support/seed';
import { teacher, withPhoto, PHOTO_FOR } from '../../src/modules/resume/fixtures';
import type { Page } from '@playwright/test';
import fs from 'node:fs';

const OUT = '.learn-shots';
fs.mkdirSync(OUT, { recursive: true });
const doc = { ...withPhoto(teacher, PHOTO_FOR['teacher'] ?? 'a'), title: 'My teaching CV' };
const SAMPLE = 'src/modules/import/__fixtures__/word-sales.docx';

const shot = async (page: Page, slug: string, n: number) => {
  // The test setup labels its stand-in AI "DEMO AI"; the real product does not show that.
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll('span,div,p,small')))
      if (/demo ai/i.test(el.textContent ?? '') && (el.textContent ?? '').length < 12)
        (el as HTMLElement).style.display = 'none';
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${slug}-${n}.png` });
};
const step = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (e) {
    console.log(`CAPTURE FAILED: ${name}: ${String(e).split('\n')[0]}`);
  }
};

test('capture screens', async ({ page }) => {
  test.setTimeout(240_000);
  await seedDocument(page, doc);
  await page.goto('/cv');
  await page.waitForTimeout(1500);

  await step('start', async () => {
    await page.goto('/start');
    await shot(page, 'start', 1);
    await page.getByRole('button', { name: /teach/i }).first().click();
    await page.waitForTimeout(800);
    await shot(page, 'start', 2);
  });
  await step('makeover', async () => {
    await page.goto('/makeover');
    await shot(page, 'makeover', 1);
    await page.locator('input[type=file]').first().setInputFiles(SAMPLE);
    await page.waitForTimeout(9000);
    await shot(page, 'makeover', 2);
  });
  await step('designs', async () => {
    await page.goto('/templates');
    await shot(page, 'designs', 1);
    await page.goto('/templates/heritage');
    await shot(page, 'designs', 2);
  });
  await step('editor', async () => {
    await page.goto(`/cv/${doc.id}`);
    await page.waitForTimeout(2500);
    await shot(page, 'editor', 1);
    await page.goto(`/cv/${doc.id}?tab=design`);
    await page.waitForTimeout(2500);
    await shot(page, 'designs', 3);
  });
  await step('check', async () => {
    await page.goto(`/cv/${doc.id}?tab=check`);
    await page.waitForTimeout(2500);
    await shot(page, 'check', 1);
  });
  await step('letters', async () => {
    await page.goto('/documents?type=letters');
    await shot(page, 'letters', 1);
    await page.goto('/letters/new?type=resignation');
    await shot(page, 'letters', 2);
  });
  await step('jobs', async () => {
    await page.goto('/jobs');
    await shot(page, 'jobs', 1);
    await page.getByRole('button', { name: 'Add a job' }).click();
    await page.getByLabel('Job title').fill('Primary School Teacher');
    await page.getByLabel('Company').fill('Oakfield Primary');
    await page
      .getByLabel('The job advert')
      .fill('We are looking for a caring Year 4 class teacher.');
    await shot(page, 'jobs', 2);
    await page.getByRole('button', { name: 'Save job' }).click();
    await page.waitForTimeout(1000);
    await shot(page, 'jobs', 3);
  });
  await step('coach', async () => {
    await page.goto('/coach');
    await shot(page, 'coach', 1);
  });
  await step('stories', async () => {
    await page.goto('/stories');
    await shot(page, 'stories', 1);
  });
  await step('skills', async () => {
    await page.goto('/skills');
    await shot(page, 'skills', 1);
  });
  await step('linkedin', async () => {
    await page.goto('/linkedin');
    await shot(page, 'linkedin', 1);
  });
  await step('portfolio', async () => {
    await page.goto('/portfolio');
    await shot(page, 'portfolio', 1);
  });
  await step('documents', async () => {
    await page.goto('/documents');
    await shot(page, 'documents', 1);
  });
  await step('download', async () => {
    await page.goto(`/cv/${doc.id}/download`);
    await page.waitForTimeout(3500);
    await shot(page, 'download', 1);
  });
  await step('translate', async () => {
    await page.goto(`/cv/${doc.id}`);
    await page.waitForTimeout(2000);
    await page.getByTestId('translate-open').click();
    await page.waitForTimeout(800);
    await shot(page, 'translate', 1);
  });
  await step('privacy', async () => {
    await page.goto('/privacy');
    await shot(page, 'privacy', 1);
  });
  await step('account', async () => {
    await page.goto('/account');
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode())
        n.textContent = (n.textContent ?? '').replace(/api-[\w-]+@example\.com/g, 'you@example.com');
    });
    await shot(page, 'account', 1);
  });
  await step('help', async () => {
    await page.goto('/help');
    await shot(page, 'help', 1);
  });
  await step('premium', async () => {
    // Seen as a visitor, so the page shows the plans and not the test account's pass.
    await page.context().clearCookies();
    await page.goto('/premium');
    // The test setup has sales switched off; hide that notice so the screen shows the plans only.
    await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll('div,section')))
        if (/^Premium opens soon/.test(el.textContent ?? '') && el.querySelectorAll('div').length < 3)
          (el as HTMLElement).style.display = 'none';
    });
    await shot(page, 'premium', 1);
  });
  expect(fs.readdirSync(OUT).length).toBeGreaterThan(10);
});
