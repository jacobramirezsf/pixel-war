// Keyboard hint panel for desktop. Dismiss persists through settings.

import { saveSettings, type App } from '../app.ts';
import { $, on, show } from '../dom.ts';
import { HOTKEYS } from '../input/hotkeys.ts';

export function buildHints(app: App): void {
  const el = $('hints');
  el.innerHTML = '<div class="hhead">KEYS <button id="hClose" class="mini">HIDE</button></div>' + HOTKEYS.map(([k, v]) => '<div><b>' + k + '</b> ' + v + '</div>').join('');
  on($('hClose'), 'click', () => { app.settings.hints = false; saveSettings(app); updateHints(app); });
  updateHints(app);
}

export function updateHints(app: App): void {
  show($('hints'), app.layout === 'desktop' && app.settings.hints);
}
