# Vision, Pillars and References

Status: Draft v0.1. Updated: 2026-11-25. Applies to: the whole project.

[Back to index](README.md) | Next: [01 World and Narrative](01-world-and-narrative.md)

## 1. Pitch

Working title: MIMIC PROTOCOL (placeholder, not final). You play a lone military operative sent into a rain-soaked, neon-drenched future megacity after an alien vessel appears in high Earth orbit. Mutated organisms now hide among the crowd with the faces and routines of ordinary people. Your military sense rig can reveal them, but the link works both ways: the moment you see them, they begin to feel you. You scavenge intel and supplies from a semi-open city of enterable buildings, fight what you cannot avoid, and extract alive. Back at base, the gear that mutants drop is appraised, decontaminated and bolted onto your own armor and weapons to grant Diablo-style legendary powers.

## 2. Requirements register

Requirements come from the project owner's brief dated 2026-11-25. Anything not traceable to an R-ID is a designer proposal and is labelled Proposal. Numbers in these documents are tuning hypotheses unless marked Confirmed; none are confirmed yet.

| ID | Requirement | Addressed in |
| --- | --- | --- |
| R-01 | Genre: search-fight-extract roguelite with a Duckov-like raid structure and Diablo-like loot | 02, 08 |
| R-02 | Visual style: future cyber, realistic complex city streets, strong bloom, reflections, emissive surfaces, Ghostwire: Tokyo as the rendering reference | 11 |
| R-03 | Semi-open world scavenging, enterable buildings, grand scale | 09 |
| R-04 | The 20 classes defined in the StormBound documents | 05 |
| R-05 | Balanced in-run roguelite growth and out-of-run growth | 06, 07 |
| R-06 | Out-of-run difficulty tiers that raise monster health, attack, elite output and rare drop rate | 07 |
| R-07 | Camera: top-down plus third-person plus a shooting reticle | 04 |
| R-08 | Premise: an alien ship in high Earth orbit, mutants hidden in crowds | 01, 03 |
| R-09 | Mimics fake ordinary identities; only the military device senses them; mimics sense the player back and turn aggressive | 03 |
| R-10 | Solo infiltration; collect intel and supplies; extract; deliver to the military | 01, 02 |
| R-11 | Everyday objects are infected by the enemy; searching is dangerous | 08 |
| R-12 | Mutant gear is appraised, modified and made safe at the base, then used to modify armor and weapons for legendary-power-like traits | 08 |
| R-13 | Scene assets are generated through procedural modeling | 10 |
| R-14 | Every document in new_project_docs is written in English | all |

## 3. Design pillars

1. The city looks back. Sensing is mutual: information about enemies always costs exposure (03).
2. Every container is a gamble. Daily objects can be infected, so searching is risk management and not a vending machine (08).
3. Leaving alive is the victory condition. Loot has no value until it crosses the extraction line (02).
4. Build the hunter from the hunted. Mutant gear, once made safe, becomes your legendary powers (08).
5. Neon is information. Bloom, emissive color and reflections must help the player read threats, loot and exits (11).
6. Procedural, but authored-feeling. Generated streets and buildings follow human-readable rules and hand-tuned grammars (10).

## 4. Reference usage

| Reference | What we take | What we do not take |
| --- | --- | --- |
| Escape from Duckov style extraction games | Raid structure of deploy, scavenge, fight, extract; grid inventory; risk of losing carried gear; hub contracts | Any level, item, character, art or text |
| Diablo style action RPGs | Affix-driven loot, legendary powers, rarity ladder, loot excitement | Names, items, art or skill trees |
| Ghostwire: Tokyo (rendering reference only) | Signage-dense wet streets, strong bloom, reflective surfaces, emissive materials, layered depth haze | Any asset, map, character, creature design or lore |
| StormBound (this repository) | 20 classes with four-slot skills, build and balance documents, combat tuning, profile and save modules, navigation, occlusion, post-processing work | Its fantasy setting, art and historical Unity-era paths |
| WATER.html prototype (this repository) | A working extraction loop: timed phases, hold-to-extract, contracts paid on extraction, discount trader, lockpick search, first/third person switch | Its market setting, art and embedded assets |

## 5. Non-goals for the first release

- No co-op or PvP. StormBound has multiplayer designs; revisit after the single-player vertical slice.
- No real-world city map or brand; the city is fictional.
- No photorealistic human faces; stylized-realistic characters are enough.
- No dependency on a hand-authored art pipeline; scene assets are procedural (R-13).

## 6. Target experience numbers (Proposal)

| Item | Target |
| --- | --- |
| Raid length | 20 to 30 minutes |
| Hub time between raids | 3 to 6 minutes |
| Time to first meaningful loot | Under 90 seconds after insertion |
| Time to first mutant reveal | 2 to 4 minutes |
| New player first successful extraction | Within 3 raids |
| Desktop frame target | 60 FPS on a mid-range GPU at medium quality |

## 7. Open questions

See [14 Roadmap and Open Questions](14-roadmap-and-open-questions.md).
