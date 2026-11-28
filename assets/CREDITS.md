# Asset credits

The original JPG surface maps and sky panorama come from [Poly Haven](https://polyhaven.com) and are released under
**CC0 1.0 (public domain)**: https://polyhaven.com/license. Attribution is not required; it is
recorded here for provenance.

Downloaded 2026-11-24 using the Poly Haven public API (`https://api.polyhaven.com/files/<asset_id>`).
Each texture file's MD5 matched the checksum published by the API.

## Surface textures

The Poly Haven surface maps are the 1K JPG downloads, saved without modification (no resize, no re-encode).
`_col` = albedo/diffuse (sRGB), `_nrm` = normal map, **OpenGL convention** (Poly Haven `nor_gl`, +Y up),
`_rgh` = roughness (linear). No DirectX normal maps were used.

"Real-world size" is the physical area one tile covers, as stated by Poly Haven. Use it to set UV scale.

| File | Original asset (author) | Map | Source page | Direct download URL | License | Pixels | Real-world size |
|---|---|---|---|---|---|---|---|
| textures/asphalt_col.jpg | Asphalt 02 (Rob Tuytel) | Diffuse | https://polyhaven.com/a/asphalt_02 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_02/asphalt_02_diff_1k.jpg | CC0 | 1024x1024 | 3 m x 3 m |
| textures/asphalt_nrm.jpg | Asphalt 02 (Rob Tuytel) | Normal (OpenGL) | https://polyhaven.com/a/asphalt_02 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_02/asphalt_02_nor_gl_1k.jpg | CC0 | 1024x1024 | 3 m x 3 m |
| textures/asphalt_rgh.jpg | Asphalt 02 (Rob Tuytel) | Roughness | https://polyhaven.com/a/asphalt_02 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_02/asphalt_02_rough_1k.jpg | CC0 | 1024x1024 | 3 m x 3 m |
| textures/pavement_col.jpg | Large Square Pattern 01 (Rob Tuytel) | Diffuse | https://polyhaven.com/a/large_square_pattern_01 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/large_square_pattern_01/large_square_pattern_01_diff_1k.jpg | CC0 | 1024x1024 | 3 m x 3 m |
| textures/pavement_nrm.jpg | Large Square Pattern 01 (Rob Tuytel) | Normal (OpenGL) | https://polyhaven.com/a/large_square_pattern_01 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/large_square_pattern_01/large_square_pattern_01_nor_gl_1k.jpg | CC0 | 1024x1024 | 3 m x 3 m |
| textures/pavement_rgh.jpg | Large Square Pattern 01 (Rob Tuytel) | Roughness | https://polyhaven.com/a/large_square_pattern_01 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/large_square_pattern_01/large_square_pattern_01_rough_1k.jpg | CC0 | 1024x1024 | 3 m x 3 m |
| textures/brick_col.jpg | Red Brick 03 (Rob Tuytel) | Diffuse | https://polyhaven.com/a/red_brick_03 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/red_brick_03/red_brick_03_diff_1k.jpg | CC0 | 1024x1024 | 1 m x 1 m |
| textures/brick_nrm.jpg | Red Brick 03 (Rob Tuytel) | Normal (OpenGL) | https://polyhaven.com/a/red_brick_03 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/red_brick_03/red_brick_03_nor_gl_1k.jpg | CC0 | 1024x1024 | 1 m x 1 m |
| textures/brick_rgh.jpg | Red Brick 03 (Rob Tuytel) | Roughness | https://polyhaven.com/a/red_brick_03 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/red_brick_03/red_brick_03_rough_1k.jpg | CC0 | 1024x1024 | 1 m x 1 m |
| textures/plaster_col.jpg | Painted Plaster Wall (Amal Kumar) | Diffuse | https://polyhaven.com/a/painted_plaster_wall | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/painted_plaster_wall/painted_plaster_wall_diff_1k.jpg | CC0 | 1024x1024 | 2 m x 2 m |
| textures/plaster_nrm.jpg | Painted Plaster Wall (Amal Kumar) | Normal (OpenGL) | https://polyhaven.com/a/painted_plaster_wall | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/painted_plaster_wall/painted_plaster_wall_nor_gl_1k.jpg | CC0 | 1024x1024 | 2 m x 2 m |
| textures/plaster_rgh.jpg | Painted Plaster Wall (Amal Kumar) | Roughness | https://polyhaven.com/a/painted_plaster_wall | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/painted_plaster_wall/painted_plaster_wall_rough_1k.jpg | CC0 | 1024x1024 | 2 m x 2 m |
| textures/facade_col.jpg | Concrete Tile Facade (Charlotte Baglioni) | Diffuse | https://polyhaven.com/a/concrete_tile_facade | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_tile_facade/concrete_tile_facade_diff_1k.jpg | CC0 | 1024x1024 | 2.09 m x 2.09 m |
| textures/facade_nrm.jpg | Concrete Tile Facade (Charlotte Baglioni) | Normal (OpenGL) | https://polyhaven.com/a/concrete_tile_facade | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_tile_facade/concrete_tile_facade_nor_gl_1k.jpg | CC0 | 1024x1024 | 2.09 m x 2.09 m |
| textures/facade_rgh.jpg | Concrete Tile Facade (Charlotte Baglioni) | Roughness | https://polyhaven.com/a/concrete_tile_facade | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_tile_facade/concrete_tile_facade_rough_1k.jpg | CC0 | 1024x1024 | 2.09 m x 2.09 m |
| textures/metal_col.jpg | Painted Metal Shutter (Dario Barresi, Rico Cilliers, Charlotte Baglioni) | Diffuse | https://polyhaven.com/a/painted_metal_shutter | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/painted_metal_shutter/painted_metal_shutter_diff_1k.jpg | CC0 | 1024x1024 | 2 m x 2 m |
| textures/metal_nrm.jpg | Painted Metal Shutter (Dario Barresi, Rico Cilliers, Charlotte Baglioni) | Normal (OpenGL) | https://polyhaven.com/a/painted_metal_shutter | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/painted_metal_shutter/painted_metal_shutter_nor_gl_1k.jpg | CC0 | 1024x1024 | 2 m x 2 m |
| textures/metal_rgh.jpg | Painted Metal Shutter (Dario Barresi, Rico Cilliers, Charlotte Baglioni) | Roughness | https://polyhaven.com/a/painted_metal_shutter | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/painted_metal_shutter/painted_metal_shutter_rough_1k.jpg | CC0 | 1024x1024 | 2 m x 2 m |
| textures/cobble_col.jpg | Cobblestone Floor 08 (Rob Tuytel) | Diffuse | https://polyhaven.com/a/cobblestone_floor_08 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/cobblestone_floor_08/cobblestone_floor_08_diff_1k.jpg | CC0 | 1024x1024 | 2 m x 2 m |
| textures/cobble_nrm.jpg | Cobblestone Floor 08 (Rob Tuytel) | Normal (OpenGL) | https://polyhaven.com/a/cobblestone_floor_08 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/cobblestone_floor_08/cobblestone_floor_08_nor_gl_1k.jpg | CC0 | 1024x1024 | 2 m x 2 m |
| textures/cobble_rgh.jpg | Cobblestone Floor 08 (Rob Tuytel) | Roughness | https://polyhaven.com/a/cobblestone_floor_08 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/cobblestone_floor_08/cobblestone_floor_08_rough_1k.jpg | CC0 | 1024x1024 | 2 m x 2 m |

## District surface scans (Poly Haven, 2026-11-27)

These repeating WebP pairs are adapted from CC0 1.0 sources. The diffuse map is resized and graded around neutral grey for multiplication with the mesh tint. Each companion retains the source OpenGL normal XY in RG and source roughness in B, resized, edge-matched and quantized to four-code steps. The companion channels are not inferred from the colour. Source JPGs were verified against the Poly Haven API MD5s. Direct links are in diffuse / normal / roughness order.

| Files under `textures/` | Original asset (author) | Source page | Direct download URLs | License | Shipped pixels | Use |
|---|---|---|---|---|---|---|
| `quay-stone-{color,nr}.webp` | Seaworn Stone Tiles (Dimitrios Savva) | https://polyhaven.com/a/seaworn_stone_tiles | [diff](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/seaworn_stone_tiles/seaworn_stone_tiles_diff_1k.jpg) / [GL](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/seaworn_stone_tiles/seaworn_stone_tiles_nor_gl_1k.jpg) / [rough](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/seaworn_stone_tiles/seaworn_stone_tiles_rough_1k.jpg) | CC0 | 512 square | Coarse Old Town walks and quay facing |
| `arcade-slate-{color,nr}.webp` | Slate Floor (Dimitrios Savva) | https://polyhaven.com/a/slate_floor | [diff](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/slate_floor/slate_floor_diff_1k.jpg) / [GL](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/slate_floor/slate_floor_nor_gl_1k.jpg) / [rough](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/slate_floor/slate_floor_rough_1k.jpg) | CC0 | 512 square | Dark Neon Strip arcade paving |
| `court-pavers-{color,nr}.webp` | Herringbone Concrete Tile (Charlotte Baglioni) | https://polyhaven.com/a/herringbone_concrete_tile | [diff](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/herringbone_concrete_tile/herringbone_concrete_tile_diff_1k.jpg) / [GL](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/herringbone_concrete_tile/herringbone_concrete_tile_nor_gl_1k.jpg) / [rough](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/herringbone_concrete_tile/herringbone_concrete_tile_rough_1k.jpg) | CC0 | 512 square | Residential courtyard walks |
| `lobby-terrazzo-{color,nr}.webp` | Terrazzo Tiles (Amal Kumar) | https://polyhaven.com/a/terrazzo_tiles | [diff](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/terrazzo_tiles/terrazzo_tiles_diff_1k.jpg) / [GL](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/terrazzo_tiles/terrazzo_tiles_nor_gl_1k.jpg) / [rough](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/terrazzo_tiles/terrazzo_tiles_rough_1k.jpg) | CC0 | 512 square | Corporate plaza and lobby floors |
| `apron-{color,nr}.webp` | Hangar Concrete Floor (Dimitrios Savva) | https://polyhaven.com/a/hangar_concrete_floor | [diff](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/hangar_concrete_floor/hangar_concrete_floor_diff_1k.jpg) / [GL](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/hangar_concrete_floor/hangar_concrete_floor_nor_gl_1k.jpg) / [rough](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/hangar_concrete_floor/hangar_concrete_floor_rough_1k.jpg) | CC0 | 512 square | Dock yards, loading floors and rail deck |
| `ribbed-cladding-{color,nr}.webp` | Rectangular Facade Tiles (Charlotte Baglioni) | https://polyhaven.com/a/rectangular_facade_tiles | [diff](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rectangular_facade_tiles/rectangular_facade_tiles_diff_1k.jpg) / [GL](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rectangular_facade_tiles/rectangular_facade_tiles_nor_gl_1k.jpg) / [rough](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rectangular_facade_tiles/rectangular_facade_tiles_rough_1k.jpg) | CC0 | 512 square | Arcology tower cladding |
| `checkerplate-{color,nr}.webp` | Metal Plate (Rob Tuytel) | https://polyhaven.com/a/metal_plate | [diff](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/metal_plate/metal_plate_diff_1k.jpg) / [GL](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/metal_plate/metal_plate_nor_gl_1k.jpg) / [rough](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/metal_plate/metal_plate_rough_1k.jpg) | CC0 | 256 square | Grating, gangways and industrial tread |
| `street-bark-{color,nr}.webp` | Japanese Zelkova Bark (Charlotte Baglioni) | https://polyhaven.com/a/japanese_zelkova_bark | [diff](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/japanese_zelkova_bark/japanese_zelkova_bark_diff_1k.jpg) / [GL](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/japanese_zelkova_bark/japanese_zelkova_bark_nor_gl_1k.jpg) / [rough](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/japanese_zelkova_bark/japanese_zelkova_bark_rough_1k.jpg) | CC0 | 256 square | Courtyard and avenue tree trunks |
| `planting-soil-{color,nr}.webp` | Farm Soil (Amal Kumar) | https://polyhaven.com/a/farm_soil | [diff](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/farm_soil/farm_soil_diff_1k.jpg) / [GL](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/farm_soil/farm_soil_nor_gl_1k.jpg) / [rough](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/farm_soil/farm_soil_rough_1k.jpg) | CC0 | 256 square | Planted ground and planter tops |
| `wheel-rubber-{color,nr}.webp` | Rubber Tiles (Amal Kumar) | https://polyhaven.com/a/rubber_tiles | [diff](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rubber_tiles/rubber_tiles_diff_1k.jpg) / [GL](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rubber_tiles/rubber_tiles_nor_gl_1k.jpg) / [rough](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rubber_tiles/rubber_tiles_rough_1k.jpg) | CC0 | 256 square | Parked vehicle wheels and other static rubber |
| `plant-steel-{color,nr}.webp` | Metal Plate 02 (Rob Tuytel) | https://polyhaven.com/a/metal_plate_02 | [diff](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/metal_plate_02/metal_plate_02_diff_1k.jpg) / [GL](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/metal_plate_02/metal_plate_02_nor_gl_1k.jpg) / [rough](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/metal_plate_02/metal_plate_02_rough_1k.jpg) | CC0 | 256 square | Rail, bollards, pipework and dressed metal |

## Sky panorama

| File | Original asset (author) | Source page | Direct download URL | License | Pixels |
|---|---|---|---|---|---|
| sky/night.jpg | Kloppenheim 07 (Pure Sky) (Greg Zaal, Jarod Guest), tonemapped JPG | https://polyhaven.com/a/kloppenheim_07_puresky | https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/kloppenheim_07_puresky.jpg | CC0 | 4096x2048 (downscaled from 8192x4096) |

Notes on the sky:
- Equirectangular, overcast night sky with a warm glow along the horizon. The "Pure Sky" variant has the
  ground replaced by a smooth gradient, so there are no ground objects.
- The original tonemapped JPG (8192x4096, 21.1 MB, MD5 matched) was resized with macOS `sips` to
  4096x2048 and re-encoded as JPEG quality 85.
- Poly Haven auto-exposes its tonemapped JPGs, so this file looks brighter than a real night sky (closer to
  dusk). Darken it in the shader to sit under a night scene.

## Meridian art (AI-generated, 2026-11-26)

The following assets were generated for DarkSignal with `gpt-image-2` via Niuma. They are separate from the CC0 downloads above.

| Shipped path | Contents and processing |
|---|---|
| `ui/kits.webp` | 16 class skills, 4 × 4 cells. Luminance masks cropped from an opaque generated sheet. The HUD supplies the live class ink and recessed plate. |
| `ui/signals.webp` | Scan Pulse and 15 terminal/status pictograms, 4 × 4 cells. The same silhouettes serve DOM and canvas. |
| `ui/items.webp` | 24 named run items and Medkit, cropped from three opaque product sheets and packed into 5 × 5 cells. |
| `textures/meridian/{weave,ceramic,chitin,membrane}-{color,nr}.webp` | Operator fabric, armour, shell and soft Mimic tissue. |
| `textures/meridian/{enamel,freight,rainbed,shutter}-{color,nr}.webp` | Painted vehicle panels, stencilled cargo, reflective asphalt and shuttered storefronts. |

Surface pairs are 256 × 256 repeating tiles. Colour maps modulate the mesh tint around neutral grey. The companion maps are **derived**, not measured: RG stores the signed slopes of periodic luminance as normal XY, and B stores material-specific roughness adjusted by luminance. Edges were blended before deriving maps, then checked again after encoding. Original PNG sheets and prompt receipts are kept in the handoff, outside the game payload.

## Meridian vehicle and canopy glass (AI-generated, 2026-11-27)

`textures/meridian/cab-glass-{color,nr}.webp` is a 256 × 256 repeating pair for vehicle glazing and covered arcades. A single opaque `gpt-image-2` pane generated via Niuma supplies a neutral tint multiplier. Normal XY and roughness are **derived**, using periodic luminance slopes and drop contrast respectively. This pair is separate from the CC0 scans. The prompt and original PNG are in the scene-texture handoff.

## Interface icons drawn for this project

`ui/gear.svg` is an original vector sheet drawn by hand for this project (worn slots, field pack, insurance drones, aptitudes, key, descent line, repair, sealed parcel). It derives from no other work and needs no attribution.
