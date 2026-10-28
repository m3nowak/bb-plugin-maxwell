import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeMaxwell, openBB, openMaxwell, baseURL } from './harness.mjs';

async function assertStopped(page) {
  const before = await page.evaluate(() => ({ draws: window.maxwellBrowserProbe.draws, decodes: window.maxwellBrowserProbe.imageDecodes }));
  await page.waitForTimeout(350);
  assert.deepEqual(await page.evaluate(() => ({ draws: window.maxwellBrowserProbe.draws, decodes: window.maxwellBrowserProbe.imageDecodes })), before);
  assert.equal(await page.getByRole('link', { name: 'CC BY 4.0' }).isVisible(), true);
}

test('unavailable WebGL gives a stable readable failure with attribution', async () => {
  const { browser, context, page } = await openBB();
  try {
    await context.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        return /webgl/.test(kind) ? null : getContext.call(this, kind, ...args);
      };
    });
    await page.reload();
    await openMaxwell(page, { expectRendering: false });
    await page.getByRole('alert').filter({ hasText: 'WebGL' }).waitFor();
    await assertStopped(page);
  } finally { await browser.close(); }
});

test('an invalid bundled texture fails once and keeps attribution', async () => {
  const { browser, page } = await openBB();
  try {
    const inventory = await (await page.request.get(`${baseURL}/api/v1/plugins`)).json();
    const plugin = inventory.plugins.find((item) => item.id === 'maxwell');
    assert.ok(plugin?.app.bundle.jsUrl, 'Install Maxwell in BB before running acceptance tests');
    await page.route(`**${plugin.app.bundle.jsUrl}`, async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(/data:image\/jpeg;base64,[A-Za-z0-9+/=]+/g, 'data:image/jpeg;base64,invalid');
      await route.fulfill({ response, body });
    });
    await page.reload();
    await openMaxwell(page, { expectRendering: false });
    await page.getByRole('alert').filter({ hasText: 'could not be loaded' }).waitFor();
    await assertStopped(page);
  } finally { await browser.close(); }
});

test('graphics context loss stops rendering and a fresh panel recovers', async () => {
  const { browser, page } = await openBB();
  try {
    await openMaxwell(page);
    await page.waitForFunction(() => window.maxwellBrowserProbe.draws > 6);
    await page.locator('canvas').evaluate((canvas) => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await page.getByRole('alert').filter({ hasText: 'graphics device was reset' }).waitFor();
    await assertStopped(page);
    await closeMaxwell(page);
    await openMaxwell(page);
    await page.getByText('Loading Maxwell', { exact: true }).waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('alert').count(), 0);
  } finally { await browser.close(); }
});

test('a thrown browser draw stops without retaining an animation loop', async () => {
  const { browser, context, page } = await openBB();
  try {
    await context.addInitScript(() => {
      for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
        for (const method of ['drawArrays', 'drawElements']) prototype[method] = () => { throw new Error('Injected graphics failure'); };
      }
    });
    await page.reload();
    await openMaxwell(page, { expectRendering: false });
    await page.getByRole('alert').filter({ hasText: 'rendering failed' }).waitFor();
    await assertStopped(page);
    // Host UI can have its own transient RAF work. It must settle once idle.
    await page.waitForFunction(() => window.maxwellBrowserProbe.pendingFrames() === 0);
  } finally { await browser.close(); }
});

test('creator, model and license links open their actual destinations', async () => {
  const { browser, context, page } = await openBB();
  try {
    await context.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        return /webgl/.test(kind) ? null : getContext.call(this, kind, ...args);
      };
    });
    await page.reload();
    await openMaxwell(page, { expectRendering: false });
    const destinations = [
      ['Maxwell the cat (Dingus)', 'https://sketchfab.com/3d-models/maxwell-the-cat-dingus-2ca7f3c1957847d6a145fc35de9046b0'],
      ['bean(alwayshasbean)', 'https://sketchfab.com/alwayshasbean'],
      ['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'],
    ];
    for (const [label, url] of destinations) {
      await context.route(url, (route) => route.fulfill({ contentType: 'text/html', body: '<title>Attribution destination</title>' }));
      const opened = context.waitForEvent('page');
      await page.getByRole('link', { name: label, exact: true }).click();
      const popup = await opened;
      await popup.waitForLoadState('domcontentloaded');
      assert.equal(popup.url(), url);
      await popup.close();
    }
  } finally { await browser.close(); }
});
