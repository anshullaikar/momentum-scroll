import { GestureIntent, normalizeWheelDelta } from '../src';

const FRAME = 16; // ms between wheel events while something is moving

// Feeds deltas one frame apart from `start`; returns which samples began a gesture
const feed = (intent: GestureIntent, deltas: number[], start = 0, gap = FRAME) =>
  deltas.map((delta, i) => intent.isNewGesture({ delta, time: start + i * gap }));

// A macOS-style trackpad swipe: quick ramp-up while the fingers move, then a
// long decaying inertia tail after they lift
const swipe = (peak = 60, sign = 1) => {
  const ramp = [0.05, 0.15, 0.35, 0.6, 0.85, 1].map((f) => f * peak);
  const tail: number[] = [];
  for (let d = peak * 0.95; d >= 1; d *= 0.93) tail.push(d);
  return [...ramp, ...tail].map((d) => Math.max(1, Math.round(d)) * sign);
};

describe('gestureIntent', () => {
  describe('GestureIntent', () => {
    it('should treat the first event as a new gesture', () => {
      const intent = new GestureIntent();
      expect(intent.isNewGesture({ delta: 5, time: 0 })).toBe(true);
    });

    it('should count a whole trackpad swipe, ramp-up and inertia, as one gesture', () => {
      const intent = new GestureIntent();
      const deltas = swipe();
      expect(deltas.length).toBeGreaterThan(40); // 2–3 s of events, as on macOS
      const fresh = feed(intent, deltas);
      expect(fresh.filter(Boolean)).toHaveLength(1);
      expect(fresh[0]).toBe(true);
    });

    it('should ignore small bumps in the inertia tail', () => {
      const intent = new GestureIntent();
      const fresh = feed(intent, [10, 30, 60, 50, 44, 46, 40, 41, 35, 36, 30, 22, 23, 15]);
      expect(fresh.filter(Boolean)).toHaveLength(1);
    });

    it('should start a new gesture after an idle gap', () => {
      const intent = new GestureIntent();
      const first = swipe();
      feed(intent, first);
      const lastTime = (first.length - 1) * FRAME;
      expect(intent.isNewGesture({ delta: 4, time: lastTime + 200 })).toBe(true);
    });

    it('should not start a new gesture for a gap shorter than idle', () => {
      const intent = new GestureIntent({ idle: 140 });
      feed(intent, [10, 30, 60, 50]);
      expect(intent.isNewGesture({ delta: 40, time: 3 * FRAME + 100 })).toBe(false);
    });

    it('should start a new gesture when the direction flips', () => {
      const intent = new GestureIntent();
      feed(intent, [10, 30, 60, 50, 40]);
      expect(intent.isNewGesture({ delta: -8, time: 5 * FRAME })).toBe(true);
    });

    it('should catch a new swipe made during the previous inertia', () => {
      const intent = new GestureIntent();
      // Inertia decaying to ~12, then a fresh swipe ramps back up
      const deltas = [10, 30, 60, 55, 45, 36, 28, 20, 14, 12, 16, 24, 38, 56, 70];
      const fresh = feed(intent, deltas);
      expect(fresh.filter(Boolean)).toHaveLength(2);
      expect(fresh.indexOf(true, 1)).toBeGreaterThan(deltas.indexOf(12));
    });

    it('should not treat the ramp-up of a swipe as a second gesture', () => {
      const intent = new GestureIntent();
      const fresh = feed(intent, [2, 4, 8, 16, 32, 64, 90]);
      expect(fresh.filter(Boolean)).toHaveLength(1);
    });

    it('should group fast mouse-wheel notches into one gesture', () => {
      const intent = new GestureIntent();
      const fresh = feed(intent, [100, 100, 100, 100, 100], 0, 50);
      expect(fresh.filter(Boolean)).toHaveLength(1);
    });

    it('should treat slow mouse-wheel notches as separate gestures', () => {
      const intent = new GestureIntent();
      const fresh = feed(intent, [100, 100, 100], 0, 300);
      expect(fresh).toEqual([true, true, true]);
    });

    it('should keep the gesture alive through tiny tail deltas', () => {
      const intent = new GestureIntent({ idle: 140 });
      feed(intent, [10, 30, 60, 40, 20, 8]);
      // 1px events every frame for a while: the tail is still running
      const tail = feed(intent, Array(20).fill(1), 6 * FRAME);
      expect(tail.some(Boolean)).toBe(false);
      expect(intent.isNewGesture({ delta: 3, time: 26 * FRAME })).toBe(false);
    });

    it('should use the browser momentum flag when there is one', () => {
      const intent = new GestureIntent();
      expect(intent.isNewGesture({ delta: 20, time: 0, momentum: false })).toBe(true);
      expect(intent.isNewGesture({ delta: 40, time: 16, momentum: false })).toBe(false);
      // Inertia rising slightly still isn't a gesture when flagged as momentum
      expect(intent.isNewGesture({ delta: 30, time: 32, momentum: true })).toBe(false);
      expect(intent.isNewGesture({ delta: 31, time: 48, momentum: true })).toBe(false);
      expect(intent.isNewGesture({ delta: 32, time: 64, momentum: true })).toBe(false);
      expect(intent.isNewGesture({ delta: 33, time: 80, momentum: true })).toBe(false);
      // Fingers back on the pad
      expect(intent.isNewGesture({ delta: 5, time: 96, momentum: false })).toBe(true);
    });

    it('should ignore events that arrive out of order', () => {
      const intent = new GestureIntent();
      feed(intent, [10, 30, 60], 1000);
      expect(intent.isNewGesture({ delta: -50, time: 900 })).toBe(false);
    });

    it('should start over after reset', () => {
      const intent = new GestureIntent();
      feed(intent, [10, 30, 60]);
      intent.reset();
      expect(intent.isNewGesture({ delta: 60, time: 3 * FRAME })).toBe(true);
    });
  });

  describe('normalizeWheelDelta', () => {
    const base = { deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false };

    it('should pass pixel deltas through', () => {
      expect(normalizeWheelDelta({ ...base, deltaY: 42 }, 800)).toBe(42);
    });

    it('should convert line and page deltas to pixels', () => {
      expect(normalizeWheelDelta({ ...base, deltaY: 3, deltaMode: 1 }, 800)).toBe(48);
      expect(normalizeWheelDelta({ ...base, deltaY: 1, deltaMode: 2 }, 800)).toBe(800);
    });

    it('should ignore mostly-horizontal scrolling', () => {
      expect(normalizeWheelDelta({ ...base, deltaX: 30, deltaY: 10 }, 800)).toBe(0);
    });

    it('should ignore pinch-zoom', () => {
      expect(normalizeWheelDelta({ ...base, deltaY: 10, ctrlKey: true }, 800)).toBe(0);
    });

    it('should track the x axis when asked', () => {
      expect(normalizeWheelDelta({ ...base, deltaX: 30, deltaY: 10 }, 800, 'x')).toBe(30);
      expect(normalizeWheelDelta({ ...base, deltaX: 10, deltaY: 30 }, 800, 'x')).toBe(0);
    });
  });
});
