import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

export const baseURL = process.env.MAXWELL_BB_URL ?? process.env.BB_SERVER_URL ?? 'http://127.0.0.1:38888';
export async function openBB(options = {}) {
  const browser = await chromium.launch({
    executablePath: process.env.MAXWELL_CHROME,
    headless: true,
    env: { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1' },
    args: process.env.MAXWELL_CHROME_ARGS?.split(' ').filter(Boolean)
      ?? ['--no-sandbox', '--disable-features=Vulkan', '--disable-gpu-compositing', '--disable-gpu-sandbox', '--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'],
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

export async function closeMaxwell(page) {
  // The close control only accepts pointer events while its tab is hovered.
  const close = page.getByRole('button', { name: 'Close maxwell', exact: true });
  const box = await close.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await close.click();
}

// Free and capture go through a real agent turn. A scripted ACP agent,
// driver/agent.mjs, is registered on the test BB as a custom agent, and each
// turn calls the tool named in its prompt through BB's own tool path.
const execBB = promisify(execFile);
const bbEnv = () => {
  const env = { ...process.env, BB_SERVER_URL: baseURL };
  for (const name of ['BB_THREAD_ID', 'BB_PROJECT_ID', 'BB_ENVIRONMENT_ID', 'BB_HOST_DAEMON_PORT']) delete env[name];
  return env;
};
export const bb = async (...args) => (await execBB(process.env.BB_CLI ?? 'bb', args, { env: bbEnv() })).stdout.trim();
export const driverProvider = process.env.MAXWELL_DRIVER_PROVIDER ?? 'acp-maxwell-driver';
export function driverProjects() {
  const projects = process.env.MAXWELL_DRIVER_PROJECTS?.split(',').filter(Boolean) ?? [];
  if (projects.length < 2) throw new Error('Set MAXWELL_DRIVER_PROJECTS to two project ids on a BB with the driver agent; see docs/acceptance.md');
  return projects;
}
/** A new thread run by the driver agent, in the given project. */
export async function spawnDriver(projectId) {
  const thread = JSON.parse(await bb('thread', 'spawn', '--project', projectId, '--provider', driverProvider, '--prompt', 'ready', '--json'));
  await bb('thread', 'wait', thread.id, '--timeout', '60s');
  return thread.id;
}
/** Have the driver thread's agent call a tool, and return the tool's reply. */
export async function callTool(threadId, tool, args) {
  await bb('thread', 'tell', threadId, args ? `${tool} ${JSON.stringify(args)}` : tool);
  await bb('thread', 'wait', threadId, '--timeout', '60s');
  return bb('thread', 'output', threadId);
}

/** Another BB tab in the same browser, with the same probe. */
export async function openTab(context, path = '/') {
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(new URL(path, baseURL).href);
  await page.getByRole('textbox', { name: /^(Ask anything\.|Ask for a follow-up)/ }).first().waitFor();
  return page;
}
