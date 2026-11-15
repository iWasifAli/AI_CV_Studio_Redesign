// Adds `const <name> = useT();` to the component that encloses each "Cannot find name 't'/'tx'"
// error reported by tsc. Usage: npx tsc --noEmit -p . | node scripts/i18n-fix-scope.mjs
import fs from 'node:fs';
import ts from 'typescript';
const input = fs.readFileSync(0, 'utf8');
const want = new Map();
for (const m of input.matchAll(
  /^(.+\.tsx)\((\d+),(\d+)\): error TS2304: Cannot find name '(tx?|t)'/gm,
)) {
  const list = want.get(m[1]) ?? [];
  list.push({ line: Number(m[2]) - 1, col: Number(m[3]) - 1, name: m[4] });
  want.set(m[1], list);
}
for (const [file, spots] of want) {
  let src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const inserts = new Map();
  for (const s of spots) {
    const pos = sf.getPositionOfLineAndCharacter(s.line, s.col);
    let n = (function find(node) {
      if (pos < node.getStart() || pos >= node.getEnd()) return null;
      for (const c of node.getChildren()) {
        const r = find(c);
        if (r) return r;
      }
      return node;
    })(sf);
    let fn = null;
    while (n) {
      const isFn =
        ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n);
      if (isFn) {
        const name = ts.isFunctionDeclaration(n)
          ? n.name?.text
          : ts.isVariableDeclaration(n.parent) && ts.isIdentifier(n.parent.name)
            ? n.parent.name.text
            : '';
        if (name && /^[A-Z]/.test(name)) {
          fn = n;
          break;
        }
      }
      n = n.parent;
    }
    if (!fn || !ts.isBlock(fn.body)) {
      console.log('manual:', file, s.line + 1);
      continue;
    }
    inserts.set(fn.body.getStart() + 1, s.name);
  }
  const sorted = [...inserts.entries()].sort((a, b) => b[0] - a[0]);
  for (const [at, name] of sorted)
    src = src.slice(0, at) + `\n  const ${name} = useT();` + src.slice(at);
  if (!src.includes("from '@/i18n/client'")) {
    const m = /^\s*['"]use client['"];?\s*\n/.exec(src);
    const imp = "import { useT } from '@/i18n/client';\n";
    src = m ? src.slice(0, m[0].length) + imp + src.slice(m[0].length) : imp + src;
  }
  fs.writeFileSync(file, src);
  console.log('fixed', file, sorted.length);
}
