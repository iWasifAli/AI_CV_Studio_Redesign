/**
 * Records short captioned feature videos of the studio for Instagram and the how-to page.
 * Usage: npx tsx scripts/instagram/record.ts <makeover|designs|start|all> [outDir]
 * Needs a running app (default http://localhost:3100, started with the mock AI provider) and
 * ffmpeg. Only sample data is used (the fictional teacher CV and a generated sample PDF).
 */
import { chromium, type Page } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { teacher, withPhoto, PHOTO_FOR } from '../../src/modules/resume/fixtures';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const OUT = process.argv[3] ?? '.ig-out/videos';
const SAMPLE_PDF = process.env.SAMPLE_PDF ?? '/tmp/qa3/clarity-engineer.pdf';
const doc = { ...withPhoto(teacher, PHOTO_FOR['teacher'] ?? 'a'), title: 'My teaching CV' };
const wait = (p: Page, ms: number) => p.waitForTimeout(ms);
/** Caption lines with their start times (ms), written out as a WebVTT file next to each video. */
let cues: { t: number; text: string }[] = [];
let t0 = 0;
const mark = (text: string) => cues.push({ t: Date.now() - t0, text });
const vttTime = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(3).padStart(6, '0')}`;
};
const toVtt = (end: number) =>
  'WEBVTT\n\n' +
  cues
    .map(
      (c, i) =>
        `${vttTime(c.t)} --> ${vttTime(cues[i + 1]?.t ?? end)}\n${c.text.replace(/<br>/g, ' ')}\n`,
    )
    .join('\n');

/** The caption bar and the intro/end cards live in the page, so they are burned into the video. */
async function overlay(p: Page) {
  await p.evaluate(() => {
    if (document.getElementById('rec-style')) return;
    const s = document.createElement('style');
    s.id = 'rec-style';
    s.textContent = `
[data-rec-hide]{display:none!important}
#rec-cap{position:fixed;left:14px;right:14px;bottom:70px;z-index:2147483000;background:#172a3dee;color:#fbf9f6;font:700 21px/1.3 Figtree,system-ui,sans-serif;padding:14px 18px;border-radius:14px;text-align:center;box-shadow:0 8px 30px #0006;transition:opacity .25s}
#rec-card{position:fixed;inset:0;z-index:2147483001;background:#172a3d;color:#fbf9f6;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;padding:40px;font-family:Fraunces,Georgia,serif}
#rec-card b{font-size:40px;line-height:1.15;font-weight:600}
#rec-card i{font:600 20px Figtree,system-ui,sans-serif;font-style:normal;color:#c69a61;letter-spacing:.1em;text-transform:uppercase}
#rec-card span{font:600 22px Figtree,system-ui,sans-serif;color:#b9a8e6}
.rec-ring{position:fixed;z-index:2147483002;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;border:4px solid #c69a61;background:#c69a6144;pointer-events:none;animation:rr .6s ease-out forwards}
@keyframes rr{from{transform:scale(.4);opacity:1}to{transform:scale(1.25);opacity:0}}`;
    document.head.appendChild(s);
  });
  // The test setup labels its stand-in AI "DEMO AI"; the real product does not show that.
  await p.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll('span,div,p,small')))
      if (/^\s*demo ai\s*$/i.test(el.textContent ?? '')) el.setAttribute('data-rec-hide', '1');
  });
}
const say = async (p: Page, text: string) => {
  mark(text);
  await overlay(p);
  await p.evaluate((t) => {
    let c = document.getElementById('rec-cap');
    if (!c) {
      c = document.createElement('div');
      c.id = 'rec-cap';
      document.body.appendChild(c);
    }
    c.textContent = t;
  }, text);
};
const card = async (p: Page, kicker: string, title: string, foot: string) => {
  mark(`${kicker}: ${title}`);
  await overlay(p);
  await p.evaluate(
    ([k, t, f]) => {
      document.getElementById('rec-card')?.remove();
      const d = document.createElement('div');
      d.id = 'rec-card';
      d.innerHTML = `<i>${k}</i><b>${t}</b><span>${f}</span>`;
      document.body.appendChild(d);
    },
    [kicker, title, foot],
  );
};
const hideCard = (p: Page) => p.evaluate(() => document.getElementById('rec-card')?.remove());
async function tap(p: Page, target: ReturnType<Page['locator']>) {
  const box = await target.first().boundingBox();
  if (box)
    await p.evaluate(
      ([x, y]) => {
        const r = document.createElement('div');
        r.className = 'rec-ring';
        r.style.left = x + 'px';
        r.style.top = y + 'px';
        document.body.appendChild(r);
        setTimeout(() => r.remove(), 700);
      },
      [box.x + box.width / 2, box.y + box.height / 2],
    );
  await wait(p, 450);
  await target.first().click();
}

type Scene = (p: Page) => Promise<void>;
const scenes: Record<string, { title: string; run: Scene }> = {
  makeover: {
    title: 'Upload your CV, see it redesigned',
    run: async (p) => {
      await p.goto(`${BASE}/makeover`);
      await p.waitForLoadState('networkidle');
      await card(p, 'AI CV Studio', 'Upload your CV.<br>See it redesigned.', 'aicvstudio.app');
      await wait(p, 2200);
      await hideCard(p);
      await say(p, '1. Upload the CV you already have');
      await wait(p, 1800);
      await tap(p, p.getByRole('button', { name: 'Choose a file' }));
      await p.locator('input[type=file]').first().setInputFiles(SAMPLE_PDF);
      await say(p, '2. We read it and lay it out again');
      await p.getByText('Here’s your new CV').waitFor({ timeout: 60_000 });
      await say(p, '3. Same words, a fresh professional look');
      await wait(p, 2200);
      await p.mouse.wheel(0, 380);
      await wait(p, 1600);
      await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await wait(p, 1200);
      await say(p, 'Compare with your original any time');
      await tap(
        p,
        p.getByRole('button', { name: 'Your original' }).or(p.getByText('Your original')),
      );
      await wait(p, 2200);
      await tap(p, p.getByRole('button', { name: 'Your new CV' }).or(p.getByText('Your new CV')));
      await wait(p, 1800);
      await card(p, 'Free to start', 'Try it with<br>your own CV', 'aicvstudio.app');
      await wait(p, 2800);
    },
  },
  designs: {
    title: 'Switch designs, keep every word',
    run: async (p) => {
      await p.goto(`${BASE}/cv/${doc.id}`);
      await p.waitForLoadState('networkidle');
      await card(p, 'AI CV Studio', 'Switch designs.<br>Keep every word.', 'aicvstudio.app');
      await wait(p, 2200);
      await hideCard(p);
      await say(p, 'Your CV, written once');
      await wait(p, 1800);
      await tap(p, p.getByRole('button', { name: 'Design', exact: true }));
      await say(p, 'Open Design and pick a look');
      await wait(p, 2200);
      await p.mouse.wheel(0, 500);
      await wait(p, 1500);
      await say(p, 'Tap any design to try it');
      await tap(p, p.getByText('Pathway').first());
      await wait(p, 2000);
      await tap(p, p.getByRole('button', { name: 'Preview', exact: true }));
      await say(p, 'Same words. New design.');
      await wait(p, 3000);
      await tap(p, p.getByRole('button', { name: 'Design', exact: true }));
      await wait(p, 1200);
      await p.mouse.wheel(0, 900);
      await wait(p, 1500);
      await say(p, 'Every design has a plain ATS version');
      await wait(p, 2400);
      await card(p, 'Free to start', '51 designs.<br>One CV.', 'aicvstudio.app');
      await wait(p, 2800);
    },
  },
  start: {
    title: 'Start from your kind of work',
    run: async (p) => {
      await p.goto(`${BASE}/start`);
      await p.waitForLoadState('networkidle');
      await card(p, 'AI CV Studio', 'No CV yet?<br>Start here.', 'aicvstudio.app');
      await wait(p, 2200);
      await hideCard(p);
      await say(p, 'Choose the kind of work you do');
      await wait(p, 2200);
      await tap(p, p.getByText('Teaching & education').first());
      await p.waitForLoadState('networkidle');
      await wait(p, 1800);
      await say(p, 'We ask simple questions, one step at a time');
      await wait(p, 2600);
      await card(p, 'Free to start', 'Your first CV,<br>step by step', 'aicvstudio.app');
      await wait(p, 2800);
    },
  },
};

const names = process.argv[2] === 'all' ? Object.keys(scenes) : [process.argv[2] ?? 'makeover'];
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const name of names) {
  const scene = scenes[name];
  if (!scene) throw new Error(`unknown scene ${name}`);
  const tmp = path.join(OUT, `raw-${name}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  const ctx = await browser.newContext({
    viewport: { width: 540, height: 960 },
    recordVideo: { dir: tmp, size: { width: 540, height: 960 } },
  });
  await ctx.addInitScript((d) => {
    localStorage.setItem(`cvstudio:v1:doc:${d.id}`, JSON.stringify(d));
  }, doc);
  const page = await ctx.newPage();
  cues = [];
  t0 = Date.now();
  await scene.run(page);
  const total = Date.now() - t0;
  await ctx.close();
  fs.writeFileSync(path.join(OUT, `${name}.vtt`), toVtt(total));
  const webm = fs.readdirSync(tmp).find((f) => f.endsWith('.webm'))!;
  const mp4 = path.join(OUT, `${name}.mp4`);
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      path.join(tmp, webm),
      '-vf',
      'scale=1080:1920:flags=lanczos,fps=30',
      '-c:v',
      'libx264',
      '-crf',
      '21',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-an',
      mp4,
    ],
    { stdio: 'ignore' },
  );
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('wrote', mp4);
}
await browser.close();
