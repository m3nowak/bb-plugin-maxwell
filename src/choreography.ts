import type { MaxwellMotion } from './motion';

/** Speed changes and changes between rotation and dance take this long. */
const TRANSITION_MS = 500;
/** Turning to face the camera may take a little more or less, so as never to turn back or whirl. */
const SETTLE_MS = [400, 700];
/** Prędkość obrotu Maxwella at a full context, in revolutions per millisecond. */
const MAX_RATE = 120 / 60000;
/**
 * One sway to the right and back from the left, measured from the swaying
 * part of the reference video (https://www.youtube.com/watch?v=rXh8Hvo7gfs).
 */
export const DANCE_PERIOD_MS = 903;
const BOB_PER_MS = 2 * Math.PI / 3000;
/** Height of the rotation's vertical bob, as a fraction of the model's radius. */
const BOB = 0.105;
/** Revolution at which Maxwell looks into the camera. */
const FRONT = 0.6;

/** Equal lean to either side of the body, in radians. The dance stays in place. */
const DANCE_ROLL = 0.2;

const smooth = (u: number) => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
/** The integral of smooth from 0 to u. */
const smoothArea = (u: number) => u <= 0 ? 0 : u >= 1 ? u - 0.5 : u ** 3 - u ** 4 / 2;
const same = (one: MaxwellMotion, other: MaxwellMotion) =>
  one.kind === 'dance' ? other.kind === 'dance' : other.kind === 'spin' && other.rpm === one.rpm;

/** Position in revolutions, decreasing from right to left, and its rate per millisecond. */
type Turning =
  /** Easing from one rate of turning to another. */
  | { kind: 'ramp'; start: number; from: number; rate: number; toRate: number }
  /** Coming to rest facing the camera, from the current position and rate. */
  | { kind: 'settle'; start: number; from: number; rate: number; to: number; duration: number };

function turningAt(turning: Turning, time: number): [position: number, rate: number] {
  const elapsed = time - turning.start;
  if (turning.kind === 'ramp') {
    const u = elapsed / TRANSITION_MS;
    const change = turning.toRate - turning.rate;
    return [turning.from + turning.rate * elapsed + change * TRANSITION_MS * smoothArea(u), turning.rate + change * smooth(u)];
  }
  const { from, rate, to, duration } = turning;
  const u = elapsed / duration;
  if (u >= 1) return [to, 0];
  // Cubic Hermite curve, continuous in position and rate at both ends.
  const position = (2 * u ** 3 - 3 * u ** 2 + 1) * from + (u ** 3 - 2 * u ** 2 + u) * duration * rate + (3 * u ** 2 - 2 * u ** 3) * to;
  const velocity = (6 * u ** 2 - 6 * u) * (from - to) / duration + (3 * u ** 2 - 4 * u + 1) * rate;
  return [position, velocity];
}

/**
 * Fastest speed along a settle covering `distance` revolutions from `speed`
 * in `duration`, or Infinity if the curve would turn back before stopping.
 */
function settlePeak(speed: number, distance: number, duration: number) {
  if (distance < speed * duration / 3) return Infinity;
  // Along the curve the speed is a·u² + b·u + speed, for u in [0, 1].
  const a = 3 * speed - 6 * distance / duration;
  const b = 6 * distance / duration - 4 * speed;
  const top = a < 0 ? Math.min(1, -b / (2 * a)) : 0;
  return Math.max(speed, a * top ** 2 + b * top + speed);
}

/**
 * The way to face the camera: on to one of the next two fronts, in the
 * direction of rotation, taking as close to half a second as the speed of a
 * full context allows. Where nothing in time stays within it, the gentlest.
 */
function planSettle(position: number, rate: number) {
  const speed = Math.max(0, -rate);
  const next = (((position - FRONT) % 1) + 1) % 1;
  const fits = (peak: number) => peak <= Math.max(speed, MAX_RATE);
  let best = { distance: next + 1, duration: SETTLE_MS[1], peak: Infinity };
  for (const distance of [next, next + 1]) {
    for (let duration = SETTLE_MS[0]; duration <= SETTLE_MS[1]; duration += 10) {
      const peak = settlePeak(speed, distance, duration);
      const better = fits(peak) !== fits(best.peak) ? fits(peak)
        : fits(peak) ? Math.abs(duration - TRANSITION_MS) < Math.abs(best.duration - TRANSITION_MS)
        : peak < best.peak;
      if (better) best = { distance, duration, peak };
    }
  }
  return { to: position - best.distance, duration: best.duration };
}

/** Continuous, symmetric roll around the body's head-to-tail axis. */
function sway(time: number) {
  const phase = (time % DANCE_PERIOD_MS) / DANCE_PERIOD_MS;
  return Math.sin(phase * 2 * Math.PI) * DANCE_ROLL;
}

export interface Pose {
  /** Vertical bob during rotation, as a fraction of the model's radius. */
  y: number;
  /** Framing allowance for the rotation's bob, as a fraction of the radius. */
  reach: number;
  /** Heading and roll about the body's own head-to-tail axis, in radians. */
  yaw: number;
  roll: number;
}

/**
 * Maxwell's motion over scene time: Obrót Maxwella with its bob, Taniec
 * Maxwella, and smooth changes between them. Scene time only advances with
 * drawn frames, so hidden time is skipped rather than caught up.
 */
export function choreograph() {
  let time = 0;
  let begun = false;
  let target: MaxwellMotion | null = null;
  let turning: Turning = { kind: 'ramp', start: 0, from: 0, rate: 0, toRate: 0 };
  // Dance weight changes at a constant rate, from wherever it is.
  let weight = { start: 0, from: 0, to: 0 };
  let bobPhase = 0;

  const weightAt = (at: number) => {
    const change = weight.to - weight.from;
    return weight.from + Math.sign(change) * Math.min(Math.abs(change), (at - weight.start) / TRANSITION_MS);
  };

  return {
    /** Move toward a motion, from the current one. Before the first frame, start in it. */
    set(motion: MaxwellMotion) {
      if (target && same(target, motion)) return;
      target = motion;
      const rate = motion.kind === 'spin' ? -motion.rpm / 60000 : 0;
      if (!begun) {
        turning = { kind: 'ramp', start: time, from: FRONT, rate, toRate: rate };
        weight = { start: time, from: motion.kind === 'dance' ? 1 : 0, to: motion.kind === 'dance' ? 1 : 0 };
        return;
      }
      const [position, current] = turningAt(turning, time);
      turning = motion.kind === 'spin'
        ? { kind: 'ramp', start: time, from: position, rate: current, toRate: rate }
        : { kind: 'settle', start: time, from: position, rate: current, ...planSettle(position, current) };
      weight = { start: time, from: weightAt(time), to: motion.kind === 'dance' ? 1 : 0 };
    },

    advance(elapsed: number): Pose {
      begun = true;
      time += elapsed;
      bobPhase = (bobPhase + elapsed * BOB_PER_MS) % (2 * Math.PI);
      let [position] = turningAt(turning, time);
      // Once a ramp is over, restart it from here so precision does not decay.
      if (turning.kind === 'ramp' && time - turning.start > TRANSITION_MS) {
        position %= 1;
        turning = { kind: 'ramp', start: time, from: position, rate: turning.toRate, toRate: turning.toRate };
      }
      const dance = smooth(weightAt(time));
      return {
        y: (1 - dance) * Math.sin(bobPhase) * BOB,
        // The same framing in both modes avoids camera movement as they blend.
        reach: BOB,
        yaw: position * 2 * Math.PI,
        roll: dance * sway(time),
      };
    },
  };
}
