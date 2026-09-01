// The Great Wonder: announced when begun, celebrated when finished, wanted by every rival.

import { TNAME } from '../data/teams.ts';
import { FEATS } from '../data/realm.ts';
import type { Building, World } from './types.ts';
import { chronicle, pushEvent, say } from './world.ts';

export const WONDER = {
  attitude: 30,
  calm: 40,
  /** Sight radius in tiles once finished. */
  vision: 14,
};

const regionOf = (w: World, b: Building): number => (w.regionOf ? w.regionOf[((b.y / 8) | 0) * w.map.cols + ((b.x / 8) | 0)] : -1);

export function wonderBegun(w: World, b: Building): void {
  if (b.type !== 'wonder') return;
  const who = b.team === 0 ? 'Your kingdom' : TNAME[b.team];
  say(w, who + ' has begun a great wonder', 4);
  pushEvent(w, 'built', who + ' began a great wonder', b.x, b.y, regionOf(w, b));
  chronicle(w, who + ' began a great wonder');
}

export function wonderDone(w: World, b: Building): void {
  if (b.type !== 'wonder') return;
  for (const s of w.slots) if (!s.neutral) s.attitude[b.team] = Math.min(100, (s.attitude[b.team] ?? 0) + WONDER.attitude);
  for (const r of w.regions) if (r.owner === b.team) r.unrest = Math.max(0, r.unrest - WONDER.calm);
  const who = b.team === 0 ? 'Your' : TNAME[b.team] + "'s";
  say(w, who + ' great wonder is finished', 4);
  pushEvent(w, b.team === 0 ? 'feat' : 'built', who + ' great wonder is finished', b.x, b.y, regionOf(w, b));
  chronicle(w, who + ' great wonder was finished');
  if (b.team === 0 && w.mode === 'conquest' && !w.feats.includes('wonder')) { w.feats.push('wonder'); say(w, FEATS.wonder.name + '. ' + FEATS.wonder.text, 4); }
}

/** An enemy wonder, finished or not, is the target worth marching for. */
export function enemyWonder(w: World, slot: number, allied: (w: World, a: number, b: number) => boolean): Building | null {
  for (const b of w.blds) if (b.type === 'wonder' && b.hp > 0 && !allied(w, b.team, slot)) return b;
  return null;
}
