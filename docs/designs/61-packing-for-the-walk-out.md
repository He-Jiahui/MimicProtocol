# Packing for the Walk Out

Status: Design direction with proposed examples. Updated: 2026-11-27. Requirements: R-01, R-05, R-11, R-12.

Extends [02: Carrying capacity](02-core-loop-and-raid-structure.md), [38: Field bags](38-field-bags-and-stash-appraisal.md) and [52: Loaded movement](52-barracks-attributes-and-raid-stats.md). See [60: References](60-what-makes-loot-worth-extracting.md) and [62: Death and recovery](62-what-the-insurance-drone-brings-home.md).

**The pack is a supply the operator takes into the district.** One active backpack supplies a finite grid. A higher-quality pack offers more cells and can turn up in a raid. Bring it through exfil and it can go out again; die and the pack drops, even if the drone saves some contents. It has no body slot, Gear Rating, affix or Power. A basic replacement should be available with [02's starter provision](02-core-loop-and-raid-structure.md) so that losing a pack changes the next trip without making a search impossible.

## Leave room for the thing you came for

At ferry dispatch the operator wants a tide recorder. A wet mark under the desk drawer could be runoff or a Host tell. Scanning settles a different question at a price: the link works both ways. The operator can search by hand, withdraw, or fight a revealed threat for the time to search. Winning the doorway earns access to the drawer. It pays nothing into the stash.

**Proposal sketch.** In this small patch of the bag, `X` is occupied and `.` is free. Each line is one row:

```text
X . X .
X . X .
X . X .
```

Six cells are free, yet a sealed 2-by-2 parcel fits nowhere. Slide the three occupied cells of the third column into the fourth, if the objects can move there as whole pieces, and the middle opens up. A long 1-by-3 recorder could instead slip straight down a narrow gap. Rectangular items can turn a quarter turn; turning buys a different fit, never extra cells. Offer a fitting placement when one is obvious. The decision worth the player's time is whether to move a dressing, leave the coupler behind, or give up on the parcel.

Keep [38's](38-field-bags-and-stash-appraisal.md) distinct places useful: a dressing in a marked quick pocket is ready to use; the same dressing deep in cargo must first be brought within reach. The equipment sleeve holds a field tool such as a relay, ready to place at a mast. It cannot activate found armor. Show pockets and sleeve as part of finite carrying space, with the same weight and loss as cargo. A [59 cache effect](59-what-a-raid-item-can-do.md) already taken for this raid occupies none of these cells and cannot be unpacked for sale.

## A better pack at a bad time

A larger empty pack lies beside a ticket booth. Let the operator see its usable grid and empty weight on the ground, then preview which pieces can transfer. **Proposal:** a 4-by-4 pack exchanged for a 4-by-5 pack buys a whole row. Use the new pack immediately; it is a container, so the Lab rule for sealed equipment doesn't apply. Only one pack's grid is open. The old pack and anything left in it stay at the booth; an empty spare can be folded into cargo only if it fits, adding its own weight and no cells. Let the operator back out before the handover. A patrol coming through the arch is a good reason to leave with the smaller pack.

**More room doesn't carry the weight.** Count the bag itself and the mass of everything carried, including ready supplies. As load rises, walking speed falls. Give the player the resulting loaded speed before accepting a heavy find. Packing the same items more neatly changes fit alone. [52](52-barracks-attributes-and-raid-stats.md) lets Conditioning contribute to loaded speed on deployment; [53](53-calculating-raid-stats-and-damage.md) treats movement as a direct stat. Carrying or discarding a heavy parcel never trains an aptitude.

**Proposal arithmetic:** a 60-metre open crossing takes 15 seconds at 4 m/s and 20 seconds at 3 m/s. That is five more seconds in view before the *same* extraction hold. The coupler may fit one small gap and still cost those seconds. Leave it and take the straight crossing, or keep it and use the covered arcade. The slowdown should be legible on the way back; a packed operator can still move, aim deliberately and abandon cargo. No extra delay on the exfil hold. A useful future comparison is to walk the same route with and without the coupler and ask where the player would break cover. No route timing has been playtested here.

**Earlier wording replaced.** Keep [02 section 7's](02-core-loop-and-raid-structure.md) bag-sized grid and movement cost; its fixed surviving case is replaced by [62](62-what-the-insurance-drone-brings-home.md). In [38](38-field-bags-and-stash-appraisal.md), keep the distinction between carrying and access, but replace the sentence that counts the backpack among the pieces worn. [08's backpack slot](08-loot-contamination-and-legendary-gear.md) and its legendary hook go away with it. The operator can change bags in the street without changing a single equipped combat rule.
