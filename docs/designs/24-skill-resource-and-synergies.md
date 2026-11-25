# Skill Resource and Synergies

Status: Draft v0.1. Updated: 2026-11-25. Requirements: D-21, D-22.

[Back to index](README.md) | Previous: [23 Demo Boss Loot and Drops](23-demo-boss-loot-and-drops.md)

## 1. Intent and requirements

The kits of [18](18-demo-classes-elites-and-items.md) share one loop: M1 builds, M2 spends, S repositions, R bursts. This page gives that loop a shared resource, named skill interactions, and hooks into run items and gear. It applies to the web demo, overrides the M2 cooldowns of [18](18-demo-classes-elites-and-items.md) section 3, and adds two requirements to the register of [15](15-web-demo-scope-and-overrides.md):

| ID | Requirement | Detail in |
| --- | --- | --- |
| D-21 | A dedicated skill resource with defined ability interactions | 24 |
| D-22 | Synergies that connect skills, in-run upgrades and persistent gear | 24 |

## 2. The intended loop

M1 hits generate Charge and apply the class Brand. At 30 Charge, M2 spends it, and when a Spender, sentry or drone hits a Branded enemy it consumes the Brand for a class payoff and refunds part of the cost. The dodge pays 20 Charge when its invulnerability absorbs a hit, so dodging well funds the next Spender. R opens Overdrive, a short window in which Spenders are free and Builders pay double, where items and Aspects built around Charge peak. Between fights, passive gain refills one Spender about every 20 s.

## 3. Charge (Proposal values)

Every class uses Charge, 0 to 100 by default, shown in the right-hand orb of the HUD (the class resource readout of [12](12-ui-and-hud.md) section 2). Charge never exceeds its maximum; gain above it is lost.

| Source or sink | Amount | Notes |
| --- | --- | --- |
| Passive gain | +1.5 per second | Always on, never doubled |
| Builder (M1) hit on a hostile | See 3.1 | Doubled during Overdrive |
| Clean dodge | +20 | The S invulnerability absorbs a hit |
| Consume refund | +6 per Consume, at most 18 per cast | See section 4 |
| Spender (M2) | -30 | Cannot be cast below 30; free during Overdrive |

### 3.1 Builders

| Class | M1 | Charge |
| --- | --- | --- |
| Rifleman | Burst Rifle | 4 per bullet that hits (12 per full burst) |
| Blade | Three-Strike Combo | 9 per enemy struck; at most 2 enemies count per swing |
| Summoner | Marker Grenade | 10 per grenade that hits at least one enemy |
| Toxic Handler | Toxic Spit | 5 per spit that hits |

### 3.2 Spenders

Every M2 costs 30 Charge. Because Charge is now the limiter, M2 cooldowns drop. Existing cooldown effects apply to the new values.

| Class | M2 | Old cooldown | New cooldown |
| --- | --- | --- | --- |
| Rifleman | Piercing Line | 6 s | 2.5 s |
| Blade | Whirl Slash | 5 s | 2 s |
| Summoner | Deploy Sentry | 8 s | 3 s |
| Toxic Handler | Wither Cloud | 7 s | 3 s |

### 3.3 Overdrive

Casting R starts Overdrive for 6 s. During Overdrive, Spenders cost nothing and Builders generate double. The M2 cooldown still runs, so a base window allows 2 to 3 free Spenders, more with cooldown refunds. R keeps its own cooldown: 40 s for Rifleman and Summoner, 45 s for Blade and Toxic Handler.

## 4. Brands and Consume (Proposal values)

Each class's M1 applies its Brand. A Consume is a skill removing a Brand for a payoff. Every Consume refunds 6 Charge, at most 18 per cast. One Piercing Line or Whirl Slash is one cast, each sentry or drone shot is one cast, and one Wither Cloud is one cast. Durations come from [18](18-demo-classes-elites-and-items.md).

| Class | Brand | Consumed by | Payoff |
| --- | --- | --- | --- |
| Rifleman | Suppression, 3 stacks, 4 s | Piercing Line | +25% damage per stack; ricochet at 3 stacks |
| Blade | Exposed, 6 s | Whirl Slash | Each one refunds 15% of the M2 and S cooldowns (max 45%) |
| Summoner | Mark, 5 s | Sentry and drone shots | The shot deals +40% and bursts for 20 damage in 2 m |
| Toxic Handler | Venom, 5 stacks | A Wither Cloud tick on a target at 5 Venom | Rupture: all Venom is consumed for a 40 damage burst |

A Rupture also removes the Venom bonus to Wither damage, so the Toxic Handler spits again to rebuild it.

## 5. Run items (Proposal values)

Six items join the in-raid pool of [18](18-demo-classes-elites-and-items.md) section 5. Stacking follows the rules of [18](18-demo-classes-elites-and-items.md); section 9 caps Catalyst. The new tags count toward the first-synergy beat of [19](19-demo-core-loop-and-progression.md) section 5.

| Item | Rarity | Tag | Effect per stack |
| --- | --- | --- | --- |
| Capacitor | Common | Charge | +25 max Charge |
| Overflow Valve | Common | Builder | At full Charge, Builders deal +25% damage |
| Feedback Loop | Enhanced | Consume | Each Consume refunds +5 Charge and deals 20 damage to the target |
| Catalyst | Enhanced | Brand | Branded enemies take +10% damage from every source |
| Afterglow | Enhanced | Overdrive | Overdrive lasts +2 s; kills during it extend it by 0.3 s (max +4 s) |
| Echo Chamber | Prototype | Spender | Every third Spender is cast again, free, at 60% power |

## 6. Persistent gear (Proposal values)

### 6.1 Affixes

Three affixes join the gear affix pool and roll by the rules of [23](23-demo-boss-loot-and-drops.md) section 2.

| Affix | Range at item level 10 |
| --- | --- |
| Max Charge | +5 to +12 |
| Charge gain | +6% to +14% |
| Spender damage | +5% to +11% |

### 6.2 Aspects

Rare and better gear also rolls one Aspect from its slot's list, in addition to its affixes. An Aspect is a fixed named rule, not a number. For Twinned, full Charge is checked before the cost is paid.

| Slot | Aspect | Rule |
| --- | --- | --- |
| weapon | Twinned | A Spender cast at full Charge fires a second time at 40% power |
| weapon | Siphoning | Kills grant 3 Charge |
| weapon | Rending | Each Consume deals 25 damage to enemies within 2.5 m of the target |
| body | Bulwark | Spending Charge grants barrier equal to 0.4% max health per point |
| body | Second Wind | A clean dodge heals 4% max health |
| rig | Overclocked | Overdrive lasts +2 s |
| rig | Primed | Start the raid with full Charge and +20 max Charge |
| backpack | Scavenger | Each XP shard collected grants 1 Charge |

Aspects show on the item tooltip in the hub. An Unidentified item hides its Aspect until it is processed; Clean container gear shows it at once.

## 7. Example builds

| Build | Class | Run items | Gear | Why the pieces multiply |
| --- | --- | --- | --- | --- |
| Spender | Rifleman | Echo Chamber, Capacitor | Twinned weapon | A 125 bank pays for four Piercing Lines, one Twinned (+40%) and at least one echoed (+60%): five casts of damage for four paid |
| Consume | Blade | Feedback Loop | Rending weapon | Three Exposed enemies mean three Consumes, each 20 to the target and 25 around it, while M2 and S return 45% sooner |
| Brand | Summoner | Catalyst, Overwatch Node | Rending weapon | Sentries focus Marks, so most shots are Consumes (+40%, then +10% from Overwatch Node), and burst and Rending splash hit Marked neighbours that take Catalyst's +10% |
| Overdrive | Toxic Handler | Afterglow | Overclocked rig | Overdrive grows to 10 s plus up to 4 s from kills: up to 5 free Wither Clouds instead of 2, and Rupture kills extend it |
| Guard | Blade | Feedback Loop | Bulwark body, Siphoning weapon | Each Whirl Slash gives a 12% max health barrier; kills and refunds buy the Charge back |

## 8. HUD and readability

- Charge orb: fill, current and maximum value, and a notch at 30. At full Charge it holds a steady glow, the condition for Overflow Valve and Twinned. A clean dodge shows +20 beside it.
- M2 slot: dims when Charge is below 30. Dimmed means not enough Charge; the cooldown sweep of [12](12-ui-and-hud.md) means on cooldown.
- Overdrive: a timer ring around the orb drains over the window and grows when kills extend it.
- Brand pips over enemies, above the health bar: Suppression 3, Venom 5, Exposed and Mark one each. Pips brighten at a threshold (3 Suppression, 5 Venom). Each Brand has its own shape for color-blind players.
- Gear: the Aspect is its own tooltip line under the affixes; an Unidentified item shows it locked.
- Glows follow the reduce flashing setting and bloom caps of [11](11-rendering-and-visual-style.md).

## 9. Balance guardrails

- Consume refunds are capped at 18 Charge per cast (section 4).
- Builders cannot farm packs: the Blade counts at most 2 enemies per swing; the Summoner gains per grenade.
- Echo and Twinned copies cannot trigger each other: a Twinned copy does not count toward Echo Chamber's third Spender, and an Echo copy never checks Twinned.
- Catalyst does not stack past 30%: 10%, 18.2%, 25%, then 30% from stack 4 on.
- Overdrive stays short: the M2 cooldown still runs and the window reaches at most 14 s with Afterglow and Overclocked, against an R cooldown of 40 to 45 s.

## 10. Open questions

| Question | Proposed answer |
| --- | --- |
| Starting Charge without Primed | 0 |
| Clean dodge: per absorbed hit or once per S cast; do all four S skills get an invulnerability window | Once per cast; yes |
| Does Feedback Loop's +5 count against the 18 per cast cap | Yes |
| Twinned and Echo copies of Deploy Sentry and Wither Cloud | A second sentry or cloud at reduced power, inside the summon cap of 6; copies refund nothing |
| A second Echo Chamber stack | Raises copy power by the stat formula |
| Does Charge gain apply to refunds | No; Builders, passive gain and clean dodges only |
| Do flat values (Mark burst, Rupture, Feedback Loop, Rending) scale | With the operator's damage multipliers |
| In Overdrive, Twinned fires on every cast at full Charge and Bulwark grants nothing | Accept both; review after playtests |
| Do M2-B and R-B variants follow these rules | Same cost and Overdrive rules; Consume hooks per variant |
| Can an affix reroll change an Aspect | No; it is fixed like a Latent Power |
| The backpack list has one Aspect | Add a second before the demo |

## 11. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 24-A-01 | Wait 20 s from 0 Charge without attacking | Charge rises by 30 and the orb shows it | Not yet implemented |
| 24-A-02 | Land a full Rifleman burst, a Blade swing on 3 enemies, a Summoner grenade on 4 enemies and one Toxic Spit | +12, +18, +10 and +5 Charge | Not yet implemented |
| 24-A-03 | Press M2 at 29 Charge, at 30, then twice with full Charge | No cast and a dimmed slot; a cast costing 30; recasts 2.5, 2, 3 or 3 s apart by class | Not yet implemented |
| 24-A-04 | Dodge through a hit inside the invulnerability window, then dodge with no hit | +20 Charge, then none | Not yet implemented |
| 24-A-05 | Cast R, then use M1 and M2 in the window | Overdrive lasts 6 s, M2 is free, Builder gain doubles, R cooldown is unchanged | Not yet implemented |
| 24-A-06 | Consume Brands on 4 targets with one Piercing Line | Refund is 18 Charge, not 24 | Not yet implemented |
| 24-A-07 | A Wither Cloud tick hits a target at 5 Venom | Venom goes to 0, a 40 damage burst, +6 Charge | Not yet implemented |
| 24-A-08 | Stack Catalyst 1 to 6 times | 10%, 18.2%, 25%, then 30% from stack 4 on | Not yet implemented |
| 24-A-09 | Outside Overdrive, a Rifleman with Twinned and Echo Chamber casts 6 Spenders, only the first at full Charge | One Twinned copy; Echo copies on casts 3 and 6; no copy triggers another | Not yet implemented |
| 24-A-10 | With Afterglow and Overclocked, cast R and kill 20 enemies in the window | Overdrive ends after 14 s at most | Not yet implemented |
| 24-A-11 | Generate 1000 items per rarity and slot | Rare and better carry one Aspect from the slot list; Common and Enhanced none | Not yet implemented |
| 24-A-12 | Hover an Unidentified Rare weapon in the hub, then process it | The Aspect is locked, then shown | Not yet implemented |
