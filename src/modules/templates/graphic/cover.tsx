/**
 * "Cover story" family: a tall magazine-cover header — hatched or patterned dark field, the name
 * in two tones with a star, a large framed portrait — then a colour strip carrying the contact
 * line, a pale band of key numbers and the two-column body of the spotlight family.
 */
import type { ReactNode } from 'react';
import { Portrait, type TemplateComponentProps } from '../blocks';
import type { CatalogueTemplate } from '../types';
import { KeyNumbers, Monogram, SplitName } from './parts';
import { spotTemplate, type SpotConfig } from './spot';

export type CoverConfig = Omit<SpotConfig, 'portrait' | 'art' | 'numbers'> & {
  frame: 'tilt' | 'ring' | 'diamond' | 'blob' | 'offset';
  pattern: 'hatch' | 'grid' | 'rays' | 'confetti' | 'bubbles';
};

function Pattern({ kind }: { kind: CoverConfig['pattern'] }): ReactNode {
  const w = 'rgba(255,255,255,';
  const box = {
    className: 'co-art',
    viewBox: '0 0 800 370',
    preserveAspectRatio: 'xMaxYMid slice',
    'aria-hidden': true,
  } as const;
  switch (kind) {
    case 'hatch':
      return (
        <svg {...box}>
          {Array.from({ length: 30 }, (_, i) => (
            <line
              key={i}
              x1={250 + i * 22}
              y1="370"
              x2={450 + i * 22}
              y2="0"
              stroke={`${w}.06)`}
              strokeWidth="1.5"
            />
          ))}
        </svg>
      );
    case 'grid':
      return (
        <svg {...box}>
          <g stroke={`${w}.07)`}>
            {Array.from({ length: 20 }, (_, i) => (
              <line key={`v${i}`} x1={320 + i * 26} y1="0" x2={320 + i * 26} y2="370" />
            ))}
            {Array.from({ length: 15 }, (_, i) => (
              <line key={`h${i}`} x1="320" y1={i * 26} x2="800" y2={i * 26} />
            ))}
          </g>
        </svg>
      );
    case 'rays':
      return (
        <svg {...box}>
          {Array.from({ length: 12 }, (_, i) => (
            <path
              key={i}
              d={`M640 185 L${640 + 700 * Math.cos((i * Math.PI) / 6)} ${185 + 700 * Math.sin((i * Math.PI) / 6)} L${640 + 700 * Math.cos((i * Math.PI) / 6 + 0.12)} ${185 + 700 * Math.sin((i * Math.PI) / 6 + 0.12)}Z`}
              fill={`${w}.045)`}
            />
          ))}
        </svg>
      );
    case 'confetti':
      return (
        <svg {...box}>
          {[
            [360, 60, 0],
            [420, 300, 30],
            [520, 40, 60],
            [770, 330, 15],
            [300, 200, 45],
            [760, 40, 80],
            [480, 230, 20],
          ].map(([x, y, r], i) => (
            <rect
              key={i}
              x={x}
              y={y}
              width="16"
              height="6"
              rx="3"
              fill={i % 2 ? 'var(--g-hot)' : `${w}.25)`}
              transform={`rotate(${r} ${x} ${y})`}
            />
          ))}
        </svg>
      );
    case 'bubbles':
      return (
        <svg {...box}>
          <circle cx="430" cy="320" r="90" fill={`${w}.05)`} />
          <circle cx="780" cy="40" r="130" fill={`${w}.05)`} />
          <circle cx="360" cy="60" r="26" fill="none" stroke={`${w}.18)`} strokeWidth="2" />
        </svg>
      );
  }
}

const EYEBROW = (locale: string) => (locale.startsWith('en') ? 'The story of' : '');

export function coverTemplate(c: CoverConfig): CatalogueTemplate {
  const base = spotTemplate({ ...c, portrait: 'circle', art: 'rings', numbers: 'band' });
  function Header({ model }: TemplateComponentProps) {
    const contacts = model.contacts.filter((x) => x.kind !== 'link').slice(0, 3);
    return (
      <header className="co-head">
        <div className="co-dark">
          <Pattern kind={c.pattern} />
          <Monogram model={model} star="/" />
          {model.headline && <p className="co-corner">{model.headline}</p>}
          <div className="co-id">
            {EYEBROW(model.locale) && <p className="co-eyebrow">{EYEBROW(model.locale)}</p>}
            <SplitName model={model} className="co-name" stop={c.stop} />
            {model.headline && <p className="co-role">{model.headline}</p>}
          </div>
          <div className="co-frame">
            <Portrait model={model} className="co-photo" />
          </div>
        </div>
        <div className="co-strip">
          <span className="co-strip-dot" aria-hidden="true" />
          {contacts.map((x, i) => (
            <span key={i}>{x.href ? <a href={x.href}>{x.text}</a> : x.text}</span>
          ))}
        </div>
        <KeyNumbers model={model} className="co-stats" />
      </header>
    );
  }
  const FRAME: Record<CoverConfig['frame'], string> = {
    tilt: '.co-frame{width:62mm;height:62mm;border-radius:15mm;transform:rotate(4deg);background:var(--g-hot);padding:2.6mm;box-shadow:0 0 0 2.4mm rgba(255,255,255,.12)}.co-photo{width:100%;height:100%;border-radius:12mm}',
    ring: '.co-frame{width:62mm;height:62mm;border-radius:50%;padding:3.2mm;background:var(--g-hot);box-shadow:0 0 0 2.4mm rgba(255,255,255,.14)}.co-photo{width:100%;height:100%;border-radius:50%}',
    diamond:
      '.co-frame{width:58mm;height:58mm;transform:rotate(45deg);border-radius:7mm;overflow:hidden;border:2.6mm solid var(--g-hot);margin-right:5mm}.co-photo{width:142%;height:142%;margin:-21%;transform:rotate(-45deg)}',
    blob: '.co-frame{width:64mm;height:62mm;border-radius:58% 42% 52% 48%/48% 56% 44% 52%;overflow:hidden;border:2.6mm solid var(--g-hot)}.co-photo{width:100%;height:100%}',
    offset:
      '.co-frame{width:56mm;height:64mm;border-radius:3mm;box-shadow:4mm 4mm 0 var(--g-hot);overflow:hidden}.co-photo{width:100%;height:100%}',
  };
  const css = `${base.css}
.cv-top--header{margin-bottom:calc(6mm * var(--fit-gap))}
.co-dark{position:relative;height:calc(89mm * (.42 + .58 * var(--fit-gap)));background:var(--g-ink);color:#fff;overflow:hidden;padding:0 var(--margin)}
html[data-fit-compact] .co-dark{height:60mm}
html[data-fit-compact] .co-eyebrow{display:none}
html[data-fit-compact] .co-corner{display:none}
html[data-fit-compact] .co-frame{zoom:.74}
html[data-fit-compact] .co-id{top:12mm;bottom:7mm}
html[data-fit-compact] .co-name{font-size:calc(40pt * var(--ns,1))}
.co-art{position:absolute;inset:0;width:100%;height:100%}
.co-head .g-mono{position:absolute;left:var(--margin);top:8mm;color:#fff}
.co-corner{position:absolute;right:var(--margin);top:9mm;font-size:6.8pt;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.75);max-width:60mm;text-align:right}
.co-id{position:absolute;left:var(--margin);right:86mm;top:19mm;bottom:9mm;z-index:1;display:flex;flex-direction:column;justify-content:flex-end}
.co-eyebrow{font-size:6.8pt;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--g-hot);margin-bottom:6mm}
.co-name{font-family:var(--g-display);font-weight:800;font-size:calc(52pt * var(--ns,1) * (.8 + .2 * var(--fit-gap)));line-height:.88;letter-spacing:-.06em;${c.caps ? 'text-transform:uppercase;' : ''}color:#fff;overflow-wrap:anywhere}
.co-name > span{display:block}
.co-name .g-last{color:var(--g-hot)}
.co-name .g-stop{font-size:.55em;vertical-align:top;margin-left:.04em}
.co-role{margin-top:5mm;font-size:7.6pt;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
.co-frame{position:absolute;right:calc(var(--margin) + 2mm);top:calc(50% - 31mm);z-index:1}
${FRAME[c.frame]}
.cv-portrait--initials.co-photo{background:var(--g-soft);color:var(--g-ink);font-family:var(--g-display);font-weight:800;font-size:38pt}
.co-strip{display:flex;justify-content:space-between;align-items:center;gap:4mm;background:var(--g-hot);color:var(--g-on-hot);padding:2.2mm calc(var(--margin) + 1mm);font-size:6.9pt;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
.co-strip span{min-width:0;overflow-wrap:anywhere}
.co-strip span:not(.co-strip-dot){text-transform:none;letter-spacing:.04em}
.co-strip-dot{flex:none;width:2mm;height:2mm;border-radius:50%;background:currentColor}
.co-stats{background:var(--g-soft);padding:calc(5.5mm * var(--fit-gap)) calc(var(--margin) + 1.5mm);border-bottom:.3mm solid var(--g-rule)}
`;
  return { ...base, Header, css };
}
