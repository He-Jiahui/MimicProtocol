# Web Demo Scope and Overrides

Status: Draft v0.1. Updated: 2026-11-25. Requirements: D-01 to D-14, defined on this page.

[Back to index](README.md) | Previous: [14 Roadmap and Open Questions](14-roadmap-and-open-questions.md) | Next: [16 Demo Tutorial and Hub Onboarding](16-demo-tutorial-and-hub-onboarding.md)

## 1. Purpose

Documents 00 to 14 describe the full game. The web demo is a narrow vertical slice: a guided tutorial, a hub and one large raid map. This page states what the demo keeps, what it cuts and where its rules override the full-game pages. For the demo only, this page wins any conflict. Details live in [16](16-demo-tutorial-and-hub-onboarding.md), [17](17-demo-raid-map-time-and-zones.md) and [18](18-demo-classes-elites-and-items.md).

## 2. Demo requirements register

Source: the project owner's second brief, dated 2026-11-25. All numbers stay Proposal until confirmed.

| ID | Requirement | Detail in |
| --- | --- | --- |
| D-01 | The web demo contains only the tutorial and the first combat scene | 15 |
| D-02 | Class training with an easy class, guided by a comms liaison, teaching the basic mechanics | 16 |
| D-03 | A forced search flow that yields sellable loot and unidentified gear | 16 |
| D-04 | Skill layout: left mouse normal attack, right mouse small skill, Shift dodge, R ultimate | 15, 18 |
| D-05 | Killing monsters is taught | 16 |
| D-06 | Out-of-run basics: skill variants, equipping, selling, enhancing, affix reroll, raid difficulty choice | 16 |
| D-07 | Four-skill kits with skill synergies; four archetypes: ranged rifleman, melee blade, summoner, damage over time; reference RoR2 and StormBound | 18 |
| D-08 | A few basic elite affixes | 18 |
| D-09 | Basic in-scene activities | 17 |
| D-10 | Basic RoR2-style in-raid items | 18 |
| D-11 | A grand cyber city of 3 km or more with enterable buildings | 17 |
| D-12 | Dusk to deep night: later means harder monsters, better drops, higher elite rate | 17 |
| D-13 | Discrete zones from safe to dangerous; danger raises loot quality and monster stats; the minimap marks the ranges | 17 |
| D-14 | The player must use in-raid growth to keep up with rising difficulty | 17, 18 |
| D-15 | A repeatable first-raid loop where risk and reward rise together, with effective in-raid and out-of-raid progression | 19 |
| D-16 | In-raid events: tasks, special events, monster waves, empowered elites, rescues, self-empowerment, item trades and gambles | 20 |
| D-17 | Hub contracts: submit key supplies, explore areas, deploy detection devices | 21 |
| D-18 | Contracts unlock sectors and change sector effects: more loot, weaker elites | 21 |
| D-19 | Zone bosses with epic, phased mechanics | 22 |
| D-20 | Rich boss rewards using Diablo-like drop mechanics | 23 |

## 3. Scope

| Area | In the demo | Cut from the demo |
| --- | --- | --- |
| Content | Tutorial annex, hub, one raid map | Other districts, seam raids |
| Classes | 4 archetypes: ranged rifleman, melee blade, summoner, damage over time | The other 16 classes |
| Difficulty | Threat Tiers T1 to T3, danger zones, Night Level | T4 to T10 |
| Enemies | 5 Mimic archetypes, 6 elite affixes, 3 zone bosses (see [22](22-demo-bosses.md)) | Caller, further bosses |
| Gear | 4 slots, appraise, equip, enhance, reroll | Power extraction and install, insurance, reputation, codex |
| Raid play | Items, caches, shrines, terminals, nests, broker, Hosts, Scan Pulse | Deep Scan, Lantern Cycle, Pulse |
| Platform | Desktop browser, keyboard and mouse | Touch, co-op, online |

## 4. Overrides of earlier pages

| Topic | Earlier rule | Demo rule |
| --- | --- | --- |
| Controls | [04](04-camera-controls-and-combat.md) section 3 used right mouse hold for Aim, Q for M2 and Space for a universal roll | Left mouse M1, right mouse M2, Shift S (a class-specific dodge), R ultimate. Left Alt (hold) is Aim and V toggles the camera. Page 04 is updated to match (Q-22) |
| Raid clock | [02](02-core-loop-and-raid-structure.md) section 3: Lantern Cycle with Open Window and Pulse | Disabled. A dusk-to-night clock drives difficulty (see [17](17-demo-raid-map-time-and-zones.md)). Extraction points stay open |
| Pulse escalation | [07](07-meta-progression-and-difficulty.md) section 4 | Replaced by the Night Level |
| In-raid growth | [06](06-run-growth-roguelite.md): raid levels with a perk draft | RoR2-style items only (see [18](18-demo-classes-elites-and-items.md)). No draft; raid level gives a small flat bonus (Q-23) |
| Map size | [09](09-world-structure-and-buildings.md) used 1200 m square; [10](10-procedural-generation.md) generated everything in under 8 s | 3.2 km square. Only the insertion area is generated before play; the rest streams in as chunks |
| Classes | [05](05-classes-and-skills.md): 20 classes, vertical slice of 4 | 4 demo archetypes with adapted kits (Q-28) |
| Threat Tiers | [07](07-meta-progression-and-difficulty.md): T1 to T10 | T1 to T3. T2 opens after one T1 extraction |
| Gear pipeline | [08](08-loot-contamination-and-legendary-gear.md) section 6: appraise, decontaminate, extract, install | Appraise and decontaminate merge into one Process action. Extract and install are cut (Q-25) |
| Equipment slots | [08](08-loot-contamination-and-legendary-gear.md): 8 slots | 4 slots: weapon, body, rig, backpack |
| Insurance | [08](08-loot-contamination-and-legendary-gear.md) section 8 | Cut. A small secure case holds 2 items |

## 5. Demo controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Aim |
| Left mouse button | M1 normal attack |
| Right mouse button | M2 small skill |
| Shift | S dodge skill |
| R | R ultimate |
| E | Interact and search; hold for lockpick or hack |
| C | Scan Pulse |
| V | Toggle Tactical Top-Down and Shoulder camera |
| Left Alt (hold) | Aim: temporary Shoulder view |
| Tab | Inventory and gear |
| 1 to 4 | Quick items |
| M | Map |
| Esc | Pause |

Q and Space are unassigned in the demo. Dodge is each class's own S skill, so there is no universal roll.

## 6. Session timeline (Proposal)

| Segment | Target length | Notes |
| --- | --- | --- |
| Training annex (Phase A) | 6 to 8 min | Forced stages A1 to A8 |
| Hub guided flow (Phase B) | 4 to 5 min | Forced steps B1 to B8 |
| First raid | Up to 30 min | Clock 18:30 to 02:00 |
| Debrief and hub | 3 min | Sell, process, upgrade |

A first session takes about 45 to 50 minutes.

## 7. Delivery

- One web page, desktop browser, keyboard and mouse.
- The demo profile uses its own storage root and never touches the StormBound key (see [13](13-technical-architecture.md)).
- Procedural assets keep the download small. Target: first interactive in under 20 s on broadband, with real generation progress shown (Proposal).

## 8. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 15-A-01 | Start a new profile | The tutorial starts and no other mode is reachable | Not yet implemented |
| 15-A-02 | Press left mouse, right mouse, Shift and R | The mapped skill fires; Q and Space do nothing | Not yet implemented |
| 15-A-03 | Search the build for out-of-scope content | No fifth class, no T4, no Power extraction | Not yet implemented |
| 15-A-04 | Complete the tutorial and one T1 raid with each of the four classes | Each run reaches the debrief without blocking errors | Not yet implemented |
