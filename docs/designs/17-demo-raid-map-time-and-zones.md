# Demo Raid: Map, Time of Day and Zones

Status: Draft v0.1. Updated: 2026-11-25. Requirements: D-09, D-11, D-12, D-13, D-14.

[Back to index](README.md) | Previous: [16 Demo Tutorial and Hub Onboarding](16-demo-tutorial-and-hub-onboarding.md) | Next: [18 Demo Classes, Elite Affixes and Run Items](18-demo-classes-elites-and-items.md)

## 1. Map (D-11)

- Working name: Meridian South Sector (placeholder).
- Playable area 3.2 km by 3.2 km, in 32 by 32 blocks of 100 m. The longest insertion-to-extraction route is about 3 km. This is about 7 times the area assumed in [09](09-world-structure-and-buildings.md).
- Style regions (see [01](01-world-and-narrative.md)): Old Town Alleys in the south (insertion), Neon Strip in the middle, Arcology Heights and Corporate Plaza in the north, Dockside along the east edge.
- Lazy generation: the street graph, lots and zone field (stages S1 and S2) are built first, and only the insertion area is fully built before play. Other chunks are generated in a worker as the player approaches, with a prefetch ring of 7 by 7 blocks (see [10](10-procedural-generation.md)). Targets: first playable under 8 s; one 100 m block under 150 ms off the main thread (Proposal).
- Enterable buildings: about 35 percent of ordinary buildings, at least 40 on the map, covering at least 6 archetypes from [09](09-world-structure-and-buildings.md). At most 2 interior cells are loaded at once.
- The first raid uses one fixed district seed, with per-raid variation of loot, Hosts and spawns (Q-24).
- Extraction: 4 points, open for the whole raid while their sector is unlocked (see [21](21-demo-contracts-and-sector-states.md)). One is in the safe zone; the others are in zones 2 to 4 (a dock boat, a rail platform, a rooftop dropship). Only the nearest is marked at the start and Intel Terminals reveal the rest. Hold time is 6 s, as in [02](02-core-loop-and-raid-structure.md).

## 2. Time of day (D-12)

- The raid clock runs from 18:30 (dusk) to 02:00 (deep night), 7.5 game hours. One real minute is 15 game minutes, so a full clock lasts 30 real minutes (Proposal). At 02:00 Command cuts the link (curfew) and anyone not extracted counts as dead (Q-27).
- Night Level NL = (clock - 18:30) / 7.5 h, a continuous value from 0 to 1.
- Display bands: Dusk 18:30 to 20:30, Nightfall 20:30 to 22:30, Night 22:30 to 00:30, Deep Night 00:30 to 02:00.
- Look: the sky gradient fades, streetlights and signs rise, and bloom and rain strengthen with NL (see [11](11-rendering-and-visual-style.md)). The readability rules still hold at full night.

Effects of NL (Proposal). Each multiplies with the zone factor and the Threat Tier.

| Quantity | Formula |
| --- | --- |
| Monster health | x (1 + 0.6 NL) |
| Monster damage | x (1 + 0.4 NL) |
| Spawn budget rate | x (1 + 0.5 NL) |
| Elite share of spawns | zone base + 12 points x NL, plus 3 points per tier above T1 |
| Rare-or-better drop weight | x (1 + 1.0 NL) |
| Resonance Link flip time | x (1 - 0.3 NL) |

The zone base replaces the flat 6 percent elite share in [07](07-meta-progression-and-difficulty.md); the tier step of 3 points is kept.

## 3. Danger zones (D-13)

| Level | Name | Health x | Damage x | Elite base | Loot weight x | Host chance x | Mimics present |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Z0 | Safe (Shelter) | none | none | 0% | 0.5 | 0 | None |
| Z1 | Low (Calm) | 1.0 | 1.0 | 3% | 1.0 | 1.0 | Walker, Spitter |
| Z2 | Elevated (Contested) | 1.3 | 1.15 | 6% | 1.4 | 1.3 | plus Skitter |
| Z3 | High (Hot) | 1.7 | 1.35 | 9% | 1.9 | 1.6 | plus Brute |
| Z4 | Critical (Core) | 2.2 | 1.6 | 12% | 2.6 | 2.0 | plus Hollow swarms and nests |

Zone field generation:

- Each 100 m block gets a danger value from a smoothed noise field, a gradient that grows with distance from insertion, and local maxima at nests. The value is quantized to Z0 to Z4.
- Cleanup: regions of at least 4 blocks, neighboring zones differ by at most one level, and boundaries follow streets, shutters and checkpoints.
- Area targets: Z0 6%, Z1 34%, Z2 30%, Z3 20%, Z4 10%. Z0 is a radius of about 250 m around insertion and holds the broker and one extraction point.
- Zones are fixed for the whole raid; NL never changes a zone level.

Total health multiplier = zone x night x tier, capped at 8.0 in the demo. Examples:

| Case | Calculation | Health x |
| --- | --- | --- |
| T1, Z1, 18:30 | 1.0 x 1.0 x 1.0 | 1.00 |
| T1, Z3, 22:30 (NL 0.53) | 1.7 x 1.32 x 1.0 | 2.24 |
| T1, Z4, 02:00 | 2.2 x 1.6 x 1.0 | 3.52 |
| T3, Z4, 02:00 | 2.2 x 1.6 x 1.44 | 5.07 |

### Minimap marking

- The zone field is known from the start (Command satellite data), even where the map is unexplored. Interiors and loot stay fogged.
- Each level has a color and a hatch pattern so it reads without color: Z0 light blue solid, Z1 green sparse dots, Z2 yellow diagonal lines, Z3 orange cross-hatch, Z4 red dense cross-hatch. Zone borders are thick lines.
- A legend with level pips sits under the minimap. The full map (M) adds a tooltip with health multiplier, elite share and loot weight for the hovered zone.
- World cues: floor light strips and holographic gates in the zone color at boundaries. Entering a zone shows a short banner with its name, level pips and loot stars (see [12](12-ui-and-hud.md)).
- A HUD chip beside the minimap shows the current level, health multiplier and loot weight.

## 4. Scene activities (D-09)

| Activity | Where | Reward | Risk |
| --- | --- | --- | --- |
| Supply Cache | Streets and plazas, more in Z2 and above | A run item for raid Credits; the price rises per purchase | May be a Host and ambush |
| Signal Shrine | Rooftops and plazas | One item of Enhanced rarity or better for 25 percent of current health | Health loss and a small spawn burst |
| Intel Terminal | Server floors and lobbies | Intel for contracts and hand-in value; reveals extraction points | 8 s hack with noise, then a wave of 3 to 6 Mimics |
| Nest Clearing | Marked nests in Z3 and Z4 | Guaranteed Unidentified Mimic gear plus Lab Samples | A wave and one elite |
| Gray Market Broker | One in Z0, one in Z2 | Instant sale at 80 percent and 3 offers | Cost only |

Everyday containers can also be Hosts (see [08](08-loot-contamination-and-legendary-gear.md)). Each raid has 3 contracts as in [02](02-core-loop-and-raid-structure.md), for example kill 2 elites, collect 2 Intel and search 8 containers. They pay only on extraction.

## 5. Pacing and rising difficulty (D-14)

A player keeps pace only by collecting items. Hypothesis: relative strength is player power divided by monster power in the player's current zone.

| Raid minute | Game clock | Median items held (target) | Relative strength |
| --- | --- | --- | --- |
| 0 | 18:30 | 0 | 1.10 |
| 8 | 20:30 | 4 | 1.00 |
| 16 | 22:30 | 8 | 0.95 |
| 24 | 00:30 | 11 | 0.85 |
| 30 | 02:00 | 13 | 0.75 |

A player who collects no items should fall below 0.7 by minute 16 and be pushed toward extraction. The first item arrives within 90 s and a full clock yields 12 to 14 items at T1. Values are tuned by deterministic simulation, as in [07](07-meta-progression-and-difficulty.md).

## 6. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 17-A-01 | Walk from insertion to the farthest extraction point | Path of at least 3.0 km, no loading screen | Not yet implemented |
| 17-A-02 | Let the clock run from 18:30 | Curfew triggers at 02:00 after 30 real minutes | Not yet implemented |
| 17-A-03 | Spawn the same Z1 encounter at NL 0 and NL 1 | Health 1.0 versus 1.6; elite share 3% versus 15% | Not yet implemented |
| 17-A-04 | View the minimap in greyscale | All five levels are distinguishable and the legend matches | Not yet implemented |
| 17-A-05 | Generate 100 seeds | Zone area shares within 5 points of targets; neighbors differ by at most one level | Not yet implemented |
| 17-A-06 | Cross the whole map while chunks stream | No frame hitch above 50 ms | Not yet implemented |
