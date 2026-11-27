// WGSL shaders (doc 11: dark ambient, bright emissive accents, wet reflective
// ground, depth haze, bloom), with material maps layered over procedural geometry.
import { DETAIL_MATERIALS } from './assets.js';
const detail = Object.fromEntries(DETAIL_MATERIALS.map((name, i) => [name, i * 2]));

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
  return mix(1.0, s * 0.25, G.lightDir.w);
}

// Ambient, the shadowed key light and the nearest point lights.
fn lighting(wpos: vec3f, n: vec3f, albedo: vec3f, specPow: f32, specAmt: f32) -> vec3f {
  let V = normalize(G.camPos.xyz - wpos);
  // Hemisphere ambient: cool sky above, dimmer bounce below.
  var col = albedo * G.ambient.rgb * mix(vec3f(0.5, 0.46, 0.44), vec3f(1.0), n.y * 0.5 + 0.5);
  let L0 = G.lightDir.xyz;
  let nl0 = max(dot(n, L0), 0.0);
  if (nl0 > 0.0) {
    let sh = shadow(wpos, n);
    let H0 = normalize(L0 + V);
    col += G.lightCol.rgb * sh * (albedo * nl0 + vec3f(pow(max(dot(n, H0), 0.0), specPow) * specAmt * 0.6));
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
      let ndl = max(dot(n, L), 0.0);
      let H = normalize(L + V);
      let sp = pow(max(dot(n, H), 0.0), specPow) * specAmt;
      col += l.col.rgb * l.col.a * att * (albedo * ndl + vec3f(sp) * min(ndl * 4.0, 1.0));
    }
  }
  return col;
}
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

@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let mi = u32(in.matf + 0.5);
  let mat = mi & 15u;
  var n = normalize(in.nrm);
  let time = G.camPos.w;

  // Camera cut-away: static geometry that hides the ground around the operator is
  // dithered out above waist height (doc 04: buildings between camera and operator).
  if ((mi & 16u) != 0u && in.wpos.y > 2.6 && G.focus.w > 0.0) {
    let rd = normalize(in.wpos - G.camPos.xyz);
    if (rd.y < -0.03) {
      let t = (1.0 - in.wpos.y) / rd.y;
      let g = in.wpos + rd * t;
      let d = distance(g.xz, G.focus.xz);
      if (d < G.focus.w * (0.8 + 0.2 * ign(in.pos.xy))) { discard; }
    }
  }

  var albedo = in.color.rgb;
  var emissive = vec3f(0.0);
  var specPow = 24.0;
  var specAmt = 0.15;
  let dist = distance(in.wpos, G.camPos.xyz);

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
    } else if (n.y < -0.5) {
      albedo *= 0.3;
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
        let open = step(0.35, h1);
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
        // Dark panes mirror the sky.
        let sky = mix(G.fogColor.rgb, nightSky(reflect(-Vw, n), 2.0) * 1.6, step(0.5, G.misc.w));
        e += sky * pow(1.0 - vn, 3.0) * (1.0 - lit * 0.7) * 0.9;
        w = inWin * (1.0 - frame);
      }
      // Wall surface: brick, plaster or facade panels, chosen per building.
      let wl = 2 + i32(fract(in.params.x * 0.618) * 3.0);
      var wallN = vec2f(0.0);
      if (texOn) {
        if (shop == 0.5) {
          let shutter = detailSample(vec2f(u, -v), 2.5, ${detail.shutter + 1}, dist);
          wallN = (shutter.xy * 2.0 - 1.0) * vec2f(1.0, -1.0);
          specAmt = 1.0 - shutter.z;
        } else if (wl == 4 && v >= ch && f.y < 0.22 && w == 0.0) {
          // Enamel service panels between glazed floors on metal-clad buildings.
          albedo *= detailSample(vec2f(u, -v), 2.0, ${detail.enamel}, dist) * 2.0;
          let nr = detailSample(vec2f(u, -v), 2.0, ${detail.enamel + 1}, dist);
          wallN = (nr.xy * 2.0 - 1.0) * vec2f(1.0, -1.0);
          specAmt = 1.0 - nr.z;
        } else {
          albedo *= matCol(vec2f(u, v), wl, in.wpos) * 3.4;
          let nr = matNR(vec2f(u, v), wl, in.wpos);
          wallN = nr.xy; specAmt = mix(0.5, 0.08, nr.z);
        }
      }
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
      specPow = mix(20.0, 220.0, w);
      specAmt = mix(specAmt, 1.3, w * detail);
    }
  } else if (mat == 2u) {
    // Neon tube / light strip. p0 flicker seed, p1 = 2 blinks (aircraft warning light).
    var fl = 1.0;
    let ph = in.params.x * 40.0;
    fl = 0.86 + 0.14 * sin(time * 9.0 + ph) * step(0.82, fract(ph * 0.37));
    fl *= mix(1.0, 0.25, step(0.985, hash21(vec2f(floor(time * 14.0), ph))));
    if (in.params.y > 1.5) { fl = step(0.7, fract(time * 0.6 + ph)); }
    return vec4f(applyFog(in.color.rgb * in.emis * fl, in.wpos), depthA(in.wpos));
  } else if (mat == 3u) {
    // Holo panel: scanlines and a slow shimmer.
    let scan = 0.55 + 0.45 * sin(in.wpos.y * 9.0 - time * 3.0);
    let sweep = 0.7 + 0.3 * sin(time * 0.7 + in.params.x * 30.0 + (in.wpos.x + in.wpos.z) * 0.4);
    let blocky = step(0.35, hash21(floor(vec2f(in.wpos.x + in.wpos.z, in.wpos.y) * 0.8) + floor(time * 0.5 + in.params.x * 9.0)));
    return vec4f(applyFog(in.color.rgb * in.emis * scan * sweep * (0.35 + 0.65 * blocky), in.wpos), depthA(in.wpos));
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
    specPow = 90.0; specAmt = 1.3;
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
    return vec4f(applyFog(lit * fl * front + in.color.rgb * 0.01, in.wpos), depthA(in.wpos));
  } else if (mat == 6u) {
    // Foliage: mottled and soft.
    let m = vnoise(in.lpos.xz * 6.0 + in.lpos.y * 5.0 + in.params.x * 9.0);
    albedo = in.color.rgb * (0.6 + 0.8 * m);
    n = normalize(n + (vec3f(m, vnoise(in.lpos.zy * 7.0), vnoise(in.lpos.xy * 7.0)) - 0.5) * 0.9);
    specAmt = 0.05;
  } else if (mat == 7u || mat == 9u || mat == 10u) {
    if (mat == 9u) { surface = ${detail.enamel}; }
    if (mat == 10u) { surface = ${detail.freight}; meters = 1.3; }
    // Painted metal and glass (vehicles, machines): glossy with a sky reflection.
    specPow = 140.0; specAmt = 1.2;
    let V = normalize(G.camPos.xyz - in.wpos);
    let fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    emissive = mix(G.fogColor.rgb, nightSky(reflect(-V, n), 3.0) * 2.0, step(0.5, G.misc.w)) * fres * 1.6 + in.color.rgb * in.emis;
  } else {
    // Plain lit surface. The emissive value is a flat boost (hit flashes).
    emissive = in.color.rgb * in.emis;
    let px = in.params.x;
    if (px > 0.5 && px < 1.5) {
      // Wall: plaster with stains.
      albedo *= 0.75 + 0.5 * fbm(vec2f(in.wpos.x + in.wpos.z, in.wpos.y) * 0.7);
      if (G.misc.w > 0.5 && abs(n.y) < 0.5) { albedo *= matCol(vec2f(in.wpos.x + in.wpos.z, in.wpos.y), 3, in.wpos) * 3.0; }
    } else if (px > 1.5 && px < 2.5) {
      // Interior floor tiles.
      let t = fract(in.wpos.xz * 0.5);
      albedo *= 0.75 + 0.25 * step(0.04, t.x) * step(0.04, t.y);
      specPow = 90.0; specAmt = 0.5;
    } else if (px > 3.5 && px < 4.5 && n.y > 0.5) {
      // Cut-away cap of a solid building: diagonal hatch so it reads as "not enterable".
      let hx = fract((in.wpos.x + in.wpos.z) / 1.6);
      albedo *= 0.6 + 0.9 * step(0.82, hx);
    } else if (px > 4.5 && px < 5.5) {
      surface = ${detail.weave}; meters = 0.55;
      // Fabric: weave, soft folds and a sheen at grazing angles.
      let wv = vnoise(in.lpos.xy * 42.0 + in.lpos.z * 23.0);
      let folds = sin(in.lpos.y * 24.0 + vnoise(in.lpos.xz * 9.0) * 5.0);
      albedo *= (0.84 + 0.26 * wv) * (0.93 + 0.07 * folds);
      let V = normalize(G.camPos.xyz - in.wpos);
      let rim = pow(1.0 - max(dot(n, V), 0.0), 2.5);
      emissive += albedo * rim * (0.14 + G.ambient.rgb * 1.2);
      specAmt = 0.06;
    } else if (px > 5.5 && px < 6.5) {
      surface = ${detail.ceramic}; meters = 0.8;
      // Armour: panel seams, scuffed edges, hard highlights.
      let seam = min(step(0.955, fract(in.lpos.y * 7.0)) + step(0.965, fract(in.lpos.x * 9.0 + in.lpos.z * 9.0)), 1.0);
      let scuff = step(0.78, vnoise(in.lpos.xy * 34.0 + in.lpos.z * 19.0));
      albedo = albedo * (1.0 - 0.5 * seam) + vec3f(0.05) * scuff;
      let V = normalize(G.camPos.xyz - in.wpos);
      let rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
      emissive += vec3f(0.25, 0.4, 0.5) * rim * 0.3;
      specPow = 110.0; specAmt = 1.0;
    } else if (px > 6.5 && px < 7.5) {
      // Skin: light scatters under the surface, so shadows stay warm.
      let V = normalize(G.camPos.xyz - in.wpos);
      let rim = pow(1.0 - max(dot(n, V), 0.0), 2.0);
      emissive += albedo * vec3f(0.34, 0.12, 0.08) * 0.45 + albedo * rim * 0.4;
      specPow = 36.0; specAmt = 0.22;
    } else if (px > 7.5 && px < 8.5) {
      // Hair: strands along the scalp with a soft highlight band.
      let st = vnoise(vec2f((in.lpos.x + in.lpos.z) * 70.0, in.lpos.y * 5.0));
      albedo *= 0.65 + 0.7 * st;
      specPow = 50.0; specAmt = 0.45;
    } else if (px > 9.5 && px < 10.5) {
      // Corrugated steel: shipping containers and warehouse sheds.
      let cu = select(in.wpos.z, in.wpos.x, abs(n.x) <= 0.5);
      if (abs(n.y) < 0.5) {
        albedo *= 0.75 + 0.35 * sin(cu * 22.0);
        surface = ${detail.freight}; meters = 3.0;
        albedo *= 0.7 + 0.5 * fbm(vec2f(cu, in.wpos.y) * 0.6 + in.params.y * 9.0);
      } else { albedo *= 0.6; }
      specPow = 60.0; specAmt = 0.5;
    } else if (px > 11.5 && px < 12.5) {
      // Fired roof tiles laid in courses.
      let course = fract(in.wpos.y * 3.2);
      let joint = step(0.9, fract((in.wpos.x + in.wpos.z) * 2.6 + floor(in.wpos.y * 3.2) * 0.5));
      albedo *= (0.65 + 0.5 * course) * (1.0 - 0.35 * joint) * (0.85 + 0.3 * vnoise(in.wpos.xz * 3.0));
      specPow = 70.0; specAmt = 0.6;
    } else if (px > 12.5 && px < 13.5) {
      // Timber: boards with a grain.
      let cu = select(in.wpos.z, in.wpos.x, abs(n.x) <= 0.5);
      albedo *= (0.75 + 0.4 * vnoise(vec2f(cu * 1.5, in.wpos.y * 26.0))) * (1.0 - 0.3 * step(0.94, fract(cu * 1.6)));
      specAmt = 0.1;
    } else if (px > 10.5 && px < 11.5) {
      // Open metalwork cut out of a slab: p1 0 railing, 1 ladder, 2 chain-link, 3 grating.
      let wideX = in.size.x >= in.size.z;
      let u = select(in.lpos.z, in.lpos.x, wideX);
      let hu = select(in.size.z, in.size.x, wideX) * 0.5;
      let v = in.lpos.y;
      let hv = in.size.y * 0.5;
      let kind = in.params.y;
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
      specPow = 80.0; specAmt = 0.7;
    } else if (px > 13.5 && px < 14.5) {
      // Hazard paint: black chevrons over the base colour, chipped.
      let d = fract((in.lpos.x + in.lpos.z + in.lpos.y) * 1.8);
      albedo = mix(vec3f(0.02), albedo, step(0.5, d)) * (0.7 + 0.5 * vnoise(in.wpos.xz * 2.0 + in.wpos.y * 3.0));
      specPow = 50.0; specAmt = 0.4;
    } else if (px > 8.5 && px < 9.5) {
      // Rubber and leather: matte with a dull sheen.
      albedo *= 0.85 + 0.2 * vnoise(in.lpos.xy * 26.0);
      specPow = 28.0; specAmt = 0.25;
    }
  }

  // Object-space box projection keeps panels fixed to turning vehicles and posed limbs.
  if (surface >= 0 && G.misc.w > 0.5) {
    let local = abs(qrot(vec4f(-in.rotation.xyz, in.rotation.w), normalize(in.nrm)));
    let alongX = local.x >= local.z && local.x >= local.y;
    let top = local.y > local.x && local.y > local.z;
    let U = select(vec3f(1,0,0), vec3f(0,0,1), alongX);
    let V = select(vec3f(0,-1,0), vec3f(0,0,1), top);
    let uv = vec2f(dot(U, in.lpos), dot(V, in.lpos));
    let ink = detailSample(uv, meters, surface, dist) * 2.0;
    let nr = detailSample(uv, meters, surface + 1, dist);
    albedo *= ink;
    // Existing biomass pulses remain visible through the shell and membrane detail.
    if (mat == 4u || mat == 8u) { emissive *= clamp(dot(ink, vec3f(0.25, 0.5, 0.25)), 0.68, 1.18); }
    let slope = qrot(in.rotation, U * (2.0 * nr.x - 1.0) + V * (2.0 * nr.y - 1.0));
    n = normalize(n + (slope - n * dot(n, slope)) * 0.45);
    specAmt *= 1.5 - nr.z;
  }

  // Soft contact darkening at the base of static geometry.
  let isStatic = (mi & 16u) != 0u;
  let ao = mix(0.5, 1.0, smoothstep(0.0, 2.4, in.wpos.y));
  // Characters darken toward their feet and pick up a back rim from the key light.
  let charAo = mix(0.7, 1.0, smoothstep(0.0, 0.5, in.wpos.y));
  if (!isStatic && (mat == 0u || mat == 4u || mat == 8u)) {
    let Vr = normalize(G.camPos.xyz - in.wpos);
    let back = pow(1.0 - max(dot(n, Vr), 0.0), 3.0) * clamp(dot(n, G.lightDir.xyz) * 0.5 + 0.5, 0.0, 1.0);
    emissive += G.lightCol.rgb * back * 0.7;
  }
  var col = lighting(in.wpos, n, albedo, specPow, specAmt) * select(charAo, ao, isStatic) + emissive;
  if (G.scan.w > 0.0) {
    let sd = abs(distance(in.wpos.xz, G.scan.xy) - G.scan.z);
    col += vec3f(1.0, 0.2, 0.75) * exp(-sd * sd * 0.6) * G.scan.w * 0.6;
  }
  return vec4f(applyFog(col, in.wpos), depthA(in.wpos));
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
export const groundShader = common + /* wgsl */`
struct VOut { @builtin(position) pos: vec4f, @location(0) wpos: vec3f }
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var q = array<vec2f, 6>(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));
  let m = 900.0;
  let p = q[vi] * (G.world.x + 2.0 * m) - m;
  var o: VOut;
  o.wpos = vec3f(p.x, 0.0, p.y);
  o.pos = G.viewProj * vec4f(o.wpos, 1.0);
  return o;
}
fn surf(p: vec2f) -> u32 {
  let s = i32(G.world.x);
  let c = clamp(vec2i(floor(p)), vec2i(0), vec2i(s - 1));
  return u32(textureLoad(surfTex, c, 0).r * 255.0 + 0.5);
}
fn isRoad(id: u32) -> bool { return id == 1u || (id >= 7u && id <= 10u); }

@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let p = in.wpos.xz;
  let time = G.camPos.w;
  let size = G.world.x;
  let inside = p.x > 0.0 && p.y > 0.0 && p.x < size && p.y < size;
  var albedo = vec3f(0.012, 0.014, 0.018);
  var emissive = vec3f(0.0);
  var wet = 0.0;
  var water = 0.0;
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
      let id = surf(p);
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
        wet = 0.3 + 0.4 * puddle;
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
        wet = 0.25 + 0.6 * puddle;
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
  // Surface texture by class: asphalt on roads, setts in alleys, pavers elsewhere.
  var texN = vec2f(0.0);
  var rough = 0.6;
  if (G.misc.w > 0.5 && inside && G.world.z < 0.5 && water < 0.5) {
    let id2 = surf(p);
    var layer = 1;
    var gain = 3.0;
    if (isRoad(id2)) { layer = 0; gain = 3.6; } else if (id2 == 3u) { layer = 6; gain = 3.0; } else if (id2 == 11u) { gain = 0.0; }
    if (gain > 0.0) {
      albedo = albedo * matCol(p, layer, in.wpos) * gain;
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

  // Contact shadows under characters.
  var sh = 1.0;
  let bc = u32(G.misc.y);
  for (var i = 0u; i < bc; i++) {
    let bl = G.blobs[i];
    let d = distance(p, bl.xy) / bl.z;
    sh *= 1.0 - bl.w * (1.0 - smoothstep(0.35, 1.0, d));
  }

  // Rain ripples perturb the normal where the surface is wet; water moves more.
  let rs = mix(2.2, 0.9, water);
  let rip = vec2f(vnoise(p * rs + vec2f(0.0, time * 1.4)), vnoise(p * rs + vec2f(13.0, -time * 1.2))) - 0.5;
  let amp = mix(0.05, 0.22, water) * wet;
  let n = normalize(vec3f(rip.x * amp + texN.x * 0.45, 1.0, rip.y * amp - texN.y * 0.45));
  albedo *= mix(1.0, 0.6, wet);
  // Puddles fill the low, smooth parts of the texture.
  let gloss = wet * mix(1.15, 0.55, rough);
  var col = lighting(in.wpos, n, albedo, mix(18.0, 420.0, gloss), mix(0.05, 1.1, gloss)) * sh;
  let V = normalize(G.camPos.xyz - in.wpos);
  let fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
  // Wet ground mirrors the sky.
  let env = mix(G.fogColor.rgb, nightSky(reflect(-V, n), 2.5 + rough * 3.0) * 1.6, step(0.5, G.misc.w));
  col += env * fres * gloss * mix(vec3f(0.9), vec3f(0.5, 0.62, 0.72), water) + env * water * 0.05;
  col += emissive;

  if (G.scan.w > 0.0) {
    let r = distance(p, G.scan.xy);
    let sd = r - G.scan.z;
    let ring = exp(-sd * sd * 0.9);
    let wake = smoothstep(-14.0, 0.0, sd) * step(sd, 0.0);
    let grid = 1.0 - smoothstep(0.0, 0.06, min(abs(fract(p.x / 2.0) - 0.5), abs(fract(p.y / 2.0) - 0.5)));
    col += vec3f(1.0, 0.2, 0.75) * (ring * 0.9 + wake * grid * 0.3) * G.scan.w;
  }
  return vec4f(applyFog(col, in.wpos), depthA(in.wpos));
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
  } else {
    let mid = a.xyz + c.xyz * c.w * 0.5;
    let side = normalize(cross(c.xyz, G.camPos.xyz - mid) + vec3f(0.00001));
    wp = a.xyz + c.xyz * c.w * (uv.y * 0.5 + 0.5) + side * uv.x * a.w;
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
  } else {
    let x = 1.0 - abs(in.uv.x);
    let y = 1.0 - abs(in.uv.y);
    a = x * x * smoothstep(0.0, 0.25, y);
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
  let threshold = 0.9; let knee = 0.6;
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
