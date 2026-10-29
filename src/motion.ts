/** How Maxwell moves: Taniec Maxwella, or Obrót Maxwella at a speed. */
export type MaxwellMotion = { kind: 'dance' } | { kind: 'spin'; rpm: number };

/** Prędkość obrotu Maxwella at an empty context, and with no valid reading. */
export const MIN_RPM = 24;
/** Prędkość obrotu Maxwella at a full context. */
export const MAX_RPM = 120;

export const DANCE: MaxwellMotion = { kind: 'dance' };

/** Rotation speed for a context utilization in [0, 1], linear from 24 to 120 rpm. */
export const rpmAt = (utilization: number | null) => MIN_RPM + (MAX_RPM - MIN_RPM) * (utilization ?? 0);

/**
 * Used tokens over the model's context window, as BB's context indicator
 * measures it, clamped to [0, 1]. Null for a missing or invalid reading.
 */
export function utilizationOf(usage: unknown): number | null {
  if (typeof usage !== 'object' || usage === null) return null;
  const { usedTokens, modelContextWindow } = usage as { usedTokens?: unknown; modelContextWindow?: unknown };
  if (typeof usedTokens !== 'number' || !Number.isFinite(usedTokens) || usedTokens < 0) return null;
  if (typeof modelContextWindow !== 'number' || !Number.isFinite(modelContextWindow) || modelContextWindow <= 0) return null;
  return Math.min(1, usedTokens / modelContextWindow);
}

/** The canvas's accessible name, describing what Maxwell is doing. */
export const catLabel = (motion: MaxwellMotion) =>
  motion.kind === 'dance' ? 'Maxwell the cat dancing' : 'Maxwell the cat rotating from right to left';
