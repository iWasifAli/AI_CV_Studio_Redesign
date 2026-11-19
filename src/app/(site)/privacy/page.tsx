import { getT } from '@/i18n/server';
import type { Metadata } from 'next';
import { Container } from '@/components/ui/misc';
import { AiPreferenceToggle } from '@/features/ai/preference-toggle';
import { getBusinessConfig } from '@/modules/billing/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Privacy'), alternates: { canonical: '/privacy' } };
}

// Reads the support email from settings (cached 60 s on the server); not baked in at build time.
export const dynamic = 'force-dynamic';

export default async function PrivacyPage() {
  const t = await getT();
  const support = await getBusinessConfig()
    .then((c) => c.value.support.email)
    .catch(() => '');
  return (
    <Container className="max-w-[720px] py-10 md:py-14">
      <h1 className="font-display text-[32px] leading-tight font-semibold tracking-tight sm:text-4xl">
        {t('Privacy, in plain words')}
      </h1>
      <p className="text-ink-muted mt-2 text-sm">
        {t('Last updated {UPDATED}', { UPDATED: '19 November 2026' })}
      </p>
      <div className="text-ink-muted [&_h2]:text-ink [&_strong]:text-ink mt-6 flex flex-col gap-5 text-[17px] leading-relaxed [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-2 [&_ul]:list-disc [&_ul]:pl-6">
        <p>
          {t(
            'Your CV is about you, so we keep as little of it as possible. This page describes the current version of AI CV Studio.',
          )}
        </p>
        <h2>{t('What we store')}</h2>
        <p>
          {t(
            'Without an account, your CVs are saved only in this browser. With an account, they are also saved in your account on our servers (Google Cloud, through Firebase), together with the last 10 versions of each CV, so you can use them on any device and get back an earlier version.',
          )}
        </p>
        <p>
          {t(
            'For your account we keep your email address and name, how you sign in, when you last used the studio, your plan, and how many downloads, imports and AI actions you used this month. If you buy Premium, we keep the order details (order number, pass, amount, payment method, your mobile number and any transaction ID you give) to check the payment. Payment screenshots you send us on WhatsApp stay in that chat and are only used to check your order.',
          )}
        </p>
        <h2>{t('When information leaves your device')}</h2>
        <ul>
          <li>
            <strong>{t('Downloading a PDF or Word file:')}</strong>{' '}
            {t('your CV is sent to our server to create the file and is not kept afterwards.')}
          </li>
          <li>
            <strong>{t('AI help, job match, cover letters and LinkedIn text:')}</strong>{' '}
            {t(
              'the CV text needed for the task (and the job advert you pasted) is sent to Gemini to create a draft. It is checked against your CV so nothing is added that you didn’t write.',
            )}
          </li>
          <li>
            <strong>{t('LinkedIn review:')}</strong>{' '}
            {t(
              'the text of the LinkedIn PDF you upload (and, if you choose, the CV you compare it with) is sent to Gemini to write the review. The file is read in memory and not stored; the review is kept only in your browser.',
            )}
          </li>
          <li>
            <strong>{t('Letters (resignation, reference request, thank-you and others):')}</strong>{' '}
            {t(
              'the letters you write are kept in your account and deleted with it. If you ask for an AI draft, your answers to the letter’s questions and the CV text are sent to Gemini; the draft may only use facts from those two, and anything else is highlighted for you to fill in.',
            )}
          </li>
          <li>
            <strong>{t('Reminders:')}</strong>{' '}
            {t(
              'reminders you set on a job are kept with the job. On the day, we email them to your account address at 8:00 your time (we keep your time zone for this). Every reminder email has a link to stop them, and you can switch them off on your Account page.',
            )}
          </li>
          <li>
            <strong>{t('Job links:')}</strong>{' '}
            {t(
              'when you paste a job’s link, our server opens that page (nothing from your account is sent to the site). If the page has no job details we can read directly, its text is sent to Gemini to find the job; nothing is saved until you press Save job.',
            )}
          </li>
          <li>
            <strong>{t('Story bank, mock interviews and the coach:')}</strong>{' '}
            {t(
              'the stories you write are kept in your account and deleted with it. When you use a mock interview, the coach or an AI letter, your finished stories are sent to Gemini with your CV so the advice can use them as your own facts. Drafting a story sends the chosen CV point and your notes. A skill plan sends your CV and the role you typed, or the job’s advert; plans are kept in your account and deleted with it.',
            )}
          </li>
          <li>
            <strong>{t('Share links (only if you create one):')}</strong>{' '}
            {t(
              'anyone with the link can see that CV, read-only, until you switch the link off or delete it. Share pages are hidden from search engines. We count how many times a link is opened, nothing about who opened it.',
            )}
          </li>
          <li>
            <strong>{t('Comments on a share link (only if you turn them on):')}</strong>{' '}
            {t(
              'people with the link can leave a note with a name they type; they don’t sign in. The comment, the name and the words they pointed at are kept with your CV. Only you see all the comments; a reviewer sees only their own, through a random key kept in their browser (we keep only a scrambled copy of it). Our email about new comments says how many are waiting and never includes what was written. Comments are deleted with the CV and with your account.',
            )}
          </li>
          <li>
            <strong>{t('Portfolio page (only if you publish one):')}</strong>{' '}
            {t(
              'the CV you choose becomes a public web page anyone can find. Your email and phone number appear only if you tick them. Unpublishing or deleting the page takes it down straight away. Sections and project pictures you add are stored with your account and shown only on your published page; the pictures are resized in your browser before they are uploaded and are deleted with the page or your account.',
            )}
          </li>
          <li>
            <strong>{t('Contact form on your portfolio (only if you turn it on):')}</strong>{' '}
            {t(
              'a visitor’s name, email address and message are emailed to your sign-in address and not kept by us. Your address is never shown to them; your reply goes straight to them.',
            )}
          </li>
          <li>
            <strong>{t('Uploading a CV (makeover or import):')}</strong>{' '}
            {t(
              'the file is read on our server and not kept. Its text may be sent to Google’s Gemini service to sort it into sections; we then check that nothing was added that isn’t in your file. A scanned PDF or a photo of a CV is sent to Gemini as a picture so its text can be read. The “before” view of your original is drawn in your own browser. If you use the polish suggestions, the lines concerned are sent to Gemini to suggest fixes.',
            )}
          </li>
          <li>
            <strong>{t('Writing help in the editor:')}</strong>{' '}
            {t(
              'only the part you asked about (for example one job’s bullet points) is sent to Gemini to create a suggestion.',
            )}
          </li>
          <li>
            <strong>{t('AI Designer (describe a design):')}</strong>{' '}
            {t(
              'your description and counts of your CV’s length and sections are sent to Gemini — not the words of your CV. If you add a picture of a CV you like, the picture is sent to Gemini to read its layout and colours, then discarded; we don’t store it.',
            )}
          </li>
        </ul>
        <p>
          {t(
            'We use Gemini’s paid service, under which Google does not use your text to improve its products; Google keeps it for a limited time only to detect misuse. We don’t store what is sent to Gemini.',
          )}
        </p>
        <h2>{t('Deleting')}</h2>
        <p>
          {t(
            'Deleting a CV removes it, all of its earlier versions, its comments and its share links from your account. On the Account page you can delete your whole account, which removes everything above, including your jobs, letters, stories, skill plans, share links and portfolio page, except payment records, which we keep for accounting with your email address removed. Signing out removes your account’s CVs from that device.',
          )}
        </p>
        <h2>{t('What we measure')}</h2>
        <p>
          {t(
            'We count visits and which steps people complete, without cookies and without reading what you write, so we can make the product easier to use.',
          )}
        </p>
        <h2>{t('Your choices')}</h2>
        <p>{t('You can turn AI help off on this device:')}</p>
        <AiPreferenceToggle />
        {/* Rights and contact (audit, section 10). */}
        <h2>{t('Your rights')}</h2>
        <p>
          {t(
            'You can see, correct, copy and delete your information yourself: every CV opens in the editor, “Download a backup” in Documents saves a copy of all your CVs, and the Account page deletes your account.',
          )}
        </p>
        <h2>{t('Contact')}</h2>
        <p>
          {support ? (
            <>
              {t('For anything about your information, write to')}{' '}
              <a href={`mailto:${support}`} className="text-primary font-semibold">
                {support}
              </a>
              .
            </>
          ) : (
            t('For anything about your information, use the help page while signed in.')
          )}
        </p>
      </div>
    </Container>
  );
}
