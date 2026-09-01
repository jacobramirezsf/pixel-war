// Unit definitions and pixel sprites for all five races.
// The Kingdom roster is the prototype's 21 units, numbers unchanged. The other races get
// a variant of 16 of the 17 shared archetypes plus four specials of their own.

import { RACES, RACE_KEYS, type RaceKey } from './races.ts';

export type UnitKey = string;
export type Role = 'scout' | 'line' | 'ranged' | 'fast' | 'siege' | 'support' | 'heavy' | 'air' | 'special' | 'civ';

export interface UnitDef {
  key: UnitKey;
  name: string;
  race: RaceKey;
  role: Role;
  cost: number;
  hp: number;
  dmg: number;
  range: number;
  speed: number;
  cd: number;
  aggro: number;
  /** Sprite size in pixels. */
  sz: number;
  /** Collision radius. */
  r: number;
  sprite: readonly string[];
  // prototype specials
  repair?: number;
  splash?: number;
  suicide?: boolean;
  armor?: number;
  shot?: string;
  heal?: number;
  fly?: boolean;
  aura?: number;
  minRange?: number;
  // race specials, each used by one race only
  /** Horde. Allies within this radius move 30% faster. */
  speedAura?: number;
  /** Horde. Damage multiplier against buildings and bases. */
  vsBld?: number;
  /** Plain siege bonus against buildings. Not a race mechanic. */
  bldDmg?: number;
  /** Horde. Damage multiplier on the first hit after running 20px. */
  charge?: number;
  /** Horde. Hit points regained per second. */
  regen?: number;
  /** Undead. Raises a skeleton when an enemy dies within this radius. */
  raise?: number;
  /** Undead. Fraction of damage dealt returned as health. */
  lifesteal?: number;
  /** Undead. Seconds the target moves at half speed after a hit. */
  slow?: number;
  /** Undead. On death, spawns n units of this key. */
  split?: { unit: UnitKey; n: number };
  /** Forge. Allies within this radius take 3 less ranged damage. */
  guardAura?: number;
  /** Forge. Shots hit every enemy along the line to the target. */
  pierce?: boolean;
  /** Forge. Hits arc to this many extra enemies near the target at half damage. */
  chain?: number;
  /** Forge. Drops barbed wire under itself every this many seconds. */
  dropTrap?: number;
  /** Wild. Invisible to enemies until it attacks or gets close. */
  stealth?: boolean;
  /** Wild. Seconds the target cannot move after a hit. */
  root?: number;
  /** Wild. Trees do not slow this unit. */
  woodland?: boolean;
  /** Wild. Extra armor and regen while standing in trees. */
  treeArmor?: number;
  /** Wild. Teleports this far toward a target that is out of range. */
  blink?: number;
}

type Base = Omit<UnitDef, 'key' | 'race' | 'sz' | 'r' | 'sprite'>;

// ---------- shared archetypes (Kingdom values, unchanged from the prototype) ----------

const ARCH: Record<string, Base> = {
  sct: { name: 'SCOUT',    role: 'scout',   cost: 10,  hp: 20,  dmg: 5,  range: 6,  speed: 36, cd: 0.5,  aggro: 30 },
  inf: { name: 'SOLDIER',  role: 'line',    cost: 20,  hp: 40,  dmg: 8,  range: 7,  speed: 24, cd: 0.7,  aggro: 30 },
  spr: { name: 'SPEAR',    role: 'line',    cost: 25,  hp: 45,  dmg: 10, range: 12, speed: 22, cd: 0.9,  aggro: 30 },
  arc: { name: 'ARCHER',   role: 'ranged',  cost: 30,  hp: 26,  dmg: 7,  range: 36, speed: 22, cd: 0.9,  aggro: 44 },
  wrk: { name: 'WORKER',   role: 'support', cost: 25,  hp: 25,  dmg: 2,  range: 6,  speed: 26, cd: 0.6,  aggro: 24, repair: 8 },
  bmb: { name: 'BOMBER',   role: 'siege',   cost: 30,  hp: 25,  dmg: 45, range: 5,  speed: 30, cd: 0.1,  aggro: 36, splash: 14, suicide: true, bldDmg: 2 },
  shd: { name: 'SHIELD',   role: 'line',    cost: 35,  hp: 90,  dmg: 8,  range: 7,  speed: 16, cd: 0.9,  aggro: 28, armor: 3 },
  flm: { name: 'FLAMER',   role: 'line',    cost: 35,  hp: 35,  dmg: 5,  range: 14, speed: 20, cd: 0.3,  aggro: 30, splash: 6, shot: '#ff8c2a' },
  brk: { name: 'BERSERK',  role: 'line',    cost: 40,  hp: 50,  dmg: 13, range: 7,  speed: 28, cd: 0.45, aggro: 34 },
  xbw: { name: 'CROSSBOW', role: 'ranged',  cost: 40,  hp: 32,  dmg: 18, range: 32, speed: 18, cd: 1.6,  aggro: 40 },
  med: { name: 'MEDIC',    role: 'support', cost: 40,  hp: 30,  dmg: 0,  range: 26, speed: 22, cd: 0.8,  aggro: 40, heal: 7 },
  drn: { name: 'DRONE',    role: 'air',     cost: 45,  hp: 24,  dmg: 9,  range: 30, speed: 44, cd: 0.7,  aggro: 40, fly: true },
  asn: { name: 'ASSASSIN', role: 'fast',    cost: 45,  hp: 28,  dmg: 30, range: 6,  speed: 40, cd: 1.4,  aggro: 40 },
  kni: { name: 'KNIGHT',   role: 'fast',    cost: 50,  hp: 80,  dmg: 14, range: 8,  speed: 34, cd: 0.8,  aggro: 36 },
  ban: { name: 'BANNER',   role: 'special', cost: 50,  hp: 70,  dmg: 6,  range: 7,  speed: 22, cd: 0.9,  aggro: 28, aura: 18 },
  wiz: { name: 'WIZARD',   role: 'special', cost: 55,  hp: 26,  dmg: 12, range: 40, speed: 18, cd: 1.2,  aggro: 46, splash: 9, shot: '#b06cff' },
  tnk: { name: 'TANK',     role: 'heavy',   cost: 60,  hp: 130, dmg: 20, range: 14, speed: 14, cd: 1.3,  aggro: 34 },
  mor: { name: 'MORTAR',   role: 'siege',   cost: 60,  hp: 40,  dmg: 24, range: 56, speed: 12, cd: 2.4,  aggro: 60, splash: 12, minRange: 20, shot: '#f2d34a', bldDmg: 2 },
  snp: { name: 'SNIPER',   role: 'ranged',  cost: 70,  hp: 26,  dmg: 40, range: 64, speed: 16, cd: 2.6,  aggro: 70 },
  mch: { name: 'MECH',     role: 'special', cost: 90,  hp: 150, dmg: 16, range: 9,  speed: 12, cd: 1.0,  aggro: 30, splash: 8, armor: 2 },
  gnt: { name: 'GIANT',    role: 'special', cost: 150, hp: 300, dmg: 32, range: 10, speed: 9,  cd: 1.7,  aggro: 30, splash: 10, armor: 3 },
};

/** Kingdom build order, the prototype's key order. */
const KINGDOM_ORDER = ['sct', 'inf', 'spr', 'arc', 'wrk', 'bmb', 'shd', 'flm', 'brk', 'xbw', 'med', 'drn', 'asn', 'kni', 'ban', 'wiz', 'tnk', 'mor', 'snp', 'mch', 'gnt'];
/** Archetypes every other race gets a variant of, minus the one it omits. */
const SHARED = ['sct', 'inf', 'spr', 'arc', 'wrk', 'bmb', 'shd', 'flm', 'brk', 'xbw', 'med', 'drn', 'asn', 'kni', 'tnk', 'mor', 'snp'];

// Sprite grids. '.' is empty, 'T' is the team color, other letters index PAL.
const ARCH_SPR: Record<string, readonly string[]> = {
  sct: ['..DDD...', '..DTD...', '..SSS...', '.TTTT...', '.TTTTW..', '..DD....', '..D.D...', '..D..D..'],
  inf: ['..DDDD..', '..DTTD..', '..SSSS..', '.TTTTW..', '.TTTTWW.', '.TDDTW..', '..D..D..', '.DD..DD.'],
  spr: ['......W.', '..DDD.W.', '..DTD.W.', '..SSS.B.', '.TTTT.B.', '.TTTTBB.', '.TDDT.B.', '.DD.DD..'],
  arc: ['...DD...', '..DTTD.B', '..SSSS.B', '.TTTT.BB', '.TTTTBB.', '.TDDT.B.', '..D..D..', '.DD..DD.'],
  wrk: ['..YYYY..', '.YYYYYY.', '..SSSS..', '.TTTT.B.', '.TTTTBB.', '.TDDT.B.', '..D..D..', '.DD..DD.'],
  bmb: ['..DDD..Y', '..DTD.DD', '..SSS.DD', '.TTTTDDD', '.TTTTDDD', '.TDDT.DD', '..D..D..', '.DD..DD.'],
  shd: ['..DDDD..', 'GGDTTD..', 'GTSSSS..', 'GTTTTT..', 'GTTTTT..', 'GGDDT...', '..D..D..', '.DD..DD.'],
  flm: ['..DDDD..', '..DTTD..', '..SSSS..', 'OTTTTOOO', 'OTTTTOO.', 'OTDDT...', '..D..D..', '.DD..DD.'],
  brk: ['.W.DDD.W', '.W.DTD.W', '.WWSSSWW', '..SSSSS.', '..TSSST.', '..TDDT..', '..D..D..', '.DD..DD.'],
  xbw: ['..DDDD..', '..DTTD..', '..SSSS..', '.TTTTBWW', '.TTTTBB.', '.TDDT.B.', '..D..D..', '.DD..DD.'],
  med: ['..DDDD..', '..DTTD..', '..SSSS..', '.WWTWW..', '.WTTTW..', '.WWTWW..', '..D..D..', '.DD..DD.'],
  drn: ['W......W', '.W....W.', '..DDDD..', '.DDTTDD.', '.DDTTDD.', '..DDDD..', '.W....W.', 'W......W'],
  asn: ['..DDDD..', '..DDDD..', '..DTTD..', '.DDDDDD.', '.DDDDD.W', '.DDDD...', '..D..D..', '.DD..DD.'],
  kni: ['...DDD..', '...DTD..', '..TTTT.W', 'BBBTTBBW', 'BBBBBBB.', 'BBBBBBB.', '.B.B.B..', '.B.B.B..'],
  ban: ['.....WTT', '.DDDDWTT', '.DTTDWT.', '.SSSSW..', 'TTTTTW..', 'TTTTTW..', '.DDDTW..', '.D..DW..'],
  wiz: ['...PP...', '..PPPP.Y', '.PPPPPPW', '..SSSS.W', '.PTTTP.W', '.PTTTP.W', '.PDDDP..', '.DD..DD.'],
  tnk: ['...DDD..', '..DTTDWW', '.DDDDDD.', 'DTTTTTTD', 'DTTTTTTD', '.DDDDDD.', 'DWDWDWDW', '.DDDDDD.'],
  mor: ['....GG..', '...GGG..', '..GGG...', '.GGG....', 'DGGDDD..', 'DDDDDDD.', 'DTTTTTD.', '.DDDDD..'],
  snp: ['..DDDD.G', '..DTTD.G', '..SSSS.G', '.TTTTDDG', '.TTTTDDG', '.TDDT..G', '..D..D..', '.DD..DD.'],
  mch: ['...DDDD...', '..DTTTTD..', '..DTGGTD..', 'WWDDDDDDWW', 'W.DTTTTD.W', '..DTTTTD..', '..DDDDDD..', '..DD..DD..', '..DD..DD..', '.DDD..DDD.'],
  gnt: ['....DDDD....', '...DTTTTD...', '...DSSSSD...', '...DSSSSD...', '.DDTTTTTTDD.', '.DSTTTTTTSD.', '.DSTTTTTTSD.', '..DTTTTTTD..', '...DDDDDD...', '...DD..DD...', '...DD..DD...', '..DDD..DDD..'],
};

export const PAL: Record<string, string> = {
  D: '#141520', S: '#e8b88a', W: '#dde2ec', B: '#8a5a2b', Y: '#f2d34a', O: '#ff8c2a', P: '#b06cff', G: '#8a8f9c',
  K: '#6faa4a', N: '#e9e4d0', M: '#9aa4b8', L: '#4caf50', R: '#c0392b', I: '#4b5563', C: '#67e8f9', X: '#6b4f2a',
};

// ---------- race variants ----------

/** Variant names per race, keyed by archetype. */
const NAMES: Record<Exclude<RaceKey, 'kingdom'>, Record<string, string>> = {
  horde: { sct: 'RUNNER', inf: 'GRUNT', spr: 'IMPALER', arc: 'SLINGER', wrk: 'PEON', bmb: 'FIRE GOB', shd: 'BRUISER', flm: 'TORCHER', brk: 'RAVAGER', xbw: 'BOLTER', med: 'WITCH DOC', drn: 'BAT RIDER', asn: 'STABBER', kni: 'WOLF RIDER', tnk: 'OGRE', mor: 'CATAPULT' },
  undead: { sct: 'CRAWLER', inf: 'SKELETON', spr: 'BONE PIKE', arc: 'BONE BOW', wrk: 'DIGGER', bmb: 'PLAGUE POD', shd: 'TOMB GUARD', flm: 'ASH CASTER', brk: 'REVENANT', xbw: 'DEATH BOLT', drn: 'GARGOYLE', asn: 'SHADOW', kni: 'DEATH RIDER', tnk: 'ABOMINATION', mor: 'CORPSE HURL', snp: 'REAPER' },
  forge: { sct: 'PROBE', inf: 'TROOPER', spr: 'PIKEBOT', arc: 'GUNNER', wrk: 'MECHANIC', bmb: 'BLAST DRONE', shd: 'WALL UNIT', flm: 'FLAME RIG', xbw: 'CANNONEER', med: 'MED BOT', drn: 'ROTOR', asn: 'STALKER', kni: 'CHARGER', tnk: 'IRON TANK', mor: 'HOWITZER', snp: 'LONG GUN' },
  wild: { sct: 'FOX', inf: 'WARDEN', spr: 'THORNGUARD', arc: 'LONGBOW', wrk: 'TENDER', bmb: 'SPORE POD', shd: 'BARK SHIELD', flm: 'EMBER', brk: 'WOLFKIN', xbw: 'HUNTER', med: 'MENDER', drn: 'OWL', asn: 'NIGHTBLADE', kni: 'STAG RIDER', mor: 'ROCK SLING', snp: 'EAGLE EYE' },
};

const PREFIX: Record<Exclude<RaceKey, 'kingdom'>, string> = { horde: 'h_', undead: 'u_', forge: 'f_', wild: 'w_' };

const round5 = (v: number): number => Math.max(5, Math.round(v / 5) * 5);

/**
 * Tier scaling. The prototype's numbers grow about linearly with cost, so a 150 gold giant is
 * worth four 20 gold soldiers. Power should grow faster than price: a unit costing k times a
 * soldier gets k^0.22 more hit points and k^0.15 more damage on top of its listed numbers.
 */
export const TIER_HP_EXP = 0.22;
export const TIER_DMG_EXP = 0.15;
export function tierScale(cost: number): { hp: number; dmg: number } {
  const k = Math.max(1, cost / 20);
  return { hp: Math.pow(k, TIER_HP_EXP), dmg: Math.pow(k, TIER_DMG_EXP) };
}

function scaled<T extends { cost: number; hp: number; dmg: number; heal?: number }>(d: T): T {
  const t = tierScale(d.cost);
  d.hp = Math.round(d.hp * t.hp);
  d.dmg = Math.round(d.dmg * t.dmg);
  if (d.heal) d.heal = Math.round(d.heal * t.dmg);
  return d;
}

function recolor(grid: readonly string[], map: Record<string, string>): string[] {
  return grid.map((row) => row.split('').map((ch) => map[ch] ?? ch).join(''));
}

/** Put a mark on the head so each race reads differently at a glance. */
function trim(grid: string[], race: RaceKey): string[] {
  const g = grid.map((r) => r.split(''));
  const n = g.length;
  let top = 0;
  while (top < n && !g[top].some((c) => c === 'D' || c === 'S' || c === 'K' || c === 'N' || c === 'M')) top++;
  if (top >= n) return grid;
  const row = g[top];
  let l = row.findIndex((c) => c !== '.'), r = row.length - 1 - row.slice().reverse().findIndex((c) => c !== '.');
  if (l < 0) return grid;
  if (race === 'horde') { if (l > 0 && row[l - 1] === '.') row[l - 1] = 'N'; if (r < n - 1 && row[r + 1] === '.') row[r + 1] = 'N'; }
  else if (race === 'undead') { if (top + 2 < n) for (let x = l + 1; x < r; x++) if (g[top + 2][x] === 'N') g[top + 2][x] = 'D'; }
  else if (race === 'forge') { for (let x = l; x <= r; x++) if (row[x] === 'D') row[x] = 'I'; if (top > 0) g[top - 1][(l + r) >> 1] = 'C'; }
  else if (race === 'wild') { if (r < n - 1) row[r + 1] = 'L'; else if (l > 0) row[l - 1] = 'L'; }
  return g.map((rw) => rw.join(''));
}

function variant(race: RaceKey, arch: string): UnitDef {
  const R = RACES[race], b = ARCH[arch], m = R.mods;
  const key = race === 'kingdom' ? arch : PREFIX[race] + arch;
  const name = race === 'kingdom' ? b.name : NAMES[race][arch];
  const sprite = race === 'kingdom' ? ARCH_SPR[arch] : trim(recolor(ARCH_SPR[arch], R.recolor), race);
  const armor = b.armor !== undefined ? Math.max(0, b.armor + m.armor) : m.armor > 0 ? m.armor : undefined;
  const d: UnitDef = {
    ...b, key, name, race, sprite, sz: sprite.length, r: sprite.length / 2 - 1,
    cost: race === 'kingdom' ? b.cost : round5(b.cost * m.cost),
    hp: Math.round(b.hp * m.hp), dmg: Math.round(b.dmg * m.dmg), range: Math.round(b.range * m.range),
    speed: Math.round(b.speed * m.speed), cd: Math.round(b.cd * m.cd * 20) / 20, aggro: Math.round(b.aggro * m.aggro),
  };
  if (armor !== undefined && armor > 0) d.armor = armor; else delete d.armor;
  if (b.heal) d.heal = Math.round(b.heal * m.dmg);
  if (R.woodland) d.woodland = true;
  return scaled(d);
}

// ---------- specials, four per race, mechanics unique to that race ----------

const SPECIALS: Record<Exclude<RaceKey, 'kingdom'>, (Omit<UnitDef, 'race' | 'sz' | 'r'>)[]> = {
  horde: [
    { key: 'h_chief', name: 'WARCHIEF', role: 'special', cost: 55, hp: 90, dmg: 11, range: 8, speed: 24, cd: 0.8, aggro: 30, speedAura: 20,
      sprite: ['N.DDDD.N', 'NDDTTDDN', '.KKKKKK.', '.KTTTTK.', 'RTTTTTTR', 'RTDDDDTR', '..D..D..', '.DD..DD.'] },
    { key: 'h_sap', name: 'SAPPER', role: 'siege', cost: 35, hp: 40, dmg: 6, range: 6, speed: 26, cd: 0.7, aggro: 30, vsBld: 5,
      sprite: ['..DDD.G.', '..DTD.GG', '..KKK.G.', '.TTTT.X.', '.TTTTXX.', '.TDDT.X.', '..D..D..', '.DD..DD.'] },
    { key: 'h_warg', name: 'WARG RIDER', role: 'fast', cost: 50, hp: 65, dmg: 12, range: 8, speed: 40, cd: 0.9, aggro: 40, charge: 2,
      sprite: ['....DDD.', '....DTD.', '.G..KKK.', 'GGGGTTTG', 'GGGGGGGG', 'DGGGGGGD', '.G.G.G.G', '.G.G.G.G'] },
    { key: 'h_troll', name: 'TROLL', role: 'heavy', cost: 80, hp: 170, dmg: 20, range: 10, speed: 16, cd: 1.3, aggro: 32, regen: 4, armor: 1,
      sprite: ['...KKKK...', '..KDKKDK..', '..KKKKKK..', '.KKTTTTKK.', 'KKKTTTTKKK', 'K.KTTTTK.K', '..KKKKKK..', '..KK..KK..', '..KK..KK..', '.DDD..DDD.'] },
  ],
  undead: [
    { key: 'u_necro', name: 'NECROMANCER', role: 'special', cost: 60, hp: 42, dmg: 9, range: 34, speed: 18, cd: 1.2, aggro: 44, raise: 30, shot: '#b06cff',
      sprite: ['..PPPP.G', '..PNNP.G', '..NDDN.G', '.PPPPP.G', '.PTTTP.G', '.PPPPP.G', '.PPPPP..', '.PP..PP.'] },
    { key: 'u_ghoul', name: 'GHOUL', role: 'line', cost: 30, hp: 45, dmg: 9, range: 6, speed: 30, cd: 0.7, aggro: 34, lifesteal: 0.5,
      sprite: ['..GGG...', '.GDGDG..', '.GGGGG..', '..TTT.G.', '.GTTTGG.', '.GGGGG..', '..G..G..', '.GG..GG.'] },
    { key: 'u_bansh', name: 'BANSHEE', role: 'ranged', cost: 45, hp: 30, dmg: 9, range: 30, speed: 26, cd: 1.0, aggro: 42, slow: 2, fly: true, shot: '#dde2ec',
      sprite: ['..WWWW..', '.WWDDWW.', '.WWWWWW.', '..WTTW..', '.WWTTWW.', '.W.WW.W.', '..W..W..', '.W....W.'] },
    { key: 'u_coloss', name: 'BONE COLOSSUS', role: 'heavy', cost: 120, hp: 230, dmg: 30, range: 10, speed: 10, cd: 1.5, aggro: 30, armor: 2, split: { unit: 'u_inf', n: 3 },
      sprite: ['....NNNN....', '...NDNNDN...', '...NNNNNN...', '..NNTTTTNN..', '.NNNTTTTNNN.', 'NN.NTTTTN.NN', '...NNNNNN...', '...N.NN.N...', '...NN..NN...', '...NN..NN...', '..NNN..NNN..', '..DD....DD..'] },
  ],
  forge: [
    { key: 'f_bulw', name: 'BULWARK', role: 'special', cost: 70, hp: 160, dmg: 13, range: 8, speed: 12, cd: 1.0, aggro: 28, armor: 3, guardAura: 20,
      sprite: ['..IIIIII..', '.IMMMMMMI.', '.IMTTTTMI.', 'IIMTTTTMII', 'IIMMMMMMII', 'IIMMCCMMII', '.IMMMMMMI.', '..IIIIII..', '..II..II..', '..II..II..'] },
    { key: 'f_rail', name: 'RAILGUN', role: 'ranged', cost: 85, hp: 36, dmg: 26, range: 60, speed: 12, cd: 2.2, aggro: 66, pierce: true, shot: '#67e8f9',
      sprite: ['..IIII.C', '..IMMI.C', '..MMMM.C', '.TTTTIIC', '.TTTTIIC', '.IDDI..C', '..I..I..', '.II..II.'] },
    { key: 'f_shock', name: 'SHOCKER', role: 'line', cost: 50, hp: 55, dmg: 9, range: 14, speed: 20, cd: 0.9, aggro: 32, chain: 2, shot: '#67e8f9',
      sprite: ['C.IIII.C', '.CIMMIC.', '..MMMM..', '.TTTTTT.', 'CTTTTTTC', '.IDDDDI.', '..I..I..', '.II..II.'] },
    { key: 'f_miner', name: 'MINELAYER', role: 'siege', cost: 45, hp: 60, dmg: 4, range: 6, speed: 18, cd: 1.0, aggro: 26, armor: 1, dropTrap: 5,
      sprite: ['...IIII.', '..IMMMMI', '.IITTTTI', 'IIIIIIII', 'IGIGIGIG', 'IIIIIIII', 'GIGIGIGI', '.IIIIII.'] },
  ],
  wild: [
    { key: 'w_shade', name: 'SHADE', role: 'fast', cost: 55, hp: 30, dmg: 24, range: 6, speed: 38, cd: 1.2, aggro: 40, stealth: true, woodland: true,
      sprite: ['..DDDD..', '.DDDDDD.', '.DDLLDD.', '..DDDD..', '.DDTTDD.', '.DDDDDD.', '..D..D..', '.DD..DD.'] },
    { key: 'w_druid', name: 'DRUID', role: 'ranged', cost: 50, hp: 36, dmg: 9, range: 32, speed: 22, cd: 1.1, aggro: 42, root: 1.5, shot: '#4caf50', woodland: true,
      sprite: ['..LLLL.X', '..LSSL.X', '..SSSS.L', '.LLLLL.X', '.LTTTL.X', '.LLLLL.X', '.LL.LL..', '.DD..DD.'] },
    { key: 'w_treant', name: 'TREANT', role: 'heavy', cost: 100, hp: 220, dmg: 28, range: 10, speed: 10, cd: 1.5, aggro: 30, armor: 2, treeArmor: 3, regen: 2, woodland: true,
      sprite: ['..LLLLLLLL..', '.LLLLLLLLLL.', 'LLLXXXXXXLLL', '.LLXDXXDXLL.', '..XXXXXXXX..', '..XXTTTTXX..', '.XXXTTTTXXX.', 'X.XXXXXXXX.X', '...XXXXXX...', '...XX..XX...', '...XX..XX...', '..XXX..XXX..'] },
    { key: 'w_sprite', name: 'SPRITE', role: 'fast', cost: 40, hp: 30, dmg: 12, range: 8, speed: 34, cd: 0.8, aggro: 38, blink: 28, fly: true, woodland: true,
      sprite: ['C..DD..C', '.CCSSCC.', '..CSSC..', '.CTTTTC.', 'C.TTTT.C', '..DDDD..', '..D..D..', '........'] },
  ],
};

// ---------- build the tables ----------

export const TYPES: Record<UnitKey, UnitDef> = {};
export const ROSTER: Record<RaceKey, UnitKey[]> = { kingdom: [], horde: [], undead: [], forge: [], wild: [] };

for (const arch of KINGDOM_ORDER) { const d = variant('kingdom', arch); TYPES[d.key] = d; ROSTER.kingdom.push(d.key); }
for (const race of RACE_KEYS) {
  if (race === 'kingdom') continue;
  const list: UnitDef[] = [];
  for (const arch of SHARED) if (arch !== RACES[race].omit) list.push(variant(race, arch));
  for (const s of SPECIALS[race]) list.push(scaled({ ...s, race, sz: s.sprite.length, r: s.sprite.length / 2 - 1 }));
  list.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
  for (const d of list) { TYPES[d.key] = d; ROSTER[race].push(d.key); }
}

// Villagers. Not on any roster, never bought: towns grow them. Team color on the tunic.
TYPES.civ = {
  key: 'civ', name: 'VILLAGER', race: 'kingdom', role: 'civ', cost: 0, hp: 12, dmg: 0, range: 0, speed: 14, cd: 1, aggro: 0, sz: 8, r: 2,
  sprite: ['........', '...DD...', '...SS...', '..TTTT..', '..TTTT..', '...DD...', '...D.D..', '...D.D..'],
};

/** Kingdom build order, kept for the prototype's tests and tools. */
export const ORDER: readonly UnitKey[] = ROSTER.kingdom;
/** Every unit key across all races. */
export const ALL_UNITS: readonly UnitKey[] = Object.keys(TYPES);
/** Sprite grid by unit key. */
export const SPR: Record<UnitKey, readonly string[]> = Object.fromEntries(ALL_UNITS.map((k) => [k, TYPES[k].sprite]));

export function isUnitKey(k: string): boolean {
  return Object.prototype.hasOwnProperty.call(TYPES, k);
}

export function roster(race: RaceKey): readonly UnitKey[] {
  return ROSTER[race];
}

/** True when this unit is drawn and targeted normally. Shades hide until revealed. */
export function unitVisible(u: { type: UnitKey; reveal: number }): boolean {
  return !TYPES[u.type].stealth || u.reveal > 0;
}
