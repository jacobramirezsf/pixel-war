// Top bar, toast, tabbed panel (units, build, powers, more), context command row, view controls.

import { AGE_NAMES, BLD, BORDER } from '../../data/buildings.ts';
import { canTrain, RESEARCH_COST, TECH_NAMES, canResearch, canUpgradeBld, nextType, TECH_INFO, TECH_KEYS, upgradeCost } from '../../sim/town.ts';
import { canGrow, growNeeds, NEXT_TIER, TIERS, canCapture, CAPTURE_COST, relation } from '../../sim/conquest.ts';
import { DIFF } from '../../data/difficulty.ts';
import { TOOLS, type EditorTool } from '../../data/maps.ts';
import { POWER_KEYS, POWERS, type PowerKey } from '../../data/powers.ts';
import { RACES } from '../../data/races.ts';
import { TNAME } from '../../data/teams.ts';
import { ALL_UNITS, roster, TYPES, type UnitKey } from '../../data/units.ts';
import { drawBldSpr, drawSprite } from '../../render/atlas.ts';
import { centerOn, fitZoom, setZoom } from '../../render/camera.ts';
import { minimapToWorld } from '../../render/minimap.ts';
import { drawTile } from '../../render/terrain.ts';
import { GROUND, type GroundKey } from '../../data/buildings.ts';
import { matRate, popCap, popUsed } from '../../sim/conquest.ts';
import { buildTime, maxHp } from '../../sim/units.ts';
import { allied, count } from '../../sim/world.ts';
import { ctlRace, fit, issueAction, say, saveLayers, selectedUnits, type App, type Layers, type Tab } from '../app.ts';
import { refOf } from '../../sim/commands.ts';
import { $, on, show } from '../dom.ts';
import { focusBase } from '../input/hotkeys.ts';
import { iconCanvas, type UiIcon } from '../../render/icons.ts';
import { renderTerritory, updateTerritoryVisibility } from '../territory.ts';
import { renderCheats, updateCheatsVisibility } from '../cheats.ts';

const unitBtns = {} as Record<UnitKey, HTMLButtonElement>;
const bldBtns = {} as Record<string, HTMLButtonElement>;
const groundBtns: Partial<Record<GroundKey, HTMLButtonElement>> = {};
let undoBtn: HTMLButtonElement | null = null;
const powerBtns = {} as Record<PowerKey, HTMLButtonElement>;
const toolBtns = new Map<EditorTool, HTMLButtonElement>();
let paintedRace = '';

function mkStripBtn(parent: HTMLElement, label: string, cost: number | null, onTap: () => void, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  if (cls) b.className = cls;
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
  if (app.world.mode === 'sand' && app.world.phase === 'edit') {
    app.brush = k;
    app.tool = 'place';
    updateUI(app);
    say(app, 'Tap the map to place ' + T.name + '. Drag to place many.', 1.5);
    return;
  }
  issueAction(app, { type: 'buy', payload: { unit: k, building: app.bld >= 0 ? app.bld : undefined, near: app.town >= 0 ? app.town : undefined } });
}

export function buildStrips(app: App): void {
  const strip = $('strip'), bstrip = $('bstrip'), pstrip = $('pstrip'), tstrip = $('tstrip');
  for (const k of ALL_UNITS) { unitBtns[k] = mkStripBtn(strip, TYPES[k].name, TYPES[k].cost, () => unitTap(app, k)); unitBtns[k].title = TYPES[k].name; }
  const groups: [string, string][] = [['ground', 'GROUND'], ['defense', 'DEFENSE'], ['economy', 'TOWN'], ['military', 'MILITARY']];
  for (const [g] of groups) {
    if (g === 'ground') {
      for (const gk of ['road', 'clear'] as const) {
        const G = GROUND[gk];
        groundBtns[gk] = mkStripBtn(bstrip, G.name, G.cost, () => { app.tool = 'terrain'; app.tbrush = gk; updateUI(app); say(app, G.name + ': ' + G.hint, 3); });
        groundBtns[gk].title = G.hint;
      }
      undoBtn = mkStripBtn(bstrip, 'UNDO LAST', null, () => { if (app.lastBuilt.length) { issueAction(app, { type: 'unbuild', payload: { ids: app.lastBuilt } }); app.lastBuilt = []; updateUI(app); } }, 'undo');
      undoBtn.title = 'Take back the last thing placed, full refund';
    }
    for (const k of BORDER.filter((x) => BLD[x].group === g)) {
      const D = BLD[k];
      bldBtns[k] = mkStripBtn(bstrip, D.name, D.cost, () => { app.tool = 'build'; app.bbrush = k; updateUI(app); say(app, D.name + (D.hint ? ': ' + D.hint : '') + ' Drag to place, release to build.', 3); });
      bldBtns[k].title = (D.hint ?? '') + (D.age ? ' Needs the ' + AGE_NAMES[D.age].toLowerCase() + ' age.' : '');
      if (D.w > 1 || D.h > 1) { const sz = document.createElement('small'); sz.className = 'fp'; sz.textContent = D.w + '×' + D.h; bldBtns[k].appendChild(sz); }
    }
  }
  for (const k of POWER_KEYS) {
    const P = POWERS[k];
    const b = mkStripBtn(pstrip, P.name, P.cost, () => {
      if (!app.running || !app.world) return;
      app.tool = 'power';
      app.power = k;
      updateUI(app);
      say(app, P.name + ': tap the map where it should land. ' + P.hint, 3);
    }, 'pw');
    b.title = P.hint + ' Key ' + P.hotkey + '.';
    const bar = document.createElement('i');
    bar.className = 'cd';
    b.appendChild(bar);
    const cc = (b.firstChild as HTMLCanvasElement).getContext('2d')!;
    drawPowerIcon(cc, k);
    powerBtns[k] = b;
  }
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
  // The rail: icon buttons. Tapping the open category closes it, so the world gets the screen back.
  const rail: [string, Tab, UiIcon][] = [['tUnits', 'units', 'army'], ['tBuild', 'build', 'build'], ['tPowers', 'powers', 'powers'], ['tWorld', 'world', 'world'], ['tMore', 'more', 'more'], ['tTools', 'tools', 'terrain'], ['tEdit', 'edit', 'map']];
  for (const [id, tab, icon] of rail) {
    const b = $(id);
    b.insertBefore(iconCanvas(icon), b.firstChild);
    on(b, 'click', () => {
      const closing = app.tab === tab;
      app.tab = closing ? 'none' : tab;
      // Leaving or entering a category drops any armed brush. Tapping a building arms it.
      if (app.tool === 'build' || app.tool === 'sell' || app.tool === 'terrain') app.tool = app.world?.phase === 'edit' ? 'place' : 'cmd';
      updateUI(app);
    });
  }
  const kb = $('tKingdom');
  kb.insertBefore(iconCanvas('kingdom'), kb.firstChild);
  on(kb, 'click', () => { app.terrOpen = !app.terrOpen; updateUI(app); });
  // Contextual buttons get icons too.
  const ctx: [string, UiIcon, string][] = [['bDesel', 'desel', ''], ['bMove', 'move', 'MOVE'], ['bAttack', 'attack', 'ATTACK'], ['bGuard', 'guard', 'GUARD'], ['bHold', 'hold', 'HOLD'], ['bRetreat', 'retreat', 'RETREAT']];
  for (const [id, icon, label] of ctx) {
    const b = $(id);
    b.insertBefore(iconCanvas(icon), b.firstChild);
    if (label) { const sp = document.createElement('span'); sp.textContent = label; b.appendChild(sp); }
  }
  // Build subcategories.
  for (const b of document.querySelectorAll<HTMLButtonElement>('#bchips .bc')) on(b, 'click', () => { app.bcat = b.dataset.bcat as App['bcat']; updateUI(app); });
}

/** Which build subcategory a strip button belongs to. */
function bcatOf(k: string): App['bcat'] {
  const g = BLD[k as keyof typeof BLD].group;
  return g === 'economy' ? 'town' : g === 'military' ? 'military' : g === 'defense' ? 'defense' : 'ground';
}

function drawPowerIcon(c: CanvasRenderingContext2D, k: PowerKey): void {
  c.clearRect(0, 0, 30, 30);
  const f = (col: string, x: number, y: number, w: number, h: number): void => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  if (k === 'barrage') { f('#ff8c2a', 12, 6, 6, 6); f('#f2d34a', 10, 14, 10, 4); f('#8a8f9c', 6, 20, 18, 4); f('#ff8c2a', 4, 8, 3, 3); f('#ff8c2a', 23, 10, 3, 3); }
  else if (k === 'smite') { f('#dde2ec', 16, 3, 3, 9); f('#dde2ec', 12, 11, 7, 3); f('#dde2ec', 13, 14, 3, 9); f('#67e8f9', 10, 22, 10, 4); }
  else if (k === 'heal') { f('#7dff7d', 12, 6, 6, 18); f('#7dff7d', 6, 12, 18, 6); }
  else if (k === 'haste') { f('#f2d34a', 4, 13, 14, 4); f('#f2d34a', 14, 8, 4, 14); f('#f2d34a', 18, 11, 4, 8); f('#f2d34a', 22, 13, 4, 4); }
  else if (k === 'freeze') { f('#67e8f9', 14, 4, 2, 22); f('#67e8f9', 4, 14, 22, 2); f('#67e8f9', 8, 8, 2, 2); f('#67e8f9', 20, 20, 2, 2); f('#67e8f9', 20, 8, 2, 2); f('#67e8f9', 8, 20, 2, 2); }
  else { f('#3fa7ff', 6, 10, 6, 10); f('#3fa7ff', 12, 8, 6, 12); f('#3fa7ff', 18, 10, 6, 10); f('#e8b88a', 7, 7, 4, 3); f('#e8b88a', 13, 5, 4, 3); f('#e8b88a', 19, 7, 4, 3); }
}

function paintStrip(app: App): void {
  const race = ctlRace(app);
  for (const k of roster(race)) {
    const c = unitBtns[k].firstChild as HTMLCanvasElement, cc = c.getContext('2d')!, sz = TYPES[k].sz, sc = Math.max(1, Math.floor(30 / sz));
    cc.clearRect(0, 0, 30, 30);
    drawSprite(cc, k, app.ctl, Math.floor((30 - sz * sc) / 2), Math.floor((30 - sz * sc) / 2), sc, false);
  }
  for (const k of BORDER) {
    const c = bldBtns[k].firstChild as HTMLCanvasElement, cc = c.getContext('2d')!, D = BLD[k];
    cc.clearRect(0, 0, 30, 30);
    const sc = Math.max(1, Math.floor(28 / Math.max(D.w, D.h) / 8));
    drawBldSpr(cc, k, app.ctl, Math.floor((30 - D.w * 8 * sc) / 2), D.kind === 'tower' && D.w === 1 ? 12 : Math.floor((30 - D.h * 8 * sc) / 2) + 2, sc);
  }
  for (const gk of ['road', 'clear'] as const) {
    const b = groundBtns[gk];
    if (!b) continue;
    const cc = (b.firstChild as HTMLCanvasElement).getContext('2d')!;
    cc.clearRect(0, 0, 30, 30);
    if (gk === 'road') { drawTile(cc, 0, 3, 3, 3, 0.3); drawTile(cc, 1, 3, 3, 3, 0.4); }
    else { drawTile(cc, 2, 3, 3, 3, 0.3); cc.strokeStyle = '#ff6b6b'; cc.lineWidth = 2; cc.beginPath(); cc.moveTo(6, 6); cc.lineTo(24, 24); cc.moveTo(24, 6); cc.lineTo(6, 24); cc.stroke(); }
  }
  paintedRace = race + app.ctl;
}

/** Zoom, fit, home, and the minimap. */
export function wireViewButtons(app: App): void {
  on($('bZoomIn'), 'click', () => setZoom(app.cam, app.cam.zoom + 1));
  on($('bZoomOut'), 'click', () => setZoom(app.cam, app.cam.zoom - 1));
  on($('bFit'), 'click', () => { setZoom(app.cam, fitZoom(app.cam, 'both')); centerOn(app.cam, app.cam.mapW / 2, app.cam.mapH / 2, false); });
  on($('bHome'), 'click', () => focusBase(app));
  on($('pauseov'), 'click', () => { app.paused = false; updateUI(app); });
  // The toast is an alert: tapping it looks at the latest event with a place.
  on($('msg'), 'click', () => {
    const w = app.world;
    if (!w) return;
    const e = [...w.events].reverse().find((q) => q.x || q.y);
    if (e) centerOn(app.cam, e.x, e.y);
  });
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
  const sand = w?.mode === 'sand', map = !!app.editor, edit = w?.phase === 'edit', conq = w?.mode === 'conquest', live = !!w && !map;
  const toolOn = app.tool !== 'cmd' && !(edit && app.tool === 'place');
  // The rail: the editor shows terrain and map, everything else army, build, powers, kingdom, world, more.
  if (map && app.tab !== 'tools' && app.tab !== 'edit') app.tab = 'tools';
  if (!map && (app.tab === 'tools' || app.tab === 'edit')) app.tab = 'none';
  show(B('tUnits'), !map); show(B('tBuild'), !map); show(B('tPowers'), app.settings.powersOn && (live && !edit)); show(B('tMore'), !map);
  show(B('tKingdom'), conq && !map); show(B('tWorld'), live && !edit && !map);
  show(B('tTools'), map); show(B('tEdit'), map);
  for (const [id, tab] of [['tUnits', 'units'], ['tBuild', 'build'], ['tPowers', 'powers'], ['tWorld', 'world'], ['tMore', 'more'], ['tTools', 'tools'], ['tEdit', 'edit']] as const) B(id).classList.toggle('on', app.tab === tab);
  B('tKingdom').classList.toggle('on', app.terrOpen);
  show(B('strip'), app.tab === 'units'); show(B('armychips'), app.tab === 'units' && live && !edit && !sand);
  show(B('bstrip'), app.tab === 'build'); show(B('bchips'), app.tab === 'build' && !map);
  show(B('pstrip'), app.tab === 'powers'); show(B('more'), app.tab === 'more');
  show(B('wchips'), app.tab === 'world' && live);
  show(B('tstrip'), app.tab === 'tools'); show(B('estrip'), app.tab === 'edit');
  if (app.tab === 'world' && live) renderWorldChips(app);
  document.body.classList.toggle('watch', app.watch);
  show(B('watchExit'), app.watch);
  // Command row: context sensitive. Units, a town, a building, another side's settlement, or nothing.
  const hasSel = selectedUnits(app).length > 0;
  if (w && app.bld >= 0 && !w.blds.some((b) => b.id === app.bld && b.team === app.ctl)) app.bld = -1;
  const hasCard = app.town >= 0 || app.bld >= 0 || !!app.foreign;
  const armed = app.stance !== 'none' && hasSel;
  // The contextual row exists only while something is selected.
  show(B('ctx'), live && !edit && !toolOn && (hasSel || hasCard || !!app.warAsk));
  show(B('bDesel'), true);
  for (const [id, st] of [['bMove', 'move'], ['bAttack', 'attack'], ['bGuard', 'guard']] as const) { show(B(id), hasSel); B(id).classList.toggle('on', app.stance === st); }
  show(B('bHold'), hasSel);
  show(B('bRetreat'), hasSel && !armed && !app.warAsk);
  document.body.classList.toggle('armed', armed);
  // One chip says what a tap on the world does right now. Tapping the chip cancels.
  const pw = app.power;
  const modeOn = toolOn || armed || (edit && app.tool === 'erase');
  const mode = B('modechip');
  show(mode, modeOn && !app.watch);
  if (modeOn) {
    const name = armed ? (app.stance === 'attack' ? 'ATTACK MOVE' : app.stance.toUpperCase())
      : app.tool === 'power' && pw ? POWERS[pw].name
      : app.tool === 'build' ? 'BUILD ' + BLD[app.bbrush].name
      : app.tool === 'sell' ? 'REMOVE'
      : app.tool === 'terrain' ? GROUND[app.tbrush].name
      : app.tool === 'cheat' ? 'CHEAT: ' + (app.cheatTool?.op.toUpperCase() ?? '')
      : app.tool.toUpperCase();
    mode.textContent = name;
    const small = document.createElement('small');
    small.textContent = armed || app.tool === 'power' || app.tool === 'settle' || app.tool === 'outpost' || app.tool === 'rally' || app.tool === 'cheat' ? 'tap the target' : 'drag on the map';
    mode.appendChild(small);
    mode.classList.toggle('danger', app.stance === 'attack' || app.tool === 'sell' || app.cheatTool?.op === 'destroy' || app.cheatTool?.op === 'clearNear');
  }
  contextAction(app);
  const act = app.act;
  show(B('bAct'), live && !edit && !toolOn && !!act);
  if (act) { B('bAct').textContent = act.label; B('bAct').classList.toggle('danger', !!act.danger); }
  B('bSelect').classList.toggle('on', app.selectMode);
  B('bSelect').textContent = app.selectMode ? 'DRAG: BOX' : 'DRAG: PAN';
  // More grid.
  const vis: Record<string, boolean> = {
    bSell: live && !edit, bSave: conq,
    bSettle: conq, bOutpost: conq, bFort: conq, bAbsorb: conq, bGrow: conq,
    bTeam: sand, bEdit: sand && !edit, bErase: sand && edit, bMirror: sand && edit, bClear: sand && edit, bMap: sand && edit, bPlay: sand && edit,
    bArmyS: sand && edit, bArmyL: sand && edit, bArmyE: sand && edit,
  };
  for (const k in vis) show(B(k), vis[k]);
  const bTeam = B('bTeam');
  bTeam.className = 't' + app.ctl;
  bTeam.textContent = TNAME[app.ctl];
  B('bErase').classList.toggle('on', app.tool === 'erase');
  B('bSell').classList.toggle('on', app.tool === 'sell');
  B('bRally').classList.toggle('on', app.tool === 'rally');
  B('bSettle').classList.toggle('on', app.tool === 'settle');
  B('bOutpost').classList.toggle('on', app.tool === 'outpost');
  B('bFort').classList.toggle('on', app.tool === 'upgrade');
  B('bAbsorb').classList.toggle('on', app.tool === 'absorb');
  B('bTerr').classList.toggle('on', app.terrOpen);
  for (const n of [1, 2, 3]) B('bG' + n).classList.toggle('has', app.groups.has(n));
  // Top bar.
  B('bPause').classList.toggle('on', app.paused);
  B('bPause').textContent = app.paused ? 'RESUME' : 'PAUSE';
  show(B('bPause'), live && !edit);
  show(B('bSpeed'), live && !edit);
  B('bSpeed').textContent = app.speed + '×';
  show(B('pauseov'), live && app.paused && !w?.pending);
  const ev = w?.pending ?? null;
  show(B('eventcard'), live && !!ev);
  if (ev) { B('evText').textContent = ev.text; B('evYes').textContent = ev.yes; B('evNo').textContent = ev.no; }
  show(B('viewctl'), !!w || map);
  updateTerritoryVisibility(app);
  // Strips.
  const race = ctlRace(app), list = new Set(roster(race));
  for (const k of ALL_UNITS) {
    const T = TYPES[k];
    // Race units always; shared units (boats, vehicles) once their trainer stands, or in the sandbox; never villagers.
    const extraOk = !!T.extra && !!w && (sand || (w.rules.town && !!T.trainer && w.blds.some((b) => b.team === app.ctl && (b.type === T.trainer || (T.trainer === 'dock' && b.type === 'port')))));
    show(unitBtns[k], T.role !== 'civ' && (list.has(k) || extraOk));
    unitBtns[k].classList.toggle('on', sand && edit && app.tool === 'place' && app.brush === k);
    if (sand) unitBtns[k].classList.remove('dis');
  }
  const town = !!w?.rules.town;
  for (const b of document.querySelectorAll<HTMLButtonElement>('#bchips .bc')) b.classList.toggle('on', app.bcat === b.dataset.bcat);
  for (const k of BORDER) {
    const D = BLD[k];
    show(bldBtns[k], (!D.town || town) && bcatOf(k) === app.bcat);
    bldBtns[k].classList.toggle('on', app.tool === 'build' && app.bbrush === k);
    if (sand) bldBtns[k].classList.remove('dis');
  }
  for (const gk of ['road', 'clear'] as const) { const gb = groundBtns[gk]; if (gb) { show(gb, app.bcat === 'ground'); gb.classList.toggle('on', app.tool === 'terrain' && app.tbrush === gk); } }
  if (undoBtn) show(undoBtn, app.bcat === 'ground' && app.lastBuilt.length > 0 && !!w && w.blds.some((b) => app.lastBuilt.includes(b.id)));
  const townCat = app.bcat === 'town';
  for (const id of ['bSettle', 'bOutpost', 'bGrow', 'bFort', 'bAbsorb']) show(B(id), conq && townCat);
  if (w && conq) {
    const towns = w.slots[app.ctl].settlements;
    const cap = towns.find((b) => b.id === app.town && b.hp > 0) ?? towns.find((b) => b.hp > 0 && b.buildT <= 0 && NEXT_TIER[b.tier]);
    const to = cap && cap.buildT <= 0 ? NEXT_TIER[cap.tier] : undefined;
    const why = cap && to ? canGrow(w, cap) : null;
    const name = cap ? (w.regions[cap.region]?.name ?? 'HOME').toUpperCase() : '';
    B('bGrow').textContent = to ? 'GROW ' + name + ' TO ' + to.toUpperCase() + ' · ' + TIERS[to].gold + 'g' : cap && cap.buildT > 0 ? name + ' IS GROWING' : name + ' IS A CITY';
    B('bGrow').title = why ?? '';
    B('bGrow').classList.toggle('dis', !to || !!why);

  }
  for (const k of POWER_KEYS) {
    const P = POWERS[k];
    powerBtns[k].classList.toggle('on', app.tool === 'power' && app.power === k);
    show(powerBtns[k], (!P.realm || w?.mode === 'conquest') && (P.group !== 'chaos' || app.settings.cheats.on));
  }
  show(B('bCheats'), live && (app.settings.cheats.on || sand));
  show(B('cheatChip'), live && app.settings.cheats.on && !sand);
  updateCheatsVisibility(app);
  renderCheats(app);
  for (const t of TOOLS) toolBtns.get(t.k)!.classList.toggle('on', map && app.editor?.tool === t.k);
  if (paintedRace !== race + app.ctl) paintStrip(app);
  fit(app);
}

let lastQueueKey = '';

function renderQueue(app: App): void {
  const w = app.world, el = $('queue');
  if (!w || w.mode === 'sand') { if (lastQueueKey) { el.innerHTML = ''; lastQueueKey = ''; } return; }
  const items: { unit: string; t: number; bld: number | null; index: number; head: boolean }[] = [];
  w.slots[app.ctl].queue.forEach((x, i) => items.push({ unit: x.unit, t: x.t, bld: null, index: i, head: i === 0 }));
  for (const b of w.blds) if (b.team === app.ctl) b.queue.forEach((x, i) => items.push({ unit: x.unit, t: x.t, bld: b.id, index: i, head: i === 0 }));
  const key = items.map((x) => x.unit + (x.bld ?? '')).join(',');
  if (key !== lastQueueKey) {
    lastQueueKey = key;
    el.innerHTML = items.length ? '<span>QUEUE</span>' + items.map((x, i) => '<button data-i="' + i + '" class="' + (x.head ? 'head' : '') + '" title="cancel">' + TYPES[x.unit].name + '<i></i></button>').join('') : '';
    for (const b of el.querySelectorAll<HTMLButtonElement>('button[data-i]')) on(b, 'click', () => { const it = items[+b.dataset.i!]; issueAction(app, { type: 'cancel', payload: { index: it.index, building: it.bld ?? undefined } }); lastQueueKey = ''; });
  }
  el.querySelectorAll<HTMLButtonElement>('button.head').forEach((btn, n) => { const it = items.filter((x) => x.head)[n]; const bar = btn.querySelector<HTMLElement>('i'); if (it && bar) bar.style.width = Math.round(100 * (1 - it.t / buildTime(it.unit))) + '%'; });
}

const STATE_LABEL: Record<string, string> = { growing: 'GROWING', stable: 'STABLE', attacked: 'UNDER ATTACK', recovering: 'RECOVERING' };

/** The one gold button that does the obvious thing for what is selected. */
function contextAction(app: App): void {
  const w = app.world;
  app.act = null;
  if (!w || !app.running) return;
  if (app.warAsk) {
    const a = app.warAsk;
    app.act = { label: 'DECLARE WAR ON ' + a.name + ' AND ATTACK', danger: true, fn: () => { const ids = selectedUnits(app).map((u) => u.id); app.warAsk = null; issueAction(app, { type: 'attack', payload: { ids, target: a.ref, declare: true } }); app.ui.updateUI(); } };
    return;
  }
  if (app.foreign) {
    let b: import('../../sim/types.ts').Settlement | null = null;
    for (const sl of w.slots) for (const x of sl.settlements) if (x.id === app.foreign.id) b = x;
    if (!b || b.team === app.ctl) { app.foreign = null; return; }
    const why = w.mode === 'conquest' ? canCapture(w, app.ctl, b) : 'not in this mode';
    if (!why) { const cost = w.slots[b.team].neutral && b.tier === 'village' ? 200 : CAPTURE_COST; const id = b.id; app.act = { label: 'CAPTURE · ' + cost + 'g', fn: () => { issueAction(app, { type: 'capture', payload: { id } }); app.ui.updateUI(); } }; }
    else if (b.hp > 0 && selectedUnits(app).length) { const tgt = b; app.act = { label: 'ATTACK IT', danger: true, fn: () => { const sel = selectedUnits(app); issueAction(app, { type: 'attack', payload: { ids: sel.map((u) => u.id), target: refOf(tgt), declare: !!allied(w, tgt.team, app.ctl) } }); } }; }
    return;
  }
  const sel = selectedUnits(app);
  const loaded = sel.filter((u) => TYPES[u.type].capacity && w.units.some((o) => o.aboard === u.id && o.hp > 0));
  if (loaded.length) {
    app.act = { label: 'UNLOAD HERE', fn: () => { issueAction(app, { type: 'unload', payload: { ids: loaded.map((u) => u.id), x: loaded[0].x, y: loaded[0].y } }); app.ui.updateUI(); } };
    return;
  }
  if (app.bld >= 0) {
    const b = w.blds.find((x) => x.id === app.bld && x.team === app.ctl);
    if (!b) { app.bld = -1; return; }
    const D = BLD[b.type];
    app.act = { label: 'DEMOLISH', danger: true, fn: () => { if (D.cost >= 100 && !confirm('Demolish the ' + D.name.toLowerCase() + '? Half its cost comes back.')) return; issueAction(app, { type: 'sell', payload: { x: b.x, y: b.y, id: b.id } }); app.bld = -1; app.ui.updateUI(); } };
    return;
  }
  if (app.town >= 0 && w.mode === 'conquest') {
    const s = w.slots[app.ctl].settlements.find((x) => x.id === app.town);
    if (!s) return;
    const to = s.buildT <= 0 ? NEXT_TIER[s.tier] : undefined;
    if (to && !canGrow(w, s)) { const id = s.id; app.act = { label: 'GROW TO ' + to.toUpperCase() + ' · ' + TIERS[to].gold + 'g', fn: () => { issueAction(app, { type: 'ageUp', payload: { id } }); app.ui.updateUI(); } }; }
  }
}

const LAYER_LABELS: [keyof Layers, string][] = [['territory', 'TERRITORY'], ['borders', 'BORDERS'], ['names', 'NAMES'], ['tags', 'STATE']];
let layersKey = '';
function renderWorldChips(app: App): void {
  const key = LAYER_LABELS.map(([k]) => (app.layers[k] ? 1 : 0)).join('') + (app.watch ? 'w' : '');
  if (key === layersKey) return;
  layersKey = key;
  const el = $('layerchips');
  el.innerHTML = LAYER_LABELS.map(([k, l]) => '<button class="chip' + (app.layers[k] ? ' on' : '') + '" data-layer="' + k + '">' + l + '</button>').join('');
  for (const b of el.querySelectorAll<HTMLButtonElement>('button[data-layer]')) on(b, 'click', () => { const k = b.dataset.layer as keyof Layers; app.layers[k] = !app.layers[k]; saveLayers(app); layersKey = ''; app.ui.updateUI(); });
}

function renderSelCard(app: App): void {
  const el = $('selcard');
  const sel = selectedUnits(app);
  const w = app.world;
  if (!sel.length && w && app.town >= 0) {
    const s = w.slots[app.ctl].settlements.find((b) => b.id === app.town);
    if (!s || s.hp <= 0) { app.town = -1; el.textContent = ''; return; }
    const name = w.regions[s.region]?.name ?? 'Base', c = s.civ;
    const st = c.state;
    const to = s.buildT <= 0 ? NEXT_TIER[s.tier] : undefined;
    const why = to ? canGrow(w, s) : null;
    const cap = w.capitals[app.ctl] === s.region ? ' · capital' : '';
    const needs = to ? growNeeds(w, s) : [];
    void why;
    const next = s.buildT > 0 ? '<br><span class="civ">growing into a ' + s.tier + '</span>'
      : to ? '<br><span class="civ">next, ' + to + ': </span>' + needs.map((n) => '<span class="' + (n.ok ? 'req-ok' : 'req-no') + '">' + (n.ok ? '✓' : '✗') + n.label + '</span>').join(' ') : '';
    el.innerHTML = '<span class="town"><b class="rename" title="rename">' + name.toUpperCase() + '</b> ' + s.tier + cap + (w.rules.civilians ? ' · <span class="st-' + st + '">' + STATE_LABEL[st] + '</span><br><span class="civ">' + c.residents + '/' + c.housing + ' people · ' + c.employed + '/' + c.jobs + ' jobs · +' + c.income.toFixed(1) + '/s</span>' : '') + next + '</span>';
    if (s.hp < s.max && s.buildT <= 0) {
      el.innerHTML += '<span class="acts"><button class="mini gold" id="townFix">REPAIR · ' + Math.max(1, Math.ceil(((s.max - s.hp) / s.max) * (TIERS[s.tier].gold || 150) * 0.5)) + 'g</button></span>';
      const fx = el.querySelector<HTMLButtonElement>('#townFix');
      if (fx) fx.onclick = () => { issueAction(app, { type: 'repairBld', payload: { id: s.id } }); app.ui.updateUI(); };
    }
    const rn = el.querySelector<HTMLElement>('.rename');
    if (rn) rn.onclick = () => { const v = prompt('Name this settlement', name); if (v != null) issueAction(app, { type: 'rename', payload: { region: s.region, name: v } }); };
    return;
  }
  if (!sel.length && w && app.bld >= 0) {
    const b = w.blds.find((x) => x.id === app.bld && x.team === app.ctl);
    if (!b) { app.bld = -1; el.textContent = ''; return; }
    const D = BLD[b.type];
    const role = D.trains?.[0];
    const isDefault = role !== undefined && w.slots[app.ctl].prefer[role] === b.id;
    const lines = [D.name + (b.level > 1 ? ' ' + 'I'.repeat(b.level).replace('III', 'III') : '') + (b.buildT > 0 ? ' · building' : '') + ' · ' + Math.round(b.hp) + '/' + b.max + ' hp' + (b.queue.length ? ' · ' + b.queue.length + ' in queue' : '')];
    if (D.trains) lines.push('trains ' + D.trains.join(', ') + (isDefault ? ' · DEFAULT' : '') + '. UNITS tab trains here.');
    if (b.rally) lines.push('rally point set');
    // Research sold here, and the upgrade for this building.
    const techs = w.rules.town ? TECH_KEYS.filter((t) => TECH_INFO[t].at === b.type || (b.type === 'port' && TECH_INFO[t].at === 'dock')) : [];
    const tech = w.slots[app.ctl].tech;
    const rows = techs.map((t) => { const lvl = tech[t], I = TECH_INFO[t], why = canResearch(w, app.ctl, t); return '<button class="mini' + (why ? ' dis' : '') + '" data-tech="' + t + '" title="' + I.text + (why ? '. ' + why : '') + '">' + TECH_NAMES[t] + ' ' + (lvl >= I.levels ? 'MAX' : (lvl + 1) + ' · ' + RESEARCH_COST[lvl] + 'g') + '</button>'; });
    if (b.hp < b.max && b.buildT <= 0) rows.push('<button class="mini gold" data-fix="' + b.id + '">REPAIR · ' + Math.max(1, Math.ceil(((b.max - b.hp) / b.max) * D.cost * 0.5)) + 'g</button>');
    const upWhy = canUpgradeBld(w, app.ctl, b), nt = nextType(b.type), cost = upgradeCost(b);
    if (!upWhy) rows.push('<button class="mini gold" data-up="' + b.id + '">' + (nt ? 'UPGRADE TO ' + BLD[nt].name + ' · ' + cost.mat + 'm' : 'LEVEL ' + (b.level + 1) + ' · ' + cost.gold + 'g') + '</button>' + (nt ? '<button class="mini" data-upall="' + b.id + '">ALL CONNECTED</button>' : ''));
    else if (D.trains || nt) rows.push('<span class="civ">upgrade: ' + upWhy + '</span>');
    el.innerHTML = '<span class="town"><b>' + lines[0] + '</b>' + (lines.length > 1 ? '<br><span class="civ">' + lines.slice(1).join(' · ') + '</span>' : '') + (rows.length ? '<br><span class="acts">' + rows.join(' ') + '</span>' : '') + '</span>';
    for (const btn of el.querySelectorAll<HTMLButtonElement>('button[data-tech]')) btn.onclick = () => { issueAction(app, { type: 'research', payload: { tech: btn.dataset.tech as import('../../sim/types.ts').Tech } }); app.ui.updateUI(); };
    for (const btn of el.querySelectorAll<HTMLButtonElement>('button[data-fix]')) btn.onclick = () => { issueAction(app, { type: 'repairBld', payload: { id: +btn.dataset.fix! } }); app.ui.updateUI(); };
    for (const btn of el.querySelectorAll<HTMLButtonElement>('button[data-up]')) btn.onclick = () => { issueAction(app, { type: 'upgradeBld', payload: { id: +btn.dataset.up! } }); app.ui.updateUI(); };
    for (const btn of el.querySelectorAll<HTMLButtonElement>('button[data-upall]')) btn.onclick = () => { issueAction(app, { type: 'upgradeBld', payload: { id: +btn.dataset.upall!, connected: true } }); app.ui.updateUI(); };
    return;
  }
  if (!sel.length && w && app.foreign) {
    let b: import('../../sim/types.ts').Settlement | null = null;
    for (const sl of w.slots) for (const x of sl.settlements) if (x.id === app.foreign.id) b = x;
    if (!b) { app.foreign = null; el.textContent = ''; return; }
    const owner = w.slots[b.team].neutral ? (b.tier === 'camp' ? 'BANDITS' : b.tier === 'ruin' ? 'RUINS' : 'INDEPENDENT') : TNAME[b.team] + ' · ' + relation(w, app.ctl, b.team);
    const why = w.mode === 'conquest' ? canCapture(w, app.ctl, b) : 'not in this mode';
    const status = !why ? 'READY TO CAPTURE' : why.toUpperCase();
    el.innerHTML = '<span class="town"><b>' + (w.regions[b.region]?.name ?? 'SETTLEMENT').toUpperCase() + '</b> ' + b.tier + ' · ' + owner + (b.hp > 0 ? ' · ' + Math.round(b.hp) + '/' + b.max + ' hp' : ' · RAZED') + '<br><span class="' + (why ? 'civ' : 'st-growing') + '">' + status + '</span></span>';
    return;
  }
  if (!sel.length) { if (el.textContent) el.textContent = ''; return; }
  if (sel.length === 1 && TYPES[sel[0].type].capacity && w) {
    const t = sel[0], cap = TYPES[t.type].capacity!;
    const riders = w.units.filter((u) => u.aboard === t.id && u.hp > 0);
    const comp = new Map<string, number>();
    for (const u of riders) comp.set(u.type, (comp.get(u.type) ?? 0) + 1);
    el.innerHTML = '<span class="town"><b>' + TYPES[t.type].name + '</b> · ' + Math.round(t.hp) + '/' + TYPES[t.type].hp + ' hp · <b>' + riders.length + ' / ' + cap + '</b> aboard' + (riders.length ? '<br><span class="civ">' + [...comp.entries()].map(([k, n]) => n + ' ' + TYPES[k].name).join(', ') + '. Select units and tap it to board; UNLOAD sets them down.</span>' : '<br><span class="civ">Select ground units, then tap this ' + TYPES[t.type].name.toLowerCase() + ' to board them.</span>') + '</span>';
    return;
  }
  if (sel.length === 1 && sel[0].type === 'caravan' && w) {
    const u = sel[0];
    const t = w.slots[u.team].settlements.find((x) => x.id === u.job);
    let threat = false;
    for (const o of w.units) if (o.hp > 0 && !allied(w, o.team, u.team) && TYPES[o.type].dmg > 0 && Math.hypot(o.x - u.x, o.y - u.y) < 60) { threat = true; break; }
    el.innerHTML = '<span class="town"><b>MERCHANT CARAVAN</b> · to ' + (t ? (w.regions[t.region]?.name ?? 'town') : 'nowhere') + ' · +100 gold on arrival<br><span class="' + (threat ? 'st-attacked' : 'civ') + '">' + (threat ? 'THREATENED: enemies close' : 'Traveling. Keep the road clear.') + '</span></span>';
    return;
  }
  const comp = new Map<string, number>();
  let hp = 0, max = 0;
  for (const u of sel) { comp.set(u.type, (comp.get(u.type) ?? 0) + 1); hp += u.hp; max += maxHp(u); }
  const parts = [...comp.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => n + ' ' + TYPES[k].name);
  el.innerHTML = '<b>' + sel.length + '</b> ' + parts.join(', ') + ' · ' + Math.round((100 * hp) / max) + '% hp';
}

function renderPowers(app: App): void {
  const w = app.world;
  if (!w || app.tab !== 'powers') return;
  const s = w.slots[app.ctl];
  for (const k of POWER_KEYS) {
    const b = powerBtns[k], cd = s.powerCd[k] ?? 0, P = POWERS[k];
    const bar = b.querySelector<HTMLElement>('i.cd');
    if (bar) bar.style.width = cd > 0 ? Math.round((100 * cd) / P.cd) + '%' : '0';
    b.classList.toggle('dis', cd > 0 || (Number.isFinite(s.gold) && s.gold < P.cost && w.mode !== 'sand'));
  }
}

export function renderHud(app: App): void {
  const tl = $('tl'), wave = $('wave'), msg = $('msg');
  const w = app.world;
  renderQueue(app);
  renderSelCard(app);
  renderPowers(app);
  if (app.editor) {
    const m = app.editor.map;
    tl.textContent = 'Map editor';
    wave.textContent = m.cols + '×' + m.rows + ' · ' + m.mines.length + ' mines · ' + (TOOLS.find((t) => t.k === app.editor!.tool)?.name ?? '');
    msg.textContent = app.msgT > 0 ? app.msg : '';
    return;
  }
  if (!w) { msg.textContent = ''; return; }
  const selN = selectedUnits(app).length;
  if (w.mode === 'sand') {
    tl.textContent = w.phase === 'edit' ? 'Sandbox: edit' : 'Sandbox';
    wave.textContent = 'Blue ' + count(w, 0) + ' · Red ' + count(w, 1) + (selN ? ' · sel ' + selN : '');
  } else {
    const gold = w.slots[0].gold;
    if (w.mode === 'conquest') {
      const net = w.net[0];
      const secs = net < 0 ? gold / -net : Infinity;
      const narrow = app.layout === 'mobile' && window.innerWidth <= 430;
      const mat = w.rules.materials ? ' <span class="mat">' + (narrow ? 'M' : 'Mat ') + Math.floor(w.slots[0].mat) + (narrow ? '' : ' +' + matRate(w, 0).toFixed(1)) + '</span>' : '';
      const pop = w.rules.population ? ' <span class="pop">' + (narrow ? 'P' : 'Pop ') + popUsed(w, 0) + '/' + popCap(w, 0) + '</span>' : '';
      tl.innerHTML = (narrow ? '<b>' : 'Gold <b>') + (Number.isFinite(gold) ? Math.floor(gold) : '∞') + '</b> <span class="net' + (net < 0 ? ' neg' : '') + '">' + (net >= 0 ? '+' : '') + net.toFixed(1) + (narrow ? '' : '/s') + '</span>' + (secs < 60 ? ' <span class="warn">' + Math.ceil(secs) + 's</span>' : '') + mat + pop;
      const held = w.regions.filter((r) => r.owner === 0), broken = held.filter((r) => !r.connected).length, weak = held.filter((r) => r.garrison < r.need).length, angry = held.filter((r) => r.unrest >= 50).length;
      wave.textContent = 'Day ' + w.day + ' · ' + AGE_NAMES[w.slots[0].age] + ' · ' + held.length + '/' + w.regions.length + ' regions' + (broken ? ' · ' + broken + ' cut off' : '') + (weak ? ' · ' + weak + ' undermanned' : '') + (angry ? ' · ' + angry + ' restless' : '');
      renderTerritory(app);
    } else {
      tl.innerHTML = 'Gold <b>' + (Number.isFinite(gold) ? Math.floor(gold) : '∞') + '</b> <span class="inc' + (w.incFlash > 0 ? ' flash' : '') + '">+' + w.income.toFixed(1) + '/s</span> <span class="race">' + RACES[w.slots[0].race].name + '</span>';
      if (w.mode === 'dom') wave.textContent = '⚑ ' + Math.floor(w.score[0]) + ':' + Math.floor(w.score[1]) + ' of 150';
      else if (w.mode === 'multi') {
        let r = 0;
        for (let i = 1; i < w.nP; i++) if (w.slots[i].alive && !allied(w, 0, i)) r++;
        wave.textContent = r + ' rival' + (r === 1 ? '' : 's') + ' left · ' + DIFF[w.diff].name;
      } else {
        let held = 0, moving = 0;
        for (const u of w.units) if (u.team !== 0 && !allied(w, 0, u.team)) { if (u.held) held++; else moving++; }
        wave.textContent = moving > held ? 'Enemy attacking: ' + moving : held ? 'Enemy massing: ' + held : 'Enemy quiet';
      }
    }
    for (const k of roster(ctlRace(app))) {
      const why = w.rules.town ? canTrain(w, app.ctl, k) : null;
      unitBtns[k].classList.toggle('dis', gold < TYPES[k].cost || !!why);
      const tag = unitBtns[k].querySelector<HTMLElement>('small.need');
      if (why) { if (tag) tag.textContent = why; else { const n = document.createElement('small'); n.className = 'need'; n.textContent = why; unitBtns[k].appendChild(n); } }
      else if (tag) tag.remove();
    }
    for (const k of BORDER) {
      const D = BLD[k], s0 = w.slots[app.ctl];
      const ageOk = !w.rules.town || (D.age ?? 0) <= s0.age;
      bldBtns[k].classList.toggle('dis', gold < D.cost || !ageOk);
    }
  }
  msg.textContent = w.msgT > 0 ? w.msg : '';
}
