// Main menu, Multi War setup, map list, map code, and end screen. Plain DOM from template strings.

import { BUILTIN } from '../../data/maps.ts';
import { DIFF, DIFF_KEYS, type DiffKey } from '../../data/difficulty.ts';
import { TEAM } from '../../data/teams.ts';
import { RACE_KEYS, RACES, type RaceKey } from '../../data/races.ts';
import { decodeMap, encodeMap } from '../../sim/map.ts';
import type { Mode } from '../../sim/types.ts';
import { allied, count } from '../../sim/world.ts';
import { hideOverlay, openEditor, say, setEditorMap, startGame, type App } from '../app.ts';
import { clearSlot, continueRealm, copySlot, hasSave, latestSlot, renameSlot, saveRealm, SLOTS, slotHealthy, slotMeta, startRealm } from '../conquest.ts';
import { WORLD_SIZES, type WorldSize } from '../../data/realm.ts';
import { showHelp, showSettings, showStats } from './settings.ts';
import { recordGame } from '../stats.ts';
import { synth } from '../../audio/synth.ts';
import { $, on } from '../dom.ts';
import { startBattle, toEdit } from '../hud/commands.ts';

const ov = (): HTMLElement => $('ov');

function diffRowHtml(app: App): string {
  return '<div class="row">' + DIFF_KEYS.map((k) => '<button class="sm' + (k === app.diff ? ' on' : '') + '" data-diff="' + k + '">' + DIFF[k].name + '</button>').join('') + '</div>';
}

const nextRace = (r: RaceKey | null, allowRandom: boolean): RaceKey | null => {
  const i = r ? RACE_KEYS.indexOf(r) : -1;
  if (i + 1 >= RACE_KEYS.length) return allowRandom ? null : RACE_KEYS[0];
  return RACE_KEYS[i + 1];
};
const raceName = (r: RaceKey | null): string => (r ? RACES[r].name : 'RANDOM');

function wireDiff(app: App, rerender: () => void): void {
  for (const b of ov().querySelectorAll<HTMLButtonElement>('button[data-diff]')) on(b, 'click', () => { app.diff = b.dataset.diff as DiffKey; rerender(); });
}

export function showMenu(app: App): void {
  if (app.world?.mode === 'conquest' && app.running) saveRealm(app);
  app.running = false;
  ov().innerHTML = `<div>
    <h1>PIXEL <span>WAR</span></h1>
    <p class="ver">v1.0</p>
    ${hasSave(app) ? '<button class="gold" id="mCont">CONTINUE REALM<small>' + contLine(app) + '</small></button><button data-mode="conquest">NEW REALM<small>Another world, or another save slot.</small></button>' : '<button class="gold" data-mode="conquest">NEW REALM<small>Build a persistent kingdom. Grow cities, fight wars, come back tomorrow.</small></button>'}
    <button id="mQuick">QUICK BATTLE<small>One match against the AI: skirmish, multi war, domination, or unlimited gold.</small></button>
    <button data-mode="sand">BATTLE SIM<small>Place armies and defenses for both sides, press PLAY, watch it play out.</small></button>
    <button id="mEditor">MAP EDITOR<small>Paint a battlefield and play on it.</small></button>
    <div class="row"><button class="sm" id="mHelp">HOW TO PLAY</button><button class="sm" id="mSettings">SETTINGS</button><button class="sm" id="mStats">STATS</button></div>
  </div>`;
  for (const b of ov().querySelectorAll<HTMLButtonElement>('button[data-mode]'))
    on(b, 'click', () => {
      const mode = b.dataset.mode as Mode;
      if (mode === 'conquest') { showConquest(app); return; }
      startGame(app, mode);
    });
  const mc = document.getElementById('mCont');
  if (mc) on(mc, 'click', () => { if (!continueRealm(app)) { say(app, 'That save could not be read. Pick another slot or clear it.', 3); showConquest(app); } });
  on($('mQuick'), 'click', () => showQuick(app));
  on($('mEditor'), 'click', () => { ov().classList.add('hide'); openEditor(app, 'menu'); });
  on($('mSettings'), 'click', () => showSettings(app, () => showMenu(app)));
  on($('mHelp'), 'click', () => showHelp(() => showMenu(app)));
  on($('mStats'), 'click', () => showStats(app, () => showMenu(app)));
  ov().classList.remove('hide');
}

/** One match against the AI: pick the map, the sides, the difficulty, and the mode. */
export function showQuick(app: App): void {
  const m = app.curMap;
  ov().innerHTML = `<div>
    <h2>QUICK BATTLE</h2>
    <button class="pick cur" id="mMap">MAP: ${m.name.toUpperCase()}<span>${m.cols}×${m.rows} · change</span></button>
    <div class="row"><button class="pick" id="mRace">YOU: ${RACES[app.race].name}<span>change</span></button><button class="pick" id="mFoe">FOE: ${raceName(app.foeRace)}<span>change</span></button></div>
    <p class="blurb">${RACES[app.race].blurb}</p>
    ${diffRowHtml(app)}
    <button class="gold" data-mode="skirmish">SKIRMISH<small>1v1. Destroy the enemy base. It sits behind a fort, so bring siege.</small></button>
    <button data-mode="multi">MULTI WAR<small>Up to 5 armies. Teams or free for all. Last alliance standing.</small></button>
    <button data-mode="dom">DOMINATION<small>Hold the mines to fill your meter. First to 150 points wins.</small></button>
    <button data-mode="rich">UNLIMITED GOLD<small>Bottomless treasury. Enemy income doubled, army cap 60.</small></button>
    <button id="qBack">BACK</button>
  </div>`;
  for (const b of ov().querySelectorAll<HTMLButtonElement>('button[data-mode]'))
    on(b, 'click', () => {
      const mode = b.dataset.mode as Mode;
      if (mode === 'dom' && !app.curMap.mines.length) { b.textContent = 'THIS MAP HAS NO MINES'; return; }
      if (mode === 'multi') { showSetup(app); return; }
      startGame(app, mode);
    });
  on($('mMap'), 'click', () => showMaps(app));
  on($('mRace'), 'click', () => { app.race = nextRace(app.race, false)!; showQuick(app); });
  on($('mFoe'), 'click', () => { app.foeRace = nextRace(app.foeRace, true); showQuick(app); });
  on($('qBack'), 'click', () => showMenu(app));
  wireDiff(app, () => showQuick(app));
  ov().classList.remove('hide');
}

function contLine(app: App): string {
  const m = slotMeta(app, latestSlot(app));
  if (!m) return '';
  return 'Slot ' + latestSlot(app) + ': day ' + m.day + ', ' + m.towns + ' town' + (m.towns === 1 ? '' : 's') + ', ' + m.people + ' people, ' + m.army + ' soldiers.';
}

function slotCard(app: App, n: number): string {
  const m = slotMeta(app, n);
  if (!m) return '<button class="pick dim" data-start="' + n + '">SLOT ' + n + ': EMPTY<span>start a new realm here</span></button>';
  const when = m.savedAt ? new Date(m.savedAt).toLocaleDateString() : '';
  if (!slotHealthy(app, n)) return '<div class="slotrow"><button class="pick name dim" disabled>SLOT ' + n + ': DAMAGED<span>this save cannot be read. Clear it to reuse the slot.</span></button><button class="sm" data-clear="' + n + '">CLEAR</button></div>';
  const rel = m.rivals ? (m.wars ? m.wars + ' at war' : 'at peace') : 'no rivals left';
  const size = m.cols >= 200 ? 'massive' : m.cols >= 140 ? 'huge' : m.cols >= 90 ? 'large' : m.cols >= 64 ? 'standard' : 'small';
  return '<div class="slotrow"><button class="pick name" data-cont="' + n + '">' + (m.label ? m.label.toUpperCase() : 'SLOT ' + n) + ': ' + RACES[m.race].name + ', DAY ' + m.day
    + '<span>' + size + ' · ' + m.towns + ' town' + (m.towns === 1 ? '' : 's') + ' · ' + m.regions + ' regions · ' + m.people + ' people · ' + m.army + ' soldiers · ' + rel + (m.feats ? ' · ' + m.feats + ' feat' + (m.feats === 1 ? '' : 's') : '') + (m.cheats ? ' · <b class="warn">CHEATS</b>' : '') + (when ? ' · ' + when : '') + '</span></button>'
    + '<span class="slotacts"><button class="sm" data-rename="' + n + '">NAME</button><button class="sm" data-copy="' + n + '">COPY</button><button class="sm" data-clear="' + n + '">CLEAR</button></span></div>';
}

export function showConquest(app: App): void {
  const empty = SLOTS.find((n) => !slotMeta(app, n));
  const filled = SLOTS.filter((n) => slotMeta(app, n));
  // Filled slots first, then one empty slot to start in; the rest stay out of the way.
  const shown = [...filled, ...(empty ? [empty] : [])];
  ov().innerHTML = '<div><h2>REALM</h2>'
    + '<p>A world that keeps going. Build a village into a city, settle the land next door, hold it against raids and rivals, and come back to it whenever you like. Nothing ends unless you lose everything.</p>'
    + shown.map((n) => slotCard(app, n)).join('') + (filled.length ? '<p class="blurb">' + filled.length + ' of ' + SLOTS.length + ' slots used.</p>' : '')
    + '<h3>NEW REALM</h3>'
    + '<div class="row"><button class="pick" id="cqRace">YOU: ' + RACES[app.race].name + '<span>change</span></button><button class="pick" id="cqFoe">RIVALS: ' + raceName(app.foeRace) + '<span>change</span></button></div>'
    + '<div class="row">' + [1, 2, 3, 4].map((n) => '<button class="sm' + (app.rivals === n ? ' on' : '') + '" data-rivals="' + n + '">' + n + ' RIVAL' + (n > 1 ? 'S' : '') + '</button>').join('') + '</div>'
    + '<div class="row">' + (Object.keys(WORLD_SIZES) as WorldSize[]).map((k) => '<button class="sm' + (app.size === k ? ' on' : '') + '" data-size="' + k + '">' + WORLD_SIZES[k].name + '</button>').join('') + '</div>'
    + '<p class="blurb">' + WORLD_SIZES[app.size].text + '</p>'
    + diffRowHtml(app)
    + '<div class="row seedrow"><label for="cqSeed">SEED</label><input id="cqSeed" type="text" inputmode="numeric" placeholder="random" value="' + (app.seed ?? '') + '"></div>'
    + '<div class="row">' + (empty ? '<button class="gold" data-new="' + empty + '">START A NEW REALM<small>in slot ' + empty + '</small></button>' : '<p class="blurb">Every slot is used. Clear one to start again.</p>') + '</div>'
    + '<button id="cqBack">BACK</button></div>';
  const readSeed = (): void => { const v = (document.getElementById('cqSeed') as HTMLInputElement).value.trim(); app.seed = v === '' || !/^\d+$/.test(v) ? null : (+v | 0); };
  for (const b of ov().querySelectorAll<HTMLButtonElement>('button[data-cont]')) on(b, 'click', () => { if (!continueRealm(app, +b.dataset.cont!)) { say(app, 'Save could not be read', 2); showConquest(app); } });
  for (const b of ov().querySelectorAll<HTMLButtonElement>('button[data-start]')) on(b, 'click', () => { readSeed(); startRealm(app, +b.dataset.start!); });
  for (const b of ov().querySelectorAll<HTMLButtonElement>('button[data-new]')) on(b, 'click', () => { const n = +b.dataset.new!; readSeed(); if (slotMeta(app, n) && !confirm('Replace the realm in slot ' + n + '?')) return; startRealm(app, n); });
  for (const b of ov().querySelectorAll<HTMLButtonElement>('button[data-clear]')) on(b, 'click', () => { if (confirm('Clear slot ' + b.dataset.clear + '? This cannot be undone.')) { clearSlot(app, +b.dataset.clear!); showConquest(app); } });
  for (const b of ov().querySelectorAll<HTMLButtonElement>('button[data-rename]')) on(b, 'click', () => { const v = prompt('Name this realm', slotMeta(app, +b.dataset.rename!)?.label ?? ''); if (v != null) { renameSlot(app, +b.dataset.rename!, v); showConquest(app); } });
  for (const b of ov().querySelectorAll<HTMLButtonElement>('button[data-copy]')) on(b, 'click', () => { const to = copySlot(app, +b.dataset.copy!); say(app, to > 0 ? 'Copied to slot ' + to : 'No free slot to copy into', 2); showConquest(app); });
  for (const b of ov().querySelectorAll<HTMLButtonElement>('button[data-rivals]')) on(b, 'click', () => { readSeed(); app.rivals = +b.dataset.rivals!; showConquest(app); });
  for (const b of ov().querySelectorAll<HTMLButtonElement>('button[data-size]')) on(b, 'click', () => { readSeed(); app.size = b.dataset.size as WorldSize; showConquest(app); });
  on($('cqRace'), 'click', () => { readSeed(); app.race = nextRace(app.race, false)!; showConquest(app); });
  on($('cqFoe'), 'click', () => { readSeed(); app.foeRace = nextRace(app.foeRace, true); showConquest(app); });
  on($('cqBack'), 'click', () => showMenu(app));
  wireDiff(app, () => { readSeed(); showConquest(app); });
  ov().classList.remove('hide');
}

export function showSetup(app: App): void {
  let rows = '';
  for (let i = 0; i < 5; i++) {
    const r = app.mset[i];
    const col = r.on ? TEAM[app.mset.slice(0, i + 1).filter((q) => q.on).length - 1] : '#5a5d6a';
    const name = i === 0 ? 'YOU' : r.on ? 'AI ' + i : 'OFF';
    const race = i === 0 ? app.race : r.race;
    rows += '<div class="slotrow">'
      + '<button class="name" data-slot="' + i + '" ' + (i === 0 ? 'disabled' : '') + ' style="color:' + col + ';border-color:' + (r.on ? col : '#3a3d4a') + '">' + name + '</button>'
      + '<button data-team="' + i + '" ' + (r.on ? '' : 'disabled class="dis"') + '>TEAM ' + (r.team + 1) + '</button>'
      + '<button data-race="' + i + '" ' + (r.on ? '' : 'disabled class="dis"') + '>' + raceName(race) + '</button>'
      + '</div>';
  }
  ov().innerHTML = '<div><h2>MULTI WAR</h2>'
    + '<p>Up to 5 armies on one map. Same team number = allies. All different = free for all. Extra bases are placed automatically.</p>'
    + rows + diffRowHtml(app)
    + '<div class="row"><button class="gold" id="msStart">START</button><button id="msBack">BACK</button></div></div>';
  for (const b of ov().querySelectorAll<HTMLButtonElement>('button[data-slot]'))
    on(b, 'click', () => { const i = +b.dataset.slot!; if (i === 0) return; app.mset[i].on = !app.mset[i].on; showSetup(app); });
  for (const b of ov().querySelectorAll<HTMLButtonElement>('button[data-team]'))
    on(b, 'click', () => { const i = +b.dataset.team!; app.mset[i].team = (app.mset[i].team + 1) % 5; showSetup(app); });
  for (const b of ov().querySelectorAll<HTMLButtonElement>('button[data-race]'))
    on(b, 'click', () => {
      const i = +b.dataset.race!;
      if (i === 0) app.race = nextRace(app.race, false)!;
      else app.mset[i].race = nextRace(app.mset[i].race, true);
      showSetup(app);
    });
  wireDiff(app, () => showSetup(app));
  on($('msBack'), 'click', () => showMenu(app));
  on($('msStart'), 'click', () => {
    const actv = app.mset.filter((r) => r.on);
    if (actv.length < 2) { $('msStart').textContent = 'TURN ON AN AI'; return; }
    if (!actv.some((r, idx) => idx > 0 && r.team !== actv[0].team)) { $('msStart').textContent = 'NEED AN ENEMY TEAM'; return; }
    startGame(app, 'multi', actv.map((r) => r.team), actv.map((r, idx) => (idx === 0 ? app.race : r.race)));
  });
  ov().classList.remove('hide');
}

export function showMaps(app: App): void {
  const list = BUILTIN.concat(app.custom ? [app.custom] : []);
  ov().innerHTML = '<div><h2>MAPS</h2>' + list.map((m, i) => '<button class="pick' + (m === app.curMap ? ' cur' : '') + '" data-i="' + i + '">' + m.name.toUpperCase() + '<span>' + m.cols + '×' + m.rows + ' · ' + m.mines.length + ' mines</span></button>').join('')
    + '<div class="row"><button class="gold" id="mEdit">CUSTOMIZE</button><button id="mBack">BACK</button></div><p>Customize opens the selected map in the editor. Paint terrain, move bases, drop mines, or roll a random one.</p></div>';
  for (const b of ov().querySelectorAll<HTMLButtonElement>('button[data-i]')) on(b, 'click', () => { app.curMap = list[+b.dataset.i!]; showMaps(app); });
  on($('mEdit'), 'click', () => openEditor(app, 'menu'));
  on($('mBack'), 'click', () => showMenu(app));
}

export function showCode(app: App): void {
  if (!app.editor) return;
  ov().innerHTML = '<div><h2>MAP CODE</h2><p>Copy this to keep the map, or paste a code and LOAD it.</p><textarea id="codeTa"></textarea><div class="row"><button id="cCopy">COPY</button><button class="gold" id="cLoad">LOAD</button></div><button id="cClose">CLOSE</button></div>';
  const ta = $<HTMLTextAreaElement>('codeTa');
  ta.value = encodeMap(app.editor.map);
  on($('cCopy'), 'click', () => {
    ta.select();
    try { void navigator.clipboard.writeText(ta.value); } catch { /* no clipboard */ }
    $('cCopy').textContent = 'COPIED';
  });
  on($('cLoad'), 'click', () => {
    try { setEditorMap(app, decodeMap(ta.value.trim())); hideOverlay(); say(app, 'Map loaded', 1.2); }
    catch { $('cLoad').textContent = 'BAD CODE'; }
  });
  on($('cClose'), 'click', hideOverlay);
  ov().classList.remove('hide');
}

export function endScreen(app: App): void {
  const w = app.world;
  if (!w) return;
  const win = w.over === 'win';
  if (w.mode !== 'sand') recordGame(app.storage, w.mode, w.diff, win, w.t);
  synth.play(win ? 'victory' : 'defeat');
  let h1: string, body: string, tip: string, btns: string;
  if (w.mode === 'sand') {
    h1 = win ? '<span style="color:#3fa7ff">BLUE</span> WINS' : '<span style="color:#ff4d4d">RED</span> WINS';
    body = 'Fight lasted ' + Math.floor(w.t) + 's. Survivors: ' + count(w, 0) + ' blue, ' + count(w, 1) + ' red.';
    tip = '';
    btns = '<button class="gold" id="eReplay">REPLAY</button><button id="eEdit">EDIT ARMIES</button><button id="eMenu">MENU</button>';
  } else if (w.mode === 'conquest') {
    h1 = win ? '<span>THE REALM IS YOURS</span>' : 'THE REALM HAS FALLEN';
    const held = w.regions.filter((r) => r.owner === 0).length;
    body = (win ? 'Won on day ' : 'Lost on day ') + w.day + ', holding ' + held + ' of ' + w.regions.length + ' regions.';
    tip = win ? 'Tip: try a harder rival or a different race.' : 'Tip: claim fewer regions and garrison them. Net income tells you when to stop.';
    btns = '<button class="gold" id="eAgain">NEW WORLD</button><button id="eMenu">MENU</button>';
    app.storage.remove('conquest-save');
  } else {
    h1 = win ? '<span>VICTORY</span>' : 'DEFEAT';
    body = (w.mode === 'dom' ? 'Final control ' + Math.floor(w.score[0]) + ':' + Math.floor(w.score[1]) + '. ' : '') + (win ? 'Won in ' + Math.floor(w.t) + 's on ' + w.map.name + '.' : 'Lost at ' + Math.floor(w.t) + 's on ' + w.map.name + '.');
    body += ' You played ' + RACES[w.slots[0].race].name + ' against ' + w.slots.filter((_, i) => i > 0 && !allied(w, 0, i)).map((s) => RACES[s.race].name).join(', ') + '.';
    if (w.mode === 'multi') {
      let r = 0;
      for (let i = 1; i < w.nP; i++) if (w.slots[i].alive && !allied(w, 0, i)) r++;
      body += win ? ' Every rival eliminated.' : ' ' + r + ' rival' + (r === 1 ? '' : 's') + ' still stood.';
    }
    tip = win ? 'Tip: bump the difficulty, or add rivals in Multi War.' : 'Tip: walls buy time, mines buy armies, a worker keeps the fort standing. Mortars crack walls from outside tower range.';
    btns = '<button class="gold" id="eAgain">PLAY AGAIN</button><button id="eMenu">MENU</button>';
  }
  ov().innerHTML = '<div><h1>' + h1 + '</h1><p>' + body + '</p><p>' + tip + '</p>' + btns + '</div>';
  const a = document.getElementById('eAgain'), e = document.getElementById('eEdit'), r = document.getElementById('eReplay');
  if (a) on(a, 'click', () => { if (w.mode === 'conquest') showConquest(app); else startGame(app, w.mode, w.slots.map((s) => s.ally), w.slots.map((s) => s.race)); });
  if (e) on(e, 'click', () => toEdit(app));
  if (r) on(r, 'click', () => startBattle(app));
  on($('eMenu'), 'click', () => showMenu(app));
  ov().classList.remove('hide');
}
