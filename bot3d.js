/* 3D robot pictures. */
(function () {
'use strict';
const BBZ = window.BBZ;
if (!BBZ || !BBZ.partPos) return;
const C = { intake: '#2f9a5f', intakeLight: '#63e39b', launcher: '#e8892b', lift: '#19a7b8', servo: '#8b63d9', sensor: '#e0559a', camera: '#22b8cf',
  motor: '#26292d', gearbox: '#b9bec4', silver: '#b9bec4', dark: '#30363c', deck: '#3b4248', tyre: '#1b1d20', hubcap: '#f2c230', roller: '#101214',
  hole: '#14171a', hubBody: '#1b1d20', orange: '#f26b21', white: '#f4f4f0', battery: '#3a4047', label: '#2d5da6', led: '#35d07f', rubber: '#3b2a12',
  clear: '#bfe6ff', pollen: '#f2c230', red: '#d94f4f', black: '#15171a' };

/* ---------- shapes ---------- */
function builder() {
  const faces = [];
  /* the current frame: a rotation matrix and an offset */
  let M = [1, 0, 0, 0, 1, 0, 0, 0, 1], O = [0, 0, 0];
  const rot = (x, y, z) => [M[0] * x + M[1] * y + M[2] * z, M[3] * x + M[4] * y + M[5] * z, M[6] * x + M[7] * y + M[8] * z];
  const at = (x, y, z) => { const r = rot(x, y, z); return [r[0] + O[0], r[1] + O[1], r[2] + O[2]]; };
  const g = {
    faces, tag: '',
    /* Runs `fn` with its drawing moved to (x, y, z), turned by `yaw` and tipped by `pitch`. */
    place(x, y, z, yaw, pitch, fn) {
      const oM = M, oO = O, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const R = [cy * cp, -sy, -cy * sp, sy * cp, cy, -sy * sp, sp, 0, cp], N = [];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) N.push(M[i * 3] * R[j] + M[i * 3 + 1] * R[3 + j] + M[i * 3 + 2] * R[6 + j]);
      O = at(x, y, z); M = N;
      fn(); M = oM; O = oO;
    },
    /* A flat four-sided patch: centre, half-width vector, half-height vector, the way it faces. */
    quad(c, u, v, n, col, o) {
      o = o || {};
      const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map((s) => at(c[0] + u[0] * s[0] + v[0] * s[1], c[1] + u[1] * s[0] + v[1] * s[1], c[2] + u[2] * s[0] + v[2] * s[1]));
      faces.push({ p: P, n: rot(n[0], n[1], n[2]), col, a: o.a || 1, bias: o.bias || 0, tag: g.tag });
    },
    /* A box. */
    box(x, y, z, sx, sy, sz, col, o) {
      const h = [sx / 2, sy / 2, sz / 2];
      for (let ax = 0; ax < 3; ax++) for (let s = -1; s <= 1; s += 2) {
        const a1 = (ax + 1) % 3, a2 = (ax + 2) % 3, n = [0, 0, 0]; n[ax] = s;
        const n1 = Math.max(1, Math.ceil(h[a1] * 2 / 4.4)), n2 = Math.max(1, Math.ceil(h[a2] * 2 / 4.4));
        for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) {
          const c = [x, y, z], u = [0, 0, 0], v = [0, 0, 0];
          c[ax] += s * h[ax]; c[a1] += -h[a1] + (i + 0.5) * h[a1] * 2 / n1; c[a2] += -h[a2] + (j + 0.5) * h[a2] * 2 / n2;
          u[a1] = h[a1] / n1; v[a2] = h[a2] / n2;
          g.quad(c, u, v, n, col, o);
        }
      }
    },
    /* A cylinder along 'x', 'y' or 'z'; `cap` colours its two round ends. */
    cyl(x, y, z, r, len, axis, col, cap, seg) {
      const n = seg || 12, h = len / 2, A = [], B = [], N = [];
      const pt = (u, w, d) => axis === 'z' ? [x + u, y + w, z + d] : axis === 'y' ? [x + u, y + d, z + w] : [x + d, y + u, z + w];
      for (let i = 0; i < n; i++) {
        const t = i / n * 6.2832, t2 = (i + 0.5) / n * 6.2832;
        A.push(pt(Math.cos(t) * r, Math.sin(t) * r, -h)); B.push(pt(Math.cos(t) * r, Math.sin(t) * r, h));
        const m = pt(Math.cos(t2), Math.sin(t2), 0); N.push([m[0] - x, m[1] - y, m[2] - z]);
      }
      const w = (q) => at(q[0], q[1], q[2]);
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; faces.push({ p: [w(A[i]), w(A[j]), w(B[j]), w(B[i])], n: rot(N[i][0], N[i][1], N[i][2]), col, a: 1, bias: 0, tag: g.tag }); }
      const e0 = pt(0, 0, -1), e1 = pt(0, 0, 1);
      faces.push({ p: A.map(w), n: rot(e0[0] - x, e0[1] - y, e0[2] - z), col: cap || col, a: 1, bias: 0, tag: g.tag });
      faces.push({ p: B.map(w), n: rot(e1[0] - x, e1[1] - y, e1[2] - z), col: cap || col, a: 1, bias: 0, tag: g.tag });
    },
    ball(x, y, z, r, col) { faces.push({ ball: true, c: at(x, y, z), r, col, tag: g.tag }); },
    line(a, b, col, w) { faces.push({ line: true, p: [at(a[0], a[1], a[2]), at(b[0], b[1], b[2])], col, w: w || 1, tag: g.tag }); },
    /* A sheet of clear plastic. */
    sheet(c, u, v) { const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; g.quad(c, u, v, n, C.clear, { a: 0.3 }); },
    /* An open-topped clear box, for anything that holds pieces. */
    bin(x, y, z, sx, sy, sz) {
      const a = sx / 2, b = sy / 2, h = sz / 2;
      g.sheet([x, y, z - h], [a, 0, 0], [0, b, 0]);
      g.sheet([x - a, y, z], [0, b, 0], [0, 0, h]); g.sheet([x + a, y, z], [0, b, 0], [0, 0, h]);
      g.sheet([x, y - b, z], [a, 0, 0], [0, 0, h]); g.sheet([x, y + b, z], [a, 0, 0], [0, 0, h]);
    },
    /* A length of drilled channel, the metal beam kit robots are built from. */
    beam(x, y, z, len, axis, w, h, col) {
      const sx = axis === 'x' ? len : w, sy = axis === 'y' ? len : axis === 'z' ? h : w, sz = axis === 'z' ? len : h;
      g.box(x, y, z, sx, sy, sz, col);
      const n = Math.max(1, Math.floor(len / 1.5)), d = 0.2, o = { bias: -0.35 };
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + (i + 0.5) * len / n;
        if (axis === 'x') {
          g.quad([x + t, y + w / 2 + 0.01, z], [d, 0, 0], [0, 0, d], [0, 1, 0], C.hole, o); g.quad([x + t, y - w / 2 - 0.01, z], [d, 0, 0], [0, 0, d], [0, -1, 0], C.hole, o);
          g.quad([x + t, y, z + h / 2 + 0.01], [d, 0, 0], [0, d, 0], [0, 0, 1], C.hole, o);
        } else if (axis === 'y') {
          g.quad([x + w / 2 + 0.01, y + t, z], [0, d, 0], [0, 0, d], [1, 0, 0], C.hole, o); g.quad([x - w / 2 - 0.01, y + t, z], [0, d, 0], [0, 0, d], [-1, 0, 0], C.hole, o);
          g.quad([x, y + t, z + h / 2 + 0.01], [d, 0, 0], [0, d, 0], [0, 0, 1], C.hole, o);
        } else {
          g.quad([x + w / 2 + 0.01, y, z + t], [0, d, 0], [0, 0, d], [1, 0, 0], C.hole, o); g.quad([x - w / 2 - 0.01, y, z + t], [0, d, 0], [0, 0, d], [-1, 0, 0], C.hole, o);
          g.quad([x, y + h / 2 + 0.01, z + t], [d, 0, 0], [0, 0, d], [0, 1, 0], C.hole, o); g.quad([x, y - h / 2 - 0.01, z + t], [d, 0, 0], [0, 0, d], [0, -1, 0], C.hole, o);
        }
      }
    },
    /* A gearmotor: a dark can with a silver gearbox on the end nearest the mechanism. */
    gearmotor(x, y, z, axis, len, dir) {
      const s = dir || 1, off = (d) => axis === 'y' ? [x, y + d, z] : axis === 'x' ? [x + d, y, z] : [x, y, z + d];
      const a = off(s * len * 0.2), b = off(-s * len * 0.32);
      g.cyl(a[0], a[1], a[2], 0.85, len * 0.62, axis, C.motor, '#3a3f45', 10);
      g.cyl(b[0], b[1], b[2], 0.92, len * 0.36, axis, C.gearbox, '#8c9198', 10);
    },
    /* A wheel on an axle along y: 'grip' is a tyre with a hub, 'mecanum' has slanted rollers, 'omni' has straight ones. */
    wheel(R, kind) {
      if (kind === 'grip') {
        g.cyl(0, 0, 0, R, 1.3, 'y', C.tyre, C.tyre, 14);
        g.cyl(0, 0, 0, R * 0.68, 1.42, 'y', C.hubcap, C.hubcap, 12);
        g.cyl(0, 0, 0, R * 0.2, 1.6, 'y', C.silver, C.silver, 6);
        return;
      }
      g.cyl(0, 0.62, 0, R * 0.8, 0.14, 'y', C.hubcap, C.hubcap, 12);
      g.cyl(0, -0.62, 0, R * 0.8, 0.14, 'y', C.hubcap, C.hubcap, 12);
      g.cyl(0, 0, 0, R * 0.3, 1.5, 'y', C.silver, C.silver, 6);
      g.cyl(0, 0, 0, R, 1.1, 'y', C.roller, C.roller, 18);
      /* the rollers show as lighter bands round the rim; on a mecanum wheel they sit at 45 degrees */
      const n = 9, slant = kind === 'mecanum' ? 0.75 : 0, c = Math.cos(slant), s = Math.sin(slant), l = 0.5, t = R * 0.16;
      for (let i = 0; i < n; i++) g.place(0, 0, 0, 0, i / n * 6.2832, () => g.quad([R + 0.02, 0, 0], [0, l * c, l * s], [0, -t * s, t * c], [1, 0, 0], '#5b626a', { bias: -0.3 }));
    }
  };
  return g;
}

/* ---------- parts. Each is drawn in its own frame: the origin is the part's spot on the floor, +x is the way
   it points, and D is the height of the deck it bolts to. ---------- */
const PART = {
  hub(g, cfg, D) {
    [[2.2, 1.3], [2.2, -1.3], [-2.2, 1.3], [-2.2, -1.3]].forEach((q) => g.cyl(q[0], q[1], D + 0.25, 0.18, 0.5, 'z', C.silver, C.silver, 6));
    g.box(0, 0, D + 1.1, 5.4, 3.4, 1.2, C.hubBody);
    const t = D + 1.72, o = { bias: -0.4 };
    g.quad([-0.5, 0, t], [0.55, 0, 0], [0.75, 1.7, 0], [0, 0, 1], C.orange, o);
    g.quad([1.55, 0, t], [0.75, 0, 0], [0, 1.0, 0], [0, 0, 1], C.white, o);
    g.quad([-2.35, 0, t], [0.2, 0, 0], [0, 1.4, 0], [0, 0, 1], C.silver, o);
    g.quad([-1.7, 1.35, t + 0.01], [0.14, 0, 0], [0, 0.14, 0], [0, 0, 1], C.led, { bias: -0.6 });
    if (cfg.tools.imu) g.quad([1.55, 0, t + 0.01], [0.38, 0, 0], [0, 0.38, 0], [0, 0, 1], C.camera, { bias: -0.6 });
    g.box(-2.85, 0, D + 1.1, 0.3, 2.8, 0.7, C.silver);
  },
  battery(g, cfg, D) {
    g.box(0, 0, D + 0.9, 5.4, 2.6, 1.8, C.battery);
    g.quad([0, 0, D + 1.81], [1.9, 0, 0], [0, 0.85, 0], [0, 0, 1], C.label, { bias: -0.4 });
    g.box(2.9, 0, D + 0.9, 0.4, 1, 0.8, C.hubcap);
  },
  distance(g, cfg, D) {
    g.box(-0.25, 0, D + 1, 0.25, 2.2, 2, C.silver);
    g.box(0.15, 0, D + 1.3, 0.6, 1.8, 1, C.sensor);
    g.quad([0.46, 0.45, D + 1.3], [0, 0.26, 0], [0, 0, 0.26], [1, 0, 0], C.black, { bias: -0.4 });
    g.quad([0.46, -0.45, D + 1.3], [0, 0.26, 0], [0, 0, 0.26], [1, 0, 0], C.black, { bias: -0.4 });
  },
  camera(g, cfg, D) {
    g.beam(-0.4, 0, D + 2.1, 4.2, 'z', 0.7, 0.7, C.silver);
    g.box(0.1, 0, D + 4.7, 1.3, 3, 1.2, '#20262c');
    g.cyl(0.85, 0, D + 4.7, 0.5, 0.3, 'x', '#0d0f11', C.camera, 10);
    g.line([-0.6, 0.9, D + 4.4], [-0.9, 0.9, D + 0.2], C.black, 1.4);
  },
  launcher(g, cfg, D) {
    const kit = cfg.kit.launcher;
    if (kit === 'catapult') {
      g.beam(-1.8, 1.3, D + 2.2, 4.4, 'z', 0.8, 0.8, g.paint); g.beam(-1.8, -1.3, D + 2.2, 4.4, 'z', 0.8, 0.8, g.paint);
      g.cyl(-1.8, 0, D + 3.9, 0.22, 3.2, 'y', C.silver, C.silver, 6);
      g.place(-1.8, 0, D + 3.9, 0, 0.3, () => {
        g.box(2.6, 0, 0, 6.4, 0.8, 0.5, C.silver);
        g.cyl(5.4, 0, 0.6, 1.5, 0.9, 'z', C.launcher, C.rubber, 12);
        g.ball(5.4, 0, 1.5, 1.2, C.pollen);
      });
      g.line([-1.8, 1.3, D + 4.3], [1.4, 0.3, D + 5.1], C.orange, 2); g.line([-1.8, -1.3, D + 4.3], [1.4, -0.3, D + 5.1], C.orange, 2);
      g.box(1.2, 0, D + 0.8, 1.8, 2.2, 1.5, C.servo);
      g.box(1.2, 0, D + 1.9, 0.4, 1.6, 0.7, C.white);
      return;
    }
    if (kit === 'dual') {
      [[1.9, 3.2], [1.9, -3.2], [-1.9, 3.2], [-1.9, -3.2]].forEach((q) => g.beam(q[0], q[1], D + 1.6, 3.2, 'z', 0.6, 0.6, g.paint));
      g.box(0, 0, D + 3.35, 5, 7.4, 0.3, C.deck);
      [2.05, -2.05].forEach((y) => {
        g.cyl(0, y, D + 4.2, 1.9, 1.3, 'z', C.tyre, C.tyre, 14);
        g.cyl(0, y, D + 4.25, 1.2, 1.36, 'z', C.launcher, C.launcher, 10);
        g.gearmotor(0, y, D + 2, 'z', 2.4, -1);
      });
      g.sheet([0.4, 0, D + 5.3], [2.3, 0, 0], [0, 1.1, 0]);
      g.sheet([0.4, 1.1, D + 4.4], [2.3, 0, 0], [0, 0, 0.9]); g.sheet([0.4, -1.1, D + 4.4], [2.3, 0, 0], [0, 0, 0.9]);
      g.box(-3.1, 0, D + 4.1, 1.5, 2, 1.2, C.servo);
      return;
    }
    /* one big wheel held high between two uprights, with a clear hood that curls the piece forward */
    g.beam(-0.2, 1.5, D + 3.2, 6.4, 'z', 1.3, 0.6, g.paint); g.beam(-0.2, -1.5, D + 3.2, 6.4, 'z', 1.3, 0.6, g.paint);
    g.cyl(-0.2, 0, D + 4.9, 2.3, 1.7, 'y', C.tyre, C.tyre, 16);
    g.cyl(-0.2, 0, D + 4.9, 1.35, 1.8, 'y', C.launcher, C.launcher, 10);
    g.gearmotor(-0.2, 2.9, D + 4.9, 'y', 2.4, -1);
    g.place(-0.2, 0, D + 4.9, 0, 0, () => {
      g.place(0, 0, 0, 0, 0.9, () => g.sheet([3.1, 0, 0], [0, 1.2, 0], [0, 0, 1.5]));
      g.place(0, 0, 0, 0, 1.75, () => g.sheet([3.1, 0, 0], [0, 1.2, 0], [0, 0, 1.5]));
      g.place(0, 0, 0, 0, 2.6, () => g.sheet([3.1, 0, 0], [0, 1.2, 0], [0, 0, 1.5]));
    });
    g.box(-3.3, 0, D + 0.9, 1.6, 2, 1.4, C.servo);
    g.box(-2.9, 0, D + 2.1, 2, 0.5, 0.3, C.white);
    g.place(1.4, 0, D + 1.3, 0, 0.5, () => g.sheet([0.8, 0, 0], [1.6, 0, 0], [0, 1.2, 0]));
  },
  lift(g, cfg, D) {
    if (cfg.kit.lift === 'arm') {
      g.beam(-1.2, 1, D + 3.6, 7.2, 'z', 1.2, 0.6, g.paint); g.beam(-1.2, -1, D + 3.6, 7.2, 'z', 1.2, 0.6, g.paint);
      g.cyl(-1.2, 0, D + 6.4, 1.4, 0.5, 'y', C.silver, '#8c9198', 12);
      g.gearmotor(-1.2, 2.3, D + 6.4, 'y', 2.2, -1);
      g.place(-1.2, 0, D + 6.4, 0, 0.5, () => {
        g.beam(3.3, 0, 0, 6.6, 'x', 0.8, 0.8, C.lift);
        g.bin(6.9, 0, 0.6, 2.4, 2.4, 2);
        g.ball(6.9, 0, 0.9, 1.05, C.pollen);
        g.box(5.5, 0, -0.8, 1.2, 1.8, 0.9, C.servo);
      });
      return;
    }
    /* two fixed rails, a sliding stage between them, and a clear bucket with a gate servo */
    g.beam(0, 1.5, D + 6, 12, 'z', 1, 0.6, C.silver); g.beam(0, -1.5, D + 6, 12, 'z', 1, 0.6, C.silver);
    g.box(0.15, 1.5, D + 8, 0.7, 0.35, 13, C.lift); g.box(0.15, -1.5, D + 8, 0.7, 0.35, 13, C.lift);
    g.box(0.15, 0, D + 14.3, 0.7, 3.4, 0.6, C.lift);
    g.bin(1.9, 0, D + 7.6, 2.6, 2.6, 2.2);
    g.ball(1.9, 0, D + 7.7, 1.05, C.pollen);
    g.box(1.9, -1.9, D + 6.8, 1.3, 0.9, 1.2, C.servo);
    g.gearmotor(-1.2, 0, D + 0.95, 'y', 2.6, 1);
    g.cyl(-1.2, -1.4, D + 0.95, 0.75, 0.5, 'y', C.white, C.white, 8);
    g.line([-1.2, -1.4, D + 1.6], [0.15, -1.2, D + 14.3], C.white, 1);
  },
  intake(g, cfg, D, span) {
    const kit = cfg.kit.intake;
    if (kit === 'claw') {
      g.beam(-0.9, 0, D + 1.4, 2.8, 'z', 0.9, 0.9, g.paint);
      g.box(-0.7, 0, D + 3.4, 1.9, 2.4, 1.3, C.servo);
      [1, -1].forEach((s) => g.place(0.3, s * 0.9, D + 3.4, s * 0.24, -0.12, () => { g.box(1.8, 0, 0, 3.6, 0.4, 1.1, C.intake); g.box(3.3, -s * 0.25, 0, 0.7, 0.3, 1.1, C.rubber); }));
      return;
    }
    const len = kit === 'wheels' ? span * 0.62 : span - 4.6, edge = len / 2 + 0.45;
    [edge, -edge].forEach((y) => g.beam(-0.3, y, (D + 2.4) / 2 + 0.3, 3.4, 'x', 0.35, D + 1.6, g.paint));
    g.cyl(0.9, 0, 1.35, 0.2, len + 1.4, 'y', C.silver, C.silver, 6);
    if (kit === 'wheels') {
      for (let i = 0; i < 4; i++) {
        const y = -len / 2 + 0.6 + i * (len - 1.2) / 3;
        g.cyl(0.9, y, 1.35, 1.3, 0.8, 'y', C.intake, C.intakeLight, 8);
        g.cyl(0.9, y, 1.35, 0.5, 0.9, 'y', C.silver, C.silver, 6);
      }
    } else {
      const n = Math.max(3, Math.round(len / 2.4));
      for (let i = 0; i < n; i++) g.cyl(0.9, -len / 2 + (i + 0.5) * len / n, 1.35, 1, len / n - 0.12, 'y', i % 2 ? C.intakeLight : C.intake, '#1f6b42', 10);
    }
    g.gearmotor(0.9, edge + 1.5, 1.35, 'y', 2.2, -1);
    /* a clear guard slopes up from the roller so pieces ride over it into the robot */
    g.place(1.5, 0, 2.9, 0, -0.42, () => g.sheet([-2.1, 0, 0], [2.1, 0, 0], [0, len / 2, 0]));
  }
};

function chassis(g, cfg, D, full) {
  const hl = cfg.length / 2, hw = cfg.width / 2, R = BBZ.WHEELS[cfg.wheel].d / 2, x = cfg.drive === 'xdrive', zr = D - 0.75;
  const fl = x ? hl - 2.6 : hl, fw = x ? hw - 2.6 : hw - 1.5;                     /* half size of the frame rectangle */
  g.tag = 'drive';
  g.beam(0, fw - 0.65, zr, fl * 2, 'x', 1.3, 1.5, g.paint); g.beam(0, -fw + 0.65, zr, fl * 2, 'x', 1.3, 1.5, g.paint);
  g.beam(fl - 0.65, 0, zr, fw * 2 - 2.6, 'y', 1.3, 1.5, g.paint); g.beam(-fl + 0.65, 0, zr, fw * 2 - 2.6, 'y', 1.3, 1.5, g.paint);
  g.box(0, 0, D - 0.05, fl * 2 - 2.6, fw * 2 - 2.6, 0.1, C.deck);
  /* an alliance-colour number plate on each side */
  const ac = cfg.alliance === 'red' ? C.red : '#3d7bd9';
  [1, -1].forEach((s) => g.quad([-fl * 0.45, s * (fw + 0.02), zr], [1.7, 0, 0], [0, 0, 0.55], [0, s, 0], ac, { bias: -0.5 }));
  if (x) {
    [[1, 1, -1], [1, -1, 1], [-1, 1, 1], [-1, -1, -1]].forEach((q) => {
      const wx = q[0] * (hl - 2.2), wy = q[1] * (hw - 2.2);
      g.place(wx, wy, R, q[2] * Math.PI / 4, 0, () => { g.wheel(R, 'omni'); g.gearmotor(0, -q[0] * q[2] * 2.3, 0, 'y', 2.6, q[0] * q[2]); });
      g.place(q[0] * (fl - 0.3), q[1] * (fw - 0.3), zr, q[2] * Math.PI / 4, 0, () => g.box(0, 0, 0, 0.5, 3.4, 1.5, g.paint));
    });
  } else if (cfg.drive === 'tank') {
    [1, -1].forEach((s) => {
      g.place(-hl + 3.2, s * (hw - 0.65), R, 0, 0, () => g.wheel(R, 'grip'));
      g.place(-hl + 3.2, s * (hw - 3.4), R, 0, 0, () => g.gearmotor(0, 0, 0, 'y', 2.6, s));
      g.place(hl - 2.6, s * (hw - 0.65), R * 0.8, 0, 0, () => g.wheel(R * 0.8, 'omni'));
    });
  } else {
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach((q) => {
      g.place(q[0] * (hl - 2.6), q[1] * (hw - 0.65), R, 0, 0, () => g.wheel(R, 'mecanum'));
      g.place(q[0] * (hl - 2.6), q[1] * (hw - 3.4), R, 0, 0, () => g.gearmotor(0, 0, 0, 'y', 2.6, q[1]));
    });
  }
  if (!full) return;
  /* the magazine: a clear channel along the left side where the pieces the robot is carrying ride */
  const n = (cfg.tools.intake && cfg.kit.intake === 'claw') ? 3 : 4, mlen = Math.min(11.2, cfg.length - 5.6), mx = -hl + 3.2 + mlen / 2, my = fw - 2.6;
  g.tag = 'magazine';
  g.bin(mx, my, D + 1.55, mlen, 2.8, 3);
  for (let i = 0; i < n; i++) g.ball(mx - mlen / 2 + 1.35 + i * Math.min(2.6, (mlen - 2.7) / 3), my, D + 1.3, 1.15, C.pollen);
}

/* Everything on the robot, or just one piece of it when `only` names a part ('drive' is the frame and wheels). */
function build(cfg, only) {
  const g = builder(), R = BBZ.WHEELS[cfg.wheel].d / 2, D = Math.max(2, R + 0.75);
  g.paint = BBZ.PAINTS[cfg.paint] || '#9aa39a';
  if (only && only !== 'drive') {
    g.tag = only;
    PART[only](g, cfg, only === 'intake' ? 1.6 : 0, cfg.width);
    return g.faces;
  }
  chassis(g, cfg, D, !only);
  if (only === 'drive') return g.faces;
  const spots = {};
  BBZ.partList(cfg).forEach((p) => {
    g.tag = p.key; spots[p.key] = p;
    g.place(p.x, p.y, 0, p.face * Math.PI / 2, 0, () => PART[p.key](g, cfg, D, p.face % 2 === 0 ? cfg.width : cfg.length));
  });
  /* the battery lead: a red and a black wire arching from the battery to the hub */
  if (spots.hub && spots.battery) {
    g.tag = 'wires';
    const a = spots.battery, b = spots.hub, mid = [(a.x + b.x) / 2, (a.y + b.y) / 2, D + 3.1];
    [[C.red, 0.3], [C.black, -0.3]].forEach((w) => {
      g.line([a.x + 2.6, a.y + w[1], D + 1.4], [mid[0], mid[1] + w[1], mid[2]], w[0], 1.6);
      g.line([mid[0], mid[1] + w[1], mid[2]], [b.x - 2.6, b.y + w[1], D + 1.5], w[0], 1.6);
    });
  }
  return g.faces;
}

/* ---------- drawing ---------- */
const shadeCache = new Map();
function shade(hex, k) {
  const key = hex + (k * 28 | 0);
  let s = shadeCache.get(key);
  if (s) return s;
  const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  s = 'rgb(' + f(n >> 16 & 255) + ',' + f(n >> 8 & 255) + ',' + f(n & 255) + ')';
  if (shadeCache.size > 6000) shadeCache.clear();
  shadeCache.set(key, s);
  return s;
}
/* The model only depends on the bot, so it is built once and reused while the picture is turned. */
let memoKey = '', memoFaces = null;
function model(cfg, only) {
  const key = (only || '') + JSON.stringify([cfg.drive, cfg.wheel, cfg.width, cfg.length, cfg.paint, cfg.alliance, cfg.tools, cfg.kit, cfg.layout]);
  if (key !== memoKey) { memoKey = key; memoFaces = build(cfg, only); }
  return memoFaces;
}
/* o: { yaw, pitch, only, pick, label, colors } */
function draw(cv, cfg, o) {
  o = o || {};
  const col = o.colors || BBZ.colors(), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  const yaw = o.yaw === undefined ? -0.9 : o.yaw, pitch = o.pitch === undefined ? 0.5 : o.pitch;
  const ca = Math.cos(yaw), sa = Math.sin(yaw), ce = Math.cos(pitch), se = Math.sin(pitch);
  const faces = model(cfg, o.only), part = o.only && o.only !== 'drive';
  /* centres and sizes the picture on what is shown */
  let mid = [0, 0, o.only ? 2 : 5], reach = o.only ? 11.5 : 14.2;
  if (part) {
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    faces.forEach((f) => (f.ball ? [f.c] : f.p).forEach((q) => { for (let i = 0; i < 3; i++) { if (q[i] < lo[i]) lo[i] = q[i]; if (q[i] > hi[i]) hi[i] = q[i]; } }));
    mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    reach = Math.max(3.4, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 + 0.5);
  }
  const k = Math.min(W, H) / (reach * 2.05), cx = W / 2, cy = H / 2;
  const proj = (q) => {
    const x = q[0] - mid[0], y = q[1] - mid[1], z = q[2] - mid[2];
    const X = x * ca + y * sa, Y = -x * sa + y * ca;
    return [cx - Y * k, cy - (X * se + z * ce) * k, X * ce - z * se];
  };
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  ctx.fillStyle = col.tile; ctx.fillRect(0, 0, W, H);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const path = (pts) => { ctx.beginPath(); for (let i = 0; i < pts.length; i++) { const p = proj(pts[i]); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); } ctx.closePath(); };
  if (!o.only) {
    /* the floor: the 18 inch starting square, the robot's shadow and an arrow showing which way is the front */
    const hl = cfg.length / 2, hw = cfg.width / 2;
    ctx.strokeStyle = col.tileLine; ctx.lineWidth = Math.max(1, W / 300); ctx.setLineDash([W / 60, W / 60]);
    path([[-9, -9, 0], [9, -9, 0], [9, 9, 0], [-9, 9, 0]]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#000'; ctx.globalAlpha = 0.2; path([[-hl, -hw, 0], [hl, -hw, 0], [hl, hw, 0], [-hl, hw, 0]]); ctx.fill(); ctx.globalAlpha = 1;
    const f = hl + 1.6;
    ctx.fillStyle = cfg.alliance === 'red' ? col.red : col.blue;
    path([[f, -1.3, 0], [f + 1.8, -1.3, 0], [f + 1.8, -2.4, 0], [f + 4.2, 0, 0], [f + 1.8, 2.4, 0], [f + 1.8, 1.3, 0], [f, 1.3, 0]]); ctx.fill();
    if (o.pick && BBZ.PARTS[o.pick] && (!BBZ.PARTS[o.pick].tool || cfg.tools[BBZ.PARTS[o.pick].tool])) {
      /* a yellow ring on the floor marks the part that is selected */
      const p = BBZ.partPos(cfg, o.pick), ring = [];
      for (let i = 0; i < 20; i++) ring.push([p.x + Math.cos(i / 20 * 6.2832) * 4.2, p.y + Math.sin(i / 20 * 6.2832) * 4.2, 0]);
      ctx.strokeStyle = col.accent; ctx.lineWidth = Math.max(2, W / 150); path(ring); ctx.stroke();
    }
  }
  /* faces are turned to the viewer, hidden ones dropped, and the rest painted far to near */
  const list = [];
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i];
    if (f.ball) { const p = proj(f.c); list.push({ f, p, d: p[2] }); continue; }
    if (f.line) { const a = proj(f.p[0]), b = proj(f.p[1]); list.push({ f, p: [a, b], d: (a[2] + b[2]) / 2 - 0.3 }); continue; }
    const n = f.n, X = n[0] * ca + n[1] * sa, Y = -n[0] * sa + n[1] * ca;
    let r = -Y, u = X * se + n[2] * ce, dd = X * ce - n[2] * se;
    if (dd > 0.02) { if (f.a === 1) continue; r = -r; u = -u; dd = -dd; }
    const p = []; let d = 0;
    for (let j = 0; j < f.p.length; j++) { const q = proj(f.p[j]); p.push(q); d += q[2]; }
    list.push({ f, p, d: d / p.length + f.bias, light: 0.5 + 0.56 * Math.max(0, r * -0.35 + u * 0.75 + dd * -0.56) });
  }
  list.sort((a, b) => b.d - a.d);
  const lw = Math.max(0.7, W / 520);
  for (let i = 0; i < list.length; i++) {
    const it = list[i], f = it.f, p = it.p;
    if (f.ball) {
      const rad = f.r * k, gr = ctx.createRadialGradient(p[0] - rad * 0.35, p[1] - rad * 0.4, rad * 0.1, p[0], p[1], rad);
      gr.addColorStop(0, shade(f.col, 1.25)); gr.addColorStop(1, shade(f.col, 0.62));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, 6.2832); ctx.fill();
      continue;
    }
    if (f.line) { ctx.strokeStyle = f.col; ctx.lineWidth = f.w * lw * 1.5; ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.stroke(); continue; }
    ctx.beginPath();
    for (let m = 0; m < p.length; m++) { if (m) ctx.lineTo(p[m][0], p[m][1]); else ctx.moveTo(p[m][0], p[m][1]); }
    ctx.closePath();
    if (f.a < 1) {
      ctx.globalAlpha = f.a; ctx.fillStyle = shade(f.col, it.light); ctx.fill();
      ctx.globalAlpha = 0.55; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = lw; ctx.stroke(); ctx.globalAlpha = 1;
    } else {
      const c = shade(f.col, it.light);
      ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.stroke();
    }
  }
  if (o.label) { ctx.fillStyle = col.tileText; ctx.font = '600 ' + Math.round(W / 34) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Drag to turn the robot. The arrow on the floor points to the FRONT.', W / 2, H - W / 40); }
}

/* Lets someone turn a picture by dragging it. */
function orbit(cv, view, redraw, onGrab) {
  let on = false, lx = 0, ly = 0;
  cv.style.touchAction = 'none'; cv.style.cursor = 'grab';
  cv.addEventListener('pointerdown', (e) => {
    on = true; lx = e.clientX; ly = e.clientY; cv.style.cursor = 'grabbing';
    try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    if (onGrab) onGrab(true);
    e.preventDefault();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!on) return;
    view.yaw -= (e.clientX - lx) * 0.011; view.pitch = Math.max(0.12, Math.min(1.4, view.pitch + (e.clientY - ly) * 0.008));
    lx = e.clientX; ly = e.clientY; redraw();
  });
  const end = () => { if (!on) return; on = false; cv.style.cursor = 'grab'; if (onGrab) onGrab(false); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
}

BBZ.Bot3D = { draw, orbit, parts: Object.keys(PART), count: (cfg, only) => build(cfg, only).length };
})();
