import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeMaxwell, openBB, openMaxwell } from './harness.mjs';
import { contentBounds, difference, freeze, sample } from './images.mjs';

const draws = (page) => page.evaluate(() => window.maxwellBrowserProbe.draws);
async function assertPaused(page) {
  await page.waitForTimeout(150);
  const before = await draws(page);
  await page.waitForTimeout(300);
  assert.equal(await draws(page), before, 'Hidden or closed scenes must stop drawing');
}

test('panel and page visibility pause rendering, and reopening releases old contexts', async () => {
  const { browser, page } = await openBB();
  try {
    for (let repetition = 0; repetition < 3; repetition++) {
      await openMaxwell(page);
      const before = await draws(page);
      await page.waitForFunction((value) => window.maxwellBrowserProbe.draws > value + 6, before);
      await freeze(page);
      const shown = await sample(page);
      await page.getByRole('button', { name: /^Hide right panel/ }).click();
      await assertPaused(page);
      await page.waitForTimeout(600);
      await page.getByRole('button', { name: /^Show right panel/ }).click();
      await page.waitForFunction(() => window.maxwellBrowserProbe.isHeld());
      const resumed = await sample(page);
      assert.ok(difference(shown, resumed) < 0.5, 'Hidden time must not change orientation');
      await page.evaluate(() => window.maxwellBrowserProbe.resume());
      // Override only the browser visibility boundary; this avoids headless
      // Chromium treating multiple automation tabs as simultaneously visible.
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await assertPaused(page);
      await page.evaluate(() => {
        delete document.visibilityState;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const hidden = await draws(page);
      await page.waitForFunction((value) => window.maxwellBrowserProbe.draws > value + 6, hidden);
      await closeMaxwell(page);
      await assertPaused(page);
      assert.equal(await page.locator('canvas').count(), 0);
      assert.equal(await page.evaluate(() => window.maxwellBrowserProbe.maxRenderCallbacksPerFrame), 1, 'Reopening must not accumulate concurrent render loops');
      assert.equal(await page.evaluate(() => window.maxwellBrowserProbe.contexts - window.maxwellBrowserProbe.lost), 0, 'Closed scenes must release their graphics contexts');
    }
  } finally { await browser.close(); }
});

test('the cat stays framed on resize and credits follow live host themes', async () => {
  const { browser, page } = await openBB();
  try {
    await openMaxwell(page);
    await page.waitForFunction(() => window.maxwellBrowserProbe.draws > 6);
    const light = await page.getByRole('region', { name: 'maxwell' }).evaluate((element) => getComputedStyle(element).backgroundColor);
    // BB's root .dark class is its live theme boundary. Do not alter plugin CSS.
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForTimeout(100);
    const dark = await page.getByRole('region', { name: 'maxwell' }).evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.notEqual(light, dark);
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 1100, height: 650 }, { width: 1600, height: 450 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(150);
      await freeze(page);
      for (let step = 0; step < 8; step++) {
        const image = await sample(page, 625);
        const bounds = contentBounds(image);
        assert.ok(bounds.pixels > 100);
        assert.ok(bounds.left > 2 && bounds.top > 2 && bounds.right < image.width - 3 && bounds.bottom < image.height - 3);
      }
      assert.equal(await page.getByRole('link', { name: 'CC BY 4.0' }).isVisible(), true);
      await page.evaluate(() => window.maxwellBrowserProbe.resume());
    }
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    assert.equal(await page.getByRole('region', { name: 'maxwell' }).evaluate((element) => getComputedStyle(element).backgroundColor), light);
  } finally { await browser.close(); }
});
