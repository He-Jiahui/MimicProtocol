# In-Raid Roguelite Growth

Status: Draft v0.1. Updated: 2026-11-25. Requirements: R-05.

[Back to index](README.md) | Previous: [05 Classes and Skills](05-classes-and-skills.md) | Next: [07 Meta Progression and Threat Tiers](07-meta-progression-and-difficulty.md)

## 1. Boundary

Run growth belongs to one raid and resets on extraction and on death. Three growth layers are balanced together: Run (this page), Meta ([07](07-meta-progression-and-difficulty.md)) and Gear ([08](08-loot-contamination-and-legendary-gear.md)). When a raid ends, only items, class XP, cash and intel leave it.

## 2. Power budget model (Proposal)

Player power is modelled as P = M x G x R, normalized so a fresh T1 operator with the starter kit is 1.0.

| Layer | Source | Proposed ceiling | Persistence |
| --- | --- | --- | --- |
| Meta M | Class level, talents, Operator Rank, hub upgrades | 2.2 | Permanent |
| Gear G | Weapons, armor, mods, legendary powers | 2.5 | Permanent, at risk in raids unless insured |
| Run R | Raid level perks, shrines, in-raid items | 2.0 | Resets every raid |

Rule: measured in logarithms, each layer should contribute between 25 and 45 percent of total power. The run layer decides how a given raid goes; meta and gear decide which Threat Tiers are realistic. These ceilings are hypotheses to be tuned with deterministic CPU simulations modelled on the StormBound reports balance-report.mjs and progression-report.mjs.

## 3. Raid XP and levels

Web demo override: the demo has no perk draft. In-raid growth comes from RoR2-style items and a small flat raid-level bonus; see [18](18-demo-classes-elites-and-items.md) section 5 and Q-23 in [14](14-roadmap-and-open-questions.md).

- Raid level 1 to 15 (Proposal).
- XP sources: kills of Revealed Mimics, the first scan of each archetype, searched Hosts and containers, intel pickups, contract steps and elites.
- Each level opens a Draft: pick 1 of 3 Run Perks with number keys 1 to 3. The draft cannot be skipped, as in the StormBound level-up panel. Whether the simulation pauses or slows during a draft is an open question.
- Required XP for level n grows by roughly 1.25 to the power n. Pacing target: a level every 80 to 120 s in the first 8 minutes, then slower; 9 to 12 levels in a full raid. StormBound deliberately slowed its own level curve, so these values will change.

## 4. Run Perks

- Three rarities: Common, Enhanced, Prototype, mirroring the white, green and red in-run items of StormBound doc 70 (44 items with duplicate stacking).
- Stacking has diminishing returns, for example bonus = 1 - 1 / (1 + k x stacks), so no single perk runs away.
- Tags: Ballistic, Elemental, Deployable, Melee, Stealth, Salvage, Sense, Sustain. A draft biases about half of its offers toward tags already owned and half at random, so builds form without being forced.

| Perk | Tag | Effect (Proposal) |
| --- | --- | --- |
| Hair Trigger | Ballistic | Plus 8 percent fire rate per stack |
| Cold Cathode | Elemental | Chance to chill on hit |
| Overwatch Node | Deployable | Plus 15 percent deployable duration per stack |
| Impact Gloves | Melee | Melee hits grant a small shield |
| Quiet Hands | Stealth | Search noise reduced by 30 percent |
| Deep Pockets | Salvage | Plus one inventory row for this raid |
| Low Signature | Sense | Resonance Link takes 20 percent longer to flip per stack |
| Field Dressing | Sustain | Regenerate health slowly while out of combat |

## 5. World growth sources

| Source | Offer | Risk |
| --- | --- | --- |
| Signal Shrine | A perk in exchange for health or Alert | Alert spike or health loss |
| Gray Market Terminal | Perks or consumables for raid Credits | May be a Host and ambush the buyer |
| Supply Cache | Credits and consumables | Guarded by Mimics |

The shrine, chest and trade device pattern adapts StormBound doc 39-3 (altars, risk chests, gambling devices).

## 6. Raid Credits

Credits are a raid-scoped currency from kills and searching. Unspent Credits vanish on death. On extraction, 20 percent convert to Cash (Proposal), which mildly rewards leaving with a plan without turning Credits into a meta currency. Rerolling a draft costs Credits; banishing a perk is limited to 2 per raid.

## 7. Threat Tier interaction

Raid XP gain rises by 5 percent per Threat Tier above T1, so pacing stays similar when monsters are tougher. The Pulse escalation in [07](07-meta-progression-and-difficulty.md) applies on top.

## 8. Persistence and recovery

A raid snapshot (position, perks, level, random streams, spawned entities) lets a browser refresh resume the raid, modelled on StormBound doc 50 expedition snapshot recovery. A snapshot that fails validation is rejected whole and never partially applied. Whether a rejected raid is voided or the loadout refunded is an open question.

## 9. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 06-A-01 | Gain a raid level | Draft shows 3 perks; keys 1 to 3 pick; no skip | Not yet implemented |
| 06-A-02 | Stack the same perk 10 times | Bonus follows the diminishing curve and stays under its cap | Not yet implemented |
| 06-A-03 | Extract or die | All run perks reset; unspent Credits follow section 6 | Not yet implemented |
| 06-A-04 | Refresh the browser mid-raid | Raid resumes with the same perks, level and random streams | Not yet implemented |
