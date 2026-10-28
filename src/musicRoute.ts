import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { readFile } from 'node:fs/promises';
import { MUSIC_PATH } from './music';

// BB resolves import.meta.url to this file when it runs the plugin from
// source, and to dist/server.js when it runs the build. Both are one level
// below the package root, beside assets/.
const recording = new URL('../assets/stockmarket.wav', import.meta.url);

/** Serve the bundled, unmodified recording to this BB server's own app. */
export function serveMaxwellMusic(bb: BbPluginApi) {
  bb.http.route('GET', MUSIC_PATH, async () => new Response(await readFile(recording), {
    headers: { 'content-type': 'audio/wav', 'cache-control': 'no-cache' },
  }));
}
