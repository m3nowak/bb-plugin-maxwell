import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBB, openMaxwell } from './harness.mjs';

test('Actions opens the locally bundled Maxwell beside the new-thread composer', async () => {
  const { browser, page } = await openBB();
  try {
    await openMaxwell(page);
    await page.getByText('Loading Maxwell').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('canvas').count(), 1);
    assert.equal(await page.getByRole('link', { name: 'bean(alwayshasbean)' }).getAttribute('href'), 'https://sketchfab.com/alwayshasbean');
    assert.equal(await page.getByRole('link', { name: 'CC BY 4.0' }).getAttribute('href'), 'https://creativecommons.org/licenses/by/4.0/');
    assert.equal(await page.getByRole('alert').count(), 0);
  } finally { await browser.close(); }
});

import { contentBounds, difference, freeze, sample } from './images.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

test('rendered rotation is 24 rpm with a 20-cycle bob, including reduced motion', async () => {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const { browser, page } = await openBB({ reducedMotion });
    try {
      const externalRequests = [];
      await page.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (/^https?:$/.test(url.protocol) && url.origin !== new URL(page.url()).origin) {
          externalRequests.push(url.href);
          return route.abort();
        }
        return route.continue();
      });
      await openMaxwell(page);
      await page.waitForFunction(() => window.maxwellBrowserProbe.draws > 6);
      await freeze(page);
      // Pick a point one second into a bob cycle. The bob has the same
      // height 2.5 seconds later, isolating a complete rotation in pixels.
      const elapsed = await page.evaluate(() => window.maxwellBrowserProbe.elapsedRenderingTime());
      const start = 1000 + Math.ceil(Math.max(0, elapsed - 1000) / 3000) * 3000;
      const initial = await sample(page, start - elapsed);
      const quarter = await sample(page, 625);
      const half = await sample(page, 625);
      const threeQuarters = await sample(page, 625);
      const full = await sample(page, 625);
      assert.ok(difference(initial, quarter) > 1, 'A quarter turn must visibly change the cat');
      assert.ok(difference(initial, half) > 1, 'A half turn must show another view');
      assert.ok(difference(initial, full) < 0.5, 'The rendered cat must return after exactly 2.5 seconds at the same bob height');
      for (const image of [initial, quarter, half, threeQuarters]) {
        const bounds = contentBounds(image);
        assert.ok(bounds.pixels > 1000, 'The model must produce visible pixels');
        assert.ok(bounds.left > 3 && bounds.top > 3 && bounds.right < image.width - 4 && bounds.bottom < image.height - 4, 'The whole rotating cat must stay inside the frame');
      }
      // After 7.5s the cat has made three more complete rotations, while the
      // three-second bob is at the opposite height from the initial view.
      const oppositeHeight = await sample(page, 5000);
      const initialBounds = contentBounds(initial);
      const oppositeBounds = contentBounds(oppositeHeight);
      const initialCenter = (initialBounds.top + initialBounds.bottom) / 2;
      const oppositeCenter = (oppositeBounds.top + oppositeBounds.bottom) / 2;
      assert.ok(oppositeCenter > initialCenter + 2, 'The cat must visibly bob downward');
      assert.ok(oppositeCenter - initialCenter < initial.height * 0.3, 'The vertical motion must stay within its expanded range');
      assert.ok(Math.abs(oppositeBounds.left - initialBounds.left) < 3, 'The bob must not move the cat sideways');
      const repeated = await sample(page, 7500);
      assert.ok(difference(initial, repeated) < 0.5, 'Both motions must repeat together after 15 seconds');
      assert.deepEqual(externalRequests, [], 'Rendering must not contact external asset services');
      await mkdir('artifacts', { recursive: true });
      for (const [index, image] of [initial, quarter, half, threeQuarters].entries()) {
        await writeFile(`artifacts/${reducedMotion}-${index}.png`, PNG.sync.write(image));
      }
    } finally { await browser.close(); }
  }
});

test('Actions also opens Maxwell beside an existing conversation', async () => {
  const { browser, page } = await openBB();
  try {
    const threadId = process.env.MAXWELL_THREAD_ID ?? process.env.BB_THREAD_ID;
    assert.ok(threadId, 'Set MAXWELL_THREAD_ID to an existing BB thread for acceptance tests');
    await page.goto(new URL(`/threads/${threadId}`, page.url()).href);
    await openMaxwell(page);
    await page.waitForFunction(() => window.maxwellBrowserProbe.draws > 6);
    const composer = page.getByRole('textbox', { name: 'Ask anything.' });
    await composer.fill('Maxwell acceptance draft');
    assert.equal(await composer.textContent(), 'Maxwell acceptance draft');
    await composer.fill('');
    assert.equal(await page.getByRole('alert').count(), 0);
  } finally { await browser.close(); }
});
