// Obrót Maxwella follows the viewed chat's context fill; Taniec Maxwella
// shows when there is no Aktywny czat. Context readings are supplied at BB's
// public thread routes, and the motion is observed in rendered pixels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bb, CAT_CANVAS, DANCING, driverProjects, openBB, openMaxwell, openTab, ROTATING, spawnDriver } from './harness.mjs';
import { difference, freeze, sample } from './images.mjs';
import { clickCat, waitForStarts } from './audio.mjs';
import { assertDancing, assertRightToLeft, assertRpm, DANCE_PERIOD, frames, sceneTime, serveThreads, SETTLED, usage } from './motion.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

/** Driver threads that have had a first message, archived when the test ends. */
async function threads(t, count = 1) {
  const [project] = driverProjects();
  const ids = await Promise.all(Array.from({ length: count }, () => spawnDriver(project)));
  t.after(() => Promise.all(ids.map((id) => bb('thread', 'archive', id).catch(() => {}))));
  return ids;
}
const label = (page) => page.locator(CAT_CANVAS).getAttribute('aria-label');
/** Open a chat in every connected tab without reloading, and its Maxwell panel in this one. */
async function view(page, threadId) {
  await bb('thread', 'open', threadId);
  await page.waitForURL(new RegExp(threadId));
  await page.waitForTimeout(500);
  await showMaxwell(page);
}
async function showMaxwell(page) {
  if (!await page.getByRole('region', { name: 'maxwell', exact: true }).isVisible()) await openMaxwell(page);
  await page.getByRole('img', { name: /^Maxwell the cat/ }).waitFor();
  const before = await page.evaluate(() => window.maxwellBrowserProbe.draws);
  await page.waitForFunction((value) => window.maxwellBrowserProbe.draws > value + 6, before);
}
/** Let BB report a change in the thread, and wait until its context has been read again. */
async function reread(page, served, threadId) {
  const before = served.reads(threadId);
  await bb('thread', 'tell', threadId, 'ready');
  await bb('thread', 'wait', threadId, '--timeout', '60s');
  const start = Date.now();
  while (served.reads(threadId) === before) {
    assert.ok(Date.now() - start < 15000, 'A thread change must lead to a new context read');
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(500);
}
/** Measure the panel's speed once any change has finished. */
async function rpm(page, expected, where) {
  await freeze(page);
  await sample(page, SETTLED);
  await assertRpm(page, expected, where);
  await page.evaluate(() => window.maxwellBrowserProbe.resume());
}

test('rotation speed grows linearly from 24 rpm at an empty context to 120 rpm at a full one, right to left', async (t) => {
  const [a] = await threads(t);
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const { browser, page } = await openBB({ reducedMotion });
    try {
      const served = await serveThreads(page);
      served.context(a, usage(0));
      await view(page, a);
      assert.equal(await label(page), ROTATING);
      await rpm(page, 24, 'at 0%');
      await freeze(page);
      await assertRightToLeft(page, 24);
      const images = [];
      for (let index = 0; index < 4; index++) images.push(await sample(page, index ? 625 : 0));
      await mkdir('artifacts', { recursive: true });
      for (const [index, image] of images.entries()) await writeFile(`artifacts/rotation-${reducedMotion}-${index}.png`, PNG.sync.write(image));
      await page.evaluate(() => window.maxwellBrowserProbe.resume());
      if (reducedMotion === 'reduce') break;
      // BB's indicator measure, unrounded, and readings beyond the window.
      for (const [fraction, expected, window] of [[0.25, 48], [0.5, 72], [0.75, 96], [1, 120], [0.3125, 54, 128000], [1.6, 120]]) {
        served.context(a, usage(fraction, window));
        await reread(page, served, a);
        await rpm(page, expected, `at ${fraction * 100}%`);
      }
    } finally { await browser.close(); }
  }
});

test('missing, failed and invalid readings keep the chat\'s last valid reading, or 24 rpm without one', async (t) => {
  const [a] = await threads(t);
  const { browser, page } = await openBB();
  try {
    const served = await serveThreads(page);
    served.context(a, 'error');
    await view(page, a);
    await rpm(page, 24, 'before any valid reading');
    served.context(a, usage(0.5));
    await reread(page, served, a);
    await rpm(page, 72, 'at 50%');
    for (const reply of ['error', { usage: null }, { usage: { estimated: false, modelContextWindow: 200000, usedTokens: -1 } },
      { usage: { estimated: false, modelContextWindow: 0, usedTokens: 10 } }, { usage: { estimated: false, modelContextWindow: -5, usedTokens: 10 } },
      { usage: { estimated: false, modelContextWindow: '200000', usedTokens: 10 } }]) {
      served.context(a, reply);
      await reread(page, served, a);
      await rpm(page, 72, `after ${JSON.stringify(reply)}`);
    }
    served.context(a, usage(0));
    await reread(page, served, a);
    await rpm(page, 24, 'after a valid empty reading');
  } finally { await browser.close(); }
});

test('compaction, a model change and clearing move the speed to the current fill, ignoring reads from before a clear', async (t) => {
  const [a] = await threads(t);
  const { browser, page } = await openBB();
  try {
    const served = await serveThreads(page);
    served.context(a, usage(0.875));
    await view(page, a);
    await rpm(page, 108, 'before compaction');
    served.context(a, usage(0.25));
    await reread(page, served, a);
    await rpm(page, 48, 'after compaction');

    // The same tokens in a smaller window are a fuller context.
    served.context(a, { usage: { estimated: false, modelContextWindow: 200000, usedTokens: 100000 } });
    await reread(page, served, a);
    await rpm(page, 72, 'with a 200k model');
    served.context(a, { usage: { estimated: false, modelContextWindow: 125000, usedTokens: 100000 } });
    await reread(page, served, a);
    await rpm(page, 100.8, 'with a 125k model');

    // A read already on its way when the context is cleared reports the old fill late.
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    served.context(a, () => held.then(() => usage(1)));
    const before = served.reads(a);
    await bb('thread', 'tell', a, 'ready');
    await bb('thread', 'wait', a, '--timeout', '60s');
    while (served.reads(a) === before) await page.waitForTimeout(100);
    served.context(a, { usage: null });
    await bb('thread', 'clear', a);
    await page.waitForTimeout(2000);
    release();
    await page.waitForTimeout(1000);
    await rpm(page, 24, 'after clearing, with no new reading');
  } finally { await browser.close(); }
});

test('a new reading during a speed change continues from the current motion', async (t) => {
  const [a] = await threads(t);
  const { browser, page } = await openBB();
  try {
    const served = await serveThreads(page);
    served.context(a, usage(0));
    await view(page, a);
    await rpm(page, 24, 'before the change');
    // Frames are held while the readings arrive, so each change starts at a known scene time.
    await freeze(page);
    served.context(a, usage(1));
    await reread(page, served, a);
    const rising = await frames(page, 6, 43);
    served.context(a, usage(0.5));
    await reread(page, served, a);
    const after = await frames(page, 6, 43);
    // Two frames on either side of the new reading turn the cat by similar amounts.
    const before = difference(rising.at(-2), rising.at(-1));
    const next = difference(after[0], after[1]);
    assert.ok(difference(rising.at(-1), after[0]) < 0.5, 'A new reading must not move the cat');
    assert.ok(next > before * 0.6 && next < before * 1.6, `A new reading must not change the speed abruptly (${before} then ${next})`);
    await page.evaluate(() => window.maxwellBrowserProbe.resume());
    await rpm(page, 72, 'after the second reading');
  } finally { await browser.close(); }
});

test('readings never carry over between chats, tabs or agents, and a chat returns with its own', async (t) => {
  const [a, b] = await threads(t, 2);
  const child = JSON.parse(await bb('thread', 'spawn', '--project', driverProjects()[0], '--provider', process.env.MAXWELL_DRIVER_PROVIDER ?? 'acp-maxwell-driver', '--parent-thread', a, '--prompt', 'ready', '--json')).id;
  t.after(() => bb('thread', 'archive', child).catch(() => {}));
  await bb('thread', 'wait', child, '--timeout', '60s');
  const { browser, context, page } = await openBB();
  try {
    const served = await serveThreads(context);
    served.context(a, usage(1));
    served.context(b, 'error');
    served.context(child, usage(0.25));
    await view(page, a);
    await rpm(page, 120, 'in the full chat');
    await view(page, b);
    await rpm(page, 24, 'in a chat without a reading, after a full one');
    await view(page, child);
    await rpm(page, 48, 'in the child agent\'s own chat');

    // Back in the first chat, its last reading in this tab applies while BB fails.
    served.context(a, 'error');
    await view(page, a);
    await rpm(page, 120, 'back in the full chat');

    // A late reply for the chat just left does not reach the chat now viewed.
    let release;
    served.context(a, () => new Promise((resolve) => { release = resolve; }).then(() => usage(0)));
    served.context(b, usage(0.5));
    await reread(page, served, a);
    assert.ok(release, 'A read of the chat must be waiting');
    await view(page, b);
    release();
    await page.waitForTimeout(1000);
    await rpm(page, 72, 'after a late reply for the previous chat');

    // Each tab follows its own chat.
    served.context(a, usage(1));
    const other = await openTab(context, `/threads/${a}`);
    await showMaxwell(other);
    await rpm(other, 120, 'in the second tab');
    await rpm(page, 72, 'in the first tab');

    // A reload asks BB again.
    served.context(b, usage(0.75));
    await page.reload();
    await page.getByRole('textbox').first().waitFor();
    await showMaxwell(page);
    await rpm(page, 96, 'after a reload');
  } finally { await browser.close(); }
});

test('reconnecting rereads the context it missed', async (t) => {
  const [a] = await threads(t);
  const { browser, page } = await openBB();
  try {
    const served = await serveThreads(page);
    // While offline, the app's socket opens but reaches nothing.
    let offline = false;
    const sockets = new Set();
    const silent = new Set();
    await page.routeWebSocket(/\/ws$/, (ws) => {
      if (offline) return silent.add(ws);
      sockets.add({ ws, server: ws.connectToServer() });
    });
    await page.reload();
    await page.getByRole('textbox', { name: 'Ask anything.' }).waitFor();
    served.context(a, usage(0.25));
    await view(page, a);
    await rpm(page, 48, 'before disconnecting');
    offline = true;
    for (const { ws, server } of sockets) { ws.close({ code: 4000, reason: 'Offline for the test' }); server.close(); }
    sockets.clear();
    const disconnecting = Date.now();
    while (silent.size === 0) {
      assert.ok(Date.now() - disconnecting < 60000, 'The app must try to reconnect');
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(1000);
    served.context(a, usage(0.75));
    await bb('thread', 'tell', a, 'ready');
    await bb('thread', 'wait', a, '--timeout', '60s');
    await page.waitForTimeout(1000);
    await rpm(page, 48, 'while disconnected');
    offline = false;
    for (const ws of silent) ws.close({ code: 4000, reason: 'Back online for the test' });
    const reconnecting = Date.now();
    while (sockets.size === 0) {
      assert.ok(Date.now() - reconnecting < 60000, 'The app must reconnect');
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(2000);
    await rpm(page, 96, 'after reconnecting');
  } finally { await browser.close(); }
});

test('Maxwell dances without an Aktywny czat, at a constant tempo with or without music, and rotates after the first message', async (t) => {
  const [a] = await threads(t);
  const { browser, page } = await openBB();
  try {
    const served = await serveThreads(page);
    // New thread has no chat yet.
    await openMaxwell(page);
    await page.waitForFunction(() => window.maxwellBrowserProbe.draws > 6);
    assert.equal(await label(page), DANCING);
    await freeze(page);
    const images = await assertDancing(page, 'on New thread');
    await mkdir('artifacts', { recursive: true });
    for (const [index, image] of images.entries()) await writeFile(`artifacts/dance-${String(index).padStart(2, '0')}.png`, PNG.sync.write(image));

    // The same pose at the same point of the beat, while the music plays.
    const before = await sample(page);
    const beat = (await sceneTime(page)) % DANCE_PERIOD;
    await clickCat(page);
    await waitForStarts(page, 1);
    await freeze(page);
    const wait = ((beat - (await sceneTime(page)) % DANCE_PERIOD) + DANCE_PERIOD) % DANCE_PERIOD;
    assert.ok(difference(before, await sample(page, wait)) < 0.5, 'Music must not change the dance');
    await assertDancing(page, 'with music');
    await page.evaluate(() => window.maxwellBrowserProbe.resume());

    // A thread whose first message is not sent yet is not an active chat,
    // whatever its context reading says.
    served.empty(a);
    served.context(a, usage(1));
    await view(page, a);
    assert.equal(await label(page), DANCING);
    await freeze(page);
    await assertDancing(page, 'in an empty thread');
    await page.evaluate(() => window.maxwellBrowserProbe.resume());
    served.empty(a, false);
    served.context(a, usage(0));
    await bb('thread', 'tell', a, 'ready');
    await page.waitForFunction((selector) => document.querySelector(selector)?.getAttribute('aria-label') === 'Maxwell the cat rotating from right to left', CAT_CANVAS);
    // The agent has finished and waits for the user: still an active chat.
    await bb('thread', 'wait', a, '--timeout', '60s');
    await page.waitForTimeout(1000);
    assert.equal(await label(page), ROTATING);
    await rpm(page, 24, 'after the first message');
  } finally { await browser.close(); }
});
