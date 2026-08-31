# Pixel War: Conquest mode design

Addendum to the build brief. This is the persistent world mode and it is the eventual point of the project. It is milestones M7 and M8, built after the foundation is in place, because it depends on all of it: determinism for saves, the camera for a world this size, the performance work for the unit counts, the AI rewrite for faction behavior, and the command depth work for retreat. The last two sections are the parts to act on before then.

Rename the current 1v1 mode to **Skirmish**. This mode takes the name **Conquest**.

---

## What it is

One continuous world map. You start with a single settlement in a corner of it. You build it up, raise an army, and take the territory next to you. What you take, you keep, and keeping it costs something. Rival factions are doing the same from their own corners. The game ends when one of you is the only one left holding anything that matters.

Nothing resets between fights. The army that took a territory is the same army that has to hold it, with the same losses.

## The decision this mode exists to protect

Skirmish has one real decision: spend gold well. Units are free to replace because the match ends. That is why the current combat encourages throwing bodies at problems.

Conquest has to make a different decision the center of the game: **is this worth taking, and can I hold it once I have it.** Every system below exists to keep that question live. If a system does not put pressure on that question, cut it.

The failure state to design against is the one every 4X falls into: expansion is always correct, so the game becomes a chore of clicking claim on everything until the map is yours. The counter-pressure has to be real and it has to be felt early.

## World structure

**One map, not two layers.** No strategic overworld that loads into tactical battles. The world is a single tile grid, the same 8px tiles the engine already uses, and you pan across it with the camera from M2. A fight in the north happens on the same grid as your capital in the south.

This is the harder version and it is worth it. A layered map turns the game into Total War with pixel sprites. A continuous world makes the geography mean something: the pass between two rock ridges is the pass, every time, and the wall you built across it three hours ago is still there.

**Size.** Start at 160x160 tiles and see how it plays. That is 25,600 tiles, roughly twenty times the current largest map. It should feel like it takes real time to cross.

**Regions.** The world is divided into named regions of roughly 12x12 tiles, drawn irregularly along terrain features rather than as a grid. A region is the unit of ownership, upkeep, and unrest. Roughly 100 to 140 regions on a 160x160 world.

Regions are not visible as hard borders during normal play. Show them as a colored tint at the edges of controlled land, and as clear outlines when the territory overlay is toggled on. The world should read as a world, not as a board.

**Simulation scope.** The whole world does not simulate at full detail. Three levels:

- **Active:** any region containing units of two hostile factions, or any region the camera is looking at. Full simulation, every tick.
- **Warm:** regions containing units of one faction, or adjacent to an active region. Simulated at reduced rate, roughly every 6 ticks. Movement and production, no per-unit combat resolution needed.
- **Cold:** everything else. Resource accrual and unrest ticked at 1Hz from aggregate numbers. No individual unit simulation.

A region promotes to active the moment hostile units enter it. This is the whole reason determinism from M1 matters here: a cold region has to produce the same result whether it was simulated in aggregate or in full.

## Territory

**Claiming.** A region becomes yours when you place an outpost inside it and no hostile units contest it for 30 seconds. Contested regions show as striped in both colors and produce nothing for anyone.

**Losing.** A region flips when an enemy destroys or captures every settlement structure you have in it and holds it uncontested for 30 seconds. Buildings do not automatically transfer. Walls and towers become neutral rubble unless the attacker spends materials to repair them, which is a good reason to raze rather than capture when you cannot afford to hold.

**Connection.** Every region must trace a path through your own contiguous regions back to your capital. A region that cannot produces nothing, its unrest climbs at triple rate, and its garrison stops receiving reinforcement. Show broken connections clearly on the territory overlay.

This one rule does most of the work. It means a raiding party that slips behind your front line and takes one region in the middle can strangle six behind it. It makes the shape of your holdings matter more than the size.

## Settlements

Four tiers. Each is a real structure on the map with a footprint, hit points, and a build time, not a menu entry.

| Tier | Cost | What it does |
|---|---|---|
| **Outpost** | Cheap, fast | Claims the region. Tiny garrison cap. No production. Falls easily. |
| **Village** | Moderate | Produces gold and population. Unlocks walls and basic units in this region. |
| **Fortress** | Expensive | Adds materials production, towers, and a large garrison cap. Reduces unrest in adjacent regions. Repairs and heals units stationed here. |
| **City** | Very expensive, long build | Full production. Unlocks advanced units. Projects control two regions out, cutting their garrison requirement. |

Upgrades happen in place and take real time, during which the settlement is vulnerable and its production drops. Upgrading a border village into a fortress while a rival is massing nearby is a decision with a cost, which is the point.

You start with one Village and enough resources to make an early choice between upgrading it or expanding.

## Resources

Three, because one resource makes every decision a single efficiency calculation.

**Gold.** From settlements and captured mines. Pays for units and upkeep.

**Materials.** From quarries and forest regions. Pays for walls, towers, and settlement upgrades. Keeping materials separate from gold is what stops fortification and army from being the same decision. You should regularly have the stone to wall a border and not the gold to man it.

**Population.** Not spendable. A cap. Settlements generate population capacity, units consume it. This replaces the current arbitrary unit cap with something that grows as you build, and it gives cities a reason to exist beyond better income.

**Upkeep.** Every unit and every non-wall building drains gold per second. Net income displays prominently and goes red when negative. Sustained negative income causes desertion: units are removed starting with the most expensive. This is the hard stop on over-expansion and it needs to be legible well before it bites. Warn at 60 seconds of reserves remaining.

## Holding what you took

Three pressures, all visible on the territory overlay.

**Garrison requirement.** Each region needs a minimum garrison value based on its tier and its exposure. Interior regions need little. Regions bordering hostile territory need substantially more. A fortress or city nearby reduces the requirement.

The effect worth designing for: a compact blob is cheap to hold, a long spike of territory is expensive. The player should learn this by feeling it, not by reading it.

**Unrest.** Rises when garrison is below requirement, when connection is broken, and immediately after conquest. Falls with garrison presence, with a nearby fortress or city, and with time. At maximum, the region revolts: it goes neutral and spawns a rebel force sized to what you failed to garrison.

Newly conquered regions start at high unrest and settle over several minutes. This is what stops a blitz from working. You can take five regions in a rush, and then all five revolt behind you.

**Attrition.** Units in enemy or neutral territory lose health slowly. Units in your own territory hold. Units at a fortress or city heal. Deep raids are possible and they cost you.

## Armies that persist

This is the biggest change to how combat feels, and most of the emotional weight of the mode sits here.

**Units survive between fights.** A soldier you bought in the first ten minutes can still be alive at the end. Losing twelve units is a real setback, not a spending decision.

**Veterancy.** Units gain rank from kills. Three ranks, each a small stat bump and a visible marker on the sprite. Keep the numbers modest, maybe 10% per rank. The purpose is attachment, not power. A rank three crossbow line you have kept alive for an hour should be something you are reluctant to spend.

**Retreat has to work.** Skirmish never needed it. Conquest requires it as a first-class action: select, pull back, units disengage and move rather than trading final blows. Without a functioning retreat, army persistence just means losing everything slightly slower.

**Healing and repair become core.** Medics and workers stop being niche picks. Settlements repair stationed units over time. This is a reason to rotate a damaged army home rather than pushing one region further.

## Time and pacing

Real time, with control.

**World speed.** Adjustable, defaulting slow. When nothing is contested, the world should tick slowly enough that you can think, plan a build, and move an army without pressure. Speed controls at 1x, 2x, 4x, plus pause.

**Auto-pause on events.** Configurable, on by default for: a region of yours is attacked, unrest crosses a threshold, a settlement finishes building, net income goes negative, a rival declares war. This is what makes the mode playable without staring at it, and it is not optional on mobile.

**Combat runs at normal speed.** When you zoom into a fight, it is the RTS that already exists, at the pace it already has. The world slows down, the battle does not.

## Rivals and neutrals

**Rival factions.** Two to four, each starting with a capital in their own corner and expanding under the same rules you do. They pay upkeep, they suffer unrest, they lose regions to revolt. The AI strategy layer from M5 handles a faction rather than a single base, which is why that milestone has to anticipate it.

Rival behavior should not be constant aggression. A faction that expands into neutral land, consolidates, and attacks when it has a real advantage makes a much better world than one that throws units at you on a timer.

**Diplomacy, kept small.** Each rival holds an attitude value toward you, shifted by proximity, relative strength, shared enemies, and your actions against them. Three states: war, truce, peace. Truces can be offered and broken. No trade menus, no treaty screens. If it needs more than one panel, it is out of scope.

**Neutrals matter for pacing.** The first twenty minutes should not be faction war. Populate the world with:
- Bandit camps that raid nearby regions until cleared, and drop resources when destroyed.
- Independent villages that can be conquered, or absorbed peacefully at a gold cost, joining with their existing buildings intact.
- Ruins that grant materials or a one-time unit when claimed.

These give you something to do with a small early army and they make the map feel inhabited rather than empty.

## Win and loss

**Win:** hold every rival capital, or control 60% of the world's regions continuously for five minutes. Offer both, since one rewards conquest and the other rewards consolidation.

**Loss:** every settlement you own is gone. Losing your capital is a crisis, not a defeat. You can retake it. A mode about persistence should not end on one bad fight.

## Saving and sessions

Manual saves plus a rolling autosave every two minutes and on backgrounding. Save is world state, not a command log, since a Conquest game will run for hours and replaying from tick zero is not viable.

This is where the storage adapter from M0 earns its place. The same save code writes to localStorage in the browser today, and to real files in a desktop build later, with no change to game code.

## Mobile

The real risk in this mode is that management-heavy games are painful on a phone. Three things prevent that:

**A territory list, not just a map.** A scrollable panel of cards, one per region, showing tier, garrison versus requirement, unrest, and net contribution. Sorted by whatever is most wrong. Tapping a card moves the camera there. On a phone this is often better than the map, and it should be a first-class view rather than a fallback.

**An event queue.** A list of what needs attention, each item tapping through to the place it happened. Combined with auto-pause, this means putting the phone down for two minutes does not lose you a province.

**Resumable everything.** Save on background, restore on open, no penalty for a five-minute session.

Build the territory list view at the same time as the map view, not after. If the mode is only playable by reading the map, it is not playable on a phone.

---

## Build it as a vertical slice first

Do not build the full design. Build the smallest version that proves the loop is worth having, then expand. If the slice is not fun, the rest of the design is not worth writing.

**The slice:**
- 40x40 world, 9 regions.
- One rival faction with one capital.
- Village and Fortress tiers only. No Outpost, no City.
- Gold only. No materials, no population. Unit cap stays fixed.
- Upkeep on. Connection on. Garrison requirement on. Unrest off.
- Army persistence on. Veterancy off. Retreat working.
- No neutrals, no diplomacy, no auto-pause.
- Save and load working.

That is enough to answer the only question that matters: does taking a region and having to hold it feel meaningfully different from winning a skirmish. Play it before building anything else.

Add in this order after the slice proves out: unrest, then neutrals, then materials and population, then the full settlement tiers, then veterancy, then diplomacy, then the territory list and auto-pause, then multiple rivals.

---

## What to change in the earlier milestones, starting now

These are cheap now and expensive later. Fold them into the milestones where they belong. Conquest itself stays parked until M0 through M5 are done.

**M0.** A faction owns a collection of settlements, not one base. Model it as `slot.settlements[]` from the start, even though Skirmish will only ever put one entry in it. The prototype's `S.bases[slot]` plus `elim(slot)` on base death is the assumption that would force a rewrite of combat, win conditions, and AI targeting later. Change it now while it is a one-line collection instead of a refactor.

**M0.** World snapshot and restore must be complete and lossless, not partial. Test it: snapshot, restore, run 600 ticks, compare against a run that was never interrupted. Save and load in Conquest is this exact code.

**M2.** The camera cannot assume the map fits on screen at any zoom level. It already will not for a 160x160 world. Also design the minimap for a world twenty times the current largest map, which means it needs to render from region-level aggregate data rather than per-tile.

**M4.** Global flow fields do not survive a 160x160 world. A Dijkstra pass over 25,600 cells for every faction on every building change is not viable. Plan for scoped pathing: local flow fields around active engagements, plus coarse region-to-region routing for long moves. Do not build the hierarchical version yet, but do not write anything in M4 that assumes one global field per faction.

**M5.** Write the AI strategy layer against a faction with multiple settlements and multiple fronts, not against one base. The assess-and-decide loop should already take a list of holdings. Skirmish passes it a list of one.

---

## Questions I want answered before you build the slice

1. **Region claiming.** Is placing an outpost the right verb, or should regions flip on control of the ground itself, the way mines currently work? The outpost version is clearer and gives the enemy something to destroy. The control version is smoother and needs no new structure. Give me your read.
2. **Where the pressure lands first.** Between upkeep, connection, garrison, and unrest, which one should a new player run into first, in the first fifteen minutes? Pick one to be the teacher.
3. **Combat scale.** With army persistence, are the current unit costs and hit points right, or does a persistent army want slower, heavier fights? My guess is fights need to last longer so that retreat is actually a decision rather than a reaction.
4. **Does Skirmish survive?** If Conquest becomes the main mode, is Skirmish still worth maintaining as a separate thing, or does it become a small custom-match option off the Conquest map? Tell me what it costs to keep both.
