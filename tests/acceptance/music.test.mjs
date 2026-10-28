import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeMaxwell, openBB, openMaxwell, baseURL } from './harness.mjs';
import { freeze, pointOn, sample } from './images.mjs';
import { assertContinuous, assertSilent, audio, clickCat, DURATION, MUSIC, position, ready, waitForStarts } from './audio.mjs';

function silentWav(milliseconds) {
  const frames = Math.round(44100 * milliseconds / 1000);
  const wav = Buffer.alloc(44 + frames * 4);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + frames * 4, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(44100 * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(frames * 4, 40);
  return wav;
}

test('only a click on the cat plays the bundled recording once, from the start, ignoring repeated clicks', async () => {
  const { browser, context, page } = await openBB();
  try {
    const external = [];
    const music = [];
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (/^https?:$/.test(url.protocol) && url.origin !== new URL(baseURL).origin) {
        external.push(url.href);
        return route.abort();
      }
      return route.continue();
    });
    // Slow the start so that rapid clicks land before playback begins.
    await page.route(MUSIC, async (route) => {
      music.push(route.request().url());
      await new Promise((resolve) => setTimeout(resolve, 800));
      return route.fallback();
    });
    await openMaxwell(page);
    await ready(page);
    await assertSilent(page, 0, 1000);
    assert.deepEqual((await audio(page)).media, [], 'Opening the panel must not touch media');

    await clickCat(page, { background: true, times: 3 });
    await context.route(/sketchfab\.com|creativecommons\.org/, (route) => route.fulfill({ contentType: 'text/html', body: '<title>Attribution</title>' }));
    for (const label of ['Maxwell the cat (Dingus)', 'bean(alwayshasbean)', 'CC BY 4.0']) {
      const opened = context.waitForEvent('page');
      await page.getByRole('link', { name: label, exact: true }).click();
      await (await opened).close();
    }
    await assertSilent(page, 0);
    assert.deepEqual(music, [], 'Background and attribution clicks must not load music');

    await clickCat(page, { times: 5 });
    await waitForStarts(page, 1);
    assert.equal(music.length, 1, 'Clicks while starting must not load the recording again');
    let previous = await position(page);
    assert.ok(previous < 1.5, 'The recording must start from the beginning');
    previous = await assertContinuous(page, previous);
    await clickCat(page, { times: 4 });
    previous = await assertContinuous(page, previous);

    await page.waitForFunction(() => window.maxwellBrowserProbe.audio.ends === 1, null, { timeout: (DURATION + 5) * 1000 });
    const ended = await audio(page);
    assert.equal(ended.media.length, 1);
    assert.ok(Math.abs(ended.media[0].duration - DURATION) < 0.05, `The recording must be the bundled ${DURATION}s file`);
    assert.ok(ended.media[0].src.startsWith(new URL(baseURL).origin), 'The recording must come from the BB server');
    await assertSilent(page, 1, 1500);
    assert.equal((await audio(page)).ends, 1, 'The recording must play once, without looping');

    await clickCat(page);
    await waitForStarts(page, 2);
    assert.ok(await position(page) < 1.5, 'Replay must start from the beginning');
    assert.deepEqual(external, [], 'Music must not contact external services');
  } finally { await browser.close(); }
});

test('one tab-wide recording survives panel closes, thread changes and rendering failure', async () => {
  const { browser, page } = await openBB();
  try {
    const threadId = process.env.MAXWELL_THREAD_ID ?? process.env.BB_THREAD_ID;
    assert.ok(threadId, 'Set MAXWELL_THREAD_ID to an existing BB thread for acceptance tests');
    await page.goto(new URL(`/threads/${threadId}`, page.url()).href);
    await openMaxwell(page);
    await ready(page);
    await assertSilent(page, 0);
    await clickCat(page);
    await waitForStarts(page, 1);
    let previous = await position(page);

    await closeMaxwell(page);
    previous = await assertContinuous(page, previous);
    await openMaxwell(page);
    await ready(page);
    previous = await assertContinuous(page, previous);

    // In-app navigation leaves the thread without reloading the tab.
    await page.getByRole('button', { name: /^New thread \(/ }).click();
    await page.getByRole('textbox', { name: 'Ask anything.' }).waitFor();
    previous = await assertContinuous(page, previous);
    await openMaxwell(page);
    await ready(page);
    await clickCat(page, { times: 3 });
    previous = await assertContinuous(page, previous);

    await page.getByRole('img', { name: 'Maxwell the cat rotating from right to left' })
      .evaluate((canvas) => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await page.getByRole('alert').filter({ hasText: 'graphics device was reset' }).waitFor();
    previous = await assertContinuous(page, previous);
    assert.equal((await audio(page)).media.length, 1, 'All panels must share one player');
  } finally { await browser.close(); }
});

test('a failed load or a refused play leaves the cat clickable for another try', async () => {
  const { browser, page } = await openBB();
  try {
    let failures = 1;
    await page.route(MUSIC, (route) => failures-- > 0
      ? route.fulfill({ status: 503, headers: { 'cache-control': 'no-store' }, body: 'unavailable' })
      : route.fallback());
    await openMaxwell(page);
    await ready(page);
    await clickCat(page);
    await page.waitForFunction(() => window.maxwellBrowserProbe.audio.errors > 0);
    await assertSilent(page, 0);
    await clickCat(page);
    await waitForStarts(page, 1);
  } finally { await browser.close(); }

  const second = await openBB();
  try {
    const { page } = second;
    await openMaxwell(page);
    await ready(page);
    // Refuse one playback attempt at the browser media boundary.
    await page.evaluate(() => {
      const play = HTMLMediaElement.prototype.play;
      let refuse = true;
      HTMLMediaElement.prototype.play = function (...args) {
        if (!refuse) return play.apply(this, args);
        refuse = false;
        return Promise.reject(new DOMException('Injected refusal', 'NotAllowedError'));
      };
    });
    await clickCat(page);
    await assertSilent(page, 0);
    await clickCat(page);
    await waitForStarts(page, 1);
  } finally { await second.browser.close(); }
});

test('clicks hit the cat at every pose and panel size, and never the empty background', async () => {
  const { browser, page } = await openBB();
  try {
    // A short recording lets every hit be observed as its own playback.
    await page.route(MUSIC, (route) => route.fulfill({ contentType: 'audio/wav', headers: { 'cache-control': 'no-store' }, body: silentWav(150) }));
    await openMaxwell(page);
    await ready(page);
    let starts = 0;
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 1100, height: 650 }, { width: 1600, height: 450 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(150);
      await freeze(page);
      for (let step = 0; step < 4; step++) {
        const image = await sample(page, 625);
        const cat = await pointOn(page, image);
        const background = await pointOn(page, image, { background: true });
        await page.mouse.click(background.x, background.y);
        await page.waitForTimeout(300);
        assert.equal((await audio(page)).starts, starts, `Background must not play (${viewport.width}x${viewport.height}, quarter ${step})`);
        await page.mouse.click(cat.x, cat.y);
        starts++;
        await page.waitForFunction((value) => window.maxwellBrowserProbe.audio.ends >= value, starts);
        assert.equal((await audio(page)).starts, starts, `The cat must play (${viewport.width}x${viewport.height}, quarter ${step})`);
      }
      await page.evaluate(() => window.maxwellBrowserProbe.resume());
    }
  } finally { await browser.close(); }
});

test('reloading the tab or disabling the plugin stops the music without resuming it', async () => {
  const { browser, page } = await openBB();
  const plugin = (path) => page.request.post(`${baseURL}/api/v1/plugins${path}`);
  try {
    const start = async () => {
      await openMaxwell(page);
      await ready(page);
      const { starts } = await audio(page);
      await clickCat(page);
      await waitForStarts(page, starts + 1);
    };
    const stopped = async () => {
      await page.waitForFunction(() => window.maxwellBrowserProbe.audible() === 0);
      const { starts } = await audio(page);
      await page.waitForTimeout(1500);
      const state = await audio(page);
      assert.equal(state.audible, 0, 'Music must stay stopped');
      assert.equal(state.starts, starts, 'Music must not resume');
      assert.ok(state.media.every((item) => item.paused && item.readyState === 0 && item.networkState === 0), `The media resource must be released: ${JSON.stringify(state.media)}`);
    };

    await start();
    await page.reload();
    await page.getByRole('textbox', { name: 'Ask anything.' }).waitFor();
    await openMaxwell(page);
    await ready(page);
    await assertSilent(page, 0, 1500);
    assert.deepEqual((await audio(page)).media, [], 'A reloaded tab must wait for a click');

    await start();
    assert.ok((await plugin('/maxwell/disable')).ok());
    await stopped();
    assert.ok((await plugin('/maxwell/enable')).ok());
    await page.waitForTimeout(1500);
    const { starts } = await audio(page);
    assert.equal((await audio(page)).audible, 0, 'Enabling the plugin must not resume music');
    await start();
    assert.equal((await audio(page)).starts, starts + 1, 'The new generation must play on click');
  } finally {
    await plugin('/maxwell/enable').catch(() => {});
    await browser.close();
  }
});
