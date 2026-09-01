// Top bar, toast, tabbed panel (units, build, powers, more), context command row, view controls.

import { AGE_NAMES, BLD, BORDER } from '../../data/buildings.ts';
import { canTrain, RESEARCH_COST, TECH_NAMES } from '../../sim/town.ts';
import { NEXT_TIER, TIERS } from '../../sim/conquest.ts';
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
import { matRate, popCap, popUsed } from '../../sim/conquest.ts';
import { buildTime, maxHp } from '../../sim/units.ts';
import { allied, count } from '../../sim/world.ts';
import { ctlRace, fit, issueAction, say, selectedUnits, type App, type Tab } from '../app.ts';
import { $, on, show } from '../dom.ts';
import { focusBase } from '../input/hotkeys.ts';
import { renderTerritory, updateTerritoryVisibility } from '../territory.ts';

const unitBtns = {} as Record<UnitKey, HTMLButtonElement>;
const bldBtns = {} as Record<string, HTMLButtonElement>;
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
  issueAction(app, { type: 'buy', payload: { unit: k } });
}

export function buildStrips(app: App): void {
  const strip = $('strip'), bstrip = $('bstrip'), pstrip = $('pstrip'), tstrip = $('tstrip');
  for (const k of ALL_UNITS) { unitBtns[k] = mkStripBtn(strip, TYPES[k].name, TYPES[k].cost, () => unitTap(app, k)); unitBtns[k].title = TYPES[k].name; }
  const groups: [string, string][] = [['defense', 'DEFENSE'], ['economy', 'TOWN'], ['military', 'MILITARY']];
  for (const [g, label] of groups) {
    const head = document.createElement('div');
    head.className = 'ghead';
    head.textContent = label;
    head.id = 'gh-' + g;
    bstrip.appendChild(head);
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
  const tabs: [string, Tab][] = [['tUnits', 'units'], ['tBuild', 'build'], ['tPowers', 'powers'], ['tMore', 'more'], ['tTools', 'tools'], ['tEdit', 'edit']];
  for (const [id, tab] of tabs) on($(id), 'click', () => { app.tab = tab; if (tab === 'build') app.tool = 'build'; else if (app.tool === 'build' || app.tool === 'sell') app.tool = app.world?.phase === 'edit' ? 'place' : 'cmd'; updateUI(app); });
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
  paintedRace = race + app.ctl;
}

/** Zoom, fit, home, and the minimap. */
export function wireViewButtons(app: App): void {
  on($('bZoomIn'), 'click', () => setZoom(app.cam, app.cam.zoom + 1));
  on($('bZoomOut'), 'click', () => setZoom(app.cam, app.cam.zoom - 1));
  on($('bFit'), 'click', () => { setZoom(app.cam, fitZoom(app.cam, 'both')); centerOn(app.cam, app.cam.mapW / 2, app.cam.mapH / 2, false); });
  on($('bHome'), 'click', () => focusBase(app));
  on($('pauseov'), 'click', () => { app.paused = false; updateUI(app); });
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
  // Tabs: the editor shows terrain and map, everything else units, build, powers, more.
  if (map && app.tab !== 'tools' && app.tab !== 'edit') app.tab = 'tools';
  if (!map && (app.tab === 'tools' || app.tab === 'edit')) app.tab = 'units';
  show(B('tUnits'), !map); show(B('tBuild'), !map); show(B('tPowers'), live && !edit); show(B('tMore'), !map);
  show(B('tTools'), map); show(B('tEdit'), map);
  for (const [id, tab] of [['tUnits', 'units'], ['tBuild', 'build'], ['tPowers', 'powers'], ['tMore', 'more'], ['tTools', 'tools'], ['tEdit', 'edit']] as const) B(id).classList.toggle('on', app.tab === tab);
  show(B('strip'), app.tab === 'units'); show(B('bstrip'), app.tab === 'build'); show(B('pstrip'), app.tab === 'powers'); show(B('more'), app.tab === 'more');
  show(B('tstrip'), app.tab === 'tools'); show(B('estrip'), app.tab === 'edit');
  // Command row: context sensitive.
  const hasSel = selectedUnits(app).length > 0;
  // No selection: pan toggle, select all, charge. With a selection: the stances and retreat.
  show(B('bSelect'), live && !edit && !toolOn && !hasSel);
  show(B('bAll'), live && !edit && !toolOn);
  show(B('bCharge'), live && !edit && !toolOn && !hasSel);
  for (const [id, st] of [['bMove', 'move'], ['bAttack', 'attack'], ['bGuard', 'guard']] as const) { show(B(id), live && !edit && !toolOn && hasSel); B(id).classList.toggle('on', app.stance === st); }
  show(B('bRetreat'), live && !edit && !toolOn && hasSel);
  show(B('bHold'), false);
  show(B('bCancel'), toolOn || (edit && app.tool === 'erase'));
  const pw = app.power;
  B('bCancel').textContent = 'CANCEL ' + (app.tool === 'power' && pw ? POWERS[pw].name : app.tool === 'build' ? BLD[app.bbrush].name : app.tool.toUpperCase());
  B('bSelect').classList.toggle('on', app.selectMode);
  B('bSelect').textContent = app.selectMode ? 'DRAG: BOX' : 'DRAG: PAN';
  // More grid.
  const vis: Record<string, boolean> = {
    bRally: live && !edit && !sand, bG1: live && !edit && !sand, bG2: live && !edit && !sand, bG3: live && !edit && !sand, bSell: live && !edit,
    bLand: conq, bTerr: conq, bSettle: conq, bOutpost: conq, bFort: conq, bAbsorb: conq, bSave: conq,
    bTeam: sand, bEdit: sand && !edit, bErase: sand && edit, bMirror: sand && edit, bClear: sand && edit, bMap: sand && edit, bPlay: sand && edit,
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
  B('bLand').classList.toggle('on', app.overlay);
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
    show(unitBtns[k], list.has(k));
    unitBtns[k].classList.toggle('on', sand && edit && app.tool === 'place' && app.brush === k);
    if (sand) unitBtns[k].classList.remove('dis');
  }
  const town = !!w?.rules.town;
  for (const k of BORDER) {
    const D = BLD[k];
    show(bldBtns[k], !D.town || town);
    bldBtns[k].classList.toggle('on', app.tool === 'build' && app.bbrush === k);
    if (sand) bldBtns[k].classList.remove('dis');
  }
  show(B('gh-economy'), town); show(B('gh-military'), town); show(B('gh-defense'), town);
  show(B('bGrow'), conq); show(B('bTech1'), town); show(B('bTech2'), town); show(B('bTech3'), town);
  if (w && conq) {
    const cap = w.slots[app.ctl].settlements.find((b) => b.hp > 0 && b.buildT <= 0 && NEXT_TIER[b.tier]);
    const to = cap ? NEXT_TIER[cap.tier] : undefined;
    B('bGrow').textContent = to ? 'GROW: ' + to.toUpperCase() + ' ' + TIERS[to].gold + 'g' : cap ? 'GROWING' : 'CITY';
    B('bGrow').classList.toggle('dis', !to);
    const techs = ['melee', 'ranged', 'armor'] as const;
    techs.forEach((t, i) => { const lvl = w.slots[app.ctl].tech[t]; const b = B('bTech' + (i + 1)); b.textContent = TECH_NAMES[t] + ' ' + (lvl >= RESEARCH_COST.length ? 'MAX' : (lvl + 1) + ' · ' + RESEARCH_COST[lvl] + 'g'); b.classList.toggle('dis', lvl >= RESEARCH_COST.length); });
  }
  for (const k of POWER_KEYS) powerBtns[k].classList.toggle('on', app.tool === 'power' && app.power === k);
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

function renderSelCard(app: App): void {
  const el = $('selcard');
  const sel = selectedUnits(app);
  if (!sel.length) { if (el.textContent) el.textContent = ''; return; }
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
