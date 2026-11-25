# Meta Progression and Threat Tiers

Status: Draft v0.1. Updated: 2026-11-25. Requirements: R-05, R-06.

[Back to index](README.md) | Previous: [06 In-Raid Roguelite Growth](06-run-growth-roguelite.md) | Next: [08 Loot, Contamination and Legendary Gear](08-loot-contamination-and-legendary-gear.md)

## 1. Meta layers

| Layer | Description | Source |
| --- | --- | --- |
| Class level 1 to 60 | Per class; XP is kept even when a raid ends in death (Proposal) | StormBound README |
| Operator Rank | Shared across classes, 0 to 300 | Adapted from the StormBound shared paragon track |
| Talent tree | 5 branches of 4 tiers, up to 2 keystones, specialization-specific areas | StormBound doc-02 talent tree, adopted as a starting point |
| Specializations | 3 per class, unlocked at class level 10 | StormBound README |
| Hub upgrades | Stash size, Quartermaster tier, Lab tier (appraise speed, decontamination success), Armory slots, insurance slots, secure case size | New |
| Command reputation | Unlocks districts, contract tiers and Quartermaster stock | New |
| Codex | Bestiary and gear collection with small rewards | Adapted from StormBound codex and legendary collection |

## 2. Hub currencies (Proposal)

| Currency | Source | Sink |
| --- | --- | --- |
| Cash | Selling loot, contract payouts, 20 percent of unspent Credits | Quartermaster, insurance, hub upgrades |
| Intel Credits | Handing in intel | Contract unlocks, district unlocks |
| Lab Samples | Mimic tissue and elemental residue | Appraisal, decontamination, power extraction (see [08](08-loot-contamination-and-legendary-gear.md)) |
| Command Marks | Reputation milestones | Rare Quartermaster stock |

## 3. Threat Tiers (R-06)

The Threat Console sets a tier T1 to T10 for each raid. A higher tier raises monster health, monster attack, elite output and rare drop rates together, so risk and reward rise as a package.

Formulas (Proposal), with T the tier number:

- Monster health multiplier = 1.2 to the power (T - 1)
- Monster damage multiplier = 1.15 to the power (T - 1)
- Elite share of the spawn budget = 6 percent + 3 percent x (T - 1)
- Elite named-drop chance = 30 percent + 7 percent x (T - 1)
- Rare-or-better drop weight multiplier = 1 + 0.15 x (T - 1)

| Tier | Health | Damage | Elite share | Elite named drop | Rare weight |
| --- | --- | --- | --- | --- | --- |
| T1 | 1.00 | 1.00 | 6% | 30% | 1.00 |
| T2 | 1.20 | 1.15 | 9% | 37% | 1.15 |
| T3 | 1.44 | 1.32 | 12% | 44% | 1.30 |
| T4 | 1.73 | 1.52 | 15% | 51% | 1.45 |
| T5 | 2.07 | 1.75 | 18% | 58% | 1.60 |
| T6 | 2.49 | 2.01 | 21% | 65% | 1.75 |
| T7 | 2.99 | 2.31 | 24% | 72% | 1.90 |
| T8 | 3.58 | 2.66 | 27% | 79% | 2.05 |
| T9 | 4.30 | 3.06 | 30% | 86% | 2.20 |
| T10 | 5.16 | 3.52 | 33% | 93% | 2.35 |

The tier also scales raid XP gain (see [06](06-run-growth-roguelite.md)). Elite and boss gear quality follows [08](08-loot-contamination-and-legendary-gear.md).

## 4. Pulse escalation inside a raid

Web demo override: the demo has no Lantern Pulse. The Night Level in [17](17-demo-raid-map-time-and-zones.md) replaces this section, and only Threat Tiers T1 to T3 exist (see [15](15-web-demo-scope-and-overrides.md) section 4).

After each Lantern Pulse, all monsters gain 10 percent health and 6 percent damage for the rest of the raid, stacking linearly and multiplying with the Threat Tier. This adapts StormBound doc 38-12, where each storm level adds 10 percent health and 6 percent damage. It makes waiting for a later window costly.

## 5. Tier gating

StormBound documents describe tiers T1 to T10 that are open in the current build. For onboarding, this project proposes a light gate: T(n+1) unlocks after one successful extraction at T(n). The Threat Console shows a recommended power rating and warns when the loadout is under it. Hard versus soft gating is an open question.

## 6. Balance targets (Proposal)

Extraction rate for a median build at the recommended power:

| Tier | Target extraction rate |
| --- | --- |
| T1 | 85% |
| T3 | 70% |
| T5 | 55% |
| T7 | 45% |
| T10 | 30% |

CPU simulations modelled on the StormBound scripts balance-report.mjs, progression-report.mjs and combat-balance-report.mjs measure these targets with fixed seeds and isolated in-memory profiles, so they never touch a real save.

## 7. Profile and save

- The new game keeps its own versioned profile root and must never read or write the StormBound profile key.
- Commits are atomic, with a backup and an explicit migration step, following the StormBound profile design (profile.js and the archive documents).
- Stash contents, class XP and hub upgrades are committed in a single transaction when a raid ends, so a crash cannot duplicate or lose items. The exact storage key is to be decided (see [13](13-technical-architecture.md)).

## 8. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 07-A-01 | Spawn the same encounter at T1 and T5 | Health about 2.07 times, damage about 1.75 times | Not yet implemented |
| 07-A-02 | Kill 1000 elites at T1 and T10 | Named-drop rates near 30 and 93 percent | Not yet implemented |
| 07-A-03 | Run 10000 rare rolls at T1 and T10 | Rare-or-better weight about 2.35 times higher at T10 | Not yet implemented |
| 07-A-04 | Survive a Pulse | Monsters gain 10 percent health and 6 percent damage | Not yet implemented |
| 07-A-05 | Kill the process while a raid commits | After restart, stash and XP show exactly one consistent result | Not yet implemented |
