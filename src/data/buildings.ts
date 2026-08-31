// Building definitions. Numbers are unchanged from the prototype.

export type BldKey = 'brb' | 'stk' | 'wal' | 'stw' | 'gat' | 'twr' | 'stt' | 'trt';
export type BldKind = 'trap' | 'wall' | 'gate' | 'tower';

export interface BldDef {
  name: string;
  cost: number;
  hp: number;
  kind: BldKind;
  armor?: number;
  dmg?: number;
  range?: number;
  cd?: number;
}

export const BLD: Record<BldKey, BldDef> = {
  brb: { name: 'BARBED',     cost: 4,   hp: 40,  kind: 'trap' },
  stk: { name: 'STAKES',     cost: 6,   hp: 60,  kind: 'wall' },
  wal: { name: 'STONE WALL', cost: 15,  hp: 220, kind: 'wall', armor: 2 },
  stw: { name: 'STEEL WALL', cost: 30,  hp: 450, kind: 'wall', armor: 4 },
  gat: { name: 'GATE',       cost: 20,  hp: 220, kind: 'gate', armor: 2 },
  twr: { name: 'WOOD TWR',   cost: 40,  hp: 120, kind: 'tower', dmg: 6,  range: 30, cd: 0.8 },
  stt: { name: 'STONE TWR',  cost: 80,  hp: 260, kind: 'tower', dmg: 12, range: 38, cd: 0.9, armor: 2 },
  trt: { name: 'TURRET',     cost: 150, hp: 320, kind: 'tower', dmg: 9,  range: 44, cd: 0.25, armor: 3 },
};

/** Build strip order. */
export const BORDER: readonly BldKey[] = Object.keys(BLD) as BldKey[];

export function isBldKey(k: string): k is BldKey {
  return Object.prototype.hasOwnProperty.call(BLD, k);
}

/** Cap on buildings per team. */
export const BUILD_CAP = 60;
