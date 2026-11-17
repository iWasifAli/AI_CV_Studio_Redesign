import type { FontPairId } from '@/modules/resume/schema';
/**
 * "Rail" family: a dark, full-height column on the left carries the monogram, a framed portrait,
 * contact details, skill meters and recognition; the light main column opens with a huge
 * two-tone name, the role and the key numbers, then the timeline. The column stays on every page.
 */
import { cvWords } from '@/modules/resume/cv-words';
import type { ReactNode } from 'react';
import { Portrait, type TemplateComponentProps } from '../blocks';
import type { CatalogueTemplate } from '../types';
import type { TemplateId } from '@/modules/resume/schema';
import {
  GRAPHIC_BASE_CSS,
  graphicHooks,
  Glyph,
  KeyNumbers,
  Monogram,
  SplitName,
  StackedContacts,
  type Marker,
  type SkillLook,
} from './parts';

export type BandConfig = {
  id: TemplateId;
  name: string;
  description: string;
  style: string;
  tags: string[];
  fontPair: FontPairId;
  ink: string;
  soft: string;
  photo: 'notch' | 'circle' | 'tall' | 'slant' | 'square';
  art: 'quarter' | 'stripes' | 'grid' | 'ring' | 'dots';
  numbers: 'box' | 'columns' | 'pills';
  marker: Marker;
  skills: SkillLook;
  caps: boolean;
  stop: string;
  /** Closing band with the person's link (only when they have one). */
  end: 'bar' | 'outline' | 'none';
  /** Width of the dark column. */
  railMm: number;
};

function RailArt({ kind }: { kind: BandConfig['art'] }): ReactNode {
  const w = 'rgba(255,255,255,';
  switch (kind) {
    case 'quarter':
      return <span className="bd-art bd-art--quarter" />;
    case 'stripes':
      return (
        <svg
          className="bd-art bd-art--svg"
          viewBox="0 0 270 300"
          preserveAspectRatio="xMinYMax slice"
          aria-hidden="true"
        >
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <line
              key={i}
              x1={-40 + i * 34}
              y1="300"
              x2={120 + i * 34}
              y2="120"
              stroke={`${w}.07)`}
              strokeWidth="10"
            />
          ))}
        </svg>
      );
    case 'grid':
      return (
        <svg
          className="bd-art bd-art--svg"
          viewBox="0 0 270 300"
          preserveAspectRatio="xMinYMax slice"
          aria-hidden="true"
        >
          <g stroke={`${w}.08)`} strokeWidth="1">
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`v${i}`} x1={i * 34} y1="120" x2={i * 34} y2="300" />
            ))}
            {Array.from({ length: 6 }, (_, i) => (
              <line key={`h${i}`} x1="0" y1={130 + i * 34} x2="270" y2={130 + i * 34} />
            ))}
          </g>
          <rect x="170" y="198" width="34" height="34" fill="var(--g-hot)" opacity=".85" />
        </svg>
      );
    case 'ring':
      return (
        <svg
          className="bd-art bd-art--svg"
          viewBox="0 0 270 300"
          preserveAspectRatio="xMinYMax slice"
          aria-hidden="true"
        >
          <circle cx="250" cy="300" r="110" fill="none" stroke={`${w}.08)`} strokeWidth="34" />
          <circle
            cx="250"
            cy="300"
            r="40"
            fill="none"
            stroke="var(--g-hot)"
            strokeWidth="3"
            opacity=".8"
          />
        </svg>
      );
    case 'dots':
      return (
        <svg
          className="bd-art bd-art--svg"
          viewBox="0 0 270 300"
          preserveAspectRatio="xMinYMax slice"
          aria-hidden="true"
        >
          <g fill={`${w}.16)`}>
            {Array.from({ length: 60 }, (_, i) => (
              <circle key={i} cx={20 + (i % 10) * 24} cy={170 + Math.floor(i / 10) * 22} r="2" />
            ))}
          </g>
        </svg>
      );
  }
}

/** No "Curriculum vitae" tag: the document is obviously a CV. */
const label = (_locale: string) => '';

export function bandTemplate(c: BandConfig): CatalogueTemplate {
  function Header({ model }: TemplateComponentProps) {
    const where = model.contacts.find((x) => x.kind === 'location')?.text;
    return (
      <header className="bd-head">
        <div className="bd-rail-top">
          <Monogram model={model} />
          <Portrait model={model} className="bd-photo" />
        </div>
        <div className="bd-intro">
          {label(model.locale) && <p className="bd-tag">{label(model.locale)}</p>}
          <SplitName model={model} className="bd-name" stop={c.stop} />
          {(model.headline || where) && (
            <p className="bd-role">
              {model.headline && <strong>{model.headline}</strong>}
              {model.headline && where && <span> — </span>}
              {where && <span>{where}</span>}
            </p>
          )}
          <KeyNumbers model={model} className="bd-stats" />
        </div>
      </header>
    );
  }

  const link = (m: TemplateComponentProps['model']) => m.contacts.find((x) => x.kind === 'link');
  const MainEnd =
    c.end === 'none'
      ? undefined
      : ({ model }: TemplateComponentProps) => {
          // No "See more of my work" box: the link is already listed with the contacts.
          void link(model);
          return null;
        };

  const PHOTO: Record<BandConfig['photo'], string> = {
    notch:
      'width:100%;height:54mm;border-top:1.9mm solid var(--g-hot);clip-path:polygon(0 0,100% 0,100% 86%,78% 100%,0 100%)',
    circle:
      'width:46mm;height:46mm;border-radius:50%;margin:0 auto;box-shadow:0 0 0 1.6mm var(--g-ink),0 0 0 2.4mm var(--g-hot)',
    tall: 'width:100%;height:62mm;border-radius:24mm 24mm 3mm 3mm;border-bottom:1.9mm solid var(--g-hot)',
    slant:
      'width:100%;height:52mm;clip-path:polygon(0 8%,100% 0,100% 92%,0 100%);border-left:1.9mm solid var(--g-hot)',
    square:
      'width:44mm;height:44mm;border-radius:3mm;outline:.8mm solid var(--g-hot);outline-offset:1.6mm',
  };

  const css = `
${GRAPHIC_BASE_CSS}
:root{--g-display:var(--font-heading);--g-ink:${c.ink};--g-soft:${c.soft};--g-hot:var(--accent-raw);--g-on-hot:var(--on-accent-raw);--g-hot-text:var(--accent);
  --g-rule:#d7dce2;--g-track:#dfe4e9;--g-chip:var(--g-soft);--g-chip-ink:var(--ink);
  --rail:${c.railMm}mm;--rail-pad:6.3mm;--gap:8.2mm;--margin:calc(10.5mm * var(--fit-margin));--ink:#141f2e;--ink-2:#3b4656;--ink-3:#606b79}
.cv-page{padding-left:0;padding-top:calc(10mm * var(--fit-margin))}
.cv-page::before{content:'';position:absolute;top:0;bottom:0;left:0;width:var(--rail);background:var(--g-ink);z-index:0}
.cv-decor{z-index:0}
.bd-art{position:absolute;left:0;bottom:0;width:var(--rail);height:80mm;display:block}
.bd-art--quarter{width:37mm;height:37mm;border-top-right-radius:100%;background:rgba(255,255,255,.07)}
.bd-art--svg{height:80mm}
.cv-body{flex-direction:row-reverse;font-size:.9em}
/* Where the rail has ended, later pages use the full width with a strip of its colour (gap audit G-07). */
.cv-page.cv-page--wide::before{width:4mm}
.cv-page.cv-page--wide{padding-left:calc(4mm + var(--margin))}
.cv-page.cv-page--wide .cv-main{padding-left:0}
.cv-aside{width:var(--rail);padding:0 var(--rail-pad);color:#fff;--ink:#fff;--ink-2:rgba(255,255,255,.86);--ink-3:rgba(255,255,255,.68);--g-hot-text:var(--g-hot);--g-track:rgba(255,255,255,.2);--g-chip:rgba(255,255,255,.12);--g-chip-ink:#fff;--g-ring-hole:var(--g-ink);--g-ring-ink:#fff;--g-head:#fff}
.cv-main{padding-left:var(--gap)}
.cv-top--header{margin-top:calc(-10mm * var(--fit-margin))}
.bd-head{display:flex;align-items:flex-start}
.bd-rail-top{flex:none;width:var(--rail);padding:8.5mm var(--rail-pad) 0;color:#fff;display:flex;flex-direction:column;gap:6.5mm}
.g-mono{font-size:19pt;letter-spacing:.02em}
.bd-photo{${PHOTO[c.photo]};background:var(--g-hot)}
html[data-fit-compact] .bd-photo{zoom:.72;margin-left:auto;margin-right:auto}
html[data-fit-compact] .bd-rail-top{gap:4.5mm}
html[data-fit-compact] .bd-name{font-size:calc(38pt * var(--ns,1))}
html[data-fit-compact] .bd-tag{margin-bottom:4mm}
html[data-fit-compact] .bd-end{display:none}
.cv-portrait--initials.bd-photo{color:var(--g-on-hot);font-family:var(--g-display);font-weight:800;font-size:34pt}
.bd-intro{flex:1;min-width:0;padding:calc(10.5mm * var(--fit-gap)) 0 0 var(--gap)}
.bd-tag{font-size:6.8pt;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-2);margin-bottom:calc(8mm * var(--fit-gap))}
.bd-name{font-family:var(--g-display);font-weight:800;font-size:calc(46pt * var(--ns,1) * (.8 + .2 * var(--fit-gap)));line-height:.92;letter-spacing:-.055em;${c.caps ? 'text-transform:uppercase;' : ''}color:var(--ink);overflow-wrap:anywhere}
.bd-name > span{display:block}
.bd-name .g-last,.bd-name .g-stop{color:var(--g-hot-text)}
.bd-role{margin-top:calc(5mm * var(--fit-gap));padding-bottom:calc(5mm * var(--fit-gap));border-bottom:.55mm solid var(--ink);font-size:8.2pt;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}
.bd-role strong{color:var(--ink);font-weight:800}
${
  c.numbers === 'box'
    ? '.bd-stats{margin-top:calc(5.5mm * var(--fit-gap));background:var(--g-soft);padding:calc(5mm * var(--fit-gap)) 4mm}'
    : c.numbers === 'columns'
      ? '.bd-stats{margin-top:5.5mm;gap:0}.bd-stats .g-stat{padding:1mm 4mm;border-left:.4mm solid var(--g-rule)}.bd-stats .g-stat:first-child{border-left:0;padding-left:0}'
      : '.bd-stats{margin-top:5.5mm;gap:2.5mm}.bd-stats .g-stat{background:var(--g-ink);color:#fff;border-radius:10mm;padding:3mm 5mm}.bd-stats .g-stat-l{color:rgba(255,255,255,.75)}.bd-stats .g-stat-v{font-size:18pt}'
}
.cv-top--header{margin-bottom:2mm}
.cv-top--running{margin-left:var(--rail)}
.cv-page--wide .cv-top--running{margin-left:0}
.bd-run{padding:0 0 3mm var(--gap);display:flex;justify-content:space-between;align-items:baseline;gap:4mm;border-bottom:.4mm solid var(--g-rule);margin-bottom:4mm}
.bd-run strong{font-family:var(--g-display);font-weight:800;font-size:13pt;letter-spacing:-.03em;${c.caps ? 'text-transform:uppercase;' : ''}}
.bd-run span{font-size:7pt;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}
.b-heading{padding-top:calc(var(--section-gap) * 1.05);padding-bottom:3.6mm}
.cv-main > .b-heading:first-child{padding-top:4mm}
.cv-aside > .b-contact:first-child{padding-top:6mm}
.b-first{padding-top:0}
.b-entry{padding-top:calc(var(--item-gap) * 1.08)}
.b-bullet{padding-top:1.2pt}
.b-compact{padding-top:2.4mm}
.b-skills{padding-top:3mm}
.b-compact.b-first,.b-skills.b-first{padding-top:0}
.cv-aside .g-h{font-size:8.6pt}
.cv-main .k-experience,.cv-main .k-volunteering,.cv-main .k-internships,.cv-main .k-military{padding-left:6mm;margin-left:1.4mm;border-left:.4mm solid var(--g-track)}
.cv-main .b-heading.k-experience,.cv-main .b-heading.k-volunteering,.cv-main .b-heading.k-internships,.cv-main .b-heading.k-military{padding-left:0;margin-left:0;border-left:0}
.cv-main .k-experience .g-entry::before,.cv-main .k-volunteering .g-entry::before,.cv-main .k-internships .g-entry::before,.cv-main .k-military .g-entry::before{content:'';position:absolute;left:-7.9mm;top:.3mm;width:2.6mm;height:2.6mm;border-radius:50%;background:var(--g-hot)}
.bd-end{margin-top:6mm;display:flex;justify-content:space-between;gap:4mm;align-items:center;font-family:var(--g-display);font-weight:800;letter-spacing:-.02em;font-size:10.5pt;padding:4.6mm 4.5mm;${c.end === 'bar' ? 'background:var(--g-hot);color:var(--g-on-hot)' : 'border:.6mm solid var(--g-ink);color:var(--ink)'}}
.bd-end a{font-family:var(--font-body);font-weight:600;font-size:8pt;letter-spacing:0}
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
    Decor: () => <RailArt kind={c.art} />,
    MainEnd,
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
      <div className="bd-run">
        <strong>{model.name}</strong>
        <span>{model.headline}</span>
      </div>
    ),
  };
}
