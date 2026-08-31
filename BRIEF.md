# Pixel War: build brief for Claude Code

Paste everything below the line into Claude Code as your first message. Keep `legacy/pixel-war-v3.html` in the repo so the agent can read it.

---

## Project

I have a working prototype of a pixel-art real-time strategy game called Pixel War. It exists as a single 1800-line HTML file at `legacy/pixel-war-v3.html`. It runs, it is playable, and it is at the ceiling of what one file can carry. Read it first, in full, before you write anything. It is the specification for behavior, not the specification for structure.

We are converting it into a real project. Vanilla TypeScript, Vite, canvas 2D. Mobile and desktop are both first-class targets.

Do not rewrite from scratch. Port system by system, verifying behavior against the prototype as you go.

There is a second document, `docs/conquest.md`, specifying a persistent territory mode. That mode is the eventual point of this project. It is milestones M7 and M8. Read it early so you understand where this is heading, and apply the five structural notes at the end of it as you work through the earlier milestones.

## What this is for

I am building this to play myself, on my own computers and my phone. That is the whole audience for now. There is no launch, no store, no users to support.

That means two delivery targets:

1. **Browser on desktop.** The development loop and how I play at a keyboard.
2. **Installed on my phone.** A home screen icon that opens full screen and works with no network. A progressive web app, not a native app build.

Native app store distribution and a desktop store release are both plausible later and neither is being built now. A short list of decisions further down keeps those doors open at close to zero cost. Follow that list, and do not spend effort on anything beyond it.

Because both targets are just the web build, a few rules apply from M0 rather than being retrofitted:

- Vite `base: './'`. All asset paths relative. The build has to run correctly from a local bundle, not only from a web server root.
- No CDN loads, no runtime network calls, no external fonts. Everything bundled. Include a pixel or monospace font under an open license rather than relying on system fonts, so the game looks the same on my laptop, my desktop, and my phone.
- All persistence goes through a `storage` adapter interface defined in M0, backed by localStorage. Never call localStorage directly from game code.
- The game must run with no service worker. Offline caching is a convenience, never a dependency.
- The input layer is scheme-agnostic. Touch and mouse-plus-keyboard are the two implementations. Do not build a gamepad adapter, but do not write anything that assumes there will only ever be two schemes.
- Design against my actual screens: a phone in portrait, and a desktop browser window at 1920x1080 and at half that width. Test a narrow window, since that is where layouts break.

## What the prototype already does

Port all of this. Nothing on this list gets dropped without asking me first.

- 21 unit types with pixel sprites drawn from string grids. Specials: armor, splash damage, suicide, minimum range, healing, aura buff, flight.
- 8 buildings: barbed wire, stakes, stone wall, steel wall, gate, wood tower, stone tower, turret. Walls block both teams. Gates are two tiles wide, auto-orient horizontal or vertical, and lock or unlock on tap. Your own units always pass your own gates.
- Worker unit that auto-seeks damaged friendly buildings and repairs them for a gold cost per tick.
- Gold economy. Base income plus 1.5/s per captured mine. Mines are captured by standing on them, contested if two hostile sides are present.
- Flow-field pathing via Dijkstra from all hostile bases, with enemy walls entering the field as breach cost. Blocked units bump-attack whatever stopped them.
- Five modes: Campaign (1v1), Multi War (up to 5 armies, teams or free for all), Domination (hold mines to 150 points), Unlimited Gold, Sandbox (place both armies and defenses, then play, with replay and mirror).
- Four difficulty levels that currently scale AI income, tower purchase rate, wave timing, and fort tier.
- Seven built-in maps plus a map editor: paint terrain, move bases, drop mines, resize, random symmetric generation, mirror, and JSON map codes for export and import.
- Multi-slot alliance system. `ally[]` per slot, `allied(a,b)` gates every combat, pathing, and targeting decision.
- Automatic base placement on an ellipse with carved corridors for 3 to 5 player maps.

## Non-negotiable constraints

**Stack.** Vite, TypeScript in strict mode, canvas 2D. No game engine. No React, no Vue, no framework for the game loop. Menus and HUD are plain DOM built by small render functions. Zero runtime dependencies in `src/sim/`. Keep total dependencies under ten.

**Determinism.** The simulation must be fully deterministic. Same seed plus same command log produces an identical game state, tick for tick. This is the foundation for the balance harness, for replays, and for any future multiplayer. It means:
- Fixed timestep of 1/60s. Accumulate real time, step the sim in whole ticks, interpolate at render. The prototype uses variable `dt` clamped at 0.05, which has to go.
- One seeded PRNG (mulberry32 or xorshift128). Every `Math.random()` call gets replaced. There are a lot of them, including inside `spawn`, `mkUnit`, `aiPick`, and the fx system.
- No iteration over `Map` or `Set` insertion order where the order affects outcomes. Sort explicitly.
- No `Date.now()` or `performance.now()` inside the sim.

**Sim and render are separate.** `src/sim/` imports no DOM, no canvas, no browser globals. It must run under Node with no stubbing. The prototype's test harness currently needs a 19-line Proxy-based DOM mock to run headless. That mock should become unnecessary. This one rule is what makes the balance work cheap.

**Input as commands.** All player and AI actions become commands: `{tick, slot, type, payload}`. The sim consumes a command queue. Replay is seed plus command log, which will be a few kilobytes rather than a state dump.

**Both platforms, one build.** No separate mobile and desktop codebases. One camera, one command layer, two input adapters, and a layout that reflows. Detect capability with `matchMedia('(pointer: coarse)')` and viewport size, not user agent.

**Writing style.** All user-facing copy, README, comments, and commit messages: plain and direct. No em dashes anywhere. No inflated words like transformative, robust, seamless, or dynamic. Short sentences. The prototype's menu copy is the tone to match.

**localStorage is allowed here.** The prototype avoided it because of an artifact sandbox restriction. This is a real project. Use it, but only behind the storage adapter described above.

## Repository layout

```
pixel-war/
  index.html
  vite.config.ts
  src/
    main.ts
    sim/                 no DOM, no canvas, Node-runnable
      rng.ts
      types.ts
      world.ts           state container, reset, snapshot
      commands.ts        command types and application
      step.ts            the fixed-tick update
      combat.ts
      economy.ts
      pathing.ts         flow fields, spatial queries
      buildings.ts
      ai/
        strategy.ts      what to do
        composition.ts   what to buy
        tactics.ts       where to send it
        profiles.ts      difficulty definitions
    render/
      atlas.ts           prerendered sprite bitmaps
      camera.ts
      terrain.ts
      scene.ts
      fx.ts
    ui/
      layout.ts          breakpoint and pointer detection
      hud/
      menus/
      input/
        touch.ts
        mouse.ts         mouse and keyboard
        gestures.ts
    platform/
      storage.ts         adapter interface plus localStorage backend
      fullscreen.ts
    data/
      units.ts
      buildings.ts
      maps.ts
      difficulty.ts
    audio/
      synth.ts
  test/
    sim/                 unit tests
    balance/             bot-versus-bot matrices
  tools/
    sim-cli.ts
  legacy/
    pixel-war-v3.html
```

## Milestones

Work these in order. Stop at each boundary, report what you did, and wait for me before starting the next one. Do not jump ahead.

### M0. Scaffold and port with parity

Scaffold the project. Port the prototype into the module layout above with behavior unchanged. Same units, same numbers, same modes, same maps, same feel. Set up the storage adapter and the relative-path build config now, even though nothing depends on them yet.

Done when: the game runs at parity with the prototype, `src/sim/` has no browser imports, the production build runs correctly when opened from a local file path, and a smoke test starts every mode and runs 300 ticks with no error.

### M1. Deterministic core and the balance harness

Fixed timestep. Seeded RNG throughout. Command queue. Replay from seed plus log.

Build `tools/sim-cli.ts`:

```
npm run sim -- --map=crossroads --a=aggro --b=turtle --runs=50 --seed=1
```

Bot profiles are pluggable strategy objects, not hardcoded loops. Output win rate, median time to win, and time-to-win spread. Write results to CSV.

Done when: the same seed and command log produce byte-identical final state hashes across 20 runs, and a five-map by four-bot matrix runs in under 30 seconds.

### M2. Camera, input adapters, responsive layout

This is the biggest structural change and the one that decides whether desktop feels real.

**Camera.** World coordinates in 8px tiles. Camera has x, y, and integer zoom (1x, 2x, 3x, 4x) so pixels stay crisp. Clamp to map bounds. Smooth follow when jumping to a location.

**Mobile, portrait first.** Default zoom fits map width. Drag on empty ground is box select. Two-finger drag pans. Pinch zooms. Tap selects, tap again on the same unit deselects. A base button snaps the camera home. Command buttons stay in the bottom third for thumb reach. Minimum touch target 44px.

**Desktop, landscape.** Left drag box selects. Right click issues move or attack. Middle drag or space plus drag pans. Wheel zooms toward the cursor. Edge pan optional and off by default. Hotkeys: number keys for build slots, Ctrl plus number to set control groups, number to recall, Tab to cycle selected unit types, F to focus base, Space to pause. Show a keyboard hint panel that can be dismissed.

**Layout.** Mobile is a vertical stack: HUD, viewport, message line, build strip, command grid. Desktop puts the viewport center, a command panel on the left, a minimap top right, and a wider build strip. Same components, different arrangement. Add a minimap on both, small on mobile. Test at 1920x1080 and at a half-width browser window, since narrow landscape is where layouts break.

Done when: both input schemes drive the same command layer with no branching inside the sim, and the game is genuinely playable one-handed in portrait and with mouse and keyboard on a desktop browser.

### M3. Get it onto my phone

Small milestone, high value. I want this on my phone home screen while the rest of the work happens, not at the end. Playing it on a phone in week three changes what I notice about it.

- PWA setup with `vite-plugin-pwa`. Manifest, icons, offline-first service worker.
- Deploy somewhere I can reach from my phone. GitHub Pages, Vercel, or Cloudflare Pages, whichever is least ceremony. Tell me which you picked and why. A public but unlisted URL is fine.
- Verify install and full screen launch on my phone. Tell me which platform you tested and what did not work.
- GitHub Actions on push: typecheck, tests, build. Nothing more elaborate than that.

Done when: I can install it from a link, put my phone in airplane mode, and play a full match.

### M4. Performance

The prototype has three known bottlenecks. Fix all three and measure before and after.

1. **Sprite drawing.** Every unit is drawn pixel by pixel with `fillRect`, 64 calls for an 8x8 sprite. At 200 units that is 12,800 fill calls per frame. Prerender each unit type crossed with each team color into an offscreen atlas at startup, then `drawImage`. This is the single biggest win.
2. **Unit separation.** Currently an O(n squared) pairwise loop over all units. Replace with a spatial hash keyed on grid cells sized to twice the largest unit radius.
3. **Target acquisition.** Each unit scans every hostile unit, building, and base every tick. Reuse the spatial hash. Cache the hostile list per slot per tick instead of rebuilding it inside the per-unit loop.

Also: flow fields recompute for all slots whenever any building changes. Mark dirty per slot, throttle recomputation to at most once every 15 ticks, and skip slots with no living enemies.

Done when: 5 slots, 300 units, and 200 buildings hold 60fps on a mid-range phone, and the headless sim runs at least 200x real time.

### M5. AI rewrite

The current AI picks units from a weighted random table and pushes on a timer. Difficulty is mostly an income multiplier. That is the cheapest possible version of difficulty and it is the reason balance testing is noisy.

Build a real strategy layer running at 2Hz:

- **Assess:** own income, gold banked, army value, enemy army value and composition, mines held versus contested, threat level near own base.
- **Behaviors:** expand to an uncontested mine, defend when threatened, mass until army value exceeds a threshold relative to the nearest threat, push in a grouped wave from a rally point, harass an undefended mine with fast units, retreat when a fight is lost.
- **Composition:** buy against what the enemy actually fields. Build a counter matrix and use it. Propose the matrix to me before you implement it.
- **Difficulty scales decision quality, not just money.** Easy: slow reactions, no counter-buying, never retreats, small income penalty. Standard: reacts in a few seconds, loose counters. Hard: fast reactions, counter-buys, retreats, defends mines. Extreme: fast, counters, retreats, multi-prong attacks, expands aggressively. Keep a small income modifier as a secondary lever, not the main one.

Done when: across the map pool, Extreme beats Hard beats Standard beats Easy in head-to-head bot matches with a clear separation, and no single player strategy wins more than 70% or less than 30% against Standard.

### M6. Command depth

Everything here is required by Conquest and improves Skirmish on its own. Build it before the persistent mode, not after.

- **Retreat as a real action.** Select, pull back, units disengage and move rather than trading final blows. Skirmish never needed this. Conquest is unplayable without it, because army persistence without retreat just means losing everything slightly slower.
- Rally points per base. Production queue with a visible queue strip and refunds on cancel.
- Control groups on desktop, saved unit selections on mobile.
- Selection feedback: hover states on desktop, a selection info card showing count and composition.
- Units heal over time near a friendly base, faster with a worker or medic present.

Done when: I can hold a defensive line, pull a damaged group out of a losing fight, send it home to heal, and queue replacements while it travels.

### M7. Conquest, vertical slice

The persistent territory mode. Read `docs/conquest.md` in full before starting. Build only the slice defined in that document, nothing more.

The slice exists to answer one question: does taking a region and having to hold it feel meaningfully different from winning a skirmish. Build it, then stop and let me play it before writing anything else. If the answer is no, we redesign rather than continue.

Done when: I can take a region from a rival, watch my income go negative from upkeep, pull back to consolidate, save, quit, reload, and continue.

### M8. Conquest, full build

Only after the slice proves out. Expand in the order given at the end of the conquest document: unrest, then neutrals, then materials and population, then the full settlement tiers, then veterancy, then diplomacy, then the territory list and auto-pause, then multiple rivals.

Stop after each of those for me to play it. This is a long milestone and the sequencing exists so that we find problems while they are still cheap.

### M9. Polish

Last, deliberately. Polishing systems that Conquest is about to change is wasted work.

- Damage numbers optional in settings. Screen shake on base destruction. Better death and explosion effects.
- Audio via a small WebAudio synth. No sound files. Attack, death, build, capture, warning, victory, defeat. Master volume and a mute toggle that persists. Audio on mobile needs a user gesture to start, so handle the unlock properly.
- Settings screen: volume, damage numbers, edge pan, keyboard hints, colorblind-friendly team palette.
- Stats persistence through the storage adapter: games played, win rate per mode and difficulty, fastest win.

If the Conquest slice turns out to be something I want to live in, tell me and we pull audio forward ahead of M8.

## What we are deliberately not building

Do not build any of these. All of them are about distribution and platforms, not about the game itself. Each line names the one decision, already in the milestones above, that keeps the door open. If you find yourself about to write something that closes one of these doors, stop and tell me.

- **Native mobile app.** Kept open by: relative asset paths, no network dependency, everything bundled. A webview wrapper becomes a config change rather than a port.
- **Desktop app and store distribution.** Kept open by: the same bundling rules, plus the storage adapter, which can be routed to real files without touching game code.
- **Gamepad and controller play.** Kept open by: the command layer. Input schemes produce commands and nothing in the sim knows where a command came from.
- **Multiplayer.** Kept open by: determinism plus the command log. Lockstep netcode stays reachable. Do not add anything that reads wall-clock time, unsynchronized randomness, or local-only state into the simulation.
- **Server-side or cloud anything.** Kept open by: `src/sim/` running under Node with no browser globals.

Conquest, the persistent world mode, is not on this list. It is planned work, it is M7 and M8, and it is specified in `docs/conquest.md`. Five small structural changes in M0 through M5 are listed at the end of that document. Apply those as you go, and do not start the mode itself before M7.

## Design questions I want your answer on, not your assumption

Bring these to me as proposals with your recommendation. Do not decide silently.

1. **The unit roster is too big.** 21 units with no legible counter system is why balance is noisy and why the build strip needs scrolling on mobile. Propose a cut to 12 to 14 units with an explicit counter triangle. Tell me what each unit is for in one sentence and what beats it.
2. **Wave-based AI attacks versus continuous pressure.** The current timer-driven wave system is readable but artificial. Propose what replaces it.
3. **Fog of war.** Off by default, a mode toggle, or not at all. Give me the cost and the argument.
4. **Map size versus mobile screens.** The largest map is 30x42 tiles. With a camera, maps could go bigger. Tell me where portrait play stops working.
5. **Conquest risk.** As you work through M0 to M6, keep a running list of anything you build that you expect Conquest will force you to rework. Flag it at each milestone boundary rather than at M7.

## Working agreement

- Read `legacy/pixel-war-v3.html` in full before writing code.
- One milestone per working session. Report and stop at each boundary.
- Commit in small, working increments with plain messages.
- Every milestone ends with tests passing and the game running. No broken intermediate states on main.
- When the prototype's behavior is unclear, ask rather than guessing. When you find a bug in the prototype, tell me before you fix it, since some of it is deliberate.
- Do not add dependencies without asking.
- Do not add analytics, telemetry, ads, or monetization hooks.
