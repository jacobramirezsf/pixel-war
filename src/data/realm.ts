// Realm: world sizes and accomplishments. A Realm never ends on its own; these are the milestones it notices.

export type WorldSize = 'small' | 'standard' | 'large';

export const WORLD_SIZES: Record<WorldSize, { name: string; grid: number; text: string }> = {
  small:    { name: 'SMALL',    grid: 3, text: 'Nine regions. Neighbors close by.' },
  standard: { name: 'STANDARD', grid: 4, text: 'Sixteen regions. Room for a second town.' },
  large:    { name: 'LARGE',    grid: 5, text: 'Twenty-five wide regions. Long marches, several fronts.' },
};

export type FeatKey = 'kingdom' | 'greatCity' | 'empire' | 'conqueror' | 'greatPower' | 'survivor';

export const FEATS: Record<FeatKey, { name: string; text: string }> = {
  kingdom:    { name: 'KINGDOM',     text: 'Three settlements under one banner.' },
  greatCity:  { name: 'GREAT CITY',  text: 'A settlement has grown into a city.' },
  empire:     { name: 'EMPIRE',      text: 'Most of the world is yours.' },
  conqueror:  { name: 'CONQUEROR',   text: 'Every rival kingdom has fallen.' },
  greatPower: { name: 'GREAT POWER', text: 'A large army paid for by a strong economy.' },
  survivor:   { name: 'SURVIVOR',    text: 'Thirty days in the realm.' },
};

export const FEAT_KEYS = Object.keys(FEATS) as FeatKey[];

/** Thresholds behind the feats. */
export const FEAT_RULES = {
  kingdomTowns: 3,
  empireShare: 0.6,
  greatPowerArmy: 1500,
  greatPowerNet: 12,
  survivorDays: 30,
};

/** Seconds in a Realm day. */
export const DAY = 120;

/** What a settlement needs before it can grow to the next tier, beyond gold and materials. */
export interface GrowNeed {
  people: number;
  houses: number;
  /** Every one of these. */
  all: import('./buildings.ts').BldKey[];
  /** One of each group. */
  any: import('./buildings.ts').BldKey[][];
}

export const GROW: Partial<Record<import('../sim/types.ts').Tier, GrowNeed>> = {
  town: { people: 6, houses: 1, all: ['barracks'], any: [['farm', 'market']] },
  city: { people: 12, houses: 3, all: ['market', 'smith'], any: [['range', 'stable']] },
};
