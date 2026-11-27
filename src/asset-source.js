// The portable HTML build supplies the same relative paths as the development server.
const data = globalThis.document?.getElementById('embedded-textures');
const embedded = data ? JSON.parse(data.textContent) : null;
const mime = (path) => path.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
function encoded(path) {
  if (!embedded[path]) throw new Error(`Missing embedded asset: ${path}`);
  return embedded[path];
}
export const assetUrl = (path) => embedded ? `data:${mime(path)};base64,${encoded(path)}` : new URL(path, document.baseURI).href;
export async function bitmap(path) {
  if (embedded) {
    const bytes = Uint8Array.from(atob(encoded(path)), c => c.charCodeAt(0));
    return createImageBitmap(new Blob([bytes], { type: mime(path) }));
  }
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return createImageBitmap(await response.blob());
}
