// Play statistics, kept through the storage adapter.

import { getJSON, setJSON, type Storage } from '../platform/storage.ts';

export interface ModeStats {
  played: number;
  won: number;
  /** Fastest win in sim seconds. */
  fastest: number | null;
}

export interface Stats {
  games: number;
  /** Keyed by mode, then difficulty. */
  byMode: Record<string, Record<string, ModeStats>>;
}

const KEY = 'stats';

export function loadStats(s: Storage): Stats {
  return getJSON<Stats>(s, KEY, { games: 0, byMode: {} });
}

export function recordGame(s: Storage, mode: string, diff: string, won: boolean, seconds: number): void {
  const st = loadStats(s);
  st.games++;
  const m = (st.byMode[mode] ??= {});
  const d = (m[diff] ??= { played: 0, won: 0, fastest: null });
  d.played++;
  if (won) { d.won++; if (d.fastest == null || seconds < d.fastest) d.fastest = Math.round(seconds); }
  setJSON(s, KEY, st);
}
