# Technical Architecture

Status: Draft v0.1. Updated: 2026-11-25. Requirements: R-02, R-05, R-13.

[Back to index](README.md) | Previous: [12 UI and HUD](12-ui-and-hud.md) | Next: [14 Roadmap and Open Questions](14-roadmap-and-open-questions.md)

## 1. Goals and constraints

- Browser-based, desktop-first, single-player and playable offline. No multiplayer in the first release.
- Proposed stack: three.js, Vite and plain ES modules. The StormBound package.json lists three ^0.180.0, vite ^6.1.0 and recast-navigation ^0.44.0, so these are the starting versions. Whether to use TypeScript is an open question.
- The simulation must run without a renderer so that balance and generator checks run in Node, as the StormBound test suite does.

## 2. Repository placement (open)

These documents live in new_project_docs while the decision is pending. Options: (A) a separate repository, (B) a new package folder inside this repository, (C) new modules under the existing src folder. Option C is discouraged because it would mix two games, two save formats and two sets of tests. The choice also decides which StormBound modules can be imported and which must be copied.

## 3. Planned module map

The reference column lists StormBound files and documents to read before reusing an idea. Names come from the StormBound README, file listing and Wiki index. Their contents have not been audited and suitability is unverified.

| Module | Responsibility | StormBound reference |
| --- | --- | --- |
| sim-core | Fixed-step simulation, entities, named random streams, event queue | engine.js, balance.js |
| gen | Procedural pipeline S0 to S10 (see [10](10-procedural-generation.md)) | WATER.html world builders |
| world | Chunks, streaming, interior cells, navmesh, hazards | world.js, regions.js, occlusion.js |
| combat | Weapons, projectiles, damage, status layer | combat-*.js, doc 02 |
| classes | Class runtime and the 20 class modules | class-runtime.js, class-actions.js, class-mechanics.js, class-trees.js |
| ai | Mimic state machine, perception, spawn director | combat-ai.js, boss-director.js, doc 72 |
| loot | Items, affixes, Hosts, contamination, Containment Lab | docs 34, 36, 38 |
| profile | Persistence, transactions, migration, snapshots | profile.js, docs 23 and 26 |
| render | three.js pipeline, post-processing, quality tiers | docs 54, 71, 79 |
| ui | HUD, hub screens, input contexts | hud.js, ui.js, doc 49 |
| audio | WebAudio mixer and cues | audio.js, doc 59 |
| tools | Seed gallery, balance simulations, determinism checks | scripts folder |

## 4. Simulation and render split

- The simulation runs at a fixed step (Proposal 60 Hz for movement and projectiles, 15 Hz for AI decisions). Rendering interpolates between steps.
- The simulation never imports three.js or touches the DOM.
- All randomness comes from named streams derived from the raid seed. No Math.random and no wall-clock reads inside the simulation.
- HUD, audio and VFX consume an event queue and read-only state. They never write simulation state.
- Entities live in typed arrays or pooled records. Projectiles, particles and damage numbers use object pools, following StormBound doc 54.

## 5. Threads

| Thread | Work |
| --- | --- |
| Main | Simulation, rendering, input, UI |
| Generation worker | Stages S1 to S9 of the pipeline, chunk meshing, navmesh tile bake |
| Optional AI worker | Perception and path queries, only if profiling demands it |

Results travel as transferable typed arrays. SharedArrayBuffer is avoided in the first release because it needs cross-origin isolation headers.

## 6. Persistence

- The game has its own profile root. The proposed key is mimicprotocol.profile.v1 (a placeholder tied to the working title). It must never read or write the StormBound key stormbound.profile.v2.
- Storage backend: IndexedDB for the profile and raid snapshots, because stash data can grow large. localStorage only for small settings. This differs from the localStorage approach in the StormBound README and is an open question.
- Raid commit is atomic: write the new record, verify it, then switch the active pointer. The previous record is kept as a backup. Migrations are versioned and explicit.
- Export and import use preflight-checked JSON. A damaged profile is never silently overwritten, which matches the StormBound behavior described in its README.
- A raid snapshot holds the seed, generator version, simulation state and random stream positions. It is validated as a whole before use and rejected whole if anything fails.

## 7. Determinism rules

- Fixed step and fixed update order.
- No unordered iteration where the order can change a gameplay decision.
- Generation is a pure function of seed, generator version and parameters.
- Debug builds record a state hash every N ticks. Tests compare hashes for fixed seeds and scripted inputs.
- Floating-point transcendental functions may differ between JavaScript engines. If generator output must be identical across browsers, the generator needs its own integer or fixed-point math. See question Q-15 in [14](14-roadmap-and-open-questions.md).

## 8. Testing and verification

- Unit and simulation tests with node --test, as in StormBound.
- A headless raid simulator drives scripted bots through raids and measures extraction rates against [07](07-meta-progression-and-difficulty.md), with fixed seeds and in-memory profiles that never touch a real save.
- Generator tests: determinism, validation-gate pass rate and timing (see [10](10-procedural-generation.md)).
- Rendering and feel need human review of real screenshots and real play sessions. Automated tests do not replace them.
- While the project lives in this repository, build outputs, caches and temporary fixtures follow the artifact placement rules in the StormBound AGENTS.md (the E:/cargo-targets root).

## 9. Performance and memory

- Budgets are listed in [09](09-world-structure-and-buildings.md), [10](10-procedural-generation.md) and [11](11-rendering-and-visual-style.md).
- No per-frame allocation in hot paths. A frame diagnostics overlay shows frame time, draw calls, triangles, active entities and generator timings.
- Automatic quality stepping (see [11](11-rendering-and-visual-style.md)) reads the same diagnostics.

## 10. Assets and licensing

- Scene geometry, textures and signage are procedural (R-13).
- Audio has no stated rule. Options are synthesized WebAudio only, or CC0 files as StormBound does. This is an open question.
- UI icons and fonts: generated vector icons plus system fonts with fallbacks are the default proposal. Any third-party asset needs a recorded license.

## 11. Online features

None in the first release. If a server is added later, the StormBound multiplayer documents (62 series) are the starting reference.

## 12. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 13-A-01 | Run the same seed and scripted inputs twice in Node | Identical state hash at every checkpoint | Not yet implemented |
| 13-A-02 | Import the simulation module in a plain Node process | No DOM or three.js dependency | Not yet implemented |
| 13-A-03 | Kill the process during a profile commit | After restart exactly one consistent record loads | Not yet implemented |
| 13-A-04 | Load a profile written by the StormBound game | The new game ignores it and does not modify it | Not yet implemented |
