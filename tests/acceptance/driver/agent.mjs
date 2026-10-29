// A scripted ACP agent for the acceptance suite. Registered in BB as a custom
// ACP agent, it reads each prompt's last line as a BB agent tool name with
// optional JSON arguments, and calls that tool through the MCP server BB gives
// the session. The prompt `ready` calls nothing.
// The call therefore takes the same path as a real agent's: BB's provider,
// host daemon and server, then the plugin's registered tool.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';

const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
const sessions = new Map();

function callTool(server, name, args) {
  const child = spawn(server.command, server.args, {
    env: { ...process.env, ...Object.fromEntries(server.env.map(({ name: key, value }) => [key, value])) },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const pending = new Map();
  createInterface({ input: child.stdout }).on('line', (line) => {
    const message = JSON.parse(line);
    pending.get(message.id)?.(message);
  });
  let id = 0;
  const request = (method, params) => new Promise((resolve) => {
    pending.set(++id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  return (async () => {
    try {
      await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'maxwell-driver', version: '1' } });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
      const response = await request('tools/call', { name, arguments: args });
      if (response.error) return `error: ${response.error.message}`;
      const text = response.result.content.map((part) => part.text ?? '').join('');
      return response.result.isError ? `error: ${text}` : text;
    } finally { child.kill(); }
  })();
}

createInterface({ input: process.stdin }).on('line', async (line) => {
  const message = JSON.parse(line);
  const { id, method, params } = message;
  if (method === 'initialize') return send({ id, result: { protocolVersion: 1, agentCapabilities: {}, authMethods: [] } });
  if (method === 'session/new') {
    const sessionId = randomUUID();
    sessions.set(sessionId, params.mcpServers.find((server) => server.name === 'bb-bridge'));
    return send({ id, result: { sessionId } });
  }
  if (method === 'session/prompt') {
    const text = params.prompt.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
    const [, tool, args] = text.trim().split('\n').at(-1).match(/^(\S+)\s*(.*)$/);
    const server = sessions.get(params.sessionId);
    const reply = tool === 'ready' ? 'ready'
      : server ? await callTool(server, tool, args ? JSON.parse(args) : {}) : 'error: BB supplied no tool server';
    send({ method: 'session/update', params: { sessionId: params.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: reply } } } });
    return send({ id, result: { stopReason: 'end_turn' } });
  }
  if (id !== undefined) send({ id, result: {} });
});
