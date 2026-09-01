// Territory list, event queue, and the diplomacy panel. All plain DOM, all tapping through to the map.

import { TEAM, TNAME } from '../data/teams.ts';
import { centerOn } from '../render/camera.ts';
import { TIERS, settlementsIn } from '../sim/conquest.ts';
import type { GameEvent, Region } from '../sim/types.ts';
import { issueAction, say, type App } from './app.ts';
import { $, on, show } from './dom.ts';

/** How wrong a region is, for sorting. Bigger means it needs attention sooner. */
function trouble(app: App, r: Region): number {
  const w = app.world!;
  let t = 0;
  if (!r.connected) t += 100;
  if (r.contested) t += 80;
  t += r.unrest;
  if (r.need > r.garrison) t += 30 + (r.need - r.garrison) / 2;
  const mine = settlementsIn(w, r.id).some((b) => b.team === 0);
  if (!mine) t -= 5;
  return t;
}

function regionCard(app: App, r: Region): string {
  const w = app.world!;
  const s = settlementsIn(w, r.id).find((b) => b.team === 0);
  const tier = s ? (s.buildT > 0 ? s.tier + ' (building)' : s.tier) : 'no settlement';
  const flags: string[] = [];
  if (!r.connected) flags.push('<b class="bad">CUT OFF</b>');
  if (r.contested) flags.push('<b class="bad">CONTESTED</b>');
  if (r.need > r.garrison) flags.push('<b class="warn">garrison ' + Math.round(r.garrison) + '/' + Math.round(r.need) + '</b>');
  else if (r.need) flags.push('garrison ' + Math.round(r.garrison) + '/' + Math.round(r.need));
  if (w.rules.unrest) flags.push((r.unrest >= 50 ? '<b class="warn">' : '') + 'unrest ' + Math.round(r.unrest) + (r.unrest >= 50 ? '</b>' : ''));
  const inc = s && s.buildT <= 0 && r.connected ? TIERS[s.tier].income : 0;
  return '<button class="card" data-r="' + r.id + '"><span class="name">' + r.name + '</span><span class="tier">' + tier + (inc ? ' · +' + inc.toFixed(0) + '/s' : '') + (r.mat ? ' · mat ' + r.mat.toFixed(1) + '/s' : '') + '</span><span class="flags">' + flags.join(' · ') + '</span></button>';
}

const STATE_LABEL: Record<string, string> = { growing: 'GROWING', stable: 'STABLE', attacked: 'UNDER ATTACK', recovering: 'RECOVERING' };

/** One town: name, tier, people, income, state. Tap to go there. */
function townCard(app: App, b: import('../sim/types.ts').Settlement): string {
  const w = app.world!;
  const r = w.regions[b.region];
  const c = b.civ, cap = w.capitals[0] === b.region;
  const st = b.buildT > 0 ? 'growing into a ' + b.tier : (STATE_LABEL[c.state] ?? c.state).toLowerCase();
  const cls = c.state === 'attacked' ? 'bad' : c.state === 'recovering' ? 'warn' : '';
  return '<button class="card town" data-town="' + b.id + '"><span class="name">' + (r?.name ?? 'Home') + (cap ? ' <b class="cap">CAPITAL</b>' : '') + '</span>'
    + '<span class="tier">' + b.tier + ' · ' + c.residents + '/' + c.housing + ' people · +' + c.income.toFixed(1) + '/s</span>'
    + '<span class="flags' + (cls ? ' ' + cls : '') + '">' + st + '</span></button>';
}

function eventLine(app: App, e: GameEvent): string {
  const w = app.world!;
  const age = Math.max(0, Math.round((w.tick - e.tick) / 60));
  return '<button class="ev ev-' + e.kind + '" data-ex="' + e.x + '" data-ey="' + e.y + '">' + e.text + '<span>' + (age < 60 ? age + 's ago' : Math.round(age / 60) + 'm ago') + '</span></button>';
}

function diplomacy(app: App): string {
  const w = app.world!;
  if (!w.rules.diplomacy) return '';
  const rows: string[] = [];
  for (let i = 1; i < w.nP; i++) {
    const s = w.slots[i];
    if (s.neutral || !s.alive) continue;
    const truce = w.slots[0].truce[i];
    const peace = truce && w.t - w.slots[0].truceT[i] > 300;
    const att = s.attitude[0];
    const mood = att > 30 ? 'friendly' : att > -30 ? 'wary' : 'hostile';
    rows.push('<div class="dip"><span style="color:' + TEAM[i] + '">' + TNAME[i] + '</span> <span>' + (peace ? 'peace' : truce ? 'truce' : 'war') + ' · ' + mood + '</span>'
      + '<button data-truce="' + i + '" data-on="' + (truce ? 0 : 1) + '" class="mini">' + (truce ? 'BREAK' : 'OFFER TRUCE') + '</button></div>');
  }
  return rows.length ? '<h3>RIVALS</h3>' + rows.join('') : '';
}

let lastKey = '';

/** Rebuild the panel when its content changes. Cheap enough to call every frame. */
export function renderTerritory(app: App): void {
  const el = $('terr');
  const w = app.world;
  if (!w || w.mode !== 'conquest' || !app.terrOpen) { if (lastKey) { el.innerHTML = ''; lastKey = ''; } return; }
  const held = w.regions.filter((r) => r.owner === 0).sort((a, b) => trouble(app, b) - trouble(app, a));
  const towns = w.slots[0].settlements.filter((b) => b.hp > 0 && b.tier !== 'outpost').sort((a, b) => (b.civ.state === 'attacked' ? 1 : 0) - (a.civ.state === 'attacked' ? 1 : 0) || (w.capitals[0] === b.region ? 1 : 0) - (w.capitals[0] === a.region ? 1 : 0));
  const key = held.map((r) => r.id + ':' + Math.round(r.unrest) + ':' + Math.round(r.garrison) + '/' + Math.round(r.need) + (r.connected ? '' : '!') + (r.contested ? '?' : '')).join('|') + '#' + towns.map((b) => b.id + b.tier + b.civ.residents + b.civ.state + b.civ.income.toFixed(1)).join('|') + '#' + w.events.length + '#' + w.slots.map((s) => s.truce.join('')).join(',') + '#' + Math.floor(w.t / 10);
  if (key === lastKey) return;
  lastKey = key;
  const events = w.events.slice(-8).reverse();
  el.innerHTML = '<div class="thead">KINGDOM <button id="tClose" class="mini">CLOSE</button></div>'
    + (towns.length ? '<h3>TOWNS</h3>' + towns.map((b) => townCard(app, b)).join('') : '')
    + '<h3>LAND</h3>'
    + (held.length ? held.map((r) => regionCard(app, r)).join('') : '<p>You hold nothing. Settle a region.</p>')
    + (events.length ? '<h3>EVENTS</h3>' + events.map((e) => eventLine(app, e)).join('') : '')
    + diplomacy(app);
  on($('tClose'), 'click', () => { app.terrOpen = false; app.ui.updateUI(); });
  for (const b of el.querySelectorAll<HTMLButtonElement>('button.card[data-r]')) on(b, 'click', () => { const r = w.regions[+b.dataset.r!]; centerOn(app.cam, r.cx, r.cy); if (app.layout === 'mobile') { app.terrOpen = false; app.ui.updateUI(); } });
  for (const b of el.querySelectorAll<HTMLButtonElement>('button.card[data-town]')) on(b, 'click', () => { const t = w.slots[0].settlements.find((x) => x.id === +b.dataset.town!); if (!t) return; centerOn(app.cam, t.x, t.y); app.selection.clear(); app.town = t.id; if (app.layout === 'mobile') app.terrOpen = false; app.ui.updateUI(); });
  for (const b of el.querySelectorAll<HTMLButtonElement>('button.ev')) on(b, 'click', () => { centerOn(app.cam, +b.dataset.ex!, +b.dataset.ey!); if (app.layout === 'mobile') { app.terrOpen = false; app.ui.updateUI(); } });
  for (const b of el.querySelectorAll<HTMLButtonElement>('button[data-truce]')) on(b, 'click', () => { issueAction(app, { type: 'truce', payload: { slot: +b.dataset.truce!, offer: b.dataset.on === '1' } }); lastKey = ''; });
}

/** Auto-pause on new events. On by default, and the phone cannot turn it off. */
export function watchEvents(app: App): void {
  const w = app.world;
  if (!w || w.mode !== 'conquest') return;
  if (w.pending && !app.paused && app.running) { app.paused = true; app.ui.updateUI(); }
  const n = w.events.length, last = w.events[n - 1];
  if (n > app.seenEvents && last && (app.settings.autoPause || app.layout === 'mobile') && app.running && !app.paused && w.tick - last.tick < 30) {
    const kinds: GameEvent['kind'][] = ['attack', 'unrest', 'built', 'broke', 'war', 'revolt'];
    if (kinds.includes(last.kind)) { app.paused = true; say(app, last.text + '. Paused.', 3); app.ui.updateUI(); }
  }
  app.seenEvents = n;
}

export function updateTerritoryVisibility(app: App): void {
  show($('terr'), !!app.world && app.world.mode === 'conquest' && app.terrOpen);
}
