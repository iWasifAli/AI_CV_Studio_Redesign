import type { PresetId } from '@/modules/resume/professions';

/**
 * Plain-English CV guides, one per kind of work. The page also shows what the studio really
 * does for that kind of work (its sections, example wording, skills and suggested design come from
 * the same presets the builder uses), so this text only adds the advice.
 * Advice is general and does not depend on one country's rules; "e.g." marks examples.
 */
export type Guide = {
  slug: string;
  preset: Exclude<PresetId, 'general'>;
  /** The page's main heading. */
  title: string;
  /** Search-result title (the site name is added). */
  metaTitle: string;
  metaDescription: string;
  /** Short name used in links to this guide. */
  short: string;
  intro: string;
  tips: { title: string; body: string }[];
  mistakes: string[];
};

export const GUIDES: readonly Guide[] = [
  {
    slug: 'drivers',
    preset: 'driver',
    title: 'A CV for drivers and delivery staff',
    metaTitle: 'Driver CV guide: what to include and how to word it',
    metaDescription:
      'How to write a driver or delivery CV: put licences first, show reliability with real numbers, and keep it to one or two pages. With wording examples.',
    short: 'Drivers & delivery',
    intro:
      'Employers hiring drivers check three things first: can you legally drive the vehicle, are you reliable, and have you done this kind of route before. A good driver CV answers all three in the first few lines.',
    tips: [
      {
        title: 'Lead with your licences',
        body: 'Put the licence categories, any extra entitlements and your driving record status at the top, before work history. If a licence has an expiry or renewal date, say so honestly.',
      },
      {
        title: 'Show reliability with numbers you actually know',
        body: 'Parcels per day, stops per route, years without an at-fault incident, on-time rate. Use a figure only if you know it; “around 120 a day” is better than a made-up percentage.',
      },
      {
        title: 'Name the vehicles and kit',
        body: 'Vans, rigid or articulated trucks, taxis, forklifts, handheld scanners, tachographs, sat-navs. Matching the words in the advert helps both people and screening software.',
      },
      {
        title: 'Keep the work history short',
        body: 'Job title, company, dates, and two or three lines per role. Older or short jobs can be one line each.',
      },
    ],
    mistakes: [
      'Hiding the licence information at the bottom of page two.',
      'Writing “hard-working and reliable” with nothing to back it up.',
      'Leaving unexplained gaps, when a single honest line (for example, “caring for a family member”) is enough.',
    ],
  },
  {
    slug: 'teachers',
    preset: 'teacher',
    title: 'A CV for teachers and education staff',
    metaTitle: 'Teacher CV guide: structure, wording and what schools look for',
    metaDescription:
      'How to write a teacher or teaching assistant CV: qualifications and registration up front, concrete classroom results, and a short personal summary.',
    short: 'Teaching & education',
    intro:
      'Schools want to see that you are qualified, safe to work with children and effective in the classroom. A clear CV shows your qualifications and registration quickly, then proves your teaching with specifics.',
    tips: [
      {
        title: 'Put qualifications and registration where they are easy to find',
        body: 'Teaching qualification, subject degree, and any teacher registration or safeguarding training, with the awarding body and year.',
      },
      {
        title: 'Describe the class, not just the subject',
        body: 'Age group, class size, any specialisms such as special educational needs or English as an additional language, and the curriculum you taught.',
      },
      {
        title: 'Show impact you can stand behind',
        body: 'Progress of a group, a club you started, a project you led, results you helped improve. If you cannot quote a figure, describe the change in plain words.',
      },
      {
        title: 'Write a short summary in your own voice',
        body: 'Two or three sentences on who you teach, how many years you have done it and what you are best at. Avoid long statements of teaching philosophy.',
      },
    ],
    mistakes: [
      'Listing duties (“planned lessons, marked books”) with no outcomes.',
      'Leaving out the age range and subjects, so the school cannot tell if you fit.',
      'Going over two pages for a role where the school reads dozens of applications.',
    ],
  },
  {
    slug: 'nurses-and-carers',
    preset: 'healthcare',
    title: 'A CV for nurses, carers and healthcare staff',
    metaTitle: 'Nursing and care CV guide: registration, experience and wording',
    metaDescription:
      'How to write a CV for nursing, care and clinic roles: show registration first, describe the setting and patients, and keep claims honest and specific.',
    short: 'Healthcare & nursing',
    intro:
      'In healthcare, employers need to know you are registered or certified, what settings you have worked in, and what responsibilities you carried. Accuracy matters more than flair.',
    tips: [
      {
        title: 'Registration and certificates first',
        body: 'Your professional registration (with number and status if you are comfortable sharing it), plus training such as first aid, manual handling, medication or safeguarding.',
      },
      {
        title: 'Describe the setting',
        body: 'Hospital ward, care home, community, clinic, pharmacy, or home care; the number of beds or clients; the type of patients. This is what recruiters scan for.',
      },
      {
        title: 'Say what you were responsible for',
        body: 'Medication rounds, wound care, care plans, handovers, supervising junior staff. Use the verbs your profession uses.',
      },
      {
        title: 'Protect privacy',
        body: 'Never include patient names or identifying details in your examples.',
      },
    ],
    mistakes: [
      'Missing or unclear registration details.',
      'Vague phrases such as “caring nature” instead of specific tasks and settings.',
      'Mixing up dates of roles and training, which can raise questions at checking stage.',
    ],
  },
  {
    slug: 'retail-and-hospitality',
    preset: 'retail',
    title: 'A CV for retail, café and hotel jobs',
    metaTitle: 'Retail and hospitality CV guide: customer service examples that work',
    metaDescription:
      'How to write a CV for shop, café, hotel and restaurant jobs: show customer service, speed, cash handling and flexibility with concrete examples.',
    short: 'Shops, cafés & hotels',
    intro:
      'Hiring managers in retail and hospitality want friendly, dependable people who can handle busy shifts. Your CV should show that in a page, with examples that sound like real shifts.',
    tips: [
      {
        title: 'Show the pace and the people',
        body: 'Covers served per shift, queue sizes, tills or tables you managed, team size, regular customers you looked after.',
      },
      {
        title: 'Mention what you can operate',
        body: 'Tills, card machines, stock systems, booking software, coffee machines, allergen and food-hygiene training.',
      },
      {
        title: 'Be clear about availability',
        body: 'Weekends, evenings, split shifts and seasonal work are selling points. Say what you can do.',
      },
      {
        title: 'Include short jobs and first jobs',
        body: 'For this kind of work, varied short roles are normal. List them briefly instead of trying to hide them.',
      },
    ],
    mistakes: [
      'A long paragraph about yourself and no shift-level detail.',
      'Leaving out languages, which are a real advantage with customers.',
      'Using a very dense design for a role where a clean, friendly page is enough.',
    ],
  },
  {
    slug: 'tradespeople',
    preset: 'trades',
    title: 'A CV for tradespeople and construction workers',
    metaTitle: 'Trades CV guide: tickets, projects and how to word them',
    metaDescription:
      'How to write a CV for electricians, plumbers, builders and mechanics: lead with tickets and certifications, then show the kind and size of jobs you have done.',
    short: 'Trades & construction',
    intro:
      'For trades, what you are certified to do comes first, then the kind of jobs you have done. Site managers and customers want proof of competence and safety, not long descriptions.',
    tips: [
      {
        title: 'Lead with tickets and certifications',
        body: 'Trade qualifications, site-safety cards, scheme memberships, plus the expiry dates where they apply.',
      },
      {
        title: 'Describe jobs by type and size',
        body: 'New builds, rewires, boiler installs, fit-outs, repairs; domestic or commercial; rough value or number of units if you know it.',
      },
      {
        title: 'Name tools, systems and standards',
        body: 'The equipment, software and regulations you work with. It shows you can start without hand-holding.',
      },
      {
        title: 'Add a few references or named employers',
        body: 'If you worked for well-known contractors or have repeat customers, say so.',
      },
    ],
    mistakes: [
      'Forgetting tickets that have expired or listing ones you do not hold.',
      'Writing only “general building work” without saying what you did.',
      'No contact number, so the person who wants to call you cannot.',
    ],
  },
  {
    slug: 'office-and-admin',
    preset: 'office',
    title: 'A CV for office, admin and customer service roles',
    metaTitle: 'Office and admin CV guide: wording, keywords and layout',
    metaDescription:
      'How to write an administration, accounts or customer service CV: show the systems you use, the volume you handle, and the improvements you made.',
    short: 'Office & admin',
    intro:
      'Office roles often get a large number of applications, so the CV is read quickly and sometimes filtered by software first. Clear structure and the right keywords carry a lot of weight.',
    tips: [
      {
        title: 'List the systems you use',
        body: 'Spreadsheets, accounting packages, CRM, ticketing, booking or HR systems. Use the same names the advert uses.',
      },
      {
        title: 'Give volumes and turnaround',
        body: 'Invoices per week, calls or tickets per day, accounts you managed, how quickly you resolved things.',
      },
      {
        title: 'Show improvements',
        body: 'A process you tidied up, an error you reduced, a template you made. Say what changed.',
      },
      {
        title: 'Use a simple layout for online forms',
        body: 'Many employers read CVs through screening software. A single-column version with real text, headings and no tables is the safest.',
      },
    ],
    mistakes: [
      'Duties lists copied from a job description with no results.',
      'Skills sections that are a long cloud of buzzwords.',
      'A decorative design that confuses application systems.',
    ],
  },
  {
    slug: 'developers-and-engineers',
    preset: 'tech',
    title: 'A CV for developers, engineers and IT support',
    metaTitle: 'Tech CV guide: how to present skills, projects and impact',
    metaDescription:
      'How to write a CV for developer, engineer and IT support roles: group skills sensibly, describe projects by problem and outcome, and link to real work.',
    short: 'Technology & engineering',
    intro:
      'Technical hiring managers want to know what you built or fixed, with which tools, and what changed because of it. Group your skills, lead with recent work, and link to anything they can inspect.',
    tips: [
      {
        title: 'Group skills by kind',
        body: 'Languages, frameworks, tools, cloud and databases, or for IT support: systems, networks, ticketing. Put your strongest first.',
      },
      {
        title: 'Describe projects as problem, action, result',
        body: 'What was wrong or needed, what you did, and what improved. One real measurement beats five adjectives.',
      },
      {
        title: 'Link to work they can open',
        body: 'Repositories, a portfolio, a published app or write-up. Only include links that work and that you are happy to be judged on.',
      },
      {
        title: 'Keep it current',
        body: 'Recent roles get the most space; old technologies you no longer use can go.',
      },
    ],
    mistakes: [
      'A skills list with every tool you have ever touched.',
      'Team achievements presented as if they were all yours.',
      'No dates on roles or projects, which makes experience hard to judge.',
    ],
  },
  {
    slug: 'managers',
    preset: 'executive',
    title: 'A CV for managers and senior leaders',
    metaTitle: 'Manager and leadership CV guide: showing scope and results',
    metaDescription:
      'How to write a management or leadership CV: show the size of teams and budgets, decisions you owned and results you can attribute to you.',
    short: 'Management & leadership',
    intro:
      'For senior roles, the CV is about scope and results: how many people, how much money, which decisions were yours, and what changed. Be specific, and be honest about what was yours and what was a team effort.',
    tips: [
      {
        title: 'State the scope in each role',
        body: 'Team size, budget or revenue responsibility, sites or regions, who you reported to.',
      },
      {
        title: 'Lead bullets with the outcome',
        body: 'Start with what improved (cost, speed, quality, retention), then how you did it.',
      },
      {
        title: 'Separate “led” from “contributed to”',
        body: 'Recruiters check. Say what you owned, and credit the team for the rest.',
      },
      {
        title: 'Keep early career brief',
        body: 'The last ten to fifteen years deserve the detail; earlier roles can be one line each.',
      },
    ],
    mistakes: [
      'Long paragraphs of leadership language with no numbers.',
      'Going past two pages for the sake of completeness.',
      'Leaving out board, committee or professional-body roles that show standing.',
    ],
  },
  {
    slug: 'students',
    preset: 'student',
    title: 'A CV for students and first jobs',
    metaTitle: 'Student and first-job CV guide: what to put when you have little experience',
    metaDescription:
      'How to write a CV when you are a student or applying for a first job: lead with education and projects, count part-time work and volunteering, and keep it to one page.',
    short: 'Students & first jobs',
    intro:
      'You do not need a long work history. Employers hiring for a first job look for reliability, willingness to learn and evidence that you finish what you start. Education, projects and small jobs all count.',
    tips: [
      {
        title: 'Lead with education',
        body: 'Course, school or university, expected or achieved grades, and the subjects most relevant to the job.',
      },
      {
        title: 'Count everything that shows responsibility',
        body: 'Part-time work, volunteering, clubs, projects, caring for family, helping in a family business. Say what you did and what it taught you.',
      },
      {
        title: 'Show skills with an example',
        body: 'Instead of “good communicator”, write what you did: presented a project, handled customers, organised an event.',
      },
      {
        title: 'Keep it to one page',
        body: 'Short and clear is better than padded. Leave room around the text.',
      },
    ],
    mistakes: [
      'Padding with school details that are not relevant.',
      'An unprofessional email address.',
      'Leaving out voluntary and informal work because it was “not a real job”.',
    ],
  },
];

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug);
