# Classes and Skills

Status: Draft v0.1. Updated: 2026-11-25. Requirements: R-04, R-05.

[Back to index](README.md) | Previous: [04 Camera, Controls and Combat](04-camera-controls-and-combat.md) | Next: [06 In-Raid Roguelite Growth](06-run-growth-roguelite.md)

## 1. Scope and naming

All 20 StormBound classes are carried over as playable operatives (R-04). Row order below follows the class table in StormBound doc 56. The names are working English names; before implementation they must be reconciled with the class ids in the StormBound data module (src/data.js), which this draft did not verify. The setting changes from fantasy to near-future military, so only mechanics are inherited, not lore or art.

## 2. Inherited structure

Figures are as stated in the StormBound README at the time of writing.

- Four skill slots per class: M1 primary (left mouse), M2 secondary (right mouse), S dodge or utility (Shift), R ultimate (R). The web demo contract is in [15](15-web-demo-scope-and-overrides.md) and [18](18-demo-classes-elites-and-items.md).
- Class level 1 to 60; shared paragon 0 to 300 (adopted as Operator Rank, see [07](07-meta-progression-and-difficulty.md)).
- Three specializations per class unlocked at level 10, 60 in total.
- About 191 explicit M2, S and R mechanic variants (StormBound doc 56) and a generated skill tree of about 2925 nodes across the 20 classes.
- Reference modules: class-actions.js, class-runtime.js, class-mechanics.js and class-trees.js in the StormBound source.

## 3. Class table

The last two columns are proposals for this project.

| # | Class | StormBound core loop (doc 56) | Raid niche | Search or sense perk |
| --- | --- | --- | --- | --- |
| 1 | Assault Trooper | Burst fire stacks suppression, piercing line spends it | Generalist, onboarding class | Quiet reloads: reload noise radius halved |
| 2 | Huntress | Homing arrows, terrain-bound blink, relay blade, arrow rain zone | Mobile skirmisher, zone control | Light Foot: sprint noise reduced by 30 percent |
| 3 | Rogue | Shotgun and backstab, smoke escape, finisher that refreshes on kills | Stealth assassin | Shadow Work: backstab bonus on Disguised Mimics |
| 4 | Multi-Tool Specialist | Nail gun and saw, concussive canisters, path ram, dual-tool swap | Durable bruiser | Pry Bar: containers open 25 percent faster |
| 5 | Engineer | Grenades, proximity mines, dome shield, two stationary turrets | Fortifier who holds a loot room | Hardline: lock one door per raid for free |
| 6 | Artificer | Elemental orbs, ice wall, nano-bolt, cone flame | Elemental crowd control | Residue Sampler: elemental kills drop extra lab samples |
| 7 | Mercenary | Three-hit melee, exposure consumption, hit-confirmed dash, target-by-target finisher | Melee burst | Hardened: reduced stagger |
| 8 | REX | Pays health for seeds, root pull, drain garden | Self-sustaining attrition | Biosampler: Hosts show partial contents at passive range |
| 9 | Dock Loader | Melee grants barrier, grapple, momentum punch, electric pylon | Traversal melee | Climbing Hook: grapple reaches rooftop ledges |
| 10 | Toxic Handler | Poison bites, wither stacks, acid pools, spreading plague | Damage over time versus swarms | Toxin Resistance: spore and acid hazards deal less damage |
| 11 | Captain | Beacon marking, orbital strike, two independent beacons | Marked ranged strikes | Signal Booster: extraction channel 1 s shorter |
| 12 | Railgunner | Weak-spot scope, timed reload, charged rail | Precision sniper, natural fit for Shoulder mode | Long Optics: passive sense range plus 25 percent |
| 13 | Void Fiend | Two forms, corruption meter, sustain or burst | High-risk burst and sustain | Corruption Tolerance: Host contamination builds 25 percent slower |
| 14 | Seeker | Spirit fists, healing palm, drifting burn, meditation channel | Sustain and support | Stillness: Alert decays faster while meditating |
| 15 | False Son | Lunar club, thorn spikes, steerable laser | Bruiser with ranged finisher | Moon Ward: first hit after a Reveal reduced by 30 percent |
| 16 | Chef | Cleaver out and back, oil pools and ignition, rolling oil trail | Fire area control | Field Kitchen: cook found food into healing items |
| 17 | Operator | Marking shot, follower drones, hack conversion, defense matrix | Command and decoy | Decoy Drone: a drone can bait hostile Mimics |
| 18 | Drifter | Scrap balls, scrap throw, slide recycling, scrap boosts | Resource-economy class | Salvage Eye: extra scrap from containers |
| 19 | Enforcer | Shotgun, shield block, delayed stun grenade, charge counter | Frontline tank who builds cover | Barricade Kit: block one doorway once per raid |
| 20 | Acolyte | Blood storage, corpses, bone cage, spirit summon | Necromancer who feeds on kills | Cadaver Sense: corpses and fresh Hosts visible at passive range |

## 4. Translation rules

1. Every skill must work in both Top-Down and Shoulder modes and aim through the reticle (see [04](04-camera-controls-and-combat.md)). Auto-targeting is removed from primary attacks.
2. Every class has the same sense rig. Perks only tune it; no class can scan for free, because information always costs exposure (see [03](03-mutants-detection-and-enemy-ai.md)).
3. Summons, drones and deployables obey the global caps (see [03](03-mutants-detection-and-enemy-ai.md)) and count as noise sources where they fire.
4. Resource and state ownership stays as in StormBound doc 56: one class runtime owns class resources; the shared status layer owns burn, poison, wither, chill, shock and control.
5. No class may be required for a contract or an extraction point.
6. Specializations and variants apply inside raids exactly as in the hub; none may bypass extraction rules.

## 5. Rollout (Proposal)

| Wave | Classes | Reason |
| --- | --- | --- |
| Vertical slice | Assault Trooper, Railgunner, Rogue, Engineer | Generalist, precision, stealth and deployable archetypes |
| Wave 2 | Huntress, Enforcer, Artificer, Mercenary, Chef | Mobility, tank, elements, melee, area control |
| Wave 3 | The remaining 11 | Heavier resource systems and summons |

## 6. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 05-A-01 | Each class casts all four slots in both camera modes | Aim lands under the reticle; no frame errors | Not yet implemented |
| 05-A-02 | Each class completes a T1 raid in simulation | Extraction rate within the target band in [07](07-meta-progression-and-difficulty.md) | Not yet implemented |
| 05-A-03 | Summon-heavy classes at the entity cap | Caps hold; oldest entities retire; frame time in budget | Not yet implemented |
