// Pages maps source paths to fingerprinted files; the offline build supplies image bytes.
const data = globalThis.document?.getElementById('embedded-textures');
const embedded = data ? JSON.parse(data.textContent) : null;
const paths = globalThis.document?.getElementById('asset-paths');
const manifest = paths ? JSON.parse(paths.textContent) : null;
const filePath = path => manifest?.[path] ?? path;
const mime = (path) => path.endsWith('.webp') ? 'image/webp' : path.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg';
function encoded(path) {
  if (!embedded[path]) throw new Error(`Missing embedded asset: ${path}`);
  return embedded[path];
}
export const assetUrl = (path) => embedded ? `data:${mime(path)};base64,${encoded(path)}` : new URL(filePath(path), document.baseURI).href;
export async function bitmap(path) {
  if (embedded) {
    const bytes = Uint8Array.from(atob(encoded(path)), c => c.charCodeAt(0));
    return createImageBitmap(new Blob([bytes], { type: mime(path) }));
  }
  const response = await fetch(filePath(path));
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return createImageBitmap(await response.blob());
}
