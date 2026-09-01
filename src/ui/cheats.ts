// The CHEATS panel: toggles, one-shot buttons, and tap-target tools. Everything goes through commands.

import { roster, TYPES, type Role, type UnitKey } from '../data/units.ts';
import type { Action, Cheats } from '../sim/types.ts';
import { ctlRace, issueAction, say, type App } from './app.ts';
import { $, on, show } from './dom.ts';
import { applyCheats } from './menus/settings.ts';

export const CHEAT_TOGGLES: [Exclude<keyof Cheats, 'on'>, string][] = [
  ['gold', 'GOLD'], ['resources', 'MATERIALS'], ['noPop', 'NO POP CAP'], ['instant', 'INSTANT UNITS'], ['build', 'INSTANT BUILDS'],
  ['powers', 'NO COOLDOWNS'], ['god', 'GOD MODE'], ['oneHit', 'ONE HIT'], ['superUnits', 'SUPER UNITS'], ['fastEcon', 'FAST ECONOMY'],
  ['growth', 'INSTANT GROWTH'], ['allAges', 'ALL AGES'], ['freeBuild', 'FREE BUILD'], ['freeUnits', 'FREE UNITS'], ['territory', 'ANYWHERE'], ['reveal', 'REVEAL MAP'],
];

export interface CheatTool {
  op: 'destroy' | 'spawn' | 'army' | 'bandits' | 'settle' | 'clearNear';
  unit?: UnitKey;
  n?: number;
  team?: number;
  kind?: 'small' | 'large' | 'siege' | 'elite';
  /** Preview radius. */
  r?: number;
}

const ROLES: [Role, string][] = [['line', 'INFANTRY'], ['ranged', 'RANGED'], ['fast', 'FAST'], ['siege', 'SIEGE'], ['heavy', 'HEAVY'], ['support', 'SUPPORT'], ['special', 'SPECIAL'], ['scout', 'SCOUT']];

let ui = { unit: 'inf' as UnitKey, n: 5, team: 0, kind: 'small' as CheatTool['kind'] };
let lastKey = '';

function enemyTeam(app: App): number {
  const w = app.world!;
  for (let i = 1; i < w.nP; i++) if (!w.slots[i].neutral && w.slots[i].alive) return i;
  return w.neutral >= 0 ? w.neutral : 1;
}

function arm(app: App, t: CheatTool, hint: string): void {
  app.cheatTool = t;
  app.tool = 'cheat';
  app.cheatsOpen = false;
  app.ui.updateUI();
  say(app, hint, 2.5);
}

const cheat = (app: App, payload: Extract<Action, { type: 'cheat' }>['payload']): void => { issueAction(app, { type: 'cheat', payload }); };

export function renderCheats(app: App): void {
  const el = $('cheats');
  const w = app.world;
  if (!w || !app.running || !app.cheatsOpen || !app.settings.cheats.on) { if (lastKey) { el.innerHTML = ''; lastKey = ''; } return; }
  const race = ctlRace(app);
  const key = CHEAT_TOGGLES.map(([k]) => (w.cheats[k] ? 1 : 0)).join('') + '|' + ui.unit + ui.n + ui.team + ui.kind + '|' + w.mode + '|' + app.town;
  if (key === lastKey) return;
  lastKey = key;
  const chip = (k: Exclude<keyof Cheats, 'on'>, label: string): string => '<button class="chip' + (w.cheats[k] ? ' on' : '') + '" data-tog="' + k + '">' + label + '</button>';
  const btn = (id: string, label: string, cls = ''): string => '<button class="mini ' + cls + '" data-do="' + id + '">' + label + '</button>';
  const realm = w.mode === 'conquest';
  const units = roster(race).filter((k) => !TYPES[k].repair && TYPES[k].role !== 'civ');
  const byRole = ROLES.map(([r, label]) => ({ label, list: units.filter((k) => TYPES[k].role === r) })).filter((g) => g.list.length);
  el.innerHTML = '<div class="thead">CHEATS <button id="chClose" class="mini">CLOSE</button></div>'
    + '<div class="chips">' + CHEAT_TOGGLES.map(([k, l]) => chip(k, l)).join('') + '</div>'
    + '<h3>TREASURY</h3><div class="row wrap">' + btn('g100', '+100') + btn('g1k', '+1,000') + btn('g10k', '+10,000') + (realm ? btn('m500', '+500 MAT') : '') + btn('research', 'MAX RESEARCH') + '</div>'
    + '<h3>ARMY</h3><div class="row wrap">' + btn('heal', 'HEAL ALL') + btn('revive', 'REVIVE ARMY') + btn('finish', 'FINISH BUILDS') + btn('queues', 'FINISH QUEUES') + btn('clearNear', 'CLEAR NEARBY') + btn('clearAll', 'CLEAR ALL ENEMIES', 'danger') + btn('destroy', 'DESTROY TARGET', 'danger') + '</div>'
    + '<h3>SPAWN</h3><div class="row wrap"><select id="chUnit">' + byRole.map((g) => '<optgroup label="' + g.label + '">' + g.list.map((k) => '<option value="' + k + '"' + (k === ui.unit ? ' selected' : '') + '>' + TYPES[k].name + ' ' + TYPES[k].cost + '</option>').join('') + '</optgroup>').join('') + '</select></div>'
    + '<div class="row wrap">' + [1, 5, 10, 25].map((n) => '<button class="chip' + (ui.n === n ? ' on' : '') + '" data-n="' + n + '">x' + n + '</button>').join('') + '<button class="chip' + (ui.team === 0 ? ' on' : '') + '" data-team="0">YOURS</button><button class="chip' + (ui.team === 1 ? ' on' : '') + '" data-team="1">ENEMY</button>' + btn('spawn', 'SPAWN: TAP MAP', 'gold') + '</div>'
    + '<div class="row wrap">' + (['small', 'large', 'siege', 'elite'] as const).map((k) => '<button class="chip' + (ui.kind === k ? ' on' : '') + '" data-kind="' + k + '">' + k.toUpperCase() + '</button>').join('') + btn('army', 'ARMY: TAP MAP', 'gold') + btn('enemyArmy', 'ENEMY ARMY: TAP MAP') + '</div>'
    + (realm ? '<h3>REALM</h3><div class="row wrap">' + btn('raidS', 'RAID S') + btn('raidM', 'RAID M') + btn('raidL', 'RAID L') + btn('bandits', 'BANDITS: TAP') + btn('settle', 'FOUND: TAP') + btn('rebuild', 'REBUILD CITY') + btn('maxCity', 'MAX CITY') + btn('peace', 'PEACE') + btn('totalWar', 'TOTAL WAR', 'danger') + '</div><p class="blurb">Raids, rebuild, and max city use the selected town, else the capital.</p>' : '');
  on($('chClose'), 'click', () => { app.cheatsOpen = false; app.ui.updateUI(); });
  for (const b of el.querySelectorAll<HTMLButtonElement>('button[data-tog]')) on(b, 'click', () => { const k = b.dataset.tog as Exclude<keyof Cheats, 'on'>; app.settings.cheats[k] = !app.settings.cheats[k]; applyCheats(app); lastKey = ''; });
  for (const b of el.querySelectorAll<HTMLButtonElement>('button[data-n]')) on(b, 'click', () => { ui.n = +b.dataset.n!; lastKey = ''; });
  for (const b of el.querySelectorAll<HTMLButtonElement>('button[data-team]')) on(b, 'click', () => { ui.team = +b.dataset.team!; lastKey = ''; });
  for (const b of el.querySelectorAll<HTMLButtonElement>('button[data-kind]')) on(b, 'click', () => { ui.kind = b.dataset.kind as CheatTool['kind']; lastKey = ''; });
  on($('chUnit'), 'change', () => { ui.unit = ($('chUnit') as HTMLSelectElement).value as UnitKey; });
  const town = app.town >= 0 ? app.town : undefined;
  for (const b of el.querySelectorAll<HTMLButtonElement>('button[data-do]')) on(b, 'click', () => {
    const id = b.dataset.do!;
    switch (id) {
      case 'g100': cheat(app, { op: 'gold', n: 100 }); break;
      case 'g1k': cheat(app, { op: 'gold', n: 1000 }); break;
      case 'g10k': cheat(app, { op: 'gold', n: 10000 }); break;
      case 'm500': cheat(app, { op: 'mat', n: 500 }); break;
      case 'research': cheat(app, { op: 'research' }); break;
      case 'heal': cheat(app, { op: 'heal' }); break;
      case 'revive': cheat(app, { op: 'revive' }); break;
      case 'finish': cheat(app, { op: 'finish' }); break;
      case 'queues': cheat(app, { op: 'queues' }); break;
      case 'clearNear': arm(app, { op: 'clearNear', r: 120 }, 'CLEAR NEARBY: tap the map. Enemies within the circle are gone.'); break;
      case 'clearAll': if (confirm('Remove every enemy soldier in the world? Their kingdoms stay.')) cheat(app, { op: 'clearAll' }); break;
      case 'destroy': arm(app, { op: 'destroy' }, 'DESTROY: tap a unit, building, or settlement.'); break;
      case 'spawn': arm(app, { op: 'spawn', unit: ui.unit, n: ui.n, team: ui.team === 0 ? 0 : enemyTeam(app) }, 'SPAWN: tap where ' + ui.n + ' should appear.'); break;
      case 'army': arm(app, { op: 'army', kind: ui.kind, team: 0, r: 30 }, 'ARMY: tap where it should muster.'); break;
      case 'enemyArmy': arm(app, { op: 'army', kind: ui.kind, team: enemyTeam(app), r: 30 }, 'ENEMY ARMY: tap where it should appear. It attacks at once.'); break;
      case 'raidS': cheat(app, { op: 'raid', size: 'small', id: town }); app.cheatsOpen = false; app.ui.updateUI(); break;
      case 'raidM': cheat(app, { op: 'raid', size: 'medium', id: town }); app.cheatsOpen = false; app.ui.updateUI(); break;
      case 'raidL': cheat(app, { op: 'raid', size: 'large', id: town }); app.cheatsOpen = false; app.ui.updateUI(); break;
      case 'bandits': arm(app, { op: 'bandits', n: ui.n, r: 20 }, 'BANDITS: tap where they should appear.'); break;
      case 'settle': arm(app, { op: 'settle' }, 'FOUND: tap open ground for a new village.'); break;
      case 'rebuild': cheat(app, { op: 'rebuild', id: town }); break;
      case 'maxCity': cheat(app, { op: 'maxCity', id: town }); break;
      case 'peace': cheat(app, { op: 'peace' }); break;
      case 'totalWar': if (confirm('Set every kingdom at war with every other?')) cheat(app, { op: 'totalWar' }); break;
    }
  });
}

export function updateCheatsVisibility(app: App): void {
  show($('cheats'), !!app.world && app.running && app.cheatsOpen && app.settings.cheats.on);
}

/** A tap on the map while a cheat tool is armed. Returns true when the tool consumed it. */
export function cheatTap(app: App, x: number, y: number): boolean {
  const t = app.cheatTool, w = app.world;
  if (!t || !w) return false;
  if (t.op === 'destroy') {
    let id = -1;
    for (const u of w.units) if (u.hp > 0 && Math.abs(u.x - x) < 6 && Math.abs(u.y - y) < 6) { id = u.id; break; }
    if (id < 0) for (const b of w.blds) if (b.tiles.some((q) => Math.abs(q[0] * 8 + 4 - x) <= 4 && Math.abs(q[1] * 8 + 4 - y) <= 4)) { id = b.id; break; }
    if (id < 0) for (const s of w.slots) for (const b of s.settlements) if (b.hp > 0 && Math.abs(b.x - x) < 14 && Math.abs(b.y - y) < 12) { id = b.id; break; }
    if (id < 0) { say(app, 'Nothing there', 1); return true; }
    cheat(app, { op: 'destroy', id });
  } else if (t.op === 'spawn') cheat(app, { op: 'spawn', unit: t.unit, n: t.n, team: t.team, x, y });
  else if (t.op === 'army') cheat(app, { op: 'army', kind: t.kind, team: t.team, x, y });
  else if (t.op === 'bandits') cheat(app, { op: 'bandits', n: t.n, x, y });
  else if (t.op === 'settle') cheat(app, { op: 'settle', x, y });
  else if (t.op === 'clearNear') cheat(app, { op: 'clearNear', n: t.r, x, y });
  // Spawn tools stay armed for repeat taps; the rest drop.
  if (t.op !== 'spawn' && t.op !== 'army' && t.op !== 'bandits') { app.cheatTool = null; app.tool = 'cmd'; }
  app.ui.updateUI();
  return true;
}
