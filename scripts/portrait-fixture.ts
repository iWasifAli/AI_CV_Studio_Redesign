/**
 * Makes two fixtures with an embedded portrait (an illustrated face, not a real person) for the
 * "photo found in your CV" tests:
 *   src/modules/import/__fixtures__/cv-with-photo.pdf   (text PDF, photo top right, plus a logo)
 *   src/modules/import/__fixtures__/cv-with-photo.docx  (Word, photo plus a wide banner image)
 *
 *   npx tsx scripts/portrait-fixture.ts
 */
import { chromium } from '@playwright/test';
import JSZip from 'jszip';
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const DIR = 'src/modules/import/__fixtures__';

const FACE = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="420" viewBox="0 0 360 420">
<rect width="360" height="420" fill="#cfe3f2"/>
<ellipse cx="180" cy="420" rx="150" ry="110" fill="#2f4f6f"/>
<rect x="150" y="250" width="60" height="70" fill="#e5b591"/>
<ellipse cx="180" cy="190" rx="78" ry="96" fill="#f0c4a0"/>
<path d="M102 170 Q110 80 180 82 Q252 80 258 170 Q240 120 180 118 Q120 120 102 170Z" fill="#3b2a20"/>
<circle cx="150" cy="190" r="8" fill="#2b2b2b"/><circle cx="210" cy="190" r="8" fill="#2b2b2b"/>
<path d="M152 240 Q180 258 208 240" stroke="#a0524a" stroke-width="6" fill="none" stroke-linecap="round"/>
</svg>`;
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="90"><rect width="600" height="90" fill="#0b3d91"/></svg>`;

async function main() {
  const face = await sharp(Buffer.from(FACE)).jpeg({ quality: 90 }).toBuffer();
  const logo = await sharp(Buffer.from(LOGO)).png().toBuffer();
  const faceUrl = `data:image/jpeg;base64,${face.toString('base64')}`;
  const logoUrl = `data:image/png;base64,${logo.toString('base64')}`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 0 } body { margin: 0; font-family: Arial, sans-serif; font-size: 10.5pt }
.page { padding: 18mm } .top { display: flex; justify-content: space-between; align-items: flex-start }
h1 { font-size: 24pt; margin: 0 } h2 { font-size: 13pt; margin: 14pt 0 4pt } p { margin: 2pt 0 }
.logo { width: 60mm; height: 9mm; margin-top: 4mm } .photo { width: 32mm; height: 37mm }
</style></head><body><div class="page">
<div class="top"><div><h1>Hina Rauf</h1><p>Pharmacist</p><p>hina.rauf@example.com · 0301 7654321 · Karachi</p>
<img class="logo" src="${logoUrl}" alt=""></div><img class="photo" src="${faceUrl}" alt=""></div>
<h2>Profile</h2><p>Community pharmacist with six years of experience in patient counselling and stock control.</p>
<h2>Work experience</h2><p><b>Pharmacist</b>, Green Cross Pharmacy, Karachi</p><p>Mar 2019 – Present</p>
<p>• Counselled patients on new prescriptions and side effects</p><p>• Ran monthly stock checks for the dispensary</p>
<h2>Education</h2><p>Doctor of Pharmacy, University of Karachi, 2018</p>
<h2>Skills</h2><p>Patient counselling, Stock control, Prescription checks</p>
</div></body></html>`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE_PATH });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  writeFileSync(
    `${DIR}/cv-with-photo.pdf`,
    await page.pdf({ format: 'A4', printBackground: true }),
  );
  await browser.close();

  // A minimal Word file: text plus two pictures in word/media (the importer reads the text with
  // mammoth; the photo finder looks at the pictures).
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  const para = (t: string, bold = false) =>
    `<w:p><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${[
      para('Hina Rauf', true),
      para('Pharmacist'),
      para('hina.rauf@example.com · 0301 7654321 · Karachi'),
      para('Work experience', true),
      para('Pharmacist, Green Cross Pharmacy, Karachi'),
      para('Mar 2019 – Present'),
      para('Counselled patients on new prescriptions and side effects'),
      para('Education', true),
      para('Doctor of Pharmacy, University of Karachi, 2018'),
    ].join('')}</w:body></w:document>`,
  );
  zip.file('word/media/image1.png', logo);
  zip.file('word/media/image2.jpeg', face);
  writeFileSync(`${DIR}/cv-with-photo.docx`, await zip.generateAsync({ type: 'nodebuffer' }));
  console.log('written');
}

void main();
