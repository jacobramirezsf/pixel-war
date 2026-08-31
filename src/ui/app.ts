// UI state and the handful of transitions that every part of the UI needs.
// Sim state lives in app.world. Editor state lives in app.editor. Never both.

import type { BldKey } from '../data/buildings.ts';
import type { DiffKey } from '../data/difficulty.ts';
import { BUILTIN, type EditorTool } from '../data/maps.ts';
import type { UnitKey } from '../data/units.ts';
import type { Storage } from '../platform/storage.ts';
import { buildBg } from '../render/terrain.ts';
import type { DragRect } from '../render/scene.ts';
import { cmd, issue } from '../sim/commands.ts';
import { cloneMap, TILE, type MapDef } from '../sim/map.ts';
import { setupWorld, type GameSetup } from '../sim/replay.ts';
import type { Action, Mode, World } from '../sim/types.ts';
import { say as simSay } from '../sim/world.ts';
import { $ } from './dom.ts';

export type Tool = 'cmd' | 'build' | 'sell' | 'place' | 'erase';

export interface EditorState {
  map: MapDef;
  ret: 'sand' | 'menu';
  tool: EditorTool;
}

export interface SlotRow {
  on: boolean;
  team: number;
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
  mset: SlotRow[];
  ctl: number;
  brush: UnitKey;
  bbrush: BldKey;
  tool: Tool;
  bstrip: boolean;
  running: boolean;
  paused: boolean;
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
  storage: Storage;
  ui: UiHooks;
}

export function createApp(storage: Storage): App {
  const cv = $<HTMLCanvasElement>('c');
  const ctx = cv.getContext('2d')!;
  return {
    world: null, setup: null, editor: null, curMap: BUILTIN[0], custom: null, diff: 'std',
    mset: [{ on: true, team: 0 }, { on: true, team: 1 }, { on: true, team: 2 }, { on: false, team: 3 }, { on: false, team: 4 }],
    ctl: 0, brush: 'inf', bbrush: 'stk', tool: 'cmd', bstrip: false, running: false, paused: false, selection: new Set(), drag: null, msg: '', msgT: 0,
    cv, ctx, bg: document.createElement('canvas'), W: 160, H: 224, storage,
    ui: { updateUI: () => {}, showMenu: () => {}, endScreen: () => {} },
  };
}

export function say(app: App, t: string, d = 2): void {
  if (app.world) simSay(app.world, t, d);
  else { app.msg = t; app.msgT = d; }
}

/** Scale the canvas to the stage, up to 4x, keeping whole pixels crisp. */
export function fit(app: App): void {
  const r = $('stage').getBoundingClientRect();
  const s = Math.min(r.width / app.W, (r.height - 8) / app.H, 4);
  app.cv.style.width = app.W * s + 'px';
  app.cv.style.height = app.H * s + 'px';
}

export function loadMap(app: App, map: MapDef): void {
  app.W = map.cols * TILE;
  app.H = map.rows * TILE;
  app.cv.width = app.W;
  app.cv.height = app.H;
  app.ctx.imageSmoothingEnabled = false;
  app.ctx.lineWidth = 1;
  buildBg(map, app.bg);
  fit(app);
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

export function startGame(app: App, mode: Mode, allies?: number[]): void {
  const al = allies ?? [0, 1];
  const setup: GameSetup = { seed: (Math.random() * 2 ** 31) | 0, mode, map: app.curMap, allies: al, diff: app.diff, ai: al.map((_, i) => i !== 0) };
  const w = setupWorld(setup);
  app.world = w;
  app.setup = setup;
  app.editor = null;
  app.running = true;
  app.paused = false;
  app.selection.clear();
  app.ctl = 0;
  app.brush = 'inf';
  app.bbrush = 'stk';
  app.tool = mode === 'sand' ? 'place' : 'cmd';
  app.bstrip = false;
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
  app.bstrip = false;
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
