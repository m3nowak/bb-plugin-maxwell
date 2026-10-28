import type { PluginContentScriptContext } from '@get-bb/plugin-sdk/app';

/** Served by musicRoute.ts from the bundled, unmodified recording. */
export const MUSIC_PATH = '/music.wav';

let start: (() => void) | null = null;

/** Start Maxwell's music from the beginning, unless it is already starting or playing in this tab. */
export function playMaxwellMusic() {
  start?.();
}

/**
 * Owns the tab's single player for one frontend generation. Panels, threads
 * and scenes come and go without affecting it; the generation's disposal
 * stops playback and releases the media resource.
 */
export function mountMaxwellMusic({ pluginId, signal }: PluginContentScriptContext) {
  const source = `/api/v1/plugins/${encodeURIComponent(pluginId)}/http${MUSIC_PATH}`;
  const audio = new Audio();
  audio.preload = 'none';
  // Held from the first accepted click until playback ends or fails, so
  // clicks never restart, queue or overlap the recording.
  let busy = false;
  const release = () => { busy = false; };
  // A natural end also pauses, and so does an interruption by the browser.
  audio.addEventListener('pause', release);
  audio.addEventListener('error', release);

  const play = () => {
    if (busy || signal.aborted) return;
    busy = true;
    // A failed load leaves the element unusable, so retry with a fresh load.
    if (audio.error || !audio.currentSrc) audio.src = source;
    else audio.currentTime = 0;
    audio.play().catch(release);
  };
  start = play;
  return () => {
    if (start === play) start = null;
    audio.removeEventListener('pause', release);
    audio.removeEventListener('error', release);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  };
}
