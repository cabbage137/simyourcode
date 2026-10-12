/* A small 3D picture of the robot for the Build Bot tab. It is drawn on an ordinary 2D canvas from boxes and
   cylinders, so it needs no 3D library and no graphics card. Pictures are only redrawn when something changes. */
(function () {
'use strict';
const BBZ = window.BBZ;
if (!BBZ || !BBZ.partPos) return;
const C = { motor: '#d2a52c', intake: '#2f9a5f', launcher: '#e8892b', lift: '#19a7b8', liftDark: '#0d5762', servo: '#8b63d9', hub: '#7f8892', battery: '#2d5da6',
  sensor: '#e0559a', camera: '#22b8cf', dark: '#30363c', plate: '#565f66', wood: '#8a6230', imu: '#f4f4f0', wheel: '#1d2023', tread: '#4a5057', rubber: '#3b2a12', led: '#35d07f' };

/* ---------- shapes ---------- */
/* Collects solid shapes. Each one is convex, so drawing its faces back to front is always right. */
function builder() {
  const objs = [];
  let T = { ox: 0, oy: 0, c: 1, s: 0 };
  const at = (x, y, z) => [T.ox + x * T.c - y * T.s, T.oy + x * T.s + y * T.c, z];
  const push = (faces, tag, base) => {
    let cx = 0, cy = 0, cz = 0, n = 0;
    faces.forEach((f) => f.p.forEach((q) => { cx += q[0]; cy += q[1]; cz += q[2]; n++; }));
    objs.push({ faces, c: [cx / n, cy / n, cz / n], tag: tag || '', base: !!base });
  };
  const g = {
    objs, tag: '',
    /* run `fn` with everything it draws moved to (x, y) and turned by `rot` */
    place(x, y, rot, fn) {
      const old = T, c = Math.cos(rot), s = Math.sin(rot), o = at(x, y, 0);
      T = { ox: o[0], oy: o[1], c: old.c * c - old.s * s, s: old.s * c + old.c * s };
      fn(); T = old;
    },
    box(x, y, z, sx, sy, sz, col, base) {
      const a = sx / 2, b = sy / 2, h = sz / 2;
      const v = [[-a, -b, -h], [a, -b, -h], [a, b, -h], [-a, b, -h], [-a, -b, h], [a, -b, h], [a, b, h], [-a, b, h]].map((q) => at(x + q[0], y + q[1], z + q[2]));
      push([[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]].map((f) => ({ p: f.map((i) => v[i]), col })), g.tag, base);
    },
    /* axis is 'x', 'y' or 'z' in the current frame; `cap` colours the two round ends */
    cyl(x, y, z, r, len, axis, col, cap) {
      const n = 12, A = [], B = [], h = len / 2;
      for (let i = 0; i < n; i++) {
        const t = i / n * 6.2832, u = Math.cos(t) * r, w = Math.sin(t) * r;
        if (axis === 'z') { A.push(at(x + u, y + w, z - h)); B.push(at(x + u, y + w, z + h)); }
        else if (axis === 'y') { A.push(at(x + u, y - h, z + w)); B.push(at(x + u, y + h, z + w)); }
        else { A.push(at(x - h, y + u, z + w)); B.push(at(x + h, y + u, z + w)); }
      }
      const faces = [];
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; faces.push({ p: [A[i], A[j], B[j], B[i]], col }); }
      faces.push({ p: A, col: cap || col }, { p: B, col: cap || col });
      push(faces, g.tag);
    }
  };
  return g;
}

/* ---------- parts, each drawn in its own frame: the origin is the part's spot and +x is the way it points ---------- */
const PART = {
  hub(g, cfg) {
    g.box(0, 0, 3.1, 5.2, 3, 1.2, C.hub);
    g.box(-2, 1, 3.76, 0.5, 0.5, 0.12, C.led);
    if (cfg.tools.imu) g.box(1.6, 0, 3.76, 0.9, 0.9, 0.12, C.imu);
  },
  battery(g) { g.box(0, 0, 3.3, 5.2, 2.6, 1.6, C.battery); g.box(2.2, 0, 4.14, 0.5, 2, 0.1, '#9fc0f0'); },
  distance(g) { g.box(0, 0, 3.2, 1.2, 1.8, 1.4, C.sensor); g.box(0.62, 0, 3.3, 0.1, 1.2, 0.6, '#5b1638'); },
  camera(g) {
    g.box(-0.3, 0, 4.2, 0.5, 0.5, 3.6, C.dark);
    g.box(0, 0, 6.4, 1.4, 2.4, 1.3, '#20262c');
    g.cyl(0.85, 0, 6.4, 0.5, 0.35, 'x', C.camera);
  },
  launcher(g, cfg) {
    const kit = cfg.kit.launcher;
    if (kit === 'catapult') {
      g.box(-1, 0, 3, 3, 2.4, 1, C.dark);
      g.box(0.8, 0, 3.9, 6, 0.6, 0.5, C.wood);
      g.cyl(3.5, 0, 4.4, 1.3, 0.8, 'z', C.launcher, C.rubber);
      g.box(-3.3, 0, 3, 1.4, 2, 1.2, C.servo);
      return;
    }
    g.box(-3.6, 0, 3, 1.4, 2, 1.2, C.servo);
    if (kit === 'dual') {
      g.box(0, 0, 2.7, 4.4, 7, 0.35, C.dark);
      [2.05, -2.05].forEach((y) => { g.cyl(0, y, 3.6, 1.9, 1.2, 'z', C.launcher, C.rubber); g.cyl(0, y, 4.9, 0.8, 1.4, 'z', C.motor); });
      return;
    }
    g.box(0, 0.95, 4.3, 4.8, 0.25, 4.4, C.dark);
    g.box(0, -0.95, 4.3, 4.8, 0.25, 4.4, C.dark);
    g.cyl(0, 0, 4.7, 2.1, 1.2, 'y', C.launcher, C.rubber);
    g.cyl(0, 1.9, 4.7, 0.8, 1.6, 'y', C.motor);
    g.box(1.9, 0, 2.8, 2.2, 1.5, 0.3, C.hub);
  },
  lift(g, cfg) {
    if (cfg.kit.lift === 'arm') {
      g.box(-1.2, 0, 5.4, 1.4, 1.4, 6, C.liftDark);
      g.box(1.4, 0, 8.3, 5.4, 0.7, 0.7, C.lift);
      g.cyl(-1.2, 1.3, 8, 0.8, 1.4, 'y', C.motor);
      g.box(4.2, 0, 7.6, 1.2, 1.6, 1, C.servo);
      return;
    }
    g.box(0, 1.1, 8.4, 0.8, 0.5, 12, C.lift);
    g.box(0, -1.1, 8.4, 0.8, 0.5, 12, C.lift);
    g.box(0.4, 0, 6.2, 0.9, 1.7, 1.2, C.liftDark);
    g.cyl(-0.9, 0, 3.2, 0.8, 2, 'y', C.motor);
    g.box(1.1, 0, 7.1, 1.1, 1.6, 1, C.servo);
  },
  intake(g, cfg, span) {
    const kit = cfg.kit.intake;
    if (kit === 'claw') {
      g.box(-0.6, 0, 2.9, 1.8, 2.4, 1.4, C.servo);
      g.place(0.2, 0.9, 0.22, () => g.box(1.6, 0, 2.7, 3.2, 0.45, 0.9, C.intake));
      g.place(0.2, -0.9, -0.22, () => g.box(1.6, 0, 2.7, 3.2, 0.45, 0.9, C.intake));
      return;
    }
    if (kit === 'wheels') {
      const half = span / 2 * 0.62 - 0.4;
      g.cyl(0.8, 0, 1.5, 0.28, half * 2 + 0.8, 'y', C.hub);
      for (let i = 0; i < 4; i++) g.cyl(0.8, -half + 0.5 + i * (half * 2 - 1) / 3, 1.5, 1.25, 0.8, 'y', C.intake, '#1f6b42');
      return;
    }
    const len = span - 4.4;
    g.box(0, len / 2 + 0.3, 1.7, 2, 0.3, 2.2, C.dark);
    g.box(0, -len / 2 - 0.3, 1.7, 2, 0.3, 2.2, C.dark);
    g.cyl(0.4, 0, 1.5, 0.95, len, 'y', C.intake, '#1f6b42');
  }
};

function chassis(g, cfg) {
  const hl = cfg.length / 2, hw = cfg.width / 2, R = BBZ.WHEELS[cfg.wheel].d / 2, paint = BBZ.PAINTS[cfg.paint] || '#9aa39a';
  g.tag = 'drive';
  g.box(0, 0, 2.3, cfg.length - (cfg.drive === 'xdrive' ? 4.4 : 0), cfg.width - (cfg.drive === 'xdrive' ? 4.4 : 1.8), 0.4, C.plate, true);
  [hw - 1.9, -hw + 1.9].forEach((y) => g.box(0, y, 3, cfg.length - (cfg.drive === 'xdrive' ? 7 : 2.4), 0.7, 1, paint));
  [hl - 1.5, -hl + 1.5].forEach((x) => g.box(x, 0, 3, 0.7, cfg.width - (cfg.drive === 'xdrive' ? 7.6 : 5.4), 1, paint));
  if (cfg.drive === 'xdrive') {
    [[1, 1, -1], [1, -1, 1], [-1, 1, 1], [-1, -1, -1]].forEach((q) => {
      const x = q[0] * (hl - 2.2), y = q[1] * (hw - 2.2);
      g.place(x, y, q[2] * Math.PI / 4, () => g.cyl(0, 0, R, R, 1.7, 'y', C.wheel, C.tread));
      g.cyl(x * 0.66, y * 0.66, 3.3, 0.8, 1.5, 'z', C.motor);
    });
  } else if (cfg.drive === 'tank') {
    [1, -1].forEach((s) => {
      g.cyl(-0.4, s * (hw - 0.6), R, R, 1.8, 'y', C.wheel, C.tread);
      g.cyl(-0.4, s * (hw - 2.7), R, 0.75, 2, 'y', C.motor);
      g.cyl(hl - 2.4, s * (hw - 1.2), 0.95, 0.95, 1, 'y', C.tread, C.wheel);
    });
  } else {
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach((q) => {
      g.cyl(q[0] * (hl - 2.6), q[1] * (hw - 0.6), R, R, 1.8, 'y', C.wheel, C.tread);
      g.cyl(q[0] * (hl - 2.6), q[1] * (hw - 2.7), R, 0.75, 2, 'y', C.motor);
    });
  }
}

/* Everything on the robot, or just one piece of it when `only` names a part ('drive' is the chassis and wheels). */
function build(cfg, only) {
  const g = builder();
  if (only && only !== 'drive') {
    g.tag = only;
    PART[only](g, cfg, cfg.width);
    return g.objs;
  }
  chassis(g, cfg);
  if (only === 'drive') return g.objs;
  BBZ.partList(cfg).forEach((p) => {
    g.tag = p.key;
    g.place(p.x, p.y, p.face * Math.PI / 2, () => PART[p.key](g, cfg, p.face % 2 === 0 ? cfg.width : cfg.length));
  });
  return g.objs;
}

/* ---------- drawing ---------- */
const shadeCache = new Map();
function shade(hex, k) {
  const key = hex + (k * 24 | 0);
  let s = shadeCache.get(key);
  if (s) return s;
  const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  s = 'rgb(' + f(n >> 16 & 255) + ',' + f(n >> 8 & 255) + ',' + f(n & 255) + ')';
  if (shadeCache.size > 4000) shadeCache.clear();
  shadeCache.set(key, s);
  return s;
}
/* o: { yaw, pitch, only, pick, label, colors } */
function draw(cv, cfg, o) {
  o = o || {};
  const col = o.colors || BBZ.colors(), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  const yaw = o.yaw === undefined ? -0.9 : o.yaw, pitch = o.pitch === undefined ? 0.62 : o.pitch;
  const ca = Math.cos(yaw), sa = Math.sin(yaw), ce = Math.cos(pitch), se = Math.sin(pitch);
  const objs = build(cfg, o.only);
  /* centre and size the picture on what is being shown */
  let mid = [0, 0, o.only && o.only !== 'drive' ? 0 : 3.5], reach = 13.2;
  if (o.only && o.only !== 'drive') {
    let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    objs.forEach((ob) => ob.faces.forEach((f) => f.p.forEach((q) => { for (let i = 0; i < 3; i++) { if (q[i] < lo[i]) lo[i] = q[i]; if (q[i] > hi[i]) hi[i] = q[i]; } })));
    mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    reach = Math.max(3.2, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 + 0.6);
  }
  const k = Math.min(W, H) / (reach * 2.05), cx = W / 2, cy = H / 2;
  const proj = (q) => {
    const x = q[0] - mid[0], y = q[1] - mid[1], z = q[2] - mid[2];
    const X = x * ca + y * sa, Y = -x * sa + y * ca;
    return [cx - Y * k, cy - (X * se + z * ce) * k, X * ce - z * se];
  };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = col.tile; ctx.fillRect(0, 0, W, H);
  ctx.lineJoin = 'round';
  if (!o.only) {
    /* the floor: the 18 inch starting square and an arrow showing which way is the front */
    const path = (pts) => { ctx.beginPath(); pts.forEach((q, i) => { const p = proj(q); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); };
    ctx.strokeStyle = col.tileLine; ctx.lineWidth = Math.max(1, W / 300); ctx.setLineDash([W / 60, W / 60]);
    path([[-9, -9, 0], [9, -9, 0], [9, 9, 0], [-9, 9, 0]]); ctx.stroke(); ctx.setLineDash([]);
    const f = cfg.length / 2 + 1.6;
    ctx.fillStyle = cfg.alliance === 'red' ? col.red : col.blue;
    path([[f, -1.3, 0], [f + 1.8, -1.3, 0], [f + 1.8, -2.4, 0], [f + 4.2, 0, 0], [f + 1.8, 2.4, 0], [f + 1.8, 1.3, 0], [f, 1.3, 0]]); ctx.fill();
  }
  const list = objs.map((ob) => ({ ob, d: proj(ob.c)[2] }));
  list.sort((a, b) => (b.ob.base - a.ob.base) || (b.d - a.d));
  const lw = Math.max(0.8, W / 420);
  for (let i = 0; i < list.length; i++) {
    const ob = list[i].ob, picked = o.pick && ob.tag === o.pick;
    const faces = ob.faces.map((f) => { const p = f.p.map(proj); let d = 0; for (let j = 0; j < p.length; j++) d += p[j][2]; return { f, p, d: d / p.length }; });
    faces.sort((a, b) => b.d - a.d);
    for (let j = 0; j < faces.length; j++) {
      const F = faces[j], q = F.f.p;
      /* how squarely the face meets a light above and to the left of the viewer decides how bright it is */
      const ux = q[1][0] - q[0][0], uy = q[1][1] - q[0][1], uz = q[1][2] - q[0][2], vx = q[2][0] - q[0][0], vy = q[2][1] - q[0][1], vz = q[2][2] - q[0][2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
      const X = nx * ca + ny * sa, Y = -nx * sa + ny * ca;
      let r = -Y, u = X * se + nz * ce, dd = X * ce - nz * se;
      if (dd > 0) { r = -r; u = -u; dd = -dd; }
      const light = 0.56 + 0.5 * Math.max(0, r * -0.35 + u * 0.75 + dd * -0.56);
      ctx.beginPath();
      for (let m = 0; m < F.p.length; m++) { if (m) ctx.lineTo(F.p[m][0], F.p[m][1]); else ctx.moveTo(F.p[m][0], F.p[m][1]); }
      ctx.closePath();
      const c = shade(F.f.col, light);
      ctx.fillStyle = c; ctx.fill();
      ctx.strokeStyle = picked ? col.accent : c; ctx.lineWidth = picked ? lw * 1.6 : lw; ctx.stroke();
    }
  }
  if (o.label) { ctx.fillStyle = col.tileText; ctx.font = '600 ' + Math.round(W / 34) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Drag to turn the robot. The arrow on the floor points to the FRONT.', W / 2, H - W / 40); }
}

/* Lets someone turn a picture by dragging it. `view` holds { yaw, pitch } and `redraw` repaints the canvas. */
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
    view.yaw -= (e.clientX - lx) * 0.011; view.pitch = Math.max(0.18, Math.min(1.4, view.pitch + (e.clientY - ly) * 0.008));
    lx = e.clientX; ly = e.clientY; redraw();
  });
  const end = () => { if (!on) return; on = false; cv.style.cursor = 'grab'; if (onGrab) onGrab(false); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
}

BBZ.Bot3D = { draw, orbit, parts: Object.keys(PART) };
})();
