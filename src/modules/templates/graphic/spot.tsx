import type { FontPairId } from '@/modules/resume/schema';
/**
 * "Spotlight" family: a deep colour header with the name set huge, a framed portrait standing on
 * the key-numbers band, then a main column with a timeline and a side column with contact
 * details, skills and recognition. Five designs share the structure but differ in composition:
 * portrait frame, header art, key-number treatment, heading marker and side column.
 */
import { cvWords } from '@/modules/resume/cv-words';
import type { ReactNode } from 'react';
import { Portrait, type TemplateComponentProps } from '../blocks';
import type { CatalogueTemplate } from '../types';
import type { TemplateId } from '@/modules/resume/schema';
import {
  GRAPHIC_BASE_CSS,
  graphicHooks,
  KeyNumbers,
  Monogram,
  SplitName,
  StackedContacts,
  type Marker,
  type SkillLook,
} from './parts';

export type SpotConfig = {
  id: TemplateId;
  name: string;
  description: string;
  style: string;
  tags: string[];
  /** Header and dark parts. */
  ink: string;
  /** Pale tint behind light bands. */
  soft: string;
  portrait: 'arch' | 'circle' | 'squircle' | 'leaf' | 'hexagon';
  art: 'rings' | 'beams' | 'dots' | 'waves' | 'blocks';
  /** Key numbers: a full colour band, cards over the header edge, or a ruled line. */
  numbers: 'band' | 'cards' | 'ruled';
  marker: Marker;
  skills: SkillLook;
  /** Side column left or right of the timeline. */
  side: 'right' | 'left';
  fontPair: FontPairId;
  /** Name case: shouting capitals or normal. */
  caps: boolean;
  /** Mark after the last name. */
  stop: string;
};

function Art({ kind }: { kind: SpotConfig['art'] }): ReactNode {
  const w = 'rgba(255,255,255,';
  switch (kind) {
    case 'rings':
      return (
        <svg
          className="sp-art"
          viewBox="0 0 800 330"
          preserveAspectRatio="xMaxYMid slice"
          aria-hidden="true"
        >
          <circle cx="610" cy="70" r="140" fill="none" stroke={`${w}.07)`} strokeWidth="80" />
          <line x1="230" y1="330" x2="800" y2="40" stroke={`${w}.15)`} strokeWidth="1" />
          <circle
            cx="748"
            cy="82"
            r="21"
            fill="none"
            stroke="var(--g-hot)"
            strokeWidth="2"
            opacity=".8"
          />
          <circle
            cx="481"
            cy="292"
            r="8"
            fill="none"
            stroke="var(--g-hot)"
            strokeWidth="2"
            opacity=".8"
          />
        </svg>
      );
    case 'beams':
      return (
        <svg
          className="sp-art"
          viewBox="0 0 800 330"
          preserveAspectRatio="xMaxYMid slice"
          aria-hidden="true"
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path
              key={i}
              d={`M${330 + i * 78} 330 L${470 + i * 78} 0 L${492 + i * 78} 0 L${352 + i * 78} 330Z`}
              fill={`${w}${0.03 + (i % 3) * 0.015})`}
            />
          ))}
          <rect
            x="702"
            y="38"
            width="44"
            height="44"
            rx="6"
            fill="none"
            stroke="var(--g-hot)"
            strokeWidth="2"
            opacity=".85"
            transform="rotate(12 724 60)"
          />
        </svg>
      );
    case 'dots':
      return (
        <svg
          className="sp-art"
          viewBox="0 0 800 330"
          preserveAspectRatio="xMaxYMid slice"
          aria-hidden="true"
        >
          <circle cx="640" cy="40" r="170" fill={`${w}.05)`} />
          <g fill={`${w}.22)`}>
            {Array.from({ length: 48 }, (_, i) => (
              <circle key={i} cx={380 + (i % 8) * 16} cy={36 + Math.floor(i / 8) * 16} r="2.1" />
            ))}
          </g>
          <circle cx="760" cy="292" r="14" fill="var(--g-hot)" opacity=".9" />
        </svg>
      );
    case 'waves':
      return (
        <svg
          className="sp-art"
          viewBox="0 0 800 330"
          preserveAspectRatio="xMaxYMid slice"
          aria-hidden="true"
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <path
              key={i}
              d={`M300 ${250 - i * 34} C 420 ${190 - i * 34}, 520 ${300 - i * 34}, 640 ${230 - i * 34} S 800 ${170 - i * 34}, 860 ${210 - i * 34}`}
              fill="none"
              stroke={`${w}${0.07 + i * 0.02})`}
              strokeWidth="2"
            />
          ))}
          <circle cx="742" cy="70" r="18" fill="none" stroke="var(--g-hot)" strokeWidth="2.5" />
        </svg>
      );
    case 'blocks':
      return (
        <svg
          className="sp-art"
          viewBox="0 0 800 330"
          preserveAspectRatio="xMaxYMid slice"
          aria-hidden="true"
        >
          <rect
            x="520"
            y="-40"
            width="300"
            height="300"
            fill={`${w}.05)`}
            transform="rotate(18 670 110)"
          />
          <rect
            x="430"
            y="150"
            width="120"
            height="120"
            fill={`${w}.04)`}
            transform="rotate(18 490 210)"
          />
          <rect
            x="735"
            y="250"
            width="30"
            height="30"
            fill="var(--g-hot)"
            transform="rotate(18 750 265)"
          />
          <path d="M360 40 h70 M360 52 h46" stroke="var(--g-hot)" strokeWidth="3" opacity=".9" />
        </svg>
      );
  }
}

/** No eyebrow: a CV does not greet the reader; the name is the heading. */
const hello = (_locale: string) => '';

export function spotTemplate(c: SpotConfig): CatalogueTemplate {
  function Header({ model }: TemplateComponentProps) {
    const role = model.headline;
    const where = model.contacts.find((x) => x.kind === 'location')?.text;
    return (
      <header className="sp-head">
        <div className="sp-dark">
          <Art kind={c.art} />
          <div className="sp-id">
            {hello(model.locale) && <p className="sp-eyebrow">{hello(model.locale)}</p>}
            <SplitName model={model} className="sp-name" stop={c.stop} />
            {(role || where) && (
              <p className="sp-role">
                {role && <strong>{role}</strong>}
                {role && where && <span className="sp-sep"> / </span>}
                {where && <span>{where}</span>}
              </p>
            )}
          </div>
          <Portrait model={model} className="sp-photo" />
          {/* After the name in the DOM: the PDF text then reads name first (paint order = DOM order). */}
          <Monogram model={model} />
        </div>
        <KeyNumbers model={model} className="sp-stats" />
      </header>
    );
  }

  const PORTRAIT: Record<SpotConfig['portrait'], string> = {
    arch: 'border-radius:50% 50% 0 0/42% 42% 0 0;border-bottom:0;width:56mm;height:66mm;bottom:0',
    circle: 'border-radius:50%;width:58mm;height:58mm;bottom:9mm',
    squircle: 'border-radius:9mm;width:56mm;height:62mm;bottom:7mm;transform:rotate(-3deg)',
    leaf: 'border-radius:30mm 3mm 30mm 3mm;width:58mm;height:64mm;bottom:5mm',
    hexagon:
      'border:0;width:60mm;height:68mm;bottom:4mm;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)',
  };

  const sideLeft = c.side === 'left';
  const css = `
${GRAPHIC_BASE_CSS}
:root{--g-display:var(--font-heading);--g-ink:${c.ink};--g-soft:${c.soft};--g-hot:var(--accent-raw);--g-on-hot:var(--on-accent-raw);--g-hot-text:var(--accent);
  --g-rule:#d6dce1;--g-track:#dde3e8;--g-chip:var(--g-soft);--g-chip-ink:var(--ink);--side-w:63mm;--gutter:8mm;
  --margin:calc(10.5mm * var(--fit-margin));--ink:#132235;--ink-2:#3a4655;--ink-3:#5f6b79}
.cv-page{padding-top:calc(7mm * var(--fit-margin))}
.cv-page--first{padding-top:0}
.cv-top--header{margin:0 calc(-1 * var(--margin)) calc(5mm * var(--fit-gap))}
.sp-head{position:relative}
.sp-dark{position:relative;height:calc(86mm * (.42 + .58 * var(--fit-gap)));background:var(--g-ink);color:#fff;overflow:hidden;padding:0 var(--margin)}
html[data-fit-compact] .sp-dark{height:60mm}
html[data-fit-compact] .sp-eyebrow{display:none}
html[data-fit-compact] .sp-photo{zoom:.76}
html[data-fit-compact] .sp-id{top:12mm;bottom:7mm}
html[data-fit-compact] .sp-name{font-size:calc(40pt * var(--ns,1))}
.sp-art{position:absolute;inset:0;width:100%;height:100%}
.g-mono{position:absolute;left:var(--margin);top:8.5mm;color:#fff}
.sp-id{position:absolute;left:var(--margin);right:82mm;top:20mm;bottom:9mm;display:flex;flex-direction:column;justify-content:flex-end}
.sp-eyebrow{font-size:6.8pt;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--g-hot);margin-bottom:5mm}
.sp-name{font-family:var(--g-display);font-weight:800;font-size:calc(50pt * var(--ns,1));line-height:.9;letter-spacing:-.055em;${c.caps ? 'text-transform:uppercase;' : ''}color:#fff;overflow-wrap:anywhere}
.sp-name > span{display:block}
.sp-name .g-last{color:var(--g-hot)}
.sp-name .g-stop{color:var(--g-hot)}
.sp-role{margin-top:4.6mm;font-size:7.6pt;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.62)}
.sp-role strong{color:#fff;font-weight:800}
.sp-photo{position:absolute;right:15mm;border:2.9mm solid var(--g-hot);background:var(--g-hot);${PORTRAIT[c.portrait]}}
.cv-portrait--initials.sp-photo{color:var(--g-on-hot);font-family:var(--g-display);font-weight:800;font-size:40pt;letter-spacing:-.04em}
${
  c.numbers === 'band'
    ? `.sp-stats{background:var(--g-hot);padding:calc(5mm * var(--fit-gap)) calc(var(--margin) + 1.5mm);color:var(--g-on-hot)}
.sp-stats .g-stat-v{color:var(--g-on-hot)}.sp-stats .g-stat-v span{color:var(--g-on-hot);opacity:.7}.sp-stats .g-stat-l{color:var(--g-on-hot);opacity:.85}`
    : c.numbers === 'cards'
      ? `.sp-stats{position:relative;margin:-9mm var(--margin) 0;gap:3.5mm;z-index:2}
.sp-stats .g-stat{background:#fff;border-radius:2.5mm;padding:3.6mm 4mm;box-shadow:0 1.5mm 4mm rgba(15,29,43,.14);border-top:1.2mm solid var(--g-hot)}`
      : `.sp-stats{margin:0 var(--margin);padding:4.5mm 1mm;border-bottom:.5mm solid var(--g-ink);background:var(--g-soft)}
.sp-stats .g-stat{padding-left:3mm;border-left:.9mm solid var(--g-hot)}`
}
.cv-top--running{margin:calc(-7mm * var(--fit-margin)) calc(-1 * var(--margin)) 5mm}
.sp-run{display:flex;justify-content:space-between;align-items:center;gap:4mm;background:var(--g-ink);color:#fff;padding:3.2mm var(--margin);border-bottom:1.2mm solid var(--g-hot)}
.sp-run strong{font-family:var(--g-display);font-weight:800;font-size:12pt;letter-spacing:-.03em;${c.caps ? 'text-transform:uppercase;' : ''}}
.sp-run span{font-size:7pt;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.7)}
.cv-body{font-size:.9em}
.cv-has-aside .cv-aside{width:var(--side-w);${sideLeft ? 'order:-1;padding-right:6mm;border-right' : 'padding-left:6mm;border-left'}:.3mm solid var(--g-rule)}
.cv-has-aside .cv-main{${sideLeft ? 'padding-left' : 'padding-right'}:var(--gutter)}
.b-heading{padding-top:calc(var(--section-gap) * 1.05);padding-bottom:3.6mm}
.b-first{padding-top:0}
.cv-main > .b-heading:first-child,.cv-aside > .b-heading:first-child,.cv-aside > .b-contact:first-child{padding-top:1mm}
.b-entry{padding-top:calc(var(--item-gap) * 1.1)}
.b-bullet{padding-top:1.2pt}
.b-compact{padding-top:2.4mm}
.b-skills{padding-top:3mm}
.b-compact.b-first,.b-skills.b-first{padding-top:0}
/* Timeline: a rail with a dot at each entry. */
.cv-main .k-experience,.cv-main .k-volunteering,.cv-main .k-internships,.cv-main .k-military{padding-left:6mm;margin-left:1.6mm;border-left:.5mm solid var(--g-track)}
.cv-main .k-experience.b-heading,.cv-main .k-volunteering.b-heading,.cv-main .k-internships.b-heading,.cv-main .k-military.b-heading{padding-left:0;margin-left:0;border-left:0}
.cv-main .b-entry .g-entry::before{content:'';position:absolute;left:calc(-7.95mm);top:.35mm;width:2.6mm;height:2.6mm;border-radius:50%;background:var(--g-hot-text);box-shadow:0 0 0 1mm #fff}
.cv-main .k-education .g-entry::before,.cv-main .k-projects .g-entry::before{display:none}
.b-contact .g-contact{padding-top:.5mm}
.cv-aside .g-h{font-size:8.3pt}
`;
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    style: c.style,
    tags: c.tags,
    photo: 'optional',
    contactsIn: 'aside',
    AsideContact: (p) => (
      <>
        <h2 className={`g-h g-h--${c.marker === 'number' ? 'bar' : c.marker}`}>
          <span className="g-h-m" aria-hidden="true" />
          <span className="g-h-t">{cvWords(p.model.locale)('Contact')}</span>
        </h2>
        <div style={{ height: '3.4mm' }} />
        <StackedContacts {...p} />
      </>
    ),
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
      <div className="sp-run">
        <strong>{model.name}</strong>
        <span>{model.headline}</span>
      </div>
    ),
  };
}
