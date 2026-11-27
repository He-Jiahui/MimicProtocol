# Skill Tree: A Class Progression Proposal for the Barracks

Status: Draft v0.1. Updated: 2026-11-26. Requirements: R-04, D-06, D-21, D-22.

[Back to index](README.md) | Previous: [26 Equipment and Loot](26-equipment-loot-reference-brushwild.md)

**Proposal:** Let the player specialize a complete kit, starting with one decision the Rifleman can already feel: should Piercing Line reach a distant second target, or help pay for the next shot when it consumes Suppression? Both choices already execute when supplied to the skill compiler. What is missing is who earns the choice, where they make it, and how they can change their mind.

## 1. Brushwild: a tree that can explain why a point is locked

Reference: `kevintngo/procedural-rpg` at `941a400` (MIT, Copyright (c) 2026 kevintngo). In `src/game/content/skills.ts`, `CLUSTERS` orders Basic, Core, Defensive, Mobility, Mastery, Ultimate and Key Passive. They require **0, 1, 4, 7, 11, 16 and 22** points respectively in earlier branches. Spending five ranks on a Basic helps open Defensive; spending inside Defensive cannot keep Defensive open. This distinction makes refunds meaningful.

- `buildTree` in `src/game/rules/tree.ts` builds a skill node (up to five ranks), a one-point Enhancement requiring that skill, and two one-point Upgrades requiring the Enhancement. The pair shares an exclusive group. All Ultimates share another group; all key passives share one. Ordinary passives have their own rank limits. A key passive defines a play pattern: for example, Warden's Unbroken rewards holding at least half of Resolve with damage reduction (`src/game/content/classes/warden.ts`).
- `pointsEarned` is `level − 1 + 2 + bonus`. `canAllocate` checks available points, rank limit, points above, parent and exclusive group; the UI can display its reason. `canRefund` validates the **remaining** allocation: no orphaned child, no stranded lower branch. `lockedNodes` protects the last Basic. `refundCost` is zero below level 8, then `round(4 + 2.5 × level)` glint per point. See `src/ui/skilltree.tsx`, `SkillTree`, for the spend/refund interaction.
- `gatherEffects` and `compileBuild` in `src/game/rules/build.ts` turn valid allocations and equipment into resolved values. These are separate responsibilities: knowing what a node *does* does not entitle the player to take it. DarkSignal already has an analogue for the first responsibility.

## 2. DarkSignal: shipped hooks, absent progression

Source snapshot: `f3a800d`, including the merged skill-data framework. The four classes keep M1 Builder, M2 Spender, S reposition and R ultimate. `SKILL_KITS` in `src/sim/skill-data.js` holds each slot's behavior ID and numeric parameters; `castSkill` in `src/sim/skills.js` dispatches to the hand-authored behavior. `CHARGE` sets a base capacity of 100, 1.5/s regeneration, 30 per M2, 20 for a clean dodge and 6 s of Overdrive. `Raid.castSpender`, `consume` and `startOverdrive` in `src/sim/raid.js` implement the resource loop. A successful R opens a window of free Spenders; their cooldowns still run and Builder gain doubles.

| Kit | What an investment should preserve (implemented behaviors in `src/sim/skills.js` and `src/sim/raid.js`) |
| --- | --- |
| Rifleman | Burst hits build Suppression. Piercing Line spends stacks for damage; a full stack enables a ricochet. Range and Consume frequency reward different shots. |
| Blade | The third swing exposes targets; Whirl Slash consumes Exposed to refund M2 and S cooldowns. A mobility investment should preserve the reason to finish the combo. |
| Summoner | Marker Grenade applies Mark; sentry and drone shots consume it for damage and a burst. One placement can lead to several later Consume events. |
| Toxic Handler | Spit builds Venom; a Wither Cloud tick can Rupture at five stacks. A payoff on every cloud tick would reward something different from rebuilding five stacks. |

**Implemented tuning, no unlock yet.** `compileSkills(classId, { gear, items, tuning })` in `src/sim/skill-build.js` resolves slot params, selected stats and event rules. `SKILL_TUNING` has exactly one behavior entry: `piercingLine`. Base width is 0.70 m; **Broad Aperture** (`enhanced`) adds 0.25 m to the lateral hit allowance. **Long Rail** (`longRail`) includes that width and adds 8 m to the 42 m range. **Return Circuit** (`returnCircuit`) includes the width and grants base +2 Charge on Consume, with a 1 s internal cooldown keyed by a stable ID. One slot accepts one choice string. `Raid.recalc` passes its `skillTuning` to the compiler; `Raid.fireSkillEvent` owns the clock for triggers. `test/skill-build.test.js` exercises the wider shot, exclusive input, wrong-class rejection and cooldown across recalculation. These are callable mechanics; the Barracks does not award or select them.

**Docs-only plans.** [05](05-classes-and-skills.md) describes the full 20-class project. [07](07-meta-progression-and-difficulty.md) sketches per-class levels 1–60, five branches of four tiers, up to two keystones and specializations at level 10. [16](16-demo-tutorial-and-hub-onboarding.md) and [18](18-demo-classes-elites-and-items.md) propose a free hub choice between two behaviors for M2 and for R. `PLANNED_VARIANTS` catalogs those B behaviors, including Rail Slug; none is an executable Upgrade. `newProfile` and `applyRaidResult` in `src/sim/profile.js` store the class choice and raid results but no persistent class XP, point ledger or tree. `showHub` in `src/ui/hub.js` offers class selection. `levelChoices` in `src/sim/horde.js` gives raid-scoped item choices. A raid level, an Enhancement, a B variant and a persistent class level are four different things.

## 3. Proposal: one reachable Rifleman tree before four production trees

For a Barracks trial, use four small branches and a budget of six class points. Start with the entire base kit and zero points; award one per class level gained through level 7. Follow [07](07-meta-progression-and-difficulty.md) and [19](19-demo-core-loop-and-progression.md) in retaining earned class XP on death; resources, active Overdrive and run items do not become class progress. Keep the XP curve a separate tuning decision. Class levels and these awards would be new. This six-point trial is smaller than the long-term tree in doc 07, not a replacement specification for levels 8–60.

| Branch | Points required in earlier branches | Rifleman choices for the trial (Proposal unless marked existing tuning) |
| --- | ---: | --- |
| Fieldcraft (M1) | 0 | Two one-point ranks of Suppression retention, +0.5 s duration each. A retreat to cover costs less setup, but shots must still connect. Neither rank increases stack cap. |
| Conversion (M2) | 1 | One point for Broad Aperture; one further point for **either** Long Rail **or** Return Circuit. The three effects already exist in tuning; only their ownership and costs are proposed. |
| Maneuver (S) | 3 | One point to extend Tactical Roll's *near-Suppressed-enemy M2 refund search* by 2 m. Leave invulnerability, the clean-dodge reward and roll distance unchanged. |
| Doctrine (key passive) | 5 | One point for **either** Window Discipline (+1 s of R Overdrive) **or** Banked Shot (+15% Builder damage at full Charge). One rewards spending during the R window; the other rewards delaying the next spend. Keep both visible; allow only one. |

**Worked allocation.** Spend one point on Fieldcraft, one on Broad Aperture, one on Long Rail: Maneuver opens. Buy Maneuver and the second Fieldcraft rank (five earlier points), then one Doctrine. A player preferring sustain can follow the same path and choose Return Circuit. Reaching the capstone in this trial requires both Fieldcraft ranks; the actual build choices are the rail fork and the Doctrine fork. If either fork has a universally better answer, revise those effects before adding more nodes. No node unlocks a button or gates an extraction.

**Refunds and variants.** Spend and refund in the hub, free throughout the trial. Preview the *final* allocation before applying it. Block removing Broad Aperture while an Upgrade depends on it, and block dropping below five earlier points with a Doctrine still held. Name the blocking node and offer a preview that also removes its dependents and returns their points. An even swap of exclusive siblings should validate atomically: Long Rail → Return Circuit need not temporarily strand the Doctrine. A full reset restores all six *earned* points at level 7 and leaves all four base actions available. Lower-level players get only what they earned. Do not spend Cash, Boss Cores, Lab Samples or raid items on this experiment.

Keep future behavior selection separate: free switching to doc 18's Rail Slug must never interpret `longRail` as “equip Rail Slug.” Until a B behavior exists, do not offer it. If one is later added, preview incompatible A-specific nodes and return their points in the same hub change, or cancel without cost. Do not silently apply a Piercing Line width modifier to a different attack.

## 4. Proposal: connect ownership to the existing compiler

Persist class XP and stable, class-scoped node IDs/ranks in the profile; derive the available budget from earned points minus valid ranks. Validate ownership, gates, exclusivity and prerequisites on load and on hub confirmation. Old v1 profiles should open with their original class and equipment and an empty allocation; a removed node should return its point. A class switch selects that class's allocation. Hand the next raid a snapshot, so a level-up draft or gear recalculation cannot spend or return points.

Translate the validated M2 path to the existing `tuning.m2` value: absent, `enhanced`, `longRail` or `returnCircuit`. The compiler already includes the Enhancement when either Upgrade is selected; applying the parent a second time would widen the shot twice. The proposed M1/S ranks and Doctrine stats need a new validated source of tree effects; today's interface is **not** a general tree interpreter. Reuse its `param`/`stat` vocabulary and preview the same resolved build as the raid. Do not store compiled numbers, fire start-of-raid triggers during preview, or replace the four behavior functions with a second casting system.

Before adding further Consume passives, decide what counts toward the refund limit. [24](24-skill-resource-and-synergies.md) proposes an 18-per-cast cap including Feedback Loop. `Raid.consume` actually debits `consumeLeft` for the base refund, adds Feedback separately and then fires Consume triggers; `gainCharge` also applies the Charge-gain multiplier. Return Circuit is timed, not debited from that base budget. Do not promise a total cap the current code does not enforce. Test with multiple Brands on one shot, repeated pet attacks, cloud ticks, Echo Chamber and Twinned. Check Doctrine stacking with Afterglow/Overclocked or Overflow Valve before choosing final values. No new resources, hotbar slots, second ultimate, in-raid respec or full specialization roster in this trial.

## 5. Decision checks (Proposal)

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 27-A-01 | Enter with a legacy profile, then earn one Rifleman level and switch to Blade | All four actions work at zero points. The point belongs only to Rifleman; dying or switching does not transfer it. | Not yet implemented |
| 27-A-02 | Preview each rail fork at base gear, then swap at six points | Both show 0.95 m width; range is 50 vs 42 m. Only Return Circuit shows the timed refund. Swap costs no extra point and leaves Doctrine valid. | Not yet implemented |
| 27-A-03 | Try to refund an invested parent or remove the fifth earlier point; reset instead | Refusal names the dependent or threshold, with no partial change. Reset returns exactly the earned budget; the base kit survives reload. | Not yet implemented |
| 27-A-04 | Preview Doctrine in the hub; deploy with Primed; pick a run item; return after a death | Preview pays nothing, start benefits occur only at deployment, a mid-raid recompile cannot reset trigger clocks, and only persistent class choices survive. | Not yet implemented |

The decision after the Rifleman trial is whether players use both forks for different raids. XP pacing, the total Consume budget and stacking with run items remain open; the other three classes need their own choices rather than renamed rifle upgrades.
