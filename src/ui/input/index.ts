// Attach the gesture layer and route each pointer to the scheme for its type.
// Adding a scheme means adding one more entry here, nothing in the sim.

import type { App } from '../app.ts';
import { attachGestures, type Button } from './gestures.ts';
import { mouseScheme } from './mouse.ts';
import { touchScheme, type Scheme } from './touch.ts';

export function attachInput(app: App): void {
  const schemes: Record<string, Scheme> = { mouse: mouseScheme(app), touch: touchScheme(app) };
  const pick = (type: string): Scheme => schemes[type] ?? schemes.touch;
  let active: Scheme = pick('touch');
  attachGestures(app.cv, {
    tap: (x, y, b: Button, type, shift) => pick(type).tap(x, y, b, shift),
    dragStart: (x, y, b, type) => { active = pick(type); if (type === 'mouse' && app.keys.has(' ')) app.spaceDragged = true; active.dragStart(x, y, b); },
    dragMove: (x, y, b) => active.dragMove(x, y, b),
    dragEnd: (x, y, b) => active.dragEnd(x, y, b),
    pan: (dx, dy) => active.pan(dx, dy),
    pinch: (s, cx, cy) => active.pinch(s, cx, cy),
    wheel: (dy, x, y) => schemes.mouse.wheel(dy, x, y),
    hover: (x, y) => schemes.mouse.hover(x, y),
  });
}
