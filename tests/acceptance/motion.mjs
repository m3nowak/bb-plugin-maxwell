// Observing Obrót and Taniec Maxwella in rendered pixels, and supplying known
// context readings at BB's public thread routes.
import assert from 'node:assert/strict';
import { contentBounds, difference, sample } from './images.mjs';

/** One sway right and back from the left, measured from the reference video. */
export const DANCE_PERIOD = 903;
const BOB_PERIOD = 3000;
/** Long enough for any change of motion to have finished. */
export const SETTLED = 700;

const mod = (value, base) => ((value % base) + base) % base;
export const sceneTime = (page) => page.evaluate(() => window.maxwellBrowserProbe.sceneTime());

/** A context reading for the given fraction of a model's window. */
export const usage = (fraction, window = 200000) => ({ usage: { estimated: false, modelContextWindow: window, usedTokens: fraction * window } });

/**
 * Serve chosen replies from BB's context and conversation-outline routes, per
 * thread. A reply is a JSON body, 'error' for a failed read, or a function
 * returning either, which may wait. Threads without a reply reach BB.
 */
export async function serveThreads(target) {
  const context = new Map();
  const outline = new Map();
  const reads = new Map();
  const route = (replies, kind) => async (request) => {
    const threadId = new URL(request.request().url()).pathname.split('/')[4];
    reads.set(`${kind}:${threadId}`, (reads.get(`${kind}:${threadId}`) ?? 0) + 1);
    if (!replies.has(threadId)) return request.fallback();
    let reply = replies.get(threadId);
    if (typeof reply === 'function') reply = await reply();
    if (reply === 'error') return request.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'internal', message: 'Injected failure' }) }).catch(() => {});
    return request.fulfill({ contentType: 'application/json', body: JSON.stringify(reply) }).catch(() => {});
  };
  await target.route(/\/api\/v1\/threads\/[^/]+\/context(\?|$)/, route(context, 'context'));
  await target.route(/\/api\/v1\/threads\/[^/]+\/conversation-outline(\?|$)/, route(outline, 'outline'));
  return {
    context: (threadId, reply) => context.set(threadId, reply),
    /** Make a thread look empty, or let BB answer again. */
    empty: (threadId, isEmpty = true) => isEmpty ? outline.set(threadId, { items: [], maxSeq: 0 }) : outline.delete(threadId),
    reads: (threadId, kind = 'context') => reads.get(`${kind}:${threadId}`) ?? 0,
  };
}

/**
 * How much the image changes over `delta` milliseconds of scene time, starting
 * where the three-second bob is at the same height at both ends, so that only
 * the rotation can differ.
 */
async function change(page, delta) {
  const start = mod(750 - delta / 2, BOB_PERIOD / 2);
  const before = await sample(page, mod(start - await sceneTime(page), BOB_PERIOD / 2));
  return difference(before, await sample(page, delta));
}

/** A frozen scene rotates at `rpm`: whole turns match, and no fraction of one does. */
export async function assertRpm(page, rpm, where = '') {
  const period = 60000 / rpm;
  assert.ok(await change(page, period) < 0.5, `One turn must take ${Math.round(period)} ms at ${rpm} rpm ${where}`);
  // Twenty turns expose a speed off by more than about 1%, such as rounding to whole percents.
  assert.ok(await change(page, period * 20) < 0.5, `Twenty turns must take ${Math.round(period * 20)} ms at ${rpm} rpm ${where}`);
  // A faster whole multiple would also complete a turn in that time.
  for (const parts of [2, 3, 4, 5]) {
    assert.ok(await change(page, period / parts) > 1, `1/${parts} of a turn must show another view at ${rpm} rpm ${where}`);
  }
}

/** Light chest and whisker pixels, which face the viewer only from the front. */
function front(image) {
  let cat = 0, light = 0, x = 0;
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3] < 200) continue;
    cat++;
    if (image.data[i] > 95 && image.data[i + 1] > 95 && image.data[i + 2] > 95) {
      light++;
      x += (i / 4) % image.width;
    }
  }
  return { share: light / Math.max(1, cat), x: light ? x / light : null };
}
const centre = (image) => { const bounds = contentBounds(image); return (bounds.left + bounds.right) / 2; };

/** A turning cat's chest crosses the view from right to left. */
export async function assertRightToLeft(page, rpm) {
  const step = 60000 / rpm / 48;
  let previous = front(await sample(page));
  let left = 0, right = 0;
  for (let index = 0; index < 48; index++) {
    const current = front(await sample(page, step));
    if (previous.share > 0.03 && current.share > 0.03) {
      if (current.x < previous.x - 0.5) left++;
      if (current.x > previous.x + 0.5) right++;
    }
    previous = current;
  }
  assert.ok(left > 4 * Math.max(1, right), `The chest must move from right to left (${left} leftward, ${right} rightward steps)`);
}

/**
 * A frozen scene dances: facing the viewer throughout, swaying sideways, and
 * repeating every 903 ms at a constant tempo. Returns one period of images.
 */
export async function assertDancing(page, where = '') {
  // Start at the rest before the sway to the right.
  const images = [];
  const transforms = [];
  const start = mod(-await sceneTime(page), DANCE_PERIOD);
  for (let index = 0; index < 24; index++) {
    images.push(await sample(page, index ? DANCE_PERIOD / 24 : start));
    transforms.push(await page.evaluate(() => window.maxwellBrowserProbe.modelView()));
  }
  const again = await sample(page, DANCE_PERIOD / 24);
  assert.ok(difference(images[0], again) < 0.5, `The dance must repeat after ${DANCE_PERIOD} ms ${where}`);
  const later = await sample(page, DANCE_PERIOD * 20);
  assert.ok(difference(images[0], later) < 0.5, `The dance must keep its tempo for 20 periods ${where}`);
  // From behind or the side, little or none of the light chest shows.
  assert.ok(Math.max(...images.map((image) => front(image).share)) > 0.05, `The dancing cat must show its chest ${where}`);
  for (const image of images) {
    assert.ok(front(image).share > 0.01, `The dancing cat must keep facing the viewer ${where}`);
    const bounds = contentBounds(image);
    assert.ok(bounds.left > 2 && bounds.top > 2 && bounds.right < image.width - 3 && bounds.bottom < image.height - 3, `The whole dancing cat must stay in view ${where}`);
  }
  // In the bundled model, local Z runs from head to tail. A body-relative
  // roll leaves that direction fixed while its up vector leans either way.
  // Screen-relative roll and fore/aft pitch both change the body direction.
  const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
  const axis = (matrix, column) => matrix.slice(column * 4, column * 4 + 3);
  assert.ok(transforms.every((matrix) => Array.isArray(matrix) && matrix.length === 16), `The dance must send its transforms to WebGL ${where}`);
  const forward = axis(transforms[0], 2);
  const side = axis(transforms[0], 0);
  const up = axis(transforms[0], 1);
  const origin = axis(transforms[0], 3);
  const rolls = [], offsets = [];
  for (const matrix of transforms) {
    assert.ok(Math.hypot(...axis(matrix, 2).map((value, i) => value - forward[i])) < 1e-5, `The cat must roll about its own head-to-tail axis, not the viewer's axis ${where}`);
    const delta = axis(matrix, 3).map((value, i) => value - origin[i]);
    assert.ok(Math.abs(dot(delta, forward)) < 1e-5, `The sway must move across the cat's body, not along it ${where}`);
    rolls.push(Math.atan2(dot(axis(matrix, 1), side), dot(axis(matrix, 1), up)));
    offsets.push(dot(delta, side));
  }
  assert.ok(Math.min(...rolls) < -0.1 && Math.max(...rolls) > 0.1, `The body must lean to both sides ${where}`);
  assert.ok(Math.max(...offsets.slice(0, 12)) > 0.1 && Math.min(...offsets.slice(12)) < -0.1, `The sway must alternate between the cat's own sides ${where}`);
  const centres = images.map(centre);
  const width = contentBounds(images[0]).right - contentBounds(images[0]).left;
  assert.ok(Math.max(...centres) - Math.min(...centres) > width * 0.25, `The cat must sway sideways ${where}`);
  return images;
}

/** Frames every `step` ms of scene time, starting with the next one. */
export async function frames(page, count, step) {
  const images = [];
  for (let index = 0; index < count; index++) images.push(await sample(page, index ? step : 0));
  return images;
}

/**
 * Milliseconds into `images`, taken every `step` ms, after which the motion
 * repeats every `period` ms to the end.
 */
export function settledAfter(images, step, period) {
  const lag = Math.round(period / step);
  const repeats = images.slice(0, images.length - lag).map((image, index) => difference(image, images[index + lag]) < 0.5);
  const last = repeats.lastIndexOf(false);
  return last === repeats.length - 1 ? Infinity : (last + 1) * step;
}

/** The largest change between consecutive frames. */
export const largestStep = (images) => Math.max(...images.slice(1).map((image, index) => difference(images[index], image)));
