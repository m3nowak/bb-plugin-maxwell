// The registered agent tool through the SDK's plugin host test boundary. The
// built server bundle is loaded exactly as BB loads it; run `npm run build` first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import plugin from '../../dist/server.js';

const REMOVED_TOOL = 'maxwell_set_rotation_speed';
const MODE_TOOLS = ['maxwell_free', 'maxwell_capture'];

async function load(wrap = (bb) => bb, before = async () => {}) {
  const host = createFakePluginHost({ pluginId: 'maxwell', experimental_declaredIconNames: ['cat-head'] });
  await before(host.bb);
  await plugin(wrap(host.bb));
  return { host, lifecycle: host.harness.lifecycle };
}
const text = (result) => typeof result === 'string' ? result : result.content.map((part) => part.text).join('');

test('only free and capture are registered and exposed without selection rules; no speed can be set', async () => {
  const { host, lifecycle } = await load();
  try {
    const tools = host.harness.inspection.registrations.agentTools.map((tool) => tool.name);
    assert.deepEqual(tools.toSorted(), MODE_TOOLS.toSorted());
    const configuration = await host.harness.behavior.resolveAgentConfiguration();
    assert.deepEqual(configuration.tools.map((tool) => tool.name ?? tool).toSorted(), tools.toSorted(), 'The tools must be exposed without selection rules');
    await assert.rejects(host.harness.behavior.callAgentTool(REMOVED_TOOL, { rpm: 60 }, { threadId: 'thr_a' }), 'The speed setter must be gone');
  } finally { await lifecycle.dispose(); }
});

test('speeds saved by earlier versions, including 0 and above 120 rpm, are neither read nor sent', async () => {
  const { host, lifecycle } = await load((bb) => bb, async (bb) => {
    await bb.storage.kv.set('speed/thr_a', { rpm: 0, revision: 4 });
    await bb.storage.kv.set('speed/thr_b', { rpm: 240.25, revision: 1 });
  });
  try {
    assert.deepEqual(host.harness.inspection.registrations.rpcMethods, [], 'Nothing may serve a saved speed to the app');
    await host.harness.behavior.callAgentTool('maxwell_free', {}, { threadId: 'thr_a' });
    await host.harness.lifecycle.reload(plugin);
    assert.deepEqual(host.harness.inspection.realtimeSignals.map((signal) => signal.channel), ['mode'], 'Only the free command may be sent');
  } finally { await lifecycle.dispose(); }
});

const commands = (host) => host.harness.inspection.realtimeSignals.filter((signal) => signal.channel === 'mode').map((signal) => signal.payload);

test('free and capture take no arguments and reject any', async () => {
  const { host, lifecycle } = await load();
  try {
    for (const name of MODE_TOOLS) {
      for (const input of [{ mode: 'free' }, { threadId: 'thr_b' }, { projectId: 'proj_2' }]) {
        await assert.rejects(host.harness.behavior.callAgentTool(name, input, { threadId: 'thr_a' }), /arguments are invalid/, `${name} must reject ${JSON.stringify(input)}`);
      }
    }
    assert.deepEqual(commands(host), [], 'A rejected call must not send a command');
  } finally { await lifecycle.dispose(); }
});

test('every free and capture publishes its target mode, whatever the calling thread or project', async () => {
  const { host, lifecycle } = await load();
  try {
    const call = (name, context) => host.harness.behavior.callAgentTool(name, {}, { signal: new AbortController().signal, ...context });
    const results = [
      await call('maxwell_free', { threadId: 'thr_a', projectId: 'proj_1' }),
      // A repeat is sent too: the server cannot know which tabs already have it.
      await call('maxwell_free', { threadId: 'thr_b', projectId: 'proj_2' }),
      await call('maxwell_capture', { threadId: 'thr_a', projectId: 'proj_2' }),
      await call('maxwell_capture', {}),
      await call('maxwell_free', {}),
    ];
    assert.deepEqual(commands(host), [{ mode: 'free' }, { mode: 'free' }, { mode: 'panel' }, { mode: 'panel' }, { mode: 'free' }]);
    assert.deepEqual(results, [
      'Maxwell has been freed.', 'Maxwell has been freed.',
      'Maxwell has been captured.', 'Maxwell has been captured.',
      'Maxwell has been freed.',
    ], 'A published command reports only that Maxwell was freed or captured');
  } finally { await lifecycle.dispose(); }
});

test('a failed publication is reported as an error, not as a sent command', async () => {
  let failing = true;
  const { host, lifecycle } = await load((bb) => ({
    ...bb,
    realtime: { publish: (...args) => failing ? (() => { throw new Error('socket closed'); })() : bb.realtime.publish(...args) },
  }));
  try {
    for (const name of MODE_TOOLS) {
      const result = await host.harness.behavior.callAgentTool(name, {}, { threadId: 'thr_a' });
      assert.equal(result.isError, true);
      assert.match(text(result), /^Maxwell could not be (freed|captured)\.$/);
    }
    failing = false;
    assert.equal(typeof await host.harness.behavior.callAgentTool('maxwell_free', {}, { threadId: 'thr_a' }), 'string');
  } finally { await lifecycle.dispose(); }
});
