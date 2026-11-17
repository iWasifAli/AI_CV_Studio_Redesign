import type { FontPairId } from '@/modules/resume/schema';
/**
 * "Table" family: the whole CV is set as ruled information tables, the way a timetable or an
 * annual-report schedule sets facts. One grid runs through every page:
 *
 *   key column (dates, years, skill groups) | content column | right column (organisation, place)
 *
 * The header is a fact table (name, then contact cells and key numbers on the same grid). Every
 * section is a table of its own: an opening rule, the section title, and a column-header row
 * ("When · What · Where") for sections made of entries. Descriptions span the content and right
 * columns. A hairline separates rows; a vertical hairline runs down the key column. Continuation
 * pages open with a running strip on the same grid.
 */
import { cvLang, cvWords, CV_LANGUAGES } from '@/modules/resume/cv-words';
import {
  ContactIcon,
  MetaText,
  Portrait,
  breakable,
  joinParts,
  type TemplateComponentProps,
  type TemplateHooks,
} from '../blocks';
import type { CatalogueTemplate } from '../types';
import type { RenderModel, REntry, RSection } from '../render-model';
import type { TemplateId } from '@/modules/resume/schema';
import { GRAPHIC_BASE_CSS, nameScale, type Marker, type SkillLook } from './parts';

export type TableConfig = {
  id: TemplateId;
  name: string;
  description: string;
  style: string;
  tags: string[];
  fontPair: FontPairId;
  ink: string;
  soft: string;
  /** Portrait in the right column of the masthead. */
  frame: 'square' | 'circle' | 'tall';
  /** How each section table opens: a heavy rule, a double rule or a tinted band. */
  opener: 'heavy' | 'double' | 'band';
  /** Key numbers: their own row of large figures, or cells in the fact table. */
  numbers: 'cells' | 'inline';
  /** Mark in the key column of each section's title row ('number' counts the sections). */
  marker: Marker;
  /** Language level look (pips) — the only levels the table draws. */
  skills: SkillLook;
  caps: boolean;
};

/** Sections made of entries (dated rows with descriptions) get the column-header row. */
const ENTRY_KINDS = new Set([
  'experience',
  'volunteering',
  'internships',
  'military',
  'education',
  'projects',
  'publications',
  'courses',
  'memberships',
  'conferences',
  'patents',
]);
const LIST_KINDS = new Set(['certifications', 'licences', 'awards']);

function Heading(marker: Marker) {
  return function TableHeading(s: RSection) {
    const cols = ENTRY_KINDS.has(s.kind) || LIST_KINDS.has(s.kind);
    return (
      <div className="tb-h">
        <div className="tb-h-row">
          <span className="tb-h-k" aria-hidden="true">
            {marker === 'number' ? (
              <span className="tb-h-n" data-num="" />
            ) : (
              <span className="tb-h-m" />
            )}
          </span>
          <h2 className="tb-h-t">{s.title}</h2>
        </div>
        {cols && (
          // Column heads in every CV language; the page shows its own (see colWords). They are
          // page furniture (g-mono): drawn as a picture in the PDF, so an ATS never reads them.
          <p className="tb-cols g-mono" aria-hidden="true">
            {(['When', 'What', 'Where'] as const).map((w, i) => (
              <span key={w} className={`tb-col tb-col${i + 1}`}>
                {LANGS.map((l) => (
                  <span key={l} className={`tb-w tb-w-${l}`}>
                    {cvWords(l)(w)}
                  </span>
                ))}
              </span>
            ))}
          </p>
        )}
      </div>
    );
  };
}

function Level({ e }: { e: REntry }) {
  if (e.level)
    return (
      <span className="tb-pips" role="img" aria-label={e.label || `${e.level} of 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <i key={n} className={n <= (e.level ?? 0) ? 'on' : ''} />
        ))}
      </span>
    );
  return e.label ? <span className="tb-lvl">{e.label}</span> : null;
}

function hooks(c: TableConfig): TemplateHooks {
  return {
    splitSkills: true,
    drawsLevels: false,
    heading: Heading(c.marker),
    summary: (text) => <p className="tb-lead">{text}</p>,
    entryHead: (e) => {
      const org = e.title ? e.subtitle : '';
      return (
        <div className="tb-row">
          <p className="tb-a">{e.dates}</p>
          <h3 className="tb-b tb-title">{e.title || e.subtitle}</h3>
          <p className="tb-c">
            {org && <span className="tb-org">{org}</span>}
            {org && e.meta && ' '}
            {e.meta && (
              <span className="tb-meta">
                <MetaText e={e} />
              </span>
            )}
          </p>
        </div>
      );
    },
    compactItem: (e, s) =>
      s.kind === 'languages' ? (
        <div className="tb-lang">
          <span className="tb-lang-n">{e.title}</span>
          <Level e={e} />
        </div>
      ) : (
        <div className="tb-row tb-row--item">
          <p className="tb-a">{e.dates}</p>
          <p className="tb-b tb-item">{e.title}</p>
          <p className="tb-c">
            {joinParts([e.subtitle, e.meta], ', ') && (
              <span className="tb-meta">{joinParts([e.subtitle, e.meta], ', ')}</span>
            )}
          </p>
        </div>
      ),
    skills: (e) => (
      <div className="tb-row tb-row--skills">
        <p className="tb-a tb-group">{e.label}</p>
        <ul className="tb-skills">
          {e.tags.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>
    ),
  };
}

/** Fact-table columns: one row when it fits (up to four cells), otherwise rows of two or three. */
function cellColumns(n: number): number {
  return n <= 4 ? Math.max(n, 1) : n % 3 === 0 || n > 6 ? 3 : 2;
}

/** Contact details and key numbers as the cells of one fact table. */
function Facts({ model, numbers }: { model: RenderModel; numbers: TableConfig['numbers'] }) {
  const stats = model.stats.length >= 2 ? model.stats : [];
  const inline = numbers === 'inline';
  if (!model.contacts.length && !stats.length) return null;
  return (
    <>
      {(model.contacts.length > 0 || (inline && stats.length > 0)) && (
        <div className="tb-facts">
          <ul
            className="tb-cells"
            style={{
              ['--n' as string]: cellColumns(model.contacts.length + (inline ? stats.length : 0)),
            }}
          >
            {model.contacts.map((x, i) => (
              <li key={i} className={`tb-cell tb-cell--${x.kind}`}>
                <ContactIcon kind={x.kind} />
                <span className="cv-contact-text">
                  {x.label && x.kind === 'link' ? (
                    <span className="tb-cell-l">{x.label} </span>
                  ) : null}
                  {(() => {
                    const body =
                      x.kind === 'email' || x.kind === 'phone' ? x.text : breakable(x.text);
                    return x.href ? <a href={x.href}>{body}</a> : body;
                  })()}
                </span>
              </li>
            ))}
            {inline &&
              stats.map((k, i) => (
                <li key={`s${i}`} className="tb-cell tb-cell--stat">
                  <strong>{k.value}</strong> <span>{k.label}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
      {!inline && stats.length > 0 && (
        <div className="tb-figs">
          {stats.map((k, i) => (
            <div key={i} className="tb-fig">
              <p className="tb-fig-v">{k.value}</p>
              <p className="tb-fig-l">{k.label}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** CV languages: column heads are printed in each and the page shows its own. */
const LANGS = [...new Set(CV_LANGUAGES.map((l) => cvLang(l.locale)))];
function colWords(): string {
  const others = LANGS.filter((l) => l !== 'en');
  return [
    '.tb-w{display:none}',
    `html:not(${others.map((l) => `[lang="${l}"]`).join(',')}) .tb-w-en{display:inline}`,
    ...others.map((l) => `html[lang="${l}"] .tb-w-${l}{display:inline}`),
  ].join('\n');
}

export function tableTemplate(c: TableConfig): CatalogueTemplate {
  function Header({ model }: TemplateComponentProps) {
    return (
      <header className="tb-head">
        <div className="tb-mast">
          <div className="tb-id">
            <h1 className="tb-name" style={{ ['--ns' as string]: nameScale(model) }}>
              {model.name || cvWords(model.locale)('Your name')}
            </h1>
            {model.headline && <p className="tb-role">{model.headline}</p>}
          </div>
          <Portrait model={model} className={`tb-photo tb-photo--${c.frame}`} />
        </div>
        <Facts model={model} numbers={c.numbers} />
      </header>
    );
  }

  const FRAME: Record<TableConfig['frame'], string> = {
    square: '.tb-photo{width:30mm;height:30mm}',
    circle: '.tb-photo{width:31mm;height:31mm;border-radius:50%}',
    tall: '.tb-photo{width:28mm;height:35mm}',
  };
  const OPENER: Record<TableConfig['opener'], string> = {
    heavy: '.tb-h{border-top:1.1mm solid var(--g-ink)}',
    double: '.tb-h{border-top:1.3mm double var(--g-ink)}',
    band: `.tb-h{border-top:.5mm solid var(--g-ink)}
.tb-h-row{background:var(--g-soft);margin-top:0;padding:1.9mm 0 1.7mm}
.tb-h-k{align-self:stretch;margin:-1.9mm 0 -1.7mm;background:var(--g-hot);color:var(--g-on-hot);display:flex;align-items:center;padding-left:2.4mm}
.tb-h-k .tb-h-n{color:var(--g-on-hot)}
.tb-h-k .tb-h-m{background:var(--g-on-hot)}`,
  };
  const css = `
${GRAPHIC_BASE_CSS}
:root{--g-display:var(--font-heading);--g-ink:${c.ink};--g-soft:${c.soft};--g-hot:var(--accent-raw);--g-on-hot:var(--on-accent-raw);--g-hot-text:var(--accent);
  --g-rule:#cfd5dc;--g-hair:#e0e4e9;--g-track:#dde3e8;
  --tA:29mm;--tC:52mm;--tg:5mm;--tAg:calc(var(--tA) + var(--tg));
  --margin:calc(14mm * var(--fit-margin));--ink:#111a24;--ink-2:#36414e;--ink-3:#5a6573}
/* ——— masthead: name and portrait, then the fact table ——— */
.cv-top--header{margin-bottom:calc(7mm * var(--fit-gap))}
.tb-mast{display:grid;grid-template-columns:1fr auto;align-items:end;gap:var(--tg);border-top:2.4mm solid var(--g-ink);padding-top:calc(5mm * var(--fit-gap));padding-bottom:calc(4.5mm * var(--fit-gap))}
.tb-id{min-width:0}
.tb-name{font-family:var(--g-display);font-weight:800;font-size:calc(40pt * var(--ns,1));line-height:.98;letter-spacing:-.04em;color:var(--g-ink);${c.caps ? 'text-transform:uppercase;letter-spacing:-.02em;' : ''}overflow-wrap:anywhere}
.tb-role{margin-top:3.2mm;font-size:8.4pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--g-hot-text)}
${FRAME[c.frame]}
.tb-photo{flex:none;align-self:end;margin-bottom:.3mm}
.cv-portrait--initials.tb-photo{background:var(--g-hot);color:var(--g-on-hot);font-family:var(--g-display);font-weight:800;font-size:22pt;letter-spacing:-.03em;display:grid;place-items:center}
.tb-facts{border-top:.5mm solid var(--g-ink);border-bottom:.3mm solid var(--g-rule);overflow:hidden}
.tb-cells{display:grid;grid-template-columns:repeat(var(--n,4),minmax(0,auto));justify-content:space-between;margin:-.3mm 0 0 -4.3mm}
.tb-cell{min-width:0;display:flex;align-items:center;gap:2mm;padding:2.6mm 4mm 2.4mm 4mm;border-left:.3mm solid var(--g-rule);border-top:.3mm solid var(--g-hair);font-size:.86em;line-height:1.3;color:var(--ink)}
.tb-cell .cv-icon{flex:none;width:1em;height:1em;color:var(--g-hot-text)}
.tb-cell .cv-contact-text{min-width:0}
.tb-cell-l{color:var(--ink-3)}
.tb-cell--stat strong{font-family:var(--g-display);font-weight:800;font-size:1.25em;letter-spacing:-.02em;color:var(--g-ink);font-variant-numeric:tabular-nums}
.tb-cell--stat span{color:var(--ink-3)}
.tb-figs{display:grid;grid-template-columns:calc(var(--tA) + var(--tg) / 2) 1fr calc(var(--tC) + var(--tg) / 2);border-bottom:.3mm solid var(--g-rule)}
.tb-figs:has(.tb-fig:nth-child(2):last-child){grid-template-columns:calc(var(--tA) + var(--tg) / 2) 1fr}
.tb-fig{padding:3mm 0 2.8mm calc(var(--tg) / 2);border-left:.3mm solid var(--g-rule)}
.tb-fig:first-child{border-left:0;padding-left:0}
.tb-fig-v{font-family:var(--g-display);font-weight:800;font-size:21pt;line-height:1;letter-spacing:-.04em;color:var(--g-ink);font-variant-numeric:tabular-nums lining-nums}
.tb-fig-l{margin-top:1.4mm;font-size:7.2pt;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
html[data-fit-compact] .tb-figs{display:none}
/* ——— continuation pages: a running strip on the same grid ——— */
.cv-page{padding-top:calc(9mm * var(--fit-margin))}
.cv-page--first{padding-top:calc(9mm * var(--fit-margin))}
.cv-top--running{margin-bottom:6mm}
.tb-run{display:grid;grid-template-columns:var(--tA) auto minmax(0,1fr);column-gap:var(--tg);align-items:center;border-top:1.4mm solid var(--g-ink);border-bottom:.3mm solid var(--g-rule);padding:2.2mm 0 2mm}
.tb-run-k{justify-self:start;font-family:var(--g-display);font-weight:800;font-size:9pt;letter-spacing:.02em;color:var(--g-hot-text)}
.tb-run strong{font-family:var(--g-display);font-weight:800;font-size:11pt;letter-spacing:-.02em;color:var(--g-ink);${c.caps ? 'text-transform:uppercase;' : ''}}
.tb-run strong{white-space:nowrap}
.tb-run span{min-width:0;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:7.2pt;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}
/* ——— section tables ——— */
.cv-body{font-size:.92em}
.b-heading{padding-top:calc(var(--section-gap) * 1.05);padding-bottom:0}
.cv-main > .b-heading:first-child{padding-top:0}
${OPENER[c.opener]}
.tb-h-row{display:grid;grid-template-columns:var(--tA) 1fr;column-gap:var(--tg);align-items:center;margin-top:1.9mm}
.tb-h-k{display:flex;align-items:center;min-height:1em}
.tb-h-m{display:block;width:3.2mm;height:3.2mm;background:var(--g-hot)}
.tb-h-n{font-family:var(--g-display);font-weight:800;font-size:10pt;letter-spacing:.02em;color:var(--g-hot-text);font-variant-numeric:tabular-nums}
.tb-h-t{font-family:var(--g-display);font-weight:800;font-size:11pt;line-height:1.2;letter-spacing:${c.caps ? '.08em' : '-.01em'};${c.caps ? 'text-transform:uppercase;font-size:9.6pt;' : ''}color:var(--g-ink)}
.tb-h .tb-cols.g-mono{display:grid;grid-template-columns:var(--tA) 1fr var(--tC);column-gap:var(--tg);margin-top:1.9mm;padding:.9mm 0 1mm;border-top:.3mm solid var(--g-rule);border-bottom:.3mm solid var(--g-rule);font-family:var(--font-body);font-size:6.6pt;font-weight:700;line-height:1.3;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
.tb-h .tb-cols.g-mono span{color:inherit;margin:0;font-size:1em}
${colWords()}
.tb-col3{text-align:right}
.tb-h:not(:has(.tb-cols)) .tb-h-row{padding-bottom:2.4mm;border-bottom:.3mm solid var(--g-rule)}
${c.opener === 'band' ? '.tb-h:not(:has(.tb-cols)) .tb-h-row{padding-bottom:1.7mm}' : ''}
/* The vertical hairline down the key column, through every row of a table. */
.cv-main > .b-entry,.cv-main > .b-bullet,.cv-main > .b-compact,.cv-main > .b-skills,.cv-main > .b-summary{background:linear-gradient(var(--g-hair),var(--g-hair)) no-repeat calc(var(--tA) + var(--tg) / 2 - .15mm) 0 / .3mm 100%}
/* Rows */
.tb-row{display:grid;grid-template-columns:var(--tA) 1fr var(--tC);column-gap:var(--tg);align-items:baseline}
.b-entry{padding-top:0}
.b-entry > .tb-row{padding-top:calc(var(--item-gap) * 1.05)}
.b-entry:not(.b-first) > .tb-row{border-top:.3mm solid var(--g-hair)}
.b-entry.b-first > .tb-row{padding-top:2.2mm}
.tb-a{min-width:0;overflow-wrap:anywhere;font-size:.78em;font-weight:700;line-height:1.35;color:var(--g-hot-text);font-variant-numeric:tabular-nums;letter-spacing:.01em}
.tb-title{font-family:var(--font-body);font-size:1.1em;font-weight:700;line-height:1.3;letter-spacing:-.01em;color:var(--ink);min-width:0}
.tb-c{font-size:.88em;line-height:1.35;text-align:right;min-width:0;overflow-wrap:anywhere}
.tb-org{display:block;font-weight:700;color:var(--ink)}
.tb-meta{display:block;color:var(--ink-3)}
.b-entry .cv-bullets{margin:1.1mm 0 0 var(--tAg)}
.cv-main > .b-bullet{padding-left:var(--tAg)}
.b-bullet{padding-top:1.2pt}
.cv-bullets{color:var(--ink-2)}
.cv-bullets li::before{background:var(--g-hot-text);border-radius:0}
.cv-main > .b-entry:last-child,.cv-main > .b-bullet:last-child{padding-bottom:.5mm}
/* Lists: certificates, awards, licences as rows */
.b-compact{padding-top:0}
.b-compact > .tb-row--item{padding:1.6mm 0 1.5mm;border-top:.3mm solid var(--g-hair)}
.b-compact.b-first > .tb-row--item{border-top:0;padding-top:2.6mm}
.tb-item{font-weight:600;color:var(--ink);line-height:1.35}
/* Languages: name and level, two to a row */
.cv-main > .k-languages.b-compact{padding:1.6mm 0 1.5mm var(--tAg);border-top:.3mm solid var(--g-hair)}
.cv-main > .k-languages.b-compact.b-first{border-top:0;padding-top:2.6mm}
.k-languages .cv-compact-grid{display:grid;grid-template-columns:repeat(var(--cols,1),1fr);column-gap:9mm}
.tb-lang{display:flex;justify-content:space-between;align-items:center;gap:3mm;line-height:1.35}
.tb-lang-n{font-weight:600;color:var(--ink)}
.tb-lvl{color:var(--ink-3);font-size:.92em;text-align:right}
.tb-pips{display:flex;gap:.8mm;flex:none}
.tb-pips i{width:2.4mm;height:1.3mm;background:var(--g-track)}
.tb-pips i.on{background:var(--g-hot)}
/* Skills: group in the key column, items run on with thin rules between */
.b-skills{padding-top:0}
.b-skills > .tb-row--skills{grid-template-columns:var(--tA) 1fr;padding:1.6mm 0 0;border-top:.3mm solid var(--g-hair)}
.b-skills:has(+ .b-skills:not(.b-cont)) > .tb-row--skills{padding-bottom:1.5mm}
.b-skills.b-first > .tb-row--skills{border-top:0;padding-top:2.6mm}
.b-skills.b-cont > .tb-row--skills{border-top:0;padding-top:.9mm}
.tb-group{color:var(--ink);font-weight:700;font-size:.84em;line-height:1.35;overflow-wrap:anywhere}
.tb-skills{display:flex;flex-wrap:wrap;row-gap:.9mm;line-height:1.4;color:var(--ink-2);margin-left:-2.7mm;clip-path:inset(0 0 0 .3mm)}
.tb-skills li{padding:0 2.4mm;border-left:.3mm solid var(--g-rule)}
/* Profile: a lead paragraph across the content columns */
.b-summary{padding:2.6mm 0 0 var(--tAg)}
.tb-lead{font-size:1.04em;line-height:1.62;color:var(--ink-2);max-width:150mm}
html[data-fit-compact] .tb-mast{padding-top:4mm;padding-bottom:3.5mm}
html[data-fit-compact] .tb-photo{zoom:.8}
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
    hooks: hooks(c),
    Header,
    Running: ({ model }) => (
      <div className="tb-run">
        <span className="tb-run-k" aria-hidden="true">
          {model.initials}
        </span>
        <strong>{model.name}</strong>
        <span>{model.headline}</span>
      </div>
    ),
  };
}
