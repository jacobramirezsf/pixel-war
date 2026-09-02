// Settings and stats screens.

import { setPalette } from '../../data/teams.ts';
import { DIFF } from '../../data/difficulty.ts';
import { clearAtlas } from '../../render/atlas.ts';
import { synth } from '../../audio/synth.ts';
import { issueAction, saveSettings, type App } from '../app.ts';
import { $, on } from '../dom.ts';
import { updateHints } from '../hud/hint.ts';
import { loadStats } from '../stats.ts';
import { CHEAT_TOGGLES } from '../cheats.ts';

const ov = (): HTMLElement => $('ov');

export function applySettings(app: App): void {
  const s = app.settings;
  synth.setVolume(s.volume, s.muted);
  setPalette(s.colorblind);
  clearAtlas();
  updateHints(app);
  saveSettings(app);
}

/** Push the cheat toggles into the running game as a command, so replays and saves carry them. */
export function applyCheats(app: App): void {
  if (app.world) issueAction(app, { type: 'cheats', payload: { ...app.settings.cheats } });
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
    + '<h3>CHEATS AND POWERS</h3><p class="blurb">For you alone, in any mode, including the game you are in. The AI plays fair. A cheated Realm saves like any other and is marked.</p>'
    + tog('cOn', 'ENABLE CHEATS', s.cheats.on, 'the CHEATS panel appears under MORE')
    + tog('pOn', 'ENABLE POWERS', s.powersOn, 'the POWERS tab')
    + (s.cheats.on ? '<div class="chips">' + CHEAT_TOGGLES.map(([k, label]) => '<button class="chip' + (s.cheats[k] ? ' on' : '') + '" data-cheat="' + k + '">' + label + '</button>').join('') + '</div>' : '')
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
  const cheat = (k: keyof typeof s.cheats): void => { s.cheats[k] = !s.cheats[k]; applyCheats(app); re(); };
  on($('cOn'), 'click', () => cheat('on'));
  on($('pOn'), 'click', () => { s.powersOn = !s.powersOn; re(); });
  for (const b of ov().querySelectorAll<HTMLButtonElement>('button[data-cheat]')) on(b, 'click', () => cheat(b.dataset.cheat as keyof typeof s.cheats));
  on($('sBack'), 'click', back);
  ov().classList.remove('hide');
}

export function showHelp(back: () => void): void {
  ov().innerHTML = '<div><h2>HOW TO PLAY</h2>'
    + '<h3>PHONE</h3><p class="left">Drag the map to look around, pinch to zoom. Tap a unit to select it, tap the ground to move, tap an enemy to attack. When units are selected the action row appears: MOVE, ATTACK, GUARD, HOLD, and X to deselect. The bar along the bottom opens the shelves: ARMY trains units and holds groups, BUILD has town, military, defense, and ground work, POWERS casts on the map, KINGDOM lists your towns and rivals, WORLD has the map layers and WATCH. A green chip names whatever tool is armed; tap the chip to put it away.</p>'
    + '<h3>LAPTOP AND DESKTOP</h3><p class="left">Scroll with two fingers to pan, pinch or Ctrl+scroll to zoom, or use the arrow keys. Left drag draws a selection box, right click moves or attacks, right drag pans. Number keys buy, Q W E R T D and Z X V O P K J N U I pick powers, Space pauses, [ and ] change speed, Esc cancels.</p>'
    + '<h3>REALM</h3><p class="left">Found villages next to your land and hold them 30 seconds. Build houses for population, farms and markets for gold, a barracks, range, stable, siege works, and castle to train units, walls and towers to hold. Every unit costs gold per second. Keep regions connected to your capital and garrisoned, or unrest rises. Events arrive every few minutes; some ask a question. LAND shows the territory overlay, LIST the regions, events, and rivals. Three save slots; autosave every two minutes.</p>'
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
