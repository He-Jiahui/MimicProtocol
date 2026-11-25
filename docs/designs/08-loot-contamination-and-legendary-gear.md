# Loot, Contamination and Legendary Gear

Status: Draft v0.1. Updated: 2026-11-25. Requirements: R-06, R-11, R-12.

[Back to index](README.md) | Previous: [07 Meta Progression and Threat Tiers](07-meta-progression-and-difficulty.md) | Next: [09 World Structure and Buildings](09-world-structure-and-buildings.md)

## 1. Item model

- Rarity ladder (Proposal): Common, Enhanced, Rare, Prototype, Legendary. Legendary items are never found finished; they are built at the hub from Mimic gear (section 6).
- Equipment slots (Proposal): primary weapon, sidearm, head, body, arms, legs, sense-rig module, backpack. StormBound uses 10 slots; this project uses 8 because the raid genre needs a smaller grid.
- Every item has a grid footprint, weight, base value and, from Rare upward, affixes. Affix families are adapted from StormBound docs 34 and 38 (affixes, powers, loot generation) after renaming and re-tuning.
- Item state: Clean, Tainted, or Unidentified (Mimic gear only).

## 2. Searching

- Hold E on a container to search. Search time depends on container size (Proposal: 1 to 4 s). Taking damage or moving away cancels the channel.
- Locked containers use a lockpick minigame adapted from the WATER.html paperclip lock: a pointer sweeps a ring and the player presses E inside the green zone. Lock tier changes the zone size and the number of required hits.
- Search noise (Proposal): hand search 3 m, lockpick 6 m, forced open 15 m. Noise raises the Awareness of nearby Disguised Mimics (see [03](03-mutants-detection-and-enemy-ai.md)).
- Scan Pulse highlights Hosts. Without a scan the player must judge by environmental tells such as a faint pulse in the light, wet residue, or a wrong smell cue in the audio.

## 3. Hosts: infected everyday objects (R-11)

A Host looks like a normal container. The chance that a container is a Host depends on its type, Alert, Lantern phase and Threat Tier.

| Container type | Base Host chance (Proposal) |
| --- | --- |
| Food stall, rice cooker | 15% |
| Medical cabinet | 12% |
| Vending machine | 10% |
| Server rack | 8% |
| Personal locker | 6% |

When an infected container is opened (or its trap is triggered):

| Outcome | Weight | Effect |
| --- | --- | --- |
| Rich cache | 40 | Loot value x1.5 |
| Ambush | 25 | 2 to 4 Mimics reveal at once |
| Spore burst | 20 | Contamination meter +20 |
| Living Host | 15 | The container becomes a hostile monster with a weak-spot core |

Safe handling: killing a Host before opening, or scanning it from range, removes the Spore burst outcome. Hosts are the main risk-reward knob of the search loop.

## 4. Contamination

- The operator has a Contamination meter from 0 to 100 (Proposal). Sources: spore bursts, Hollow deaths, Spitter acid, carrying Tainted items.
- Thresholds: at 33, newly found items may arrive Tainted; at 66, one random carried Clean item becomes Tainted every 60 s; at 100, Resonance Links flip 50 percent faster.
- Tainted items sell for 30 percent less, cannot be insured, and add contamination while carried (+1 per 30 s per item, capped at 5 items). Mimic gear is always Tainted until it is decontaminated.
- Reduction: decontamination canisters, safe rooms, and extraction (the meter resets at the hub).

## 5. Drop sources

| Source | Drops |
| --- | --- |
| Normal Mimics | Lab Samples, consumables, occasional Common gear |
| Elites (Alphas) | Named Mimic gear, with the chance given in [07](07-meta-progression-and-difficulty.md) |
| Progenitors | Guaranteed Mimic gear of at least Rare quality |
| Containers | Supplies, tools, intel, Common to Rare gear |

Bad-luck protection (Proposal): after 6 elite kills without a named drop, the next elite always drops gear. The counter is per profile and persists across raids.

## 6. Mimic gear pipeline (R-12)

Web demo override: appraise and decontaminate merge into one Process action, Power extraction and install are cut, and insurance is replaced by a 2-item secure case; see [15](15-web-demo-scope-and-overrides.md) section 4 and [16](16-demo-tutorial-and-hub-onboarding.md) section 4.

Mimic gear is Unidentified and Tainted when dropped. It can be carried and sold, but not equipped. At the Containment Lab it passes through four stages:

| Stage | What happens | Rule (Proposal) |
| --- | --- | --- |
| Appraise | Reveals rarity, affixes and the dormant Power | Costs Lab Samples; instant in the first release |
| Decontaminate | Removes the Tainted state | Success 70% + 5% per Lab tier, capped at 95%. Failure lowers rarity one step but never destroys the item |
| Extract Power | Consumes the item and yields a Power Core with its Power | Costs Lab Samples; rank equals item quality |
| Install | Sockets a Power Core into a weapon or armor piece | One Power per piece; replacing a core destroys it unless Lab tier is 3 or higher |

Appraisal, decontamination and installation happen only at the hub, so a raid never lets the player use an unsafe item.

## 7. Legendary Powers

Powers change how a build plays, in the spirit of Diablo legendary powers. At most 4 Powers can be active at once: weapon, body, rig, backpack. Each Power names a slot and a cost so it is a trade, not a pure upgrade. Interactions with class skills follow StormBound docs 37 and 63 (skill and gear synergy, build loops).

| Power | Piece | Effect (Proposal) | Cost |
| --- | --- | --- | --- |
| Resonant Echo | Rig | Scan Pulse briefly staggers revealed Mimics | Links flip 30% faster |
| Brood Carapace | Body | A hit taken from behind releases a spore shield | Contamination +5 per trigger |
| Hollow Heart | Weapon | M1 kills have a 15% chance to detonate the corpse | The blast makes noise |
| Skitter Gait | Legs | Dodge roll leaves a decoy for 3 s | Roll costs 20% more stamina |
| Spitter Gland | Arms | Weapon swaps leave an acid puddle | The puddle also hurts you |
| Alpha Hide | Body | Poise threshold +40% | Move speed -5% |
| Progenitor Core | Backpack | Opening Hosts is silent | Contamination builds 25% faster |
| Mimic Mask | Head | Disguised Mimics take 50% longer to link | Passive sense range -30% |
| Lantern Shard | Weapon | Elite kills refresh the R skill cooldown | Each Pulse adds 1 Alert |
| Caller's Voice | Rig | Revealed Callers cannot raise Alert | Deep Scan costs 1 extra Alert |

Set bonus: two Powers from the same Mimic archetype grant a small passive bonus (Proposal).

## 8. Economy and insurance

- Quartermaster: buys and sells gear at the hub. In raids a Gray Market broker pays 80 percent for instant sales and banks the cash immediately, even if the player dies later (pattern from WATER.html). Broker stock is three random offers per raid.
- Insurance: pay 15 percent of base value (Proposal) to insure an item. An insured item returns to the stash after death. Slots grow with hub upgrades (see [07](07-meta-progression-and-difficulty.md)).
- Sinks: mod installs, hub upgrades, insurance and decontamination consumables keep Cash from inflating.

## 9. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 08-A-01 | Open 1000 infected vending machines | Outcome counts near 40, 25, 20, 15 percent | Not yet implemented |
| 08-A-02 | Carry a Tainted item for 5 minutes | Contamination rises as specified and caps at 5 items | Not yet implemented |
| 08-A-03 | Decontaminate at Lab tier 1 across 1000 trials | Success rate near 75 percent; no item destroyed | Not yet implemented |
| 08-A-04 | Install a Power Core on a piece that already has one | Old core destroyed below Lab tier 3, returned at tier 3 | Not yet implemented |
| 08-A-05 | Kill 6 elites without a named drop | The next elite drops gear | Not yet implemented |
