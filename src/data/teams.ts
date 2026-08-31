// Team colors and names. Index is the slot number.
const NORMAL = ['#3fa7ff', '#ff4d4d', '#43d17a', '#ffb02a', '#c86bff'];
/** Blue, orange, teal, yellow, magenta: distinct for the common color vision deficiencies. */
const COLORBLIND = ['#3f8dff', '#ff8c2a', '#2ad0c8', '#ffe14a', '#e05bd4'];
/** Team colors by slot. Swapped in place by setPalette so every reader sees the change. */
export const TEAM: string[] = NORMAL.slice();

export function setPalette(colorblind: boolean): void {
  const src = colorblind ? COLORBLIND : NORMAL;
  for (let i = 0; i < src.length; i++) TEAM[i] = src[i];
}
export const TNAME: readonly string[] = ['BLUE', 'RED', 'GREEN', 'ORANGE', 'VIOLET'];
export const MAX_SLOTS = 5;
