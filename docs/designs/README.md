# Design Documents Index

Status: Draft v0.1. Updated: 2026-11-25.

Working title: MIMIC PROTOCOL (placeholder). This folder holds the design documents for a new top-down and third-person extraction roguelite set in a cyber-futuristic megacity, built on ideas from the StormBound project and the WATER.html prototype. All documents are written in English.

## 1. One-paragraph summary

You are a lone military operative infiltrating a rain-soaked future city after an alien vessel appears in high Earth orbit. Mutated Mimics hide among the crowd and cannot be recognized by ordinary people. Your military sense rig reveals them, but the link works both ways and makes them aware of you and hostile. You search enterable buildings for intel and supplies, fight what you cannot avoid and extract alive. At base, gear dropped by Mimics is appraised, decontaminated and installed into your own armor and weapons to grant legendary-style powers. Out-of-run difficulty tiers raise risk and reward together.

## 2. Document index

| Doc | Title | Topic |
| --- | --- | --- |
| [00](00-vision-and-pillars.md) | Vision, Pillars and References | Pitch, requirements register R-01 to R-14, pillars, non-goals |
| [01](01-world-and-narrative.md) | World and Narrative | Premise, sense rig lore, districts, tone |
| [02](02-core-loop-and-raid-structure.md) | Core Loop and Raid Structure | Hub, Lantern Cycle, extraction, loss rules |
| [03](03-mutants-detection-and-enemy-ai.md) | Mutants, Detection and Enemy AI | Mutual detection, Mimic states, archetypes, spawn director |
| [04](04-camera-controls-and-combat.md) | Camera, Controls and Combat | Camera modes, reticle, controls, combat model |
| [05](05-classes-and-skills.md) | Classes and Skills | The 20 classes, translation rules, rollout |
| [06](06-run-growth-roguelite.md) | In-Raid Roguelite Growth | Power budget, raid levels, perks, credits |
| [07](07-meta-progression-and-difficulty.md) | Meta Progression and Threat Tiers | Meta layers, currencies, tier formulas, balance targets |
| [08](08-loot-contamination-and-legendary-gear.md) | Loot, Contamination and Legendary Gear | Searching, Hosts, contamination, gear pipeline, Powers |
| [09](09-world-structure-and-buildings.md) | World Structure and Buildings | Semi-open districts, enterable buildings, extraction placement |
| [10](10-procedural-generation.md) | Procedural Generation and Modeling | Pipeline, determinism, signage, validation gates |
| [11](11-rendering-and-visual-style.md) | Rendering and Visual Style | Look pillars, render passes, readability, quality tiers |
| [12](12-ui-and-hud.md) | UI and HUD | Raid HUD, sense UI, inventory, hub screens, accessibility |
| [13](13-technical-architecture.md) | Technical Architecture | Stack, modules, simulation split, persistence, testing |
| [14](14-roadmap-and-open-questions.md) | Roadmap and Open Questions | Milestones, risks, open questions, decisions needed |
| [15](15-web-demo-scope-and-overrides.md) | Web Demo Scope and Overrides | Demo requirements D-01 to D-14, scope, overrides of earlier pages, demo controls |
| [16](16-demo-tutorial-and-hub-onboarding.md) | Demo Tutorial and Hub Onboarding | Comms liaison, training annex stages, forced hub flow |
| [17](17-demo-raid-map-time-and-zones.md) | Demo Raid: Map, Time of Day and Zones | 3.2 km map, dusk-to-night clock, danger zones, minimap marking, scene activities |
| [18](18-demo-classes-elites-and-items.md) | Demo Classes, Elite Affixes and Run Items | Four class kits, six elite affixes, RoR2-style items |
| [19](19-demo-core-loop-and-progression.md) | Demo Core Loop and Progression Spiral | Nested loops, beat sheet, risk and reward ladder, Gear Rating, pacing |
| [20](20-demo-in-raid-events.md) | Demo In-Raid Events | Event director, rescues, waves, Wanted elites, shrines, curses, trades, wagers |
| [21](21-demo-contracts-and-sector-states.md) | Demo Contracts and Sector States | 16 sectors, gates, Intel levels, contract board, persistence |
| [22](22-demo-bosses.md) | Demo Bosses | Shared boss framework, three phased bosses, tier twists, Boss Archive |
| [23](23-demo-boss-loot-and-drops.md) | Demo Boss Loot and Drops | Item level, rarity tables, boss package, Legendary roll, pity, Prime rolls |
| [25](25-combat-feel-reference-brushwild.md) | Combat Feel: What to Borrow from Brushwild | Brute charge lanes, dodge feedback, hit-stop and warning timing |
| [26](26-equipment-loot-reference-brushwild.md) | Equipment and Loot: What a Drop Is Worth | Four-slot comparisons, Lab reveals, Latent Powers and saved rolls |
| [27](27-skill-tree-reference-brushwild.md) | Skill Tree: A Class Progression Proposal for the Barracks | Class points, exclusive rail tuning, safe refunds and key passives |
| [28](28-class-resource-loops.md) | Class Resource Loops | Why Charge feels full, class burst choices, battlefield resources and skill-tree variants |
| [29](29-presentation-creatures-and-city-terrain.md) | Presentation, Creatures and City Terrain | Revealed Mimic silhouettes, inhabited streets and terraced raid routes |
| [30](30-staged-damage-calculation.md) | Staged Damage Calculation | How gear, Brands, critical hits and defenses shape a hit without counting a bonus twice |
| [31](31-presentation-craft-and-interactables.md) | Presentation Craft and Interactables | Material effects, believable models and readable vehicle and door interactions |
| [32](32-upper-floors-and-the-way-down.md) | Upper Floors and the Way Down | Upper-floor finds, skybridges, risky drops and equipment for the descent |
| [33](33-flying-threats-and-manual-aim.md) | Flying Threats and Manual Aim | Flying Mimics, muzzle angle and deliberate shots from either camera |
| [34](34-raid-pressure-and-field-challenges.md) | Raid Pressure and Field Challenges | Rising raid pressure, high-star clears, field jobs and earned extraction |
| [35](35-opening-the-lair-and-fighting-the-brood.md) | Opening the Lair and Fighting the Brood | Lair discovery, brood behavior, venom and encounter ideas for other bosses |
| [36](36-routes-to-chosen-activities.md) | Routes to Chosen Activities | Walkable routes to known objectives, floor changes and incomplete intel |
| [37](37-lurkers-among-civilians.md) | Lurkers Among Civilians | Deliberate reveals, civilian trust, elite ambushes and assimilation |
| [38](38-field-bags-and-stash-appraisal.md) | Field Bags and Stash Appraisal | Container finds, bag slots, stash pages and the choice to sell sealed gear |
| [39](39-class-levels-and-barracks-variants.md) | Class Levels and Barracks Variants | Persistent class growth and variants that reshape the native kit |
| [40](40-meridian-map-families-and-crossings.md) | Meridian Map Families and Crossings | Variable shelters and danger regions, city settings and guarded map crossings |
| [41](41-reading-cities-in-games.md) | Reading Cities in Games | Game references, their limits and original Meridian scene ideas |
| [42](42-meridian-after-the-descent.md) | Meridian After the Descent | Life across street levels, Command field copy and the grounded nest-ship |
| [43](43-a-street-in-the-rain.md) | A Street in the Rain | Architecture, PBR materials, people and restrained bloom from both cameras |
| [44](44-streets-at-different-heights.md) | Streets at Different Heights | Playable routes through a mixed-use core, a hillside neighborhood and a working harbor |
| [45](45-boss-homes-and-the-descent-ward.md) | Boss Homes and the Descent Ward | The aerial brood nest, the hospital trial and the Herald in the Descent Ward |

Suggested reading order: 00, 01, 02, 03, then 08 and 07, then the rest by role. Designers start with 02 to 08. Engineers start with 09, 10, 11 and 13. Artists start with 01, 10 and 11.

## 3. Requirements traceability

Requirements come from the project owner's brief dated 2026-11-25.

| ID | Requirement | Documents |
| --- | --- | --- |
| R-01 | Search-fight-extract roguelite, Duckov-like raid structure, Diablo-like loot | 02, 08 |
| R-02 | Future cyber realistic city, strong bloom, reflections, emissives, Ghostwire: Tokyo rendering reference | 11, 12 |
| R-03 | Semi-open world scavenging, enterable buildings, grand scale | 09, 10 |
| R-04 | The 20 classes from the StormBound documents | 05 |
| R-05 | Balanced in-run and out-of-run growth | 06, 07 |
| R-06 | Out-of-run difficulty tiers raising monster health, attack, elite output and rare drop rate | 07, 08 |
| R-07 | Top-down plus third-person camera plus shooting reticle | 04, 12 |
| R-08 | Alien ship in high Earth orbit, hidden mutants | 01, 03 |
| R-09 | Mimics fake identities; sense rig reveals them; mutual detection turns them aggressive | 03 |
| R-10 | Solo infiltration, intel and supplies, extraction, delivery to the military | 01, 02 |
| R-11 | Everyday objects are infected; searching is dangerous | 08, 09 |
| R-12 | Mutant gear appraised, decontaminated and installed for legendary-like traits | 08 |
| R-13 | Scene assets from procedural modeling | 10, 13 |
| R-14 | Documents written in English | all |

## 4. Glossary

| Term | Meaning |
| --- | --- |
| Mimic | A mutated organism that disguises itself as an ordinary person |
| Host | An everyday object or container colonized by Mimic biomass |
| Sense rig | The military device that detects Mimics |
| Resonance Link | The two-way coupling opened when the rig reveals a Mimic |
| Scan Pulse, Deep Scan | Active rig modes that reveal Mimics and open links |
| Alert | Raid-wide pressure meter from 0 to 5 |
| Lantern Cycle | Repeating phases of Dormant, Open Window and Pulse; the Lantern is the alien vessel |
| Threat Tier | Out-of-run difficulty level T1 to T10 chosen before a raid |
| Operator Rank | Shared account level, adapted from the StormBound paragon track |
| Run Perk | A raid-scoped upgrade picked from a three-card draft |
| Power Core | A legendary Power extracted from Mimic gear and installed into your own gear |
| Command | The military organization that sends the operator |
| Credits, Cash | Raid-scoped currency and permanent hub currency |
| Lab Samples | Hub material used for appraisal, decontamination and Power extraction |

## 5. Conventions

- Every document starts with a status line, an update date and the requirement IDs it covers.
- A number marked Proposal is a designer hypothesis. Nothing is marked Confirmed yet.
- Acceptance rows use the ID pattern doc number, A, sequence (for example 07-A-01). The Result column reads Not yet implemented until a real check has been run. A document check is not a gameplay acceptance.
- Links are relative and stay inside this folder.
- Pages 15 to 23 define the web demo and win over earlier pages for the demo only. Earlier pages carry a Web demo override note where they differ.

## 6. Provenance and limits

- StormBound references come from the repository README, package.json, the development Wiki index and doc 56 (class skill mechanics). Individual source modules were not audited, so every reuse idea must be verified before it is relied on.
- WATER.html is a 31 MB single file with embedded assets. It was inspected through its CSS, HUD markup and a keyword scan of its logic, not read end to end. The patterns cited from it are tide phases, contracts, hold-to-extract, the broker trade panel, the lockpick, the damage direction ring and the switchable camera.
- Reference games are used for structure and rendering qualities only. No names, assets, characters or levels are taken from them.
- These documents are separate from docs/development and are not linked into the StormBound Wiki (see Q-21 in [14](14-roadmap-and-open-questions.md)).
