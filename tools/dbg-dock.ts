import { canBuild } from '../src/sim/buildings.ts';
import { newGame } from '../src/sim/game.ts';
const w = newGame({} as never, 'conquest', { seed: 5, rivals: 2, size: 'large' });
w.cheats.on = true; w.cheats.territory = true; w.cheats.allAges = true;
w.slots[0].gold = 1e6; w.slots[0].mat = 1e6;
const reasons = new Map<string, number>();
let ok = 0, shoreTiles = 0;
for (let ty = 0; ty < w.map.rows - 1; ty++) for (let tx = 0; tx < w.map.cols - 1; tx++) {
  // Land tile with water next to it: a shore candidate.
  const t = w.map.tiles[ty * w.map.cols + tx];
  if (t === 3) continue;
  const shore = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => { const x = tx+dx, y = ty+dy; return x>=0&&y>=0&&x<w.map.cols&&y<w.map.rows&&w.map.tiles[y*w.map.cols+x]===3; });
  if (!shore) continue;
  shoreTiles++;
  const why = canBuild(w, tx, ty, 0, 'dock');
  if (!why) ok++;
  else reasons.set(why, (reasons.get(why) ?? 0) + 1);
}
console.log('shore tiles', shoreTiles, 'dock-placeable', ok);
console.log([...reasons.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8));
