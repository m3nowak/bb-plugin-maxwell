/** Where a tab shows Maxwell: in his panels, or free over the whole BB interface. */
export type MaxwellMode = 'panel' | 'free';

/** Realtime channel carrying free and capture commands to every connected tab. */
export const MODE_CHANNEL = 'mode';

export const isModeCommand = (value: unknown): value is { mode: MaxwellMode } =>
  typeof value === 'object' && value !== null
  && ((value as { mode: unknown }).mode === 'panel' || (value as { mode: unknown }).mode === 'free');
