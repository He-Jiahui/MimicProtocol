// Minimal static file server for local development. No dependencies.
//
//   node tools/serve.mjs [port]          http on localhost (WebGPU works on localhost)
//   node tools/serve.mjs [port] --lan    also https on port+1 for other devices
//
// WebGPU needs a secure context: https, or http on localhost. A phone or another PC
// opening http://<this-machine-ip>:port gets no navigator.gpu at all, so --lan serves
// https with a self-signed certificate (created once with openssl in tools/.cert).
import { createServer } from 'node:http';
import { createServer as createHttps } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const lan = args.includes('--lan');
const port = Number(process.env.PORT || args.find((a) => /^\d+$/.test(a)) || 5173);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.wgsl': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

async function handle(req, res) {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root) || path.includes('/.cert/')) { res.writeHead(403).end('Forbidden'); return; }
    const info = await stat(file);
    if (info.isDirectory()) { res.writeHead(302, { Location: path + '/' }).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    }).end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

function certificate(ips) {
  const dir = join(root, 'tools', '.cert');
  const key = join(dir, 'key.pem'), cert = join(dir, 'cert.pem'), stamp = join(dir, 'hosts.txt');
  const hosts = ['localhost', ...ips].join(',');
  // Regenerate when the machine's addresses change, so the certificate names them.
  if (!existsSync(key) || !existsSync(cert) || !existsSync(stamp) || readFileSync(stamp, 'utf8') !== hosts) {
    mkdirSync(dir, { recursive: true });
    const san = ['DNS:localhost', 'IP:127.0.0.1', ...ips.map((ip) => `IP:${ip}`)].join(',');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365', '-keyout', key, '-out', cert,
      '-subj', '/CN=mimic-protocol-dev', '-addext', `subjectAltName=${san}`], { stdio: 'ignore' });
    writeFileSync(stamp, hosts);
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

// A busy port usually means another copy of this server is already running.
const busy = (what, p) => (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${p} is already in use, so ${what} was not started here. Another dev server is probably running: use it, or pass a different port (node tools/serve.mjs 5200${lan ? ' --lan' : ''}).`);
  else console.error(`${what} failed: ${e.message}`);
};
createServer(handle).on('error', busy('http', port)).listen(port, () => console.log(`Mimic Protocol demo: http://localhost:${port}`));

if (lan) {
  const ips = lanAddresses();
  try {
    createHttps(certificate(ips), handle).on('error', busy('https', port + 1)).listen(port + 1, () => {
      console.log('\nOther devices on this network (WebGPU needs https):');
      for (const ip of ips) console.log(`  https://${ip}:${port + 1}`);
      console.log('The certificate is self-signed: choose Advanced, then Proceed, once per device.');
    });
  } catch (e) {
    console.error(`Could not start https (is openssl installed?): ${e.message}`);
  }
}
