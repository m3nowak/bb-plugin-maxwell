/** Prędkość obrotu Maxwella for one BB thread. */
export interface ThreadSpeed {
  rpm: number;
  /** Increases with every saved change, so clients can discard stale values. */
  revision: number;
}

export const DEFAULT_RPM = 24;
export const DEFAULT_SPEED: ThreadSpeed = { rpm: DEFAULT_RPM, revision: 0 };

export const isRpm = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export const isThreadSpeed = (value: unknown): value is ThreadSpeed =>
  typeof value === 'object' && value !== null
  && isRpm((value as ThreadSpeed).rpm)
  && Number.isSafeInteger((value as ThreadSpeed).revision) && (value as ThreadSpeed).revision >= 0;

/** Realtime channel carrying one thread's saved speed changes. */
export const speedChannel = (threadId: string) => `speed:${threadId}`;
