// Turns pointer events into gestures. Coordinates are CSS pixels inside the element.
// One finger or the left button: tap or drag. Two fingers: pan and pinch. Wheel: zoom.

export type Button = 0 | 1 | 2;

export interface GestureHandlers {
  tap(x: number, y: number, button: Button, pointerType: string, shift: boolean): void;
  dragStart(x: number, y: number, button: Button, pointerType: string): void;
  dragMove(x: number, y: number, button: Button): void;
  dragEnd(x: number, y: number, button: Button): void;
  pan(dx: number, dy: number): void;
  pinch(scale: number, cx: number, cy: number): void;
  wheel(dy: number, x: number, y: number): void;
  hover(x: number | null, y: number | null): void;
}

interface P { id: number; x: number; y: number; sx: number; sy: number; button: Button; type: string; drag: boolean; shift: boolean }

const DRAG_PX = 5;

export function attachGestures(el: HTMLElement, h: GestureHandlers): () => void {
  const ps = new Map<number, P>();
  let pinchDist = 0, gesture: 'none' | 'drag' | 'multi' = 'none';
  const local = (e: PointerEvent): { x: number; y: number } => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const center = (): { x: number; y: number; d: number } => {
    const a = [...ps.values()];
    const cx = (a[0].x + a[1].x) / 2, cy = (a[0].y + a[1].y) / 2;
    return { x: cx, y: cy, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) };
  };
  const down = (e: PointerEvent): void => {
    const { x, y } = local(e);
    const button = (e.button === 1 ? 1 : e.button === 2 ? 2 : 0) as Button;
    ps.set(e.pointerId, { id: e.pointerId, x, y, sx: x, sy: y, button, type: e.pointerType, drag: false, shift: e.shiftKey });
    try { el.setPointerCapture(e.pointerId); } catch { /* capture can fail on synthetic events */ }
    e.preventDefault();
    if (ps.size === 2) {
      // A second finger cancels any single-finger drag in progress.
      const first = [...ps.values()][0];
      if (gesture === 'drag') h.dragEnd(first.x, first.y, first.button);
      gesture = 'multi';
      pinchDist = center().d;
    }
  };
  const move = (e: PointerEvent): void => {
    const p = ps.get(e.pointerId);
    const { x, y } = local(e);
    if (!p) { if (e.pointerType === 'mouse') h.hover(x, y); return; }
    const px = p.x, py = p.y;
    p.x = x; p.y = y;
    if (gesture === 'multi' && ps.size >= 2) {
      const c = center();
      h.pan(x - px, y - py);
      if (pinchDist > 0) { h.pinch(c.d / pinchDist, c.x, c.y); }
      pinchDist = c.d;
      return;
    }
    if (gesture === 'multi') return;
    if (!p.drag && Math.hypot(x - p.sx, y - p.sy) >= DRAG_PX) { p.drag = true; gesture = 'drag'; h.dragStart(p.sx, p.sy, p.button, p.type); }
    if (p.drag) h.dragMove(x, y, p.button);
    if (e.pointerType === 'mouse') h.hover(x, y);
  };
  const up = (e: PointerEvent): void => {
    const p = ps.get(e.pointerId);
    if (!p) return;
    ps.delete(e.pointerId);
    if (gesture === 'multi') { if (ps.size === 0) gesture = 'none'; else pinchDist = 0; return; }
    if (p.drag) h.dragEnd(p.x, p.y, p.button);
    else h.tap(p.x, p.y, p.button, p.type, p.shift);
    gesture = 'none';
  };
  const cancel = (e: PointerEvent): void => {
    const p = ps.get(e.pointerId);
    if (!p) return;
    ps.delete(e.pointerId);
    if (p.drag && gesture === 'drag') h.dragEnd(p.x, p.y, p.button);
    if (ps.size === 0) gesture = 'none';
  };
  const wheel = (e: WheelEvent): void => { e.preventDefault(); const r = el.getBoundingClientRect(); h.wheel(e.deltaY, e.clientX - r.left, e.clientY - r.top); };
  const ctx = (e: Event): void => e.preventDefault();
  const leave = (): void => h.hover(null, null);
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('contextmenu', ctx);
  el.addEventListener('pointerleave', leave);
  for (const ev of ['touchstart', 'touchmove', 'touchend']) el.addEventListener(ev, ctx, { passive: false });
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    el.removeEventListener('wheel', wheel);
    el.removeEventListener('contextmenu', ctx);
    el.removeEventListener('pointerleave', leave);
  };
}
