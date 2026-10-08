import { onGesture } from '../src';

import { after, gesture, key, swipe, touch, wheel } from './helpers';

import type { Gesture } from '../src';

describe('onGesture', () => {
  let off: () => void = () => {};
  afterEach(() => off());

  const listen = (options?: Parameters<typeof onGesture>[2]) => {
    const calls: Gesture[] = [];
    off = onGesture(window, (g) => calls.push(g), options);
    return calls;
  };

  describe('wheel and trackpad', () => {
    it('should fire once for a whole trackpad swipe, inertia included', () => {
      const calls = listen();
      gesture(swipe());
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ direction: 1, source: 'wheel' });
    });

    it('should block every event of a handled gesture', () => {
      listen();
      const events = gesture(swipe());
      expect(events.every((event) => event.defaultPrevented)).toBe(true);
    });

    it('should fire again for the next swipe, in its direction', () => {
      const calls = listen();
      const first = swipe();
      gesture(first);
      gesture(swipe(60, -1), after(first));
      expect(calls.map((g) => g.direction)).toEqual([1, -1]);
    });

    it('should wait until a gesture travels past the threshold', () => {
      const calls = listen({ threshold: 50 });
      gesture([10, 10, 10]);
      expect(calls).toHaveLength(0);
      wheel(30, 48);
      expect(calls).toHaveLength(1);
    });

    it('should leave input alone while disabled', () => {
      const calls = listen({ enabled: () => false });
      const events = gesture(swipe());
      expect(calls).toHaveLength(0);
      expect(events.some((event) => event.defaultPrevented)).toBe(false);
    });

    it('should swallow the rest of a gesture that was already going when it became enabled', () => {
      let on = false;
      const calls = listen({ enabled: () => on });
      const deltas = swipe();
      const events = gesture(deltas.slice(0, 8));
      on = true;
      const rest = gesture(deltas.slice(8), 8 * 16);
      expect(calls).toHaveLength(0);
      expect(events.some((event) => event.defaultPrevented)).toBe(false);
      expect(rest.every((event) => event.defaultPrevented)).toBe(true);

      gesture(swipe(), after(deltas));
      expect(calls).toHaveLength(1);
    });

    it('should let a gesture through when passThrough says so', () => {
      const calls = listen({ passThrough: (direction) => direction === -1 });
      const events = gesture(swipe(60, -1));
      expect(calls).toHaveLength(0);
      expect(events.some((event) => event.defaultPrevented)).toBe(false);
    });

    it('should block but not fire while busy', () => {
      let busy = true;
      const calls = listen({ busy: () => busy });
      const first = swipe();
      const events = gesture(first);
      expect(calls).toHaveLength(0);
      expect(events.every((event) => event.defaultPrevented)).toBe(true);

      busy = false;
      gesture(swipe(), after(first));
      expect(calls).toHaveLength(1);
    });

    it('should stop listening once removed', () => {
      const calls = listen();
      off();
      gesture(swipe());
      expect(calls).toHaveLength(0);
    });
  });

  describe('touch', () => {
    it('should fire once per swipe, past swipeDistance', () => {
      const calls = listen({ swipeDistance: 40 });
      touch('touchstart', 500);
      touch('touchmove', 480);
      expect(calls).toHaveLength(0);
      touch('touchmove', 440);
      touch('touchmove', 300);
      touch('touchend', 300);
      expect(calls).toEqual([expect.objectContaining({ direction: 1, source: 'touch' })]);
    });

    it('should fire backwards for a downward finger swipe', () => {
      const calls = listen();
      touch('touchstart', 300);
      touch('touchmove', 400);
      expect(calls[0]).toMatchObject({ direction: -1 });
    });
  });

  describe('keys', () => {
    it('should ignore keys unless asked', () => {
      const calls = listen();
      key('ArrowDown');
      expect(calls).toHaveLength(0);
    });

    it('should handle arrows, paging keys and space', () => {
      const calls = listen({ keys: true });
      key('ArrowDown');
      key('PageUp');
      key(' ');
      expect(calls.map((g) => g.direction)).toEqual([1, -1, 1]);
    });

    it('should leave typing alone', () => {
      const calls = listen({ keys: true });
      const input = document.createElement('input');
      document.body.append(input);
      key('ArrowDown', input);
      input.remove();
      expect(calls).toHaveLength(0);
    });
  });
});
