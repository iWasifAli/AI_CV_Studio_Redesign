import type { ResumeDocument } from './schema';

/**
 * CV standards: the conventions a CV usually follows in a part of the world. A person picks one
 * ("convert my CV to the European standard") and the paper size, photo and advice follow it. A
 * standard is derived from the country (doc.market) unless the person chose one themselves
 * (doc.standard), so older CVs keep working unchanged.
 */
export const STANDARD_IDS = ['international', 'uk', 'us', 'europe', 'gulf', 'southasia'] as const;
export type StandardId = (typeof STANDARD_IDS)[number];

export interface CvStandard {
  id: StandardId;
  name: string;
  /** One line shown under the choice. */
  summary: string;
  /** Countries that use it (ISO codes), for deriving it from doc.market. */
  markets: string[];
  paper: 'A4' | 'Letter';
  /** Is a photo usual (true), unusual (false) or left to the person (undefined)? */
  photo: boolean | undefined;
  /** Are date of birth and nationality customary (so not flagged)? */
  personalDetailsUsual: boolean;
  /** Short list of what employers there usually expect, shown when the standard is picked. */
  expects: string[];
}

export const STANDARDS: CvStandard[] = [
  {
    id: 'international',
    name: 'International (neutral)',
    summary: 'Safe for most employers: no photo, no personal details, A4.',
    markets: [],
    paper: 'A4',
    photo: false,
    personalDetailsUsual: false,
    expects: [
      'No photo, date of birth or marital status',
      'One or two pages',
      'Results with numbers where you can',
    ],
  },
  {
    id: 'uk',
    name: 'UK, Ireland, Australia, New Zealand',
    summary: 'No photo or personal details. Two pages. A4.',
    markets: ['GB', 'IE', 'AU', 'NZ'],
    paper: 'A4',
    photo: false,
    personalDetailsUsual: false,
    expects: [
      'No photo, date of birth, nationality or marital status',
      'A short personal profile at the top',
      'Two pages at most',
    ],
  },
  {
    id: 'us',
    name: 'USA and Canada',
    summary: 'No photo or personal details. Letter paper. One or two pages.',
    markets: ['US', 'CA'],
    paper: 'Letter',
    photo: false,
    personalDetailsUsual: false,
    expects: [
      'No photo, age, nationality or marital status',
      'Letter-size paper',
      'Achievements with numbers, one page for early career',
    ],
  },
  {
    id: 'europe',
    name: 'Europe (German-speaking, Benelux, France, Spain, Italy)',
    summary: 'Photo and date of birth are common. Clear dates, A4.',
    markets: ['DE', 'AT', 'CH', 'LI', 'LU', 'NL', 'FR', 'ES', 'IT'],
    paper: 'A4',
    photo: true,
    personalDetailsUsual: true,
    expects: [
      'A professional photo is common (optional in the Netherlands)',
      'Date of birth and nationality are common',
      'Complete month-by-month dates with no gaps',
      'Languages with levels (A1 to C2)',
    ],
  },
  {
    id: 'gulf',
    name: 'Gulf (UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman)',
    summary: 'Photo, nationality and visa status are usual. A4.',
    markets: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'],
    paper: 'A4',
    photo: true,
    personalDetailsUsual: true,
    expects: [
      'A professional photo is usual',
      'Nationality, visa or residence status and notice period',
      'Languages and driving licence',
      'Gulf experience marked clearly, with references on request',
    ],
  },
  {
    id: 'southasia',
    name: 'Pakistan and India',
    summary: 'Personal details and a photo are common. A4.',
    markets: ['PK', 'IN'],
    paper: 'A4',
    photo: true,
    personalDetailsUsual: true,
    expects: [
      'A recent photo is common',
      'Date of birth and nationality are often asked for',
      'Skills, certifications and references',
    ],
  },
];

export function getStandard(id: string | undefined): CvStandard | undefined {
  return STANDARDS.find((s) => s.id === id);
}

/** The standard a country follows (undefined = not one of the listed ones). */
export function standardForMarket(market: string | undefined): CvStandard | undefined {
  return market ? STANDARDS.find((s) => s.markets.includes(market)) : undefined;
}

/** The standard in force for a CV: the person's own choice, else the one for the country. */
export function standardOf(
  doc: Pick<ResumeDocument, 'standard' | 'market'>,
): CvStandard | undefined {
  return getStandard(doc.standard) ?? standardForMarket(doc.market);
}

/**
 * Convert a CV to a standard: sets the paper, the photo (only if one exists; a person who has
 * none is not asked for one) and remembers the choice. The text and sections are never touched.
 */
export function applyStandard(doc: ResumeDocument, id: StandardId): ResumeDocument {
  const s = getStandard(id)!;
  const showPhoto = s.photo === undefined ? doc.design.options.showPhoto : s.photo;
  return {
    ...doc,
    standard: id,
    design: {
      ...doc.design,
      pageSize: s.paper,
      options: { ...doc.design.options, showPhoto },
    },
  };
}

/** What a CV is still missing for the standard, as plain suggestions (never blocks anything). */
export function standardGaps(doc: ResumeDocument): string[] {
  const s = standardOf(doc);
  if (!s || !s.personalDetailsUsual) return [];
  const out: string[] = [];
  if (s.photo && !doc.basics.photo) out.push('Add a professional photo');
  const hasDetails = doc.sections.some((x) => x.kind === 'personalDetails' && !x.hidden);
  if (!hasDetails)
    out.push(
      s.id === 'gulf'
        ? 'Add a personal-details section: nationality, visa status, notice period'
        : 'Add a personal-details section: date of birth, nationality',
    );
  return out;
}
