# MIMIC PROTOCOL: WebGPU web demo

Working title. A playable slice of the design in [docs/designs](docs/designs/README.md): a guided
Training Annex, a hub, and one raid on a dense 500 m procedural night district. Search, fight, extract.

The development server runs plain ES modules and raw WebGPU directly.

## Run it

```bash
npm run dev
```

Open <http://localhost:5173> in a desktop browser with WebGPU (current Chrome, Edge or Safari).

The demo supports English and Simplified Chinese (简体中文). Choose **Settings → Language**
from the title screen, hub or pause menu. The first visit follows the browser's language
if it is Chinese and uses English otherwise. Your selection takes effect immediately
and is saved on this browser.

To open it from another device (an iPhone, iPad, or Android phone), use the https address instead.
WebGPU only exists on secure origins, so `http://<ip>:5173` shows "This demo needs WebGPU":

```bash
npm run dev:lan
```

It prints `https://<ip>:5174` and creates a self-signed certificate in `tools/.cert` (needs `openssl`).
Use an HTTPS site trusted by the phone (such as the deployed GitHub Pages demo) if the local
certificate is not trusted. Open the page in the browser itself. HTTPS is required but does
not add WebGPU support: the OS, browser and GPU must expose a usable adapter.

```bash
npm test
```

runs the headless simulation and localization checks.

## Build a single HTML file for offline play

```bash
npm ci
npm run build:html
```

Install the build tool with `npm ci` on a fresh checkout. Each `npm run build:html` regenerates
`DarkSignal.html` in the project root with the scripts, styles, and textures embedded. Open that
file directly in a desktop browser with WebGPU to play offline.

## Deploy to GitHub Pages

In the repository's **Settings → Pages**, set **Build and deployment → Source** to
**GitHub Actions**. Every push to `main` then runs `npm test`, builds the site with
`npm run build`, and publishes the contents of `dist/`. For the first deployment after enabling Pages,
you can also run **Deploy GitHub Pages** manually from the **Actions** tab on `main`.
The deployment job shows the published URL.

To preview the same build locally, run `npm ci` on a fresh checkout, then `npm run build`
and `python3 -m http.server 8000 --directory dist`. Open <http://localhost:8000/>.
The small `index.html` references separate JavaScript, CSS, and image files by relative URL,
so the same output works at `/MimicProtocol/` or at a custom domain's root. Each filename
includes a hash of its contents: editing one texture leaves the URLs for the other textures,
script, and stylesheet unchanged. GitHub Pages controls the HTTP cache headers, so browsers
may still revalidate unchanged files.

## Controls

On touchscreens, drag the left stick to move. Hold the right stick to fire; drag it to aim
in top-down view or turn the shoulder camera. The skill slots show cooldowns and medkit stock.
When a search or extraction prompt appears, hold the prompt itself until the bar fills. Open the menu (☰) to change camera, view the map
or bag, or pause. Menus scroll in either orientation.

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Aim |
| Left mouse | M1 normal attack |
| Right mouse | M2 small skill |
| Shift | Class dodge skill |
| R | Ultimate |
| E (hold) | Search, interact, extract |
| C | Scan Pulse |
| V | Toggle Tactical Top-Down and Shoulder camera |
| Left Alt (hold) | Aim view |
| 1 | Medkit |
| M / Tab | Map / carried items |
| G | Follow the next known activity (route guidance; also chosen on the map) |
| X | Clear the route |
| Esc | Pause |
| Mouse wheel | Zoom (top-down) |

## What is in the game

- **Renderer** (`src/render`): shadow pass, HDR scene pass with 4x MSAA, instanced primitives with
  per-instance rotation and tapered limbs, triplanar CC0 surface textures (asphalt, pavers,
  brick, plaster, facade panels, shutters, setts), a night-sky panorama that also feeds wet
  reflections, a generated sign atlas with real lettering and pictograms, bloom, depth of field,
  shock-ring distortion, sharpening and an ACES grade.
- **City** (`src/sim/world.js`): a 500 m by 500 m district (5 x 5 blocks; `BLOCKS` in
  `src/sim/data.js` sets the size, and the layout scales with it). Avenues, streets, pedestrian
  alleys and built-over edges; lots subdivided with dead ends; a canal with bridges; an elevated
  rail line; parks, fenced car parks, squares, a night market and building sites; covered market
  arcades; walk-through buildings with furnished interiors. The Shelter is one block and holds
  nothing to loot. The design docs describe a 3.2 km map; the demo was cut down to one dense
  district on request.
- **Set dressing** (`src/sim/dress.js`): every wall that faces public ground gets a frontage
  kit aligned to its window bays: entrances, awnings, shop curtains, lanterns, tenant sign
  columns, wall lamps, cable runs, window air conditioners, fire escapes, posters and a prop on
  the pavement (planters, signboards, vending machines, bikes, scooters, crates, bins). Alleys
  get overhead cables, pipe bridges and washing lines; streets get kerbs, guard rails, hydrants,
  cabinets, sign posts, litter, vans, trucks and taxis; deep zones get wrecks, cordons and Mimic
  growth on the walls. The quay, the viaduct, the Shelter, the extraction pads and the lair each
  have their own dressing.
- **Ambience** (`src/render/scene.js`, `drawAmbience`): a train on the viaduct, patrol drones
  with searchlights, aircraft, steam from vents and stalls, lit rain under the street lamps and
  splashes on the ground.
- **Waves** (`src/sim/horde.js`): the first wave lands 8 s after leaving the Shelter, later ones
  at least 14 s apart, a Surge of up to 12 every minute, and nothing more is sent while 32
  hostiles are active. Holding E on an interaction pauses reinforcements; taking a hit does not
  reset the interaction.
- **Enemy behaviour** (`src/sim/behave.js`): each enemy runs approach, hold, wind-up and recover
  states with a role (rusher, flanker, stalker, weaver). Attack tokens limit how many commit at
  once and a shot budget limits projectiles. Every attack has a ground telegraph; hits knock
  light enemies back and interrupt their wind-ups.
- **Class resources** (`docs/designs/64-implementation-plan.md`, package 2): no shared Charge.
  Rifleman cells fund extra Piercing Lines that burst around Suppressed bodies; Blade momentum
  carries Whirl Slash and its third cut knocks loose a plate fragment worth a barrier; Summoner
  posts two carried sentries and calls radio Orders with grenades; the Handler's Wither Cloud
  ruptures the Venom still to come. A clean dodge returns 40% of the S cooldown plus a class
  payout. M1 Brands and the Consume event stay; gear Aspects are restated against the resources.
- **Damage** (package 1): one pipeline. Like bonuses share one pool (gear adds at most +150%),
  crits are x1.75 and never on ticks, the recipient applies stagger and one vulnerability sum.
- **Combat feel** (package 3): the Brute's charge lane, Overextended recovery and frontal plate;
  a warning-length setting and hit-stop that slows the simulation instead of freezing it;
  damage to human-looking figures only from a deliberate aimed hit; lurkers (disguised elites
  with an aura, assimilation, an ambush or a stolen radio); the Matron's shelled front, brood
  sacs and three venom statuses.
- **Flying threats** (package 9): the Shrike roosts under the viaduct, circles and dives onto a
  growing ground shadow, then is grounded. Aim carries height in both cameras and hits are
  tested in three dimensions; low cover catches low shots.
- **Loot and the walk out** (package 4, `src/sim/pack.js`, `loot.js`, `profile.js`): found
  equipment is sealed until the Lab processes it; six worn slots kept on death with wear; a
  field pack that is a grid with footprints and weight; Insurance Drones that lift what fits
  their bay after a death; a street broker that pays raid Credits; hub sale, comparison without
  a single score, stash pages and Armory repair.
- **Doors and routes** (package 6, `src/sim/doors.js`, `route.js`, `containers.js`): closed,
  locked, jammed and dead doors; vehicle compartments, biscuit tins and baskets; route guidance
  to a chosen activity with ground chevrons (G cycles targets, X dismisses).
- **Class progression** (package 7, `src/sim/progress.js`): class experience kept on death, a
  four-branch tree per class whose M2 pairs are Barracks variants, and three trained aptitudes
  (Handling, Conditioning, Systems) converted once at deployment.
- **Height** (package 8, `src/sim/height.js`, `scenes.js`): a floor height per cell, 0.5 m
  steps, one-way drops with fall damage, terrain that blocks shots; the sunken quay and market
  street, a laundry court and the split-level Records Tower. `?heighttest` builds a test yard.
- **Growth in a raid**: XP shards and a choice of three run items per level; run items act only
  on a deliberate hit or change a direct stat for that raid.
- **Camera and HUD**: top-down or a pulled-back shoulder camera with a crosshair, arrows for
  off-screen threats that flash when the enemy winds up, health and class-resource strips (also
  shown beside the reticle), a wave readout, tooltips, and a character-sheet hub.
- **Settings**: Low to Ultra presets, render scale, draw distance, bloom, rain, camera shake,
  shadows, textures, depth of field, distortion and an FPS counter (pause menu or title screen).
- **Tutorial** and the **raid** clock, zones and contracts are as before.

The design notes are in [docs/designs](docs/designs/README.md); note 64 records which proposals
were built, with their starting numbers.

Third-party assets: the surface textures and sky are CC0 from Poly Haven; see
[assets/CREDITS.md](assets/CREDITS.md).

## Layout

```
index.html            page shell and HUD markup
src/main.js           boot, state machine, fixed-step loop
src/core/             math and seeded random streams
src/i18n/             locale selection, text formatting and Simplified Chinese catalogue
src/sim/              simulation: world, height, scenes, dress, doors, route, raid, horde, behave, skills,
                      boss, loot, pack, progress, profile, tutorial (runs in Node)
src/render/           WebGPU renderer, WGSL shaders, scene builder, texture and sign loading
assets/               CC0 textures and sky (Poly Haven)
src/ui/               input, HUD, minimap, hub screens, synthesised audio
test/                 node --test suite and the scripted bot
tools/serve.mjs       static dev server
tools/autoplay.js     dev aid that drives the real input layer
```

The simulation never imports the renderer or touches the DOM, so the same code runs in the
browser and in the tests.

## Development switches

Add to the URL: `?raid` (straight into a raid), `?tutorial`, `?hub`, `?debug` (frame stats),
`?class=blade`, `?clock=6` (clock speed), `?tp=250,388` (start position, in metres), `?god` (no lethal damage).

The profile is stored in `localStorage` under `mimicprotocol.profile.v1`.

## Not in this build

- Characters, vehicles and props are assembled from primitives, not sculpted or animated
  meshes. Surfaces are textured, but this is still the main gap to a shipped game's art.
- The other two bosses (The Reflection, The Herald), the soldier boss, and most of the event
  catalog of doc 20; the field jobs of note 34; the Matron's enclosed hall of note 45.
- Map families, crossings and the Descent Ward (notes 40, 42, 45): there is one district.
- Sector gates, Intel levels and the hub contract board of doc 21.
- The lockpick minigame, contamination as a separate step, Power Core transfer, a sidearm.
- Enemy navigation is a flow field around the operator, not a navmesh.
- Storage is `localStorage`.
- Balance has only been exercised by a scripted bot, not tuned by people playing.
- The horde director departs from the design documents, which describe a quieter stealth pace.
