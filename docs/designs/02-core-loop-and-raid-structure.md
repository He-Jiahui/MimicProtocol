# Core Loop and Raid Structure

Status: Draft v0.1. Updated: 2026-11-25. Requirements: R-01, R-03, R-05, R-10.

[Back to index](README.md) | Previous: [01 World and Narrative](01-world-and-narrative.md) | Next: [03 Mutants, Detection and Enemy AI](03-mutants-detection-and-enemy-ai.md)

## 1. Macro loop

Hub (Forward Operating Base) -> loadout and contracts -> insertion -> raid -> extraction or death -> debrief -> hub processing (appraise, decontaminate, modify, upgrade) -> next raid.

Two kinds of growth run in parallel and are balanced in [06](06-run-growth-roguelite.md) and [07](07-meta-progression-and-difficulty.md): run-scoped growth resets every raid; meta growth persists.

## 2. Hub: Forward Operating Base

| Station | Function |
| --- | --- |
| Barracks | Choose one of the 20 classes, view class level and skill tree |
| Armory | Equip weapons, armor and consumables; apply mods |
| Stash | Persistent storage between raids |
| Quartermaster | Buy, sell and insure items |
| Containment Lab | Appraise unknown gear, decontaminate, extract legendary powers, install mods |
| Intel Desk | Hand in intel, accept contract packages, unlock districts |
| Threat Console | Select the Threat Tier for the next raid |

## 3. Raid clocks (Proposal)

Two clocks drive tension. Web demo override: the Lantern Cycle is disabled in the demo and a dusk-to-night clock replaces it; see [15](15-web-demo-scope-and-overrides.md) section 4 and [17](17-demo-raid-map-time-and-zones.md).

- Alert (0 to 5): rises with noise, scans, kills and time; falls slowly while hidden.
- Lantern Cycle: a repeating phase schedule. It adapts the flood, ebb and surge tide phases of the WATER.html prototype, where shutters stay closed in flood, open in ebb so the player can leave, and the enemy floods back in surge.

| Phase | Meaning | Extraction | Enemy behavior |
| --- | --- | --- | --- |
| Dormant | Mimics disguised, low pressure | Closed | Patrol, rare reveals |
| Open Window | Command opens an exfil corridor | Open (2 or 3 points active) | Normal |
| Pulse | The Lantern pulses and all linked Mimics wake | Closed | Spawn bursts, every revealed Mimic hunts |

Starting values (Proposal): cycle length 10 minutes = Dormant 6, Open Window 2.5, Pulse 1.5. The raid hard-ends after the third Pulse (about 30 minutes); anyone not extracted is lost like a death. Leaving at the first window is a legitimate low-risk, low-reward choice.

## 4. Extraction rules

- Hold-to-extract channel of 6 seconds (Proposal), interrupted by taking damage or leaving the zone. WATER.html uses the same pattern with a progress bar.
- Starting an extraction broadcasts a beacon: Alert +1 and nearby Mimics are alerted.
- Point types: rooftop dropship, rail platform, dock boat, sewer hatch, shelter gate. Some require a condition such as a key card, restored power or a fee.
- Each raid activates a random subset of points; Command only announces the nearest active one early.

## 5. Death and loss

| Item | On extraction | On death or Final Pulse |
| --- | --- | --- |
| Carried loot | Kept | Lost |
| Equipped gear | Kept | Lost unless insured |
| Insured and secure-case items | Kept | Kept |
| Intel | Handed in for payout | Lost |
| Cash from instant sales to the broker | Banked | Banked (as in WATER.html, broker cash is deposited immediately) |
| Class XP | Kept | Kept (Proposal) |
| Run-scoped upgrades | Reset | Reset |

A free starter kit is always available, so a total loss never soft-locks progress (Proposal).

## 6. Contracts

Three contracts per raid (WATER.html pattern): kill counts, intel types, visit points, no-scan challenges. Rewards pay only after extraction and are void on death. Multi-raid hub contracts that unlock sectors are defined in [21](21-demo-contracts-and-sector-states.md).

## 7. Carrying capacity

- Grid inventory sized by the backpack; item weight adds a movement penalty at thresholds (Proposal).
- Secure case: a small fixed grid that survives death.
- Contaminated items occupy space and may spread corruption (see [08](08-loot-contamination-and-legendary-gear.md)).

## 8. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 02-A-01 | Full cycle: start a raid, loot, extract during a window | Loot moves to the stash; contracts pay | Not yet implemented |
| 02-A-02 | Die while holding an insured item | Insured and secure-case items kept, others lost | Not yet implemented |
| 02-A-03 | Take damage while extracting | Channel resets; no extraction | Not yet implemented |
| 02-A-04 | Reach the Final Pulse without extracting | Raid ends as a death | Not yet implemented |
