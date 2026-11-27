# What Crosses Extraction?

Status: Design proposal. Updated: 2026-11-27. Requirements: R-01, R-05, R-12, D-21, D-22.

[Design index](README.md) | Previous: [56: Four kits beyond Charge](56-four-kits-beyond-charge.md) | Next: [58: Choosing a class variant](58-choosing-a-class-variant.md) | [59: What a raid item can do](59-what-a-raid-item-can-do.md)

A Rifleman takes a line-shaped discharge into the raid and finds a coil in a supply cache. Firing down a shop aisle, the Rifleman spends Suppression along the chosen line. The same aimed hit might also send a spark sideways into a revealed Mimic. Tomorrow the rifle still fires down the line. To get the spark again, the operator has to find another coil. Neither choice teaches or improves the other.

**Classify a mechanism by who chooses it and what survives, not by where the object drops.** Both kinds can change a fight. They have separate rewards, choices and progression:

| Decision | Who owns the effect? | What happens at raid end? |
| --- | --- | --- |
| Choose how a native skill spends its mark. | The class. Choose a learned variant in the Barracks before deployment. | The choice is remembered after extraction or death. Marks on enemies are not. |
| Wear a processed piece that changes when a skill can use its mark. | The equipped piece. A sealed piece found on the street is cargo; finding it grants no active power. | Worn kit comes home after extraction or death, with its wear ([63](63-what-the-operator-wears.md)). A sealed find comes home only if carried out, or if the assigned drone lifts it after a death ([62](62-what-the-insurance-drone-brings-home.md)). The hook is available on later deployments only while the piece is equipped. It never becomes a learned node. |
| Take a coil that adds an arc to an aimed hit. | This raid. Every operator has a qualifying attack; the coil asks nothing about the equipped variant. | On extraction **and** death, the effect and every duplicate disappear. There is no coil, recipe or tree credit in the stash. |

[06: Run growth](06-run-growth-roguelite.md) already distinguishes Run, Meta and Gear. Its power budget compares their contributions; it gives no reason to share a perk list or multiply each hit once per layer. [07: Meta progression](07-meta-progression-and-difficulty.md) can still award class experience for service. The same raid can yield XP, a temporary effect and recoverable cargo without converting the stacks of one reward into progress on another. An item can change a first-level **direct stat** such as attack speed for this outing. It cannot raise the out-of-raid advanced attribute that contributes to that stat, even temporarily.

**One shot can matter to both sides without wiring them together.** In the aisle, the ordinary aimed contact qualifies for the coil. Spending Suppression belongs to the rifle; the arc neither paints nor spends Suppression, grants Charge, nor counts as a new aimed hit. The line can catch several enemies without earning a coil attempt for each. A wider line still helps in a crowded aisle and a spark still helps against a second hostile. The tactical fit comes from where the enemies stand. Neither reward checks the other's stacks, rank, triggers or unlocks.

**Change from [24: Skill resource and synergies](24-skill-resource-and-synergies.md).** This proposal supersedes the direction in sections 5 and 7 that run items should tune Charge, Brand, Consume, Spender or Overdrive, including the Afterglow/Overclocked extension and Echo Chamber/Twinned cast pairing. Retire those six run items (Capacitor, Overflow Valve, Feedback Loop, Catalyst, Afterglow and Echo Chamber, all live in `ITEMS` in `src/sim/data.js` today) from the proposed universal pool; do not move the same list into the tree. Keep the useful part of D-22: skills, finds and worn gear can suit the same encounter. Section 6's equipment hooks belong with gear, subject to the [class-loop review](28-class-resource-loops.md); a full Charge bar is already too common. This is a direction for future design, not a description of a change to the demo.
