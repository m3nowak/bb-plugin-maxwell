import type { BbPluginApi, PluginAgentToolResult } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { MODE_CHANNEL, type MaxwellMode } from './src/mode';
import { serveMaxwellMusic } from './src/musicRoute';

export const FREE_TOOL_NAME = 'maxwell_free';
export const CAPTURE_TOOL_NAME = 'maxwell_capture';

const failure = (text: string): PluginAgentToolResult => ({ content: [{ type: 'text', text }], isError: true });

/** Serves Maxwell's music and sends free and capture to the connected tabs. */
export default function maxwell(bb: BbPluginApi) {
  serveMaxwellMusic(bb);

  // Every call publishes, even a repeat: only each tab knows its own mode.
  // Tabs that miss a command are not sent it again.
  const registerModeCommand = ({ name, command, mode, description, label, sent, unsent }: {
    name: string; command: string; mode: MaxwellMode; description: string;
    label: { pending: string; completed: string }; sent: string; unsent: string;
  }) => bb.agents.registerTool({
    name,
    description,
    presentation: { label, icon: { glyph: 'maxwell/cat-head' } },
    parameters: z.strictObject({}),
    async execute() {
      try { bb.realtime.publish(MODE_CHANNEL, { mode }); }
      catch (error) {
        bb.log.error(`Publishing the ${command} command failed: ${error instanceof Error ? error.message : String(error)}`);
        return failure(unsent);
      }
      return sent;
    },
  });
  registerModeCommand({
    name: FREE_TOOL_NAME,
    command: 'free',
    mode: 'free',
    description: 'Free Maxwell.',
    label: { pending: 'Freeing Maxwell', completed: 'Freed Maxwell' },
    sent: 'Maxwell has been freed.',
    unsent: 'Maxwell could not be freed.',
  });
  registerModeCommand({
    name: CAPTURE_TOOL_NAME,
    command: 'capture',
    mode: 'panel',
    description: 'Capture Maxwell.',
    label: { pending: 'Capturing Maxwell', completed: 'Captured Maxwell' },
    sent: 'Maxwell has been captured.',
    unsent: 'Maxwell could not be captured.',
  });
}
