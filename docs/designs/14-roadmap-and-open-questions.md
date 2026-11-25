# Roadmap and Open Questions

Status: Draft v0.1. Updated: 2026-11-25. Applies to: the whole project.

[Back to index](README.md) | Previous: [13 Technical Architecture](13-technical-architecture.md) | Next: [15 Web Demo Scope and Overrides](15-web-demo-scope-and-overrides.md)

## 1. Milestones (Proposal)

Durations are intentionally omitted because team size and repository placement are undecided. Each milestone ends with a playable build and the listed exit criteria. Acceptance rows in the feature documents define the detailed checks.

| Milestone | Scope | Exit criteria |
| --- | --- | --- |
| M0 Foundations | Repository decision, simulation core, random streams, profile skeleton, test harness | Deterministic simulation test passes; atomic profile commit test passes (13-A-01, 13-A-03) |
| M1 Street slice | District block generation (stages S1 to S4 and S7), camera rig with both modes, reticle, one class, wet neon look | Walk a generated street at 60 FPS on Medium; screenshots reviewed against the look pillars (11-A-01) |
| M2 Raid slice | Interiors, searching, Hosts, Mimic state machine, scan duel, extraction, Lantern Cycle, loss rules | A full raid is playable at T1 with one class (02-A-01 to 02-A-04, 03-A-01 to 03-A-04) |
| M3 Loop slice | Hub, stash, insurance, Mimic gear pipeline with 3 Powers, Run Perk drafts, tiers T1 to T3, four classes | Ten consecutive raids with persistent saves; first extraction-rate report |
| M4 Breadth | Wave 2 classes, remaining districts, tiers T1 to T10, 10 or more Powers, Progenitor bosses | Extraction-rate targets in [07](07-meta-progression-and-difficulty.md) within tolerance in simulation |
| M5 Polish | Quality tiers, automatic quality, accessibility, audio, performance pass | Performance targets in [11](11-rendering-and-visual-style.md) hold on reference hardware |
| M6 Release candidate | Wave 3 classes, seam raids, content fill, bug fixing | All acceptance rows reviewed and recorded with real results |

Vertical slice definition (end of M3): one district, four classes (Assault Trooper, Railgunner, Rogue, Engineer), three Mimic archetypes plus one elite, tiers T1 to T3, three Powers, the full hub loop.

## 2. Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| K-01 | The procedural city looks generic and not like a hand-built cyber street | Style records per district, a dedicated signage generator, early art review at M1 |
| K-02 | Bloom, SSR and volumetrics are too costly in the browser | Quality tiers, probe and decal fallbacks, automatic quality stepping |
| K-03 | Seamless building entry causes hitches | Two-cell interior budget, worker meshing, hitch tests at M2 |
| K-04 | Twenty StormBound classes do not translate to deliberate aiming | Staged class rollout, translation rules in [05](05-classes-and-skills.md), per-class playtests |
| K-05 | Economy inflation or a death spiral | Cash sinks, free starter kit, insurance, simulation of the economy at M3 |
| K-06 | Scope: 20 classes, procedural cities, hub and tiers together | Vertical slice first, class waves, strict milestone exits |
| K-07 | Bloom hides enemies and loot | Readability rules and bloom caps in [11](11-rendering-and-visual-style.md) |
| K-08 | Cross-browser floating point differences break generator determinism | Integer or fixed-point math in the generator, same-engine hash tests first |
| K-09 | Mutual detection is confusing to new players | Cost shown before use, tutorial raid, tuning of flip time |

## 3. Open questions

The default column is what these documents assume until the project owner decides.

| ID | Question | Affects | Default assumption |
| --- | --- | --- | --- |
| Q-01 | Final game title | All | MIMIC PROTOCOL, a placeholder |
| Q-02 | Repository placement: separate repository, new package, or inside src | 13 | Undecided; documents stay in new_project_docs |
| Q-03 | Are civilians present, and can they be killed | 01, 03 | Present, killable with a Command penalty |
| Q-04 | Campaign arc across tiers, or endless contracts | 01 | Contracts with light narrative framing |
| Q-05 | Is the three-phase Lantern Cycle confirmed as the raid clock | 02 | Yes, as drafted |
| Q-06 | Does the world slow or pause during a perk draft | 06 | Pause |
| Q-07 | When a raid snapshot is rejected, is the raid voided or the loadout refunded | 06 | Refund the loadout |
| Q-08 | Hard or soft gating of Threat Tiers | 07 | Soft gate: one extraction at T(n) opens T(n+1) |
| Q-09 | Optional aim assist for accessibility | 04 | Not included |
| Q-10 | Touch controls | 04, 12 | Not in the first release |
| Q-11 | Co-op or PvP after the vertical slice | 00 | Not planned |
| Q-12 | TypeScript or plain JavaScript | 13 | Plain JavaScript, as in StormBound |
| Q-13 | Storage backend: IndexedDB or localStorage | 13 | IndexedDB plus small localStorage settings |
| Q-14 | Audio sourcing: synthesized only or CC0 files | 13 | Undecided |
| Q-15 | Must generator output be identical across browser engines | 10, 13 | Identical on the same engine only |
| Q-16 | Final English class names versus the StormBound class ids | 05 | Working names, to be reconciled with the data module |
| Q-17 | Is class XP kept on death | 07 | Kept |
| Q-18 | Equipment slots: 8 as drafted or 10 as in StormBound | 08 | 8 |
| Q-19 | How harsh is the loss rule, and is a free starter kit enough | 02, 08 | Free starter kit always available |
| Q-20 | Target platforms and minimum hardware | 00, 11 | Desktop browsers, mid-range GPU |
| Q-21 | Should these documents move into docs/development and the StormBound Wiki | README | No; separate until Q-02 is decided |
| Q-22 | Universal dodge roll versus each class having its own S dodge skill | 04, 15, 18 | Each class S slot is its own dodge; no universal roll |
| Q-23 | Does the demo also include a level-up perk draft next to run items | 06, 18 | No; items only plus a small flat raid-level bonus |
| Q-24 | Fixed first-raid map seed versus a random seed per raid | 17 | Fixed district seed with per-raid loot and spawn variation |
| Q-25 | Are Power Cores in the demo | 08, 16 | No; appraised Mimic gear may carry one preset trait |
| Q-26 | Comms liaison name, portrait and voice or text only | 16 | Text with a portrait; placeholder name Relay |
| Q-27 | Raid end rule at deep night | 17 | Hard curfew at 02:00 game time; unextracted counts as dead |
| Q-28 | Final mapping of the four demo archetypes to StormBound classes | 18 | Assault Trooper, Mercenary, Engineer, Toxic Handler |
| Q-29 | May the player leave a boss arena before Phase 2 and reset the boss | 22 | Yes; the arena seals from Phase 2 |
| Q-30 | Boss Archive training mode in the demo | 22 | Yes; no loot, no loss, no contract progress |
| Q-31 | Do lost Key Supplies and Sensor Probes respawn after a death | 21 | Yes; contract targets are guaranteed |
| Q-32 | Are rescue survivors killable, and does a hidden Mimic appear among them | 20 | Killable with a Command penalty; hidden Mimic in 25% of rescues |
| Q-33 | Reset action for sector and contract state | 21 | New Operation in settings; gear is kept |
| Q-34 | Dedicated exfil after a boss | 23 | B3 only; B1 and B2 rely on the normal extraction points |
| Q-35 | Black-box recovery run after a death | 19 | Not included in the demo |

## 4. Decisions requested first

1. Q-02 (repository placement), because it blocks M0.
2. Q-03 and Q-04 (civilians and campaign shape), because they shape the narrative and enemy design.
3. Q-20 (platform and hardware), because it sets every performance budget.
4. Q-16 and Q-18 (class names and slots), because they gate the data model.

## 5. Maintenance rules

- Mark each number as Proposal until the project owner confirms it, then mark it Confirmed with the date.
- Fill the Result column of an acceptance row only with real, reproducible results. Never pre-fill passes.
- When a requirement in the brief changes, update the register in [00](00-vision-and-pillars.md) first, then the affected pages.
- Keep file names and acceptance IDs stable so that references keep working.
