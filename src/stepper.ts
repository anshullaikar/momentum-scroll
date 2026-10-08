import { onGesture } from './onGesture';

import type { Direction, GestureSource, OnGestureOptions } from './onGesture';

export interface StepperOptions
  extends Omit<OnGestureOptions, 'busy' | 'passThrough'> {
  /** Number of steps */
  count: number;
  /** Starting step (default 0) */
  start?: number;
  /**
   * Called when the step changes. Return a promise (e.g. your scroll or
   * slide animation) to block new gestures until it settles; otherwise they
   * are blocked for `lock` ms.
   */
  onChange: (index: number, direction: Direction, source: GestureSource | 'api') => void | Promise<unknown>;
  /** ms after a step during which new gestures are ignored (default 700) */
  lock?: number;
  /**
   * Past the first / last step, let a new gesture scroll the page normally
   * so people can leave the section (default true). False clamps instead.
   */
  release?: boolean;
}

export interface Stepper {
  /** The current step */
  readonly index: number;
  /** Moves to a step (e.g. from a tab click), same as a gesture would */
  goTo: (index: number) => void;
  next: () => void;
  prev: () => void;
  /** Removes the listeners */
  destroy: () => void;
}

/**
 * One gesture = one step. A trackpad swipe moves exactly one step however
 * long its inertia runs; the next swipe moves the next one.
 *
 * @example
 * const stepper = createStepper(window, {
 *   count: slides.length,
 *   enabled: () => section.dataset.pinned === 'true',
 *   onChange: (index) => showSlide(index),
 * });
 */
export function createStepper(
  target: Window | HTMLElement,
  { count, start = 0, onChange, lock = 700, release = true, ...options }: StepperOptions,
): Stepper {
  const clamp = (i: number) => Math.max(0, Math.min(count - 1, i));

  let index = clamp(start);
  let locked = false;
  let unlockTimer: ReturnType<typeof setTimeout> | undefined;

  const unlock = () => {
    clearTimeout(unlockTimer);
    locked = false;
  };

  const move = (next: number, direction: Direction, source: GestureSource | 'api') => {
    next = clamp(next);
    if (next === index) return;

    index = next;
    locked = true;
    clearTimeout(unlockTimer);

    const result = onChange(index, direction, source);
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      (result as Promise<unknown>).then(unlock, unlock);
    } else {
      unlockTimer = setTimeout(unlock, lock);
    }
  };

  const off = onGesture(target, ({ direction, source }) => move(index + direction, direction, source), {
    ...options,
    busy: () => locked,
    // A new gesture past either end leaves the section
    passThrough: (direction) => release && !locked && (index + direction < 0 || index + direction >= count),
  });

  return {
    get index() {
      return index;
    },
    goTo: (i) => move(i, i >= index ? 1 : -1, 'api'),
    next: () => move(index + 1, 1, 'api'),
    prev: () => move(index - 1, -1, 'api'),
    destroy() {
      clearTimeout(unlockTimer);
      off();
    },
  };
}
