# Rendering and Visual Style

Status: Draft v0.1. Updated: 2026-11-25. Requirements: R-02, R-13.

[Back to index](README.md) | Previous: [10 Procedural Generation](10-procedural-generation.md) | Next: [12 UI and HUD](12-ui-and-hud.md)

## 1. Visual target (R-02)

A realistic, dense, rain-wet future city at night. Reference: Ghostwire: Tokyo, used only for rendering qualities: signage-packed streets, saturated emissive color against a dark ambient, strong bloom, reflective wet surfaces and layered depth haze. No asset, map, creature or character from any reference may be used.

## 2. Look pillars

1. Dark ambient, bright accents: the scene is mostly low light, and emissive surfaces carry the color.
2. Wet everything: roads, plazas and walls are glossy, so every light has a reflection.
3. Color contrast: cool teal and blue shadows against magenta, amber and cyan emissives.
4. Depth haze: fog layers separate foreground, midground and skyline.
5. Readability first: see section 6.

## 3. Render pipeline

The stack is three.js (the StormBound package.json lists three ^0.180.0), targeting WebGL2 with a WebGPU path where it is stable. Pass order (Proposal):

1. Shadow maps for the key light and a few important dynamic lights.
2. Opaque PBR pass into an HDR target with depth.
3. Reflection pass: screen-space reflections (SSR), with cube probes and planar reflections for large plazas as fallbacks.
4. Emissive and additive glow sprites.
5. Volumetric and height fog.
6. Bloom with a downsample and upsample mip chain, a threshold and a soft knee.
7. Lens layer: rain droplets, subtle chromatic aberration and vignette.
8. Tone mapping (ACES or AgX, to be compared) and a color grading LUT.
9. UI.

StormBound already has research on depth sampling, 4x MSAA, material SSR, local distortion, lens raindrops and water-mirror recovery (docs 71, 71-4-1, 71-4-6). Those pages are references to read and verify before reuse; none of it is assumed to work in this project.

## 4. Lighting strategy

- Most neon is faked: emissive geometry, additive glow sprites and a baked probe grid created at generation time (S8 in [10](10-procedural-generation.md)).
- Real dynamic lights are scarce and budgeted per quality tier, plus the operator light and muzzle flashes.
- Wet roads reflect emissives, and a cheap streak decal under bright signs sells the reflection even where SSR fails.
- Interior cells have their own small light budget, so entering a building never spikes the cost.

## 5. Materials

| Material | Notes |
| --- | --- |
| Wet asphalt | Low roughness in puddle masks, procedural noise for variation |
| Concrete and plaster | Grime and streak decals |
| Glass | Reflective with a fake interior-light card behind it |
| Painted and brushed metal | Rust streaks, strong specular |
| Neon tube | Emissive intensity 5 to 40 in HDR units, flicker curve |
| Holo panel | Additive, scanline, slight chromatic split |
| Rubber and fabric | High roughness, absorbs light |

Wetness is driven by a procedural puddle mask plus a global rain intensity value shared with gameplay (electric puddles in [09](09-world-structure-and-buildings.md)).

## 6. Readability rules

Bloom is useful but dangerous: it can hide enemies and loot. Rules:

| Element | Color language (Proposal) | Rule |
| --- | --- | --- |
| Revealed Mimics | Magenta and red | Pulsing outline visible through walls during a scan |
| Loot | Cyan, gold for high rarity | Subtle beam or sparkle; no full-screen bloom |
| Hosts | Sickly green-violet | Faint glow, visible mainly while scanned |
| Extraction | Green | Beacon visible from far away; clear ground ring |
| Player damage | Red edge and the direction ring | Short, capped flash |

Gameplay-critical emissives have a bloom cap. Hit flashes and muzzle flashes have a per-frame intensity limit. Settings: bloom strength slider, reduce flashing, high contrast outlines, color-blind palettes.

## 7. Weather and the Pulse

- Rain: particle sheets, ground splashes, wind variation and lens droplets, scaled by a quality tier.
- Distant lightning is rare and subtle.
- Lantern Pulse: sky flare, low-frequency rumble, a brief grade shift to red-violet, and a short bloom boost. It must be recognizable but must not blind the player.

## 8. Quality tiers (Proposal)

| Tier | Resolution scale | SSR | Volumetrics | Bloom | Real lights | Rain lens |
| --- | --- | --- | --- | --- | --- | --- |
| Low | 0.75 | Off, probes only | Off | Half-resolution | 0 plus operator | Off |
| Medium | 1.0 | Half-resolution | Height fog only | Full chain, 4 mips | 4 | Simple |
| High | 1.0 | Full-resolution | On | Full chain, 6 mips | 8 | Full |
| Ultra | 1.0 or more | Full plus planar plazas | High quality | Full chain | 12 | Full |

Automatic quality adjustment is planned, using the lessons of StormBound docs 79-8 and 79-13: reduce reflections and mirrors first, keep the user's frame-rate cap, and remember the result per device.

## 9. Performance targets (Proposal)

| Target | Value |
| --- | --- |
| Desktop High | 60 FPS on a mid-range GPU |
| Desktop Low | 60 FPS on integrated graphics |
| Frame time budget | 16.6 ms, of which post-processing is at most 5 ms on High |
| GPU memory | Under 1.5 GB on High |

## 10. Acceptance

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 11-A-01 | Review screenshots of 6 districts at night on High | Bloom, reflections and emissives match the look pillars; reviewed by hand | Not yet implemented |
| 11-A-02 | Scan Pulse in a bright neon street | Mimic outlines remain distinguishable from signage | Not yet implemented |
| 11-A-03 | Switch each tier in a dense scene | Frame time targets hold or auto-quality steps down | Not yet implemented |
| 11-A-04 | Trigger a Pulse with reduce flashing on | No flash above the configured limit | Not yet implemented |
