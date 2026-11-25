# Demo In-Raid Events

Status: Draft v0.1. Updated: 2026-11-25. Requirements: D-09, D-10, D-16.

[Back to index](README.md) | Previous: [19 Demo Core Loop and Progression Spiral](19-demo-core-loop-and-progression.md) | Next: [21 Demo Contracts and Sector States](21-demo-contracts-and-sector-states.md)

## 1. Intent

Events turn a walk through the city into a chain of short objectives: tasks, waves, empowered elites, rescues, self-empowerment, and item trades and gambles. They extend the fixed activities in [17](17-demo-raid-map-time-and-zones.md) section 4 (Supply Cache, Signal Shrine, Intel Terminal, Nest Clearing, Broker), which stay as written; the Signal Shrine of 17 is the Blood Shrine below. Patterns are adapted from the StormBound event pages (doc 39-2 for waves, towers and exploration; doc 39-3 for shrines, risk chests and trade devices). Those pages were read only as Wiki index entries, so they must be checked before reuse.

## 2. Event director

- At generation stage S10 ([10](10-procedural-generation.md)) the director seeds 16 to 20 event anchors across the unlocked sectors. A player realistically completes 6 to 9 per raid.
- Z0 has no events. Density per sector: Z1 about 1, Z2 1.5, Z3 and Z4 2.
- At most 2 events are active at once. No anchor lies within 150 m of another anchor or of an extraction point. Each type appears at most twice per raid (three times for shrines).
- Debris Fall needs a Night Level of 0.4 or more. Wanted elites always carry 2 affixes.
- Waves respect the 40 hostile cap of [03](03-mutants-detection-and-enemy-ai.md): spawning pauses while the cap is full.
- Events show on the minimap within 120 m, or from the start in sectors at Survey level L1 or higher ([21](21-demo-contracts-and-sector-states.md)).

## 3. Event catalog

| Event | Zones | Task | Reward | Risk |
| --- | --- | --- | --- | --- |
| Distress Signal (rescue) | Z1 to Z3 | Hold 75 s while survivors open a bunker door, then escort 3 to 6 survivors to the nearest shelter | 1 Enhanced or better run item per 2 survivors saved (max 3), plus Intel Credits | Survivors can die and each death costs reward and adds a Command penalty. 25% of events hide one Mimic among the survivors; it reveals at the shelter unless scanned |
| Swarm Surge (wave) | Z1 to Z4 | Activate a siren terminal, or enter a nest radius, and survive 3 waves of 8, 12 and 16 Mimics. At NL 0.5 or more wave 3 includes an elite | Cache with 1 run item (Enhanced or better) and Credits | The siren is loud (noise 45 m). Leaving forfeits the cache |
| Alpha Hunt (empowered elite) | Z2 to Z4 | Kill a Wanted elite with 2 affixes and 4 escorts | Guaranteed elite named drop and 1 run item | The Wanted elite flees once to its nest at 40% health |
| Blood Shrine | Z1 to Z4 | Pay 25% of current health | Choose 1 of 2 run items, Enhanced or better | Health loss |
| Static Shrine | Z2 to Z4 | Pay Alert +1 and a burst of 4 Mimics | Choose 1 of 3 run items, Enhanced or better | Alert pressure |
| Greed Shrine | Z3 to Z4 | A Wanted pack spawns; kill it | 1 Prototype run item | The pack fights back at once |
| Cursed Cache | Z2 to Z4 | Choose 1 of 3 curses, then open (hold E) | 2 items of Enhanced or better (Q x 1.5 weights) and a choice of 1 of 2 Prototype run items | The curse lasts until extraction |
| Reprinter | Z1 to Z3 | Swap 1 run item for a random different item of the same rarity (2 uses) | Build repair | The old item is destroyed |
| Compactor | Z2 to Z4 | Combine 3 run items of one rarity into 1 of the next (Common to Enhanced, Enhanced to Prototype); 1 use | Build spike | Item count shrinks |
| Wager Terminal | Z2 to Z4 | Pay Credits and pick 1 of 3 face-down cards | See the odds below | Ambush outcome |
| Data Relay (tower) | Z2 to Z4 | Hold within 12 m for 90 s while 3 pulses each spawn 6 Mimics | Reveals the sector layer on the map, one extraction point and 2 Intel Credits; counts toward Survey | Leaving the radius pauses the timer |
| Outbreak | Z2 to Z4 | Kill or burn 8 to 12 Hosts in a marked block within 120 s | Clean Block cache: 2 items of Enhanced or better and 2 Lab Samples | Spore bursts add contamination ([08](08-loot-contamination-and-legendary-gear.md)) |
| Debris Fall | Z3 to Z4 | A streak and crater marker appear 20 s before impact; channel 30 s to extract the Debris Core while waves arrive | 4 Lab Samples and 1 Unidentified Rare or better gear | Contamination +25 on pickup; Awareness rises nearby |
| Supply Drop | Z1 to Z3 | Command marks a crate that lands after 20 s; reach it and hold 30 s | 1 Prototype run item (choose 1 of 2) and consumables | Waves converge; the crate expires after 4 min |

## 4. Details

Curses (a Cursed Cache offers 3 of these 5): Frail (max health -25%), Loud (all noise radii x1.5), Sluggish (skill cooldowns +25%), Hunted (the next elite within 3 min arrives as a Wanted pack heading for the player), Brittle (barrier and healing -40%). The curse shows as a debuff icon.

Wager Terminal: cost 40 Credits, +25% per wager at that terminal, max 3. Card outcomes: Prototype run item 8%, Enhanced run item 32%, Credits refunded x2 20%, nothing 25%, ambush of 3 to 5 Mimics 15%. After two nothing or ambush results at one terminal the next card is an Enhanced or better item.

Reprinter and Compactor never create items above Prototype, and they obey the stack rules of [18](18-demo-classes-elites-and-items.md).

## 5. Reward scaling

Reward counts are fixed per event. Quality uses Q from [18](18-demo-classes-elites-and-items.md) section 5 (zone loot weight x (1 + NL) x tier rare weight). Elite named gear follows [07](07-meta-progression-and-difficulty.md) and [23](23-demo-boss-loot-and-drops.md). Abandoning an event costs only time, except for the Command penalty on rescue deaths.

## 6. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 20-A-01 | Generate 100 maps | 16 to 20 anchors each, none within 150 m of another anchor or of an extraction point | Not yet implemented |
| 20-A-02 | Play any raid | No more than 2 events are active at once | Not yet implemented |
| 20-A-03 | Finish a Distress Signal with 2 of 4 survivors saved | 1 Enhanced or better item and a Command penalty for each survivor lost | Not yet implemented |
| 20-A-04 | Draw 10000 Wager Terminal cards | Outcome shares within 2 points of 8, 32, 20, 25 and 15 percent; the pity rule holds | Not yet implemented |
| 20-A-05 | Take a curse from a Cursed Cache, then extract | The curse stays until extraction and is cleared afterward | Not yet implemented |
| 20-A-06 | Use a Compactor on 3 Enhanced items | 1 Prototype item appears and the 3 inputs are removed | Not yet implemented |
| 20-A-07 | Generate raids at NL 0.3 and NL 0.4 | Debris Fall appears only from NL 0.4 | Not yet implemented |
