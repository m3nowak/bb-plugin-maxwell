// Tryb uwolniony Maxwella. Free and capture are real agent tool calls made by
// the driver agent in BB, delivered to tabs over BB realtime.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseURL, bb, callTool, CAT, CAT_CANVAS, closeMaxwell, DANCING, driverProjects, openBB, openMaxwell, openTab, ROTATING, spawnDriver } from './harness.mjs';
import { contentBounds, difference, freeze, sample } from './images.mjs';
import { assertContinuous, assertSilent, audio, clickCat, MUSIC, position, waitForStarts } from './audio.mjs';
import { assertDancing, assertRpm, DANCE_PERIOD, frames, largestStep, serveThreads, settledAfter, SETTLED, usage } from './motion.mjs';

const FREE = 'Maxwell is roaming free.';

/** Where the tab shows Maxwell: canvases inside panels, and outside them. */
const places = (page) => page.evaluate((selector) => {
  const cats = [...document.querySelectorAll(selector)];
  const panel = cats.filter((canvas) => canvas.closest('[aria-label="maxwell"]')).length;
  return { panel, free: cats.length - panel, panels: document.querySelectorAll('section[aria-label="maxwell"]').length };
}, CAT_CANVAS);
async function waitForFree(page) {
  await page.waitForFunction((selector) => {
    const cats = [...document.querySelectorAll(selector)];
    return cats.length === 1 && !cats[0].closest('[aria-label="maxwell"]');
  }, CAT_CANVAS);
}
async function waitForPanelMode(page) {
  await page.waitForFunction((selector) => [...document.querySelectorAll(selector)]
    .every((canvas) => canvas.closest('[aria-label="maxwell"]')), CAT_CANVAS);
}
/** The flying cat's square, as the page shows it. A modal dialog hides it from role queries. */
const box = (page) => page.locator(CAT_CANVAS).boundingBox();
/** Wait, with frames held, until the free cat shows what it is doing. */
const waitForLabel = (page, label) => page.waitForFunction(([selector, name]) => document.querySelector(selector)?.getAttribute('aria-label') === name, [CAT_CANVAS, label]);
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
    // Outside a chat the cat dances, repeating every period. Over 17 periods
    // it crosses the page and bounces: the image must not change.
    const now = await sample(page);
    const later = await sample(page, DANCE_PERIOD * 17);
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

test('the free cat follows the selected chat\'s context, and dances outside chats', async (t) => {
  const { a, b } = await threads(t);
  const { browser, page } = await openBB();
  try {
    const served = await serveThreads(page);
    served.context(a, usage(1));
    served.context(b, usage(0.25));
    await callTool(a, 'maxwell_free');
    await waitForFree(page);
    await drawing(page);
    const flying = await page.getByRole('img', { name: CAT }).elementHandle();
    const settled = async (label, where) => {
      await waitForLabel(page, label);
      // Let the viewed chat's reading arrive, then let the change finish.
      await page.waitForTimeout(1500);
      await freeze(page);
      await sample(page, SETTLED);
      if (label === DANCING) await assertDancing(page, where);
      return page.evaluate(() => window.maxwellBrowserProbe.resume());
    };
    await settled(DANCING, 'on New thread');

    await show(a);
    await page.waitForURL(new RegExp(a));
    await settled(ROTATING, 'in a full chat');
    await freeze(page);
    await assertRpm(page, 120, 'in a full chat');
    await page.evaluate(() => window.maxwellBrowserProbe.resume());
    await show(b);
    await page.waitForURL(new RegExp(b));
    await settled(ROTATING);
    await freeze(page);
    await assertRpm(page, 48, 'in a quarter-full chat');
    await page.evaluate(() => window.maxwellBrowserProbe.resume());

    // In split view the focused pane's chat sets the speed.
    await show(a, '--split', 'left');
    await page.waitForURL(new RegExp(a));
    await settled(ROTATING);
    await freeze(page);
    await assertRpm(page, 120, 'with the full chat focused');
    await page.evaluate(() => window.maxwellBrowserProbe.resume());
    await focusRightPane(page);
    await page.waitForURL(new RegExp(b));
    await settled(ROTATING);
    await freeze(page);
    await assertRpm(page, 48, 'with the quarter-full chat focused');
    await page.evaluate(() => window.maxwellBrowserProbe.resume());

    // Settings show no chat.
    await page.getByRole('button', { name: /^Settings/ }).first().click();
    await page.waitForURL(/settings/);
    await settled(DANCING, 'in settings');
    assert.equal(await flying.evaluate((canvas) => canvas.isConnected), true, 'Changing motion must keep the same scene');
  } finally { await browser.close(); }
});

test('changing between dance and rotation takes about half a second, keeps the flight and survives rapid navigation', async (t) => {
  const { a, b } = await threads(t);
  const { browser, page } = await openBB();
  try {
    const served = await serveThreads(page);
    served.context(a, usage(1));
    served.context(b, usage(0));
    await callTool(a, 'maxwell_free');
    await waitForFree(page);
    await drawing(page);
    // Change what the free cat shows while its frames are held, so the change
    // starts at a known scene time.
    const change = async (go, label) => {
      await freeze(page);
      await go();
      await waitForLabel(page, label);
      await page.waitForTimeout(1500);
    };
    const flight = async (count) => {
      const boxes = [];
      for (let index = 0; index < count; index++) { await sample(page, 20); boxes.push(await box(page)); }
      return boxes;
    };
    // Away from the edges, each 20 ms frame moves the cat 2 px along both axes.
    const assertSteadyFlight = async (boxes) => {
      const { width, height } = await viewport(page);
      const steps = boxes.slice(1).map((item, index) => [boxes[index], item]).filter(([from, to]) => [from, to].every((item) =>
        Math.min(item.x, width - item.x - item.width, item.y, height - item.y - item.height) > 3));
      assert.ok(steps.length >= 2, 'The cat must fly away from the edges for the check');
      for (const [from, to] of steps) {
        assert.ok(Math.abs(Math.abs(to.x - from.x) - 2) < 0.5 && Math.abs(Math.abs(to.y - from.y) - 2) < 0.5, `The flight must keep its pace while the motion changes (${JSON.stringify([from, to])})`);
      }
    };

    await freeze(page);
    const dancing = await frames(page, 22, 43);
    await page.evaluate(() => window.maxwellBrowserProbe.resume());
    // Dance to 120 rpm: three seconds are six turns and one bob.
    await change(() => show(a), ROTATING);
    const toTurning = await frames(page, 100, 50);
    const turnedAfter = settledAfter(toTurning, 50, 3000);
    assert.ok(turnedAfter >= 250 && turnedAfter <= 700, `Starting to rotate must take about 0.5 s (${turnedAfter} ms)`);
    assert.ok(largestStep(toTurning.slice(0, 4)) < largestStep(toTurning.slice(-10)), 'Rotation must start slowly, not at full speed');
    await assertRpm(page, 120, 'after the change');
    const fullSpeed = await frames(page, 12, 43);

    // Back to the dance: it repeats every period once the change is over.
    await change(() => page.getByRole('button', { name: /^New thread \(/ }).click(), DANCING);
    const boxes = await flight(5);
    const toDancing = await frames(page, 63, 43);
    const dancedAfter = settledAfter(toDancing, 43, DANCE_PERIOD);
    assert.ok(dancedAfter >= 250 && dancedAfter <= 700, `Starting to dance must take about 0.5 s (${dancedAfter} ms)`);
    assert.ok(largestStep(toDancing.slice(-21)) <= largestStep(dancing) * 1.5 + 0.5, 'The dance must reach its usual motion');
    assert.ok(largestStep(toDancing) <= largestStep(fullSpeed) * 1.25 + 0.5, 'Turning to face the viewer must not whirl faster than a full context');
    await assertSteadyFlight(boxes);
    await assertSteadyFlight(await flight(5));
    await assertDancing(page, 'after the change');

    // From the slowest rotation the cat speeds up to face the viewer, but no faster than a full context.
    await page.evaluate(() => window.maxwellBrowserProbe.resume());
    await change(() => show(b), ROTATING);
    await sample(page, SETTLED);
    await change(() => page.getByRole('button', { name: /^New thread \(/ }).click(), DANCING);
    assert.ok(largestStep(await frames(page, 24, 43)) <= largestStep(fullSpeed) * 1.25 + 0.5, 'Turning to face the viewer from 24 rpm must not whirl');

    // A new target in the middle of a change continues from the current motion.
    await page.evaluate(() => window.maxwellBrowserProbe.resume());
    await change(() => show(a), ROTATING);
    const half = await frames(page, 6, 43);
    await change(() => show(b), ROTATING);
    const next = await frames(page, 6, 43);
    await change(() => page.getByRole('button', { name: /^New thread \(/ }).click(), DANCING);
    const last = await frames(page, 30, 43);
    const steps = [half, next, last].map((images) => largestStep(images));
    const joins = [difference(half.at(-1), next[0]), difference(next.at(-1), last[0])];
    assert.ok(Math.max(...joins) <= Math.max(...steps) * 1.5 + 0.5, `Retargeting must not jump (${joins} against ${steps})`);
    await page.evaluate(() => window.maxwellBrowserProbe.resume());
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
    assert.match((await topmost(covered.x + covered.width / 2, covered.y + covered.height / 2)).cat ?? '', CAT, 'The cat must be above the dialog');
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
    await page.waitForFunction((selector) => !document.querySelector(selector), CAT_CANVAS);
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
