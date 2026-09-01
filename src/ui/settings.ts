// Player settings, kept through the storage adapter.

import { getJSON, setJSON, type Storage } from '../platform/storage.ts';

export interface Settings {
  edgePan: boolean;
  hints: boolean;
  damageNumbers: boolean;
  volume: number;
  muted: boolean;
  colorblind: boolean;
  /** Conquest pauses when something needs attention. Always on for touch layouts. */
  autoPause: boolean;
  /** Units finish the moment they are bought. */
  instant: boolean;
  cheats: import('../sim/types.ts').Cheats;
}

export const DEFAULT_SETTINGS: Settings = { edgePan: false, hints: true, damageNumbers: false, volume: 0.7, muted: false, colorblind: false, autoPause: true, instant: false, cheats: { gold: false, resources: false, instant: false, build: false, powers: false, reveal: false } };

export function loadSettings(s: Storage): Settings {
  const saved = getJSON<Partial<Settings>>(s, 'settings', {});
  return { ...DEFAULT_SETTINGS, ...saved, cheats: { ...DEFAULT_SETTINGS.cheats, ...(saved.cheats ?? {}) } };
}

export function saveSettings(s: Storage, v: Settings): void {
  setJSON(s, 'settings', v);
}
