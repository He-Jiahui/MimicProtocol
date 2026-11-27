# Presentation, Creatures and City Terrain

Status: Design research and proposal. Updated: 2026-11-26. Requirements: R-01, R-02, R-03, R-08, R-13.

[Back to index](README.md)

**Proposal:** A player leaving a shop in Meridian should be able to glance across the wet street, recognize the shape of a revealed hunter under the awning and spot the stairs back to the quay. That glance ties the look of the city to what the operator came to do: search, survive the encounter and find a way out.

## Where the presentation has room to grow

[Rendering and Visual Style](11-rendering-and-visual-style.md) already calls for a realistic city at night. The demo loads distinct asphalt, plaster and metal surfaces (`src/render/assets.js`), and `dressFrontage` in `src/sim/dress.js` distinguishes public fronts from service edges. The risk of a blockout look is in how the pieces meet: even convincing damp plaster can look like a skin on a box if a shop door has no apparent depth or threshold.

The creatures already differ, too. `drawEnemy` in `src/render/scene.js` gives the Brute plated forearms, the Skitter a curled tail and the Spitter a swelling sac. An open question is which of those features survives rain, hit flashes and the distance of the tactical camera. A similar distinction applies to height: `addCanalAndRail` and `addSkybridges` in `src/sim/world.js` give Meridian a skyline above the operator, while `reachable` in the same file traces routes across a horizontal grid. A street can pass under impressive infrastructure and still feel flat to travel.

These are observations from the design notes and source. No live capture, playtest or visual asset audit was made for this document.

## Proposal: Let the rain describe the model

Keep the neon, deep shadows, wet reflections and layers of haze. Refine the forms that catch that light. At a noodle shop, the awning sags between its brackets; rain beads along its lip and leaves a dry crescent by the recessed door. The sign stretches across a puddle but breaks up on the coarse paving beside it. From the shoulder camera this looks like a place to step in out of the rain. From above, the threshold still reads as an entrance.

This is a refinement of the existing look pillars and the generated buildings in [Procedural Generation and Modeling](10-procedural-generation.md). Believable proportions, joints and wear can give a generated asset the finish of a carefully observed object. The city can keep its saturated signs; a dark patch of pavement beneath them gives the scan outline, a ground warning or a dropped item room to show.

## Proposal: Give each revealed Mimic a recognizable attitude

[World and Narrative](01-world-and-narrative.md) depends on an ordinary pedestrian being a convincing disguise. Save the unmistakable anatomy for the reveal. The roles below come from [Mutants, Detection and Enemy AI](03-mutants-detection-and-enemy-ai.md); the charge, circling leap and ranged shot also have counterparts in `src/sim/behave.js`.

| Revealed Mimic | What the operator might notice |
| --- | --- |
| Brute | Its head settles between battered shoulder plates and its weight rolls onto its knuckles. From above, the broad back squares up with the street; from the shoulder, the whole animal seems bent on coming straight through. That is a reason to step aside before the charge. |
| Skitter | Gaps between the splayed legs and narrow trunk keep its outline open against wet pavement. It slips sideways while the hooked tail stays poised. Even in shadow, that restless shape draws the eye to the flank it is circling toward. |
| Spitter | A taut, translucent sac swells above spindly legs; the little tube mouth steadies while the rest of the body strains. A figure across the street suddenly deserves cover between it and the operator, even if the acid's color is lost in a sign's reflection. |

The scan can name the threat. Its posture should still tell the player what to watch once the outline fades. Plate and membrane suggest very different temperaments without promising an armor bonus or a new weak point.

## Proposal: Give the street a life before the raid

[World Structure and Buildings](09-world-structure-and-buildings.md) gives the operator reasons to enter shops and warehouses. Give the people who used those buildings reasons to have arranged them this way. In Old Town, a stall faces the foot traffic while its crates wait by the kitchen door in the lane behind. A stool tucked under the counter suggests the vendor expected to come back. The clear path past the stall lets the operator see someone coming and decide whether to risk searching it.

At Dockside the same strip of open pavement serves a different purpose: a truck needs to turn into a loading bay. Scuffed corner guards and a battered shutter explain the empty apron better than scattered freight would. A player leaving the warehouse can see across it to the quay. These districts from [Demo Raid: Map, Time of Day and Zones](17-demo-raid-map-time-and-zones.md) can feel distinct even with their signs switched off.

## Proposal: Step the district; keep the places to stand level

Imagine looking up from the boat landing. The quay runs flat along the water. A retaining wall holds up the market street; a freight ramp climbs beside it and public stairs emerge by the stalls. Beyond the market, an elevated rail line crosses overhead. Looking back from the stairhead, the operator can pick out the landing and see where the return route turns. The railway can remain a landmark without suggesting that the tracks are an escape route.

Across the district, long runs of level road, terraces and building platforms can add up to a substantial change in height. Up close, each lot still offers sound footing for a fight. Let the visible face of a wall and the mouth of a stair distinguish a drop from a way down, including from the tactical view. This gives the street and mezzanine levels in the world design a relationship the player can see from either end.

## What to avoid

**Proposal:** Avoid a neutral military palette, a painterly reset or a pursuit of photographic detail that buries the silhouette. A neon edge on every claw makes the Spitter's tightening sac harder to notice. A picturesque row of umbrellas loses its appeal if it hides the warning under the operator's feet. Keep character in the shapes and leave the combat signals legible.

**Proposal:** Avoid paving continuous country hills through Meridian, adding random bumps to level lots, or leaving the whole playable route on a slab beneath tall scenery. A steep district can still have a level market square; the retaining wall below it is what makes that square believable.

## Proposal: Later refinement order

Start with the Brute and Skitter against the same rain-dark shopfront: their opposite stances should carry the encounter from either camera. Next, give that frontage a readable public entrance and a service side so there is a place worth searching. Then follow the way out, from the upper street down to a level quay, making the descent apparent before the player commits. Revisit signs, reflections and crowd detail in deep night last. The open question is what the player can still pick out while retreating; the source alone cannot answer it.
