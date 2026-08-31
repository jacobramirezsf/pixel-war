// One pointer handler for touch and mouse, as in the prototype. M2 splits this into
// touch and mouse adapters over a camera.

import { refOf } from '../../sim/commands.ts';
import { clamp, TILE } from '../../sim/map.ts';
import { hostileAt, ownGateAt, unitAt } from '../../sim/queries.ts';
import { issueAction, say, selectedUnits, type App } from '../app.ts';
import { paint } from '../menus/editor.ts';

interface Ptr {
  sx: number; sy: number; x: number; y: number; lx: number; ly: number; drag: boolean; lt: number;
}

/** Box select: pick every own unit inside the rectangle. */
export function boxSelect(app: App, d: { x: number; y: number; w: number; h: number }): void {
  const w = app.world;
  if (!w) return;
  app.selection.clear();
  for (const u of w.units) if (u.team === app.ctl && u.hp > 0 && u.x >= d.x && u.x <= d.x + d.w && u.y >= d.y && u.y <= d.y + d.h) app.selection.add(u.id);
  const n = app.selection.size;
  say(app, n ? n + ' selected' : 'No units there', 1.2);
}

/** Tap: pick a unit, toggle a gate, or order the selection at the point. */
export function tap(app: App, x: number, y: number): void {
  const w = app.world;
  if (!w) return;
  const own = unitAt(w, app.ctl, x, y);
  if (own) {
    const only = app.selection.has(own.id) && selectedUnits(app).length === 1;
    app.selection.clear();
    if (!only) app.selection.add(own.id);
    return;
  }
  const gb = ownGateAt(w, app.ctl, x, y);
  if (gb) { issueAction(app, { type: 'gate', payload: { id: gb.id } }); return; }
  const sel = selectedUnits(app);
  if (!sel.length) { say(app, 'Select units first: tap one or drag a box', 2); return; }
  const ids = sel.map((u) => u.id);
  const en = hostileAt(w, app.ctl, x, y);
  if (en) issueAction(app, { type: 'attack', payload: { ids, target: refOf(en) } });
  else issueAction(app, { type: 'move', payload: { ids, x, y } });
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
    issueAction(app, { type: 'build', payload: { x, y, bld: app.bbrush } });
  };

  const place = (x: number, y: number): void => {
    const w = app.world;
    if (!w) return;
    if (app.tool === 'erase') { issueAction(app, { type: 'erase', payload: { x, y } }); return; }
    const gb = ownGateAt(w, app.ctl, x, y);
    if (gb) { issueAction(app, { type: 'gate', payload: { id: gb.id } }); return; }
    issueAction(app, { type: 'place', payload: { unit: app.brush, x, y } });
  };

  cv.addEventListener('pointerdown', (e) => {
    if (!app.running) return;
    const p = toC(e);
    ptr = { sx: p.x, sy: p.y, x: p.x, y: p.y, lx: p.x, ly: p.y, drag: false, lt: -1 };
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
    if (app.editor) paint(app, p.x, p.y, ptr);
    else if (app.tool === 'build') bplace(p.x, p.y, ptr);
    else if (app.tool === 'sell') issueAction(app, { type: 'sell', payload: { x: p.x, y: p.y } });
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
      if (ptr.drag && app.drag) boxSelect(app, app.drag);
      else tap(app, ptr.x, ptr.y);
    }
    ptr = null;
    app.drag = null;
  };
  cv.addEventListener('pointerup', endPtr);
  cv.addEventListener('pointercancel', () => { ptr = null; app.drag = null; });
  for (const ev of ['touchstart', 'touchmove', 'touchend']) cv.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}
