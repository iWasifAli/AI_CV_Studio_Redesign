import { z } from 'zod';
import type { Reminder } from './reminders';
import { letter } from '@/modules/letters/schema';
import type { InterviewPrep } from './interview';
import type { MatchResult } from './match';
import type { MockSession } from './mock';

/** Job tracker (Release 2). Jobs live in the account (users/{uid}/jobs/{id}); server-side only. */
export const JOB_STAGES = ['saved', 'applied', 'interview', 'offer', 'closed'] as const;
export type JobStage = (typeof JOB_STAGES)[number];
export const STAGE_LABEL: Record<JobStage, string> = {
  saved: 'Saved',
  applied: 'Applied',
  interview: 'Interview',
  offer: 'Offer',
  closed: 'Closed',
};

/** How a closed application ended (R9.10). Optional; it decides what counts as a reply. */
export const JOB_OUTCOMES = [
  'rejected',
  'no_reply',
  'withdrew',
  'declined',
  'accepted',
  'not_applied',
] as const;
export type JobOutcome = (typeof JOB_OUTCOMES)[number];
export const OUTCOME_LABEL: Record<JobOutcome, string> = {
  rejected: 'They said no',
  no_reply: 'No reply',
  withdrew: 'I withdrew',
  declined: 'I turned down the offer',
  accepted: 'I accepted the offer',
  not_applied: 'I didn’t apply',
};

/** yyyy-mm-dd per stage, the first day the job reached it (written by the server). */
export type StageDates = Partial<Record<JobStage, string>>;

/** The CV sent for an application, as it was then (written by the server, R9.10). */
export type SentWith = {
  cvId: string;
  title: string;
  /** A copy tailored for this job, made from another CV (`baseId`). */
  tailored: boolean;
  baseId?: string;
  baseTitle?: string;
  /** Catalogue design id, or null for a design of the person's own. */
  designId: string | null;
  designName: string;
};

export const jobInput = z.object({
  title: z.string().trim().min(1, 'Add the job title.').max(160),
  company: z.string().trim().max(160).default(''),
  location: z.string().trim().max(120).default(''),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((u) => !u || /^https?:\/\/\S+$/i.test(u), 'Use a full link starting with https://')
    .default(''),
  /** The advert text, pasted by the person (used for matching and letters). */
  advert: z.string().max(20_000).default(''),
  stage: z.enum(JOB_STAGES).default('saved'),
  /** How it ended, when closed. */
  outcome: z.enum(JOB_OUTCOMES).or(z.literal('')).default(''),
  notes: z.string().max(4000).default(''),
  /** yyyy-mm-dd, when they applied (set automatically when moved to Applied). */
  appliedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal(''))
    .default(''),
  /** CVs (or letters) used for this application. */
  documentIds: z.array(z.string().max(64)).max(10).default([]),
  /** Cover letter for this job (drafted with AI, edited by the person). */
  letter: letter.optional(),
  /** The person's own notes for each interview question (same order as `interview.questions`). */
  interviewNotes: z.array(z.string().max(2000)).max(12).default([]),
});
export type JobInput = z.input<typeof jobInput>;

export const job = jobInput.extend({
  id: z.string().max(64),
  /** Last CV-vs-advert check (written by the server only). */
  match: z.custom<MatchResult>().optional(),
  /** Interview preparation (written by the server only). */
  interview: z.custom<InterviewPrep>().optional(),
  /** Mock interview in progress or just finished (R9, server only). */
  mock: z.custom<MockSession>().optional(),
  /** Earlier mock interviews: when, and the verdict per answer (last 5). */
  mockPast: z
    .array(z.object({ at: z.string(), verdicts: z.array(z.string()), summary: z.string() }))
    .optional(),
  /** Application kit (R8.4): the tailored CV made with the letter and email (server only). */
  kit: z.object({ cvId: z.string().max(64), at: z.string() }).optional(),
  /** Reminders (R9.6), written through /api/jobs/[id]/reminders only. */
  reminders: z.custom<Reminder[]>().optional(),
  /** First day each stage was reached (R9.10, server only). */
  reached: z.custom<StageDates>().optional(),
  /** The CV sent, as it was when applied (R9.10, server only). */
  sent: z.custom<SentWith | null>().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Job = z.infer<typeof job>;
