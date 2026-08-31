// Top bar, message line, build strips, and button visibility.

import { BLD, BORDER } from '../../data/buildings.ts';
import { DIFF } from '../../data/difficulty.ts';
import { TOOLS, type EditorTool } from '../../data/maps.ts';
import { TNAME } from '../../data/teams.ts';
import { ALL_UNITS, roster, TYPES, type UnitKey } from '../../data/units.ts';
import { buildTime } from '../../sim/units.ts';
import { RACES } from '../../data/races.ts';
import { drawBldSpr, drawSprite } from '../../render/atlas.ts';
import { drawTile } from '../../render/terrain.ts';
import { allied, count } from '../../sim/world.ts';
import { centerOn, setZoom } from '../../render/camera.ts';
import { minimapToWorld } from '../../render/minimap.ts';
import { ctlRace, fit, issueAction, say, selectedUnits, type App } from '../app.ts';
import { $, on, show } from '../dom.ts';
import { focusBase } from '../input/hotkeys.ts';

const unitBtns = {} as Record<UnitKey, HTMLButtonElement>;
let paintedRace = '';
const bldBtns = {} as Record<string, HTMLButtonElement>;
const toolBtns = new Map<EditorTool, HTMLButtonElement>();
let sellBtn: HTMLButtonElement;

function mkStripBtn(parent: HTMLElement, label: string, cost: number | null, onTap: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  const c = document.createElement('canvas');
  c.width = 30; c.height = 30;
  b.appendChild(c);
  const n = document.createElement('span');
  n.textContent = label;
  b.appendChild(n);
  if (cost != null) { const s = document.createElement('small'); s.textContent = String(cost); b.appendChild(s); }
  on(b, 'click', onTap);
  parent.appendChild(b);
  return b;
}

function unitTap(app: App, k: UnitKey): void {
  if (!app.running || !app.world) return;
  const T = TYPES[k];
  if (app.world.mode === 'sand') {
    app.brush = k;
    app.tool = 'place';
    updateUI(app);
    say(app, 'Tap or drag on the map to place ' + T.name, 1.5);
    return;
  }
  issueAction(app, { type: 'buy', payload: { unit: k } });
}

export function buildStrips(app: App): void {
  const strip = $('strip'), bstrip = $('bstrip'), tstrip = $('tstrip');
  const toBuild = document.createElement('button');
  toBuild.className = 'tab';
  toBuild.textContent = 'BUILD ▸';
  on(toBuild, 'click', () => { app.bstrip = true; app.tool = 'build'; updateUI(app); say(app, 'Pick a structure, then tap or drag on the map', 2); });
  strip.appendChild(toBuild);
  for (const k of ALL_UNITS) { unitBtns[k] = mkStripBtn(strip, TYPES[k].name, TYPES[k].cost, () => unitTap(app, k)); unitBtns[k].title = TYPES[k].name; }
  const toUnits = document.createElement('button');
  toUnits.className = 'tab';
  toUnits.textContent = '◂ UNITS';
  on(toUnits, 'click', () => { app.bstrip = false; app.tool = app.world?.mode === 'sand' && app.world.phase === 'edit' ? 'place' : 'cmd'; updateUI(app); });
  bstrip.appendChild(toUnits);
  sellBtn = document.createElement('button');
  sellBtn.className = 'tab';
  sellBtn.textContent = 'SELL';
  on(sellBtn, 'click', () => { app.tool = app.tool === 'sell' ? 'build' : 'sell'; updateUI(app); say(app, app.tool === 'sell' ? 'Tap your buildings to sell them (half back)' : 'Build mode', 1.5); });
  bstrip.appendChild(sellBtn);
  for (const k of BORDER) bldBtns[k] = mkStripBtn(bstrip, BLD[k].name, BLD[k].cost, () => { app.tool = 'build'; app.bbrush = k; updateUI(app); say(app, BLD[k].name + ': tap or drag on the map', 1.5); });
  for (const t of TOOLS) {
    const b = mkStripBtn(tstrip, t.name, null, () => { if (app.editor) { app.editor.tool = t.k; updateUI(app); } });
    const cc = (b.firstChild as HTMLCanvasElement).getContext('2d')!;
    if (typeof t.k === 'number') drawTile(cc, t.k, 3, 3, 3, 0.9);
    else if (t.k === 'mine') { drawTile(cc, 0, 3, 3, 3, 0.5); cc.fillStyle = '#4e4e58'; cc.fillRect(6, 12, 18, 12); cc.fillStyle = '#f2d34a'; cc.fillRect(10, 16, 3, 3); cc.fillRect(17, 19, 3, 3); }
    else {
      const team = +t.k[1];
      drawTile(cc, 0, 3, 3, 3, 0.5);
      cc.fillStyle = '#5f6474'; cc.fillRect(4, 10, 22, 14);
      cc.fillStyle = ['#3fa7ff', '#ff4d4d'][team]; cc.fillRect(20, 5, 5, 5);
      cc.fillStyle = '#141520'; cc.fillRect(13, 18, 4, 6);
    }
    toolBtns.set(t.k, b);
  }
}

function paintStrip(app: App): void {
  const race = ctlRace(app);
  for (const k of roster(race)) {
    const c = unitBtns[k].firstChild as HTMLCanvasElement, cc = c.getContext('2d')!, sz = TYPES[k].sz, sc = Math.max(1, Math.floor(30 / sz));
    cc.clearRect(0, 0, 30, 30);
    drawSprite(cc, k, app.ctl, Math.floor((30 - sz * sc) / 2), Math.floor((30 - sz * sc) / 2), sc, false);
  }
  paintedRace = race + app.ctl;
  for (const k of BORDER) {
    const c = bldBtns[k].firstChild as HTMLCanvasElement, cc = c.getContext('2d')!;
    cc.clearRect(0, 0, 30, 30);
    drawBldSpr(cc, k, app.ctl, 3, BLD[k].kind === 'tower' ? 12 : 3, 3);
  }
}

/** Zoom buttons, the base button, and minimap taps and drags. */
export function wireViewButtons(app: App): void {
  on($('bZoomIn'), 'click', () => setZoom(app.cam, app.cam.zoom + 1));
  on($('bZoomOut'), 'click', () => setZoom(app.cam, app.cam.zoom - 1));
  on($('bHome'), 'click', () => focusBase(app));
  const mini = $<HTMLCanvasElement>('mini');
  let down = false;
  const go = (e: PointerEvent): void => {
    const m = app.world?.map ?? app.editor?.map;
    if (!m) return;
    const r = mini.getBoundingClientRect();
    const p = minimapToWorld(m, r.width, e.clientX - r.left, e.clientY - r.top);
    centerOn(app.cam, p.x, p.y, false);
  };
  mini.addEventListener('pointerdown', (e) => { down = true; mini.setPointerCapture(e.pointerId); go(e); e.preventDefault(); e.stopPropagation(); });
  mini.addEventListener('pointermove', (e) => { if (down) go(e); });
  mini.addEventListener('pointerup', () => { down = false; });
  mini.addEventListener('pointercancel', () => { down = false; });
}

export function updateUI(app: App): void {
  const w = app.world, B = (id: string): HTMLElement => $(id);
  const sand = w?.mode === 'sand', map = !!app.editor, edit = w?.phase === 'edit', conq = w?.mode === 'conquest';
  const vis: Record<string, boolean> = {
    bAll: !map && !edit, bCharge: !map && !edit, bHold: !map && !edit, bRetreat: !map && !edit, bRally: !map && !edit && !sand, bPause: !map && !edit, bEdit: sand && !edit,
    bG1: !map && !edit && !sand, bG2: !map && !edit && !sand, bG3: !map && !edit && !sand,
    bSettle: conq, bFort: conq, bSave: conq, bLand: conq, bSpeed: conq,
    bErase: sand && edit, bMirror: sand && edit, bClear: sand && edit, bMap: sand && edit, bPlay: sand && edit,
    bSize: map, bRandom: map, bMirrorMap: map, bClearMap: map, bCode: map, bDone: map,
  };
  for (const k in vis) show(B(k), vis[k]);
  const bTeam = B('bTeam');
  bTeam.className = 't' + app.ctl + (sand ? '' : ' hide');
  bTeam.textContent = TNAME[app.ctl];
  const pal = !map;
  show($('view'), !!w || map);
  show($('strip'), pal && !app.bstrip);
  show($('bstrip'), pal && app.bstrip);
  show($('tstrip'), map);
  B('bErase').classList.toggle('on', app.tool === 'erase');
  B('bRally').classList.toggle('on', app.tool === 'rally');
  B('bSettle').classList.toggle('on', app.tool === 'settle');
  B('bFort').classList.toggle('on', app.tool === 'upgrade');
  B('bLand').classList.toggle('on', app.overlay);
  B('bSpeed').textContent = app.speed + '×';
  for (const n of [1, 2, 3]) B('bG' + n).classList.toggle('has', app.groups.has(n));
  B('bPause').classList.toggle('on', app.paused);
  B('bPause').textContent = app.paused ? 'RESUME' : 'PAUSE';
  sellBtn.classList.toggle('on', app.tool === 'sell');
  const race = ctlRace(app), list = new Set(roster(race));
  for (const k of ALL_UNITS) {
    show(unitBtns[k], list.has(k));
    unitBtns[k].classList.toggle('on', sand && edit && app.tool === 'place' && app.brush === k);
    if (sand) unitBtns[k].classList.remove('dis');
  }
  for (const k of BORDER) { bldBtns[k].classList.toggle('on', app.tool === 'build' && app.bbrush === k); if (sand) bldBtns[k].classList.remove('dis'); }
  for (const t of TOOLS) toolBtns.get(t.k)!.classList.toggle('on', map && app.editor?.tool === t.k);
  if (paintedRace !== race + app.ctl) paintStrip(app);
  fit(app);
}

let lastQueueKey = '';

/** The production queue as small buttons. Tapping one cancels it and refunds the gold. */
function renderQueue(app: App): void {
  const w = app.world, el = $('queue');
  if (!w || w.mode === 'sand') { if (lastQueueKey) { el.innerHTML = ''; lastQueueKey = ''; } return; }
  const q = w.slots[app.ctl].queue;
  const key = q.map((x) => x.unit).join(',');
  if (key !== lastQueueKey) {
    lastQueueKey = key;
    el.innerHTML = q.length ? '<span>QUEUE</span>' + q.map((x, i) => '<button data-q="' + i + '" class="' + (i === 0 ? 'head' : '') + '" title="cancel">' + TYPES[x.unit].name + '<i></i></button>').join('') : '';
    for (const b of el.querySelectorAll<HTMLButtonElement>('button[data-q]')) on(b, 'click', () => { issueAction(app, { type: 'cancel', payload: { index: +b.dataset.q! } }); lastQueueKey = ''; });
  }
  const head = el.querySelector<HTMLElement>('button.head i');
  if (head && q.length) { const total = buildTime(q[0].unit); head.style.width = Math.round(100 * (1 - q[0].t / total)) + '%'; }
}

/** Selection card: count, composition, and average health. */
function renderSelCard(app: App): void {
  const el = $('selcard');
  const sel = selectedUnits(app);
  if (!sel.length) { if (el.textContent) el.textContent = ''; return; }
  const comp = new Map<string, number>();
  let hp = 0, max = 0;
  for (const u of sel) { comp.set(u.type, (comp.get(u.type) ?? 0) + 1); hp += u.hp; max += TYPES[u.type].hp; }
  const parts = [...comp.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => n + ' ' + TYPES[k].name);
  el.innerHTML = '<b>' + sel.length + '</b> ' + parts.join(', ') + ' · ' + Math.round((100 * hp) / max) + '% hp';
}

export function renderHud(app: App): void {
  const tl = $('tl'), wave = $('wave'), sel = $('sel'), msg = $('msg');
  const w = app.world;
  renderQueue(app);
  renderSelCard(app);
  if (app.editor) {
    const m = app.editor.map;
    tl.textContent = 'Map editor';
    wave.textContent = m.cols + '×' + m.rows + ' · ' + m.mines.length + ' mines';
    const t = TOOLS.find((t) => t.k === app.editor!.tool);
    sel.textContent = t ? t.name : '';
    msg.textContent = app.msgT > 0 ? app.msg : '';
    return;
  }
  if (!w) { msg.textContent = ''; return; }
  if (w.mode === 'sand') {
    tl.textContent = w.phase === 'edit' ? 'Sandbox: edit' : app.paused ? 'PAUSED' : 'Sandbox: live';
    wave.textContent = 'Blue ' + count(w, 0) + ' · Red ' + count(w, 1);
    sel.textContent = 'Sel ' + selectedUnits(app).length;
  } else {
    const gold = w.slots[0].gold;
    if (w.mode === 'conquest') {
      const net = w.net[0];
      const secs = net < 0 ? gold / -net : Infinity;
      tl.innerHTML = 'Gold <b>' + Math.floor(gold) + '</b> <span class="net' + (net < 0 ? ' neg' : '') + '">' + (net >= 0 ? '+' : '') + net.toFixed(1) + '/s</span>' + (secs < 60 ? ' <span class="warn">' + Math.ceil(secs) + 's of gold left</span>' : '');
      const held = w.regions.filter((r) => r.owner === 0), broken = held.filter((r) => !r.connected).length, weak = held.filter((r) => r.garrison < r.need).length;
      wave.textContent = 'Regions ' + held.length + '/' + w.regions.length + (broken ? ' · ' + broken + ' cut off' : '') + (weak ? ' · ' + weak + ' undermanned' : '');
    } else {
    tl.innerHTML = 'Gold <b>' + (Number.isFinite(gold) ? Math.floor(gold) : '∞') + '</b> <span class="inc' + (w.incFlash > 0 ? ' flash' : '') + '">+' + w.income.toFixed(1) + '/s</span> <span class="race">' + RACES[w.slots[0].race].name + '</span>';
    if (w.mode === 'dom') wave.textContent = '⚑ ' + Math.floor(w.score[0]) + ':' + Math.floor(w.score[1]) + ' of 150';
    else if (w.mode === 'multi') {
      let r = 0;
      for (let i = 1; i < w.nP; i++) if (w.slots[i].alive && !allied(w, 0, i)) r++;
      wave.textContent = r + ' rival' + (r === 1 ? '' : 's') + ' left · ' + DIFF[w.diff].name;
    } else {
      // Threat readout: how much the enemy has waiting, and whether it is on the move.
      let held = 0, moving = 0;
      for (const u of w.units) if (u.team !== 0 && !allied(w, 0, u.team)) { if (u.held) held++; else moving++; }
      wave.textContent = moving > held ? 'Enemy attacking: ' + moving : held ? 'Enemy massing: ' + held : 'Enemy quiet';
    }
    }
    for (const k of roster(ctlRace(app))) unitBtns[k].classList.toggle('dis', gold < TYPES[k].cost);
    for (const k of BORDER) bldBtns[k].classList.toggle('dis', gold < BLD[k].cost);
    sel.textContent = 'Sel ' + selectedUnits(app).length;
  }
  msg.textContent = w.msgT > 0 ? w.msg : '';
}
