// Five playable races. Each has a variant of the shared archetypes plus four specials
// whose mechanics appear in no other race.

export type RaceKey = 'kingdom' | 'horde' | 'undead' | 'forge' | 'wild';

export interface RaceDef {
  key: RaceKey;
  name: string;
  blurb: string;
  /** Multipliers applied to archetype stats. */
  mods: { hp: number; dmg: number; speed: number; range: number; cost: number; cd: number; aggro: number; armor: number };
  /** Shared archetype this race does without. Its four specials fill the slot. */
  omit: string;
  /** Sprite recolor: source palette letter to race letter. */
  recolor: Record<string, string>;
  /** Every unit of this race moves through trees at full speed. */
  woodland?: boolean;
}

export const RACES: Record<RaceKey, RaceDef> = {
  kingdom: {
    key: 'kingdom', name: 'KINGDOM', blurb: 'Steel and drill. Balanced numbers, the widest roster.',
    mods: { hp: 1, dmg: 1, speed: 1, range: 1, cost: 1, cd: 1, aggro: 1, armor: 0 }, omit: '', recolor: {},
  },
  horde: {
    key: 'horde', name: 'HORDE', blurb: 'Cheap, fast, and mean. Weak at range, strong up close.',
    mods: { hp: 1.15, dmg: 1.1, speed: 1.1, range: 0.9, cost: 0.9, cd: 1, aggro: 1.1, armor: -1 }, omit: 'snp', recolor: { S: 'K', B: 'X' },
  },
  undead: {
    key: 'undead', name: 'UNDEAD', blurb: 'Fragile and numerous. Bodies come back as skeletons.',
    mods: { hp: 0.85, dmg: 1, speed: 0.95, range: 1, cost: 0.8, cd: 1.1, aggro: 1, armor: 0 }, omit: 'med', recolor: { S: 'N', B: 'G', Y: 'P' },
  },
  forge: {
    key: 'forge', name: 'FORGE', blurb: 'Slow, armored, expensive machines with long guns.',
    mods: { hp: 1.25, dmg: 1, speed: 0.8, range: 1.1, cost: 1.2, cd: 1, aggro: 1, armor: 1 }, omit: 'brk', recolor: { S: 'M', B: 'I', W: 'C' },
  },
  wild: {
    key: 'wild', name: 'WILD', blurb: 'Quick woodland fighters. Trees do not slow them.',
    mods: { hp: 0.9, dmg: 1, speed: 1.2, range: 1, cost: 1, cd: 1, aggro: 1.15, armor: 0 }, omit: 'tnk', recolor: { B: 'L', Y: 'L' }, woodland: true,
  },
};

export const RACE_KEYS: readonly RaceKey[] = ['kingdom', 'horde', 'undead', 'forge', 'wild'];

export function isRaceKey(k: string): k is RaceKey {
  return Object.prototype.hasOwnProperty.call(RACES, k);
}
