import { defineRpcContract, type BbPluginApi, type PluginAgentToolResult } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { serveMaxwellMusic } from './src/musicRoute';
import { DEFAULT_SPEED, isThreadSpeed, speedChannel, type ThreadSpeed } from './src/speed';

export const TOOL_NAME = 'maxwell_set_rotation_speed';

export const rpcContract = defineRpcContract({
  speed: {
    input: z.strictObject({ threadId: z.string().min(1) }),
    output: z.strictObject({ rpm: z.number().min(0), revision: z.number().int().min(0) }),
  },
});

const failure = (text: string): PluginAgentToolResult => ({ content: [{ type: 'text', text }], isError: true });

/** Owns each thread's persistent rotation speed, shared by the thread's agents. */
export default function maxwell(bb: BbPluginApi) {
  serveMaxwellMusic(bb);

  const key = (threadId: string) => `speed/${threadId}`;
  const read = async (threadId: string): Promise<ThreadSpeed> => {
    const saved = await bb.storage.kv.get<unknown>(key(threadId));
    return isThreadSpeed(saved) ? saved : DEFAULT_SPEED;
  };

  // Serialize saves so revisions increase in save order and the last
  // successful save is also the last value published to open panels.
  let saves: Promise<unknown> = Promise.resolve();
  const save = (threadId: string, rpm: number) => {
    const next = saves.then(async () => {
      const speed = { rpm: rpm === 0 ? 0 : rpm, revision: (await read(threadId)).revision + 1 };
      await bb.storage.kv.set(key(threadId), speed);
      // The value is saved; panels that miss this signal reread it on reconnect.
      try { bb.realtime.publish(speedChannel(threadId), speed); }
      catch (error) { bb.log.warn(`Publishing rotation speed for ${threadId} failed: ${error instanceof Error ? error.message : String(error)}`); }
      return speed;
    });
    saves = next.catch(() => {});
    return next;
  };

  bb.rpc.register(rpcContract, {
    speed: ({ threadId }) => read(threadId),
  });

  bb.agents.registerTool({
    name: TOOL_NAME,
    description: "Set how fast Maxwell the cat rotates for this BB thread, in revolutions per minute. 0 stops rotation; 24 is the default. The speed is saved for the thread and shared by its agents. Returns the saved rpm.",
    presentation: {
      label: { pending: 'Setting Maxwell rotation speed', completed: 'Set Maxwell rotation speed' },
      icon: { glyph: 'maxwell/cat-head' },
    },
    parameters: z.strictObject({
      rpm: z.number().min(0).describe('Revolutions per minute: any finite number greater than or equal to 0, including fractions.'),
    }),
    async execute({ rpm }, { threadId }) {
      if (!threadId) return failure("Maxwell's rotation speed belongs to a thread, and this call has none. Nothing was changed.");
      try {
        const saved = await save(threadId, rpm);
        return JSON.stringify({ rpm: saved.rpm });
      } catch (error) {
        bb.log.error(`Saving rotation speed for ${threadId} failed: ${error instanceof Error ? error.message : String(error)}`);
        return failure("Maxwell's rotation speed could not be saved. The previous speed is unchanged.");
      }
    },
  });
}
