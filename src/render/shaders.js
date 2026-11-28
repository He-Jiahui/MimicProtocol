// WGSL shaders (doc 11: dark ambient, bright emissive accents, wet reflective
// ground, depth haze, bloom), with material maps layered over procedural geometry.
import { STYLE, SUB, SURF } from '../sim/emit.js';
import { DETAIL_MATERIALS, SCENE_MATERIALS } from './assets.js';
const detail = Object.fromEntries(DETAIL_MATERIALS.map((name, i) => [name, i * 2]));

const district = Object.fromEntries(SCENE_MATERIALS.map((name, i) => [name, i * 2]));

export const MAX_LIGHTS = 40;
export const MAX_BLOBS = 32;
export const GLOBALS_FLOATS = 80 + MAX_LIGHTS * 8 + MAX_BLOBS * 4;
export const GLOBALS_SIZE = GLOBALS_FLOATS * 4;
// Float offsets into the globals block, shared with the scene builder.
export const GO = { viewProj: 0, lightVP: 16, camPos: 32, camRight: 36, camUp: 40, camFwd: 44, focus: 48, fog: 52, ambient: 56, world: 60, misc: 64, scan: 68, lightDir: 72, lightCol: 76, lights: 80, blobs: 80 + MAX_LIGHTS * 8 };

const globals = /* wgsl */`
struct Light { pos: vec4f, col: vec4f }
struct Globals {
  viewProj: mat4x4f,
  lightVP: mat4x4f,
  camPos: vec4f,    // xyz, time
  camRight: vec4f,  // xyz, tan(half fov x)
  camUp: vec4f,     // xyz, tan(half fov y)
  camFwd: vec4f,
  focus: vec4f,     // player xyz, cut-away radius
  fogColor: vec4f,  // rgb, density
  ambient: vec4f,   // rgb, night level
  world: vec4f,     // size, block count, annex flag, wetness
  misc: vec4f,      // light count, blob count, lantern glow, unused
  scan: vec4f,      // origin x, origin z, radius, intensity
  lightDir: vec4f,  // direction to the key light, shadow strength
  lightCol: vec4f,  // key light colour
  lights: array<Light, ${MAX_LIGHTS}>,
  blobs: array<vec4f, ${MAX_BLOBS}>,
}
@group(0) @binding(0) var<uniform> G: Globals;
`;

const common = globals + /* wgsl */`
@group(0) @binding(1) var zoneTex: texture_2d<f32>;
@group(0) @binding(2) var surfTex: texture_2d<f32>;
@group(0) @binding(3) var shadowTex: texture_depth_2d;
@group(0) @binding(4) var shadowSmp: sampler_comparison;
@group(0) @binding(5) var texCol: texture_2d_array<f32>;   // surface colour, 7 layers
@group(0) @binding(6) var texNrm: texture_2d_array<f32>;   // normal xy + roughness
@group(0) @binding(7) var texSmp: sampler;
@group(0) @binding(8) var skyTex: texture_2d<f32>;         // equirectangular night sky
@group(0) @binding(9) var signTex: texture_2d<f32>;        // generated sign atlas

@group(0) @binding(10) var detailTex: texture_2d_array<f32>;
@group(0) @binding(12) var coverTex: texture_2d<f32>;      // rain shelter: amount, height of the lowest cover
@group(0) @binding(13) var floorTex: texture_2d<f32>;      // floor + 64 in 0.25 m units, height mark (doc 64 Package 8)

// Floor height (m) and height mark of the cell under p.
fn floorCell(p: vec2f) -> vec2f {
  let s = i32(G.world.x);
  let t = textureLoad(floorTex, clamp(vec2i(floor(p)), vec2i(0), vec2i(s - 1)), 0);
  return vec2f((round(t.r * 255.0) - 64.0) * 0.25, round(t.g * 255.0));
}

const PI = 3.14159265;

@group(0) @binding(11) var sceneTex: texture_2d_array<f32>;

fn districtAt(p: vec2f) -> i32 {
  let b = clamp(vec2i(floor(p * G.world.y / G.world.x)), vec2i(0), vec2i(i32(G.world.y) - 1));
  return i32(textureLoad(zoneTex, b, 0).g * 255.0 + 0.5);
}
fn hasSceneMaps() -> bool { return G.misc.w > 0.5 && textureDimensions(sceneTex, 0).x > 1u; }
// RGB is a multiplier for the mesh tint. The second layer is OpenGL normal XY and roughness.
struct SceneMaps { ink: vec3f, xy: vec2f, rough: f32 }
fn sceneMaps(uv: vec2f, layer: i32, tile: f32, dist: f32) -> SceneMaps {
  let lod = log2(max(1.0, dist * G.camFwd.w * f32(textureDimensions(sceneTex, 0).x) / tile)) + 0.4;
  let ink = textureSampleLevel(sceneTex, texSmp, uv / tile, layer, lod).rgb * 2.0;
  let nr = textureSampleLevel(sceneTex, texSmp, uv / tile, layer + 1, lod).rgb;
  return SceneMaps(ink, nr.xy * 2.0 - 1.0, nr.z);
}
// Old stone lanes, dark arcade slate, residential herringbone, polished plaza, freight concrete.
fn districtFloor(region: i32) -> i32 {
  let floors = array<i32, 5>(${district['quay-stone']}, ${district['arcade-slate']}, ${district['court-pavers']}, ${district['lobby-terrazzo']}, ${district.apron});
  return floors[region];
}

// Distance from the camera, stored in the HDR alpha channel for depth of field.
fn depthA(wpos: vec3f) -> f32 { return clamp(distance(wpos, G.camPos.xyz) / 400.0, 0.0, 1.0); }

// Surface textures. Layers: 0 asphalt, 1 pavement, 2 brick, 3 plaster, 4 facade, 5 metal, 6 cobble.
// The mip level comes from distance, so sampling is legal inside branches.
fn tileSize(layer: i32) -> f32 {
  var t = array<f32, 7>(3.0, 3.0, 1.0, 2.0, 2.09, 2.0, 2.0);
  return t[layer];
}
fn texLod(wpos: vec3f, tile: f32) -> f32 {
  let d = distance(wpos, G.camPos.xyz);
  return clamp(log2(max(d * G.camFwd.w * 1024.0 / tile, 1.0)) + 0.4, 0.0, 9.0);
}
fn matCol(uv: vec2f, layer: i32, wpos: vec3f) -> vec3f {
  let ts = tileSize(layer);
  return textureSampleLevel(texCol, texSmp, uv / ts, layer, texLod(wpos, ts)).rgb;
}
fn matNR(uv: vec2f, layer: i32, wpos: vec3f) -> vec3f {
  let ts = tileSize(layer);
  let t = textureSampleLevel(texNrm, texSmp, uv / ts, layer, texLod(wpos, ts)).rgb;
  return vec3f(t.xy * 2.0 - 1.0, t.z);
}
// Compact detail array: colour is authored around neutral 0.5 (multiplicative),
// followed by signed normal XY and linear roughness. Each layer wraps independently.
fn detailSample(uv: vec2f, tile: f32, layer: i32, dist: f32) -> vec3f {
  let lod = log2(max(1.0, dist * G.camFwd.w * 256.0 / tile)) + 0.4;
  return textureSampleLevel(detailTex, texSmp, uv / tile, layer, lod).rgb;
}
fn skyDir(dir: vec3f, lod: f32) -> vec3f {
  let uv = vec2f(atan2(dir.z, dir.x) * 0.15915494 + 0.5, acos(clamp(dir.y, -1.0, 1.0)) * 0.31830989);
  return textureSampleLevel(skyTex, texSmp, uv, lod).rgb;
}
// The sky as the scene sees it: the panorama graded down to night.
fn nightSky(dir: vec3f, lod: f32) -> vec3f {
  let nl = G.ambient.a;
  return skyDir(dir, lod) * mix(vec3f(0.34, 0.3, 0.42), vec3f(0.07, 0.085, 0.14), nl);
}

fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1, 0)), u.x), mix(hash21(i + vec2f(0, 1)), hash21(i + vec2f(1, 1)), u.x), u.y);
}
fn fbm(p: vec2f) -> f32 {
  return vnoise(p) * 0.55 + vnoise(p * 2.13 + 7.1) * 0.3 + vnoise(p * 4.7 + 3.3) * 0.15;
}
fn neon(i: f32) -> vec3f {
  var pal = array<vec3f, 8>(
    vec3f(1.0, 0.15, 0.6), vec3f(0.1, 0.9, 1.0), vec3f(1.0, 0.65, 0.1), vec3f(0.55, 0.3, 1.0),
    vec3f(0.2, 1.0, 0.55), vec3f(1.0, 0.25, 0.2), vec3f(0.3, 0.5, 1.0), vec3f(1.0, 0.9, 0.5));
  return pal[u32(i) % 8u];
}
fn zoneColor(z: f32) -> vec3f {
  var pal = array<vec3f, 5>(
    vec3f(0.45, 0.75, 1.0), vec3f(0.3, 0.95, 0.5), vec3f(1.0, 0.9, 0.25), vec3f(1.0, 0.55, 0.15), vec3f(1.0, 0.2, 0.25));
  return pal[u32(clamp(z, 0.0, 4.0))];
}
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715)))); }
// The ground itself is never cut away, but a terrace or quay edge between the tactical camera
// and the operator would hide them completely. True where raised ground should be thinned
// with a screen-door dither inside a small window round the line of sight to their chest:
// they stay visible through it and the ground still reads as ground.
fn groundSeeThrough(wpos: vec3f, px: vec2f) -> bool {
  if (G.focus.w < 3.0 || wpos.y < G.focus.y + 1.2) { return false; }
  let rd = normalize(wpos - G.camPos.xyz);
  if (rd.y > -0.03) { return false; }
  let g = wpos + rd * ((G.focus.y + 1.0 - wpos.y) / rd.y);
  let k = 1.0 - smoothstep(0.7, 1.3, distance(g.xz, G.focus.xz));
  return ign(px) < 0.7 * k;
}
// Integer hash for which shopfronts are open, mirrored exactly in impacts.js so a round
// finds the same glass or shutter the facade shows (float hashes round differently on
// the CPU).
fn shopHash(cell: vec2f, seed: f32, side: f32) -> f32 {
  var h = u32(i32(cell.x)) * 747796405u + u32(i32(cell.y)) * 2891336453u + u32(seed * 64.0) * 277803737u + u32(round(side) + 8.0) * 1442695041u;
  h = (h ^ (h >> 16u)) * 2246822519u;
  h = h ^ (h >> 13u);
  return f32(h >> 8u) / 16777216.0;
}

// Key light visibility from the shadow map (2x2 PCF).
fn shadow(wpos: vec3f, n: vec3f) -> f32 {
  let lp = G.lightVP * vec4f(wpos + n * 0.12, 1.0);
  let uv = lp.xy * vec2f(0.5, -0.5) + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 || lp.z > 1.0) { return 1.0; }
  let ts = 1.0 / 2048.0;
  let d = lp.z - 0.0016;
  var s = textureSampleCompareLevel(shadowTex, shadowSmp, uv + vec2f(-ts, -ts) * 0.6, d);
  s += textureSampleCompareLevel(shadowTex, shadowSmp, uv + vec2f(ts, -ts) * 0.6, d);
  s += textureSampleCompareLevel(shadowTex, shadowSmp, uv + vec2f(-ts, ts) * 0.6, d);
  s += textureSampleCompareLevel(shadowTex, shadowSmp, uv + vec2f(ts, ts) * 0.6, d);
  // The Lantern is a wide light seen through rain haze: a caster close to the receiver
  // (a kerb, a crate, the foot of a wall) shadows it fully, but one more than about 5 m
  // up the light (a roofline, a lamp post's head, a wire) throws a faint, wide shadow.
  // Two wider taps against a depth 5 m nearer the light find only those far casters.
  let far = d - 0.012;
  let f = (textureSampleCompareLevel(shadowTex, shadowSmp, uv + vec2f(-ts, ts) * 2.5, far)
    + textureSampleCompareLevel(shadowTex, shadowSmp, uv + vec2f(ts, -ts) * 2.5, far)) * 0.5;
  let vis = 1.0 - max(f - s * 0.25, 0.0) - 0.4 * (1.0 - f);
  return mix(1.0, vis, G.lightDir.w);
}

// Shelter from the rain at a point: 0 in the open, 1 under an awning, a canopy, the
// viaduct or an upper floor, and only below the lowest cover over it (doc 43).
fn shelter(p: vec2f, y: f32) -> f32 {
  let c = textureSampleLevel(coverTex, texSmp, p / G.world.x, 0.0);
  let top = c.g * 25.5;
  return c.r * (1.0 - smoothstep(top - 0.1, top + 0.3, y));
}

// Microfacet specular for one light: GGX distribution, Smith-Schlick visibility and
// Schlick Fresnel, times N.L. Diffuse in this renderer is albedo * N.L (the light
// colours carry the 1/pi), so the lobe is scaled by pi to stay in the same units.
fn ggx(n: vec3f, V: vec3f, L: vec3f, a: f32, f0: vec3f) -> vec3f {
  let H = normalize(L + V);
  let nl = max(dot(n, L), 0.0);
  let nv = max(dot(n, V), 0.03);
  let nh = max(dot(n, H), 0.0);
  let a2 = a * a;
  let dn = nh * nh * (a2 - 1.0) + 1.0;
  let k = a * 0.5;
  let vis = 0.25 / ((nl * (1.0 - k) + k) * (nv * (1.0 - k) + k));
  let F = f0 + (1.0 - f0) * pow(1.0 - max(dot(V, H), 0.0), 5.0);
  return F * (a2 / (dn * dn) * vis * nl);
}

// Ambient, the shadowed key light, the nearest point lights and the sky reflection.
// rough is perceptual roughness, f0 the reflectance at normal incidence; envK scales
// the sky reflection (sheltered and enclosed surfaces see less of the sky).
fn lighting(wpos: vec3f, n: vec3f, albedo: vec3f, rough: f32, f0: vec3f, envK: f32) -> vec3f {
  return lightingK(wpos, n, albedo, rough, f0, envK, 0.0);
}
// As lighting(), with a second, broad specular lobe of weight haze. Rain-beaten water is
// not a flat film: drops, rings and the aggregate under it tilt it every way, so wet
// paving keeps a sharp lobe and spreads part of each lamp into a wide, soft pool. The
// two lobes share the energy (a convex mix), so nothing is added that the light lacks.
fn lightingK(wpos: vec3f, n: vec3f, albedo: vec3f, rough: f32, f0: vec3f, envK: f32, haze: f32) -> vec3f {
  let V = normalize(G.camPos.xyz - wpos);
  let nv = max(dot(n, V), 0.0);
  // Ambient Fresnel: rough surfaces never reach a full mirror at grazing angles. What
  // is reflected is not also diffused.
  let Fa = f0 + (max(vec3f(1.0 - rough), f0) - f0) * pow(1.0 - nv, 5.0);
  let kd = albedo * (1.0 - Fa);
  // Hemisphere ambient: cool sky above, dimmer bounce below.
  var col = kd * G.ambient.rgb * mix(vec3f(0.5, 0.46, 0.44), vec3f(1.0), n.y * 0.5 + 0.5);
  // Lamps and the Lantern are not points: a floor on the lobe width keeps highlights
  // from collapsing to single aliased pixels.
  let a = max(rough * rough, 0.012);
  let aH = max(a, 0.3);
  let L0 = G.lightDir.xyz;
  let nl0 = max(dot(n, L0), 0.0);
  if (nl0 > 0.0) {
    let sh = shadow(wpos, n);
    // The Lantern is already a wide source, so less of it goes into the haze; the
    // street lamps' pools should stand out against its sheen.
    var sp = ggx(n, V, L0, a, f0);
    if (haze > 0.0) { sp = mix(sp, ggx(n, V, L0, aH, f0), haze * 0.5); }
    col += G.lightCol.rgb * sh * (kd * nl0 + sp);
  }
  let count = u32(G.misc.x);
  for (var i = 0u; i < count; i++) {
    let l = G.lights[i];
    let Lv = l.pos.xyz - wpos;
    let d = length(Lv);
    if (d < l.pos.w) {
      let L = Lv / d;
      var att = 1.0 - d / l.pos.w;
      att = att * att;
      // A lamp has size, and rain keeps shaking the water: its image in a puddle is a
      // soft disc, not a point. Widen the lobe by the angle a lamp of about 0.6 m
      // subtends and scale it down to keep its energy.
      let aL = min(a + 0.3 / d, 1.0);
      var sp = ggx(n, V, L, aL, f0) * (a * a / (aL * aL));
      if (haze > 0.0) { sp = mix(sp, ggx(n, V, L, aH, f0), haze); }
      col += l.col.rgb * l.col.a * att * (kd * max(dot(n, L), 0.0) + sp);
    }
  }
  // Sky reflection: the graded panorama blurred by roughness through the mip chain. The
  // directional lobe loses some energy as it widens; below the horizon it sees the
  // dark street instead of the sky.
  let R = reflect(-V, n);
  var sky = G.fogColor.rgb;
  if (G.misc.w > 0.5) { sky = nightSky(R, 1.0 + rough * 6.0) * 1.6; }
  col += sky * Fa * (1.0 - 0.5 * rough) * mix(0.12, 1.0, smoothstep(-0.25, 0.15, R.y)) * envK;
  return col;
}
// The second colour target (the "surface" buffer) tells the screen-space passes what each
// pixel is: its normal (octahedral, y as the pole), its roughness and how strongly it
// mirrors its surroundings. That last weight is exactly the factor lightingK() put on the
// sky reflection, so a pass that finds something nearer than the sky along the mirror
// direction can swap the one for the other without adding energy.
struct FOut { @location(0) color: vec4f, @location(1) surf: vec4f }
fn octEnc(n: vec3f) -> vec2f {
  let m = n.xzy;
  var p = m.xy / (abs(m.x) + abs(m.y) + abs(m.z));
  if (m.z < 0.0) { p = (1.0 - abs(p.yx)) * vec2f(select(-1.0, 1.0, p.x >= 0.0), select(-1.0, 1.0, p.y >= 0.0)); }
  return p * 0.5 + 0.5;
}
fn mirrorK(wpos: vec3f, n: vec3f, rough: f32, f0: vec3f, envK: f32) -> f32 {
  let nv = max(dot(n, normalize(G.camPos.xyz - wpos)), 0.0);
  let Fa = f0 + (max(vec3f(1.0 - rough), f0) - f0) * pow(1.0 - nv, 5.0);
  return dot(Fa, vec3f(0.2126, 0.7152, 0.0722)) * (1.0 - 0.5 * rough) * envK;
}
// A lit surface, and one that only glows (a sign, a screen): rough, mirroring nothing.
fn surfOut(wpos: vec3f, n: vec3f, rough: f32, f0: vec3f, envK: f32) -> vec4f { return vec4f(octEnc(n), rough, sqrt(clamp(mirrorK(wpos, n, rough, f0, envK), 0.0, 1.0))); }
fn glowOut(col: vec3f, wpos: vec3f, n: vec3f) -> FOut { return FOut(vec4f(applyFog(col, wpos), depthA(wpos)), vec4f(octEnc(n), 1.0, 0.0)); }
// Rain on a surface: water fills the pores of stone, cloth and wood and darkens them;
// on anything it leaves a smooth film (doc 43: wet where the rain reaches).
fn wetRough(rough: f32, wet: f32) -> f32 { return mix(rough, min(rough, 0.16), wet); }
fn wetAlbedo(albedo: vec3f, wet: f32, porous: f32) -> vec3f { return albedo * (1.0 - 0.45 * wet * porous); }
fn applyFog(col: vec3f, wpos: vec3f) -> vec3f {
  // The near field stays crisp; haze builds up beyond it (doc 11: layered depth haze).
  let d = max(distance(wpos, G.camPos.xyz) - 22.0, 0.0);
  let h = exp(-max(wpos.y, 0.0) * 0.006);
  let f = 1.0 - exp(-d * G.fogColor.a * h);
  return mix(col, G.fogColor.rgb, clamp(f, 0.0, 1.0));
}
`;

// Instance layout shared by the lit pass, the x-ray pass and the shadow pass.
const instanceVs = /* wgsl */`
struct Inst {
  @location(2) i0: vec4f,  // position, material id (+16 = static cut-away)
  @location(3) i1: vec4f,  // scale, emissive
  @location(4) i2: vec4f,  // rotation quaternion
  @location(5) i3: vec4f,  // colour, unused
  @location(6) i4: vec4f,  // material parameters
}
fn qrot(q: vec4f, v: vec3f) -> vec3f { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
`;

// ---- Instanced primitives: buildings, props, characters ----
export const boxShader = common + instanceVs + /* wgsl */`
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wpos: vec3f,
  @location(1) nrm: vec3f,
  @location(2) @interpolate(flat) color: vec4f,
  @location(3) @interpolate(flat) params: vec4f,
  @location(4) @interpolate(flat) matf: f32,
  @location(5) lpos: vec3f,
  @location(6) @interpolate(flat) emis: f32,
  @location(7) @interpolate(flat) size: vec3f,
  @location(8) @interpolate(flat) rotation: vec4f,
}
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, inst: Inst) -> VOut {
  var lp = p * inst.i1.xyz;
  // Tapered limbs: bit 32 of the material id scales the cross-section along local Y.
  if ((u32(inst.i0.w + 0.5) & 32u) != 0u) { let k = mix(inst.i4.z, inst.i4.w, p.y + 0.5); lp.x *= k; lp.z *= k; }
  let wp = qrot(inst.i2, lp) + inst.i0.xyz;
  var o: VOut;
  o.pos = G.viewProj * vec4f(wp, 1.0);
  o.wpos = wp;
  // Normals of non-uniformly scaled shapes need the inverse scale.
  o.nrm = qrot(inst.i2, n / max(inst.i1.xyz, vec3f(0.0001)));
  o.color = inst.i3;
  o.params = inst.i4;
  o.matf = inst.i0.w;
  o.lpos = lp;
  o.emis = inst.i1.w;
  o.size = inst.i1.xyz;
  o.rotation = inst.i2;
  return o;
}

// Procedural sign glyphs: a grid of cells, each with a few random strokes.
fn glyphs(uv: vec2f, seed: f32) -> f32 {
  let cell = floor(uv);
  let f = fract(uv);
  let g = floor(f * 5.0);
  let m = step(0.12, f.x) * step(f.x, 0.88) * step(0.1, f.y) * step(f.y, 0.9);
  let h = hash21(cell * 7.3 + g * 1.7 + seed * 13.1);
  let row = step(0.55, hash21(vec2f(cell.x * 3.1 + g.y, cell.y + seed)));
  let colm = step(0.6, hash21(vec2f(cell.y * 5.7 + g.x, cell.x + seed * 2.0)));
  return m * max(step(0.62, h), max(row * step(0.3, h), colm * step(0.35, h)));
}

@fragment fn fs(in: VOut) -> FOut {
  let mi = u32(in.matf + 0.5);
  let mat = mi & 15u;
  var n = normalize(in.nrm);
  let time = G.camPos.w;

  // Camera cut-away: static geometry that hides the ground around the operator is
  // dithered out above waist height (doc 04: buildings between camera and operator).
  // Heights are taken from the operator's floor (focus.y), so it follows them up a stair;
  // the ground itself (bit 64: terraces, stairs, retaining walls) is never cut.
  // Small lamps a storey up (lanterns over a market walk, lamp heads) stay lit: they hide
  // nothing and the street reads dark without them.
  let lamp = mat == 2u && max(in.size.x, max(in.size.y, in.size.z)) < 0.6 && in.wpos.y < G.focus.y + 6.0;
  if ((mi & 80u) == 16u && !lamp && in.wpos.y > G.focus.y + 2.6 && G.focus.w > 0.0) {
    let rd = normalize(in.wpos - G.camPos.xyz);
    if (rd.y < -0.03) {
      let t = (G.focus.y + 1.0 - in.wpos.y) / rd.y;
      let g = in.wpos + rd * t;
      let d = distance(g.xz, G.focus.xz);
      if (d < G.focus.w * (0.8 + 0.2 * ign(in.pos.xy))) { discard; }
    }
  }
  if ((mi & 64u) != 0u && groundSeeThrough(in.wpos, in.pos.xy)) { discard; }

  var albedo = in.color.rgb;
  var emissive = vec3f(0.0);
  // Surface response: perceptual roughness, reflectance at normal incidence, how
  // metallic it is, and how much rain darkens it (porous stone, cloth and wood).
  var rough = 0.7;
  var f0 = 0.04;
  var metal = 0.0;
  var porous = 0.6;
  var runoff = 0.0;    // water running down a wall from a sill or ledge
  let dist = distance(in.wpos, G.camPos.xyz);

  let isStatic = (mi & 16u) != 0u;
  var sceneLayer = -1;
  var surface = -1;
  var meters = 2.0;
  if (mat == 1u) {
    // Building facade: textured walls, framed windows with sills, and a room behind each
    // pane that shifts with the view angle, so the glass has depth.
    let grime = fbm(vec2f(in.wpos.x + in.wpos.z, in.wpos.y * 0.35) * 0.35 + in.params.x);
    if (n.y > 0.5) {
      // Roof: gravel with tar seams.
      let seam = min(step(0.97, fract(in.wpos.x / 3.0)) + step(0.97, fract(in.wpos.z / 3.0)), 1.0);
      albedo *= (0.42 + 0.25 * grime + 0.14 * vnoise(in.wpos.xz * 7.0)) * (1.0 - 0.3 * seam);
      rough = 0.78 - 0.2 * seam; porous = 0.8;
    } else if (n.y < -0.5) {
      albedo *= 0.3;
      rough = 0.9;
    } else {
      let alongX = abs(n.x) <= 0.5;
      let u = select(in.wpos.z, in.wpos.x, alongX);
      let v = in.wpos.y;
      let T = select(vec3f(0.0, 0.0, 1.0), vec3f(1.0, 0.0, 0.0), alongX);
      let cw = max(in.params.z, 1.0);
      let ch = 3.3;
      let cell = vec2f(floor(u / cw), floor(v / ch));
      let f = vec2f(fract(u / cw), fract(v / ch));
      let side = abs(n.x) * 17.0 + n.z * 5.0 + n.x * 3.0;
      let h1 = hash21(cell + vec2f(in.params.x * 1.31 + side, in.params.x * 0.77));
      let h2 = hash21(cell * 1.7 + vec2f(in.params.x + 11.0, side));
      let style = fract(in.params.x * 0.37);
      let accent = neon(in.params.w);
      let Vw = normalize(G.camPos.xyz - in.wpos);
      let vn = max(dot(Vw, n), 0.14);
      let into = -vec2f(dot(Vw, T), Vw.y) / vn;      // where the view ray travels behind the glass
      let detail = 1.0 - smoothstep(160.0, 420.0, dist);
      let texOn = G.misc.w > 0.5;
      // Window shape varies per building: ribbon glazing, punched windows or tall bays.
      var w0 = vec2f(0.14, 0.24); var w1 = vec2f(0.86, 0.8);
      if (style < 0.33) { w0 = vec2f(0.03, 0.3); w1 = vec2f(0.97, 0.78); }
      else if (style > 0.7) { w0 = vec2f(0.24, 0.14); w1 = vec2f(0.76, 0.9); }
      var shop = 0.0;      // lit panel (fascia) rather than glass
      var e = vec3f(0.0);
      var w = 0.0;
      var frame = 0.0;
      var sill = 0.0;
      let top = step(in.size.y * 0.5 - 0.75, in.lpos.y);   // parapet band at the top of the mass
      let litFrac = clamp(in.params.y * (0.7 + 0.6 * G.ambient.a), 0.0, 0.9);
      if (v < ch) {
        // Ground floor: a shop window with stock on shelves, or a shutter, under a lettered fascia.
        let open = step(0.35, shopHash(cell, in.params.x, side));
        let s0 = vec2f(0.05, 0.08); let s1 = vec2f(0.95, 0.72);
        let sf = (f - s0) / (s1 - s0);
        let inWin = step(0.0, sf.x) * step(sf.x, 1.0) * step(0.0, sf.y) * step(sf.y, 1.0);
        let edge = min(min(sf.x, 1.0 - sf.x) * (s1.x - s0.x) * cw, min(sf.y, 1.0 - sf.y) * (s1.y - s0.y) * ch);
        frame = inWin * (1.0 - step(0.08, edge));
        let ri = sf + into * 0.5;
        let back = step(0.0, ri.x) * step(ri.x, 1.0) * step(0.0, ri.y) * step(ri.y, 1.0);
        // Shelves: rows of coloured stock on the back wall.
        let sc = floor(ri * vec2f(16.0, 5.0));
        let stock = mix(vec3f(0.6, 0.55, 0.48), neon(floor(hash21(sc + cell * 3.7) * 8.0)), 0.45) * step(0.3, fract(ri.y * 5.0)) * step(0.18, fract(ri.x * 16.0)) * step(0.3, hash21(sc * 1.3 + cell));
        let shopLight = mix(accent, vec3f(1.0, 0.9, 0.78), 0.6);
        e = (shopLight * mix(0.14, 0.3, back) + stock * back * 0.34) * open;
        w = inWin * (1.0 - frame);
        if (open < 0.5 && texOn) { e = vec3f(0.0); w = 0.0; frame = 0.0; albedo = detailSample(vec2f(u, -v), 2.5, ${detail.shutter}, dist) * 0.38 * inWin + albedo * (1.0 - inWin); shop = inWin * 0.5; }
        if (f.y > 0.76 && f.y < 0.96) {
          // Fascia: each shop gets its own board from the sign atlas.
          let bw = cw * 2.0;
          let bi = floor(hash21(vec2f(floor(u / bw), in.params.x + side)) * 64.0);
          // Lettering reads left to right from the street, whichever way the wall faces.
          let mirror = (alongX && n.z < 0.0) || (!alongX && n.x > 0.0);
          let fu = select(fract(u / bw), 1.0 - fract(u / bw), mirror);
          let buv = (vec2f(bi % 4.0, floor(bi / 4.0)) + vec2f(fu, 1.0 - (f.y - 0.76) / 0.2)) * vec2f(0.25, 0.03125);
          let tx = textureSampleLevel(signTex, texSmp, buv, clamp(log2(max(dist * 0.03, 1.0)), 0.0, 6.0)).r;
          let ink = select(glyphs(vec2f(u * 0.9, f.y * 4.0), in.params.x), tx, texOn);
          e = accent * (0.18 + 1.5 * ink) * (0.35 + 0.65 * open);
          w = 1.0; shop = 1.0; frame = 0.0;
        }
      } else if (top < 0.5) {
        let wf = (f - w0) / (w1 - w0);
        let inWin = step(0.0, wf.x) * step(wf.x, 1.0) * step(0.0, wf.y) * step(wf.y, 1.0);
        let edge = min(min(wf.x, 1.0 - wf.x) * (w1.x - w0.x) * cw, min(wf.y, 1.0 - wf.y) * (w1.y - w0.y) * ch);
        frame = inWin * (1.0 - step(0.07, edge));
        sill = step(w0.y - 0.04, f.y) * step(f.y, w0.y) * step(w0.x - 0.03, f.x) * step(f.x, w1.x + 0.03);
        let lit = step(1.0 - litFrac, h1);
        var wc = mix(vec3f(1.0, 0.74, 0.42), vec3f(0.55, 0.78, 1.0), step(0.55, h2));
        wc = mix(wc, accent, step(0.9, h2));
        // The room: back wall with furniture shapes and a ceiling lamp, darker side walls.
        let ri = wf + into * 0.42;
        let back = step(0.0, ri.x) * step(ri.x, 1.0) * step(0.0, ri.y) * step(ri.y, 1.0);
        let furn = 1.0 - 0.6 * step(ri.y, 0.2 + 0.28 * hash21(cell * 3.1 + floor(ri.x * 3.0)));
        let lamp = 1.0 + 1.6 * exp(-dot(ri - vec2f(0.5, 0.92), ri - vec2f(0.5, 0.92)) * 16.0);
        var room = wc * mix(0.28, 0.72 * furn * lamp, back);
        // A blind pulled part way down, and a mullion.
        let blind = step(1.0 - 0.55 * h2 * step(0.4, h1), wf.y);
        room = mix(room, wc * 0.5, blind) * step(0.03, abs(wf.x - 0.5));
        e = room * lit * (0.45 + 1.0 * h2);
        // Dark panes mirror the sky: that comes from the glass roughness and Fresnel below.
        w = inWin * (1.0 - frame);
        // Rain gathers on each sill and runs down the wall beneath it in uneven streaks.
        let under = step(w0.x - 0.02, f.x) * step(f.x, w1.x + 0.02) * step(f.y, w0.y - 0.04);
        let trail = smoothstep(0.45, 0.75, vnoise(vec2f(u * 4.3 + cell.x * 7.0, v * 0.35)));
        runoff = under * trail * (1.0 - smoothstep(0.0, w0.y * 0.9, w0.y - f.y));
      }
      // Wall surface: brick, plaster or facade panels, chosen per building.
      var wl = 2 + i32(fract(in.params.x * 0.618) * 3.0);
      var wallN = vec2f(0.0);
      if (texOn) {
        // Anchor a whole facade to its block, including skybridges spanning a boundary.
        let region = districtAt((in.wpos - qrot(in.rotation, in.lpos)).xz);
        if (region == ${STYLE.OLDTOWN} && wl == 4) { wl = 2; }
        if (region == ${STYLE.DOCK} && wl == 4) { wl = 5; }
        if (region == ${STYLE.NEON} && v < ch && wl == 2) { wl = 3; }
        if (region == ${STYLE.CORPORATE} && wl == 2) { wl = 4; }
        if (shop == 0.5) {
          let shutter = detailSample(vec2f(u, -v), 2.5, ${detail.shutter + 1}, dist);
          wallN = (shutter.xy * 2.0 - 1.0) * vec2f(1.0, -1.0);
          rough = clamp(shutter.z, 0.25, 0.8); metal = 0.6; porous = 0.0;
        } else if (region == ${STYLE.ARCOLOGY} && hasSceneMaps() && w == 0.0) {
          let tile = sceneMaps(vec2f(u, -v), ${district['ribbed-cladding']}, 2.0, dist);
          albedo *= tile.ink; wallN = tile.xy; rough = clamp(tile.rough, 0.2, 0.9); metal = 0.5; porous = 0.0;
        } else if (wl == 4 && v >= ch && f.y < 0.22 && w == 0.0) {
          // Enamel service panels between glazed floors on metal-clad buildings.
          albedo *= detailSample(vec2f(u, -v), 2.0, ${detail.enamel}, dist) * 2.0;
          let nr = detailSample(vec2f(u, -v), 2.0, ${detail.enamel + 1}, dist);
          wallN = (nr.xy * 2.0 - 1.0) * vec2f(1.0, -1.0);
          rough = clamp(nr.z, 0.18, 0.7); f0 = 0.05; porous = 0.0;
        } else {
          albedo *= matCol(vec2f(u, v), wl, in.wpos) * 3.4;
          let nr = matNR(vec2f(u, v), wl, in.wpos);
          wallN = nr.xy; rough = mix(0.5, 0.95, nr.z);
          porous = select(0.9, 0.35, wl == 4);
        }
      } else { rough = 0.8; }
      // Floor slabs, a parapet band, streaks under the sills and general grime.
      let slab = 1.0 - step(0.06, f.y);
      albedo = albedo * (0.75 + 0.5 * grime) * (1.0 + 0.5 * slab) * (1.0 + 0.35 * top);
      albedo *= 1.0 - 0.3 * step(w0.y - 0.3, f.y) * step(f.y, w0.y - 0.04) * step(w0.x, f.x) * step(f.x, w1.x) * step(0.5, hash21(cell + 2.0)) * step(ch, v);
      albedo = mix(albedo, vec3f(0.34, 0.34, 0.35) * (0.6 + 0.4 * grime), sill * detail);
      albedo = mix(albedo, mix(vec3f(0.035, 0.037, 0.042), vec3f(0.3, 0.3, 0.31), step(0.6, style)), frame * detail);
      let avg = mix(vec3f(1.0, 0.74, 0.42), vec3f(0.55, 0.78, 1.0), 0.45) * litFrac * 0.3;
      emissive = mix(avg * step(ch, v), e * w, detail) * in.emis;
      albedo = mix(albedo, vec3f(0.014, 0.018, 0.026), w * detail * (1.0 - step(0.9, shop)));
      n = normalize(n + (T * wallN.x + vec3f(0.0, 1.0, 0.0) * wallN.y) * 0.7 * (1.0 - w));
      // Glass is smooth and dielectric; window frames are painted metal.
      let glass = w * detail * (1.0 - step(0.9, shop));
      rough = mix(mix(rough, 0.35, frame * detail), 0.05, glass);
      metal = max(metal, 0.5 * frame * detail) * (1.0 - glass);
      porous *= 1.0 - w;
      runoff *= 1.0 - w;
    }
  } else if (mat == 2u) {
    // Neon tube / light strip. p0 flicker seed, p1 = 2 blinks (aircraft warning light).
    var fl = 1.0;
    let ph = in.params.x * 40.0;
    fl = 0.86 + 0.14 * sin(time * 9.0 + ph) * step(0.82, fract(ph * 0.37));
    fl *= mix(1.0, 0.25, step(0.985, hash21(vec2f(floor(time * 14.0), ph))));
    if (in.params.y > 1.5) { fl = step(0.7, fract(time * 0.6 + ph)); }
    return glowOut(in.color.rgb * in.emis * fl, in.wpos, n);
  } else if (mat == 3u) {
    // Holo panel: scanlines and a slow shimmer.
    let scan = 0.55 + 0.45 * sin(in.wpos.y * 9.0 - time * 3.0);
    let sweep = 0.7 + 0.3 * sin(time * 0.7 + in.params.x * 30.0 + (in.wpos.x + in.wpos.z) * 0.4);
    let blocky = step(0.35, hash21(floor(vec2f(in.wpos.x + in.wpos.z, in.wpos.y) * 0.8) + floor(time * 0.5 + in.params.x * 9.0)));
    return glowOut(in.color.rgb * in.emis * scan * sweep * (0.35 + 0.65 * blocky), in.wpos, n);
  } else if (mat == 4u || mat == 8u) {
    surface = select(${detail.membrane}, ${detail.chitin}, mat == 8u); meters = 0.9;
    // Mimic biomass: wet, lumpy flesh with pulsing veins and a translucent rim.
    let q = in.lpos.xy * 3.1 + in.lpos.z * 2.3 + in.params.x * 31.0;
    let lump = vnoise(q * 2.6);
    let vein = smoothstep(0.5, 0.6, vnoise(q * 1.7)) * (1.0 - smoothstep(0.6, 0.72, vnoise(q * 1.7)));
    let pulse = 0.55 + 0.45 * sin(time * 3.2 + in.params.x * 20.0 + in.wpos.y * 2.0);
    // Bumpy normal from the noise gradient.
    let e2 = vec2f(0.03, 0.0);
    let gx = vnoise((q + e2.xy) * 2.6) - lump;
    let gy = vnoise((q + e2.yx) * 2.6) - lump;
    n = normalize(n + vec3f(gx, gy, gx - gy) * 5.0);
    let Vo = normalize(G.camPos.xyz - in.wpos);
    let fres = pow(1.0 - max(dot(n, Vo), 0.0), 2.2);
    albedo = in.color.rgb * (0.07 + 0.2 * lump);
    emissive = in.color.rgb * in.emis * (0.05 + vein * pulse * 2.6 + fres * 0.35);
    // Membrane is slick with fluid; chitin is harder and a little duller.
    rough = select(0.3, 0.4, mat == 8u); f0 = 0.035; porous = 0.0;
  } else if (mat == 5u) {
    // Sign: lettering or a pictogram from the generated atlas. p1: 0 board, 1 blade, 2 pictogram.
    let wide = in.size.x >= in.size.z;
    var su = select(in.lpos.z / in.size.z, in.lpos.x / in.size.x, wide) + 0.5;
    // Keep the text readable from both sides.
    if ((wide && in.lpos.z < 0.0) || (!wide && in.lpos.x > 0.0)) { su = 1.0 - su; }
    let sv = 0.5 - in.lpos.y / in.size.y;
    let hsh = fract(in.params.x * 7.31 + 0.13);
    var auv: vec2f;
    if (in.params.y > 1.5) { let c = floor(hsh * 64.0); auv = (vec2f(c % 16.0, floor(c / 16.0)) + vec2f(su, sv)) * vec2f(0.0625, 0.0625) + vec2f(0.0, 0.75); }
    else if (in.params.y > 0.5) { let c = floor(hsh * 32.0); auv = vec2f((c + su) / 32.0, 0.5 + sv * 0.25); }
    else { let c = floor(hsh * 64.0); auv = (vec2f(c % 4.0, floor(c / 4.0)) + vec2f(su, sv)) * vec2f(0.25, 0.03125); }
    let tx = textureSampleLevel(signTex, texSmp, auv, clamp(log2(max(dist * 0.035, 1.0)), 0.0, 6.0));
    var fl = 0.92 + 0.08 * sin(time * 7.0 + in.params.x * 40.0);
    fl *= mix(1.0, 0.3, step(0.992, hash21(vec2f(floor(time * 12.0), in.params.x * 31.0))));
    // The lit faces are the two broad ones, whichever way the board has been turned.
    let front = step(0.495, select(abs(in.lpos.x) / in.size.x, abs(in.lpos.z) / in.size.z, wide));
    var lit: vec3f;
    if (in.params.y > 1.5) { lit = tx.rgb * in.emis * 0.55; }
    else if (G.misc.w > 0.5) { lit = in.color.rgb * in.emis * (0.07 + tx.r * 1.1); }
    else { let gl = glyphs(vec2f(su * 6.0, sv * 2.0) + in.params.x * 9.0, in.params.x); lit = in.color.rgb * in.emis * (0.1 + gl); }
    return glowOut(lit * fl * front + in.color.rgb * 0.01, in.wpos, n);
  } else if (mat == 6u) {
    // Foliage: mottled and soft.
    let m = vnoise(in.lpos.xz * 6.0 + in.lpos.y * 5.0 + in.params.x * 9.0);
    albedo = in.color.rgb * (0.6 + 0.8 * m);
    n = normalize(n + (vec3f(m, vnoise(in.lpos.zy * 7.0), vnoise(in.lpos.xy * 7.0)) - 0.5) * 0.9);
    rough = 0.62; f0 = 0.03; porous = 0.3;
  } else if (mat == 7u || mat == 9u || mat == 10u) {
    if (mat == 7u && isStatic && in.params.x == 1.0) { sceneLayer = ${district['cab-glass']}; meters = 0.75; }
    if (mat == 9u) { surface = ${detail.enamel}; }
    if (mat == 10u) { surface = ${detail.freight}; meters = 1.3; }
    // Clear-coated paint and glass (vehicles, machines), enamel, and weathered freight
    // steel. The sky reflection comes from their Fresnel in lighting().
    rough = select(select(0.12, 0.24, mat == 9u), 0.42, mat == 10u);
    f0 = 0.05; porous = 0.0;
    if (mat == 10u) { metal = 0.3; }
    emissive = in.color.rgb * in.emis;
  } else {
    // Plain lit surface. The emissive value is a flat boost (hit flashes).
    emissive = in.color.rgb * in.emis;
    let px = in.params.x;
    if (px == ${SUB.BARK}.0) { sceneLayer = ${district['street-bark']}; meters = 0.9; }
    else if (px == ${SUB.QUAY}.0) { sceneLayer = ${district['quay-stone']}; }
    else if (px == ${SUB.APRON}.0) { sceneLayer = ${district.apron}; }
    else if (px == ${SUB.PLANTER}.0 && n.y > 0.5) {
      sceneLayer = ${district['planting-soil']}; meters = 0.7;
      albedo = vec3f(0.07, 0.051, 0.033); rough = 0.95; porous = 1.0;
    } else if ((px > 0.5 && px < 1.5) || px == ${SUB.PLANTER}.0) {
      // Wall: plaster with stains.
      albedo *= 0.75 + 0.5 * fbm(vec2f(in.wpos.x + in.wpos.z, in.wpos.y) * 0.7);
      if (G.misc.w > 0.5 && abs(n.y) < 0.5) { albedo *= matCol(vec2f(in.wpos.x + in.wpos.z, in.wpos.y), 3, in.wpos) * 3.0; }
      rough = 0.86; porous = 1.0;
    } else if (px > 1.5 && px < 2.5) {
      if (isStatic && G.world.z < 0.5 && hasSceneMaps()) {
        sceneLayer = districtFloor(districtAt((in.wpos - qrot(in.rotation, in.lpos)).xz));
        rough = 0.35; porous = 0.3;
      } else {
        // Interior floor tiles.
        let t = fract(in.wpos.xz * 0.5);
        let joint = 1.0 - step(0.04, t.x) * step(0.04, t.y);
        albedo *= 0.75 + 0.25 * (1.0 - joint);
        rough = mix(0.24, 0.8, joint); porous = joint;
      }
    } else if (px > 3.5 && px < 4.5 && n.y > 0.5) {
      // Cut-away cap of a solid building: diagonal hatch so it reads as "not enterable".
      let hx = fract((in.wpos.x + in.wpos.z) / 1.6);
      albedo *= 0.6 + 0.9 * step(0.82, hx);
      rough = 0.9; porous = 0.0;
    } else if (px > 4.5 && px < 5.5) {
      surface = ${detail.weave}; meters = 0.55;
      // Fabric: weave, soft folds and a sheen at grazing angles.
      let wv = vnoise(in.lpos.xy * 42.0 + in.lpos.z * 23.0);
      let folds = sin(in.lpos.y * 24.0 + vnoise(in.lpos.xz * 9.0) * 5.0);
      albedo *= (0.84 + 0.26 * wv) * (0.93 + 0.07 * folds);
      let V = normalize(G.camPos.xyz - in.wpos);
      let rim = pow(1.0 - max(dot(n, V), 0.0), 2.5);
      emissive += albedo * rim * (0.14 + G.ambient.rgb * 1.2);
      rough = 0.92; f0 = 0.03; porous = 1.0;
    } else if (px > 5.5 && px < 6.5) {
      if (isStatic && hasSceneMaps()) {
        sceneLayer = ${district['plant-steel']}; meters = 1.3;
        rough = 0.45; metal = 0.7; porous = 0.0;
      } else {
        surface = ${detail.ceramic}; meters = 0.8;
        // Armour: panel seams, scuffed edges, hard highlights.
        let seam = min(step(0.955, fract(in.lpos.y * 7.0)) + step(0.965, fract(in.lpos.x * 9.0 + in.lpos.z * 9.0)), 1.0);
        let scuff = step(0.78, vnoise(in.lpos.xy * 34.0 + in.lpos.z * 19.0));
        albedo = albedo * (1.0 - 0.5 * seam) + vec3f(0.05) * scuff;
        let V = normalize(G.camPos.xyz - in.wpos);
        let rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        emissive += vec3f(0.25, 0.4, 0.5) * rim * 0.3;
        // Painted plate and machined steel: scuffs are bare metal, seams collect grime.
        rough = mix(0.36, 0.6, seam); metal = 0.45 + 0.4 * scuff; porous = 0.0;
      }
    } else if (px > 6.5 && px < 7.5) {
      // Skin: light scatters under the surface, so shadows stay warm.
      let V = normalize(G.camPos.xyz - in.wpos);
      let rim = pow(1.0 - max(dot(n, V), 0.0), 2.0);
      emissive += albedo * vec3f(0.34, 0.12, 0.08) * 0.45 + albedo * rim * 0.4;
      rough = 0.5; f0 = 0.028; porous = 0.2;
    } else if (px > 7.5 && px < 8.5) {
      // Hair: strands along the scalp with a soft highlight band.
      let st = vnoise(vec2f((in.lpos.x + in.lpos.z) * 70.0, in.lpos.y * 5.0));
      albedo *= 0.65 + 0.7 * st;
      rough = 0.42; f0 = 0.046; porous = 0.5;
    } else if (px > 9.5 && px < 10.5) {
      // Corrugated steel: shipping containers and warehouse sheds.
      let cu = select(in.wpos.z, in.wpos.x, abs(n.x) <= 0.5);
      if (abs(n.y) < 0.5) {
        albedo *= 0.75 + 0.35 * sin(cu * 22.0);
        surface = ${detail.freight}; meters = 3.0;
        albedo *= 0.7 + 0.5 * fbm(vec2f(cu, in.wpos.y) * 0.6 + in.params.y * 9.0);
      } else { albedo *= 0.6; }
      rough = 0.46; metal = 0.5; porous = 0.0;
    } else if (px > 11.5 && px < 12.5) {
      // Fired roof tiles laid in courses.
      let course = fract(in.wpos.y * 3.2);
      let joint = step(0.9, fract((in.wpos.x + in.wpos.z) * 2.6 + floor(in.wpos.y * 3.2) * 0.5));
      albedo *= (0.65 + 0.5 * course) * (1.0 - 0.35 * joint) * (0.85 + 0.3 * vnoise(in.wpos.xz * 3.0));
      rough = 0.55; porous = 0.6;
    } else if (px > 12.5 && px < 13.5) {
      // Timber: boards with a grain.
      let cu = select(in.wpos.z, in.wpos.x, abs(n.x) <= 0.5);
      albedo *= (0.75 + 0.4 * vnoise(vec2f(cu * 1.5, in.wpos.y * 26.0))) * (1.0 - 0.3 * step(0.94, fract(cu * 1.6)));
      rough = 0.76; porous = 0.9;
    } else if (px > 10.5 && px < 11.5) {
      // Open metalwork cut out of a slab: p1 0 railing, 1 ladder, 2 chain-link, 3 grating.
      let wideX = in.size.x >= in.size.z;
      let u = select(in.lpos.z, in.lpos.x, wideX);
      let hu = select(in.size.z, in.size.x, wideX) * 0.5;
      let v = in.lpos.y;
      let hv = in.size.y * 0.5;
      let kind = in.params.y;
      if (kind > 2.5) { sceneLayer = ${district.checkerplate}; meters = 0.5; }
      var keep = 0.0;
      if (kind > 2.5) {
        let q = select(in.lpos.xz, in.lpos.xy, in.size.y > in.size.z);
        keep = max(step(fract(q.x * 7.0), 0.3), step(fract(q.y * 2.0), 0.12));
      } else if (kind > 1.5) {
        keep = max(step(fract((u + v) * 4.5), 0.09), step(fract((u - v) * 4.5), 0.09));
        keep = max(keep, max(step(hv - 0.06, abs(v)), step(fract(u / 2.6 + 0.5), 0.025)));
        keep = max(keep, step(hu - 0.05, abs(u)));
      } else if (kind > 0.5) {
        keep = max(step(fract(v * 3.3), 0.13), step(hu - 0.05, abs(u)));
      } else {
        keep = max(step(fract(u * 6.5), 0.14), max(step(hv - 0.07, v), step(v, -hv + 0.05)));
        keep = max(keep, step(hu - 0.05, abs(u)));
      }
      if (keep < 0.5 && dist < 150.0) { discard; }
      albedo *= mix(1.0, 0.55, step(150.0, dist));
      rough = 0.42; metal = 0.6; porous = 0.0;
    } else if (px > 13.5 && px < 14.5) {
      // Hazard paint: black chevrons over the base colour, chipped.
      let d = fract((in.lpos.x + in.lpos.z + in.lpos.y) * 1.8);
      albedo = mix(vec3f(0.02), albedo, step(0.5, d)) * (0.7 + 0.5 * vnoise(in.wpos.xz * 2.0 + in.wpos.y * 3.0));
      rough = 0.5; porous = 0.2;
    } else if (px > 8.5 && px < 9.5) {
      if (isStatic) { sceneLayer = ${district['wheel-rubber']}; meters = 0.7; }
      // Rubber and leather: matte with a dull sheen.
      albedo *= 0.85 + 0.2 * vnoise(in.lpos.xy * 26.0);
      rough = 0.62; porous = 0.1;
    }
  }

  // Object-space box projection keeps panels fixed to turning vehicles and posed limbs.
  let useScene = sceneLayer >= 0 && hasSceneMaps();
  if ((surface >= 0 || useScene) && G.misc.w > 0.5) {
    let local = abs(qrot(vec4f(-in.rotation.xyz, in.rotation.w), normalize(in.nrm)));
    let alongX = local.x >= local.z && local.x >= local.y;
    let top = local.y > local.x && local.y > local.z;
    let U = select(vec3f(1,0,0), vec3f(0,0,1), alongX);
    let V = select(vec3f(0,-1,0), vec3f(0,0,1), top);
    let uv = vec2f(dot(U, in.lpos), dot(V, in.lpos));
    var ink: vec3f;
    var normalXY: vec2f;
    var detailRough: f32;
    if (useScene) {
      let tile = sceneMaps(uv, sceneLayer, meters, dist);
      ink = tile.ink; normalXY = tile.xy * vec2f(1.0, -1.0); detailRough = tile.rough;
    } else {
      ink = detailSample(uv, meters, surface, dist) * 2.0;
      let nr = detailSample(uv, meters, surface + 1, dist);
      normalXY = nr.xy * 2.0 - 1.0; detailRough = nr.z;
    }
    // Enamel is paint on a body or a locker: its panel map should hint at seams, not turn
    // a van into armour plate.
    let dk = select(1.0, 0.35, mat == 9u && !useScene);
    albedo *= mix(vec3f(1.0), ink, dk);
    // Existing biomass pulses remain visible through the shell and membrane detail.
    if (mat == 4u || mat == 8u) { emissive *= clamp(dot(ink, vec3f(0.25, 0.5, 0.25)), 0.68, 1.18); }
    let slope = qrot(in.rotation, U * normalXY.x + V * normalXY.y);
    n = normalize(n + (slope - n * dot(n, slope)) * 0.45 * dk);
    // The detail roughness map breaks up the lobe: worn paint, polished edges.
    rough = clamp(rough * (0.6 + 0.8 * detailRough), 0.04, 1.0);
  }

  // Soft contact darkening at the base of static geometry.
  // Heights above the ground the fragment stands on (the floor in front of a face), so a
  // terrace's props and a pit's walls darken at their own foot (doc 64 Package 8).
  let gy = floorCell(in.wpos.xz + n.xz * 0.35).x;
  let ao = mix(0.5, 1.0, smoothstep(gy, gy + 2.4, in.wpos.y));
  // Characters darken toward their feet and pick up a back rim from the key light.
  let charAo = mix(0.7, 1.0, smoothstep(gy, gy + 0.5, in.wpos.y));
  if (!isStatic && (mat == 0u || mat == 4u || mat == 8u)) {
    let Vr = normalize(G.camPos.xyz - in.wpos);
    let back = pow(1.0 - max(dot(n, Vr), 0.0), 3.0) * clamp(dot(n, G.lightDir.xyz) * 0.5 + 0.5, 0.0, 1.0);
    emissive += G.lightCol.rgb * back * 0.7;
  }
  // Rain (doc 43): what faces the sky is wet unless something overhangs it; walls are
  // wet where water runs off a sill, streaks down the face or splashes up from the
  // pavement. Sheltered and enclosed surfaces stay dry and see less of the sky.
  var envK = 1.0;
  if (G.world.w > 0.0) {
    let cover = shelter(in.wpos.xz + n.xz * 0.35, in.wpos.y);
    let open = (1.0 - cover) * G.world.w;
    var wet = open * smoothstep(0.2, 0.75, n.y);
    if (isStatic && abs(n.y) < 0.5) {
      let along = select(in.wpos.z, in.wpos.x, abs(n.x) <= 0.5);
      let streak = smoothstep(0.58, 0.82, vnoise(vec2f(along * 3.1, in.wpos.y * 0.09 + in.params.x * 3.0)));
      let splash = 1.0 - smoothstep(gy + 0.05, gy + 0.5, in.wpos.y);
      wet = open * max(max(runoff, streak * 0.75), splash);
    } else if (!isStatic) {
      // People and creatures out in it are damp all over, but cloth, skin and membrane shed
      // water rather than pooling it: never a mirror, even lying flat under a lamp.
      wet = open * mix(0.3, 0.5, smoothstep(0.2, 0.75, n.y));
    }
    albedo = wetAlbedo(albedo, wet, porous);
    rough = wetRough(rough, wet);
    envK = 1.0 - 0.6 * cover;
  }
  let F0 = mix(vec3f(f0), min(albedo * 2.2 + 0.05, vec3f(1.0)), metal);
  var col = lighting(in.wpos, n, albedo * (1.0 - metal), rough, F0, envK) * select(charAo, ao, isStatic) + emissive;
  if (G.scan.w > 0.0) {
    let sd = abs(distance(in.wpos.xz, G.scan.xy) - G.scan.z);
    col += vec3f(1.0, 0.2, 0.75) * exp(-sd * sd * 0.6) * G.scan.w * 0.6;
  }
  return FOut(vec4f(applyFog(col, in.wpos), depthA(in.wpos)), surfOut(in.wpos, n, rough, F0, envK));
}

// X-ray overlay used for scanned Mimics: visible through walls (doc 11, readability).
@fragment fn fsXray(in: VOut) -> @location(0) vec4f {
  let n = normalize(in.nrm);
  let V = normalize(G.camPos.xyz - in.wpos);
  let rim = pow(1.0 - abs(dot(n, V)), 1.5);
  let pulse = 0.65 + 0.35 * sin(G.camPos.w * 7.0);
  return vec4f(in.color.rgb * in.emis * (0.2 + rim * 0.9) * pulse, 1.0);
}
`;

// Depth-only pass from the key light.
export const shadowShader = globals + instanceVs + /* wgsl */`
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, inst: Inst) -> @builtin(position) vec4f {
  var lp = p * inst.i1.xyz;
  if ((u32(inst.i0.w + 0.5) & 32u) != 0u) { let k = mix(inst.i4.z, inst.i4.w, p.y + 0.5); lp.x *= k; lp.z *= k; }
  return G.lightVP * vec4f(qrot(inst.i2, lp) + inst.i0.xyz, 1.0);
}
`;

// ---- Ground: surfaces come from the 1 m surface map written by the generator ----
// One quad per level (doc 64 Package 8): the street plane at 0 over the whole map, and a
// plane for each raised or sunken level over the rectangle its cells fill. Each fragment
// keeps only the cells whose floor is its plane's (the street plane only drops sunken cells;
// a raised level's slab hides it); a water plane also runs on under bridge decks.
export const groundShader = common + /* wgsl */`
struct VOut { @builtin(position) pos: vec4f, @location(0) wpos: vec3f, @location(1) @interpolate(flat) kind: f32 }
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) rect: vec4f, @location(1) info: vec4f) -> VOut {
  var q = array<vec2f, 6>(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));
  let p = mix(rect.xy, rect.zw, q[vi]);
  var o: VOut;
  o.wpos = vec3f(p.x, info.x, p.y);
  o.pos = G.viewProj * vec4f(o.wpos, 1.0);
  o.kind = info.y;
  return o;
}
fn packedSurface(p: vec2f) -> u32 {
  let s = i32(G.world.x);
  let c = clamp(vec2i(floor(p)), vec2i(0), vec2i(s - 1));
  return u32(textureLoad(surfTex, c, 0).r * 255.0 + 0.5);
}
fn surf(p: vec2f) -> u32 { return packedSurface(p) & 127u; }
fn isRoad(id: u32) -> bool { return id == 1u || (id >= 7u && id <= 10u); }

@fragment fn fs(in: VOut) -> FOut {
  let p = in.wpos.xz;
  let time = G.camPos.w;
  let size = G.world.x;
  let inside = p.x > 0.0 && p.y > 0.0 && p.x < size && p.y < size;
  // Which plane owns this cell: kind 1 is the street plane, 0 a level, 2 a water level.
  if (inside) {
    let fc = floorCell(p);
    if (in.kind > 0.5 && in.kind < 1.5) { if (fc.x < -0.01) { discard; } }
    else if (abs(fc.x - in.wpos.y) > 0.01 && !(in.kind > 1.5 && fc.y > 3.5)) { discard; }
  } else if (in.kind < 0.5 || in.kind > 1.5) { discard; }
  if (groundSeeThrough(in.wpos, in.pos.xy)) { discard; }
  var albedo = vec3f(0.012, 0.014, 0.018);
  var emissive = vec3f(0.0);
  var wet = 0.0;
  var water = 0.0;
  var pool = 0.0;      // standing water: puddle patches and the gutter along the kerb
  var shel = 0.0;      // shelter from the rain overhead
  let nA = fbm(p * 0.13);
  let nB = vnoise(p * 1.9);
  let nC = vnoise(p * 9.0);

  if (inside) {
    if (G.world.z > 0.5) {
      // Training annex floor: matte panels with a faint guide grid.
      let g = abs(fract(p / 4.0) - 0.5);
      let line = 1.0 - smoothstep(0.0, 0.012, 0.5 - max(g.x, g.y));
      albedo = vec3f(0.06, 0.066, 0.075) * (0.85 + 0.3 * nB);
      emissive = vec3f(0.1, 0.5, 0.7) * line * 0.22;
      wet = 0.25;
    } else {
      // A water plane is water all through, under a bridge deck too.
      let id = select(surf(p), 6u, in.kind > 1.5);
      let puddle = smoothstep(0.5, 0.72, nA);
      let f = fract(p);
      if (isRoad(id)) {
        // Asphalt with aggregate and repair patches; paint comes from the map.
        albedo = vec3f(0.03, 0.032, 0.037) * (0.8 + 0.25 * nB + 0.15 * nC);
        albedo *= 0.85 + 0.3 * step(0.62, vnoise(p * 0.21 + 40.0));
        wet = 0.55 + 0.45 * puddle;
        if (id == 7u) { albedo = mix(albedo, vec3f(0.24, 0.24, 0.25), step(0.5, fract(p.y / 1.1)) * 0.9); }
        if (id == 8u) { albedo = mix(albedo, vec3f(0.24, 0.24, 0.25), step(0.5, fract(p.x / 1.1)) * 0.9); }
        if (id == 9u) { albedo = mix(albedo, vec3f(0.32, 0.27, 0.1), (1.0 - smoothstep(0.08, 0.14, abs(f.y - 0.5))) * step(0.5, fract(p.x / 6.0))); }
        if (id == 10u) { albedo = mix(albedo, vec3f(0.32, 0.27, 0.1), (1.0 - smoothstep(0.08, 0.14, abs(f.x - 0.5))) * step(0.5, fract(p.y / 6.0))); }
      } else if (id == 2u) {
        // Sidewalk pavers with a kerb where they meet the road.
        albedo = vec3f(0.085, 0.086, 0.092) * (0.85 + 0.25 * nB) * (0.8 + 0.2 * step(0.04, f.x) * step(0.04, f.y));
        let kerb = f32(isRoad(surf(p + vec2f(0.35, 0.0))) || isRoad(surf(p - vec2f(0.35, 0.0))) || isRoad(surf(p + vec2f(0.0, 0.35))) || isRoad(surf(p - vec2f(0.0, 0.35))));
        albedo = mix(albedo, vec3f(0.17, 0.17, 0.18), kerb);
        wet = 0.5 + 0.4 * puddle;
      } else if (id == 3u) {
        // Alley: worn stone setts, darker and wetter.
        let off = step(0.5, fract(p.y / 0.8)) * 0.4;
        let j = vec2f(fract(p.x / 0.8 + off), fract(p.y / 0.4));
        albedo = vec3f(0.06, 0.057, 0.055) * (0.7 + 0.5 * hash21(floor(vec2f(p.x / 0.8 + off, p.y / 0.4)))) * (0.6 + 0.4 * step(0.07, j.x) * step(0.1, j.y));
        wet = 0.45 + 0.5 * puddle;
      } else if (id == 4u) {
        // Plaza: large polished tiles with inlay lines.
        let j = fract(p / 2.0);
        albedo = vec3f(0.07, 0.07, 0.078) * (0.85 + 0.2 * nB) * (0.75 + 0.25 * step(0.02, j.x) * step(0.02, j.y));
        let inlay = 1.0 - step(0.03, abs(fract(p.x / 8.0) - 0.5)) * step(0.03, abs(fract(p.y / 8.0) - 0.5));
        albedo = mix(albedo, vec3f(0.13, 0.12, 0.1), inlay * 0.5);
        wet = 0.5 + 0.4 * puddle;
      } else if (id == 6u) {
        // Canal water: dark, rippling, reflective.
        albedo = vec3f(0.006, 0.014, 0.02);
        wet = 1.0; water = 1.0;
      } else if (id == 11u) {
        // Planted ground.
        albedo = vec3f(0.03, 0.055, 0.03) * (0.6 + 0.8 * nC);
        wet = 0.1;
      } else {
        // Lot concrete: slabs and oil stains.
        let j = fract(p / 3.0);
        albedo = vec3f(0.055, 0.057, 0.062) * (0.8 + 0.3 * nB) * (0.85 + 0.15 * step(0.02, j.x) * step(0.02, j.y));
        albedo *= 1.0 - 0.4 * smoothstep(0.6, 0.75, vnoise(p * 0.4 + 9.0));
        wet = 0.5 + 0.4 * puddle;
      }
      // Manhole covers set into the carriageway.
      if (isRoad(id)) {
        let mc = floor(p / 23.0);
        let mp = (mc + vec2f(hash21(mc), hash21(mc + 7.7)) * 0.6 + 0.2) * 23.0;
        let md = distance(p, mp);
        if (md < 0.5 && isRoad(surf(mp))) {
          let ang = atan2(p.y - mp.y, p.x - mp.x);
          let pat = step(0.5, fract(md * 7.0)) * step(0.3, fract(ang * 1.9099));
          albedo = vec3f(0.045, 0.046, 0.05) * (0.6 + 0.7 * pat) + vec3f(0.03) * step(0.43, md);
          wet *= 0.6;
        }
      }
      // Tactile paving: a studded yellow strip on the pavement, set back from the kerb.
      if (id == 2u) {
        let near = isRoad(surf(p + vec2f(1.05, 0.0))) || isRoad(surf(p - vec2f(1.05, 0.0))) || isRoad(surf(p + vec2f(0.0, 1.05))) || isRoad(surf(p - vec2f(0.0, 1.05)));
        let close = isRoad(surf(p + vec2f(0.62, 0.0))) || isRoad(surf(p - vec2f(0.62, 0.0))) || isRoad(surf(p + vec2f(0.0, 0.62))) || isRoad(surf(p - vec2f(0.0, 0.62)));
        if (near && !close) {
          let stud = 1.0 - smoothstep(0.1, 0.2, distance(fract(p * 4.0), vec2f(0.5)));
          albedo = vec3f(0.34, 0.27, 0.05) * (0.55 + 0.6 * stud) * (0.7 + 0.4 * nB);
        }
      }
      // Standing water (doc 43): puddles where the paving dips, and a broken run of them
      // in the gutter along the kerb. None on planted ground; little on raised pavements.
      var poolK = 0.0;
      if (isRoad(id) || id == 3u) { poolK = 1.0; } else if (id == 4u || id == 0u) { poolK = 0.7; } else if (id == 2u) { poolK = 0.3; }
      pool = puddle * poolK;
      if (isRoad(id) && G.misc.w > 0.5) {
        let kerbside = surf(p + vec2f(0.8, 0.0)) == 2u || surf(p - vec2f(0.8, 0.0)) == 2u || surf(p + vec2f(0.0, 0.8)) == 2u || surf(p - vec2f(0.0, 0.8)) == 2u;
        pool = max(pool, f32(kerbside) * smoothstep(0.3, 0.6, vnoise(p * 0.45 + 17.0)));
      }
      shel = shelter(p, in.wpos.y);
      // Zone boundary light strips in the colour of the more dangerous side (doc 17).
      let lp = fract(p / 100.0) * 100.0;
      let dx = min(lp.x, 100.0 - lp.x);
      let dz = min(lp.y, 100.0 - lp.y);
      let dEdge = min(dx, dz);
      if (dEdge < 4.0) {
        let along = select(lp.x, lp.y, dx < dz);
        let b = vec2i(floor(p / 100.0));
        var off = vec2i(0, 0);
        if (dx < dz) { off.x = select(1, -1, lp.x < 50.0); } else { off.y = select(1, -1, lp.y < 50.0); }
        let nb = clamp(b + off, vec2i(0), vec2i(i32(G.world.y) - 1));
        let z0 = textureLoad(zoneTex, b, 0).r * 255.0;
        let z1 = textureLoad(zoneTex, nb, 0).r * 255.0;
        if (abs(z0 - z1) > 0.5) {
          let zc = zoneColor(max(z0, z1));
          let core = 1.0 - smoothstep(0.1, 0.24, dEdge);
          let chase = 0.6 + 0.4 * step(0.5, fract(along / 4.0 - time * 0.6));
          emissive += zc * (core * 0.45 * chase + exp(-dEdge * 0.9) * 0.05);
        }
      }
    }
  }
  wet *= G.world.w;
  if (water < 0.5) {
    // Under an awning, a canopy or the viaduct the ground stays dry; the drip line along
    // the edge of the cover is the wettest strip of all.
    let drip = shel * (1.0 - shel) * 4.0;
    wet = max(wet * (1.0 - 0.92 * shel), drip * 0.85 * G.world.w);
    pool *= (1.0 - shel) * G.world.w;
  }
  // Surface texture by class: asphalt on roads, setts in alleys, pavers elsewhere.
  var texN = vec2f(0.0);
  var rough = 0.6;
  var low = 0.5;       // how far down in the texture relief: dark joints and dips hold water
  if (G.misc.w > 0.5 && inside && G.world.z < 0.5 && water < 0.5) {
    let packed = packedSurface(p);
    let id2 = packed & 127u;
    var layer = 1;
    var gain = 3.0;
    if (isRoad(id2)) { layer = 0; gain = 3.6; } else if (id2 == 3u) { layer = 6; gain = 3.0; } else if (id2 == 11u) { gain = 0.0; }
    var sceneLayer = -1;
    if ((packed & 128u) != 0u && hasSceneMaps()) { sceneLayer = ${district.apron}; }
    else if (!isRoad(id2) && hasSceneMaps()) {
      let region = districtAt(p);
      if (id2 == ${SURF.GRASS}u) { sceneLayer = ${district['planting-soil']}; }
      else if (id2 == ${SURF.WALK}u || id2 == ${SURF.PLAZA}u || id2 == ${SURF.FLOOR}u ||
               (region == ${STYLE.DOCK} && id2 == ${SURF.LOT}u) || (region == ${STYLE.NEON} && id2 == ${SURF.ALLEY}u)) {
        sceneLayer = districtFloor(region);
      }
    }
    if (sceneLayer >= 0) {
      let tile = sceneMaps(p, sceneLayer, 2.0, distance(in.wpos, G.camPos.xyz));
      albedo *= tile.ink; texN = tile.xy; rough = tile.rough;
      low = smoothstep(0.95, 0.45, dot(tile.ink, vec3f(0.3333)));
    } else if (gain > 0.0) {
      let tc = matCol(p, layer, in.wpos);
      albedo = albedo * tc * gain;
      low = smoothstep(0.95, 0.45, dot(tc, vec3f(0.3333)) * gain);
      let nr = matNR(p, layer, in.wpos);
      texN = nr.xy; rough = nr.z;
      if (layer == 0) {
        let dist = distance(in.wpos, G.camPos.xyz);
        let wetPatch = smoothstep(-0.65, 0.65, sin(p.x * 0.07) + cos(p.y * 0.09));
        let bed = detailSample(p, 4.0, ${detail.rainbed}, dist);
        let relief = detailSample(p, 4.0, ${detail.rainbed + 1}, dist);
        albedo *= mix(vec3f(1), bed * 2.0, wetPatch);
        texN = mix(texN, relief.xy * 2.0 - 1.0, wetPatch);
        rough = mix(rough, relief.z, wetPatch);
      }
    }
  }

  // Contact shadows under characters. w packs strength + 4 x the floor in 0.25 m units, so a
  // body on a terrace darkens the terrace, not the street under it.
  var sh = 1.0;
  let bc = u32(G.misc.y);
  for (var i = 0u; i < bc; i++) {
    let bl = G.blobs[i];
    let lv = round(bl.w / 4.0);
    if (abs(lv * 0.25 - in.wpos.y) > 0.3) { continue; }
    let d = distance(p, bl.xy) / bl.z;
    sh *= 1.0 - (bl.w - lv * 4.0) * (1.0 - smoothstep(0.35, 1.0, d));
  }

  // Puddles spread from the low parts of the texture relief, so their edges follow joints.
  pool = smoothstep(0.45, 0.85, pool + (low - 0.5) * 0.35) * (1.0 - water);

  // Rain ripples perturb the normal where the surface is wet; water moves more.
  let rs = mix(2.2, 0.9, water);
  let rip = vec2f(vnoise(p * rs + vec2f(0.0, time * 1.4)), vnoise(p * rs + vec2f(13.0, -time * 1.2))) - 0.5;
  let amp = mix(mix(0.05, 0.1, pool), 0.22, water) * wet;
  texN *= 1.0 - pool;
  let n = normalize(vec3f(rip.x * amp + texN.x * 0.45, 1.0, rip.y * amp - texN.y * 0.45));
  // Water darkens porous paving; a puddle is clear water over that wet stone, not ink.
  albedo *= mix(1.0, 0.7, wet) * mix(1.0, 0.92, pool);
  // Wet paving is smoother; standing water is a near mirror (F0 of water) over the stone.
  let still = max(pool, water);
  rough = mix(mix(rough, min(rough, 0.24), smoothstep(0.0, 0.75, wet)), 0.035, still);
  // Part of each lamp spreads into a wide soft pool on damp paving, less on standing water.
  // It matters most from above, where the sharp lobe's Fresnel is weakest; toward grazing
  // the sharp reflections carry the wet look and keep their contrast.
  let nvg = max(dot(n, normalize(G.camPos.xyz - in.wpos)), 0.0);
  let above = smoothstep(0.2, 0.75, nvg);
  let haze = wet * mix(0.6, 0.3, still) * (1.0 - water) * above;
  var col = lightingK(in.wpos, n, albedo, rough, vec3f(mix(0.04, 0.02, still)), 1.0 - 0.6 * shel, haze) * sh;
  // Rain sheen: a rippled water film reflects the whole hazy, city-lit sky dome (the
  // hemisphere-average Fresnel of water is about 0.066). Under cover there is no film
  // and less sky; at grazing angles the sky reflection above already covers it.
  col += (G.ambient.rgb * 1.6 + G.fogColor.rgb * 2.0) * 0.066 * wet * (1.0 - shel) * above * sh;
  if (water > 0.5 && G.misc.w > 0.5) {
    // The canal body itself takes a little of the sky's colour.
    col += nightSky(reflect(normalize(in.wpos - G.camPos.xyz), n), 3.0) * 0.08;
  }
  col += emissive;

  if (G.scan.w > 0.0) {
    let r = distance(p, G.scan.xy);
    let sd = r - G.scan.z;
    let ring = exp(-sd * sd * 0.9);
    let wake = smoothstep(-14.0, 0.0, sd) * step(sd, 0.0);
    let grid = 1.0 - smoothstep(0.0, 0.06, min(abs(fract(p.x / 2.0) - 0.5), abs(fract(p.y / 2.0) - 0.5)));
    col += vec3f(1.0, 0.2, 0.75) * (ring * 0.9 + wake * grid * 0.3) * G.scan.w;
  }
  return FOut(vec4f(applyFog(col, in.wpos), depthA(in.wpos)), surfOut(in.wpos, n, rough, vec3f(mix(0.04, 0.02, still)), 1.0 - 0.6 * shel));
}
`;

// ---- Sky: gradient, cloud, stars and the Lantern (the alien vessel) ----
export const skyShader = common + /* wgsl */`
struct VOut { @builtin(position) pos: vec4f, @location(0) ndc: vec2f }
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var q = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: VOut;
  o.pos = vec4f(q[vi], 1.0, 1.0);
  o.ndc = q[vi];
  return o;
}
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let dir = normalize(G.camFwd.xyz + G.camRight.xyz * in.ndc.x * G.camRight.w + G.camUp.xyz * in.ndc.y * G.camUp.w);
  // The Command Hub is roofed: a coffered soffit 7 m up, drawn here instead of the sky so
  // the tactical camera never has a ceiling to cut away.
  if (G.world.z > 1.5) {
    var roof = vec3f(0.009, 0.011, 0.014);
    if (dir.y > 0.015) {
      let t = (7.0 - G.camPos.y) / dir.y;
      let p = G.camPos.xz + dir.xz * t;
      let c = abs(fract(p / 4.0) - 0.5);
      let beam = smoothstep(0.43, 0.46, max(c.x, c.y));
      let rib = smoothstep(0.46, 0.48, abs(fract(p.x) - 0.5)) * (1.0 - beam);
      roof = (mix(vec3f(0.034, 0.038, 0.045), vec3f(0.014, 0.016, 0.02), beam) - rib * 0.006) * exp(-t * 0.028) + vec3f(0.006, 0.007, 0.009);
    }
    return vec4f(roof, 1.0);
  }
  let nl = G.ambient.a;
  let up = max(dir.y, 0.0);
  let zenith = mix(vec3f(0.05, 0.05, 0.13), vec3f(0.006, 0.008, 0.02), nl);
  var col = mix(G.fogColor.rgb, zenith, pow(up, 0.45));
  if (G.misc.w > 0.5) { col = mix(G.fogColor.rgb, nightSky(dir, 0.0), smoothstep(0.0, 0.16, dir.y + 0.02)); }
  let west = max(dot(normalize(vec3f(dir.x, 0.0, dir.z) + vec3f(0.0001)), vec3f(-1.0, 0.0, 0.0)), 0.0);
  col += vec3f(0.9, 0.3, 0.25) * pow(west, 3.0) * exp(-up * 7.0) * (1.0 - nl) * 0.55;
  // Low cloud lit from below by the city.
  let cp = dir.xz / (dir.y + 0.18) * 1.6 + G.camPos.w * 0.004;
  let cloud = smoothstep(0.45, 0.8, fbm(cp)) * smoothstep(0.02, 0.3, up);
  col = mix(col, G.fogColor.rgb * 1.6 + vec3f(0.02, 0.01, 0.03), cloud * 0.6 * (1.0 - step(0.5, G.misc.w)));
  let sp = dir.xz / (abs(dir.y) + 0.25) * 60.0;
  let st = step(0.997, hash21(floor(sp))) * smoothstep(0.1, 0.4, up) * (0.3 + 0.7 * nl) * (1.0 - cloud);
  col += vec3f(st) * 0.6;
  // The Lantern doubles as the key light: a bright core with a wide teal halo.
  let c = max(dot(dir, G.lightDir.xyz), 0.0);
  col += (vec3f(0.75, 1.0, 0.95) * pow(c, 1800.0) * 26.0 + vec3f(0.2, 0.8, 0.75) * pow(c, 60.0) * 0.18
    + vec3f(0.15, 0.4, 0.6) * pow(c, 6.0) * 0.05) * G.misc.z;
  return vec4f(col, 1.0);
}
`;

// ---- Additive sprites: glows, ground rings and telegraphs, streaks ----
export const spriteShader = common + /* wgsl */`
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) color: vec4f,
  @location(2) @interpolate(flat) extra: vec4f,
  @location(3) fog: f32,
}
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f, @location(2) c: vec4f) -> VOut {
  var q = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let uv = q[vi];
  let kind = b.w;
  var wp: vec3f;
  if (kind < 0.5) {
    wp = a.xyz + (G.camRight.xyz * uv.x + G.camUp.xyz * uv.y) * a.w;
  } else if (kind < 1.5) {
    wp = a.xyz + vec3f(uv.x, 0.0, uv.y) * a.w;
  } else if (kind < 2.5) {
    let mid = a.xyz + c.xyz * c.w * 0.5;
    let side = normalize(cross(c.xyz, G.camPos.xyz - mid) + vec3f(0.00001));
    wp = a.xyz + c.xyz * c.w * (uv.y * 0.5 + 0.5) + side * uv.x * a.w;
  } else if (kind < 3.5) {
    // Flat on a surface whose normal is c.xyz (impact marks on glass).
    let nn = normalize(c.xyz + vec3f(0.00001));
    var tu = cross(vec3f(0.0, 1.0, 0.0), nn);
    if (length(tu) < 0.05) { tu = vec3f(1.0, 0.0, 0.0); }
    tu = normalize(tu);
    wp = a.xyz + (tu * uv.x + cross(nn, tu) * uv.y) * a.w;
  } else {
    // Ground lane: a rectangle from a.xyz along c.xz for c.w metres, a.w either side.
    let u = normalize(vec3f(c.x, 0.0, c.z) + vec3f(0.00001, 0.0, 0.0));
    let side = vec3f(-u.z, 0.0, u.x);
    wp = a.xyz + u * c.w * (uv.y * 0.5 + 0.5) + side * uv.x * a.w;
  }
  var o: VOut;
  o.pos = G.viewProj * vec4f(wp, 1.0);
  o.uv = uv;
  o.color = b;
  o.extra = c;
  let d = distance(wp, G.camPos.xyz);
  o.fog = exp(-max(d - 22.0, 0.0) * G.fogColor.a * 0.7);
  return o;
}
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let kind = in.color.w;
  var a = 0.0;
  if (kind < 0.5) {
    let r = length(in.uv);
    a = pow(max(1.0 - r, 0.0), 2.2);
  } else if (kind < 1.5) {
    // Ground ring. extra: inner radius fraction, fill alpha, half arc (0 = full), arc centre angle.
    let r = length(in.uv);
    let inner = in.extra.x;
    let edge = smoothstep(inner - 0.04, inner, r) * (1.0 - smoothstep(0.96, 1.0, r));
    a = edge + in.extra.y * (1.0 - step(1.0, r)) * (1.0 - edge);
    if (in.extra.z > 0.0) {
      let ang = atan2(in.uv.y, in.uv.x);
      var da = abs(ang - in.extra.w);
      da = min(da, 6.2831853 - da);
      a *= 1.0 - smoothstep(in.extra.z - 0.04, in.extra.z, da);
    }
  } else if (kind < 2.5) {
    let x = 1.0 - abs(in.uv.x);
    let y = 1.0 - abs(in.uv.y);
    a = x * x * smoothstep(0.0, 0.25, y);
  } else if (kind > 3.5) {
    // Ground lane: hard edges, a faint floor, and a fill swept up to extra.y of its length.
    let along = in.uv.y * 0.5 + 0.5;
    let edge = max(smoothstep(0.86, 0.94, abs(in.uv.x)), smoothstep(0.97, 0.995, abs(in.uv.y)));
    let sweep = 1.0 - step(in.extra.y, along);
    a = edge + (0.1 + 0.28 * sweep) * (1.0 - edge);
  } else {
    // Safety glass whitened around a hit (doc 31): a crushed white centre, cracks
    // running out from it at uneven angles and lengths, and broken rings between them.
    let r = length(in.uv);
    let ang = atan2(in.uv.y, in.uv.x);
    let seed = in.extra.w;
    let sector = floor((ang / 6.2831853 + 0.5) * 9.0);
    let mid = (sector + 0.5 + (hash21(vec2f(sector, seed)) - 0.5) * 0.7) / 9.0 * 6.2831853 - 3.14159265;
    var da = abs(ang - mid);
    da = min(da, 6.2831853 - da);
    let reach = 0.5 + 0.5 * hash21(vec2f(seed, sector + 3.0));
    let spoke = (1.0 - smoothstep(0.02, 0.06, da * r)) * (1.0 - smoothstep(reach * 0.75, reach, r));
    let ringR = 0.28 + 0.16 * hash21(vec2f(sector, seed + 9.0));
    let ring = (1.0 - smoothstep(0.015, 0.045, abs(r - ringR))) * step(0.4, hash21(vec2f(sector * 1.7, seed + 5.0)));
    let crush = 1.0 - smoothstep(0.04, 0.16, r);
    a = max(max(spoke, ring * 0.7), crush) * (1.0 - smoothstep(0.9, 1.0, r));
  }
  return vec4f(in.color.rgb * a * in.fog, 1.0);
}
`;

// ---- Post-processing: bloom chain and final composite ----
const fullscreenVs = /* wgsl */`
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var q = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: VOut;
  o.pos = vec4f(q[vi], 0.0, 1.0);
  o.uv = q[vi] * vec2f(0.5, -0.5) + 0.5;
  return o;
}
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
`;

export const bloomShader = fullscreenVs + /* wgsl */`
fn box4(uv: vec2f, o: vec2f) -> vec3f {
  return (textureSampleLevel(src, smp, uv + vec2f(-o.x, -o.y), 0.0).rgb + textureSampleLevel(src, smp, uv + vec2f(o.x, -o.y), 0.0).rgb
    + textureSampleLevel(src, smp, uv + vec2f(-o.x, o.y), 0.0).rgb + textureSampleLevel(src, smp, uv + vec2f(o.x, o.y), 0.0).rgb) * 0.25;
}
@fragment fn fsPrefilter(in: VOut) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(src));
  var c = min(box4(in.uv, ts), vec3f(24.0));
  let br = max(c.r, max(c.g, c.b));
  // Restrained bloom (doc 43): only what is clearly brighter than a lit wall spills.
  let threshold = 1.1; let knee = 0.6;
  var soft = clamp(br - threshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 0.0001);
  c *= max(soft, br - threshold) / max(br, 0.0001);
  return vec4f(c, 1.0);
}
@fragment fn fsDown(in: VOut) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(src));
  return vec4f(box4(in.uv, ts), 1.0);
}
@fragment fn fsUp(in: VOut) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(src));
  var c = textureSampleLevel(src, smp, in.uv, 0.0).rgb * 4.0;
  c += (textureSampleLevel(src, smp, in.uv + vec2f(ts.x, 0), 0.0).rgb + textureSampleLevel(src, smp, in.uv - vec2f(ts.x, 0), 0.0).rgb
    + textureSampleLevel(src, smp, in.uv + vec2f(0, ts.y), 0.0).rgb + textureSampleLevel(src, smp, in.uv - vec2f(0, ts.y), 0.0).rgb) * 2.0;
  c += textureSampleLevel(src, smp, in.uv + ts, 0.0).rgb + textureSampleLevel(src, smp, in.uv - ts, 0.0).rgb
    + textureSampleLevel(src, smp, in.uv + vec2f(ts.x, -ts.y), 0.0).rgb + textureSampleLevel(src, smp, in.uv + vec2f(-ts.x, ts.y), 0.0).rgb;
  return vec4f(c / 16.0, 1.0);
}
`;

// ---- Screen-space passes: ambient occlusion, mirror reflections and lit haze ----
// They read the resolved frame (colour, with the distance from the camera in alpha) and the
// surface buffer, and are folded into the frame before bloom, so a reflected sign blooms and
// a hazy lamp blurs like the rest of the picture.
//   fsAO      half size   how much of the sky dome each pixel can see
//   fsAOBlur  half size   that, smoothed without crossing depth edges
//   fsSSR     half size   what a wet or glossy surface mirrors, as a change to the frame
//   fsHaze    quarter     light scattered toward the camera by rain haze round every lamp
//   fsApply   full size   the frame with all three applied
export const fxShader = globals + /* wgsl */`
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var q = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: VOut;
  o.pos = vec4f(q[vi], 0.0, 1.0);
  o.uv = q[vi] * vec2f(0.5, -0.5) + 0.5;
  return o;
}
struct Fx {
  a: vec4f,   // occlusion strength, reflection strength, haze strength, occlusion radius (m)
  b: vec4f,   // occlusion samples, reflection steps, sky maps ready, debug view
}
@group(0) @binding(1) var frame: texture_2d<f32>;    // colour, distance / 400
@group(0) @binding(2) var surface: texture_2d<f32>;  // normal (oct), roughness, sqrt(mirror weight)
@group(0) @binding(3) var smp: sampler;              // linear, clamped
@group(0) @binding(4) var auxA: texture_2d<f32>;
@group(0) @binding(5) var auxB: texture_2d<f32>;
@group(0) @binding(6) var auxC: texture_2d<f32>;
@group(0) @binding(7) var skyTex: texture_2d<f32>;
@group(0) @binding(8) var skySmp: sampler;           // linear, repeating
@group(0) @binding(9) var<uniform> F: Fx;

const FAR = 400.0;
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715)))); }
fn octDec(e: vec2f) -> vec3f {
  let f = e * 2.0 - 1.0;
  var m = vec3f(f.x, f.y, 1.0 - abs(f.x) - abs(f.y));
  let t = max(-m.z, 0.0);
  m.x += select(t, -t, m.x >= 0.0);
  m.y += select(t, -t, m.y >= 0.0);
  return normalize(m.xzy);
}
fn rayDir(uv: vec2f) -> vec3f {
  let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  return normalize(G.camFwd.xyz + G.camRight.xyz * ndc.x * G.camRight.w + G.camUp.xyz * ndc.y * G.camUp.w);
}
fn distAt(uv: vec2f) -> f32 { return textureSampleLevel(frame, smp, uv, 0.0).a * FAR; }
fn posAt(uv: vec2f) -> vec3f { return G.camPos.xyz + rayDir(uv) * distAt(uv); }
fn toUv(p: vec3f) -> vec3f {
  let c = G.viewProj * vec4f(p, 1.0);
  return vec3f(c.xy / max(c.w, 0.0001) * vec2f(0.5, -0.5) + 0.5, c.w);
}
fn nightSky(dir: vec3f, lod: f32) -> vec3f {
  let uv = vec2f(atan2(dir.z, dir.x) * 0.15915494 + 0.5, acos(clamp(dir.y, -1.0, 1.0)) * 0.31830989);
  return textureSampleLevel(skyTex, skySmp, uv, lod).rgb * mix(vec3f(0.34, 0.3, 0.42), vec3f(0.07, 0.085, 0.14), G.ambient.a);
}

// Ambient occlusion: sample a disc of the surrounding surface and measure how much of it
// rises above this pixel's tangent plane (McGuire's scalable ambient obscurance estimator).
// The disc is a fixed size in the world, so a kerb and a doorway darken alike near and far.
@fragment fn fsAO(in: VOut) -> @location(0) vec4f {
  let d = distAt(in.uv);
  if (d > FAR * 0.6) { return vec4f(1.0); }
  let dir = rayDir(in.uv);
  let P = G.camPos.xyz + dir * d;
  let N = octDec(textureSampleLevel(surface, smp, in.uv, 0.0).rg);
  let vz = max(d * dot(dir, G.camFwd.xyz), 0.1);
  let R = F.a.w;
  // Disc radius on screen (in uv), never so small that every tap lands on this pixel.
  let ruv = clamp(R / (vz * 2.0 * G.camUp.w), 0.004, 0.18);
  let aspect = G.camUp.w / G.camRight.w;
  let n = i32(F.b.x);
  let phi = ign(in.pos.xy) * 6.2831853;
  var sum = 0.0;
  for (var i = 0; i < n; i++) {
    let k = (f32(i) + 0.5) / f32(n);
    let a = phi + k * 6.2831853 * 3.0;
    let o = vec2f(cos(a) * aspect, sin(a)) * ruv * sqrt(k);
    let v = posAt(in.uv + o) - P;
    let vv = dot(v, v);
    // Height above the tangent plane, with a bias that grows with distance (depth precision),
    // and a falloff so a wall across the street does not darken this one.
    let h = max(dot(v, N) - 0.03 - d * 0.0012, 0.0);
    sum += h / (vv + 0.02) * (1.0 - smoothstep(R * R * 0.6, R * R * 2.2, vv));
  }
  let ao = max(1.0 - 3.4 * sum / f32(n), 0.0);
  return vec4f(ao, d / FAR, 0.0, 1.0);
}
// Smooth the occlusion across its noise without letting it bleed over a depth edge.
@fragment fn fsAOBlur(in: VOut) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(auxA));
  let c = textureSampleLevel(auxA, smp, in.uv, 0.0);
  var sum = c.r; var w = 1.0;
  for (var y = -2; y <= 2; y++) {
    for (var x = -2; x <= 2; x++) {
      if (x == 0 && y == 0) { continue; }
      let t = textureSampleLevel(auxA, smp, in.uv + vec2f(f32(x), f32(y)) * ts, 0.0);
      // The tolerance grows with distance: on ground seen at a low angle neighbouring
      // texels are metres apart in depth and still the same surface.
      let k = exp(-abs(t.g - c.g) * FAR * 1.2 / (0.4 + c.g * FAR * 0.09));
      sum += t.r * k; w += k;
    }
  }
  return vec4f(sum / w, c.g, 0.0, 1.0);
}

// Mirror reflections. March the mirror ray through the frame's own depth; where it meets
// something on screen, that is what the surface shows instead of the sky. The result is the
// change to make to the frame: the found colour minus the sky reflection the surface shader
// already added, both times the same mirror weight. Off screen, behind things or on rough
// surfaces it fades to no change at all.
@fragment fn fsSSR(in: VOut) -> @location(0) vec4f {
  let s = textureSampleLevel(surface, smp, in.uv, 0.0);
  let k = s.a * s.a;
  let rough = s.b;
  let d = distAt(in.uv);
  if (k < 0.012 || rough > 0.5 || d > 160.0) { return vec4f(0.0); }
  let V = -rayDir(in.uv);
  let P = G.camPos.xyz - V * d;
  let N = octDec(s.rg);
  let R = reflect(-V, N);
  // A ray coming straight back at the camera would only find the surface itself.
  let toward = dot(R, V);
  if (toward > 0.85) { return vec4f(0.0); }
  let steps = i32(F.b.y);
  var stride = 0.12 + d * 0.012;
  var t = stride * (0.4 + ign(in.pos.xy));
  var prev = 0.0;
  var hit = -1.0;
  var huv = vec2f(0.0);
  for (var i = 0; i < steps; i++) {
    let Q = P + N * 0.04 + R * t;
    let q = toUv(Q);
    if (q.z <= 0.05 || q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) { break; }
    let sd = distAt(q.xy);
    let gap = distance(Q, G.camPos.xyz) - sd;
    if (gap > 0.0 && gap < stride * 1.6 + 0.4) {
      // Close in on the crossing between the last clear step and this one.
      var lo = prev; var hi = t;
      for (var j = 0; j < 5; j++) {
        let m = (lo + hi) * 0.5;
        let Qm = P + N * 0.04 + R * m;
        let qm = toUv(Qm);
        if (distance(Qm, G.camPos.xyz) > distAt(qm.xy)) { hi = m; } else { lo = m; }
      }
      hit = hi; huv = toUv(P + N * 0.04 + R * hi).xy;
      break;
    }
    prev = t;
    stride *= 1.14;
    t += stride;
  }
  if (hit < 0.0) { return vec4f(0.0); }
  // What it found, a little blurred on rougher surfaces and further along the ray.
  let ts = 1.0 / vec2f(textureDimensions(frame));
  let blur = (rough * 40.0 + 0.6) * min(hit * 0.2, 2.5);
  var c = textureSampleLevel(frame, smp, huv, 0.0).rgb * 2.0;
  c += textureSampleLevel(frame, smp, huv + vec2f(ts.x, ts.y) * blur, 0.0).rgb + textureSampleLevel(frame, smp, huv + vec2f(-ts.x, ts.y) * blur, 0.0).rgb
    + textureSampleLevel(frame, smp, huv + vec2f(ts.x, -ts.y) * blur, 0.0).rgb + textureSampleLevel(frame, smp, huv + vec2f(-ts.x, -ts.y) * blur, 0.0).rgb;
  c = min(c / 6.0, vec3f(12.0));
  // The sky this surface was shaded with, to take back.
  var sky = G.fogColor.rgb;
  if (F.b.z > 0.5) { sky = nightSky(R, 1.0 + rough * 6.0) * 1.6; }
  sky *= mix(0.12, 1.0, smoothstep(-0.25, 0.15, R.y));
  // Confidence: away from the screen edge, not grazing back at the camera, smooth enough.
  let e = min(min(huv.x, 1.0 - huv.x), min(huv.y, 1.0 - huv.y));
  let w = smoothstep(0.0, 0.08, e) * (1.0 - smoothstep(0.55, 0.85, toward)) * (1.0 - smoothstep(0.3, 0.5, rough)) * (1.0 - smoothstep(110.0, 160.0, d));
  return vec4f((c - sky) * k * w * F.a.y, 1.0);
}

// Lit haze. Rain hangs in the air and every lamp lights the air round it. Along this pixel's
// ray the light scattered toward the camera falls off with the square of the distance to the
// lamp, so it gathers into a halo where the ray passes close and is almost nothing elsewhere.
// With h the ray's nearest approach and c the lamp's own size, the integral of
// 1 / (h^2 + c^2 + s^2) along the ray has a closed form in atan; it is cut off at the lamp's
// reach and at whatever the ray hits, so a wall in front of a lamp hides its glow.
@fragment fn fsHaze(in: VOut) -> @location(0) vec4f {
  let dir = rayDir(in.uv);
  let tmax = min(distAt(in.uv), 160.0);
  let count = u32(G.misc.x);
  var col = vec3f(0.0);
  for (var i = 0u; i < count; i++) {
    let l = G.lights[i];
    let r = l.pos.w;
    let oc = l.pos.xyz - G.camPos.xyz;
    let tc = dot(oc, dir);
    let h2 = dot(oc, oc) - tc * tc;
    if (h2 >= r * r) { continue; }
    let half = sqrt(r * r - h2);
    let t0 = max(tc - half, 0.0);
    let t1 = min(tc + half, tmax);
    if (t1 <= t0) { continue; }
    let H = sqrt(h2 + 0.5);
    let fade = 1.0 - sqrt(h2) / r;
    col += l.col.rgb * l.col.a * fade * fade * (atan((t1 - tc) / H) - atan((t0 - tc) / H)) / H;
  }
  // How much the air scatters: more late at night as the rain thickens; none indoors.
  let sigma = 0.02 * (0.7 + 0.6 * G.ambient.a) * F.a.z * step(G.world.z, 0.5);
  return vec4f(min(col * sigma, vec3f(3.0)), 1.0);
}

// The frame with occlusion, reflections and haze folded in. Distance stays in alpha.
@fragment fn fsApply(in: VOut) -> @location(0) vec4f {
  let c = textureSampleLevel(frame, smp, in.uv, 0.0);
  var col = c.rgb;
  let ao = textureSampleLevel(auxA, smp, in.uv, 0.0).r;
  // Occlusion belongs to the ambient and bounced light. A pixel that is itself a light
  // (a sign, a lamp, a muzzle flash) is not darkened by the corner it sits in.
  let lum = dot(col, vec3f(0.2126, 0.7152, 0.0722));
  let occ = mix(1.0, ao, F.a.x * (1.0 - smoothstep(0.9, 2.6, lum)));
  col *= occ;
  // Reflections were traced at half size through rain-rippled normals: a small tent filter
  // takes the stipple out of them. A corner that sees less sky also mirrors less.
  let hs = 1.0 / vec2f(textureDimensions(auxB));
  var refl = textureSampleLevel(auxB, smp, in.uv, 0.0).rgb * 2.0;
  refl += textureSampleLevel(auxB, smp, in.uv + hs * vec2f(1.0, 1.0), 0.0).rgb + textureSampleLevel(auxB, smp, in.uv + hs * vec2f(-1.0, 1.0), 0.0).rgb
    + textureSampleLevel(auxB, smp, in.uv + hs * vec2f(1.0, -1.0), 0.0).rgb + textureSampleLevel(auxB, smp, in.uv + hs * vec2f(-1.0, -1.0), 0.0).rgb;
  col += refl / 6.0 * mix(1.0, occ, 0.7);
  col += textureSampleLevel(auxC, smp, in.uv, 0.0).rgb;
  // Debug views (?fx=ao, ssr, haze): one pass on its own.
  if (F.b.w > 2.5) { col = textureSampleLevel(auxC, smp, in.uv, 0.0).rgb * 4.0; }
  else if (F.b.w > 1.5) { col = abs(textureSampleLevel(auxB, smp, in.uv, 0.0).rgb) * 2.0; }
  else if (F.b.w > 0.5) { col = vec3f(ao * 0.6); }
  return vec4f(max(col, vec3f(0.0)), c.a);
}
`;

export const compositeShader = fullscreenVs + /* wgsl */`
@group(0) @binding(2) var bloomTex: texture_2d<f32>;
struct Post {
  a: vec4f,   // bloom, vignette, damage, time
  b: vec4f,   // exposure, aberration, heal, scan tint
  c: vec4f,   // focus distance (m), depth of field strength, sharpen, hit pulse
  d: vec4f,   // ripple count, aspect, unused, unused
  rip: array<vec4f, 4>,   // screen x, screen y, radius (screen heights), strength
}
@group(0) @binding(3) var<uniform> P: Post;
@group(0) @binding(4) var blurTex: texture_2d<f32>;

fn aces(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  var uv = in.uv;
  // Shock ripples: a ring of refraction spreading from an impact.
  let rc = i32(P.d.x);
  for (var i = 0; i < rc; i++) {
    let r = P.rip[i];
    let dv = (uv - r.xy) * vec2f(P.d.y, 1.0);
    let dl = length(dv);
    let band = exp(-pow((dl - r.z) / 0.035, 2.0));
    uv += normalize(dv + vec2f(0.00001)) * band * r.w * 0.022 / vec2f(P.d.y, 1.0);
  }
  let c = uv - 0.5;
  let r2 = dot(c, c);
  let ab = c * r2 * P.b.y;
  let centre = textureSampleLevel(src, smp, uv, 0.0);
  var col = vec3f(textureSampleLevel(src, smp, uv + ab, 0.0).r, centre.g, textureSampleLevel(src, smp, uv - ab, 0.0).b);
  // Unsharp mask against the blurred copy, then depth of field toward it.
  let blur = textureSampleLevel(blurTex, smp, uv, 0.0).rgb;
  col += (col - blur) * P.c.z * 0.5;
  let depth = centre.a * 400.0;
  let coc = clamp(abs(depth - P.c.x) / max(P.c.x, 1.0) - 0.22, 0.0, 1.0) * P.c.y;
  col = mix(col, blur, clamp(coc, 0.0, 0.85));
  col += textureSampleLevel(bloomTex, smp, uv, 0.0).rgb * P.a.x;
  col *= P.b.x;
  // Teal shadows, warm highlights (doc 11, colour contrast).
  let lum = dot(col, vec3f(0.2126, 0.7152, 0.0722));
  col = mix(col, col * vec3f(0.86, 1.0, 1.12), 1.0 - smoothstep(0.0, 0.35, lum));
  col = mix(col, col * vec3f(1.06, 1.0, 0.94), smoothstep(0.5, 2.0, lum));
  col = aces(col);
  col = mix(vec3f(dot(col, vec3f(0.2126, 0.7152, 0.0722))), col, 1.08);
  col *= 1.0 - r2 * P.a.y;
  let edge = smoothstep(0.12, 0.5, r2);
  col = mix(col, vec3f(0.8, 0.04, 0.06), edge * min(P.a.z, 0.6));
  col += vec3f(0.1, 0.5, 0.25) * edge * P.b.z;
  col += vec3f(0.35, 0.05, 0.25) * edge * P.b.w;
  let g = fract(sin(dot(in.uv * vec2f(1920.0, 1080.0) + P.a.w * 61.0, vec2f(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * 0.014;
  return vec4f(pow(max(col, vec3f(0.0)), vec3f(1.0 / 2.2)), 1.0);
}
`;
