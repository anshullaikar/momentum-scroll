import { createStepper } from '../src';

import { after, gesture, swipe } from './helpers';

import type { Stepper } from '../src';

describe('createStepper', () => {
  let stepper: Stepper | undefined;
  afterEach(() => {
    stepper?.destroy();
    vi.useRealTimers();
  });

  it('should move one step per swipe', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    stepper = createStepper(window, { count: 3, onChange });

    const first = swipe();
    gesture(first);
    expect(stepper.index).toBe(1);

    vi.advanceTimersByTime(700);
    gesture(swipe(), after(first));
    expect(stepper.index).toBe(2);
    expect(onChange).toHaveBeenNthCalledWith(1, 1, 1, 'wheel');
    expect(onChange).toHaveBeenNthCalledWith(2, 2, 1, 'wheel');
  });

  it('should ignore new swipes until the lock runs out', () => {
    vi.useFakeTimers();
    stepper = createStepper(window, { count: 3, onChange: () => {}, lock: 700 });
    const first = swipe();
    gesture(first);
    gesture(swipe(), after(first));
    expect(stepper.index).toBe(1);
  });

  it('should wait for a returned promise instead of the lock', async () => {
    let finish!: () => void;
    stepper = createStepper(window, {
      count: 3,
      onChange: () => new Promise<void>((resolve) => (finish = resolve)),
    });
    const first = swipe();
    gesture(first);
    gesture(swipe(), after(first));
    expect(stepper.index).toBe(1);

    finish();
    await Promise.resolve();
    gesture(swipe(), after(first) * 2);
    expect(stepper.index).toBe(2);
  });

  it('should let a swipe past the last step scroll the page', () => {
    vi.useFakeTimers();
    stepper = createStepper(window, { count: 2, start: 1, onChange: () => {} });
    const events = gesture(swipe());
    expect(stepper.index).toBe(1);
    expect(events.some((event) => event.defaultPrevented)).toBe(false);
  });

  it('should hold at the ends when release is off', () => {
    vi.useFakeTimers();
    stepper = createStepper(window, { count: 2, start: 1, onChange: () => {}, release: false });
    const events = gesture(swipe());
    expect(stepper.index).toBe(1);
    expect(events.every((event) => event.defaultPrevented)).toBe(true);
  });

  it('should move from code too', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    stepper = createStepper(window, { count: 4, onChange });
    stepper.goTo(3);
    expect(stepper.index).toBe(3);
    expect(onChange).toHaveBeenCalledWith(3, 1, 'api');
    stepper.prev();
    expect(stepper.index).toBe(2);
  });
});
