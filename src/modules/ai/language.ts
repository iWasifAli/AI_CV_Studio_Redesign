/**
 * Which language an AI task writes in. Text that goes on the CV, a letter or a profile follows
 * the language of the person's own material (a German CV gets German bullets, even in the English
 * interface); advice and explanations follow the interface language. Copy-only tasks never change
 * language.
 */
import type { TaskId } from './schemas';

export type OutLang = 'en' | 'de';

const COPY: ReadonlySet<string> = new Set([
  'import.structure',
  'import.transcribe',
  'translate.document',
  'jobs.extract',
  'design.compose',
  'design.refine',
  'design.interpret',
  'intake.interpret',
  'quality.atsKeywords',
  'quality.rewriteKeywords',
]);
const CONTENT: ReadonlySet<string> = new Set([
  'write.summary',
  'write.improveBullets',
  'write.rewrite',
  'cv.edit',
  'write.quantify',
  'write.fromNotes',
  'suggest.skills',
  'job.tailor',
  'letter.write',
  'letter.generic',
  'story.draft',
  'linkedin.write',
  'quality.proofread',
]);

const DE_WORDS =
  /\b(?:und|der|die|das|den|dem|mit|für|bei|von|seit|bis|ich|wir|sie|ist|sind|eine?n?|nicht|auch|als|auf|zur|zum|im|heute|berufserfahrung|kenntnisse|verantwortlich|gmbh)\b/gi;
const EN_WORDS =
  /\b(?:and|the|with|for|from|to|of|in|on|is|are|was|i|we|you|my|our|a|an|not|also|as|at|responsible|managed|led|experience)\b/gi;

/** The language most of this text is written in, or null when it can't tell. */
export function textLanguage(text: string): OutLang | null {
  const de = text.match(DE_WORDS)?.length ?? 0;
  const en = text.match(EN_WORDS)?.length ?? 0;
  if (de >= 3 && de > en * 1.3) return 'de';
  if (en >= 3 && en > de * 1.3) return 'en';
  return null;
}

/** All the person's words in a task input (string values only; keys and numbers are ignored). */
function wordsOf(input: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 8 || out.length > 4000) return out;
  if (typeof input === 'string') out.push(input);
  else if (Array.isArray(input)) for (const v of input) wordsOf(v, out, depth + 1);
  else if (input && typeof input === 'object')
    for (const [k, v] of Object.entries(input)) {
      if (k === 'locale' && typeof v === 'string')
        out.push(v.startsWith('de') ? 'und und und' : '');
      else wordsOf(v, out, depth + 1);
    }
  return out;
}

export function outputLanguage(
  id: TaskId | string,
  input: unknown,
  uiLang: OutLang,
): OutLang | null {
  if (COPY.has(id)) return null;
  if (CONTENT.has(id)) return textLanguage(wordsOf(input).join(' ')) ?? uiLang;
  return uiLang;
}

/** The rule added to the system prompt, or '' for English (the prompts' own language). */
export function languageRule(lang: OutLang | null): string {
  if (lang !== 'de') return '';
  return `

LANGUAGE: Write every piece of text you produce in German (Deutsch), whatever language these instructions are in. Address the person with the formal "Sie". Use German conventions (dates like 03/2019, "heute" for the present, decimal commas). Keep names of people, employers, schools, places, products and qualifications exactly as given. Letters and emails: greeting "Sehr geehrte Damen und Herren," (or "Sehr geehrte Frau <Name>," / "Sehr geehrter Herr <Name>," when a person is named), closing "Mit freundlichen Grüßen", email subject "Bewerbung als <Stelle>". All other rules above still apply.`;
}

/** A short text (one bullet, one sentence) that reads as German. */
export function looksGerman(text: string): boolean {
  const de = text.match(DE_WORDS)?.length ?? 0;
  const en = text.match(EN_WORDS)?.length ?? 0;
  return (de >= 2 && de > en) || (/[äöüß]/i.test(text) && de >= 1 && de >= en);
}
