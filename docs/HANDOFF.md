# Pixel War: project handoff

Paste this into a new session to bring it up to speed. Everything below is true as of the
commit that added this file. Verify against the code when in doubt; the code wins.

## What it is

A pixel-art strategy game for one player, played in a desktop browser and installed on a phone
as a web app. Mobile is the first platform. Vanilla TypeScript, Vite, canvas 2D, no game engine,
no framework, four dev dependencies (vite, typescript, @types/node, vite-plugin-pwa). Sim and
render are separate. The sim is deterministic: one seeded PRNG, fixed 1/60 tick, every action is
a command `{tick, slot, type, payload}`, seed plus command log replays a game, snapshot and
restore are lossless. Nothing in `src/sim` or `src/data` touches the DOM, clocks, or Math.random.

- Repo: `/Users/Jacob/Documents/Makery/projects/PixelWar`, GitHub `jacobramirezsf/pixel-war`.
- Live: https://jacobramirezsf.github.io/pixel-war/ (GitHub Pages, deployed by CI on push to main).
- `BRIEF.md` is the original build brief (M0 to M9, done). `docs/conquest.md` is the first
  persistent-world design; Realm grew out of it.

## How to run

```
npm install
npm run dev            # http://localhost:5173  (add --host to reach it from a phone on the LAN)
npm run check          # typecheck (app and sim, sim with no DOM lib), tests, build
npm test               # node:test with native TypeScript stripping
npm run build          # dist/index.html, one self-contained file that runs from file://
npm run sim -- --ladder             # Extreme vs Hard vs Standard vs Easy on five maps
npm run sim -- --matrix             # scripted bot pairs
node tools/bench.ts 20              # headless throughput, 300 units
node tools/value.ts 300 [minCost]   # equal-gold duel sweep of every unit vs soldiers, archers, knights
node tools/realm-sim.ts 20 2 standard 11   # all-AI Realm for 20 minutes: towns, armies, wars, history
node tools/browser-shot.ts <url> <out.png> [w] [h] [script.js]   # headless Chrome over CDP
```

In the browser `window.pw` is the app and `window.pwAct(action)` issues an action through the
same path as the HUD. The QA scripts in this history drive the game that way.

## Modes

- REALM (mode key `conquest`): the main game. A persistent world with 1 to 4 rival kingdoms,
  world size small, standard, large (48, 64, 90 tiles), optional seed. Three save slots with
  summary cards, autosave every two minutes and on backgrounding, CONTINUE REALM on the main
  menu. It never ends on its own: six feats fire once (Kingdom, Great City, Empire, Conqueror,
  Great Power, Survivor) plus Great Wonder. Losing the last settlement regroups the people in
  free land; the realm ends only when there is none. Days are 120 seconds.
- Skirmish, Multi War, Domination, Unlimited Gold, Sandbox, Map Editor: the match modes. Town
  buildings train units in every mode (barracks line, range ranged, stable fast and air, siege
  works siege, castle heavy and special; settlement trains scouts and workers).

## Realm systems

- Worlds: `src/sim/realmgen.ts` makes asymmetric geography (forest belts, rock ridges with
  passes, one or two rivers with fords, cleared town sites, a mine per region) and carves a route
  so every region is reachable from the capital. Regions come from `makeRegions` (jittered grid).
- Fog of war: `w.seen` (explored, saved run-length) plus per-frame sight from units, buildings,
  settlements, allies (`src/sim/vision.ts`, radii in `src/data/vision.ts`). Enemies show only in
  sight; the minimap and scene dim explored land and black out the unknown.
- Civilians (`src/sim/civ.ts`, numbers in `src/data/civ.ts`): villagers live in a settlement,
  take jobs (settlement, farm, market, smith, castle), pay the treasury through staffed jobs,
  drift between work and the square, flee to the castle or hall when enemies come, return when
  safe. Housing from the settlement plus houses. Growth needs safety, room, and work. Each
  settlement reports residents, jobs, income, state (growing, stable, under attack, recovering).
- Growth: village to town needs 6 people, a house, a barracks, a farm or market; town to city
  needs 12 people, 3 houses, market, smith, range or stable (`GROW` in `src/data/realm.ts`,
  `canGrow` in conquest.ts). Ages follow the best settlement tier. The capital flies a gold
  standard; the crown passes to the biggest survivor when it falls.
- Diplomacy: war, peace, allied. Allies share sight, cross land, fight shared enemies. Player
  actions: war, peace, ally, gift. Rivals propose alliances through envoys, walk away from a
  soured one, and lean by race (`src/data/personas.ts`): horde aggressive, undead raiders, forge
  defensive, wild growers, kingdom opportunists.
- Events (`realmEvents` in conquest.ts): raiders from the nearest camp or the map edge, envoys
  (peace, alliance, tribute), caravans that pay on arrival, migrants, sickness, harvest, ruins,
  declarations of war. Some pause and ask. Rival marches are announced when their home is
  explored. History: `w.history` keeps forty major lines, shown in the KINGDOM panel.
- Great Wonder: 4x4, 800 gold, 400 materials, four minutes. Announced when begun, a feat when
  done, warms rivals, calms land, sees far. The AI builds one when rich and marches on an enemy's.
- Names: regions take a name from the founder's race pool (`src/data/names.ts`) when first
  settled; the player renames from the town card.

## Expansion pass (Sep 2026)

- Recovery: the frame loop survives a thrown frame; each slot keeps the previous save and falls
  back to it; a slot that cannot load shows DAMAGED with CLEAR. The nuke crash was a negative
  blast radius in `drawFx` (boom effects now carry their own life).
- Selection: `app.town`, `app.bld`, `app.foreign` are the non-unit cards; `clearSelection` drops
  all of them; `app.act` is the contextual gold button set by `contextAction` in hud.ts;
  `app.warAsk` holds an attack on someone at peace until a second tap confirms it (the `attack`
  command takes `declare: true` and declares war).
- Capture: `canCapture`/`capture` in conquest.ts. Razed enemy settlements change hands with region
  and nearby buildings for 100 gold; independents join for 200 (absorb).
- Training: `buy` takes `building` and `near`; `slot.prefer[role]` is a default trainer
  (`setDefault`). Building levels 1 to 3 (`upgradeBld`; walls and towers step material instead,
  `connected: true` sweeps a line). Research is bought on the building that sells it
  (`TECH_INFO` in town.ts): smith, factory, dock or port, market.
- Ground: roads (tile 1, speed 1.25x, cheaper in flow fields) and clearing are `terrain` works in
  `w.works` (`src/sim/works.ts`); bridges are buildings of kind `bridge` painted across water from
  a bank; `unbuild` undoes the last placement gesture with a full refund.
- Media: units are ground, sea (`naval`), or air (`fly`); `passableFor(w, team, x, y, medium)`.
  Transports (`capacity`) hold riders with `u.aboard`; orders `board` and `unload`. Docks and
  ports need a shore; the factory builds trucks, armored cars, flak, helicopters. DARPA and the
  Robotics Lab are the late game (`EXTRA_UNITS`, roles `darpa` and `robot`, prerequisites via
  `needs`). Shared units show in the UNITS tab once their trainer stands.
- Worlds: sizes up to MASSIVE (200 tiles, 100 regions); a bay with islands on large worlds;
  offshore regions get no corridor (`offshore()` in realmgen). Flow fields are rebuilt on restore
  and only saved (packed float32) while a rebuild is pending; the dijkstra uses typed heaps with
  costs precomputed per node; the rebuild throttle grows with map size. Saves are about 160KB.
- Civilians also mend damaged buildings and hurry construction (job -2 is an errand), and split
  their day between work, market, house, and square. A raid at the door halves construction.
- Layers (territory, borders, names, state) live in `app.layers`, saved under `layers`.

## Combat and control

- Commands: MOVE, ATTACK (attack-move, or an exact unit or building target), GUARD (a spot, a
  unit, a building, a settlement; follows the target), HOLD, RETREAT. Modes are one-shot and the
  canvas shows an outline while one is armed. Tap an enemy to target it, tap ground to move,
  double-tap a unit to select its type on screen. Groups G1 to G3: tap recalls, second tap
  centers, hold saves. Mixed groups keep a loose order: ranged and support stop short, siege
  shorter, so melee arrive first (`lineBack` in commands.ts).
- Balance: `tierScale` gives dearer units hp k^0.22 and damage k^0.15 on top of listed numbers.
  `tools/value.ts` is the sweep that drove the last pass. Siege: mortars and bombers deal double
  to buildings (`bldDmg`); the Sapper's `vsBld` is a race mechanic. Buildings crack and smoke as
  they lose health.
- Powers (`src/data/powers.ts`, `src/sim/powers.ts`): battle (barrage, smite, heal, haste,
  freeze, reinforce, lightning, meteor, quake, fortify, teleport, banish, summon), realm (rebuild,
  sanctuary, golden age), chaos with cheats on (nuke, invasion, peace, total war). Area buffs are
  timed `w.zones`.
- Cheats (`Cheats` in types.ts, `src/sim/cheats.ts`): a master switch, then unlimited gold and
  materials, instant units and buildings, no cooldowns, reveal, no pop cap, god mode, one hit,
  super units, fast economy, instant growth, all ages, free build, free units, anywhere. One-shot
  commands: gold, materials, research, heal, revive, finish builds and queues, clear near or all,
  destroy, spawn, army, raid, bandits, settle, peace, total war, rebuild, max city. Player only,
  every one a command. UI: Settings and the CHEATS panel under MORE.

## AI

`src/sim/ai/`: strategy (decide), composition (role counter matrix, saving for better units once
there is an army and an economy), tactics, profiles (difficulty = decision quality plus small
income and build levers), bots (scripted opponents for the harness). Realm additions: builds
toward the next tier and develops every village, tower cap, contests lightly held mines, recalls
a wave when a force approaches home, no push while under approach, engages anything at the
gates, attack-moves in formation, announces marches. Ladder guard in `test/balance/ladder.test.ts`:
ordering strict, scripted bots 10 to 90 percent against Standard (loose on purpose since the
flow-field fix; see the note there).

## Code map

```
src/sim/       world, step, commands, combat, pathing (dijkstra with a float32 fix), spatial,
               conquest (regions, claims, unrest, neutrals, diplomacy, events, feats, regroup),
               civ, town, buildings, realmgen, vision, wonder, cheats, powers, ai/
src/data/      units (101 plus villager and caravan), buildings (with wonder), races, powers,
               realm (sizes, feats, growth), civ, vision, personas, names, maps, difficulty
src/render/    scene (fog, damage, silhouettes), atlas, terrain, minimap, camera (half zoom on
               big maps), fx
src/ui/        app, conquest (slots, autosave), territory (KINGDOM panel), cheats (panel),
               hud/, input/, menus/, settings, feedback (sounds), stats
               HUD (Sep 2026 rebuild): a persistent icon rail (ARMY BUILD POWERS KINGDOM
               WORLD MORE; TERRAIN MAP in the editor) opens one shelf at a time above it;
               rail icons live in src/render/icons.ts. Selection shows a contextual icon
               row (X MOVE ATTACK GUARD HOLD RETREAT + the gold context action). An armed
               tool shows one floating mode chip; tapping it cancels. BUILD has TOWN,
               MILITARY, DEFENSE, GROUND subcategory chips (town tools VILLAGE OUTPOST
               GROW UPGRADE ABSORB live under TOWN); big buildings place once, walls and
               roads stay armed. WORLD holds the layer chips and WATCH (hides all UI).
               KINGDOM toggles the territory panel. Default state is world + rail only.
tools/         sim-cli, bench, value, realm-sim, browser-shot, make-icons
test/sim/      93 tests incl. civ, modes, realm, realmgen, diplomacy, cheats, tiers, stances
```

Invariants: snapshot and restore must stay lossless (tests run 600 ticks after a restore and
compare state strings; key order in world.ts restore must match snapshot). Every player and AI
action goes through `applyCommand`. Selection, pause, camera, and panels are UI state.

## Known gaps and next steps

- The AI does not build roads, bridges, DARPA, or the lab, and does not mount amphibious
  invasions; it builds a dock by a shore and keeps a few boats. Boats have no flow field and
  steer straight, sliding along coasts.
- Villagers do not prefer roads when walking; only movement speed and flow fields honor roads.
- HUGE and MASSIVE run 28x realtime headless; phone performance on them is unverified.
- No metropolis tier, no settlement priority setting, no sea caravans.

- AI kingdoms bank gold late (pop-capped, building caps); they could spend on castles, houses,
  city upgrades, and wonders more readily. Standard loses most scripted timing pushes on the
  tiny starter maps.
- Ranged units lose open-field brawls at equal gold by design; no kiting behavior.
- Roads, building rotation, a WALL power, and region editing in the editor were skipped.
- Phone install is unverified on hardware; all mobile checks are 390x844 headless screenshots
  and scripted taps.
- Writing style everywhere: plain and direct, no em dashes, no inflated words.
