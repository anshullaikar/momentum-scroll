import { GestureIntent, normalizeWheelDelta, wheelMomentum } from './gestureIntent';

import type { Axis, GestureIntentOptions } from './gestureIntent';

export type Direction = 1 | -1;
export type GestureSource = 'wheel' | 'touch' | 'key';

export interface Gesture {
  /** 1 = down / right (forward), -1 = up / left (back) */
  direction: Direction;
  source: GestureSource;
  /** The event that completed the gesture */
  event: Event;
}

export interface OnGestureOptions {
  /** Axis to track (default 'y') */
  axis?: Axis;
  /**
   * Only handle (and block) input while this returns true, e.g. while a
   * section is pinned. Default: always.
   */
  enabled?: () => boolean;
  /**
   * Input keeps being blocked but doesn't fire while this returns true, e.g.
   * while your step animation runs. Default: never.
   */
  busy?: () => boolean;
  /**
   * Return true to let a new gesture in this direction scroll the page
   * normally instead of firing, e.g. past the last step of a section.
   */
  passThrough?: (direction: Direction) => boolean;
  /** px a wheel / trackpad gesture must travel before it counts (default 24) */
  threshold?: number;
  /** px a finger must travel to count as a swipe (default 40) */
  swipeDistance?: number;
  /** Also handle arrow keys, PageUp / PageDown and Space (default false) */
  keys?: boolean;
  /**
   * Stop blocked events from reaching other listeners (e.g. a smooth-scroll
   * library) as well as preventing their default (default true)
   */
  stopPropagation?: boolean;
  /** Tuning for telling new gestures from inertia */
  intent?: GestureIntentOptions;
}

const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const FORWARD_KEYS: Record<Axis, Set<string>> = {
  y: new Set(['ArrowDown', 'PageDown']),
  x: new Set(['ArrowRight']),
};
const BACK_KEYS: Record<Axis, Set<string>> = {
  y: new Set(['ArrowUp', 'PageUp']),
  x: new Set(['ArrowLeft']),
};

const pageSize = (axis: Axis) =>
  typeof window === 'undefined' ? 800 : axis === 'y' ? window.innerHeight : window.innerWidth;

/**
 * Calls `handler` once per real gesture: a wheel or trackpad swipe, a touch
 * swipe or (with `keys`) a key press. A trackpad's 2–3 s of inertia after the
 * fingers lift belongs to the same gesture and never fires again; only a new
 * swipe does.
 *
 * While `enabled`, every event of a handled gesture is blocked (the page
 * doesn't scroll), so your handler decides what happens. Listeners sit on
 * `target` in the capture phase, ahead of most smooth-scroll libraries.
 *
 * Returns a function that removes the listeners.
 *
 * @example
 * const off = onGesture(window, ({ direction }) => goToSlide(current + direction));
 */
export function onGesture(
  target: Window | HTMLElement,
  handler: (gesture: Gesture) => void,
  {
    axis = 'y',
    enabled = () => true,
    busy = () => false,
    passThrough = () => false,
    threshold = 24,
    swipeDistance = 40,
    keys = false,
    stopPropagation = true,
    intent: intentOptions,
  }: OnGestureOptions = {},
): () => void {
  const intent = new GestureIntent(intentOptions);

  const block = (event: Event) => {
    if (event.cancelable) event.preventDefault();
    if (stopPropagation) event.stopPropagation();
  };

  const fire = (direction: number, source: GestureSource, event: Event) =>
    handler({ direction: direction > 0 ? 1 : -1, source, event });

  // ─── Wheel / trackpad ────────────────────────────────────────────
  let used = false; // this gesture already fired: the rest is inertia
  let passing = false; // this gesture passes through: leave it alone
  let travel = 0; // px moved so far (vs threshold)
  let wasEnabled = false;

  const onWheel = (event: Event) => {
    const wheel = event as WheelEvent;
    const delta = normalizeWheelDelta(wheel, pageSize(axis), axis);
    if (!delta) return;

    const fresh = intent.isNewGesture({
      delta,
      time: wheel.timeStamp,
      momentum: wheelMomentum(wheel),
    });

    if (!enabled()) {
      wasEnabled = false;
      return;
    }

    if (fresh) {
      used = false;
      passing = false;
      travel = 0;
    }

    // Became enabled in the middle of a gesture (e.g. scrolled into a pinned
    // section): swallow the rest of it rather than firing on its inertia
    const entering = !wasEnabled;
    wasEnabled = true;
    if (entering && !fresh) {
      block(event);
      used = true;
      return;
    }

    if (passing) return;
    if (!used && passThrough(delta > 0 ? 1 : -1)) {
      passing = true;
      return;
    }

    block(event);
    if (used || busy()) return;

    travel += delta;
    if (Math.abs(travel) < threshold) return;

    used = true;
    fire(travel, 'wheel', event);
  };

  // ─── Touch ───────────────────────────────────────────────────────
  let touchStart = 0;
  let touchDirection = 0;
  let touchPassing = false;
  let touchUsed = false;
  let touchBlocked = false;

  const point = (event: TouchEvent) => {
    const touch = event.touches[0];
    return touch ? (axis === 'y' ? touch.clientY : touch.clientX) : undefined;
  };

  const onTouchStart = (event: Event) => {
    touchStart = point(event as TouchEvent) ?? 0;
    touchDirection = 0;
    touchPassing = false;
    touchUsed = false;
    touchBlocked = false;
  };

  const onTouchMove = (event: Event) => {
    const touch = event as TouchEvent;
    if (!enabled() || touchPassing || touch.touches.length > 1) return;

    const distance = touchStart - (point(touch) ?? touchStart);
    if (!touchDirection) {
      if (Math.abs(distance) < 8) return;
      touchDirection = Math.sign(distance);
      if (passThrough(touchDirection > 0 ? 1 : -1)) {
        touchPassing = true;
        return;
      }
    }

    block(event);
    touchBlocked = true;
    if (touchUsed || busy() || Math.abs(distance) < swipeDistance) return;

    touchUsed = true;
    fire(touchDirection, 'touch', event);
  };

  // Keep smooth-scroll libraries from turning a swallowed swipe into a fling
  const onTouchEnd = (event: Event) => {
    if (touchBlocked && stopPropagation) event.stopPropagation();
  };

  // ─── Keyboard ────────────────────────────────────────────────────
  const onKeyDown = (event: Event) => {
    const key = event as KeyboardEvent;
    if (!enabled() || key.defaultPrevented) return;
    if (key.altKey || key.ctrlKey || key.metaKey) return;

    const element = key.target instanceof Element ? key.target : null;
    if (element?.closest(EDITABLE)) return;

    let direction = 0;
    if (FORWARD_KEYS[axis].has(key.key)) direction = 1;
    else if (BACK_KEYS[axis].has(key.key)) direction = -1;
    // Space pages down, except on buttons / links where it activates them
    else if (axis === 'y' && key.key === ' ' && !element?.closest('button, a')) {
      direction = key.shiftKey ? -1 : 1;
    }
    if (!direction || passThrough(direction > 0 ? 1 : -1)) return;

    block(event);
    if (!busy() && !key.repeat) fire(direction, 'key', event);
  };

  const active = { capture: true, passive: false } as const;
  const passive = { capture: true, passive: true } as const;
  target.addEventListener('wheel', onWheel, active);
  target.addEventListener('touchstart', onTouchStart, passive);
  target.addEventListener('touchmove', onTouchMove, active);
  target.addEventListener('touchend', onTouchEnd, { capture: true });
  if (keys) target.addEventListener('keydown', onKeyDown, { capture: true });

  return () => {
    target.removeEventListener('wheel', onWheel, { capture: true });
    target.removeEventListener('touchstart', onTouchStart, { capture: true });
    target.removeEventListener('touchmove', onTouchMove, { capture: true });
    target.removeEventListener('touchend', onTouchEnd, { capture: true });
    if (keys) target.removeEventListener('keydown', onKeyDown, { capture: true });
  };
}
