/**
 * Shared parts of the graphic designs: the key-numbers strip, skill bars and rings, timeline
 * entries, monogram and split name. Everything shown is the person's own data — bars and rings
 * appear only for skills the person gave a level, and key numbers come from what they entered or
 * from counts in the CV (never invented).
 */
import { cvWords } from '@/modules/resume/cv-words';
import type { ReactNode } from 'react';
import {
  ContactList,
  joinParts,
  MetaText,
  type TemplateComponentProps,
  type TemplateHooks,
} from '../blocks';
import type { RenderModel, REntry, RSection } from '../render-model';

export type Marker = 'bar' | 'dot' | 'slash' | 'number' | 'square' | 'line';
export type SkillLook = 'bars' | 'segments' | 'dots';

/**
 * Decorative symbols drawn as SVG: the CV fonts have no such glyphs, and a text symbol would make
 * Chrome embed a fallback font as Type 3 in the PDF (poorer text extraction). Plain ASCII marks
 * stay text.
 */
const GLYPHS: Record<string, string> = {
  '✦': 'M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z',
  '✧': 'M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0ZM12 6C11.4 10 10 11.4 6 12C10 12.6 11.4 14 12 18C12.6 14 14 12.6 18 12C14 11.4 12.6 10 12 6Z',
  '◆': 'M12 1L23 12L12 23L1 12Z',
  '✳': 'M10.6 0h2.8v8.6l6.1-6.1 2 2-6.1 6.1H24v2.8h-8.6l6.1 6.1-2 2-6.1-6.1V24h-2.8v-8.6l-6.1 6.1-2-2 6.1-6.1H0v-2.8h8.6L2.5 4.5l2-2 6.1 6.1Z',
  '❋': 'M12 0c2.4 0 3.4 3.2 2.4 7.3 3-2.9 6.3-3.6 7.5-1.5 1.2 2.1-1.1 4.6-5.1 5.7 4 1.1 6.3 3.6 5.1 5.7-1.2 2.1-4.5 1.4-7.5-1.5 1 4.1 0 7.3-2.4 7.3s-3.4-3.2-2.4-7.3c-3 2.9-6.3 3.6-7.5 1.5-1.2-2.1 1.1-4.6 5.1-5.7-4-1.1-6.3-3.6-5.1-5.7C3.3 3.7 6.6 4.4 9.6 7.3 8.6 3.2 9.6 0 12 0Z',
  '↗': 'M7 4h13v13h-3V9.1L5.1 21 3 18.9 14.9 7H7Z',
};

/** A symbol: SVG when it is one of the drawn glyphs, otherwise the character itself. */
export function Glyph({ char, className }: { char: string; className?: string }) {
  const d = GLYPHS[char];
  if (!d) return <>{char}</>;
  return (
    <svg
      className={`g-glyph${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d={d} />
    </svg>
  );
}

/** "Jordan Lee" becomes first line, last line (single names stay on one line). */
export function SplitName({
  model,
  className,
  stop = '',
}: {
  model: RenderModel;
  className: string;
  /** A full stop or star after the last name (decorative, hidden from screen readers). */
  stop?: string;
}) {
  const first = model.firstName || model.name || cvWords(model.locale)('Your name');
  const last = model.lastName;
  return (
    <h1 className={className} style={{ ['--ns' as string]: nameScale(model) }}>
      <span className="g-first">{first}</span>
      {last && (
        <>
          {' '}
          <span className="g-last">
            {last}
            {stop && (
              <span className="g-stop" aria-hidden="true">
                <Glyph char={stop} />
              </span>
            )}
          </span>
        </>
      )}
    </h1>
  );
}

/**
 * How big a name can be set: very long names (several words, or one long word) step down so they
 * never run into the photo or the band below. Returns a font-size multiplier.
 */
export function nameScale(model: RenderModel): number {
  const name = model.name || cvWords(model.locale)('Your name');
  const longest = Math.max(...name.split(/[\s-]+/).map((w) => w.length));
  const len = name.length;
  let k = len <= 14 ? 1 : len <= 20 ? 0.84 : len <= 28 ? 0.68 : len <= 40 ? 0.54 : 0.44;
  if (longest > 9) k = Math.min(k, 9 / longest);
  return Math.max(0.4, Math.round(k * 100) / 100);
}

/** Initials as a small brand mark (initials plus a star). */
export function Monogram({ model, star = '✳' }: { model: RenderModel; star?: string }) {
  if (!model.initials) return null;
  return (
    <p className="g-mono" aria-hidden="true">
      {model.initials}
      <span>
        <Glyph char={star} />
      </span>
    </p>
  );
}

/** The key numbers strip: "09+" style figures with what they count. */
export function KeyNumbers({ model, className }: { model: RenderModel; className: string }) {
  if (model.stats.length < 2) return null;
  return (
    <div className={`g-stats ${className}`}>
      {model.stats.map((k, i) => {
        const m = /^(.*?\d)([^\d]*)$/.exec(k.value);
        return (
          <div key={i} className="g-stat">
            <p className="g-stat-v">
              {m ? (
                <>
                  {m[1]}
                  {m[2] && <span>{m[2]}</span>}
                </>
              ) : (
                k.value
              )}
            </p>
            <p className="g-stat-l">{k.label}</p>
          </div>
        );
      })}
    </div>
  );
}

/** Section heading with a small graphic marker ('number' counts sections with CSS counters). */
export function heading(marker: Marker) {
  return function Heading(s: RSection) {
    return (
      <h2 className={`g-h g-h--${marker}`}>
        {marker === 'number' ? (
          <span className="g-h-n" aria-hidden="true" data-num="" />
        ) : (
          <span className="g-h-m" aria-hidden="true" />
        )}
        <span className="g-h-t">{s.title}</span>
      </h2>
    );
  };
}

const LEVEL_WORD = ['', 'Basic', 'Working', 'Good', 'Advanced', 'Expert'];

/** One skill group: bars, segments or dots for levels the person set; tags otherwise. */
function SkillGroup({ e, look }: { e: REntry; look: SkillLook }) {
  const lv = e.levels;
  const rated = lv ? e.tags.map((t, i) => ({ t, l: lv[i] ?? 0 })) : [];
  if (!lv || !rated.some((r) => r.l > 0))
    return (
      <div>
        {e.label && <p className="g-skill-label">{e.label}</p>}
        <ul className="g-tags">
          {e.tags.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>
    );
  // A short group of rated skills reads well as rings (two or three of them).
  const asRings = rated.length >= 2 && rated.length <= 3 && rated.every((r) => r.l > 0);
  if (asRings)
    return (
      <div>
        {e.label && <p className="g-skill-label">{e.label}</p>}
        <ul className="g-rings">
          {rated.map((r, i) => (
            <li key={i} className="g-ring-item">
              <span
                className="g-ring"
                style={{ ['--p' as string]: `${r.l * 20}` }}
                role="img"
                aria-label={`${r.t}: ${cvWords(e.locale)(LEVEL_WORD[r.l] ?? '')}`}
              >
                <span className="g-ring-in">
                  {r.l}
                  <small>/5</small>
                </span>
              </span>
              <span className="g-ring-l">{r.t}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <div>
      {e.label && <p className="g-skill-label">{e.label}</p>}
      <ul className={`g-meters g-meters--${look}`}>
        {rated.map((r, i) => (
          <li key={i}>
            <span className="g-meter-l">
              {r.t}
              {r.l > 0 && (
                <span className="g-sr"> — {cvWords(e.locale)(LEVEL_WORD[r.l] ?? '')}</span>
              )}
            </span>
            {r.l > 0 &&
              (look === 'bars' ? (
                <span className="g-track" aria-hidden="true">
                  <i style={{ width: `${r.l * 20}%` }} />
                </span>
              ) : (
                <span className={`g-pips g-pips--${look}`} aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <i key={n} className={n <= r.l ? 'on' : ''} />
                  ))}
                </span>
              ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Language with a five-step level (when set). */
function Language({ e }: { e: REntry }) {
  return (
    <div className="g-lang">
      <span className="g-lang-n">{e.title}</span>
      {e.level ? (
        <span className="g-lang-pips" role="img" aria-label={e.label || `${e.level} of 5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <i key={n} className={n <= (e.level ?? 0) ? 'on' : ''} />
          ))}
        </span>
      ) : (
        e.label && <span className="g-lang-l">{e.label}</span>
      )}
    </div>
  );
}

/** Hooks shared by every graphic design: a timeline entry head and the parts above. */
export function graphicHooks(o: { marker: Marker; skills: SkillLook }): TemplateHooks {
  return {
    splitSkills: true,
    drawsLevels: true,
    heading: heading(o.marker),
    summary: (t) => <p className="g-summary">{t}</p>,
    entryHead: (e) => (
      <div className="g-entry">
        {e.dates && <p className="g-when">{e.dates}</p>}
        <h3 className="g-title">{e.title || e.subtitle}</h3>
        {((e.title ? e.subtitle : '') || e.meta) && (
          <p className="g-org">
            {e.title && e.subtitle && <span>{e.subtitle}</span>}
            {e.title && e.subtitle && e.meta && <span className="g-dot"> · </span>}
            {e.meta && (
              <span className="g-meta">
                <MetaText e={e} />
              </span>
            )}
          </p>
        )}
      </div>
    ),
    compactItem: (e, s) =>
      s.kind === 'languages' ? (
        <Language e={e} />
      ) : (
        <div className="g-award">
          {e.dates && <span className="g-award-y">{e.dates}</span>}
          <span className="g-award-t">
            <span className="g-award-n">{e.title}</span>
            {joinParts([e.subtitle, e.meta], ' · ') && (
              <span className="g-award-s"> {joinParts([e.subtitle, e.meta], ' · ')}</span>
            )}
          </span>
        </div>
      ),
    skills: (e) => <SkillGroup e={e} look={o.skills} />,
  };
}

/** Contact details stacked with icons (side columns). */
export function StackedContacts({ model }: TemplateComponentProps): ReactNode {
  if (!model.contacts.length) return null;
  return (
    <div className="g-contact">
      <ContactList contacts={model.contacts} icons stacked />
    </div>
  );
}

/** CSS shared by every graphic design (each family adds its own layout and colours). */
export const GRAPHIC_BASE_CSS = `
:root{--can-compact:1}
/* Positioned, so they paint (and extract) in DOM order after the name block. */
.g-stats{position:relative}
html[data-fit-compact] .g-stats{display:none}
.g-glyph{display:inline-block;width:.78em;height:.78em;vertical-align:-.04em;flex:none}
.g-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.g-mono{font-family:var(--g-display);font-weight:800;font-size:16pt;letter-spacing:-.06em;line-height:1}
.g-mono span{color:var(--g-hot);margin-left:.04em;font-size:.9em}
.g-stats{display:grid;grid-template-columns:repeat(var(--g-stat-n,3),1fr);gap:4mm}
.g-stats:has(.g-stat:nth-child(2):last-child){--g-stat-n:2}
.g-stat-v{font-family:var(--g-display);font-weight:800;font-size:22pt;letter-spacing:-.05em;line-height:1;font-variant-numeric:lining-nums}
.g-stat-v span{color:var(--g-hot)}
.g-stat-l{margin-top:1.6mm;font-size:7pt;letter-spacing:.02em;line-height:1.3}
.g-h{display:flex;align-items:center;gap:2.6mm;font-family:var(--font-body);font-size:8.6pt;font-weight:800;letter-spacing:.1em;text-transform:uppercase;line-height:1.2;color:var(--g-head,var(--ink))}
.g-h-m{flex:none;display:block;background:var(--g-hot-text)}
.g-h--bar .g-h-m{width:4.8mm;height:1.05mm}
.g-h--dot .g-h-m{width:2.2mm;height:2.2mm;border-radius:50%}
.g-h--square .g-h-m{width:2mm;height:2mm;transform:rotate(45deg)}
.g-h--slash .g-h-m{width:.9mm;height:3.4mm;transform:skewX(-20deg)}
.g-h--line{gap:0;flex-direction:row-reverse;justify-content:flex-end}
.g-h--line .g-h-m{flex:1;height:.3mm;margin-left:3mm;background:var(--g-rule)}
.g-h-n{font-family:var(--g-display);font-weight:800;color:var(--g-hot-text);letter-spacing:0;font-size:1.1em}
.g-summary{color:var(--ink-2);line-height:1.72}
.g-entry{position:relative}
.g-when{font-size:.78em;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--g-hot-text);margin-bottom:1.2mm;font-variant-numeric:tabular-nums}
.g-title{font-family:var(--font-body);font-size:1.18em;font-weight:700;letter-spacing:-.012em;line-height:1.3;color:var(--ink)}
.g-org{margin-top:.6mm;font-size:.9em;font-weight:700;color:var(--ink-2)}
.g-org .g-meta,.g-org .g-dot{font-weight:500;color:var(--ink-3)}
.cv-bullets{color:var(--ink-2)}
.cv-bullets li+li{margin-top:1.4pt}
.b-entry .cv-bullets{margin-top:1.6mm}
.cv-bullets li::before{background:var(--g-hot-text)}
.g-skill-label{font-weight:700;font-size:.92em;margin-bottom:1.8mm;color:var(--ink)}
.g-tags{display:flex;flex-wrap:wrap;gap:1.3mm}
.g-tags li{padding:.5mm 2.2mm;border-radius:1mm;background:var(--g-chip);color:var(--g-chip-ink);font-size:.9em;line-height:1.4}
.g-meters{display:flex;flex-direction:column;gap:2.8mm}
.g-meters li{display:flex;flex-direction:column;gap:1.4mm}
.g-meter-l{font-size:.92em;line-height:1.25}
.g-track{display:block;height:1.35mm;border-radius:2mm;background:var(--g-track);overflow:hidden}
.g-track i{display:block;height:100%;border-radius:2mm;background:var(--g-hot)}
.g-pips{display:flex;gap:1mm}
.g-pips i{flex:1;height:1.35mm;background:var(--g-track);border-radius:.4mm}
.g-pips--dots i{flex:none;width:2.1mm;height:2.1mm;border-radius:50%}
.g-pips i.on{background:var(--g-hot)}
.g-rings{display:flex;flex-wrap:wrap;justify-content:space-around;gap:3mm 2mm;padding-top:1mm}
.g-ring-item{display:flex;flex-direction:column;align-items:center;gap:1.6mm;width:19mm;text-align:center}
.g-ring{width:16mm;height:16mm;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--g-hot) calc(var(--p) * 1%),var(--g-track) 0)}
.g-ring-in{width:12.2mm;height:12.2mm;border-radius:50%;background:var(--g-ring-hole,#fff);display:grid;place-content:center;font-family:var(--g-display);font-weight:800;font-size:12pt;line-height:1;color:var(--g-ring-ink,var(--ink))}
.g-ring-in small{font-size:.5em;font-weight:600;margin-left:.1em;opacity:.7}
.g-ring-l{font-size:.86em;line-height:1.25}
.g-lang{display:flex;justify-content:space-between;align-items:center;gap:2mm}
.g-lang-n{font-weight:600}
.g-lang-l{color:var(--ink-3);text-align:right;font-size:.92em}
.g-lang-pips{display:flex;gap:.9mm;flex:none}
.g-lang-pips i{width:1.9mm;height:1.9mm;border-radius:50%;background:var(--g-track)}
.g-lang-pips i.on{background:var(--g-hot)}
.g-award{display:flex;gap:2.4mm;align-items:baseline;line-height:1.4}
.g-award-y{flex:none;min-width:8mm;font-weight:800;color:var(--g-hot-text);font-variant-numeric:tabular-nums;font-size:.92em}
.g-award-n{font-weight:600}
.g-award-s{color:var(--ink-3);font-size:.92em}
.g-contact .cv-contacts{row-gap:2.2mm}
.g-contact .cv-icon{color:var(--g-hot-text);width:1.05em;height:1.05em}
.g-contact .cv-contact{line-height:1.35}
.cv-portrait img{filter:saturate(.92) contrast(1.03)}
`;
