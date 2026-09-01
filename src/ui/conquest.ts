// Conquest UI glue: starting, saving, loading, the territory overlay, and speed.

import { deserialize, restore, serialize, snapshot } from '../sim/world.ts';
import { newGame } from '../sim/game.ts';
import { hideOverlay, loadMap, randomRace, type App } from './app.ts';

export const SAVE_KEY = 'conquest-save';

export function hasSave(app: App): boolean {
  return app.storage.get(SAVE_KEY) != null;
}

export function saveConquest(app: App): boolean {
  const w = app.world;
  if (!w || w.mode !== 'conquest' || w.over) return false;
  app.storage.set(SAVE_KEY, serialize(snapshot(w)));
  app.lastSave = performance.now();
  return true;
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
  app.drag = null;
  app.overlay = true;
  app.terrOpen = false;
  app.seenEvents = app.world!.events.length;
  loadMap(app, app.world!.map);
  hideOverlay();
  app.ui.updateUI();
  app.lastSave = performance.now();
}

export function startConquest(app: App): void {
  const rivals = app.rivals;
  const races = [app.race, ...Array.from({ length: rivals }, () => app.foeRace ?? randomRace())];
  app.world = newGame({} as never, 'conquest', { seed: (Math.random() * 2 ** 31) | 0, diff: app.diff, races, rivals, instant: app.settings.instant, cheats: { ...app.settings.cheats }, goal: app.goal });
  app.brush = app.world.slots[0].race === 'kingdom' ? 'inf' : app.brush;
  enter(app);
}

export function continueConquest(app: App): boolean {
  const text = app.storage.get(SAVE_KEY);
  if (!text) return false;
  try { app.world = restore(deserialize(text)); } catch { return false; }
  enter(app);
  return true;
}

/** Autosave every two minutes of play, and whenever the page goes to the background. */
export function autosaveTick(app: App): void {
  if (!app.world || app.world.mode !== 'conquest' || !app.running) return;
  if (performance.now() - app.lastSave > 120000) saveConquest(app);
}

export function wireAutosave(app: App): void {
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveConquest(app); });
  window.addEventListener('pagehide', () => saveConquest(app));
}
