// Third pass: string attributes on any prop, local string constants rendered in JSX,
// constant lookups ({INFO[x].hint}) and lists of strings rendered with .map.
import fs from 'node:fs';
import ts from 'typescript';
const TECH =
  /^(className|class|href|src|srcSet|id|key|type|name|value|defaultValue|role|rel|target|method|action|autoComplete|inputMode|as|variant|size|tone|icon|lang|htmlFor|sizes|crossOrigin|accept|pattern|form|dir|spellCheck|encType|referrerPolicy|loading|decoding|fetchPriority|media|backHref|tab|kind|mode|align|side|layout|ref|style|path|fill|stroke|d|viewBox|xmlns|width|height|step|min|max|placeholderChar|testId|testid|slot|draggable|tabIndex|scope|colSpan|rowSpan|headers|wrap|shape|coords|download|ping|hrefLang|frameBorder|sandbox|allow|nonce|integrity|charSet|content|httpEquiv|property)$/;
const PROPS =
  /^(title|body|text|lead|cta|label|hint|description|question|blurb|tagline|subtitle|heading|message|example|why|tip|detail|note|name|style|short|long)$/;
const looksUi = (s) =>
  /[A-Za-z]{2,}/.test(s) &&
  /^[A-Z0-9“‘(…]/.test(s.trim()) &&
  !/^(https?:|\/|#|[a-z-]+:|var\()/.test(s) &&
  !/^[A-Z_0-9]+$/.test(s) &&
  !/^[A-Z][a-z]+[A-Z]/.test(s) &&
  !/^(AI CV Studio|PDF|ATS|CV|OK|Premium|LinkedIn|WhatsApp|Gemini|Google|EasyPaisa|JazzCash)$/.test(
    s.trim(),
  );
function translatorIn(node) {
  for (let n = node; n; n = n.parent)
    if (
      (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
      n.body &&
      ts.isBlock(n.body)
    )
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
  return null;
}
const inT = (n) => {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && /^(t|tx|rich|translate|w|cvWords)$/.test(p.expression.getText()))
      return true;
    if (ts.isJsxElement(p) || ts.isBlock(p)) return false;
  }
  return false;
};
const stringy = (e) => {
  if (!e) return false;
  e = ts.isParenthesizedExpression(e) ? e.expression : e;
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return looksUi(e.text);
  if (ts.isConditionalExpression(e)) return stringy(e.whenTrue) || stringy(e.whenFalse);
  return false;
};
for (const file of process.argv.slice(2)) {
  let src = fs.readFileSync(file, 'utf8');
  if (!/useT\(|getT\(|'use client'/.test(src)) continue;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const add = (node, build) =>
    edits.push({
      start: node.getStart(),
      end: node.getEnd(),
      text: build(translatorIn(node) ?? 'tx'),
    });
  // local consts holding UI strings, and module arrays of UI strings
  const uiConsts = new Set();
  const uiArrays = new Set();
  (function scan(n) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      if (stringy(n.initializer)) uiConsts.add(n.name.text);
      const init = ts.isAsExpression(n.initializer) ? n.initializer.expression : n.initializer;
      if (
        ts.isArrayLiteralExpression(init) &&
        init.elements.length &&
        init.elements.every(
          (e) =>
            (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) && looksUi(e.text),
        )
      )
        uiArrays.add(n.name.text);
    }
    ts.forEachChild(n, scan);
  })(sf);
  (function visit(n) {
    if (
      ts.isJsxAttribute(n) &&
      n.initializer &&
      ts.isStringLiteral(n.initializer) &&
      !TECH.test(n.name.getText()) &&
      !/^(data-|aria-(hidden|current|live|atomic|pressed|expanded|controls|describedby|labelledby|haspopup|selected|checked|invalid|required|busy|modal|orientation|sort|level|setsize|posinset|owns|activedescendant))/.test(
        n.name.getText(),
      ) &&
      looksUi(n.initializer.text)
    ) {
      const lit = n.initializer;
      edits.push({
        start: lit.getStart(),
        end: lit.getEnd(),
        text: `{${translatorIn(n) ?? 'tx'}(${JSON.stringify(lit.text)})}`,
      });
    } else if (
      ts.isJsxExpression(n) &&
      n.expression &&
      !inT(n.expression) &&
      (ts.isJsxElement(n.parent) ||
        ts.isJsxFragment(n.parent) ||
        (ts.isJsxAttribute(n.parent) &&
          /^(title|label|hint|description|placeholder|aria-label|alt|q|heading|subtitle|message|backLabel|confirmLabel|emptyText)$/.test(
            n.parent.name.getText(),
          )))
    ) {
      const e = n.expression;
      if (ts.isIdentifier(e) && uiConsts.has(e.text)) add(e, (t) => `${t}(${e.text})`);
      else if (
        ts.isPropertyAccessExpression(e) &&
        PROPS.test(e.name.text) &&
        ts.isElementAccessExpression(e.expression) &&
        /^[A-Z_]+$/.test(e.expression.expression.getText())
      )
        add(e, (t) => `${t}(${e.getText()})`);
      else if (ts.isIdentifier(e)) {
        // {q} where q is the parameter of UI_ARRAY.map((q) => …)
        for (let p = e.parent; p; p = p.parent) {
          if (
            (ts.isArrowFunction(p) || ts.isFunctionExpression(p)) &&
            ts.isCallExpression(p.parent) &&
            ts.isPropertyAccessExpression(p.parent.expression) &&
            p.parent.expression.name.text === 'map' &&
            ts.isIdentifier(p.parent.expression.expression) &&
            uiArrays.has(p.parent.expression.expression.text) &&
            p.parameters[0] &&
            ts.isIdentifier(p.parameters[0].name) &&
            p.parameters[0].name.text === e.text
          ) {
            add(e, (t) => `${t}(${e.text})`);
            break;
          }
          if (ts.isSourceFile(p)) break;
        }
      }
    }
    ts.forEachChild(n, visit);
  })(sf);
  if (!edits.length) continue;
  edits.sort((a, b) => b.start - a.start);
  for (const e of edits) src = src.slice(0, e.start) + e.text + src.slice(e.end);
  fs.writeFileSync(file, src);
  console.log(file, edits.length);
}
