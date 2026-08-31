// UI state and the handful of transitions that every part of the UI needs.
// Sim state lives in app.world. Editor state lives in app.editor. Never both.

import type { BldKey } from '../data/buildings.ts';
import type { DiffKey } from '../data/difficulty.ts';
import { RACE_KEYS, type RaceKey } from '../data/races.ts';
import { BUILTIN, type EditorTool } from '../data/maps.ts';
import { roster, type UnitKey } from '../data/units.ts';
import type { PowerKey } from '../data/powers.ts';
import type { Storage } from '../platform/storage.ts';
import { fitZoom, makeCamera, setMap, setViewport, type Camera } from '../render/camera.ts';
import { makeMinimapCache, type MinimapCache } from '../render/minimap.ts';
import { buildBg } from '../render/terrain.ts';
import type { DragRect } from '../render/scene.ts';
import { cmd, issue } from '../sim/commands.ts';
import { cloneMap, TILE, type MapDef } from '../sim/map.ts';
import { setupWorld, type GameSetup } from '../sim/replay.ts';
import type { Action, Mode, World } from '../sim/types.ts';
import { say as simSay } from '../sim/world.ts';
import { $ } from './dom.ts';
import { detectLayout, type LayoutMode } from './layout.ts';
import { loadSettings, saveSettings as persistSettings, type Settings } from './settings.ts';

export type Tool = 'cmd' | 'build' | 'sell' | 'place' | 'erase' | 'rally' | 'settle' | 'outpost' | 'upgrade' | 'absorb' | 'power';
export type Tab = 'units' | 'build' | 'powers' | 'more' | 'tools' | 'edit';
export const SPEEDS = [0.25, 0.5, 1, 2, 4];

export interface EditorState {
  map: MapDef;
  ret: 'sand' | 'menu';
  tool: EditorTool;
}

export interface SlotRow {
  on: boolean;
  team: number;
  /** null means pick at random when the game starts. */
  race: RaceKey | null;
}

/** Callbacks the flow needs from modules that import this one. Assigned in main. */
export interface UiHooks {
  updateUI(): void;
  showMenu(): void;
  endScreen(): void;
}

export interface App {
  world: World | null;
  /** How the current world was started, for replays. */
  setup: GameSetup | null;
  editor: EditorState | null;
  curMap: MapDef;
  custom: MapDef | null;
  diff: DiffKey;
  /** The player's race. */
  race: RaceKey;
  /** Opponent race for 1v1 modes. null picks at random. */
  foeRace: RaceKey | null;
  mset: SlotRow[];
  ctl: number;
  brush: UnitKey;
  bbrush: BldKey;
  tool: Tool;
  tab: Tab;
  power: PowerKey | null;
  /** Touch: one-finger drag box-selects instead of panning. */
  selectMode: boolean;
  running: boolean;
  paused: boolean;
  /** Sim speed multiplier: 1, 2, or 4. */
  speed: number;
  /** Territory overlay on the map. */
  overlay: boolean;
  /** Territory list panel. */
  terrOpen: boolean;
  seenEvents: number;
  /** Conquest setup: rivals. */
  rivals: number;
  lastSave: number;
  /** Ids of the selected units. Selection is a UI matter, not a sim one. */
  selection: Set<number>;
  drag: DragRect | null;
  /** Message shown when there is no world, such as in the editor. */
  msg: string;
  msgT: number;
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  bg: HTMLCanvasElement;
  W: number;
  H: number;
  cam: Camera;
  dpr: number;
  layout: LayoutMode;
  minimap: MinimapCache;
  /** Unit id under the mouse. */
  hover: number | null;
  /** Mouse position in viewport CSS pixels, for edge pan. */
  mouse: { x: number; y: number } | null;
  /** Keys currently held. */
  keys: Set<string>;
  spaceT: number;
  spaceDragged: boolean;
  /** Control groups: number to unit ids. */
  groups: Map<number, Set<number>>;
  settings: Settings;
  storage: Storage;
  ui: UiHooks;
}

export function createApp(storage: Storage): App {
  const cv = $<HTMLCanvasElement>('c');
  const ctx = cv.getContext('2d')!;
  return {
    world: null, setup: null, editor: null, curMap: BUILTIN[0], custom: null, diff: 'std', race: 'kingdom', foeRace: null,
    mset: [{ on: true, team: 0, race: null }, { on: true, team: 1, race: null }, { on: true, team: 2, race: null }, { on: false, team: 3, race: null }, { on: false, team: 4, race: null }],
    ctl: 0, brush: 'inf', bbrush: 'stk', tool: 'cmd', tab: 'units', power: null, selectMode: false, running: false, paused: false, speed: 1, overlay: false, terrOpen: false, seenEvents: 0, rivals: 1, lastSave: 0, selection: new Set(), drag: null, msg: '', msgT: 0,
    cv, ctx, bg: document.createElement('canvas'), W: 160, H: 224,
    cam: makeCamera(), dpr: 1, layout: detectLayout(), minimap: makeMinimapCache(), hover: null, mouse: null,
    keys: new Set(), spaceT: 0, spaceDragged: false, groups: new Map(), settings: loadSettings(storage), storage,
    ui: { updateUI: () => {}, showMenu: () => {}, endScreen: () => {} },
  };
}

export function saveSettings(app: App): void {
  persistSettings(app.storage, app.settings);
}

export function say(app: App, t: string, d = 2): void {
  if (app.world) simSay(app.world, t, d);
  else { app.msg = t; app.msgT = d; }
}

/** Size the canvas to the stage at device resolution and tell the camera the viewport. */
export function fit(app: App): void {
  const r = $('stage').getBoundingClientRect();
  const vw = Math.max(1, Math.floor(r.width)), vh = Math.max(1, Math.floor(r.height));
  app.dpr = Math.max(1, Math.min(3, Math.round(window.devicePixelRatio || 1)));
  if (app.cv.width !== vw * app.dpr || app.cv.height !== vh * app.dpr) {
    app.cv.width = vw * app.dpr;
    app.cv.height = vh * app.dpr;
    app.cv.style.width = vw + 'px';
    app.cv.style.height = vh + 'px';
  }
  setViewport(app.cam, vw, vh);
}

/** Starting zoom: at least 2x so sprites read, more when the whole map still fits. */
export function homeZoom(app: App): void {
  app.cam.zoom = Math.max(2, fitZoom(app.cam, 'both'));
  app.cam.x = 0;
  app.cam.y = 0;
  setViewport(app.cam, app.cam.vw, app.cam.vh);
}

export function loadMap(app: App, map: MapDef): void {
  app.W = map.cols * TILE;
  app.H = map.rows * TILE;
  buildBg(map, app.bg);
  fit(app);
  setMap(app.cam, app.W, app.H);
  homeZoom(app);
}

export function hideOverlay(): void {
  $('ov').classList.add('hide');
}

/** Send an action for the controlled slot. Applied now, logged for replay. */
export function issueAction(app: App, a: Action): boolean {
  if (!app.world) return false;
  return issue(app.world, cmd(app.world, app.ctl, a));
}

/** Selected units that are still alive, in world order. */
export function selectedUnits(app: App): import('../sim/types.ts').Unit[] {
  const w = app.world;
  if (!w) return [];
  return w.units.filter((u) => u.team === app.ctl && u.hp > 0 && app.selection.has(u.id));
}

export function randomRace(): RaceKey {
  return RACE_KEYS[(Math.random() * RACE_KEYS.length) | 0];
}

/** Race the controlled slot plays. Sandbox lets you place either side. */
export function ctlRace(app: App): RaceKey {
  return app.world ? app.world.slots[app.ctl].race : app.race;
}

export function startGame(app: App, mode: Mode, allies?: number[], races?: (RaceKey | null)[]): void {
  const al = allies ?? [0, 1];
  const rc: RaceKey[] = al.map((_, i) => {
    const pick = races ? races[i] : i === 0 ? app.race : app.foeRace;
    return pick ?? randomRace();
  });
  const setup: GameSetup = { seed: (Math.random() * 2 ** 31) | 0, mode, map: app.curMap, allies: al, diff: app.diff, ai: al.map((_, i) => i !== 0), races: rc, instant: app.settings.instant };
  const w = setupWorld(setup);
  app.world = w;
  app.setup = setup;
  app.editor = null;
  app.running = true;
  app.paused = false;
  app.speed = 1;
  app.overlay = false;
  app.selection.clear();
  app.groups.clear();
  app.ctl = 0;
  app.brush = roster(rc[0])[1];
  app.bbrush = 'stk';
  app.tool = mode === 'sand' ? 'place' : 'cmd';
  app.tab = 'units';
  app.power = null;
  app.drag = null;
  loadMap(app, w.map);
  hideOverlay();
  app.ui.updateUI();
}

export function openEditor(app: App, ret: 'sand' | 'menu'): void {
  const m = app.custom && app.custom === app.curMap ? app.custom : cloneMap(app.curMap, 'Custom');
  app.world = null;
  app.editor = { map: m, ret, tool: 2 };
  app.running = true;
  app.tab = 'tools';
  loadMap(app, m);
  hideOverlay();
  app.ui.updateUI();
  say(app, 'Pick a tool, drag on the map. DONE saves it as Custom.', 3);
}

export function setEditorMap(app: App, m: MapDef): void {
  if (!app.editor) return;
  app.editor.map = m;
  loadMap(app, m);
}

export function leaveEditor(app: App): void {
  const ret = app.editor?.ret;
  if (ret === 'sand') startGame(app, 'sand');
  else { app.editor = null; app.ui.showMenu(); }
}
