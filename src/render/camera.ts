// World coordinates are 8px tiles. The camera has a position in world pixels and an integer
// zoom so sprites stay crisp. It clamps to the map and centers maps smaller than the view.

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  /** Viewport size in CSS pixels. */
  vw: number;
  vh: number;
  mapW: number;
  mapH: number;
  /** Smooth-follow target in world pixels, or null. */
  tx: number | null;
  ty: number | null;
  /** Zoom to settle on after a pinch, or null. */
  tz: number | null;
  /** Fling velocity in screen pixels per second. */
  vx: number;
  vy: number;
}

export const ZOOM_MAX = 6;

export function makeCamera(): Camera {
  return { x: 0, y: 0, zoom: 2, vw: 320, vh: 480, mapW: 160, mapH: 224, tx: null, ty: null, tz: null, vx: 0, vy: 0 };
}

export function setViewport(cam: Camera, vw: number, vh: number): void {
  cam.vw = Math.max(1, vw);
  cam.vh = Math.max(1, vh);
  clampCam(cam);
}

export function setMap(cam: Camera, mapW: number, mapH: number): void {
  cam.mapW = mapW;
  cam.mapH = mapH;
  cam.tx = cam.ty = null;
  clampCam(cam);
}

/** Largest integer zoom that fits the map width (mobile) or both dimensions (desktop). */
export function fitZoom(cam: Camera, mode: 'width' | 'both'): number {
  const zw = Math.floor(cam.vw / cam.mapW), zh = Math.floor(cam.vh / cam.mapH);
  const z = mode === 'width' ? zw : Math.min(zw, zh);
  return Math.max(1, Math.min(ZOOM_MAX, z));
}

/**
 * Keep the view near the map. The view may hang up to 40% past an edge so a base in a corner can
 * still sit in the middle of the screen. Maps smaller than the view sit centered.
 */
export function clampCam(cam: Camera): void {
  const vw = cam.vw / cam.zoom, vh = cam.vh / cam.zoom;
  const mx = vw * 0.4, my = vh * 0.4;
  cam.x = cam.mapW <= vw ? (cam.mapW - vw) / 2 : Math.max(-mx, Math.min(cam.mapW - vw + mx, cam.x));
  cam.y = cam.mapH <= vh ? (cam.mapH - vh) / 2 : Math.max(-my, Math.min(cam.mapH - vh + my, cam.y));
}

/** Change zoom to a whole step keeping the world point under screen point (ax, ay) fixed. */
export function setZoom(cam: Camera, z: number, ax = cam.vw / 2, ay = cam.vh / 2): void {
  z = Math.max(1, Math.min(ZOOM_MAX, Math.round(z)));
  if (z === cam.zoom) return;
  zoomTo(cam, z, ax, ay);
  cam.tz = null;
}

/** Any zoom, fractional allowed. Pinches use this, then settle on a whole step. */
export function zoomTo(cam: Camera, z: number, ax = cam.vw / 2, ay = cam.vh / 2): void {
  z = Math.max(1, Math.min(ZOOM_MAX, z));
  const wx = cam.x + ax / cam.zoom, wy = cam.y + ay / cam.zoom;
  cam.zoom = z;
  cam.x = wx - ax / z;
  cam.y = wy - ay / z;
  cam.tx = cam.ty = null;
  clampCam(cam);
}

/** After a pinch: glide to the nearest whole zoom so pixels are crisp at rest. */
export function settleZoom(cam: Camera): void {
  cam.tz = Math.max(1, Math.min(ZOOM_MAX, Math.round(cam.zoom)));
}

/** Give the camera a push, in screen pixels per second. It coasts and slows on its own. */
export function fling(cam: Camera, vx: number, vy: number): void {
  cam.vx = vx;
  cam.vy = vy;
  cam.tx = cam.ty = null;
}

/** Pan by screen pixels. Stops any coasting. */
export function panBy(cam: Camera, dx: number, dy: number): void {
  cam.x -= dx / cam.zoom;
  cam.y -= dy / cam.zoom;
  cam.tx = cam.ty = null;
  cam.vx = cam.vy = 0;
  clampCam(cam);
}

/** Look at a world point. Smooth by default, instant when asked. */
export function centerOn(cam: Camera, wx: number, wy: number, smooth = true): void {
  const x = wx - cam.vw / cam.zoom / 2, y = wy - cam.vh / cam.zoom / 2;
  if (!smooth) { cam.x = x; cam.y = y; cam.tx = cam.ty = null; clampCam(cam); return; }
  cam.tx = x;
  cam.ty = y;
}

/** Per-frame smooth follow, zoom settling, and fling momentum. */
export function updateCam(cam: Camera, dt: number): void {
  if (cam.tz != null) {
    const d = cam.tz - cam.zoom;
    if (Math.abs(d) < 0.01) { zoomTo(cam, cam.tz); cam.tz = null; }
    else zoomTo(cam, cam.zoom + d * (1 - Math.pow(0.0005, dt)));
  }
  if (cam.vx || cam.vy) {
    cam.x -= (cam.vx * dt) / cam.zoom;
    cam.y -= (cam.vy * dt) / cam.zoom;
    const k = Math.pow(0.002, dt);
    cam.vx *= k; cam.vy *= k;
    if (Math.abs(cam.vx) < 4 && Math.abs(cam.vy) < 4) cam.vx = cam.vy = 0;
    clampCam(cam);
  }
  if (cam.tx == null || cam.ty == null) return;
  const k = 1 - Math.pow(0.001, dt);
  cam.x += (cam.tx - cam.x) * k;
  cam.y += (cam.ty - cam.y) * k;
  if (Math.abs(cam.tx - cam.x) < 0.3 && Math.abs(cam.ty - cam.y) < 0.3) { cam.x = cam.tx; cam.y = cam.ty; cam.tx = cam.ty = null; }
  clampCam(cam);
}

export function toWorld(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: cam.x + sx / cam.zoom, y: cam.y + sy / cam.zoom };
}

export function toScreen(cam: Camera, wx: number, wy: number): { x: number; y: number } {
  return { x: (wx - cam.x) * cam.zoom, y: (wy - cam.y) * cam.zoom };
}

/** Rounded camera origin so world pixels land on device pixels. */
export function snapped(cam: Camera): { x: number; y: number } {
  return { x: Math.round(cam.x * cam.zoom) / cam.zoom, y: Math.round(cam.y * cam.zoom) / cam.zoom };
}
