/* Shooter Lab 3D view: a small WebGL renderer for STL meshes, wheels, balls, the HIVE and shot paths. World is z-up, metres. */
(function () {
'use strict';
const BBZ = window.BBZ = window.BBZ || {};

/* ---------- 4x4 matrices, column-major ---------- */
const M = {
  ident: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s;
    }
    return o;
  },
  persp(fov, asp, n, f) {
    const t = 1 / Math.tan(fov / 2), o = new Float32Array(16);
    o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
    return o;
  },
  look(e, c, up) {
    const z = norm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]), x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
      -dot(x, e), -dot(y, e), -dot(z, e), 1]);
  },
  /* translate to p, rotate by angle about unit axis a, then scale by s */
  trs(p, a, ang, s) {
    const c = Math.cos(ang || 0), sn = Math.sin(ang || 0), t = 1 - c, [x, y, z] = a || [0, 0, 1];
    s = s == null ? 1 : s;
    const sx = Array.isArray(s) ? s : [s, s, s];
    return new Float32Array([
      (t * x * x + c) * sx[0], (t * x * y + sn * z) * sx[0], (t * x * z - sn * y) * sx[0], 0,
      (t * x * y - sn * z) * sx[1], (t * y * y + c) * sx[1], (t * y * z + sn * x) * sx[1], 0,
      (t * x * z + sn * y) * sx[2], (t * y * z - sn * x) * sx[2], (t * z * z + c) * sx[2], 0,
      p[0], p[1], p[2], 1]);
  }
};
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

/* ---------- geometry builders: each returns { p, n, c } flat arrays ---------- */
function fromTris(tris, col) {
  const n = tris.length / 9, p = new Float32Array(tris), nn = new Float32Array(tris.length), cc = new Float32Array(tris.length);
  for (let i = 0; i < n; i++) {
    const o = i * 9, a = [p[o], p[o + 1], p[o + 2]];
    const f = norm(cross([p[o + 3] - a[0], p[o + 4] - a[1], p[o + 5] - a[2]], [p[o + 6] - a[0], p[o + 7] - a[1], p[o + 8] - a[2]]));
    for (let k = 0; k < 3; k++) { nn.set(f, o + k * 3); cc.set(col, o + k * 3); }
  }
  return { p, n: nn, c: cc };
}

/* A wheel along the y axis, radius 1 and half-width 1 (scaled by the model matrix), with light and dark tread bands so the spin shows. */
function wheelGeo(dark, light, hub) {
  const P = [], N = [], C = [], seg = 48;
  const put = (p, n, c) => { P.push(...p); N.push(...n); C.push(...c); };
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
    const col = i % 6 === 0 ? light : dark;
    const q = (a, y) => [Math.cos(a), y, Math.sin(a)], nq = (a) => [Math.cos(a), 0, Math.sin(a)];
    put(q(a0, -1), nq(a0), col); put(q(a1, -1), nq(a1), col); put(q(a1, 1), nq(a1), col);
    put(q(a0, -1), nq(a0), col); put(q(a1, 1), nq(a1), col); put(q(a0, 1), nq(a0), col);
    for (const y of [-1, 1]) {
      const sc = i % 12 < 6 ? hub : dark;
      put([0, y, 0], [0, y, 0], hub); put(q(a0, y), [0, y, 0], sc); put(q(a1, y), [0, y, 0], sc);
    }
  }
  return { p: new Float32Array(P), n: new Float32Array(N), c: new Float32Array(C) };
}

/* A unit sphere with darker spots where the game piece has its cut-outs. */
function ballGeo() {
  const P = [], N = [], C = [], rings = 14, segs = 24;
  const holes = [];
  for (let i = 0; i < 14; i++) {                         // spread hole centres evenly (golden spiral)
    const y = 1 - (i + 0.5) / 7, r = Math.sqrt(Math.max(0, 1 - y * y)), t = i * 2.39996;
    holes.push([Math.cos(t) * r, Math.sin(t) * r, y]);
  }
  const col = (v) => holes.some((h) => dot(h, v) > 0.94) ? [0.35, 0.35, 0.35] : [1, 1, 1];
  const V = (i, j) => { const th = i / rings * Math.PI, ph = j / segs * Math.PI * 2; return [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)]; };
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = V(i, j), b = V(i + 1, j), c = V(i + 1, j + 1), d = V(i, j + 1);
    for (const v of [a, b, c, a, c, d]) { P.push(...v); N.push(...v); C.push(...col(v)); }
  }
  return { p: new Float32Array(P), n: new Float32Array(N), c: new Float32Array(C) };
}

function boxGeo() {
  const t = [];
  const v = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  for (const f of [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [3, 0, 4], [3, 4, 7]]) for (const i of f) t.push(...v[i]);
  return fromTris(t, [1, 1, 1]);
}

/* ---------- the view ---------- */
const VS = `attribute vec3 aP; attribute vec3 aN; attribute vec3 aC;
uniform mat4 uM; uniform mat4 uVP; uniform vec4 uTint;
varying vec3 vN; varying vec3 vC; varying float vA;
void main() { gl_Position = uVP * uM * vec4(aP, 1.0); vN = mat3(uM) * aN; vC = aC * uTint.rgb; vA = uTint.a; }`;
const FS = `precision mediump float;
varying vec3 vN; varying vec3 vC; varying float vA; uniform float uLit;
void main() {
  vec3 n = normalize(vN);
  float l = 0.38 + 0.5 * abs(dot(n, normalize(vec3(0.4, -0.5, 0.75)))) + 0.17 * abs(dot(n, normalize(vec3(-0.6, 0.7, 0.2))));
  gl_FragColor = vec4(vC * mix(1.0, l, uLit), vA);
}`;

function create(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false }) || canvas.getContext('experimental-webgl');
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn('Shooter Lab 3D:', gl.getProgramInfoLog(prog)); return null; }
  gl.useProgram(prog);
  const loc = { aP: gl.getAttribLocation(prog, 'aP'), aN: gl.getAttribLocation(prog, 'aN'), aC: gl.getAttribLocation(prog, 'aC'),
    uM: gl.getUniformLocation(prog, 'uM'), uVP: gl.getUniformLocation(prog, 'uVP'), uTint: gl.getUniformLocation(prog, 'uTint'), uLit: gl.getUniformLocation(prog, 'uLit') };
  const geos = {};
  const view = { cam: { target: [0.7, 0, 0.6], yaw: -2.2, pitch: 0.35, dist: 3.2 }, bg: [0.1, 0.11, 0.09] };

  function upload(key, g, mode) {
    const old = geos[key];
    const bufs = old ? old.bufs : [gl.createBuffer(), gl.createBuffer(), gl.createBuffer()];
    [g.p, g.n, g.c].forEach((arr, i) => { gl.bindBuffer(gl.ARRAY_BUFFER, bufs[i]); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW); });
    geos[key] = { bufs, count: g.p.length / 3, mode: mode || gl.TRIANGLES };
  }
  view.setTris = (key, tris, col) => upload(key, fromTris(tris, col || [1, 1, 1]));
  /* Many parts in one buffer, each with its own colour: [{ tris, color }] */
  view.setParts = (key, parts) => {
    const n = parts.reduce((a, q) => a + q.tris.length, 0), P = new Float32Array(n), N = new Float32Array(n), C = new Float32Array(n);
    let k = 0;
    for (const q of parts) { const g = fromTris(q.tris, q.color); P.set(g.p, k); N.set(g.n, k); C.set(g.c, k); k += q.tris.length; }
    upload(key, { p: P, n: N, c: C });
  };
  view.setLines = (key, pts, col) => {
    const p = new Float32Array(pts), c = new Float32Array(pts.length);
    for (let i = 0; i < c.length; i += 3) c.set(col, i);
    upload(key, { p, n: new Float32Array(pts.length), c }, gl.LINES);
  };
  view.has = (key) => !!geos[key];
  view.drop = (key) => { if (geos[key]) { geos[key].bufs.forEach((b) => gl.deleteBuffer(b)); delete geos[key]; } };
  upload('wheel', wheelGeo([0.16, 0.17, 0.15], [0.95, 0.75, 0.1], [0.55, 0.57, 0.52]));
  upload('ball', ballGeo());
  upload('box', boxGeo());

  /* items: [{ geo, m (model matrix), tint [r,g,b,a], lit (default true) }] */
  view.draw = function (items) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(view.bg[0], view.bg[1], view.bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    const c = view.cam, cp = Math.cos(c.pitch);
    const eye = [c.target[0] + c.dist * cp * Math.cos(c.yaw), c.target[1] + c.dist * cp * Math.sin(c.yaw), c.target[2] + c.dist * Math.sin(c.pitch)];
    const vp = M.mul(M.persp(0.8, w / h, Math.max(0.005, c.dist * 0.01), c.dist * 40), M.look(eye, c.target, [0, 0, 1]));
    const zb = norm([eye[0] - c.target[0], eye[1] - c.target[1], eye[2] - c.target[2]]), xb = norm(cross([0, 0, 1], zb));
    view.basis = { eye, x: xb, y: cross(zb, xb), z: zb, asp: w / h };
    gl.uniformMatrix4fv(loc.uVP, false, vp);
    const solid = items.filter((it) => !it.tint || it.tint[3] == null || it.tint[3] >= 1);
    const clear = items.filter((it) => it.tint && it.tint[3] != null && it.tint[3] < 1);
    const one = (it) => {
      const g = geos[it.geo]; if (!g || !g.count) return;
      gl.uniformMatrix4fv(loc.uM, false, it.m || M.ident());
      const t = it.tint || [1, 1, 1, 1];
      gl.uniform4f(loc.uTint, t[0], t[1], t[2], t[3] == null ? 1 : t[3]);
      gl.uniform1f(loc.uLit, it.lit === false || g.mode === gl.LINES ? 0 : 1);
      [loc.aP, loc.aN, loc.aC].forEach((a, i) => { gl.bindBuffer(gl.ARRAY_BUFFER, g.bufs[i]); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 0, 0); });
      gl.drawArrays(g.mode, 0, g.count);
    };
    gl.disable(gl.BLEND); gl.depthMask(true);
    solid.forEach(one);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    clear.forEach(one);
    gl.depthMask(true);
  };

  /* A ray from the camera through a point on the canvas, for picking and dragging parts. */
  view.ray = function (cx, cy) {
    const b = view.basis; if (!b) return null;
    const r = canvas.getBoundingClientRect(), t = Math.tan(0.4);
    const nx = ((cx - r.left) / r.width * 2 - 1) * t * b.asp, ny = (1 - (cy - r.top) / r.height * 2) * t;
    return { o: b.eye, d: norm([-b.z[0] + b.x[0] * nx + b.y[0] * ny, -b.z[1] + b.x[1] * nx + b.y[1] * ny, -b.z[2] + b.x[2] * nx + b.y[2] * ny]) };
  };

  /* Drag a part when the press lands on one (view.pick returns a handle), otherwise turn the camera.
     Scroll or pinch zooms, right-drag or shift-drag pans. */
  const pts = new Map();
  let last = null, grab = null;
  canvas.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, [e.clientX, e.clientY]); canvas.setPointerCapture(e.pointerId); last = null;
    if (pts.size === 1 && e.button === 0 && !e.shiftKey && view.pick) {
      const ray = view.ray(e.clientX, e.clientY);
      grab = ray && view.pick(ray);
      if (grab) canvas.style.cursor = 'grabbing';
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (grab && pts.has(e.pointerId)) { const ray = view.ray(e.clientX, e.clientY); if (ray) view.dragTo(grab, ray); return; }
    if (!pts.size && view.pick && e.pointerType === 'mouse') {
      const ray = view.ray(e.clientX, e.clientY);
      canvas.style.cursor = ray && view.pick(ray, true) ? 'move' : '';
    }
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    const c = view.cam;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (last) c.dist = Math.min(30, Math.max(0.1, c.dist * last / d));
      last = d; return;
    }
    const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
    if (e.shiftKey || e.buttons === 2) {
      const s = c.dist * 0.0016, rx = [-Math.sin(c.yaw), Math.cos(c.yaw), 0];
      c.target = [c.target[0] - rx[0] * dx * s, c.target[1] - rx[1] * dx * s, c.target[2] + dy * s];
    } else {
      c.yaw -= dx * 0.008;
      c.pitch = Math.max(-1.45, Math.min(1.45, c.pitch + dy * 0.008));
    }
    view.moved = true;
  });
  const up = (e) => {
    pts.delete(e.pointerId); last = null;
    if (grab && !pts.size) { const g = grab; grab = null; canvas.style.cursor = ''; view.dragEnd(g); }
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.cam.dist = Math.min(30, Math.max(0.1, view.cam.dist * Math.exp(e.deltaY * 0.0012))); view.moved = true; }, { passive: false });
  return view;
}

BBZ.LabGL = { create, M };
})();
