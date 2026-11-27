// Texture loading and generated atlases. Surface textures and the sky panorama are
// credited in assets/CREDITS.md; the sign atlas is drawn here.
import { bitmap as image } from '../asset-source.js';

export const MATERIALS = ['asphalt', 'pavement', 'brick', 'plaster', 'facade', 'metal', 'cobble'];
const TEX = 1024;
const MATERIAL_BASE = 'assets/textures/';
const SKY_PATH = 'assets/sky/night.jpg';
const materialPaths = (base, name) => ['col', 'nrm', 'rgh'].map((kind) => `${base}${name}_${kind}.jpg`);
// Consecutive layers hold colour modulation and packed normal XY / roughness.
export const DETAIL_MATERIALS = ['weave', 'ceramic', 'chitin', 'membrane', 'enamel', 'freight', 'rainbed', 'shutter'];
const detailPaths = DETAIL_MATERIALS.flatMap(name => ['color', 'nr'].map(kind => `${MATERIAL_BASE}meridian/${name}-${kind}.webp`));
// District surfaces are graded tint multipliers, with OpenGL normal XY and roughness.
export const SCENE_MATERIALS = ['quay-stone', 'arcade-slate', 'court-pavers', 'lobby-terrazzo', 'apron', 'ribbed-cladding',
  'checkerplate', 'street-bark', 'planting-soil', 'wheel-rubber', 'plant-steel', 'cab-glass'];
const scenePaths = SCENE_MATERIALS.flatMap(name => ['color', 'nr'].map(kind =>
  `${MATERIAL_BASE}${name === 'cab-glass' ? 'meridian/' : ''}${name}-${kind}.webp`));
export const TEXTURE_PATHS = [...MATERIALS.flatMap(name => materialPaths(MATERIAL_BASE, name)), SKY_PATH, ...detailPaths, ...scenePaths];

const mipCount = (w, h) => Math.floor(Math.log2(Math.max(w, h))) + 1;

// Upload a canvas or bitmap to one layer with a full mip chain (scaled on a 2D canvas).
function uploadMips(device, texture, source, w, h, layer = 0) {
  const levels = texture.mipLevelCount;
  let prev = source;
  for (let m = 0; m < levels; m++) {
    const mw = Math.max(1, w >> m), mh = Math.max(1, h >> m);
    const c = new OffscreenCanvas(mw, mh), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(prev, 0, 0, mw, mh);
    device.queue.copyExternalImageToTexture({ source: c }, { texture, mipLevel: m, origin: [0, 0, layer] }, [mw, mh]);
    prev = c;
  }
}

// Colour array (sRGB) and a packed array: normal xy in RG, roughness in B.
export async function loadMaterials(device, base = MATERIAL_BASE) {
  const usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT;
  const size = [TEX, TEX, MATERIALS.length], mipLevelCount = mipCount(TEX, TEX);
  const col = device.createTexture({ size, format: 'rgba8unorm-srgb', usage, mipLevelCount });
  const nrm = device.createTexture({ size, format: 'rgba8unorm', usage, mipLevelCount });
  await Promise.all(MATERIALS.map(async (name, layer) => {
    const [c, n, r] = await Promise.all(materialPaths(base, name).map(image));
    uploadMips(device, col, c, TEX, TEX, layer);
    const cv = new OffscreenCanvas(TEX, TEX), g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(n, 0, 0, TEX, TEX);
    const a = g.getImageData(0, 0, TEX, TEX);
    g.drawImage(r, 0, 0, TEX, TEX);
    const b = g.getImageData(0, 0, TEX, TEX).data;
    for (let i = 0; i < a.data.length; i += 4) { a.data[i + 2] = b[i]; a.data[i + 3] = 255; }
    g.putImageData(a, 0, 0);
    uploadMips(device, nrm, cv, TEX, TEX, layer);
  }));
  return { col, nrm };
}

// Small mesh detail uses its own 256px array instead of padding every layer to 1K.
export const loadDetail = device => loadPairs(device, detailPaths, 256);
export const loadSceneMaterials = (device, size) => loadPairs(device, scenePaths, size);

async function loadPairs(device, paths, size) {
  const texture = device.createTexture({ size: [size, size, paths.length], format: 'rgba8unorm',
    mipLevelCount: mipCount(size, size), usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
  try {
    for (const [layer, path] of paths.entries()) {
      const source = await image(path);
      uploadMips(device, texture, source, size, size, layer);
      source.close();
    }
    return texture;
  } catch (error) { texture.destroy(); throw error; }
}

export async function loadSky(device, url = SKY_PATH) {
  const img = await image(url), w = Math.min(img.width, 4096), h = Math.min(img.height, 2048);
  const tex = device.createTexture({ size: [w, h], format: 'rgba8unorm-srgb', mipLevelCount: mipCount(w, h), usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
  uploadMips(device, tex, img, w, h);
  return tex;
}

// ---- Sign atlas: shop boards, vertical blade signs and pictograms ----
// Layout (2048 x 2048): boards 4 x 16 cells of 512 x 64 in the top half, blades 32
// cells of 64 x 512 below them, pictograms 16 x 4 cells of 128 x 128 at the bottom.
const BOARDS = ['RAMEN', 'BAR NOVA', 'HOTEL', 'OPEN 24H', 'PHARMACY', 'KARAOKE', 'ARCADE', 'NOODLES', 'CAFE LUNA', 'BOOKS', 'TATTOO', 'CLINIC', 'ラーメン', '居酒屋', 'カラオケ', 'ホテル',
  '珈琲店', '電気街', '焼肉', '寿司', '喫茶', '銀行', '駐車場', '薬局', 'PAWN', 'CYBER DEN', 'SOFT / HARD', 'LAUNDRY', 'SAKE', 'GYOZA', 'DATA BROKER', 'REPAIRS', 'CLUB ZERO', 'SAUNA', 'OPTICS', 'PARTS',
  'MERIDIAN RAIL', 'EXIT 4', 'NO ENTRY', 'COMMAND', '夜市', '質屋', '修理', '占い', '酒場', '深夜食堂', '案内所', '両替', 'NEON MART', 'KIOSK', 'TEA HOUSE', 'TAXI', 'SYNTH', 'MODS', 'RENT', 'IMPLANTS',
  'たこ焼き', 'うどん', '串カツ', '弁当', '花屋', '本', '靴', '時計'];
const BLADES = ['居酒屋', 'ラーメン', 'カラオケ', 'ホテル', '薬', '酒', '珈琲', '焼肉', '寿司', '麻雀', '占い', '質屋', 'BAR', 'HOTEL', 'CLUB', 'SAUNA', '喫茶', '電気', '銀行', '夜市', '案内', '修理', '花', '本',
  'CAFE', 'OPEN', 'MODS', 'DATA', '深夜', '食堂', '両替', '駐車'];
const PICTOS = [['P', '#1c5fd0'], ['→', '#1c8a4a'], ['←', '#1c8a4a'], ['↑', '#1c8a4a'], ['✚', '#128f3c'], ['24', '#c0392b'], ['WC', '#2a4f8f'], ['M', '#b0271d'], ['!', '#c98a10'], ['⊘', '#b0271d'], ['♨', '#b0531d'], ['♪', '#7d2a9c'],
  ['¥', '#8a6d14'], ['★', '#9c2a6a'], ['☎', '#1c6f8a'], ['⚡', '#b89410'], ['♻', '#1c7a3a'], ['☂', '#2a5a9c'], ['✂', '#8a2a4a'], ['◎', '#444c58'], ['i', '#1c5fd0'], ['↓', '#1c8a4a'], ['EV', '#128f3c'], ['5G', '#444c58']];

export function makeSignAtlas(device) {
  const S = 2048, c = new OffscreenCanvas(S, S), g = c.getContext('2d');
  const font = (px, w = 800) => `${w} ${px}px "Hiragino Sans", "Yu Gothic", "Noto Sans CJK JP", "Noto Sans JP", "Segoe UI", system-ui, sans-serif`;
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  for (let i = 0; i < 64; i++) {
    const x = (i % 4) * 512, y = Math.floor(i / 4) * 64, t = BOARDS[i % BOARDS.length];
    g.font = font(40);
    const w = Math.min(470, g.measureText(t).width);
    g.fillText(t, x + 256, y + 34, 470);
    // A rule or end caps, so boards do not all look alike.
    g.lineWidth = 3;
    if (i % 3 === 0) { g.strokeRect(x + 8, y + 6, 496, 52); }
    else if (i % 3 === 1) { g.fillRect(x + 256 - w / 2 - 30, y + 28, 16, 8); g.fillRect(x + 256 + w / 2 + 14, y + 28, 16, 8); }
  }
  for (let i = 0; i < 32; i++) {
    const x = i * 64, y = 1024, chars = [...BLADES[i % BLADES.length]], step = Math.min(118, 480 / chars.length);
    g.font = font(Math.min(50, step * 0.86));
    chars.forEach((ch, k) => g.fillText(ch, x + 32, y + 256 - (chars.length - 1) * step / 2 + k * step, 56));
    g.lineWidth = 2; g.strokeRect(x + 4, y + 4, 56, 504);
  }
  for (let i = 0; i < 64; i++) {
    const x = (i % 16) * 128, y = 1536 + Math.floor(i / 16) * 128, [t, col] = PICTOS[i % PICTOS.length];
    g.fillStyle = col; g.beginPath(); g.roundRect(x + 8, y + 8, 112, 112, i % 2 ? 56 : 14); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#fff'; g.font = font(t.length > 1 ? 50 : 76, 900);
    g.fillText(t, x + 64, y + 68, 96);
  }
  const tex = device.createTexture({ size: [S, S], format: 'rgba8unorm', mipLevelCount: mipCount(S, S), usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
  uploadMips(device, tex, c, S, S);
  return tex;
}

// 1 x 1 stand-ins used until the real textures have loaded (or if they fail to).
export function placeholders(device) {
  const mk = (format, depth, px) => {
    const t = device.createTexture({ size: [1, 1, depth], format, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    for (let l = 0; l < depth; l++) device.queue.writeTexture({ texture: t, origin: [0, 0, l] }, new Uint8Array(px), {}, [1, 1]);
    return t;
  };
  return { scene: mk('rgba8unorm', 2, [128, 128, 128, 255]), detail: mk('rgba8unorm', detailPaths.length, [128, 128, 128, 255]), col: mk('rgba8unorm-srgb', 2, [128, 128, 128, 255]), nrm: mk('rgba8unorm', 2, [128, 128, 160, 255]), sky: mk('rgba8unorm-srgb', 1, [20, 24, 40, 255]), signs: mk('rgba8unorm', 1, [255, 255, 255, 255]) };
}
