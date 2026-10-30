// Shared mapping between the painted 2D world (1024² units) and the 3D house (metres).
// Every 2D floor rect is stretched onto its room's 3D interior, doors are derived from the
// 2D door waypoints, so the overview and the first-person view run on ONE simulation.
import { ROOMS, DOORS } from './sceneConfig.js';

export const H3 = {
  wallH: 2.75, doorW: 1.15, doorH: 2.15, wallT: 0.2, eye: 1.55,
  inset: { def: 0.55, hall: 0.55, hallway: 0.6 },
  // interior faces of each room (x0, z0, x1, z1); 0.2 m gaps are the walls
  rooms: {
    r1: [0, 0, 6.4, 5.2], r2: [6.6, 0, 13.4, 5.2], r3: [13.6, 0, 20, 5.2],
    kitchen: [0, 5.4, 4.6, 13.4], hall: [4.8, 5.4, 15.2, 13.4], meeting: [15.4, 5.4, 20, 13.4],
    r4: [0, 13.6, 6.4, 19], hallway: [6.6, 13.6, 13.4, 19], r5: [13.6, 13.6, 20, 19],
  },
  size: [20, 19],
};

const inRect = (x, y, r) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// per room: 2D floor rect -> 3D interior rect (inset from the walls so furniture can line them)
export const REGIONS = ROOMS.map(r => {
  const R = H3.rooms[r.id], m = H3.inset[r.id] ?? H3.inset.def, f = r.floor[0];
  const t = [R[0] + m, R[1] + m, R[2] - m, R[3] - m];
  return { id: r.id, f, R, t, sx: (t[2] - t[0]) / (f[2] - f[0]), sz: (t[3] - t[1]) / (f[3] - f[1]) };
});
const regById = new Map(REGIONS.map(g => [g.id, g]));

function affine(g, x, y) { return { x: g.t[0] + (clamp(x, g.f[0], g.f[2]) - g.f[0]) * g.sx, z: g.t[1] + (clamp(y, g.f[1], g.f[3]) - g.f[1]) * g.sz }; }
function affineInv(g, x, z) { return { x: g.f[0] + (clamp(x, g.t[0], g.t[2]) - g.t[0]) / g.sx, y: g.f[1] + (clamp(z, g.t[1], g.t[3]) - g.t[1]) / g.sz }; }

// doors in 3D: crossing point of the mapped pa->pb line with the wall between the two rooms
export const DOORS3 = DOORS.map((d, i) => {
  const ga = regById.get(d.a), gb = regById.get(d.b), A = affine(ga, ...d.pa), B = affine(gb, ...d.pb);
  const Ra = ga.R, Rb = gb.R, vertical = Ra[2] <= Rb[0] + 1e-6 || Rb[2] <= Ra[0] + 1e-6; // wall is vertical (x = const)
  let cx, cz, lo, hi;
  if (vertical) {
    const wx = Ra[2] <= Rb[0] ? (Ra[2] + Rb[0]) / 2 : (Rb[2] + Ra[0]) / 2, t = (wx - A.x) / (B.x - A.x);
    lo = Math.max(Ra[1], Rb[1]) + 0.3 + H3.doorW / 2; hi = Math.min(Ra[3], Rb[3]) - 0.3 - H3.doorW / 2;
    cx = wx; cz = clamp(A.z + (B.z - A.z) * t, lo, hi);
  } else {
    const wz = Ra[3] <= Rb[1] ? (Ra[3] + Rb[1]) / 2 : (Rb[3] + Ra[1]) / 2, t = (wz - A.z) / (B.z - A.z);
    lo = Math.max(Ra[0], Rb[0]) + 0.3 + H3.doorW / 2; hi = Math.min(Ra[2], Rb[2]) - 0.3 - H3.doorW / 2;
    cz = wz; cx = clamp(A.x + (B.x - A.x) * t, lo, hi);
  }
  // waypoints right in front of the opening on each side (used for both mapping directions)
  const off = 0.75, sgn = vertical ? Math.sign(B.x - A.x) : Math.sign(B.z - A.z);
  const PA = vertical ? { x: cx - sgn * off, z: cz } : { x: cx, z: cz - sgn * off };
  const PB = vertical ? { x: cx + sgn * off, z: cz } : { x: cx, z: cz + sgn * off };
  return { i, a: d.a, b: d.b, d, vertical, cx, cz, A, B, PA, PB };
});

// 2D -> 3D
export function to3(x, y) {
  for (const g of REGIONS) if (inRect(x, y, g.f)) return affine(g, x, y);
  for (const D of DOORS3) if (inRect(x, y, D.d.rect)) {
    // inside a doorway: walk A -> PA -> PB -> B along the pa->pb parameter
    const [ax, ay] = D.d.pa, [bx, by] = D.d.pb, vx = bx - ax, vy = by - ay, t = clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy), 0, 1);
    const pts = [D.A, D.PA, D.PB, D.B], seg = Math.min(2, Math.floor(t * 3)), u = t * 3 - seg;
    return { x: pts[seg].x + (pts[seg + 1].x - pts[seg].x) * u, z: pts[seg].z + (pts[seg + 1].z - pts[seg].z) * u };
  }
  let best = null, bd = 1e9;
  for (const g of REGIONS) { const cx = clamp(x, g.f[0], g.f[2]), cy = clamp(y, g.f[1], g.f[3]), d = Math.hypot(cx - x, cy - y); if (d < bd) { bd = d; best = g; } }
  return affine(best, x, y);
}

export function room3At(x, z) { for (const g of REGIONS) if (x >= g.R[0] && x <= g.R[2] && z >= g.R[1] && z <= g.R[3]) return g.id; return null; }

// 3D -> 2D (the player's position for the overview + cat behaviour)
export function to2(x, z) {
  for (const D of DOORS3) {
    const along = D.vertical ? z - D.cz : x - D.cx, across = D.vertical ? x - D.cx : z - D.cz;
    if (Math.abs(along) < H3.doorW / 2 + 0.05 && Math.abs(across) < 0.75) {
      const sgn = D.vertical ? Math.sign(D.PB.x - D.PA.x) : Math.sign(D.PB.z - D.PA.z), t = clamp((across * sgn + 0.75) / 1.5, 0, 1);
      const [ax, ay] = D.d.pa, [bx, by] = D.d.pb, tt = 1 / 3 + t / 3;
      return { x: ax + (bx - ax) * tt, y: ay + (by - ay) * tt };
    }
  }
  const id = room3At(x, z); const g = id ? regById.get(id) : REGIONS.reduce((b, g) => { const d = Math.hypot(clamp(x, g.R[0], g.R[2]) - x, clamp(z, g.R[1], g.R[3]) - z); return !b || d < b.d ? { g, d } : b; }, null).g;
  return affineInv(g, x, z);
}

// a 2D direction at a 2D point, expressed in 3D (and back)
export function dir3(x, y, dx, dy) { const a = to3(x, y), b = to3(x + dx * 4, y + dy * 4); const l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { x: (b.x - a.x) / l, z: (b.z - a.z) / l }; }
