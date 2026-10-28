import { PNG } from 'pngjs';
export const decode = (dataURL) => PNG.sync.read(Buffer.from(dataURL.split(',')[1], 'base64'));
export function difference(a, b) {
  let sum = 0;
  for (let i = 0; i < a.data.length; i++) sum += Math.abs(a.data[i] - b.data[i]);
  return sum / a.data.length;
}
export function contentBounds(png) {
  let left = png.width, right = 0, top = png.height, bottom = 0, pixels = 0;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    if (png.data[(y * png.width + x) * 4 + 3] > 20) {
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y); pixels++;
    }
  }
  return { left, right, top, bottom, pixels };
}
export async function freeze(page) {
  await page.evaluate(() => window.maxwellBrowserProbe.freeze());
  await page.waitForFunction(() => window.maxwellBrowserProbe.isHeld());
}
export async function sample(page, milliseconds = 0) {
  return decode(await page.evaluate((ms) => window.maxwellBrowserProbe.step(ms), milliseconds));
}
