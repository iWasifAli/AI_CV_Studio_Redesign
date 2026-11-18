/**
 * Instagram slide generator for @aicvstudio.app (see the project doc Instagram_Playbook.md).
 * Usage: node scripts/instagram/build.mjs <deck.json> <outDir>
 *        node scripts/instagram/build.mjs --brand <outDir>      (avatar + highlight covers)
 * Deck: { "slides": [ {type:"cover",kicker,title,sub} | {type:"point",title,body} |
 *   {type:"designs",title,sub,ids:["atelier",...]} | {type:"cta",title,sub} ] }
 * Output: PNG 1080x1350 per slide. Uses only the brand fonts and the real design thumbnails.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(import.meta.dirname, '../..');
const FONTS = path.join(ROOT, 'node_modules/@fontsource-variable');
const b64 = (f) => fs.readFileSync(f).toString('base64');
const FR = b64(path.join(FONTS, 'fraunces/files/fraunces-latin-wght-normal.woff2'));
const FG = b64(path.join(FONTS, 'figtree/files/figtree-latin-wght-normal.woff2'));
const thumb = (id) =>
  'data:image/webp;base64,' + b64(path.join(ROOT, 'public/templates', `${id}.webp`));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const CSS = `
@font-face{font-family:F;src:url(data:font/woff2;base64,${FR});font-weight:100 900}
@font-face{font-family:G;src:url(data:font/woff2;base64,${FG});font-weight:300 900}
*{box-sizing:border-box}
body{margin:0;width:1080px;height:1350px;background:#172a3d;color:#fbf9f6;font-family:G;position:relative;overflow:hidden}
.light{background:#fbf9f6;color:#172a3d}
.wrap{position:absolute;left:90px;right:90px;top:330px}
.kicker{font-size:30px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#c69a61;margin:0 0 34px}
h1{font-family:F;font-weight:600;font-size:104px;line-height:1.08;margin:0;letter-spacing:-1px}
h1 em{font-style:normal;color:#c69a61}
p.sub{font-size:52px;line-height:1.36;color:#d9d4ee;margin:40px 0 0}
.light p.sub{color:#4f5d6c}
.num{position:absolute;left:90px;top:170px;width:120px;height:120px;border-radius:50%;background:#5b45a0;color:#fff;font:700 58px G;display:flex;align-items:center;justify-content:center}
.point .wrap{top:330px}
.point h1{font-size:96px}
.foot{position:absolute;left:90px;right:90px;bottom:60px;display:flex;justify-content:space-between;font-size:28px;color:#b9a8e6;font-weight:600}
.light .foot{color:#5b45a0}
.row{position:absolute;left:90px;right:90px;top:760px;display:flex;gap:22px}
.row div{flex:1;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 18px 40px rgba(0,0,0,.35)}
.row img{display:block;width:100%;aspect-ratio:595/842;object-fit:cover;object-position:top}
.row div:nth-child(odd){transform:translateY(24px)}
.pill{display:inline-block;margin-top:46px;background:#c69a61;color:#172a3d;font-weight:800;font-size:38px;padding:22px 46px;border-radius:60px}
.bar{position:absolute;left:90px;right:90px;bottom:128px;height:8px;border-radius:4px;background:rgba(255,255,255,.15)}
.bar i{display:block;height:100%;border-radius:4px;background:#c69a61}
`;

const MARK = (fill, fold, line) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M6 4h14l6 6v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" fill="${fill}"/><path d="M20 4v4a2 2 0 0 0 2 2h4" fill="${fold}"/><rect x="8.5" y="14" width="11" height="2.2" rx="1.1" fill="${line}"/><rect x="8.5" y="18.5" width="15" height="1.6" rx=".8" fill="${line}" fill-opacity=".6"/><rect x="8.5" y="22" width="12" height="1.6" rx=".8" fill="${line}" fill-opacity=".6"/></svg>`;

const slideHtml = (s, i, n) => {
  const foot = `<div class="foot"><span>AI CV Studio</span><span>@aicvstudio.app</span></div>`;
  const bar =
    n > 1 ? `<div class="bar"><i style="width:${Math.round(((i + 1) / n) * 100)}%"></i></div>` : '';
  const title = esc(s.title).replace(/\*(.+?)\*/g, '<em>$1</em>');
  if (s.type === 'point')
    return `<body class="point"><div class="num">${i}</div><div class="wrap"><h1>${title}</h1><p class="sub">${esc(s.body)}</p></div>${bar}${foot}</body>`;
  if (s.type === 'designs')
    return `<body><div class="wrap"><h1>${title}</h1><p class="sub">${esc(s.sub ?? '')}</p></div><div class="row">${s.ids.map((id) => `<div><img src="${thumb(id)}"></div>`).join('')}</div>${foot}</body>`;
  if (s.type === 'cta')
    return `<body class="light"><div class="wrap"><h1>${title}</h1><p class="sub">${esc(s.sub ?? '')}</p><span class="pill">aicvstudio.app</span></div>${foot}</body>`;
  return `<body><div class="wrap">${s.kicker ? `<p class="kicker">${esc(s.kicker)}</p>` : ''}<h1>${title}</h1><p class="sub">${esc(s.sub ?? '')}</p></div>${bar}${foot}</body>`;
};

const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME_EXECUTABLE_PATH ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox'],
});
const shot = async (html, w, h, out) => {
  const p = await browser.newPage();
  await p.setViewport({ width: w, height: h });
  await p.setContent(`<html><head><style>${CSS}</style></head>${html}</html>`);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: out });
  await p.close();
};

if (process.argv[2] === '--brand') {
  const out = process.argv[3];
  fs.mkdirSync(out, { recursive: true });
  // Avatar: bold "CV" on a violet-to-navy field with a gold underline and a small spark for the AI.
  // Everything sits inside the central circle so Instagram's round crop never touches it.
  await shot(
    `<body style="width:1000px;height:1000px;background:linear-gradient(145deg,#6b53b8 0%,#4a3891 45%,#172a3d 100%);display:flex;align-items:center;justify-content:center"><div style="position:relative;width:520px;text-align:center"><div style="font:700 330px/0.9 F;color:#fbf9f6;letter-spacing:-8px">CV</div><div style="margin:34px auto 0;width:300px;height:22px;border-radius:11px;background:#c69a61"></div><svg style="position:absolute;right:-70px;top:-70px" width="130" height="130" viewBox="0 0 24 24"><path d="M12 1l2.6 7.4L22 11l-7.4 2.6L12 21l-2.6-7.4L2 11l7.4-2.6z" fill="#c69a61"/></svg></div></body>`,
    1000,
    1000,
    path.join(out, 'avatar.png'),
  );
  for (const [name, glyph] of [
    ['tips', 'Tips'],
    ['designs', 'Designs'],
    ['makeovers', 'Makeovers'],
    ['faq', 'FAQ'],
  ])
    await shot(
      `<body style="width:1080px;height:1920px;background:#5b45a0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:56px"><div style="width:260px;height:260px;background:#172a3d;border-radius:50%;display:flex;align-items:center;justify-content:center"><div style="width:130px">${MARK('#fbf9f6', '#b9a8e6', '#172a3d')}</div></div><div style="font:600 84px F;color:#fbf9f6">${glyph}</div></body>`,
      1080,
      1920,
      path.join(out, `highlight-${name}.png`),
    );
} else {
  const [deckFile, out] = process.argv.slice(2);
  const { slides } = JSON.parse(fs.readFileSync(deckFile, 'utf8'));
  fs.mkdirSync(out, { recursive: true });
  for (const [i, s] of slides.entries())
    await shot(
      slideHtml(s, i, slides.length),
      1080,
      1350,
      path.join(out, `slide-${String(i + 1).padStart(2, '0')}.png`),
    );
}
await browser.close();
