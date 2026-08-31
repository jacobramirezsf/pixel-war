# Pixel War

A pixel-art real-time strategy game. Vanilla TypeScript, Vite, canvas 2D. Runs in a desktop browser and installs on a phone as a web app.

## Play it

Live build: https://jacobramirezsf.github.io/pixel-war/ (GitHub Pages, deployed by CI on every push to main).

On a phone, open that link, then add it to the home screen:

- iPhone (Safari): Share, then "Add to Home Screen". It opens full screen and works in airplane mode after the first load.
- Android (Chrome): the menu, then "Install app" or "Add to Home screen".

To play a local build on your phone without deploying, run `npm run dev -- --host` and open the LAN address it prints (something like `http://192.168.1.20:5173`) on the phone. Both devices need to be on the same network.

## Run it

```
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/index.html, self-contained, opens from disk
npm run preview    # serve the build
npm run typecheck  # app and sim, sim checked with no DOM lib
npm test           # node:test, no test framework
npm run check      # typecheck, test, build
```

Node 22.6 or newer. Tests and tools run TypeScript directly through Node's type stripping, so there is no build step for them.

## Layout

```
src/sim/        the simulation. No DOM, no canvas, runs under Node.
src/data/       unit, building, difficulty, map, and team tables.
src/render/     canvas drawing.
src/ui/         HUD, menus, input. Plain DOM.
src/platform/   storage adapter. Game code never calls localStorage directly.
test/sim/       parity, smoke, and snapshot tests.
tools/          dev tools. browser-shot.ts drives headless Chrome for screenshots.
legacy/         the single-file prototype this was ported from, and its tests.
docs/           design documents. conquest.md is the persistent world mode.
```

`BRIEF.md` is the build brief and milestone list.

## Rules that hold everywhere

- The sim is deterministic. One seeded PRNG, no clocks, no `Math.random`. A test scans `src/sim` and `src/data` for browser globals and fails if it finds any.
- Snapshot and restore are lossless. A restored world runs identically to one that was never interrupted.
- All player and AI actions go through `src/sim/commands.ts`.
- Relative asset paths. The build is one HTML file with the script, styles, and fonts inlined so it runs from `file://`.
- No runtime dependencies. Dev dependencies: vite, typescript, @types/node.

## Font

IBM Plex Mono, SIL Open Font License. Files and license in `src/assets/fonts/`.
