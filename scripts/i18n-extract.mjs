/**
 * Lists interface text for translation:
 *   node scripts/i18n-extract.mjs > /tmp/strings.json
 * Every t('…') key, plus human-looking string literals in interface code (labels in constant
 * lists, toast and error messages) that reach a translating sink at run time.
 * Prints JSON: { keys: [...], missing: [...] } where `missing` lacks a German translation.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOTS = ['src/features', 'src/components', 'src/app'];
const SKIP = ['src/app/api', 'src/app/design-system'];
const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (SKIP.some((s) => p.startsWith(s))) continue;
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx?|mjs)$/.test(p) && !/\.test\.tsx?$/.test(p)) files.push(p);
  }
};
for (const r of ROOTS) if (fs.existsSync(r)) walk(r);
// Extra files (module data shown in the interface), e.g. src/modules/resume/professions.ts
for (const f of process.argv.slice(2)) if (fs.existsSync(f)) files.push(f);

const keyOf = (s) => s.replace(/\s+/g, ' ').trim();
const keys = new Set();
const human = (s) =>
  /[A-Za-z]{2,}/.test(s) &&
  /\s/.test(s.trim()) &&
  !/^[a-z0-9_.:/-]+$/.test(s) &&
  !/^(text|bg|border|flex|grid|rounded|shadow|font|min-|max-|w-|h-|p[xytrbl]?-|m[xytrbl]?-|gap|items|justify|col-|row-|hover:|focus|sr-only|inline|block|absolute|relative|sticky|z-)/.test(
    s.trim(),
  ) &&
  !/[{};<>]|=>|\bfunction\b|https?:|@\/|\.(tsx?|css|png|webp)$/.test(s) &&
  !/^[A-Z_]+$/.test(s);

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (n) => {
    // t('…') / tx('…') / rich(t, '…')
    if (
      ts.isCallExpression(n) &&
      ((ts.isIdentifier(n.expression) && /^(t|tx)$/.test(n.expression.text)) ||
        (ts.isIdentifier(n.expression) && n.expression.text === 'rich'))
    ) {
      const arg = n.expression.text === 'rich' ? n.arguments[1] : n.arguments[0];
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)))
        keys.add(keyOf(arg.text));
    } else if (
      (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) &&
      human(n.text) &&
      !ts.isImportDeclaration(n.parent) &&
      !(
        ts.isJsxAttribute(n.parent) &&
        /^(className|href|data-|id|type|name|role|key)/.test(n.parent.name.getText())
      ) &&
      !(
        ts.isPropertyAssignment(n.parent) &&
        /^(className|href|id|type|role|key|testId|path|cls)$/.test(n.parent.name.getText?.() ?? '')
      )
    ) {
      keys.add(keyOf(n.text));
    } else if (
      (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) &&
      /[A-Za-z]{2,}/.test(n.text) &&
      /^[A-Z]/.test(n.text) &&
      ts.isPropertyAssignment(n.parent) &&
      /^(label|title|name|description|hint|question|placeholder|message|text|body|why|note|tip|example|lead|cta|short|blurb|tagline|heading|subtitle|action|button|empty)$/.test(
        n.parent.name.getText?.() ?? '',
      )
    ) {
      keys.add(keyOf(n.text));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

const { de } = await import(path.resolve('src/i18n/de.ts')).catch(() => ({ de: {} }));
const list = [...keys].sort();
const missing = list.filter((k) => !(k in (de ?? {})));
process.stdout.write(JSON.stringify({ count: list.length, missing }, null, 1));
