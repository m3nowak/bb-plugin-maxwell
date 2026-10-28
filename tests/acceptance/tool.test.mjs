// The registered agent tool through the SDK's plugin host test boundary. The
// built server bundle is loaded exactly as BB loads it; run `npm run build` first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import plugin from '../../dist/server.js';

const TOOL = 'maxwell_set_rotation_speed';

async function load(wrap = (bb) => bb) {
  const host = createFakePluginHost({ pluginId: 'maxwell', experimental_declaredIconNames: ['cat-head'] });
  await plugin(wrap(host.bb));
  const { behavior, inspection, lifecycle } = host.harness;
  return {
    host,
    set: (threadId, input) => behavior.callAgentTool(TOOL, input, { threadId }),
    saved: async (threadId) => (await behavior.callRpc('speed', { threadId })).rpm,
    signals: (threadId) => inspection.realtimeSignals.filter((signal) => signal.channel === `speed:${threadId}`).map((signal) => signal.payload.rpm),
    lifecycle,
  };
}
const text = (result) => typeof result === 'string' ? result : result.content.map((part) => part.text).join('');

test('one rpm setter is registered, with a required numeric rpm and no thread argument', async () => {
  const { host, lifecycle } = await load();
  try {
    const tools = host.harness.inspection.registrations.agentTools.map((tool) => tool.name);
    assert.deepEqual(tools, [TOOL]);
    const configuration = await host.harness.behavior.resolveAgentConfiguration();
    assert.deepEqual(configuration.tools.map((tool) => tool.name ?? tool), [TOOL], 'The tool must be exposed without selection rules');
  } finally { await lifecycle.dispose(); }
});

test('a successful call returns the saved rpm without rounding or clamping', async () => {
  const { set, saved, lifecycle } = await load();
  try {
    for (const rpm of [0, 0.5, 24, 60, 240.25, 1e6, 1e308, Number.MAX_VALUE, Number.MIN_VALUE]) {
      const result = await set('thr_a', { rpm });
      assert.equal(typeof result === 'string' || !result.isError, true, `${rpm} rpm must be accepted`);
      assert.deepEqual(JSON.parse(text(result)), { rpm });
      assert.equal(await saved('thr_a'), rpm);
    }
  } finally { await lifecycle.dispose(); }
});

test('threads without a saved speed use 24 rpm, and setting 24 restores it', async () => {
  const { set, saved, lifecycle } = await load();
  try {
    assert.equal(await saved('thr_new'), 24);
    await set('thr_a', { rpm: 0 });
    await set('thr_a', { rpm: 24 });
    assert.equal(await saved('thr_a'), 24);
  } finally { await lifecycle.dispose(); }
});

test('invalid or missing rpm is an error and leaves the saved speed unchanged', async () => {
  const { set, saved, signals, lifecycle } = await load();
  try {
    await set('thr_a', { rpm: 7 });
    for (const input of [{}, { rpm: -1 }, { rpm: -Number.MIN_VALUE }, { rpm: '60' }, { rpm: null }, { rpm: true }, { rpm: NaN }, { rpm: Infinity }, { rpm: -Infinity }, { rpm: 60, threadId: 'thr_b' }]) {
      await assert.rejects(set('thr_a', input), /arguments are invalid/, `${JSON.stringify(input)} must be rejected`);
    }
    assert.equal(await saved('thr_a'), 7);
    assert.equal(await saved('thr_b'), 24, 'A supplied thread id must not select another thread');
    assert.deepEqual(signals('thr_a'), [7]);
  } finally { await lifecycle.dispose(); }
});

test('a call without a thread identity fails without changing state', async () => {
  const { set, saved, host, lifecycle } = await load();
  try {
    const result = await set('', { rpm: 60 });
    assert.equal(result.isError, true);
    assert.equal(await saved('thr_a'), 24);
    assert.deepEqual(host.harness.inspection.realtimeSignals, []);
  } finally { await lifecycle.dispose(); }
});

test('a failed save is reported as an error, not as the requested speed', async () => {
  let failing = false;
  const { set, saved, signals, lifecycle } = await load((bb) => ({
    ...bb,
    storage: {
      ...bb.storage,
      kv: {
        ...bb.storage.kv,
        get: (...args) => bb.storage.kv.get(...args),
        set: (...args) => failing ? Promise.reject(new Error('disk full')) : bb.storage.kv.set(...args),
      },
    },
  }));
  try {
    await set('thr_a', { rpm: 12 });
    failing = true;
    const result = await set('thr_a', { rpm: 60 });
    assert.equal(result.isError, true);
    assert.doesNotMatch(text(result), /"rpm"/);
    failing = false;
    assert.equal(await saved('thr_a'), 12);
    assert.deepEqual(signals('thr_a'), [12], 'A failed save must not reach open panels');
  } finally { await lifecycle.dispose(); }
});

test('speed belongs to the thread: shared by its agents, isolated from other threads', async () => {
  const { host, saved, lifecycle } = await load();
  try {
    const call = (threadId, projectId, rpm) => host.harness.behavior.callAgentTool(TOOL, { rpm }, { threadId, projectId, signal: new AbortController().signal });
    await call('thr_a', 'proj_1', 0);
    // Another agent session in the same thread sees and changes the same setting.
    await call('thr_a', 'proj_1', 3);
    await call('thr_b', 'proj_1', 90);
    assert.equal(await saved('thr_a'), 3);
    assert.equal(await saved('thr_b'), 90);
    assert.equal(await saved('thr_c'), 24);
  } finally { await lifecycle.dispose(); }
});

test('competing changes in one thread converge on the last successful save', async () => {
  const { set, saved, signals, host, lifecycle } = await load();
  try {
    const results = await Promise.all([1, 2, 3, 4, 5].map((rpm) => set('thr_a', { rpm })));
    assert.deepEqual(results.map((result) => JSON.parse(text(result)).rpm), [1, 2, 3, 4, 5]);
    const published = signals('thr_a');
    assert.equal(await saved('thr_a'), published.at(-1), 'Open panels must end on the saved value');
    const revisions = host.harness.inspection.realtimeSignals.map((signal) => signal.payload.revision);
    assert.deepEqual(revisions, [...revisions].sort((a, b) => a - b), 'Later saves must carry later revisions');
    assert.equal((await host.harness.behavior.callRpc('speed', { threadId: 'thr_a' })).revision, revisions.at(-1));
  } finally { await lifecycle.dispose(); }
});

test('saved speed survives a plugin reload', async () => {
  const { set, host, lifecycle } = await load();
  try {
    await set('thr_a', { rpm: 60 });
    const reloaded = await host.harness.lifecycle.reload(plugin);
    assert.equal((await reloaded.harness.behavior.callRpc('speed', { threadId: 'thr_a' })).rpm, 60);
  } finally { await lifecycle.dispose(); }
});
