// Illustrated 2.5D scene: painted room + depth-sorted character sprites (Canvas 2D).
import { WORLD, GATHER_RING, WALK_POLY, OBSTACLES, OCCLUDERS, DESK_SLOTS, FIRE, LAMPS, TANK, WINDOWS, BIRD, PETS, LIGHTS, SIT_H, STAND_H, depthScale } from './sceneConfig.js';

const imgCache = new Map();
export function loadImage(src) {
  if (!imgCache.has(src)) imgCache.set(src, new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('img ' + src)); i.src = src; }));
  return imgCache.get(src);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inPoly = (x, y, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const inEll = (x, y, e, pad = 0) => ((x - e.x) / (e.rx + pad)) ** 2 + ((y - e.y) / (e.ry + pad * 0.6)) ** 2 < 1;

export async function createScene(canvas, { onPick, onFrame } = {}) {
  const ctx = canvas.getContext('2d');
  const bg = await loadImage(WORLD.bg);
  const deskEmpty = await loadImage('art/desk_empty.png');
  const pets = await Promise.all(PETS.map(async p => ({ ...p, image: await loadImage(p.img) })));
  const occPaths = OCCLUDERS.map(o => { const p = new Path2D(); for (const poly of o.polys) { p.moveTo(...poly[0]); for (const q of poly.slice(1)) p.lineTo(...q); p.closePath(); } return { ...o, path: p }; });
  const winPaths = WINDOWS.map(w => { const p = new Path2D(); p.moveTo(...w[0]); w.slice(1).forEach(q => p.lineTo(...q)); p.closePath(); return { p, w }; });

  const S = {
    agents: new Map(), papers: [], notes: [], t: 0, fps: 60, walk: false, gathered: false,
    cam: { x: 640, y: 400, z: 1 }, camT: { x: 640, y: 400, z: 1 }, insets: { top: 0, bottom: 0, left: 0, right: 0 },
    avatar: null, keys: new Set(), joy: { x: 0, y: 0 }, focusId: null, hoverId: null,
  };
  let vw = 1, vh = 1, dpr = 1, vignette = null;

  // ---------- snow / fish
  const snow = WINDOWS.map(w => { const xs = w.map(p => p[0]), ys = w.map(p => p[1]); const b = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; return Array.from({ length: 70 }, () => ({ x: b[0] + Math.random() * (b[2] - b[0]), y: b[1] + Math.random() * (b[3] - b[1]), r: 0.6 + Math.random() * 1.3, v: 8 + Math.random() * 16, ph: Math.random() * 6, b })); });
  const fish = Array.from({ length: 6 }, (_, i) => ({ x: TANK.x0 + Math.random() * (TANK.x1 - TANK.x0), y: TANK.y0 + 14 + Math.random() * (TANK.y1 - TANK.y0 - 30), v: (10 + Math.random() * 14) * (i % 2 ? 1 : -1), c: ['#ff8a3c', '#ffb347', '#4fc3e8', '#ff6f61', '#ffd166', '#7fe0c0'][i], s: 3 + Math.random() * 2.5, ph: Math.random() * 6 }));

  // ---------- layout of desks
  function autoSlot(taken) {
    let best = null;
    for (let y = 330; y < 700; y += 18) for (let x = 180; x < 1040; x += 18) {
      if (!walkable(x, y, true)) continue;
      if (Math.abs(x - GATHER_RING.x) < 250 && y < 575) continue; // never behind / on the family table
      if (PETS.some(p => Math.hypot(p.x - x, p.y - y) < 110)) continue;
      if (taken.some(([tx, ty]) => Math.abs(tx - x) < 150 && Math.abs(ty - y) < 95)) continue;
      const d = Math.hypot((x - GATHER_RING.x) / 1.6, y - GATHER_RING.y);
      if (!best || d < best.d) best = { x, y, d };
    }
    return best ? [best.x, best.y] : [180 + taken.length * 40, 520];
  }
  function walkable(x, y, forDesk = false) {
    if (!inPoly(x, y, WALK_POLY)) return false;
    for (const o of OBSTACLES) if (inEll(x, y, o, forDesk ? 70 : 0)) return false;
    if (!forDesk) for (const a of S.agents.values()) if (inEll(x, y, a.deskEll)) return false;
    return true;
  }

  async function setAgents(list) {
    const taken = [];
    const next = new Map();
    for (let i = 0; i < list.length; i++) {
      const ag = list[i];
      const prev = S.agents.get(ag.id);
      const slot = prev?.slot || (i < DESK_SLOTS.length && !taken.some(t => t[0] === DESK_SLOTS[i][0] && t[1] === DESK_SLOTS[i][1]) ? DESK_SLOTS[i] : autoSlot(taken));
      taken.push(slot);
      const [sit, idle, walkI] = await Promise.all([loadImage(ag.art.sit), loadImage(ag.art.idle), loadImage(ag.art.walk)]);
      const s = depthScale(slot[1]);
      const dh = SIT_H * s, dw = dh * sit.width / sit.height;
      const seat = { x: slot[0] + dw * 0.22, y: slot[1] + 4 };
      next.set(ag.id, prev ? Object.assign(prev, { agent: ag }) : {
        id: ag.id, agent: ag, slot: { x: slot[0], y: slot[1] }, seat, dw, dh, img: { sit, idle, walk: walkI },
        pos: { ...seat }, mode: 'seated', path: [], face: -1, status: null, ph: Math.random() * 6,
        deskEll: { x: slot[0] - dw * 0.08, y: slot[1] - 10 * s, rx: dw * 0.42, ry: 24 * s },
      });
    }
    S.agents = next;
    if (S.gathered) gather(true);
  }

  // ---------- routing around the table
  function route(a, b) {
    const R = GATHER_RING, rr = { x: R.x, y: R.y - 6, rx: R.rx - 10, ry: R.ry - 8 };
    let hits = false;
    for (let k = 1; k < 20; k++) { const t = k / 20; if (inEll(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, rr)) { hits = true; break; } }
    if (!hits) return [b];
    const ang = p => Math.atan2((p.y - R.y) / R.ry, (p.x - R.x) / R.rx);
    let t0 = ang(a), t1 = ang(b), d = t1 - t0;
    while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const n = Math.max(2, Math.ceil(Math.abs(d) / 0.3)), pts = [];
    for (let i = 0; i <= n; i++) { const t = t0 + (d * i) / n; pts.push({ x: R.x + Math.cos(t) * (R.rx + 8), y: R.y + Math.sin(t) * (R.ry + 6) }); }
    return [...pts, b];
  }
  function gatherSpots(n) {
    const R = GATHER_RING, out = [];
    for (let i = 0; i < n; i++) { const t = -Math.PI * 0.62 + (i / n) * Math.PI * 2; out.push({ x: R.x + Math.cos(t) * R.rx, y: R.y + Math.sin(t) * R.ry }); }
    return out;
  }
  function gather(on) {
    S.gathered = on;
    const list = [...S.agents.values()];
    const spots = gatherSpots(list.length);
    list.forEach((a, i) => {
      if (on) { a.target = spots[i]; a.mode = 'walking'; a.path = route(a.pos, spots[i]); a.after = 'standing'; }
      else { a.mode = 'walking'; a.path = route(a.pos, a.seat); a.after = 'seated'; }
      a.delay = i * 0.2;
    });
  }

  // ---------- walking avatar (you)
  async function setAvatar(art) { const [idle, walkI] = await Promise.all([loadImage(art.idle), loadImage(art.walk)]); S.avatar = { pos: { x: 690, y: 556 }, img: { idle, walk: walkI }, mode: 'standing', face: -1, path: [], ph: 0, isYou: true }; }
  function setWalk(on) { S.walk = on; if (on && S.avatar) { S.avatar.pos = { x: 690, y: 556 }; } fit(on ? 'walk' : 'family'); }
  function walkTo(id) { const a = S.agents.get(id); if (!a || !S.avatar) return; const p = { x: a.slot.x - 10, y: a.slot.y + 34 }; S.avatar.path = route(S.avatar.pos, p); S.avatar.mode = 'walking'; S.avatar.auto = true; S.avatar.after = 'standing'; }

  // ---------- camera
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2); const r = canvas.getBoundingClientRect(); vw = r.width; vh = r.height;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    vignette = document.createElement('canvas'); vignette.width = 256; vignette.height = 256; const g = vignette.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 60, 128, 128, 182); gr.addColorStop(0, 'rgba(10,14,30,0)'); gr.addColorStop(1, 'rgba(8,10,24,0.55)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }
  function fit(kind, snap) {
    const I = S.insets, aw = vw - I.left - I.right, ah = vh - I.top - I.bottom;
    let box;
    if (kind === 'overview') box = [20, 0, 1260, 720];
    else if (kind === 'walk') { S.camT.z = clamp(Math.min(aw / 520, ah / 360), 0.6, 3); return; }
    else { const xs = [], ys = []; for (const a of S.agents.values()) { xs.push(a.slot.x - a.dw * 0.6, a.slot.x + a.dw * 0.6); ys.push(a.slot.y - a.dh - 40, a.slot.y + 10); } xs.push(470, 800); ys.push(300, 520); box = [Math.min(...xs) - 20, Math.min(...ys) - 10, Math.max(...xs) + 20, Math.max(...ys) + 20]; }
    const z = Math.min(aw / (box[2] - box[0]), ah / (box[3] - box[1]));
    S.camT = { x: (box[0] + box[2]) / 2 - (I.left - I.right) / 2 / z, y: (box[1] + box[3]) / 2 - (I.top - I.bottom) / 2 / z, z };
    if (snap) S.cam = { ...S.camT };
  }
  function focus(id) { const a = S.agents.get(id); if (!a) return; S.focusId = id; const I = S.insets, z = clamp(Math.min((vw - I.left - I.right) / 420, (vh - I.top - I.bottom) / 330), 0.5, 3.2); S.camT = { x: a.pos.x - 30 - (I.left - I.right) / 2 / z, y: a.pos.y - a.dh * 0.55 - (I.top - I.bottom) / 2 / z, z }; }
  const toScreen = (x, y) => ({ x: (x - S.cam.x) * S.cam.z + vw / 2, y: (y - S.cam.y) * S.cam.z + vh / 2 });
  const toWorld = (x, y) => ({ x: (x - vw / 2) / S.cam.z + S.cam.x, y: (y - vh / 2) / S.cam.z + S.cam.y });

  // ---------- input: drag to pan, wheel/pinch zoom, tap to pick
  const ptrs = new Map(); let drag = null, pinch = null;
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, cx: S.camT.x, cy: S.camT.y, moved: 0 }; else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: S.camT.z }; drag = null; } });
  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    if (!ptrs.has(e.pointerId)) { const w = toWorld(e.clientX - r.left, e.clientY - r.top); const h = pick(w.x, w.y); S.hoverId = h; canvas.style.cursor = h ? 'pointer' : 'grab'; return; }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; S.camT.z = clamp(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, 0.3, 4); return; }
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.hypot(dx, dy)); if (drag.moved > 6 && !S.walk) { S.camT.x = drag.cx - dx / S.cam.z; S.camT.y = drag.cy - dy / S.cam.z; S.focusId = null; } }
  });
  const up = e => { const r = canvas.getBoundingClientRect(); if (drag && drag.moved <= 6 && ptrs.size === 1) { const w = toWorld(e.clientX - r.left, e.clientY - r.top); const id = pick(w.x, w.y); if (id) onPick?.(id); } ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) drag = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); const r = canvas.getBoundingClientRect(); const w = toWorld(e.clientX - r.left, e.clientY - r.top); const z = clamp(S.camT.z * Math.exp(-e.deltaY * 0.0015), 0.3, 4); S.camT.x = w.x - (e.clientX - r.left - vw / 2) / z; S.camT.y = w.y - (e.clientY - r.top - vh / 2) / z; S.camT.z = z; }, { passive: false });
  addEventListener('keydown', e => { if (e.target.closest?.('textarea,input')) return; S.keys.add(e.key.toLowerCase()); });
  addEventListener('keyup', e => S.keys.delete(e.key.toLowerCase()));

  function spriteBox(a) {
    if (a.mode === 'seated') return { x: a.slot.x - a.dw / 2, y: a.slot.y - a.dh, w: a.dw, h: a.dh };
    const s = depthScale(a.pos.y), img = a.mode === 'walking' ? a.img.walk : a.img.idle, h = STAND_H * s, w = h * img.width / img.height;
    return { x: a.pos.x - w / 2, y: a.pos.y - h, w, h };
  }
  function pick(x, y) {
    const list = [...S.agents.values()].sort((a, b) => b.pos.y - a.pos.y);
    for (const a of list) { const b = spriteBox(a); if (x > b.x + b.w * 0.1 && x < b.x + b.w * 0.9 && y > b.y && y < b.y + b.h) return a.id; }
    return null;
  }
  function headPoint(id) { const a = S.agents.get(id); if (!a) return null; const b = spriteBox(a); return { x: a.mode === 'seated' ? a.slot.x + a.dw * 0.18 : a.pos.x, y: b.y + (a.mode === 'seated' ? b.h * 0.08 : 0) }; }

  // ---------- papers between agents
  function sendPaper(from, to, delay = 0) { if (!S.agents.has(from) || !S.agents.has(to)) return; S.papers.push({ from, to, t: -delay, dur: 2.4 }); }

  // ---------- update
  function stepMover(m, dt, speed) {
    if (m.delay > 0) { m.delay -= dt; return; }
    const tgt = m.path[0]; if (!tgt) { if (m.mode === 'walking') { m.mode = m.after || 'standing'; if (m.mode === 'seated') m.pos = { ...m.seat }; if (m.mode === 'standing' && !m.isYou) m.face = m.pos.x < GATHER_RING.x ? 1 : -1; } return; }
    const dx = tgt.x - m.pos.x, dy = tgt.y - m.pos.y, d = Math.hypot(dx, dy), st = speed * dt * depthScale(m.pos.y);
    if (Math.abs(dx) > 1) m.face = dx > 0 ? 1 : -1;
    if (d <= st) { m.pos = { x: tgt.x, y: tgt.y }; m.path.shift(); } else { m.pos.x += (dx / d) * st; m.pos.y += (dy / d) * st; }
    m.ph += dt * 9;
  }
  function update(dt) {
    S.t += dt;
    for (const a of S.agents.values()) { if (a.mode === 'walking') stepMover(a, dt, 135); }
    const av = S.avatar;
    if (S.walk && av) {
      let ix = S.joy.x, iy = S.joy.y; const k = S.keys;
      if (k.has('w') || k.has('arrowup') || k.has('ص')) iy -= 1; if (k.has('s') || k.has('arrowdown') || k.has('س')) iy += 1;
      if (k.has('a') || k.has('arrowleft') || k.has('ش')) ix -= 1; if (k.has('d') || k.has('arrowright') || k.has('ي')) ix += 1;
      const mag = Math.hypot(ix, iy);
      if (mag > 0.08) {
        av.auto = false; av.path = [];
        const sp = (k.has('shift') ? 190 : 120) * Math.min(1, mag) * depthScale(av.pos.y) * dt, nx = av.pos.x + (ix / mag) * sp, ny = av.pos.y + (iy / mag) * sp * 0.8;
        if (walkable(nx, ny)) { av.pos.x = nx; av.pos.y = ny; } else if (walkable(nx, av.pos.y)) av.pos.x = nx; else if (walkable(av.pos.x, ny)) av.pos.y = ny;
        if (Math.abs(ix) > 0.1) av.face = ix > 0 ? 1 : -1; av.mode = 'walking'; av.ph += dt * 9;
      } else if (av.auto) stepMover(av, dt, 130); else av.mode = 'standing';
      const z = S.camT.z, I = S.insets; S.camT.x = av.pos.x - (I.left - I.right) / 2 / z; S.camT.y = av.pos.y - 70 - (I.top - I.bottom) / 2 / z;
    }
    const k = 1 - Math.exp(-dt * 6); S.cam.x += (S.camT.x - S.cam.x) * k; S.cam.y += (S.camT.y - S.cam.y) * k; S.cam.z += (S.camT.z - S.cam.z) * k;
    for (const s of snow) for (const f of s) { f.y += f.v * dt; f.x += Math.sin(S.t * 0.8 + f.ph) * 6 * dt; if (f.y > f.b[3]) { f.y = f.b[1] - 4; f.x = f.b[0] + Math.random() * (f.b[2] - f.b[0]); } }
    for (const f of fish) { f.x += f.v * dt; if (f.x < TANK.x0 + 6 || f.x > TANK.x1 - 6) f.v *= -1, f.x = clamp(f.x, TANK.x0 + 6, TANK.x1 - 6); }
    if (Math.random() < dt * 0.25) S.notes.push({ x: BIRD.x + (Math.random() - 0.5) * 16, y: BIRD.y, t: 0, ch: Math.random() < 0.5 ? '♪' : '♫', kind: 'bird' });
    if (Math.random() < dt * 0.5) S.notes.push({ x: PETS[0].x + 14, y: PETS[0].y - 40, t: 0, ch: 'z', kind: 'z' });
    for (let i = S.notes.length - 1; i >= 0; i--) { const n = S.notes[i]; n.t += dt; if (n.t > 2.6) S.notes.splice(i, 1); }
    for (let i = S.papers.length - 1; i >= 0; i--) { const p = S.papers[i]; p.t += dt / p.dur; if (p.t >= 1) S.papers.splice(i, 1); }
  }

  // ---------- draw helpers
  function drawGlow(x, y, r, color, a) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color.replace('A', a)); g.addColorStop(1, color.replace('A', 0)); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
  function drawSprite(img, x, y, w, h, flip, sy = 1) {
    ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1); ctx.scale(1, sy); ctx.drawImage(img, -w / 2, -h, w, h); ctx.restore();
  }
  function drawShadow(x, y, rx) { ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#120a05'; ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.32, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }

  function drawAgent(a) {
    const st = a.status?.status || 'offline', t = S.t;
    if (st === 'offline') ctx.filter = 'grayscale(0.8) brightness(0.7)';
    if (a.mode === 'seated') {
      if (st === 'problem') { ctx.globalCompositeOperation = 'lighter'; drawGlow(a.slot.x, a.slot.y - a.dh * 0.25, a.dw * 0.75, 'rgba(255,40,30,A)', 0.22 + 0.16 * Math.sin(t * 5)); ctx.globalCompositeOperation = 'source-over'; }
      drawShadow(a.slot.x, a.slot.y - 4, a.dw * 0.5);
      const typing = st === 'working', breathe = 1 + Math.sin(t * (typing ? 2.4 : 1.4) + a.ph) * (typing ? 0.008 : 0.006);
      drawSprite(a.img.sit, a.slot.x, a.slot.y, a.dw, a.dh, false, breathe);
      if (typing) { ctx.globalCompositeOperation = 'lighter'; drawGlow(a.slot.x - a.dw * 0.2, a.slot.y - a.dh * 0.55, a.dw * 0.35, 'rgba(120,170,255,A)', 0.14 + 0.06 * Math.sin(t * 13 + a.ph)); ctx.globalCompositeOperation = 'source-over'; }
    } else {
      const s = depthScale(a.slot.y); drawShadow(a.slot.x, a.slot.y - 4, a.dw * 0.5);
      drawSprite(deskEmpty, a.slot.x, a.slot.y, a.dh * deskEmpty.width / deskEmpty.height * 0.98, a.dh * 0.98, false);
      void s;
    }
    ctx.filter = 'none';
  }
  function drawMover(m) {
    const s = depthScale(m.pos.y), walking = m.mode === 'walking', img = walking ? m.img.walk : m.img.idle, h = STAND_H * s, w = h * img.width / img.height;
    const bob = walking ? -Math.abs(Math.sin(m.ph)) * 3.2 * s : 0, br = walking ? 1 : 1 + Math.sin(S.t * 1.6 + (m.ph || 0)) * 0.007;
    drawShadow(m.pos.x, m.pos.y, w * 0.42);
    ctx.save(); ctx.translate(m.pos.x, m.pos.y + bob); if (walking) ctx.rotate(Math.sin(m.ph) * 0.03);
    drawSprite(img, 0, 0, w, h, m.face > 0, br); ctx.restore();
    if (m.isYou) { ctx.save(); ctx.strokeStyle = 'rgba(79,170,165,0.9)'; ctx.lineWidth = 2.5 / S.cam.z * 1.6; ctx.beginPath(); ctx.ellipse(m.pos.x, m.pos.y, w * 0.5, w * 0.17, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  }
  function drawPet(p) {
    const h = p.w * p.image.height / p.image.width, br = p.kind === 'cat' ? 1 + Math.sin(S.t * 1.8) * 0.025 : 1 + Math.sin(S.t * 3.2) * 0.02;
    drawShadow(p.x, p.y - 2, p.w * 0.45);
    ctx.save(); ctx.translate(p.x, p.y); if (p.kind === 'dog') ctx.rotate(Math.sin(S.t * 0.7) * 0.012); drawSprite(p.image, 0, 0, p.w, h, false, br); ctx.restore();
  }

  function draw() {
    const z = S.cam.z;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = WORLD.bgColor; ctx.fillRect(0, 0, vw, vh);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (vw / 2 - S.cam.x * z), dpr * (vh / 2 - S.cam.y * z));
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bg, 0, 0, WORLD.w, WORLD.h);
    const t = S.t;
    // snow behind glass
    ctx.save(); ctx.fillStyle = 'rgba(235,242,255,0.75)'; snow.forEach((fl, i) => { ctx.save(); ctx.clip(winPaths[i].p); for (const f of fl) { ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill(); } ctx.restore(); }); ctx.restore();
    // fish
    ctx.save(); ctx.beginPath(); ctx.rect(TANK.x0, TANK.y0, TANK.x1 - TANK.x0, TANK.y1 - TANK.y0); ctx.clip();
    for (const f of fish) { const yy = f.y + Math.sin(t * 1.5 + f.ph) * 3, d = Math.sign(f.v); ctx.fillStyle = f.c; ctx.beginPath(); ctx.ellipse(f.x, yy, f.s * 1.6, f.s, 0, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.moveTo(f.x - d * f.s * 1.4, yy); ctx.lineTo(f.x - d * f.s * 2.8, yy - f.s); ctx.lineTo(f.x - d * f.s * 2.8, yy + f.s); ctx.fill(); }
    ctx.fillStyle = 'rgba(220,245,255,0.5)'; for (let i = 0; i < 5; i++) { const by = TANK.y1 - ((t * 18 + i * 23) % (TANK.y1 - TANK.y0)); ctx.beginPath(); ctx.arc(TANK.x0 + 30 + i * 22 + Math.sin(t + i) * 3, by, 1.6, 0, 6.283); ctx.fill(); }
    ctx.restore();
    // warm light: fire + lamps
    ctx.globalCompositeOperation = 'lighter';
    const fl = 0.22 + 0.07 * Math.sin(t * 9) + 0.05 * Math.sin(t * 23 + 1) + 0.03 * Math.sin(t * 37);
    drawGlow(FIRE.x, FIRE.y, 70, 'rgba(255,140,40,A)', fl); drawGlow(FIRE.x + 40, FIRE.y + 70, 190, 'rgba(255,120,40,A)', fl * 0.3);
    for (const l of LAMPS) drawGlow(l.x, l.y, 90, 'rgba(255,190,110,A)', 0.12 + 0.01 * Math.sin(t * 2));
    ctx.globalCompositeOperation = 'source-over';
    // depth-sorted things
    const items = [];
    for (const a of S.agents.values()) { items.push({ y: a.slot.y, d: () => drawAgent(a) }); if (a.mode !== 'seated') items.push({ y: a.pos.y, d: () => drawMover(a) }); }
    for (const p of pets) items.push({ y: p.y, d: () => drawPet(p) });
    for (const o of occPaths) items.push({ y: o.baseY, d: () => { ctx.save(); ctx.clip(o.path); ctx.drawImage(bg, 0, 0, WORLD.w, WORLD.h); ctx.restore(); } });
    if (S.walk && S.avatar) items.push({ y: S.avatar.pos.y, d: () => drawMover(S.avatar) });
    items.sort((a, b) => a.y - b.y).forEach(i => i.d());
    // string lights twinkle
    ctx.globalCompositeOperation = 'lighter';
    LIGHTS.forEach(([x, y], i) => drawGlow(x, y, 9, 'rgba(255,205,120,A)', 0.25 + 0.25 * Math.sin(t * (1.3 + (i % 5) * 0.4) + i * 1.7)));
    ctx.globalCompositeOperation = 'source-over';
    // floating notes (bird / sleepy cat)
    ctx.textAlign = 'center';
    for (const n of S.notes) { const a = Math.min(1, n.t * 2) * (1 - n.t / 2.6); ctx.globalAlpha = a; ctx.fillStyle = n.kind === 'bird' ? '#ffe2a8' : '#f6ead8'; ctx.font = `${n.kind === 'bird' ? 13 : 11 + n.t * 3}px sans-serif`; ctx.fillText(n.ch, n.x + Math.sin(n.t * 3) * 5, n.y - n.t * 16); }
    ctx.globalAlpha = 1;
    // papers
    for (const p of S.papers) {
      if (p.t < 0) continue; const a = headPoint(p.from), b = headPoint(p.to); if (!a || !b) continue;
      const e = p.t < 0.5 ? 2 * p.t * p.t : 1 - (-2 * p.t + 2) ** 2 / 2, mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 90;
      const x = (1 - e) ** 2 * a.x + 2 * (1 - e) * e * mx + e * e * b.x, y = (1 - e) ** 2 * a.y + 2 * (1 - e) * e * my + e * e * b.y;
      ctx.globalCompositeOperation = 'lighter'; drawGlow(x, y, 22, 'rgba(255,200,120,A)', 0.35); ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(p.t * 12) * 0.35); ctx.fillStyle = '#fff8ea'; ctx.strokeStyle = '#c8693f'; ctx.lineWidth = 0.8; ctx.fillRect(-7, -9, 14, 18); ctx.strokeRect(-7, -9, 14, 18); ctx.fillStyle = '#c9b89e'; for (let k = 0; k < 4; k++) ctx.fillRect(-4.5, -5 + k * 3.5, 9 - (k === 3 ? 3 : 0), 1); ctx.restore();
    }
    // vignette
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.drawImage(vignette, 0, 0, vw, vh);
  }

  // ---------- loop
  let last = performance.now(), acc = 0, frames = 0;
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt; frames++;
    if (acc >= 1) { S.fps = frames / acc; acc = 0; frames = 0; }
    update(dt); draw(); onFrame?.(S); requestAnimationFrame(loop);
  }
  resize(); addEventListener('resize', () => { resize(); fit(S.walk ? 'walk' : 'family'); });
  requestAnimationFrame(loop);

  return { S, setAgents, setAvatar, setWalk, walkTo, gather, fit, focus, toScreen, spriteBox, headPoint, sendPaper, resize, setInsets: i => { S.insets = i; }, setStatus: (id, st) => { const a = S.agents.get(id); if (a) a.status = st; } };
}
