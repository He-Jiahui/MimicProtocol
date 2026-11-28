# Implementation Plan for Notes 25 to 63

Status: Adopted plan. Updated: 2026-11-27. Requirements: R-01 to R-13, D-06, D-19 to D-22.

[Back to index](README.md) | Previous: [63 What the Operator Wears](63-what-the-operator-wears.md)

Notes 25 to 63 are research and proposals. This page says which of them the build follows, what was changed when they were reviewed against the code, and the order of work. Where a note left a number open, the starting value used in the build is given here and marked **(start)**: it is a tuning guess, not a tested result. Each work package lands as its own commit.

## 1. Decisions taken on review

| Topic | Decision | Why |
| --- | --- | --- |
| Shared Charge and Overdrive | Retired. Each class gets its own resource (section 3, package 2). Brands and the Consume event stay. | [28](28-class-resource-loops.md), [55](55-where-a-resource-lives.md) and [56](56-four-kits-beyond-charge.md) agree the bar is usually full and decides nothing. |
| Clean dodge | Pays back 40% of the S cooldown still running, plus a class payout (package 2). Only telegraphed strikes and projectiles count; pools and fire trails do not. | The Charge payout is gone, and rolling through acid should not be rewarded. |
| Damage maths | One pipeline, from [53](53-calculating-raid-stats-and-damage.md): like bonuses are summed into one pool and applied once. [30](30-staged-damage-calculation.md) follows it. | The code multiplied every line, so stacked gear grew without bound. |
| Gear ceiling | Gear may add at most +150% to any one damage pool. | [06](06-run-growth-roguelite.md) caps the gear layer at 2.5; a +8 Legendary alone reached +128%. |
| Worn slots | Six: weapon, head, body, hands, waist, shoes. No sidearm in the demo. The rig's lines move to the head; the backpack stops being worn. | [63](63-what-the-operator-wears.md), less the sidearm, which has no button or behaviour in this build. |
| Field pack | One grid of cells (starter 4 by 4), from [61](61-packing-for-the-walk-out.md). The bag "places" of [38](38-field-bags-and-stash-appraisal.md) are regions of that grid. | A list of slots cannot say whether a 2 by 2 parcel fits. |
| Found equipment | Always sealed: only quality and Item Power show. Slot, name, Prime and value are hidden until Process. Every sealed piece is 2 by 2 cells and 3 kg. | [63](63-what-the-operator-wears.md). The HUD leaked slot and value before. |
| Death | Worn kit is kept, with wear. The pack and its cargo are lost unless an assigned Insurance Drone lifts whole pieces ([62](62-what-the-insurance-drone-brings-home.md)). | Replaces the case that kept the two most valuable items. |
| Raid Credits | One at-risk balance. Broker sales pay Credits, not banked Cash. Unspent Credits convert to Cash at 50% **(start)** on extraction only. | [60](60-what-makes-loot-worth-extracting.md): a prize banked in the street removes the walk out. The code converted nothing. |
| Lab Samples and Boss Cores | Stay counters in the demo, not cargo. | Keeps the first pack-grid pass small. |
| Level-up draft | Kept. Run items follow the limits of [59](59-what-a-raid-item-can-do.md). The six Charge items are removed. | The draft is the build's roguelite growth; [18](18-demo-classes-elites-and-items.md) is out of date in saying there is none. |
| Lurker | The disguised elite the director already rolls. The Husk role called "lurker" in `behave.js` is renamed "stalker". | One word, one meaning ([37](37-lurkers-among-civilians.md)). |
| Disguised figures | 40 health. Only a deliberate aimed hit can damage a civilian or a disguise; the finishing hit reveals. Piercing rounds stop at the first human-looking body. | [37](37-lurkers-among-civilians.md), [53](53-calculating-raid-stats-and-damage.md). |
| Height | One model from [29](29-presentation-creatures-and-city-terrain.md): a floor height per cell, steps of 0.5 m or less are walkable, taller edges are walls from below. Network streets stay at 0. | Six notes asked for height on a flat grid and none shared a model. |
| Map families, crossings, the Descent Ward, the soldier and Herald bosses | Not in this pass. | Each is a new authored map or boss; the pass spends its budget on depth in the one district. |

## 2. Older statements these notes replace

The pages below are left as written. Where they disagree with this page, this page is what the build does.

| Page | Statement no longer followed |
| --- | --- |
| [02](02-core-loop-and-raid-structure.md) sections 5, 7, 8; [08](08-loot-contamination-and-legendary-gear.md) sections 4, 6; [15](15-web-demo-scope-and-overrides.md); [19](19-demo-core-loop-and-progression.md) | Insured items, the secure case, "lost unless insured" for worn gear, broker proceeds banked at once |
| [08](08-loot-contamination-and-legendary-gear.md) sections 1, 7; [23](23-demo-boss-loot-and-drops.md) sections 3, 6; [26](26-equipment-loot-reference-brushwild.md) | The four-slot kit, identified container gear, names or Prime tells on sealed pieces |
| [09](09-world-structure-and-buildings.md), [17](17-demo-raid-map-time-and-zones.md), [20](20-demo-in-raid-events.md), [21](21-demo-contracts-and-sector-states.md) | The 3.2 km map, 16 sectors of 800 m, event anchors 150 m apart, walkable sky bridges and roof jumping |
| [18](18-demo-classes-elites-and-items.md), [24](24-skill-resource-and-synergies.md) | Charge, Overdrive, the Charge run items and Aspects; "no level-up draft" |
| [22](22-demo-bosses.md) | The Herald on a 90 m rooftop crown; cyst and Hollow counts that differ from `boss.js` |
| [00](00-vision-and-pillars.md) R-02, [11](11-rendering-and-visual-style.md) | "Strong bloom" and "wet everything": [43](43-a-street-in-the-rain.md) asks for restrained bloom and dry ground under cover |

## 3. Work packages, in order

### Package 1: one damage pipeline (53, 30)

1. **Base.** `B = param x brand x share`. Brand terms are read at contact: Piercing Line `1 + 0.25 x Suppression`, summon shots x1.4 on a Marked target, Wither ticks `1 + 0.2 x Venom`. Share is the power of a copied cast.
2. **Pool.** `O = B x (1 + sum)`. Every percentage line enters once: weapon damage, raid level (2% a level to level 10), Mimic Heart, then by damage type skill, M2, melee, damage over time or summon lines. Item stacks resolve through `stackStat` first. Gear's part of the sum is capped at 1.5.
3. **Crit.** Not on ticks. Chance `min(1, 0.05 + gear)`, factor 1.75. A copy of a hit that already rolled does not roll again.
4. **Recipient.** `O x stagger x (1 + vulnerability sum) x (1 - mitigation)`, then barrier. Catalyst-style vulnerability sums with the Matron's torn state; stagger stays its own factor. The Armored plate absorbs half of a hit but never more than the plate has left.
5. **Event.** Remove the Brand, then follow-ups (bursts, Rupture, chains) restart at stage 1 with their own base. A copy never makes another copy.

Rates divide: `interval = base / (1 + sum of rate bonuses)`, for attack interval, cooldowns (rate bonus from gear capped at +100%) and search time. The "Spender damage" affix applies to M2 only.

### Package 2: four class resources (28, 50, 51, 55, 56)

No M2 costs Charge. M2 cooldowns become Rifleman 5 s, Blade 4 s, Summoner 3 s, Toxic 5 s. R no longer opens Overdrive. Every new effect skips figures that are not valid targets and pays nothing for them.

- **Rifleman: cells and the mark burst.** Cells 0 to 3, shown as pips at the reticle and on the HUD. One cell per 24 landed M1 rounds **(start)**; splash and Barrage rounds do not count; no decay; start at 0. M2 keeps its line; each body hit that carries Suppression bursts for `20 x (1 + 0.25 x stacks)` within 2.5 m, replacing the ricochet. While M2 is on cooldown, pressing it spends a cell and fires at once. R takes every cell: for each, the next four Barrage rounds that strike a Suppressed body burst the same way. Clean dodge: 8 rounds of cell progress.
- **Blade: momentum, Exposed and the fragment.** Momentum 0 to 100, an arc at the reticle: +9 per enemy struck, at most two per swing; after 2 s without a hit it falls 25 a second. The third cut applies Exposed for 6 s and, if the target was not already Exposed, knocks a plate fragment 1.5 m beyond it (6 s on the floor, one per hostile, three at most, never from a disguised figure). M2 Whirl spends all momentum and travels `1 + 5 x momentum / 100` metres along the move input; an Exposed body it hits is consumed, shoved 4 m and takes 1.5 times damage. Touching a fragment, on foot or with Lunge, gives a barrier of 15% of maximum health for 4 s (refreshes, does not stack). R spends momentum for +0.5% damage a point. Clean dodge: +25 momentum.
- **Summoner: hardware and the radio.** Two sentries carried. M2 places one within 12 m facing the aim (range 18 m, half-arc 0.9 rad, no lifetime); M2 within 2 m of a sentry packs it; with none carried, M2 recalls the oldest, which returns after 4 s. The radio is a ready light with a 4 s recovery: when ready, a grenade also puts an Order on the hostile nearest the impact for 5 s, and the first sentry shot at it does +40% and bursts for 20 within 2 m. Marks give sentries a priority target and +40%, without the burst. S re-aims sentries within 8 m and speeds them up for 3 s. R sends three drones for 15 s; drones answer an Order only when no sentry covers it. Clean dodge: the radio is ready at once.
- **Toxic Handler: an infection worth rupturing.** Venom is unchanged (5 stacks, 6 s). A Wither Cloud's first tick on each living Venomed host ruptures it once per cloud for `0.7 x stacks x 3 x seconds left` and clears its Venom: about 13 from one fresh stack, 63 from five. R keeps the hopping plague but moves the leader's stacks one per hop instead of setting every host to five. Clean dodge: one Venom stack on every hostile within 4 m.
- **Gear and items.** The Charge affixes become "class resource gain" (cells, momentum, radio recovery, Venom duration) and "M2 damage"; "Max Charge" is dropped from new rolls and ignored on old ones. Aspects are restated against the new resources: Twinned repeats an M2 cast made at full resource; Siphoning pays a small resource tick per kill; Bulwark gives a barrier of 6% of maximum health per M2; Overclocked becomes -15% R cooldown; Primed starts the raid with the resource full; Scavenger is removed with the backpack slot. Capacitor, Overflow Valve, Feedback Loop, Catalyst, Afterglow and Echo Chamber are removed from the item pool.

### Package 3: combat feel and encounters (25, 34, 35, 37)

- **Brute charge lane.** A rectangle along the locked direction, half-width `body + operator + 0.4` m, length to the first wall or 16.25 m. "Overextended" shows during its recovery (2.0 s after a wall, 1.3 s otherwise). A plated Brute takes 70% less from hits inside 60 degrees of its facing unless a single hit exceeds 12% of its maximum health **(start)** or it is recovering; the plate rings, it never flashes immune.
- **Warning length.** Normal 1.0, Longer 1.35, Longest 1.8, resolved once when the enemy commits and used for the wind-up, the floor shape, the off-screen cue and the hit. Chain Roar stretches only its lead-in. Never stretched: projectile flight, pools, recovery, dodge invulnerability, the raid clock.
- **Hit-stop.** During a hold the simulation runs at 10% speed: 30 ms for a crit, 50 ms for a hit of 15% of maximum health or more taken, 80 ms for an elite kill or poise break, nothing for ordinary hits. The strongest wins; at most 100 ms per real second; one Shift press is kept through a hold; an Off setting.
- **Deliberate reveal and lurkers.** As decided in section 1. A lurker has one behaviour announced by a visible gesture: an aura, drawing civilians close to assimilate them, a close ambush, or stealing a radio and running. Revealed, it is an elite scaled to zone and hour with a better drop.
- **The Matron.** Her front is shelled (x0.3 inside her front arc unless one hit passes the heavy threshold); flanks take full damage; baiting a slam onto a brood sac staggers her. Sacs are shootable and burst into a venom pool after a warning. Venom on the operator is three separate statuses that never multiply each other: drain, slowed movement, and extra damage from fresh hits.
- **Pressure and exits.** A field job cleared at two stars or more adds an announced 20 s **(start)** per extra star to the horde's pressure timer, never to the clock. Conditional exits show their condition early and the Shelter Gate keeps its plain hold.

### Package 4: what the operator carries and keeps (26, 38, 57, 59, 60, 61, 62, 63)

- **Sealed finds.** Shown: quality word, Item Power, footprint, weight. Carry value and toasts use the sealed bid, `0.6 x` the expected identified value for that quality and Item Power **(start)**.
- **Six worn slots.** Base stat per Item Power: weapon damage 1.0%, head skill damage 0.9%, body health 1.2%, hands critical chance 0.12 points, waist health regeneration 0.02 a second, shoes movement 0.12% **(start)**. Old profiles migrate: the rig becomes head gear, a worn backpack becomes a pack. Profile version 2 reads version 1.
- **Field pack.** Starter 4 by 4, found packs 4 by 5 and 5 by 5; two quick-pocket cells. Footprints: sealed equipment 2 by 2; Ration Pack, Power Cell, Chips 1 by 1; Data Case, Ledger, Optics 1 by 2; Sensor Array 1 by 3; Medical Crate 2 by 2; medkit 1 by 1. Items rotate; what does not fit stays on the floor. Weight: 10 kg free, then 2.5% slower per kg, never below 75% of base speed **(start)**; loaded speed is shown before taking.
- **Endings.** Extract: kit, pack and cargo come home, Credits convert, contracts and bonuses pay. Death or curfew: kit kept, pack and cargo lost; an assigned drone lifts whole pieces that fit its bay plus Credits up to its allowance, chosen at debrief, and is spent. Courier drone: 2 by 2 bay, 150 Credits, 120 Cash. Hauler: 2 by 3 bay, 400 Credits, 300 Cash **(start)**. The street broker pays 80% of a piece's bid in Credits.
- **Hub.** Sell sealed or identified; Process reveals the existing roll and keeps the piece selected; comparison shows changed rows and rules gained and lost, never one score; stash pages of 40 with filters. Enhancing adds at most half the Cash spent to a piece's price; a reroll never raises it.
- **Wear.** Condition 0 to 100 on every worn piece that is not issue gear. A deployment costs 3; dying costs 6 more; the body piece also loses 1 per 100 damage taken, up to 8. At 25 or less the piece's base stat is x0.75; at 0, x0.5. Repair costs `(100 - condition) x (0.4 + 0.03 x Item Power x quality factor)` Cash **(start)**.
- **Raid items.** May change a direct stat for this raid or add an effect triggered by a deliberate aimed hit (a chain to a revealed hostile, a bleed, a burn patch). May not survive an ending, take pack cells, raise training, be triggered by ticks, sentries or copies, or touch a human-looking figure.

### Package 5: the look of the street (29, 31, 41, 43)

GGX specular with Fresnel in `lighting()`; wetness that varies, with dry ground under awnings and canopies; bloom lowered (strength about 0.34 to 0.46, prefilter threshold about 1.1) with the night rise kept; impacts that differ by material (sparks on metal, whitening on glass, a dark hole in plaster). Creature silhouettes that read from 36 m up and from the shoulder: the Brute's sunk head and squared back before a charge, the Skitter's open leg gaps and circling, the Bloat's sac swelling on wind-up. Disguised Mimics walk and dress exactly like civilians.

### Package 6: doors, vehicles, routes (31, 36)

Doors are cell objects with four states: closed, locked (needs a key; the route says why it stops), jammed shutter (hold to force, makes noise), dead lift (never opens). Parked vehicles are cover; a wreck's rear compartment is a container. New small containers: a biscuit tin, a lost-property basket. Route guidance: the player picks a known activity; a grid search with the step rule runs every 0.5 s; ground chevrons lead to the next turn and the minimap draws the line; the route stops at a known blocker and says why.

### Package 7: class levels, trees and training (27, 39, 52, 54, 58)

Class experience is kept on death. Experience from a raid is `20 x (raid level - 1) + 2 x kills + 30 x elites + 150 for a boss + 60 for extracting`; the next level needs `120 x level^1.4` **(start)**. One tree point per level to level 17. Each class tree has four branches (M1, M2, S, R); a branch is an Enhancement, then an exclusive pair, and one two-rank passive; later branches open at 0, 1, 3 and 5 points spent earlier. Refunds are free in the hub and validate what remains. The M2 exclusive pairs are the variants of [58](58-choosing-a-class-variant.md): Rifleman burst around the mark or discharge 12 m down the line; Blade fragment ahead of the cut or 2 m behind the operator; Summoner Post or Escort drones; Toxic rupture or refresh where cloud and pool overlap. Training: Handling, Conditioning and Systems, a starting split per class (primary 6, others 3) and one more point at class levels 3, 6, 9, 12, 15 and 18, converted once at deployment through `e x n / (1 + 0.1 x (n - 1))`. Handling: M1 rate 1.5% and search rate 3% a point. Conditioning: 3 health and 0.5 kg of free carry a point. Systems: summon and Venom duration 2.5% and terminal rate 3% a point **(start)**. Nothing found in a raid writes back to training.

### Package 8: height and the scenes that need it (29, 32, 44, 45)

`floor` per cell in 0.25 m units, from -8 m to +12 m. Walking, the flow field, charges, leaps and spawns obey the 0.5 m step rule; drops are one-way and cost 15% of maximum health for the first 4 m, 40% for the second and are lethal beyond **(start)**; enemies may drop but not climb. Shots are blocked by height. The ground is drawn as a height field with wall faces, and the cut-away follows the operator's floor. Scenes built on it, in order: the sunken quay and market street; the laundry court; the split-level tower with a records mezzanine, a breakable window and a descent line; the Matron's reliquary works, with her swing between landings.

### Package 9: flying threats (33)

Rounds and fliers carry a height and hits are tested in three dimensions. In the shoulder view camera pitch drives the muzzle; in the tactical view the aim takes the height of the target under the cursor. Fliers perch under the viaduct, dive with a wingbeat and a ground shadow, and must land within reach.

## 4. What was built

Status at 2026-11-28. "Built" means merged with tests passing; it does not mean tuned by play.

| Package | Status | Notes |
| --- | --- | --- |
| 1 Damage pipeline | Built | As specified. |
| 2 Class resources | Built | "M2 damage" counts every hit of the M2 cast, including sentry shots. Twinned, Siphoning and Primed are restated per class. |
| 3 Combat feel and encounters | Built | Every Brute is plated. The Matron's heavy threshold is 3% of her health. Three field jobs (clinic escort, evacuation van, quay relay) pay in stars; two or three stars move the horde's own timer forward 20 s a star past the first. Three exits are conditional: the Dock Boat needs the relay, the Rail Platform runs a timetable, the Rooftop Dropship answers a flare. Holding the relay ring stops the horde's clock, so nothing falls overdue. |
| 4 Carrying and keeping | Built | Pressing E takes everything that fits, most valuable first; single pieces are chosen in the bag screen. A found pack stays on the floor beside its container. Medkits are 1 by 1 cargo and only the quick pockets feed key 1. Hands, waist and shoes each have two Aspects. Affix rolls are saved, the top tenth of a range is Prime, strength prices a piece from 0.85 to 1.15, the Matron's signature Legendary is certain once and then 15% with pity, and a found drone comes home in a sealed 2 by 2 case. |
| 5 The look of the street | Built | Bloom 0.34 to 0.46 with a 1.1 threshold. Ground under cover stays dry. |
| 6 Doors, vehicles, routes | Built | Keys are a per-raid set, not pack cargo. Forcing a shutter brings two hostiles. |
| 7 Levels, trees, training | Built | Long Rail became the M2 passive and Return Circuit an M1 choice. Only the free training points can be reassigned. |
| 8 Height and scenes | Built | Quay, market street, laundry court, Records Tower and the Matron's Reliquary works. Ground is drawn as one shaded plane per level instead of slab tops. The works is a 60 m by 32 m winding hall laid along her lot's long side (the lot is 116 m by 44 m, so no street moved); the fight keeps one floor, and her swing is a marked crossing between six landings, out of reach while she hangs. The hall's roof is trusses and torn sheets, not a ceiling, so rain still falls inside. |
| 9 Flying threats | Built | The Shrike. Aiming at its shadow takes its height, which departs from note 33. |

Built since, outside the nine packages:

| Work | Status | Notes |
| --- | --- | --- |
| Command Hub as a place | Built | A roofed hall walked in the raid's own views (`src/sim/hubworld.js`). Six staff open one panel each: Relay, Threat Console, Armory, Containment Lab, Quartermaster, Barracks. Each panel offers only its station's verbs. The Deployment Lift deploys on a held interact, once the first-visit checklist is done. On touch the panels stack to one column and the prompt's Hold Use button talks; this was checked in an emulated phone viewport, not on a phone. |
| Interface style | Built | Every widget is a flat technical plate: one palette, sans capitals, monospace numbers, no bevel, glass, bronze or serif. |
| Four-class trip check | Measured | `node tools/trip.mjs 16`, bot data at Tier 1 with issue gear: Rifleman 11/16 trips out, Blade 14/16, Summoner 14/16, Toxic Handler 16/16. Against the Matron every class wins 4/4 with a mid-game kit; with issue gear Rifleman 3/4, the others 4/4. The Rifleman's bot is the weakest walker; that is a reading of the bot, not yet of the class. |

Not built: events and sector contracts (notes 21, 34), a second boss or map, co-op and PvP. Simplified Chinese for text added after 2026-11-27 is left to a separate pass: new keys carry English and are listed under the `TODO(codex)` block in `src/i18n/zh-CN.js`.

## 5. Checks for each package

Every package ends with `npm test` passing, new tests for its rules, a run of the tutorial and a raid in the browser with no console errors, and Simplified Chinese strings for any new text. A package that cannot be verified in the browser says so in its commit.
