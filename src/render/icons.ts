// Pixel icons for the HUD, drawn once onto small canvases. Same visual language as the sprites:
// flat fills on a 30x30 grid, no strokes except where a shape needs one.

export type UiIcon =
  | 'army' | 'build' | 'powers' | 'kingdom' | 'world' | 'more' | 'terrain' | 'map'
  | 'move' | 'attack' | 'guard' | 'hold' | 'retreat' | 'desel' | 'box' | 'all' | 'charge'
  | 'rally' | 'group' | 'watch' | 'save' | 'cheats' | 'remove' | 'events';

const INK = '#e6e6ee', DIM = '#8a8d9e', GOLD = '#f2d34a', GREEN = '#7dff7d', RED = '#ff6b6b', SKY = '#67e8f9';

export function drawUiIcon(c: CanvasRenderingContext2D, k: UiIcon): void {
  c.clearRect(0, 0, 30, 30);
  const f = (col: string, x: number, y: number, w: number, h: number): void => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  switch (k) {
    case 'army': // a helmet with a plume
      f(INK, 8, 12, 14, 8); f(INK, 10, 8, 10, 4); f('#141520', 11, 15, 3, 3); f('#141520', 17, 15, 3, 3);
      f(RED, 14, 3, 3, 6); f(INK, 8, 20, 3, 4); f(INK, 19, 20, 3, 4);
      break;
    case 'build': // a hammer
      f('#c9a46a', 13, 10, 4, 16); f(DIM, 7, 4, 16, 7); f(INK, 7, 4, 5, 7);
      break;
    case 'powers': // a bolt
      f(GOLD, 16, 3, 5, 9); f(GOLD, 11, 11, 9, 5); f(GOLD, 12, 16, 5, 10); f(SKY, 10, 26, 9, 2);
      break;
    case 'kingdom': // a keep with two towers
      f(DIM, 6, 12, 18, 13); f(DIM, 4, 8, 6, 17); f(DIM, 20, 8, 6, 17); f(DIM, 12, 8, 6, 6);
      f('#141520', 13, 18, 4, 7); f(GOLD, 4, 5, 2, 3); f(GOLD, 20, 5, 2, 3);
      break;
    case 'world': // land and water
      f(SKY, 4, 4, 22, 22); f(GREEN, 8, 6, 10, 8); f(GREEN, 14, 16, 9, 7); f(GREEN, 5, 18, 6, 5);
      break;
    case 'more':
      f(INK, 5, 13, 4, 4); f(INK, 13, 13, 4, 4); f(INK, 21, 13, 4, 4);
      break;
    case 'terrain': // a brush stroke
      f(GREEN, 4, 18, 10, 8); f('#c9a46a', 14, 12, 5, 7); f(DIM, 18, 4, 8, 9);
      break;
    case 'map': // a folded map
      f(INK, 4, 6, 22, 18); f(DIM, 11, 6, 2, 18); f(DIM, 18, 6, 2, 18); f(RED, 22, 9, 2, 2);
      break;
    case 'move': // arrow up-right
      f(GREEN, 8, 20, 4, 4); f(GREEN, 12, 16, 4, 4); f(GREEN, 16, 12, 4, 4); f(GREEN, 16, 6, 8, 4); f(GREEN, 20, 10, 4, 8);
      break;
    case 'attack': // crosshair
      f(RED, 13, 4, 4, 7); f(RED, 13, 19, 4, 7); f(RED, 4, 13, 7, 4); f(RED, 19, 13, 7, 4); f(RED, 13, 13, 4, 4);
      break;
    case 'guard': // shield
      f(SKY, 8, 5, 14, 12); f(SKY, 10, 17, 10, 4); f(SKY, 13, 21, 4, 4); f('#141520', 14, 8, 2, 8);
      break;
    case 'hold': // anchor block
      f(GOLD, 7, 7, 16, 16); f('#141520', 11, 11, 8, 8);
      break;
    case 'retreat': // arrow back to a base line
      f('#ffb02a', 18, 6, 4, 4); f('#ffb02a', 14, 10, 4, 4); f('#ffb02a', 10, 14, 4, 4); f('#ffb02a', 6, 20, 18, 4);
      break;
    case 'desel':
      f(INK, 7, 7, 4, 4); f(INK, 11, 11, 3, 3); f(INK, 13, 13, 4, 4); f(INK, 16, 16, 3, 3); f(INK, 19, 19, 4, 4);
      f(INK, 19, 7, 4, 4); f(INK, 16, 11, 3, 3); f(INK, 11, 16, 3, 3); f(INK, 7, 19, 4, 4);
      break;
    case 'box': // dashed selection box
      for (let i = 0; i < 4; i++) { f(GREEN, 5 + i * 6, 5, 4, 2); f(GREEN, 5 + i * 6, 23, 4, 2); f(GREEN, 5, 5 + i * 6, 2, 4); f(GREEN, 23, 5 + i * 6, 2, 4); }
      break;
    case 'all': // three units
      f(INK, 5, 10, 6, 9); f(INK, 12, 8, 6, 11); f(INK, 19, 10, 6, 9); f('#141520', 7, 13, 2, 2); f('#141520', 14, 11, 2, 2); f('#141520', 21, 13, 2, 2);
      break;
    case 'charge': // double arrow
      f(RED, 5, 8, 4, 14); f(RED, 9, 11, 3, 8); f(RED, 12, 13, 3, 4); f(RED, 16, 8, 4, 14); f(RED, 20, 11, 3, 8); f(RED, 23, 13, 3, 4);
      break;
    case 'rally': // flag
      f('#c9a46a', 9, 5, 3, 21); f(GOLD, 12, 5, 12, 8);
      break;
    case 'group':
      f(GREEN, 5, 5, 9, 9); f(GREEN, 16, 5, 9, 9); f(GREEN, 5, 16, 9, 9); f(GOLD, 16, 16, 9, 9);
      break;
    case 'watch': // an eye
      f(INK, 8, 11, 14, 8); f(INK, 6, 13, 18, 4); f(SKY, 13, 12, 5, 6); f('#141520', 14, 14, 2, 2);
      break;
    case 'save':
      f(DIM, 5, 5, 20, 20); f(INK, 9, 5, 12, 8); f('#141520', 15, 6, 4, 6); f(INK, 8, 16, 14, 9);
      break;
    case 'cheats': // a star
      f(GOLD, 13, 4, 4, 8); f(GOLD, 5, 11, 20, 4); f(GOLD, 9, 15, 4, 8); f(GOLD, 17, 15, 4, 8); f(GOLD, 12, 14, 6, 4);
      break;
    case 'remove':
      f(RED, 6, 6, 5, 5); f(RED, 10, 10, 4, 4); f(RED, 13, 13, 4, 4); f(RED, 16, 16, 4, 4); f(RED, 19, 19, 5, 5);
      f(RED, 19, 6, 5, 5); f(RED, 16, 10, 4, 4); f(RED, 10, 16, 4, 4); f(RED, 6, 19, 5, 5);
      break;
    case 'events': // a bell
      f(GOLD, 11, 6, 8, 4); f(GOLD, 9, 10, 12, 8); f(GOLD, 7, 18, 16, 3); f(INK, 13, 22, 4, 3);
      break;
  }
}

/** A 30x30 canvas with the icon on it, ready to append to a button. */
export function iconCanvas(k: UiIcon): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 30; c.height = 30;
  drawUiIcon(c.getContext('2d')!, k);
  return c;
}
