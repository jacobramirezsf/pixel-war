// Settings and stats screens.

import { setPalette } from '../../data/teams.ts';
import { DIFF } from '../../data/difficulty.ts';
import { clearAtlas } from '../../render/atlas.ts';
import { synth } from '../../audio/synth.ts';
import { saveSettings, type App } from '../app.ts';
import { $, on } from '../dom.ts';
import { updateHints } from '../hud/hint.ts';
import { loadStats } from '../stats.ts';

const ov = (): HTMLElement => $('ov');

export function applySettings(app: App): void {
  const s = app.settings;
  synth.setVolume(s.volume, s.muted);
  setPalette(s.colorblind);
  clearAtlas();
  updateHints(app);
  saveSettings(app);
}

export function showSettings(app: App, back: () => void): void {
  const s = app.settings;
  const tog = (id: string, label: string, on: boolean, note: string): string => '<button class="pick" id="' + id + '">' + label + '<span>' + (on ? 'ON' : 'OFF') + ' · ' + note + '</span></button>';
  ov().innerHTML = '<div><h2>SETTINGS</h2>'
    + '<p>Volume</p><input id="sVol" type="range" min="0" max="100" value="' + Math.round(s.volume * 100) + '">'
    + tog('sMute', 'SOUND', !s.muted, 'mute toggle')
    + tog('sDmg', 'DAMAGE NUMBERS', s.damageNumbers, 'show hits as numbers')
    + tog('sEdge', 'EDGE PAN', s.edgePan, 'mouse at the edge scrolls')
    + tog('sHints', 'KEY HINTS', s.hints, 'desktop key panel')
    + tog('sCb', 'COLORBLIND PALETTE', s.colorblind, 'blue, orange, teal, yellow, magenta')
    + tog('sPause', 'AUTO PAUSE', s.autoPause, 'Conquest pauses on events (always on for touch)')
    + tog('sInst', 'INSTANT PRODUCTION', s.instant, 'units appear the moment you buy them (new games)')
    + '<button class="gold" id="sBack">BACK</button></div>';
  const re = (): void => { applySettings(app); showSettings(app, back); };
  on($('sVol'), 'input', () => { s.volume = +($('sVol') as HTMLInputElement).value / 100; synth.setVolume(s.volume, s.muted); saveSettings(app); });
  on($('sVol'), 'change', () => { synth.unlock(); synth.play('click'); });
  on($('sMute'), 'click', () => { s.muted = !s.muted; re(); });
  on($('sDmg'), 'click', () => { s.damageNumbers = !s.damageNumbers; re(); });
  on($('sEdge'), 'click', () => { s.edgePan = !s.edgePan; re(); });
  on($('sHints'), 'click', () => { s.hints = !s.hints; re(); });
  on($('sCb'), 'click', () => { s.colorblind = !s.colorblind; re(); });
  on($('sPause'), 'click', () => { s.autoPause = !s.autoPause; re(); });
  on($('sInst'), 'click', () => { s.instant = !s.instant; re(); });
  on($('sBack'), 'click', back);
  ov().classList.remove('hide');
}

export function showHelp(back: () => void): void {
  ov().innerHTML = '<div><h2>HOW TO PLAY</h2>'
    + '<h3>PHONE</h3><p class="left">Drag the map to look around. Pinch to zoom. Tap a unit to select it, tap the ground to move, tap an enemy to attack. Tap SELECT to make dragging draw a box instead. Buy from the UNITS tab. Powers are in the POWERS tab: pick one, then tap where it should land. PAUSE and speed are at the top.</p>'
    + '<h3>LAPTOP AND DESKTOP</h3><p class="left">Scroll with two fingers to pan, pinch or Ctrl+scroll to zoom, or use the arrow keys. Left drag draws a selection box, right click moves or attacks, right drag pans. Number keys buy, Q W E R T G pick powers, Space pauses, [ and ] change speed, Esc cancels.</p>'
    + '<h3>CONQUEST</h3><p class="left">Found villages next to your land and hold them 30 seconds. Every unit costs gold per second. Keep regions connected to your capital and garrisoned, or unrest rises. LAND shows the territory overlay, LIST the regions and events. Truces are in the LIST panel.</p>'
    + '<button class="gold" id="hBack">BACK</button></div>';
  on($('hBack'), 'click', back);
  ov().classList.remove('hide');
}

export function showStats(app: App, back: () => void): void {
  const st = loadStats(app.storage);
  const rows: string[] = [];
  const modeName: Record<string, string> = { skirmish: 'Skirmish', multi: 'Multi War', dom: 'Domination', rich: 'Unlimited Gold', conquest: 'Conquest' };
  for (const mode of Object.keys(st.byMode)) {
    for (const diff of Object.keys(st.byMode[mode])) {
      const d = st.byMode[mode][diff];
      rows.push('<button class="pick"><span style="text-align:left">' + (modeName[mode] ?? mode) + ' · ' + (DIFF[diff as keyof typeof DIFF]?.name ?? diff) + '</span><span>' + d.won + '/' + d.played + ' won · ' + Math.round((100 * d.won) / d.played) + '%' + (d.fastest != null ? ' · best ' + d.fastest + 's' : '') + '</span></button>');
    }
  }
  ov().innerHTML = '<div><h2>STATS</h2><p>' + st.games + ' games played.</p>' + (rows.length ? rows.join('') : '<p>Nothing yet. Play a match.</p>') + '<button class="gold" id="stBack">BACK</button></div>';
  on($('stBack'), 'click', back);
  ov().classList.remove('hide');
}
