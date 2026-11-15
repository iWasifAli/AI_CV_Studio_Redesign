/**
 * Checks on what people write when they share a design: plain words only, no links, emails or
 * phone numbers (so a design can't be used to advertise), nothing offensive.
 */
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|pk|co|app|xyz|info|me)\b)/i;
const EMAIL = /\S+@\S+\.\S+/;
const PHONE = /(\+?\d[\d\s-]{7,}\d)/;
// A short list; the owner's review is the real gate.
const BAD = /\b(fuck|shit|bitch|cunt|nigg|whore|slut|porn|sex|casino|viagra)\w*/i;

export function cleanText(v: unknown, max: number): string {
  return typeof v === 'string'
    ? v
        .replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';
}

/** Why the text can't be used, or null when it is fine. */
export function textProblem(label: string, text: string): string | null {
  if (LINK.test(text) || EMAIL.test(text) || PHONE.test(text))
    return `${label} can’t include links, emails or phone numbers.`;
  if (BAD.test(text)) return `${label} has words we can’t show.`;
  return null;
}
