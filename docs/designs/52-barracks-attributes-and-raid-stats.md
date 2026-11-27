# Barracks Attributes and Raid Stats

Status: Design proposal. Updated: 2026-11-27. Requirements: R-01, R-04, R-05, R-09, R-12.

[Design index](README.md) · [Run growth](06-run-growth-roguelite.md) · [Meta progression](07-meta-progression-and-difficulty.md) · [Class levels and variants](39-class-levels-and-barracks-variants.md) · Next: [Calculating raid stats and damage](53-calculating-raid-stats-and-damage.md)

**Train an aptitude in the Barracks; take its consequences into the street.** An *advanced attribute* describes training that helps with several tasks. A *direct* or *first-level attribute* has a unit and an immediate use: damage per round, attacks per second, movement in metres per second, critical chance per eligible hit, or the fraction of incoming acid damage resisted. “First-level” means close to the action, not restricted to a new operator. The hub can preview these values. A pickup changes what the operator can do on this deployment; it can never raise the aptitude that helped produce the starting value.

## What the operator trains

These are proposed working names. A class's **primary** (or **main**) aptitude gets the largest share of its starting training. Its other aptitudes are **secondary**: they use the same conversions and can matter more for a particular route. Primary and secondary describe priorities *among* advanced attributes. Neither is another multiplier on the raid sheet.

| Barracks aptitude | Examples of direct results | Why a class would favor it |
| --- | --- | --- |
| Handling | Recovery time between aimed basic attacks; time to open a routine container by hand | Rifleman can paint Suppression before a pack disperses. A shorter search also buys time to leave the doorway. Neither benefit steers the reticle. |
| Conditioning | Maximum health; walking speed while carrying a heavy load | Blade can afford a close exchange and still carry a find to the exit. Conditioning doesn't extend dodge protection. |
| Systems | Sentry operating time when deployed; duration of an applied infection; time to work an electronic lock | Summoner favors time on station; Toxic Handler favors time to catch a moving infection with a cloud. Both can work the lock. A longer infection gives more time to act; it doesn't increase the damage of each tick. |

These are primary assignments for the four [demo kits](18-demo-classes-elites-and-items.md). Shared training needn't imply shared attacks: the Handler doesn't acquire a sentry. The longer-term [20-class roster](05-classes-and-skills.md) keeps its working names. As a direct-stat comparison, per-round damage may be the *main consideration* for a rifle swap and loaded speed a *secondary consideration*. Those words describe the player's decision, not a second hierarchy that discounts speed.

## What crosses the deployment line

- **In the Barracks:** each aptitude is the class's starting training plus its share of a modest, earned class training allowance. Assigning some allowance to Conditioning leaves less for Handling or Systems. The primary preference is already in the starting distribution; a primary point isn't worth more again at deployment. Class XP can open training choices at milestones. The principal reward for later levels is a choice about the native four skills under [39](39-class-levels-and-barracks-variants.md). Shared Operator Rank, gear rarity and Gear Rating aren't aptitude points.
- **On deployment:** translate the chosen aptitudes once into their named direct contributions. Combine these with the base kit and identified, equipped gear to preview the starting raid sheet, as in [26](26-equipment-loot-reference-brushwild.md). A weapon can add damage directly. That roll belongs to the weapon; taking it off removes it. The class hasn't learned better Handling by equipping a better rifle.
- **In the raid:** apply raid levels, run items and temporary conditions to direct stats or eligible actions. A Blade with a heavy case can find a movement bonus that makes the loaded walk to exfil quicker. Dropping the case removes the load penalty; it doesn't award Conditioning. A quicker lock opening still risks a Host, and a scan still opens a mutual link.
- **On extraction or death:** discard the raid sheet, including stacks, temporary speed and current resources. Settle class XP and kept cargo under their own rules in [06](06-run-growth-roguelite.md), [07](07-meta-progression-and-difficulty.md) and [08](08-loot-contamination-and-legendary-gear.md). If a recovered Tainted rig reaches the stash, the demo's Lab Process and a later equip decision can change a *future* starting sheet. Carrying it confers no hidden power. Neither a stat peak nor a stack count becomes training credit.

A useful comparison in the Barracks would be “this training shortens the search; that body piece lets me survive the interruption.” Both can help get the recorder home. Contracts, reveals, and extraction must remain possible with the starting kit.
