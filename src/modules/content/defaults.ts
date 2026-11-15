/**
 * Words the owner can change in the Console (spec §15 "Content"). These are the defaults: a saved
 * setting replaces them.
 */

export const DEFAULT_FAQ: { q: string; a: string }[] = [
  {
    q: 'Do I need an account?',
    a: 'You can make and preview a CV without one, and see your uploaded CV made over. To download a PDF or save an uploaded CV, create a free account — your CVs are then saved in your account and appear on every device you sign in on.',
  },
  {
    q: 'Where is my CV saved?',
    a: 'Without an account, only in this browser. With an account, also in your account, with the last 10 versions of each CV so you can go back. Signing out removes your CVs from that device; they stay in your account.',
  },
  {
    q: 'What does a free account include, and what is Premium?',
    a: 'A free account includes the free designs, a monthly number of PDF downloads and CV imports. Premium is a one-time pass for a number of days: every design, more downloads and imports, and AI writing help. It never renews by itself. See the Premium page for the current prices and limits.',
  },
  {
    q: 'Can I bring in the CV I already have?',
    a: 'Yes. Drop it on the home page (or choose “Import a CV”): a PDF, a Word file (.docx or .doc) or a clear photo of a paper CV, up to 10 MB. We read the text into editable sections without adding anything and show it in designs chosen for your kind of work. Text read from a photo or a scan may contain a misread word, so check names and numbers.',
  },
  {
    q: 'What is an “applicant tracking system”?',
    a: 'Many employers use software to read CVs before a person does. It needs real text in a clear order. All of our designs are built so this software can read them correctly.',
  },
  {
    q: 'How does the writing help work?',
    a: 'It suggests clearer, more professional wording for what you have already written. It never adds jobs, dates, qualifications or numbers you did not give us. When a sentence would be stronger with a detail only you know, it asks you instead of guessing — those parts are highlighted until you fill them in. You can turn AI help off on the privacy page.',
  },
  {
    q: 'Can I use it on my phone?',
    a: 'Yes. Every step works on a phone. For detailed editing, a bigger screen is more comfortable, but it is not required.',
  },
  {
    q: 'How do I delete my CV or my account?',
    a: 'Delete a CV from Documents — it is removed from your account with all its earlier versions. To delete your whole account, open the Account page and choose “Delete my account”.',
  },
  {
    q: 'My CV runs onto a second page. Is that bad?',
    a: 'No. One page suits short work histories; two pages are normal for experienced people. If it only just spills over, choose “Compact” spacing to fit it on one page.',
  },
];

/** The Premium page's headline and the line under it. */
export const DEFAULT_OFFER = {
  title: 'Every design, more downloads and AI help',
  intro:
    'A one-time pass. It doesn’t renew by itself, so you only pay again if you choose to. Your CVs stay yours whatever you decide.',
};
