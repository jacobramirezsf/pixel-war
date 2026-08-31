import { gen, islands } from '../sim/mapgen.ts';
import type { MapDef } from '../sim/map.ts';

export const BUILTIN: readonly MapDef[] = [
  gen({ name: 'Crossroads', cols: 20, rows: 28, seed: 11, road: true, tree: 0.5, rock: 0, water: 0, mines: [[2, 13], [17, 13]] }),
  gen({ name: 'Skirmish', cols: 15, rows: 20, seed: 5, road: false, tree: 0.35, rock: 0.5, water: 0, mines: [[7, 9]] }),
  gen({ name: 'Riverlands', cols: 20, rows: 28, seed: 23, road: true, tree: 0.4, rock: 0.5, water: 0, river: true, mines: [[3, 9], [16, 18]] }),
  gen({ name: 'Highlands', cols: 25, rows: 35, seed: 41, road: true, tree: 0.9, rock: 0.7, water: 0.5, mines: [[3, 9], [21, 9], [3, 25], [21, 25]] }),
  gen({ name: 'Arena', cols: 24, rows: 24, seed: 7, road: false, tree: 0.2, rock: 0.8, water: 0, mines: [[3, 11], [20, 11]] }),
  islands(),
  gen({ name: 'Frontier', cols: 30, rows: 42, seed: 77, road: true, tree: 0.7, rock: 0.6, water: 0.6, river: true, mines: [[3, 8], [26, 8], [3, 33], [26, 33], [8, 20], [21, 20]] }),
];

export function builtinByName(name: string): MapDef | undefined {
  return BUILTIN.find((m) => m.name.toLowerCase() === name.toLowerCase());
}

/** Editor size presets: label, cols, rows. */
export const SIZES: readonly [string, number, number][] = [['S', 15, 20], ['M', 20, 28], ['L', 25, 35], ['XL', 30, 42], ['SQ', 24, 24]];

export type EditorTool = 0 | 1 | 2 | 3 | 4 | 'mine' | 'b0' | 'b1';

export const TOOLS: readonly { k: EditorTool; name: string }[] = [
  { k: 0, name: 'GRASS' }, { k: 1, name: 'ROAD' }, { k: 2, name: 'TREE' }, { k: 3, name: 'WATER' }, { k: 4, name: 'ROCK' },
  { k: 'mine', name: 'MINE' }, { k: 'b0', name: 'BLUE BASE' }, { k: 'b1', name: 'RED BASE' },
];
