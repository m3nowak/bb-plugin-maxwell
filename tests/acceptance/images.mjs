import { PNG } from 'pngjs';
import { CAT } from './harness.mjs';
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
// Find page coordinates of a solid cat pixel, or of empty background, in a
// rendered frame. Searching outward from the drawn centre keeps the point
// well inside the visible silhouette whatever the cat's pose.
export async function pointOn(page, image, { background = false } = {}) {
  const alpha = (x, y) => image.data[(y * image.width + x) * 4 + 3];
  const solid = (x, y, radius) => {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const value = alpha(x + dx, y + dy);
      if (background ? value !== 0 : value < 250) return false;
    }
    return true;
  };
  const bounds = contentBounds(image);
  const start = background ? { x: 8, y: 8 } : { x: Math.round((bounds.left + bounds.right) / 2), y: Math.round((bounds.top + bounds.bottom) / 2) };
  const candidates = [];
  for (let y = 6; y < image.height - 6; y += 2) for (let x = 6; x < image.width - 6; x += 2) candidates.push({ x, y });
  candidates.sort((a, b) => Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(b.x - start.x, b.y - start.y));
  const pixel = candidates.find(({ x, y }) => solid(x, y, 5));
  if (!pixel) throw new Error(background ? 'No empty background is visible' : 'No solid cat pixel is visible');
  const box = await page.getByRole('img', { name: CAT }).boundingBox();
  return { x: box.x + (pixel.x + 0.5) * box.width / image.width, y: box.y + (pixel.y + 0.5) * box.height / image.height };
}
export async function freeze(page) {
  await page.evaluate(() => window.maxwellBrowserProbe.freeze());
  await page.waitForFunction(() => window.maxwellBrowserProbe.isHeld());
}
export async function sample(page, milliseconds = 0) {
  return decode(await page.evaluate((ms) => window.maxwellBrowserProbe.step(ms), milliseconds));
}
