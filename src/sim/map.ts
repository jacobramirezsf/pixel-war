// Map data and editor operations. No dependency on world state.

export const TILE = 8;

export interface TilePos {
  tx: number;
  ty: number;
}

export interface MapDef {
  name: string;
  cols: number;
  rows: number;
  /** 0 grass, 1 road, 2 tree, 3 water, 4 rock. */
  tiles: Uint8Array;
  bases: TilePos[];
  mines: TilePos[];
}

export const MAX_MINES = 6;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const blocked = (t: number): boolean => t === 3 || t === 4;

export function blankMap(name: string, cols: number, rows: number): MapDef {
  return {
    name,
    cols,
    rows,
    tiles: new Uint8Array(cols * rows),
    bases: [{ tx: cols >> 1, ty: rows - 3 }, { tx: cols >> 1, ty: 2 }],
    mines: [],
  };
}

export function cloneMap(m: MapDef, name?: string): MapDef {
  return {
    name: name || m.name,
    cols: m.cols,
    rows: m.rows,
    tiles: new Uint8Array(m.tiles),
    bases: m.bases.map((b) => ({ tx: b.tx, ty: b.ty })),
    mines: m.mines.map((q) => ({ tx: q.tx, ty: q.ty })),
  };
}

export function clearArea(m: MapDef, tx: number, ty: number, rx: number, ry: number): void {
  for (let y = ty - ry; y <= ty + ry; y++)
    for (let x = tx - rx; x <= tx + rx; x++)
      if (x >= 0 && y >= 0 && x < m.cols && y < m.rows && m.tiles[y * m.cols + x] !== 1) m.tiles[y * m.cols + x] = 0;
}

export function nearBase(m: MapDef, tx: number, ty: number): boolean {
  return m.bases.some((b) => Math.abs(b.tx - tx) <= 2 && Math.abs(b.ty - ty) <= 1);
}

/** Clamp bases inside the map, clear ground around bases and mines, drop bad mines. */
export function finishMap(m: MapDef): MapDef {
  for (const b of m.bases) {
    b.tx = clamp(b.tx, 2, m.cols - 3);
    b.ty = clamp(b.ty, 1, m.rows - 2);
    clearArea(m, b.tx, b.ty, 2, 1);
  }
  m.mines = m.mines
    .filter((q) => q.tx >= 0 && q.ty >= 0 && q.tx < m.cols && q.ty < m.rows && !nearBase(m, q.tx, q.ty))
    .slice(0, MAX_MINES);
  for (const q of m.mines) clearArea(m, q.tx, q.ty, 1, 1);
  return m;
}

export function tileAt(m: MapDef, x: number, y: number): number {
  const tx = (x / TILE) | 0, ty = (y / TILE) | 0;
  if (tx < 0 || ty < 0 || tx >= m.cols || ty >= m.rows) return 4;
  return m.tiles[ty * m.cols + tx];
}

export function passable(m: MapDef, x: number, y: number): boolean {
  return !blocked(tileAt(m, x, y));
}

// ---------- map codes ----------

export function encodeMap(m: MapDef): string {
  return JSON.stringify({
    c: m.cols,
    r: m.rows,
    t: Array.from(m.tiles).join(''),
    b: m.bases.map((b) => [b.tx, b.ty]),
    m: m.mines.map((q) => [q.tx, q.ty]),
  });
}

/** Throws on a bad code. */
export function decodeMap(s: string): MapDef {
  const o = JSON.parse(s) as { c: number; r: number; t: string; b?: number[][]; m?: number[][] };
  if (!(o.c >= 8 && o.c <= 40 && o.r >= 8 && o.r <= 60) || typeof o.t !== 'string' || o.t.length !== o.c * o.r) throw new Error('bad map code');
  const m = blankMap('Custom', o.c, o.r);
  for (let i = 0; i < o.t.length; i++) m.tiles[i] = clamp(+o.t[i] || 0, 0, 4);
  if (o.b && o.b.length === 2) m.bases = o.b.map((b) => ({ tx: b[0] | 0, ty: b[1] | 0 }));
  m.mines = (o.m || []).map((q) => ({ tx: q[0] | 0, ty: q[1] | 0 }));
  return finishMap(m);
}

// ---------- editor operations ----------
// Each returns a message for the UI, or null when the edit went through.

export function paintTile(m: MapDef, tx: number, ty: number, k: number): string | null {
  if (nearBase(m, tx, ty)) return 'That is base ground';
  m.tiles[ty * m.cols + tx] = k;
  m.mines = m.mines.filter((q) => q.tx !== tx || q.ty !== ty);
  return null;
}

export function toggleMine(m: MapDef, tx: number, ty: number): string | null {
  const j = m.mines.findIndex((q) => q.tx === tx && q.ty === ty);
  if (j >= 0) {
    m.mines.splice(j, 1);
    return null;
  }
  if (m.mines.length >= MAX_MINES) return 'Max 6 mines';
  if (nearBase(m, tx, ty)) return 'Too close to a base';
  m.mines.push({ tx, ty });
  clearArea(m, tx, ty, 1, 1);
  return null;
}

export function moveBase(m: MapDef, i: number, tx: number, ty: number): void {
  const b = m.bases[i];
  b.tx = clamp(tx, 2, m.cols - 3);
  b.ty = clamp(ty, 1, m.rows - 2);
  finishMap(m);
}

/** New map of the given size that keeps the overlapping tiles and mines. Bases reset. */
export function resizeMap(m: MapDef, cols: number, rows: number): MapDef {
  const n = blankMap('Custom', cols, rows);
  for (let y = 0; y < Math.min(rows, m.rows); y++)
    for (let x = 0; x < Math.min(cols, m.cols); x++) n.tiles[y * cols + x] = m.tiles[y * m.cols + x];
  n.bases = [{ tx: cols >> 1, ty: rows - 3 }, { tx: cols >> 1, ty: 2 }];
  n.mines = m.mines.filter((q) => q.tx < cols && q.ty < rows);
  return finishMap(n);
}

/** Bottom half becomes a point mirror of the top half. */
export function mirrorMap(m: MapDef): void {
  const half = Math.ceil(m.rows / 2);
  for (let y = 0; y < half; y++)
    for (let x = 0; x < m.cols; x++) m.tiles[(m.rows - 1 - y) * m.cols + x] = m.tiles[y * m.cols + x];
  const top = m.mines.filter((q) => q.ty < half);
  m.mines = top.concat(top.map((q) => ({ tx: q.tx, ty: m.rows - 1 - q.ty })).filter((q) => q.ty >= half));
  m.bases[0] = { tx: m.bases[1].tx, ty: m.rows - 1 - m.bases[1].ty };
  finishMap(m);
}

export function clearMap(m: MapDef): void {
  m.tiles.fill(0);
  m.mines = [];
}
