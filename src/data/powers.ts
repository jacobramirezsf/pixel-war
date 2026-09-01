// Player powers. Each has a gold cost and a cooldown. They resolve inside the sim, so they
// replay and never depend on who pressed the button. Battle powers turn a fight, realm powers
// help a town, chaos powers are toys that only exist with cheats on.

export type PowerKey = 'barrage' | 'smite' | 'heal' | 'haste' | 'freeze' | 'reinforce'
  | 'lightning' | 'meteor' | 'quake' | 'fortify' | 'teleport' | 'sanctuary' | 'golden' | 'rebuild' | 'summon' | 'banish'
  | 'nuke' | 'invasion' | 'peace' | 'totalwar';

export type PowerGroup = 'battle' | 'realm' | 'chaos';

export interface PowerDef {
  key: PowerKey;
  name: string;
  group: PowerGroup;
  cost: number;
  cd: number;
  /** Radius of effect in world pixels. Drawn as the preview circle. */
  r: number;
  hint: string;
  /** Key on desktop. */
  hotkey: string;
  /** Needs a selection of your own units. */
  selection?: boolean;
  /** Realm only. */
  realm?: boolean;
}

export const POWERS: Record<PowerKey, PowerDef> = {
  barrage:   { key: 'barrage',   name: 'BARRAGE',   group: 'battle', cost: 60,  cd: 45,  r: 22, hint: 'Shells land after a short delay. Hits everything there, walls too.', hotkey: 'Q' },
  smite:     { key: 'smite',     name: 'SMITE',     group: 'battle', cost: 40,  cd: 30,  r: 10, hint: 'Lightning on the nearest enemy. Big single hit.', hotkey: 'W' },
  heal:      { key: 'heal',      name: 'HEAL',      group: 'battle', cost: 40,  cd: 40,  r: 26, hint: 'Your units nearby regain health at once.', hotkey: 'E' },
  haste:     { key: 'haste',     name: 'HASTE',     group: 'battle', cost: 35,  cd: 40,  r: 30, hint: 'Your units nearby move and strike faster for eight seconds.', hotkey: 'R' },
  freeze:    { key: 'freeze',    name: 'FREEZE',    group: 'battle', cost: 45,  cd: 45,  r: 24, hint: 'Enemies nearby cannot move for three seconds.', hotkey: 'T' },
  reinforce: { key: 'reinforce', name: 'REINFORCE', group: 'battle', cost: 70,  cd: 60,  r: 12, hint: 'Three line units appear where you point. Must be near your army or a settlement.', hotkey: 'D' },
  lightning: { key: 'lightning', name: 'LIGHTNING', group: 'battle', cost: 50,  cd: 35,  r: 14, hint: 'A bolt on the nearest enemy that leaps to four more. Best on a crowd.', hotkey: 'Z' },
  meteor:    { key: 'meteor',    name: 'METEOR',    group: 'battle', cost: 120, cd: 90,  r: 30, hint: 'A warning circle, three seconds, then the sky falls. Units and buildings alike.', hotkey: 'X' },
  quake:     { key: 'quake',     name: 'QUAKE',     group: 'battle', cost: 90,  cd: 75,  r: 34, hint: 'The ground shakes. Stone walls and towers fall, steel bends, units stagger.', hotkey: 'V' },
  fortify:   { key: 'fortify',   name: 'FORTIFY',   group: 'battle', cost: 60,  cd: 60,  r: 32, hint: 'Your units and buildings there take less damage for fifteen seconds.', hotkey: 'O' },
  teleport:  { key: 'teleport',  name: 'TELEPORT',  group: 'battle', cost: 80,  cd: 60,  r: 16, hint: 'Select up to twelve of your units, then tap where they should be.', hotkey: 'P', selection: true },
  banish:    { key: 'banish',    name: 'BANISH',    group: 'battle', cost: 90,  cd: 60,  r: 10, hint: 'The nearest enemy unit is gone. Not buildings.', hotkey: 'K' },
  summon:    { key: 'summon',    name: 'SUMMON',    group: 'battle', cost: 150, cd: 90,  r: 14, hint: 'Three of your finest appear where you point. Near your army or a settlement.', hotkey: 'J' },
  rebuild:   { key: 'rebuild',   name: 'REBUILD',   group: 'realm',  cost: 60,  cd: 50,  r: 26, hint: 'Damaged buildings, walls, and towers there are made whole. Rubble stays rubble.', hotkey: 'N' },
  sanctuary: { key: 'sanctuary', name: 'SANCTUARY', group: 'realm',  cost: 50,  cd: 70,  r: 40, hint: 'For twenty seconds villagers there cannot be harmed and stay at work; your units stand firmer.', hotkey: 'U', realm: true },
  golden:    { key: 'golden',    name: 'GOLDEN AGE', group: 'realm', cost: 100, cd: 120, r: 60, hint: 'A town there earns double, grows faster, and builds faster for forty seconds.', hotkey: 'I', realm: true },
  nuke:      { key: 'nuke',      name: 'NUKE',      group: 'chaos',  cost: 0,   cd: 20,  r: 60, hint: 'Everything in the circle, gone. A warning, then the flash.', hotkey: '' },
  invasion:  { key: 'invasion',  name: 'INVASION',  group: 'chaos',  cost: 0,   cd: 20,  r: 30, hint: 'A huge hostile army appears where you point.', hotkey: '' },
  peace:     { key: 'peace',     name: 'PEACE',     group: 'chaos',  cost: 0,   cd: 5,   r: 0,  hint: 'Every war you are in ends.', hotkey: '', realm: true },
  totalwar:  { key: 'totalwar',  name: 'TOTAL WAR', group: 'chaos',  cost: 0,   cd: 5,   r: 0,  hint: 'Everyone at war with everyone.', hotkey: '', realm: true },
};

export const POWER_KEYS: readonly PowerKey[] = Object.keys(POWERS) as PowerKey[];
export const BATTLE_POWERS: readonly PowerKey[] = POWER_KEYS.filter((k) => POWERS[k].group === 'battle');
export const REALM_POWERS: readonly PowerKey[] = POWER_KEYS.filter((k) => POWERS[k].group === 'realm');
export const CHAOS_POWERS: readonly PowerKey[] = POWER_KEYS.filter((k) => POWERS[k].group === 'chaos');

/** Zone buffs left behind by powers, in seconds. */
export const ZONE_TIME = { fortify: 15, sanctuary: 20, golden: 40 };
export const METEOR_DELAY = 3;
export const NUKE_DELAY = 2;
