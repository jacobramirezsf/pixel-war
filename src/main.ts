import './style.css';
import { createStorage } from './platform/storage.ts';
import { registerServiceWorker } from './platform/sw.ts';
import { updateCam } from './render/camera.ts';
import { drawMinimap } from './render/minimap.ts';
import { drawEditor, drawWorld } from './render/scene.ts';
import { buildBg } from './render/terrain.ts';
import { step } from './sim/step.ts';
import { DT } from './sim/world.ts';
import { createApp, fit, loadMap, issueAction, say } from './ui/app.ts';
import { startBench } from './ui/bench.ts';
import { autosaveTick, wireAutosave } from './ui/conquest.ts';
import { watchEvents } from './ui/territory.ts';
import { synth } from './audio/synth.ts';
import { POWERS } from './data/powers.ts';
import { applySettings } from './ui/menus/settings.ts';
import { soundTick, shakeTick } from './ui/feedback.ts';
import { $ } from './ui/dom.ts';
import { wireCommands } from './ui/hud/commands.ts';
import { buildHints, updateHints } from './ui/hud/hint.ts';
import { buildStrips, renderHud, updateUI, wireViewButtons } from './ui/hud/hud.ts';
import { attachInput } from './ui/input/index.ts';
import { edgePan } from './ui/input/mouse.ts';
import { keyPan, wireHotkeys } from './ui/input/hotkeys.ts';
import { placePreview } from './ui/input/actions.ts';
import { applyLayout, detectLayout } from './ui/layout.ts';
import { wireEditor } from './ui/menus/editor.ts';
import { endScreen, showMenu } from './ui/menus/menu.ts';

registerServiceWorker();
const app = createApp(createStorage());
// Handy in the console and for scripted checks.
(window as unknown as { pw: unknown }).pw = app;
// Scripted checks (tools/browser-shot.ts) issue actions through the same path as the HUD.
(window as unknown as { pwAct: (a: import('./sim/types.ts').Action) => boolean }).pwAct = (a) => issueAction(app, a);

app.ui = { updateUI: () => updateUI(app), showMenu: () => showMenu(app), endScreen: () => endScreen(app) };

applyLayout(app.layout);
applySettings(app);
for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, () => synth.unlock(), { passive: true });
buildStrips(app);
buildHints(app);
wireCommands(app);
wireViewButtons(app);
wireEditor(app);
attachInput(app);
wireHotkeys(app);
wireAutosave(app);

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
let frameErrors = 0;

/** A thrown frame must never end the game. Log it, keep the loop alive, and after a run of them pause with a note. */
function loop(ts: number): void {
  try { frame(ts); }
  catch (e) {
    frameErrors++;
    if (frameErrors === 1 || frameErrors % 300 === 0) console.error('frame error', e);
    if (frameErrors === 120 && app.world) { app.paused = true; say(app, 'Something went wrong drawing the game. Paused; your save is safe. Try MENU.', 5); }
  }
  requestAnimationFrame(loop);
}

function frame(ts: number): void {
  // Fixed timestep: accumulate real time, step whole ticks, interpolate the remainder at render.
  const frame = Math.min(0.25, (ts - last) / 1000 || 0);
  last = ts;
  const w = app.world;
  if (w) {
    if (app.running && !app.paused) {
      acc += frame * app.speed;
      let n = 0;
      const maxSteps = Math.ceil(MAX_STEPS * app.speed);
      while (acc >= DT && n < maxSteps) { step(w); acc -= DT; n++; }
      if (n === maxSteps) acc = 0;
      autosaveTick(app);
      watchEvents(app);
    } else acc = 0;
    if (w.over && !overShown) { overShown = true; app.running = false; setTimeout(() => app.ui.endScreen(), 700); }
    if (!w.over) overShown = false;
    if (w.mapDirty) { buildBg(w.map, app.bg); w.mapDirty = false; }
    keyPan(app, frame);
    updateCam(app.cam, frame);
    edgePan(app, frame);
    soundTick(app, w);
    const shake = shakeTick(app, w, frame);
    drawWorld(app.ctx, app.bg, w, { drag: app.drag, alpha: app.running && !app.paused ? Math.min(1, acc / DT) : 1, selection: app.selection, paused: app.paused, viewer: app.ctl, hover: app.hover, cam: app.cam, dpr: app.dpr, layers: app.layers, damageNumbers: app.settings.damageNumbers, shake, ghost: app.tool === 'power' && app.power != null && app.mouse ? { x: app.cam.x + app.mouse.x / app.cam.zoom, y: app.cam.y + app.mouse.y / app.cam.zoom, r: POWERS[app.power].r } : app.tool === 'cheat' && app.cheatTool?.r && app.mouse ? { x: app.cam.x + app.mouse.x / app.cam.zoom, y: app.cam.y + app.mouse.y / app.cam.zoom, r: app.cheatTool.r } : null, place: placePreview(app) });
    drawMinimap($<HTMLCanvasElement>('mini'), app.minimap, w.map, w, app.cam, MINI(), app.dpr, app.ctl);
  } else if (app.editor) {
    if (app.msgT > 0) app.msgT -= frame;
    keyPan(app, frame);
    updateCam(app.cam, frame);
    drawEditor(app.ctx, app.bg, app.editor.map, app.cam, app.dpr);
    drawMinimap($<HTMLCanvasElement>('mini'), app.minimap, app.editor.map, null, app.cam, MINI(), app.dpr);
  }
  renderHud(app);
  frameErrors = 0;
}

loadMap(app, app.curMap);
updateUI(app);
showMenu(app);
requestAnimationFrame(loop);

// ?bench starts a five-way brawl with 300 units and prints frame times to the message line.
if (new URLSearchParams(location.search).has('bench')) startBench(app);
