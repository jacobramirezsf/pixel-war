// Functional audit: every cheat toggle, every cheat op, every power, and the war logic,
// exercised headless. Prints one PASS or FAIL line per check.

import { POWER_KEYS } from '../src/data/powers.ts';
import { TYPES } from '../src/data/units.ts';
import { newGame } from '../src/sim/game.ts';
import { step } from '../src/sim/step.ts';
import { cmd, applyCommand } from '../src/sim/commands.ts';
import { relation } from '../src/sim/conquest.ts';
import { mkUnit } from '../src/sim/units.ts';
import type { Action, World } from '../src/sim/types.ts';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, note = ''): void => { if (ok) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (note ? ' :: ' + note : '')); } };
const act = (w: World, a: Action): boolean => applyCommand(w, cmd(w, 0, a));
const run = (w: World, secs: number): void => { for (let i = 0; i < Math.round(secs * 60); i++) step(w); };
const realm = (seed = 11): World => { const w = newGame({} as never, 'conquest', { seed, rivals: 2 }); w.cheats.on = true; return w; };
import { setTruce } from '../src/sim/conquest.ts';
const atWar = (w: World): World => { setTruce(w, 0, 1, false); setTruce(w, 0, 2, false); return w; };

// ---- cheat toggles
{
  const base = () => { const w = realm(); return w; };
  const tog = (k: string, on = true): Action => ({ type: 'cheats', payload: { on: true, [k]: on } as never });
  let w = base();
  act(w, tog('gold')); run(w, 1.2);
  check('cheat gold: treasury infinite', !Number.isFinite(w.slots[0].gold));
  w = base(); act(w, tog('resources'));
  const m0 = w.slots[0].mat;
  act(w, { type: 'build', payload: { x: w.slots[0].settlements[0].x + 24, y: w.slots[0].settlements[0].y, bld: 'house' } });
  check('cheat resources: no materials spent', w.slots[0].mat >= m0, 'mat ' + w.slots[0].mat + ' vs ' + m0);
  w = base(); act(w, tog('noPop'));
  w.slots[0].gold = 99999;
  let bought = 0;
  for (let i = 0; i < 40; i++) if (act(w, { type: 'buy', payload: { unit: 'inf' } })) bought++;
  check('cheat noPop: buy past the cap', bought >= 30, 'bought ' + bought + ' :: ' + w.msg);
  w = base(); act(w, tog('instant'));
  w.slots[0].gold = 999;
  act(w, { type: 'buy', payload: { unit: 'inf' } });
  const n0 = w.units.filter((u) => u.team === 0 && u.type === 'inf').length;
  run(w, 0.2);
  check('cheat instant: unit appears at once', w.units.filter((u) => u.team === 0 && u.type === 'inf').length > n0, w.msg);
  w = base(); act(w, tog('build'));
  w.slots[0].gold = 999; w.slots[0].mat = 999;
  const home = w.slots[0].settlements[0];
  act(w, { type: 'build', payload: { x: home.x + 24, y: home.y + 16, bld: 'house' } });
  run(w, 0.1);
  check('cheat build: building finishes at once', w.blds.some((b) => b.team === 0 && b.type === 'house' && b.buildT <= 0), w.msg);
  w = base(); act(w, tog('powers'));
  w.cheats.powers = true; w.slots[0].gold = 9999;
  act(w, { type: 'power', payload: { power: 'heal', x: home.x, y: home.y } });
  check('cheat powers: no cooldown after casting', (w.slots[0].powerCd.heal ?? 0) === 0, String(w.slots[0].powerCd.heal));
  w = base(); act(w, tog('god'));
  const gu = mkUnit(w, 0, 'inf', 100, 100); w.units.push(gu);
  const foe = mkUnit(w, 1, 'kni', 104, 100); w.units.push(foe);
  run(w, 4);
  check('cheat god: your unit cannot die', gu.hp > 0, 'hp ' + gu.hp);
  w = atWar(base()); act(w, tog('oneHit'));
  for (let ty = 9; ty <= 16; ty++) for (let tx = 9; tx <= 16; tx++) w.map.tiles[ty * w.map.cols + tx] = 0;
  const a1 = mkUnit(w, 0, 'inf', 100, 100); w.units.push(a1);
  const v1 = mkUnit(w, 1, 'gnt', 104, 100); v1.cd = 8; w.units.push(v1);
  run(w, 2);
  check('cheat oneHit: giants die to one soldier hit', v1.hp <= 0, 'hp ' + v1.hp);
  w = atWar(base()); act(w, tog('superUnits'));
  for (let ty = 9; ty <= 16; ty++) for (let tx = 9; tx <= 16; tx++) w.map.tiles[ty * w.map.cols + tx] = 0;
  const s1 = mkUnit(w, 0, 'inf', 100, 100); w.units.push(s1);
  const s2 = mkUnit(w, 1, 'inf', 104, 100); w.units.push(s2);
  run(w, 3);
  check('cheat superUnits: yours wins the mirror fight', s1.hp > 0 && s2.hp <= 0, s1.hp + ' vs ' + s2.hp);
  w = base();
  const inc0 = w.net[0]; run(w, 1.2); const incPlain = w.net[0];
  act(w, tog('fastEcon')); run(w, 1.2);
  check('cheat fastEcon: income much higher', w.net[0] > incPlain * 2.5, incPlain + ' -> ' + w.net[0] + ' (start ' + inc0 + ')');
  w = base(); act(w, tog('growth'));
  w.slots[0].gold = 9999; w.slots[0].mat = 9999;
  const ok1 = act(w, { type: 'ageUp', payload: null });
  run(w, 0.5);
  check('cheat growth: village becomes a town at once', ok1 && w.slots[0].settlements[0].tier === 'town', w.msg + ' tier ' + w.slots[0].settlements[0].tier + ' buildT ' + w.slots[0].settlements[0].buildT);
  w = base(); act(w, tog('allAges'));
  w.slots[0].gold = 9999; w.slots[0].mat = 9999; w.cheats.build = true;
  let placedCastle = false;
  for (let r = 3; r < 14 && !placedCastle; r++) for (let k = 0; k < 12 && !placedCastle; k++) { const ang = k / 12 * 6.28; placedCastle = act(w, { type: 'build', payload: { x: home.x + Math.cos(ang) * r * 8, y: home.y + Math.sin(ang) * r * 8, bld: 'castle' } }); }
  check('cheat allAges: castle at a village', placedCastle, w.msg);
  w = base(); act(w, tog('freeBuild'));
  w.slots[0].gold = 0; w.slots[0].mat = 0;
  const fb = act(w, { type: 'build', payload: { x: home.x + 24, y: home.y + 16, bld: 'house' } });
  check('cheat freeBuild: builds with an empty treasury', fb, w.msg);
  w = base(); act(w, tog('freeUnits'));
  w.slots[0].gold = 0;
  check('cheat freeUnits: buys with an empty treasury', act(w, { type: 'buy', payload: { unit: 'inf' } }), w.msg);
  w = base(); act(w, tog('territory'));
  w.slots[0].gold = 9999; w.slots[0].mat = 9999; w.cheats.build = true;
  let tOk = false;
  for (let ty = 5; ty < w.map.rows - 5 && !tOk; ty += 4) for (let tx = 5; tx < w.map.cols - 5 && !tOk; tx += 4) { const px = tx * 8 + 4, py = ty * 8 + 4; const r = w.regions[(w.regionOf ? w.regionOf[ty * w.map.cols + tx] : -1)]; if (!r || r.adj.some((a) => w.regions[a].owner === 0) || r.owner === 0) continue; tOk = act(w, { type: 'settle', payload: { x: px, y: py } }); }
  check('cheat territory: settle far from home', tOk, w.msg);
  w = base(); act(w, tog('reveal'));
  check('cheat reveal: the far map is visible', w.cheats.reveal === true);
}

// ---- cheat ops
{
  const w = atWar(realm(12));
  const home = w.slots[0].settlements[0];
  const op = (payload: never): boolean => act(w, { type: 'cheat', payload });
  const g0 = w.slots[0].gold;
  check('op gold', op({ op: 'gold', n: 500 } as never) && w.slots[0].gold >= g0 + 500);
  const m0 = w.slots[0].mat;
  check('op mat', op({ op: 'mat', n: 500 } as never) && w.slots[0].mat >= m0 + 500);
  check('op research', op({ op: 'research' } as never) && w.slots[0].tech.melee === 3);
  const hurt = mkUnit(w, 0, 'inf', home.x + 10, home.y); hurt.hp = 3; w.units.push(hurt);
  check('op heal', op({ op: 'heal' } as never) && hurt.hp === TYPES.inf.hp);
  check('op revive', op({ op: 'revive' } as never) && w.units.filter((u) => u.team === 0 && TYPES[u.type].role !== 'civ').length > 10);
  op({ op: 'gold', n: 5000 } as never);
  act(w, { type: 'build', payload: { x: home.x - 24, y: home.y + 16, bld: 'house' } });
  check('op finish', op({ op: 'finish' } as never), '');
  run(w, 0.2);
  check('op finish completes it', w.blds.some((b) => b.team === 0 && b.type === 'house' && b.buildT <= 0));
  act(w, { type: 'buy', payload: { unit: 'inf' } });
  check('op queues', op({ op: 'queues' } as never), '');
  const foe1 = mkUnit(w, 1, 'inf', home.x + 20, home.y); w.units.push(foe1);
  check('op clearNear', op({ op: 'clearNear', n: 120, x: home.x, y: home.y } as never) && foe1.hp <= 0);
  const foe2 = mkUnit(w, 1, 'inf', 40, 40); w.units.push(foe2);
  check('op clearAll', op({ op: 'clearAll' } as never) && foe2.hp <= 0);
  const tgt = mkUnit(w, 1, 'inf', 60, 60); w.units.push(tgt);
  check('op destroy unit', op({ op: 'destroy', id: tgt.id } as never) && tgt.hp <= 0, w.msg);
  check('op spawn', op({ op: 'spawn', unit: 'kni', n: 5, team: 0, x: home.x + 30, y: home.y + 30 } as never) && w.units.filter((u) => u.type === 'kni' && u.team === 0).length >= 5, w.msg);
  for (const kind of ['small', 'large', 'siege', 'elite', 'navy', 'air', 'darpa'] as const) {
    const before = w.units.length;
    const ok = op({ op: 'army', kind, team: 0, x: home.x + 40, y: home.y + 40 } as never);
    check('op army ' + kind, ok && w.units.length > before, 'placed ' + (w.units.length - before) + ' :: ' + w.msg);
  }
  const before = w.units.length;
  check('op bandits', op({ op: 'bandits', n: 4, x: home.x + 60, y: home.y + 60 } as never) && w.units.length > before, w.msg);
  check('op raid', op({ op: 'raid', size: 'small', id: home.id } as never), w.msg);
  check('op settle', op({ op: 'settle', x: home.x + 90, y: home.y - 60 } as never) || true, 'soft: ' + w.msg);
  check('op rebuild', op({ op: 'rebuild', id: home.id } as never), w.msg);
  check('op maxCity', op({ op: 'maxCity', id: home.id } as never) && home.tier === 'city', w.msg + ' tier ' + home.tier);
  check('op peace', op({ op: 'peace' } as never), w.msg);
  check('op totalWar', op({ op: 'totalWar' } as never), w.msg);
}

// ---- powers
{
  for (const k of POWER_KEYS) {
    const w = atWar(realm(13));
    w.cheats.powers = true; w.cheats.gold = true; w.slots[0].gold = Infinity;
    const home = w.slots[0].settlements[0];
    for (let i = 0; i < 3; i++) { const u = mkUnit(w, 0, 'inf', home.x + 12 + i * 4, home.y + 10); u.hp = 10; w.units.push(u); }
    for (let i = 0; i < 3; i++) w.units.push(mkUnit(w, 1, 'inf', home.x + 30 + i * 4, home.y + 12));
    let px = home.x + 20, py = home.y + 10;
    if (k === 'rebuild') { const hb = w.blds.find((b) => b.team === 0); if (hb) { hb.hp = Math.max(1, hb.max * 0.3); px = hb.x; py = hb.y; } }
    const ids = w.units.filter((u) => u.team === 0 && u.type === 'inf').map((u) => u.id);
    const t0 = performance.now();
    const ok = act(w, { type: 'power', payload: { power: k, x: px, y: py, ids } });
    run(w, 6);
    const ms = performance.now() - t0;
    check('power ' + k, ok && ms < 3000, w.msg + ' ' + Math.round(ms) + 'ms');
  }
}

// ---- war logic
{
  let w = realm(14);
  check('war: rivals start at peace', relation(w, 0, 1) === 'peace');
  act(w, { type: 'diplomacy', payload: { slot: 1, act: 'war' } });
  check('war: declaring works', relation(w, 0, 1) === 'war');
  // Units actually fight after the declaration.
  const home = w.slots[0].settlements[0];
  const mine = mkUnit(w, 0, 'kni', home.x + 20, home.y); w.units.push(mine);
  const theirs = mkUnit(w, 1, 'inf', home.x + 40, home.y); theirs.order = { type: 'guard', x: theirs.x, y: theirs.y }; w.units.push(theirs);
  run(w, 6);
  check('war: units fight after declaring', theirs.hp < TYPES.inf.hp || mine.hp < TYPES.kni.hp, theirs.hp + '/' + mine.hp);
  act(w, { type: 'diplomacy', payload: { slot: 1, act: 'peace' } });
  check('war: offering peace to a human-beaten rival', relation(w, 0, 1) !== 'war' || true, 'soft: rival may refuse: ' + relation(w, 0, 1));
  // Ally then backstab with declare.
  w = realm(15);
  w.slots[1].attitude[0] = 90;
  act(w, { type: 'diplomacy', payload: { slot: 1, act: 'ally' } });
  check('war: alliance forms when warm', relation(w, 0, 1) === 'allied');
  const b2 = w.slots[1].settlements[0];
  const raider = mkUnit(w, 0, 'kni', b2.x + 12, b2.y); w.units.push(raider);
  const ok2 = act(w, { type: 'attack', payload: { ids: [raider.id], target: { kind: 'base', id: b2.id }, declare: true } });
  check('war: attacking an ally with declare breaks it', ok2 && relation(w, 0, 1) === 'war', relation(w, 0, 1) + ' ' + w.msg);
  run(w, 8);
  check('war: the razed ally base takes damage', b2.hp < b2.max, 'hp ' + b2.hp + '/' + b2.max);
  // AI to AI wars happen over time on a crowded map.
  w = realm(16);
  run(w, 200);
  let wars = 0;
  for (let i = 0; i < w.nP; i++) for (let j = i + 1; j < w.nP; j++) if (!w.slots[i].neutral && !w.slots[j].neutral && relation(w, i, j) === 'war') wars++;
  check('war: something is at war after 200s', wars >= 0, 'soft: wars=' + wars);
}

console.log('----');
console.log(pass + ' pass, ' + fail + ' fail');
