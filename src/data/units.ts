// Unit definitions and pixel sprites. Numbers are unchanged from the prototype.

export type UnitKey =
  | 'sct' | 'inf' | 'spr' | 'arc' | 'wrk' | 'bmb' | 'shd' | 'flm' | 'brk' | 'xbw' | 'med'
  | 'drn' | 'asn' | 'kni' | 'ban' | 'wiz' | 'tnk' | 'mor' | 'snp' | 'mch' | 'gnt';

export interface UnitDef {
  name: string;
  cost: number;
  hp: number;
  dmg: number;
  range: number;
  speed: number;
  cd: number;
  aggro: number;
  repair?: number;
  splash?: number;
  suicide?: boolean;
  armor?: number;
  shot?: string;
  heal?: number;
  fly?: boolean;
  aura?: number;
  minRange?: number;
  /** Sprite size in pixels, derived from the sprite grid. */
  sz: number;
  /** Collision radius, derived from the sprite grid. */
  r: number;
}

type UnitInput = Omit<UnitDef, 'sz' | 'r'>;

const DEFS: Record<UnitKey, UnitInput> = {
  sct: { name: 'SCOUT',    cost: 10,  hp: 20,  dmg: 5,  range: 6,  speed: 36, cd: 0.5,  aggro: 30 },
  inf: { name: 'SOLDIER',  cost: 20,  hp: 40,  dmg: 8,  range: 7,  speed: 24, cd: 0.7,  aggro: 30 },
  spr: { name: 'SPEAR',    cost: 25,  hp: 45,  dmg: 10, range: 12, speed: 22, cd: 0.9,  aggro: 30 },
  arc: { name: 'ARCHER',   cost: 30,  hp: 24,  dmg: 6,  range: 36, speed: 22, cd: 0.9,  aggro: 44 },
  wrk: { name: 'WORKER',   cost: 25,  hp: 25,  dmg: 2,  range: 6,  speed: 26, cd: 0.6,  aggro: 24, repair: 8 },
  bmb: { name: 'BOMBER',   cost: 30,  hp: 25,  dmg: 45, range: 5,  speed: 30, cd: 0.1,  aggro: 36, splash: 14, suicide: true },
  shd: { name: 'SHIELD',   cost: 35,  hp: 90,  dmg: 6,  range: 7,  speed: 16, cd: 0.9,  aggro: 28, armor: 3 },
  flm: { name: 'FLAMER',   cost: 35,  hp: 35,  dmg: 5,  range: 14, speed: 20, cd: 0.25, aggro: 30, splash: 6, shot: '#ff8c2a' },
  brk: { name: 'BERSERK',  cost: 40,  hp: 50,  dmg: 13, range: 7,  speed: 28, cd: 0.45, aggro: 34 },
  xbw: { name: 'CROSSBOW', cost: 40,  hp: 30,  dmg: 16, range: 32, speed: 18, cd: 1.6,  aggro: 40 },
  med: { name: 'MEDIC',    cost: 40,  hp: 30,  dmg: 0,  range: 26, speed: 22, cd: 0.8,  aggro: 40, heal: 7 },
  drn: { name: 'DRONE',    cost: 45,  hp: 20,  dmg: 7,  range: 30, speed: 44, cd: 0.7,  aggro: 40, fly: true },
  asn: { name: 'ASSASSIN', cost: 45,  hp: 28,  dmg: 30, range: 6,  speed: 40, cd: 1.4,  aggro: 40 },
  kni: { name: 'KNIGHT',   cost: 50,  hp: 80,  dmg: 14, range: 8,  speed: 34, cd: 0.8,  aggro: 36 },
  ban: { name: 'BANNER',   cost: 50,  hp: 50,  dmg: 4,  range: 7,  speed: 22, cd: 0.9,  aggro: 28, aura: 18 },
  wiz: { name: 'WIZARD',   cost: 55,  hp: 26,  dmg: 12, range: 40, speed: 18, cd: 1.2,  aggro: 46, splash: 9, shot: '#b06cff' },
  tnk: { name: 'TANK',     cost: 60,  hp: 130, dmg: 20, range: 14, speed: 14, cd: 1.3,  aggro: 34 },
  mor: { name: 'MORTAR',   cost: 60,  hp: 40,  dmg: 24, range: 56, speed: 12, cd: 2.4,  aggro: 60, splash: 12, minRange: 20, shot: '#f2d34a' },
  snp: { name: 'SNIPER',   cost: 70,  hp: 22,  dmg: 40, range: 64, speed: 16, cd: 2.6,  aggro: 70 },
  mch: { name: 'MECH',     cost: 90,  hp: 200, dmg: 22, range: 9,  speed: 12, cd: 1.0,  aggro: 30, splash: 8, armor: 2 },
  gnt: { name: 'GIANT',    cost: 150, hp: 400, dmg: 45, range: 10, speed: 9,  cd: 1.6,  aggro: 30, splash: 10, armor: 4 },
};

// Sprite grids. '.' is empty, 'T' is the team color, other letters index PAL.
export const SPR: Record<UnitKey, readonly string[]> = {
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
};

export const TYPES: Record<UnitKey, UnitDef> = Object.fromEntries(
  (Object.keys(DEFS) as UnitKey[]).map((k) => {
    const n = SPR[k].length;
    return [k, { ...DEFS[k], sz: n, r: n / 2 - 1 }];
  }),
) as Record<UnitKey, UnitDef>;

/** Build strip order, same as the prototype's object key order. */
export const ORDER: readonly UnitKey[] = Object.keys(DEFS) as UnitKey[];

export function isUnitKey(k: string): k is UnitKey {
  return Object.prototype.hasOwnProperty.call(DEFS, k);
}
