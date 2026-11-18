/**
 * The learning centre: one guide per feature, at /how-to/<slug>.
 * Every screenshot is a real screen of the studio captured with sample data (scripts/learn/capture.spec.ts).
 * Write only what the product really does; learn.test.ts checks the files and links exist.
 */
export const VIDEO_SECONDS = {
  start: 13,
  makeover: 21,
  designs: 18,
  editor: 22,
  check: 24,
  letters: 25,
  jobs: 23,
  coach: 23,
  stories: 20,
  skills: 23,
  linkedin: 20,
  portfolio: 23,
  documents: 20,
} as const;
export type VideoId = keyof typeof VIDEO_SECONDS;

export type Shot = { file: string; alt: string; caption: string };
export type Article = {
  slug: string;
  title: string;
  /** One line for lists and search results. */
  summary: string;
  /** Who it helps and when to use it. */
  forWho: string;
  /** Opens the feature. */
  open: { href: string; label: string };
  /** Id of a video in /videos (mp4, vtt captions and webp poster), when one exists. */
  video?: VideoId;
  shots: Shot[];
  steps: { title: string; text: string; shot?: number }[];
  tips: string[];
  faqs: { q: string; a: string }[];
  related: string[];
};

export const ARTICLES: Article[] = [
  {
    slug: 'start',
    title: 'Create a CV from scratch',
    summary: 'Pick your kind of work and answer simple questions, one step at a time.',
    forWho: 'Anyone without a CV, or who wants to begin fresh. No blank page and no jargon.',
    open: { href: '/start', label: 'Start a CV' },
    video: 'start',
    shots: [
      {
        file: 'start-1',
        alt: 'The Start page asking what kind of work you do, with a list of work types',
        caption:
          'Choose the closest kind of work. It sets the right sections and a matching design.',
      },
      {
        file: 'start-2',
        alt: 'Step 1 of 6, About you, with name, job title, phone, email and town',
        caption: 'Step 1 of 6: about you. Your CV appears on the right as you go.',
      },
    ],
    steps: [
      {
        title: 'Choose your kind of work',
        text: 'Open Start and pick the closest match, for example driving, teaching, healthcare, shops and hotels, trades, office, technology or management. If none fits, use the general option.',
        shot: 0,
      },
      {
        title: 'Answer one short step at a time',
        text: 'The first step is about you: your name, the job you want, phone, email and town. Then your work, education and skills. Press Continue after each step; use Back to change something.',
        shot: 1,
      },
      {
        title: 'Check how it looks',
        text: 'Use the preview to see the page as an employer will. You can change the design at any time without losing a word.',
      },
      {
        title: 'Save and download',
        text: 'Your CV is saved to your account when you are signed in. Use Download when you are happy with it.',
      },
    ],
    tips: [
      'You can change anything later; the first draft does not have to be perfect.',
      'Write what is true. The studio asks questions but never adds experience you did not give.',
    ],
    faqs: [
      {
        q: 'Do I need an account?',
        a: 'You can start without one. Sign in to keep your CV saved across devices and to download it.',
      },
      {
        q: 'Can I already import a CV I have?',
        a: 'Yes. Use Upload your CV instead and the studio lays out your existing words in a new design.',
      },
    ],
    related: ['makeover', 'designs', 'editor'],
  },
  {
    slug: 'makeover',
    title: 'Upload the CV you have',
    summary: 'Drop in a PDF, Word file or a photo of a paper CV and see it redesigned.',
    forWho: 'Anyone who already has a CV that looks dated or hard to read.',
    open: { href: '/makeover', label: 'Upload my CV' },
    video: 'makeover',
    shots: [
      {
        file: 'makeover-1',
        alt: 'The upload page with a dashed box saying Drop your CV here',
        caption: 'Drop your file in the box, or choose a file. PDF, Word or a photo, up to 10 MB.',
      },
      {
        file: 'makeover-2',
        alt: 'The result page with Here is your new CV, a Your new CV and Your original switch, and designs chosen for you',
        caption:
          'Your new CV, with designs chosen for your kind of work. Switch to Your original to compare.',
      },
    ],
    steps: [
      {
        title: 'Choose your file',
        text: 'Drop a PDF, a Word document or a photo of a paper CV (up to 10 MB). No sign-in is needed to see the result.',
        shot: 0,
      },
      {
        title: 'Wait a few seconds',
        text: 'The studio reads your CV and lays it out again. It takes well under a minute.',
      },
      {
        title: 'Compare with your original',
        text: 'Every word is checked against your file, and nothing is added that is not in your CV. Use Your new CV and Your original to compare, and try another design from the list.',
        shot: 1,
      },
      {
        title: 'Sign in to save and download',
        text: 'Sign in to keep the CV, edit it, and download it as a PDF.',
      },
    ],
    tips: [
      'A clear PDF or Word file reads best. For a photo, use good light and keep the page flat.',
      'Check names, dates and numbers once. They are the details that matter most.',
    ],
    faqs: [
      {
        q: 'Is my CV kept?',
        a: 'Without signing in, the file is read to make the preview. See the privacy page for exactly what is stored once you sign in.',
      },
      {
        q: 'Will it change my wording?',
        a: 'It lays out the words you have. Nothing is added that is not in your CV.',
      },
    ],
    related: ['designs', 'editor', 'check'],
  },
  {
    slug: 'designs',
    title: 'Designs for every kind of work',
    summary: 'Try any design on your own words. Every design has a plain ATS version.',
    forWho: 'Anyone who wants their CV to look right for their field, or to try a fresh look.',
    open: { href: '/templates', label: 'Browse designs' },
    video: 'designs',
    shots: [
      {
        file: 'designs-1',
        alt: 'The Designs page with search, filters such as Bold, Elegant and Minimal, and design thumbnails showing your CV',
        caption: 'Browse by mood or kind of work. The designs show your own CV when you have one.',
      },
      {
        file: 'designs-3',
        alt: 'The Design tab in the CV editor with Describe a style and recommended designs',
        caption: 'Inside your CV, open Design to see recommendations for your kind of work.',
      },
    ],
    steps: [
      {
        title: 'Open the designs',
        text: 'Use Designs from the menu, or open your CV and choose the Design tab.',
        shot: 0,
      },
      {
        title: 'Browse or describe a style',
        text: 'Filter by mood (bold, elegant, minimal and more), search by name, or describe the style you want in a few words.',
        shot: 1,
      },
      {
        title: 'Try one',
        text: 'Tap a design to try it on your CV. Use Preview to see the whole page. Your words never change.',
      },
      {
        title: 'Use the ATS version for online forms',
        text: 'Every design has an ATS-safe version: a plain layout that application systems read reliably. Use the designed one for people and the ATS one for forms.',
      },
    ],
    tips: [
      'Pick the design that suits the job, not only the one you like most. Calm and classic suits law and finance; bolder suits creative work.',
      'Try two or three on your own CV; they look different with your own words.',
    ],
    faqs: [
      {
        q: 'Does switching design lose my edits?',
        a: 'No. Your content is separate from the design.',
      },
      {
        q: 'What is an ATS version?',
        a: 'ATS means applicant tracking system, the software many employers use to read CVs. The ATS version keeps the same content in a plain layout so it is read correctly.',
      },
    ],
    related: ['editor', 'check', 'portfolio'],
  },
  {
    slug: 'editor',
    title: 'Edit your CV',
    summary: 'Change your words, ask AI for edits you approve, and watch the page update.',
    forWho: 'Everyone, after the first draft. This is where you polish.',
    open: { href: '/documents', label: 'Open my CVs' },
    video: 'editor',
    shots: [
      {
        file: 'editor-1',
        alt: 'The CV editor with Content, Design and Check tabs, an Ask AI to edit your CV box, form fields and a live preview',
        caption: 'Content, Design and Check are the three tabs. The preview is on the right.',
      },
    ],
    steps: [
      {
        title: 'Open your CV',
        text: 'Go to Documents and choose your CV. It opens on the Content tab.',
        shot: 0,
      },
      {
        title: 'Edit the sections',
        text: 'Open a section such as About you and change the words. The preview updates as you type, and your changes are saved to your account.',
      },
      {
        title: 'Ask AI to edit',
        text: 'Type what to change, for example "make my profile shorter". You see every change before it is made and decide whether to keep it.',
      },
      {
        title: 'Undo if you change your mind',
        text: 'Use the undo and redo arrows at the top.',
      },
      {
        title: 'Download',
        text: 'Choose Download at the top right when your CV is ready.',
      },
    ],
    tips: ['Lead with what an employer needs first; the order of sections can be changed.'],
    faqs: [
      {
        q: 'Is AI editing free?',
        a: 'Editing by hand is free. Some AI writing help is part of Premium; the Premium page lists exactly what is included.',
      },
    ],
    related: ['check', 'designs', 'documents'],
  },
  {
    slug: 'check',
    title: 'Check your CV',
    summary: 'Find gaps and weak spots before an employer does.',
    forWho: 'Anyone about to send a CV. A last look catches what you stop seeing.',
    open: { href: '/documents', label: 'Open my CVs' },
    video: 'check',
    shots: [
      {
        file: 'check-1',
        alt: 'The Check tab showing a CV check summary, a Proofread my CV button and an Add numbers to your points suggestion',
        caption:
          'The Check tab: a summary, a proofread, and prompts to add numbers to your points.',
      },
    ],
    steps: [
      {
        title: 'Open the Check tab',
        text: 'In your CV, choose Check. The top card says whether it is ready to send or what needs fixing.',
        shot: 0,
      },
      {
        title: 'Proofread',
        text: 'Choose Proofread my CV. The AI reads every line for spelling, grammar and punctuation. You choose which fixes to keep.',
      },
      {
        title: 'Add numbers to your points',
        text: 'Points with a number (how many, how often, what changed) stand out. The studio asks; you answer with what is true. Nothing made up is added.',
      },
      {
        title: 'Look at what is already good',
        text: 'Use Show what is already good to see what the check is happy with.',
      },
    ],
    tips: [
      'Real numbers beat adjectives: "served 60 customers a day" says more than "hard-working".',
    ],
    faqs: [
      {
        q: 'Will it invent achievements?',
        a: 'No. It asks questions and uses only your answers.',
      },
    ],
    related: ['editor', 'letters', 'designs'],
  },
  {
    slug: 'letters',
    title: 'Cover letters and other letters',
    summary: 'Write a letter in the same design as your CV and keep it with your documents.',
    forWho: 'Anyone applying, resigning, asking for a reference or following up.',
    open: { href: '/documents?type=letters', label: 'Write a letter' },
    video: 'letters',
    shots: [
      {
        file: 'letters-1',
        alt: 'The Documents page on the Letters tab with a list of letter types to start',
        caption:
          'Pick a letter type: cover letter, resignation, reference request, thank-you and more.',
      },
      {
        file: 'letters-2',
        alt: 'A resignation letter form asking for your current role, organisation and last working day',
        caption:
          'Answer a few questions. Then write it yourself or, with Premium, ask for a draft.',
      },
    ],
    steps: [
      {
        title: 'Choose a letter type',
        text: 'Open Documents, then Letters. Types include cover letter, resignation, reference request, thank-you after an interview, application follow-up, accepting a job offer, salary negotiation, networking introduction, personal statement and professional bio.',
        shot: 0,
      },
      {
        title: 'Answer the questions',
        text: 'Fill in the short form. Required answers are checked before anything is created.',
        shot: 1,
      },
      {
        title: 'Write it yourself or get a draft',
        text: 'Choose Write it myself, or use an AI draft if you have Premium. Edit until it sounds like you.',
      },
      {
        title: 'Download and find it again',
        text: 'The letter uses the same design as your CV. It is kept in Documents, where you can download or delete it.',
      },
    ],
    tips: ['Keep it short: three or four paragraphs are enough.'],
    faqs: [
      {
        q: 'Is writing a letter free?',
        a: 'Writing one yourself is free. AI drafts are part of Premium.',
      },
    ],
    related: ['jobs', 'coach', 'editor'],
  },
  {
    slug: 'jobs',
    title: 'Job tracker',
    summary: 'Keep every job you are going for, where you are with it, and which CV you sent.',
    forWho: 'Anyone applying to more than one job at a time.',
    open: { href: '/jobs', label: 'Track my jobs' },
    video: 'jobs',
    shots: [
      {
        file: 'jobs-1',
        alt: 'The Job tracker with no jobs yet and an Add a job button',
        caption: 'The tracker starts empty. Choose Add a job.',
      },
      {
        file: 'jobs-2',
        alt: 'The Add a job form with link, job title, company, location and the job advert',
        caption: 'Paste a link to fill it in, or type the title, company and advert.',
      },
      {
        file: 'jobs-3',
        alt: 'The job board with Saved, Applied, Interview, Offer and Closed columns and one saved job',
        caption: 'Move each job along as you hear back.',
      },
    ],
    steps: [
      {
        title: 'Add a job',
        text: 'Choose Add a job. Paste a link and choose Fill in from the link, or type the job title and company yourself.',
        shot: 1,
      },
      {
        title: 'Paste the advert',
        text: 'The advert stays private. It is used to check your CV against the job and to write a letter for it.',
      },
      {
        title: 'Move it along',
        text: 'Each job sits in a column: Saved, Applied, Interview, Offer or Closed. Use Move to when something changes.',
        shot: 2,
      },
      {
        title: 'Link the CV you sent',
        text: 'Attach the CV you used so you always know which version an employer has.',
      },
    ],
    tips: ['A free account can track up to 3 jobs at a time.'],
    faqs: [
      {
        q: 'Does it apply for me?',
        a: 'No. It keeps your applications organised; you apply on the employer site.',
      },
    ],
    related: ['interview-practice', 'coach', 'letters'],
  },
  {
    slug: 'coach',
    title: 'Coach',
    summary: 'Practise for the role with advice that comes from your own CV and jobs.',
    forWho: 'Anyone preparing for an interview or unsure what to improve next.',
    open: { href: '/coach', label: 'Open Coach' },
    video: 'coach',
    shots: [
      {
        file: 'coach-1',
        alt: 'The Coach page with an Ask your coach box, suggested questions, and Practise for your jobs with Mock interview and Check my match',
        caption: 'Ask a question, or practise for a job you track.',
      },
    ],
    steps: [
      {
        title: 'Track a job first',
        text: 'Coaching works from the jobs you track, so the questions fit the role. Add one in the Job tracker.',
      },
      {
        title: 'Ask your coach',
        text: 'Type a question or tap a suggestion, such as which of your skills to lead with.',
        shot: 0,
      },
      {
        title: 'Practise',
        text: 'For a tracked job, choose Mock interview to practise, or Check my match to see how well your CV fits.',
      },
      {
        title: 'Use your stories',
        text: 'Stories from your Story bank are offered in the mock interview.',
      },
    ],
    tips: ['Advice comes from your own CV and jobs. It never makes up experience for you.'],
    faqs: [
      {
        q: 'Is Coach free?',
        a: 'Plans and limits are on the Premium page; see Help for the details.',
      },
    ],
    related: ['interview-practice', 'jobs', 'stories'],
  },
  {
    slug: 'interview-practice',
    title: 'Interview practice',
    summary:
      'Practise five questions for a real job, one at a time, and get feedback on every answer.',
    forWho: 'Anyone with an interview coming up, or who finds interviews hard.',
    open: { href: '/jobs', label: 'Choose a job to practise' },
    shots: [
      {
        file: 'interview-1',
        alt: 'A job page with Interview preparation, a Mock interview section with a Start the mock interview button, and a Company brief',
        caption: 'On each job: interview preparation, the mock interview and a company brief.',
      },
      {
        file: 'interview-2',
        alt: 'The mock interview showing Question 1 of 5 with a text box for your answer',
        caption: 'One question at a time, written for this job.',
      },
      {
        file: 'interview-3',
        alt: 'Feedback after an answer showing Strong answer, the Situation, Task, Action and Result parts, and a Save to my story bank button',
        caption: 'After each answer: how it went, which parts it had, and what to improve.',
      },
    ],
    steps: [
      {
        title: 'Add the job and its advert',
        text: 'Practice is built around a real job. Add it in the Job tracker and paste the advert; the questions come from the advert and your CV.',
      },
      {
        title: 'Open the job and look at the preparation',
        text: 'On the job page, Prepare for the interview gives likely questions and tips. Company brief adds a one-page summary of the employer to read first.',
        shot: 0,
      },
      {
        title: 'Start the mock interview',
        text: 'Choose Start the mock interview. You get five questions, one at a time. Say your answer out loud first if you like, then type it in the box and choose Send answer. A very short answer cannot be sent.',
        shot: 1,
      },
      {
        title: 'Read the feedback',
        text: 'After every answer you see whether it was a strong or good answer, or one to work on. Situation, Task, Action and Result show which parts your answer had. The feedback quotes your own words and lists what to improve.',
        shot: 2,
      },
      {
        title: 'Keep your best answers',
        text: 'Choose Save to my story bank to keep an answer you like. Later questions can offer your stories that fit, and you can use one with Use this story.',
      },
      {
        title: 'Finish and go again',
        text: 'At the end you get a summary, How it went. Choose Practise again for a fresh round, or Start over.',
      },
    ],
    tips: [
      'Use one real example from your CV and finish with the result. That is what the feedback looks for.',
      'Practise the same job twice: once to see the questions, once to improve your answers.',
    ],
    faqs: [
      {
        q: 'Do I speak my answers?',
        a: 'You type them. The page invites you to practise out loud or in writing, so saying it aloud first is a good habit.',
      },
      {
        q: 'Is it free?',
        a: 'The mock interview and company brief are part of Premium and use your AI actions: starting counts, and so does each answer. See the Premium page for your limits.',
      },
      {
        q: 'Does it make up things about me?',
        a: 'No. Feedback is about the words you wrote, and it quotes them.',
      },
    ],
    related: ['coach', 'stories', 'jobs'],
  },
  {
    slug: 'stories',
    title: 'Story bank',
    summary: 'Write your best work stories once, then reuse them in interviews and letters.',
    forWho: 'Anyone who freezes at "tell me about a time when...".',
    open: { href: '/stories', label: 'Open Story bank' },
    video: 'stories',
    shots: [
      {
        file: 'stories-1',
        alt: 'The Story bank with a first story prompt and a New story button',
        caption: 'Start with one story: what happened, what you did, how it turned out.',
      },
    ],
    steps: [
      {
        title: 'Choose New story',
        text: 'Give it a short name, for example "Kept deliveries on time after a depot closed".',
        shot: 0,
      },
      {
        title: 'Say what happened',
        text: 'Write the situation, what you did and the result, in your own words. Drafting help is part of Premium; writing it yourself is free.',
      },
      {
        title: 'Replace placeholders',
        text: 'If a draft has questions in curly brackets, replace each with the real detail or delete it before you use the story.',
      },
      {
        title: 'Reuse it',
        text: 'Your stories are ready for mock interviews, the coach and letters.',
      },
    ],
    tips: ['Three or four good stories cover most interview questions.'],
    faqs: [{ q: 'How many can I keep?', a: 'The page shows your count against your limit.' }],
    related: ['interview-practice', 'coach', 'jobs'],
  },
  {
    slug: 'skills',
    title: 'Skill plan',
    summary: 'See which skills to build next for the work you want.',
    forWho: 'Anyone planning a next step or a change of direction.',
    open: { href: '/skills', label: 'Plan my skills' },
    video: 'skills',
    shots: [
      {
        file: 'skills-1',
        alt: 'The Skill plan page with Where could you go next and Make a learning plan',
        caption: 'Find paths from your CV, then make a learning plan for a job you track.',
      },
    ],
    steps: [
      {
        title: 'Ask where you could go next',
        text: 'Optionally say what you want more of, for example "working with people" or "less driving". Choose Show me.',
        shot: 0,
      },
      {
        title: 'Read the paths',
        text: 'Roles your CV already points to, what you have for each, what you still need, and a first step. Nothing is added to your CV.',
      },
      {
        title: 'Make a learning plan',
        text: 'Choose one of your jobs, or describe a role you would like, then Make my plan.',
      },
    ],
    tips: ['Start with the first step only. Small and finished beats big and planned.'],
    faqs: [{ q: 'Does it change my CV?', a: 'No. It only suggests; you decide what to add.' }],
    related: ['coach', 'jobs', 'stories'],
  },
  {
    slug: 'linkedin',
    title: 'LinkedIn profile',
    summary: 'Write a headline and About section from your CV, or review your profile.',
    forWho: 'Anyone who wants their LinkedIn to match their CV.',
    open: { href: '/linkedin', label: 'Open LinkedIn' },
    video: 'linkedin',
    shots: [
      {
        file: 'linkedin-1',
        alt: 'The LinkedIn page with Write from my CV and Review my profile tabs',
        caption: 'Write from my CV, or Review my profile.',
      },
    ],
    steps: [
      {
        title: 'Choose Write from my CV',
        text: 'Pick the CV to write from and, if you like, the kind of role you want next.',
        shot: 0,
      },
      {
        title: 'Create your text',
        text: 'Choose Write my LinkedIn profile for a headline, an About section and job descriptions, ready to paste. Nothing is invented.',
      },
      {
        title: 'Or review your profile',
        text: 'Choose Review my profile, export your data from LinkedIn and upload the file here. We read it and do not keep it.',
      },
    ],
    tips: ['Copy the text into LinkedIn and edit it so it sounds like you.'],
    faqs: [
      {
        q: 'Do you connect to my LinkedIn account?',
        a: 'No. You paste text in, or upload your own export.',
      },
    ],
    related: ['portfolio', 'editor', 'letters'],
  },
  {
    slug: 'portfolio',
    title: 'Portfolio page',
    summary: 'A personal web page made from your CV, in your colours, that updates with it.',
    forWho:
      'Anyone who wants a link to share on LinkedIn, in an email signature or on a business card.',
    open: { href: '/portfolio', label: 'Set up my page' },
    video: 'portfolio',
    shots: [
      {
        file: 'portfolio-1',
        alt: 'The Portfolio settings page with a CV choice, theme styles such as Clean, Classic, Sidebar, Editorial and Timeline, and an address',
        caption: 'Pick the CV, choose a theme, and choose your address.',
      },
    ],
    steps: [
      {
        title: 'Sign in and open Portfolio',
        text: 'The page is made from one of your CVs, so you need to be signed in.',
      },
      {
        title: 'Choose a theme',
        text: 'Match my CV uses your CV design. Other themes include Clean, Classic, Sidebar, Editorial and Timeline. Use Preview to see each.',
        shot: 0,
      },
      {
        title: 'Choose what to share',
        text: 'Decide what the page shows and set your address.',
      },
      {
        title: 'Share the link',
        text: 'Copy the link. The page updates when you change your CV.',
      },
    ],
    tips: ['Check what is shown before sharing; show only what you are happy for anyone to see.'],
    faqs: [
      {
        q: 'Is the page public?',
        a: 'Yes. Anyone with the link can see it, so show only what you are happy for anyone to see.',
      },
    ],
    related: ['linkedin', 'designs', 'documents'],
  },
  {
    slug: 'documents',
    title: 'Documents and backups',
    summary: 'All your CVs and letters in one place, with a backup you can download and restore.',
    forWho: 'Everyone. It is the home for what you have made.',
    open: { href: '/documents', label: 'Open Documents' },
    video: 'documents',
    shots: [
      {
        file: 'documents-1',
        alt: 'The Documents page with CVs and Letters tabs, a message that your CVs are saved to your account, and Download a backup and Restore from a backup buttons',
        caption: 'CVs and letters together. Download or restore a backup from here.',
      },
    ],
    steps: [
      {
        title: 'Open Documents',
        text: 'Choose Documents in the menu. Use the tabs All, CVs and Letters to filter.',
        shot: 0,
      },
      {
        title: 'Start something new',
        text: 'Choose New CV or New letter at the top right.',
      },
      {
        title: 'Keep a backup',
        text: 'Choose Download a backup to save a copy of your CVs. Choose Restore from a backup to bring them back.',
      },
      {
        title: 'Filter by job',
        text: 'Use the For job filter to see the documents you made for one application.',
      },
    ],
    tips: ['Download a backup now and then, especially before big changes.'],
    faqs: [
      {
        q: 'Are my CVs saved automatically?',
        a: 'Yes, when you are signed in they are saved to your account and appear on every device you sign in on.',
      },
    ],
    related: ['editor', 'letters', 'jobs'],
  },
  {
    slug: 'download',
    title: 'Download your CV',
    summary: 'Get a PDF, a plain ATS PDF, a Word file, a pack with certificates, or a backup.',
    forWho: 'Anyone ready to send a CV to an employer.',
    open: { href: '/documents', label: 'Open my CVs' },
    shots: [
      {
        file: 'download-1',
        alt: 'The Ready to send page with Download PDF, ATS PDF, Download Word and CV with certificates buttons beside a preview of the CV',
        caption: 'The Ready to send page. The PDF is the same as the preview.',
      },
    ],
    steps: [
      {
        title: 'Open Download from your CV',
        text: 'In your CV choose Download at the top right. You land on Ready to send, with a last check and a preview of the final page.',
        shot: 0,
      },
      {
        title: 'Choose the file you need',
        text: 'Download PDF is the CV exactly as designed, for people. ATS PDF is the same CV in one plain column for online application forms. Download Word (.docx) gives you an editable file with the same words and colour in a simple one-column layout.',
      },
      {
        title: 'Add certificates if you need them',
        text: 'Choose CV with certificates to get your CV and your certificates as one PDF or a ZIP.',
      },
      {
        title: 'Keep a backup',
        text: 'Choose Save a backup file to keep a copy of the CV on your own device.',
      },
    ],
    tips: [
      'You need to be signed in to download. The page shows how many downloads you have left this month.',
      'If a download fails you can use your browser print window and choose Save as PDF.',
    ],
    faqs: [
      {
        q: 'Will the PDF look like the preview?',
        a: 'Yes. The page says so: the PDF looks exactly like the preview.',
      },
      {
        q: 'Why can I not download a design?',
        a: 'Some designs are part of Premium. The page offers Premium, or a free design instead.',
      },
    ],
    related: ['ats', 'check', 'documents'],
  },
  {
    slug: 'ats',
    title: 'ATS: making your CV readable by employer software',
    summary: 'What an applicant tracking system is, and when to use the plain ATS version.',
    forWho: 'Anyone applying through online forms and job sites.',
    open: { href: '/templates', label: 'Browse designs' },
    shots: [
      {
        file: 'download-1',
        alt: 'The Ready to send page showing the ATS PDF button with its explanation',
        caption: 'ATS PDF (plain, one column) sits under Download PDF.',
      },
    ],
    steps: [
      {
        title: 'Know what it is',
        text: 'Many employers use software, called an applicant tracking system, to read CVs before a person does. It needs real text in a clear order. Every design here is built so this software can read it.',
      },
      {
        title: 'Two versions of the same CV',
        text: 'The designed PDF is for people. The ATS PDF puts the same words in one plain column, in reading order, for online application forms.',
        shot: 0,
      },
      {
        title: 'Choose the ATS PDF for forms',
        text: 'On the download page choose ATS PDF (plain, one column) when a form asks you to upload a CV. Send the designed one by email or in person.',
      },
    ],
    tips: [
      'No format can promise that every system reads a CV perfectly, so keep headings plain and text real.',
    ],
    faqs: [
      {
        q: 'Do I need both?',
        a: 'It helps. The designed version looks better to people; the ATS version is the safest for forms.',
      },
    ],
    related: ['download', 'designs', 'check'],
  },
  {
    slug: 'translate',
    title: 'Translate your CV',
    summary: 'Get a new CV in another language, check it beside the original, then save it.',
    forWho: 'Anyone applying in another language, for example German.',
    open: { href: '/documents', label: 'Open my CVs' },
    shots: [
      {
        file: 'translate-1',
        alt: 'The Translate this CV dialog with a Translate into language choice and a note that a machine translation is a good start',
        caption: 'Choose the language. Your CV stays as it is; you get a new one.',
      },
    ],
    steps: [
      {
        title: 'Open Translate',
        text: 'In your CV use the translate button at the top, next to undo and redo.',
        shot: 0,
      },
      {
        title: 'Choose the language',
        text: 'Pick the language in Translate into and choose Translate. Translation is part of Premium.',
      },
      {
        title: 'Check it beside the original',
        text: 'Your name, employers, places, dates, numbers and web links stay exactly as they are. Pieces that need you are marked: write the translation, or keep the original.',
      },
      {
        title: 'Save it as a new CV',
        text: 'Create the CV. It is saved as a new CV with the language in its name, and your original is untouched.',
      },
    ],
    tips: [
      'A machine translation is a good start. Ask someone who speaks the language to read it before you send it.',
      'The studio itself can also be shown in German, from the language choice in the menu.',
    ],
    faqs: [{ q: 'Does it use AI actions?', a: 'Yes. The dialog says how many it counts for.' }],
    related: ['editor', 'premium', 'download'],
  },
  {
    slug: 'premium',
    title: 'Free account and Premium',
    summary: 'What is free, what Premium adds, and how to see your own plan and usage.',
    forWho: 'Anyone deciding whether they need more than the free account.',
    open: { href: '/premium', label: 'See Premium' },
    shots: [
      {
        file: 'premium-1',
        alt: 'The Premium page with a table comparing Free and Premium for designs, PDF downloads, AI writing help and imports',
        caption: 'The Premium page compares Free and Premium line by line.',
      },
      {
        file: 'account-1',
        alt: 'The Account page showing your plan and how many downloads, imports and AI actions you used this month',
        caption: 'Your Account page shows your plan and what you have used this month.',
      },
    ],
    steps: [
      {
        title: 'Start free',
        text: 'A free account includes the free designs, a monthly number of PDF downloads and CV imports, and your CVs saved in your account.',
      },
      {
        title: 'See what Premium adds',
        text: 'Premium is a one-time pass: every design, more downloads and imports, and AI writing help. It never renews by itself.',
        shot: 0,
      },
      {
        title: 'Check your own usage',
        text: 'Open Account to see your plan, and your downloads, imports and AI actions this month.',
        shot: 1,
      },
    ],
    tips: [
      'The Premium page always shows the current limits and prices; this guide does not repeat them.',
    ],
    faqs: [
      {
        q: 'Does Premium renew by itself?',
        a: 'No. It is a one-time pass, and you only pay again if you choose to.',
      },
      {
        q: 'What happens to my CVs if I do not buy it?',
        a: 'They stay yours, whatever you decide.',
      },
    ],
    related: ['download', 'saving-and-privacy', 'translate'],
  },
  {
    slug: 'saving-and-privacy',
    title: 'Saving, privacy and deleting',
    summary: 'Where your CV is kept, what we store, and how to delete a CV or your account.',
    forWho: 'Anyone who wants to know what happens to their information.',
    open: { href: '/privacy', label: 'Read the privacy page' },
    shots: [
      {
        file: 'privacy-1',
        alt: 'The privacy page in plain words with What we store and When information leaves your device',
        caption:
          'The privacy page explains what is stored and when information leaves your device.',
      },
      {
        file: 'account-1',
        alt: 'The Account page with your email, plan, reminder emails and the app install note',
        caption: 'Account settings, including deleting your account, are on the Account page.',
      },
    ],
    steps: [
      {
        title: 'Where your CV is saved',
        text: 'Without an account, only in this browser. With an account, also in your account, with the last 10 versions of each CV so you can go back. Signing out removes your CVs from that device; they stay in your account.',
      },
      {
        title: 'Read what we store',
        text: 'The privacy page lists what is kept and when information leaves your device, for example when you download a PDF or use AI help.',
        shot: 0,
      },
      {
        title: 'Turn AI help off if you prefer',
        text: 'You can turn AI help off on the privacy page.',
      },
      {
        title: 'Delete a CV or your account',
        text: 'Delete a CV from Documents; it is removed with all its earlier versions. To delete your whole account, open Account and choose Delete my account.',
        shot: 1,
      },
    ],
    tips: ['Download a backup before deleting anything you may want later.'],
    faqs: [
      {
        q: 'Does the AI add things about me?',
        a: 'No. It never adds jobs, dates, qualifications or numbers you did not give. When a detail only you know is needed, it asks and highlights the part until you fill it in.',
      },
    ],
    related: ['documents', 'premium', 'download'],
  },
  {
    slug: 'phone',
    title: 'Use it on your phone',
    summary: 'Every step works on a phone, and you can install the app on your home screen.',
    forWho: 'Anyone who prefers to build or check their CV on a phone.',
    open: { href: '/start', label: 'Start on my phone' },
    shots: [
      {
        file: 'help-1',
        alt: 'The Help page with common questions, including Can I use it on my phone',
        caption: 'The Help page answers common questions, including this one.',
      },
    ],
    steps: [
      {
        title: 'Open the site on your phone',
        text: 'Every step works on a phone. For detailed editing a bigger screen is more comfortable, but it is not required.',
      },
      {
        title: 'Install it',
        text: 'In Chrome or Edge, choose Install in the address bar or the browser menu. On iPhone and iPad, use Safari: Share, then Add to Home Screen.',
      },
      {
        title: 'Sign in to keep going on any device',
        text: 'Your CVs are saved in your account and appear on every device you sign in on.',
        shot: 0,
      },
    ],
    tips: ['On a phone the preview opens on its own tab inside your CV.'],
    faqs: [
      {
        q: 'Is the installed app different?',
        a: 'No. It is the same studio, opened from your home screen.',
      },
    ],
    related: ['start', 'saving-and-privacy', 'editor'],
  },
];

export type Category = { id: string; title: string; blurb: string; slugs: string[] };

/** How the guides are grouped on the learning centre page. Every guide is in exactly one group. */
export const CATEGORIES: Category[] = [
  {
    id: 'get-started',
    title: 'Get started',
    blurb: 'Make your first CV, or bring the one you have.',
    slugs: ['start', 'makeover', 'phone'],
  },
  {
    id: 'write',
    title: 'Write and improve',
    blurb: 'Polish your words and check them before anyone else sees them.',
    slugs: ['editor', 'check', 'letters', 'stories', 'translate'],
  },
  {
    id: 'design',
    title: 'Design',
    blurb: 'Choose the look, and the plain version for online forms.',
    slugs: ['designs', 'ats'],
  },
  {
    id: 'apply',
    title: 'Apply for jobs',
    blurb: 'Keep track, practise and plan your next step.',
    slugs: ['jobs', 'interview-practice', 'coach', 'skills'],
  },
  {
    id: 'share',
    title: 'Share and present',
    blurb: 'Put your story where employers will find it.',
    slugs: ['linkedin', 'portfolio'],
  },
  {
    id: 'account',
    title: 'Download, account and privacy',
    blurb: 'Get your files, and know what happens to your information.',
    slugs: ['download', 'documents', 'premium', 'saving-and-privacy'],
  },
];

export const articleBySlug = (slug: string) => ARTICLES.find((a) => a.slug === slug);
