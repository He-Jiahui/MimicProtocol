# Procedural Generation and Modeling

Status: Draft v0.1. Updated: 2026-11-25. Requirements: R-13, R-03.

[Back to index](README.md) | Previous: [09 World Structure and Buildings](09-world-structure-and-buildings.md) | Next: [11 Rendering and Visual Style](11-rendering-and-visual-style.md)

## 1. Principles

1. Everything is generated from code and data. No hand-modelled meshes are required to ship (R-13).
2. Generation is deterministic: the same seed and parameters produce byte-identical output.
3. Generators are grammars with human-readable rules and JSON parameters, so designers tune them without touching code.
4. Every generated map passes validation gates before the player sees it.

Precedent in this repository: WATER.html builds its entire world from code (buildWorld plus helpers such as boxGeo, wall, sign, lamp, puddle, container and many prop builders), and StormBound builds modular models from parts. The new project extends that approach from a single room to a whole district.

## 2. Pipeline

| Stage | Output | Method (Proposal) |
| --- | --- | --- |
| S0 Seed and parameters | Raid seed, district style, Threat Tier | Hash of profile salt, raid counter, district id and tier |
| S1 District layout | Street graph, plazas, bridges | Arterial and local street graph from a perturbed grid or tensor field |
| S2 Lots and zoning | Building lots with an archetype tag | Subdivision of blocks, district type weights |
| S3 Massing | Building volumes | Shape grammar: footprint, floors, setbacks, rooftop modules |
| S4 Facades | Facade modules | Panels for windows, balconies, AC units, pipes and sign mounts |
| S5 Interiors | Room graph and furniture | BSP room splitting, door placement, stair cores, room type by archetype |
| S6 Props and loot | Containers, Hosts, clutter | Anchor-based scatter with density maps |
| S7 Signage and emissives | Neon text, tubes, holographic panels | Canvas text rendered to emissive textures; tube geometry along paths |
| S8 Lighting plan | Light slots, emissive cards, probes | Rule-based placement under the budgets in [11](11-rendering-and-visual-style.md) |
| S9 Navigation | Navmesh tiles | Per-chunk bake, then validation |
| S10 Population | Mimics, civilians, Hosts, crowds | Spawn director seeding (see [03](03-mutants-detection-and-enemy-ai.md)) |

## 3. Seeds and determinism

- One random stream per stage, derived from the raid seed. Changing a rule in S5 does not reshuffle the layout from S1.
- No stage may call an unseeded random function or read the wall clock.
- The raid seed and the generator version are stored in the raid snapshot, so a browser refresh rebuilds the identical map (see [06](06-run-growth-roguelite.md)).
- A generator version bump invalidates old snapshots, which are then rejected whole.

## 4. Geometry techniques

- Parametric extrusions and box-based modules, merged per chunk into a few static meshes.
- Instanced rendering for repeated modules such as windows, vents, signs and railings.
- Procedural textures generated at load on offscreen canvases or in shaders: asphalt, concrete, grime, wet decals, panel seams, with caching per style.
- Normal and roughness maps derived from height fields. Triplanar mapping avoids UV authoring.
- LODs: facade detail modules are dropped beyond 120 m (Proposal) and replaced by baked normal detail.

## 5. Signage

Signage carries the cyber look and must not copy real brands.

- Brand names, slogans and street names come from a combinatorial fictional-name generator.
- Neon tubes are swept tubes with an emissive color and a flicker curve; holographic panels are camera-facing emissive quads.
- Sign density is driven by district style, from sparse in Arcology Heights to dense in the Neon Strip.
- Text on signs is generated into textures, so no font or image assets are required for scene signage.

## 6. Variation controls

Each district has a style record: hue families, building age, wear level, light density, crowd density, hazard set. Wear adds grime, rust streaks and broken-light chance. Style records are data files, not code.

## 7. Performance and threading

Web demo override: only the insertion area is generated before play and the rest streams in as chunks; the targets are in [17](17-demo-raid-map-time-and-zones.md) section 1.

| Item | Budget (Proposal) |
| --- | --- |
| Full district generation | Under 8 s on a mid-range desktop |
| Chunk meshing | In a Web Worker, results transferred as typed arrays |
| Memory for generated geometry | Under 600 MB on High |
| Texture generation | Under 2 s, cached per style |

The loading screen shows real stage progress, as the WATER.html loading bar does.

## 8. Validation gates

A map is rejected and regenerated with the next derived seed (the failure and both seeds are logged) if any check fails:

- Every insertion point connects to every active extraction point on the navmesh with two or more distinct routes.
- No critical room (key, power, intel) is sealed with no way in.
- Loot density per block stays within 0.5x to 2x of the district target.
- Enterable building share and landmark count are within the ranges in [09](09-world-structure-and-buildings.md).
- No generated sign or prop overlaps a navigation-critical doorway.

## 9. Tooling

- A debug view draws the street graph, lots, room graphs and navmesh.
- A seed gallery tool renders 50 seeds as thumbnails for fast review.
- Determinism test: a fixed seed must always produce the same output hash across runs and browsers.

## 10. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 10-A-01 | Generate the same seed twice | Identical output hash | Not yet implemented |
| 10-A-02 | Generate 500 seeds | Fewer than 2% rejected; all accepted maps pass every gate | Not yet implemented |
| 10-A-03 | Change an S5 rule | S1 layout hash is unchanged | Not yet implemented |
| 10-A-04 | Reload a snapshot | Rebuilt map matches the saved hash | Not yet implemented |
| 10-A-05 | Generate on a mid-range desktop | Total time under 8 s | Not yet implemented |
