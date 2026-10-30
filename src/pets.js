import * as THREE from 'three';

// Family pets: a cat by the fireplace, a dog next to the shared table,
// two budgies in a cage and a fish tank. All procedural.
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
function add(parent, geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }

export function buildPets(scene, colliders, E = 0) {
  const updates = [];
  const col = (cx, cz, w, d) => colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });

  // ---------- cat curled on the round rug in front of the fireplace
  {
    const fur = M(0xd98a3d), light = M(0xf3d9b0);
    const cat = new THREE.Group(); cat.position.set(-8.25, 0, -2.9); cat.rotation.y = 0.6; scene.add(cat);
    const body = add(cat, new THREE.SphereGeometry(0.2, 24, 16), fur, 0, 0.12, 0); body.scale.set(1.25, 0.6, 0.9);
    const head = new THREE.Group(); head.position.set(0.2, 0.14, 0.08); cat.add(head);
    add(head, new THREE.SphereGeometry(0.09, 20, 14), fur).scale.set(1, 0.85, 0.95);
    add(head, new THREE.SphereGeometry(0.045, 12, 10), light, 0.06, -0.02, 0).scale.set(0.8, 0.7, 1.1);
    [-1, 1].forEach(s => { const e = add(head, new THREE.ConeGeometry(0.035, 0.07, 4), fur, 0, 0.08, s * 0.045); e.rotation.x = s * 0.3; });
    [-1, 1].forEach(s => { const ey = add(head, new THREE.BoxGeometry(0.004, 0.006, 0.025), M(0x2a1a10), 0.085, 0.01, s * 0.032); });
    const tailCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.22, 0.08, 0), new THREE.Vector3(-0.2, 0.05, 0.2), new THREE.Vector3(0.05, 0.04, 0.24), new THREE.Vector3(0.18, 0.05, 0.18)]);
    const tail = add(cat, new THREE.TubeGeometry(tailCurve, 20, 0.03, 8), fur);
    // stripes
    for (let i = 0; i < 4; i++) { const st = add(cat, new THREE.TorusGeometry(0.16, 0.012, 6, 20, Math.PI), M(0xa35f22), -0.12 + i * 0.08, 0.12, 0); st.rotation.y = Math.PI / 2; st.scale.set(1, 0.65, 0.9); }
    updates.push(t => { body.scale.y = 0.6 + Math.sin(t * 2.2) * 0.02; head.rotation.z = Math.sin(t * 0.4) * 0.08; tail.rotation.y = Math.sin(t * 0.8) * 0.06; });
  }

  // ---------- dog on a bed beside the shared table
  {
    const bed = new THREE.Group(); bed.position.set(0.7, 0, 2.8); bed.rotation.y = -0.5; scene.add(bed);
    add(bed, new THREE.CylinderGeometry(0.55, 0.58, 0.12, 32), M(0x8a5a3c, { roughness: 1 }), 0, 0.06, 0);
    const rim = add(bed, new THREE.TorusGeometry(0.52, 0.09, 12, 32), M(0xb5653f, { roughness: 1 }), 0, 0.13, 0); rim.rotation.x = Math.PI / 2;
    const fur = M(0xd8a65c), dark = M(0x2a1a10);
    const dog = new THREE.Group(); dog.position.set(0, 0.14, 0); bed.add(dog);
    const body = add(dog, new THREE.CapsuleGeometry(0.16, 0.42, 8, 16), fur, 0, 0.13, 0); body.rotation.z = Math.PI / 2;
    const head = new THREE.Group(); head.position.set(0.38, 0.2, 0.0); dog.add(head);
    add(head, new THREE.SphereGeometry(0.13, 20, 16), fur).scale.set(1.05, 0.95, 0.95);
    add(head, new THREE.CapsuleGeometry(0.06, 0.1, 6, 12), fur, 0.13, -0.04, 0).rotation.z = Math.PI / 2;
    add(head, new THREE.SphereGeometry(0.03, 12, 10), dark, 0.22, -0.03, 0);
    [-1, 1].forEach(s => { add(head, new THREE.SphereGeometry(0.018, 10, 8), dark, 0.1, 0.04, s * 0.06); const ear = add(head, new THREE.SphereGeometry(0.06, 12, 10), M(0xb7843f), -0.02, -0.02, s * 0.12); ear.scale.set(0.6, 1.4, 0.35); });
    [[0.25, 0.09], [0.25, -0.09]].forEach(([x, z]) => { const leg = add(dog, new THREE.CapsuleGeometry(0.045, 0.2, 6, 10), fur, x + 0.12, 0.04, z); leg.rotation.z = Math.PI / 2; });
    [[-0.22, 0.12], [-0.22, -0.12]].forEach(([x, z]) => add(dog, new THREE.SphereGeometry(0.09, 14, 10), fur, x, 0.06, z).scale.set(1.3, 0.7, 0.8));
    const tail = new THREE.Group(); tail.position.set(-0.36, 0.15, 0); dog.add(tail);
    const tm = add(tail, new THREE.CapsuleGeometry(0.03, 0.22, 6, 10), fur, -0.1, 0.05, 0); tm.rotation.z = 1.1;
    updates.push(t => { tail.rotation.y = Math.sin(t * 9) * 0.5; head.rotation.y = Math.sin(t * 0.5) * 0.35; head.rotation.z = 0.1 + Math.sin(t * 0.3) * 0.05; body.scale.x = 1 + Math.sin(t * 2.5) * 0.02; });
    col(0.7, 2.8, 1.2, 1.2);
  }

  // ---------- budgies in a cage on a stand (near the back windows)
  {
    const g = new THREE.Group(); g.position.set(4.6 + E, 0, -5.2); scene.add(g);
    const brass = M(0xc9a24a, { metalness: 0.7, roughness: 0.3 });
    add(g, new THREE.CylinderGeometry(0.02, 0.02, 1.2, 10), brass, 0, 0.6, 0);
    add(g, new THREE.CylinderGeometry(0.25, 0.25, 0.03, 20), brass, 0, 0.015, 0);
    add(g, new THREE.CylinderGeometry(0.3, 0.3, 0.04, 28), brass, 0, 1.22, 0);
    for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; add(g, new THREE.CylinderGeometry(0.004, 0.004, 0.55, 4), brass, Math.cos(a) * 0.29, 1.5, Math.sin(a) * 0.29).castShadow = false; }
    const dome = add(g, new THREE.SphereGeometry(0.3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.7, roughness: 0.3, wireframe: true }), 0, 1.77, 0);
    add(g, new THREE.CylinderGeometry(0.006, 0.006, 0.5, 6), M(0x6b4a33), 0, 1.45, 0).rotation.z = Math.PI / 2;
    const birds = [];
    [[0x7cc04a, -0.1], [0xf2d23c, 0.1]].forEach(([c, x], i) => {
      const b = new THREE.Group(); b.position.set(x, 1.5, 0); g.add(b);
      add(b, new THREE.SphereGeometry(0.045, 14, 10), M(c)).scale.set(0.9, 1.2, 0.9);
      add(b, new THREE.SphereGeometry(0.032, 12, 10), M(i ? 0xf6e7a0 : 0xe8f0a0), 0, 0.06, 0.01);
      add(b, new THREE.ConeGeometry(0.01, 0.02, 6), M(0xe0a050), 0, 0.055, 0.04).rotation.x = Math.PI / 2;
      add(b, new THREE.BoxGeometry(0.02, 0.07, 0.01), M(i ? 0x6aa0d8 : 0x3a6a2a), 0, -0.05, -0.03).rotation.x = 0.5;
      birds.push(b);
    });
    updates.push(t => birds.forEach((b, i) => { const hop = Math.max(0, Math.sin(t * 3 + i * 2)) ** 8; b.position.y = 1.5 + hop * 0.05; b.rotation.y = Math.sin(t * 0.7 + i) * 0.8; }));
    col(4.6 + E, -5.2, 0.7, 0.7);
  }

  // ---------- fish tank on a wooden cabinet
  {
    const g = new THREE.Group(); g.position.set(5.05 + E, 0, -2.6); g.rotation.y = -Math.PI / 2; scene.add(g);
    add(g, new THREE.BoxGeometry(1.6, 0.75, 0.5), M(0x7a5a44, { roughness: 0.6 }), 0, 0.375, 0);
    const water = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 0.42), new THREE.MeshStandardMaterial({ color: 0x5fb3c8, transparent: true, opacity: 0.45, emissive: 0x1f6a7a, emissiveIntensity: 0.5, roughness: 0.1, depthWrite: false }));
    water.position.set(0, 1.07, 0); g.add(water);
    add(g, new THREE.BoxGeometry(1.52, 0.03, 0.44), M(0x222222), 0, 1.385, 0);
    add(g, new THREE.BoxGeometry(1.48, 0.05, 0.4), M(0xe8d6b0), 0, 0.79, 0); // sand
    for (let i = 0; i < 6; i++) { const w = add(g, new THREE.ConeGeometry(0.03, 0.3 + (i % 3) * 0.1, 6), M(0x3f8a4a), -0.6 + i * 0.24, 0.95, -0.1 + (i % 2) * 0.12); w.castShadow = false; }
    const tl = new THREE.PointLight(0x7fd0e0, 1.2, 2.5, 2); tl.position.set(0, 1.3, 0.4); g.add(tl);
    const fish = [];
    [0xff7a2a, 0xffc04a, 0xff5a5a, 0x5ab0ff, 0xffffff].forEach((c, i) => {
      const f = new THREE.Group(); g.add(f);
      add(f, new THREE.SphereGeometry(0.035, 12, 8), M(c, { emissive: c, emissiveIntensity: 0.2 })).scale.set(1.6, 1, 0.6);
      add(f, new THREE.ConeGeometry(0.025, 0.04, 4), M(c), -0.065, 0, 0).rotation.z = Math.PI / 2;
      fish.push({ f, sp: 0.4 + i * 0.12, ph: i * 1.3, y: 0.92 + (i % 3) * 0.14 });
    });
    updates.push(t => fish.forEach(o => {
      const a = t * o.sp + o.ph; o.f.position.set(Math.sin(a) * 0.6, o.y + Math.sin(a * 2) * 0.03, Math.cos(a * 1.3) * 0.12);
      o.f.rotation.y = Math.cos(a) > 0 ? 0 : Math.PI;
    }));
    col(5.05 + E, -2.6, 0.7, 1.7);
  }

  return (t, dt) => updates.forEach(f => f(t, dt));
}
