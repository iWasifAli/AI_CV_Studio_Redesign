/**
 * The two CVs from the independent audit (15 Nov 2026), kept as stress fixtures: a 24-year
 * executive with a 49-character double-barrelled name, a 68-character email, 11 sections and a
 * link whose label is its address; and a short graduate CV. All people and companies are fictional.
 */
import { resumeDocument, type ResumeDocument } from './schema';
import executiveJson from './__fixtures__/audit-executive.json';
import graduateJson from './__fixtures__/audit-graduate.json';

export const auditExecutive: ResumeDocument = resumeDocument.parse(executiveJson);
export const auditGraduate: ResumeDocument = resumeDocument.parse(graduateJson);

export const STRESS_FIXTURES = { auditExecutive, auditGraduate } as const;
