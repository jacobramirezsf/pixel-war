// Main menu, Multi War setup, map list, map code, and end screen. Plain DOM from template strings.

import { BUILTIN } from '../../data/maps.ts';
import { DIFF, DIFF_KEYS, type DiffKey } from '../../data/difficulty.ts';
import { TEAM } from '../../data/teams.ts';
import { RACE_KEYS, RACES, type RaceKey } from '../../data/races.ts';
import { decodeMap, encodeMap } from '../../sim/map.ts';
import type { Mode } from '../../sim/types.ts';
import { allied, count } from '../../sim/world.ts';
import { hideOverlay, openEditor, say, setEditorMap, startGame, type App } from '../app.ts';
import { continueConquest, hasSave, saveConquest, startConquest } from '../conquest.ts';
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
  if (app.world?.mode === 'conquest' && app.running) saveConquest(app);
  app.running = false;
  const m = app.curMap;
  ov().innerHTML = `<div>
    <h1>PIXEL <span>WAR</span></h1>
    <p class="ver">v3</p>
    <button class="pick cur" id="mMap">MAP: ${m.name.toUpperCase()}<span>${m.cols}×${m.rows} · change</span></button>
    <div class="row"><button class="pick" id="mRace">YOU: ${RACES[app.race].name}<span>change</span></button><button class="pick" id="mFoe">FOE: ${raceName(app.foeRace)}<span>change</span></button></div>
    <p class="blurb">${RACES[app.race].blurb}</p>
    ${diffRowHtml(app)}
    <button class="gold" data-mode="conquest">REALM<small>Your own corner of a living world. Build, hold, grow, come back. ${hasSave(app) ? 'A realm is waiting.' : ''}</small></button>
    <button data-mode="skirmish">SKIRMISH<small>1v1. Destroy the enemy base. It sits behind a fort, so bring siege.</small></button>
    <button data-mode="multi">MULTI WAR<small>Up to 5 armies. Teams or free for all. Last alliance standing.</small></button>
    <button data-mode="dom">DOMINATION<small>Hold the mines to fill your meter. First to 150 points wins.</small></button>
    <button data-mode="rich">UNLIMITED GOLD<small>Bottomless treasury. Enemy income doubled, army cap 60.</small></button>
    <button data-mode="sand">SANDBOX<small>Place armies AND fortifications for both sides, then hit PLAY.</small></button>
    <div class="row"><button class="sm" id="mHelp">HOW TO PLAY</button><button class="sm" id="mSettings">SETTINGS</button><button class="sm" id="mStats">STATS</button></div>
    <p class="blurb">Walls block both sides, so leave yourself a gate. Mines add 1.5 gold/s. Mortars outrange towers, drones fly over everything.</p>
  </div>`;
  for (const b of ov().querySelectorAll<HTMLButtonElement>('button[data-mode]'))
    on(b, 'click', () => {
      const mode = b.dataset.mode as Mode;
      if (mode === 'dom' && !app.curMap.mines.length) { b.textContent = 'THIS MAP HAS NO MINES'; return; }
      if (mode === 'multi') { showSetup(app); return; }
      if (mode === 'conquest') { showConquest(app); return; }
      startGame(app, mode);
    });
  on($('mMap'), 'click', () => showMaps(app));
  on($('mSettings'), 'click', () => showSettings(app, () => showMenu(app)));
  on($('mHelp'), 'click', () => showHelp(() => showMenu(app)));
  on($('mStats'), 'click', () => showStats(app, () => showMenu(app)));
  on($('mRace'), 'click', () => { app.race = nextRace(app.race, false)!; showMenu(app); });
  on($('mFoe'), 'click', () => { app.foeRace = nextRace(app.foeRace, true); showMenu(app); });
  wireDiff(app, () => showMenu(app));
  ov().classList.remove('hide');
}

export function showConquest(app: App): void {
  const saved = hasSave(app);
  const goals: [import('../../sim/types.ts').Goal, string][] = [['none', 'NO END'], ['capitals', 'CAPITALS'], ['land', 'LAND']];
  ov().innerHTML = '<div><h2>REALM</h2>'
    + '<p>Your own corner of a living world. Found villages next to your land and hold them. Build houses, farms, a barracks, walls. Bandits raid, envoys come, rivals grow beside you. Nothing ends unless you set a goal.</p>'
    + (saved ? '<button class="gold" id="cqCont">CONTINUE<small>Pick up the saved game.</small></button>' : '')
    + '<div class="row">' + [1, 2, 3, 4].map((n) => '<button class="sm' + (app.rivals === n ? ' on' : '') + '" data-rivals="' + n + '">' + n + ' RIVAL' + (n > 1 ? 'S' : '') + '</button>').join('') + '</div>'
    + '<div class="row">' + goals.map(([g, label]) => '<button class="sm' + (app.goal === g ? ' on' : '') + '" data-goal="' + g + '">' + label + '</button>').join('') + '</div>'
    + diffRowHtml(app)
    + '<button ' + (saved ? '' : 'class="gold"') + ' id="cqNew">NEW WORLD<small>' + (saved ? 'Replaces the saved game.' : 'A fresh world.') + ' ' + (app.rivals === 1 ? '48x48, nine regions.' : app.rivals === 2 ? '64x64, sixteen regions.' : '80x80, twenty-five regions.') + '</small></button>'
    + '<button id="cqBack">BACK</button></div>';
  const c = document.getElementById('cqCont');
  if (c) on(c, 'click', () => { if (!continueConquest(app)) { say(app, 'Save could not be read', 2); showMenu(app); } });
  on($('cqNew'), 'click', () => startConquest(app));
  on($('cqBack'), 'click', () => showMenu(app));
  for (const b of ov().querySelectorAll<HTMLButtonElement>('button[data-rivals]')) on(b, 'click', () => { app.rivals = +b.dataset.rivals!; showConquest(app); });
  for (const b of ov().querySelectorAll<HTMLButtonElement>('button[data-goal]')) on(b, 'click', () => { app.goal = b.dataset.goal as import('../../sim/types.ts').Goal; showConquest(app); });
  wireDiff(app, () => showConquest(app));
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
  if (a) on(a, 'click', () => { if (w.mode === 'conquest') startConquest(app); else startGame(app, w.mode, w.slots.map((s) => s.ally), w.slots.map((s) => s.race)); });
  if (e) on(e, 'click', () => toEdit(app));
  if (r) on(r, 'click', () => startBattle(app));
  on($('eMenu'), 'click', () => showMenu(app));
  ov().classList.remove('hide');
}
