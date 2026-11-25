import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { TEXTURE_PATHS } from '../src/render/assets.js';

const root = new URL('../', import.meta.url);
const stylesheet = 'src/ui/style.css';
const entry = 'src/main.js';
const [template, css, credits, textures, bundle] = await Promise.all([
  readFile(new URL('index.html', root), 'utf8'),
  readFile(new URL(stylesheet, root), 'utf8'),
  readFile(new URL('assets/CREDITS.md', root), 'utf8'),
  Promise.all(TEXTURE_PATHS.map(async (path) => [path, (await readFile(new URL(path, root))).toString('base64')])),
  build({
    absWorkingDir: fileURLToPath(root),
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    write: false,
    metafile: true,
  }),
]);

const stylesheetTag = `<link rel="stylesheet" href="${stylesheet}">`;
const scriptTag = `<script type="module" src="${entry}"></script>`;
if (!template.includes(stylesheetTag) || !template.includes(scriptTag)) {
  throw new Error('index.html is missing the expected stylesheet or entry script tag.');
}
if (bundle.outputFiles.length !== 1 || Object.values(bundle.metafile.outputs).some((output) => output.imports.length)) {
  throw new Error('The browser bundle must be one script without external imports.');
}
const javascript = bundle.outputFiles[0].text;
if (/<\/style/i.test(css) || /<\/script/i.test(javascript) || credits.includes('-->')) {
  throw new Error('An embedded resource would prematurely close its HTML container.');
}

const html = template
  .replace(stylesheetTag, () => `<style>\n${css}\n</style>`)
  .replace(scriptTag, () => [
    `<!--\n${credits}\n-->`,
    `<script type="application/json" id="embedded-textures">\n${JSON.stringify(Object.fromEntries(textures), null, 2)}\n</script>`,
    `<script type="module">\n${javascript}\n</script>`,
  ].join('\n'));

const name = 'DarkSignal.html';
const output = new URL(name, root);
const temporary = new URL(`.DarkSignal-${randomUUID()}.tmp`, root);
try {
  await writeFile(temporary, html, { flag: 'wx' });
  try {
    await rename(temporary, output);
  } catch (error) {
    if (process.platform !== 'win32' || !['EPERM', 'EACCES'].includes(error.code)) throw error;
    await writeFile(output, html);
  }
} finally {
  await rm(temporary, { force: true });
}
console.log(`Built ${name} (${(Buffer.byteLength(html) / 1e6).toFixed(1)} MB, ${textures.length} embedded textures).`);
