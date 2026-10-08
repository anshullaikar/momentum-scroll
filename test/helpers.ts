export const FRAME = 16; // ms between wheel events while something is moving

/** A macOS-style trackpad swipe: quick ramp-up, then a long decaying inertia tail */
export const swipe = (peak = 60, sign = 1) => {
  const ramp = [0.05, 0.15, 0.35, 0.6, 0.85, 1].map((f) => f * peak);
  const tail: number[] = [];
  for (let d = peak * 0.95; d >= 1; d *= 0.93) tail.push(d);
  return [...ramp, ...tail].map((d) => Math.max(1, Math.round(d)) * sign);
};

/** Dispatches a wheel event with a fixed timestamp; returns it */
export const wheel = (deltaY: number, time: number, target: EventTarget = window) => {
  const event = new WheelEvent('wheel', { deltaY, cancelable: true, bubbles: true });
  Object.defineProperty(event, 'timeStamp', { value: time });
  target.dispatchEvent(event);
  return event;
};

/** Dispatches a whole gesture, one event per frame from `start`; returns the events */
export const gesture = (deltas: number[], start = 0, target: EventTarget = window) =>
  deltas.map((delta, i) => wheel(delta, start + i * FRAME, target));

/** Time just after a gesture dispatched from `start` has ended plus an idle gap */
export const after = (deltas: number[], start = 0) => start + deltas.length * FRAME + 500;

/** Dispatches a touch event with one finger at `y` */
export const touch = (type: string, y: number) => {
  const event = new Event(type, { cancelable: true, bubbles: true });
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [{ clientX: 0, clientY: y }],
  });
  window.dispatchEvent(event);
  return event;
};

export const key = (keyName: string, target: EventTarget = window) => {
  const event = new KeyboardEvent('keydown', { key: keyName, cancelable: true, bubbles: true });
  target.dispatchEvent(event);
  return event;
};
