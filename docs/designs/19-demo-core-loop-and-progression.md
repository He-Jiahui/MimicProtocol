# Demo Core Loop and Progression Spiral

Status: Draft v0.1. Updated: 2026-11-25. Requirements: D-14, D-15.

[Back to index](README.md) | Previous: [18 Demo Classes, Elite Affixes and Run Items](18-demo-classes-elites-and-items.md) | Next: [20 Demo In-Raid Events](20-demo-in-raid-events.md)

## 1. Goal

The first raid map must stay fun over many replays. Every raid should end with a visible upgrade, every upgrade should open a harder option, and every harder option should pay more. This page defines the loop, its pacing and the risk and reward ladders. Details live in [20](20-demo-in-raid-events.md) (events), [21](21-demo-contracts-and-sector-states.md) (contracts and sectors), [22](22-demo-bosses.md) (bosses) and [23](23-demo-boss-loot-and-drops.md) (drops).

## 2. Three nested loops

| Loop | Length | Player action | Reward beat |
| --- | --- | --- | --- |
| Micro | 5 to 60 s | Move, shoot, scan, search | Kill pops, loot beams, hit markers, cash numbers |
| Raid | About 30 min | Choose a route, trigger events, decide when to leave | A run item about every 2 min, an elite every 3 to 4 min, an event every 3 to 4 min |
| Meta | 3 to 8 raids | Process gear, enhance, finish contracts, raise the Threat Tier | New gear, a new sector, a new boss, a new tier |

## 3. Raid beat sheet (Proposal)

The game clock follows [17](17-demo-raid-map-time-and-zones.md); one real minute is 15 game minutes.

| Raid minute | Clock | Beat |
| --- | --- | --- |
| 0 to 1 | 18:30 | Safe start in Z0, broker, first Supply Cache within 90 s |
| 1 to 6 | 18:45 to 20:00 | First kills, first run item, first event, first low-affix elite |
| 8 | 20:30 | Nightfall banner, Z2 becomes a realistic target, loot odds rise |
| 10 to 14 | 21:00 to 22:00 | First boss reachable if its sector is unlocked, first Wanted elite |
| 16 | 22:30 | Night banner, elite share and Prototype odds climb, decision gate 1 |
| 20 to 24 | 23:30 to 00:30 | Z3 events, second boss, Compactor builds spike |
| 24 | 00:30 | Deep Night banner, decision gate 2: carry value against time |
| 26 to 30 | 01:00 to 02:00 | Z4 push or extraction, curfew at 02:00 |

A player usually fights one boss per raid. In Z1 and above, reward beats should never be more than 90 s apart.

## 4. Risk and reward ladder

Carry value V is the total sell value of carried items and is always on the HUD.

- Extraction Bonus (Cash) = V x (0.05 x Zmax + 0.25 x NL at exit). Zmax is the deepest zone level (0 to 4) entered. Examples: Z4 at 02:00 pays V x 0.45; Z1 at dusk pays V x 0.05.
- Intel Credits and contract payouts are multiplied by (1 + 0.1 x Zmax) and by (1 + 0.15 x (T - 1)).
- Bosses add a fixed package (see [23](23-demo-boss-loot-and-drops.md)).

| Risk dimension | Cost to the player | Matching reward |
| --- | --- | --- |
| Threat Tier | Monster health, damage and elite share | Elite named drops, rare weight, payouts (see [07](07-meta-progression-and-difficulty.md)) |
| Zone depth | Monster stats (see [17](17-demo-raid-map-time-and-zones.md)) | Loot weight and the Intel multiplier |
| Night | Monster stats and spawn rate | Rare weight and the Night part of the Extraction Bonus |
| Carry value | Everything carried is lost on death | The bonus grows with V |
| Boss | Wipe risk and time | Legendary roll and the boss package |

Decision gates: at 22:30 and 00:30 Relay shows carried value, the current multipliers and the distance to the nearest active extraction point. It gives no advice.

## 5. In-raid growth budget

Item sources for a full T1 raid without a boss (matching the 12 to 14 items in [17](17-demo-raid-map-time-and-zones.md)): Supply Caches 5, Signal Shrines 2, elites 2 to 3, events 3. A boss adds 2 more. Build moments (Proposal): a first synergy (two items of one tag, or a kit combo upgrade) by minute 8, and a build-defining Prototype by minute 18 in 70% of T1 raids.

## 6. Meta strengthening

Gear Rating (GR) is the sum of four slot ratings. Slot rating = item level x quality multiplier x (1 + 0.08 x enhance level). Quality multipliers: Common 1.0, Enhanced 1.1, Rare 1.25, Prototype 1.45, Legendary 1.7. Item level is defined in [23](23-demo-boss-loot-and-drops.md). The starter kit is four Common level 10 items, so GR 40.

| Tier | Recommended GR | Target extraction rate at that GR |
| --- | --- | --- |
| T1 | 40 | 85% |
| T2 | 90 | 78% |
| T3 | 150 | 70% |

Expected pace (Proposal):

| Stage | Raids | Expected GR | Unlocks and goals |
| --- | --- | --- | --- |
| Onboarding | 0 | 40 | Tutorial, first Process, first enhance |
| Early | 1 to 3 | 40 to 70 | Gate A, first Rare item, first Boss 1 attempt |
| Mid | 4 to 6 | 70 to 100 | T2, Boss 1 kill, Gate B |
| Late | 7 to 10 | 100 to 150 | T3, Boss 2, Gate C |
| Demo end | 10 to 12 | 150 and up | Boss 3 first kill |

A first-visit session of 60 to 90 minutes covers the tutorial and one or two raids; full depth is about 10 raids (Proposal).

Economy per T1 raid (Proposal): loot sales 500 to 800 Cash, contract payouts about 300 Cash, 3 to 5 Lab Samples. Enhance level n costs 60 x 1.6 to the power (n - 1) Cash: 60, 96, 154, 246, 393, so a full +5 item costs about 950. Reroll costs 40 Cash and 1 Lab Sample. Levels +6 to +8 need Boss Cores (see [23](23-demo-boss-loot-and-drops.md)). That funds about one fully enhanced item per raid.

## 7. The spiral

1. Run items and events give power during the raid.
2. Power lets the player go deeper and later, into richer zones and a rising Night Level.
3. Depth pays a bonus, better drops and boss packages.
4. Hub processing, enhancing and affix rerolls turn drops into Gear Rating.
5. Rating, contracts and boss kills open Threat Tiers, sectors and bosses ([21](21-demo-contracts-and-sector-states.md)).
6. A higher tier raises the stakes and the loop restarts.

Hooks that make the next raid obvious: the debrief shows the GR change and three suggested goals, contract progress bars stay visible, locked sectors show a preview, and Unidentified items wait at the Lab.

## 8. Failure and recovery

On death the player loses carried items and the Extraction Bonus. Class XP, the secure case (2 items) and previously committed contract progress stay (see [15](15-web-demo-scope-and-overrides.md)). The starter kit is always available. Key Supplies lost on death respawn in the next raid ([21](21-demo-contracts-and-sector-states.md)). A black-box recovery run is an open question.

## 9. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 19-A-01 | Simulate 1000 T1 raids with a median bot at GR 40 | Extraction rate within 10 points of 85% | Not yet implemented |
| 19-A-02 | Compute the Extraction Bonus for Z4 at 02:00 and for Z1 at dusk | V x 0.45 and V x 0.05 | Not yet implemented |
| 19-A-03 | Simulate 3 consecutive T1 raids for a median bot | GR between 65 and 80 and at least one Rare item owned | Not yet implemented |
| 19-A-04 | Finish a raid by extraction | The debrief shows the GR change and 3 suggested goals | Not yet implemented |
| 19-A-05 | Simulate 1000 T1 raids | Median of 6 to 9 completed events and 12 to 14 run items | Not yet implemented |
