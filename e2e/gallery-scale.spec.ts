import { expect, test } from './support/test';

/**
 * Catalogue Part B: the gallery at 300 designs on a mid-range phone profile (390×844, CPU slowed
 * 4×). The first cards show in under 2 s, scrolling stays smooth, and live previews exist only for
 * cards on screen, so memory stays bounded.
 */
test.use({ as: 'visitor', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('300 cards: fast first cards, smooth scrolling, bounded previews and memory', async ({
  page,
  isMobile,
  browserName,
}, info) => {
  test.skip(info.project.name !== 'desktop' || browserName !== 'chromium', 'One run, Chromium');
  test.setTimeout(120_000);
  void isMobile;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Performance.enable');

  await page.goto('/templates?seed=300', { waitUntil: 'commit' });
  // Time from navigation start until the first two card images are painted.
  const firstCards = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const check = () => {
          const imgs = Array.from(
            document.querySelectorAll<HTMLImageElement>('[data-testid="design-grid"] li img'),
          ).slice(0, 2);
          if (imgs.length === 2 && imgs.every((i) => i.complete && i.naturalWidth > 0))
            resolve(performance.now());
          else requestAnimationFrame(check);
        };
        check();
      }),
  );
  console.log(`first cards after ${Math.round(firstCards)} ms`);
  expect(firstCards).toBeLessThan(2000);
  await expect(page.locator('[data-testid="design-grid"] > li')).toHaveCount(300);

  const heapStart = await heap();
  // Scroll the whole list like a person flicking through it, sampling frames and live previews.
  const result = await page.evaluate(async () => {
    const frames: number[] = [];
    let maxLive = 0;
    let last = performance.now();
    let running = true;
    const tick = (t: number) => {
      frames.push(t - last);
      last = t;
      maxLive = Math.max(maxLive, document.querySelectorAll('[data-live] iframe').length / 2);
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // Down to the bottom; stop when the page no longer moves (or after 400 steps).
    for (let i = 0, last = -1; i < 400 && window.scrollY !== last; i++) {
      last = window.scrollY;
      window.scrollBy(0, 300);
      await new Promise((r) => setTimeout(r, 120));
    }
    await new Promise((r) => setTimeout(r, 1500));
    running = false;
    const sorted = [...frames].sort((a, b) => a - b);
    return {
      p90: sorted[Math.floor(sorted.length * 0.9)] ?? 0,
      maxLive,
      liveAtEnd: document.querySelectorAll('[data-live]').length,
    };
  });
  const heapEnd = await heap();
  console.log(JSON.stringify({ ...result, heapStart, heapEnd }));
  // Smooth: 90% of frames within 50 ms even with the CPU slowed 4×.
  expect(result.p90).toBeLessThan(50);
  // Never more live previews than fit on the screen (2 per row, ~3 rows, plus the margin rows).
  expect(result.maxLive).toBeLessThanOrEqual(12);
  expect(result.liveAtEnd).toBeLessThanOrEqual(12);
  // Bounded memory: the heap after scrolling 300 cards stays under 150 MB.
  expect(heapEnd).toBeLessThan(150);

  async function heap() {
    const { metrics } = await cdp.send('Performance.getMetrics');
    const used = metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0;
    return Math.round(used / 1024 / 1024);
  }
});
