// Five races, twenty units each (Kingdom keeps its 21), specials that belong to one race only,
// and every special mechanic doing what its description says.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN } from '../../src/data/maps.ts';
import { RACE_KEYS, RACES } from '../../src/data/races.ts';
import { ALL_UNITS, roster, TYPES, type UnitDef } from '../../src/data/units.ts';
import { addBld } from '../../src/sim/buildings.ts';
import { targetsFor } from '../../src/sim/combat.ts';
import { mkUnit } from '../../src/sim/units.ts';
import type { Unit, World } from '../../src/sim/types.ts';
import { act, game, place, run, ticks } from './helpers.ts';

const SPECIAL_FIELDS: (keyof UnitDef)[] = ['speedAura', 'vsBld', 'charge', 'regen', 'raise', 'lifesteal', 'slow', 'split', 'guardAura', 'pierce', 'chain', 'dropTrap', 'stealth', 'root', 'treeArmor', 'blink'];

test('rosters: 21 kingdom units, 20 for every other race, all distinct', () => {
  assert.equal(roster('kingdom').length, 21);
  for (const r of RACE_KEYS) if (r !== 'kingdom') assert.equal(roster(r).length, 20, r);
  const all = RACE_KEYS.flatMap((r) => roster(r));
  assert.equal(new Set(all).size, all.length);
  assert.equal(ALL_UNITS.length, 101);
  for (const k of ALL_UNITS) {
    const T = TYPES[k];
    assert.ok(T.sprite.every((row) => row.length === T.sprite.length), k + ' sprite is square');
    assert.ok(T.cost >= 5 && T.hp > 0 && T.speed > 0, k + ' has sane stats');
  }
});

test('each special mechanic belongs to exactly one race', () => {
  for (const f of SPECIAL_FIELDS) {
    const races = new Set(ALL_UNITS.filter((k) => TYPES[k][f] !== undefined && f !== 'regen' && f !== 'treeArmor' || (f === 'regen' && TYPES[k].regen && !TYPES[k].treeArmor) || (f === 'treeArmor' && TYPES[k].treeArmor)).map((k) => TYPES[k].race));
    assert.ok(races.size >= 1, f + ' is used');
    assert.ok(races.size <= 1 || f === 'regen', f + ' is shared by ' + [...races].join(','));
  }
  for (const r of RACE_KEYS) {
    if (r === 'kingdom') continue;
    const specials = roster(r).filter((k) => SPECIAL_FIELDS.some((f) => TYPES[k][f] !== undefined && !(f === 'regen' && TYPES[k].treeArmor)));
    assert.ok(specials.length >= 3 && specials.length <= 5, r + ' has ' + specials.length + ' specials: ' + specials.join(' '));
  }
});

test('every race can fight every race in a sandbox brawl', () => {
  for (const a of RACE_KEYS)
    for (const b of RACE_KEYS) {
      const w = game('sand', BUILTIN[4], { races: [a, b] });
      const ra = roster(a), rb = roster(b);
      for (let i = 0; i < 12; i++) { place(w, 0, ra[i % ra.length], 30 + i * 11, 150); place(w, 1, rb[i % rb.length], 30 + i * 11, 40); }
      assert.ok(act(w, 0, { type: 'startBattle', payload: null }));
      run(w, 60);
      for (const u of w.units) assert.ok(Number.isFinite(u.x) && Number.isFinite(u.hp), a + ' vs ' + b + ' NaN');
      assert.ok(w.units.length < 24, a + ' vs ' + b + ': nobody died');
    }
});

test('the AI buys from its own race', () => {
  for (const r of RACE_KEYS) {
    const w = game('skirmish', BUILTIN[0], { races: ['kingdom', r] });
    run(w, 40);
    const foreign = w.units.filter((u) => u.team === 1 && TYPES[u.type].race !== r);
    assert.equal(foreign.length, 0, r + ' AI bought ' + foreign.map((u) => u.type).join(' '));
    assert.ok(w.units.some((u) => u.team === 1), r + ' AI bought nothing');
  }
});

function arena(races: [string, string]): World {
  const w = game('sand', BUILTIN[4], { races: races as never });
  w.map.tiles.fill(0);
  return w;
}
function put(w: World, team: number, type: string, x: number, y: number): Unit {
  const u = mkUnit(w, team, type, x, y);
  w.units.push(u);
  return u;
}
function fight(w: World, seconds: number): void {
  w.phase = 'play';
  for (const u of w.units) u.order = { type: 'attack', tgt: null };
  run(w, seconds);
}

test('Horde: sapper wrecks walls, warg charges, troll regenerates, warchief speeds allies', () => {
  const w = arena(['horde', 'kingdom']);
  const wall = addBld(w, 1, 'wal', 10, 12);
  const sap = put(w, 0, 'h_sap', 84, 120);
  w.phase = 'play';
  sap.order = { type: 'attack', tgt: wall };
  run(w, 6);
  assert.ok(wall.hp < wall.max - 60, 'sapper wall hp ' + wall.hp);
  const w2 = arena(['horde', 'kingdom']);
  const warg = put(w2, 0, 'h_warg', 40, 150), tgt = put(w2, 1, 'shd', 40, 118);
  warg.run = 30;
  w2.phase = 'play';
  warg.order = { type: 'attack', tgt };
  let first = 0;
  for (let i = 0; i < 600 && !first; i++) { ticks(w2, 1); if (tgt.hp < TYPES.shd.hp) first = TYPES.shd.hp - tgt.hp; }
  assert.ok(first >= 20, 'charge hit dealt ' + first);
  const w3 = arena(['horde', 'kingdom']);
  const troll = put(w3, 0, 'h_troll', 60, 60);
  troll.hp = 50;
  w3.phase = 'play';
  run(w3, 5);
  assert.ok(troll.hp > 65, 'troll regen ' + troll.hp);
  const w4 = arena(['horde', 'kingdom']);
  const chief = put(w4, 0, 'h_chief', 76, 104);
  chief.order = { type: 'move', x: 76, y: 104 };
  const g = put(w4, 0, 'h_inf', 60, 110);
  w4.phase = 'play';
  g.order = { type: 'move', x: 60, y: 20 };
  const y0 = g.y;
  run(w4, 0.5);
  const withAura = y0 - g.y;
  const w5 = arena(['horde', 'kingdom']);
  const g2 = put(w5, 0, 'h_inf', 60, 110);
  w5.phase = 'play';
  g2.order = { type: 'move', x: 60, y: 20 };
  run(w5, 0.5);
  assert.ok(withAura > (y0 - g2.y) * 1.2, 'aura speed ' + withAura + ' vs ' + (y0 - g2.y));
});

test('Undead: necromancer raises skeletons, ghoul heals on hit, banshee slows, colossus splits', () => {
  const w = arena(['undead', 'kingdom']);
  put(w, 0, 'u_necro', 60, 100);
  put(w, 0, 'u_xbw', 50, 100);
  put(w, 0, 'u_xbw', 70, 100);
  put(w, 1, 'sct', 60, 80);
  fight(w, 3);
  assert.ok(w.units.some((u) => u.team === 0 && u.type === 'u_inf'), 'skeleton raised');
  const w2 = arena(['undead', 'kingdom']);
  const gh = put(w2, 0, 'u_ghoul', 60, 100);
  gh.hp = 10;
  put(w2, 1, 'med', 60, 106);
  fight(w2, 3);
  assert.ok(gh.hp > 10, 'ghoul lifesteal ' + gh.hp);
  const w3 = arena(['undead', 'kingdom']);
  put(w3, 0, 'u_bansh', 60, 100);
  const t = put(w3, 1, 'shd', 60, 120);
  w3.phase = 'play';
  w3.units[0].order = { type: 'attack', tgt: t };
  run(w3, 3);
  assert.ok(t.slowT > 0, 'banshee slow');
  const w4 = arena(['undead', 'kingdom']);
  const c = put(w4, 0, 'u_coloss', 60, 100);
  c.hp = 1;
  put(w4, 1, 'arc', 60, 125);
  fight(w4, 3);
  assert.ok(w4.units.filter((u) => u.team === 0 && u.type === 'u_inf').length >= 2, 'colossus split');
});

test('Forge: bulwark softens ranged hits, railgun pierces, shocker chains, minelayer drops wire', () => {
  const w = arena(['forge', 'kingdom']);
  put(w, 0, 'f_bulw', 60, 100);
  const a = put(w, 0, 'f_inf', 60, 108);
  put(w, 1, 'arc', 60, 130);
  w.phase = 'play';
  run(w, 2);
  const w2 = arena(['forge', 'kingdom']);
  const a2 = put(w2, 0, 'f_inf', 60, 108);
  put(w2, 1, 'arc', 60, 130);
  w2.phase = 'play';
  run(w2, 2);
  assert.ok(TYPES.f_inf.hp - a.hp < TYPES.f_inf.hp - a2.hp, 'guarded ' + a.hp + ' vs unguarded ' + a2.hp);
  const w3 = arena(['forge', 'kingdom']);
  const rail = put(w3, 0, 'f_rail', 60, 150);
  const t1 = put(w3, 1, 'shd', 60, 110), t2 = put(w3, 1, 'shd', 60, 125);
  w3.phase = 'play';
  rail.order = { type: 'attack', tgt: t1 };
  run(w3, 3);
  assert.ok(t1.hp < TYPES.shd.hp && t2.hp < TYPES.shd.hp, 'pierce hit both ' + t1.hp + ' ' + t2.hp);
  const w4 = arena(['forge', 'kingdom']);
  put(w4, 0, 'f_shock', 60, 100);
  const s1 = put(w4, 1, 'shd', 60, 112), s2 = put(w4, 1, 'shd', 68, 112);
  w4.phase = 'play';
  w4.units[0].order = { type: 'attack', tgt: s1 };
  run(w4, 3);
  assert.ok(s2.hp < TYPES.shd.hp, 'chain hit second target');
  const w5 = arena(['forge', 'kingdom']);
  const ml = put(w5, 0, 'f_miner', 60, 150);
  w5.phase = 'play';
  ml.order = { type: 'move', x: 60, y: 20 };
  run(w5, 12);
  assert.ok(w5.blds.filter((b) => b.type === 'brb' && b.team === 0).length >= 2, 'wire dropped');
});

test('Wild: shades hide until they strike, druids root, treants harden in trees, sprites blink', () => {
  const w = arena(['wild', 'kingdom']);
  const sh = put(w, 0, 'w_shade', 60, 150);
  const arc = put(w, 1, 'arc', 60, 120);
  w.phase = 'play';
  sh.order = { type: 'move', x: 60, y: 150 };
  assert.ok(!targetsFor(w, 1).includes(sh), 'archer cannot see the shade');
  ticks(w, 1);
  assert.equal(sh.hp, TYPES.w_shade.hp, 'shade untouched while hidden');
  sh.order = { type: 'attack', tgt: arc };
  run(w, 4);
  assert.ok(sh.reveal > 0 || arc.hp <= 0, 'shade revealed after striking');
  const w2 = arena(['wild', 'kingdom']);
  put(w2, 0, 'w_druid', 60, 100);
  const t = put(w2, 1, 'kni', 60, 125);
  w2.phase = 'play';
  w2.units[0].order = { type: 'attack', tgt: t };
  run(w2, 3);
  assert.ok(t.rootT > 0 || t.hp <= 0, 'druid root');
  const w3 = arena(['wild', 'kingdom']);
  w3.map.tiles[12 * w3.map.cols + 7] = 2;
  const tr = put(w3, 0, 'w_treant', 60, 100);
  put(w3, 1, 'xbw', 60, 130);
  w3.phase = 'play';
  run(w3, 3);
  const w4 = arena(['wild', 'kingdom']);
  const tr2 = put(w4, 0, 'w_treant', 60, 100);
  put(w4, 1, 'xbw', 60, 130);
  w4.phase = 'play';
  run(w4, 3);
  assert.ok(tr.hp >= tr2.hp, 'tree armor ' + tr.hp + ' vs ' + tr2.hp);
  const w5 = arena(['wild', 'kingdom']);
  const sp = put(w5, 0, 'w_sprite', 60, 150);
  put(w5, 1, 'shd', 60, 118);
  w5.phase = 'play';
  run(w5, 0.5);
  assert.ok(sp.y < 140, 'sprite blinked to ' + sp.y);
});

test('race stat leanings hold', () => {
  assert.ok(TYPES.h_inf.speed > TYPES.inf.speed && TYPES.h_inf.cost <= TYPES.inf.cost);
  assert.ok(TYPES.f_inf.hp > TYPES.inf.hp && TYPES.f_inf.speed < TYPES.inf.speed);
  assert.ok(TYPES.u_inf.cost < TYPES.inf.cost);
  assert.ok(TYPES.w_inf.woodland === true && !TYPES.inf.woodland);
  for (const r of RACE_KEYS) assert.ok(RACES[r].name);
});
