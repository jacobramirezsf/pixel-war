# Legacy prototype

The single-file prototype that this project is being built from. Read `pixel-war-v3.html` in full before writing any code. It is the specification for behavior, not for structure.

## Files

**`pixel-war-v3.html`** is the current build and the one to port. Open it in a browser to play it. Roughly 1800 lines, no dependencies, no build step.

**`pixel-war-v2.html`** is the previous version, kept only as a reference. It is two-player only, with no alliance system, no difficulty levels, and no multi-team mode. If something in v3 looks wrong, v2 is where to check what it used to do. Do not port from it.

## Verification status

Everything in v3 has been verified headless. The assertions live in `tests/` and all of them pass against `pixel-war-v3.html` as committed:

- All five modes start and run without error.
- Difficulty levels produce measurably different AI output.
- Five-way free for all: all bases placed, all connected, eliminations fire correctly.
- Teams mode: allies never target each other.
- Elimination clears a slot's units and buildings and leaves the others intact.
- Mine capture and loss fire the float text, the message, and the income flash, and all of them expire correctly.
- Gates are two tiles, auto-orient, default locked, and pass their owner's units without taking damage.
- Workers repair damaged buildings.
- Sandbox mirror and replay preserve gate orientation and lock state.
- Map code export and import round trip.
- Campaign is winnable by a competent bot and not winnable by a blind rush.

## Running the tests

The prototype is one HTML file, so the harness extracts the script and runs it against a Proxy-based DOM stub. Node 18 or newer, no install step:

```
sed -n '/<script>/,/<\/script>/p' pixel-war-v3.html | sed '1d;$d' > /tmp/g.js
node tests/modes-multi-mines.js
node tests/mine-feedback.js
node tests/gates-worker-balance.js
```

`tests/stub.js` reads `/tmp/g.js`, so the extraction step has to run first.

## What to do with these tests

Port the assertions, not the harness. In M0 they become the parity suite: the ported code should satisfy every one of them. Once `src/sim/` runs under Node with no browser globals, the DOM stub becomes unnecessary and `stub.js` gets deleted.

## Known issues, do not treat as spec

- **Balance is looser in v3 than in v2.** A competent bot wins 4 out of 4 maps against Standard difficulty in v3, against 11 of 15 in v2. Something in the multi-slot generalization or the fort orientation change made Standard easier. Do not tune around this. The AI rewrite in M5 replaces the system that causes it.
- **Difficulty mostly scales AI income and fort tier**, not decision quality. This is a known weakness and M5 is the fix.
- **The `wave` timer drives AI attacks.** It is readable but artificial. Flagged as an open design question in the brief.
- **`Math.random()` is called throughout**, including inside spawning, AI selection, and effects. M1 replaces all of it with a seeded PRNG.
