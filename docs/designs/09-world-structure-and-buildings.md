# World Structure and Buildings

Status: Draft v0.1. Updated: 2026-11-25. Requirements: R-03, R-10, R-11.

[Back to index](README.md) | Previous: [08 Loot, Contamination and Legendary Gear](08-loot-contamination-and-legendary-gear.md) | Next: [10 Procedural Generation](10-procedural-generation.md)

## 1. Semi-open world model (R-03)

Web demo override: the demo map is 3.2 km by 3.2 km with lazy chunk generation and five danger zones; see [17](17-demo-raid-map-time-and-zones.md).

The game is not one seamless open world. Each raid loads one generated District Map that is large enough to feel grand and bounded enough to extract from.

| Item | Starting value (Proposal) |
| --- | --- |
| Playable area per raid | About 1200 m x 1200 m |
| Streaming unit | 100 m block |
| Active streaming window | 5 x 5 blocks around the operator |
| Vertical bands | Sewers and tunnels (-1), street (0), mezzanines and sky bridges (+1), rooftops (+2) |
| Landmark buildings | 6 to 10 per map |
| Enterable share of ordinary buildings | About 35% |

A seam raid joins two districts through a transit corridor. Seams are a Wave 3 feature (see [14](14-roadmap-and-open-questions.md)).

## 2. Structure inside a district

- Insertion: the operator starts at one of several edge points with a one-minute safe window.
- Sub-areas are separated by gates: sealed shutters, power doors, locked fences. Keys, restored power and hacks open them, so the route to the best loot is a puzzle of access.
- Points of interest: landmarks, nests, Progenitor lairs, Signal Shrines, Gray Market terminals and extraction points.
- The map is fog-of-war. Scans and intel pickups reveal parts of it. Command marks the nearest active extraction point and nothing else.

## 3. Enterable buildings (R-03, R-11)

Entering is seamless: opening a door fades through a 0.3 s threshold and loads the interior cell with no loading screen. Only the current cell and its neighbor stay loaded. Non-enterable buildings show lit windows and static doors.

Interior cutaway: in Tactical Top-Down, floors above the operator are hidden and walls between camera and operator dither out (see [04](04-camera-controls-and-combat.md)).

| Archetype | Loot tier | Host density | Notes |
| --- | --- | --- | --- |
| Convenience store | Low | Medium | Vending machines, food, quick search |
| Apartment block | Low to medium | Low | Many small rooms, safe rooms |
| Clinic | Medium | High | Medical cabinets, supplies |
| Restaurant row | Low | High | Food stalls and kitchens |
| Warehouse | Medium | Medium | Large open fights, heavy gear crates |
| Metro station | Medium | Medium | Underground extraction by rail |
| Server floor | High | Medium | Intel-rich, locked behind power |
| Corporate lobby | High | Low | Elites, reflective glass, keycard doors |
| Rooftop garden | Medium | Low | Dropship extraction, long sightlines |
| Progenitor nest | Very high | Very high | Optional boss lair |

## 4. Interior features

- Lockdown doors that need a keycard, a hack, or restored power.
- Shielded rooms that break Resonance Links (see [03](03-mutants-detection-and-enemy-ai.md)) and are used as safe rooms where Alert decays faster.
- Vents and ceilings used by Skitters, which creates flanking threats.
- Elevators are disabled; stairs and ladders carry vertical traffic, which keeps the navmesh simple.
- Windows and balconies allow fights across street gaps and jumping between roofs.

## 5. Extraction point placement

- Each map has 5 or 6 candidate points; 2 or 3 are active during an Open Window.
- Spacing (Proposal): at least 300 m from insertion and at least 250 m between active points.
- Validation: every active point must be reachable from every insertion point through the navmesh, with at least two distinct routes (see [10](10-procedural-generation.md)).
- Types: rooftop dropship, rail platform, dock boat, sewer hatch, shelter gate. Some need a key card, power, or a fee.

## 6. Environment hazards

- Electrified puddles: rain wets streets and puddles carry shock, adapting the wetness and puddle logic of WATER.html and the environmental reactions of StormBound doc 65.
- Gas vents, falling signage and live cables near Foundry Belt machinery.
- Fire and oil reactions follow StormBound docs 65 and 67-15 where a class or Power uses them.
- Hazards use the shared status layer, so they stack and interact with skills without special cases.

## 7. Navigation

- Navmesh tiles are generated per chunk when the map is built. StormBound already depends on recast-navigation and has a bake script (bake:nav in package.json); the new project reuses the approach and verifies it at the first vertical slice.
- Doors, gates and walls from skills are dynamic obstacles that update affected tiles only.
- Background crowds use a simplified flow field and never run full AI.

## 8. Budgets (Proposal)

| Item | Budget |
| --- | --- |
| Draw calls | Under 1500 on High |
| Visible triangles | Under 3 million on High |
| Loaded interior cells | At most 2 |
| Background NPC entities | 120 (see [03](03-mutants-detection-and-enemy-ai.md)) |
| Map generation time | Under 8 s, off the main thread |

## 9. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 09-A-01 | Walk through a door into a building | Fade of 0.3 s or less, no loading screen, no frame hitch above 50 ms | Not yet implemented |
| 09-A-02 | Generate 100 maps | Every active extraction point is reachable from every insertion point | Not yet implemented |
| 09-A-03 | Enter a shielded room with an open link | Link closes and Awareness decays | Not yet implemented |
| 09-A-04 | Stand in an electrified puddle | Shock damage applies and clears when the puddle dries | Not yet implemented |
