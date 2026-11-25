# Mutants, Detection and Enemy AI

Status: Draft v0.1. Updated: 2026-11-25. Requirements: R-06, R-08, R-09, R-11.

[Back to index](README.md) | Previous: [02 Core Loop](02-core-loop-and-raid-structure.md) | Next: [04 Camera, Controls and Combat](04-camera-controls-and-combat.md)

## 1. The mutual detection duel (R-09)

The sense rig is the signature mechanic. Information about Mimics always costs exposure.

| Rig mode | Range | What the player sees | Exposure cost |
| --- | --- | --- | --- |
| Passive | Short (Proposal 12 m) | Faint heat-blur hints on nearby people, no identification | None |
| Scan Pulse | Medium (Proposal 35 m) | Outlines of all Mimics through walls for 4 s, labelled by archetype | Opens a Resonance Link to every revealed Mimic |
| Deep Scan | Long (Proposal 70 m), channelled | A district-slice map of Mimics and Hosts | Opens links, adds Alert, long cooldown |

Resonance Link: each revealed Mimic gains an Awareness meter that rises while the link is open (roughly 2 to 5 seconds to flip, Proposal). The link closes when the pulse ends, when line of sight passes through a shielded room, or when distance exceeds the link range. A Mimic whose Awareness reaches 100 percent becomes Hostile and shows its true form. Nearby Mimics gain partial Awareness through a shared alarm.

Counterplay and build space: low-emission perks shorten link time; shielded rooms break links; decoys and noise bait draw hostile Mimics away; some classes have passive sensing perks (see [05](05-classes-and-skills.md)).

## 2. Mimic state machine

| State | Behavior | Exit |
| --- | --- | --- |
| Disguised Patrol | Walks routes, idles, talks, looks like a civilian | Awareness reaches 100 percent, damage taken, loud event nearby |
| Suspicious | Head tracking, micro-glitches, may stop | Awareness decays, or flips to Revealed |
| Revealed | Short transformation (about 1 s), shriek raises Alert | Becomes Hunting |
| Hunting | Pursues last known position and flanks | Loses the target for 8 s (Proposal) |
| Searching | Sweeps the last known area | Finds the player or gives up |
| Re-disguise | Returns to routes and slowly resets Awareness | After 20 s (Proposal) |

Mimics are not omniscient. Hunters use sight cones, a hearing radius and last-known-position memory. Navigation reuses the navmesh pipeline from StormBound (see [13](13-technical-architecture.md)).

## 3. Archetypes (Proposal)

| Archetype | Role | Notes |
| --- | --- | --- |
| Walker | Basic melee swarm | Common; disguised as pedestrians |
| Spitter | Ranged acid, leaves hazard pools | Disguised as street vendors |
| Skitter | Fast flanker that climbs walls and ceilings | Targets isolated players |
| Brute | Armored bruiser | Heavy disguise such as guards or workers |
| Hollow | Suicide infector that spreads contamination on death | Corrupts nearby containers and carried items |
| Caller | Support unit that alerts and summons | Priority target |
| Alpha (elite) | Affixed elite with named drops | Elite output scales with Threat Tier (see [07](07-meta-progression-and-difficulty.md)) |
| Progenitor (boss) | Nest anchor inside a landmark building | Optional high-reward objective; demo boss designs are in [22](22-demo-bosses.md) |

Elite affixes and enemy ability patterns are adapted from StormBound development documents 38, 72 and 83 (elite affixes, difficulty-driven growth, monster orchestration data).

## 4. Civilians (Proposal, open)

- Non-hostile NPCs in shelters and streets. Scans mark them as Human.
- Killing a civilian: Command penalty (reputation and payout) and an Alert spike. No gear loss.
- Mimics copy civilian crowds: a group of 2 to 4 may be all human, all Mimic or mixed.

## 5. Hosts (infected objects, R-11)

Hosts behave like containers but belong to the enemy. Scan Pulse highlights them. Rules are in [08](08-loot-contamination-and-legendary-gear.md).

## 6. Spawn director

- Budget-based: each district tick receives credits driven by Alert level, Lantern phase and Threat Tier.
- Spawns prefer disguised placements out of sight; a Pulse reveals many at once.
- Hard caps (Proposal): 40 active hostile enemies, 120 disguised background NPC entities, 16 Hosts in interaction range.
- Background crowd uses instanced, low-update agents; only Mimics within 60 m get full AI.

## 7. Threat Tier scaling

Monster health, damage, elite production rate and rare drop odds scale with the chosen Threat Tier. See [07](07-meta-progression-and-difficulty.md).

## 8. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 03-A-01 | Scan Pulse near 3 Mimics and 2 civilians | Mimics outlined and linked; civilians outlined as human with no link | Not yet implemented |
| 03-A-02 | Link stays open for the full flip time | Mimic becomes Revealed; Alert rises | Not yet implemented |
| 03-A-03 | Player breaks the link through a shielded room | Link closes; Awareness decays | Not yet implemented |
| 03-A-04 | Hostile loses the target for 8 s | Enters Searching, then Re-disguise | Not yet implemented |
| 03-A-05 | 40 hostiles active | Spawn director stops adding; frame time stays in budget | Not yet implemented |
