// WebGPU renderer: a shadow pass from the key light, one HDR scene pass (4x MSAA) that also
// writes a surface buffer, screen-space occlusion, reflections and haze folded into the
// frame, then a bloom mip chain and a tone-mapped composite. The renderer only reads
// frame data; it never touches simulation state (doc 13, section 4).

import { boxShader, shadowShader, groundShader, skyShader, spriteShader, bloomShader, compositeShader, fxShader, GLOBALS_SIZE } from './shaders.js';
import { INST_FLOATS, SHAPE_COUNT, SURF } from '../sim/world.js';
import { loadDetail, loadSceneMaterials, loadMaterials, loadSky, makeSignAtlas, placeholders } from './assets.js';
import { requestGraphicsDevice } from './device.js';
import { coverOf } from './cover.js';
import { lowerRampTreads } from './ramps.js';

const HDR = 'rgba16float';
const SURF_FMT = 'rgba8unorm';   // the surface buffer: normal (octahedral), roughness, mirror weight
const BLOOM_MIPS = 6;
const SHADOW_SIZE = 2048;
export const MAX_DYN = 16000;      // dynamic instances per frame, all shapes together
export const MAX_SPRITES = 16000;
export const SPRITE_FLOATS = 12;

// ---- unit meshes, all inside [-0.5, 0.5]^3: position + normal ----
function buildMeshes() {
  const out = [], ranges = [];
  const tri = (a, b, c, na, nb, nc) => { out.push(...a, ...na, ...b, ...nb, ...c, ...nc); };
  const begin = () => out.length / 6;
  const end = (s) => ranges.push([s, out.length / 6 - s]);
  const norm = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

  // 0 box
  let s = begin();
  const faces = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
  for (const [n, u, v] of faces) {
    const c = (a, b) => [0, 1, 2].map((k) => (n[k] + u[k] * a + v[k] * b) * 0.5);
    tri(c(-1, -1), c(1, -1), c(1, 1), n, n, n); tri(c(-1, -1), c(1, 1), c(-1, 1), n, n, n);
  }
  end(s);

  // Surface of revolution around Y from a profile of [radius, y, normalR, normalY].
  const lathe = (profile, seg, capBottom, capTop) => {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      for (let j = 0; j < profile.length - 1; j++) {
        const [r0, y0, nr0, ny0] = profile[j], [r1, y1, nr1, ny1] = profile[j + 1];
        const p00 = [r0 * c0, y0, r0 * s0], p01 = [r0 * c1, y0, r0 * s1], p10 = [r1 * c0, y1, r1 * s0], p11 = [r1 * c1, y1, r1 * s1];
        const n00 = norm([nr0 * c0, ny0, nr0 * s0]), n01 = norm([nr0 * c1, ny0, nr0 * s1]), n10 = norm([nr1 * c0, ny1, nr1 * s0]), n11 = norm([nr1 * c1, ny1, nr1 * s1]);
        if (r0 > 1e-5) tri(p00, p10, p01, n00, n10, n01);
        if (r1 > 1e-5) tri(p01, p10, p11, n01, n10, n11);
      }
      if (capBottom) { const [r, y] = profile[0]; tri([0, y, 0], [r * c0, y, r * s0], [r * c1, y, r * s1], [0, -1, 0], [0, -1, 0], [0, -1, 0]); }
      if (capTop) { const [r, y] = profile[profile.length - 1]; tri([0, y, 0], [r * c1, y, r * s1], [r * c0, y, r * s0], [0, 1, 0], [0, 1, 0], [0, 1, 0]); }
    }
  };
  // 1 sphere
  s = begin();
  const sph = [];
  for (let j = 0; j <= 8; j++) { const t = -Math.PI / 2 + (j / 8) * Math.PI; sph.push([Math.cos(t) * 0.5, Math.sin(t) * 0.5, Math.cos(t), Math.sin(t)]); }
  lathe(sph, 14, false, false);
  end(s);
  // 2 cylinder
  s = begin();
  lathe([[0.5, -0.5, 1, 0], [0.5, 0.5, 1, 0]], 14, true, true);
  end(s);
  // 3 capsule: radius 0.25, total height 1
  s = begin();
  const cap = [];
  for (let j = 0; j <= 5; j++) { const t = -Math.PI / 2 + (j / 5) * (Math.PI / 2); cap.push([Math.cos(t) * 0.25, -0.25 + Math.sin(t) * 0.25, Math.cos(t), Math.sin(t)]); }
  for (let j = 0; j <= 5; j++) { const t = (j / 5) * (Math.PI / 2); cap.push([Math.cos(t) * 0.25, 0.25 + Math.sin(t) * 0.25, Math.cos(t), Math.sin(t)]); }
  lathe(cap, 12, false, false);
  end(s);
  // 4 cone
  s = begin();
  lathe([[0.5, -0.5, 1, 0.5], [0, 0.5, 1, 0.5]], 14, true, false);
  end(s);
  // 5 wedge: a ramp, full height at -z falling to the ground at +z
  s = begin();
  const A = [-0.5, -0.5, -0.5], B = [0.5, -0.5, -0.5], C = [0.5, -0.5, 0.5], D = [-0.5, -0.5, 0.5], E = [-0.5, 0.5, -0.5], F = [0.5, 0.5, -0.5];
  const sn = norm([0, 1, 1]);
  tri(A, B, C, [0, -1, 0], [0, -1, 0], [0, -1, 0]); tri(A, C, D, [0, -1, 0], [0, -1, 0], [0, -1, 0]);
  tri(A, E, F, [0, 0, -1], [0, 0, -1], [0, 0, -1]); tri(A, F, B, [0, 0, -1], [0, 0, -1], [0, 0, -1]);
  tri(E, D, C, sn, sn, sn); tri(E, C, F, sn, sn, sn);
  tri(A, D, E, [-1, 0, 0], [-1, 0, 0], [-1, 0, 0]); tri(B, F, C, [1, 0, 0], [1, 0, 0], [1, 0, 0]);
  end(s);
  return { data: new Float32Array(out), ranges };
}

async function describeError(module, e) {
  return `Shader ${module.label}: ${e.message}`;
}

export class Renderer {
  static async create(canvas) {
    const { device, compatibility } = await requestGraphicsDevice(window.isSecureContext, navigator.gpu);
    device.pushErrorScope('validation');
    let r;
    try {
      r = new Renderer(canvas, device, compatibility);
      await r.init();
    } finally {
      const error = await device.popErrorScope();
      if (error) throw new Error(error.message);
    }
    return r;
  }

  constructor(canvas, device, compatibility) {
    this.canvas = canvas;
    // Compatibility devices can render HDR, but cannot multisample rgba16float.
    this.samples = compatibility ? 1 : 4;
    this.device = device;
    this.ctx = canvas.getContext('webgpu');
    if (!this.ctx) throw new Error('This browser could not create a WebGPU canvas.');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device, format: this.format, alphaMode: 'opaque' });
    this.globals = new Float32Array(GLOBALS_SIZE / 4);
    this.post = new Float32Array(32);
    // ao, ssr, haze: strengths of the screen-space passes (0 turns one off and skips its work).
    this.opts = { shadows: true, textures: true, reach: 1, ao: 1, ssr: 1, haze: 1 };
    this.fx = new Float32Array(8);
    this.texReady = false;
    this.width = 0; this.height = 0;
    this.world = null;
    this.staticBufs = [];
    this.stats = { draws: 0, inst: 0, sprites: 0 };
    this.lost = false;
    this.quality = 1; // resolution scale cap
    device.lost.then((info) => { this.lost = true; console.error('WebGPU device lost:', info.message); });
  }

  async init() {
    const d = this.device;
    const mod = (code, label) => d.createShaderModule({
      // Instance values are identical at every vertex; either provoking vertex works.
      code: this.samples === 1 ? code.replaceAll('@interpolate(flat)', '@interpolate(flat, either)') : code, label,
    });
    const mBox = mod(boxShader, 'box'), mShadow = mod(shadowShader, 'shadow'), mGround = mod(groundShader, 'ground'), mSky = mod(skyShader, 'sky');
    const mSprite = mod(spriteShader, 'sprite'), mBloom = mod(bloomShader, 'bloom'), mComp = mod(compositeShader, 'composite'), mFx = mod(fxShader, 'fx');
    for (const m of [mBox, mShadow, mGround, mSky, mSprite, mBloom, mComp, mFx]) {
      const info = await m.getCompilationInfo();
      for (const msg of info.messages) if (msg.type === 'error') throw new Error(await describeError(m, { message: `line ${msg.lineNum}: ${msg.message}` }));
    }

    const meshes = buildMeshes();
    this.meshRanges = meshes.ranges;
    this.meshBuf = d.createBuffer({ size: meshes.data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.meshBuf, 0, meshes.data);
    this.globalsBuf = d.createBuffer({ size: GLOBALS_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.postBuf = d.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.fxBuf = d.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.dynBuf = d.createBuffer({ size: MAX_DYN * INST_FLOATS * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.spriteBuf = d.createBuffer({ size: MAX_SPRITES * SPRITE_FLOATS * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.zoneTex = d.createTexture({ size: [32, 32], format: 'rg8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    this.shadowTex = d.createTexture({ size: [SHADOW_SIZE, SHADOW_SIZE], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.shadowView = this.shadowTex.createView();
    this.sampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.texSampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', maxAnisotropy: 4 });
    this.tex = placeholders(d);
    this.shadowSampler = d.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' });

    const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    this.sceneBGL = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: VF, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d-array' } },
        { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d-array' } },
        { binding: 7, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 8, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 9, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 10, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d-array' } },
        { binding: 11, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d-array' } },
        { binding: 12, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 13, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });
    this.shadowBGL = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }] });
    const sceneLayout = d.createPipelineLayout({ bindGroupLayouts: [this.sceneBGL] });
    const instAttrs = [0, 1, 2, 3, 4].map((i) => ({ shaderLocation: 2 + i, offset: i * 16, format: 'float32x4' }));
    const meshBuffers = [
      { arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }] },
      { arrayStride: INST_FLOATS * 4, stepMode: 'instance', attributes: instAttrs },
    ];
    const depth = (write, compare) => ({ format: 'depth24plus', depthWriteEnabled: write, depthCompare: compare });
    // Additive colour; alpha is left alone because it carries scene depth.
    const additive = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'zero', dstFactor: 'one' } };
    const ms = { count: this.samples };
    // The surface buffer (normal, roughness, mirror weight): written by lit geometry only.
    const noSurf = { format: SURF_FMT, writeMask: 0 };

    this.boxPipe = d.createRenderPipeline({
      label: 'mesh', layout: sceneLayout, multisample: ms,
      vertex: { module: mBox, entryPoint: 'vs', buffers: meshBuffers },
      fragment: { module: mBox, entryPoint: 'fs', targets: [{ format: HDR }, { format: SURF_FMT }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: depth(true, 'less'),
    });
    this.xrayPipe = d.createRenderPipeline({
      label: 'xray', layout: sceneLayout, multisample: ms,
      vertex: { module: mBox, entryPoint: 'vs', buffers: meshBuffers },
      fragment: { module: mBox, entryPoint: 'fsXray', targets: [{ format: HDR, blend: additive }, noSurf] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: depth(false, 'always'),
    });
    this.shadowPipe = d.createRenderPipeline({
      label: 'shadow', layout: d.createPipelineLayout({ bindGroupLayouts: [this.shadowBGL] }),
      vertex: { module: mShadow, entryPoint: 'vs', buffers: meshBuffers },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2.5 },
    });
    // Ground planes (doc 64 Package 8): per instance a rectangle and its height and kind.
    this.groundPipe = d.createRenderPipeline({
      label: 'ground', layout: sceneLayout, multisample: ms,
      vertex: { module: mGround, entryPoint: 'vs', buffers: [{ arrayStride: 32, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }, { shaderLocation: 1, offset: 16, format: 'float32x4' }] }] },
      fragment: { module: mGround, entryPoint: 'fs', targets: [{ format: HDR }, { format: SURF_FMT }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depth(true, 'less'),
    });
    this.skyPipe = d.createRenderPipeline({
      label: 'sky', layout: sceneLayout, multisample: ms,
      vertex: { module: mSky, entryPoint: 'vs' },
      fragment: { module: mSky, entryPoint: 'fs', targets: [{ format: HDR }, noSurf] },
      primitive: { topology: 'triangle-list' },
      depthStencil: depth(false, 'always'),
    });
    this.spritePipe = d.createRenderPipeline({
      label: 'sprite', layout: sceneLayout, multisample: ms,
      vertex: {
        module: mSprite, entryPoint: 'vs',
        buffers: [{ arrayStride: SPRITE_FLOATS * 4, stepMode: 'instance', attributes: [0, 1, 2].map((i) => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) }],
      },
      fragment: { module: mSprite, entryPoint: 'fs', targets: [{ format: HDR, blend: additive }, noSurf] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depth(false, 'less-equal'),
    });

    this.postBGL = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    this.compBGL = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });
    const postLayout = d.createPipelineLayout({ bindGroupLayouts: [this.postBGL] });
    const postPipe = (entry, blend) => d.createRenderPipeline({
      label: entry, layout: postLayout,
      vertex: { module: mBloom, entryPoint: 'vs' },
      fragment: { module: mBloom, entryPoint: entry, targets: [{ format: HDR, blend }] },
      primitive: { topology: 'triangle-list' },
    });
    this.prefilterPipe = postPipe('fsPrefilter');
    this.downPipe = postPipe('fsDown');
    this.upPipe = postPipe('fsUp', additive);
    this.compPipe = d.createRenderPipeline({
      label: 'composite', layout: d.createPipelineLayout({ bindGroupLayouts: [this.compBGL] }),
      vertex: { module: mComp, entryPoint: 'vs' },
      fragment: { module: mComp, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
    });
    // Screen-space passes (occlusion, reflections, haze): one layout, a bind group a pass.
    const tex = { texture: { sampleType: 'float' } }, FR = GPUShaderStage.FRAGMENT;
    this.fxBGL = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: FR, buffer: { type: 'uniform' } }, { binding: 1, visibility: FR, ...tex }, { binding: 2, visibility: FR, ...tex },
        { binding: 3, visibility: FR, sampler: { type: 'filtering' } }, { binding: 4, visibility: FR, ...tex }, { binding: 5, visibility: FR, ...tex },
        { binding: 6, visibility: FR, ...tex }, { binding: 7, visibility: FR, ...tex }, { binding: 8, visibility: FR, sampler: { type: 'filtering' } },
        { binding: 9, visibility: FR, buffer: { type: 'uniform' } },
      ],
    });
    const fxLayout = d.createPipelineLayout({ bindGroupLayouts: [this.fxBGL] });
    const fxPipe = (entry, format) => d.createRenderPipeline({
      label: entry, layout: fxLayout,
      vertex: { module: mFx, entryPoint: 'vs' },
      fragment: { module: mFx, entryPoint: entry, targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    this.aoPipe = fxPipe('fsAO', 'rg16float'); this.aoBlurPipe = fxPipe('fsAOBlur', 'rg16float');
    this.ssrPipe = fxPipe('fsSSR', HDR); this.hazePipe = fxPipe('fsHaze', HDR); this.applyPipe = fxPipe('fsApply', HDR);
    this.shadowBG = d.createBindGroup({ layout: this.shadowBGL, entries: [{ binding: 0, resource: { buffer: this.globalsBuf } }] });
    this.resize();
    // The sign atlas is drawn locally; surface textures and the sky stream in afterwards.
    try { this.tex.signs = makeSignAtlas(d); this.signsReady = true; } catch (e) { console.warn('Sign atlas failed', e); }
    this.loadTextures();
  }

  async loadTextures() {
    try {
      const [mats, sky] = await Promise.all([loadMaterials(this.device), loadSky(this.device)]);
      this.tex.col = mats.col; this.tex.nrm = mats.nrm; this.tex.sky = sky;
      this.texReady = true;
      this.makeSceneBG();
      this.makeFxBG();
      // An optional detail failure leaves the CC0 surfaces and sky usable.
      try {
        const detail = await loadDetail(this.device), previous = this.tex.detail;
        this.tex.detail = detail; this.makeSceneBG(); previous.destroy();
      } catch (error) { console.warn('Meridian detail unavailable:', error.message); }
      try {
        // Use the compact mip chain on touch-first and compatibility devices.
        const compact = this.samples === 1 || matchMedia('(pointer: coarse)').matches;
        const scene = await loadSceneMaterials(this.device, compact ? 256 : 512);
        const previous = this.tex.scene;
        this.tex.scene = scene; this.makeSceneBG(); previous.destroy();
      } catch (error) { console.warn('District textures unavailable:', error.message); }
    } catch (e) { console.warn('Textures unavailable, using procedural surfaces:', e.message); }
  }

  makeSceneBG() {
    if (!this.surfTex) return;
    const t = this.tex, arr = (x) => x.createView({ dimension: '2d-array' });
    this.sceneBG = this.device.createBindGroup({
      layout: this.sceneBGL,
      entries: [
        { binding: 0, resource: { buffer: this.globalsBuf } }, { binding: 1, resource: this.zoneTex.createView() },
        { binding: 2, resource: this.surfTex.createView() }, { binding: 3, resource: this.shadowView }, { binding: 4, resource: this.shadowSampler },
        { binding: 5, resource: arr(t.col) }, { binding: 6, resource: arr(t.nrm) }, { binding: 7, resource: this.texSampler },
        { binding: 8, resource: t.sky.createView() }, { binding: 9, resource: t.signs.createView() }, { binding: 10, resource: arr(t.detail) },
        { binding: 11, resource: arr(t.scene) }, { binding: 12, resource: this.coverTex.createView() },
        { binding: 13, resource: this.floorTex.createView() },
      ],
    });
  }

  setWorld(world) {
    const d = this.device;
    this.world = world;
    for (const b of this.staticBufs) if (b) b.destroy();
    this.staticBufs = world.shapes.map((s, shape) => {
      if (!s.data.length) return null;
      // Ramp treads drop half a step under the smooth slabs the scene lays over them.
      const data = shape === 0 ? lowerRampTreads(world, s.data) : s.data;
      const buf = d.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(buf, 0, data);
      return buf;
    });
    // R is danger; G is the visual district. Keep them independent at crossings.
    const z = new Uint8Array(32 * 32 * 2);
    for (let bz = 0; bz < world.n; bz++) for (let bx = 0; bx < world.n; bx++) {
      const i = bz * world.n + bx, dst = 2 * (bz * 32 + bx);
      z[dst] = world.zone[i]; z[dst + 1] = (world.look || world.style)[i];
    }
    d.queue.writeTexture({ texture: this.zoneTex }, z, { bytesPerRow: 64 }, [32, 32]);
    // Surface map: one byte per square metre. Rows are padded to 256 bytes for the copy.
    if (this.surfTex) this.surfTex.destroy();
    const S = world.size, stride = Math.ceil(S / 256) * 256;
    this.surfTex = d.createTexture({ size: [S, S], format: 'r8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    const src = new Uint8Array(stride * S);
    for (let y = 0; y < S; y++) src.set(world.surface.subarray(y * S, (y + 1) * S), y * stride);
    // The high bit only exists in the GPU copy. Crossings and road markings take precedence.
    for (const [x0, z0, x1, z1] of world.freightYards) {
      for (let z = Math.floor(z0); z < z1; z++) for (let x = Math.floor(x0); x < x1; x++) {
        const i = z * stride + x;
        if (src[i] === SURF.ROAD) src[i] |= 128;
      }
    }
    d.queue.writeTexture({ texture: this.surfTex }, src, { bytesPerRow: stride }, [S, S]);
    // Rain shelter, built once per world: two bytes per texel, rows padded for the copy.
    if (this.coverTex) this.coverTex.destroy();
    const cover = coverOf(world), CN = cover.size, cstride = Math.ceil(CN * 2 / 256) * 256;
    this.coverTex = d.createTexture({ size: [CN, CN], format: 'rg8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    let csrc = cover.data;
    if (cstride !== CN * 2) { csrc = new Uint8Array(cstride * CN); for (let y = 0; y < CN; y++) csrc.set(cover.data.subarray(y * CN * 2, (y + 1) * CN * 2), y * cstride); }
    d.queue.writeTexture({ texture: this.coverTex }, csrc, { bytesPerRow: cstride }, [CN, CN]);
    // Floor map (doc 64 Package 8): floor + 64 in 0.25 m units and the height mark per cell,
    // and the ground planes: the street plane over the whole map, then one per level.
    if (this.floorTex) this.floorTex.destroy();
    const fstride = Math.ceil(S * 2 / 256) * 256, fsrc = new Uint8Array(fstride * S), F = world.floor, M = world.hmark;
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) { const i = z * S + x, o = z * fstride + x * 2; fsrc[o] = F[i] + 64; fsrc[o + 1] = M ? M[i] : 0; }
    this.floorTex = d.createTexture({ size: [S, S], format: 'rg8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    d.queue.writeTexture({ texture: this.floorTex }, fsrc, { bytesPerRow: fstride }, [S, S]);
    const planes = world.planes || [], pd = new Float32Array((planes.length + 1) * 8);
    pd.set([-900, -900, S + 900, S + 900, 0, 1, 0, 0]);
    planes.forEach((q, k) => pd.set([q.x0, q.z0, q.x1, q.z1, q.y, q.deck ? 2 : 0, 0, 0], (k + 1) * 8));
    if (this.planeBuf) this.planeBuf.destroy();
    this.planeBuf = d.createBuffer({ size: pd.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.planeBuf, 0, pd);
    this.planeCount = planes.length + 1;
    this.makeSceneBG();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * this.quality;
    const w = Math.max(2, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(2, Math.floor(this.canvas.clientHeight * dpr));
    if (w === this.width && h === this.height) return;
    this.width = w; this.height = h;
    this.canvas.width = w; this.canvas.height = h;
    const d = this.device;
    for (const t of [this.msaaTex, this.depthTex, this.hdrTex, this.blurA, this.blurB, this.surfMsaa, this.surfaceTex, this.litTex, this.aoA, this.aoB, this.ssrTex, this.hazeTex, ...(this.bloomTex || [])]) if (t) t.destroy();
    const RT = GPUTextureUsage.RENDER_ATTACHMENT;
    this.msaaTex = this.samples > 1 ? d.createTexture({ size: [w, h], format: HDR, sampleCount: this.samples, usage: RT }) : null;
    this.depthTex = d.createTexture({ size: [w, h], format: 'depth24plus', sampleCount: this.samples, usage: RT });
    this.hdrTex = d.createTexture({ size: [w, h], format: HDR, usage: RT | GPUTextureUsage.TEXTURE_BINDING });
    // The surface buffer beside the frame, and the half- and quarter-size targets of the
    // screen-space passes. litTex is the frame with them applied: bloom, blur and the
    // composite read that one.
    const RS = RT | GPUTextureUsage.TEXTURE_BINDING, hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    this.surfMsaa = this.samples > 1 ? d.createTexture({ size: [w, h], format: SURF_FMT, sampleCount: this.samples, usage: RT }) : null;
    this.surfaceTex = d.createTexture({ size: [w, h], format: SURF_FMT, usage: RS });
    this.litTex = d.createTexture({ size: [w, h], format: HDR, usage: RS });
    this.aoA = d.createTexture({ size: [hw, hh], format: 'rg16float', usage: RS });
    this.aoB = d.createTexture({ size: [hw, hh], format: 'rg16float', usage: RS });
    this.ssrTex = d.createTexture({ size: [hw, hh], format: HDR, usage: RS });
    this.hazeTex = d.createTexture({ size: [Math.max(1, w >> 2), Math.max(1, h >> 2)], format: HDR, usage: RS });
    this.surfMsaaView = this.surfMsaa?.createView(); this.surfaceView = this.surfaceTex.createView(); this.litView = this.litTex.createView();
    this.aoAView = this.aoA.createView(); this.aoBView = this.aoB.createView(); this.ssrView = this.ssrTex.createView(); this.hazeView = this.hazeTex.createView();
    this.msaaView = this.msaaTex?.createView();
    this.depthView = this.depthTex.createView();
    this.hdrView = this.hdrTex.createView();
    this.bloomTex = []; this.bloomView = []; this.bloomBG = [];
    let bw = w, bh = h;
    for (let i = 0; i < BLOOM_MIPS; i++) {
      bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
      const t = d.createTexture({ size: [bw, bh], format: HDR, usage: RT | GPUTextureUsage.TEXTURE_BINDING });
      this.bloomTex.push(t);
      this.bloomView.push(t.createView());
    }
    const bg = (view) => d.createBindGroup({ layout: this.postBGL, entries: [{ binding: 0, resource: view }, { binding: 1, resource: this.sampler }] });
    // Two-step blurred copy of the frame for depth of field and sharpening.
    this.blurA = d.createTexture({ size: [Math.max(1, w >> 1), Math.max(1, h >> 1)], format: HDR, usage: RT | GPUTextureUsage.TEXTURE_BINDING });
    this.blurB = d.createTexture({ size: [Math.max(1, w >> 2), Math.max(1, h >> 2)], format: HDR, usage: RT | GPUTextureUsage.TEXTURE_BINDING });
    this.blurAView = this.blurA.createView(); this.blurBView = this.blurB.createView();
    this.blurABG = bg(this.blurAView);
    this.hdrBG = bg(this.litView);
    this.bloomBG = this.bloomView.map(bg);
    this.compBG = d.createBindGroup({
      layout: this.compBGL,
      entries: [
        { binding: 0, resource: this.litView }, { binding: 1, resource: this.sampler },
        { binding: 2, resource: this.bloomView[0] }, { binding: 3, resource: { buffer: this.postBuf } }, { binding: 4, resource: this.blurBView },
      ],
    });
    this.makeFxBG();
  }

  // Bind groups for the screen-space passes. They name size-dependent targets and the sky,
  // so they are rebuilt on a resize and when the sky texture arrives.
  makeFxBG() {
    if (!this.litView || !this.fxBGL) return;
    const d = this.device, sky = this.tex.sky.createView();
    if (!this.blackTex) { this.blackTex = d.createTexture({ size: [1, 1], format: HDR, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT }); this.blackView = this.blackTex.createView(); }
    const bg = (a, b, c) => d.createBindGroup({
      layout: this.fxBGL,
      entries: [
        { binding: 0, resource: { buffer: this.globalsBuf } }, { binding: 1, resource: this.hdrView }, { binding: 2, resource: this.surfaceView },
        { binding: 3, resource: this.sampler }, { binding: 4, resource: a }, { binding: 5, resource: b }, { binding: 6, resource: c },
        { binding: 7, resource: sky }, { binding: 8, resource: this.texSampler }, { binding: 9, resource: { buffer: this.fxBuf } },
      ],
    });
    const K = this.blackView;
    this.fxBG = { plain: bg(K, K, K), blur: bg(this.aoAView, K, K), apply: bg(this.aoBView, this.ssrView, this.hazeView) };
  }

  // Static world instances near the focus. Blocks in a row are contiguous per shape.
  // cull: [eyeX, eyeZ, fwdX, fwdZ] skips blocks that lie wholly behind the camera.
  drawStatic(pass, fx, fz, reach, cull = null) {
    const w = this.world;
    let draws = 0, inst = 0;
    const fbx = Math.floor(fx / 100), fbz = Math.floor(fz / 100);
    const z0 = Math.max(0, fbz - reach), z1 = Math.min(w.n - 1, fbz + reach), b0 = Math.max(0, fbx - reach), b1 = Math.min(w.n - 1, fbx + reach);
    for (let s = 0; s < SHAPE_COUNT; s++) {
      const buf = this.staticBufs[s];
      if (!buf) continue;
      const range = w.shapes[s].range, [first, count] = this.meshRanges[s];
      pass.setVertexBuffer(1, buf);
      for (let bz = z0; bz <= z1; bz++) {
        if (cull) {
          for (let bx = b0; bx <= b1; bx++) {
            if ((bx * 100 + 50 - cull[0]) * cull[2] + (bz * 100 + 50 - cull[1]) * cull[3] < -78) continue;
            const o = (bz * w.n + bx) * 2, n = range[o + 1];
            if (n > 0) { pass.draw(count, n, first, range[o]); draws++; inst += n; }
          }
          continue;
        }
        const start = range[(bz * w.n + b0) * 2], endI = (bz * w.n + b1) * 2;
        const n = range[endI] + range[endI + 1] - start;
        if (n > 0) { pass.draw(count, n, first, start); draws++; inst += n; }
      }
    }
    return [draws, inst];
  }
  drawDynamic(pass, frame) {
    let draws = 0;
    pass.setVertexBuffer(1, this.dynBuf);
    for (let s = 0; s < SHAPE_COUNT; s++) {
      const n = frame.counts[s];
      if (!n) continue;
      const [first, count] = this.meshRanges[s];
      pass.draw(count, n, first, frame.offsets[s]);
      draws++;
    }
    return draws;
  }

  // frame: { dyn[shape] Float32Array, counts[shape], xray, xrayCount, sprites, spriteCount, focusX, focusZ }
  render(frame) {
    if (this.lost || !this.sceneBG) return;
    this.resize();
    const d = this.device, q = d.queue;
    q.writeBuffer(this.globalsBuf, 0, this.globals);
    q.writeBuffer(this.postBuf, 0, this.post);
    // Screen-space pass settings: strengths, the occlusion radius, sample and step counts.
    const O = this.opts, fx = this.fx;
    fx[0] = 0.85 * O.ao; fx[1] = O.ssr; fx[2] = O.haze; fx[3] = 1.1;
    fx[4] = O.ao > 1 ? 14 : 9; fx[5] = O.ssr > 1 ? 40 : 28; fx[6] = this.texReady && O.textures ? 1 : 0; fx[7] = this.fxDebug || 0;
    q.writeBuffer(this.fxBuf, 0, fx);
    // Pack the per-shape buckets and the x-ray list into one buffer.
    let off = 0, total = 0;
    frame.offsets = frame.offsets || new Array(SHAPE_COUNT).fill(0);
    for (let s = 0; s < SHAPE_COUNT; s++) {
      const n = Math.min(frame.counts[s], MAX_DYN - off - 64);
      frame.counts[s] = Math.max(0, n);
      frame.offsets[s] = off;
      if (n > 0) { q.writeBuffer(this.dynBuf, off * INST_FLOATS * 4, frame.dyn[s], 0, n * INST_FLOATS); off += n; }
    }
    total = off;
    const xrayCount = Math.min(frame.xrayCount, MAX_DYN - off);
    const xrayOff = off;
    if (xrayCount > 0) q.writeBuffer(this.dynBuf, off * INST_FLOATS * 4, frame.xray, 0, xrayCount * INST_FLOATS);
    const spriteCount = Math.min(frame.spriteCount, MAX_SPRITES);
    if (spriteCount) q.writeBuffer(this.spriteBuf, 0, frame.sprites, 0, spriteCount * SPRITE_FLOATS);

    const enc = d.createCommandEncoder();
    let draws = 0, inst = total;

    // Shadow map from the key light.
    const sp = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: this.shadowView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
    sp.setPipeline(this.shadowPipe);
    sp.setBindGroup(0, this.shadowBG);
    sp.setVertexBuffer(0, this.meshBuf);
    if (this.opts.shadows) {
      if (this.world) draws += this.drawStatic(sp, frame.focusX, frame.focusZ, 1)[0];
      draws += this.drawDynamic(sp, frame);
    }
    sp.end();

    const pass = enc.beginRenderPass({
      colorAttachments: [
        { view: this.msaaView || this.hdrView, resolveTarget: this.msaaView ? this.hdrView : undefined, loadOp: 'clear', storeOp: this.msaaView ? 'discard' : 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } },
        // Cleared to "faces up, rough, mirrors nothing": the sky and anything unlit.
        { view: this.surfMsaaView || this.surfaceView, resolveTarget: this.surfMsaaView ? this.surfaceView : undefined, loadOp: 'clear', storeOp: this.surfMsaaView ? 'discard' : 'store', clearValue: { r: 0.5, g: 0.5, b: 1, a: 0 } },
      ],
      depthStencilAttachment: { view: this.depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
    });
    pass.setBindGroup(0, this.sceneBG);
    pass.setPipeline(this.skyPipe);
    pass.draw(3);
    pass.setPipeline(this.groundPipe);
    pass.setVertexBuffer(0, this.planeBuf);
    pass.draw(6, this.planeCount);
    draws += 2;
    pass.setPipeline(this.boxPipe);
    pass.setVertexBuffer(0, this.meshBuf);
    if (this.world) { const r = this.drawStatic(pass, frame.focusX, frame.focusZ, Math.max(2, Math.round((frame.reach || 10) * this.opts.reach)), frame.cull); draws += r[0]; inst += r[1]; }
    draws += this.drawDynamic(pass, frame);
    if (xrayCount > 0) {
      pass.setPipeline(this.xrayPipe);
      pass.setVertexBuffer(1, this.dynBuf);
      pass.draw(this.meshRanges[0][1], xrayCount, this.meshRanges[0][0], xrayOff);
      draws++;
    }
    if (spriteCount) {
      pass.setPipeline(this.spritePipe);
      pass.setVertexBuffer(0, this.spriteBuf);
      pass.draw(6, spriteCount);
      draws++;
    }
    pass.end();

    // Bloom: prefilter, downsample chain, additive upsample chain.
    const blit = (pipe, bindGroup, view, load) => {
      const p = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: load ? 'load' : 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      p.setPipeline(pipe);
      p.setBindGroup(0, bindGroup);
      p.draw(3);
      p.end();
    };
    // Screen-space passes, then the frame with them applied. A pass that is switched off is
    // cleared instead of run, so the apply step always has something neutral to read.
    const fxPass = (pipe, bindGroup, view, on, clear) => {
      const p = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: clear }] });
      if (on) { p.setPipeline(pipe); p.setBindGroup(0, bindGroup); p.draw(3); }
      p.end();
    };
    const zero = { r: 0, g: 0, b: 0, a: 0 }, open = { r: 1, g: 1, b: 0, a: 1 };
    fxPass(this.aoPipe, this.fxBG.plain, this.aoAView, O.ao > 0, open);
    fxPass(this.aoBlurPipe, this.fxBG.blur, this.aoBView, O.ao > 0, open);
    fxPass(this.ssrPipe, this.fxBG.plain, this.ssrView, O.ssr > 0, zero);
    fxPass(this.hazePipe, this.fxBG.plain, this.hazeView, O.haze > 0, zero);
    fxPass(this.applyPipe, this.fxBG.apply, this.litView, true, zero);
    blit(this.downPipe, this.hdrBG, this.blurAView, false);
    blit(this.downPipe, this.blurABG, this.blurBView, false);
    blit(this.prefilterPipe, this.hdrBG, this.bloomView[0], false);
    for (let i = 1; i < BLOOM_MIPS; i++) blit(this.downPipe, this.bloomBG[i - 1], this.bloomView[i], false);
    for (let i = BLOOM_MIPS - 1; i > 0; i--) blit(this.upPipe, this.bloomBG[i], this.bloomView[i - 1], true);

    const fin = enc.beginRenderPass({ colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store' }] });
    fin.setPipeline(this.compPipe);
    fin.setBindGroup(0, this.compBG);
    fin.draw(3);
    fin.end();
    q.submit([enc.finish()]);
    this.stats.draws = draws + BLOOM_MIPS * 2;
    this.stats.inst = inst;
    this.stats.sprites = spriteCount;
  }
}
