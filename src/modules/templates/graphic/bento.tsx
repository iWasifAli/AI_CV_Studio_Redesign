import type { FontPairId } from '@/modules/resume/schema';
/**
 * "Bento" family: the header is a modular grid of tiles — a large dark name tile, a portrait
 * tile, a pale contact tile and one tile per key number — and the body is one column whose
 * section names sit in label tiles in a left gutter, beside the first entry of each section.
 * No side column: the tiles carry the identity, the column carries the story.
 */
import { cvWords } from '@/modules/resume/cv-words';
import type { ReactNode } from 'react';
import { classes, ContactList, Portrait, type TemplateComponentProps } from '../blocks';
import type { RSection } from '../render-model';
import type { CatalogueTemplate } from '../types';
import type { TemplateId } from '@/modules/resume/schema';
import {
  GRAPHIC_BASE_CSS,
  graphicHooks,
  KeyNumbers,
  Monogram,
  SplitName,
  type Marker,
  type SkillLook,
} from './parts';

export type BentoConfig = {
  id: TemplateId;
  name: string;
  description: string;
  style: string;
  tags: string[];
  fontPair: FontPairId;
  ink: string;
  soft: string;
  /** How the portrait sits in its tile. */
  frame: 'fill' | 'circle' | 'arch' | 'cut' | 'pill';
  /** Artwork in the top corner of the name tile (never under the name). */
  art: 'orbit' | 'grid' | 'quarter' | 'stripes' | 'none';
  /** Key-number tiles: accent fills, dark fills or outlined. */
  numbers: 'accent' | 'ink' | 'outline';
  /** Tile corners. */
  corners: 'round' | 'soft' | 'square';
  marker: Marker;
  skills: SkillLook;
  caps: boolean;
  stop: string;
};

function Art({ kind }: { kind: BentoConfig['art'] }): ReactNode {
  const w = 'rgba(255,255,255,';
  const box = {
    className: 'bt-art',
    viewBox: '0 0 120 120',
    'aria-hidden': true,
  } as const;
  switch (kind) {
    case 'orbit':
      return (
        <svg {...box}>
          <circle cx="120" cy="0" r="58" fill="none" stroke={`${w}.13)`} strokeWidth="1.2" />
          <circle cx="120" cy="0" r="86" fill="none" stroke={`${w}.09)`} strokeWidth="1.2" />
          <circle cx="120" cy="0" r="30" fill={`${w}.07)`} />
          <circle cx="71" cy="31" r="3.4" fill="var(--g-hot)" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...box}>
          <g fill={`${w}.26)`}>
            {Array.from({ length: 30 }, (_, i) => (
              <circle key={i} cx={46 + (i % 6) * 13} cy={14 + Math.floor(i / 6) * 13} r="1.5" />
            ))}
          </g>
          <circle cx="111" cy="66" r="3.4" fill="var(--g-hot)" />
        </svg>
      );
    case 'quarter':
      return (
        <svg {...box}>
          <path d="M120 0 V74 A74 74 0 0 1 46 0 Z" fill={`${w}.07)`} />
          <path d="M120 0 V40 A40 40 0 0 1 80 0 Z" fill="var(--g-hot)" />
        </svg>
      );
    case 'stripes':
      return (
        <svg {...box}>
          {[0, 1, 2, 3, 4].map((i) => (
            <line
              key={i}
              x1={58 + i * 14}
              y1="0"
              x2={120}
              y2={62 - i * 14}
              stroke={i === 2 ? 'var(--g-hot)' : `${w}.14)`}
              strokeWidth={i === 2 ? 3 : 1.4}
            />
          ))}
        </svg>
      );
    case 'none':
      return null;
  }
}

export function bentoTemplate(c: BentoConfig): CatalogueTemplate {
  const base = graphicHooks({ marker: c.marker, skills: c.skills });
  /** The section name as a label tile, beside the section's first block. */
  const label = (s: RSection) => (
    <p className={`bt-label bt-label--${c.marker}`}>
      <span className="bt-label-m" aria-hidden="true" />
      <span className="bt-label-t">{s.title}</span>
    </p>
  );

  function Header({ model }: TemplateComponentProps) {
    const contacts = model.contacts;
    const stats = model.stats.length >= 2;
    return (
      <header
        className={classes(
          'bt-head',
          stats && 'bt-head--stats',
          !contacts.length && 'bt-head--bare',
        )}
      >
        <div className="bt-tile bt-name-tile">
          <Art kind={c.art} />
          <div className="bt-id">
            <SplitName model={model} className="bt-name" stop={c.stop} />
            {model.headline && <p className="bt-role">{model.headline}</p>}
          </div>
          <Monogram model={model} star="/" />
        </div>
        <div className="bt-tile bt-photo-tile">
          <Portrait model={model} className="bt-photo" />
        </div>
        {contacts.length > 0 && (
          <div className="bt-tile bt-contact-tile">
            <p className="bt-kicker">{cvWords(model.locale)('Contact')}</p>
            <ContactList contacts={contacts} icons />
          </div>
        )}
        {stats && <KeyNumbers model={model} className="bt-stats" />}
      </header>
    );
  }

  const R = { round: '4.2mm', soft: '2mm', square: '0' }[c.corners];
  const FRAME: Record<BentoConfig['frame'], string> = {
    fill: '.bt-photo-tile{padding:0}.bt-photo{width:100%;height:100%;border-radius:var(--bt-r)}',
    circle:
      '.bt-photo-tile{display:grid;place-items:center}.bt-photo{width:34mm;height:34mm;border-radius:50%;box-shadow:0 0 0 1.6mm #fff,0 0 0 2.4mm var(--g-hot)}',
    arch: '.bt-photo-tile{display:flex;align-items:flex-end;justify-content:center;padding:4mm 4mm 0}.bt-photo{width:100%;height:calc(100% - 1mm);border-radius:20mm 20mm 0 0}',
    cut: '.bt-photo-tile{padding:0}.bt-photo{width:100%;height:100%;clip-path:polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)}.bt-photo-tile::after{content:"";position:absolute;right:0;bottom:0;width:28%;height:28%;background:linear-gradient(135deg,transparent 50%,var(--g-hot) 50%)}',
    pill: '.bt-photo-tile{display:grid;place-items:center;padding:4mm}.bt-photo{width:30mm;height:100%;border-radius:20mm}',
  };
  const NUM: Record<BentoConfig['numbers'], string> = {
    accent: `.bt-stats .g-stat{background:var(--g-hot);color:var(--g-on-hot)}
.bt-stats .g-stat-v,.bt-stats .g-stat-v span,.bt-stats .g-stat-l{color:var(--g-on-hot)}
.bt-stats .g-stat:nth-child(2){background:var(--g-ink)}
.bt-stats .g-stat:nth-child(2) .g-stat-v,.bt-stats .g-stat:nth-child(2) .g-stat-l{color:#fff}
.bt-stats .g-stat:nth-child(2) .g-stat-v span{color:var(--g-hot)}`,
    ink: `.bt-stats .g-stat{background:var(--g-ink);color:#fff}
.bt-stats .g-stat-v,.bt-stats .g-stat-l{color:#fff}.bt-stats .g-stat-v span{color:var(--g-hot)}`,
    outline: `.bt-stats .g-stat{background:#fff;box-shadow:inset 0 0 0 .45mm var(--g-ink)}
.bt-stats .g-stat-v span{color:var(--g-hot-text)}`,
  };
  const css = `
${GRAPHIC_BASE_CSS}
:root{--g-display:var(--font-heading);--g-ink:${c.ink};--g-soft:${c.soft};--g-hot:var(--accent-raw);--g-on-hot:var(--on-accent-raw);--g-hot-text:var(--accent);
  --g-rule:#d6dce1;--g-track:#dde3e8;--g-chip:var(--g-soft);--g-chip-ink:var(--ink);--bt-r:${R};--bt-gap:2.6mm;--bt-label-w:35mm;
  --margin:calc(12mm * var(--fit-margin));--ink:#132235;--ink-2:#3a4655;--ink-3:#5f6b79}
.cv-top--header{margin-bottom:calc(7mm * var(--fit-gap))}
.bt-head{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--bt-gap)}
.bt-tile{position:relative;border-radius:var(--bt-r);overflow:hidden}
.bt-name-tile{grid-column:1 / 4;min-height:calc(54mm * (.55 + .45 * var(--fit-gap)));background:var(--g-ink);color:#fff;padding:9mm 8mm 7.5mm;display:flex;flex-direction:column;justify-content:flex-end}
.bt-art{position:absolute;right:0;top:0;width:34mm;height:34mm}
.bt-name-tile .g-mono{position:absolute;left:8mm;top:7mm;color:#fff;font-size:12pt}
.bt-id{position:relative;max-width:100%}
.bt-name{font-family:var(--g-display);font-weight:800;font-size:calc(42pt * var(--ns,1));line-height:.92;letter-spacing:-.045em;${c.caps ? 'text-transform:uppercase;' : ''}color:#fff;overflow-wrap:anywhere}
.bt-name > span{display:block}
.bt-name .g-last{color:var(--g-hot)}
.bt-name .g-stop{color:var(--g-hot)}
.bt-role{margin-top:4mm;font-size:8pt;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:rgba(255,255,255,.78);max-width:120mm}
.bt-photo-tile{grid-column:4;background:var(--g-soft)}
${FRAME[c.frame]}
.cv-portrait--initials.bt-photo{background:var(--g-hot);color:var(--g-on-hot);font-family:var(--g-display);font-weight:800;font-size:30pt;letter-spacing:-.04em}
.bt-contact-tile{grid-column:1 / 5;background:var(--g-soft);padding:4.2mm 6mm 4.6mm}
.bt-head--stats .bt-contact-tile{grid-column:1 / 3}
.bt-kicker{font-size:7.5pt;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--g-hot-text);margin-bottom:2.2mm}
.bt-contact-tile .cv-contacts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-left:0;column-gap:5mm;row-gap:1.6mm}
.bt-head--stats .bt-contact-tile .cv-contacts{grid-template-columns:minmax(0,1fr)}
.bt-contact-tile .cv-contact{padding-left:0;line-height:1.35;font-size:.92em;align-items:flex-start}
.bt-contact-tile .cv-icon{color:var(--g-hot-text);margin-top:.2em}
.bt-contact-tile .cv-contact-text{min-width:0;overflow-wrap:anywhere}
.bt-stats{grid-column:3 / 5;gap:var(--bt-gap)}
.bt-head--bare .bt-stats{grid-column:1 / 5}
.bt-stats .g-stat{border-radius:var(--bt-r);padding:4.6mm 4.4mm 4mm;display:flex;flex-direction:column;justify-content:space-between}
.bt-stats .g-stat-v{font-size:24pt}
.bt-stats .g-stat-l{font-size:7.5pt;line-height:1.25}
${NUM[c.numbers]}
html[data-fit-compact] .bt-name-tile{min-height:40mm;padding-top:6mm;padding-bottom:5.5mm}
html[data-fit-compact] .bt-name{font-size:calc(34pt * var(--ns,1))}
html[data-fit-compact] .bt-name-tile .g-mono{display:none}
/* Continuation pages: a slim pair of tiles. */
.cv-top--running{margin-bottom:6mm}
.bt-run{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--bt-gap)}
.cv-top--running .bt-run.bt-run{column-gap:var(--bt-gap)}
.bt-run > *{border-radius:var(--bt-r);padding:3mm 5mm;min-width:0}
.bt-run strong{grid-column:1 / 3;background:var(--g-ink);color:#fff;font-family:var(--g-display);font-weight:800;font-size:12pt;letter-spacing:-.03em;${c.caps ? 'text-transform:uppercase;' : ''}}
.bt-run span{grid-column:3 / 5;background:var(--g-soft);font-size:7.5pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-2);display:flex;align-items:center}
/* Body: one column; section names in label tiles in the left gutter. */
.cv-body{font-size:.92em}
.cv-main [data-block]:not(.b-heading){padding-left:calc(var(--bt-label-w) + 6mm)}
.cv-main [data-block]:has(> .b-labelled){padding-left:0}
.b-labelled{display:flex;gap:6mm}
.b-label{flex:none;width:var(--bt-label-w)}
.b-content{flex:1;min-width:0}
.cv-main .b-heading{height:calc(var(--section-gap) * 1.15);padding:0;position:relative}
.cv-main .b-heading.b-first,.cv-main > .b-heading:first-child{height:0}
.cv-main .b-heading .g-h{position:absolute;width:1px;height:1px;margin:0;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.bt-label{display:flex;align-items:center;gap:2mm;background:var(--g-soft);border-radius:calc(var(--bt-r) * .6);padding:2.1mm 3mm;font-size:7.6pt;font-weight:800;letter-spacing:.08em;text-transform:uppercase;line-height:1.2;color:var(--ink);overflow-wrap:normal;hyphens:auto}
.bt-label-m{flex:none;display:block;background:var(--g-hot-text)}
.bt-label--bar .bt-label-m{width:3.4mm;height:.9mm}
.bt-label--dot .bt-label-m{width:1.9mm;height:1.9mm;border-radius:50%}
.bt-label--square .bt-label-m,.bt-label--number .bt-label-m{width:1.7mm;height:1.7mm;transform:rotate(45deg)}
.bt-label--slash .bt-label-m{width:.8mm;height:3mm;transform:skewX(-20deg)}
.bt-label--line .bt-label-m{width:.6mm;height:3.2mm}
.bt-label-t{min-width:0}
.b-entry{padding-top:calc(var(--item-gap) * 1.15)}
.b-entry.b-first,.b-summary.b-first{padding-top:0}
.b-entry .g-entry{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:4mm;align-items:baseline}
.b-entry .g-when{grid-column:2;grid-row:1;margin:0;white-space:nowrap;padding:.5mm 2mm;border-radius:1mm;background:var(--g-soft);color:var(--ink);font-size:.74em}
.b-entry .g-title{grid-column:1;grid-row:1}
.b-entry .g-org{grid-column:1 / 3}
.b-bullet{padding-top:1.2pt}
.b-compact{padding-top:2mm}
.b-skills{padding-top:2.6mm}
.b-compact.b-first,.b-skills.b-first{padding-top:0}
.b-list > div + div{padding-top:2mm}
.b-list .g-lang{max-width:90mm}
.g-summary{font-size:1.04em}
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
    asideKinds: [],
    css,
    hooks: { ...base, label },
    Header,
    Running: ({ model }) => (
      <div className="bt-run">
        <strong>{model.name}</strong>
        <span>{model.headline}</span>
      </div>
    ),
  };
}
