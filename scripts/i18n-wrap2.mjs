// Second pass: wraps interface strings that the first pass missed:
//  1. string literals / templates rendered from JSX expressions ({cond ? 'A' : 'B'}, title={x ? 'A' : `B ${n}`})
//  2. render sites of static data props ({step.body}, {action.title}) except known user-data objects.
// Usage: node scripts/i18n-wrap2.mjs <files...>
import fs from 'node:fs';
import ts from 'typescript';

const ATTRS =
  /^(title|placeholder|aria-label|alt|label|hint|description|helper|emptyText|confirmLabel|cancelLabel|message|heading|subtitle)$/;
const PROPS =
  /^(title|body|text|lead|cta|action|label|hint|description|question|blurb|tagline|subtitle|heading|message|example|why|tip|detail|summaryLabel|button|empty|note)$/;
const DATA =
  /^(doc|d0|job|jobs|item|entry|e|letter|l|user|u|story|plan|version|v|comment|c|basics|b|profile|res|result|data|draft|reply|answer|msg|suggestion|s2|order|o2|pay|payment|log|row|share|link|portfolio|site|stat|n|note|q2|section|sec|props|p2|rec|report|review|ai|out|output|error|err|e2|thread|post|f|file|fixture|exp)$/;
const looksUi = (s) =>
  /[A-Za-z]{2,}/.test(s) &&
  /^[A-Z0-9“‘(…]/.test(s.trim()) &&
  !/^(https?:|\/|#|[a-z-]+:|var\()/.test(s) &&
  !/^[A-Z_]+$/.test(s);

function translatorIn(node) {
  for (let n = node; n; n = n.parent) {
    if (
      (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
      n.body &&
      ts.isBlock(n.body)
    ) {
      for (const st of n.body.statements)
        if (ts.isVariableStatement(st))
          for (const d of st.declarationList.declarations) {
            const init =
              d.initializer &&
              (ts.isAwaitExpression(d.initializer) ? d.initializer.expression : d.initializer);
            if (
              init &&
              ts.isCallExpression(init) &&
              /^(useT|getT)$/.test(init.expression.getText()) &&
              ts.isIdentifier(d.name)
            )
              return d.name.text;
          }
    }
  }
  return null;
}
function inTCall(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isCallExpression(n) && /^(t|tx|rich|translate)$/.test(n.expression.getText()))
      return true;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isBlock(n)) return false;
  }
  return false;
}
// Walk up through value-preserving expressions to the JsxExpression, if any.
function jsxHost(node) {
  let n = node;
  while (
    n.parent &&
    ((ts.isConditionalExpression(n.parent) && n.parent.condition !== n) ||
      ts.isParenthesizedExpression(n.parent) ||
      (ts.isBinaryExpression(n.parent) &&
        /^(\|\||\?\?|&&)$/.test(n.parent.operatorToken.getText()) &&
        (n.parent.right === n || n.parent.operatorToken.getText() !== '&&')))
  )
    n = n.parent;
  return n.parent && ts.isJsxExpression(n.parent) ? n.parent : null;
}
function okHost(host) {
  const p = host.parent;
  if (ts.isJsxElement(p) || ts.isJsxFragment(p)) return true;
  if (ts.isJsxAttribute(p)) return ATTRS.test(p.name.getText());
  return false;
}

for (const file of process.argv.slice(2)) {
  let src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const add = (node, build) => {
    const name = translatorIn(node) ?? 'tx';
    edits.push({ start: node.getStart(), end: node.getEnd(), text: build(name) });
  };
  (function visit(n) {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && looksUi(n.text)) {
      const host = jsxHost(n);
      if (host && okHost(host) && !inTCall(n)) add(n, (t) => `${t}(${JSON.stringify(n.text)})`);
    } else if (
      ts.isTemplateExpression(n) &&
      looksUi(n.head.text || 'X' + n.templateSpans[0].literal.text)
    ) {
      const host = jsxHost(n);
      if (host && okHost(host) && !inTCall(n)) {
        let key = n.head.text;
        const vars = [];
        n.templateSpans.forEach((sp, i) => {
          const e = sp.expression;
          const nm = ts.isIdentifier(e)
            ? e.text
            : ts.isPropertyAccessExpression(e)
              ? e.name.text
              : `v${i}`;
          vars.push(`${nm}: ${e.getText()}`);
          key += `{${nm}}` + sp.literal.text;
        });
        if (/[A-Za-z]{3,}/.test(key.replace(/\{\w+\}/g, '')))
          add(n, (t) => `${t}(${JSON.stringify(key)}, { ${[...new Set(vars)].join(', ')} })`);
      }
    } else if (
      ts.isPropertyAccessExpression(n) &&
      PROPS.test(n.name.text) &&
      ts.isIdentifier(n.expression) &&
      !DATA.test(n.expression.text)
    ) {
      const host = n.parent && ts.isJsxExpression(n.parent) ? n.parent : null;
      if (host && ts.isJsxElement(host.parent) && !inTCall(n))
        add(n, (t) => `${t}(${n.getText()})`);
    }
    ts.forEachChild(n, visit);
  })(sf);
  if (!edits.length) continue;
  edits.sort((a, b) => b.start - a.start);
  for (const e of edits) src = src.slice(0, e.start) + e.text + src.slice(e.end);
  fs.writeFileSync(file, src);
  console.log(file, edits.length);
}
