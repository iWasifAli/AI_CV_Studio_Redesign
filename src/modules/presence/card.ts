/**
 * Email signature and business card (spec §10.1): made from the CV's own details in its design's
 * colour and fonts. Pure HTML builders, shared by the preview and the PDF.
 */
import { create as createQr } from 'qrcode';
import type { ResumeDocument } from '@/modules/resume/schema';
import { designCssVars, resolveDesign } from '@/modules/templates/design';
import { fontFaceCss, type FontSource } from '@/modules/templates/fonts';
import { getTemplate } from '@/modules/templates/registry';

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
/** Only http(s) and mailto/tel links are ever written. */
const safeUrl = (u: string) => (/^(https?:\/\/|mailto:|tel:)/i.test(u) ? u : `https://${u}`);
const design = (doc: ResumeDocument) =>
  resolveDesign(doc.design, getTemplate(doc.design.templateId).support);

export type CardOptions = {
  /** Which details to show. */
  phone: boolean;
  email: boolean;
  location: boolean;
  links: boolean;
  /** Portfolio or share link for the card's QR code and the signature. */
  url: string;
};

export function cardDetails(doc: ResumeDocument) {
  const b = doc.basics;
  return {
    name: b.name || 'Your name',
    headline: b.headline,
    email: b.email,
    phone: b.phone,
    location: b.location,
    links: (b.links ?? []).filter((l) => l.url).slice(0, 3),
    accent: design(doc).accent,
  };
}

/**
 * An email signature: a small table with inline styles only (email apps strip style sheets),
 * web-safe fonts, and no images, so it looks the same in Gmail, Outlook and on phones.
 */
export function signatureHtml(doc: ResumeDocument, o: CardOptions): string {
  const d = cardDetails(doc);
  const line = (html: string) =>
    `<tr><td style="padding:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#4a4f57">${html}</td></tr>`;
  const link = (href: string, text: string) =>
    `<a href="${esc(safeUrl(href))}" style="color:${d.accent};text-decoration:none">${esc(text)}</a>`;
  const contacts = [
    o.phone && d.phone ? link(`tel:${d.phone.replace(/[^\d+]/g, '')}`, d.phone) : '',
    o.email && d.email ? link(`mailto:${d.email}`, d.email) : '',
    o.location && d.location ? esc(d.location) : '',
  ].filter(Boolean);
  const links = [
    ...(o.url ? [link(o.url, o.url.replace(/^https?:\/\//, ''))] : []),
    ...(o.links
      ? d.links.map((l) => link(l.url, l.label || l.url.replace(/^https?:\/\//, '')))
      : []),
  ];
  return `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-left:3px solid ${d.accent};padding-left:10px">
<tr><td style="padding:0 0 0 10px"><table cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:0;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:22px;font-weight:bold;color:#1b1f24">${esc(d.name)}</td></tr>
${d.headline ? line(`<span style="color:${d.accent};font-weight:bold">${esc(d.headline)}</span>`) : ''}
${contacts.length ? line(contacts.join(' &nbsp;·&nbsp; ')) : ''}
${links.length ? line(links.join(' &nbsp;·&nbsp; ')) : ''}
</table></td></tr></table>`;
}

/** The same signature as plain text (for apps without rich text). */
export function signatureText(doc: ResumeDocument, o: CardOptions): string {
  const d = cardDetails(doc);
  return [
    d.name,
    d.headline,
    [o.phone && d.phone, o.email && d.email, o.location && d.location].filter(Boolean).join(' · '),
    [o.url, ...(o.links ? d.links.map((l) => l.url) : [])].filter(Boolean).join(' · '),
  ]
    .filter((l) => l && l.trim())
    .join('\n');
}

/**
 * A business card, 85 × 55 mm, front and back as two pages: name, title and details in front;
 * the QR code (a data-URL SVG made by the caller) and the link on the back.
 */
export function businessCardHtml(
  doc: ResumeDocument,
  o: CardOptions,
  qrSvg: string | null,
  fonts: FontSource,
): string {
  const d = cardDetails(doc);
  const r = design(doc);
  const rows = [
    o.phone && d.phone ? d.phone : '',
    o.email && d.email ? d.email : '',
    o.location && d.location ? d.location : '',
    ...(o.links ? d.links.map((l) => l.url.replace(/^https?:\/\//, '')) : []),
  ].filter(Boolean);
  return `<!DOCTYPE html><html lang="${esc(doc.locale.split('-')[0] || 'en')}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data: ${fonts.kind === 'url' ? new URL(fonts.baseUrl).origin : ''}; img-src data:; script-src 'unsafe-inline'">
<title>${esc(d.name)} — business card</title>
<style>${fontFaceCss(r.fontPairId, fonts)}</style><style>${designCssVars(r)}
@page{size:85mm 55mm;margin:0}
*{box-sizing:border-box}html,body{margin:0}
.card{width:85mm;height:55mm;position:relative;overflow:hidden;page-break-after:always;background:#fff;color:#1b1f24;font-family:var(--font-body)}
.card:last-child{page-break-after:auto}
.front{padding:7mm 7mm 6mm 9mm}
.front:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3mm;background:${d.accent}}
h1{font-family:var(--font-heading);font-weight:var(--heading-weight);font-size:15pt;line-height:1.1;margin:0;color:#1b1f24;overflow-wrap:anywhere}
.role{color:${d.accent};font-weight:600;font-size:8.5pt;margin:1.5mm 0 0}
.rows{position:absolute;left:9mm;right:7mm;bottom:6mm;font-size:7.5pt;line-height:1.45;color:#4a4f57;overflow-wrap:anywhere}
.rows p{margin:0}
.back{background:${d.accent};color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2.5mm}
.back .qr{width:25mm;height:25mm;background:#fff;padding:1.5mm;border-radius:1.5mm}
.back .qr img{width:100%;height:100%;display:block}
.back p{margin:0;font-size:7pt;letter-spacing:.02em;max-width:70mm;text-align:center;overflow-wrap:anywhere}
.back .name{font-family:var(--font-heading);font-size:11pt}
@media screen{body{background:#eef0f2;display:flex;flex-direction:column;gap:6mm;align-items:center;padding:6mm}.card{box-shadow:0 1px 4px rgba(0,0,0,.18);border-radius:2mm}}
</style></head><body>
<section class="card front"><h1>${esc(d.name)}</h1>${d.headline ? `<p class="role">${esc(d.headline)}</p>` : ''}<div class="rows">${rows.map((r) => `<p>${esc(r)}</p>`).join('')}</div></section>
<section class="card back">${qrSvg && o.url ? `<div class="qr"><img alt="" src="${qrSvg}"></div><p>${esc(o.url.replace(/^https?:\/\//, ''))}</p>` : `<p class="name">${esc(d.name)}</p>${d.headline ? `<p>${esc(d.headline)}</p>` : ''}`}</section>
<script>document.fonts.ready.then(function(){window.__CV_READY__={pages:2,overflow:0,nearlyFits:false};document.documentElement.setAttribute('data-cv-ready','1')})</script>
</body></html>`;
}

/** A QR code as an SVG data URL (no network, no canvas): works in the browser and the PDF. */
export function qrDataUrl(text: string): string {
  const qr = createQr(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  let path = '';
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) path += `M${x} ${y}h1v1h-1z`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${path}" fill="#1b1f24"/></svg>`;
  return `data:image/svg+xml;base64,${typeof btoa === 'function' ? btoa(svg) : Buffer.from(svg).toString('base64')}`;
}
