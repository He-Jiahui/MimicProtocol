# Demo Bosses

Status: Draft v0.1. Updated: 2026-11-25. Requirements: D-19.

[Back to index](README.md) | Previous: [21 Demo Contracts and Sector States](21-demo-contracts-and-sector-states.md) | Next: [23 Demo Boss Loot and Drops](23-demo-boss-loot-and-drops.md)

## 1. Intent

Three zone bosses (the Progenitor archetype of [03](03-mutants-detection-and-enemy-ai.md)) give each raid a peak. The target is an epic, readable, escalating fight in the manner of soulslike and raid bosses, with staged arenas, phase changes and a rich reward. The designs adapt ideas from the StormBound boss pages (docs 38-8, 38-8-5 and 38-8-10: phase loops, three-layer skills and montage timelines), which were read only as Wiki index entries and must be checked before reuse. Boss names are placeholders.

## 2. Shared framework

| Step | Rule (Proposal) |
| --- | --- |
| Approach | A landmark lair; music drops to a drone at 120 m |
| Awaken | Optional: hold E for 3 s at the arena gate (noise 70 m). Bosses never roam |
| Intro | 4 to 6 s, framed camera with bounded motion, name card and title; skippable after the first view |
| Phases | HP thresholds appear as notches on the boss bar; each phase adds a new mechanic, not only more damage |
| Transition | 3 to 4 s invulnerable, the arena transforms, adds despawn, the music stem changes and all player cooldowns drop by 30% |
| Death | Bounded slow motion of 1.2 s, a light flare within the flashing limit, then the loot burst of [23](23-demo-boss-loot-and-drops.md) |

Attack classes: Light (every 2 to 3 s, windup 0.6 s or more), Heavy (windup 1.2 to 1.8 s, must be dodged or blocked by cover, 25 to 35% of max health at T1 with no defenses), Mechanic (every 25 to 40 s, needs a specific response such as soak, break, interrupt or scan). Every damage source must be avoidable with the four demo kits ([18](18-demo-classes-elites-and-items.md)). Telegraphs: red lethal, amber tracking, blue status, with an audio cue per class, and they obey the bloom caps of [11](11-rendering-and-visual-style.md).

Poise: each boss has a poise bar that heavy player hits fill. When full the boss is staggered for 4 s, takes +50% damage and cancels its attack. Poise recovers after 10 s.

Commit rule: the player may leave the arena before Phase 2 and the boss resets to full health. From Phase 2 the arena seals until victory or death, and a banner warns first. Extraction is impossible during the fight.

Scaling: boss health is set by target time to kill (TTK) at the recommended Gear Rating with the median kit, tuned by simulation as in [07](07-meta-progression-and-difficulty.md). Tier multipliers of 07 apply in full. Night factors are halved (health x (1 + 0.3 NL), damage x (1 + 0.2 NL)). Zone multipliers do not apply. After the enrage timer, boss damage rises 10% every 10 s.

| Boss | Recommended GR | Target TTK | Fight length | Enrage timer |
| --- | --- | --- | --- | --- |
| B1 Matron of Hollows | 70 | 150 s | 3 to 5 min | 5:00 |
| B2 The Reflection | 100 | 210 s | 4 to 6 min | 6:00 |
| B3 The Herald | 140 | 300 s | 6 to 8 min | 8:00 |

Camera and HUD: the top-down camera zooms out 15% inside arenas. The boss bar shows name, notched health, poise and a one-line survival hint, after the pattern of the StormBound boss readouts (doc 38-8-8-1).

## 3. B1 Matron of Hollows (Reliquary Quarter, Z3)

Arena: a 60 m round shrine plaza with six lantern poles and eight pillars for cover. Theme: brood and add control.

| Phase | HP | Mechanics |
| --- | --- | --- |
| P1 Brood | 100 to 70% | Brood Slam (heavy, 120 degree cone, 1.4 s windup). Spore Rain (6 ground circles of 4 m, 1.5 s). 2 Walkers every 15 s |
| P2 Nest | 70 to 35% | The Matron burrows and 4 Brood Cysts rise at the edge. She takes 70% less damage while any cyst lives. Cysts glow in sequence and hatch 2 Skitters every 12 s. Each cyst killed makes her surface and stagger for 3 s. When all are dead she returns with a Torn Carapace (+15% damage taken) |
| P3 Frenzy | 35 to 0% | Speed +25%. Chain Roar (3 slams in a line, 0.9 s apart, dodge on the rhythm). Spore Rain leaves acid pools that shrink safe ground. At 15% Last Brood sends 8 Hollows at the player, and Hollow deaths add contamination ([08](08-loot-contamination-and-legendary-gear.md)) |

## 4. B2 The Reflection (Corporate Plaza, Z3)

Arena: a 70 m server atrium with glass walls, a reflective floor and six neon rails. Theme: disguise, tied to the scan duel of [03](03-mutants-detection-and-enemy-ai.md).

| Phase | HP | Mechanics |
| --- | --- | --- |
| P1 Mirrors | 100 to 65% | Four figures stand in the arena and only one is real. Scan Pulse outlines the real one for 4 s (arena scan cooldown 10 s). Decoys have 10% health and burst when killed. The real one swaps places with a decoy every 20 s. Attacks: Shard Volley (light, 3 shards) and Glass Lunge (heavy, 1.2 s dash) |
| P2 Echoes | 65 to 35% | Echo: 1.5 s after the player casts M2 or R, a ghost of that skill detonates at the cast spot at 50% power, marked with the skill icon, so the player must move after casting. Mirror Dome: the boss reflects all damage for 3 s, so the player waits it out with a dodge |
| P3 Blackout | 35 to 0% | The lights fail and the boss is visible only inside lit rails. Three breakers restore light for 25 s each (2 s interact). At 15% Duel binds both in a lit 20 m ring for 20 s: the boss attacks with 25% shorter windups and its poise breaks in half the hits. Leaving the ring deals heavy damage |

## 5. B3 The Herald (Arcology crown, Z4)

Arena: a 90 m rooftop crown with three anchor pylons under the Lantern beam. Theme: the alien link.

| Phase | HP | Mechanics |
| --- | --- | --- |
| P1 Descent | 100 to 75% | Beam Sweep (heavy, rotating beam with one 40 degree gap, 2 s windup). Lantern Drop (4 light columns on marked spots, 1.5 s). Call summons 2 Brutes |
| P2 Fracture | 75 to 50% | The floor splits into 3 platforms joined by narrowing walkways; a fall costs 20% max health and returns the player to a platform. Gravity Pull (3 s telegraph toward the center): counter it with a dodge or by standing beside a pylon |
| P3 Link | 50 to 25% | The Herald rises and cannot be targeted. Three pylons charge: destroy all within 45 s or Resonance Collapse deals 80% max health to anyone outside a pylon shield bubble. Each pylon destroyed forces a 6 s ground stagger of the Herald with x1.5 damage |
| P4 Last Call | 25 to 0% | Cascade: 6 beams sweep in order, 0.8 s apart. At 10% Sever opens a 6 s stagger with x2 damage. The kill sequence opens the Boss Exfil of [23](23-demo-boss-loot-and-drops.md) |

## 6. Tier twists (Proposal)

| Boss | T2 | T3 |
| --- | --- | --- |
| B1 | Cysts hatch every 9 s | Acid pools last twice as long |
| B2 | Echo delay 1.2 s | 6 figures in Phase 1 |
| B3 | Cascade has 8 beams | Beam Sweep gap narrows to 30 degrees |

## 7. Boss Archive (training)

After the first encounter the hub unlocks the Boss Archive: a fixed-seed replay of each boss at the chosen tier, with unlimited retries, no loot, no loss and no contract progress. It follows the no-revenue boss training of the StormBound README.

## 8. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 22-A-01 | Leave the arena before Phase 2, then after Phase 2 starts | The boss resets to full health the first time; the arena is sealed the second time | Not yet implemented |
| 22-A-02 | Reach each phase threshold | The transition plays, adds despawn and player cooldowns drop by 30% | Not yet implemented |
| 22-A-03 | B2 Phase 1 with Scan Pulse | The real figure is outlined for 4 s; killing a decoy causes its burst | Not yet implemented |
| 22-A-04 | B3 Phase 3 with and without destroying the pylons in time | No Collapse if destroyed; 80% max health damage outside a bubble if timed out | Not yet implemented |
| 22-A-05 | Simulate 100 kills per boss at the recommended GR | Mean fight length within the table range | Not yet implemented |
| 22-A-06 | Fight in the Boss Archive | No loot, no loss and no contract progress | Not yet implemented |
