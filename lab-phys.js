/* Shooter Lab physics: motors, flywheels, materials, ball contacts, flight and the HIVE CELL. SI units. */
(function () {
'use strict';
const BBZ = window.BBZ = window.BBZ || {};
const IN = 0.0254, G = 9.81, RHO = 1.2, KGCM = 0.0980665;

/* ---------- data ---------- */

/* Motor data at 12 V from the makers' spec pages. `free` is rated no-load rpm, `stall` is N·m. */
const MOTORS = [
  { id: 'gb6000', name: 'goBILDA 5203 · 6000 rpm (1:1)', free: 6000, stall: 1.47 * KGCM },
  { id: 'gb1620', name: 'goBILDA 5203 · 1620 rpm (3.7:1)', free: 1620, stall: 5.4 * KGCM },
  { id: 'gb1150', name: 'goBILDA 5203 · 1150 rpm (5.2:1)', free: 1150, stall: 7.9 * KGCM },
  { id: 'gb435', name: 'goBILDA 5203 · 435 rpm (13.7:1)', free: 435, stall: 18.7 * KGCM },
  { id: 'gb312', name: 'goBILDA 5203 · 312 rpm (19.2:1)', free: 312, stall: 24.3 * KGCM },
  { id: 'revhd', name: 'REV HD Hex Motor · bare (6000 rpm)', free: 6000, stall: 0.105 },
  { id: 'revup3', name: 'REV UltraPlanetary 3:1 (HD Hex)', free: 2000, stall: 0.31 },
  { id: 'revcore', name: 'REV Core Hex Motor (125 rpm)', free: 125, stall: 3.2 },
  { id: 'custom', name: 'Custom motor', free: 6000, stall: 0.144 }
];

/* Surfaces a ball can touch. mu and e are against the polyethylene game piece; k is the surface's own stiffness (N/m). */
const SURFACES = {
  pla: { name: 'PLA (3D printed)', mu: 0.30, e: 0.55, k: 2e5, crr: 0.004 },
  petg: { name: 'PETG (3D printed)', mu: 0.32, e: 0.55, k: 2e5, crr: 0.004 },
  abs: { name: 'ABS (3D printed)', mu: 0.30, e: 0.55, k: 2e5, crr: 0.004 },
  nylon: { name: 'Nylon / PA12', mu: 0.25, e: 0.55, k: 2e5, crr: 0.004 },
  pc: { name: 'Polycarbonate sheet', mu: 0.30, e: 0.58, k: 2e5, crr: 0.004 },
  alu: { name: 'Aluminium', mu: 0.30, e: 0.60, k: 5e5, crr: 0.003 },
  hdpe: { name: 'HDPE / UHMW', mu: 0.20, e: 0.55, k: 2e5, crr: 0.004 },
  tpu: { name: 'TPU 95A (printed)', mu: 0.65, e: 0.45, k: 6e4, crr: 0.015 },
  grip: { name: 'Grip tape / neoprene on plastic', mu: 0.85, e: 0.35, k: 2e4, crr: 0.03 },
  silicone: { name: 'Silicone sheet', mu: 1.00, e: 0.40, k: 1.5e4, crr: 0.03 }
};
const FIELD_MAT = {
  tile: { name: 'Foam field tile', mu: 0.70, e: 0.30, k: 5e3, crr: 0.05 },
  /* the HIVE skins are thin plastic sheets on ribs; a flexing sheet soaks up more of a hit than a solid panel (estimate, measurable with a drop test) */
  hive: { name: 'HIVE skin', mu: 0.30, e: 0.40, k: 1e5, crr: 0.006 },
  wall: { name: 'Field wall', mu: 0.30, e: 0.50, k: 2e5, crr: 0.004 }
};

/* Flywheels used on FTC robots. Masses are typical; edit them to match yours. shore is the durometer (Shore A, or 0 for rigid). */
const WHEELS = [
  { id: 'tpe96', name: '96 mm grip wheel · TPE 60A', d: 96, w: 38, mass: 75, shape: 0.55, shore: 60, mu: 0.90, e: 0.50, k: 4e4, crr: 0.02 },
  { id: 'compliant90', name: '90 mm compliant wheel · soft TPE spokes', d: 90, w: 30, mass: 50, shape: 0.60, shore: 30, mu: 0.95, e: 0.45, k: 3.5e3, crr: 0.04, compliant: true },
  { id: 'flywheel100', name: '100 mm flywheel · 60A', d: 100, w: 25, mass: 110, shape: 0.55, shore: 60, mu: 0.90, e: 0.50, k: 4e4, crr: 0.02 },
  { id: 'stealth4', name: '4 in polyurethane wheel · 35A', d: 101.6, w: 19, mass: 90, shape: 0.55, shore: 35, mu: 1.00, e: 0.40, k: 1.5e4, crr: 0.03 },
  { id: 'silicone72', name: '72 mm silicone wheel · 40A', d: 72, w: 30, mass: 60, shape: 0.50, shore: 40, mu: 1.05, e: 0.40, k: 1.2e4, crr: 0.03 },
  { id: 'tpu96', name: '96 mm printed TPU wheel · 95A', d: 96, w: 30, mass: 60, shape: 0.50, shore: 95, mu: 0.65, e: 0.50, k: 6e4, crr: 0.015 },
  { id: 'pla96', name: '96 mm printed PLA wheel · hard', d: 96, w: 30, mass: 70, shape: 0.50, shore: 0, mu: 0.30, e: 0.60, k: 2e5, crr: 0.004 },
  { id: 'roller48', name: '48 mm transfer roller · TPE', d: 48, w: 40, mass: 30, shape: 0.50, shore: 60, mu: 0.90, e: 0.50, k: 4e4, crr: 0.02 }
];
const DISC_J = 8.4e-5;          // 82 mm steel inertia disc, 152 g, 840 g·cm²
const ROTOR_J = 5e-6;           // motor rotor, estimate

/* The two game pieces. NECTAR's mass and both stiffnesses are estimates; calibrate them with real balls. */
const BALLS = {
  P: { name: 'POLLEN', d: 2.8 * IN, m: 0.025, k: 1500, color: [0.97, 0.78, 0.08] },
  R: { name: 'NECTAR (red)', d: 3.6 * IN, m: 0.041, k: 1170, color: [0.82, 0.18, 0.15] },
  B: { name: 'NECTAR (blue)', d: 3.6 * IN, m: 0.041, k: 1170, color: [0.18, 0.38, 0.85] }
};

/* HIVE numbers from the 2026-27 Competition Manual (section 9.6), Field Acceptance Checklist and Team Update 10.
   The manual gives no tilt angle for the upward CELL, so the lab lets teams set it. */
const HIVE = {
  openW: 20 * IN, openH: 14 * IN, depth: 12 * IN,
  lip: 53.5 * IN,            // bottom of the upward CELL opening above the tiles
  bottom: 30.6 * IN,         // bottom of the HIVE above the tiles
  pivot: 43.95 * IN,         // HIVE pivot axis above the tiles
  gapCells: 18.8 * IN,       // distance between the two CELLS
  frameW: 49.46 * IN         // width of the frame that holds the pivots
};

/* ---------- small vector helpers ---------- */
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.sqrt(dot(a, a));
const norm = (a) => { const l = len(a); return l > 1e-12 ? mul(a, 1 / l) : [0, 0, 0]; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* Shore A hardness to Young's modulus in Pa (Gent's formula). */
function shoreToE(s) {
  if (!s) return 3e9;
  s = clamp(s, 10, 95);
  return 1e6 * 0.0981 * (56 + 7.62336 * s) / (0.137505 * (254 - 2.54 * s));
}

/* How much a spinning elastomer tyre grows in radius: Δr = ρ ω² r³ (3 + ν) / (8 E), on the outer half of the wheel. */
function wheelGrowth(spec, omega) {
  if (!spec.shore) return 0;
  const r = spec.d / 2000, E = shoreToE(spec.shore) * (spec.compliant ? 0.25 : 1);
  return Math.min(0.15 * r, 0.5 * 1150 * omega * omega * r * r * r * 3.5 / (8 * E));
}

/* Motor torque at the motor shaft: τ = τstall (u V/12 − ω/ωfree). */
function motorTorque(m, u, V, wm) {
  return m.stall * (u * V / 12 - wm / m.wFree);
}

/* ---------- geometry ---------- */

/* Closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5). */
function closestOnTri(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, mul(ab, d1 / (d1 - d3)));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, mul(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, mul(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
  const sum = va + vb + vc;
  if (!(Math.abs(sum) > 1e-30)) return a;
  const den = 1 / sum;
  return add(a, add(mul(ab, vb * den), mul(ac, vc * den)));
}

/* A triangle soup with a uniform grid so a ball only tests nearby triangles. `tris` is a Float32Array of 9 numbers per triangle. */
function makeMesh(tris, mat, cell) {
  cell = cell || 0.02;
  const n = tris.length / 9, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], tris[i + k]); hi[k] = Math.max(hi[k], tris[i + k]); }
  const dims = [0, 1, 2].map((k) => Math.max(1, Math.ceil((hi[k] - lo[k]) / cell) + 1));
  const grid = new Map();
  for (let t = 0; t < n; t++) {
    const o = t * 9, a = [], b = [];
    /* triangles with no area cannot be touched and would break the closest-point maths, so they stay out of the grid */
    const e1 = [tris[o + 3] - tris[o], tris[o + 4] - tris[o + 1], tris[o + 5] - tris[o + 2]], e2 = [tris[o + 6] - tris[o], tris[o + 7] - tris[o + 1], tris[o + 8] - tris[o + 2]];
    if (len(cross(e1, e2)) < 1e-12) continue;
    for (let k = 0; k < 3; k++) {
      const v = [tris[o + k], tris[o + 3 + k], tris[o + 6 + k]];
      a[k] = Math.floor((Math.min(v[0], v[1], v[2]) - lo[k]) / cell);
      b[k] = Math.floor((Math.max(v[0], v[1], v[2]) - lo[k]) / cell);
    }
    for (let x = a[0]; x <= b[0]; x++) for (let y = a[1]; y <= b[1]; y++) for (let z = a[2]; z <= b[2]; z++) {
      const key = (x * dims[1] + y) * dims[2] + z;
      let list = grid.get(key); if (!list) grid.set(key, list = []);
      list.push(t);
    }
  }
  /* each triangle's plane, so far-off triangles are skipped with one dot product */
  const planes = new Float32Array(n * 4);
  for (let t = 0; t < n; t++) {
    const o = t * 9, a = [tris[o], tris[o + 1], tris[o + 2]];
    const nn = norm(cross([tris[o + 3] - a[0], tris[o + 4] - a[1], tris[o + 5] - a[2]], [tris[o + 6] - a[0], tris[o + 7] - a[1], tris[o + 8] - a[2]]));
    planes[t * 4] = nn[0]; planes[t * 4 + 1] = nn[1]; planes[t * 4 + 2] = nn[2]; planes[t * 4 + 3] = dot(nn, a);
  }
  return { tris, n, mat, lo, hi, cell, dims, grid, planes, stamp: new Uint32Array(n), mark: 0 };
}

/* Triangles whose grid cells overlap a sphere. */
function nearTris(mesh, p, r, out) {
  out.length = 0;
  const { lo, hi, cell, dims, grid } = mesh;
  if (p[0] + r < lo[0] || p[1] + r < lo[1] || p[2] + r < lo[2] || p[0] - r > hi[0] || p[1] - r > hi[1] || p[2] - r > hi[2]) return out;
  mesh.mark++;
  const a = [0, 1, 2].map((k) => clamp(Math.floor((p[k] - r - lo[k]) / cell), 0, dims[k] - 1));
  const b = [0, 1, 2].map((k) => clamp(Math.floor((p[k] + r - lo[k]) / cell), 0, dims[k] - 1));
  for (let x = a[0]; x <= b[0]; x++) for (let y = a[1]; y <= b[1]; y++) for (let z = a[2]; z <= b[2]; z++) {
    const list = grid.get((x * dims[1] + y) * dims[2] + z);
    if (!list) continue;
    for (const t of list) if (mesh.stamp[t] !== mesh.mark) { mesh.stamp[t] = mesh.mark; out.push(t); }
  }
  return out;
}

/* Ray from o along unit d against every triangle; nearest hit distance or Infinity (Möller–Trumbore). */
function rayMesh(tris, o, d, maxT) {
  let best = maxT;
  for (let i = 0; i < tris.length; i += 9) {
    const a = [tris[i], tris[i + 1], tris[i + 2]];
    const e1 = [tris[i + 3] - a[0], tris[i + 4] - a[1], tris[i + 5] - a[2]];
    const e2 = [tris[i + 6] - a[0], tris[i + 7] - a[1], tris[i + 8] - a[2]];
    const pv = cross(d, e2), det = dot(e1, pv);
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det, tv = sub(o, a), u = dot(tv, pv) * inv;
    if (u < 0 || u > 1) continue;
    const qv = cross(tv, e1), v = dot(d, qv) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = dot(e2, qv) * inv;
    if (t > 1e-6 && t < best) best = t;
  }
  return best;
}

/* Box made of 12 triangles, pushed onto `out`. */
function boxTris(out, x0, y0, z0, x1, y1, z1) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [3, 0, 4], [3, 4, 7]];
  for (const t of f) for (const i of t) out.push(v[i][0], v[i][1], v[i][2]);
}

/* The upward CELL as a frame: O is the middle of the opening's low edge (the edge nearest the robot),
   u runs up the opening away from the robot, n is the opening's outward normal (tilted toward the robot by `tilt`). */
function cellFrame(dist, tilt) {
  const b = tilt * Math.PI / 180;
  return { O: [dist, 0, HIVE.lip], u: [Math.cos(b), 0, Math.sin(b)], n: [-Math.sin(b), 0, Math.cos(b)], tilt };
}

/* A flat four-cornered panel as two triangles. */
function panel(out, a, b, c, d) { out.push(...a, ...b, ...c, ...a, ...c, ...d); }

/* The HIVE in world space: the upward CELL (open on top), its partner CELL pointing down on the far side,
   the beam they hang from and the frame posts that hold the pivot. */
function hiveTris(dist, tilt) {
  const H = HIVE, f = cellFrame(dist, tilt), cell = [], frame = [];
  const W = (s, y, d) => add(add(f.O, mul(f.u, s)), add([0, y, 0], mul(f.n, -d)));
  const S = H.openH, Y = H.openW / 2, D = H.depth;
  panel(cell, W(0, -Y, D), W(S, -Y, D), W(S, Y, D), W(0, Y, D));          // bottom
  panel(cell, W(0, -Y, 0), W(0, -Y, D), W(0, Y, D), W(0, Y, 0));          // near wall
  panel(cell, W(S, -Y, 0), W(S, Y, 0), W(S, Y, D), W(S, -Y, D));          // far wall
  panel(cell, W(0, -Y, 0), W(S, -Y, 0), W(S, -Y, D), W(0, -Y, D));        // right wall
  panel(cell, W(0, Y, 0), W(0, Y, D), W(S, Y, D), W(S, Y, 0));            // left wall
  /* the pivot sits between the two CELLS; the lower CELL is the upper one turned through the pivot */
  const c1 = W(S / 2, 0, D / 2), pivot = [c1[0] + H.gapCells / 2 * Math.cos(tilt * Math.PI / 180), 0, H.pivot];
  const c2 = [2 * pivot[0] - c1[0], 0, 2 * pivot[2] - c1[2]];
  boxTris(frame, c2[0] - S / 2, -Y, c2[2] - D / 2, c2[0] + S / 2, Y, c2[2] + D / 2);
  boxTris(frame, Math.min(c1[0], c2[0]), -0.03, Math.min(c1[2], c2[2]) - 0.03, Math.max(c1[0], c2[0]), 0.03, Math.min(c1[2], c2[2]));
  const py = H.frameW / 2;
  for (const y of [-py, py]) boxTris(frame, pivot[0] - 0.025, y - 0.025, 0, pivot[0] + 0.025, y + 0.025, H.pivot + 0.03);
  boxTris(frame, pivot[0] - 0.015, -py, H.pivot - 0.015, pivot[0] + 0.015, py, H.pivot + 0.015);
  return { cell: new Float32Array(cell), frame: new Float32Array(frame), cf: f, pivot, c2 };
}

/* Is a point inside the upward CELL? */
function inCell(p, cf) {
  const r = sub(p, cf.O), s = dot(r, cf.u), d = -dot(r, cf.n);
  return s > 0 && s < HIVE.openH && Math.abs(p[1]) < HIVE.openW / 2 && d > 0 && d < HIVE.depth;
}

/* ---------- example shooters (built in shooter space: wheel centre at the origin, axle along y, shots go +x) ---------- */

/* A curved hood of `thick` metres wrapped `wrap` degrees round a wheel, ending so the ball leaves at `launch` degrees,
   with side guides and a short entry chute. */
function hoodTris(o) {
  const out = [], hw = o.width / 2, flare = 25 * Math.PI / 180;
  const a1 = (90 + o.launch) * Math.PI / 180, a0 = a1 + o.wrap * Math.PI / 180, steps = Math.max(10, Math.round(o.wrap / 4));
  /* the hood opens a little at the entry so the ball is squeezed gradually instead of all at once */
  const rIn = (a) => o.rw + o.gap + o.squeeze * clamp(1 - (a0 - a) / flare, 0, 1);
  const P = (r, a, y) => [r * Math.cos(a), y, r * Math.sin(a)];
  const quad = (p, q, r, s) => { out.push(...p, ...q, ...r, ...p, ...r, ...s); };
  for (let i = 0; i < steps; i++) {
    const u = a0 + (a1 - a0) * i / steps, v = a0 + (a1 - a0) * (i + 1) / steps;
    quad(P(rIn(u), u, -hw), P(rIn(v), v, -hw), P(rIn(v), v, hw), P(rIn(u), u, hw));
    quad(P(rIn(u) + o.thick, u, -hw), P(rIn(u) + o.thick, u, hw), P(rIn(v) + o.thick, v, hw), P(rIn(v) + o.thick, v, -hw));
    for (const y of [-o.guide, o.guide]) quad(P(o.rw * 0.55, u, y), P(rIn(u) + o.thick, u, y), P(rIn(v) + o.thick, v, y), P(o.rw * 0.55, v, y));
  }
  quad(P(rIn(a1), a1, -hw), P(rIn(a1), a1, hw), P(rIn(a1) + o.thick, a1, hw), P(rIn(a1) + o.thick, a1, -hw));
  /* entry chute: a straight floor that continues the hood surface backwards along the tangent, with side guides */
  const t = [Math.sin(a0), 0, -Math.cos(a0)], back = mul(t, -1), nrm = [Math.cos(a0), 0, Math.sin(a0)];
  const h0 = P(rIn(a0), a0, 0), L = o.chute;
  const f0 = add(h0, mul(back, 0.0005)), f1 = add(h0, mul(back, L));
  if (L > 0) {
    quad(add(f0, [0, -hw, 0]), add(f1, [0, -hw, 0]), add(f1, [0, hw, 0]), add(f0, [0, hw, 0]));
    const up = mul(nrm, -(2 * o.ballR + 0.01));
    for (const y of [-o.guide, o.guide]) quad(add(f0, [0, y, 0]), add(f1, [0, y, 0]), add(add(f1, up), [0, y, 0]), add(add(f0, up), [0, y, 0]));
  }
  /* where a fed ball starts: on the chute, one ball-length before the hood, resting on the chute floor */
  const start = add(add(h0, mul(back, Math.max(o.ballR * 1.2, L - o.ballR * 1.2))), mul(nrm, -(o.ballR + 0.002)));
  return { tris: new Float32Array(out), entryDir: t, feedPoint: start };
}

/* ---------- the official field ---------- */

/* Convex hull of 2D points (monotone chain), counter-clockwise. */
function hull2(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

/* Is a point inside a CELL: between its side ribs, and inside the outline its skins make in the y–z plane? */
function inHull(p, cell) {
  if (p[0] < cell.x0 || p[0] > cell.x1) return false;
  const h = cell.hull;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    if ((b[0] - a[0]) * (p[2] - a[1]) - (b[1] - a[1]) * (p[1] - a[0]) < 0) return false;
  }
  return true;
}

/* Reads biobuzz-field.bin, made from the official field CAD: every part with its colour, the meshes balls can hit,
   and the four CELLS found from the HIVE skins. Stored in millimetres, returned in metres. */
function parseField(buf) {
  const dv = new DataView(buf), n = dv.getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n)));
  const pad = (x) => (4 - (x % 4)) % 4;
  let o = 4 + n + pad(n);
  const nv = head.parts.reduce((a, p) => Math.max(a, p.vo + p.v), 0);
  const pos = new Int16Array(buf.slice(o, o + nv * 6)); o += nv * 6 + pad(nv * 6);
  const ni = head.parts.reduce((a, p) => Math.max(a, p.io + p.t * 3), 0);
  const idx = head.wide ? new Uint32Array(buf.slice(o, o + ni * 4)) : new Uint16Array(buf.slice(o, o + ni * 2));
  const parts = head.parts.map((p) => {
    const tris = new Float32Array(p.t * 9);
    for (let t = 0; t < p.t * 3; t++) {
      const v = p.vo + idx[p.io + t];
      tris[t * 3] = pos[v * 3] / 1000; tris[t * 3 + 1] = pos[v * 3 + 1] / 1000; tris[t * 3 + 2] = pos[v * 3 + 2] / 1000;
    }
    return { name: p.name, cat: p.cat, col: p.col, color: p.color, tris };
  });
  const join = (list) => { const out = new Float32Array(list.reduce((a, p) => a + p.tris.length, 0)); let k = 0; for (const p of list) { out.set(p.tris, k); k += p.tris.length; } return out; };
  const hiveParts = parts.filter((p) => p.col && p.cat === 'hive'), wallParts = parts.filter((p) => p.col && p.cat !== 'hive');
  /* CELLS: the top, back and bottom skins of each basket, grouped by which HIVE (x) and which end (y) they belong to */
  const groups = {};
  for (const p of parts) {
    if (!/Skin/.test(p.name) || !/Hive Goal/.test(p.name)) continue;
    let sx = 0, sy = 0; for (let i = 0; i < p.tris.length; i += 3) { sx += p.tris[i]; sy += p.tris[i + 1]; }
    const key = (sx > 0 ? 'blue' : 'red') + (sy > 0 ? '+' : '-');
    (groups[key] = groups[key] || []).push(p);
  }
  const cells = Object.keys(groups).map((key) => {
    const pts = [], xs = [];
    let zs = 0, nz = 0;
    for (const p of groups[key]) for (let i = 0; i < p.tris.length; i += 3) { pts.push([p.tris[i + 1], p.tris[i + 2]]); xs.push(p.tris[i]); zs += p.tris[i + 2]; nz++; }
    const h = hull2(pts);
    const cy = h.reduce((a, q) => a + q[0], 0) / h.length, cz = h.reduce((a, q) => a + q[1], 0) / h.length;
    return { key, color: key.slice(0, -1), x0: Math.min(...xs), x1: Math.max(...xs), hull: h, center: [(Math.min(...xs) + Math.max(...xs)) / 2, cy, cz], zMean: zs / nz };
  });
  for (const c of cells) { const twin = cells.find((d) => d !== c && d.color === c.color); c.up = !twin || c.zMean > twin.zMean; }
  return {
    parts, cells, half: (head.field && head.field.half || 1793) / 1000, wallTop: (head.field && head.field.wallTop || 296) / 1000,
    hive: makeMesh(join(hiveParts), FIELD_MAT.hive, 0.04), wall: makeMesh(join(wallParts), FIELD_MAT.wall, 0.05)
  };
}

/* ---------- the simulation ---------- */

function Sim() {
  this.t = 0; this.balls = []; this.wheels = []; this.meshes = []; this.shots = []; this.trace = [];
  this.env = { air: true, Cd: 0.5, CLscale: 1, spinTau: 4, dist: 2.0 };
  this.nextId = 1; this.hive = null; this.tmp = []; this.cal = {}; this.dtNow = 2e-5;
}

/* Build or rebuild the HIVE for a distance (flywheel axle to the CELL's near rim) and a CELL tilt in degrees. */
Sim.prototype.setHive = function (dist, tilt) {
  this.env.dist = dist; this.env.tilt = tilt == null ? 20 : tilt;
  const h = hiveTris(dist, this.env.tilt);
  this.hive = { cell: makeMesh(h.cell, FIELD_MAT.hive, 0.05), frame: makeMesh(h.frame, FIELD_MAT.hive, 0.05), raw: h };
};

/* Uses the official field: its HIVE and walls for bounces, and one CELL as the target.
   `aim` is { o: where shots start, h: unit horizontal direction to the CELL, d: distance along h to the CELL's middle }. */
Sim.prototype.setField = function (field, target, aim) {
  this.field = field; this.target = target; this.aim = aim; this.hive = null;
  /* the CELL's lip height, and how far along the aim line its opening starts and ends */
  if (target && aim) {
    aim.lip = Math.min(...target.hull.map((q) => q[1]));
    const along = [];
    for (const q of target.hull) for (const x of [target.x0, target.x1]) along.push(dot(sub([x, q[0], q[1]], aim.o), aim.h));
    aim.near = Math.min(...along); aim.far = Math.max(...along);
  }
};

Sim.prototype.inTarget = function (p) {
  if (this.target) return inHull(p, this.target);
  return this.hive ? inCell(p, this.hive.raw.cf) : false;
};

/* A wheel: { c (world centre), a (axle unit vector), spec, motor, G (motor turns per wheel turn), V, tested, target (rpm), dir (±1), discs, count } */
Sim.prototype.addWheel = function (o) {
  const s = o.spec, r = s.d / 2000, n = o.count || 1;
  const m = Object.assign({}, o.motor);
  m.wFree = m.free * (o.tested ? 0.9 : 1) * Math.PI / 30;
  const J = n * s.shape * (s.mass / 1000) * r * r + (o.discs || 0) * DISC_J + ROTOR_J * (o.G || 1) * (o.G || 1);
  const w = { c: o.c, a: norm(o.a || [0, 1, 0]), spec: s, r, hw: (o.width || s.w) / 2000, J, motor: m, G: o.G || 1, V: o.V || 12.5,
    target: o.target * Math.PI / 30, dir: o.dir || 1, omega: o.spinUp === false ? o.target * Math.PI / 30 * (o.dir || 1) : 0, angle: 0, u: 0, growth: 0,
    eta: Math.abs((o.G || 1) - 1) < 1e-6 ? 1 : 0.92, role: o.role || 'main', mat: { mu: s.mu, e: s.e, k: s.k, crr: s.crr } };
  this.wheels.push(w);
  return w;
};

Sim.prototype.addMesh = function (tris, mat, tag) { const m = makeMesh(tris, mat); m.tag = tag || 'shooter'; this.meshes.push(m); return m; };

Sim.prototype.addBall = function (type, p, v, w, cal) {
  const spec = BALLS[type], R = spec.d / 2, m = cal && cal.mass ? cal.mass : spec.m;
  const b = { id: this.nextId++, type, R, m, I: 2 / 3 * m * R * R, k: cal && cal.k ? cal.k : spec.k, p: p.slice(), v: v.slice(), w: (w || [0, 0, 0]).slice(),
    st: 'live', born: this.t, touched: false, lastShooter: -1, exit: null, entered: false, frameHit: false, still: 0, maxX: p[0], path: [p.slice()], rpmAtFeed: 0, rpmMin: Infinity };
  const main = this.wheels[0];
  if (main) b.rpmAtFeed = Math.abs(main.omega) * 30 / Math.PI;
  this.balls.push(b);
  return b;
};

/* Spring–damper normal force plus Coulomb friction and rolling resistance at one contact.
   n points from the surface to the ball centre; vs is the surface velocity at the contact. */
Sim.prototype.contact = function (b, q, n, depth, vs, mat, F, T) {
  const kEff = 1 / (1 / b.k + 1 / mat.k);
  const lnE = Math.log(clamp(mat.e * (this.cal.eScale || 1), 0.05, 0.98));
  const zeta = -lnE / Math.sqrt(Math.PI * Math.PI + lnE * lnE);
  const c = 2 * zeta * Math.sqrt(kEff * b.m);
  const r = mul(n, -b.R);                                     // from the ball centre to the contact
  const vc = sub(add(b.v, cross(b.w, r)), vs);                 // ball surface velocity relative to the other surface
  const vn = dot(vc, n);
  const N = Math.max(0, kEff * depth - c * vn);
  if (N <= 0) return 0;
  const vt = sub(vc, mul(n, vn)), s = len(vt);
  const mu = mat.mu * (mat.wheel ? this.cal.muWheel || 1 : this.cal.muScale || 1);
  /* Coulomb friction, smoothed over a small slip speed so the step stays stable at high squeeze forces */
  const ve = Math.max(0.02, 2 * mu * N * this.dtNow * 2.5 / b.m);
  const ft = s > 1e-9 ? mul(vt, -mu * N / Math.max(s, ve)) : [0, 0, 0];
  const f = add(mul(n, N), ft);
  F[0] += f[0]; F[1] += f[1]; F[2] += f[2];
  const tq = cross(r, ft);
  /* rolling resistance: rubber hysteresis resists the ball rolling over the surface */
  const ws = mat.wSurf || [0, 0, 0];
  const wr = sub(b.w, ws), wrt = sub(wr, mul(n, dot(wr, n))), wl = len(wrt);
  const rr = [0, 0, 0];
  if (wl > 1e-6) { const m = -mat.crr * N * b.R * Math.min(1, wl / 2) / wl; rr[0] = wrt[0] * m; rr[1] = wrt[1] * m; rr[2] = wrt[2] * m; }
  T[0] += tq[0] + rr[0]; T[1] += tq[1] + rr[1]; T[2] += tq[2] + rr[2];
  this.lastF = f; this.lastRR = rr;
  return N;
};

/* Is a ball close to anything it could touch within the next big step? */
Sim.prototype.near = function (b, pad) {
  const r = b.R + pad;
  if (b.p[2] < r) return true;
  for (const w of this.wheels) if (len(sub(b.p, w.c)) < w.r + w.hw + r + 0.01) return true;
  for (const m of this.meshes) if (nearTris(m, b.p, r, this.tmp).length) return true;
  if (this.hive) for (const m of [this.hive.cell, this.hive.frame]) if (nearTris(m, b.p, r, this.tmp).length) return true;
  if (this.field) for (const m of [this.field.hive, this.field.wall]) if (nearTris(m, b.p, r, this.tmp).length) return true;
  for (const o of this.balls) if (o !== b && o.st !== 'gone' && len(sub(o.p, b.p)) < o.R + r) return true;
  return false;
};

Sim.prototype.airForce = function (b, v, F) {
  if (!this.env.air) return;
  const s = len(v); if (s < 1e-6) return;
  const A = Math.PI * b.R * b.R, q = 0.5 * RHO * A * s;
  F[0] -= q * this.env.Cd * v[0]; F[1] -= q * this.env.Cd * v[1]; F[2] -= q * this.env.Cd * v[2];
  const wl = len(b.w);
  if (wl > 1e-3) {
    const S = b.R * wl / s, CL = this.env.CLscale * (S < 0.1 ? 1.5 * S : 1 / (2.022 + 0.981 / S));
    const dir = norm(cross(b.w, v)), L = q * s * CL;
    F[0] += dir[0] * L; F[1] += dir[1] * L; F[2] += dir[2] * L;
  }
};

/* All forces and torques on every live ball, plus the reaction torque on every wheel. */
Sim.prototype.forces = function () {
  const out = [];
  for (const w of this.wheels) w.load = 0;
  for (const b of this.balls) {
    const F = [0, 0, -b.m * G], T = [0, 0, 0];
    if (b.st !== 'live') { out.push(null); continue; }
    this.airForce(b, b.v, F);
    let shooter = false, wheelDepth = 0, otherDepth = 0;
    /* floor */
    if (b.p[2] < b.R) this.contact(b, [b.p[0], b.p[1], 0], [0, 0, 1], b.R - b.p[2], [0, 0, 0], FIELD_MAT.tile, F, T) && (b.floor = true);
    /* wheels */
    for (const w of this.wheels) {
      const d = sub(b.p, w.c), al = dot(d, w.a), rad = sub(d, mul(w.a, al)), rr = len(rad);
      const R = w.r + w.growth, u = rr > 1e-9 ? mul(rad, 1 / rr) : [1, 0, 0];
      const q = add(add(w.c, mul(w.a, clamp(al, -w.hw, w.hw))), mul(u, Math.min(rr, R)));
      let n = sub(b.p, q), dist = len(n), depth;
      if (rr < R && Math.abs(al) < w.hw) { n = u; depth = b.R + (R - rr); }
      else { if (dist >= b.R) continue; n = mul(n, 1 / dist); depth = b.R - dist; }
      const vs = cross(mul(w.a, w.omega), sub(q, w.c));
      const mat = Object.assign({ wSurf: mul(w.a, w.omega), wheel: true }, w.mat);
      if (!this.contact(b, q, n, depth, vs, mat, F, T)) continue;
      shooter = true;
      if (w.role !== 'roller') b.launched = true;
      if (w.role === 'main') wheelDepth = Math.max(wheelDepth, depth); else if (w.role === 'double') otherDepth = Math.max(otherDepth, depth);
      /* the wheel feels the opposite force at the contact point, and the opposite rolling torque */
      w.load += dot(cross(sub(q, w.c), mul(this.lastF, -1)), w.a) - dot(this.lastRR, w.a);
    }
    /* shooter, transfer and robot meshes */
    for (const m of this.meshes) {
      const d = this.meshContacts(b, m, F, T);
      if (!d || m.tag === 'robot') continue;
      shooter = true; otherDepth = Math.max(otherDepth, d);
    }
    /* how hard the ball is squeezed: its overlap with the flywheel plus its overlap with the hood (or the other wheel) at the same moment */
    if (wheelDepth > 0 && otherDepth > 0) b.comp = Math.max(b.comp || 0, wheelDepth + otherDepth);
    /* the official field */
    if (this.field) {
      if (this.meshContacts(b, this.field.hive, F, T) && !b.entered) b.hiveHit = true;
      this.meshContacts(b, this.field.wall, F, T);
    }
    /* HIVE */
    if (this.hive) {
      if (this.meshContacts(b, this.hive.cell, F, T) && !b.entered) b.cellHit = true;
      if (this.meshContacts(b, this.hive.frame, F, T) && !b.entered) b.frameHit = true;
    }
    /* other balls */
    for (const o of this.balls) {
      if (o === b || o.st === 'gone' || o.st === 'floor') continue;
      const d = sub(b.p, o.p), dist = len(d), s = b.R + o.R;
      if (dist >= s || dist < 1e-9) continue;
      const n = mul(d, 1 / dist), q = add(o.p, mul(n, o.R));
      const vs = o.st === 'live' ? add(o.v, cross(o.w, mul(n, o.R))) : [0, 0, 0];
      this.contact(b, q, n, s - dist, vs, { mu: 0.4, e: 0.5, k: o.k, crr: 0.01 }, F, T);
    }
    if (shooter) b.lastShooter = this.t;
    out.push([F, T]);
  }
  return out;
};

Sim.prototype.meshContacts = function (b, m, F, T) {
  const list = nearTris(m, b.p, b.R, this.tmp), hits = [];
  const pl = m.planes;
  for (const t of list) {
    if (Math.abs(pl[t * 4] * b.p[0] + pl[t * 4 + 1] * b.p[1] + pl[t * 4 + 2] * b.p[2] - pl[t * 4 + 3]) >= b.R) continue;
    const o = t * 9, tr = m.tris;
    const q = closestOnTri(b.p, [tr[o], tr[o + 1], tr[o + 2]], [tr[o + 3], tr[o + 4], tr[o + 5]], [tr[o + 6], tr[o + 7], tr[o + 8]]);
    const d = sub(b.p, q), dist = len(d);
    if (dist >= b.R || dist < 1e-9) continue;
    const n = mul(d, 1 / dist);
    /* neighbouring triangles of one flat face report the same contact: keep only the deepest per direction */
    const same = hits.find((h) => dot(h.n, n) > 0.995);
    if (same) { if (dist < same.dist) { same.dist = dist; same.q = q; same.n = n; } continue; }
    hits.push({ q, n, dist });
  }
  let deepest = 0;
  for (const h of hits) { this.contact(b, h.q, h.n, b.R - h.dist, [0, 0, 0], m.mat, F, T); deepest = Math.max(deepest, b.R - h.dist); }
  return deepest;
};

/* Motor, controller and friction for one wheel over dt. */
Sim.prototype.stepWheel = function (w, dt) {
  const wm = w.omega * w.dir * w.G;                         // motor shaft speed, positive in the driving direction
  const wFreeWheel = w.motor.wFree * (w.V / 12) / w.G;
  /* velocity control like the hub's RUN_USING_ENCODER: feed-forward, proportional and integral, with anti-windup */
  const tgt = w.target, cur = w.omega * w.dir, err = tgt - cur;
  const raw = tgt / wFreeWheel + (4 * err + 15 * (w.i || 0)) / wFreeWheel;
  if (raw > -1 && raw < 1 && Math.abs(err) < 0.05 * tgt) w.i = clamp((w.i || 0) + err * dt, -0.02 * wFreeWheel, 0.02 * wFreeWheel);
  w.u = clamp(raw, -1, 1);
  if (tgt <= 0) { w.u = 0; w.i = 0; }
  const tm = motorTorque(w.motor, w.u, w.V, wm);
  const fric = 0.003 * Math.sign(w.omega) + 2e-6 * w.omega;
  const torque = tm * w.G * w.eta * w.dir - fric + w.load;
  w.omega += torque / w.J * dt;
  w.angle += w.omega * dt;
  w.growth = wheelGrowth(w.spec, w.omega);
};

/* Move the simulation forward by `span` seconds. Small steps whenever anything touches, RK4 in free flight. */
/* Small steps whenever anything touches. Their size comes from the stiffest ball: about 1/200 of its bounce period, so the
   spring–damper contact stays accurate (springs in series are never stiffer than the ball itself). RK4 in free flight. */
Sim.prototype.advance = function (span, budget) {
  let used = 0, done = 0, hard = 0;
  for (const b of this.balls) if (b.st === 'live') hard = Math.max(hard, Math.sqrt(b.k / b.m));
  const fine = Math.max(1e-5, Math.min(6e-5, hard ? 0.03 / hard : 6e-5));
  while (done < span - 1e-9 && used < budget) {
    let small = false;
    for (const b of this.balls) if (b.st === 'live' && this.near(b, Math.max(0.004, len(b.v) * 0.0012))) { small = true; break; }
    const dt = Math.min(small ? fine : 1e-3, span - done);
    if (small) this.stepContact(dt); else this.stepFree(dt);
    done += dt; used += small ? 1 : 10;
  }
  return done;
};

Sim.prototype.stepContact = function (dt) {
  this.dtNow = dt;
  const fs = this.forces();
  this.balls.forEach((b, i) => {
    if (!fs[i]) return;
    const [F, T] = fs[i];
    b.v = add(b.v, mul(F, dt / b.m));
    b.w = add(b.w, mul(T, dt / b.I));
    b.p = add(b.p, mul(b.v, dt));
  });
  for (const w of this.wheels) this.stepWheel(w, dt);
  this.after(dt);
};

/* Free flight: classic RK4 on position and velocity with gravity, drag and Magnus lift. */
Sim.prototype.stepFree = function (dt) {
  for (const b of this.balls) {
    if (b.st !== 'live') continue;
    const acc = (v) => { const F = [0, 0, -b.m * G]; this.airForce(b, v, F); return mul(F, 1 / b.m); };
    const p = b.p, v = b.v;
    const k1v = acc(v), k1p = v;
    const k2v = acc(add(v, mul(k1v, dt / 2))), k2p = add(v, mul(k1v, dt / 2));
    const k3v = acc(add(v, mul(k2v, dt / 2))), k3p = add(v, mul(k2v, dt / 2));
    const k4v = acc(add(v, mul(k3v, dt))), k4p = add(v, mul(k3v, dt));
    b.v = add(v, mul(add(add(k1v, mul(k2v, 2)), add(mul(k3v, 2), k4v)), dt / 6));
    b.p = add(p, mul(add(add(k1p, mul(k2p, 2)), add(mul(k3p, 2), k4p)), dt / 6));
  }
  for (const w of this.wheels) { w.load = 0; this.stepWheel(w, dt); }
  this.after(dt);
};

/* Bookkeeping after every step: spin decay, exit capture, scoring, settling and the rpm trace. */
Sim.prototype.after = function (dt) {
  this.t += dt;
  const main = this.wheels[0];
  for (const b of this.balls) {
    if (b.st !== 'live') continue;
    if (!isFinite(b.p[0] + b.p[1] + b.p[2] + b.v[0] + b.v[1] + b.v[2])) { b.p = b.path[b.path.length - 1] || [0, 0, 0]; b.v = [0, 0, 0]; this.finish(b, 'floor'); continue; }
    b.w = mul(b.w, Math.exp(-dt / this.env.spinTau));
    if (main) b.rpmMin = Math.min(b.rpmMin, Math.abs(main.omega) * 30 / Math.PI);
    if (b.launched && !b.exit && this.t - b.lastShooter > 0.02) {
      const sp = len(b.v);
      b.exit = { t: this.t, v: sp, ang: Math.atan2(b.v[2], Math.hypot(b.v[0], b.v[1])) * 180 / Math.PI, spin: len(b.w) * 30 / Math.PI,
        rpmBefore: b.rpmAtFeed, rpmAfter: main ? Math.abs(main.omega) * 30 / Math.PI : 0, comp: b.comp || 0 };
    }
    b.maxX = Math.max(b.maxX, b.p[0]);
    if (this.aim) {
      b.maxAlong = Math.max(b.maxAlong == null ? -Infinity : b.maxAlong, dot(sub(b.p, this.aim.o), this.aim.h));
      /* where the ball comes back down through the height of the CELL's lip */
      if (b.exit && b.lipAlong == null && b.prevZ >= this.aim.lip && b.p[2] < this.aim.lip && b.v[2] < 0) b.lipAlong = dot(sub(b.p, this.aim.o), this.aim.h);
      b.prevZ = b.p[2];
    }
    if (this.inTarget(b.p)) b.entered = true;
    else if (b.entered) b.out = true;
    if (this.t - (b.lastPath || 0) > 0.01) { b.path.push(b.p.slice()); b.lastPath = this.t; if (b.path.length > 600) b.path.shift(); }
    const slow = len(b.v) < 0.04;
    b.still = slow ? b.still + dt : 0;
    if (b.still > 0.25 && this.inTarget(b.p)) this.finish(b, 'scored');
    else if (b.still > 0.25 && b.p[2] < b.R + 0.01) this.finish(b, b.exit ? 'floor' : 'stuck');
    else if (b.still > 0.6) this.finish(b, b.exit ? 'stuck' : 'stuck');
    else if (b.p[2] < b.R + 0.005 && b.exit && this.t - b.exit.t > 0.05) this.finish(b, 'floor');
    else if (this.t - b.born > 8 || b.p[2] < -1 || Math.abs(b.p[0]) > 6 || Math.abs(b.p[1]) > 6) this.finish(b, 'floor');
  }
  if (main && (!this.trace.length || this.t - this.trace[this.trace.length - 1][0] > 0.005)) {
    this.trace.push([this.t, Math.abs(main.omega) * 30 / Math.PI]);
    if (this.trace.length > 2400) this.trace.shift();
  }
};

/* Records how a shot ended. */
Sim.prototype.finish = function (b, how) {
  if (b.st !== 'live') return;
  const dist = this.env.dist;
  let result;
  if (how === 'scored') result = 'Scored';
  else if (!b.exit) result = b.launched ? 'Jammed in the shooter' : 'Never reached the flywheel';
  else if (b.out) result = 'Bounced out';
  else if (b.cellHit) result = 'Hit the CELL rim';
  else if (b.frameHit || b.hiveHit) result = 'Hit the HIVE';
  else if (this.aim) result = b.lipAlong == null || b.lipAlong < this.aim.near ? 'Short' : b.lipAlong > this.aim.far ? 'Long' : 'Missed the opening';
  else if (b.maxX < dist) result = 'Short';
  else result = 'Long';
  b.st = how === 'scored' ? 'scored' : 'floor';
  b.v = [0, 0, 0]; b.w = [0, 0, 0];
  b.result = result; b.ended = this.t;
  this.shots.push({ id: b.id, type: b.type, result, exit: b.exit, comp: b.comp || 0, rpmBefore: b.rpmAtFeed, rpmMin: b.rpmMin === Infinity ? 0 : b.rpmMin });
};

/* Narrowest gap between a wheel's rim and the shooter meshes, found by casting rays out from the rim in the wheel's mid-plane. */
function rimGap(wheel, meshes) {
  let best = Infinity, at = 0;
  const a = wheel.a, ref = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const e1 = norm(cross(a, ref)), e2 = cross(a, e1);
  for (let i = 0; i < 180; i++) {
    const th = i * Math.PI / 90, u = add(mul(e1, Math.cos(th)), mul(e2, Math.sin(th)));
    const o = add(wheel.c, mul(u, wheel.r));
    for (const m of meshes) {
      const t = rayMesh(m.tris, o, u, 0.2);
      if (t < best) { best = t; at = th; }
    }
  }
  return { gap: best, angle: at * 180 / Math.PI };
}

/* ---------- STL ---------- */

/* Reads binary or ASCII STL into a Float32Array of triangles (file units). */
function parseSTL(buf) {
  const dv = new DataView(buf);
  if (buf.byteLength >= 84) {
    const n = dv.getUint32(80, true);
    if (84 + n * 50 === buf.byteLength) {
      const out = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(84 + i * 50 + 12 + k * 4, true);
      return out;
    }
  }
  const text = new TextDecoder().decode(new Uint8Array(buf));
  const nums = [], re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  let m;
  while ((m = re.exec(text))) nums.push(+m[1], +m[2], +m[3]);
  if (!nums.length || nums.length % 9) throw new Error('This file is not an STL the lab can read.');
  return new Float32Array(nums);
}

/* Writes triangles as a binary STL (millimetres). */
function writeSTL(tris) {
  const n = tris.length / 9, buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf);
  dv.setUint32(80, n, true);
  for (let i = 0; i < n; i++) {
    const o = i * 9, a = [tris[o], tris[o + 1], tris[o + 2]], b = [tris[o + 3], tris[o + 4], tris[o + 5]], c = [tris[o + 6], tris[o + 7], tris[o + 8]];
    const nn = norm(cross(sub(b, a), sub(c, a))), base = 84 + i * 50;
    for (let k = 0; k < 3; k++) dv.setFloat32(base + k * 4, nn[k], true);
    for (let k = 0; k < 9; k++) dv.setFloat32(base + 12 + k * 4, tris[o + k] * 1000, true);
  }
  return buf;
}

BBZ.Lab = { IN, G, MOTORS, SURFACES, FIELD_MAT, WHEELS, BALLS, HIVE, DISC_J, Sim, hoodTris, hiveTris, inCell, inHull, parseField, makeMesh, rimGap, parseSTL, writeSTL,
  wheelGrowth, shoreToE, vec: { add, sub, mul, dot, cross, len, norm, clamp } };
})();
