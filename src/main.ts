import './style.css';
import { createStorage } from './platform/storage.ts';
import { drawEditor, drawWorld } from './render/scene.ts';
import { step } from './sim/step.ts';
import { DT } from './sim/world.ts';
import { createApp, fit, loadMap } from './ui/app.ts';
import { wireCommands } from './ui/hud/commands.ts';
import { buildStrips, renderHud, updateUI } from './ui/hud/hud.ts';
import { wireEditor } from './ui/menus/editor.ts';
import { endScreen, showMenu } from './ui/menus/menu.ts';
import { wirePointer } from './ui/input/pointer.ts';

const app = createApp(createStorage());
app.ui = { updateUI: () => updateUI(app), showMenu: () => showMenu(app), endScreen: () => endScreen(app) };

buildStrips(app);
wireCommands(app);
wireEditor(app);
wirePointer(app);
window.addEventListener('resize', () => fit(app));

let last = 0, acc = 0, overShown = false;
const MAX_STEPS = 5;
function loop(ts: number): void {
  // Fixed timestep: accumulate real time, step whole ticks, interpolate the remainder at render.
  const frame = Math.min(0.25, (ts - last) / 1000 || 0);
  last = ts;
  const w = app.world;
  if (w) {
    if (app.running && !app.paused) {
      acc += frame;
      let n = 0;
      while (acc >= DT && n < MAX_STEPS) { step(w); acc -= DT; n++; }
      if (n === MAX_STEPS) acc = 0;
    } else acc = 0;
    if (w.over && !overShown) { overShown = true; app.running = false; setTimeout(() => app.ui.endScreen(), 700); }
    if (!w.over) overShown = false;
    drawWorld(app.ctx, app.bg, w, { drag: app.drag, alpha: app.running && !app.paused ? acc / DT : 1, selection: app.selection, paused: app.paused });
  } else if (app.editor) {
    if (app.msgT > 0) app.msgT -= frame;
    drawEditor(app.ctx, app.bg, app.editor.map);
  }
  renderHud(app);
  requestAnimationFrame(loop);
}

loadMap(app, app.curMap);
updateUI(app);
showMenu(app);
requestAnimationFrame(loop);
