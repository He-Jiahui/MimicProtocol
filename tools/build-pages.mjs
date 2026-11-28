import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { TEXTURE_PATHS } from '../src/render/assets.js';
import { HUD_ATLASES } from '../src/ui/icons.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const entry = 'src/main.js';
const stylesheet = 'src/ui/style.css';
const template = await readFile(join(root, 'index.html'), 'utf8');
const scriptTag = `<script type="module" src="${entry}"></script>`;
const styleTag = `<link rel="stylesheet" href="${stylesheet}">`;
if (!template.includes(scriptTag) || !template.includes(styleTag)) {
  throw new Error('index.html is missing the expected stylesheet or entry script tag.');
}

await rm(dist, { recursive: true, force: true });
async function emit(path, bytes) {
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const ext = extname(path);
  const url = `${path.slice(0, -ext.length)}.${hash}${ext}`;
  const file = join(dist, url);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return url;
}

const bundle = await build({ absWorkingDir: root, entryPoints: [entry], bundle: true, format: 'esm', minify: true, write: false });
const paths = [...TEXTURE_PATHS, ...Object.values(HUD_ATLASES)];
const [js, css, assets] = await Promise.all([
  emit('assets/main.js', bundle.outputFiles[0].contents),
  readFile(join(root, stylesheet)).then(bytes => emit('assets/style.css', bytes)),
  Promise.all(paths.map(async path => [path, await emit(path, await readFile(join(root, path)))])),
]);
// Keep the URL map in the index so changing an image never invalidates the JS bundle.
const manifest = JSON.stringify(Object.fromEntries(assets)).replaceAll('<', '\\u003c');
const html = template
  .replace(styleTag, `<link rel="stylesheet" href="${css}">`)
  .replace(scriptTag, () => `<!-- Asset credits: assets/CREDITS.md -->\n<script type="application/json" id="asset-paths">${manifest}</script>\n<script type="module" src="${js}"></script>`);
await copyFile(join(root, 'assets/CREDITS.md'), join(dist, 'assets/CREDITS.md'));
await writeFile(join(dist, 'index.html'), html);
console.log(`Built dist/index.html (${Buffer.byteLength(html)} bytes), JS, CSS and ${assets.length} image files.`);
