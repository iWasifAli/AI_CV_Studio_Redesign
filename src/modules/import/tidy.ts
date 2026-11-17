import type { ResumeDocument, Section } from '@/modules/resume/schema';

/**
 * Last step of every import (AI or rules): lines the structurer could not place are kept, but
 *  - all "Other" lines go in one section at the end (never between the profile and the jobs);
 *  - personal details (nationality, date of birth…) become a "Personal details" section (label: value);
 *  - contact lines that only repeat the phone, email, location or a link already in the header
 *    ("Phone / WhatsApp: +92 …") are dropped, since nothing is lost.
 * Nothing else changes; no line is rewritten.
 */
const LABEL =
  /^(phone\s*\/\s*whatsapp|phone|tel(?:ephone)?|mobile|cell|whatsapp|e-?mail|location|address|linkedin|website|web|github|portfolio)\s*[:：-]\s*/i;
const PERSONAL =
  /^(nationality|citizenship|date of birth|d\.?\s?o\.?\s?b\.?|birth\s?date|place of birth|marital status|religion|gender|cnic|national id(?:entity)?(?: card)?(?: no\.?| number)?|passport(?: no\.?| number)?|domicile|father'?s name|visa status|work permit|driving licen[cs]e)\s*[:：-]/i;

/** A bare date of birth as designed CVs print it next to a calendar icon ("09.08.1987"). */
const BARE_DOB =
  /^(?:\d{1,2}[./-]\d{1,2}[./-](?:19[3-9]\d|200\d)|(?:19[3-9]\d|200\d)[./-]\d{1,2}[./-]\d{1,2})$/;
/** A bare nationality as designed CVs print it next to a flag icon ("Pakistani"). */
const BARE_NATIONALITY =
  /^(?:afghan|american|australian|austrian|bangladeshi|belgian|brazilian|british|canadian|chinese|danish|dutch|egyptian|emirati|filipino|finnish|french|german|greek|indian|indonesian|iranian|iraqi|irish|italian|japanese|jordanian|kenyan|korean|lebanese|malaysian|nigerian|norwegian|pakistani|polish|portuguese|romanian|russian|saudi|singaporean|south african|spanish|sri lankan|swedish|swiss|syrian|turkish|ukrainian|vietnamese)$/i;
const bareLabel = (l: string) =>
  BARE_DOB.test(l.trim()) ? 'Date of birth' : BARE_NATIONALITY.test(l.trim()) ? 'Nationality' : '';

const digits = (s: string) => s.replace(/\D/g, '');
const bare = (s: string) =>
  s
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .trim();

export function repeatsContact(line: string, doc: ResumeDocument): boolean {
  const m = LABEL.exec(line.trim());
  if (!m) return false;
  const value = line.trim().slice(m[0].length).trim();
  if (!value) return true;
  const b = doc.basics;
  const phone = digits(b.phone);
  if (
    digits(value).length >= 7 &&
    phone &&
    phone.endsWith(digits(value).slice(-7)) &&
    digits(value).length <= phone.length + 2
  )
    return true;
  const v = bare(value);
  return (
    v === bare(b.email) ||
    v === bare(b.location) ||
    b.links.some((l) => bare(l.url) === v) ||
    (!!b.location && bare(b.location).includes(v) && v.length > 3)
  );
}

const isOther = (s: Section) =>
  s.kind === 'custom' && /^(other|others|additional information)$/i.test(s.title.trim());

export function tidyImport(doc: ResumeDocument): ResumeDocument {
  const others = doc.sections.filter(isOther);
  if (!others.length) return doc;
  const lines: string[] = [];
  for (const s of others)
    for (const it of s.items as {
      title?: string;
      subtitle?: string;
      date?: string;
      bullets?: string[];
    }[])
      for (const l of [it.title, it.subtitle, it.date, ...(it.bullets ?? [])])
        if (l?.trim()) lines.push(l.trim());
  // A monogram ("DO", "DO/") or a stray fragment from a designed PDF is not content (gap audit
  // G-08): the rules path dropped these, the AI path did not, so it is done here for both.
  const mono = doc.basics.name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .map((w) => w[0]!.toUpperCase())
    .join('');
  const fragment = (l: string) => {
    const t = l.replace(/[^\p{L}\p{N}]/gu, '');
    return t.length < 3 || (mono.length >= 2 && t.toUpperCase() === mono);
  };
  const keep = lines.filter((l) => !repeatsContact(l, doc) && !fragment(l));
  const isPersonal = (l: string) => PERSONAL.test(l) || bareLabel(l) !== '';
  const personal = keep.filter(isPersonal);
  const rest = keep.filter((l) => !isPersonal(l));
  const id = (p: string) => `${p}-${others[0]!.id}`.slice(0, 64);
  const section = (title: string, bullets: string[], key: string): Section => ({
    id: id(key),
    kind: 'custom',
    title,
    hidden: false,
    items: [
      { id: id(`${key}-i`), title: '', subtitle: '', date: '', bullets: bullets.slice(0, 40) },
    ],
  });
  return {
    ...doc,
    sections: [
      ...doc.sections.filter((s) => !isOther(s)),
      ...(personal.length
        ? [
            {
              id: id('pd'),
              kind: 'personalDetails' as const,
              title: 'Personal details',
              hidden: false,
              items: personal.slice(0, 20).map((l, i) => {
                const m = /^([^:：]{1,60})\s*[:：-]\s*(.*)$/.exec(l);
                return {
                  id: id(`pd-${i}`),
                  label: (m?.[1] ?? bareLabel(l)).trim().slice(0, 60),
                  value: (m ? m[2]! : l).trim().slice(0, 200),
                };
              }),
            },
          ]
        : []),
      ...(rest.length ? [section('Other', rest, 'other')] : []),
    ],
  };
}
