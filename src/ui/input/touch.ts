// Touch scheme. One finger taps and box-selects, two fingers pan and pinch.

import { panBy, setZoom, toWorld } from '../../render/camera.ts';
import type { App } from '../app.ts';
import { boxSelect, tapAt, toolAt, usesTool, type ToolState } from './actions.ts';
import type { Button } from './gestures.ts';

export interface Scheme {
  tap(x: number, y: number, button: Button, shift: boolean): void;
  dragStart(x: number, y: number, button: Button): void;
  dragMove(x: number, y: number, button: Button): void;
  dragEnd(x: number, y: number, button: Button): void;
  pan(dx: number, dy: number): void;
  pinch(scale: number, cx: number, cy: number): void;
  wheel(dy: number, x: number, y: number): void;
  hover(x: number | null, y: number | null): void;
}

export function touchScheme(app: App): Scheme {
  let ts: ToolState = { lt: -1, lx: 0, ly: 0 }, pinchAcc = 1, tool = false, start = { x: 0, y: 0 };
  const W = (x: number, y: number): { x: number; y: number } => toWorld(app.cam, x, y);
  return {
    tap(x, y) {
      if (!app.running) return;
      const p = W(x, y);
      ts = { lt: -1, lx: p.x, ly: p.y };
      if (usesTool(app)) { toolAt(app, p.x, p.y, ts, true); return; }
      tapAt(app, p.x, p.y);
    },
    dragStart(x, y) {
      if (!app.running) return;
      const p = W(x, y);
      ts = { lt: -1, lx: p.x, ly: p.y };
      start = p;
      tool = usesTool(app);
      if (tool) toolAt(app, p.x, p.y, ts, true);
    },
    dragMove(x, y) {
      if (!app.running) return;
      const p = W(x, y);
      if (tool) { toolAt(app, p.x, p.y, ts, false); return; }
      app.drag = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    },
    dragEnd() {
      if (tool) { tool = false; return; }
      if (app.drag && app.world && app.world.phase === 'play' && app.tool === 'cmd') boxSelect(app, app.drag);
      app.drag = null;
    },
    pan(dx, dy) { panBy(app.cam, dx, dy); },
    pinch(scale, cx, cy) {
      pinchAcc *= scale;
      if (pinchAcc > 1.3) { setZoom(app.cam, app.cam.zoom + 1, cx, cy); pinchAcc = 1; }
      else if (pinchAcc < 0.77) { setZoom(app.cam, app.cam.zoom - 1, cx, cy); pinchAcc = 1; }
    },
    wheel() {},
    hover() {},
  };
}
