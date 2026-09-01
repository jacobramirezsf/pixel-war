# Pixel War: project handoff

Paste this into a new session to bring it up to speed. Everything below is true as of the
commit that added this file. Verify against the code when in doubt; the code wins.

## What it is

A pixel-art real-time strategy game for one player, built to be played by its owner on a desktop
browser and installed on a phone as a web app. Vanilla TypeScript, Vite, canvas 2D, no game
engine, no framework. Sim and render are separate. The sim is deterministic: one seeded PRNG,
fixed 1/60 tick, every action is a command `{tick, slot, type, payload}`, seed plus command log
replays a game, snapshot and restore are lossless.

- Repo: `/Users/Jacob/Documents/Makery/projects/PixelWar`, GitHub `jacobramirezsf/pixel-war`.
- Live: https://jacobramirezsf.github.io/pixel-war/ (GitHub Pages, deployed by CI on push to main).
- Origin: a single-file prototype in `legacy/pixel-war-v3.html`. `BRIEF.md` is the original build
  brief (milestones M0 to M9, all done). `docs/conquest.md` is the persistent-world design.

## How to run

```
npm install
npm run dev            # http://localhost:5173  (add --host to reach it from a phone on the LAN)
npm run check          # typecheck (app and sim, sim with no DOM lib), tests, build
npm test               # node:test with native TypeScript stripping, no test framework
npm run build          # dist/index.html, one self-contained file that runs from file://
npm run sim -- --map=crossroads --a=balanced --b=ai --runs=20   # bot vs AI
npm run sim -- --matrix --runs=3      # every scripted bot pair on five maps
npm run sim -- --ladder --runs=4      # Extreme vs Hard vs Standard vs Easy
node tools/bench.ts 10                # headless throughput
node tools/browser-shot.ts <url> <out.png> [w] [h] [script.js]   # headless Chrome over CDP
```

Dev dependencies only: vite, typescript, @types/node, vite-plugin-pwa. Add nothing without asking.
Node 22.6 or newer. `.ts` imports carry the extension and type-only imports use `import type`.
In the browser, `window.pw` is the app object for scripted checks (`window.pw.world` is the sim).

## Modes

- **Skirmish**: 1v1, destroy the enemy base. The AI starts behind a fort.
- **Multi War**: up to five armies, teams or free for all.
- **Domination**: hold mines to 150 points.
- **Unlimited Gold**: bottomless treasury, AI income doubled.
- **Sandbox**: place both armies and defenses, then play; replay, mirror.
- **Conquest**: one world in regions, one to four rivals plus neutrals. Settle regions, hold them
  30 seconds to claim, pay upkeep, keep regions connected to the capital and garrisoned, watch
  unrest. Bandit camps raid, independents can be absorbed, ruins reward whoever holds them.
  Materials from the land pay for walls and towers. Population caps the army. Diplomacy: attitude,
  truce, peace. Veterancy: three ranks from kills. Save, continue, autosave every two minutes and
  on backgrounding. Win by holding every rival capital or 60% of regions for five minutes.
- **Map editor**: paint terrain, move bases, drop mines, resize, random symmetric generation,
  mirror, JSON map codes.

## Races and units

Five races, 101 units. Kingdom is the prototype's 21. Horde, Undead, Forge, and Wild each have 20:
recolored, trimmed variants of 16 shared archetypes with per-race stat leanings, plus four
specials whose mechanics no other race has:

- Horde: Warchief (speed aura), Sapper (x5 vs buildings), Warg Rider (charge), Troll (regen).
- Undead: Necromancer (raises skeletons from enemy dead), Ghoul (lifesteal), Banshee (slow), Bone Colossus (splits on death).
- Forge: Bulwark (ranged damage aura), Railgun (pierces), Shocker (chain), Minelayer (drops wire).
- Wild: Shade (stealth), Druid (root), Treant (tree armor and regen), Sprite (blink). Wild units ignore tree slowdown.

Unit data lives in `src/data/units.ts` (archetypes, race variants, specials, sprites as string grids).
Roles (`line, ranged, fast, siege, heavy, air, support, scout, special`) drive the AI counter matrix
and which building trains a unit.

## Buildings and the town layer (Conquest)

`src/data/buildings.ts`. The prototype's eight defenses (barbed wire, palisade, stone wall, steel
wall, gate, wood tower, stone tower, turret) plus town buildings with footprints: House (+5 pop),
Farm (+0.5 gold/s near a settlement), Market (+1 gold/s), Blacksmith (research blades, bows, armor,
two levels each), Barracks (line), Range (ranged), Stable (fast, air), Siege Works (siege), Castle
(3x3, shoots, trains heavy and special, +20 pop, calms and guards its region). Each trainer has its
own queue and spawns at its door; workers and scouts come from the settlement. Buildings take time
to construct; workers within reach double the pace. Ages follow the best settlement tier: village
(0), town (1), city (2), grown with GROW; each age unlocks more. Range and stable need a barracks.
Town rules are on only in Conquest (`w.rules.town`). Skirmish still trains everything at the base.

## Powers, cheats, settings

Six powers with gold cost and cooldown, cast at a point: Barrage, Smite, Heal, Haste, Freeze,
Reinforce (`src/data/powers.ts`, `src/sim/powers.ts`). Settings: volume, mute, damage numbers,
edge pan, key hints, colorblind palette, auto pause, instant production. Cheats, toggleable
mid-game and carried in saves and replays: unlimited gold, unlimited materials, instant units,
instant buildings, no cooldowns. The AI never gets cheats.

## AI

`src/sim/ai/`. A strategy layer runs each AI faction at its difficulty's reaction rate: assess,
defend (sally when strong enough, hold behind towers otherwise), expand to mines, raid, mass to a
wave size and odds, push, reinforce (Extreme), retreat (Hard, Extreme). Purchases bend toward a
role counter matrix (`composition.ts`). Difficulty is decision quality first (`profiles.ts`),
income and build speed as small second levers. In Conquest it also settles regions, absorbs
independents, builds a town in a fixed order, ages up, researches, and places a castle at its
border. Scripted harness bots live in `bots.ts`. The ladder test (`test/balance/ladder.test.ts`)
guards Extreme > Hard > Standard > Easy and keeps the macro bots between 20% and 80% against
Standard. The owner considers the AI strong and satisfying; do not weaken it.

## Controls

- Phone: one finger drags the map, pinch zooms (continuous, settles on a crisp step), fling
  coasts. Tap a unit to select, tap ground to move, tap an enemy to attack. DRAG: PAN / DRAG: BOX
  toggle for box select. Tabs: UNITS, BUILD (grouped: DEFENSE, TOWN, MILITARY), POWERS, MORE
  (rally, groups G1 to G3, sell, land overlay, territory list, settle, outpost, upgrade, absorb,
  grow, research, save). Footprint buildings drag into place with a live ghost; walls paint along
  a drag. PAUSE and speed (0.25x to 4x) in the top bar; the pause overlay resumes on a tap.
- Laptop and desktop: two-finger scroll pans, pinch or Ctrl+scroll zooms, right drag pans, arrows
  and WASD pan, + and - zoom. Left drag box selects, right click moves or attacks. Numbers buy,
  Q W E R T G pick powers, Space pauses, [ and ] change speed, Esc cancels, Y rally, L overlay,
  B build tab, Ctrl+A all, C charge, H hold, Backspace retreat, Tab cycles types, Ctrl+number
  saves a group. Same panel as the phone in a left column; key hints panel on the right.

## Code map

```
src/sim/          no DOM, runs under Node. step.ts is the tick. commands.ts applies commands.
                  world.ts: state, snapshot, restore, serialize. conquest.ts: regions and rules.
                  town.ts: construction, per-building training, ages, research. powers.ts.
                  combat.ts, pathing.ts (flow fields, throttled), spatial.ts (16px hash),
                  economy.ts, buildings.ts (footprints, placement rules), replay.ts, ai/.
src/data/         units, buildings, powers, races, maps, difficulty, teams (palette).
src/render/       camera (integer zoom at rest, margin past edges), scene, atlas (cached sprites),
                  terrain, minimap, fx.
src/ui/           app.ts (UI state), hud/ (tabs, command row, queue, view buttons), input/
                  (gestures, touch and mouse schemes over actions.ts, hotkeys), menus/,
                  territory.ts (region list, events, diplomacy), conquest.ts (save, continue),
                  settings.ts, stats.ts, feedback.ts (sound and shake), bench.ts.
src/platform/     storage adapter (localStorage behind an interface), service worker.
src/audio/        WebAudio synth, no files.
test/sim/         parity, smoke, snapshot, determinism, races, depth, conquest, town, powers.
test/balance/     ladder test.
tools/            sim-cli, bench, browser-shot, make-icons.
```

Invariants: nothing in `src/sim` or `src/data` may reference the DOM, clocks, or `Math.random`
(a test greps for it). Snapshot and restore must stay lossless (a test runs 600 ticks after a
restore and compares state strings; key order in `world.ts` restore must match the snapshot).
Every player and AI action goes through `applyCommand`. Selection and pause are UI state, not sim
state. Writing style everywhere: plain, short sentences, no em dashes, no inflated words.

## Known gaps

- Phone install is verified only in headless Chrome, not on a real device.
- A 300-unit five-way brawl runs about 26x real time headless; Skirmish scale runs far faster.
- Conquest and town numbers (upkeep, garrison, unrest rates, building costs and times) are first
  guesses that pass tests, not tuned by play.
- Unit power scales roughly linearly with cost; a 150 gold unit is worth about four 20 gold units.
- The two naive harness bots (blind rush, pure turtle) lose outright to Standard.

## Owner's direction (Aug 31 2026)

The owner wants the game to become a persistent world he returns to: build a village, save it,
come back, grow units and the town, get raided, deal with random events, work with or fight other
kingdoms. Fun and replayable at the base, not overly complex. Buildings should make mechanical
sense and be where units come from (barracks for infantry, a factory for tanks, castles and
wonders as goals). Combat next: a 200 gold special should be much stronger than a soldier, and
that should hold across tiers. Controls: select one unit and send it at a specific unit, building,
or spot, while keeping group selection with attack mode and defend mode. Larger maps and a more
expansive editor and sandbox; some starter maps are too small.

Proposed order: (1) buildings train units in every mode, Skirmish starts with the basics standing;
(2) combat scaling pass, value grows like cost^1.3, harness watching the ladder; (3) stances
(MOVE, ATTACK, GUARD, RETREAT) and single-target control on the phone row first; (4) a persistent
"Realm" mode: endless, three save slots, events on a clock, second towns, a Wonder, optional win
goals; (5) larger maps, editor upgrades, starter map revamp.

Open decisions the owner has not made: whether Realm replaces Conquest (recommended) and whether
buildings train units in Skirmish too (recommended).
