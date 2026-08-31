// One pointer handler for touch and mouse, as in the prototype. M2 splits this into
// touch and mouse adapters over a camera.

import * as C from '../../sim/commands.ts';
import { clamp, TILE } from '../../sim/map.ts';
import type { App } from '../app.ts';
import { paint } from '../menus/editor.ts';

interface Ptr {
  sx: number; sy: number; x: number; y: number; lx: number; ly: number; drag: boolean; lt: number;
}

export function wirePointer(app: App): void {
  const cv = app.cv;
  let ptr: Ptr | null = null;

  const toC = (e: PointerEvent): { x: number; y: number } => {
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * app.W, y: ((e.clientY - r.top) / r.height) * app.H };
  };

  const bplace = (x: number, y: number, p: Ptr | null): void => {
    const w = app.world;
    if (!w) return;
    const tx = clamp((x / TILE) | 0, 0, w.map.cols - 1), ty = clamp((y / TILE) | 0, 0, w.map.rows - 1), i = ty * w.map.cols + tx;
    if (p && p.lt === i) return;
    if (p) p.lt = i;
    C.buildAt(w, app.ctl, x, y, app.bbrush, w.mode === 'sand' && w.phase === 'edit');
  };

  const place = (x: number, y: number): void => {
    const w = app.world;
    if (!w) return;
    if (app.tool === 'erase') C.eraseAt(w, x, y);
    else C.placeUnit(w, app.ctl, app.brush, x, y);
  };

  cv.addEventListener('pointerdown', (e) => {
    if (!app.running) return;
    const p = toC(e);
    ptr = { sx: p.x, sy: p.y, x: p.x, y: p.y, lx: p.x, ly: p.y, drag: false, lt: -1 };
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
    if (app.editor) paint(app, p.x, p.y, ptr);
    else if (app.tool === 'build') bplace(p.x, p.y, ptr);
    else if (app.tool === 'sell') { if (app.world) C.sellAt(app.world, app.ctl, p.x, p.y); }
    else if (app.world?.phase === 'edit') place(p.x, p.y);
  });

  cv.addEventListener('pointermove', (e) => {
    if (!ptr) return;
    const p = toC(e);
    ptr.x = p.x; ptr.y = p.y;
    if (app.editor) { paint(app, p.x, p.y, ptr); return; }
    if (app.tool === 'build') { bplace(p.x, p.y, ptr); return; }
    if (app.tool === 'sell') return;
    if (app.world?.phase === 'edit') {
      if (Math.hypot(p.x - ptr.lx, p.y - ptr.ly) >= 9) { place(p.x, p.y); ptr.lx = p.x; ptr.ly = p.y; }
      return;
    }
    if (Math.hypot(p.x - ptr.sx, p.y - ptr.sy) > 4) ptr.drag = true;
    app.drag = ptr.drag ? { x: Math.min(ptr.sx, ptr.x), y: Math.min(ptr.sy, ptr.y), w: Math.abs(ptr.x - ptr.sx), h: Math.abs(ptr.y - ptr.sy) } : null;
  });

  const endPtr = (): void => {
    if (!ptr) return;
    const w = app.world;
    if (w && !app.editor && w.phase === 'play' && app.tool === 'cmd') {
      if (ptr.drag && app.drag) C.boxSelect(w, app.ctl, app.drag);
      else C.tap(w, app.ctl, ptr.x, ptr.y);
    }
    ptr = null;
    app.drag = null;
  };
  cv.addEventListener('pointerup', endPtr);
  cv.addEventListener('pointercancel', () => { ptr = null; app.drag = null; });
  for (const ev of ['touchstart', 'touchmove', 'touchend']) cv.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}
