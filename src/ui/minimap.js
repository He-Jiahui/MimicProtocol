// Minimap and full map, drawn from the generator's surface map so streets, alleys,
// the canal and building footprints are all visible. The zone field is known from
// the start (Command satellite data) and tints the map (doc 17).

import { exitInfo } from '../sim/jobs.js';
import { EVENT_COL } from '../sim/events.js';
import { CLASSES, ZONES } from '../sim/data.js';
import { clamp } from '../core/math.js';
import { t } from '../i18n/index.js';

let RES = 4; // metres per map pixel (1 on a small map)
// Door ticks follow the state lights in the world (scene.js DOOR_COL).
const DOOR_CSS = { closed: '#5ad8ff', open: '#3f9f62', locked: '#ff3d33', keyed: '#ffd040', jammed: '#ff8c1a', dead: '#9a6a64' };

function hex(css) { const n = parseInt(css.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

export class Minimap {
  constructor(world) {
    this.world = world;
    this.seen = new Set();
    RES = world.size <= 800 ? 1 : 4;
    this.res = RES;
    const S = world.size, N = Math.ceil(S / RES), c = this.img = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d'), im = g.createImageData(N, N), d = im.data;
    const zc = ZONES.map((z) => hex(z.css));
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        // Majority of the 4 x 4 m cell: building, road, alley, water or open ground.
        let wall = 0, road = 0, alley = 0, water = 0;
        for (let j = 0; j < RES; j += RES > 1 ? 2 : 1) for (let i = 0; i < RES; i += RES > 1 ? 2 : 1) {
          const k = Math.min(S - 1, y * RES + j) * S + Math.min(S - 1, x * RES + i), s = world.surface[k];
          if (world.grid[k] === 1) wall++; else if (s === 6) water++; else if (s === 1 || (s >= 7 && s <= 10)) road++; else if (s === 3 || s === 2 || s === 4) alley++;
        }
        const z = zc[world.zoneAt(x * RES, y * RES)];
        let r, gg, b;
        const need = RES > 1 ? 2 : 1;
        if (world.annex) { const f = wall >= need ? 0.12 : 0.3; r = 60 * f * 3; gg = 90 * f * 3; b = 120 * f * 3; }
        else if (wall >= need) { r = 12 + z[0] * 0.07; gg = 24 + z[1] * 0.09; b = 30 + z[2] * 0.09; }
        else if (water >= need) { r = 10; gg = 34; b = 52; }
        else if (road >= need) { r = 44 + z[0] * 0.08; gg = 69 + z[1] * 0.10; b = 77 + z[2] * 0.10; }
        else if (alley >= 1) { r = 50 + z[0] * 0.1; gg = 48 + z[1] * 0.1; b = 46 + z[2] * 0.1; }
        else { r = 34 + z[0] * 0.1; gg = 33 + z[1] * 0.1; b = 32 + z[2] * 0.1; }
        // Levels (doc 64 Package 8): raised ground reads lighter, sunken ground darker and cooler.
        if (world.hasHeight && wall < need) {
          const lv = world.floorAt(x * RES + RES / 2, y * RES + RES / 2);
          if (lv) { const k = clamp(1 + lv * 0.08, 0.5, 1.9); r *= k; gg *= k; b *= k * (lv < 0 ? 1.25 : 1); }
        }
        const o = (y * N + x) * 4;
        d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0);
    // Stairs and ramps (a tread mark across the way up) and drop cells (an amber point toward
    // the fall), gathered once in 3 m bins so the map stays light.
    this.stairs = []; this.drops = [];
    if (world.hasHeight && world.hmark) {
      const bins = new Map(), M = world.hmark, F = world.floor;
      for (let i = 0; i < S * S; i++) {
        const xi = i % S, zi = (i / S) | 0;
        if (world.drop[i]) {
          // Point at the lowest neighbour: that is where the drop lands.
          let best = null, bf = F[i] - 2;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (zi + dz) * S + xi + dx; if (j >= 0 && j < S * S && F[j] < bf) { bf = F[j]; best = [dx, dz]; } }
          if (best) this.drops.push({ x: xi + 0.5, z: zi + 0.5, dx: best[0], dz: best[1] });
        }
        if (M[i] !== 1 && M[i] !== 2) continue;
        const key = ((zi / 3) | 0) * 1000 + ((xi / 3) | 0);
        let s = bins.get(key);
        if (!s) bins.set(key, s = { x: 0, z: 0, n: 0, gx: 0, gz: 0 });
        s.x += xi + 0.5; s.z += zi + 0.5; s.n++;
        s.gx += world.fl(xi + 1, zi) - world.fl(xi - 1, zi); s.gz += world.fl(xi, zi + 1) - world.fl(xi, zi - 1);
      }
      for (const s of bins.values()) { const l = Math.hypot(s.gx, s.gz) || 1; this.stairs.push({ x: s.x / s.n, z: s.z / s.n, dx: s.gx / l, dz: s.gz / l }); }
    }
    // Zone borders on the 100 m block lattice.
    if (!world.annex) {
      const n = world.n, px = 100 / RES;
      g.lineWidth = 1.5;
      for (let bz = 0; bz < n; bz++) for (let bx = 0; bx < n; bx++) {
        const z = world.zone[bz * n + bx];
        const edge = (z2, x0, y0, x1, y1) => { if (z2 === z) return; g.strokeStyle = ZONES[Math.max(z, z2)].css; g.globalAlpha = 0.8; g.beginPath(); g.moveTo(x0 * px, y0 * px); g.lineTo(x1 * px, y1 * px); g.stroke(); };
        if (bx < n - 1) edge(world.zone[bz * n + bx + 1], bx + 1, bz, bx + 1, bz + 1);
        if (bz < n - 1) edge(world.zone[(bz + 1) * n + bx], bx, bz + 1, bx + 1, bz + 1);
      }
      g.globalAlpha = 1;
    }
  }

  // scale: canvas pixels per metre; (ox, oz): world point at the canvas origin.
  marks(ctx, raid, scale, ox, oz, size, full) {
    const w = this.world, p = raid.player;
    const X = (x) => (x - ox) * scale, Z = (z) => (z - oz) * scale;
    const dot = (x, z, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(x), Z(z), r, 0, 6.283); ctx.fill(); };
    // Stairs: three short treads across the way up; drops: an amber wedge toward the fall.
    const inView = (x, z) => full || (Math.abs(X(x) - size / 2) <= size / 2 && Math.abs(Z(z) - size / 2) <= size / 2);
    const tread = Math.max(1.6, scale * 1.3);
    ctx.strokeStyle = '#d8f0ff'; ctx.lineWidth = 1;
    for (const st of this.stairs) {
      if (!inView(st.x, st.z)) continue;
      const a = X(st.x), b = Z(st.z), px = -st.dz * tread, pz = st.dx * tread;
      ctx.beginPath();
      for (const k of [-1, 0, 1]) { const ox = st.dx * k * tread * 0.8, oz = st.dz * k * tread * 0.8; ctx.moveTo(a + ox - px, b + oz - pz); ctx.lineTo(a + ox + px, b + oz + pz); }
      ctx.stroke();
    }
    // A window broken in this raid is a drop too (doc 32): its sill points out of the wall.
    const broken = raid.windows ? (w.windows || []).filter((win, i) => raid.windows[i] && raid.windows[i].broken).map((win) => ({ x: win.x, z: win.z, dx: win.nx, dz: win.nz })) : [];
    for (const dr of broken.length ? this.drops.concat(broken) : this.drops) {
      if (!inView(dr.x, dr.z)) continue;
      const a = X(dr.x), b = Z(dr.z), r = Math.max(2.2, scale * 1.4);
      ctx.fillStyle = '#ffa030'; ctx.beginPath();
      ctx.moveTo(a + dr.dx * r * 1.4, b + dr.dz * r * 1.4); ctx.lineTo(a - dr.dz * r, b + dr.dx * r); ctx.lineTo(a + dr.dz * r, b - dr.dx * r); ctx.fill();
    }
    const diamond = (x, z, r, col) => { const a = X(x), b = Z(z); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(a, b - r); ctx.lineTo(a + r, b); ctx.lineTo(a, b + r); ctx.lineTo(a - r, b); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke(); };
    // Doors the operator has seen: a tick across the doorway in the colour of its state.
    if (raid.doors) {
      const half = Math.max(1.6, scale * 1.2);
      for (const d of w.doors) {
        const st = raid.doors[d.id];
        if (!st.seen) continue;
        const a = X(d.x), b = Z(d.z);
        if (!full && (Math.abs(a - size / 2) > size / 2 || Math.abs(b - size / 2) > size / 2)) continue;
        const ex = d.horiz ? half : 0, ez = d.horiz ? 0 : half;
        for (const [lw, col] of [[4, '#000'], [2, DOOR_CSS[st.state === 'locked' && raid.keys.has(d.id) ? 'keyed' : st.state]]]) {
          ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(a - ex, b - ez); ctx.lineTo(a + ex, b + ez); ctx.stroke();
        }
      }
    }
    // Contract work (doc 21): survey marks, sensor nodes and broods as diamonds; a known Power Cell as a dot.
    if (raid.ops) {
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      for (const m of raid.ops.marks) {
        if (m.done) continue;
        const a = X(m.x), b = Z(m.z), r = full ? 6 : 5;
        if (!full && (Math.abs(a - size / 2) > size / 2 + 6 || Math.abs(b - size / 2) > size / 2 + 6)) continue;
        ctx.fillStyle = m.kind === 'purge' ? '#ff6a9a' : '#9fe8ff';
        ctx.beginPath(); ctx.moveTo(a, b - r); ctx.lineTo(a + r, b); ctx.lineTo(a, b + r); ctx.lineTo(a - r, b); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      for (const c of w.containers) {
        const st = raid.cont[c.id];
        if (!st.cell || !st.cellKnown || st.opened) continue;
        ctx.fillStyle = '#9fe8ff'; ctx.beginPath(); ctx.arc(X(c.x), Z(c.z), full ? 4 : 3, 0, 6.283); ctx.fill(); ctx.stroke();
      }
    }
    // Events (doc 20): a triangle in the kind's colour; hollow once it is running.
    if (raid.evts) for (const e of raid.evts.list) {
      if (e.state === 'hidden' || e.state === 'done' || e.state === 'failed') continue;
      if (!full && (Math.abs(X(e.x) - size / 2) > size / 2 + 6 || Math.abs(Z(e.z) - size / 2) > size / 2 + 6)) continue;
      const r = full ? 7 : 6, a = X(e.x), b = Z(e.z), c = EVENT_COL[e.kind];
      ctx.beginPath(); ctx.moveTo(a, b - r); ctx.lineTo(a + r, b + r * 0.8); ctx.lineTo(a - r, b + r * 0.8); ctx.closePath();
      ctx.fillStyle = `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      if (e.state === 'known') ctx.fill(); else { ctx.lineWidth = 2; ctx.strokeStyle = ctx.fillStyle; }
      ctx.stroke();
    }
    if (raid.jobs) for (const j of raid.jobs.list) {
      if (j.state === 'hidden' || j.state === 'failed' || (j.state === 'done' && !(j.kind === 'van' && !j.gone))) continue;
      if (!full && (Math.abs(X(j.x) - size / 2) > size / 2 + 6 || Math.abs(Z(j.z) - size / 2) > size / 2 + 6)) continue;
      const r = full ? 6 : 5, a = X(j.x), b = Z(j.z);
      ctx.fillStyle = j.state === 'done' ? '#52f08a' : '#ffd76a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.fillRect(a - r, b - r, r * 2, r * 2); ctx.strokeRect(a - r, b - r, r * 2, r * 2);
    }
    for (const poi of w.pois) {
      const st = raid.poi[poi.id];
      if (Math.abs(poi.x - p.x) < 110 && Math.abs(poi.z - p.z) < 110) this.seen.add(poi.id);
      const known = poi.type === 'extract' ? st.known : (poi.dispatched || poi.type === 'passage' || poi.type === 'broker' || poi.type === 'boss' || poi.type === 'scene' || this.seen.has(poi.id));
      if (!known) continue;
      if (!full && (Math.abs(X(poi.x) - size / 2) > size / 2 + 6 || Math.abs(Z(poi.z) - size / 2) > size / 2 + 6)) continue;
      const big = full ? 1.2 : 1.1;
      switch (poi.type) {
        case 'extract': diamond(poi.x, poi.z, 6 * big, exitInfo(raid, poi).open ? '#52f08a' : '#ffa53a'); break;
        case 'broker': diamond(poi.x, poi.z, 5 * big, '#ffc23d'); break;
        case 'boss': if (!st.used || (raid.boss && raid.boss.active)) diamond(w.boss.x, w.boss.z, 7 * big, '#ff2e9a'); break;
        case 'nest': if (!st.used) dot(poi.x, poi.z, 4.5 * big, '#ff5aa8'); break;
        case 'cache': if (!st.used) dot(poi.x, poi.z, 3 * big, '#58d8ff'); break;
        case 'shrine': if (!st.used) dot(poi.x, poi.z, 3 * big, '#ff5a6a'); break;
        case 'terminal': if (!st.used) dot(poi.x, poi.z, 3 * big, '#8ea2ff'); break;
        case 'passage':
        case 'scene': {
          // A place worth the climb or the descent (doc 64 Package 8): a lilac square, named on the full map.
          const a = X(poi.x), b = Z(poi.z), r = 4 * big;
          ctx.fillStyle = poi.type === 'passage' ? '#ff9230' : '#c9a2ff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
          ctx.fillRect(a - r, b - r, r * 2, r * 2); ctx.strokeRect(a - r, b - r, r * 2, r * 2);
          if (full) { ctx.font = '11px ui-monospace, monospace'; ctx.fillStyle = '#e6d6ff'; ctx.fillText(t(poi.name), a + r + 3, b + 4); }
          break;
        }
        default: break;
      }
    }
    if (!full) {
      for (const e of raid.enemies) {
        if (e.dead) continue;
        const hostile = e.state === 'hunt' || e.state === 'revealing' || e.state === 'boss';
        // A Shrike on the wing or on its roost is a ring: over the street, not in it.
        if (hostile && e.flier && e.mode !== 'grounded') { ctx.strokeStyle = e.elite ? '#ffd76a' : '#d77bff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(e.x), Z(e.z), e.elite ? 3.6 : 2.6, 0, 6.283); ctx.stroke(); }
        else if (hostile) dot(e.x, e.z, e.elite || e.kind === 'titan' ? 3.6 : e.kind === 'mite' ? 1.5 : 2.2, e.elite || e.kind === 'titan' ? '#ffd76a' : '#ff4d5a');
        else if (e.outlineT > 0 && e.isMimic) dot(e.x, e.z, 2.4, '#ff2e9a');
        else if (e.humanT > 0) dot(e.x, e.z, 1.8, '#9fb2c2');
      }
      for (const k of raid.pickups) if (k.kind !== 'xp') dot(k.x, k.z, 2, '#fff');
    }
    // The followed route, whole: teal on the way, amber with a cross where it stops at a blocker.
    const rr = raid.route && raid.route.target && raid.route.result;
    if (rr && rr.path.length > 1) {
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const col = rr.ok ? '#4ff2d8' : '#ffa040', end = rr.path[rr.path.length - 1];
      for (const [lw, c] of [[full ? 5 : 4, 'rgba(0,0,0,0.7)'], [full ? 2.5 : 2, col]]) {
        ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath();
        rr.path.forEach((q, k) => (k ? ctx.lineTo(X(q.x), Z(q.z)) : ctx.moveTo(X(q.x), Z(q.z))));
        if (rr.blocked) { const a = X(end.x), b = Z(end.z), s = full ? 5 : 4; ctx.moveTo(a - s, b - s); ctx.lineTo(a + s, b + s); ctx.moveTo(a + s, b - s); ctx.lineTo(a - s, b + s); }
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.translate(X(p.x), Z(p.z));
    ctx.rotate(p.face + Math.PI / 2);
    ctx.fillStyle = CLASSES[p.classId].css; ctx.strokeStyle = '#061015'; ctx.lineWidth = 1;
    const s = full ? 7 : 6;
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.8); ctx.lineTo(0, s * 0.35); ctx.lineTo(-s * 0.7, s * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  draw(ctx, size, raid, radius = 110) {
    const p = raid.player, scale = size / (radius * 2), ox = p.x - radius, oz = p.z - radius;
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.img, ox / RES, oz / RES, radius * 2 / RES, radius * 2 / RES, 0, 0, size, size);
    this.marks(ctx, raid, scale, ox, oz, size, false);
  }

  drawFull(ctx, size, raid) {
    const scale = size / this.world.size;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.img, 0, 0, size, size);
    // Survey coordinates are static world references; danger colours and POIs stay live.
    ctx.save(); ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = '#b1d0d6';
    const spacing = 100 * scale;
    for (let z = 0; z < this.world.n; z++) for (let x = 0; x < this.world.n; x++) {
      const left = x * spacing, top = z * spacing;
      ctx.fillStyle = '#91bbc2'; ctx.fillRect(left, top, 5, 1); ctx.fillRect(left, top, 1, 5);
      ctx.fillStyle = '#071116bd'; ctx.fillRect(left + 4, top + 4, 19, 13);
      ctx.fillStyle = '#b1d0d6'; ctx.fillText(`${String.fromCharCode(65 + x)}${z + 1}`, left + 7, top + 14);
    }
    ctx.restore();
    this.marks(ctx, raid, scale, 0, 0, size, true);
  }
}
