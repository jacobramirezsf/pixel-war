// Settlement names by race. Curated pools, picked deterministically by region id.

import type { RaceKey } from './races.ts';

export const NAMES: Record<RaceKey, readonly string[]> = {
  kingdom: ['Ashford', 'Coldwater', 'Greyholm', 'Northam', 'Oakhurst', 'Westkeep', 'Riverford', 'Iron Hill', 'Kestrel', 'Larkspur', 'Thornby', 'Wendle', 'Saltmere', 'Fallow', 'Dunmere', 'Elsmoor'],
  horde:   ['Gorzak', 'Bloodfen', 'Skullmoor', 'Drakthar', 'Warmaw', 'Grimtusk', 'Redhowl', 'Ironjaw', 'Vulgar Hold', 'Black Fang', 'Ashtooth', 'Ruknar', 'Boarpit', 'Wolfmarch', 'Kragg', 'Hornfast'],
  undead:  ['Mourngate', 'Duskhollow', 'Gravemere', 'Pallor', 'Nightwell', 'Bonefield', 'Ashen Vale', 'Wraithmoor', 'Sallow', 'Coldbarrow', 'Rotwater', 'Shade Hill', 'Lament', 'Dolorous', 'Hushmere', 'Vesper'],
  forge:   ['Anvilheim', 'Brasswick', 'Steamhold', 'Ironvault', 'Gearford', 'Cinderhall', 'Boltmarch', 'Copperfall', 'Rivetstead', 'Furnace', 'Pistonrow', 'Slagmere', 'Tinsmith', 'Girder', 'Welding', 'Emberhold'],
  wild:    ['Thistledown', 'Fernhollow', 'Mossmere', 'Briarwood', 'Elderglen', 'Sunroot', 'Wildmarch', 'Hazelbrook', 'Foxglove', 'Dewfall', 'Heron Reach', 'Owlcroft', 'Rowan', 'Willowdeep', 'Greenmantle', 'Bramble'],
};

export const MAX_NAME = 14;

/** A clean settlement name: letters, spaces, apostrophes, and hyphens, capped. */
export function cleanName(s: string): string {
  return s.replace(/[^A-Za-z' -]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}
