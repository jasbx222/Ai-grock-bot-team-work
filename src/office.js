import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Geometry cache: identical sizes share one (beveled) geometry -> less memory, no jank
const geoCache = new Map();
function bevelBox(w, h, d) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  let g = geoCache.get(key);
  if (!g) {
    const r = Math.min(0.025, Math.min(w, h, d) * 0.3);
    g = r < 0.004 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 3, r);
    geoCache.set(key, g);
  }
  return g;
}
const cylCache = new Map();
function cylGeo(rt, rb, h, seg) {
  const key = `${rt}|${rb}|${h}|${seg}`;
  let g = cylCache.get(key); if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, seg); cylCache.set(key, g); }
  return g;
}
import { woodFloor, screenTexture, whiteboardTexture, signTexture, knitTexture, rugTexture, snowyWindowTexture, snowfallTexture, softDotTexture } from './textures.js';

// Office bounds (meters). Walls at x=±10, z=±7.


const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...o });
const mats = {
  wall: M(0xf0e2cf, { roughness: 0.95 }),
  wallAccent: M(0xb5653f, { roughness: 0.9 }),
  deskTop: M(0xa8774a, { roughness: 0.5 }),
  deskLeg: M(0x4a3426, { roughness: 0.5, metalness: 0.2 }),
  chair: M(0x3a2a20, { roughness: 0.6 }),
  chairFabric: M(0x7a5240, { roughness: 0.9 }),
  metal: M(0x9aa1a9, { roughness: 0.3, metalness: 0.8 }),
  black: M(0x111214, { roughness: 0.4 }),
  white: M(0xf5f5f2, { roughness: 0.5 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xf3ead8, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0, depthWrite: false }),
  pot: M(0xb8693f, { roughness: 0.8 }),
  leaf: M(0x3f7d3a, { roughness: 0.8 }),
  leaf2: M(0x5a9a4a, { roughness: 0.8 }),
  sofa: M(0xa65d3f, { roughness: 0.95 }),
  window: new THREE.MeshBasicMaterial({ map: snowyWindowTexture(), toneMapped: false }),
  counter: M(0xf3e9d8, { roughness: 0.35 }),
  cabinet: M(0x7a5a44, { roughness: 0.6 }),
};

export function buildOffice(scene, layout) {
  const E = layout.E; // extra room width when many agents join
  const bounds = { minX: -10, maxX: 5.5 + E, minZ: -6, maxZ: 5.5 };
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const screens = [];   // {update, agentId}
  const animated = [];  // functions (t, dt) for fire, steam, snow, twinkle
  const anchors = {};
  let colDX = 0; // x offset applied while building the east side
  const addCol = (cx, cz, w, d) => colliders.push({ minX: cx + colDX - w / 2, maxX: cx + colDX + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });

  function box(w, h, d, mat, x, y, z, parent = scene, cast = true) {
    const m = new THREE.Mesh(bevelBox(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
  }
  function cyl(rt, rb, h, mat, x, y, z, parent = scene, seg = 24) {
    const m = new THREE.Mesh(cylGeo(rt, rb, h, seg), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }

  // ---- floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(15.5 + E, 11.5), M(0xffffff, { map: woodFloor(), roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(-2.25 + E / 2, 0, -0.25); floor.receiveShadow = true; scene.add(floor);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 5.6), M(0xffffff, { map: rugTexture(), roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(-2.6, 0.006, 0.05); rug.receiveShadow = true; scene.add(rug);
  const rug2 = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), M(0xffffff, { map: rugTexture(true), roughness: 1 }));
  rug2.rotation.x = -Math.PI / 2; rug2.position.set(-8.0, 0.007, -3.6); rug2.receiveShadow = true; scene.add(rug2);

  // ---- walls: back (z=-7) and west (x=-10) full height; south/east low + glass
  const H = 3.0;
  box(15.9 + E, H, 0.2, mats.wall, -2.25 + E / 2, H / 2, -6.1); addCol(-2.25 + E / 2, -6.1, 15.9 + E, 0.4);
  box(0.2, H, 11.9, mats.wall, -10.1, H / 2, -0.25); addCol(-10.1, -0.25, 0.4, 11.9);
  box(15.9 + E, 0.9, 0.2, mats.wall, -2.25 + E / 2, 0.45, 5.6); addCol(-2.25 + E / 2, 5.6, 15.9 + E, 0.4);
  box(0.2, 0.9, 11.9, mats.wall, 5.6 + E, 0.45, -0.25); addCol(5.6 + E, -0.25, 0.4, 11.9);
  const g1 = box(15.9 + E, H - 0.9, 0.04, mats.glass, -2.25 + E / 2, 0.9 + (H - 0.9) / 2, 5.6, scene, false); g1.receiveShadow = false;
  const g2 = box(0.04, H - 0.9, 11.9, mats.glass, 5.6 + E, 0.9 + (H - 0.9) / 2, -0.25, scene, false); g2.receiveShadow = false;
  // accent stripe + windows on back wall
  box(15.9 + E, 0.12, 0.05, mats.wallAccent, -2.25 + E / 2, 0.06, -5.98, scene, false);
  for (let i = 0; i < 4; i++) {
    const x = -7.6 + i * 3.4;
    box(2.4, 1.5, 0.04, mats.window, x, 1.75, -5.98, scene, false);
    const sf = snowfallTexture(); sf.repeat.set(2.4, 1.5);
    const flakes = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshBasicMaterial({ map: sf, transparent: true, depthWrite: false, toneMapped: false }));
    flakes.position.set(x, 1.75, -5.955); scene.add(flakes);
    animated.push((t) => { sf.offset.set(Math.sin(t * 0.3 + i) * 0.05, t * 0.12); });
    box(2.5, 0.08, 0.1, mats.deskLeg, x, 2.54, -5.96, scene, false);
    box(2.5, 0.08, 0.1, mats.deskLeg, x, 0.96, -5.96, scene, false);
    box(0.06, 1.5, 0.1, mats.deskLeg, x, 1.75, -5.96, scene, false);
  }
  // company sign on west wall
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshStandardMaterial({ map: signTexture('مكتب الوكلاء', '#1f3b4d', '#f8f3ea'), roughness: 0.6 }));
  sign.position.set(-9.98, 2.2, 3.4); sign.rotation.y = Math.PI / 2; scene.add(sign);

  // ---- desks
  function desk(x, z, rot, agentId, props, opts = {}) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
    // In local space the person sits at z=+0.25 facing -z, desk top centered at z=-0.45
    if (!opts.shared) {
      box(1.7, 0.05, 0.85, mats.deskTop, 0, 0.75, -0.45, g);
      [[-0.8, -0.82], [0.8, -0.82], [-0.8, -0.08], [0.8, -0.08]].forEach(([lx, lz]) => box(0.05, 0.73, 0.05, mats.deskLeg, lx, 0.365, lz, g));
      box(1.6, 0.35, 0.03, mats.deskLeg, 0, 0.5, -0.85, g);
      box(0.42, 0.55, 0.55, mats.cabinet, 0.6, 0.29, -0.5, g);
    }
    // chair
    const ch = new THREE.Group(); ch.position.set(0, 0, 0.3); g.add(ch);
    box(0.5, 0.08, 0.48, mats.chairFabric, 0, 0.47, 0, ch);
    box(0.48, 0.62, 0.07, mats.chairFabric, 0, 0.86, 0.24, ch).rotation.x = -0.12;
    cyl(0.03, 0.03, 0.4, mats.metal, 0, 0.25, 0, ch);
    for (let i = 0; i < 5; i++) { const leg = box(0.3, 0.03, 0.04, mats.chair, 0, 0.06, 0, ch); leg.rotation.y = (i / 5) * Math.PI * 2; leg.position.set(Math.cos(i / 5 * 6.283) * 0.14, 0.06, -Math.sin(i / 5 * 6.283) * 0.14); }
    [-0.27, 0.27].forEach(ax => box(0.05, 0.04, 0.32, mats.chair, ax, 0.68, 0.0, ch));
    if (opts.blanket) { // knitted blanket draped over the chair back
      const km = M(0xffffff, { map: knitTexture(opts.blanket), roughness: 1 });
      const top = box(0.52, 0.035, 0.16, km, 0, 1.19, 0.27, ch); top.rotation.x = -0.1;
      box(0.52, 0.5, 0.035, km, 0, 0.95, 0.34, ch).rotation.x = -0.12;
      box(0.5, 0.35, 0.03, km, 0, 0.98, 0.205, ch).rotation.x = -0.1;
    }
    // keyboard + mouse
    box(0.44, 0.02, 0.14, mats.black, 0, 0.785, -0.3, g);
    box(0.06, 0.02, 0.1, mats.black, 0.32, 0.785, -0.3, g);
    // monitors
    const kind = props.includes('designScreen') ? 'design' : agentId === 'messaging' ? 'chat' : agentId === 'planbot' ? 'board' : 'code';
    const monitor = (mx, rotY, scr) => {
      const mg = new THREE.Group(); mg.position.set(mx, 0.78, -0.72); mg.rotation.y = rotY; g.add(mg);
      cyl(0.02, 0.02, 0.28, mats.deskLeg, 0, 0.14, -0.02, mg);
      box(0.24, 0.015, 0.18, mats.deskLeg, 0, 0.008, -0.02, mg);
      const w = kind === 'design' ? 0.82 : 0.6, h = kind === 'design' ? 0.47 : 0.36;
      box(w + 0.03, h + 0.03, 0.03, mats.black, 0, 0.28 + h / 2, 0, mg);
      const s = screenTexture(scr);
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: s.texture, toneMapped: false }));
      sm.position.set(0, 0.28 + h / 2, 0.017); mg.add(sm);
      screens.push({ agentId, update: s.update, mesh: sm });
    };
    if (props.includes('dualMonitor')) { monitor(-0.33, 0.18, kind); monitor(0.33, -0.18, kind); }
    else monitor(0, 0, kind);
    if (props.includes('laptop')) {
      const lg = new THREE.Group(); lg.position.set(-0.55, 0.78, -0.35); lg.rotation.y = 0.3; g.add(lg);
      box(0.34, 0.015, 0.24, mats.metal, 0, 0.008, 0, lg);
      const lid = box(0.34, 0.22, 0.012, mats.metal, 0, 0.11, -0.12, lg); lid.rotation.x = -0.25;
    }
    const topY = opts.shared ? 0.78 : 0.775;
    if (props.includes('coffee')) {
      cyl(0.045, 0.04, 0.1, M(0xc8693f, { roughness: 0.4 }), -0.62, topY + 0.05, -0.25, g);
      cyl(0.038, 0.038, 0.005, M(0x3b2314), -0.62, topY + 0.097, -0.25, g);
      steam(new THREE.Vector3(-0.62, topY + 0.1, -0.25), g);
    }
    if (props.includes('tea')) teaGlass(-0.6, topY, -0.22, g);
    if (props.includes('notebook')) { box(0.22, 0.015, 0.3, M(0xe94e3c), -0.55, 0.785, -0.3, g); cyl(0.006, 0.006, 0.16, M(0x1d4ed8), -0.4, 0.79, -0.3, g).rotation.z = Math.PI / 2; }
    if (props.includes('phone')) box(0.08, 0.01, 0.16, mats.black, -0.5, 0.785, -0.32, g);
    if (props.includes('plant')) plant(-0.65, 0.78, -0.65, 0.35, g);
    // problem lamp (desk light that turns red)
    const lampMat = M(0x444444, { emissive: 0x000000 });
    const lamp = cyl(0.05, 0.07, 0.06, lampMat, 0.7, 0.81, -0.75, g);
    const lampLight = new THREE.PointLight(0xff2a2a, 0, 3.5, 2); lampLight.position.set(0.7, 1.1, -0.6); g.add(lampLight);
    if (!opts.shared) addCol(x, z + (rot === 0 ? -0.3 : 0.3), 1.9, 1.75);
    const seat = new THREE.Vector3(0, 0, 0.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot).add(new THREE.Vector3(x, 0, z));
    return { group: g, seat, lampMat, lampLight, chair: ch };
  }

  // rising steam puffs (sprites) above a point
  const steamTex = softDotTexture('rgba(255,255,255,0.9)');
  function steam(pos, parent = scene, scale = 1) {
    const puffs = [];
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0 }));
      sp.position.copy(pos); parent.add(sp); puffs.push({ sp, o: i / 4 });
    }
    animated.push((t) => {
      for (const p of puffs) {
        const k = (t * 0.45 + p.o) % 1;
        p.sp.position.set(pos.x + Math.sin(t * 2 + p.o * 9) * 0.02 * scale, pos.y + k * 0.32 * scale, pos.z);
        const s = (0.05 + k * 0.12) * scale; p.sp.scale.set(s, s, s);
        p.sp.material.opacity = Math.sin(k * Math.PI) * 0.55;
      }
    });
  }
  // Iraqi tea glass (استكان) on a saucer, with steam
  function teaGlass(x, y, z, parent = scene) {
    cyl(0.055, 0.055, 0.006, M(0xffffff, { roughness: 0.3 }), x, y + 0.003, z, parent);
    cyl(0.032, 0.022, 0.085, M(0xfff1d6, { transparent: true, opacity: 0.6, roughness: 0.05 }), x, y + 0.048, z, parent);
    cyl(0.028, 0.021, 0.06, M(0x9a3b12, { roughness: 0.2 }), x, y + 0.038, z, parent);
    steam(new THREE.Vector3(x, y + 0.1, z), parent);
  }

  function plant(x, y, z, s = 1, parent = scene) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); parent.add(g);
    cyl(0.22, 0.17, 0.45, mats.pot, 0, 0.225, 0, g);
    cyl(0.2, 0.2, 0.02, M(0x3a2a1a), 0, 0.44, 0, g);
    for (let i = 0; i < 14; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), i % 2 ? mats.leaf : mats.leaf2);
      leaf.scale.set(0.45, 1.6, 0.18);
      const a = i * 2.4, r = 0.08 + (i % 3) * 0.04;
      leaf.position.set(Math.cos(a) * r, 0.62 + (i % 4) * 0.12, Math.sin(a) * r);
      leaf.rotation.set(Math.sin(a) * 0.6, a, Math.cos(a) * 0.6);
      leaf.castShadow = true; g.add(leaf);
    }
    return g;
  }

  const desks = {};
  return { mats, box, cyl, plant, desk, desks, colliders, addCol, screens, anchors, floor, bounds,
    finish() { buildRooms(); buildCozy(); return this; },
    update(t, dt) { for (const f of animated) f(t, dt); } };

  function buildRooms() {
    // ---- whiteboard behind plan bot
    const wb = new THREE.Group(); wb.position.set(-1.6, 0, -4.4); scene.add(wb);
    box(2.2, 1.2, 0.04, mats.white, 0, 1.45, 0, wb);
    const wbFace = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.1), new THREE.MeshStandardMaterial({ map: whiteboardTexture(), roughness: 0.35 }));
    wbFace.position.set(0, 1.45, 0.025); wb.add(wbFace);
    box(2.24, 0.05, 0.08, mats.metal, 0, 0.84, 0.03, wb);
    [-1.0, 1.0].forEach(lx => { box(0.04, 1.6, 0.04, mats.metal, lx, 0.8, 0, wb); box(0.04, 0.04, 0.6, mats.metal, lx, 0.03, 0, wb); });
    addCol(-1.6, -4.4, 2.3, 0.7);
    anchors.whiteboard = new THREE.Vector3(-1.6, 1.4, -4.4);

    // (no separate rooms: the whole team shares one open-plan family room)
    // TV on back wall above a low cabinet (shared space)
    plant(5.0 + E, 0, -5.5, 1.1); addCol(5.0 + E, -5.5, 0.6, 0.6);
    // ---- tea corner (SE) - built inside a group shifted east by E
    const realScene = scene; const east = new THREE.Group(); east.position.x = E; realScene.add(east); scene = east; colDX = E;
    box(0.65, 0.9, 3.6, mats.cabinet, 5.1, 0.45, 3.0);
    box(0.7, 0.05, 3.7, mats.counter, 5.08, 0.92, 3.0);
    addCol(5.1, 3.0, 0.9, 3.8);
    // fridge
    box(0.75, 1.85, 0.7, M(0xd6dbe0, { roughness: 0.3, metalness: 0.4 }), 5.05, 0.925, 0.7);
    box(0.03, 0.5, 0.04, mats.metal, 4.66, 1.3, 0.95);
    addCol(5.05, 0.7, 0.9, 0.85);
    // kettle, cups, tea glasses (استكان)
    cyl(0.09, 0.11, 0.22, M(0xc0c4c8, { metalness: 0.8, roughness: 0.25 }), 5.05, 1.06, 2.0);
    steam(new THREE.Vector3(5.0, 1.22, 2.0), scene, 1.6);
    teaGlass(2.9, 0.77, 3.4); teaGlass(3.15, 0.77, 3.65);
    cyl(0.04, 0.04, 0.03, mats.black, 5.05, 1.185, 2.0);
    for (let i = 0; i < 4; i++) {
      cyl(0.03, 0.022, 0.08, M(0xfff1d6, { transparent: true, opacity: 0.75, roughness: 0.1 }), 4.9 + (i % 2) * 0.12, 0.99, 2.6 + Math.floor(i / 2) * 0.12);
      cyl(0.05, 0.05, 0.006, M(0xffffff), 4.9 + (i % 2) * 0.12, 0.948, 2.6 + Math.floor(i / 2) * 0.12);
    }
    cyl(0.12, 0.12, 0.2, M(0x8b5a2b), 5.05, 1.05, 3.8); // tea tin
    box(0.5, 0.3, 0.35, M(0x222222, { metalness: 0.3 }), 5.1, 1.1, 4.4); // coffee machine
    // round table + stools
    cyl(0.5, 0.5, 0.04, M(0xffffff, { roughness: 0.3 }), 3.0, 0.75, 3.5); cyl(0.05, 0.05, 0.74, mats.deskLeg, 3.0, 0.37, 3.5);
    cyl(0.25, 0.3, 0.02, mats.deskLeg, 3.0, 0.01, 3.5);
    addCol(3.0, 3.5, 1.1, 1.1);
    [[2.2, 3.5], [3.8, 3.5], [3.0, 4.4]].forEach(([sx, sz]) => { cyl(0.2, 0.2, 0.05, M(0xc9773b), sx, 0.62, sz); cyl(0.03, 0.03, 0.6, mats.metal, sx, 0.3, sz); });
    const ts = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshStandardMaterial({ map: signTexture('ركن الشاي', '#c9773b', '#fff') }));
    ts.position.set(5.48, 2.1, 3.0); ts.rotation.y = -Math.PI / 2; scene.add(ts);
    anchors.tea = new THREE.Vector3(4.1, 0, 3.0);

    scene = realScene; colDX = 0;
    // ---- lounge (SW): sofa + coffee table
    // sofa faces the fireplace
    const sofa = new THREE.Group(); sofa.position.set(-6.5, 0, -3.6); sofa.rotation.y = -Math.PI / 2; scene.add(sofa);
    box(2.4, 0.42, 0.9, mats.sofa, 0, 0.25, 0, sofa); box(2.4, 0.5, 0.2, mats.sofa, 0, 0.65, -0.38, sofa);
    box(0.2, 0.3, 0.9, mats.sofa, -1.2, 0.55, 0, sofa); box(0.2, 0.3, 0.9, mats.sofa, 1.2, 0.55, 0, sofa);
    [-0.6, 0.6].forEach(cx => box(1.1, 0.12, 0.75, M(0x7f93a1, { roughness: 1 }), cx, 0.52, 0.04, sofa));
    addCol(-6.5, -3.6, 1.1, 2.7);
    const throwM = M(0xffffff, { map: knitTexture(0xe9dcc4), roughness: 1 });
    box(0.9, 0.04, 0.7, throwM, 0.5, 0.6, 0.05, sofa).rotation.z = 0.08;
    box(0.04, 0.4, 0.7, throwM, 0.95, 0.42, 0.05, sofa);
    box(0.7, 0.04, 1.0, M(0x6b4a33, { roughness: 0.5 }), -7.75, 0.42, -3.6); [-0.4, 0.4].forEach(dz => box(0.6, 0.4, 0.04, mats.deskLeg, -7.75, 0.2, -3.6 + dz));
    addCol(-7.75, -3.6, 0.9, 1.2);
    teaGlass(-7.65, 0.44, -3.4); teaGlass(-7.85, 0.44, -3.8);
    // bookshelf on west wall
    box(0.4, 2.0, 2.0, M(0x8a6a4a), -9.75, 1.0, 0.6); addCol(-9.75, 0.6, 0.6, 2.1);
    for (let s = 0; s < 4; s++) for (let b = 0; b < 9; b++) {
      box(0.25, 0.28 + (b % 3) * 0.04, 0.12, M([0x8b2e2e, 0x2e5a8b, 0x3a7a46, 0xd6a33a, 0x5a3e7a][(b + s) % 5]), -9.62, 0.35 + s * 0.48, -0.1 + b * 0.16);
    }

    // ---- plants
    [[-9.4, -5.4], [-9.4, 4.9], [-6, 4.9], [1.6 + E, 4.9], [2.4 + E, -2.4]].forEach(([px, pz]) => { plant(px, 0, pz, 1.25); addCol(px, pz, 0.6, 0.6); });

    // ---- hanging lights over desks
    const lampShade = M(0xc8693f, { roughness: 0.5 });
    const glow = M(0xffffff, { emissive: 0xffc27a, emissiveIntensity: 2.5 });
    [...layout.lampXs.map(x => [x, layout.tableZ]), [3.0 + E, 3.5]].forEach(([lx, lz]) => {
      cyl(0.006, 0.006, 0.8, mats.black, lx, 2.6, lz);
      const sh = cyl(0.08, 0.32, 0.26, lampShade, lx, 2.15, lz); sh.castShadow = false;
      const bulb = cyl(0.3, 0.3, 0.01, glow, lx, 2.02, lz); bulb.castShadow = false;
    });
  }
  function buildCozy() {
    const fruitGeo = new THREE.SphereGeometry(0.035, 12, 10);
    // ---- the shared family table in the middle (everyone sits around it)
    const tblM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: woodFloor(), roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35 });
    tblM.map.repeat.set(1.2, 0.5); tblM.color.setHex(0xc79a6a);
    var tw = layout.tableEast - layout.tableWest, tcx = (layout.tableEast + layout.tableWest) / 2, tz = layout.tableZ;
    box(tw, 0.06, 2.05, tblM, tcx, 0.75, tz);
    box(tw + 0.1, 0.02, 2.15, M(0x7a4f2e, { roughness: 0.5 }), tcx, 0.715, tz);
    [[layout.tableWest + 0.2, -0.8], [layout.tableWest + 0.2, 0.9], [layout.tableEast - 0.2, -0.8], [layout.tableEast - 0.2, 0.9]].forEach(([lx, lz]) => cyl(0.06, 0.05, 0.72, M(0x5a3a24), lx, 0.36, lz));
    // runner + candles + fruit bowl in the middle of the table
    box(Math.max(1, tw - 1.4), 0.005, 0.45, M(0xffffff, { map: knitTexture(0xb5653f), roughness: 1 }), tcx - 0.2, 0.783, tz, scene, false);
    const candleXs = layout.lampXs.length > 1 ? layout.lampXs.map((x, i, a) => i < a.length - 1 ? (x + a[i + 1]) / 2 - 0.6 : null).filter(v => v !== null) : [tcx - 0.6];
    candleXs.forEach((cx, i) => {
      cyl(0.035, 0.035, 0.16, M(0xf3e9d8), cx, 0.865, tz);
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc46b }));
      fl.scale.set(1, 1.8, 1); fl.position.set(cx, 0.965, tz); scene.add(fl);
      const cl = new THREE.PointLight(0xffa64d, 1.2, 2.2, 2); cl.position.set(cx, 1.05, tz); scene.add(cl);
      animated.push(t => { const f = 0.85 + Math.sin(t * 13 + i) * 0.08 + Math.sin(t * 7.3 + i * 2) * 0.07; cl.intensity = 1.2 * f; fl.scale.y = 1.8 * f; });
    });
    const bx = tcx + 0.3;
    cyl(0.16, 0.12, 0.08, M(0xc8a165, { roughness: 1 }), bx, 0.82, tz);
    for (let i = 0; i < 5; i++) { const fr = new THREE.Mesh(fruitGeo, M([0xd9a441, 0xc8693f, 0x8fae5a][i % 3])); fr.position.set(bx + Math.cos(i * 1.3) * 0.07, 0.87, tz + Math.sin(i * 1.3) * 0.07); scene.add(fr); }
    const endChair = layout.seats.some(s => Math.abs(s.rot - Math.PI / 2) < 0.01) ? 0.75 : 0.25;
    colliders.push({ minX: layout.tableWest - 0.25, maxX: layout.tableEast + endChair, minZ: -1.65, maxZ: 1.75 });

    // ---- fireplace on the west wall
    const fx = -9.7, fz = -3.6;
    const stone = M(0xb9a48c, { roughness: 0.95 });
    box(0.7, 1.25, 2.1, stone, fx, 0.625, fz);
    box(0.5, 1.75, 1.5, M(0xd9c7b0, { roughness: 0.95 }), fx - 0.05, 2.125, fz); // chimney breast
    box(0.85, 0.09, 2.3, M(0x6b4226, { roughness: 0.5 }), fx + 0.05, 1.29, fz);   // mantel
    box(0.3, 0.75, 1.15, new THREE.MeshStandardMaterial({ color: 0x1a0f0a, roughness: 1 }), fx + 0.22, 0.5, fz); // firebox
    box(0.9, 0.06, 2.3, M(0x7d6a58), fx + 0.15, 0.03, fz); // hearth
    for (let i = 0; i < 3; i++) { const lg = cyl(0.06, 0.06, 0.7, M(0x5a3820, { roughness: 1 }), fx + 0.3, 0.2 + (i === 2 ? 0.1 : 0), fz + (i - 1) * 0.12); lg.rotation.x = Math.PI / 2; lg.rotation.z = (i - 1) * 0.3; }
    const embers = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.8), new THREE.MeshBasicMaterial({ color: 0xff5a1a })); embers.position.set(fx + 0.3, 0.14, fz); scene.add(embers);
    const flameMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const flames = [];
    for (let i = 0; i < 7; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.07 + (i % 3) * 0.02, 0.35, 10), flameMat(i % 2 ? 0xff8a2a : 0xffc04a));
      f.position.set(fx + 0.32, 0.36, fz - 0.33 + i * 0.11); scene.add(f); flames.push(f);
    }
    const fireLight = new THREE.PointLight(0xff8c3a, 10, 9, 1.6); fireLight.position.set(fx + 0.9, 0.7, fz); scene.add(fireLight);
    animated.push((t) => {
      flames.forEach((f, i) => { const k = 0.7 + 0.35 * Math.abs(Math.sin(t * (6 + i) + i * 1.7)); f.scale.set(1, k, 1); f.position.y = 0.22 + 0.175 * k; });
      fireLight.intensity = 9 + Math.sin(t * 11) * 1.2 + Math.sin(t * 17.3) * 0.8;
    });
    addCol(fx, fz, 1.2, 2.3);
    // mantel decor: candles, photo frame, garland lights
    [-0.7, 0.75].forEach(dz => cyl(0.04, 0.04, 0.18, M(0xf3e9d8), fx + 0.1, 1.43, fz + dz));
    box(0.04, 0.32, 0.42, M(0x6b4226), fx - 0.05, 1.5, fz + 0.1);
    box(0.02, 0.26, 0.36, M(0xd9a441, { emissive: 0x3a2a10 }), fx - 0.02, 1.5, fz + 0.1);
    stringLights(new THREE.Vector3(fx + 0.48, 1.34, fz - 1.1), new THREE.Vector3(fx + 0.48, 1.34, fz + 1.1), 0.12, 14);
    anchors.fireplace = new THREE.Vector3(fx + 0.6, 0.6, fz);

    // armchair + floor lamp (reading nook, SW)
    const ac = new THREE.Group(); ac.position.set(-8.7, 0, 3.6); ac.rotation.y = Math.PI * 0.75; scene.add(ac);
    box(0.85, 0.42, 0.8, mats.sofa, 0, 0.25, 0, ac); box(0.85, 0.55, 0.18, mats.sofa, 0, 0.7, -0.33, ac);
    box(0.16, 0.3, 0.8, mats.sofa, -0.42, 0.55, 0, ac); box(0.16, 0.3, 0.8, mats.sofa, 0.42, 0.55, 0, ac);
    box(0.6, 0.04, 0.7, M(0xffffff, { map: knitTexture(0x4f8a8b), roughness: 1 }), 0.05, 0.49, 0.05, ac);
    addCol(-8.7, 3.6, 1.1, 1.1);
    cyl(0.015, 0.015, 1.5, M(0x3a2a20), -9.4, 0.75, 4.5); cyl(0.18, 0.18, 0.02, M(0x3a2a20), -9.4, 0.01, 4.5);
    cyl(0.12, 0.22, 0.28, M(0xf3e1c0, { emissive: 0xffb866, emissiveIntensity: 0.9 }), -9.4, 1.55, 4.5);
    const fl2 = new THREE.PointLight(0xffb866, 4, 5, 2); fl2.position.set(-9.3, 1.4, 4.4); scene.add(fl2);

    // ---- warm string lights along the back wall, west wall and over the table
    stringLights(new THREE.Vector3(-9.8, 2.75, -5.85), new THREE.Vector3(5.4 + E, 2.75, -5.85), 0.35, 60 + Math.round(E * 4));
    stringLights(new THREE.Vector3(-9.85, 2.75, -5.8), new THREE.Vector3(-9.85, 2.75, 5.3), 0.35, 44);
    stringLights(new THREE.Vector3(layout.tableWest, 2.6, -1.0), new THREE.Vector3(layout.tableEast, 2.6, 1.1), 0.45, Math.round(tw * 5.6));
    stringLights(new THREE.Vector3(layout.tableWest, 2.6, 1.1), new THREE.Vector3(layout.tableEast, 2.6, -1.0), 0.45, Math.round(tw * 5.6));

    // ---- winter outside: snowy ground, pines, falling snow
    const snowM = M(0xaebfd8, { roughness: 0.9 }); // moonlit snow
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), snowM); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);
    const pine = (x, z, s) => {
      cyl(0.08 * s, 0.1 * s, 0.5 * s, M(0x4a3426), x, 0.25 * s, z);
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry((0.9 - k * 0.22) * s, 1.1 * s, 14), M(0x2f4a3c, { roughness: 0.9 }));
        c.position.set(x, (0.9 + k * 0.6) * s, z); c.castShadow = true; scene.add(c);
        const cap = new THREE.Mesh(new THREE.ConeGeometry((0.62 - k * 0.16) * s, 0.45 * s, 14), snowM);
        cap.position.set(x, (1.25 + k * 0.6) * s, z); scene.add(cap);
      }
    };
    [[-8, 9, 1.4], [-3, 11, 1.8], [2, 8.5, 1.2], [6, 10.5, 1.6], [9.5, 7, 1.5], [10, 0, 1.9], [9, -5, 1.4], [-13, 8, 1.6], [0, 15, 2.2], [11, 13, 2]].forEach(([x, z, s]) => pine(x > 4 ? x + E : x, z, s));
    // snow drifts against the glass
    for (let i = 0; i < 9; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), snowM); d.scale.set(1.4, 0.25, 0.5); d.position.set(-9.5 + i * 1.9, 0, 6.6); scene.add(d); }
    for (let i = 0; i < 6; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), snowM); d.scale.set(0.5, 0.25, 1.4); d.position.set(6.1 + E, 0, -5.5 + i * 2.4); scene.add(d); }
    const N = 2500, pos = new Float32Array(N * 3), spd = new Float32Array(N);
    const rand = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < N; i++) {
      const east = i % 3 === 0;
      pos[i * 3] = east ? rand(6 + E, 16 + E) : rand(-16, 16 + E); pos[i * 3 + 1] = rand(0, 9); pos[i * 3 + 2] = east ? rand(-9, 6) : rand(6, 18);
      spd[i] = rand(0.35, 0.8);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const snow = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.07, map: softDotTexture(), transparent: true, depthWrite: false, color: 0xffffff }));
    scene.add(snow);
    animated.push((t, dt) => {
      for (let i = 0; i < N; i++) {
        pos[i * 3 + 1] -= spd[i] * dt; pos[i * 3] += Math.sin(t + i) * 0.15 * dt;
        if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 9;
      }
      sg.attributes.position.needsUpdate = true;
    });
  }

  // catenary of warm bulbs between two points
  function stringLights(a, b, sag, n) {
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.028, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), n);
    const m4 = new THREE.Matrix4(), c = new THREE.Color(), pts = [];
    const cols = [0xffc46b, 0xffd99a, 0xffb04d];
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1), p = a.clone().lerp(b, k); p.y -= Math.sin(k * Math.PI) * sag + Math.abs(Math.sin(k * Math.PI * 4)) * sag * 0.25;
      pts.push(p.clone()); m4.makeTranslation(p.x, p.y, p.z); bulbs.setMatrixAt(i, m4); bulbs.setColorAt(i, c.set(cols[i % 3]));
    }
    scene.add(bulbs);
    const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x3a2a20 })); scene.add(wire);
    const base = cols.map(x => new THREE.Color(x));
    animated.push(t => {
      for (let i = 0; i < n; i++) { const tw = 0.75 + 0.25 * Math.sin(t * 2 + i * 1.7); bulbs.setColorAt(i, c.copy(base[i % 3]).multiplyScalar(tw)); }
      bulbs.instanceColor.needsUpdate = true;
    });
  }
}
