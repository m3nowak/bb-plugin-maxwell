// Tryb uwolniony Maxwella. Free and capture are real agent tool calls made by
// the driver agent in BB, delivered to tabs over BB realtime.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseURL, bb, callTool, closeMaxwell, driverProjects, openBB, openMaxwell, openTab, spawnDriver } from './harness.mjs';
import { contentBounds, difference, freeze, sample } from './images.mjs';
import { assertContinuous, assertSilent, audio, clickCat, MUSIC, position, waitForStarts } from './audio.mjs';

const CAT = 'Maxwell the cat rotating from right to left';
const FREE = 'Maxwell is roaming free.';

/** Where the tab shows Maxwell: canvases inside panels, and outside them. */
const places = (page) => page.evaluate((label) => {
  const cats = [...document.querySelectorAll(`canvas[aria-label="${label}"]`)];
  const panel = cats.filter((canvas) => canvas.closest('[aria-label="maxwell"]')).length;
  return { panel, free: cats.length - panel, panels: document.querySelectorAll('section[aria-label="maxwell"]').length };
}, CAT);
async function waitForFree(page) {
  await page.waitForFunction((label) => {
    const cats = [...document.querySelectorAll(`canvas[aria-label="${label}"]`)];
    return cats.length === 1 && !cats[0].closest('[aria-label="maxwell"]');
  }, CAT);
}
async function waitForPanelMode(page) {
  await page.waitForFunction((label) => [...document.querySelectorAll(`canvas[aria-label="${label}"]`)]
    .every((canvas) => canvas.closest('[aria-label="maxwell"]')), CAT);
}
/** The flying cat's square, as the page shows it. A modal dialog hides it from role queries. */
const box = (page) => page.locator(`canvas[aria-label="${CAT}"]`).boundingBox();
const viewport = (page) => page.evaluate(() => ({ width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }));
const liveContexts = (page) => page.evaluate(() => window.maxwellBrowserProbe.contexts - window.maxwellBrowserProbe.lost);
const draws = (page) => page.evaluate(() => window.maxwellBrowserProbe.draws);
async function drawing(page) {
  const before = await draws(page);
  await page.waitForFunction((value) => window.maxwellBrowserProbe.draws > value + 6, before);
}
async function assertNotDrawing(page) {
  await page.waitForTimeout(150);
  const before = await draws(page);
  await page.waitForTimeout(300);
  assert.equal(await draws(page), before, 'No scene may keep drawing');
}
/** Two driver threads in different projects, archived when the test ends. */
async function threads(t) {
  const [projectA, projectB] = driverProjects();
  const [a, b] = await Promise.all([spawnDriver(projectA), spawnDriver(projectB)]);
  t.after(() => Promise.all([a, b].map((id) => bb('thread', 'archive', id).catch(() => {}))));
  await Promise.all([bb('thread', 'update', a, '--title', 'Maxwell driver A'), bb('thread', 'update', b, '--title', 'Maxwell driver B')]);
  return { a, b };
}
/** In-app navigation in every connected tab, without reloading them. */
const show = (threadId, ...options) => bb('thread', 'open', threadId, ...options);
const vertical = (image) => { const bounds = contentBounds(image); return (bounds.top + bounds.bottom) / 2; };

test('free and capture reach every connected tab; new and reloaded tabs start in panel mode', async (t) => {
  const { a, b } = await threads(t);
  const { browser, context, page: first } = await openBB();
  try {
    // The first tab views a thread of project A with its panel open, the
    // second a thread of project B with no panel.
    await first.goto(new URL(`/threads/${a}`, baseURL).href);
    await openMaxwell(first);
    const second = await openTab(context, `/threads/${b}`);
    assert.deepEqual(await places(second), { panel: 0, free: 0, panels: 0 });

    assert.match(await callTool(b, 'maxwell_free'), /^Maxwell has been freed\.$/);
    await Promise.all([waitForFree(first), waitForFree(second)]);
    assert.deepEqual(await places(first), { panel: 0, free: 1, panels: 1 }, 'The open panel must give its cat up');
    assert.equal(await first.getByRole('region', { name: 'maxwell' }).getByText(FREE).isVisible(), true);
    assert.deepEqual(await places(second), { panel: 0, free: 1, panels: 0 }, 'Free must not open a panel');

    // A reload resets only the reloaded tab, and a new tab starts in panel mode.
    await second.reload();
    await second.getByRole('textbox').first().waitFor();
    const third = await openTab(context);
    await second.waitForTimeout(1500);
    assert.equal((await places(second)).free, 0, 'A reloaded tab must start in panel mode');
    assert.equal((await places(third)).free, 0, 'A new tab must start in panel mode');
    assert.equal((await places(first)).free, 1, 'Reloading another tab must not affect this one');

    // A repeated free reaches every tab again, and leaves a flight in progress alone.
    await drawing(first);
    const flying = await first.getByRole('img', { name: CAT }).elementHandle();
    await freeze(first);
    const before = { image: await sample(first), box: await box(first) };
    await callTool(a, 'maxwell_free');
    await Promise.all([waitForFree(second), waitForFree(third)]);
    await first.waitForTimeout(500);
    const after = { image: await sample(first), box: await box(first) };
    assert.equal(await flying.evaluate((canvas) => canvas.isConnected), true, 'A repeated free must keep the same scene');
    assert.deepEqual(after.box, before.box, 'A repeated free must not move the cat');
    assert.ok(difference(before.image, after.image) < 0.5, 'A repeated free must not reset the pose');
    await first.evaluate(() => window.maxwellBrowserProbe.resume());

    assert.match(await callTool(a, 'maxwell_capture'), /^Maxwell has been captured\.$/);
    await Promise.all([waitForPanelMode(first), waitForPanelMode(second), waitForPanelMode(third)]);
    await first.getByRole('region', { name: 'maxwell' }).getByRole('img', { name: CAT }).waitFor();
    assert.deepEqual(await places(first), { panel: 1, free: 0, panels: 1 });
    for (const page of [second, third]) assert.deepEqual(await places(page), { panel: 0, free: 0, panels: 0 }, 'Capture must not open a panel');
    await callTool(a, 'maxwell_capture');
    await first.waitForTimeout(1000);
    assert.deepEqual(await places(first), { panel: 1, free: 0, panels: 1 }, 'A repeated capture changes nothing');
    assert.equal(await liveContexts(first), 1, 'Only the panel scene may hold a graphics context');
  } finally { await browser.close(); }
});

test('commands missed while disconnected are not replayed, and later ones apply', async (t) => {
  const { a } = await threads(t);
  const { browser, page } = await openBB();
  try {
    let offline = false;
    const sockets = new Set();
    await page.routeWebSocket(/\/ws$/, (ws) => {
      if (offline) return ws.close({ code: 4000, reason: 'Offline for the test' });
      const server = ws.connectToServer();
      sockets.add({ ws, server });
    });
    await page.reload();
    await page.getByRole('textbox', { name: 'Ask anything.' }).waitFor();
    await callTool(a, 'maxwell_free');
    await waitForFree(page);

    offline = true;
    for (const { ws, server } of sockets) { ws.close({ code: 4000, reason: 'Offline for the test' }); server.close(); }
    sockets.clear();
    await callTool(a, 'maxwell_capture');
    offline = false;
    const reconnected = Date.now();
    while (sockets.size === 0) {
      assert.ok(Date.now() - reconnected < 60000, 'The app must reconnect');
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(2000);
    assert.deepEqual(await places(page), { panel: 0, free: 1, panels: 0 }, 'A missed capture must not be replayed, nor the mode forgotten');

    await callTool(a, 'maxwell_capture');
    await waitForPanelMode(page);
    assert.equal((await places(page)).free, 0);
  } finally { await browser.close(); }
});

test('one free cat per tab follows navigation and split view, independent of panels', async (t) => {
  const { a, b } = await threads(t);
  const { browser, page } = await openBB();
  try {
    await callTool(a, 'maxwell_free');
    await waitForFree(page);
    await drawing(page);
    const flying = await page.getByRole('img', { name: CAT }).elementHandle();
    const same = async (where) => {
      await page.waitForTimeout(800);
      const { panel, free } = await places(page);
      assert.deepEqual({ panel, free }, { panel: 0, free: 1 }, `One free cat and no panel cat ${where}`);
      assert.equal(await flying.evaluate((canvas) => canvas.isConnected), true, `The flight must continue ${where}`);
    };

    // Opening and closing a panel while free.
    await openMaxwell(page, { expectRendering: false });
    await page.getByRole('region', { name: 'maxwell' }).getByText(FREE).waitFor();
    await same('with a panel opened while free');
    await closeMaxwell(page);
    await same('after closing the panel');

    // Navigating to threads of two projects, split view, and back to New thread.
    await show(a);
    await page.waitForURL(new RegExp(a));
    await same('in a thread');
    await show(b);
    await page.waitForURL(new RegExp(b));
    await same('in a thread of another project');
    await show(a, '--split', 'right');
    await page.waitForURL(new RegExp(a));
    await openMaxwell(page, { expectRendering: false });
    await same('in split view with a panel open');
    assert.equal(await liveContexts(page), 1, 'Split view must not create more scenes');
    await page.getByRole('button', { name: /^New thread \(/ }).click();
    await page.getByRole('textbox', { name: 'Ask anything.' }).waitFor();
    await same('on New thread');

    const panels = (await places(page)).panels;
    await callTool(b, 'maxwell_capture');
    await waitForPanelMode(page);
    assert.equal((await places(page)).panels, panels, 'Capture must not open or close panels');
    assert.equal(await flying.evaluate((canvas) => canvas.isConnected), false);
  } finally { await browser.close(); }
});

test('the free cat flies diagonally at a constant pace, bounces off the page edges and follows resizing', async (t) => {
  const { a } = await threads(t);
  const { browser, page } = await openBB();
  try {
    await callTool(a, 'maxwell_free');
    await waitForFree(page);
    await drawing(page);
    await freeze(page);
    const { width, height } = await viewport(page);
    const step = 250;
    let previous = await box(page);
    const first = await sample(page);
    const paces = [];
    const flips = { x: 0, y: 0 };
    let direction = null;
    // How far each endpoint is from the nearest edge on one axis.
    const room = (item, axis) => axis === 'x' ? Math.min(item.x, width - item.x - item.width) : Math.min(item.y, height - item.y - item.height);
    for (let index = 0; index < 200 && (flips.x < 2 || flips.y < 2); index++) {
      await sample(page, step);
      const current = await box(page);
      assert.ok(current.x >= -0.5 && current.y >= -0.5 && current.x + current.width <= width + 0.5 && current.y + current.height <= height + 0.5, 'The cat must stay on the page');
      const delta = { x: current.x - previous.x, y: current.y - previous.y };
      const travel = Math.max(Math.abs(delta.x), Math.abs(delta.y));
      // Within one step of an edge, a bounce may have happened during the step.
      const near = (axis) => Math.min(room(previous, axis), room(current, axis)) <= travel + 0.5;
      const heading = { x: Math.sign(delta.x), y: Math.sign(delta.y) };
      if (direction) {
        for (const axis of ['x', 'y']) {
          if (heading[axis] === direction[axis]) continue;
          flips[axis]++;
          assert.ok(near(axis), `The ${axis} direction may only reverse at an edge`);
        }
      }
      if (!near('x') && !near('y')) {
        assert.ok(Math.abs(Math.abs(delta.x) - Math.abs(delta.y)) < 0.5, `Flight away from the edges must be diagonal (${delta.x}, ${delta.y})`);
        paces.push(Math.abs(delta.x));
      }
      direction = heading;
      previous = current;
    }
    assert.ok(flips.x >= 2 && flips.y >= 2, `The cat must bounce off both pairs of edges (${JSON.stringify(flips)})`);
    assert.ok(Math.max(...paces) - Math.min(...paces) < 0.5, 'The pace must be constant');
    assert.ok(paces[0] > 0, 'The cat must move');
    // At 24 rpm the rotation and the bob both repeat after 15 seconds, over
    // which the cat crosses the page and bounces: the image must not change.
    const now = await sample(page);
    const later = await sample(page, 15000);
    assert.ok(difference(now, later) < 0.5, 'Bounces must not change the cat');
    assert.ok(contentBounds(first).pixels > 1000, 'The flying cat must be visible');

    for (const size of [{ width: 700, height: 500 }, { width: 240, height: 180 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(200);
      await sample(page, 16);
      const current = await box(page);
      const area = await viewport(page);
      assert.ok(current.x >= -0.5 && current.y >= -0.5 && current.x + current.width <= area.width + 0.5 && current.y + current.height <= area.height + 0.5, `The cat must fit a ${size.width}x${size.height} page`);
      assert.ok(current.width > 0 && Math.abs(current.width - current.height) < 1, `The cat's square must stay square (${JSON.stringify(current)} in ${JSON.stringify(area)})`);
      assert.ok(contentBounds(await sample(page, 16)).pixels > 100, `The cat must stay visible at ${size.width}x${size.height}`);
    }
  } finally { await browser.close(); }
});

const overlap = (one, other) => ({
  x: Math.max(one.x, other.x), y: Math.max(one.y, other.y),
  width: Math.min(one.x + one.width, other.x + other.width) - Math.max(one.x, other.x),
  height: Math.min(one.y + one.height, other.y + other.height) - Math.max(one.y, other.y),
});
/** Click the right split pane's composer, once the cat is not in the way. */
async function focusRightPane(page) {
  const composers = await page.getByRole('textbox', { name: /^Ask for a follow-up/ }).all();
  const boxes = await Promise.all(composers.map((composer) => composer.boundingBox()));
  const right = boxes.reduce((best, item) => item.x > best.x ? item : best);
  await freeze(page);
  for (let tries = 0; tries < 20; tries++) {
    const covered = overlap(await box(page), right);
    if (covered.width <= 0 || covered.height <= 0) break;
    await sample(page, 1000);
  }
  await page.mouse.click(right.x + right.width / 2, right.y + right.height / 2);
  await page.evaluate(() => window.maxwellBrowserProbe.resume());
}

/** Rendered rotation, compared at whole bob cycles so only the turn can differ. */
async function assertTurning(page, rpm) {
  await page.evaluate(() => window.maxwellBrowserProbe.resume());
  // Let the viewed thread's saved speed arrive.
  await page.waitForTimeout(1500);
  await freeze(page);
  const start = await sample(page);
  const three = await sample(page, 3000);
  const six = await sample(page, 3000);
  const fifteen = await sample(page, 9000);
  if (rpm === 0) {
    assert.ok(difference(start, three) < 0.5 && difference(start, six) < 0.5, 'At 0 rpm the cat must not turn');
  } else if (rpm === 10) {
    assert.ok(difference(start, three) > 1, 'At 10 rpm the cat must show its other side after three seconds');
    assert.ok(difference(start, six) < 0.5, 'At 10 rpm the cat must complete a turn in six seconds');
  } else if (rpm === 24) {
    assert.ok(difference(start, six) > 1, 'At 24 rpm six seconds must not be a whole turn');
    assert.ok(difference(start, fifteen) < 0.5, 'At 24 rpm fifteen seconds must be six whole turns');
  }
  await page.evaluate(() => window.maxwellBrowserProbe.resume());
}

test('the free cat turns at the viewed thread\'s saved speed, or 24 rpm without a thread', async (t) => {
  const { a, b } = await threads(t);
  await callTool(a, 'maxwell_set_rotation_speed', { rpm: 10 });
  await callTool(b, 'maxwell_set_rotation_speed', { rpm: 0 });
  const { browser, page } = await openBB();
  try {
    await callTool(a, 'maxwell_free');
    await waitForFree(page);
    await drawing(page);
    await assertTurning(page, 24);
    await show(a);
    await page.waitForURL(new RegExp(a));
    await assertTurning(page, 10);
    await show(b);
    await page.waitForURL(new RegExp(b));
    await assertTurning(page, 0);

    // At 0 rpm the bob and the flight continue.
    await freeze(page);
    const low = await sample(page);
    const lowBox = await box(page);
    const high = await sample(page, 1500);
    assert.ok(Math.abs(vertical(high) - vertical(low)) > 2, 'The cat must keep bobbing at 0 rpm');
    assert.notDeepEqual(await box(page), lowBox, 'The cat must keep flying at 0 rpm');

    // In split view the focused pane's thread sets the speed.
    await show(a, '--split', 'left');
    await page.waitForURL(new RegExp(a));
    await assertTurning(page, 10);
    await focusRightPane(page);
    await page.waitForURL(new RegExp(b));
    await assertTurning(page, 0);

    // A saved change for the viewed thread reaches the free cat.
    await callTool(b, 'maxwell_set_rotation_speed', { rpm: 10 });
    await assertTurning(page, 10);
  } finally { await browser.close(); }
});

test('clicking the free cat plays the music; free and capture never start, stop or restart it', async (t) => {
  const { a } = await threads(t);
  const { browser, page } = await openBB();
  try {
    const music = [];
    await page.route(MUSIC, async (route) => {
      music.push(route.request().url());
      await new Promise((resolve) => setTimeout(resolve, 800));
      return route.fallback();
    });
    await callTool(a, 'maxwell_free');
    await waitForFree(page);
    await drawing(page);
    await assertSilent(page, 0);
    assert.deepEqual((await audio(page)).media, [], 'Free must not touch media');

    await clickCat(page, { background: true, times: 3 });
    await assertSilent(page, 0);
    assert.deepEqual(music, [], 'Empty background must not load music');
    await clickCat(page, { times: 5 });
    await waitForStarts(page, 1);
    assert.equal(music.length, 1, 'Clicks while starting must not load the recording again');

    let previous = await position(page);
    await callTool(a, 'maxwell_capture');
    await waitForPanelMode(page);
    previous = await assertContinuous(page, previous);
    await callTool(a, 'maxwell_free');
    await waitForFree(page);
    previous = await assertContinuous(page, previous);
    await drawing(page);
    await clickCat(page, { times: 2 });
    previous = await assertContinuous(page, previous);
    await callTool(a, 'maxwell_free');
    previous = await assertContinuous(page, previous);

    await page.reload();
    await page.getByRole('textbox', { name: 'Ask anything.' }).waitFor();
    await assertSilent(page, 0);
    await callTool(a, 'maxwell_free');
    await waitForFree(page);
    await assertSilent(page, 0, 1000);
    assert.deepEqual((await audio(page)).media, [], 'A reloaded tab must wait for a click');
    await callTool(a, 'maxwell_capture');
  } finally { await browser.close(); }
});

test('the free cat is drawn above a BB dialog, and only its square takes the pointer', async (t) => {
  const { a } = await threads(t);
  const { browser, page } = await openBB();
  try {
    await callTool(a, 'maxwell_free');
    await waitForFree(page);
    await drawing(page);
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await freeze(page);
    const dialogBox = await dialog.boundingBox();
    const topmost = (x, y) => page.evaluate(([px, py]) => {
      const element = document.elementFromPoint(px, py);
      return { cat: element?.getAttribute('aria-label') ?? null, dialog: Boolean(element?.closest('[role="dialog"]')) };
    }, [x, y]);
    // Fly until the cat crosses the dialog.
    let cat = await box(page);
    for (let tries = 0; tries < 200; tries++) {
      const covered = overlap(cat, dialogBox);
      if (covered.width > 60 && covered.height > 60) break;
      await sample(page, 250);
      cat = await box(page);
    }
    const covered = overlap(cat, dialogBox);
    assert.ok(covered.width > 60 && covered.height > 60, 'The cat must reach the dialog');
    assert.equal((await topmost(covered.x + covered.width / 2, covered.y + covered.height / 2)).cat, CAT, 'The cat must be above the dialog');
    // Away from the cat, the dialog keeps the pointer.
    const corners = [[12, 12], [dialogBox.width - 12, 12], [12, dialogBox.height - 12], [dialogBox.width - 12, dialogBox.height - 12]]
      .map(([x, y]) => ({ x: dialogBox.x + x, y: dialogBox.y + y }))
      .filter(({ x, y }) => x < cat.x || x > cat.x + cat.width || y < cat.y || y > cat.y + cat.height);
    assert.deepEqual(await topmost(corners[0].x, corners[0].y), { cat: null, dialog: true }, 'The overlay must not cover the page');
    await page.evaluate(() => window.maxwellBrowserProbe.resume());
    await page.keyboard.press('Escape');
    await callTool(a, 'maxwell_capture');
  } finally { await browser.close(); }
});

test('repeated freeing and capturing, hiding and disabling the plugin leave no scenes or loops behind', async (t) => {
  const { a } = await threads(t);
  const { browser, page } = await openBB();
  const plugin = (path) => page.request.post(`${baseURL}/api/v1/plugins${path}`);
  try {
    await openMaxwell(page);
    for (let repetition = 0; repetition < 3; repetition++) {
      await callTool(a, 'maxwell_free');
      await waitForFree(page);
      await drawing(page);
      assert.equal(await liveContexts(page), 1, 'Free must release the panel scene');
      await callTool(a, 'maxwell_capture');
      await waitForPanelMode(page);
      await page.getByRole('region', { name: 'maxwell' }).getByRole('img', { name: CAT }).waitFor();
      await drawing(page);
      assert.equal(await liveContexts(page), 1, 'Capture must release the free scene');
    }
    assert.equal(await page.evaluate(() => window.maxwellBrowserProbe.maxRenderCallbacksPerFrame), 1, 'Scenes must not accumulate render loops');

    await callTool(a, 'maxwell_free');
    await waitForFree(page);
    await closeMaxwell(page);
    await drawing(page);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await assertNotDrawing(page);
    await page.evaluate(() => {
      delete document.visibilityState;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await drawing(page);

    assert.ok((await plugin('/maxwell/disable')).ok());
    await page.waitForFunction((label) => !document.querySelector(`canvas[aria-label="${label}"]`), CAT);
    await assertNotDrawing(page);
    assert.equal(await liveContexts(page), 0, 'Disabling the plugin must release the free scene');
    await page.waitForFunction(() => window.maxwellBrowserProbe.pendingFrames() === 0);
    assert.ok((await plugin('/maxwell/enable')).ok());
    await page.waitForTimeout(1500);
    assert.equal((await places(page)).free, 0, 'Enabling the plugin must start in panel mode');
    await openMaxwell(page);
  } finally {
    await plugin('/maxwell/enable').catch(() => {});
    await browser.close();
  }
});
