import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

export const baseURL = process.env.MAXWELL_BB_URL ?? process.env.BB_SERVER_URL ?? 'http://127.0.0.1:38888';
export async function openBB(options = {}) {
  const browser = await chromium.launch({
    executablePath: process.env.MAXWELL_CHROME,
    headless: true,
    env: { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1' },
    args: ['--no-sandbox', '--disable-features=Vulkan', '--disable-gpu-compositing', '--disable-gpu-sandbox', '--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
    await context.addInitScript(await readFile(new URL('./probe.js', import.meta.url), 'utf8'));
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(baseURL);
    await page.getByRole('textbox', { name: 'Ask anything.' }).waitFor();
    return { browser, context, page };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

export async function openMaxwell(page, { expectRendering = true } = {}) {
  await page.getByRole('button', { name: /^(Show|Hide) right panel/ }).first().waitFor();
  const show = page.getByRole('button', { name: /^Show right panel/ });
  if (await show.count()) await show.click();
  await page.getByRole('button', { name: /^Open new tab/ }).click();
  await page.getByRole('button', { name: 'maxwell', exact: true })
    .and(page.getByTitle('maxwell', { exact: true })).click();
  await page.getByRole('region', { name: 'maxwell', exact: true }).waitFor();
  if (expectRendering) await page.getByRole('img', { name: 'Maxwell the cat rotating from right to left' }).waitFor();
}
