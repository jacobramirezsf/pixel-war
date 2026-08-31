// Touch scheme. One finger taps and box-selects, two fingers pan and pinch.

import { fling, panBy, settleZoom, toWorld, zoomTo } from '../../render/camera.ts';
import type { App } from '../app.ts';
import { boxSelect, dragTool, placeRelease, tapAt, toolAt, usesTool, type ToolState } from './actions.ts';
import type { Button } from './gestures.ts';

export interface Scheme {
  tap(x: number, y: number, button: Button, shift: boolean): void;
  dragStart(x: number, y: number, button: Button): void;
  dragMove(x: number, y: number, button: Button): void;
  dragEnd(x: number, y: number, button: Button): void;
  pan(dx: number, dy: number): void;
  pinch(scale: number, cx: number, cy: number): void;
  pinchEnd(): void;
  wheel(dy: number, x: number, y: number, dx: number, ctrl: boolean): void;
  hover(x: number | null, y: number | null): void;
}

export function touchScheme(app: App): Scheme {
  let ts: ToolState = { lt: -1, lx: 0, ly: 0 }, tool = false, panning = false, start = { x: 0, y: 0 }, last = { x: 0, y: 0 };
  const samples: { x: number; y: number; t: number }[] = [];
  const sample = (x: number, y: number): void => { samples.push({ x, y, t: performance.now() }); if (samples.length > 6) samples.shift(); };
  const W = (x: number, y: number): { x: number; y: number } => toWorld(app.cam, x, y);
  return {
    tap(x, y) {
      if (!app.running) return;
      const p = W(x, y);
      ts = { lt: -1, lx: p.x, ly: p.y };
      if (usesTool(app)) { toolAt(app, p.x, p.y, ts, true); placeRelease(app); return; }
      tapAt(app, p.x, p.y);
    },
    dragStart(x, y) {
      if (!app.running) return;
      const p = W(x, y);
      ts = { lt: -1, lx: p.x, ly: p.y };
      start = p;
      last = { x, y };
      samples.length = 0;
      sample(x, y);
      tool = dragTool(app);
      panning = !tool && !app.selectMode;
      if (tool) toolAt(app, p.x, p.y, ts, true);
    },
    dragMove(x, y) {
      if (!app.running) return;
      if (panning) { panBy(app.cam, x - last.x, y - last.y); last = { x, y }; sample(x, y); return; }
      const p = W(x, y);
      if (tool) { toolAt(app, p.x, p.y, ts, false); return; }
      app.drag = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    },
    dragEnd() {
      if (panning) {
        panning = false;
        // Fling from the last few samples so the map keeps gliding.
        const a = samples[0], b = samples[samples.length - 1];
        if (a && b && b.t > a.t && performance.now() - b.t < 80) { const dt = (b.t - a.t) / 1000; fling(app.cam, ((b.x - a.x) / dt) * 0.9, ((b.y - a.y) / dt) * 0.9); }
        return;
      }
      if (tool) { tool = false; placeRelease(app); return; }
      if (app.drag && app.world && app.world.phase === 'play' && app.tool === 'cmd') boxSelect(app, app.drag);
      app.drag = null;
    },
    pan(dx, dy) { panBy(app.cam, dx, dy); },
    pinch(scale, cx, cy) { zoomTo(app.cam, app.cam.zoom * scale, cx, cy); },
    pinchEnd() { settleZoom(app.cam); },
    wheel() {},
    hover() {},
  };
}
