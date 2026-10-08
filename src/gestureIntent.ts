/**
 * Tells a fresh wheel gesture apart from the one already in progress and the
 * inertia that follows it.
 *
 * Trackpads (macOS especially) keep firing wheel events for 2–3 s after the
 * fingers lift, with decaying deltas and no flag saying so. Mouse wheels send
 * bursts of equal-sized notches. A one-step-per-gesture UI has to treat all
 * of that as one input and only react again to a real new swipe.
 *
 * A sample starts a new gesture when (checked in order):
 * 1. The browser says so: `WheelEvent.momentum` (proposed for Chrome) turns
 *    from true back to false (fingers are back on the pad).
 * 2. Enough time passed since the last event (`idle` ms): the previous
 *    gesture and its inertia have ended. Momentum events arrive every frame,
 *    so a gap means nothing was moving.
 * 3. The direction flipped: inertia never reverses.
 * 4. Deltas rose for `rampEvents` samples in a row after the gesture had
 *    started to decay: a new swipe during the tail of the last one.
 *
 * Heuristics 2–4 follow lethargy (github.com/snelsi/lethargy-ts), applied per
 * gesture rather than per event: the ramp-up at the start of a swipe is part
 * of the same gesture, not a new one.
 */

export interface WheelSample {
  /** Scroll delta in px along the axis being tracked (see normalizeWheelDelta) */
  delta: number;
  /** Event timestamp in ms */
  time: number;
  /** `WheelEvent.momentum` where the browser provides it */
  momentum?: boolean;
}

export interface GestureIntentOptions {
  /** ms without events after which the next event starts a new gesture (default 140) */
  idle?: number;
  /** |delta| below this is noise: it keeps the gesture alive but is not judged (default 2) */
  minDelta?: number;
  /** Consecutive rising deltas (after decay) that mark a new swipe (default 4) */
  rampEvents?: number;
  /** A gesture counts as decaying once |delta| drops below peak × this (default 0.8) */
  decayRatio?: number;
}

export class GestureIntent {
  private readonly idle: number;
  private readonly minDelta: number;
  private readonly rampEvents: number;
  private readonly decayRatio: number;

  private lastTime = -Infinity;
  private lastSign = 0;
  private lastMomentum: boolean | undefined;
  private peak = 0;
  private decaying = false;
  private recent: number[] = [];

  constructor({
    idle = 140,
    minDelta = 2,
    rampEvents = 4,
    decayRatio = 0.8,
  }: GestureIntentOptions = {}) {
    this.idle = idle;
    this.minDelta = minDelta;
    this.rampEvents = Math.max(2, rampEvents);
    this.decayRatio = decayRatio;
  }

  /** Feeds one wheel sample; returns true if it begins a new gesture. */
  isNewGesture({ delta, time, momentum }: WheelSample): boolean {
    // Out-of-order (lagged) events belong to whatever came before them
    if (time < this.lastTime) return false;

    const size = Math.abs(delta);
    const gap = time - this.lastTime;
    this.lastTime = time;

    // Tiny deltas (the very end of inertia) keep the gesture alive only
    if (size < this.minDelta) return false;

    const sign = Math.sign(delta);
    const wasMomentum = this.lastMomentum;
    this.lastMomentum = momentum;

    const fresh =
      gap > this.idle ||
      (momentum === false && wasMomentum === true) ||
      (momentum !== true && sign !== this.lastSign) ||
      (momentum !== true && this.decaying && this.isRamping(size));

    this.lastSign = sign;

    if (fresh) {
      this.peak = size;
      this.decaying = false;
      this.recent = [size];
      return true;
    }

    this.recent.push(size);
    if (this.recent.length > this.rampEvents) this.recent.shift();
    this.peak = Math.max(this.peak, size);
    if (size < this.peak * this.decayRatio) this.decaying = true;
    return false;
  }

  /** Forgets the current gesture (the next sample starts a new one). */
  reset(): void {
    this.lastTime = -Infinity;
    this.lastSign = 0;
    this.lastMomentum = undefined;
    this.peak = 0;
    this.decaying = false;
    this.recent = [];
  }

  // The last `rampEvents` sizes, including this one, strictly increasing
  private isRamping(size: number) {
    const run = [...this.recent, size].slice(-this.rampEvents);
    return run.length === this.rampEvents && run.every((d, i) => i === 0 || d > run[i - 1]);
  }
}

const LINE_HEIGHT = 16; // px per line for deltaMode 1 (Firefox with a mouse wheel)

export type Axis = 'x' | 'y';

/**
 * Wheel delta in px along `axis`, or 0 when the event mostly moves along the
 * other axis or is a pinch-zoom (ctrlKey).
 */
export const normalizeWheelDelta = (
  event: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode' | 'ctrlKey'>,
  pageSize: number,
  axis: Axis = 'y',
): number => {
  const main = axis === 'y' ? event.deltaY : event.deltaX;
  const cross = axis === 'y' ? event.deltaX : event.deltaY;
  if (event.ctrlKey || Math.abs(cross) > Math.abs(main)) return 0;
  if (event.deltaMode === 1) return main * LINE_HEIGHT;
  if (event.deltaMode === 2) return main * pageSize;
  return main;
};

/** `WheelEvent.momentum` when the browser exposes it as a boolean. */
export const wheelMomentum = (event: WheelEvent): boolean | undefined => {
  const value = (event as WheelEvent & { momentum?: unknown }).momentum;
  return typeof value === 'boolean' ? value : undefined;
};
