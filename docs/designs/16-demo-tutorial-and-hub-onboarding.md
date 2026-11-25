# Demo Tutorial and Hub Onboarding

Status: Draft v0.1. Updated: 2026-11-25. Requirements: D-02, D-03, D-04, D-05, D-06.

[Back to index](README.md) | Previous: [15 Web Demo Scope and Overrides](15-web-demo-scope-and-overrides.md) | Next: [17 Demo Raid: Map, Time of Day and Zones](17-demo-raid-map-time-and-zones.md)

## 1. Goals

Teach in this order: move and aim, search, the four skills, the class combo, the sense scan and killing Mimics, extraction, then the hub economy. Anything the first raid depends on is a forced step (D-03, D-06). A first-time player should finish in 10 to 13 minutes (Proposal).

## 2. Comms liaison

- Call sign Relay (placeholder, Q-26): a Command liaison on the radio, shown as subtitle lines with a small portrait.
- Dry, professional and short: one instruction per line, at most 120 characters.
- Lines fire on objective state, never on a timer, so a slow player is not talked over. After 20 s idle on a step Relay repeats the hint; after 45 s the target is highlighted.
- About six lines introduce the Lantern, the Mimics and the sense rig (see [01](01-world-and-narrative.md)).

## 3. Phase A: Training Annex

A small enclosed annex (about 120 m by 80 m, two floors) built by the generator from a fixed seed (see [10](10-procedural-generation.md)). The player uses the Rifleman, the easiest kit (see [18](18-demo-classes-elites-and-items.md)). The annex has no lethal damage: a failed step respawns the player and resets that step.

| Stage | Teaches | Pass condition |
| --- | --- | --- |
| A1 Move and aim | WASD, mouse aim, reticle, V camera toggle, Alt aim | Reach 3 waypoints and toggle the camera once |
| A2 Search | Hold E, search time, noise, a glowing Host, lockpick | Open 3 containers, one locked. They always hold 2 Sealed Data Cases (sellable) and 1 Unidentified Mimic Carapace (gear) |
| A3 Normal and small skill | Left and right mouse, cooldown sweep | Hit 5 dummies with M1, then use M2 once |
| A4 Dodge | Shift, invulnerability frames, telegraphs | Dodge 2 telegraphed strikes |
| A5 Ultimate and combo | R and the class combo chain | Perform the full chain once on dummies |
| A6 Scan and first kills | C scan, Resonance Link cost, Awareness, weak spots | Scan, reveal 2 disguised Mimics, kill 3 Walkers |
| A7 Elite | One affix (Armored) and its counterplay | Kill one training elite |
| A8 Extraction | Hold E in the zone, interruption | Complete the channel |

The guaranteed items spawn directly into the three containers, cannot be skipped or lost, and sit in a protected slot until sold (Proposal).

## 4. Phase B: Hub guided flow

Every step is forced on the first visit. The exact control is highlighted and the next step stays locked until the action is done. Each screen shows the stock it spends or earns (see [12](12-ui-and-hud.md)).

| Step | Screen | Action | Teaches (D-06) |
| --- | --- | --- | --- |
| B1 | Quartermaster | Sell the 2 Sealed Data Cases | Selling loot |
| B2 | Containment Lab | Process the Unidentified Mimic Carapace: appraise plus decontaminate for 1 Lab Sample (granted) | Unidentified gear |
| B3 | Armory | Equip the result on the body slot and read the comparison | Equipping |
| B4 | Armory | Enhance the starter weapon from +0 to +1 | Enhancing |
| B5 | Armory | Reroll one affix of the Carapace | Affix reroll |
| B6 | Barracks | Pick an M2 variant for the class | Skill variants |
| B7 | Threat Console | Select T1; T2 and T3 are shown locked with their multipliers | Raid difficulty |
| B8 | Briefing | Relay states the raid goals, then deploy | First raid |

Cash, Lab Samples, and Boss Cores are unlimited during the first hub visit. The hub replaces missing supplies required for unfinished steps. Completing the checklist clears all three balances and unlocks deployment with the equipped gear. The tutorial Carapace uses a fixed Rare roll.

## 5. Demo rules for upgrades

- Enhance: +1 to +5 for Cash and Scrap, with no failure chance. Each level adds about 8 percent to the item's base stat, and the cost grows 1.6 times per level (Proposal).
- Reroll: replaces one chosen affix with a new roll from the same pool. A preview shows the possible range. Locking another affix doubles the cost.
- Skill variants: each class has 2 variants for M2 and 2 for R (see [18](18-demo-classes-elites-and-items.md)). Switching in the hub is free.

## 6. After the tutorial

- The hub opens class select with the four demo classes and an optional Training Range for each kit.
- Later visits have no forced flow. Relay gives a one-time hint the first time each feature is used.
- A completed profile can replay training from the Barracks (Proposal).

## 7. Resume and failure

- The profile saves at the end of each stage, so closing the browser resumes at the last completed stage.
- Esc always pauses. Forced screens cannot be skipped.
- The first raid unlocks only after B8 is complete.

## 8. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 16-A-01 | Open the three tutorial containers in A2 | Each always yields its guaranteed item | Not yet implemented |
| 16-A-02 | A4: take a telegraphed strike with and without a dodge | Dodge during the invulnerability window deals 0 damage; no dodge deals damage | Not yet implemented |
| 16-A-03 | B1 with only one case sold | The next step stays locked until both are sold | Not yet implemented |
| 16-A-04 | Refresh the browser during Phase A | The tutorial resumes at the last completed stage | Not yet implemented |
| 16-A-05 | Open the Threat Console in B7 | T1 is selectable; T2 and T3 are locked and show multipliers | Not yet implemented |
| 16-A-06 | Five first-time testers play the full tutorial | Median time between 10 and 13 minutes; manual check | Not yet implemented |
