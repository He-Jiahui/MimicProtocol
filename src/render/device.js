// Let the browser choose a GPU, including mobile GPUs that expose only compatibility mode.
export async function requestGraphicsDevice(secure, gpu) {
  const fail = (code, message) => Object.assign(new Error(message), { code });
  if (!secure) throw fail('insecure', 'This page is not a secure context.');
  if (!gpu?.requestAdapter) throw fail('unsupported', 'This browser does not expose WebGPU.');
  let adapter, reason;
  for (const compatibility of [false, true]) {
    try { adapter = compatibility ? await gpu.requestAdapter({ featureLevel: 'compatibility' }) : await gpu.requestAdapter(); }
    catch (error) { reason = error; }
    if (!adapter) continue;
    try { return { device: await adapter.requestDevice(), compatibility }; }
    catch (error) { throw fail('device', `The GPU adapter could not create a device: ${error.message}`); }
  }
  throw reason ? fail('adapter', `WebGPU adapter request failed: ${reason.message}`) : fail('adapter', 'The browser returned no GPU adapter.');
}
