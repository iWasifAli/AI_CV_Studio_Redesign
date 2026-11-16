import type { FontPairId } from '@/modules/resume/schema';
/**
 * "Statement" family: an editorial front page. A ruled masthead carries the name, then the
 * person's own profile is lifted out of the body and set as a large pull-quote statement beside
 * a captioned portrait column (photo, contact details). Below, a main column with kicker-ruled
 * section heads and dates in a hanging margin, and a narrow column for skills and honours.
 * The statement is the profile itself — never extra text — and shows only when there is one.
 */
import { cvWords } from '@/modules/resume/cv-words';
import type { ReactNode } from 'react';
import { classes, ContactList, Portrait, type TemplateComponentProps } from '../blocks';
import type { CatalogueTemplate } from '../types';
import type { TemplateId } from '@/modules/resume/schema';
import {
  GRAPHIC_BASE_CSS,
  graphicHooks,
  KeyNumbers,
  SplitName,
  type Marker,
  type SkillLook,
} from './parts';

export type StatementConfig = {
  id: TemplateId;
  name: string;
  description: string;
  style: string;
  tags: string[];
  fontPair: FontPairId;
  ink: string;
  soft: string;
  /** Portrait shape in the caption column. */
  frame: 'rect' | 'arch' | 'circle' | 'tall' | 'stamp';
  /** How the statement is opened: a large quote mark, an accent bar, or a drop initial. */
  quote: 'marks' | 'bar' | 'drop';
  /** Key numbers: a ruled row under the statement, or figures in the caption column. */
  numbers: 'ruled' | 'column';
  /** Caption column left or right of the statement. */
  side: 'left' | 'right';
  marker: Marker;
  skills: SkillLook;
  caps: boolean;
  stop: string;
};

/** Statement size steps down with its length, so a long profile still fits the front page. */
export function statementScale(text: string): number {
  const n = text.length;
  return n <= 150 ? 1 : n <= 240 ? 0.86 : n <= 340 ? 0.76 : n <= 460 ? 0.66 : 0.58;
}

function QuoteMark(): ReactNode {
  return (
    <svg className="st-qm" viewBox="0 0 48 36" aria-hidden="true">
      <path
        fill="currentColor"
        d="M0 36V22C0 9.6 6.2 2.2 18.6 0l2 4.6C13.6 6.8 10.4 11 10 17h9v19H0Zm27 0V22C27 9.6 33.2 2.2 45.6 0l2 4.6C40.6 6.8 37.4 11 37 17h9v19H27Z"
      />
    </svg>
  );
}

export function statementTemplate(c: StatementConfig): CatalogueTemplate {
  function Header({ model }: TemplateComponentProps) {
    const t = cvWords(model.locale);
    const summary = model.sections.find((s) => s.kind === 'summary');
    const text = summary?.text?.trim() ?? '';
    const where = model.contacts.find((x) => x.kind === 'location')?.text;
    const stats = model.stats.length >= 2;
    return (
      <header className={classes('st-head', !text && 'st-head--quiet')}>
        <div className="st-mast">
          <SplitName model={model} className="st-name" stop={c.stop} />
          {(model.headline || where) && (
            <p className="st-role">
              {model.headline && <strong>{model.headline}</strong>}
              {where && <span>{where}</span>}
            </p>
          )}
        </div>
        <div className="st-front">
          <div className="st-say">
            {text && (
              <>
                <p className="st-kicker">{summary?.title || t('Profile')}</p>
                {c.quote === 'marks' && <QuoteMark />}
                <p
                  className={`st-quote st-quote--${c.quote}`}
                  style={{ ['--qs' as string]: statementScale(text) }}
                >
                  {text}
                </p>
              </>
            )}
            {stats && c.numbers === 'ruled' && <KeyNumbers model={model} className="st-stats" />}
          </div>
          <div className="st-cap">
            <Portrait model={model} className="st-photo" />
            {model.contacts.length > 0 && (
              <div className="st-contacts">
                <ContactList contacts={model.contacts} icons stacked />
              </div>
            )}
            {stats && c.numbers === 'column' && (
              <KeyNumbers model={model} className="st-stats st-stats--col" />
            )}
          </div>
        </div>
      </header>
    );
  }

  const FRAME: Record<StatementConfig['frame'], string> = {
    rect: '.st-photo{width:100%;height:46mm;border-radius:.8mm}',
    arch: '.st-photo{width:100%;height:50mm;border-radius:26mm 26mm .8mm .8mm}',
    circle:
      '.st-photo{width:40mm;height:40mm;border-radius:50%;box-shadow:0 0 0 1.4mm #fff,0 0 0 2mm var(--g-hot)}',
    tall: '.st-photo{width:100%;height:58mm;border-radius:0;border-bottom:1.6mm solid var(--g-hot)}',
    stamp:
      '.st-photo{width:100%;height:46mm;border-radius:0;outline:.4mm solid var(--g-ink);outline-offset:1.4mm;margin:1.4mm 0}',
  };
  const QUOTE: Record<StatementConfig['quote'], string> = {
    marks: '.st-qm{display:block;width:12mm;height:9mm;color:var(--g-hot);margin-bottom:3mm}',
    bar: '.st-quote--bar{padding-left:5mm;border-left:1.6mm solid var(--g-hot)}',
    drop: '.st-quote--drop::first-letter{float:left;font-size:3.1em;line-height:.82;margin:.06em .1em 0 0;color:var(--g-hot-text);font-weight:800}',
  };
  const capLeft = c.side === 'left';
  const css = `
${GRAPHIC_BASE_CSS}
:root{--g-display:var(--font-heading);--g-ink:${c.ink};--g-soft:${c.soft};--g-hot:var(--accent-raw);--g-on-hot:var(--on-accent-raw);--g-hot-text:var(--accent);
  --g-rule:#d3d8de;--g-track:#dde3e8;--g-chip:var(--g-soft);--g-chip-ink:var(--ink);--side-w:56mm;--st-cap:54mm;
  --margin:calc(13mm * var(--fit-margin));--ink:#15202c;--ink-2:#3a4552;--ink-3:#5d6875}
.cv-top--header{margin-bottom:calc(6mm * var(--fit-gap))}
.st-mast{display:flex;align-items:flex-end;justify-content:space-between;gap:8mm;border-top:2.2mm solid var(--g-ink);padding:5mm 0 4.2mm;border-bottom:.35mm solid var(--g-ink)}
.st-name{font-family:var(--g-display);font-weight:800;font-size:calc(44pt * var(--ns,1));line-height:.95;letter-spacing:-.045em;${c.caps ? 'text-transform:uppercase;' : ''}color:var(--g-ink);overflow-wrap:anywhere;min-width:0}
.st-name > span{display:inline}
.st-name .g-last,.st-name .g-stop{color:var(--g-hot-text)}
.st-role{flex:none;max-width:62mm;text-align:right;display:flex;flex-direction:column;gap:1mm;font-size:7.4pt;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);padding-bottom:1mm}
.st-role strong{color:var(--ink);font-weight:800}
.st-front{display:flex;gap:9mm;padding-top:calc(6mm * var(--fit-gap));${capLeft ? 'flex-direction:row-reverse;' : ''}}
.st-head--quiet .st-front{padding-top:4mm}
.st-say{flex:1;min-width:0;display:flex;flex-direction:column}
.st-kicker{font-size:6.8pt;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--g-hot-text);margin-bottom:3mm}
.st-quote{font-family:var(--g-display);font-weight:600;font-size:calc(17pt * var(--qs,1) * (.86 + .14 * var(--fit-gap)));line-height:1.28;letter-spacing:-.018em;color:var(--g-ink);text-wrap:pretty}
${QUOTE[c.quote]}
.st-cap{flex:none;width:var(--st-cap);display:flex;flex-direction:column;gap:4mm;align-items:${capLeft ? 'flex-start' : 'flex-start'}}
.st-head--quiet .st-cap{flex-direction:row;width:auto;flex:1;align-items:center}
.st-head--quiet .st-say{display:none}
.st-head--quiet .st-photo{width:30mm;height:30mm}
${FRAME[c.frame]}
.cv-portrait--initials.st-photo{background:var(--g-soft);color:var(--g-ink);font-family:var(--g-display);font-weight:800;font-size:30pt;letter-spacing:-.04em}
.st-contacts{font-size:.86em;border-top:.35mm solid var(--g-ink);padding-top:2.6mm;width:100%}
.st-contacts .cv-icon{color:var(--g-hot-text)}
.st-contacts .cv-contact{line-height:1.35}
.st-stats{margin-top:auto;padding-top:5mm}
.st-say .st-stats{border-top:.35mm solid var(--g-rule);margin-top:6mm;padding-top:4mm}
.st-say .g-stat{border-left:.9mm solid var(--g-hot);padding-left:3mm}
.st-stats--col{display:flex;flex-direction:column;gap:3mm;margin:0;padding:3mm 0 0;border-top:.35mm solid var(--g-rule);width:100%}
.st-stats--col .g-stat{display:flex;align-items:baseline;gap:3mm}
.st-stats--col .g-stat-v{font-size:17pt;min-width:15mm}
.st-stats--col .g-stat-l{margin:0}
html[data-fit-compact] .st-photo{height:36mm}
html[data-fit-compact] .st-front{padding-top:4mm}
/* The profile is the statement: its body copy is not repeated. */
.cv-main .k-summary{display:none}
/* Continuation pages: the masthead rule and name. */
.cv-top--running{margin-bottom:5mm}
.st-run{display:flex;justify-content:space-between;align-items:baseline;gap:4mm;border-top:1.4mm solid var(--g-ink);border-bottom:.35mm solid var(--g-ink);padding:2.4mm 0 2mm}
.st-run strong{font-family:var(--g-display);font-weight:800;font-size:12pt;letter-spacing:-.03em;color:var(--g-ink);${c.caps ? 'text-transform:uppercase;' : ''}}
.st-run span{font-size:6.8pt;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}
/* Body: kicker-ruled heads, dates in a hanging margin, a narrow column for lists. */
.cv-body{font-size:.92em}
.cv-has-aside .cv-aside{width:var(--side-w);${capLeft ? 'order:-1;padding-right:6mm' : 'padding-left:6mm'}}
.cv-has-aside .cv-main{${capLeft ? 'padding-left' : 'padding-right'}:7mm}
.b-heading{padding-top:calc(var(--section-gap) * 1.05);padding-bottom:3.2mm}
.b-first{padding-top:0}
.cv-main > .b-heading:first-child,.cv-aside > .b-heading:first-child{padding-top:0}
.b-heading .g-h{border-top:.7mm solid var(--g-ink);padding-top:2mm}
.cv-aside .g-h{font-size:8pt}
.b-entry{padding-top:calc(var(--item-gap) * 1.1)}
.cv-main .b-entry .g-entry{padding-left:24mm}
.cv-main .b-entry .g-when{position:absolute;left:0;top:.25em;width:21mm;margin:0;font-size:.72em;line-height:1.35;white-space:normal}
.cv-main .b-entry .cv-bullets{margin-left:24mm}
.cv-main .b-bullet{padding-left:24mm}
.b-bullet{padding-top:1.2pt}
.b-compact{padding-top:2.2mm}
.b-skills{padding-top:2.8mm}
.b-compact.b-first,.b-skills.b-first{padding-top:0}
`;
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    style: c.style,
    tags: c.tags,
    photo: 'optional',
    contactsIn: 'header',
    support: {
      headerAlign: ['left'],
      skillStyle: ['tags'],
      defaults: { headerAlign: 'left', skillStyle: 'tags', fontPair: c.fontPair },
    },
    asideKinds: ['skills', 'languages', 'certifications', 'licences', 'awards'],
    css,
    hooks: graphicHooks({ marker: c.marker, skills: c.skills }),
    Header,
    Running: ({ model }) => (
      <div className="st-run">
        <strong>{model.name}</strong>
        <span>{model.headline}</span>
      </div>
    ),
  };
}
