import { renderToStaticMarkup } from 'react-dom/server.edge';
import type { ResumeDocument } from '@/modules/resume/schema';
import { baseCss } from './base-css';
import { sectionBlocks } from './blocks';
import { designCssVars, type ResolvedDesign } from './design';
import { documentDesign } from '@/modules/design/render';
import { fontFaceCss, type FontSource } from './fonts';
import { RUNTIME_JS } from './paginate/runtime-source';
import { toRenderModel } from './render-model';

export type BuildOptions = {
  fonts: FontSource;
  /** Origin allowed for font loading in the document CSP (preview mode). */
  fontOrigin?: string;
  /** Open the browser print dialog once pages are ready (Print fallback). */
  autoPrint?: boolean;
};

const AUTO_PRINT_JS =
  '(function(){var n=0;var t=setInterval(function(){if(window.__CV_READY__||++n>100){clearInterval(t);window.print();}},100);})();';

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/**
 * The headline as a continuation page's running header shows it: one short line (audit F-29).
 * Cut at a word, at most 52 characters; the full headline stays on page 1.
 */
/**
 * Compact grids keep their own spacing on a short CV: they are built for dense CVs (and not
 * suggested for short ones), and opening their cells up split role and dates in the read-back.
 */
const NO_GROW = new Set<string>(['grid', 'mosaic', 'tiles', 'matrix']);

export function runningHeadline(h: string, max = 52): string {
  const t = h.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const firstPart = t.split(/,\s*/)[0]!;
  if (firstPart.length <= max && firstPart.length >= 16) return firstPart;
  const cut = t.slice(0, max + 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > 20 ? cut.slice(0, at) : t.slice(0, max)).replace(/[\s,;:–-]+$/, '')}…`;
}

export function resolveDocumentDesign(doc: ResumeDocument): ResolvedDesign {
  return documentDesign(doc).design;
}

/**
 * Build the complete, self-contained HTML document for a CV.
 * The same string is shown in the preview iframe and printed to PDF by Chromium.
 */
export function buildDocumentHtml(input: ResumeDocument, opts: BuildOptions): string {
  const { template, design, doc } = documentDesign(input);
  const base = toRenderModel(doc);
  const model = template.photo === 'none' ? { ...base, photo: '' } : base;
  const aside = new Set<string>(template.asideKinds);
  const third = new Set<string>(template.thirdKinds ?? []);

  const mainBlocks = model.sections
    .filter((s) => !aside.has(s.kind) && !third.has(s.kind))
    .flatMap((s) => sectionBlocks(s, template.hooks, design));
  if (template.MainEnd)
    mainBlocks.push(
      <div data-block="" data-keep="together" className="b-end" key="main-end">
        <template.MainEnd model={model} design={design} />
      </div>,
    );
  const asideTop = template.AsideTop
    ? [
        <div data-block="" data-keep="together" className="b-aside-top" key="aside-top">
          <template.AsideTop model={model} design={design} />
        </div>,
      ]
    : [];
  const thirdBlocks = model.sections
    .filter((s) => third.has(s.kind))
    .flatMap((s) => sectionBlocks(s, template.hooks, design));
  const asideContact =
    template.contactsIn === 'aside' && template.AsideContact && model.contacts.length > 0
      ? [
          <div
            data-block=""
            data-keep="together"
            className="b-contact"
            data-ref="basics/contact"
            key="contact"
          >
            <template.AsideContact model={model} design={design} />
          </div>,
        ]
      : [];
  const asideBlocks = model.sections
    .filter((s) => aside.has(s.kind))
    .flatMap((s) => sectionBlocks(s, template.hooks, design));
  const { Header, Running, Decor } = template;

  const body = markPlaceholders(
    renderToStaticMarkup(
      <>
        <div data-cv-source="">
          <div data-slot="header">
            <Header model={model} design={design} />
          </div>
          {Running && (
            <div data-slot="running">
              <Running
                model={{ ...model, headline: runningHeadline(model.headline) }}
                design={design}
              />
            </div>
          )}
          <div data-flow="main">{mainBlocks}</div>
          {asideContact.length + asideBlocks.length > 0 && (
            <div data-flow="aside">
              {asideTop}
              {asideContact}
              {asideBlocks}
            </div>
          )}
          {thirdBlocks.length > 0 && <div data-flow="third">{thirdBlocks}</div>}
          {Decor && (
            <div data-slot="decor">
              <Decor model={model} design={design} />
            </div>
          )}
        </div>
        <div data-cv-pages="" />
      </>,
    ),
  );

  const fontSrc =
    opts.fonts.kind === 'url' ? (opts.fontOrigin ?? new URL(opts.fonts.baseUrl).origin) : '';
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `font-src data: ${fontSrc}`.trim(),
    "script-src 'unsafe-inline'",
    'img-src data:',
  ].join('; ');

  const title = model.name ? `${model.name} — CV` : 'CV';

  return `<!DOCTYPE html>
<html lang="${escapeHtml(doc.locale.split('-')[0] || 'en')}" data-template="${template.id}" data-photo="${model.photo ? '1' : '0'}"${template.keepColumns ? ' data-keep-columns=""' : ''}${NO_GROW.has(doc.design.v2?.designId ?? '') ? ' data-no-grow=""' : ''}>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
<meta name="viewport" content="width=device-width">
<title>${escapeHtml(title)}</title>
<style>${fontFaceCss(design.fontPairId, opts.fonts)}</style>
<style>${designCssVars(design)}${baseCss(design)}${template.css}${paletteCss(doc.design.palette)}</style>
</head>
<body>${body}<script>${RUNTIME_JS}</script>${opts.autoPrint ? `<script>${AUTO_PRINT_JS}</script>` : ''}</body>
</html>`;
}

/** A colour theme's dark and pale tones for the graphic designs (nothing when none is picked). */
function paletteCss(p: ResumeDocument['design']['palette']): string {
  if (!p) return '';
  const hex = /^#[0-9a-fA-F]{6}$/;
  if (!hex.test(p.ink) || !hex.test(p.soft)) return '';
  return `:root{--g-ink:${p.ink};--g-soft:${p.soft}}`;
}

/**
 * Text still waiting for the person's input (`{{?…}}`, from AI suggestions) is highlighted in
 * the preview and the PDF, and the download checklist warns about it. Only text nodes change.
 */
export function markPlaceholders(html: string): string {
  return html.replace(
    />([^<]+)</g,
    (_m, text: string) =>
      `>${text.replace(/\{\{\?([^{}]{1,160})\}\}/g, '<mark class="cv-ask">[$1]</mark>')}<`,
  );
}
