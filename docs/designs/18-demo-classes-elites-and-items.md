# Demo Classes, Elite Affixes and Run Items

Status: Draft v0.1. Updated: 2026-11-25. Requirements: D-04, D-07, D-08, D-10, D-14.

[Back to index](README.md) | Previous: [17 Demo Raid: Map, Time of Day and Zones](17-demo-raid-map-time-and-zones.md) | Next: [19 Demo Core Loop and Progression Spiral](19-demo-core-loop-and-progression.md)

## 1. Archetype mapping (D-07)

| Demo archetype | Based on | StormBound source | RoR2 reference |
| --- | --- | --- | --- |
| Ranged rifleman | Assault Trooper | doc 56 row 1 | Commando |
| Melee blade | Mercenary | doc 56 row 7 | Mercenary |
| Summoner | Engineer | doc 56 row 5, doc 67-1 | Engineer |
| Damage over time | Toxic Handler | doc 56 row 10, doc 67-9 | Acrid |

RoR2 is a loop reference only; no skill or name is copied. The kits below adapt the StormBound cores to the demo slot contract. The StormBound class data was not audited, so the mapping is to be confirmed (Q-28).

## 2. Slot contract (D-04)

M1 is the left mouse button. M2 is the right mouse button, a small skill with a cooldown. S is Shift, a dodge with a class twist. R is the ultimate. Every kit follows one loop: M1 builds a resource or mark, M2 spends it, S repositions and refunds or buffs, R bursts. The hub offers 2 variants for M2 and 2 for R (D-06), and switching is free. All skills aim through the reticle (see [04](04-camera-controls-and-combat.md)). Status effects use the shared status layer. Total summons per player are capped at 6 (see [03](03-mutants-detection-and-enemy-ai.md)).

## 3. Kits (Proposal values)

### 3.1 Rifleman (Assault Trooper)

| Slot | Skill | Behavior | Cooldown |
| --- | --- | --- | --- |
| M1 | Burst Rifle | Three-round bursts, hold to repeat. Each hit adds Suppression (3 stacks, 4 s per target) | None |
| M2 | Piercing Line | Narrow piercing shot. Spends Suppression on hit targets: +25% damage per stack and a ricochet at 3 stacks | 6 s |
| S | Tactical Roll | 5 m roll with 0.25 s invulnerability. Refunds 30% of M2 cooldown if a suppressed enemy is within 10 m | 5 s |
| R | Suppressive Barrage | 4 s channel firing at the nearest enemies in a cone, re-targeting after each kill | 40 s |

Combo: build 3 stacks with M1, spend them with M2, roll to refund M2, fire M2 again, then R. Variants: M2-B Rail Slug (0.6 s charge, one shot that always hits weak spots for x2 and spends all stacks); R-B Overwatch Mark (marks 5 enemies that detonate after 3 s).

### 3.2 Blade (Mercenary)

| Slot | Skill | Behavior | Cooldown |
| --- | --- | --- | --- |
| M1 | Three-Strike Combo | Three melee hits; the third applies Exposed for 6 s | None |
| M2 | Whirl Slash | Spin. Spends Exposed on hit targets; each spent refunds 15% of M2 and S cooldown (max 45%) | 5 s |
| S | Lunge Dash | 6 m dash through enemies, hitting each once. If anything was hit, the next M1 starts at hit 2 | 4 s |
| R | Execution | Marks up to 5 Exposed targets and strikes each in turn for heavy damage; kills restore 5% health | 45 s |

Combo: three M1 hits apply Exposed, Whirl Slash spends it and refunds, Lunge keeps the chain going, then R. Variants: M2-B Blade Cyclone (spin while moving at 60% damage); R-B Phantom Blades (no marks needed; 3 afterimages strike the nearest 3 enemies twice).

### 3.3 Summoner (Engineer)

| Slot | Skill | Behavior | Cooldown |
| --- | --- | --- | --- |
| M1 | Marker Grenade | Arcing grenade with a small blast; marks hit enemies for 5 s (max 5) | None |
| M2 | Deploy Sentry | Places a stationary turret (max 2, 20 s) that focuses marked targets first | 8 s |
| S | Tactical Hop | 4 m hop; sentries within 8 m gain +40% attack speed for 3 s | 5 s |
| R | Hive Drones | 3 follower drones for 15 s, marked targets first | 40 s |

Combo: mark enemies, let sentries focus them, hop to buff the sentries, then R. Variants: M2-B Arc Pylon (does not shoot; chains lightning between pylons and marked enemies); R-B Repair Swarm (drones heal the operator and sentries instead of attacking).

### 3.4 Damage over time (Toxic Handler)

| Slot | Skill | Behavior | Cooldown |
| --- | --- | --- | --- |
| M1 | Toxic Spit | Short-range spit that applies Venom (non-lethal, stacks to 5) | None |
| M2 | Wither Cloud | Thrown cloud. Enemies inside gain Wither (lethal ticks); each Venom stack on the target adds +20% Wither damage | 7 s |
| S | Acid Slide | 5 m slide leaving an acid pool for 5 s that slows and applies Venom | 5 s |
| R | Plague Burst | Infects a target; the infection hops to the nearest enemy every 0.5 s (max 8 hops), applying Venom and Wither. Infected deaths release a small cloud | 45 s |

Combo: build Venom with M1 and the slide, convert it with Wither Cloud, then spread it with R. Variants: M2-B Rot Mines (3 mines that burst into Wither clouds when enemies step close); R-B Epidemic Bloom (a ground flower that infects everything within 8 m for 6 s).

## 4. Elite affixes (D-08)

An elite is a Mimic with affixes: health x4, damage x1.3 and a poise bar. It has 1 affix until NL 0.5, then up to 2 (the demo maximum). Each affix has a color ring shared by the elite bar and the world model. Elites also drop one run item with a 35 percent chance. Spawn share follows [17](17-demo-raid-map-time-and-zones.md) and named gear drops follow [07](07-meta-progression-and-difficulty.md).

| Affix | Behavior | Counterplay | Telegraph |
| --- | --- | --- | --- |
| Armored | A plate absorbs 50% of damage until broken, then regrows after 8 s | Burst or weak-spot hits | Steel-blue plate glow |
| Blazing | Leaves a fire trail and explodes in fire on death | Keep distance, fight away from allies | Orange trail |
| Voltaic | Every 6 s launches 3 seeking arc orbs | Dodge on the spark; orbs die on walls | Crackling halo, 1 s windup |
| Leeching | Heals 30% of damage dealt | Burst it down or deny hits | Green tendrils |
| Hivebound | Spawns 2 Walkers every 10 s, up to 6 | Kill the elite first | Swelling cysts |
| Phasing | Blinks 8 m after taking 3 hits and leaves a decoy | Hit the real one, use area attacks | Glitch flicker |

## 5. In-raid items (D-10, D-14)

RoR2-style: passive items with stack counts, no level-up draft. Rarities are Common, Enhanced and Prototype (see [06](06-run-growth-roguelite.md) and StormBound doc 70). Sources are Supply Caches, Signal Shrines, elite kills and rich Host caches. Raid level adds a small flat bonus of +3% max health and +2% damage per level, up to level 10 (Q-23).

Stacking rules (Proposal): stat items use effect(s) = e x s / (1 + 0.1 x (s - 1)), with a limit of 10 x e. Chance items use 1 - (1 - p) to the power s. Cooldown and flip-time items multiply by (1 - r) to the power s. Every trigger has an internal cooldown, and summons respect the cap of 6.

| Item | Rarity | Tag | Effect per stack |
| --- | --- | --- | --- |
| Hair Trigger | Common | Ballistic | +8% attack speed |
| Spike Gloves | Common | Melee | +10% melee damage |
| Reinforced Plating | Common | Defense | +12% max health |
| Coolant Loop | Common | Utility | -6% skill cooldowns |
| Salvage Eye | Common | Economy | +8% Credits from kills and searches |
| Static Coil | Enhanced | Elemental | 8% on hit to arc lightning for 120% damage |
| Venom Sac | Enhanced | Damage over time | +15% damage over time; 5% per tick to copy one status stack to a nearby enemy |
| Overwatch Node | Enhanced | Summon | Summons last +15% longer and deal +10% damage |
| Hardlight Barrier | Enhanced | Defense | Barrier of 10% max health that returns after 8 s without damage |
| Hive Core | Prototype | Summon | 6% on kill to spawn a drone for 10 s |
| Mimic Heart | Prototype | Sustain | Kills heal 1% max health and give +0.5% damage until the raid ends (up to +10%) |
| Ghost Signal | Prototype | Sense | Resonance Link flip time +25% |

Rarity weights: Common 70, Enhanced 25 x Q, Prototype 5 x Q to the power 1.5, normalized. Q = zone loot weight x (1 + NL) x the tier rare weight from [07](07-meta-progression-and-difficulty.md). At T1 in Z1 at dusk, Q is 1 and the odds are 70, 25 and 5 percent. At T1 in Z4 at 02:00, Q is 5.2 and the odds are about 27, 50 and 23 percent. Deeper and later raids therefore reward risk with better items.

## 6. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 18-A-01 | Each kit uses M1, M2, S and R via the mapped inputs | All four fire and each kit loop works | Not yet implemented |
| 18-A-02 | Rifleman: land 3 M1 stacks, then M2 | Stacks are spent, damage rises 25% per stack, a ricochet spawns | Not yet implemented |
| 18-A-03 | Summoner with sentries and drones active | The cap of 6 summons holds; the oldest retires | Not yet implemented |
| 18-A-04 | Spawn elites at NL 0 and NL 1 | 1 affix versus up to 2 affixes | Not yet implemented |
| 18-A-05 | Stack Hair Trigger 20 times | Bonus follows the formula and stays under the limit of 10 x e | Not yet implemented |
| 18-A-06 | Roll 10000 items at T1 in Z1 at dusk and in Z4 at 02:00 | Rarity shares near 70/25/5 and 27/50/23 percent | Not yet implemented |
