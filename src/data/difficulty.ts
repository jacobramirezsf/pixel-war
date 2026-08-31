import type { BldKey } from './buildings.ts';

export type DiffKey = 'easy' | 'std' | 'hard' | 'ext';

export interface DiffDef {
  name: string;
  /** AI income multiplier. */
  inc: number;
  /** Chance per wave that the AI buys a tower. */
  twrC: number;
  /** Whether the AI buys workers. */
  wrk: boolean;
  /** Seconds between waves at the start. */
  wave: number;
  wall: BldKey;
  twr: BldKey;
  /** Whether the AI fort gets an extra turret. */
  extra: boolean;
}

export const DIFF: Record<DiffKey, DiffDef> = {
  easy: { name: 'EASY',     inc: 0.65, twrC: 0,    wrk: false, wave: 28, wall: 'stk', twr: 'twr', extra: false },
  std:  { name: 'STANDARD', inc: 1.0,  twrC: 0.35, wrk: true,  wave: 24, wall: 'stk', twr: 'twr', extra: false },
  hard: { name: 'HARD',     inc: 1.35, twrC: 0.5,  wrk: true,  wave: 19, wall: 'wal', twr: 'stt', extra: false },
  ext:  { name: 'EXTREME',  inc: 1.8,  twrC: 0.65, wrk: true,  wave: 15, wall: 'stw', twr: 'stt', extra: true },
};

export const DIFF_KEYS: readonly DiffKey[] = ['easy', 'std', 'hard', 'ext'];
