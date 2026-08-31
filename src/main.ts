import './style.css';
import { createStorage } from './platform/storage.ts';
import { registerServiceWorker } from './platform/sw.ts';
import { updateCam } from './render/camera.ts';
import { drawMinimap } from './render/minimap.ts';
import { drawEditor, drawWorld } from './render/scene.ts';
import { step } from './sim/step.ts';
import { DT } from './sim/world.ts';
import { createApp, fit, loadMap } from './ui/app.ts';
import { startBench } from './ui/bench.ts';
import { $ } from './ui/dom.ts';
import { wireCommands } from './ui/hud/commands.ts';
import { buildHints, updateHints } from './ui/hud/hint.ts';
import { buildStrips, renderHud, updateUI, wireViewButtons } from './ui/hud/hud.ts';
import { attachInput } from './ui/input/index.ts';
import { edgePan } from './ui/input/mouse.ts';
import { wireHotkeys } from './ui/input/hotkeys.ts';
import { applyLayout, detectLayout } from './ui/layout.ts';
import { wireEditor } from './ui/menus/editor.ts';
import { endScreen, showMenu } from './ui/menus/menu.ts';

registerServiceWorker();
const app = createApp(createStorage());
app.ui = { updateUI: () => updateUI(app), showMenu: () => showMenu(app), endScreen: () => endScreen(app) };

applyLayout(app.layout);
buildStrips(app);
buildHints(app);
wireCommands(app);
wireViewButtons(app);
wireEditor(app);
attachInput(app);
wireHotkeys(app);

function relayout(): void {
  const mode = detectLayout();
  if (mode !== app.layout) { app.layout = mode; applyLayout(mode); updateHints(app); }
  fit(app);
}
window.addEventListener('resize', relayout);
if (window.visualViewport) window.visualViewport.addEventListener('resize', relayout);
const MINI = (): number => (app.layout === 'desktop' ? 160 : 72);

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
    updateCam(app.cam, frame);
    edgePan(app, frame);
    drawWorld(app.ctx, app.bg, w, { drag: app.drag, alpha: app.running && !app.paused ? acc / DT : 1, selection: app.selection, paused: app.paused, viewer: app.ctl, hover: app.hover, cam: app.cam, dpr: app.dpr });
    drawMinimap($<HTMLCanvasElement>('mini'), app.minimap, w.map, w, app.cam, MINI(), app.dpr);
  } else if (app.editor) {
    if (app.msgT > 0) app.msgT -= frame;
    updateCam(app.cam, frame);
    drawEditor(app.ctx, app.bg, app.editor.map, app.cam, app.dpr);
    drawMinimap($<HTMLCanvasElement>('mini'), app.minimap, app.editor.map, null, app.cam, MINI(), app.dpr);
  }
  renderHud(app);
  requestAnimationFrame(loop);
}

loadMap(app, app.curMap);
updateUI(app);
showMenu(app);
requestAnimationFrame(loop);

// ?bench starts a five-way brawl with 300 units and prints frame times to the message line.
if (new URLSearchParams(location.search).has('bench')) startBench(app);
