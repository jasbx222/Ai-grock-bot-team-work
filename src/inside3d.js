// First-person "inside the house" view (Three.js). Low-poly boxes, baked vertex lighting (no real-time
// lights, no shadows), canvas textures, camera-facing sprite characters. It renders the SAME simulation
// as the 2D overview (scene2d): positions are mapped through map3d.js every frame.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, Fog, BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial,
  CanvasTexture, TextureLoader, SRGBColorSpace, RepeatWrapping, DoubleSide, AdditiveBlending, Group, PlaneGeometry, Sprite,
  SpriteMaterial, Vector3, Raycaster, Vector2, CylinderGeometry, ConeGeometry, SphereGeometry, Matrix4, Euler, Quaternion, Points, PointsMaterial,
} from 'three';
import { H3, REGIONS, DOORS3, to3, to2, room3At } from './map3d.js';
import { ROOMS, OBSTACLES, FIRE, TEA_SPOT, TANK, CAGE } from './sceneConfig.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lin = hex => { const c = new Color(hex); return [c.r, c.g, c.b]; };
const rnd = (() => { let s = 1234567; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0) / 4294967296); })();

export async function createInside(canvas, scene2d, { onPick, onRoomChange } = {}) {
  const S = scene2d.S, coarse = matchMedia('(pointer: coarse)').matches;
  const renderer = new WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance', alpha: false });
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene(); scene.background = new Color(0x0d0a09); scene.fog = new Fog(0x1b130d, 7, 24);
  const camera = new PerspectiveCamera(68, 1, 0.05, 60); camera.rotation.order = 'YXZ';
  const WH = H3.wallH, DW = H3.doorW, DH = H3.doorH;
  const R3 = H3.rooms, roomIds = Object.keys(R3);
  const rmeta = new Map(ROOMS.map(r => [r.id, r]));
  const agentOfRoom = id => scene2d.rooms.find(r => r.id === id)?.owner || null;

  // ---------------------------------------------------------------- textures (all procedural, made once)
  const cv = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4; return t; };
  const rep = t => { t.wrapS = t.wrapT = RepeatWrapping; return t; };
  const woodTex = rep(cv(512, 512, (g, w, h) => {
    const rows = 8, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -((r * 173) % 300);
      while (x < w) {
        const len = 220 + rnd() * 200, b = 0.85 + rnd() * 0.25, base = [150 * b, 96 * b, 58 * b];
        g.fillStyle = `rgb(${base.map(Math.round)})`; g.fillRect(x, r * rh, len, rh);
        for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(70,40,20,${0.05 + rnd() * 0.08})`; g.lineWidth = 1 + rnd() * 1.5; const yy = r * rh + rnd() * rh; g.beginPath(); g.moveTo(x, yy); g.bezierCurveTo(x + len * 0.3, yy + (rnd() - 0.5) * 6, x + len * 0.7, yy + (rnd() - 0.5) * 6, x + len, yy); g.stroke(); }
        g.fillStyle = 'rgba(40,22,12,0.75)'; g.fillRect(x, r * rh, 2, rh); x += len;
      }
      g.fillStyle = 'rgba(40,22,12,0.8)'; g.fillRect(0, r * rh, w, 2);
    }
  }));
  const tileTex = rep(cv(256, 256, (g, w) => { const n = 4, s = w / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? '#c96f45' : '#efe2c8'; g.fillRect(i * s, j * s, s, s); g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(i * s + 4, j * s + 4, s - 8, 6); } g.strokeStyle = 'rgba(90,60,40,0.5)'; g.lineWidth = 3; for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, w); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); } }));
  const PAPER = { r1: ['#7d9a8c', '#e9d9b6'], r2: ['#b9786a', '#f1dcc0'], r3: ['#6f86a8', '#e8dcc4'], r4: ['#9a8a5a', '#efe0bb'], r5: ['#8f6f9c', '#eedcc8'], kitchen: ['#d9c49a', '#f4ead4'], hall: ['#8c4b3c', '#e8c48f'], meeting: ['#5f7f78', '#e5dcc2'], hallway: ['#a0603e', '#f0d8b0'] };
  const paperTex = id => rep(cv(256, 256, (g, w, h) => {
    const [a, b] = PAPER[id] || PAPER.hall; g.fillStyle = a; g.fillRect(0, 0, w, h);
    if (id === 'kitchen') { g.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) g.fillRect(i * 32 + 1, j * 32 + 1, 30, 30); return; }
    g.fillStyle = b; g.globalAlpha = 0.22;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = i * 64 + (j % 2) * 32 + 16, y = j * 64 + 32; g.beginPath(); g.moveTo(x, y - 18); g.quadraticCurveTo(x + 12, y, x, y + 18); g.quadraticCurveTo(x - 12, y, x, y - 18); g.fill(); g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
    g.globalAlpha = 0.12; for (let i = 0; i < 8; i++) g.fillRect(i * 32 + 14, 0, 4, h);
  }));
  const RUGS = [['#8b2f2a', '#e0b56a', '#2f3f5f'], ['#2f4f6f', '#d9b47a', '#8b3a2a'], ['#5d3a6e', '#e3c27d', '#2e5b4f'], ['#7a4a2a', '#efd9a8', '#3f5d7a']];
  const rugTex = k => cv(256, 384, (g, w, h) => {
    const [a, b, c] = RUGS[k % RUGS.length]; g.fillStyle = a; g.fillRect(0, 0, w, h);
    g.strokeStyle = b; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28); g.strokeStyle = c; g.lineWidth = 6; g.strokeRect(32, 32, w - 64, h - 64);
    g.fillStyle = b; g.globalAlpha = 0.85; g.beginPath(); g.moveTo(w / 2, 80); g.lineTo(w - 70, h / 2); g.lineTo(w / 2, h - 80); g.lineTo(70, h / 2); g.closePath(); g.fill();
    g.fillStyle = c; g.beginPath(); g.moveTo(w / 2, 120); g.lineTo(w - 100, h / 2); g.lineTo(w / 2, h - 120); g.lineTo(100, h / 2); g.closePath(); g.fill();
    g.globalAlpha = 1; g.fillStyle = b; for (let i = 0; i < 10; i++) { g.beginPath(); g.arc(44 + i * 19, 44, 3, 0, 7); g.fill(); g.beginPath(); g.arc(44 + i * 19, h - 44, 3, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 400; i++) g.fillRect(rnd() * w, rnd() * h, 2, 2);
  });
  const booksTex = cv(256, 128, (g, w, h) => { g.fillStyle = '#3a2416'; g.fillRect(0, 0, w, h); let x = 2; const cols = ['#8b2f2a', '#2f4f6f', '#d9a441', '#3f6f4f', '#6e3f6e', '#c8693f', '#e8dcc0', '#26394a']; while (x < w - 6) { const bw = 7 + rnd() * 10, bh = h * (0.72 + rnd() * 0.26); g.fillStyle = cols[Math.floor(rnd() * cols.length)]; g.fillRect(x, h - bh, bw, bh); g.fillStyle = 'rgba(255,230,180,0.5)'; g.fillRect(x + 2, h - bh + 8, bw - 4, 2); x += bw + 1; } });
  const nightTex = cv(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0b1430'); gr.addColorStop(0.6, '#24345e'); gr.addColorStop(1, '#4b5a86'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff6d8'; g.beginPath(); g.arc(190, 52, 16, 0, 7); g.fill(); g.fillStyle = 'rgba(255,246,216,0.15)'; g.beginPath(); g.arc(190, 52, 34, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 40; i++) g.fillRect(rnd() * w, rnd() * h * 0.5, 1.4, 1.4);
    for (let i = 0; i < 7; i++) { const x = i * 42 + rnd() * 20, th = 70 + rnd() * 60; g.fillStyle = '#132238'; g.beginPath(); g.moveTo(x, h - 40 - th); g.lineTo(x + 26, h - 40); g.lineTo(x - 26, h - 40); g.fill(); g.fillStyle = '#e8eef8'; g.beginPath(); g.moveTo(x, h - 40 - th); g.lineTo(x + 8, h - 40 - th * 0.7); g.lineTo(x - 8, h - 40 - th * 0.7); g.fill(); }
    g.fillStyle = '#dfe7f4'; g.beginPath(); g.moveTo(0, h - 46); g.quadraticCurveTo(w / 2, h - 70, w, h - 44); g.lineTo(w, h); g.lineTo(0, h); g.fill();
    g.fillStyle = 'rgba(255,200,120,0.9)'; g.fillRect(40, h - 64, 6, 6); g.fillRect(52, h - 64, 6, 6);
  });
  const snowTex = rep(cv(256, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#fff'; for (let i = 0; i < 90; i++) { const r = 0.8 + rnd() * 2; g.globalAlpha = 0.5 + rnd() * 0.5; g.beginPath(); g.arc(rnd() * w, rnd() * h, r, 0, 7); g.fill(); } }));
  const glowTex = cv(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  const shadowTex = cv(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  const fireTex = cv(128, 256, (g, w, h) => { const gr = g.createRadialGradient(64, 190, 6, 64, 170, 110); gr.addColorStop(0, 'rgba(255,250,200,1)'); gr.addColorStop(0.25, 'rgba(255,190,70,0.95)'); gr.addColorStop(0.6, 'rgba(240,90,30,0.6)'); gr.addColorStop(1, 'rgba(120,20,0,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(64, 10); g.bezierCurveTo(110, 110, 120, 200, 64, 250); g.bezierCurveTo(8, 200, 18, 110, 64, 10); g.fill(); });
  const heartTex = cv(64, 64, (g) => { g.fillStyle = '#ff5f86'; g.beginPath(); g.moveTo(32, 56); g.bezierCurveTo(-6, 30, 12, 2, 32, 18); g.bezierCurveTo(52, 2, 70, 30, 32, 56); g.fill(); g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(21, 20, 6, 4, -0.6, 0, 7); g.fill(); });
  const screenTex = (hue) => cv(128, 80, (g, w, h) => { g.fillStyle = '#0f1b2c'; g.fillRect(0, 0, w, h); const cols = ['#7fd1ff', '#ffd27f', '#9be58f', '#ff9db0']; for (let i = 0; i < 9; i++) { g.fillStyle = cols[(i + hue) % 4]; g.fillRect(8 + (i % 3) * 6, 8 + i * 7.5, 30 + rnd() * 70, 3); } });
  const chartTex = cv(256, 160, (g, w, h) => { g.fillStyle = '#f7f3ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a1c14'; g.font = 'bold 18px sans-serif'; g.fillText('خطة الأسبوع', 70, 26); const c = ['#4faaa5', '#d9a441', '#c8693f', '#6f86a8']; for (let i = 0; i < 6; i++) { g.fillStyle = c[i % 4]; const bh = 30 + rnd() * 80; g.fillRect(20 + i * 38, h - 16 - bh, 24, bh); } g.strokeStyle = '#2a1c14'; g.beginPath(); g.moveTo(14, h - 14); g.lineTo(w - 10, h - 14); g.stroke(); });
  const loader = new TextureLoader(), texCache = new Map();
  const tex = src => { if (!texCache.has(src)) texCache.set(src, new Promise(res => loader.load(src, t => { t.colorSpace = SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, () => res(null)))); return texCache.get(src); };

  // ---------------------------------------------------------------- baked lighting
  const AMB = [0.13, 0.105, 0.09];
  const LAMPS = []; // { room, x, y, z, c:[r,g,b], I, R }
  const lamp = (room, x, y, z, c, I, R) => LAMPS.push({ room, x, y, z, c, I, R });
  const WARM = [1, 0.66, 0.36], MOON = [0.35, 0.45, 0.75], FIREC = [1, 0.45, 0.16], SCREEN = [0.4, 0.6, 1];
  function lightAt(room, x, y, z, nx, ny, nz) {
    let r = AMB[0], g = AMB[1], b = AMB[2];
    for (const L of LAMPS) {
      if (L.room !== room && L.room !== '*') continue;
      const dx = L.x - x, dy = L.y - y, dz = L.z - z, d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2) || 1;
      const lam = clamp((dx * nx + dy * ny + dz * nz) / d, 0, 1) * 0.8 + 0.2, att = L.I / (1 + d2 / (L.R * L.R)) * lam;
      r += L.c[0] * att; g += L.c[1] * att; b += L.c[2] * att;
    }
    return [r, g, b];
  }
  // AO-ish darkening near walls / floor / ceiling
  function ao(room, x, y, z) {
    const R = R3[room]; if (!R) return 1;
    const dw = Math.min(x - R[0], R[2] - x, z - R[1], R[3] - z);
    return clamp(0.62 + 0.38 * dw / 0.7, 0.62, 1) * clamp(0.7 + 0.3 * y / 0.35, 0.7, 1) * clamp(0.82 + 0.18 * (WH - y) / 0.3, 0.82, 1);
  }

  // ---------------------------------------------------------------- geometry batches (merged per material)
  class Batch {
    constructor() { this.p = []; this.c = []; this.u = []; }
    v(room, x, y, z, n, col, u, w, lit = true, aof = true) {
      this.p.push(x, y, z); this.u.push(u, w);
      if (!lit) { this.c.push(col[0], col[1], col[2]); return; }
      const L = lightAt(room, x, y, z, n[0], n[1], n[2]), a = aof ? ao(room, x, y, z) : 1;
      this.c.push(col[0] * L[0] * a, col[1] * L[1] * a, col[2] * L[2] * a);
    }
    // quad from origin o, edge vectors e1/e2, subdivided for smooth baked light
    quad(room, o, e1, e2, n, col, uv = [0, 0, 1, 1], div = [1, 1], lit = true, aof = true) {
      const [nu, nv] = div;
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const P = (a, b) => [o[0] + e1[0] * a + e2[0] * b, o[1] + e1[1] * a + e2[1] * b, o[2] + e1[2] * a + e2[2] * b];
        const U = (a, b) => [uv[0] + (uv[2] - uv[0]) * a, uv[1] + (uv[3] - uv[1]) * b];
        const a0 = i / nu, a1 = (i + 1) / nu, b0 = j / nv, b1 = (j + 1) / nv;
        for (const [a, b] of [[a0, b0], [a1, b0], [a1, b1], [a0, b0], [a1, b1], [a0, b1]]) { const p = P(a, b), t = U(a, b); this.v(room, p[0], p[1], p[2], n, col, t[0], t[1], lit, aof); }
      }
    }
    box(room, x0, y0, z0, x1, y1, z1, hex, opt = {}) {
      const col = Array.isArray(hex) ? hex : lin(hex), sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
      this.quad(room, [x0, y1, z0], [sx, 0, 0], [0, 0, sz], [0, 1, 0], col);            // top
      if (!opt.noBottom) this.quad(room, [x0, y0, z0], [sx, 0, 0], [0, 0, sz], [0, -1, 0], col);
      this.quad(room, [x0, y0, z1], [sx, 0, 0], [0, sy, 0], [0, 0, 1], col);            // +z
      this.quad(room, [x0, y0, z0], [sx, 0, 0], [0, sy, 0], [0, 0, -1], col);           // -z
      this.quad(room, [x1, y0, z0], [0, 0, sz], [0, sy, 0], [1, 0, 0], col);            // +x
      this.quad(room, [x0, y0, z0], [0, 0, sz], [0, sy, 0], [-1, 0, 0], col);           // -x
    }
    geo(room, g, m, hex) {
      const col = Array.isArray(hex) ? hex : lin(hex), G = g.index ? g.toNonIndexed() : g, P = G.attributes.position, N = G.attributes.normal;
      const v = new Vector3(), n = new Vector3(), nm = new Matrix4().extractRotation(m);
      for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m); n.fromBufferAttribute(N, i).applyMatrix4(nm).normalize(); this.v(room, v.x, v.y, v.z, [n.x, n.y, n.z], col, 0, 0); }
    }
    mesh(mat) { const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new Float32BufferAttribute(this.c, 3)); g.setAttribute('uv', new Float32BufferAttribute(this.u, 2)); const m = new Mesh(g, mat); m.matrixAutoUpdate = false; m.updateMatrix(); return m; }
  }
  const vcMat = (map, extra = {}) => new MeshBasicMaterial({ vertexColors: true, map: map || null, side: DoubleSide, ...extra });
  const B = { solid: new Batch(), wood: new Batch(), tile: new Batch(), books: new Batch() };
  const papers = Object.fromEntries(roomIds.map(id => [id, new Batch()]));
  const rugBatches = [new Batch(), new Batch(), new Batch(), new Batch()];
  const colliders = []; // { x0, z0, x1, z1 } boxes or { x, z, r } circles
  const boxC = (x0, z0, x1, z1) => colliders.push({ x0, z0, x1, z1 });
  const T = (x, y, z, s = [1, 1, 1], ry = 0) => new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(0, ry, 0)), new Vector3(...s));
  const decor = new Group(); scene.add(decor);
  const additive = (tx, color, opacity) => new SpriteMaterial({ map: tx, color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, fog: false });
  const halo = (x, y, z, s, color = 0xffb35c, o = 0.5) => { const sp = new Sprite(additive(glowTex, color, o)); sp.position.set(x, y, z); sp.scale.set(s, s, 1); decor.add(sp); return sp; };

  // ---------------------------------------------------------------- lights per room (placed before geometry so it is baked)
  const deskOf = new Map(); // room -> 3D desk position of its owner
  for (const r of scene2d.rooms) if (r.kind === 'private') deskOf.set(r.id, to3(r.slot[0], r.slot[1]));
  for (const id of roomIds) {
    const R = R3[id], cx = (R[0] + R[2]) / 2, cz = (R[1] + R[3]) / 2;
    if (id !== 'hall') lamp(id, cx, 2.3, cz, WARM, id === 'hallway' ? 0.95 : 0.85, 2.7);
    const d = deskOf.get(id); if (d) { lamp(id, d.x - 0.45, 1.25, d.z - 0.25, WARM, 0.95, 1.5); lamp(id, d.x, 0.95, d.z + 0.1, SCREEN, 0.3, 0.9); }
    // moonlight through outer windows
    if (R[1] === 0) lamp(id, cx, 1.6, 0.6, MOON, 0.35, 2.2); if (R[3] === H3.size[1]) lamp(id, cx, 1.6, R[3] - 0.6, MOON, 0.35, 2.2);
  }
  const H = R3.hall, fire3 = { x: clamp(to3(FIRE.x, 390).x, H[0] + 1.5, H[2] - 1.5), z: H[1] };
  lamp('hall', fire3.x, 0.6, fire3.z + 0.6, FIREC, 2.0, 3.4); lamp('hall', H[0] + 1, 1.7, H[3] - 1, WARM, 0.8, 2.2); lamp('hall', H[2] - 1, 1.7, H[3] - 1, WARM, 0.8, 2.2); lamp('hall', (H[0] + H[2]) / 2, 2.4, (H[1] + H[3]) / 2 + 1, WARM, 0.55, 3.5);
  const K = R3.kitchen; lamp('kitchen', K[0] + 1, 2.0, (K[1] + K[3]) / 2, WARM, 0.8, 2); lamp('kitchen', (K[0] + K[2]) / 2, 2.1, K[1] + 1.4, WARM, 0.7, 2);
  const M = R3.meeting; lamp('meeting', (M[0] + M[2]) / 2, 2.2, M[1] + 2.5, WARM, 0.75, 2.4); lamp('meeting', (M[0] + M[2]) / 2, 2.2, M[3] - 2.5, WARM, 0.75, 2.4);

  // ---------------------------------------------------------------- shell: floors, ceilings, walls with door gaps, windows
  const openings = id => {
    const R = R3[id], out = { n: [], s: [], w: [], e: [] };
    for (const D of DOORS3) {
      if (D.a !== id && D.b !== id) continue;
      if (D.vertical) out[R[2] <= D.cx ? 'e' : 'w'].push(D.cz); else out[R[3] <= D.cz ? 's' : 'n'].push(D.cx);
    }
    return out;
  };
  const windows = [];
  const FLOOR_TILE = new Set(['kitchen']);
  for (const id of roomIds) {
    const R = R3[id], w = R[2] - R[0], d = R[3] - R[1], fb = FLOOR_TILE.has(id) ? B.tile : B.wood, ts = FLOOR_TILE.has(id) ? 1.2 : 2.4;
    fb.quad(id, [R[0], 0, R[1]], [w, 0, 0], [0, 0, d], [0, 1, 0], [1, 1, 1], [R[0] / ts, R[1] / ts, R[2] / ts, R[3] / ts], [Math.ceil(w / 0.35), Math.ceil(d / 0.35)]);
    B.solid.quad(id, [R[0], WH, R[1]], [w, 0, 0], [0, 0, d], [0, -1, 0], lin(0x8a6a4c), [0, 0, 1, 1], [Math.ceil(w / 0.6), Math.ceil(d / 0.6)]);
    for (let bz = R[1] + 1.2; bz < R[3] - 0.5; bz += 1.6) B.wood.box(id, R[0], WH - 0.16, bz, R[2], WH, bz + 0.14, 0x6b4428);
    const op = openings(id), P = B.solid, pap = papers[id];
    const wall = (side) => {
      // wall line: start point, direction, length, inward normal
      const cfg = { n: [[R[0], R[1]], [1, 0], w, [0, 0, 1]], s: [[R[2], R[3]], [-1, 0], w, [0, 0, -1]], w: [[R[0], R[3]], [0, -1], d, [1, 0, 0]], e: [[R[2], R[1]], [0, 1], d, [-1, 0, 0]] }[side];
      const [[sx, sz], [dx, dz], len, n] = cfg;
      const gaps = op[side].map(c => { const t = dx ? (c - sx) / dx : (c - sz) / dz; return [t - DW / 2, t + DW / 2]; }).sort((a, b) => a[0] - b[0]);
      const outer = (side === 'n' && R[1] === 0) || (side === 's' && R[3] === H3.size[1]) || (side === 'w' && R[0] === 0) || (side === 'e' && R[2] === H3.size[0]);
      const segs = []; let t = 0; for (const g of gaps) { segs.push([t, g[0]]); t = g[1]; } segs.push([t, len]);
      const at = (t, y) => [sx + dx * t, y, sz + dz * t];
      const piece = (t0, t1, y0, y1) => { if (t1 - t0 < 0.01) return; const e1 = [dx * (t1 - t0), 0, dz * (t1 - t0)]; pap.quad(id, at(t0, y0), e1, [0, y1 - y0, 0], n, [1, 1, 1], [t0 / 1.1, y0 / 1.1, t1 / 1.1, y1 / 1.1], [Math.ceil((t1 - t0) / 0.45), Math.ceil((y1 - y0) / 0.45)]); };
      const wains = (t0, t1) => { if (t1 - t0 < 0.01) return; const o = at(t0, 0), e = [dx * (t1 - t0), 0, dz * (t1 - t0)], off = [n[0] * 0.025, 0, n[2] * 0.025];
        B.wood.quad(id, [o[0] + off[0], 0, o[2] + off[2]], e, [0, 0.95, 0], n, [0.78, 0.7, 0.62], [t0 / 2.4, 0, t1 / 2.4, 0.2], [Math.ceil((t1 - t0) / 0.45), 2]);
        const x0 = Math.min(o[0], o[0] + e[0]), x1 = Math.max(o[0], o[0] + e[0]), z0 = Math.min(o[2], o[2] + e[2]), z1 = Math.max(o[2], o[2] + e[2]);
        P.box(id, x0 + Math.min(0, off[0] * 2), 0.93, z0 + Math.min(0, off[2] * 2), x1 + Math.max(0, off[0] * 2), 0.99, z1 + Math.max(0, off[2] * 2), 0x5a3720);
        P.box(id, x0 + Math.min(0, off[0] * 2.4), 0, z0 + Math.min(0, off[2] * 2.4), x1 + Math.max(0, off[0] * 2.4), 0.12, z1 + Math.max(0, off[2] * 2.4), 0x4a2c18); };
      for (const [t0, t1] of segs) {
        // windows on outer walls: centred in long pieces
        if (outer && t1 - t0 > 2.2 && !(id === 'hallway' && side === 's')) {
          const nwin = t1 - t0 > 5 ? 2 : 1, ww = 1.25;
          let last = t0;
          for (let k = 0; k < nwin; k++) { const c = t0 + (t1 - t0) * (k + 1) / (nwin + 1); piece(last, c - ww / 2, 0, WH); piece(c - ww / 2, c + ww / 2, 0, 0.95); piece(c - ww / 2, c + ww / 2, 2.2, WH); windows.push({ room: id, p: at(c, 1.575), n, dir: [dx, dz], w: ww, h: 1.25 }); last = c + ww / 2; }
          piece(last, t1, 0, WH);
        } else piece(t0, t1, 0, WH);
        wains(t0, t1);
      }
      for (const g of gaps) piece(g[0], g[1], DH, WH);
      if (id === 'hallway' && side === 's') { /* front door drawn below */ }
    };
    ['n', 's', 'w', 'e'].forEach(wall);
  }
  // windows: night view + frame + sill + animated snow layer
  const winB = new Batch(), snowB = new Batch();
  for (const W of windows) {
    const [px, py, pz] = W.p, [nx, , nz] = W.n, [dx, dz] = W.dir, hw = W.w / 2, hh = W.h / 2, o = [px - dx * hw + nx * 0.01, py - hh, pz - dz * hw + nz * 0.01];
    winB.quad(W.room, o, [dx * W.w, 0, dz * W.w], [0, W.h, 0], W.n, [1, 1, 1], [0, 0, 1, 1], [1, 1], false);
    snowB.quad(W.room, [o[0] + nx * 0.01, o[1], o[2] + nz * 0.01], [dx * W.w, 0, dz * W.w], [0, W.h, 0], W.n, [1, 1, 1], [0, 0, W.w / 1.2, W.h / 1.2], [1, 1], false);
    const fr = 0.07, x0 = Math.min(o[0], o[0] + dx * W.w), x1 = Math.max(o[0], o[0] + dx * W.w), z0 = Math.min(o[2], o[2] + dz * W.w), z1 = Math.max(o[2], o[2] + dz * W.w), ex = Math.abs(nz) * 0.0 + Math.abs(nx) * 0.06, ez = Math.abs(nx) * 0.0 + Math.abs(nz) * 0.06;
    const fc = 0xe9dcc4;
    B.solid.box(W.room, x0 - fr * Math.abs(dx) - ex, o[1] - fr, z0 - fr * Math.abs(dz) - ez, x1 + fr * Math.abs(dx) + ex, o[1], z1 + fr * Math.abs(dz) + ez, fc); // sill
    B.solid.box(W.room, x0 - fr * Math.abs(dx) - ex, o[1] + W.h, z0 - fr * Math.abs(dz) - ez, x1 + fr * Math.abs(dx) + ex, o[1] + W.h + fr, z1 + fr * Math.abs(dz) + ez, fc);
    const cxw = (x0 + x1) / 2, czw = (z0 + z1) / 2;
    B.solid.box(W.room, cxw - 0.025 - ex, o[1], czw - 0.025 - ez, cxw + 0.025 + ex, o[1] + W.h, czw + 0.025 + ez, fc); // mullion
    B.solid.box(W.room, x0 - ex, o[1] + W.h * 0.55, z0 - ez, x1 + ex, o[1] + W.h * 0.55 + 0.04, z1 + ez, fc);
    for (const s of [-1, 1]) { const ax = cxw + dx * s * (hw + 0.04), az = czw + dz * s * (hw + 0.04); B.solid.box(W.room, ax - 0.04 - ex, o[1], az - 0.04 - ez, ax + 0.04 + ex, o[1] + W.h, az + 0.04 + ez, fc);
      // curtains
      const cx2 = cxw + dx * s * (hw + 0.2), cz2 = czw + dz * s * (hw + 0.2), cw = 0.16; B.solid.box(W.room, cx2 - cw * Math.abs(dx) - Math.abs(nx) * 0.05 + nx * 0.06, 0.25, cz2 - cw * Math.abs(dz) - Math.abs(nz) * 0.05 + nz * 0.06, cx2 + cw * Math.abs(dx) + Math.abs(nx) * 0.05 + nx * 0.06, 2.45, cz2 + cw * Math.abs(dz) + Math.abs(nz) * 0.05 + nz * 0.06, 0xa8443a); }
  }
  // door frames in the wall gaps
  for (const D of DOORS3) {
    const room = D.a, half = DW / 2, t = H3.wallT / 2 + 0.05;
    if (D.vertical) { B.wood.box(room, D.cx - t, 0, D.cz - half - 0.08, D.cx + t, DH + 0.08, D.cz - half, 0xe9dcc4); B.wood.box(room, D.cx - t, 0, D.cz + half, D.cx + t, DH + 0.08, D.cz + half + 0.08, 0xe9dcc4); B.wood.box(room, D.cx - t, DH, D.cz - half, D.cx + t, DH + 0.08, D.cz + half, 0xe9dcc4); }
    else { B.wood.box(room, D.cx - half - 0.08, 0, D.cz - t, D.cx - half, DH + 0.08, D.cz + t, 0xe9dcc4); B.wood.box(room, D.cx + half, 0, D.cz - t, D.cx + half + 0.08, DH + 0.08, D.cz + t, 0xe9dcc4); B.wood.box(room, D.cx - half, DH, D.cz - t, D.cx + half, DH + 0.08, D.cz + t, 0xe9dcc4); }
  }

  // ---------------------------------------------------------------- furniture
  const pendant = (room, x, z, shade = 0xd9a441) => { B.solid.box(room, x - 0.01, 2.2, z - 0.01, x + 0.01, WH, z + 0.01, 0x222222); B.solid.geo(room, new ConeGeometry(0.22, 0.22, 10, 1, true), T(x, 2.12, z), shade); halo(x, 2.0, z, 0.9, 0xffc078, 0.35); };
  const plant = (room, x, z, s = 1) => { B.solid.geo(room, new CylinderGeometry(0.16 * s, 0.12 * s, 0.32 * s, 8), T(x, 0.16 * s, z), 0xb5653a); for (let i = 0; i < 5; i++) B.solid.geo(room, new SphereGeometry(0.2 * s, 6, 4), T(x + Math.cos(i * 1.3) * 0.1 * s, 0.45 * s + (i % 3) * 0.13 * s, z + Math.sin(i * 1.3) * 0.1 * s, [1, 1.3, 1]), i % 2 ? 0x3f7f4a : 0x2f6a3c); colliders.push({ x, z, r: 0.22 * s }); };
  const bookshelf = (room, x0, z0, x1, z1, h = 1.9) => { // against a wall; front faces the room
    B.wood.box(room, x0, 0, z0, x1, h, z1, 0x5a3720); const alongX = x1 - x0 > z1 - z0, front = alongX ? (z0 < 1 || R3[room][1] + 0.5 > z0 ? z1 : z0) : (x0 < R3[room][0] + 0.5 ? x1 : x0);
    for (let k = 0; k < 4; k++) { const y = 0.12 + k * (h - 0.2) / 4, hh = (h - 0.2) / 4 - 0.05;
      if (alongX) B.books.quad(room, [x0 + 0.05, y, front + (front === z1 ? 0.005 : -0.005)], [x1 - x0 - 0.1, 0, 0], [0, hh, 0], [0, 0, front === z1 ? 1 : -1], [1, 1, 1], [k * 0.25, 0, k * 0.25 + (x1 - x0) / 3, 1]);
      else B.books.quad(room, [front + (front === x1 ? 0.005 : -0.005), y, z0 + 0.05], [0, 0, z1 - z0 - 0.1], [0, hh, 0], [front === x1 ? 1 : -1, 0, 0], [1, 1, 1], [k * 0.25, 0, k * 0.25 + (z1 - z0) / 3, 1]); }
    boxC(x0, z0, x1, z1);
  };
  const rug = (room, cx, cz, w, d, k, rot = false) => { const rb = rugBatches[k % 4]; if (rot) rb.quad(room, [cx - w / 2, 0.006, cz + d / 2], [w, 0, 0], [0, 0, -d], [0, 1, 0], [1, 1, 1], [0, 0, 1, 1], [Math.ceil(w / 0.4), Math.ceil(d / 0.4)]); else rb.quad(room, [cx - w / 2, 0.006, cz - d / 2], [0, 0, d], [w, 0, 0], [0, 1, 0], [1, 1, 1], [0, 0, 1, 1], [Math.ceil(d / 0.4), Math.ceil(w / 0.4)]); };
  const bed = (room, x0, z0, x1, z1, blanket) => { B.wood.box(room, x0, 0, z0, x1, 0.32, z1, 0x6b4428); B.solid.box(room, x0 + 0.05, 0.32, z0 + 0.05, x1 - 0.05, 0.5, z1 - 0.05, 0xf3ead8); const L = (z1 - z0) > (x1 - x0);
    if (L) { B.solid.box(room, x0 + 0.03, 0.5, z0 + 0.6, x1 - 0.03, 0.56, z1 - 0.03, blanket); B.solid.box(room, x0 + 0.15, 0.5, z0 + 0.1, x1 - 0.15, 0.62, z0 + 0.45, 0xfbf6ec); B.wood.box(room, x0, 0, z0 - 0.06, x1, 1.0, z0, 0x5a3720); }
    else { B.solid.box(room, x0 + 0.6, 0.5, z0 + 0.03, x1 - 0.03, 0.56, z1 - 0.03, blanket); B.solid.box(room, x0 + 0.1, 0.5, z0 + 0.15, x0 + 0.45, 0.62, z1 - 0.15, 0xfbf6ec); B.wood.box(room, x0 - 0.06, 0, z0, x0, 1.0, z1, 0x5a3720); }
    boxC(x0, z0, x1, z1); };
  const floorLamp = (room, x, z) => { B.solid.geo(room, new CylinderGeometry(0.15, 0.18, 0.04, 10), T(x, 0.02, z), 0x2a1c14); B.solid.box(room, x - 0.015, 0, z - 0.015, x + 0.015, 1.45, z + 0.015, 0x2a1c14); B.solid.geo(room, new CylinderGeometry(0.16, 0.24, 0.3, 12, 1, true), T(x, 1.5, z), 0xf0c987); halo(x, 1.5, z, 1.2, 0xffb565, 0.45); colliders.push({ x, z, r: 0.2 }); };
  const frames = []; // wall pictures -> textured later
  const picture = (room, x, y, z, n, w, h, src) => frames.push({ room, x, y, z, n, w, h, src });
  const chair = (room, x, z, rot, col = 0x7a4a2a) => { const c = Math.cos(rot), s = Math.sin(rot), m = (a, b) => [x + a * c - b * s, z + a * s + b * c];
    B.wood.geo(room, new CylinderGeometry(0.02, 0.02, 0.45, 4), T(...[m(-0.18, -0.18)].map(p => [p[0], 0.225, p[1]])[0]), col); B.wood.geo(room, new CylinderGeometry(0.02, 0.02, 0.45, 4), T(...[m(0.18, -0.18)].map(p => [p[0], 0.225, p[1]])[0]), col);
    B.wood.geo(room, new CylinderGeometry(0.02, 0.02, 0.45, 4), T(...[m(-0.18, 0.18)].map(p => [p[0], 0.225, p[1]])[0]), col); B.wood.geo(room, new CylinderGeometry(0.02, 0.02, 0.45, 4), T(...[m(0.18, 0.18)].map(p => [p[0], 0.225, p[1]])[0]), col);
    const g = new PlaneGeometry(0.44, 0.44); g.rotateX(-Math.PI / 2); B.wood.geo(room, g, T(x, 0.46, z, [1, 1, 1], -rot), col); const bk = m(0, 0.2); const g2 = new PlaneGeometry(0.44, 0.45); B.wood.geo(room, g2, T(bk[0], 0.7, bk[1], [1, 1, 1], -rot), col); };
  const armchair = (room, x, z, rot, col) => { const g = new Group(); void g; const c = Math.cos(rot), s = Math.sin(rot);
    const add = (a, b, y0, y1, w, d, hex) => { const px = x + a * c - b * s, pz = z + a * s + b * c, geo = new PlaneGeometry(1, 1); void geo; B.solid.geo(room, boxGeo(w, y1 - y0, d), T(px, (y0 + y1) / 2, pz, [1, 1, 1], -rot), hex); };
    add(0, 0, 0, 0.42, 0.85, 0.8, col); add(0, 0.32, 0.42, 0.95, 0.85, 0.18, col); add(-0.38, 0, 0.42, 0.62, 0.12, 0.8, col); add(0.38, 0, 0.42, 0.62, 0.12, 0.8, col); add(0, -0.02, 0.42, 0.5, 0.62, 0.62, 0xf1dcb0); colliders.push({ x, z, r: 0.5 }); };
  const boxGeo = (w, h, d) => { const g = new CylinderGeometry(0.5, 0.5, 1, 4, 1); g.rotateY(Math.PI / 4); g.scale(w * Math.SQRT2, h, d * Math.SQRT2); return g; };

  // private rooms: bed, bookshelf, rug, plant, lamp, portrait of the cat
  const BLANKETS = [0xc8693f, 0x4faaa5, 0xd9a441, 0x8f6f9c, 0x6f86a8];
  let pk = 0;
  for (const id of roomIds) {
    const R = R3[id], top = R[1] === 0, owner = agentOfRoom(id);
    if (rmeta.get(id).kind !== 'private') continue;
    const desk = deskOf.get(id), door = DOORS3.find(D => D.a === id || D.b === id), wallZ = top ? R[1] : R[3], inZ = top ? 1 : -1;
    const farLeft = door.cx > (R[0] + R[2]) / 2; // bed goes in the corner away from the door
    const bx0 = farLeft ? R[0] : R[2] - 1.15, bx1 = bx0 + 1.15, bz0 = top ? R[1] : R[3] - 2.05, bz1 = bz0 + 2.05;
    bed(id, bx0 + 0.02, top ? bz0 + 0.06 : bz0, bx1 - 0.02, top ? bz1 : bz1 - 0.06, BLANKETS[pk % 5]);
    const shx = farLeft ? bx1 + 0.35 : bx0 - 1.75; bookshelf(id, shx, top ? wallZ : wallZ - 0.35, shx + 1.3, top ? wallZ + 0.35 : wallZ, 1.85);
    rug(id, desk.x, desk.z + inZ * -0.2, 2.6, 1.8, pk);
    plant(id, farLeft ? R[2] - 0.35 : R[0] + 0.35, top ? R[1] + 0.35 : R[3] - 0.35);
    floorLamp(id, farLeft ? bx1 + 0.2 : bx0 - 0.2, (bz0 + bz1) / 2 + inZ * 0.6);
    if (owner) picture(id, farLeft ? R[0] + 0.03 : R[2] - 0.03, 1.65, (R[1] + R[3]) / 2, [farLeft ? 1 : -1, 0, 0], 0.55, 0.55, owner.face);
    pendant(id, (R[0] + R[2]) / 2, (R[1] + R[3]) / 2);
    pk++;
  }
  // family hall: fireplace, sofa, armchairs, tea table, rug, tree, string lights
  const hcx = (H[0] + H[2]) / 2, ob = OBSTACLES.map(o => ({ ...to3(o.x, o.y), o }));
  const fx = fire3.x;
  B.solid.box('hall', fx - 1.0, 0, H[1], fx - 0.55, 1.25, H[1] + 0.45, 0x8d7f74); B.solid.box('hall', fx + 0.55, 0, H[1], fx + 1.0, 1.25, H[1] + 0.45, 0x8d7f74); B.solid.box('hall', fx - 0.55, 0.85, H[1], fx + 0.55, 1.25, H[1] + 0.45, 0x8d7f74);
  B.solid.box('hall', fx - 0.55, 0, H[1], fx + 0.55, 0.85, H[1] + 0.12, [0.02, 0.012, 0.008]); B.solid.box('hall', fx - 0.55, 0, H[1], fx + 0.55, 0.1, H[1] + 0.45, 0x2a1c14);
  for (let i = 0; i < 3; i++) B.wood.geo('hall', new CylinderGeometry(0.05, 0.05, 0.6, 6).rotateZ(Math.PI / 2), T(fx, 0.15 + i * 0.05, H[1] + 0.22 + i * 0.05, [1, 1, 1], i * 0.4 - 0.4), 0x3a2416);
  B.wood.box('hall', fx - 1.15, 1.25, H[1], fx + 1.15, 1.35, H[1] + 0.55, 0x5a3720); B.solid.box('hall', fx - 0.7, 1.35, H[1], fx + 0.7, WH, H[1] + 0.35, 0x8d7f74);
  B.solid.box('hall', fx - 0.75, 0, H[1] + 0.45, fx + 0.75, 0.06, H[1] + 0.95, 0x6d625a); boxC(fx - 1.05, H[1], fx + 1.05, H[1] + 0.95);
  picture('hall', fx, 1.85, H[1] + 0.36, [0, 0, 1], 0.9, 0.6, 'art/face_dev01b.jpg');
  const fires = [0, 1, 2].map(i => { const sp = new Sprite(additive(fireTex, 0xffffff, 0.95)); sp.position.set(fx - 0.2 + i * 0.2, 0.42, H[1] + 0.3); sp.scale.set(0.38, 0.6, 1); decor.add(sp); return sp; });
  const fireGlow = halo(fx, 0.55, H[1] + 0.7, 2.6, 0xff7a2a, 0.45);
  const floorGlow = new Mesh(new PlaneGeometry(3.4, 2.6), new MeshBasicMaterial({ map: glowTex, color: 0xff7a2a, transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false })); floorGlow.rotation.x = -Math.PI / 2; floorGlow.position.set(fx, 0.012, H[1] + 1.4); decor.add(floorGlow);
  const ring = to3(512, 482); rug('hall', ring.x, ring.z, 4.6, 3.4, 0, true);
  const tea = ob[0]; B.wood.box('hall', tea.x - 0.65, 0.36, tea.z - 0.42, tea.x + 0.65, 0.42, tea.z + 0.42, 0x6b4428); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.wood.box('hall', tea.x + a * 0.58 - 0.03, 0, tea.z + b * 0.35 - 0.03, tea.x + a * 0.58 + 0.03, 0.36, tea.z + b * 0.35 + 0.03, 0x4a2c18); boxC(tea.x - 0.68, tea.z - 0.45, tea.x + 0.68, tea.z + 0.45);
  for (let i = 0; i < 4; i++) { B.solid.geo('hall', new CylinderGeometry(0.04, 0.035, 0.1, 8), T(tea.x - 0.3 + i * 0.2, 0.47, tea.z + (i % 2 ? 0.1 : -0.1)), 0x9a3a1e); }
  B.solid.geo('hall', new SphereGeometry(0.12, 10, 8), T(tea.x + 0.38, 0.52, tea.z, [1, 0.8, 1]), 0xd9d2c6);
  const ACH = [0x8b2f2a, 0x2f4f6f, 0x3f6f4f, 0xc8693f];
  ob.slice(1, 5).forEach((a, i) => armchair('hall', a.x, a.z, Math.atan2(tea.x - a.x, tea.z - a.z) * -1 + Math.PI, ACH[i]));
  const so = ob[5]; { const w = 3.0; B.solid.box('hall', so.x - w / 2, 0.08, so.z - 0.4, so.x + w / 2, 0.45, so.z + 0.45, 0x2f4f6f); B.solid.box('hall', so.x - w / 2, 0.45, so.z + 0.22, so.x + w / 2, 0.95, so.z + 0.45, 0x2f4f6f); B.solid.box('hall', so.x - w / 2 - 0.12, 0.08, so.z - 0.4, so.x - w / 2, 0.65, so.z + 0.45, 0x264160); B.solid.box('hall', so.x + w / 2, 0.08, so.z - 0.4, so.x + w / 2 + 0.12, 0.65, so.z + 0.45, 0x264160);
    for (let i = 0; i < 3; i++) B.solid.box('hall', so.x - w / 2 + 0.1 + i * 1.0, 0.45, so.z - 0.35, so.x - w / 2 + 0.95 + i * 1.0, 0.55, so.z + 0.2, 0x3b5f84); B.solid.box('hall', so.x - 1.1, 0.55, so.z + 0.05, so.x - 0.75, 0.85, so.z + 0.2, 0xd9a441); boxC(so.x - w / 2 - 0.12, so.z - 0.4, so.x + w / 2 + 0.12, so.z + 0.45); }
  // christmas-ish winter tree in the corner
  { const tx = H[2] - 0.75, tz = H[1] + 0.75; B.solid.geo('hall', new CylinderGeometry(0.2, 0.24, 0.3, 8), T(tx, 0.15, tz), 0x8b2f2a); for (let i = 0; i < 3; i++) B.solid.geo('hall', new ConeGeometry(0.62 - i * 0.16, 0.8, 9), T(tx, 0.62 + i * 0.5, tz), [0x2f6a3c, 0x3f7f4a, 0x4a8f55][i]); B.solid.geo('hall', new SphereGeometry(0.07, 6, 5), T(tx, 1.95, tz), 0xffe08a); halo(tx, 1.95, tz, 0.5, 0xffd27f, 0.6); colliders.push({ x: tx, z: tz, r: 0.6 });
    const pts = []; for (let i = 0; i < 26; i++) { const h = 0.4 + rnd() * 1.4, r = (1 - (h - 0.3) / 1.7) * 0.6 + 0.04, a = rnd() * 6.28; pts.push(tx + Math.cos(a) * r, h, tz + Math.sin(a) * r); }
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pts, 3)); decor.add(new Points(g, new PointsMaterial({ size: 0.09, map: glowTex, color: 0xffcf7a, transparent: true, blending: AdditiveBlending, depthWrite: false }))); }
  floorLamp('hall', H[0] + 0.45, H[3] - 0.45); floorLamp('hall', H[2] - 0.45, H[3] - 0.45); plant('hall', H[0] + 0.45, H[1] + 0.45, 1.3);
  bookshelf('hall', fx + 1.5, H[1], fx + 2.9, H[1] + 0.35, 1.9); bookshelf('hall', fx - 2.9, H[1], fx - 1.5, H[1] + 0.35, 1.9);
  { const pts = []; for (const [x0, x1, z] of [[H[0] + 0.2, H[2] - 0.2, H[1] + 0.06]]) for (let x = x0; x <= x1; x += 0.22) pts.push(x, 2.45 - Math.sin(((x - x0) / 1.4) * Math.PI) ** 2 * 0.12, z);
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pts, 3)); decor.add(new Points(g, new PointsMaterial({ size: 0.12, map: glowTex, color: 0xffc56b, transparent: true, blending: AdditiveBlending, depthWrite: false }))); }
  // kitchen: counters, stove, fridge, samovar, table
  { const k = K, tz = to3(TEA_SPOT.x, TEA_SPOT.y).z;
    B.wood.box('kitchen', k[0], 0, k[1] + 1.2, k[0] + 0.62, 0.88, k[3] - 1.4, 0x7a4a2a); B.solid.box('kitchen', k[0], 0.88, k[1] + 1.2, k[0] + 0.66, 0.93, k[3] - 1.4, 0xe9e2d4); boxC(k[0], k[1] + 1.2, k[0] + 0.66, k[3] - 1.4);
    B.wood.box('kitchen', k[0], 1.5, k[1] + 1.2, k[0] + 0.38, 2.2, k[3] - 1.4, 0x8a5a32);
    B.solid.box('kitchen', k[0] + 0.05, 0.93, tz + 0.7, k[0] + 0.6, 0.95, tz + 1.3, 0x222222); for (let i = 0; i < 4; i++) B.solid.geo('kitchen', new CylinderGeometry(0.09, 0.09, 0.02, 10), T(k[0] + 0.2 + (i % 2) * 0.25, 0.96, tz + 0.85 + (i > 1 ? 0.3 : 0)), 0x444444);
    B.solid.geo('kitchen', new CylinderGeometry(0.13, 0.16, 0.42, 12), T(k[0] + 0.33, 1.14, tz - 0.1), 0xc9a24a); B.solid.geo('kitchen', new SphereGeometry(0.1, 10, 6), T(k[0] + 0.33, 1.4, tz - 0.1), 0x9a6b2a); halo(k[0] + 0.33, 1.2, tz - 0.1, 0.5, 0xffd27f, 0.25);
    for (let i = 0; i < 3; i++) B.solid.geo('kitchen', new CylinderGeometry(0.035, 0.03, 0.09, 8), T(k[0] + 0.3, 0.98, tz + 0.25 + i * 0.12), 0x9a3a1e);
    B.solid.box('kitchen', k[0], 0, k[1], k[0] + 0.75, 1.9, k[1] + 0.75, 0xe8e2d6); boxC(k[0], k[1], k[0] + 0.75, k[1] + 0.75); B.solid.box('kitchen', k[0] + 0.74, 0.9, k[1] + 0.1, k[0] + 0.77, 1.3, k[1] + 0.14, 0x888888);
    const tx = (k[0] + k[2]) / 2 + 0.4, tz2 = k[1] + 1.1; B.wood.box('kitchen', tx - 0.6, 0.72, tz2 - 0.4, tx + 0.6, 0.77, tz2 + 0.4, 0x8a5a32); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.wood.box('kitchen', tx + a * 0.52 - 0.03, 0, tz2 + b * 0.32 - 0.03, tx + a * 0.52 + 0.03, 0.72, tz2 + b * 0.32 + 0.03, 0x5a3720); boxC(tx - 0.62, tz2 - 0.42, tx + 0.62, tz2 + 0.42);
    chair('kitchen', tx - 0.85, tz2, Math.PI / 2); chair('kitchen', tx + 0.85, tz2, -Math.PI / 2); rug('kitchen', (k[0] + k[2]) / 2 + 0.3, k[3] - 1.6, 2.2, 1.4, 3, true);
    pendant('kitchen', k[0] + 1.1, tz, 0xc8693f); pendant('kitchen', tx, tz2, 0xc8693f); plant('kitchen', k[2] - 0.35, k[3] - 0.35); }
  // meeting room: long table + chairs, chart, plant
  { const m = M, t = ob[6], hw = 0.62, hd = Math.min(2.4, (m[3] - m[1]) / 2 - 1.2);
    B.wood.box('meeting', t.x - hw, 0.72, t.z - hd, t.x + hw, 0.78, t.z + hd, 0x6b4428); B.wood.box('meeting', t.x - 0.2, 0, t.z - hd + 0.3, t.x + 0.2, 0.72, t.z + hd - 0.3, 0x4a2c18); boxC(t.x - hw, t.z - hd, t.x + hw, t.z + hd);
    for (let i = 0; i < 4; i++) { const z = t.z - hd + 0.6 + i * (2 * hd - 1.2) / 3; chair('meeting', t.x - hw - 0.35, z, Math.PI / 2, 0x2f4f6f); chair('meeting', t.x + hw + 0.35, z, -Math.PI / 2, 0x2f4f6f); }
    frames.push({ room: 'meeting', x: m[2] - 0.03, y: 1.55, z: (m[1] + m[3]) / 2, n: [-1, 0, 0], w: 1.8, h: 1.1, tex: chartTex });
    plant('meeting', m[2] - 0.4, m[1] + 0.4, 1.2); plant('meeting', m[2] - 0.4, m[3] - 0.4, 1.2); pendant('meeting', t.x, t.z - 1.2); pendant('meeting', t.x, t.z + 1.2); }
  // entrance: front door, coat rack, shoe bench, aquarium, bird cage, runner
  const W3 = R3.hallway, tank3 = { x: W3[0] + 0.35, z: to3((TANK.x0 + TANK.x1) / 2, (TANK.y0 + TANK.y1) / 2).z }, cage3 = { x: W3[2] - 0.45, z: to3(CAGE.x, CAGE.y).z };
  { const w = W3, cx = (w[0] + w[2]) / 2; B.wood.box('hallway', cx - 0.55, 0, w[3] - 0.06, cx + 0.55, 2.15, w[3], 0x5a2e1a); B.solid.geo('hallway', new SphereGeometry(0.04, 8, 6), T(cx + 0.4, 1.05, w[3] - 0.09), 0xd9a441);
    B.wood.box('hallway', cx - 0.65, 2.15, w[3] - 0.08, cx + 0.65, 2.25, w[3], 0xe9dcc4); halo(cx, 2.4, w[3] - 0.25, 0.8, 0xffc078, 0.4);
    rug('hallway', cx, (w[1] + w[3]) / 2, 1.3, 3.6, 1, true);
    B.wood.box('hallway', w[0], 0, tank3.z - 0.6, w[0] + 0.55, 0.75, tank3.z + 0.6, 0x5a3720); boxC(w[0], tank3.z - 0.6, w[0] + 0.55, tank3.z + 0.6);
    B.wood.box('hallway', w[2] - 0.5, 0, w[1] + 0.6, w[2], 0.45, w[1] + 1.8, 0x6b4428); boxC(w[2] - 0.5, w[1] + 0.6, w[2], w[1] + 1.8);
    for (let i = 0; i < 3; i++) B.solid.box('hallway', w[2] - 0.45, 0.45, w[1] + 0.75 + i * 0.35, w[2] - 0.15, 0.55, w[1] + 0.95 + i * 0.35, [0x8b2f2a, 0x2f4f6f, 0x6d625a][i]);
    B.wood.geo('hallway', new CylinderGeometry(0.025, 0.03, 1.8, 6), T(w[0] + 0.35, 0.9, w[3] - 0.5), 0x4a2c18); for (let i = 0; i < 3; i++) B.solid.box('hallway', w[0] + 0.15, 1.0, w[3] - 0.75 + i * 0.15, w[0] + 0.5, 1.7, w[3] - 0.62 + i * 0.15, [0x8b2f2a, 0x3f6f4f, 0xd9a441][i]); colliders.push({ x: w[0] + 0.35, z: w[3] - 0.5, r: 0.3 });
    B.wood.geo('hallway', new CylinderGeometry(0.25, 0.3, 0.05, 12), T(cage3.x, 0.02, cage3.z), 0x4a2c18); B.wood.box('hallway', cage3.x - 0.03, 0, cage3.z - 0.03, cage3.x + 0.03, 1.1, cage3.z + 0.03, 0x4a2c18); colliders.push({ x: cage3.x, z: cage3.z, r: 0.3 });
    plant('hallway', w[0] + 0.4, w[1] + 0.4, 1.1); plant('hallway', w[2] - 0.4, w[3] - 0.4, 1.1); }

  // ---------------------------------------------------------------- build the static meshes
  const add = m => { scene.add(m); return m; };
  add(B.wood.mesh(vcMat(woodTex))); add(B.tile.mesh(vcMat(tileTex))); add(B.solid.mesh(vcMat(null))); add(B.books.mesh(vcMat(booksTex)));
  for (const id of roomIds) add(papers[id].mesh(vcMat(paperTex(id))));
  rugBatches.forEach((rb, k) => { if (rb.p.length) add(rb.mesh(vcMat(rugTex(k)))); });
  add(winB.mesh(new MeshBasicMaterial({ map: nightTex, side: DoubleSide, fog: false })));
  add(snowB.mesh(new MeshBasicMaterial({ map: snowTex, transparent: true, depthWrite: false, side: DoubleSide, fog: false })));
  for (const f of frames) {
    const t = f.tex || await tex(f.src); if (!t) continue;
    const g = new PlaneGeometry(f.w, f.h), m = new Mesh(g, new MeshBasicMaterial({ map: t, color: new Color().setRGB(...lightAt(f.room, f.x, f.y, f.z, ...f.n).map(v => Math.min(1, v * 1.1))) }));
    m.position.set(f.x + f.n[0] * 0.045, f.y, f.z + f.n[2] * 0.045); m.rotation.y = Math.atan2(f.n[0], f.n[2]); scene.add(m);
    const fb = new Batch(); const ax = Math.abs(f.n[2]) > 0.5, hw = f.w / 2 + 0.05, hh = f.h / 2 + 0.05, dd = 0.04;
    if (ax) fb.box(f.room, f.x - hw, f.y - hh, f.z - dd + f.n[2] * 0.01, f.x + hw, f.y + hh, f.z + dd * 0.4 + f.n[2] * 0.01, 0x6b4428); else fb.box(f.room, f.x - dd + f.n[0] * 0.01, f.y - hh, f.z - hw, f.x + dd * 0.4 + f.n[0] * 0.01, f.y + hh, f.z + hw, 0x6b4428);
    scene.add(fb.mesh(vcMat(null)));
  }

  // ---------------------------------------------------------------- doors (hinged, swing open when someone is near or on tap)
  const doors = DOORS3.map(D => {
    const pivot = new Group(), b = new Batch(), half = DW / 2 - 0.03;
    b.box(D.a, 0, 0, -0.025, DW - 0.06, DH - 0.03, 0.025, 0x7a4426); b.box(D.a, 0.1, 0.25, -0.03, DW - 0.16, 0.95, 0.03, 0x6b3a20); b.box(D.a, 0.1, 1.15, -0.03, DW - 0.16, 1.95, 0.03, 0x6b3a20);
    const knob = new SphereGeometry(0.035, 8, 6); b.geo(D.a, knob, T(DW - 0.16, 1.0, 0.05), 0xd9a441); b.geo(D.a, knob, T(DW - 0.16, 1.0, -0.05), 0xd9a441);
    const mesh = b.mesh(vcMat(null)); pivot.add(mesh); mesh.matrixAutoUpdate = true;
    if (D.vertical) { pivot.position.set(D.cx, 0, D.cz - half); pivot.rotation.y = -Math.PI / 2; } else pivot.position.set(D.cx - half, 0, D.cz);
    scene.add(pivot);
    return { D, pivot, base: pivot.rotation.y, open: 0, target: 0, hold: 0, mesh };
  });
  const doorFree = D => { const d = doors[D.i]; return d.open > 0.62; };

  // ---------------------------------------------------------------- characters (camera-facing sprites)
  const bill = () => { const g = new PlaneGeometry(1, 1); g.translate(0, 0.5, 0); return g; };
  const shadowMat = new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, color: 0x000000, opacity: 1 });
  const shadowGeo = new PlaneGeometry(1, 1); shadowGeo.rotateX(-Math.PI / 2);
  const mkShadow = s => { const m = new Mesh(shadowGeo, shadowMat); m.scale.set(s, 1, s * 0.7); m.position.y = 0.012; scene.add(m); return m; };
  const spriteMat = t => new MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.12, side: DoubleSide });
  const deskTex = await tex('art/desk_empty.webp');
  const SIT_M = 1.42, STAND_M = 0.95;
  const chars = new Map();
  async function syncAgents() {
    for (const a of S.agents.values()) {
      if (chars.has(a.id)) continue;
      const [sitT, idleT, walkT] = await Promise.all([tex(a.agent.art.sit), tex(a.agent.art.idle), a.agent.art.walk4 ? tex(a.agent.art.walk4) : Promise.resolve(null)]);
      const deskMesh = new Mesh(bill(), spriteMat(sitT)), mover = new Mesh(bill(), spriteMat(idleT)); mover.rotation.order = 'YXZ'; deskMesh.rotation.order = 'YXZ';
      const mats = { sit: deskMesh.material, empty: spriteMat(deskTex), idle: mover.material, walk: walkT ? spriteMat(walkT) : null };
      const glow = new Sprite(additive(glowTex, 0x7fb4ff, 0)); glow.scale.set(1.1, 1.1, 1);
      scene.add(deskMesh, mover, glow);
      const d3 = to3(a.slot.x, a.slot.y);
      colliders.push({ x: d3.x, z: d3.z, r: 0.5, agent: a.id });
      chars.set(a.id, { a, deskMesh, mover, mats, glow, d3, sh: mkShadow(0.9), msh: mkShadow(0.55), prev: null, f3: 1, aspect: { sit: sitT.image.width / sitT.image.height, empty: deskTex.image.width / deskTex.image.height, idle: idleT.image.width / idleT.image.height, walk: walkT ? walkT.image.width / 4 / walkT.image.height : 1 } });
      deskMesh.userData.id = a.id; mover.userData.id = a.id;
    }
  }
  await syncAgents();
  // pets
  const petMeshes = [];
  for (const p of S.pets) { const t = await tex(p.img); if (!t) continue; const m = new Mesh(bill(), spriteMat(t)); m.rotation.order = 'YXZ'; const h = p.kind === 'dog' ? 0.58 : 0.36; m.scale.set(h * t.image.width / t.image.height, h, 1); scene.add(m); petMeshes.push({ p, m, h, sh: mkShadow(p.kind === 'dog' ? 0.7 : 0.45), prev: null, f3: -1 }); }
  // aquarium + fish
  const glass = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: 0x5fb8e0, transparent: true, opacity: 0.35, depthWrite: false, side: DoubleSide }));
  const tankBox = new Group(); { const w = 0.45, h = 0.45, d = 1.0; for (const [px, pz, ry, sw] of [[w, 0, Math.PI / 2, d], [0, -d / 2, 0, w], [0, d / 2, 0, w], [-w + 0.02, 0, Math.PI / 2, d]]) { const g = glass.clone(); g.scale.set(sw, h, 1); g.position.set(px / 2 + w / 2 - 0.02, h / 2, pz); g.rotation.y = ry; tankBox.add(g); } const water = glass.clone(); water.material = glass.material.clone(); water.material.opacity = 0.5; water.rotation.x = -Math.PI / 2; water.scale.set(w, d, 1); water.position.set(w / 2, h - 0.04, 0); tankBox.add(water); }
  tankBox.position.set(W3[0] + 0.05, 0.75, tank3.z); scene.add(tankBox); halo(W3[0] + 0.3, 1.0, tank3.z, 0.9, 0x5fc8ff, 0.35);
  const fishes = [0xff8a3c, 0x4fc3e8, 0xffd166, 0xff6f61].map((c, i) => { const g = new SphereGeometry(0.035, 8, 6); g.scale(1, 0.7, 1.7); const m = new Mesh(g, new MeshBasicMaterial({ color: c })); scene.add(m); return { m, ph: i * 1.7, sp: 0.4 + i * 0.12, y: 0.86 + i * 0.07 }; });
  // bird cage + hopping bird
  const cageG = new Group(); { const mat = new MeshBasicMaterial({ color: 0xd9b26a }); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, bar = new Mesh(new CylinderGeometry(0.006, 0.006, 0.45, 3), mat); bar.position.set(Math.cos(a) * 0.2, 0.225, Math.sin(a) * 0.2); cageG.add(bar); } const top = new Mesh(new SphereGeometry(0.2, 12, 6, 0, 6.283, 0, Math.PI / 2), new MeshBasicMaterial({ color: 0xd9b26a, wireframe: true })); top.position.y = 0.45; cageG.add(top); const base = new Mesh(new CylinderGeometry(0.22, 0.22, 0.03, 12), new MeshBasicMaterial({ color: 0x6b4a2e })); cageG.add(base); }
  cageG.position.set(cage3.x, 1.1, cage3.z); scene.add(cageG);
  const bird = new Group(); { const y = new MeshBasicMaterial({ color: 0xffd34d }), body = new Mesh(new SphereGeometry(0.05, 10, 8), y); body.scale.set(1.3, 1, 1); const head = new Mesh(new SphereGeometry(0.035, 10, 8), y); head.position.set(0.05, 0.05, 0); const beak = new Mesh(new ConeGeometry(0.012, 0.03, 6), new MeshBasicMaterial({ color: 0xe07b2a })); beak.rotation.z = -Math.PI / 2; beak.position.set(0.09, 0.05, 0); const eye = new Mesh(new SphereGeometry(0.007, 6, 4), new MeshBasicMaterial({ color: 0x111111 })); eye.position.set(0.07, 0.065, 0.025); bird.add(body, head, beak, eye); }
  bird.position.set(cage3.x, 1.18, cage3.z); scene.add(bird);
  // hearts
  const heartPool = Array.from({ length: 40 }, () => { const s = new Sprite(new SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false })); s.visible = false; scene.add(s); return s; });

  // ---------------------------------------------------------------- player (the owner) + controls
  const P = { x: 0, z: 0, yaw: 0, pitch: -0.08, r: 0.26, bob: 0, room: null, autoPitch: 0 };
  function placeAt2D(x, y, yaw) { const p = to3(x, y); P.x = p.x; P.z = p.z; if (yaw != null) P.yaw = yaw; unstick(); }
  function unstick() { if (free(P.x, P.z)) return; for (let r = 0.1; r < 2; r += 0.1) for (let k = 0; k < 12; k++) { const x = P.x + Math.cos(k * 0.52) * r, z = P.z + Math.sin(k * 0.52) * r; if (free(x, z)) { P.x = x; P.z = z; return; } } }
  function free(x, z, r = P.r) {
    let ok = false;
    for (const id of roomIds) { const R = R3[id]; if (x > R[0] + r && x < R[2] - r && z > R[1] + r && z < R[3] - r) { ok = true; break; } }
    if (!ok) for (const D of DOORS3) { const along = D.vertical ? z - D.cz : x - D.cx, across = D.vertical ? x - D.cx : z - D.cz; if (Math.abs(along) < DW / 2 - r * 0.6 && Math.abs(across) < H3.wallT / 2 + r + 0.06) { ok = doorFree(D); if (!ok) doors[D.i].bump = 1; break; } }
    if (!ok) return false;
    for (const c of colliders) {
      if (c.r != null) { if (Math.hypot(x - c.x, z - c.z) < c.r + r * 0.8) return false; }
      else if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return false;
    }
    return true;
  }
  placeAt2D(S.avatar?.pos.x ?? 512, S.avatar?.pos.y ?? 760, 0);
  const look = { drag: null, ptrs: new Map() };
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); look.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: 0 }); });
  canvas.addEventListener('pointermove', e => { const p = look.ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; p.moved += Math.abs(dx) + Math.abs(dy); const k = coarse ? 0.0055 : 0.0042; P.yaw += dx * k; P.pitch = clamp(P.pitch + dy * k, -1.1, 0.7); P.autoPitch = 0; userLook = 2.5; });
  const pup = e => { const p = look.ptrs.get(e.pointerId); look.ptrs.delete(e.pointerId); if (p && p.moved < 8) tap(e.clientX, e.clientY); };
  canvas.addEventListener('pointerup', pup); canvas.addEventListener('pointercancel', e => look.ptrs.delete(e.pointerId));
  let userLook = 0;
  const ray = new Raycaster(), ndc = new Vector2();
  function tap(cx, cy) {
    const r = canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    const objs = [...chars.values()].flatMap(c => [c.mover.visible ? c.mover : null, c.deskMesh]).filter(Boolean);
    const hit = ray.intersectObjects([...objs, ...doors.map(d => d.mesh)], false)[0];
    if (!hit || hit.distance > 9) return;
    if (hit.object.userData.id) return onPick?.(hit.object.userData.id);
    const d = doors.find(d => d.mesh === hit.object); if (d) { d.hold = d.hold ? 0 : 1; }
  }
  function interact() { // E: nearest door in front toggles
    let best = null, bd = 2.2; for (const d of doors) { const dist = Math.hypot(d.D.cx - P.x, d.D.cz - P.z); if (dist < bd) { bd = dist; best = d; } }
    if (best) best.hold = best.hold ? 0 : 1; return !!best;
  }

  // ---------------------------------------------------------------- per-frame
  let vw = 1, vh = 1;
  function resize() {
    const r = canvas.getBoundingClientRect(); vw = Math.max(1, r.width); vh = Math.max(1, r.height);
    const cap = coarse ? 1.5 : (vw * vh > 1.6e6 ? 1.25 : 1.5);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cap)); renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh; camera.fov = vw < vh ? 78 : 66; camera.updateProjectionMatrix();
  }
  const camRight = new Vector3(), tmp = new Vector3();
  function tint(room, x, y, z) { const L = lightAt(room, x, y, z, camRight.z, 0.3, -camRight.x); const m = Math.max(L[0], L[1], L[2]), k = clamp(1.05 / Math.max(0.0001, m), 0, 1) * clamp(m * 1.35, 0.42, 1.05); return [L[0] * k / m * m, L[1] * k / m * m, L[2] * k / m * m].map(v => clamp(v * 1.55, 0.3, 1.08)); }
  function setUV(mesh, u0, u1) { const uv = mesh.geometry.attributes.uv; uv.setXY(0, u0, 1); uv.setXY(1, u1, 1); uv.setXY(2, u0, 0); uv.setXY(3, u1, 0); uv.needsUpdate = true; }
  function faceCam(m, x, z) { m.rotation.y = Math.atan2(camera.position.x - x, camera.position.z - z); }
  let t = 0;
  function frame(dt) {
    t += dt;
    // --- move the player
    const k = S.keys; let fw = 0, st = 0, turn = 0;
    if (k.has('w') || k.has('arrowup') || k.has('ص')) fw += 1; if (k.has('s') || k.has('arrowdown') || k.has('س')) fw -= 1;
    if (k.has('a') || k.has('ش')) st -= 1; if (k.has('d') || k.has('ي')) st += 1;
    if (k.has('arrowleft')) turn -= 1; if (k.has('arrowright')) turn += 1;
    fw += -S.joy.y; turn += S.joy.x * 0.9;
    P.yaw += turn * dt * 1.9;
    const mag = Math.hypot(fw, st), speed = (k.has('shift') ? 3.6 : 2.1) * Math.min(1, mag);
    let moving = false;
    if (mag > 0.08) {
      const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw), dx = (sy * fw + cy * st) / mag * speed * dt, dz = (-cy * fw + sy * st) / mag * speed * dt;
      // auto-open the door you walk into
      for (const d of doors) if (Math.hypot(d.D.cx - P.x, d.D.cz - P.z) < 1.5) d.near = 1;
      const ox = P.x, oz = P.z;
      if (free(P.x + dx, P.z)) P.x += dx; if (free(P.x, P.z + dz)) P.z += dz;
      moving = Math.hypot(P.x - ox, P.z - oz) > 1e-4; if (moving) P.bob += Math.hypot(P.x - ox, P.z - oz) * 5.2;
    }
    const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
    camera.position.set(P.x, H3.eye + (moving ? Math.abs(Math.sin(P.bob)) * 0.035 : 0), P.z);
    // look down a little at the cats cuddling your legs
    userLook = Math.max(0, userLook - dt);
    const cuddling = [...S.agents.values()].some(a => a.mode === 'cuddle');
    const wantPitch = cuddling ? -0.42 : -0.08; if (userLook <= 0 && !moving) P.pitch += (wantPitch - P.pitch) * (1 - Math.exp(-dt * 1.6));
    camera.rotation.set(P.pitch, -P.yaw, 0);
    camRight.set(cy, 0, sy);
    // --- report to the shared simulation (overview + cat behaviour)
    const p2 = to2(P.x, P.z); scene2d.setOwnerPos(p2, moving, { x: sy, z: -cy }, sy);
    const room = room3At(P.x, P.z); if (room && room !== P.room) { P.room = room; onRoomChange?.(room); }
    // --- doors
    for (const d of doors) {
      let near = d.near || 0; d.near = 0;
      for (const c of chars.values()) { if (c.a.mode !== 'walking') continue; const p = c.pos3; if (p && Math.hypot(p.x - d.D.cx, p.z - d.D.cz) < 1.4) near = 1; }
      if (Math.hypot(P.x - d.D.cx, P.z - d.D.cz) < 1.25) near = 1;
      if (d.bump) { near = 1; d.bump = 0; }
      d.target = d.hold || near ? 1 : 0; d.open += (d.target - d.open) * (1 - Math.exp(-dt * (d.target ? 6 : 2.5)));
      d.pivot.rotation.y = d.base - d.open * 1.75;
    }
    // --- characters
    for (const c of chars.values()) {
      const a = c.a, seated = a.mode === 'seated', st2 = a.status?.status || 'offline', off = st2 === 'offline';
      const d3 = c.d3; c.deskMesh.position.set(d3.x, 0, d3.z); faceCam(c.deskMesh, d3.x, d3.z);
      const dTint = tint(a.room, d3.x, 1, d3.z).map(v => off ? v * 0.62 : v);
      if (seated) { c.deskMesh.material = c.mats.sit; const br = 1 + Math.sin(t * (st2 === 'working' ? 2.4 : 1.4) + a.ph) * 0.008; c.deskMesh.scale.set(SIT_M * c.aspect.sit, SIT_M * br, 1); }
      else { c.deskMesh.material = c.mats.empty; c.deskMesh.scale.set(SIT_M * 0.97 * c.aspect.empty, SIT_M * 0.97, 1); }
      c.deskMesh.material.color.setRGB(...dTint); if (off) { const g = (dTint[0] + dTint[1] + dTint[2]) / 3; c.deskMesh.material.color.setRGB(g, g, g * 1.05); }
      c.sh.position.set(d3.x, 0.012, d3.z);
      // laptop glow / problem pulse
      const gl = c.glow.material; c.glow.position.set(d3.x, 1.0, d3.z + 0.05);
      gl.opacity = seated && st2 === 'working' ? 0.22 + 0.08 * Math.sin(t * 9 + a.ph) : seated && st2 === 'problem' ? 0.35 + 0.25 * Math.sin(t * 5) : 0; gl.color.set(st2 === 'problem' ? 0xff3a2a : 0x7fb4ff); c.glow.scale.setScalar(st2 === 'problem' ? 1.8 : 1.1);
      c.mover.visible = !seated; c.msh.visible = !seated;
      if (!seated) {
        const p = to3(a.pos.x, a.pos.y); c.pos3 = p;
        if (c.prev) { const vx = p.x - c.prev.x, vz = p.z - c.prev.z, sr = vx * camRight.x + vz * camRight.z; if (Math.abs(sr) > 0.0015) c.f3 = Math.sign(sr); }
        const walking = a.mode === 'walking' && !(a.delay > 0);
        if (!walking) { const side = (p.x - P.x) * camRight.x + (p.z - P.z) * camRight.z; c.f3 = side > 0 ? -1 : 1; }
        c.prev = p;
        const fr = scene2d.frameOf(a), useWalk = walking && c.mats.walk;
        c.mover.material = useWalk ? c.mats.walk : c.mats.idle;
        const asp = useWalk ? c.aspect.walk : c.aspect.idle, h = STAND_M, w = h * asp;
        if (useWalk) { const u0 = fr.f / 4, u1 = (fr.f + 1) / 4; c.f3 > 0 ? setUV(c.mover, u0, u1) : setUV(c.mover, u1, u0); }
        else c.f3 > 0 ? setUV(c.mover, 1, 0) : setUV(c.mover, 0, 1); // idle art faces left
        const rub = a.mode === 'cuddle' ? Math.sin(t * 5 + a.ph) : 0, bob = useWalk && fr.f % 2 ? 0.018 : 0;
        c.mover.position.set(p.x + camRight.x * rub * 0.07, bob, p.z + camRight.z * rub * 0.07); faceCam(c.mover, p.x, p.z); c.mover.rotation.z = rub * 0.08;
        c.mover.scale.set(w, h * (a.mode === 'cuddle' ? 1 + Math.sin(t * 10 + a.ph) * 0.012 : 1), 1);
        const mt = tint(room3At(p.x, p.z) || a.room, p.x, 0.8, p.z); c.mover.material.color.setRGB(...mt.map(v => off ? v * 0.7 : v));
        c.msh.position.set(p.x, 0.013, p.z);
      } else c.pos3 = null;
    }
    // --- pets
    for (const pm of petMeshes) {
      const p = to3(pm.p.pos.x, pm.p.pos.y), moving2 = pm.p.path.length > 0;
      let y = 0; if (pm.p.kind === 'cat') { const so = ob[5]; if (Math.abs(p.z - so.z) < 0.5 && Math.abs(p.x - so.x) < 1.6) y = 0.55; }
      const hop = moving2 ? Math.abs(Math.sin(pm.p.ph)) * 0.06 : pm.p.hop > 0 ? Math.abs(Math.sin(t * 10)) * 0.12 : 0;
      if (pm.prev) { const sr = (p.x - pm.prev.x) * camRight.x + (p.z - pm.prev.z) * camRight.z; if (Math.abs(sr) > 0.001) pm.f3 = Math.sign(sr); } pm.prev = p;
      pm.m.position.set(p.x, y + hop, p.z); faceCam(pm.m, p.x, p.z); pm.m.rotation.z = moving2 ? Math.sin(pm.p.ph) * 0.06 : 0;
      pm.f3 > 0 ? setUV(pm.m, 1, 0) : setUV(pm.m, 0, 1);
      const br = pm.p.kind === 'cat' ? 1 + Math.sin(t * 1.8) * 0.03 : 1; pm.m.scale.y = pm.h * br;
      pm.m.material.color.setRGB(...tint(room3At(p.x, p.z) || 'hall', p.x, 0.5, p.z)); pm.sh.position.set(p.x, y + 0.013, p.z);
    }
    // --- hearts
    let hi = 0;
    for (const h of S.hearts) { if (hi >= heartPool.length) break; const s = heartPool[hi++], p = to3(h.x, h.y), dc = Math.max(0.01, Math.hypot(p.x - P.x, p.z - P.z)), a = Math.min(1, h.t * 3) * (1 - h.t / 2.2);
      if (dc < 1.25) { p.x = P.x + (p.x - P.x) / dc * 1.25; p.z = P.z + (p.z - P.z) / dc * 1.25; } s.visible = a > 0.02; s.material.opacity = a * 0.9; s.position.set(p.x + Math.sin(h.t * 4 + h.s * 9) * 0.06, 0.75 * h.h0 + 0.3 + h.t * 0.42, p.z); s.scale.setScalar(0.11 * h.s); }
    for (; hi < heartPool.length; hi++) heartPool[hi].visible = false;
    // --- ambience
    fires.forEach((f, i) => { const fl = 1 + 0.12 * Math.sin(t * (9 + i * 3) + i) + 0.06 * Math.sin(t * 23 + i * 2); f.scale.set(0.36 * (2 - fl), 0.62 * fl, 1); });
    const fl = 0.42 + 0.06 * Math.sin(t * 9) + 0.04 * Math.sin(t * 23); fireGlow.material.opacity = fl; floorGlow.material.opacity = fl * 0.55;
    snowTex.offset.y += dt * 0.07; snowTex.offset.x = Math.sin(t * 0.4) * 0.03;
    fishes.forEach(f => { const u = Math.sin(t * f.sp + f.ph); f.m.position.set(W3[0] + 0.28 + Math.sin(t * 0.7 + f.ph) * 0.1, f.y + Math.sin(t * 1.3 + f.ph) * 0.02, tank3.z + u * 0.38); f.m.rotation.y = Math.cos(t * f.sp + f.ph) > 0 ? Math.PI / 2 : -Math.PI / 2; });
    const hopB = (t % 2.6) < 0.25 ? Math.sin((t % 2.6) / 0.25 * Math.PI) * 0.05 : 0; bird.position.y = 1.18 + hopB; bird.rotation.y = Math.floor(t / 2.6) % 2 ? Math.PI : 0;
    renderer.render(scene, camera);
  }

  // project a character's head for DOM labels; hidden when behind a wall or far away
  const v3 = new Vector3();
  function lineOfSight(x0, z0, x1, z1) { const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.2); for (let i = 1; i < n; i++) { const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n; if (!airAt(x, z)) return false; } return true; }
  function airAt(x, z) { for (const id of roomIds) { const R = R3[id]; if (x >= R[0] && x <= R[2] && z >= R[1] && z <= R[3]) return true; } for (const D of DOORS3) { const along = D.vertical ? z - D.cz : x - D.cx, across = D.vertical ? x - D.cx : z - D.cz; if (Math.abs(along) < DW / 2 && Math.abs(across) <= H3.wallT / 2 + 0.01) return doors[D.i].open > 0.3; } return false; }
  function project(id) {
    const c = chars.get(id); if (!c) return null;
    const seated = c.a.mode === 'seated', p = seated ? c.d3 : c.pos3 || c.d3, hy = seated ? SIT_M * 1.02 : STAND_M + 0.08;
    const dist = Math.hypot(p.x - P.x, p.z - P.z);
    v3.set(p.x, hy, p.z).project(camera);
    const vis = v3.z < 1 && Math.abs(v3.x) < 1.2 && Math.abs(v3.y) < 1.3 && dist < 13 && lineOfSight(P.x, P.z, p.x, p.z);
    return { x: (v3.x + 1) / 2 * vw, y: (1 - v3.y) / 2 * vh, vis, dist };
  }
  function nearestCat(maxD = 2.3) { let best = null, bd = maxD; for (const c of chars.values()) { const p = c.a.mode === 'seated' ? c.d3 : c.pos3; if (!p) continue; const d = Math.hypot(p.x - P.x, p.z - P.z), fwd = ((p.x - P.x) * Math.sin(P.yaw) - (p.z - P.z) * Math.cos(P.yaw)) / (d || 1); if (d < bd && fwd > 0.2) { bd = d; best = c.a.id; } } return best; }
  function enterRoom(id) {
    const R = R3[id]; if (!R) return; const desk = deskOf.get(id), door = DOORS3.find(D => D.a === id || D.b === id);
    let x = 0, z = 0;
    if (desk) { const dp = door.a === id ? door.PA : door.PB; x = desk.x + (dp.x - desk.x) * 0.92; z = desk.z + (dp.z - desk.z) * 0.92; }
    const VIEW = { hall: [(R[0] + R[2]) / 2 + 2.6, R[3] - 0.7, fire3.x, R[1] + 1], hallway: [(R[0] + R[2]) / 2 - 1.2, R[3] - 0.6, (R[0] + R[2]) / 2, R[1]], kitchen: [R[2] - 0.6, R[3] - 0.6, R[0] + 1, R[1] + 2.5], meeting: [R[0] + 0.6, R[3] - 0.6, R[2] - 1, R[1] + 2] }[id];
    if (!desk) { [x, z] = VIEW || [(R[0] + R[2]) / 2, (R[1] + R[3]) / 2]; }
    P.x = x; P.z = z; unstick();
    const tx = desk ? desk.x : VIEW ? VIEW[2] : (R[0] + R[2]) / 2, tz = desk ? desk.z : VIEW ? VIEW[3] : R[1];
    P.yaw = Math.atan2(tx - P.x, -(tz - P.z)); P.pitch = -0.1;
  }
  resize();
  return { frame, resize, project, nearestCat, interact, enterRoom, placeAt2D, syncAgents, P, setVisible: v => { canvas.style.display = v ? 'block' : 'none'; if (v) resize(); }, renderer };
}
