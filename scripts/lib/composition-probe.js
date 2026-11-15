// Runs inside a paginated CV page. Measures what the eye sees and the overflow checks miss:
// words broken mid-word, how full each page is, text drawn over text, decoration under text.
(() => {
  const pages = [...document.querySelectorAll('.cv-page')];
  const SOFT = /[-‐–—@./_,;:&+|·\\)]/; // places where a line may break inside a "word"
  const visible = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (
        s.display === 'none' ||
        s.visibility === 'hidden' ||
        e.getAttribute('aria-hidden') === 'true'
      )
        return false;
      if (e.classList.contains('g-sr') || e.classList.contains('sr-only')) return false;
      if (s.clip && s.clip.startsWith('rect(0')) return false; // visually hidden (read by screen readers)
    }
    return true;
  };
  const broken = [];
  const overlaps = [];
  const deco = [];
  const fill = [];
  pages.forEach((pg, pi) => {
    const walker = document.createTreeWalker(pg, NodeFilter.SHOW_TEXT);
    const lines = []; // text line boxes on this page
    let n;
    while ((n = walker.nextNode())) {
      const t = n.textContent || '';
      if (!t.trim() || !n.parentElement || !visible(n.parentElement)) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      for (const b of r.getClientRects())
        if (b.width > 1 && b.height > 1) lines.push({ b, node: n });
      for (const m of t.matchAll(/\S{4,}/g)) {
        if (m[0].length > 44) continue; // a 45+ character run has to break somewhere
        const wr = document.createRange();
        wr.setStart(n, m.index);
        wr.setEnd(n, m.index + m[0].length);
        const tops = new Set(
          [...wr.getClientRects()].filter((x) => x.width > 0.5).map((x) => Math.round(x.top)),
        );
        if (tops.size < 2) continue;
        // Find where the line changes and whether that spot is a soft break.
        let prevTop = null;
        for (let i = 0; i < m[0].length; i++) {
          const cr = document.createRange();
          cr.setStart(n, m.index + i);
          cr.setEnd(n, m.index + i + 1);
          const rc = cr.getClientRects()[0];
          if (!rc) continue;
          const top = Math.round(rc.top);
          if (prevTop !== null && Math.abs(top - prevTop) > 2) {
            const before = m[0][i - 1];
            if (!SOFT.test(before) && !SOFT.test(m[0][i]))
              broken.push({ page: pi + 1, word: m[0], at: i });
            break;
          }
          prevTop = top;
        }
      }
    }
    // Text over text (different text nodes whose glyph boxes intersect).
    for (let i = 0; i < lines.length; i++)
      for (let j = i + 1; j < lines.length; j++) {
        const a = lines[i].b,
          c = lines[j].b;
        if (lines[i].node === lines[j].node) continue;
        const w = Math.min(a.right, c.right) - Math.max(a.left, c.left);
        const h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
        if (w > 3 && h > Math.min(a.height, c.height) * 0.45) {
          // Same line, adjacent inline runs touch but do not overlap by more than 3px.
          overlaps.push({
            page: pi + 1,
            a: lines[i].node.textContent.trim().slice(0, 30),
            b: lines[j].node.textContent.trim().slice(0, 30),
          });
          if (overlaps.length > 40) break;
        }
      }
    // Painted decoration (a filled shape or tinted box that is not part of the text's own
    // container) under or over body text. Frames and rules (borders only) are fine.
    const painted = (el) => {
      if (el instanceof SVGElement) {
        if (!/^(path|circle|rect|polygon|ellipse|line|polyline)$/.test(el.tagName)) return false;
        const s = getComputedStyle(el);
        return (
          (s.fill !== 'none' && parseFloat(s.fillOpacity) > 0.05) ||
          (s.stroke !== 'none' && parseFloat(s.strokeWidth) > 2)
        );
      }
      const s = getComputedStyle(el);
      const bg = s.backgroundColor;
      return (
        s.backgroundImage !== 'none' || (bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg))
      );
    };
    // Decorations ignore the pointer, so test by geometry: a painted decoration box (a circle is
    // tested as a circle) that holds the centre of a body text line.
    const arts = [...pg.querySelectorAll('.cv-decor *, [aria-hidden="true"], [data-deco]')].filter(
      (el) => !el.querySelector('*') && painted(el) && getComputedStyle(el).visibility !== 'hidden',
    );
    for (const el of arts) {
      const d = el.getBoundingClientRect();
      if (d.width < 12 || d.height < 12) continue;
      const round = getComputedStyle(el).borderRadius.startsWith('50%');
      const hit = lines.find(({ b, node }) => {
        if (el.contains(node) || node.parentElement.closest('.cv-top, .cv-foot')) return false;
        const x = b.left + b.width / 2,
          y = b.top + b.height / 2;
        for (const px of [b.left + 2, x, b.right - 2]) {
          if (round) {
            const rx = d.width / 2,
              ry = d.height / 2;
            const dx = (px - (d.left + rx)) / rx,
              dy = (y - (d.top + ry)) / ry;
            if (dx * dx + dy * dy < 1) return true;
          } else if (px > d.left && px < d.right && y > d.top && y < d.bottom) return true;
        }
        return false;
      });
      if (hit)
        deco.push({
          page: pi + 1,
          cls: String(el.getAttribute('class') || el.tagName).slice(0, 40),
          text: hit.node.textContent.trim().slice(0, 30),
        });
    }
    // How full each column is (blocks only; running header and footer excluded).
    const body = pg.querySelector('.cv-body');
    if (!body) return;
    const box = body.getBoundingClientRect();
    const cols = {};
    for (const col of body.children) {
      const blocks = [...col.querySelectorAll('[data-block]')];
      if (!blocks.length) {
        cols[col.className] = 0;
        continue;
      }
      const bottom = Math.max(...blocks.map((b) => b.getBoundingClientRect().bottom));
      cols[col.className] = Math.round(((bottom - box.top) / box.height) * 100);
    }
    fill.push(cols);
  });
  // Entries split across pages: points on each page. A job heading must keep at least two of its
  // points on the page it starts on, and the next page at least two (audit F-05 verification).
  const parts = new Map();
  pages.forEach((pg, i) => {
    for (const b of pg.querySelectorAll('[data-block][data-ref]')) {
      if (!b.classList.contains('b-entry') && !b.classList.contains('b-bullet')) continue;
      const ref = b.getAttribute('data-ref');
      const n = b.querySelectorAll('li').length;
      const list = parts.get(ref) || [];
      const last = list[list.length - 1];
      if (last && last.page === i + 1) last.points += n;
      else list.push({ page: i + 1, points: n });
      parts.set(ref, list);
    }
  });
  const splits = [];
  for (const [ref, list] of parts)
    if (list.length > 1 && list.some((x) => x.points < 2)) splits.push({ ref, parts: list });
  return { pages: pages.length, broken, overlaps, deco, fill, splits };
})();
