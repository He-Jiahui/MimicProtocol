# UI and HUD

Status: Draft v0.1. Updated: 2026-11-25. Requirements: R-02, R-05, R-07, R-10, R-12.

[Back to index](README.md) | Previous: [11 Rendering and Visual Style](11-rendering-and-visual-style.md) | Next: [13 Technical Architecture](13-technical-architecture.md)

## 1. Principles

1. Rewards and costs are shown as icons and counts, not sentences. This follows StormBound doc 49.
2. A screen that spends or produces a resource also shows the matching stock on the same screen.
3. The HUD only reads game state. It never changes it, as in the StormBound HUD design.
4. Information has a price: any sensing control shows its exposure cost before it is used (see [03](03-mutants-detection-and-enemy-ai.md)).
5. The UI palette is restrained so it does not compete with scene emissives (see [11](11-rendering-and-visual-style.md)).
6. Everything needed during a fight is visible without opening a menu.

## 2. Raid HUD layout (desktop, 16:9)

| Zone | Contents |
| --- | --- |
| Top center | Lantern Cycle clock: phase name, countdown and progress bar. Alert pips 0 to 5 under it |
| Top left | Contract tracker (3 contracts), raid level and XP bar |
| Top right | Minimap with fog of war, compass strip, vertical band indicator (sewer, street, mezzanine, roof) |
| Bottom left | Health, shield, stamina, Contamination meter |
| Bottom center | Skill bar M1, M2, S, R with cooldown sweeps; quick items 1 to 4 |
| Bottom right | Weapon and ammo, class resource readout |
| Screen center | Reticle, hit markers, extraction progress bar while channelling |
| Screen edge | Damage direction ring, open Resonance Link indicators |
| World space | Small health bars on Revealed Mimics, awareness arcs on linked Mimics, interaction prompts |
| Right edge | Compact loot log and toasts |

Pattern sources in WATER.html: the tide panel with open and surge states, the contract list, the extraction progress bar, the damage direction ring, the minimap, floating numbers and the hit marker. The new project adapts the layout ideas and re-implements them.

## 3. Sense rig UI

- Passive mode: a faint shimmer at the screen edge when a Mimic is inside passive range. No outline and no identification.
- Scan Pulse: a ring expands from the operator. Each Mimic it reveals gets an outline and an awareness arc that fills while the link is open. Hovering or aiming at one shows its archetype, awareness percent and time to flip.
- Before use, the C key hint shows range and cost (Alert plus N, number of links that would open).
- Deep Scan: a channel bar, then a district-slice map overlay.
- A counter shows how many links are currently open.

## 4. Lantern Cycle and Alert

- Phase colors: Dormant teal, Open Window green with a glow, Pulse red-violet. This adapts the flood, ebb and surge panel states of WATER.html.
- Phase changes show a short banner and an audio sting. The Pulse banner respects the reduce-flashing setting.
- Alert shows 5 pips. Each level has a one-line consequence in its tooltip.
- Extraction hint: an edge arrow with a distance label for the announced nearest active point only, adapted from the prototype arrow and arrow label.

## 5. Inventory and gear

- Grid inventory with backpack, rig pockets and the secure case. Drag and drop moves items; the rotate key applies only while the inventory is open.
- Item cards show a rarity border. Tainted items carry a green-violet hazard stripe. Unidentified items show a question mark.
- The header shows total weight with threshold marks, and total value.
- Hovering an item compares it with the equipped one.
- Insured items show an insurance icon.
- Search panel: container contents appear one by one as the search progresses. Moving away or taking damage closes it and cancels the search.
- Broker panel adapts the WATER.html trade panel: a sell column picked with number keys, a buy column picked with Z, X and C, banked cash shown at the top, and the 80 percent instant-sale rate stated on screen.

## 6. Hub screens

| Screen | Notes |
| --- | --- |
| Barracks | Grid of the 20 classes with icon and level; specialization picker |
| Skill tree | Pan and zoom canvas with minimap and detail panel, following StormBound doc 33 |
| Armory | Slots, mods, loadout presets |
| Stash | Persistent grid, sort and filter |
| Quartermaster | Buy, sell, insure, with Cash shown |
| Containment Lab | Four-stage pipeline view (appraise, decontaminate, extract, install) with Lab Sample cost icons and the sample stock beside them |
| Intel Desk | Hand in intel, contract board, district unlocks |
| Threat Console | Tier selector showing the multipliers from [07](07-meta-progression-and-difficulty.md), a recommended power rating and an under-power warning |

## 7. Debrief screens

- Extraction: loot list with value, contracts paid, XP and class level changes, items moved to the stash, a warning for Tainted items.
- Death: what was lost, which insured items returned, and a cause-of-death readout listing the last damage sources, adapted from StormBound doc 72.
- Both screens fade in after a short blackout, and input is locked for a moment to prevent accidental skips (StormBound doc 76 pattern).

## 8. Pause and detail views

- Pause shows the skill list, active Run Perks with stack counts, and the stat sheet.
- Run Perks appear as icons with stack numbers and a hover popup, following StormBound doc 70-1.
- An optional per-skill damage breakdown follows StormBound doc 69.

## 9. Accessibility and settings

- Text scale 75 to 150 percent, color-blind palettes, reduce flashing, bloom strength, high-contrast outlines.
- Subtitles for important audio cues, including the Lantern Pulse and Mimic shrieks.
- Full key rebinding, plus hold or toggle for Aim and Scan.
- Settings are grouped as in StormBound doc 49-2.

## 10. Input contexts

Contexts are Raid, Inventory, Search, Trade, Lockpick and Menu. Exactly one is active at a time and the others ignore input. Key meanings are listed in [04](04-camera-controls-and-combat.md). Touch layouts are not part of the first release (see [14](14-roadmap-and-open-questions.md)).

## 11. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 12-A-01 | Open the Containment Lab | Each stage shows its Lab Sample cost icon and the current stock on the same screen | Not yet implemented |
| 12-A-02 | Fire Scan Pulse | The hint showed range and cost beforehand; awareness arcs appear on linked Mimics | Not yet implemented |
| 12-A-03 | Hold extraction | Progress bar fills; taking damage resets it | Not yet implemented |
| 12-A-04 | Open the inventory during a raid | Raid input is ignored until it closes | Not yet implemented |
| 12-A-05 | Enable reduce flashing and trigger a Pulse | The banner and screen flash stay under the configured limit | Not yet implemented |
