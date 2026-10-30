import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { STATUS_LABELS, loadAgents, normalizeAgent } from './agents.js';
import { computeLayout } from './layout.js';
import { buildOffice } from './office.js';
import { buildCharacter } from './characters.js';
import { buildPets } from './pets.js';
import { WalkControls, createJoystick } from './walk.js';
import { startStatusFeed } from './statusFeed.js';
import { createChatPanel } from './chatPanel.js';
import { CONFIG } from './config.js';

const STATUS_COLORS = { working: '#3f7f80', waiting: '#d4892c', problem: '#c0392b', done: '#5f8f4e', offline: '#8a7b6e' };
const hex = n => `#${n.toString(16).padStart(6, '0')}`;
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const params = new URLSearchParams(location.search);
const IS_MOBILE = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);

async function fetchJSON(url) { const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return r.json(); }

async function init() {
  try { await Promise.all([document.fonts.load('700 40px "Office Arabic"'), document.fonts.load('400 30px "Office Arabic"')]); } catch {}

  // ---------- agents (data-driven) - agents.json plus any unknown id found in status.json
  const loaded = await loadAgents();
  const statusUrl = params.get('status') || CONFIG.statusUrl;
  let firstStatus = null;
  try { firstStatus = await fetchJSON(statusUrl); } catch {}
  const list = [...loaded.agents];
  for (const s of firstStatus?.agents || []) if (!list.some(a => a.id === s.id)) list.push(normalizeAgent({ id: s.id, agentName: s.agentName || s.id, person: s.person, role: s.role }));
  const agentIdsKey = list.map(a => a.id).join('|');
  const layout = computeLayout(list.length);

  // ---------- renderer (sRGB output, ACES, soft shadows)
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  const DPR_CAP = IS_MOBILE ? 1.5 : 2;
  let dpr = Math.min(devicePixelRatio, DPR_CAP);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('app').appendChild(renderer.domElement);
  const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') });
  labelRenderer.setSize(innerWidth, innerHeight);

  const scene = new THREE.Scene();
  const NIGHT = 0x0e1a33;
  scene.background = new THREE.Color(NIGHT);
  scene.fog = new THREE.Fog(NIGHT, 22, 60);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 200);

  // ---------- night lighting: cool moon outside, warm amber inside
  scene.add(new THREE.HemisphereLight(0xffd9b5, 0x1c130d, 0.32));
  const moon = new THREE.DirectionalLight(0x8fa8ff, 0.6);
  moon.position.set(-5, 14, 10); moon.castShadow = true;
  moon.shadow.mapSize.set(IS_MOBILE ? 2048 : 4096, IS_MOBILE ? 2048 : 4096);
  Object.assign(moon.shadow.camera, { left: -13, right: 13, top: 10, bottom: -10, near: 1, far: 40 });
  moon.shadow.bias = -0.0003; moon.shadow.normalBias = 0.02; moon.shadow.radius = 5;
  scene.add(moon);
  const warmKey = new THREE.DirectionalLight(0xffc896, 0.45); // soft warm key so everything stays readable
  warmKey.position.set(4, 9, 6); scene.add(warmKey);
  const lampSpots = [...layout.lampXs.map(x => [x, layout.tableZ]), [3.0 + layout.E, 3.5], [-7.4, -3.6], [4.0 + layout.E, -3.8]];
  lampSpots.forEach(([x, z]) => { const p = new THREE.PointLight(0xffb870, 9, 8, 1.8); p.position.set(x, 1.95, z); scene.add(p); });
  // stars dome
  {
    const N = 900, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.42, r = 90; pos.set([Math.cos(th) * Math.sin(ph) * r, Math.cos(ph) * r * 0.6 + 6, Math.sin(th) * Math.sin(ph) * r], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.85 })));
  }

  // ---------- office + people + pets
  const office = buildOffice(scene, layout);
  const agents = {};
  list.forEach((a, i) => {
    const seat = layout.seats[i];
    const d = office.desk(seat.x, seat.z, seat.rot, a.id, a.props, { shared: true, blanket: a.blanket });
    const ch = buildCharacter(a);
    ch.root.position.copy(d.seat).add(new THREE.Vector3(0, 0, -0.04).applyAxisAngle(new THREE.Vector3(0, 1, 0), seat.rot));
    ch.root.rotation.y = seat.rot + Math.PI;
    scene.add(ch.root);
    agents[a.id] = { def: { ...a, desk: seat }, desk: d, ch, status: { id: a.id, status: 'offline' } };
  });
  office.finish();
  const updatePets = buildPets(scene, office.colliders, layout.E);
  // social glances toward the two nearest family members and the table centre
  const center = new THREE.Vector3(layout.center.x, 0, layout.center.z);
  for (const id in agents) {
    const A = agents[id], p = A.ch.root.position;
    const near = Object.values(agents).filter(o => o !== A).sort((a, b) => a.ch.root.position.distanceTo(p) - b.ch.root.position.distanceTo(p)).slice(0, 2).map(o => o.ch.root.position);
    A.ch.state.glances = [...near, center].map(q => { const d = q.clone().sub(p); const ang = Math.atan2(d.x, d.z) - A.ch.root.rotation.y; return Math.atan2(Math.sin(ang), Math.cos(ang)); });
  }

  // ---------- post-processing: MSAA render target -> GTAO -> subtle bloom -> output (tone map + sRGB)
  const rt = new THREE.WebGLRenderTarget(innerWidth * dpr, innerHeight * dpr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(dpr); composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1.1, samples: 12 });
  gtao.blendIntensity = 0.85;
  composer.addPass(gtao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.32, 0.55, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const quality = { level: params.get('quality') || (IS_MOBILE ? 'medium' : 'high') };
  function applyQuality() {
    gtao.enabled = quality.level === 'high';
    bloom.enabled = quality.level !== 'low';
    renderer.shadowMap.type = quality.level === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  }
  applyQuality();

  // ---------- labels above heads + side list (generated from the agents list)
  const people = document.getElementById('people');
  for (const id in agents) {
    const A = agents[id], a = A.def;
    const el = document.createElement('div'); el.className = 'tag';
    el.innerHTML = `<div class="bubble" hidden></div><div class="icon" hidden></div>
      <div class="name"><span class="sd"></span><span>${esc(a.person)} · ${esc(a.agentName)}</span></div>`;
    el.addEventListener('click', e => { e.stopPropagation(); chat.open(id); });
    const obj = new CSS2DObject(el); obj.position.set(0, 1.55, 0); A.ch.root.add(obj);
    A.label = el;
    const b = document.createElement('div'); b.className = 'person'; b.dataset.id = id;
    b.innerHTML = `<span class="av" style="background:${hex(a.look.shirt)}">${esc([...a.person][0])}</span>
      <span class="txt"><div class="nm">${esc(a.person)} · ${esc(a.agentName)}</div><div class="rl">${esc(a.role)}</div></span>
      <span class="sd"></span>
      <button class="go" title="روح لمكتبه">📍</button><button class="talk" title="احجي وياه">💬</button>`;
    b.querySelector('.go').addEventListener('click', e => { e.stopPropagation(); goToAgent(id); });
    b.querySelector('.talk').addEventListener('click', e => { e.stopPropagation(); chat.open(id); });
    b.addEventListener('click', () => goToAgent(id));
    people.appendChild(b);
  }

  // ---------- camera: damped orbit overview + smooth walk mode
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true; orbit.dampingFactor = 0.06; orbit.rotateSpeed = 0.6; orbit.zoomSpeed = 0.8;
  orbit.maxPolarAngle = Math.PI * 0.47; orbit.minDistance = 1.5; orbit.maxDistance = 28;
  const HOME = { pos: new THREE.Vector3(1.6 + layout.E * 0.5, 6.4, 7.6), target: new THREE.Vector3(-2.7 + layout.E * 0.4, 0.5, -0.4) };
  camera.position.copy(HOME.pos); orbit.target.copy(HOME.target);
  let camTween = null; // generic eased camera tween (position + look target + fov)
  function tweenCamera(toPos, toTarget, { dur = 1.4, fov = camera.fov, onDone } = {}) {
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    const fromTarget = mode === 'orbit' ? orbit.target.clone() : camera.position.clone().add(dir.multiplyScalar(3));
    camTween = { p0: camera.position.clone(), p1: toPos.clone(), t0: fromTarget, t1: toTarget.clone(), f0: camera.fov, f1: fov, t: 0, dur, onDone };
  }

  const walk = new WalkControls(camera, renderer.domElement, office.colliders, office.bounds);
  createJoystick(document.getElementById('joystick'), (x, y) => walk.setJoystick(x, y));
  let mode = 'orbit';
  const modeBtn = document.getElementById('modeBtn');
  function setMode(m) {
    if (m === mode) return;
    const w = m === 'walk';
    document.body.classList.toggle('walking', w);
    ['walkHelp', 'joystick', 'crosshair'].forEach(i => (document.getElementById(i).hidden = !w));
    modeBtn.textContent = w ? '🛰 نظرة من فوق' : '🚶 تمشّى بالمكتب';
    if (w) {
      orbit.enabled = false;
      walk.pos.set(layout.center.x + 0.4, 0, 4.2); walk.yaw = walk.yawT = 0; walk.pitch = walk.pitchT = -0.12; walk.vel.set(0, 0);
      const eye = new THREE.Vector3(walk.pos.x, walk.eye, walk.pos.z);
      const look = eye.clone().add(new THREE.Vector3(0, Math.sin(-0.12) * 3, -3));
      tweenCamera(eye, look, { dur: 1.6, fov: 68, onDone: () => { mode = 'walk'; walk.enabled = true; } });
      mode = 'transition';
    } else {
      walk.enabled = false; mode = 'orbit'; orbit.enabled = true;
      const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
      orbit.target.copy(camera.position).add(dir.multiplyScalar(2.5));
      tweenCamera(HOME.pos, HOME.target, { dur: 1.6, fov: 45 });
    }
  }
  modeBtn.addEventListener('click', () => setMode(mode === 'orbit' ? 'walk' : 'orbit'));
  document.getElementById('resetBtn').addEventListener('click', () => (mode === 'walk' ? setMode('orbit') : tweenCamera(HOME.pos, HOME.target, { fov: 45 })));

  function goToAgent(id) {
    const A = agents[id]; const rot = A.def.desk.rot;
    const head = new THREE.Vector3(); A.ch.head.getWorldPosition(head);
    const R = v => v.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    if (mode === 'walk') {
      const cand = [new THREE.Vector3(1.15, 0, 0.8), new THREE.Vector3(-1.15, 0, 0.8), new THREE.Vector3(0, 0, 1.3), new THREE.Vector3(0.6, 0, 1.5)];
      let spot = R(cand[2].clone()).add(A.desk.seat);
      for (const c of cand) { const s = R(c.clone()).add(A.desk.seat); if (walk.isFree(s.x, s.z)) { spot = s; break; } }
      walk.goTo(spot, head.clone().add(new THREE.Vector3(0, -0.12, 0)));
    } else if (mode === 'orbit') {
      // front 3/4 view: in front of the face (character's local +z), slightly to the side
      const fwd = new THREE.Vector3(); A.ch.root.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const pos = head.clone().addScaledVector(fwd, 1.45).addScaledVector(side, 0.75); pos.y = head.y + 0.28;
      tweenCamera(pos, head.clone().add(new THREE.Vector3(0, -0.12, 0)), { dur: 1.5, fov: 45 });
    }
  }

  // click a person -> chat
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  const pickables = Object.values(agents).flatMap(A => A.ch.pickables);
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', e => (downAt = { x: e.clientX, y: e.clientY }));
  renderer.domElement.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (hit) chat.open(hit.object.userData.agentId);
  });

  const chat = createChatPanel({ getAgent: id => agents[id].def, getStatus: id => agents[id].status, onOpen: id => goToAgent(id) });

  // ---------- status feed + paper messages
  const seenMsgs = new Set(); const papers = [];
  const paperGeo = new THREE.PlaneGeometry(0.21, 0.297);
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xfff8ea, side: THREE.DoubleSide, roughness: 0.6, emissive: 0xffb060, emissiveIntensity: 0.35 });
  function sendPaper(from, to, delay = 0) {
    const a = agents[from], b = agents[to]; if (!a || !b) return;
    const p0 = new THREE.Vector3(); a.ch.head.getWorldPosition(p0); p0.y += 0.1;
    const p2 = new THREE.Vector3(); b.ch.head.getWorldPosition(p2); p2.y += 0.1;
    const p1 = p0.clone().lerp(p2, 0.5); p1.y += 1.2 + p0.distanceTo(p2) * 0.12;
    const m = new THREE.Mesh(paperGeo, paperMat); m.castShadow = true; m.visible = false; scene.add(m);
    papers.push({ m, curve: new THREE.QuadraticBezierCurve3(p0, p1, p2), t: -delay, dur: 2.6 });
  }
  const feedDot = document.getElementById('feedDot'), feedText = document.getElementById('feedText');
  let firstLoad = true;
  function onStatus(data, ok) {
    feedDot.className = `dot ${ok ? 'ok' : 'err'}`;
    if (!ok) { feedText.textContent = 'تعذّر قراءة status.json'; return; }
    const upd = data.updatedAt ? new Date(data.updatedAt) : null;
    feedText.textContent = `آخر تحديث: ${upd ? upd.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : '—'} · كل ٥ ثواني`;
    document.getElementById('sampleBadge').hidden = !data.sample;
    for (const s of data.agents || []) if (agents[s.id]) agents[s.id].status = s;
    let i = 0;
    for (const m of data.messages || []) { if (seenMsgs.has(m.id)) continue; seenMsgs.add(m.id); sendPaper(m.from, m.to, (firstLoad ? 1.5 : 0) + i++ * 1.4); }
    firstLoad = false;
    renderStatuses(); chat.refresh();
  }
  if (firstStatus) onStatus(firstStatus, true);
  CONFIG.statusUrl = statusUrl;
  startStatusFeed(onStatus);
  // a new agent in agents.json (or a new id in status.json) -> rebuild the office automatically
  setInterval(async () => {
    try {
      const fresh = await loadAgents(); const st = await fetchJSON(statusUrl).catch(() => null);
      const ids = fresh.agents.map(a => a.id); for (const s of st?.agents || []) if (!ids.includes(s.id)) ids.push(s.id);
      if (fresh.source === 'file' && ids.join('|') !== agentIdsKey) location.reload();
    } catch {}
  }, CONFIG.statusPollMs);

  function renderStatuses() {
    for (const id in agents) {
      const A = agents[id], s = A.status, st = s.status || 'offline';
      const el = A.label, bubble = el.querySelector('.bubble'), icon = el.querySelector('.icon');
      el.querySelector('.sd').style.background = STATUS_COLORS[st];
      bubble.className = `bubble ${st}`;
      if (st === 'working') { bubble.hidden = false; bubble.innerHTML = `${esc(s.task || 'يشتغل')}<span class="typingdots"><i></i><i></i><i></i></span>`; }
      else if (st === 'problem') { bubble.hidden = false; bubble.innerHTML = `⚠ ${esc(s.reason || 'مشكلة')}`; }
      else if (st === 'done') { bubble.hidden = false; bubble.innerHTML = `${esc(s.task || 'خلّص')}${s.result ? `<br><small>${esc(s.result)}</small>` : ''}`; }
      else if (st === 'waiting') { bubble.hidden = false; bubble.innerHTML = `☕ ${esc(STATUS_LABELS.waiting)}${s.task ? ` — ${esc(s.task)}` : ''}`; }
      else { bubble.hidden = false; bubble.innerHTML = `${esc(STATUS_LABELS.offline)}`; }
      icon.hidden = !(st === 'done' || st === 'problem');
      icon.className = `icon ${st}`; icon.textContent = st === 'done' ? '✓' : '!';
      const pb = people.querySelector(`[data-id="${CSS.escape(id)}"] .sd`); pb.style.background = STATUS_COLORS[st]; pb.title = STATUS_LABELS[st];
    }
  }

  // ---------- adaptive quality + FPS meter
  const perf = { fps: 0, frames: 0, acc: 0, history: [], low: 0, high: 0 };
  const fpsEl = document.getElementById('fps');
  function adapt(dtRaw) {
    perf.frames++; perf.acc += dtRaw;
    if (perf.acc < 1) return;
    perf.fps = perf.frames / perf.acc; perf.history.push(perf.fps); if (perf.history.length > 120) perf.history.shift();
    perf.frames = 0; perf.acc = 0;
    if (fpsEl) fpsEl.textContent = `${Math.round(perf.fps)} fps · ${dpr.toFixed(2)}x · ${quality.level}`;
    if (params.has('noadapt')) return;
    if (perf.fps < 45) { perf.low++; perf.high = 0; } else if (perf.fps > 58) { perf.high++; perf.low = 0; } else { perf.low = perf.high = 0; }
    if (perf.low >= 2) { // step quality down: AO off -> lower DPR -> bloom off
      perf.low = 0;
      if (quality.level === 'high') { quality.level = 'medium'; applyQuality(); }
      else if (dpr > 1) setDpr(Math.max(1, dpr - 0.25));
      else if (quality.level === 'medium') { quality.level = 'low'; applyQuality(); }
      else if (dpr > 0.75) setDpr(dpr - 0.125);
    } else if (perf.high >= 4 && dpr < Math.min(devicePixelRatio, DPR_CAP)) { perf.high = 0; setDpr(Math.min(Math.min(devicePixelRatio, DPR_CAP), dpr + 0.25)); }
  }
  function setDpr(v) { dpr = v; renderer.setPixelRatio(dpr); composer.setPixelRatio(dpr); composer.setSize(innerWidth, innerHeight); }

  // ---------- main loop
  const clock = new THREE.Clock(); const tmp = new THREE.Vector3();
  function frame() {
    const dtRaw = clock.getDelta(); const dt = Math.min(dtRaw, 0.05), t = clock.elapsedTime;
    adapt(dtRaw);
    if (camTween) {
      const tw = camTween; tw.t = Math.min(1, tw.t + Math.min(dtRaw, 0.5) / tw.dur); const k = ease(tw.t);
      camera.position.lerpVectors(tw.p0, tw.p1, k);
      tmp.lerpVectors(tw.t0, tw.t1, k); camera.lookAt(tmp);
      if (mode === 'orbit') orbit.target.copy(tmp);
      camera.fov = tw.f0 + (tw.f1 - tw.f0) * k; camera.updateProjectionMatrix();
      if (tw.t >= 1) { camTween = null; tw.onDone?.(); }
    } else if (mode === 'orbit') orbit.update();
    else if (mode === 'walk') walk.update(dt);

    for (const id in agents) {
      const A = agents[id], st = A.status.status || 'offline';
      A.ch.pose(st, dt);
      const red = st === 'problem' ? 0.5 + 0.5 * Math.sin(t * 5) : 0;
      A.desk.lampLight.intensity = red * 5;
      A.desk.lampMat.emissive.setRGB(red, 0, 0); A.desk.lampMat.emissiveIntensity = 2;
      A.ch.head.getWorldPosition(tmp);
      A.label.classList.toggle('far', camera.position.distanceTo(tmp) > 16);
    }
    office.update(t, dt); updatePets(t, dt);
    for (const s of office.screens) s.update(t, !s.agentId || agents[s.agentId]?.status.status === 'working');
    for (let i = papers.length - 1; i >= 0; i--) {
      const p = papers[i]; p.t += dt / p.dur; if (p.t < 0) continue;
      p.m.visible = true;
      if (p.t >= 1) { scene.remove(p.m); papers.splice(i, 1); continue; }
      p.curve.getPoint(ease(p.t), p.m.position); p.m.rotation.set(t * 3, t * 2, Math.sin(t * 4) * 0.5);
    }
    composer.render();
    labelRenderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); labelRenderer.setSize(innerWidth, innerHeight);
  });
  window.__office = { chat, goToAgent, setMode, agents, walk, camera, perf, quality, layout, get mode() { return mode; } };
  renderStatuses();
  frame();
  document.getElementById('loading').classList.add('hide');
  document.body.dataset.ready = '1';
}

init().catch(err => { console.error(err); document.getElementById('loading').textContent = 'صار خطأ بتحميل المكتب: ' + err.message; });
