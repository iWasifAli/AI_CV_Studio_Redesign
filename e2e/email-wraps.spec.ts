import { expect, test } from './support/test';
import { seedDocument } from './support/seed';
import { ops } from '../src/modules/resume/ops';
import { engineer } from '../src/modules/resume/fixtures';

// Gap audit G-02 follow-up: the editor warns before export when an email can't fit on one line.
test('the editor says when the email is too long for the side column', async ({
  page,
  isMobile,
}) => {
  const long = ops.useDesign(
    {
      ...engineer,
      id: 'email-wraps-long',
      basics: {
        ...engineer.basics,
        email: 'alexandra.konstantinopoulou-featherstonehaugh@example-holdings.co.uk',
      },
    },
    'atelier',
  );
  await seedDocument(page, long);
  await page.goto(`/cv/${long.id}`);
  if (isMobile) await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByTestId('page-count')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('email-wraps')).toBeVisible();

  const short = ops.useDesign({ ...engineer, id: 'email-wraps-short' }, 'atelier');
  await seedDocument(page, short);
  await page.goto(`/cv/${short.id}`);
  if (isMobile) await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByTestId('page-count')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('email-wraps')).toHaveCount(0);
});
