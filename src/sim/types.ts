// Simulation state types. Everything here is plain data plus object references
// between live entities. Snapshots convert those references to ids.

import type { UnitKey } from '../data/units.ts';
import type { BldKey, BldKind } from '../data/buildings.ts';
import type { DiffKey } from '../data/difficulty.ts';
import type { PowerKey } from '../data/powers.ts';
import type { RaceKey } from '../data/races.ts';
import type { MapDef } from './map.ts';
import type { Rng } from './rng.ts';

export type Mode = 'skirmish' | 'multi' | 'dom' | 'rich' | 'sand' | 'conquest';
export type Tier = 'outpost' | 'village' | 'town' | 'fortress' | 'city' | 'camp' | 'ruin';
export type Tech = 'melee' | 'ranged' | 'armor';

/** An event waiting on the player's answer. */
export interface Pending {
  kind: 'tribute' | 'truce' | 'caravan';
  slot: number;
  text: string;
  yes: string;
  no: string;
}

export interface Cheats {
  gold: boolean;
  resources: boolean;
  instant: boolean;
  build: boolean;
  powers: boolean;
  /** Whole map explored and in sight. */
  reveal: boolean;
}
export type Phase = 'play' | 'edit';
export type Outcome = 'win' | 'lose' | null;

export interface Settlement {
  ent: 'base';
  id: number;
  team: number;
  x: number;
  y: number;
  hp: number;
  max: number;
  cd: number;
  tier: Tier;
  /** Region this settlement stands in. -1 outside Conquest. */
  region: number;
  /** Seconds of construction or upgrade left. Production and income pause while it runs. */
  buildT: number;
  /** Last team to damage this settlement, for loot. */
  hitBy: number;
  /** Neutral timers: seconds until a camp raids again, or seconds a ruin has been held. */
  nT: number;
  /** Civilian life, updated by the civilian pass. */
  civ: TownStats;
}

export type TownState = 'growing' | 'stable' | 'attacked' | 'recovering';

export interface TownStats {
  residents: number;
  housing: number;
  jobs: number;
  employed: number;
  /** Gold per second from staffed jobs. */
  income: number;
  state: TownState;
  /** Seconds since an enemy was near. */
  safeT: number;
  /** Seconds toward the next resident. */
  growT: number;
  /** Most residents the town has had, for recovery. */
  peak: number;
}

export interface GameEvent {
  tick: number;
  kind: 'attack' | 'unrest' | 'built' | 'broke' | 'war' | 'truce' | 'revolt' | 'raid' | 'claim' | 'lost' | 'loot' | 'feat';
  text: string;
  x: number;
  y: number;
  region: number;
}

/** A Conquest region: the unit of ownership, upkeep, and garrison. */
export interface Region {
  id: number;
  name: string;
  /** Center in world pixels. */
  cx: number;
  cy: number;
  adj: number[];
  owner: number;
  /** Slot with the only settlements in the region, or -1. */
  claimant: number;
  /** Seconds the claimant has stood uncontested. */
  claimT: number;
  contested: boolean;
  connected: boolean;
  /** Own army value inside, and what holding it asks for. */
  garrison: number;
  need: number;
  /** 0 to 100. At 100 the region revolts. */
  unrest: number;
  /** Materials per second the land yields to its owner. */
  mat: number;
}

export interface Rules {
  /** Town build-out: placed buildings that train units. On in every mode. */
  town: boolean;
  /** Ages gate buildings by settlement tier. Realm only; elsewhere everything is unlocked. */
  ages: boolean;
  /** Villagers live in towns, take jobs, and flee raids. Realm only. */
  civilians: boolean;
  /** Fog of war for the player. Realm only. */
  fog: boolean;
  upkeep: boolean;
  connection: boolean;
  garrison: boolean;
  unrest: boolean;
  materials: boolean;
  population: boolean;
  diplomacy: boolean;
  veterancy: boolean;
}

export interface Building {
  ent: 'bld';
  id: number;
  team: number;
  type: BldKey;
  kind: BldKind;
  tx: number;
  ty: number;
  x: number;
  y: number;
  hp: number;
  max: number;
  cd: number;
  /** Gates only. */
  dir: 'h' | 'v' | null;
  /** Gates only. */
  locked: boolean | null;
  tiles: [number, number][];
  /** Seconds of construction left. Not functional until zero. */
  buildT: number;
  /** Production queue for buildings that train. */
  queue: QueueItem[];
  rally: { x: number; y: number } | null;
}

export type Target = Unit | Building | Settlement;

export type Order =
  | { type: 'move'; x: number; y: number }
  /** Attack a target, or attack-move: head for (x, y) when set, fighting whatever comes into reach. */
  | { type: 'attack'; tgt: Target | null; x?: number; y?: number }
  /** Hold a post or follow a target: engage what comes within reach, never stray far, come back. */
  | { type: 'guard'; x: number; y: number; tgt?: Target | null; hold?: boolean }
  /** Disengage and walk home. No attacking on the way, not even when blocked. */
  | { type: 'retreat' };

export interface Unit {
  ent: 'unit';
  id: number;
  team: number;
  type: UnitKey;
  x: number;
  y: number;
  hp: number;
  cd: number;
  order: Order | null;
  flash: number;
  walk: number;
  moving: boolean;
  /** AI units wait at the base until the next wave. */
  held: boolean;
  /** Enemy building that stopped this unit's last move. */
  blk: Building | null;
  px: number;
  py: number;
  /** Position at the start of the tick, for render interpolation. */
  ox: number;
  oy: number;
  /** Seconds of half speed left. */
  slowT: number;
  /** Seconds of no movement left. */
  rootT: number;
  /** Seconds a stealth unit stays visible. */
  reveal: number;
  /** Distance run since the last attack, for charge bonuses. */
  run: number;
  /** Cooldown left before the next blink. */
  blinkT: number;
  /** Time until the next trap drop. */
  dropT: number;
  /** Index in the unit array this tick. Transient. */
  ix: number;
  /** Kills, for veterancy. */
  kills: number;
  /** Seconds of haste left: faster movement and attacks. */
  hasteT: number;
  /** Villagers: settlement they live in (-1 for soldiers), workplace building id (-1 none, 0 the settlement itself). */
  home: number;
  job: number;
  /** Seconds until the villager picks a new place to stand, and seconds of fleeing left. */
  civT: number;
  fleeT: number;
}

export interface Mine {
  x: number;
  y: number;
  owner: number;
  prev: number;
}

export interface Slot {
  /** Alliance id. Slots with the same value are allies. */
  ally: number;
  race: RaceKey;
  /** Difficulty for this slot's AI. Defaults to the world's. */
  diff: DiffKey;
  alive: boolean;
  gold: number;
  /** A faction owns a collection of settlements. Skirmish puts one here. */
  settlements: Settlement[];
  /** True when the built-in AI drives this slot. */
  ai: boolean;
  aiT: number;
  aiWant: UnitKey | null;
  /** Sim time of the last wave this slot sent. */
  aiLast: number;
  /** Production queue at the primary settlement. The head is being built. */
  queue: QueueItem[];
  /** Where new units walk to after spawning. Null means they stay at the gate. */
  rally: { x: number; y: number } | null;
  /** Materials, the second Conquest resource. */
  mat: number;
  /** Bandits, independents, and rebels. Never eliminated, never a rival. */
  neutral: boolean;
  /** Attitude toward each slot, -100 to 100. */
  attitude: number[];
  /** Truce with each slot. Truced factions do not fight. */
  truce: boolean[];
  /** Sim time each truce began, for peace. */
  truceT: number[];
  /** Cooldown left per power, in seconds. */
  powerCd: Partial<Record<PowerKey, number>>;
  /** Age of the faction: 0 village, 1 town, 2 city. Follows the best settlement tier. */
  age: number;
  /** Blacksmith research levels, 0 to 2. */
  tech: Record<Tech, number>;
}

/** A barrage in flight: lands at `t` seconds. */
export interface Strike {
  team: number;
  x: number;
  y: number;
  r: number;
  dmg: number;
  t: number;
}

export interface QueueItem {
  unit: UnitKey;
  /** Seconds of build time left. */
  t: number;
  /** AI purchases wait at the rally point until a wave goes. */
  held: boolean;
}

export type Fx =
  | { k: 'shot'; x1: number; y1: number; x2: number; y2: number; t: number; c: string }
  | { k: 'hit'; x: number; y: number; t: number }
  | { k: 'die'; x: number; y: number; t: number }
  | { k: 'ping'; x: number; y: number; t: number }
  | { k: 'boom'; x: number; y: number; r: number; t: number }
  | { k: 'heal'; x: number; y: number; t: number }
  | { k: 'fix'; x: number; y: number; t: number }
  | { k: 'txt'; x: number; y: number; t: number; str: string; c: string }
  | { k: 'dmg'; x: number; y: number; t: number; n: number }
  | { k: 'mark'; x: number; y: number; r: number; t: number; c: string }
  | { k: 'bolt'; x: number; y: number; t: number };

/** Sandbox army layout, restored on replay and on return to edit. */
export interface SandSnap {
  units: { team: number; type: UnitKey; x: number; y: number }[];
  blds: { team: number; type: BldKey; tx: number; ty: number; dir: 'h' | 'v' | null; locked: boolean | null }[];
}

export interface World {
  map: MapDef;
  mode: Mode;
  /** The seed the world was made from. Saved so a slot card and a replay can name it. */
  seed: number;
  phase: Phase;
  nP: number;
  slots: Slot[];
  diff: DiffKey;
  cap: number;
  /** Ticks stepped so far. Commands are stamped with the tick they apply on. */
  tick: number;
  t: number;
  /** Player income, shown in the HUD. */
  income: number;
  incFlash: number;
  units: Unit[];
  blds: Building[];
  /** Tile index to building. Derived from blds, rebuilt on restore. */
  bmap: Map<number, Building>;
  fx: Fx[];
  score: number[];
  barbT: number;
  over: Outcome;
  mines: Mine[];
  /** Per-slot flow field toward hostile bases. Null entries for dead or unopposed slots. */
  flow: (Float32Array | null)[] | null;
  /** Per-slot distance to the slot's own base, for retreats. Derived, rebuilt with flow. */
  home: (Float32Array | null)[] | null;
  flowDirty: boolean;
  /** Tick the flow fields were last built. Rebuilds are throttled to once per 15 ticks. */
  flowTick: number;
  /** Spatial hash, rebuilt every tick. Derived, never snapshotted. */
  grid: unknown;
  /** Which teams field auras this tick. Derived, never snapshotted. */
  auras: unknown;
  wave: number;
  waveN: number;
  nextId: number;
  rng: Rng;
  msg: string;
  msgT: number;
  snap: SandSnap | null;
  /** Commands waiting for their tick. */
  queue: Command[];
  /** Every external command applied so far. Seed plus log replays the game. */
  log: Command[];
  /** Cosmetic randomness. Never feeds gameplay, so effects cannot change outcomes. */
  fxRng: Rng;
  /** Conquest regions. Empty outside Conquest. */
  regions: Region[];
  /** Region id per tile. Null outside Conquest. */
  regionOf: Uint8Array | null;
  rules: Rules;
  /** Net income per slot, updated each tick. */
  net: number[];
  /** Seconds each slot has spent broke, for desertion. */
  broke: number[];
  /** Capital region per slot in Conquest. */
  capitals: number[];
  /** Things that happened, for the event queue and auto-pause. */
  events: GameEvent[];
  /** Index of the neutral slot in Conquest, or -1. */
  neutral: number;
  /** Terrain changed; the renderer rebuilds its background. Transient. */
  mapDirty: boolean;
  strikes: Strike[];
  /** Production finishes at once. A game option, set at start. */
  instant: boolean;
  cheats: Cheats;
  /** Explored tiles for the player, or null without fog. */
  seen: Uint8Array | null;
  /** Realm accomplishments earned so far, in order. */
  feats: import('../data/realm.ts').FeatKey[];
  /** Seconds until the next clocked event. */
  eventT: number;
  pending: Pending | null;
  /** Realm days survived, a day every two minutes. */
  day: number;
}

export interface TargetRef {
  kind: 'unit' | 'bld' | 'base';
  id: number;
}

export type Action =
  | { type: 'buy'; payload: { unit: UnitKey; held?: boolean } }
  | { type: 'cancel'; payload: { index: number; building?: number } }
  | { type: 'settle'; payload: { x: number; y: number; tier?: 'outpost' | 'village' } }
  | { type: 'absorb'; payload: { id: number } }
  | { type: 'truce'; payload: { slot: number; offer: boolean } }
  | { type: 'power'; payload: { power: PowerKey; x: number; y: number } }
  | { type: 'research'; payload: { tech: Tech } }
  | { type: 'ageUp'; payload: null }
  | { type: 'bldRally'; payload: { id: number; x: number; y: number } }
  | { type: 'cheats'; payload: Cheats }
  | { type: 'choose'; payload: { yes: boolean } }
  | { type: 'upgrade'; payload: { id: number } }
  | { type: 'rally'; payload: { x: number; y: number } | null }
  | { type: 'move'; payload: { ids: number[]; x: number; y: number } }
  | { type: 'attack'; payload: { ids: number[]; target: TargetRef | null; x?: number; y?: number } }
  | { type: 'guard'; payload: { ids: number[]; x: number; y: number; target?: TargetRef | null } }
  | { type: 'hold'; payload: { ids: number[] } }
  | { type: 'retreat'; payload: { ids: number[] } }
  | { type: 'gate'; payload: { id: number } }
  | { type: 'build'; payload: { x: number; y: number; bld: BldKey } }
  | { type: 'sell'; payload: { x: number; y: number } }
  | { type: 'place'; payload: { unit: UnitKey; x: number; y: number } }
  | { type: 'erase'; payload: { x: number; y: number } }
  | { type: 'clear'; payload: null }
  | { type: 'mirror'; payload: null }
  | { type: 'startBattle'; payload: null }
  | { type: 'toEdit'; payload: null };

export type Command = Action & { tick: number; slot: number };

export interface WorldConfig {
  allies: number[];
  diff: DiffKey;
  seed?: number;
  /** Which slots the built-in AI drives. Default: every slot but 0. */
  ai?: boolean[];
  /** Race per slot. Default: kingdom. */
  races?: RaceKey[];
  /** Difficulty per slot. Default: the world's difficulty. */
  diffs?: DiffKey[];
  instant?: boolean;
  cheats?: Partial<Cheats>;
}
