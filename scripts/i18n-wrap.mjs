/**
 * Codemod: wraps interface text in t() so it can be translated (German UI).
 *
 *   node scripts/i18n-wrap.mjs src/features/editor/basics-form.tsx [more files…]
 *   node scripts/i18n-wrap.mjs --all          (every .tsx under src/features, src/components, src/app)
 *
 * - JSX text, and runs of text mixed with simple expressions, become one t('… {name} …', { name }).
 * - String attributes that people read (label, title, placeholder, hint, aria-label, alt …).
 * - Inserts `const t = useT();` in the enclosing component (client files), or
 *   `const t = await getT();` and makes the component async (server files).
 * Text it cannot place safely (outside a component) is reported, not changed.
 * Edits are positional, so formatting and comments are kept; run prettier afterwards.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ATTRS = new Set([
  'label',
  'title',
  'placeholder',
  'hint',
  'aria-label',
  'alt',
  'loadingText',
  'description',
  'emptyText',
  'question',
  'legend',
  'message',
  'subtitle',
  'heading',
  'helper',
  'caption',
  'confirmLabel',
  'cancelLabel',
  'actionLabel',
]);
const SKIP_DIRS = ['src/app/api', 'src/app/design-system'];

function filesFrom(args) {
  if (args[0] !== '--all') return args;
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (SKIP_DIRS.some((s) => p.startsWith(s))) continue;
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.tsx') && !p.endsWith('.test.tsx')) out.push(p);
    }
  };
  for (const d of ['src/features', 'src/components', 'src/app']) walk(d);
  return out;
}

const hasLetters = (s) => /[A-Za-z]{2,}/.test(s);
const norm = (s) => s.replace(/\s+/g, ' ');
const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function isComponentName(n) {
  return !!n && /^[A-Z]/.test(n);
}

/** The enclosing component function: a capitalised function or const arrow/function. */
function componentOf(node) {
  let n = node.parent;
  while (n) {
    if (ts.isFunctionDeclaration(n) && isComponentName(n.name?.text)) return n;
    if (
      (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
      ts.isVariableDeclaration(n.parent) &&
      ts.isIdentifier(n.parent.name) &&
      isComponentName(n.parent.name.text)
    )
      return n;
    // forwardRef(function X(...)) / memo(...)
    if (
      (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
      ts.isCallExpression(n.parent) &&
      /^(forwardRef|memo)$/.test(n.parent.expression.getText())
    )
      return n;
    n = n.parent;
  }
  return null;
}

/** A simple expression usable as a placeholder value. */
function placeholderName(expr, used) {
  let base = 'v';
  if (ts.isIdentifier(expr)) base = expr.text;
  else if (ts.isPropertyAccessExpression(expr)) base = expr.name.text;
  else if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression))
    base = expr.expression.text;
  base = base.replace(/[^A-Za-z0-9_]/g, '') || 'v';
  let name = base;
  let i = 2;
  while (used.has(name)) name = `${base}${i++}`;
  used.add(name);
  return name;
}
const simpleExpr = (e) =>
  e &&
  !ts.isJsxElement(e) &&
  !ts.isJsxSelfClosingElement(e) &&
  !ts.isJsxFragment(e) &&
  !ts.isConditionalExpression(e) &&
  !(ts.isBinaryExpression(e) && /&&|\|\|/.test(e.operatorToken.getText())) &&
  !ts.isArrowFunction(e) &&
  !e.getText().includes('<');

function processFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const client = /^\s*['"]use client['"]/.test(src);
  // Use `t` unless the file already has its own `t` (a timer, a map((t) => …) callback…).
  const T = /(\bconst|\blet|\bvar)\s+t\b|[(,]\s*t\s*[,)]|\bt\s*=>/.test(src) ? 'tx' : 't';
  const edits = []; // { start, end, text }
  const components = new Map(); // fn node → true
  const skipped = [];

  const want = (node) => {
    const c = componentOf(node);
    if (!c) {
      skipped.push(`${file}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
      return false;
    }
    components.set(c, true);
    return true;
  };

  const visitChildren = (el) => {
    const kids = el.children;
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const text = run.map((k) => (ts.isJsxText(k) ? k.text : '\u0000')).join('');
      if (!hasLetters(text.replace(/\u0000/g, ''))) {
        run = [];
        return;
      }
      // Trim leading/trailing whitespace-only text and expression edges.
      while (run.length && ts.isJsxText(run[0]) && !run[0].text.trim()) run.shift();
      while (run.length && ts.isJsxText(run[run.length - 1]) && !run[run.length - 1].text.trim())
        run.pop();
      if (!run.length || !want(run[0])) {
        run = [];
        return;
      }
      const used = new Set();
      const vars = [];
      let msg = '';
      for (const k of run) {
        if (ts.isJsxText(k)) msg += k.text;
        else {
          const name = placeholderName(k.expression, used);
          vars.push(`${name}: ${k.expression.getText()}`);
          msg += `{${name}}`;
        }
      }
      // JSX drops whitespace that contains a line break; only same-line spaces are real.
      const first = ts.isJsxText(run[0]) ? run[0].text : '';
      const last = ts.isJsxText(run[run.length - 1]) ? run[run.length - 1].text : '';
      const lead = /^[ \t]+\S/.test(first) ? ' ' : '';
      const trail = /\S[ \t]+$/.test(last) ? ' ' : '';
      const key = norm(msg).trim();
      if (!hasLetters(key)) {
        run = [];
        return;
      }
      const call = vars.length
        ? `${T}(${quote(key)}, { ${vars.join(', ')} })`
        : `${T}(${quote(key)})`;
      const start = run[0].getStart();
      const end = run[run.length - 1].getEnd();
      // Keep a leading/trailing space as a JSX string so words around elements stay apart.
      edits.push({
        start,
        end,
        text: `${lead ? "{' '}" : ''}{${call}}${trail ? "{' '}" : ''}`,
      });
      run = [];
    };
    for (const k of kids) {
      if (ts.isJsxText(k)) run.push(k);
      else if (ts.isJsxExpression(k) && k.expression && simpleExpr(k.expression) && run.length)
        run.push(k);
      else if (ts.isJsxExpression(k) && !k.expression)
        continue; // comments
      else flush();
    }
    flush();
  };

  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      const tag = ts.isJsxElement(node) ? node.openingElement.tagName.getText() : '';
      // Never translate code, styles or scripts.
      if (!/^(style|script|code|pre)$/.test(tag)) visitChildren(node);
    }
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText();
      const v = node.initializer.text;
      if (ATTRS.has(name) && hasLetters(v) && want(node))
        edits.push({
          start: node.initializer.getStart(),
          end: node.initializer.getEnd(),
          text: `{${T}(${quote(norm(v).trim())})}`,
        });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!edits.length) return { changed: false, skipped };

  // Hook / server call at the top of each component body that uses t.
  for (const fn of components.keys()) {
    const body = fn.body;
    if (!body) continue;
    const already = body.getText().includes(`const ${T} = `);
    if (already) continue;
    if (ts.isBlock(body)) {
      edits.push({
        start: body.getStart() + 1,
        end: body.getStart() + 1,
        text: client ? `\n  const ${T} = useT();` : `\n  const ${T} = await getT();`,
      });
    } else {
      // Concise arrow body: (…) => <X/>  →  (…) => { const t = useT(); return <X/>; }
      edits.push({
        start: body.getStart(),
        end: body.getEnd(),
        text: `{\n const ${T} = ${client ? 'useT()' : 'await getT()'};\n return ${body.getText()};\n}`,
      });
    }
    if (!client && !fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
      const at = ts.isFunctionDeclaration(fn)
        ? fn.getStart() +
          (fn.getText().startsWith('export default')
            ? 15
            : fn.getText().startsWith('export')
              ? 7
              : 0)
        : fn.getStart();
      edits.push({ start: at, end: at, text: 'async ' });
    }
  }

  let out = src;
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  const imp = client
    ? "import { useT } from '@/i18n/client';\n"
    : "import { getT } from '@/i18n/server';\n";
  if (!out.includes(client ? "from '@/i18n/client'" : "from '@/i18n/server'")) {
    // After the directive (client) or at the top.
    const m = /^\s*['"]use client['"];?\s*\n/.exec(out);
    out = m ? out.slice(0, m[0].length) + '\n' + imp + out.slice(m[0].length) : imp + out;
  }
  fs.writeFileSync(file, out);
  return { changed: true, skipped };
}

const files = filesFrom(process.argv.slice(2));
let n = 0;
const skippedAll = [];
for (const f of files) {
  const r = processFile(f);
  if (r.changed) n++;
  skippedAll.push(...r.skipped);
}
console.log(`changed ${n} of ${files.length} files`);
if (skippedAll.length) console.log(`not in a component (left as is):\n${skippedAll.join('\n')}`);
