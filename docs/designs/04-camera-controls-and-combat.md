# Camera, Controls and Combat

Status: Draft v0.1. Updated: 2026-11-25. Requirements: R-01, R-02, R-07.

[Back to index](README.md) | Previous: [03 Mutants, Detection and Enemy AI](03-mutants-detection-and-enemy-ai.md) | Next: [05 Classes and Skills](05-classes-and-skills.md)

## 1. Camera modes (R-07)

Top-down, third-person and the shooting reticle are three presentations of one camera rig and one aim system, not three separate games.

| Mode | Entered when | Framing | Purpose |
| --- | --- | --- | --- |
| Tactical Top-Down | Default on streets, rooftops and in large rooms | Fixed 60 degree downward pitch, wheel zoom within limits | Read crowds, route, fight at range |
| Shoulder Third-Person | Hold Left Alt (Aim), toggle with V, or automatically in tight interiors | Over-the-shoulder offset, free pitch of about -20 to +50 degrees (Proposal) | Precision shots, weak spots, corridor fights |
| Follow Blend | Transition frames only | Interpolated pose | Avoid hard cuts |

Rules:

- Blend time is 0.25 to 0.4 s (Proposal). The mode never changes during an extraction channel.
- Top-down keeps the fixed-pitch, no-drift rule of StormBound doc 68. Only short, bounded impact shake is allowed.
- Buildings between the camera and the operator dither out, following StormBound occlusion.js. Inside buildings in top-down, floors above the operator are cut away.
- The shoulder camera uses a collision spring arm and can swap shoulders.
- WATER.html already has a switchable first and third person rig (setView, updateCameraFP) and a cursor-to-ground projection (mouseOnGround). The new project reuses the idea of one rig with swappable poses, not the code.

## 2. Aim system and reticle

- One aim ray feeds every weapon and skill. Shoulder mode: ray from the screen center. Top-down mode: ray from the cursor, intersected with a horizontal plane at the operator's chest height instead of the ground, which removes the height error when aiming at tall targets.
- Projectiles leave the muzzle and converge on the aim ray after a parallax correction, so the reticle is honest in both modes.
- Reticle: a spread ring that tightens when standing still and aiming and widens when moving or firing. Hit marker variants for hit, kill and weak-spot (the prototype already shows hit and kill markers).
- A damage direction ring around the operator shows where hits come from.
- Skill targeting uses the same reticle. Drag-to-cast preview and cancel follow StormBound doc 49-6. The auto-targeting normal attack of StormBound doc 49-6-2 is not carried over, because this genre needs deliberate shots. An optional accessibility aim assist is an open question.

## 3. Controls (Proposal, keyboard and mouse first)

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Aim |
| Left mouse button | Primary fire (M1 slot) |
| Right mouse button | Secondary skill (M2 slot) |
| Shift | Dodge skill (S slot), a class-specific dodge |
| R | Ultimate (R slot) |
| Left Alt (hold) | Aim: temporary Shoulder view |
| V | Toggle Tactical Top-Down and Shoulder camera |
| E | Interact, search, open; hold for lockpick or hack |
| C | Scan Pulse (tap), Deep Scan (hold) |
| T | Swap shoulder |
| Tab | Inventory and gear |
| 1 to 4 | Quick items |
| M | Map |
| Esc | Pause |

The slot names M1, M2, S and R follow StormBound. Touch controls are not a first-release goal (see [14](14-roadmap-and-open-questions.md)).

## 4. Combat model

- Weapon archetypes: hitscan, projectile, melee and deployable. Each class primary fire is one of these (see [05](05-classes-and-skills.md)).
- Damage types: physical plus five elements, with the burn, poison, wither, chill and shock statuses. As in StormBound doc 56, one status layer owns damage over time, control and reactions; class skills only consume or spread them.
- Weak spots: a revealed Mimic exposes a core. Weak-spot hits deal about 1.5 times damage (Proposal). A hit on a Disguised Mimic counts as a Reveal.
- Poise: elites and brutes have an armor bar that must break before a stagger.
- Cover: low cover reduces exposure to ranged hits, high cover blocks them. Cover also blocks Resonance Link line of sight only if the wall is shielded (see [03](03-mutants-detection-and-enemy-ai.md)).
- Silent takedown: a melee kill from behind on an unaware Mimic makes no noise and adds no Alert (Proposal).
- Death is final in single-player. There is no downed state or revive in the first release.
- Hit feedback: graded hit reactions, kill and streak beats, crit numbers and bounded camera feedback follow StormBound docs 83 (hit feel) and 71-5 (post-processing on combat events).

## 5. Noise radii (Proposal)

| Source | Radius |
| --- | --- |
| Crouch-walk | 2 m |
| Walk | 5 m |
| Melee hit | 10 m |
| Sprint | 12 m |
| Suppressed shot | 15 m |
| Unsuppressed shot | 45 m |
| Explosion | 70 m |

Noise inside the radius raises the Awareness of Disguised Mimics and adds to Alert at the rates in [02](02-core-loop-and-raid-structure.md) and [03](03-mutants-detection-and-enemy-ai.md).

## 6. Time-to-kill targets at Threat Tier T1 (Proposal)

| Enemy | Target with the starter weapon |
| --- | --- |
| Walker, Hollow | about 1 s |
| Spitter, Skitter | about 1 s |
| Caller | about 2 s |
| Brute | about 6 s |
| Alpha | about 20 s |
| Progenitor | about 90 s |

## 7. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 04-A-01 | Hold Left Alt in a street | Camera blends to Shoulder within 0.4 s and the reticle appears | Not yet implemented |
| 04-A-02 | Fire in top-down at a tall target | Projectile hits the point under the reticle, not the ground behind it | Not yet implemented |
| 04-A-03 | Walk behind a building in top-down | The wall dithers out and the operator stays visible | Not yet implemented |
| 04-A-04 | Start an extraction channel and hold Aim | Camera mode does not change during the channel | Not yet implemented |
| 04-A-05 | Silent takedown on an unaware Mimic | No Alert change, no noise event | Not yet implemented |
