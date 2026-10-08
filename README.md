# momentum-scroll

One callback per real scroll gesture.

On a Mac trackpad a single swipe keeps firing `wheel` events for 2–3 seconds after the fingers lift, with nothing in the events to say which ones are inertia. Build "one swipe = one slide" on raw wheel events and a single swipe skips three slides, or the page keeps moving after the user has stopped.

`momentum-scroll` tells a fresh swipe apart from the momentum of the last one, so your handler runs once per gesture: trackpad, mouse wheel, touch or keys.

- No dependencies, under 3 kB gzipped
- Works with any framework, or none
- Plays well with smooth-scroll libraries (Lenis, Locomotive) and GSAP ScrollTrigger pins
- TypeScript types included

```sh
npm install momentum-scroll
```

## Quick start

```ts
import { onGesture } from 'momentum-scroll';

const off = onGesture(window, ({ direction }) => {
  goToSlide(current + direction); // direction: 1 = down, -1 = up
});

// later
off();
```

While a gesture is handled, all of its events (including the inertia) are blocked, so the page doesn't scroll underneath your animation.

## Steps in a pinned section

`createStepper` keeps the index for you, locks while your animation runs, and lets people scroll out of the section past the first or last step.

```ts
import { createStepper } from 'momentum-scroll';

const stepper = createStepper(window, {
  count: steps.length,
  enabled: () => section.classList.contains('is-pinned'),
  keys: true,
  onChange: (index) => showStep(index), // return a promise to lock until it settles
});

tabs.forEach((tab, i) => tab.addEventListener('click', () => stepper.goTo(i)));
```

With GSAP ScrollTrigger, use `enabled: () => trigger.isActive` and scroll to the step's position in `onChange`.

## React

```tsx
import { useEffect } from 'react';
import { onGesture } from 'momentum-scroll';

useEffect(() => onGesture(window, ({ direction }) => setIndex((i) => i + direction)), []);
```

`onGesture` returns its own cleanup, so it fits straight into `useEffect`.

## API

### `onGesture(target, handler, options?)`

Calls `handler({ direction, source, event })` once per gesture. `source` is `'wheel'`, `'touch'` or `'key'`. Returns a function that removes the listeners.

| Option | Default | |
|---|---|---|
| `axis` | `'y'` | `'x'` for horizontal swiping |
| `enabled` | always | Only handle (and block) input while this returns true |
| `busy` | never | Keep blocking input, but don't fire, while this returns true (e.g. mid-animation) |
| `passThrough` | never | `(direction) => boolean`: let this gesture scroll the page instead |
| `threshold` | `24` | px a wheel gesture must travel before it counts |
| `swipeDistance` | `40` | px a finger must travel before it counts |
| `keys` | `false` | Also handle arrow keys, PageUp / PageDown and Space (ignored while typing) |
| `stopPropagation` | `true` | Keep blocked events from reaching other listeners, such as a smooth scroller |
| `intent` | | Tuning for gesture detection; see `GestureIntent` |

If the user scrolls into an enabled area in the middle of a gesture, the rest of that gesture is swallowed rather than firing on its inertia.

### `createStepper(target, options)`

Everything `onGesture` takes, except `busy` and `passThrough`, plus:

| Option | Default | |
|---|---|---|
| `count` | required | Number of steps |
| `onChange` | required | `(index, direction, source)`; return a promise to block gestures until it resolves |
| `start` | `0` | Starting step |
| `lock` | `700` | ms to ignore new gestures after a step, when `onChange` returns nothing |
| `release` | `true` | Past the first or last step, let the gesture scroll the page |

Returns `{ index, goTo(i), next(), prev(), destroy() }`.

### `GestureIntent`

The detector on its own, for custom input handling. Feed it samples and it tells you which one starts a new gesture.

```ts
import { GestureIntent, normalizeWheelDelta, wheelMomentum } from 'momentum-scroll';

const intent = new GestureIntent();

window.addEventListener('wheel', (event) => {
  const delta = normalizeWheelDelta(event, window.innerHeight);
  if (!delta) return;
  const fresh = intent.isNewGesture({ delta, time: event.timeStamp, momentum: wheelMomentum(event) });
  if (fresh) console.log('new swipe', Math.sign(delta));
});
```

| Option | Default | |
|---|---|---|
| `idle` | `140` | ms without events after which the next one starts a new gesture |
| `minDelta` | `2` | Smaller deltas keep a gesture alive but aren't judged |
| `rampEvents` | `4` | Rising deltas in a row (after decay) that mark a new swipe |
| `decayRatio` | `0.8` | A gesture is decaying once deltas drop below peak × this |

`normalizeWheelDelta(event, pageSize, axis?)` converts line and page deltas to px, and returns 0 for pinch-zoom or movement mostly along the other axis. `wheelMomentum(event)` reads `WheelEvent.momentum` where the browser provides it.

## How it decides

A sample starts a new gesture when, in order:

1. The browser says so: `WheelEvent.momentum` (proposed for Chrome) turns from true back to false.
2. Nothing arrived for `idle` ms. Momentum events come every frame, so a gap means nothing was moving.
3. The direction flipped. Inertia never reverses.
4. Deltas rose for `rampEvents` samples in a row after the gesture had started to decay: a new swipe during the tail of the last one.

Heuristics 2–4 follow [lethargy](https://github.com/snelsi/lethargy-ts), applied per gesture rather than per event, so the ramp-up at the start of a swipe isn't mistaken for a second one.

## License

MIT © Anshul Laikar
