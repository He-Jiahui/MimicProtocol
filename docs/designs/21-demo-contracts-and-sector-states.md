# Demo Contracts and Sector States

Status: Draft v0.1. Updated: 2026-11-25. Requirements: D-17, D-18.

[Back to index](README.md) | Previous: [20 Demo In-Raid Events](20-demo-in-raid-events.md) | Next: [22 Demo Bosses](22-demo-bosses.md)

## 1. Intent

Hub contracts give the player goals that span several raids. Each contract pushes a sector toward a better state, and the state changes what the next raid looks like: locked areas open, more loot appears and elites weaken. These are separate from the raid-scoped contracts of [02](02-core-loop-and-raid-structure.md) and [17](17-demo-raid-map-time-and-zones.md), which stay as written.

## 2. Sector grid

The 3.2 km map is divided into 16 sectors of 800 m by 800 m (8 by 8 blocks). Sectors group blocks for contracts and state. They never change the zone levels of [17](17-demo-raid-map-time-and-zones.md).

| Group | Sectors | Zones | Landmarks | Unlock |
| --- | --- | --- | --- | --- |
| Start | 8: Old Town 3, Neon Strip south 3, Dockside south 2 | Z0 to Z2 | Insertion, broker | Open |
| Gate A | 3: Reliquary Quarter, Neon Strip north 2 | Z2 to Z3 | Boss 1 lair | Deliver 3 Power Cells and Survey Old Town |
| Gate B | 3: Corporate Plaza 2, Dockside north | Z3 | Boss 2 lair | Deliver 1 Cryo Core and 3 Data Shards, and Instrument one Neon Strip sector |
| Gate C | 2: Arcology Heights 2 | Z4 | Boss 3 lair | First kills of Boss 1 and Boss 2, and Deploy 2 sensors in Gate A or B sectors |

A Locked sector is sealed by shutters. Its extraction points are inactive, its loot and events do not spawn, and the minimap draws it with a lock icon and a grey overlay.

## 3. Intel levels and effects

Each sector has an Intel level from 0 to 3. Effects are applied when a raid is generated and stay fixed for that raid.

| Level | Name | Reached by | Effects |
| --- | --- | --- | --- |
| L0 | Unknown | Default | Zone colors only |
| L1 | Surveyed | Survey contract | Building archetype icons, event anchors and Key Supply markers on the map |
| L2 | Instrumented | Sensor contract, needs L1 | Mimic patrol heat on the minimap, Host chance -20%, loot weight +15%, one extraction point in the sector revealed |
| L3 | Secured | Purge contract or boss kill, needs L2 | Elite share -50%, elite affix cap 1 (not in boss lairs), +25% containers, a safe room added |

The elite named-drop chance is unchanged at L3, so fewer elites do not make each elite worth less. Zone level is never lowered, so a Secured sector pays in volume and safety, not in rarity. Demo completion target (Proposal): 6 sectors at L3 and 3 bosses killed. Choosing which sectors to fortify is the player's decision.

## 4. Contract board

- After each raid the board offers 5 contracts and one gate or story contract is always pinned. The player holds up to 3 active contracts and may abandon one for free.
- Rewards are multiplied by (1 + 0.15 x (T - 1)) as in [19](19-demo-core-loop-and-progression.md). They pay only after a successful extraction.

| Type | Task | Reward (T1, Proposal) | Intel effect |
| --- | --- | --- | --- |
| Deliver | Bring N Key Supplies to the hub. They are flagged items that spawn in named building archetypes of the target sector | 300 to 500 Cash | Gate unlock |
| Survey | Use Scan Pulse at 3 landmarks or Data Relays in a sector, then extract | 250 Cash and 2 Intel Credits | L1 |
| Deploy Sensor | Carry up to 2 Sensor Probes to marked nodes (rooftop masts, street boxes). Each takes a 20 s channel with 15 m noise and a wave of 6 Mimics at 10 s. A sensor goes live only when the player extracts | 400 Cash and 2 Lab Samples | L2 |
| Purge | Destroy 2 or 3 marked nests in a sector | 3 Lab Samples and 1 Unidentified gear of Enhanced or better | L3 |
| Hunt | Kill a named Wanted elite or 3 elites in a sector | 350 Cash and 1 Unidentified gear | None |
| Retrieve | Recover a named intel item from a vault or server floor | 4 Intel Credits | None |
| Boss | First kill of a zone boss | See [23](23-demo-boss-loot-and-drops.md) | L3 for boss sectors |

World hooks: Data Relays and Wanted elites from [20](20-demo-in-raid-events.md) count toward Survey and Hunt. The first raid after the tutorial has the Old Town Survey contract pre-assigned.

## 5. Persistence and failure rules

- Sector Intel, live sensors, gate states and contract progress live in the profile and are committed in the same atomic transaction as the raid result (see [13](13-technical-architecture.md)).
- On death, progress made in that raid is not committed. Key Supplies and Sensor Probes in the inventory are lost.
- Contract targets are guaranteed: lost Key Supplies respawn in the next raid, and Sensor Nodes are always generated for an active Sensor contract.
- Settings provide a New Operation action that resets sectors and contracts but keeps gear (Q-33).

## 6. UI

- Hub Operations Map: 16 sectors with lock icons, Intel pips, active contract markers and a preview of the effects the next raid will get.
- The Threat Console lists the sector effects that apply to the chosen insertion.
- The minimap and full map draw thin sector borders with Intel pips beside the zone hatch of [17](17-demo-raid-map-time-and-zones.md). Lock and Intel icons must stay readable in greyscale.
- The raid HUD contract tracker shows progress such as Key Supplies carried and sensors placed.

## 7. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 21-A-01 | Start a fresh profile | 8 sectors are open and 8 are Locked; extraction points inside Locked sectors are inactive | Not yet implemented |
| 21-A-02 | Finish the Gate A Deliver contract and extract | Gate A opens in the next raid and the hub map shows it open | Not yet implemented |
| 21-A-03 | Place a sensor, then die before extracting | The sensor is not live, the Probes are lost and the next raid offers a Probe again | Not yet implemented |
| 21-A-04 | Reach L3 in a sector and generate the next raid | Elite share halved, affix cap 1, containers +25% and a safe room present | Not yet implemented |
| 21-A-05 | Complete a Hunt contract in a raid that ends in death | No payout and no progress | Not yet implemented |
| 21-A-06 | Kill the process during a commit | After restart, sector state and contract progress match one committed result | Not yet implemented |
