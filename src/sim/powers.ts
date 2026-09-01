// Powers resolve here. Costs, cooldowns, and effects are deterministic sim state.

import { METEOR_DELAY, NUKE_DELAY, POWERS, ZONE_TIME, type PowerKey } from '../data/powers.ts';
import { roster, TYPES } from '../data/units.ts';
import { TEAM } from '../data/teams.ts';
import { passableFor } from './buildings.ts';
import { damage, explode } from './combat.ts';
import type { Unit, World } from './types.ts';
import { maxHp, mkUnit } from './units.ts';
import { allied, cheat, count } from './world.ts';
import { removeBld } from './buildings.ts';
import { setTruce } from './conquest.ts';

/** Null when the power went off, otherwise why it did not. */
export function castPower(w: World, slot: number, key: PowerKey, x: number, y: number, ids: number[] = []): string | null {
  const P = POWERS[key], s = w.slots[slot];
  if (P.group === 'chaos' && !(slot === 0 && w.cheats.on)) return 'Chaos powers need cheats on';
  if (P.realm && w.mode !== 'conquest') return P.name + ' is a Realm power';
  if ((s.powerCd[key] ?? 0) > 0 && !cheat(w, slot, 'powers')) return P.name + ' is recharging (' + Math.ceil(s.powerCd[key]!) + 's)';
  const free = w.mode === 'sand' || !Number.isFinite(s.gold) || cheat(w, slot, 'gold');
  if (!free && s.gold < P.cost) return 'Need ' + P.cost + ' gold';
  // Powers are rare and may fire between ticks, when the spatial grid is stale. Scan directly.
  const near = (r: number, ok: (u: Unit) => boolean): Unit[] => w.units.filter((u) => u.hp > 0 && Math.hypot(u.x - x, u.y - y) <= r && ok(u));
  switch (key) {
    case 'barrage':
      w.strikes.push({ team: slot, x, y, r: P.r, dmg: 45, t: 1.4 });
      w.fx.push({ k: 'mark', x, y, r: P.r, t: 1.4, c: TEAM[slot] });
      break;
    case 'smite': {
      const foes = near(P.r + 6, (u) => !allied(w, u.team, slot));
      if (!foes.length) return 'No enemy there';
      let best = foes[0], bd = Infinity;
      for (const u of foes) { const d = Math.hypot(u.x - x, u.y - y); if (d < bd) { bd = d; best = u; } }
      w.fx.push({ k: 'bolt', x: best.x, y: best.y, t: 0.35 });
      damage(w, best, 90, true);
      break;
    }
    case 'heal': {
      const own = near(P.r, (u) => u.team === slot);
      if (!own.length) return 'None of your units there';
      for (const u of own) { u.hp = Math.min(maxHp(u), u.hp + 40); w.fx.push({ k: 'heal', x: u.x, y: u.y - 7, t: 0.4 }); }
      break;
    }
    case 'haste': {
      const own = near(P.r, (u) => u.team === slot);
      if (!own.length) return 'None of your units there';
      for (const u of own) u.hasteT = 8;
      w.fx.push({ k: 'mark', x, y, r: P.r, t: 0.5, c: '#f2d34a' });
      break;
    }
    case 'freeze': {
      const foes = near(P.r, (u) => !allied(w, u.team, slot));
      if (!foes.length) return 'No enemy there';
      for (const u of foes) { u.rootT = Math.max(u.rootT, 3); u.slowT = Math.max(u.slowT, 5); }
      w.fx.push({ k: 'mark', x, y, r: P.r, t: 0.6, c: '#67e8f9' });
      break;
    }
    case 'reinforce': {
      let ok = false;
      for (const b of s.settlements) if (b.hp > 0 && Math.hypot(b.x - x, b.y - y) < 70) ok = true;
      if (!ok) for (const u of w.units) if (u.team === slot && u.hp > 0 && Math.hypot(u.x - x, u.y - y) <= 40) { ok = true; break; }
      if (!ok) return 'Too far from your army or settlements';
      if (count(w, slot) + 3 > w.cap) return 'Army cap reached';
      const line = roster(s.race).filter((k) => TYPES[k].role === 'line' && TYPES[k].cost <= 30);
      const k = line[0] ?? roster(s.race)[1];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2, ux = x + Math.cos(a) * 7, uy = y + Math.sin(a) * 7;
        if (passableFor(w, slot, ux, uy)) { const u = mkUnit(w, slot, k, ux, uy); u.order = { type: 'attack', tgt: null }; w.units.push(u); }
      }
      w.fx.push({ k: 'mark', x, y, r: P.r, t: 0.5, c: TEAM[slot] });
      break;
    }
    case 'lightning': {
      const foes = near(P.r + 6, (u) => !allied(w, u.team, slot));
      if (!foes.length) return 'No enemy there';
      foes.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
      let prev = { x, y };
      for (const u of foes.slice(0, 5)) {
        w.fx.push({ k: 'shot', x1: prev.x, y1: prev.y - 6, x2: u.x, y2: u.y - 2, t: 0.2, c: '#dde2ec' });
        w.fx.push({ k: 'bolt', x: u.x, y: u.y, t: 0.3 });
        damage(w, u, 60, true);
        prev = u;
      }
      break;
    }
    case 'meteor':
      w.strikes.push({ team: slot, x, y, r: P.r, dmg: 150, t: METEOR_DELAY, kind: 'meteor' });
      w.fx.push({ k: 'mark', x, y, r: P.r, t: METEOR_DELAY, c: '#ff8c2a' });
      break;
    case 'quake': {
      // Buildings take the brunt, units a shove.
      w.fx.push({ k: 'boom', x, y, r: P.r, t: 0.3 });
      for (const b of w.blds.slice()) if (!allied(w, b.team, slot) && b.hp > 0 && Math.hypot(b.x - x, b.y - y) <= P.r) damage(w, b, 260, true);
      for (let i = 0; i < w.nP; i++) if (!allied(w, i, slot)) for (const b of w.slots[i].settlements) if (b.hp > 0 && Math.hypot(b.x - x, b.y - y) <= P.r) damage(w, b, 120, true);
      for (const u of near(P.r, (u) => !allied(w, u.team, slot))) { damage(w, u, 15, true); u.slowT = Math.max(u.slowT, 2); }
      break;
    }
    case 'fortify': {
      const own = near(P.r, (u) => u.team === slot);
      const bld = w.blds.some((b) => b.team === slot && Math.hypot(b.x - x, b.y - y) <= P.r);
      if (!own.length && !bld) return 'Nothing of yours there';
      w.zones.push({ kind: 'fortify', team: slot, x, y, r: P.r, t: ZONE_TIME.fortify });
      w.fx.push({ k: 'mark', x, y, r: P.r, t: 0.6, c: '#9aa0ae' });
      break;
    }
    case 'teleport': {
      const us = w.units.filter((u) => u.team === slot && u.hp > 0 && ids.includes(u.id)).slice(0, 12);
      if (!us.length) return 'Select your units first';
      let placed = 0;
      us.forEach((u, i) => {
        // Spiral out from the point until the ground is clear. Never into water, rock, or a building.
        for (let k = 0; k < 40; k++) {
          const a = (i + k) * 2.4, r = 3 + Math.sqrt(i + k) * 4;
          const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
          if (passableFor(w, slot, px, py)) { w.fx.push({ k: 'mark', x: u.x, y: u.y, r: 5, t: 0.4, c: '#b06cff' }); u.x = px; u.y = py; u.ox = px; u.oy = py; u.order = null; placed++; break; }
        }
      });
      if (!placed) return 'No room there';
      w.fx.push({ k: 'boom', x, y, r: 10, t: 0.25 });
      break;
    }
    case 'banish': {
      const foes = near(P.r + 6, (u) => !allied(w, u.team, slot));
      if (!foes.length) return 'No enemy unit there';
      let best = foes[0], bd = Infinity;
      for (const u of foes) { const d = Math.hypot(u.x - x, u.y - y); if (d < bd) { bd = d; best = u; } }
      w.fx.push({ k: 'bolt', x: best.x, y: best.y, t: 0.35 });
      damage(w, best, 9999, true);
      break;
    }
    case 'summon': {
      let ok = false;
      for (const b of s.settlements) if (b.hp > 0 && Math.hypot(b.x - x, b.y - y) < 70) ok = true;
      if (!ok) for (const u of w.units) if (u.team === slot && u.hp > 0 && Math.hypot(u.x - x, u.y - y) <= 40) { ok = true; break; }
      if (!ok) return 'Too far from your army or settlements';
      const elite = roster(s.race).filter((k) => TYPES[k].cost >= 60 && !TYPES[k].repair && TYPES[k].role !== 'civ').sort((a, b) => TYPES[b].cost - TYPES[a].cost).slice(0, 3);
      elite.forEach((k, i) => {
        const a = (i / 3) * Math.PI * 2, ux = x + Math.cos(a) * 9, uy = y + Math.sin(a) * 9;
        if (passableFor(w, slot, ux, uy)) { const u = mkUnit(w, slot, k, ux, uy); w.units.push(u); w.fx.push({ k: 'bolt', x: ux, y: uy, t: 0.3 }); }
      });
      break;
    }
    case 'rebuild': {
      let n = 0;
      for (const b of w.blds) if (b.team === slot && b.hp > 0 && b.buildT <= 0 && b.hp < b.max && Math.hypot(b.x - x, b.y - y) <= P.r) { b.hp = b.max; n++; w.fx.push({ k: 'fix', x: b.x, y: b.y - 4, t: 0.4 }); }
      for (const b of s.settlements) if (b.hp > 0 && b.hp < b.max && Math.hypot(b.x - x, b.y - y) <= P.r) { b.hp = b.max; n++; }
      if (!n) return 'Nothing damaged there';
      break;
    }
    case 'sanctuary': {
      const town = s.settlements.some((b) => b.hp > 0 && Math.hypot(b.x - x, b.y - y) <= P.r);
      if (!town) return 'Aim it at one of your towns';
      w.zones.push({ kind: 'sanctuary', team: slot, x, y, r: P.r, t: ZONE_TIME.sanctuary });
      w.fx.push({ k: 'mark', x, y, r: P.r, t: 0.8, c: '#7dff7d' });
      break;
    }
    case 'golden': {
      const town = s.settlements.some((b) => b.hp > 0 && Math.hypot(b.x - x, b.y - y) <= P.r);
      if (!town) return 'Aim it at one of your towns';
      w.zones.push({ kind: 'golden', team: slot, x, y, r: P.r, t: ZONE_TIME.golden });
      w.fx.push({ k: 'mark', x, y, r: P.r, t: 0.8, c: '#f2d34a' });
      break;
    }
    case 'nuke':
      w.strikes.push({ team: slot, x, y, r: P.r, dmg: 9999, t: NUKE_DELAY, kind: 'nuke' });
      w.fx.push({ k: 'mark', x, y, r: P.r, t: NUKE_DELAY, c: '#ff6b6b' });
      break;
    case 'invasion': {
      // The strongest rival's army, or bandits when there is no one else.
      let team = -1, best = -1;
      for (let i = 0; i < w.nP; i++) { if (allied(w, i, slot) || !w.slots[i].alive) continue; const v = w.slots[i].settlements.length + (w.slots[i].neutral ? 0 : 1); if (v > best) { best = v; team = i; } }
      if (team < 0) return 'No enemy to invade with';
      const list = roster(w.slots[team].race).filter((k) => !TYPES[k].repair && TYPES[k].role !== 'civ' && TYPES[k].role !== 'scout');
      for (let i = 0; i < 24; i++) {
        const a = i * 2.4, r = 4 + Math.sqrt(i) * 6, ux = x + Math.cos(a) * r, uy = y + Math.sin(a) * r;
        if (!passableFor(w, team, ux, uy)) continue;
        const u = mkUnit(w, team, list[i % list.length], ux, uy);
        u.order = { type: 'attack', tgt: null };
        w.units.push(u);
      }
      w.fx.push({ k: 'boom', x, y, r: P.r, t: 0.3 });
      break;
    }
    case 'peace':
      for (let i = 0; i < w.nP; i++) if (i !== slot && !w.slots[i].neutral && !w.slots[slot].truce[i]) setTruce(w, slot, i, true);
      break;
    case 'totalwar':
      for (let i = 0; i < w.nP; i++) for (let j = i + 1; j < w.nP; j++) if (!w.slots[i].neutral && !w.slots[j].neutral && w.slots[i].truce[j]) setTruce(w, i, j, false);
      break;
  }
  if (!free) s.gold -= P.cost;
  s.powerCd[key] = cheat(w, slot, 'powers') ? 0 : P.cd;
  return null;
}

/** Cooldowns tick down, barrages land. */
export function powersTick(w: World, dt: number): void {
  for (const s of w.slots) for (const k of Object.keys(s.powerCd) as PowerKey[]) { const v = s.powerCd[k]!; if (v > 0) s.powerCd[k] = Math.max(0, v - dt); }
  if (!w.strikes.length) return;
  const rest: typeof w.strikes = [];
  for (const k of w.strikes) {
    k.t -= dt;
    if (k.t > 0) { rest.push(k); continue; }
    // A barrage hits everyone in the circle, including the caster's own units. Aim well.
    const shooter = { ent: 'unit', team: k.team } as unknown as Unit;
    w.fx.push({ k: 'boom', x: k.x, y: k.y, r: k.r, t: k.kind === 'nuke' ? 0.6 : k.kind === 'meteor' ? 0.4 : 0.25 });
    explode(w, shooter, k.x, k.y, k.r, k.dmg, null, true);
    for (const u of w.units) if (u.hp > 0 && allied(w, u.team, k.team) && Math.hypot(u.x - k.x, u.y - k.y) <= k.r) damage(w, u, k.kind ? k.dmg : Math.round(k.dmg * 0.6), true);
    if (k.kind === 'nuke') {
      // Buildings and settlements in the circle go too, friend or foe.
      for (const b of w.blds.slice()) if (b.hp > 0 && Math.hypot(b.x - k.x, b.y - k.y) <= k.r) removeBld(w, b);
      for (const sl of w.slots) for (const b of sl.settlements) if (b.hp > 0 && Math.hypot(b.x - k.x, b.y - k.y) <= k.r) damage(w, b, 9999, true);
    }
  }
  w.strikes = rest;
}

/** Zone buffs run down. */
export function zonesTick(w: World, dt: number): void {
  if (!w.zones.length) return;
  for (const z of w.zones) z.t -= dt;
  w.zones = w.zones.filter((z) => z.t > 0);
}
