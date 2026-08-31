// Mouse and keyboard scheme. Left selects, right orders, middle or space drags the view,
// wheel zooms toward the cursor. Hotkeys live in hotkeys.ts.

import { panBy, setZoom, toWorld } from '../../render/camera.ts';
import { unitAt } from '../../sim/queries.ts';
import type { App } from '../app.ts';
import { boxSelect, orderAt, selectAt, toolAt, usesTool, type ToolState } from './actions.ts';
import type { Scheme } from './touch.ts';

export function mouseScheme(app: App): Scheme {
  let ts: ToolState = { lt: -1, lx: 0, ly: 0 }, tool = false, start = { x: 0, y: 0 }, lastPan = { x: 0, y: 0 }, additive = false;
  const W = (x: number, y: number): { x: number; y: number } => toWorld(app.cam, x, y);
  const panning = (button: number): boolean => button === 1 || app.keys.has(' ');
  return {
    tap(x, y, button, shift) {
      if (!app.running) return;
      const p = W(x, y);
      ts = { lt: -1, lx: p.x, ly: p.y };
      if (button === 2) { if (!usesTool(app)) orderAt(app, p.x, p.y); return; }
      if (button === 1) return;
      if (usesTool(app)) { toolAt(app, p.x, p.y, ts, true); return; }
      selectAt(app, p.x, p.y, shift);
    },
    dragStart(x, y, button) {
      if (!app.running) return;
      const p = W(x, y);
      ts = { lt: -1, lx: p.x, ly: p.y };
      start = p;
      lastPan = { x, y };
      additive = app.keys.has('Shift');
      if (panning(button)) { tool = false; return; }
      if (button === 2) { tool = false; return; }
      tool = usesTool(app);
      if (tool) toolAt(app, p.x, p.y, ts, true);
    },
    dragMove(x, y, button) {
      if (!app.running) return;
      if (panning(button)) { panBy(app.cam, x - lastPan.x, y - lastPan.y); lastPan = { x, y }; return; }
      if (button === 2) return;
      const p = W(x, y);
      if (tool) { toolAt(app, p.x, p.y, ts, false); return; }
      app.drag = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    },
    dragEnd(_x, _y, button) {
      if (panning(button) || button === 2) { app.drag = null; return; }
      if (tool) { tool = false; return; }
      if (app.drag && app.world && app.world.phase === 'play' && app.tool === 'cmd') boxSelect(app, app.drag, additive);
      app.drag = null;
    },
    pan(dx, dy) { panBy(app.cam, dx, dy); },
    pinch() {},
    wheel(dy, x, y) { setZoom(app.cam, app.cam.zoom + (dy < 0 ? 1 : -1), x, y); },
    hover(x, y) {
      if (x == null || y == null || !app.world) { app.hover = null; app.mouse = null; return; }
      app.mouse = { x, y };
      const p = W(x, y);
      const u = unitAt(app.world, app.ctl, p.x, p.y);
      app.hover = u ? u.id : null;
    },
  };
}

/** Edge pan: called each frame when enabled. */
export function edgePan(app: App, dt: number): void {
  if (!app.settings.edgePan || !app.mouse || !app.running) return;
  const m = 14, sp = 600 * dt;
  let dx = 0, dy = 0;
  if (app.mouse.x < m) dx = sp; else if (app.mouse.x > app.cam.vw - m) dx = -sp;
  if (app.mouse.y < m) dy = sp; else if (app.mouse.y > app.cam.vh - m) dy = -sp;
  if (dx || dy) panBy(app.cam, dx, dy);
}
