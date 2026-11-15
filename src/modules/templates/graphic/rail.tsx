/**
 * "Portfolio" family: a header split between a full-height portrait block and a soft panel with
 * the name, then a dark column (numbered headings: contact, skills, honours) beside the main
 * column, and a colour footer band on every page. The column stays on every page.
 */
import type { ReactNode } from 'react';
import { Portrait, type TemplateComponentProps } from '../blocks';
import type { CatalogueTemplate } from '../types';
import type { TemplateId } from '@/modules/resume/schema';
import {
  Glyph,
  GRAPHIC_BASE_CSS,
  graphicHooks,
  SplitName,
  StackedContacts,
  type Marker,
  type SkillLook,
} from './parts';

export type RailConfig = {
  id: TemplateId;
  name: string;
  description: string;
  style: string;
  tags: string[];
  fontPair: 'modern' | 'humanist' | 'technical' | 'classic' | 'executive';
  ink: string;
  soft: string;
  photo: 'block' | 'arch' | 'inset' | 'circle' | 'split';
  panel: 'gradient' | 'solid' | 'lines' | 'dots' | 'frame';
  ornament: string;
  /** Name weight: heavy sans or light display serif. */
  nameStyle: 'heavy' | 'light';
  marker: Marker;
  skills: SkillLook;
  railMm: number;
};

function Panel({ kind }: { kind: RailConfig['panel'] }): ReactNode {
  if (kind === 'lines')
    return (
      <svg
        className="rl-pattern"
        viewBox="0 0 520 300"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {Array.from({ length: 14 }, (_, i) => (
          <line
            key={i}
            x1={i * 40}
            y1="300"
            x2={i * 40 + 160}
            y2="0"
            stroke="var(--g-hot)"
            strokeOpacity=".1"
            strokeWidth="1.2"
          />
        ))}
      </svg>
    );
  if (kind === 'dots')
    return (
      <svg
        className="rl-pattern"
        viewBox="0 0 520 300"
        preserveAspectRatio="xMaxYMax slice"
        aria-hidden="true"
      >
        <g fill="var(--g-hot)" fillOpacity=".22">
          {Array.from({ length: 40 }, (_, i) => (
            <circle key={i} cx={340 + (i % 8) * 20} cy={170 + Math.floor(i / 8) * 20} r="2.2" />
          ))}
        </g>
      </svg>
    );
  return null;
}

export function railTemplate(c: RailConfig): CatalogueTemplate {
  function Header({ model }: TemplateComponentProps) {
    const where = model.contacts.find((x) => x.kind === 'location')?.text;
    return (
      <header className="rl-head">
        <div className="rl-photo-wrap">
          <Portrait model={model} className="rl-photo" />
        </div>
        <div className="rl-panel">
          <Panel kind={c.panel} />
          <span className="rl-orn" aria-hidden="true">
            <Glyph char={c.ornament} />
          </span>
          {where && <p className="rl-eyebrow">{where}</p>}
          <SplitName model={model} className="rl-name" stop="." />
          {model.headline && <p className="rl-role">{model.headline}</p>}
        </div>
      </header>
    );
  }

  const base = graphicHooks({ marker: c.marker, skills: c.skills });
  const ASIDE = new Set(['skills', 'languages', 'certifications', 'licences', 'awards']);
  const hooks = {
    ...base,
    heading: (s: Parameters<typeof base.heading>[0]) =>
      ASIDE.has(s.kind) ? (
        <h2 className="rl-ah">
          <span className="rl-n" aria-hidden="true" />
          <span aria-hidden="true"> — </span>
          {s.title}
        </h2>
      ) : (
        base.heading(s)
      ),
  };

  const PHOTO: Record<RailConfig['photo'], string> = {
    block: 'position:absolute;inset:0;border-right:3.4mm solid var(--g-hot)',
    arch: 'position:absolute;left:6mm;right:6mm;top:9mm;bottom:0;border-radius:40mm 40mm 0 0;border:2.2mm solid var(--g-hot);border-bottom:0',
    inset: 'position:absolute;inset:8mm 7mm;box-shadow:3mm 3mm 0 var(--g-hot)',
    circle:
      'position:absolute;width:58mm;height:58mm;left:calc(50% - 29mm);top:calc(50% - 29mm);border-radius:50%;box-shadow:0 0 0 2mm #fff,0 0 0 3.6mm var(--g-hot)',
    split: 'position:absolute;inset:0;clip-path:polygon(0 0,100% 0,82% 100%,0 100%)',
  };
  const PANEL: Record<RailConfig['panel'], string> = {
    gradient:
      'background:linear-gradient(120deg,var(--g-soft) 0%,color-mix(in srgb,var(--g-hot) 22%,#fff) 100%)',
    solid: 'background:var(--g-soft)',
    lines: 'background:var(--g-soft)',
    dots: 'background:var(--g-soft)',
    frame:
      'background:var(--g-soft);box-shadow:inset 0 0 0 3mm #fff,inset 0 0 0 3.4mm var(--g-hot)',
  };
  const heavy = c.nameStyle === 'heavy';
  const css = `
${GRAPHIC_BASE_CSS}
:root{--g-display:var(--font-heading);--g-ink:${c.ink};--g-soft:${c.soft};--g-hot:var(--accent-raw);--g-on-hot:var(--on-accent-raw);--g-hot-text:var(--accent);
  --g-rule:#dad7e0;--g-track:#e1e1e8;--g-chip:var(--g-soft);--g-chip-ink:var(--ink);
  --rail:${c.railMm}mm;--rail-pad:6.8mm;--gap:9.5mm;--head-h:calc(80mm * (.42 + .58 * var(--fit-gap)));--foot:11.6mm;--margin:calc(10mm * var(--fit-margin));--ink:#1e1a2b;--ink-2:#433e51;--ink-3:#686376}
.cv-page{padding-left:0;padding-top:calc(10mm * var(--fit-margin));padding-bottom:calc(var(--foot) + 8mm)}
.cv-page::before{content:'';position:absolute;top:0;bottom:var(--foot);left:0;width:var(--rail);background:linear-gradient(180deg,var(--g-ink),color-mix(in srgb,var(--g-ink) 88%,var(--g-hot)));z-index:0}
.cv-page--first::before{top:var(--head-h)}
.cv-foot{color:var(--g-on-hot);bottom:3.6mm;z-index:2;font-weight:700}
.rl-foot{position:absolute;left:0;right:0;bottom:0;height:var(--foot);background:var(--g-hot)}
.cv-body{flex-direction:row-reverse;font-size:.9em}
.cv-aside{width:var(--rail);padding:0 var(--rail-pad);color:#fff;--ink:#fff;--ink-2:rgba(255,255,255,.86);--ink-3:rgba(255,255,255,.68);--g-hot-text:var(--g-hot);--g-track:rgba(255,255,255,.22);--g-chip:rgba(255,255,255,.12);--g-chip-ink:#fff;--g-ring-hole:#fff;--g-ring-ink:var(--g-ink)}
.cv-main{padding:0 var(--margin) 0 var(--gap)}
.cv-top--header{margin:calc(-10mm * var(--fit-margin)) calc(-1 * var(--margin)) 9mm 0}
.rl-head{display:flex;height:var(--head-h)}
html[data-fit-compact] .rl-head{height:54mm}
html[data-fit-compact] .rl-name{margin-top:4mm;font-size:calc(40pt * var(--ns,1))}
.rl-photo-wrap{position:relative;flex:none;width:var(--rail);height:100%;background:${c.photo === 'block' || c.photo === 'split' ? 'var(--g-hot)' : 'var(--g-ink)'};overflow:hidden}
.rl-photo{${PHOTO[c.photo]}}
.cv-portrait--initials.rl-photo{background:var(--g-hot);color:var(--g-on-hot);font-family:var(--g-display);font-weight:800;font-size:44pt}
.rl-panel{position:relative;flex:1;min-width:0;${PANEL[c.panel]};padding:11mm var(--margin) 0 10mm;overflow:hidden}
.rl-pattern{position:absolute;inset:0;width:100%;height:100%}
.rl-orn{position:absolute;right:var(--margin);top:7.5mm;font-size:24pt;line-height:1;color:var(--g-hot-text)}
.rl-eyebrow{position:relative;font-size:6.8pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}
.rl-name{position:relative;margin-top:${heavy ? '9mm' : '7mm'};font-family:var(--g-display);font-weight:${heavy ? 800 : 500};font-size:calc(${heavy ? '49pt' : '58pt'} * var(--ns,1));line-height:${heavy ? '.9' : '.86'};letter-spacing:${heavy ? '-.06em' : '-.035em'};color:var(--g-ink);overflow-wrap:anywhere}
.rl-name > span{display:block}
.rl-name .g-last{color:var(--g-hot-text)${heavy ? '' : ';font-style:italic'}}
.rl-role{position:relative;margin-top:5.5mm;font-size:8pt;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--g-ink)}
.cv-top--running{margin:0 calc(-1 * var(--margin)) 6mm var(--rail)}
.rl-run{padding:0 var(--margin) 3mm var(--gap);display:flex;justify-content:space-between;align-items:baseline;gap:4mm;border-bottom:.4mm solid var(--g-rule)}
.rl-run strong{font-family:var(--g-display);font-weight:${heavy ? 800 : 600};font-size:14pt;letter-spacing:-.02em;color:var(--g-ink)}
.rl-run span{font-size:7pt;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}
.rl-ah{font-size:8pt;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--g-hot);padding-bottom:3mm;border-bottom:.3mm solid rgba(255,255,255,.24)}
.rl-ah span{font-variant-numeric:tabular-nums}
.b-heading{padding-top:calc(var(--section-gap) * 1.05);padding-bottom:3.6mm}
.cv-main > .b-heading:first-child{padding-top:1mm}
.cv-aside > .b-contact:first-child{padding-top:1mm}
.cv-aside .b-heading{padding-bottom:4mm}
.b-first{padding-top:0}
.b-entry{padding-top:calc(var(--item-gap) * 1.08)}
.b-bullet{padding-top:1.2pt}
.b-compact{padding-top:2.4mm}
.b-skills{padding-top:3mm}
.b-compact.b-first,.b-skills.b-first{padding-top:0}
.cv-main .k-experience,.cv-main .k-volunteering,.cv-main .k-internships,.cv-main .k-military{padding-left:6mm;margin-left:1.4mm;border-left:.4mm solid var(--g-track)}
.cv-main .b-heading.k-experience,.cv-main .b-heading.k-volunteering,.cv-main .b-heading.k-internships,.cv-main .b-heading.k-military{padding-left:0;margin-left:0;border-left:0}
.cv-main .k-experience .g-entry::before,.cv-main .k-volunteering .g-entry::before,.cv-main .k-internships .g-entry::before,.cv-main .k-military .g-entry::before{content:'';position:absolute;left:-7.9mm;top:.3mm;width:2.6mm;height:2.6mm;border-radius:50%;background:var(--g-hot)}
`;
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    style: c.style,
    tags: c.tags,
    photo: 'optional',
    contactsIn: 'aside',
    keepColumns: true,
    AsideContact: (p) => (
      <>
        <h2 className="rl-ah">
          <span className="rl-n" aria-hidden="true" />
          <span aria-hidden="true"> — </span>
          Contact
        </h2>
        <div style={{ height: '4mm' }} />
        <StackedContacts {...p} />
      </>
    ),
    Decor: () => <span className="rl-foot" />,
    support: {
      headerAlign: ['left'],
      skillStyle: ['tags'],
      defaults: { headerAlign: 'left', skillStyle: 'tags', fontPair: c.fontPair },
    },
    asideKinds: ['skills', 'languages', 'certifications', 'licences', 'awards'],
    css,
    hooks,
    Header,
    Running: ({ model }) => (
      <div className="rl-run">
        <strong>{model.name}</strong>
        <span>{model.headline}</span>
      </div>
    ),
  };
}
