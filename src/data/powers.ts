// Player powers. Each has a gold cost and a cooldown. They resolve inside the sim, so they
// replay and never depend on who pressed the button.

export type PowerKey = 'barrage' | 'smite' | 'heal' | 'haste' | 'freeze' | 'reinforce';

export interface PowerDef {
  key: PowerKey;
  name: string;
  cost: number;
  cd: number;
  /** Radius of effect in world pixels. */
  r: number;
  hint: string;
  /** Key on desktop. */
  hotkey: string;
}

export const POWERS: Record<PowerKey, PowerDef> = {
  barrage:   { key: 'barrage',   name: 'BARRAGE',   cost: 60, cd: 45, r: 22, hint: 'Shells land after a short delay. Hits everything there, walls too.', hotkey: 'Q' },
  smite:     { key: 'smite',     name: 'SMITE',     cost: 40, cd: 30, r: 10, hint: 'Lightning on the nearest enemy. Big single hit.', hotkey: 'W' },
  heal:      { key: 'heal',      name: 'HEAL',      cost: 40, cd: 40, r: 26, hint: 'Your units nearby regain health at once.', hotkey: 'E' },
  haste:     { key: 'haste',     name: 'HASTE',     cost: 35, cd: 40, r: 30, hint: 'Your units nearby move and strike faster for eight seconds.', hotkey: 'R' },
  freeze:    { key: 'freeze',    name: 'FREEZE',    cost: 45, cd: 45, r: 24, hint: 'Enemies nearby cannot move for three seconds.', hotkey: 'T' },
  reinforce: { key: 'reinforce', name: 'REINFORCE', cost: 70, cd: 60, r: 12, hint: 'Three line units appear where you point. Must be near your army or a settlement.', hotkey: 'G' },
};

export const POWER_KEYS: readonly PowerKey[] = ['barrage', 'smite', 'heal', 'haste', 'freeze', 'reinforce'];
