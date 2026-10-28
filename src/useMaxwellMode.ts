import { useSyncExternalStore } from 'react';
import type { MaxwellMode } from './mode';

// Held in memory by this frontend generation only, so every new or reloaded
// tab starts in panel mode and no missed command is ever replayed.
let mode: MaxwellMode = 'panel';
const listeners = new Set<() => void>();

/** Apply a command in this tab. Setting the current mode again changes nothing. */
export function setMaxwellMode(next: MaxwellMode) {
  if (next === mode) return;
  mode = next;
  for (const listener of listeners) listener();
}

/** The tab's current mode, shared by its panels and its overlay. */
export function useMaxwellMode(): MaxwellMode {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, () => mode);
}
