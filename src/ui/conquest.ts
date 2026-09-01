// Realm UI glue: save slots, starting, continuing, autosave.

import { deserialize, restore, serialize, snapshot } from '../sim/world.ts';
import { newGame } from '../sim/game.ts';
import { TYPES } from '../data/units.ts';
import type { RaceKey } from '../data/races.ts';
import type { WorldSize } from '../data/realm.ts';
import { getJSON, setJSON } from '../platform/storage.ts';
import { hideOverlay, loadMap, randomRace, type App } from './app.ts';

export const SLOTS = [1, 2, 3];
const key = (n: number): string => 'realm-' + n;
const metaKey = (n: number): string => 'realm-meta-' + n;

/** What a slot card shows. Real-world time is UI metadata only. */
export interface SlotMeta {
  race: RaceKey;
  seed: number;
  cols: number;
  day: number;
  towns: number;
  regions: number;
  people: number;
  army: number;
  rivals: number;
  wars: number;
  feats: number;
  cheats: boolean;
  savedAt: number;
}

function adoptOldSave(app: App): void {
  const old = app.storage.get('conquest-save');
  if (!old) return;
  const free = SLOTS.find((n) => !app.storage.get(key(n))) ?? 1;
  app.storage.set(key(free), old);
  app.storage.remove('conquest-save');
}

export function slotMeta(app: App, n: number): SlotMeta | null {
  adoptOldSave(app);
  if (!app.storage.get(key(n))) return null;
  return getJSON<SlotMeta | null>(app.storage, metaKey(n), null) ?? { race: 'kingdom', seed: 0, cols: 0, day: 0, towns: 0, regions: 0, people: 0, army: 0, rivals: 0, wars: 0, feats: 0, cheats: false, savedAt: 0 };
}

export function hasSave(app: App): boolean {
  return SLOTS.some((n) => slotMeta(app, n) != null);
}

/** The slot saved most recently, for CONTINUE REALM. */
export function latestSlot(app: App): number {
  let best = -1, at = -1;
  for (const n of SLOTS) { const m = slotMeta(app, n); if (m && m.savedAt > at) { at = m.savedAt; best = n; } }
  return best;
}

export function saveRealm(app: App): boolean {
  const w = app.world;
  if (!w || w.mode !== 'conquest' || w.over) return false;
  const n = app.slot;
  app.storage.set(key(n), serialize(snapshot(w)));
  const s = w.slots[0];
  let wars = 0;
  for (let i = 1; i < w.nP; i++) if (!w.slots[i].neutral && w.slots[i].alive && !s.truce[i]) wars++;
  const meta: SlotMeta = {
    race: s.race, seed: w.seed, cols: w.map.cols, day: w.day,
    towns: s.settlements.filter((b) => b.hp > 0 && b.tier !== 'outpost').length,
    regions: w.regions.filter((r) => r.owner === 0).length,
    people: w.units.filter((u) => u.team === 0 && u.hp > 0 && TYPES[u.type].role === 'civ').length,
    army: w.units.filter((u) => u.team === 0 && u.hp > 0 && TYPES[u.type].role !== 'civ').length,
    rivals: w.slots.filter((x, i) => i > 0 && !x.neutral && x.alive).length,
    wars, feats: w.feats.length, cheats: w.cheats.on, savedAt: Date.now(),
  };
  setJSON(app.storage, metaKey(n), meta);
  app.lastSave = performance.now();
  return true;
}

export function clearSlot(app: App, n: number): void {
  app.storage.remove(key(n));
  app.storage.remove(metaKey(n));
}

function enter(app: App): void {
  app.setup = null;
  app.editor = null;
  app.running = true;
  app.paused = false;
  app.speed = 1;
  app.selection.clear();
  app.groups.clear();
  app.ctl = 0;
  app.tool = 'cmd';
  app.tab = 'units';
  app.stance = 'none';
  app.town = -1;
  app.drag = null;
  app.overlay = true;
  app.terrOpen = false;
  app.seenEvents = app.world!.events.length;
  loadMap(app, app.world!.map);
  hideOverlay();
  app.ui.updateUI();
  app.lastSave = performance.now();
}

export function startRealm(app: App, slot: number, size: WorldSize = app.size): void {
  const rivals = app.rivals;
  const races = [app.race, ...Array.from({ length: rivals }, () => app.foeRace ?? randomRace())];
  const seed = app.seed ?? ((Math.random() * 2 ** 31) | 0);
  app.slot = slot;
  app.world = newGame({} as never, 'conquest', { seed, diff: app.diff, races, rivals, size, instant: app.settings.instant, cheats: { ...app.settings.cheats } });
  enter(app);
  saveRealm(app);
}

export function continueRealm(app: App, slot = latestSlot(app)): boolean {
  const text = slot > 0 ? app.storage.get(key(slot)) : null;
  if (!text) return false;
  try { app.world = restore(deserialize(text)); } catch { return false; }
  app.slot = slot;
  enter(app);
  return true;
}

/** Autosave every two minutes of play, and whenever the page goes to the background. */
export function autosaveTick(app: App): void {
  if (!app.world || app.world.mode !== 'conquest' || !app.running) return;
  if (performance.now() - app.lastSave > 120000) saveRealm(app);
}

export function wireAutosave(app: App): void {
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveRealm(app); });
  window.addEventListener('pagehide', () => saveRealm(app));
}

// Older names.
export const saveConquest = saveRealm;
export const continueConquest = continueRealm;
