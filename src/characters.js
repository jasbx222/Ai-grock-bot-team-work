import * as THREE from 'three';

// Procedural, stylized-but-human character. Built facing +z, seated pose.
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...o });

function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

export function buildCharacter(agent) {
  const L = agent.look;
  const skin = std(L.skin, { roughness: 0.55 });
  const hairM = std(L.hair, { roughness: 0.85 });
  const shirt = std(L.shirt, { roughness: 0.85 });
  const pants = std(L.pants, { roughness: 0.85 });
  const shoes = std(L.shoes, { roughness: 0.5 });
  const root = new THREE.Group(); root.name = agent.id;
  const pickables = [];
  const reg = m => { m.userData.agentId = agent.id; pickables.push(m); return m; };

  const hips = new THREE.Group(); hips.position.y = 0.52; root.add(hips);
  const spine = new THREE.Group(); hips.add(spine);

  // torso
  const torso = reg(mesh(new THREE.CapsuleGeometry(0.15, 0.3, 8, 20), shirt, spine, 0, 0.3, 0));
  const torsoBreath = torso;
  torso.scale.set(L.female ? 1.12 : 1.25, 1, 0.72);
  // collar / shirt detail
  const collar = mesh(new THREE.TorusGeometry(0.065, 0.018, 8, 20), shirt, spine, 0, 0.53, 0.0); collar.rotation.x = Math.PI / 2;
  reg(mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 16), skin, spine, 0, 0.58, 0));

  // head
  const head = new THREE.Group(); head.position.set(0, 0.74, 0.01); spine.add(head);
  const skull = reg(mesh(new THREE.SphereGeometry(0.11, 32, 24), skin, head));
  skull.scale.set(0.9, 1.08, 0.98);
  const jaw = mesh(new THREE.SphereGeometry(0.085, 24, 16), skin, head, 0, -0.05, 0.015); jaw.scale.set(L.female ? 0.92 : 1.02, 0.85, 0.95);
  // ears
  [-1, 1].forEach(s => { const e = mesh(new THREE.SphereGeometry(0.022, 12, 10), skin, head, s * 0.098, -0.005, 0); e.scale.set(0.5, 1, 0.8); });
  // nose
  const nose = mesh(new THREE.ConeGeometry(0.016, 0.045, 12), skin, head, 0, -0.012, 0.105); nose.rotation.x = Math.PI / 2 - 0.35;
  // eyes
  const white = std(0xffffff, { roughness: 0.2 }), iris = std(0x2b1a10, { roughness: 0.2 });
  const eyes = [];
  [-1, 1].forEach(s => {
    const ey = new THREE.Group(); ey.position.set(s * 0.038, 0.015, 0.09); head.add(ey);
    const w = mesh(new THREE.SphereGeometry(0.016, 16, 12), white, ey); w.scale.set(1.1, 0.8, 0.6);
    mesh(new THREE.SphereGeometry(0.009, 12, 10), iris, ey, 0, 0, 0.008);
    eyes.push(ey);
    const brow = mesh(new THREE.BoxGeometry(0.036, 0.007, 0.01), L.hairStyle === 'hijab' ? std(0x2a1a12) : hairM, head, s * 0.038, 0.045, 0.097);
    brow.rotation.z = s * -0.12;
  });
  // mouth
  const mouth = mesh(new THREE.TorusGeometry(0.018, 0.0045, 6, 16, Math.PI), std(0x8a3b3b), head, 0, -0.06, 0.092);
  mouth.rotation.z = Math.PI;
  if (L.female) { [-1, 1].forEach(s => mesh(new THREE.SphereGeometry(0.014, 10, 8), std(0xe8a5a0, { transparent: true, opacity: 0.35 }), head, s * 0.06, -0.035, 0.078)); }

  // hair
  const hair = new THREE.Group(); head.add(hair);
  const cap = (r, thetaLen, sy = 1.08) => { const m = mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, thetaLen), hairM, hair); m.scale.set(0.93, sy, 1.0); return m; };
  switch (L.hairStyle) {
    case 'short': {
      const c = cap(0.117, Math.PI * 0.42); c.position.set(0, 0.008, -0.006); c.rotation.x = -0.25;
      const back = mesh(new THREE.SphereGeometry(0.112, 24, 16, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.2, Math.PI * 0.45), hairM, hair, 0, 0, -0.004);
      back.rotation.y = Math.PI; back.scale.set(0.93, 1.08, 1);
      break;
    }
    case 'curly': {
      const c = cap(0.115, Math.PI * 0.45); c.position.y = 0.01; c.rotation.x = -0.2;
      for (let i = 0; i < 46; i++) {
        const a = i * 2.39996, t = 0.15 + (i / 46) * 0.42 * Math.PI;
        const r = 0.118;
        const p = new THREE.Vector3(Math.sin(t) * Math.cos(a) * r * 0.93, Math.cos(t) * r * 1.08 + 0.012, Math.sin(t) * Math.sin(a) * r);
        if (p.z > 0.06 && p.y < 0.07) continue;
        mesh(new THREE.SphereGeometry(0.026, 10, 8), hairM, hair, p.x, p.y, p.z - 0.006);
      }
      break;
    }
    case 'bob': {
      const c = cap(0.122, Math.PI * 0.62, 1.1); c.position.set(0, 0.0, -0.01);
      c.rotation.x = -0.45;
      const fringe = mesh(new THREE.SphereGeometry(0.12, 24, 12, -0.9, 1.8, 0.3, 0.55), hairM, hair, 0, 0.0, 0.0); fringe.rotation.y = 0;
      fringe.scale.set(0.93, 1.06, 1.02);
      [-1, 1].forEach(s => { const side = mesh(new THREE.BoxGeometry(0.03, 0.14, 0.11), hairM, hair, s * 0.1, -0.04, -0.02); side.rotation.z = s * 0.06; });
      break;
    }
    case 'long': {
      const c = cap(0.122, Math.PI * 0.55, 1.1); c.rotation.x = -0.35; c.position.z = -0.005;
      const fringe = mesh(new THREE.SphereGeometry(0.121, 24, 12, -1.1, 2.2, 0.25, 0.5), hairM, hair); fringe.scale.set(0.93, 1.06, 1.02);
      const back = mesh(new THREE.CapsuleGeometry(0.1, 0.26, 6, 16), hairM, hair, 0, -0.14, -0.06); back.scale.set(1.15, 1, 0.55);
      [-1, 1].forEach(s => { const lock = mesh(new THREE.CapsuleGeometry(0.03, 0.2, 6, 10), hairM, hair, s * 0.095, -0.1, 0.0); lock.rotation.z = s * 0.08; });
      break;
    }
    case 'hijab': {
      const fabric = hairM;
      // covers the head leaving an oval opening for the face (opening points to +z)
      const h = mesh(new THREE.SphereGeometry(0.13, 32, 24, Math.PI * 0.5 + 0.62, Math.PI * 2 - 1.24, 0, Math.PI * 0.8), fabric, hair, 0, 0.0, -0.008);
      h.scale.set(0.95, 1.1, 1.0); h.material.side = THREE.DoubleSide;
      const top = mesh(new THREE.SphereGeometry(0.131, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.2), fabric, hair, 0, 0.0, -0.008); top.scale.set(0.95, 1.1, 1);
      const drape = mesh(new THREE.ConeGeometry(0.2, 0.26, 28, 1, true), fabric, hair, 0, -0.17, -0.01); drape.material.side = THREE.DoubleSide;
      break;
    }
  }
  if (L.beard) {
    const bm = std(L.hair, { roughness: 0.95 });
    const beard = mesh(new THREE.SphereGeometry(0.09, 24, 16, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.4), bm, head, 0, -0.03, 0.012);
    beard.scale.set(1.03, 1.05, 1.08);
    const mus = mesh(new THREE.CapsuleGeometry(0.008, 0.04, 4, 8), bm, head, 0, -0.045, 0.1); mus.rotation.z = Math.PI / 2;
  }
  if (L.glasses) {
    const fr = std(0x1a1a1a, { roughness: 0.3, metalness: 0.5 });
    [-1, 1].forEach(s => { const r = mesh(new THREE.TorusGeometry(0.022, 0.003, 8, 24), fr, head, s * 0.038, 0.014, 0.106); });
    const br = mesh(new THREE.BoxGeometry(0.03, 0.003, 0.003), fr, head, 0, 0.018, 0.108);
    [-1, 1].forEach(s => mesh(new THREE.BoxGeometry(0.003, 0.003, 0.1), fr, head, s * 0.06, 0.016, 0.06));
  }
  if (agent.props.includes('headset')) {
    const hs = std(0x202226, { roughness: 0.4 });
    const band = mesh(new THREE.TorusGeometry(0.135, 0.008, 8, 32, Math.PI), hs, head, 0, 0.0, -0.005);
    [-1, 1].forEach(s => mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 20), hs, head, s * 0.128, -0.005, 0).rotation.z = Math.PI / 2);
    const mic = mesh(new THREE.CapsuleGeometry(0.004, 0.09, 4, 6), hs, head, 0.1, -0.05, 0.06); mic.rotation.set(0.2, -0.9, 1.3);
  }

  // arms: shoulder -> upper arm -> elbow -> forearm -> hand
  function arm(side) {
    const sh = new THREE.Group(); sh.position.set(side * (L.female ? 0.17 : 0.19), 0.47, 0); spine.add(sh);
    reg(mesh(new THREE.SphereGeometry(0.058, 16, 12), shirt, sh));
    const upper = reg(mesh(new THREE.CapsuleGeometry(0.048, 0.2, 6, 14), shirt, sh, 0, -0.13, 0));
    const elbow = new THREE.Group(); elbow.position.set(0, -0.26, 0); sh.add(elbow);
    reg(mesh(new THREE.CapsuleGeometry(0.04, 0.18, 6, 14), L.female || L.hairStyle === 'hijab' ? shirt : skin, elbow, 0, -0.11, 0));
    const hand = new THREE.Group(); hand.position.set(0, -0.24, 0); elbow.add(hand);
    const palm = reg(mesh(new THREE.SphereGeometry(0.038, 14, 10), skin, hand)); palm.scale.set(0.8, 1.15, 0.5);
    mesh(new THREE.CapsuleGeometry(0.012, 0.03, 4, 6), skin, hand, side * -0.03, 0.0, 0.012).rotation.z = side * 0.6;
    return { sh, elbow, hand, upper };
  }
  const armL = arm(-1), armR = arm(1);

  // legs (seated: thighs forward)
  const legs = [];
  [-1, 1].forEach(s => {
    const hip = new THREE.Group(); hip.position.set(s * 0.09, 0.02, 0); hips.add(hip);
    hip.rotation.x = -Math.PI / 2 + 0.05;
    reg(mesh(new THREE.CapsuleGeometry(0.07, 0.3, 6, 14), pants, hip, 0, -0.2, 0));
    const knee = new THREE.Group(); knee.position.set(0, -0.42, 0); hip.add(knee);
    knee.rotation.x = Math.PI / 2 - 0.15;
    reg(mesh(new THREE.CapsuleGeometry(0.055, 0.3, 6, 14), pants, knee, 0, -0.2, 0));
    const shoe = mesh(new THREE.BoxGeometry(0.1, 0.07, 0.24), shoes, knee, 0, -0.43, 0.06);
    shoe.rotation.x = -0.1; shoe.geometry.translate(0, 0, 0.0);
    legs.push({ hip, knee });
  });
  // seat the model on the chair: put hips at chair cushion, a little back
  root.position.y = 0;

  // ----- cup used in the "waiting / tea" animation
  const cup = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.028, 0.02, 0.07, 14), std(0xfff1d6, { transparent: true, opacity: 0.85, roughness: 0.1 }), cup, 0, 0, 0);
  mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.004, 14), std(0x8a3b14), cup, 0, 0.025, 0);
  cup.position.set(0, -0.06, 0.03); cup.visible = false; armR.hand.add(cup);

  const state = { status: 'waiting', t: Math.random() * 10 };
  const base = {
    shL: new THREE.Euler(), shR: new THREE.Euler(),
  };

  function pose(status, dt) {
    state.t += dt;
    const t = state.t;
    // breathing + head idle
    // warm social glances toward family members (limited so the neck stays natural)
    let glance = 0;
    if (state.glances) {
      const period = status === 'working' ? 11 : 6, ph = t % period, win = status === 'working' ? 1.8 : 3.2;
      if (ph < win) {
        const target = state.glances[Math.floor(t / period) % state.glances.length];
        glance = THREE.MathUtils.clamp(target, -1.1, 1.1) * Math.sin((ph / win) * Math.PI);
      }
    }
    state.glance = glance;
    head.rotation.y = Math.sin(t * 0.35) * 0.12 + glance;
    head.rotation.x = 0;
    spine.position.y = Math.sin(t * 1.6) * 0.004;
    torsoBreath.scale.z = 0.72 + Math.sin(t * 1.6) * 0.012;
    const prevHead = head.rotation.clone();
    // blink
    const blink = (t % 4) < 0.12 ? 0.15 : 1;
    eyes.forEach(e => (e.scale.y = blink));
    cup.visible = false;
    const lerp = (obj, key, v, k = 5) => { obj.rotation[key] += (v - obj.rotation[key]) * (1 - Math.exp(-dt * k)); };
    lerp(spine, 'y', 0, 3);

    if (status === 'working') {
      // hands on keyboard, fingers tapping
      lerp(armL.sh, 'x', -0.55); lerp(armR.sh, 'x', -0.55);
      lerp(armL.sh, 'z', 0.12); lerp(armR.sh, 'z', -0.12);
      lerp(armL.elbow, 'x', -1.05 + Math.sin(t * 18) * 0.06, 30);
      lerp(armR.elbow, 'x', -1.05 + Math.sin(t * 18 + 1.7) * 0.06, 30);
      lerp(armL.elbow, 'z', -0.25); lerp(armR.elbow, 'z', 0.25);
      lerp(spine, 'x', 0.12);
      head.rotation.x = 0.12 * (1 - Math.abs(state.glance)); head.rotation.y = Math.sin(t * 0.8) * 0.08 + state.glance;
    } else if (status === 'waiting') {
      // sipping tea: right hand comes up every few seconds
      const cycle = (t % 7) / 7; const sip = cycle > 0.55 && cycle < 0.85 ? Math.sin((cycle - 0.55) / 0.3 * Math.PI) : 0;
      lerp(armL.sh, 'x', -0.35); lerp(armL.elbow, 'x', -1.1); lerp(armL.sh, 'z', 0.15); lerp(armL.elbow, 'z', 0);
      lerp(armR.sh, 'x', -0.45 - sip * 0.55, 6); lerp(armR.sh, 'z', -0.1);
      lerp(armR.elbow, 'x', -1.2 - sip * 0.9, 6); lerp(armR.elbow, 'z', 0.35 + sip * 0.4, 6);
      cup.visible = true;
      lerp(spine, 'x', -0.05);
      head.rotation.x = -sip * 0.25;
      lerp(spine, 'y', state.glance * 0.25, 3);
    } else if (status === 'problem') {
      // hand on head, worried look
      lerp(armR.sh, 'x', -2.4); lerp(armR.sh, 'z', -0.35); lerp(armR.elbow, 'x', -1.9 + Math.sin(t * 6) * 0.15, 12); lerp(armR.elbow, 'z', 0.6);
      lerp(armL.sh, 'x', -0.55); lerp(armL.elbow, 'x', -1.05); lerp(armL.sh, 'z', 0.12); lerp(armL.elbow, 'z', -0.25);
      lerp(spine, 'x', 0.1);
      head.rotation.x = 0.15; head.rotation.z = Math.sin(t * 1.3) * 0.08;
    } else if (status === 'done') {
      // relaxed: hands behind head
      lerp(armL.sh, 'x', -2.6); lerp(armR.sh, 'x', -2.6);
      lerp(armL.sh, 'z', 0.7); lerp(armR.sh, 'z', -0.7);
      lerp(armL.elbow, 'x', -2.1); lerp(armR.elbow, 'x', -2.1);
      lerp(armL.elbow, 'z', 0); lerp(armR.elbow, 'z', 0);
      lerp(spine, 'x', -0.12);
      head.rotation.x = -0.12;
    } else { // offline
      lerp(armL.sh, 'x', -0.2); lerp(armR.sh, 'x', -0.2); lerp(armL.elbow, 'x', -0.6); lerp(armR.elbow, 'x', -0.6);
      lerp(spine, 'x', 0.3); head.rotation.x = 0.4;
    }
    if (status !== 'problem') head.rotation.z *= 0.9;
    // ease the head toward its new pose so status changes blend smoothly
    const kh = 1 - Math.exp(-dt * 6);
    head.rotation.set(prevHead.x + (head.rotation.x - prevHead.x) * kh, prevHead.y + (head.rotation.y - prevHead.y) * kh, prevHead.z + (head.rotation.z - prevHead.z) * kh);
  }

  return { root, head, pickables, pose, state };
}
