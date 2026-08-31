import './style.css';
import { createStorage } from './platform/storage.ts';
import { drawEditor, drawWorld } from './render/scene.ts';
import { step } from './sim/step.ts';
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

let last = 0, overShown = false;
function loop(ts: number): void {
  // Variable timestep, clamped, as in the prototype. M1 moves to a fixed 1/60 tick.
  const dt = Math.min(0.05, (ts - last) / 1000 || 0);
  last = ts;
  const w = app.world;
  if (w) {
    if (app.running) step(w, dt);
    if (w.over && !overShown) { overShown = true; app.running = false; setTimeout(() => app.ui.endScreen(), 700); }
    if (!w.over) overShown = false;
    drawWorld(app.ctx, app.bg, w, app.drag);
  } else if (app.editor) {
    if (app.msgT > 0) app.msgT -= dt;
    drawEditor(app.ctx, app.bg, app.editor.map);
  }
  renderHud(app);
  requestAnimationFrame(loop);
}

loadMap(app, app.curMap);
updateUI(app);
showMenu(app);
requestAnimationFrame(loop);
