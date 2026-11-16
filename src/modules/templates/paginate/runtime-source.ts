/**
 * Pagination code that runs INSIDE every CV document — identically in the preview iframe and in
 * server-side Chromium — so preview pages and PDF pages are the same.
 *
 * It is kept as plain JavaScript source text (not a serialized TS function) so no bundler or
 * transpiler can inject helpers into it. `plan.ts` evaluates PLAN_PAGES_JS for unit tests, so the
 * algorithm tested is byte-for-byte the algorithm shipped. See docs/engineering/template-engine.md.
 */

/**
 * planPages(blocks, capacity) → { pages: number[][], overflow: number[] }
 * blocks: [{ height, keep: 'none' | 'with-next' | 'together' }]; capacity(pageIndex) → px.
 */
export const PLAN_PAGES_JS = String.raw`function planPages(blocks, capacity, wideFrom) {
  var EPS = 0.5;
  var pages = [[]];
  var overflow = [];
  var used = 0;
  var i = 0;
  // Pages from wideFrom on are full width (no side column): blocks may be shorter there.
  function h(k, p) {
    var b = blocks[k];
    return wideFrom !== undefined && p >= wideFrom && b.wide != null ? b.wide : b.height;
  }
  while (i < blocks.length) {
    var page = pages.length - 1;
    var j = i;
    var groupHeight = h(i, page);
    while (blocks[j].keep === 'with-next' && j + 1 < blocks.length) {
      j++;
      groupHeight += h(j, page);
    }
    var cap = capacity(page);
    var k;
    if (used + groupHeight <= cap + EPS) {
      for (k = i; k <= j; k++) pages[page].push(k);
      used += groupHeight;
      i = j + 1;
    } else if (pages[page].length === 0) {
      for (k = i; k <= j; k++) {
        var last = pages.length - 1;
        var hk = h(k, last);
        var need = hk;
        if (blocks[k].keep === 'with-next' && k + 1 <= j && h(k, last + 1) + h(k + 1, last + 1) <= capacity(last + 1) + EPS) {
          need = hk + h(k + 1, last);
        }
        if (pages[last].length > 0 && used + need > capacity(last) + EPS) {
          pages.push([]);
          used = 0;
        } else if (pages[last].length === 0 && need > capacity(last) + EPS && need <= capacity(last + 1) + EPS) {
          pages.push([]);
          used = 0;
        }
        last = pages.length - 1;
        hk = h(k, last);
        if (hk > capacity(last) + EPS) overflow.push(k);
        pages[last].push(k);
        used += hk;
      }
      i = j + 1;
    } else {
      pages.push([]);
      used = 0;
    }
  }
  return { pages: pages, overflow: overflow };
}`;

/**
 * Document contract (produced by build-document.tsx):
 *   <div data-cv-source>
 *     <div data-slot="header">…</div>      first-page header
 *     <div data-slot="running">…</div>     optional continuation-page header
 *     <div data-flow="main"><div data-block data-keep="…">…</div>…</div>
 *     <div data-flow="aside">…</div>       optional side column
 *   </div>
 *   <div data-cv-pages></div>
 * Result: window.__CV_READY__ = { pages, overflow, nearlyFits }, html[data-cv-ready], and a
 * postMessage { type: 'cv:ready', result } to the parent frame.
 */
export const RUNTIME_JS = String.raw`(function (planPages) {
  function el(tag, cls) {
    var e = document.createElement(tag);
    e.className = cls;
    return e;
  }
  var decorSource = null;
  function makePage(first, hasAside, hasThird) {
    var page = el('section', 'cv-page ' + (first ? 'cv-page--first' : 'cv-page--rest'));
    if (decorSource) {
      var decor = el('div', 'cv-decor');
      decor.setAttribute('aria-hidden', 'true');
      decor.innerHTML = decorSource.innerHTML;
      page.appendChild(decor);
    }
    var top = el('div', first ? 'cv-top cv-top--header' : 'cv-top cv-top--running');
    var body = el('div', 'cv-body');
    var main = el('div', 'cv-main');
    body.appendChild(main);
    var aside = null;
    if (hasAside) {
      aside = el('div', 'cv-aside');
      body.appendChild(aside);
    }
    var third = null;
    if (hasThird) {
      third = el('div', 'cv-third');
      body.appendChild(third);
    }
    page.appendChild(top);
    page.appendChild(body);
    page.appendChild(el('div', 'cv-foot'));
    return { page: page, main: main, aside: aside, third: third, top: top };
  }
  // Names and contact details never break inside a word: a hyphenated part that doesn't fit its
  // line makes the text smaller, step by step (to 55% for a name, 80% for contact details), and only
  // then may the browser break it. Breaks after a hyphen, @, dot or slash are fine.
  var FIT_SELECTOR = '.cv-top h1, [data-fit-name], [data-fit], .cv-contact-text';
  function brokenPart(el) {
    // Measured against the column too: a line that may not wrap (an email) grows its own box.
    var col = el.closest('.cv-aside, .cv-third, .cv-main, .cv-top, .cv-page');
    var right = Math.min(el.getBoundingClientRect().right, col ? col.getBoundingClientRect().right : Infinity) + 1;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = walker.nextNode())) {
      var t = n.textContent || '';
      var re = /[^\s\-@./]+[\-@./]?/g, m;
      while ((m = re.exec(t))) {
        if (m[0].length < 3) continue;
        var r = document.createRange();
        r.setStart(n, m.index);
        r.setEnd(n, m.index + m[0].length);
        var rects = r.getClientRects();
        var top = null;
        for (var i = 0; i < rects.length; i++) {
          if (rects[i].width < 0.5) continue;
          if (top !== null && Math.abs(rects[i].top - top) > 2) return true;
          if (rects[i].right > right) return true;
          top = rects[i].top;
        }
      }
    }
    return false;
  }
  // Break hints after the separators of an address that can't fit on one line.
  function addBreakHints(el) {
    if (el.querySelector('wbr')) return;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (var i = 0; i < nodes.length; i++) {
      var parts = (nodes[i].textContent || '').split(/(?<=[@\/.\-_])(?=[^\s])/);
      if (parts.length < 2) continue;
      var frag = document.createDocumentFragment();
      for (var k = 0; k < parts.length; k++) {
        frag.appendChild(document.createTextNode(parts[k]));
        if (k < parts.length - 1) frag.appendChild(document.createElement('wbr'));
      }
      nodes[i].parentNode.replaceChild(frag, nodes[i]);
    }
  }
  function fitWords(scope, selector) {
    var els = scope.querySelectorAll(selector || FIT_SELECTOR);
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      e.style.fontSize = '';
      e.classList.remove('cv-may-wrap');
      if (!brokenPart(e)) continue;
      var base = parseFloat(getComputedStyle(e).fontSize);
      var floor = e.classList.contains('cv-contact-text') ? 0.8 : e.hasAttribute('data-fit') ? 0.72 : 0.55;
      for (var k = 0.94; k >= floor; k -= 0.05) {
        e.style.fontSize = (base * k).toFixed(2) + 'px';
        if (!brokenPart(e)) break;
      }
      // Still too wide at the smallest size: an unbroken email would run off the column, so it
      // may now break at its separators (and the ATS check says so).
      if (brokenPart(e) && getComputedStyle(e).whiteSpace === 'nowrap') {
        e.classList.add('cv-may-wrap');
        addBreakHints(e);
      }
    }
  }
  // The header is copied into a measuring page; its fitted sizes are copied back by position.
  var FIT_COPY = 'h1, [data-fit-name], [data-fit], .cv-contact-text';
  function copyFit(from, to) {
    var a = from.querySelectorAll(FIT_COPY), b = to.querySelectorAll(FIT_COPY);
    for (var i = 0; i < a.length && i < b.length; i++) {
      b[i].style.fontSize = a[i].style.fontSize;
      b[i].classList.toggle('cv-may-wrap', a[i].classList.contains('cv-may-wrap'));
      if (a[i].classList.contains('cv-may-wrap')) addBreakHints(b[i]);
    }
  }
  function blocksOf(flow) {
    return flow ? Array.prototype.slice.call(flow.querySelectorAll(':scope > [data-block]')) : [];
  }
  function measureFlow(blocks, slot) {
    var out = [];
    if (!slot) return out;
    var i;
    for (i = 0; i < blocks.length; i++) slot.appendChild(blocks[i]);
    fitWords(slot);
    for (i = 0; i < blocks.length; i++) {
      var k = blocks[i].getAttribute('data-keep');
      out.push({
        height: blocks[i].getBoundingClientRect().height,
        keep: k === 'with-next' ? 'with-next' : k === 'together' ? 'together' : 'none'
      });
    }
    return out;
  }
  var state = null;
  // Capture the source once; later runs move the same nodes back before laying out again.
  function capture() {
    if (state) return state;
    var source = document.querySelector('[data-cv-source]');
    var target = document.querySelector('[data-cv-pages]');
    if (!source || !target) return null;
    var mainFlow = source.querySelector('[data-flow="main"]');
    var asideFlow = source.querySelector('[data-flow="aside"]');
    var thirdFlow = source.querySelector('[data-flow="third"]');
    state = {
      source: source,
      target: target,
      header: source.querySelector('[data-slot="header"]'),
      running: source.querySelector('[data-slot="running"]'),
      mainFlow: mainFlow,
      asideFlow: asideFlow,
      mainBlocks: blocksOf(mainFlow),
      asideBlocks: blocksOf(asideFlow),
      thirdFlow: thirdFlow,
      thirdBlocks: blocksOf(thirdFlow)
    };
    decorSource = source.querySelector('[data-slot="decor"]');
    return state;
  }
  function restore(st) {
    var i;
    if (st.header) st.source.insertBefore(st.header, st.source.firstChild);
    for (i = 0; i < st.mainBlocks.length; i++) st.mainFlow.appendChild(st.mainBlocks[i]);
    if (st.asideFlow) for (i = 0; i < st.asideBlocks.length; i++) st.asideFlow.appendChild(st.asideBlocks[i]);
    if (st.thirdFlow) for (i = 0; i < st.thirdBlocks.length; i++) st.thirdFlow.appendChild(st.thirdBlocks[i]);
    st.target.innerHTML = '';
    st.source.style.display = '';
  }
  function sum(blocks, idx, wide) {
    var h = 0;
    for (var i = 0; i < idx.length; i++) {
      var b = blocks[idx[i]];
      h += wide && b.wide != null ? b.wide : b.height;
    }
    return h;
  }

  // reserve: px kept free at the bottom of every column (used when trying a tighter fit, so a
  // fit that only just works in one browser can't spill onto another page in a different one).
  function layout(st, reserve) {
    var R = reserve || 0;
    restore(st);
    var header = st.header;
    var running = st.running;
    var mainBlocks = st.mainBlocks;
    var asideBlocks = st.asideBlocks;
    var thirdBlocks = st.thirdBlocks;
    var hasAside = asideBlocks.length > 0;
    var hasThird = thirdBlocks.length > 0;
    // "keep-columns" designs keep the side column(s) on every page instead of going full width.
    var keepColumns = document.documentElement.hasAttribute('data-keep-columns');
    var target = st.target;
    document.documentElement.classList.toggle('cv-has-aside', hasAside);
    document.documentElement.classList.toggle('cv-has-third', hasThird);

    var measure = el('div', 'cv-measure');
    target.appendChild(measure);
    var p1 = makePage(true, hasAside, hasThird);
    var p2 = makePage(false, hasAside, hasThird);
    if (header) p1.top.appendChild(header.cloneNode(true));
    if (running) p2.top.appendChild(running.cloneNode(true));
    measure.appendChild(p1.page);
    measure.appendChild(p2.page);
    fitWords(p1.top);
    if (header) copyFit(p1.top, header);
    var capMain1 = p1.main.clientHeight - R;
    var capMainN = p2.main.clientHeight - R;
    var capAside1 = p1.aside ? p1.aside.clientHeight - R : 0;
    var capAsideN = p2.aside ? p2.aside.clientHeight - R : 0;
    var capThird1 = p1.third ? p1.third.clientHeight - R : 0;
    var capThirdN = p2.third ? p2.third.clientHeight - R : 0;

    // Side column first: it decides from which page on the main column can use the full width.
    var asideMeasure = hasAside ? measureFlow(asideBlocks, p2.aside) : [];
    var asidePlan = hasAside
      ? planPages(asideMeasure, function (p) { return p === 0 ? capAside1 : capAsideN; })
      : { pages: [[]], overflow: [] };
    var thirdMeasure = hasThird ? measureFlow(thirdBlocks, p2.third) : [];
    var thirdPlan = hasThird
      ? planPages(thirdMeasure, function (p) { return p === 0 ? capThird1 : capThirdN; })
      : { pages: [[]], overflow: [] };
    var hasSide = hasAside || hasThird;
    var wideFrom;
    var capMainWide = capMainN;
    var mainMeasure;
    if (hasSide && !keepColumns) {
      wideFrom = Math.max(hasAside ? asidePlan.pages.length : 1, hasThird ? thirdPlan.pages.length : 1);
      var p3 = makePage(false, false, false);
      p3.page.className += ' cv-page--wide';
      if (running) p3.top.appendChild(running.cloneNode(true));
      measure.appendChild(p3.page);
      capMainWide = p3.main.clientHeight - R;
      var wide = measureFlow(mainBlocks, p3.main);
      mainMeasure = measureFlow(mainBlocks, p2.main);
      for (var q = 0; q < mainMeasure.length; q++) mainMeasure[q].wide = wide[q].height;
    } else {
      mainMeasure = measureFlow(mainBlocks, p2.main);
    }
    function capMain(p) { return p === 0 ? capMain1 : wideFrom !== undefined && p >= wideFrom ? capMainWide : capMainN; }
    var mainPlan = planPages(mainMeasure, capMain, wideFrom);

    var total = Math.max(mainPlan.pages.length, asidePlan.pages.length, thirdPlan.pages.length);
    target.removeChild(measure);
    for (var p = 0; p < total; p++) {
      var isWide = hasSide && wideFrom !== undefined && p > 0 && p >= wideFrom;
      var pg = makePage(p === 0, hasAside && !isWide, hasThird && !isWide);
      if (isWide) pg.page.className += ' cv-page--wide';
      if (p === 0 && header) pg.top.appendChild(header);
      else if (p > 0 && running) pg.top.appendChild(running.cloneNode(true));
      var mi = mainPlan.pages[p] || [];
      var k;
      for (k = 0; k < mi.length; k++) pg.main.appendChild(mainBlocks[mi[k]]);
      var ai = asidePlan.pages[p] || [];
      if (pg.aside) for (k = 0; k < ai.length; k++) pg.aside.appendChild(asideBlocks[ai[k]]);
      var ti = thirdPlan.pages[p] || [];
      if (pg.third) for (k = 0; k < ti.length; k++) pg.third.appendChild(thirdBlocks[ti[k]]);
      if (total > 1) pg.page.querySelector('.cv-foot').textContent = (p + 1) + ' / ' + total;
      target.appendChild(pg.page);
      // Height of side-column content, for designs whose column background should end with it.
      if (pg.aside) pg.page.style.setProperty('--aside-h', sum(asideMeasure, ai, false) + 'px');
    }
    st.source.style.display = 'none';

    // How full is the last page? (largest of its columns)
    var lp = total - 1;
    var fillMain = lp < mainPlan.pages.length ? sum(mainMeasure, mainPlan.pages[lp], wideFrom !== undefined && lp >= wideFrom) / capMain(lp) : 0;
    var fillAside = hasAside && lp < asidePlan.pages.length ? sum(asideMeasure, asidePlan.pages[lp], false) / (lp === 0 ? capAside1 : capAsideN) : 0;
    var fillThird = hasThird && lp < thirdPlan.pages.length ? sum(thirdMeasure, thirdPlan.pages[lp], false) / (lp === 0 ? capThird1 : capThirdN) : 0;
    return {
      pages: total,
      overflow: mainPlan.overflow.length + asidePlan.overflow.length + thirdPlan.overflow.length,
      lastFill: Math.max(fillMain, fillAside, fillThird)
    };
  }

  // Bounded "fit" steps: slightly tighter spacing (never smaller text) to avoid a near-empty last page.
  var FIT_STEPS = [
    { gap: 0.8, margin: 0.92, lh: 0.03 },
    { gap: 0.62, margin: 0.84, lh: 0.06 },
    // Only for designs that declare --can-compact: a compact header (smaller banner, no key numbers).
    { gap: 0.5, margin: 0.8, lh: 0.07, compact: true },
    // Last: text 5% smaller, never below 9.5 pt (the floor is in the CSS), so a short last page
    // folds back instead of holding one or two items (audit F-05).
    { gap: 0.62, margin: 0.84, lh: 0.06, fs: 0.95 },
    { gap: 0.5, margin: 0.8, lh: 0.07, fs: 0.95, compact: true }
  ];
  var LAST_PAGE_MAX_FILL = 0.3;
  // The other way (audit D-03): a one-page CV that fills less than this opens up, step by step,
  // while it still fits one page with a line to spare and stays below GROW_TARGET full. Bounded:
  // at most 2.6× the spacing, +0.15 line height and 4% larger text (larger text made employer
  // names wrap in narrow columns, so they read back badly).
  var GROW_BELOW = 0.7;
  var GROW_TARGET = 0.92;
  var GROW_STEPS = [
    { gap: 1.25, margin: 1, lh: -0.03 },
    { gap: 1.5, margin: 1, lh: -0.06, fs: 1.02 },
    { gap: 1.8, margin: 1, lh: -0.09, fs: 1.04 },
    { gap: 2.2, margin: 1, lh: -0.12, fs: 1.04 },
    { gap: 2.6, margin: 1, lh: -0.15, fs: 1.04 }
  ];
  // A tighter fit is only accepted with about one line to spare on every page (see layout()).
  var FIT_RESERVE = 14;
  function applyFit(f) {
    var st = document.documentElement.style;
    st.setProperty('--fit-gap', f ? String(f.gap) : '1');
    st.setProperty('--fit-margin', f ? String(f.margin) : '1');
    st.setProperty('--fit-lh', f ? String(f.lh) : '0');
    st.setProperty('--fit-fs', f && f.fs ? String(f.fs) : '1');
    if (f && f.compact) document.documentElement.setAttribute('data-fit-compact', '');
    else document.documentElement.removeAttribute('data-fit-compact');
  }
  function canCompact() {
    return getComputedStyle(document.documentElement).getPropertyValue('--can-compact').trim() === '1';
  }

  // Page art never sits under body text (audit F-09): a painted shape that a line of text crosses is
  // hidden on that page. Header art is designed with its text, so it is left alone.
  function clearArt() {
    var pages = document.querySelectorAll('[data-cv-pages] .cv-page');
    for (var p = 0; p < pages.length; p++) {
      var pg = pages[p];
      var arts = pg.querySelectorAll('.cv-decor *, [data-deco], .cv-body [aria-hidden="true"], .cv-aside [aria-hidden="true"]');
      if (!arts.length) continue;
      var lines = [];
      var walker = document.createTreeWalker(pg.querySelector('.cv-body') || pg, NodeFilter.SHOW_TEXT);
      var n;
      while ((n = walker.nextNode())) {
        if (!(n.textContent || '').trim()) continue;
        var r = document.createRange();
        r.selectNodeContents(n);
        var rs = r.getClientRects();
        for (var i = 0; i < rs.length; i++) if (rs[i].width > 1) lines.push({ b: rs[i], node: n });
      }
      for (var a = 0; a < arts.length; a++) {
        var el = arts[a];
        if (el.querySelector('*') && !(el instanceof SVGElement)) continue;
        var cs = getComputedStyle(el);
        if (cs.position !== 'absolute' && !(el instanceof SVGElement)) continue;
        var d = el.getBoundingClientRect();
        if (d.width < 12 || d.height < 12) continue;
        var round = cs.borderRadius.indexOf('50%') === 0;
        for (var j = 0; j < lines.length; j++) {
          var b = lines[j].b;
          if (el.contains(lines[j].node)) continue;
          var y = b.top + b.height / 2, hit = false;
          var xs = [b.left + 2, b.left + b.width / 2, b.right - 2];
          for (var q = 0; q < 3 && !hit; q++) {
            if (round) {
              var rx = d.width / 2, ry = d.height / 2, dx = (xs[q] - d.left - rx) / rx, dy = (y - d.top - ry) / ry;
              hit = dx * dx + dy * dy < 1;
            } else hit = xs[q] > d.left && xs[q] < d.right && y > d.top && y < d.bottom;
          }
          if (hit) { (el.closest('svg') || el).style.visibility = 'hidden'; break; }
        }
      }
    }
  }

  // Section numbers ("01", "02"…) are real text, counted in reading order over the laid-out pages
  // (a CSS counter would be invisible to the PDF furniture pass below).
  function numberSections() {
    // Each column counts on its own (main column 01, 02…; side column 01, 02…).
    var nums = document.querySelectorAll('[data-cv-pages] [data-num]');
    var count = { main: 0, aside: 0, third: 0 };
    for (var i = 0; i < nums.length; i++) {
      if (getComputedStyle(nums[i]).display === 'none') continue;
      var col = nums[i].closest('.cv-aside') ? 'aside' : nums[i].closest('.cv-third') ? 'third' : 'main';
      var k = ++count[col];
      nums[i].textContent = k < 10 ? '0' + k : String(k);
    }
  }

  // PDF only (called by the exporter, audit F-14): page numbers, running headers, monograms and
  // section numbers are drawn as pictures and their text hidden, so they look the same but never
  // enter the PDF text an ATS reads. Layout is untouched: the text stays, invisible, in place.
  var FURNITURE = '.cv-foot, .cv-top--running, [data-num], .g-mono, .h-monogram, .cv-portrait--initials';
  function flattenFurniture() {
    // 3× (about 290 dpi) is sharp in print; 4× doubled the file size (verification round).
    var SCALE = 3;
    var roots = document.querySelectorAll('[data-cv-pages] .cv-page');
    var hide = [];
    var pending = [];
    for (var p = 0; p < roots.length; p++) {
      var pg = roots[p];
      var pr = pg.getBoundingClientRect();
      var items = pg.querySelectorAll(FURNITURE);
      for (var f = 0; f < items.length; f++) {
        var root = items[f];
        if (root.parentElement && root.parentElement.closest(FURNITURE)) continue;
        var rr = root.getBoundingClientRect();
        if (rr.width < 1 || rr.height < 1) continue;
        var pad = 6;
        var ox = rr.left - pad, oy = rr.top - pad, w = rr.width + pad * 2, h = rr.height + pad * 2;
        var cv = document.createElement('canvas');
        cv.width = Math.ceil(w * SCALE);
        cv.height = Math.ceil(h * SCALE);
        cv.setAttribute('aria-hidden', 'true');
        cv.style.cssText = 'position:absolute;pointer-events:none;z-index:5;left:' + (ox - pr.left) + 'px;top:' + (oy - pr.top) + 'px;width:' + w + 'px;height:' + h + 'px';
        var ctx = cv.getContext('2d');
        if (!ctx) continue;
        ctx.scale(SCALE, SCALE);
        ctx.translate(-ox, -oy);
        ctx.textBaseline = 'alphabetic';
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        var n, drew = false, bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
        while ((n = walker.nextNode())) {
          var text = n.textContent || '';
          if (!text.trim()) continue;
          var host = n.parentElement;
          var cs = getComputedStyle(host);
          if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          var alpha = 1;
          for (var a = host; a && a !== pg; a = a.parentElement) alpha *= parseFloat(getComputedStyle(a).opacity) || 0;
          if (alpha <= 0) continue;
          ctx.globalAlpha = alpha;
          ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
          try { ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing; } catch (e) {}
          ctx.fillStyle = cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color && cs.webkitTextFillColor !== 'rgba(0, 0, 0, 0)' ? cs.webkitTextFillColor : cs.color;
          var tt = cs.textTransform;
          var re = /\S+/g, m;
          while ((m = re.exec(text))) {
            var range = document.createRange();
            range.setStart(n, m.index);
            range.setEnd(n, m.index + m[0].length);
            var rects = range.getClientRects();
            var parts = rects.length === 1 ? [{ s: m.index, e: m.index + m[0].length, r: rects[0] }] : [];
            if (rects.length > 1)
              for (var c = m.index; c < m.index + m[0].length; c++) {
                var cr = document.createRange();
                cr.setStart(n, c);
                cr.setEnd(n, c + 1);
                var one = cr.getClientRects()[0];
                if (one) parts.push({ s: c, e: c + 1, r: one });
              }
            for (var q = 0; q < parts.length; q++) {
              var word = text.slice(parts[q].s, parts[q].e);
              if (tt === 'uppercase') word = word.toUpperCase();
              else if (tt === 'lowercase') word = word.toLowerCase();
              else if (tt === 'capitalize' && parts[q].s === m.index) word = word.charAt(0).toUpperCase() + word.slice(1);
              var mt = ctx.measureText(word);
              var asc = mt.fontBoundingBoxAscent, desc = mt.fontBoundingBoxDescent;
              var r = parts[q].r;
              ctx.fillText(word, r.left, r.top + (r.height - asc - desc) / 2 + asc);
              drew = true;
              bx0 = Math.min(bx0, r.left - 1); by0 = Math.min(by0, r.top - 1);
              bx1 = Math.max(bx1, r.left + mt.width + 2); by1 = Math.max(by1, r.bottom + 1);
            }
          }
          hide.push(n);
        }
        if (!drew) continue;
        // Only the inked part, as an <img>: a running header that is the same on every page then
        // has the same source, and the PDF stores it once.
        var cx0 = Math.max(0, Math.floor((bx0 - ox) * SCALE)), cy0 = Math.max(0, Math.floor((by0 - oy) * SCALE));
        var cw = Math.min(cv.width, Math.ceil((bx1 - ox) * SCALE)) - cx0, ch = Math.min(cv.height, Math.ceil((by1 - oy) * SCALE)) - cy0;
        if (cw < 1 || ch < 1) continue;
        var out = document.createElement('canvas');
        out.width = cw;
        out.height = ch;
        out.getContext('2d').drawImage(cv, cx0, cy0, cw, ch, 0, 0, cw, ch);
        var img = document.createElement('img');
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.setAttribute('role', 'presentation');
        img.src = out.toDataURL('image/png');
        img.style.cssText = 'position:absolute;pointer-events:none;z-index:5;left:' + (ox + cx0 / SCALE - pr.left) + 'px;top:' + (oy + cy0 / SCALE - pr.top) + 'px;width:' + cw / SCALE + 'px;height:' + ch / SCALE + 'px';
        pg.appendChild(img);
        pending.push(img);
      }
    }
    for (var k = 0; k < hide.length; k++) {
      var span = document.createElement('span');
      span.style.visibility = 'hidden';
      hide[k].parentNode.insertBefore(span, hide[k]);
      span.appendChild(hide[k]);
    }
    // Resolves once every picture is decoded, so the PDF never prints a blank one.
    return Promise.all(
      pending.map(function (im) {
        return im.decode ? im.decode().catch(function () {}) : null;
      })
    ).then(function () {
      return hide.length;
    });
  }
  window.__CV_FLATTEN__ = flattenFurniture;

  // Centred contact lines (Heritage, Halo, centred headers) can't clip the separator of a wrapped
  // line at the left edge, so the item that starts each line drops its separator here (verification
  // round, observation 4). Repeated until stable, since a narrower item can change the wrapping.
  function tidyContactLines() {
    var lists = document.querySelectorAll('[data-cv-pages] .cv-contacts');
    for (var i = 0; i < lists.length; i++) {
      var ul = lists[i];
      var cs = getComputedStyle(ul);
      if (cs.display !== 'flex' || cs.flexDirection === 'column' || parseFloat(cs.marginLeft) < 0) continue;
      var items = ul.querySelectorAll(':scope > .cv-contact');
      for (var pass = 0; pass < 3; pass++) {
        var changed = false, prevTop = null;
        for (var k = 0; k < items.length; k++) {
          var top = items[k].offsetTop;
          var first = prevTop === null || top > prevTop + 2;
          prevTop = top;
          if (first !== items[k].classList.contains('cv-contact--line-start')) {
            items[k].classList.toggle('cv-contact--line-start', first);
            changed = true;
          }
        }
        if (!changed) break;
      }
    }
  }

  // Where the first entry starts on page one, as a share of the page height.
  function firstEntryAt() {
    var pg = document.querySelector('[data-cv-pages] .cv-page');
    var e = pg && pg.querySelector('.b-entry');
    if (!e) return 0;
    var pr = pg.getBoundingClientRect();
    return (e.getBoundingClientRect().top - pr.top) / pr.height;
  }

  // Larger text must never break a word (the side columns are narrow).
  function wordsBroken() {
    var blocks = document.querySelectorAll('[data-cv-pages] [data-block]');
    for (var i = 0; i < blocks.length; i++) if (brokenPart(blocks[i])) return true;
    return false;
  }

  function paginate() {
    var st = capture();
    if (!st) return;
    applyFit(null);
    var r = layout(st);
    var fitted = 0;
    // Two pages that could be one are worth trying a little harder (gap audit G-06: a graduate CV
    // with a third of page 2 used stayed on two pages).
    if (r.pages > 1 && r.lastFill < (r.pages === 2 ? 0.4 : LAST_PAGE_MAX_FILL)) {
      var compactOk = canCompact();
      for (var i = 0; i < FIT_STEPS.length; i++) {
        if (FIT_STEPS[i].compact && !compactOk) continue;
        applyFit(FIT_STEPS[i]);
        var t = layout(st, FIT_RESERVE);
        if (t.pages < r.pages && t.overflow === 0) {
          r = t;
          fitted = i + 1;
          break;
        }
      }
      if (!fitted) {
        applyFit(null);
        r = layout(st);
      }
    }
    var grown = 0;
    if (r.pages === 1 && r.overflow === 0 && r.lastFill < GROW_BELOW && !document.documentElement.hasAttribute('data-no-grow')) {
      // The first job stays in the top 40% of page one (where a reader looks first), or no lower
      // than it already was.
      var entryLimit = Math.max(0.4, firstEntryAt());
      for (var g = 0; g < GROW_STEPS.length; g++) {
        applyFit(GROW_STEPS[g]);
        var u = layout(st, FIT_RESERVE);
        if (u.pages !== 1 || u.overflow !== 0 || u.lastFill > GROW_TARGET || firstEntryAt() > entryLimit || wordsBroken()) break;
        grown = g + 1;
      }
      applyFit(grown ? GROW_STEPS[grown - 1] : null);
      r = layout(st);
    }
    numberSections();
    // Contact details placed outside the measured blocks (side-column contact boxes) get the same
    // fit as the rest: an email shrinks to stay on one line (gap audit G-02).
    var pagesEl = document.querySelector('[data-cv-pages]');
    if (pagesEl) fitWords(pagesEl, '.cv-contact--email .cv-contact-text, .cv-contact--phone .cv-contact-text');
    tidyContactLines();
    clearArt();
    var result = {
      pages: r.pages,
      overflow: r.overflow,
      fitted: fitted,
      grown: grown,
      nearlyFits: r.pages > 1 && r.lastFill < 0.25
    };
    window.__CV_READY__ = result;
    document.documentElement.setAttribute('data-cv-ready', String(r.pages));
    try {
      if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'cv:ready', result: result }, '*');
    } catch (e) {}
  }

  // Drag on the page (spec §9.1), switched on by the editor (cv:enable-drag): a section by its
  // heading, an entry by its first block, dropped before or after another of the same kind.
  // The editor makes the move (one undo step); the page is rebuilt from the document.
  var dragOn = false, drag = null, dragged = false, marker = null;
  function dragTargets(d) {
    if (d.kind === 'sec') return Array.prototype.slice.call(document.querySelectorAll('[data-cv-pages] [data-sec]'));
    var sec = d.ref.split('/')[0];
    return Array.prototype.slice.call(document.querySelectorAll('[data-cv-pages] .b-entry[data-ref^="' + sec + '/"]'));
  }
  function nearest(d, x, y) {
    var best = null, dist = 1e9;
    dragTargets(d).forEach(function (el) {
      var key = d.kind === 'sec' ? el.getAttribute('data-sec') : el.getAttribute('data-ref');
      if (key === d.ref) return;
      var r = el.getBoundingClientRect();
      var mid = r.top + r.height / 2;
      var dd = Math.abs(y - mid) + (x < r.left || x > r.right ? 400 : 0);
      if (dd < dist) { dist = dd; best = { el: el, key: key, after: y > mid, r: r }; }
    });
    return dist < 300 ? best : null;
  }
  document.addEventListener('pointerdown', function (ev) {
    if (!dragOn || ev.button !== 0) return;
    var t = ev.target;
    if (!t || !t.closest || t.isContentEditable) return;
    var sec = t.closest('[data-sec]');
    var ent = sec ? null : t.closest('.b-entry[data-ref]');
    if (!sec && !ent) return;
    drag = sec ? { kind: 'sec', ref: sec.getAttribute('data-sec'), x: ev.clientX, y: ev.clientY, active: false }
               : { kind: 'item', ref: ent.getAttribute('data-ref'), x: ev.clientX, y: ev.clientY, active: false };
  });
  document.addEventListener('pointermove', function (ev) {
    if (!drag) return;
    if (!drag.active && Math.abs(ev.clientY - drag.y) + Math.abs(ev.clientX - drag.x) < 10) return;
    if (!drag.active) {
      var gs = window.getSelection && window.getSelection();
      if (gs) gs.removeAllRanges();
      document.body.style.userSelect = 'none';
    }
    drag.active = true;
    ev.preventDefault();
    document.documentElement.style.cursor = 'grabbing';
    var n = nearest(drag, ev.clientX, ev.clientY);
    drag.target = n;
    if (!marker) {
      marker = document.createElement('div');
      marker.setAttribute('data-cv-drop', '');
      marker.style.cssText = 'position:fixed;height:3px;background:#1e5a55;border-radius:2px;pointer-events:none;z-index:99';
      document.body.appendChild(marker);
    }
    if (n) {
      marker.style.display = 'block';
      marker.style.left = n.r.left + 'px';
      marker.style.width = n.r.width + 'px';
      marker.style.top = (n.after ? n.r.bottom : n.r.top) - 1 + 'px';
    } else marker.style.display = 'none';
  });
  document.addEventListener('pointerup', function () {
    if (!drag) return;
    var d = drag;
    drag = null;
    document.documentElement.style.cursor = '';
    document.body.style.userSelect = '';
    if (marker) { marker.remove(); marker = null; }
    if (!d.active) return;
    dragged = true;
    if (d.target)
      window.parent.postMessage({ type: 'cv:move', kind: d.kind, ref: d.ref, to: d.target.key, after: d.target.after }, '*');
  });

  // Click: jump to the field. The clicked element's own text goes with it, so the editor can offer
  // to edit it in place (cv:edit) when that text is exactly one field.
  var editSeq = 0;
  document.addEventListener('click', function (ev) {
    if (dragged) { dragged = false; ev.preventDefault(); return; }
    var t = ev.target;
    if (t && t.closest && t.closest('a')) ev.preventDefault();
    if (t && t.isContentEditable) return;
    var ref = t && t.closest ? t.closest('[data-ref]') : null;
    if (ref && window.parent !== window) {
      var leaf = t && t.nodeType === 1 && !t.querySelector('p,li,div,h1,h2,h3') ? t : null;
      var token = '';
      if (leaf) {
        token = 'e' + ++editSeq;
        leaf.setAttribute('data-cv-edit', token);
      }
      window.parent.postMessage(
        {
          type: 'cv:select',
          ref: ref.getAttribute('data-ref'),
          text: leaf ? leaf.textContent : '',
          token: token
        },
        '*'
      );
    }
  });
  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (ev.source === window.parent && d && d.type === 'cv:enable-drag') { dragOn = true; return; }
    if (ev.source !== window.parent || !d || d.type !== 'cv:edit') return;
    var el = document.querySelector('[data-cv-edit="' + d.token + '"]');
    if (!el) return;
    var original = el.textContent;
    try { el.contentEditable = 'plaintext-only'; } catch (e) { el.contentEditable = 'true'; }
    if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-label', 'Edit this text');
    el.style.outline = '2px solid #1e5a55';
    el.style.outlineOffset = '2px';
    el.style.borderRadius = '2px';
    el.focus();
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    var sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
    var done = false;
    function finish(keep) {
      if (done) return;
      done = true;
      var text = keep ? el.textContent : original;
      if (!keep) el.textContent = original;
      el.removeAttribute('contenteditable');
      el.removeAttribute('role');
      el.removeAttribute('aria-label');
      el.style.outline = '';
      window.parent.postMessage({ type: 'cv:edit-done', ref: d.ref, original: original, text: text, changed: keep && text !== original }, '*');
    }
    el.addEventListener('keydown', function (k) {
      if (k.key === 'Enter' && !k.shiftKey) { k.preventDefault(); el.blur(); }
      else if (k.key === 'Escape') { k.preventDefault(); finish(false); el.blur(); }
    });
    el.addEventListener('blur', function () { finish(true); }, { once: true });
  });

  window.__CV_PAGINATE__ = paginate;
  var fonts = document.fonts;
  if (fonts && fonts.ready) {
    var loads = [];
    fonts.forEach(function (f) { loads.push(f.load().catch(function () { return null; })); });
    Promise.all(loads).then(function () { return fonts.ready; }).then(paginate, paginate);
  } else {
    paginate();
  }
})(${PLAN_PAGES_JS});`;
