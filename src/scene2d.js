// Illustrated 2.5D scene: painted cutaway house + depth-sorted character sprites (Canvas 2D).
import { WORLD, ROOMS, DOORS, EXTRA_SLOTS, GATHER_RING, OBSTACLES, TEA_SPOT, FIRE, LAMPS, TANK, CAGE, PETS, LIGHTS, SIT_H, STAND_H, OWNER_H, depthScale } from './sceneConfig.js';
import { to3, to2, REGIONS } from './map3d.js';

const imgCache = new Map();
export function loadImage(src) {
  if (!imgCache.has(src)) imgCache.set(src, new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('img ' + src)); i.src = src; }));
  return imgCache.get(src);
}
export const loadImageOr = (src, alt) => (src ? loadImage(src).catch(() => alt) : Promise.resolve(alt));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inRect = (x, y, r) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
const inEll = (x, y, e, pad = 0) => ((x - e.x) / (e.rx + pad)) ** 2 + ((y - e.y) / (e.ry + pad * 0.6)) ** 2 < 1;

export async function createScene(canvas, { onPick, onRoom, onFrame } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const bg = await loadImage(WORLD.bg);
  const deskEmpty = await loadImage('art/desk_empty.webp');
  const pets = await Promise.all(PETS.map(async p => ({ ...p, image: await loadImage(p.img), pos: { x: p.x, y: p.y }, home: { x: p.x, y: p.y }, path: [], face: -1, ph: Math.random() * 6, rest: 4 + Math.random() * 6, hop: 0 })));
  const rooms = ROOMS.map(r => ({ ...r, owner: null }));
  const roomById = new Map(rooms.map(r => [r.id, r]));

  const S = {
    agents: new Map(), papers: [], notes: [], t: 0, fps: 60, walk: false, gathered: false, view: 'house', roomId: null, tripT: 6,
    cam: { x: 512, y: 470, z: 0.5 }, camT: { x: 512, y: 470, z: 0.5 }, insets: { top: 0, bottom: 0, left: 0, right: 0 },
    avatar: null, keys: new Set(), joy: { x: 0, y: 0 }, focusId: null, hoverId: null,
    render: true, hearts: [], pets, greet: { active: false, c3: null, cool: 0, room: null, ids: [], roomCool: {} },
  };
  let vw = 1, vh = 1, dpr = 1, vignette = null, bgMip = null, bgMipW = 0;

  // ---------- snow (garden around the house) / fish
  const H = WORLD.house;
  const snow = Array.from({ length: 260 }, () => ({ x: Math.random() * WORLD.w, y: Math.random() * WORLD.h, r: 0.7 + Math.random() * 1.6, v: 10 + Math.random() * 18, ph: Math.random() * 6 }));
  const fish = Array.from({ length: 4 }, (_, i) => ({ x: TANK.x0 + 8 + Math.random() * (TANK.x1 - TANK.x0 - 16), y: TANK.y0 + 8 + Math.random() * (TANK.y1 - TANK.y0 - 16), v: (6 + Math.random() * 8) * (i % 2 ? 1 : -1), c: ['#ff8a3c', '#4fc3e8', '#ffd166', '#ff6f61'][i], s: 1.6 + Math.random(), ph: Math.random() * 6 }));

  // ---------- rooms / walkable floor
  function roomAt(x, y) {
    for (const r of rooms) if (r.floor.some(f => inRect(x, y, f))) return r;
    for (const d of DOORS) if (inRect(x, y, d.rect)) return roomById.get(Math.hypot(x - d.pa[0], y - d.pa[1]) < Math.hypot(x - d.pb[0], y - d.pb[1]) ? d.a : d.b);
    return rooms.find(r => inRect(x, y, r.rect)) || null;
  }
  function walkable(x, y) {
    if (!rooms.some(r => r.floor.some(f => inRect(x, y, f))) && !DOORS.some(d => inRect(x, y, d.rect))) return false;
    for (const o of OBSTACLES) if (inEll(x, y, o)) return false;
    for (const a of S.agents.values()) if (inEll(x, y, a.deskEll)) return false;
    return true;
  }

  async function setAgents(list) {
    const next = new Map(); let extra = 0;
    rooms.forEach(r => { r.owner = null; });
    const priv = rooms.filter(r => r.kind === 'private');
    for (let i = 0; i < list.length; i++) {
      const ag = list[i];
      const prev = S.agents.get(ag.id);
      let room, slot;
      if (i < priv.length) { room = priv[i]; slot = room.slot; room.owner = ag; }
      else { const e = EXTRA_SLOTS[extra++ % EXTRA_SLOTS.length]; room = roomById.get(e[2]); slot = [e[0] + Math.floor((extra - 1) / EXTRA_SLOTS.length) * 30, e[1]]; }
      const [sit, idle] = await Promise.all([loadImage(ag.art.sit), loadImage(ag.art.idle)]);
      const walk4 = await loadImageOr(ag.art.walk4, null), walkI = walk4 ? null : await loadImageOr(ag.art.walk, idle);
      const s = depthScale(slot[1]);
      const dh = SIT_H * s, dw = dh * sit.width / sit.height;
      const seat = { x: slot[0] + dw * 0.22, y: slot[1] + 4 };
      next.set(ag.id, prev ? Object.assign(prev, { agent: ag, room: room.id }) : {
        id: ag.id, agent: ag, room: room.id, slot: { x: slot[0], y: slot[1] }, seat, dw, dh, img: { sit, idle, walk: walkI, walk4 }, dist: 0,
        pos: { ...seat }, mode: 'seated', path: [], face: -1, status: null, ph: Math.random() * 6,
        deskEll: { x: slot[0] - dw * 0.08, y: slot[1] - 10 * s, rx: dw * 0.42, ry: 20 * s },
      });
    }
    S.agents = next;
    if (S.gathered) gather(true);
  }

  // ---------- routing: BFS over rooms through doors, ring detour around the hall furniture
  function roomPath(from, to) {
    if (!from || !to || from === to) return [];
    const prev = new Map([[from, null]]), q = [from];
    while (q.length) { const r = q.shift(); if (r === to) break; for (const d of DOORS) { const o = d.a === r ? d.b : d.b === r ? d.a : null; if (o && !prev.has(o)) { prev.set(o, { r, d }); q.push(o); } } }
    if (!prev.has(to)) return [];
    const out = []; let cur = to;
    while (prev.get(cur)) { const { r, d } = prev.get(cur); const [p1, p2] = d.a === r ? [d.pa, d.pb] : [d.pb, d.pa]; out.unshift({ x: p1[0], y: p1[1] }, { x: p2[0], y: p2[1] }); cur = r; }
    return out;
  }
  function ringRoute(a, b) {
    const R = GATHER_RING, rr = { x: R.x, y: R.y, rx: R.rx - 10, ry: R.ry - 8 };
    let hits = false;
    for (let k = 1; k < 24; k++) { const t = k / 24; if (inEll(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, rr)) { hits = true; break; } }
    if (!hits) return [b];
    const ang = p => Math.atan2((p.y - R.y) / R.ry, (p.x - R.x) / R.rx);
    let t0 = ang(a), t1 = ang(b), d = t1 - t0;
    while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const n = Math.max(2, Math.ceil(Math.abs(d) / 0.3)), pts = [];
    for (let i = 0; i <= n; i++) { const t = t0 + (d * i) / n; pts.push({ x: R.x + Math.cos(t) * (R.rx + 6), y: Math.min(592, R.y + Math.sin(t) * (R.ry + 4)) }); }
    return [...pts, b];
  }
  function route(a, b) {
    const pts = [{ ...a }, ...roomPath(roomAt(a.x, a.y)?.id, roomAt(b.x, b.y)?.id), { ...b }], out = [];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i], inHall = v => roomAt(v.x, v.y)?.id === 'hall';
      if (inHall(p) && inHall(q)) out.push(...ringRoute(p, q)); else out.push(q);
    }
    return out;
  }
  function gatherSpots(n) {
    const R = GATHER_RING, out = [];
    for (let i = 0; i < n; i++) { const t = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI * 2; out.push({ x: R.x + Math.cos(t) * R.rx * 0.93, y: R.y + Math.sin(t) * R.ry * 0.9 }); }
    return out;
  }
  function gather(on) {
    S.gathered = on; S.greet.active = false; S.greet.ids = [];
    const list = [...S.agents.values()];
    const spots = gatherSpots(list.length);
    list.forEach((a, i) => {
      a.trip = null;
      if (on) { a.target = spots[i]; a.mode = 'walking'; a.path = route(a.pos, spots[i]); a.after = 'standing'; }
      else { a.mode = 'walking'; a.path = route(a.pos, a.seat); a.after = 'seated'; }
      a.delay = i * 0.25;
    });
  }
  // ambient: now and then a cat goes to the kitchen for tea and comes back
  function ambient(dt) {
    if (S.gathered) return;
    S.tripT -= dt;
    if (S.tripT <= 0) {
      S.tripT = 14 + Math.random() * 10;
      const free = [...S.agents.values()].filter(a => a.mode === 'seated' && a.room !== 'kitchen' && !a.trip && !S.greet.ids.includes(a.id));
      const pref = free.filter(a => a.status?.status === 'waiting' || a.status?.status === 'done');
      const a = (pref.length ? pref : free)[Math.floor(Math.random() * (pref.length ? pref.length : free.length))];
      if (a) { const sp = { x: TEA_SPOT.x + (Math.random() - 0.5) * 30, y: TEA_SPOT.y + (Math.random() - 0.5) * 30 }; a.trip = { back: 0 }; a.mode = 'walking'; a.path = route(a.pos, sp); a.after = 'standing'; a.delay = 0; }
    }
    for (const a of S.agents.values()) if (a.trip && a.mode === 'standing') { a.trip.back += dt; if (a.trip.back > 5) { a.trip = null; a.mode = 'walking'; a.path = route(a.pos, a.seat); a.after = 'seated'; } }
  }

  // ---------- walking avatar (you)
  async function setAvatar(art) { const [idle, walk4] = await Promise.all([loadImage(art.idle), loadImageOr(art.walk4, null)]); S.avatar = { pos: { x: 512, y: 760 }, img: { idle, walk4 }, mode: 'standing', face: 1, path: [], ph: 0, dist: 0, isYou: true, look3: { x: 0, z: -1 }, h: OWNER_H }; }
  function setWalk(on) { S.walk = on; if (on && S.avatar) S.avatar.path = []; fit(on ? 'walk' : 'house'); }

  // ---------- the owner: cats run to him, rub his legs, purr (hearts), then settle around him
  const OW = () => S.avatar;
  function freeSpot3(c, x, z) {
    // keep a 3D spot inside the owner's room interior, else pull it toward him
    const g = REGIONS.find(g => c.x >= g.R[0] && c.x <= g.R[2] && c.z >= g.R[1] && c.z <= g.R[3]) || REGIONS.find(g => g.id === 'hall');
    for (let k = 1; k >= 0.2; k -= 0.2) { const px = c.x + (x - c.x) * k, pz = c.z + (z - c.z) * k; if (px > g.R[0] + 0.35 && px < g.R[2] - 0.35 && pz > g.R[1] + 0.35 && pz < g.R[3] - 0.35) { const p = to2(px, pz); if (walkable(p.x, p.y)) return p; } }
    return null;
  }
  function spotsAround(n, radius, spread, rowGap) {
    const av = OW(), c = to3(av.pos.x, av.pos.y), L = av.look3 || { x: 0, z: -1 }, base = Math.atan2(L.z, L.x), out = [];
    const perRow = Math.max(3, Math.min(6, n));
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / perRow), k = i % perRow, cnt = Math.min(perRow, n - row * perRow), r = radius + row * rowGap;
      const a = base + (cnt === 1 ? 0 : (k / (cnt - 1) - 0.5) * spread * 2) + (row % 2) * 0.18;
      out.push(freeSpot3(c, c.x + Math.cos(a) * r, c.z + Math.sin(a) * r) || { x: av.pos.x + (i - n / 2) * 8, y: av.pos.y + 6 });
    }
    return out;
  }
  function greet(ids, follow = false) {
    const av = OW(); if (!av) return;
    const list = (ids || [...S.agents.keys()]).map(id => S.agents.get(id)).filter(Boolean);
    if (!list.length) return;
    const G = S.greet; G.active = true; G.ids = list.map(a => a.id); G.c3 = to3(av.pos.x, av.pos.y); G.room = roomAt(av.pos.x, av.pos.y)?.id;
    const legs = spotsAround(list.length, list.length > 3 ? 0.62 : 0.5, 1.15, 0.4), settle = spotsAround(list.length, 1.95, 1.05, 0.6);
    list.forEach((a, i) => {
      a.trip = null; a.settled = false; a.settleSpot = settle[i]; a.delay = follow ? i * 0.12 : 0.1 + i * 0.18;
      a.mode = 'walking'; a.run = true; a.path = route(a.pos, follow ? settle[i] : legs[i]); a.after = follow ? 'standing' : 'cuddle';
      if (follow) a.settled = true;
    });
  }
  function endGreet() {
    const G = S.greet, list = G.ids.map(id => S.agents.get(id)).filter(Boolean); G.active = false; G.ids = [];
    if (S.gathered) { gather(true); return; }
    list.forEach((a, i) => { a.settled = false; a.run = false; a.mode = 'walking'; a.path = route(a.pos, a.seat); a.after = 'seated'; a.delay = 0.4 + i * 0.3; });
  }
  function owner(dt) {
    const av = OW(), G = S.greet; if (!av) return;
    G.cool -= dt; for (const k in G.roomCool) G.roomCool[k] -= dt;
    const room = roomAt(av.pos.x, av.pos.y)?.id;
    if (room && room !== S.ownerRoom) {
      const prev = S.ownerRoom; S.ownerRoom = room;
      if (prev !== undefined) {
        const r = roomById.get(room);
        if (r.kind === 'shared' && G.cool <= 0 && !(G.active && S.gathered)) { G.cool = 40; greet(null); }
        else if (r.kind === 'private' && r.owner && !(G.roomCool[room] > 0)) { const a = S.agents.get(r.owner.id); if (a && (!S.gathered || a.mode === 'seated' || !G.ids.includes(a.id))) { G.roomCool[room] = 25; if (G.active && !S.gathered) endGreet(); if (!G.active || !S.gathered) greet([a.id]); } }
      }
    }
    if (!G.active) return;
    // «كل واحد بغرفته»: after the welcome (run, rub, purr, settle) they go back to work
    if (!S.gathered) { const list = G.ids.map(id => S.agents.get(id)).filter(Boolean); G.settleT = list.every(a => a.settled && a.mode === 'standing') ? (G.settleT || 0) + dt : 0; if (G.settleT > 7) { G.settleT = 0; endGreet(); return; } }
    const c = to3(av.pos.x, av.pos.y), moved = Math.hypot(c.x - G.c3.x, c.z - G.c3.z);
    if (moved > 2.2) { if (S.gathered) greet(G.ids, true); else endGreet(); }
  }
  function heart(x, y, big) { if (S.hearts.length < 40) S.hearts.push({ x: x + (Math.random() - 0.5) * 14, y, t: 0, s: big ? 1.3 : 0.8 + Math.random() * 0.4, h0: 0.75 + Math.random() * 0.25 }); }
  function setOwnerPos(p, moving, look3, faceX) { const av = OW(); if (!av) return; if (moving) av.dist += Math.hypot(p.x - av.pos.x, p.y - av.pos.y); av.pos = p; av.mode = moving ? 'walking' : 'standing'; if (look3) av.look3 = look3; if (faceX) av.face = faceX > 0 ? 1 : -1; }
  function walkTo(id) { const a = S.agents.get(id); if (!a || !S.avatar) return; const p = { x: Math.min(a.slot.x + a.dw * 0.55 + 8, roomById.get(a.room).floor[0][2] - 4), y: a.slot.y - 4 }; S.avatar.path = route(S.avatar.pos, p); S.avatar.mode = 'walking'; S.avatar.auto = true; S.avatar.after = 'standing'; }

  // ---------- camera
  function resize() {
    const r = canvas.getBoundingClientRect(); vw = r.width; vh = r.height;
    dpr = Math.min(devicePixelRatio || 1, vw * vh > 700000 ? 1.5 : 2); bgMip = null;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    vignette = document.createElement('canvas'); vignette.width = 256; vignette.height = 256; const g = vignette.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 60, 128, 128, 182); gr.addColorStop(0, 'rgba(10,14,30,0)'); gr.addColorStop(1, 'rgba(8,10,24,0.55)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }
  function frame(box, snap, maxZ = 3) {
    const I = S.insets, aw = Math.max(50, vw - I.left - I.right), ah = Math.max(50, vh - I.top - I.bottom);
    const z = Math.min(maxZ, aw / (box[2] - box[0]), ah / (box[3] - box[1]));
    S.camT = { x: (box[0] + box[2]) / 2 - (I.left - I.right) / 2 / z, y: (box[1] + box[3]) / 2 - (I.top - I.bottom) / 2 / z, z };
    if (snap) S.cam = { ...S.camT };
  }
  function fit(kind, snap) {
    if (kind === 'walk') { const I = S.insets; S.view = 'walk'; S.camT.z = clamp(Math.min((vw - I.left - I.right) / 380, (vh - I.top - I.bottom) / 300), 0.6, 3); if (snap) S.cam = { ...S.camT }; return; }
    if (kind === 'room' && S.roomId) return focusRoom(S.roomId, snap);
    S.view = 'house'; S.roomId = null; S.focusId = null;
    frame(WORLD.house, snap);
  }
  function focusRoom(id, snap) {
    const r = roomById.get(id); if (!r) return;
    S.view = 'room'; S.roomId = id;
    const p = 14; frame([r.rect[0] - p, r.rect[1] - p, r.rect[2] + p, r.rect[3] + p], snap, 3.2);
  }
  function focus(id) {
    const a = S.agents.get(id); if (!a) return; S.focusId = id;
    if (a.mode === 'seated') return focusRoom(a.room);
    S.view = 'room'; S.roomId = null; frame([a.pos.x - 150, a.pos.y - 170, a.pos.x + 150, a.pos.y + 60], false, 3.2);
  }
  const toScreen = (x, y) => ({ x: (x - S.cam.x) * S.cam.z + vw / 2, y: (y - S.cam.y) * S.cam.z + vh / 2 });
  const toWorld = (x, y) => ({ x: (x - vw / 2) / S.cam.z + S.cam.x, y: (y - vh / 2) / S.cam.z + S.cam.y });

  // ---------- input: drag to pan, wheel/pinch zoom, tap to pick
  const ptrs = new Map(); let drag = null, pinch = null;
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, cx: S.camT.x, cy: S.camT.y, moved: 0 }; else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: S.camT.z }; drag = null; } });
  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    if (!ptrs.has(e.pointerId)) { const w = toWorld(e.clientX - r.left, e.clientY - r.top); const h = pick(w.x, w.y); S.hoverId = h; canvas.style.cursor = h ? 'pointer' : 'grab'; return; }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; S.camT.z = clamp(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, 0.25, 4); S.view = 'free'; return; }
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.hypot(dx, dy)); if (drag.moved > 6 && !S.walk) { S.camT.x = drag.cx - dx / S.cam.z; S.camT.y = drag.cy - dy / S.cam.z; S.focusId = null; S.view = 'free'; } }
  });
  const up = e => { const r = canvas.getBoundingClientRect(); if (drag && drag.moved <= 6 && ptrs.size === 1) { const w = toWorld(e.clientX - r.left, e.clientY - r.top); const id = pick(w.x, w.y); if (id) onPick?.(id); else if (!S.walk) { const r = roomAt(w.x, w.y) || rooms.find(q => inRect(w.x, w.y, q.rect)); if (r) onRoom?.(r); } } ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) drag = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); const r = canvas.getBoundingClientRect(); const w = toWorld(e.clientX - r.left, e.clientY - r.top); const z = clamp(S.camT.z * Math.exp(-e.deltaY * 0.0015), 0.25, 4); S.view = 'free'; S.camT.x = w.x - (e.clientX - r.left - vw / 2) / z; S.camT.y = w.y - (e.clientY - r.top - vh / 2) / z; S.camT.z = z; }, { passive: false });
  addEventListener('keydown', e => { if (e.target.closest?.('textarea,input')) return; S.keys.add(e.key.toLowerCase()); });
  addEventListener('keyup', e => S.keys.delete(e.key.toLowerCase()));

  function spriteBox(a) {
    if (a.mode === 'seated') return { x: a.slot.x - a.dw / 2, y: a.slot.y - a.dh, w: a.dw, h: a.dh };
    const s = depthScale(a.pos.y), im = frameOf(a), h = (a.h || STAND_H) * s, w = h * im.w / im.img.height;
    return { x: a.pos.x - w / 2, y: a.pos.y - h, w, h };
  }
  // current sprite frame: 4-frame walk sheet stepped by distance travelled (feet don't slide)
  function frameOf(m) {
    if (m.mode === 'walking' && m.img.walk4) { const W = m.img.walk4.width / 4, f = Math.floor((m.dist || 0) / 11) % 4; return { img: m.img.walk4, sx: f * W, w: W, flip: m.face < 0, f }; }
    const img = m.mode === 'walking' && m.img.walk ? m.img.walk : m.img.idle; return { img, sx: 0, w: img.width, flip: m.face > 0, f: 0 };
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
    const tgt = m.path[0]; if (!tgt) { if (m.mode === 'walking') { m.mode = m.after || 'standing'; m.run = false; m.ct = 0; if (m.mode === 'seated') m.pos = { ...m.seat }; if (m.mode === 'cuddle' || m.settled) { const o = OW(); if (o) m.face = o.pos.x > m.pos.x ? 1 : -1; } if (m.mode === 'standing' && !m.isYou) m.face = S.gathered ? (m.pos.x < GATHER_RING.x ? 1 : -1) : m.face; } return; }
    const dx = tgt.x - m.pos.x, dy = tgt.y - m.pos.y, d = Math.hypot(dx, dy), st = (m.run ? speed * 1.7 : speed) * dt * depthScale(m.pos.y);
    m.dist = (m.dist || 0) + Math.min(d, st);
    if (Math.abs(dx) > 1) m.face = dx > 0 ? 1 : -1;
    if (d <= st) { m.pos = { x: tgt.x, y: tgt.y }; m.path.shift(); } else { m.pos.x += (dx / d) * st; m.pos.y += (dy / d) * st; }
    m.ph += dt * 9;
  }
  function update(dt) {
    S.t += dt;
    for (const a of S.agents.values()) {
      if (a.mode === 'walking') stepMover(a, dt, 110);
      else if (a.mode === 'cuddle') {
        a.ct += dt; if (Math.random() < dt * 2.2) heart(a.pos.x, a.pos.y, true);
        if (a.ct > 3.4 + (a.ph % 1.2)) { a.mode = 'walking'; a.settled = true; a.path = a.settleSpot ? route(a.pos, a.settleSpot) : []; a.after = 'standing'; a.delay = 0; }
      } else if (a.settled && a.mode === 'standing' && Math.random() < dt * 0.25) heart(a.pos.x, a.pos.y, false);
    }
    ambient(dt); owner(dt); petsStep(dt);
    for (let i = S.hearts.length - 1; i >= 0; i--) { const h = S.hearts[i]; h.t += dt; if (h.t > 2.2) S.hearts.splice(i, 1); }
    const av = S.avatar;
    if (S.walk && av) {
      let ix = S.joy.x, iy = S.joy.y; const k = S.keys;
      if (k.has('w') || k.has('arrowup') || k.has('ص')) iy -= 1; if (k.has('s') || k.has('arrowdown') || k.has('س')) iy += 1;
      if (k.has('a') || k.has('arrowleft') || k.has('ش')) ix -= 1; if (k.has('d') || k.has('arrowright') || k.has('ي')) ix += 1;
      const mag = Math.hypot(ix, iy);
      if (mag > 0.08) {
        av.auto = false; av.path = [];
        const sp = (k.has('shift') ? 160 : 95) * Math.min(1, mag) * depthScale(av.pos.y) * dt, nx = av.pos.x + (ix / mag) * sp, ny = av.pos.y + (iy / mag) * sp * 0.8;
        if (walkable(nx, ny)) { av.pos.x = nx; av.pos.y = ny; } else if (walkable(nx, av.pos.y)) av.pos.x = nx; else if (walkable(av.pos.x, ny)) av.pos.y = ny;
        if (Math.abs(ix) > 0.1) av.face = ix > 0 ? 1 : -1; av.mode = 'walking'; av.ph += dt * 9; av.dist += sp; av.look3 = { x: ix / mag, z: iy / mag };
      } else if (av.auto) stepMover(av, dt, 130); else av.mode = 'standing';
      const z = S.camT.z, I = S.insets; S.camT.x = av.pos.x - (I.left - I.right) / 2 / z; S.camT.y = av.pos.y - 45 - (I.top - I.bottom) / 2 / z;
    }
    const k = 1 - Math.exp(-dt * 6); S.cam.x += (S.camT.x - S.cam.x) * k; S.cam.y += (S.camT.y - S.cam.y) * k; S.cam.z += (S.camT.z - S.cam.z) * k;
    for (const f of snow) { f.y += f.v * dt; f.x += Math.sin(S.t * 0.8 + f.ph) * 6 * dt; if (f.y > WORLD.h) { f.y = -4; f.x = Math.random() * WORLD.w; } }
    for (const f of fish) { f.x += f.v * dt; if (f.x < TANK.x0 + 4 || f.x > TANK.x1 - 4) f.v *= -1, f.x = clamp(f.x, TANK.x0 + 4, TANK.x1 - 4); }
    if (Math.random() < dt * 0.3) S.notes.push({ x: CAGE.x + (Math.random() - 0.5) * 10, y: CAGE.y - 30, t: 0, ch: Math.random() < 0.5 ? '♪' : '♫', kind: 'bird' });
    if (Math.random() < dt * 0.5) S.notes.push({ x: PETS[0].x + 10, y: PETS[0].y - 26, t: 0, ch: 'z', kind: 'z' });
    for (let i = S.notes.length - 1; i >= 0; i--) { const n = S.notes[i]; n.t += dt; if (n.t > 2.6) S.notes.splice(i, 1); }
    for (let i = S.papers.length - 1; i >= 0; i--) { const p = S.papers[i]; p.t += dt / p.dur; if (p.t >= 1) S.papers.splice(i, 1); }
  }

  // ---------- pets: the dog trots around the kitchen / hall and comes to say hi
  const DOG_SPOTS = [[262, 545], [300, 470], [230, 430], [250, 520], [372, 470], [300, 560]];
  function petsStep(dt) {
    const av = OW();
    for (const p of pets) {
      p.hop = Math.max(0, p.hop - dt);
      if (p.kind !== 'dog') continue;
      const near = av && Math.hypot(av.pos.x - p.pos.x, av.pos.y - p.pos.y) < 150 && S.greet.active;
      if (p.path.length) {
        const t = p.path[0], dx = t.x - p.pos.x, dy = t.y - p.pos.y, d = Math.hypot(dx, dy), st = (near ? 120 : 70) * dt;
        if (Math.abs(dx) > 1) p.face = dx > 0 ? 1 : -1; p.ph += dt * 12;
        if (d <= st) { p.pos = { ...t }; p.path.shift(); if (!p.path.length) { p.rest = 3 + Math.random() * 7; if (near) { p.hop = 2.5; heart(p.pos.x, p.pos.y - 6, true); } } } else { p.pos.x += dx / d * st; p.pos.y += dy / d * st; }
      } else if ((p.rest -= dt) <= 0) {
        if (near) { const o = { x: av.pos.x + (p.pos.x < av.pos.x ? -26 : 26), y: av.pos.y + 4 }; p.path = walkable(o.x, o.y) ? route(p.pos, o) : []; p.rest = 2; }
        else { const s = DOG_SPOTS[Math.floor(Math.random() * DOG_SPOTS.length)]; p.path = route(p.pos, { x: s[0], y: s[1] }); }
      }
    }
  }

  // ---------- draw helpers
  // glows are pre-rendered once per colour (no per-frame gradients)
  const glowCache = new Map();
  function glowSprite(color) {
    let c = glowCache.get(color); if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, color.replace('A', 1)); gr.addColorStop(0.45, color.replace('A', 0.45)); gr.addColorStop(1, color.replace('A', 0)); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    glowCache.set(color, c); return c;
  }
  function drawGlow(x, y, r, color, a) { if (a <= 0.003) return; ctx.globalAlpha = Math.min(1, a); ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1; }
  // offline cats: a grey copy made once instead of ctx.filter every frame
  const grayCache = new WeakMap();
  function gray(img) {
    let c = grayCache.get(img); if (c) return c;
    c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.filter = 'grayscale(0.8) brightness(0.7)'; g.drawImage(img, 0, 0); grayCache.set(img, c); return c;
  }
  function drawFrame(fr, x, y, w, h, sy = 1, imgMap) {
    ctx.save(); ctx.translate(x, y); if (fr.flip) ctx.scale(-1, 1); ctx.scale(1, sy); ctx.drawImage(imgMap ? imgMap(fr.img) : fr.img, fr.sx, 0, fr.w, fr.img.height, -w / 2, -h, w, h); ctx.restore();
  }
  function drawSprite(img, x, y, w, h, flip, sy = 1) {
    ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1); ctx.scale(1, sy); ctx.drawImage(img, -w / 2, -h, w, h); ctx.restore();
  }
  function drawShadow(x, y, rx) { ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#120a05'; ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.32, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }

  function drawAgent(a) {
    const st = a.status?.status || 'offline', t = S.t;
    const G = st === 'offline' ? gray : null;
    if (a.mode === 'seated') {
      if (st === 'problem') { ctx.globalCompositeOperation = 'lighter'; drawGlow(a.slot.x, a.slot.y - a.dh * 0.25, a.dw * 0.75, 'rgba(255,40,30,A)', 0.22 + 0.16 * Math.sin(t * 5)); ctx.globalCompositeOperation = 'source-over'; }
      drawShadow(a.slot.x, a.slot.y - 4, a.dw * 0.5);
      const typing = st === 'working', breathe = 1 + Math.sin(t * (typing ? 2.4 : 1.4) + a.ph) * (typing ? 0.008 : 0.006);
      drawSprite(G ? G(a.img.sit) : a.img.sit, a.slot.x, a.slot.y, a.dw, a.dh, false, breathe);
      if (typing) { ctx.globalCompositeOperation = 'lighter'; drawGlow(a.slot.x - a.dw * 0.2, a.slot.y - a.dh * 0.55, a.dw * 0.35, 'rgba(120,170,255,A)', 0.14 + 0.06 * Math.sin(t * 13 + a.ph)); ctx.globalCompositeOperation = 'source-over'; }
    } else {
      const s = depthScale(a.slot.y); drawShadow(a.slot.x, a.slot.y - 4, a.dw * 0.5);
      drawSprite(deskEmpty, a.slot.x, a.slot.y, a.dh * deskEmpty.width / deskEmpty.height * 0.98, a.dh * 0.98, false);
      void s;
    }
  }
  function drawMover(m) {
    const s = depthScale(m.pos.y), walking = m.mode === 'walking', fr = frameOf(m), h = (m.h || STAND_H) * s, w = h * fr.w / fr.img.height;
    const bob = walking && m.img.walk4 ? -(fr.f % 2 ? 1.6 : 0) * s : walking ? -Math.abs(Math.sin(m.ph)) * 3.2 * s : 0, br = walking ? 1 : 1 + Math.sin(S.t * 1.6 + (m.ph || 0)) * 0.007;
    const rub = m.mode === 'cuddle' ? Math.sin(S.t * 5 + m.ph) : 0;
    drawShadow(m.pos.x, m.pos.y, (m.isYou ? w * 0.6 : w * 0.42));
    ctx.save(); ctx.translate(m.pos.x + rub * 3, m.pos.y + bob); ctx.rotate(rub * 0.07);
    drawFrame(fr, 0, 0, w, h, br, m.status?.status === 'offline' ? gray : null); ctx.restore();
    if (m.isYou) { ctx.save(); ctx.strokeStyle = 'rgba(79,170,165,0.9)'; ctx.lineWidth = 2.5 / S.cam.z * 1.6; ctx.beginPath(); ctx.ellipse(m.pos.x, m.pos.y, w * 0.5, w * 0.17, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  }
  function drawPet(p) {
    const h = p.w * p.image.height / p.image.width, br = p.kind === 'cat' ? 1 + Math.sin(S.t * 1.8) * 0.025 : 1 + Math.sin(S.t * 3.2) * 0.02;
    const moving = p.path.length > 0, hop = moving ? -Math.abs(Math.sin(p.ph)) * 3 : p.hop > 0 ? -Math.abs(Math.sin(S.t * 10)) * 5 : 0;
    drawShadow(p.pos.x, p.pos.y - 2, p.w * 0.45);
    ctx.save(); ctx.translate(p.pos.x, p.pos.y + hop); if (p.kind === 'dog') ctx.rotate(moving ? Math.sin(p.ph) * 0.05 : Math.sin(S.t * 0.7) * 0.012); drawSprite(p.image, 0, 0, p.w, h, p.face > 0, br); ctx.restore();
  }

  function drawHeart(x, y, r) { ctx.fillStyle = '#ff6b8b'; ctx.beginPath(); ctx.moveTo(x, y + r * 0.9); ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.4, x, y - r * 0.5); ctx.bezierCurveTo(x + r * 0.7, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9); ctx.fill(); }
  function drawTank(t) {
    const T = TANK, w = T.x1 - T.x0, h = T.y1 - T.y0;
    ctx.save();
    ctx.fillStyle = '#5a3a26'; ctx.fillRect(T.x0 - 3, T.y1, w + 6, 10);
    ctx.fillStyle = 'rgba(60,150,190,0.55)'; ctx.fillRect(T.x0, T.y0, w, h);
    ctx.fillStyle = 'rgba(200,170,110,0.9)'; ctx.fillRect(T.x0, T.y1 - 4, w, 4);
    ctx.fillStyle = '#3f8f5a'; for (let i = 0; i < 3; i++) { const x = T.x0 + 10 + i * 20; ctx.beginPath(); ctx.moveTo(x, T.y1 - 3); ctx.quadraticCurveTo(x + 5 * Math.sin(t * 1.5 + i), T.y0 + 18, x + 2, T.y0 + 10); ctx.lineTo(x + 3, T.y1 - 3); ctx.fill(); }
    ctx.beginPath(); ctx.rect(T.x0, T.y0, w, h); ctx.clip();
    for (const f of fish) { const yy = f.y + Math.sin(t * 1.5 + f.ph) * 2, d = Math.sign(f.v); ctx.fillStyle = f.c; ctx.beginPath(); ctx.ellipse(f.x, yy, f.s * 1.6, f.s, 0, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.moveTo(f.x - d * f.s * 1.4, yy); ctx.lineTo(f.x - d * f.s * 2.6, yy - f.s); ctx.lineTo(f.x - d * f.s * 2.6, yy + f.s); ctx.fill(); }
    ctx.fillStyle = 'rgba(220,245,255,0.6)'; for (let i = 0; i < 3; i++) { const by = T.y1 - ((t * 12 + i * 13) % h); ctx.beginPath(); ctx.arc(T.x0 + 14 + i * 18 + Math.sin(t + i) * 2, by, 1, 0, 6.283); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(230,245,255,0.8)'; ctx.lineWidth = 1.2; ctx.strokeRect(T.x0, T.y0, w, h);
    ctx.globalCompositeOperation = 'lighter'; drawGlow(T.x0 + w / 2, T.y0 + h / 2, 34, 'rgba(90,190,255,A)', 0.18); ctx.globalCompositeOperation = 'source-over';
  }
  function drawCage(t) {
    const { x, y } = CAGE;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 2, 16, 4, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#6b4a2e'; ctx.fillRect(-15, -4, 30, 5);
    const hop = Math.abs(Math.sin(t * 2.2)) > 0.92 ? -2 : 0;
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.ellipse(0, -12 + hop, 5, 4, 0, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.arc(4, -16 + hop, 3, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#e07b2a'; ctx.beginPath(); ctx.moveTo(7, -16 + hop); ctx.lineTo(10, -15 + hop); ctx.lineTo(7, -14 + hop); ctx.fill();
    ctx.strokeStyle = '#d9b26a'; ctx.lineWidth = 1;
    for (let i = -12; i <= 12; i += 4) { ctx.beginPath(); ctx.moveTo(i, -4); ctx.lineTo(i * 0.95, -22); ctx.quadraticCurveTo(i * 0.5, -32, 0, -33); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-12, -22); ctx.quadraticCurveTo(0, -38, 12, -22); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -36, 2.5, 0, 6.283); ctx.stroke();
    ctx.restore();
  }

  function draw() {
    const z = S.cam.z;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = WORLD.bgColor; ctx.fillRect(0, 0, vw, vh);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (vw / 2 - S.cam.x * z), dpr * (vh / 2 - S.cam.y * z));
    ctx.imageSmoothingQuality = 'high';
    // background pre-scaled close to on-screen size (big minifying drawImage every frame was the main cost)
    const need = Math.min(2048, Math.ceil(WORLD.w * z * dpr / 256) * 256);
    if (!bgMip || Math.abs(need - bgMipW) > 255) { bgMipW = need; if (need >= 1792) bgMip = bg; else { bgMip = document.createElement('canvas'); bgMip.width = bgMip.height = need; const g = bgMip.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bg, 0, 0, need, need); } }
    ctx.drawImage(bgMip, 0, 0, WORLD.w, WORLD.h);
    const t = S.t;
    // snow falling on the garden (skipped over the roofless house)
    ctx.fillStyle = 'rgba(235,242,255,0.8)';
    ctx.beginPath(); for (const f of snow) { if (f.x > H[0] && f.x < H[2] && f.y > H[1] && f.y < H[3]) continue; ctx.moveTo(f.x + f.r, f.y); ctx.arc(f.x, f.y, f.r, 0, 6.283); } ctx.fill();
    drawTank(t); drawCage(t);
    // warm light: fire + lamps
    ctx.globalCompositeOperation = 'lighter';
    const fl = 0.22 + 0.07 * Math.sin(t * 9) + 0.05 * Math.sin(t * 23 + 1) + 0.03 * Math.sin(t * 37);
    drawGlow(FIRE.x, FIRE.y, 46, 'rgba(255,140,40,A)', fl); drawGlow(FIRE.x, FIRE.y + 60, 140, 'rgba(255,120,40,A)', fl * 0.3);
    for (const l of LAMPS) drawGlow(l.x, l.y, 60, 'rgba(255,190,110,A)', 0.12 + 0.01 * Math.sin(t * 2));
    ctx.globalCompositeOperation = 'source-over';
    // depth-sorted things
    const items = [];
    for (const a of S.agents.values()) { items.push({ y: a.slot.y, d: () => drawAgent(a) }); if (a.mode !== 'seated') items.push({ y: a.pos.y, d: () => drawMover(a) }); }
    for (const p of pets) items.push({ y: p.pos.y, d: () => drawPet(p) });
    if (S.avatar) items.push({ y: S.avatar.pos.y, d: () => drawMover(S.avatar) });
    items.sort((a, b) => a.y - b.y).forEach(i => i.d());
    // string lights twinkle
    ctx.globalCompositeOperation = 'lighter';
    LIGHTS.forEach(([x, y], i) => drawGlow(x, y, 7, 'rgba(255,205,120,A)', 0.25 + 0.25 * Math.sin(t * (1.3 + (i % 5) * 0.4) + i * 1.7)));
    ctx.globalCompositeOperation = 'source-over';
    // floating notes (bird / sleepy cat)
    ctx.textAlign = 'center';
    for (const n of S.notes) { const a = Math.min(1, n.t * 2) * (1 - n.t / 2.6); ctx.globalAlpha = a; ctx.fillStyle = n.kind === 'bird' ? '#ffe2a8' : '#f6ead8'; ctx.font = `${n.kind === 'bird' ? 13 : 11 + n.t * 3}px sans-serif`; ctx.fillText(n.ch, n.x + Math.sin(n.t * 3) * 5, n.y - n.t * 16); }
    // hearts (cats purring at the owner)
    for (const h of S.hearts) { const a = Math.min(1, h.t * 3) * (1 - h.t / 2.2); ctx.globalAlpha = a; drawHeart(h.x + Math.sin(h.t * 4 + h.s * 9) * 4, h.y - 70 * h.h0 - h.t * 22, 5.5 * h.s); }
    ctx.globalAlpha = 1;
    // papers
    for (const p of S.papers) {
      if (p.t < 0) continue; const a = headPoint(p.from), b = headPoint(p.to); if (!a || !b) continue;
      const e = p.t < 0.5 ? 2 * p.t * p.t : 1 - (-2 * p.t + 2) ** 2 / 2, mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 70;
      const x = (1 - e) ** 2 * a.x + 2 * (1 - e) * e * mx + e * e * b.x, y = (1 - e) ** 2 * a.y + 2 * (1 - e) * e * my + e * e * b.y;
      ctx.globalCompositeOperation = 'lighter'; drawGlow(x, y, 22, 'rgba(255,200,120,A)', 0.35); ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(p.t * 12) * 0.35); ctx.fillStyle = '#fff8ea'; ctx.strokeStyle = '#c8693f'; ctx.lineWidth = 0.8; ctx.scale(0.75, 0.75); ctx.fillRect(-7, -9, 14, 18); ctx.strokeRect(-7, -9, 14, 18); ctx.fillStyle = '#c9b89e'; for (let k = 0; k < 4; k++) ctx.fillRect(-4.5, -5 + k * 3.5, 9 - (k === 3 ? 3 : 0), 1); ctx.restore();
    }
    // vignette
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.drawImage(vignette, 0, 0, vw, vh);
  }

  // ---------- loop
  let last = performance.now(), acc = 0, frames = 0;
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt; frames++;
    if (acc >= 1) { S.fps = frames / acc; acc = 0; frames = 0; }
    update(dt); if (S.render) draw(); onFrame?.(S, dt); requestAnimationFrame(loop);
  }
  resize();
  requestAnimationFrame(loop);

  return { S, rooms, roomAt, walkable, route, greet, setOwnerPos, frameOf, setAgents, setAvatar, setWalk, walkTo, gather, fit, focus, focusRoom, toScreen, spriteBox, headPoint, sendPaper, resize, setInsets: i => { S.insets = i; }, setStatus: (id, st) => { const a = S.agents.get(id); if (a) a.status = st; } };
}
