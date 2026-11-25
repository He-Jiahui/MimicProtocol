# Demo Boss Loot and Drops

Status: Draft v0.1. Updated: 2026-11-25. Requirements: D-20.

[Back to index](README.md) | Previous: [22 Demo Bosses](22-demo-bosses.md)

## 1. Intent

A boss kill pays the biggest burst in the demo, in the manner of Diablo-style loot: a visible explosion of drops, a separate chance of a Legendary, pity protection, class-weighted drops and rare perfect rolls. Gear stays Unidentified until it is processed at the Lab ([16](16-demo-tutorial-and-hub-onboarding.md)).

## 2. Item level and affixes

- Item level (ilvl) = 10 x T + 2 x Z + floor(5 x NL), using the zone Z and Night Level NL where it drops. Bosses add +3.
- Affix count: Common 0, Enhanced 1, Rare 2, Prototype 3, Legendary 3 plus one Latent Power.
- Affix values roll between 70% and 100% of the range for the item level. A Prime item (a perfect roll) rolls in the top 10% of every range and shows a gold P tag. Prime chance is 4% for normal drops and 8% for boss drops.
- Slot weights: weapon 35, body 30, rig 20, backpack 15. Weapon drops match the active class family 70% of the time (smart loot).

## 3. Rarity tables

Weights are per drop. Rare and above are multiplied by the tier rare weight ([07](07-meta-progression-and-difficulty.md)) and renormalized.

| Source | Common | Enhanced | Rare | Prototype | Legendary |
| --- | --- | --- | --- | --- | --- |
| Container | 70 | 25 | 5 | 0 | 0 |
| Mimic kill | 80 | 18 | 2 | 0 | 0 |
| Elite named drop | 0 | 50 | 38 | 11 | 1 |
| Boss gear slot | 0 | 25 | 50 | 25 | 0 (separate roll) |

Container gear is identified and Clean. Gear dropped by Mimics, nests and bosses is Unidentified and Tainted ([08](08-loot-contamination-and-legendary-gear.md)). Demo override of 08: Mimic gear shows a Signal Class on the ground and in the inventory (Faint is Enhanced, Strong is Rare, Intense is Prototype, Anomalous is Legendary). Process reveals the affixes, Prime status and the Latent Power.

## 4. Boss drop package

Per kill, with T the Threat Tier:

| Part | B1 | B2 | B3 |
| --- | --- | --- | --- |
| Gear drops | 2 + T | 2 + T | 2 + T |
| Cash | 500 | 800 | 1200 |
| Lab Samples | 4 | 6 | 8 |
| Intel Credits | 3 | 4 | 5 |
| Boss Cores | 1 (2 on first kill) | 1 (2 on first kill) | 1 (2 on first kill) |
| Boss Cache | Choose 1 of 3 Prototype run items at once | Same | Same |

Cash is multiplied by (1 + 0.15 x (T - 1)). Gear drops use the Boss gear slot row. The Boss Cache works for the rest of the raid ([18](18-demo-classes-elites-and-items.md)).

## 5. Legendary roll, pity and first kill

- Each boss kill makes one separate Legendary roll. Base chance: B1 10%, B2 12%, B3 15%, plus 4 points for each tier above T1.
- Pity: +5 points for each boss kill without a Legendary, and a guarantee on the 8th such kill. The counter is per profile and resets on a Legendary.
- The first kill of each boss on a profile always drops one Legendary from its Signature Pool.
- A Legendary comes from the boss Signature Pool with 70% weight and from the shared pool with 30%.

Latent Powers reuse the Powers of [08](08-loot-contamination-and-legendary-gear.md) section 7 that fit the four demo slots:

| Boss | Signature Pool | Slot |
| --- | --- | --- |
| B1 | Hollow Heart, Alpha Hide | Weapon, Body |
| B2 | Resonant Echo, Brood Carapace | Rig, Body |
| B3 | Progenitor Core | Backpack |

The shared pool holds all five Powers. Each Legendary carries one fixed Power, revealed by Process, with the cost listed in 08. In the demo a Power cannot be moved or rerolled (Q-25).

## 6. Presentation

- Loot burst: items arc out of the corpse over 1.2 s and land with a rarity beam. Common none; Enhanced thin cyan; Rare wide cyan with a chime; Prototype violet with a deeper chime and a soft edge pulse; Legendary a gold column with its own sting and a slow ring; Prime adds white sparkle. Edge pulses obey the reduce flashing setting and the bloom caps of [11](11-rendering-and-visual-style.md).
- Ground labels: icon only for Common and Enhanced; name and Signal Class for Rare and above. Hover shows a comparison with the equipped item ([12](12-ui-and-hud.md)).
- Currency and samples are picked up automatically. Items need E, and holding E collects all items within 6 m.
- A ground item cap of 80 applies, and the oldest Common items despawn first.

## 7. Boss Cores and sinks

Enhance levels +6 to +8 cost about 630, 1010 and 1610 Cash and 1, 2 and 3 Boss Cores. Cores come only from bosses, so each kill is also a long-term upgrade.

## 8. Boss Exfil

When B3 dies a rift exfil opens in the arena for 120 s with the usual 6 s hold ([02](02-core-loop-and-raid-structure.md)), so the player can leave with the biggest package without crossing the city. B1 and B2 have no dedicated exfil; the walk back is the risk.

## 9. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 23-A-01 | Sample 10000 Boss gear slot drops at T1 | Shares near 25, 50 and 25 percent before the tier multiplier | Not yet implemented |
| 23-A-02 | Simulate boss kills with the Legendary roll failing every time | A Legendary drops by the 8th kill at the latest | Not yet implemented |
| 23-A-03 | Kill a boss for the first time, then a second time | First kill drops a Signature Pool Legendary; the second is not guaranteed | Not yet implemented |
| 23-A-04 | Compute ilvl for a B1 drop at T1, Z3, NL 0.5 | 21 | Not yet implemented |
| 23-A-05 | Roll 10000 normal and 10000 boss drops | Prime shares near 4% and 8% | Not yet implemented |
| 23-A-06 | Process a Legendary | The Latent Power and Prime tag are revealed and the Power is fixed | Not yet implemented |
| 23-A-07 | Kill each of the three bosses | The Boss Exfil opens only after B3 | Not yet implemented |
| 23-A-08 | Drop more than 80 ground items | The cap holds and the oldest Common items despawn first | Not yet implemented |
