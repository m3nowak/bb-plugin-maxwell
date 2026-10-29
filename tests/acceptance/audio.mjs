import assert from 'node:assert/strict';
import { freeze, pointOn, sample } from './images.mjs';

// The bundled recording is about 14.339 seconds of 44.1 kHz stereo PCM.
export const DURATION = 2529510 / (44100 * 2 * 2);
export const MUSIC = '**/api/v1/plugins/maxwell/http/music.wav';

export const audio = (page) => page.evaluate(() => ({ ...window.maxwellBrowserProbe.audio, audible: window.maxwellBrowserProbe.audible(), media: window.maxwellBrowserProbe.media() }));
export const position = async (page) => (await audio(page)).media.find((item) => !item.paused)?.currentTime ?? null;
export async function ready(page) {
  await page.waitForFunction(() => window.maxwellBrowserProbe.draws > 6);
}
/** Click the visible cat, or empty background, at its current rendered pose. */
export async function clickCat(page, { background = false, times = 1 } = {}) {
  await freeze(page);
  const point = await pointOn(page, await sample(page), { background });
  for (let click = 0; click < times; click++) await page.mouse.click(point.x, point.y);
  await page.evaluate(() => window.maxwellBrowserProbe.resume());
}
export async function waitForStarts(page, starts) {
  await page.waitForFunction((value) => window.maxwellBrowserProbe.audio.starts >= value && window.maxwellBrowserProbe.audible() > 0, starts);
}
export async function assertSilent(page, starts, milliseconds = 600) {
  await page.waitForTimeout(milliseconds);
  const state = await audio(page);
  assert.equal(state.starts, starts, 'No new playback may start');
  assert.equal(state.audible, 0, 'Nothing may be playing');
}
export async function assertContinuous(page, previous) {
  await page.waitForTimeout(700);
  const state = await audio(page);
  const current = await position(page);
  assert.equal(state.audible, 1, 'The recording must keep playing');
  assert.ok(current > previous, `Playback must keep advancing (${previous} → ${current})`);
  assert.equal(state.starts, 1, 'The recording must not restart');
  assert.equal(state.rewinds, 0, 'The recording position must not move backwards');
  assert.equal(state.maxConcurrent, 1, 'Only one recording may play in the tab');
  return current;
}
