// WebGPU renderer: a shadow pass from the key light, one HDR scene pass (4x MSAA),
// then a bloom mip chain and a tone-mapped composite. The renderer only reads
// frame data; it never touches simulation state (doc 13, section 4).

import { boxShader, shadowShader, groundShader, skyShader, spriteShader, bloomShader, compositeShader, GLOBALS_SIZE } from './shaders.js';
import { INST_FLOATS, SHAPE_COUNT } from '../sim/world.js';
import { loadMaterials, loadSky, makeSignAtlas, placeholders } from './assets.js';

const SAMPLES = 4;
const HDR = 'rgba16float';
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
    // WebGPU only exists in a secure context (https, or http on localhost).
    if (!window.isSecureContext) { const e = new Error('This page is not a secure context.'); e.code = 'insecure'; throw e; }
    if (!navigator.gpu) { const e = new Error('navigator.gpu is missing.'); e.code = 'unsupported'; throw e; }
    // Some drivers refuse the high-performance request; fall back to any adapter.
    let adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null);
    if (!adapter) adapter = await navigator.gpu.requestAdapter().catch(() => null);
    if (!adapter) { const e = new Error('The browser returned no GPU adapter.'); e.code = 'adapter'; throw e; }
    const device = await adapter.requestDevice();
    const r = new Renderer(canvas, device);
    await r.init();
    return r;
  }

  constructor(canvas, device) {
    this.canvas = canvas;
    this.device = device;
    this.ctx = canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device, format: this.format, alphaMode: 'opaque' });
    this.globals = new Float32Array(GLOBALS_SIZE / 4);
    this.post = new Float32Array(32);
    this.opts = { shadows: true, textures: true, reach: 1 };
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
    const mod = (code, label) => d.createShaderModule({ code, label });
    const mBox = mod(boxShader, 'box'), mShadow = mod(shadowShader, 'shadow'), mGround = mod(groundShader, 'ground'), mSky = mod(skyShader, 'sky');
    const mSprite = mod(spriteShader, 'sprite'), mBloom = mod(bloomShader, 'bloom'), mComp = mod(compositeShader, 'composite');
    for (const m of [mBox, mShadow, mGround, mSky, mSprite, mBloom, mComp]) {
      const info = await m.getCompilationInfo();
      for (const msg of info.messages) if (msg.type === 'error') throw new Error(await describeError(m, { message: `line ${msg.lineNum}: ${msg.message}` }));
    }

    const meshes = buildMeshes();
    this.meshRanges = meshes.ranges;
    this.meshBuf = d.createBuffer({ size: meshes.data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.meshBuf, 0, meshes.data);
    this.globalsBuf = d.createBuffer({ size: GLOBALS_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.postBuf = d.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.dynBuf = d.createBuffer({ size: MAX_DYN * INST_FLOATS * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.spriteBuf = d.createBuffer({ size: MAX_SPRITES * SPRITE_FLOATS * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.zoneTex = d.createTexture({ size: [32, 32], format: 'r8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
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
    const ms = { count: SAMPLES };

    this.boxPipe = d.createRenderPipeline({
      label: 'mesh', layout: sceneLayout, multisample: ms,
      vertex: { module: mBox, entryPoint: 'vs', buffers: meshBuffers },
      fragment: { module: mBox, entryPoint: 'fs', targets: [{ format: HDR }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: depth(true, 'less'),
    });
    this.xrayPipe = d.createRenderPipeline({
      label: 'xray', layout: sceneLayout, multisample: ms,
      vertex: { module: mBox, entryPoint: 'vs', buffers: meshBuffers },
      fragment: { module: mBox, entryPoint: 'fsXray', targets: [{ format: HDR, blend: additive }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: depth(false, 'always'),
    });
    this.shadowPipe = d.createRenderPipeline({
      label: 'shadow', layout: d.createPipelineLayout({ bindGroupLayouts: [this.shadowBGL] }),
      vertex: { module: mShadow, entryPoint: 'vs', buffers: meshBuffers },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2.5 },
    });
    this.groundPipe = d.createRenderPipeline({
      label: 'ground', layout: sceneLayout, multisample: ms,
      vertex: { module: mGround, entryPoint: 'vs' },
      fragment: { module: mGround, entryPoint: 'fs', targets: [{ format: HDR }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depth(true, 'less'),
    });
    this.skyPipe = d.createRenderPipeline({
      label: 'sky', layout: sceneLayout, multisample: ms,
      vertex: { module: mSky, entryPoint: 'vs' },
      fragment: { module: mSky, entryPoint: 'fs', targets: [{ format: HDR }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: depth(false, 'always'),
    });
    this.spritePipe = d.createRenderPipeline({
      label: 'sprite', layout: sceneLayout, multisample: ms,
      vertex: {
        module: mSprite, entryPoint: 'vs',
        buffers: [{ arrayStride: SPRITE_FLOATS * 4, stepMode: 'instance', attributes: [0, 1, 2].map((i) => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) }],
      },
      fragment: { module: mSprite, entryPoint: 'fs', targets: [{ format: HDR, blend: additive }] },
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
        { binding: 8, resource: t.sky.createView() }, { binding: 9, resource: t.signs.createView() },
      ],
    });
  }

  setWorld(world) {
    const d = this.device;
    this.world = world;
    for (const b of this.staticBufs) if (b) b.destroy();
    this.staticBufs = world.shapes.map((s) => {
      if (!s.data.length) return null;
      const buf = d.createBuffer({ size: s.data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(buf, 0, s.data);
      return buf;
    });
    const z = new Uint8Array(32 * 32);
    for (let bz = 0; bz < world.n; bz++) for (let bx = 0; bx < world.n; bx++) z[bz * 32 + bx] = world.zone[bz * world.n + bx];
    d.queue.writeTexture({ texture: this.zoneTex }, z, { bytesPerRow: 32 }, [32, 32]);
    // Surface map: one byte per square metre. Rows are padded to 256 bytes for the copy.
    if (this.surfTex) this.surfTex.destroy();
    const S = world.size, stride = Math.ceil(S / 256) * 256;
    this.surfTex = d.createTexture({ size: [S, S], format: 'r8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    let src = world.surface;
    if (stride !== S) { src = new Uint8Array(stride * S); for (let y = 0; y < S; y++) src.set(world.surface.subarray(y * S, y * S + S), y * stride); }
    d.queue.writeTexture({ texture: this.surfTex }, src, { bytesPerRow: stride }, [S, S]);
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
    for (const t of [this.msaaTex, this.depthTex, this.hdrTex, this.blurA, this.blurB, ...(this.bloomTex || [])]) if (t) t.destroy();
    const RT = GPUTextureUsage.RENDER_ATTACHMENT;
    this.msaaTex = d.createTexture({ size: [w, h], format: HDR, sampleCount: SAMPLES, usage: RT });
    this.depthTex = d.createTexture({ size: [w, h], format: 'depth24plus', sampleCount: SAMPLES, usage: RT });
    this.hdrTex = d.createTexture({ size: [w, h], format: HDR, usage: RT | GPUTextureUsage.TEXTURE_BINDING });
    this.msaaView = this.msaaTex.createView();
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
    this.hdrBG = bg(this.hdrView);
    this.bloomBG = this.bloomView.map(bg);
    this.compBG = d.createBindGroup({
      layout: this.compBGL,
      entries: [
        { binding: 0, resource: this.hdrView }, { binding: 1, resource: this.sampler },
        { binding: 2, resource: this.bloomView[0] }, { binding: 3, resource: { buffer: this.postBuf } }, { binding: 4, resource: this.blurBView },
      ],
    });
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
      colorAttachments: [{ view: this.msaaView, resolveTarget: this.hdrView, loadOp: 'clear', storeOp: 'discard', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      depthStencilAttachment: { view: this.depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
    });
    pass.setBindGroup(0, this.sceneBG);
    pass.setPipeline(this.skyPipe);
    pass.draw(3);
    pass.setPipeline(this.groundPipe);
    pass.draw(6);
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
