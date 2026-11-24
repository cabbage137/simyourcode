/* Shooter Lab tab: settings, example shooters, STL loading, the auto-feeder, the 3D view and the results. */
(function () {
'use strict';
const BBZ = window.BBZ = window.BBZ || {};
const L = BBZ.Lab, V = L.vec, IN = L.IN;
const $ = (id) => document.getElementById(id);
if (!L || !$('view-lab')) return;

/* ---------- settings ---------- */
const EXAMPLES = [
  { id: 'hood90', name: 'Single flywheel, 90° hood', blurb: 'The most common FTC shooter: one wheel under a curved hood. The ball rolls between the spinning wheel and the still hood, so it leaves at about half the wheel\'s rim speed with backspin.', wrap: 90, second: 'none' },
  { id: 'hood150', name: 'Single flywheel, long 150° wrap', blurb: 'Balls enter low at the front and ride round the back of the wheel. A longer wrap gives more time to grip, so it copes with less compression.', wrap: 150, second: 'none' },
  { id: 'double', name: 'Double flywheel, no hood', blurb: 'Two wheels spinning opposite ways squeeze the ball between them. It leaves at about the full rim speed with almost no spin.', wrap: 0, second: 'double' },
  { id: 'transfer', name: '90° hood with a transfer roller', blurb: 'A slow roller pushes each ball up a ramp into the hood, like a real transfer system. Watch how the roller speed changes the feed.', wrap: 90, second: 'transfer' }
];
const DEF = {
  src: 'ex', example: 'hood90', launch: 45, wrap: 90, comp: 10, exMat: 'pla',
  stlUnits: '0.001', stlMat: 'pla', stlRot: '0', stlX: 0, stlY: 0, stlZ: 0, feedX: -90, feedZ: -40, feedA: 45,
  wheel: 'tpe96', wheelD: 96, wheelW: 38, wheelM: 75, wheelN: 1, discs: 1, dir: 1,
  second: 'none', roller: 'roller48', rollerRpm: 1200, rollerMotor: 'gb1620', secX: 0, secZ: -150,
  motor: 'gb6000', ratio: 1, custFree: 6000, custStall: 0.144, rpm: 2600, V: 12.5, tested: true,
  ball: 'P', count: 6, interval: 0.6, feedV: 1, wait: true,
  dist: 59, H: 12, tilt: 20,
  mass: 0, sqW: 0, sqD: 0, dropH: 0, bounceH: 0, muW: 100, muH: 100, Cd: 0.5, Cl: 100, air: true
};
let S = Object.assign({}, DEF);
try { const saved = JSON.parse(localStorage.getItem('bbz-lab') || 'null'); if (saved && typeof saved === 'object') for (const k in DEF) if (typeof saved[k] === typeof DEF[k]) S[k] = saved[k]; } catch (e) { /* storage blocked */ }
const save = () => { try { localStorage.setItem('bbz-lab', JSON.stringify(S)); } catch (e) { /* storage blocked */ } };

let stl = null;            // { tris (file units), name }
let sim = null, world = null, feeding = false, paused = false, timeScale = 1, fed = 0, lastFeed = -9, startT = null, spinUp = null;
let log = [], seen = 0, glv = null, colors = null, slowFrames = 0;

/* ---------- filling the controls ---------- */
const opt = (sel, list, val) => { sel.textContent = ''; list.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }); if (val != null) sel.value = val; };
opt($('labExample'), EXAMPLES.map((e) => [e.id, e.name]));
const mats = Object.keys(L.SURFACES).map((k) => [k, L.SURFACES[k].name]);
opt($('labExMat'), mats); opt($('labStlMat'), mats);
opt($('labWheel'), L.WHEELS.filter((w) => w.id !== 'roller48').map((w) => [w.id, w.name]));
opt($('labRoller'), L.WHEELS.map((w) => [w.id, w.name]));
opt($('labMotor'), L.MOTORS.map((m) => [m.id, m.name]));
opt($('labRollerMotor'), L.MOTORS.filter((m) => m.id !== 'custom').map((m) => [m.id, m.name]));

const FIELDS = { labExample: 'example', labLaunch: 'launch', labWrap: 'wrap', labComp: 'comp', labExMat: 'exMat', labStlUnits: 'stlUnits', labStlMat: 'stlMat',
  labStlRot: 'stlRot', labStlX: 'stlX', labStlY: 'stlY', labStlZ: 'stlZ', labFeedX: 'feedX', labFeedZ: 'feedZ', labFeedA: 'feedA', labWheel: 'wheel', labWheelD: 'wheelD',
  labWheelW: 'wheelW', labWheelM: 'wheelM', labWheelN: 'wheelN', labDiscs: 'discs', labDir: 'dir', labSecond: 'second', labRoller: 'roller', labRollerRpm: 'rollerRpm',
  labRollerMotor: 'rollerMotor', labSecX: 'secX', labSecZ: 'secZ', labMotor: 'motor', labRatio: 'ratio', labCustFree: 'custFree', labCustStall: 'custStall', labRpm: 'rpm',
  labV: 'V', labTested: 'tested', labCount: 'count', labInterval: 'interval', labFeedV: 'feedV', labWait: 'wait', labDist: 'dist', labH: 'H', labTilt: 'tilt',
  labMass: 'mass', labSqW: 'sqW', labSqD: 'sqD', labDropH: 'dropH', labBounceH: 'bounceH', labMuW: 'muW', labMuH: 'muH', labCd: 'Cd', labCl: 'Cl', labAir: 'air' };
/* Settings that change the running simulation without starting it again. */
const LIVE = new Set(['rpm', 'V', 'tested', 'count', 'interval', 'feedV', 'wait', 'Cd', 'Cl', 'air', 'rollerRpm']);

function writeUI() {
  for (const id in FIELDS) {
    const el = $(id), v = S[FIELDS[id]];
    if (el.type === 'checkbox') el.checked = !!v; else el.value = String(v);
  }
  $('labSrcEx').setAttribute('aria-pressed', String(S.src === 'ex'));
  $('labSrcStl').setAttribute('aria-pressed', String(S.src === 'stl'));
  $('labBallP').setAttribute('aria-pressed', String(S.ball === 'P'));
  $('labBallR').setAttribute('aria-pressed', String(S.ball !== 'P'));
  labels();
}

function labels() {
  const ex = EXAMPLES.find((e) => e.id === S.example) || EXAMPLES[0];
  $('labExBox').hidden = S.src !== 'ex'; $('labStlBox').hidden = S.src !== 'stl';
  $('labExBlurb').textContent = ex.blurb;
  $('labWrap').disabled = ex.wrap === 0;
  $('labLaunchOut').textContent = S.launch + '°';
  $('labWrapOut').textContent = ex.wrap === 0 ? 'no hood' : S.wrap + '°';
  const D = L.BALLS[S.ball].d * 1000;
  $('labCompOut').textContent = S.comp + ' mm (' + Math.round(S.comp / D * 100) + '%)';
  $('labRpmOut').textContent = S.rpm + ' rpm';
  $('labVOut').textContent = (+S.V).toFixed(1) + ' V';
  $('labDistOut').textContent = S.dist + ' in';
  $('labHOut').textContent = S.H + ' in';
  $('labTiltOut').textContent = S.tilt + '°';
  $('labMuWOut').textContent = S.muW + '%'; $('labMuHOut').textContent = S.muH + '%'; $('labClOut').textContent = S.Cl + '%';
  $('labCustomBox').hidden = S.motor !== 'custom';
  const second = secondMode();
  $('labSecond').disabled = S.src === 'ex';
  if (S.src === 'ex') $('labSecond').value = second;
  $('labSecondBox').hidden = second === 'none' || S.src === 'ex' && second === 'double';
  for (const id of ['labSecPosX', 'labSecPosZ']) $(id).hidden = S.src === 'ex';
  for (const id of ['labRoller', 'labRollerRpm', 'labRollerMotor']) $(id).closest('label').hidden = second !== 'transfer';
  const mx = maxWheelRpm();
  $('labRpm').max = String(Math.max(500, Math.ceil(mx / 100) * 100));
}

function secondMode() { return S.src === 'ex' ? (EXAMPLES.find((e) => e.id === S.example) || EXAMPLES[0]).second : S.second; }
function motorOf(id) {
  const m = Object.assign({}, L.MOTORS.find((x) => x.id === id) || L.MOTORS[0]);
  if (m.id === 'custom') { m.free = +S.custFree || 6000; m.stall = +S.custStall || 0.144; }
  return m;
}
function maxWheelRpm() { const m = motorOf(S.motor); return m.free * (S.tested ? 0.9 : 1) * (S.V / 12) / (+S.ratio || 1); }
function wheelSpec() {
  const base = L.WHEELS.find((w) => w.id === S.wheel) || L.WHEELS[0];
  return Object.assign({}, base, { d: +S.wheelD || base.d, w: +S.wheelW || base.w, mass: +S.wheelM || base.mass });
}

/* ---------- building the world ---------- */

/* Calibration turns real measurements into model numbers. */
function calibration() {
  const out = { text: [] };
  if (S.mass > 0) { out.mass = S.mass / 1000; out.text.push('ball mass ' + S.mass + ' g'); }
  if (S.sqW > 0 && S.sqD > 0) { out.k = (S.sqW / 1000 * L.G) / (S.sqD / 1000); out.text.push('ball stiffness ' + Math.round(out.k) + ' N/m'); }
  if (S.dropH > 0 && S.bounceH > 0 && S.bounceH < S.dropH) { out.e = Math.sqrt(S.bounceH / S.dropH); out.text.push('bounce e = ' + out.e.toFixed(2) + ' on your hood material'); }
  return out;
}

/* Rotates and moves STL points (file units) into shooter space (metres, wheel centre at the origin). */
function stlToShooter(tris) {
  const s = +S.stlUnits, out = new Float32Array(tris.length), r = S.stlRot;
  const ax = r[0], ang = r === '0' ? 0 : (+r.slice(1)) * Math.PI / 180, c = Math.cos(ang), sn = Math.sin(ang);
  for (let i = 0; i < tris.length; i += 3) {
    let x = tris[i] * s, y = tris[i + 1] * s, z = tris[i + 2] * s;
    if (ax === 'x') { const yy = y * c - z * sn; z = y * sn + z * c; y = yy; }
    else if (ax === 'y') { const xx = x * c + z * sn; z = -x * sn + z * c; x = xx; }
    else if (ax === 'z') { const xx = x * c - y * sn; y = x * sn + y * c; x = xx; }
    out[i] = x + S.stlX / 1000; out[i + 1] = y + S.stlY / 1000; out[i + 2] = z + S.stlZ / 1000;
  }
  return out;
}

/* Floor chute with side guides along a straight path, for the double-flywheel example. */
function chuteTris(p0, p1, down, guide, ballR) {
  const out = [], quad = (a, b, c, d) => out.push(...a, ...b, ...c, ...a, ...c, ...d);
  const f0 = V.add(p0, V.mul(down, ballR + 0.002)), f1 = V.add(p1, V.mul(down, ballR + 0.002));
  quad(V.add(f0, [0, -guide, 0]), V.add(f1, [0, -guide, 0]), V.add(f1, [0, guide, 0]), V.add(f0, [0, guide, 0]));
  const up = V.mul(down, -(2 * ballR + 0.01));
  for (const y of [-guide, guide]) quad(V.add(f0, [0, y, 0]), V.add(f1, [0, y, 0]), V.add(V.add(f1, up), [0, y, 0]), V.add(V.add(f0, up), [0, y, 0]));
  return out;
}

/* The shooter in shooter space: triangles, material, the feed point and direction, and any second wheel. */
function shooterParts(spec) {
  const ball = L.BALLS[S.ball], R = ball.d / 2, rw = spec.d / 2000, comp = S.comp / 1000, gap = ball.d - comp;
  const hwTotal = (spec.w * S.wheelN + 10 * (S.wheelN - 1)) / 2000;
  const guide = Math.max(R + 0.006, hwTotal + 0.004), width = 2 * guide;
  if (S.src === 'stl') {
    const a = S.feedA * Math.PI / 180;
    const parts = { tris: stl ? stlToShooter(stl.tris) : new Float32Array(0), mat: Object.assign({}, L.SURFACES[S.stlMat]),
      feed: [S.feedX / 1000, 0, S.feedZ / 1000], dir: [Math.cos(a), 0, Math.sin(a)], second: null };
    if (S.second === 'double') parts.second = { c: [S.secX / 1000, 0, S.secZ / 1000], spec, dir: -S.dir, rpm: S.rpm, motor: S.motor, role: 'double' };
    if (S.second === 'transfer') parts.second = { c: [S.secX / 1000, 0, S.secZ / 1000], spec: L.WHEELS.find((w) => w.id === S.roller), dir: 1, rpm: S.rollerRpm, motor: S.rollerMotor, role: 'roller' };
    return parts;
  }
  const ex = EXAMPLES.find((e) => e.id === S.example) || EXAMPLES[0];
  const mat = Object.assign({}, L.SURFACES[S.exMat]);
  if (ex.id === 'double') {
    const A = S.launch * Math.PI / 180, d = [Math.cos(A), 0, Math.sin(A)], n = [-Math.sin(A), 0, Math.cos(A)];
    const P = (s) => V.add(V.mul(n, -(rw + gap / 2)), V.mul(d, s));
    const tris = chuteTris(P(-0.24), P(-(rw + 0.012)), V.mul(n, -1), guide, R);
    return { tris: new Float32Array(tris), mat, feed: P(-(rw + R + 0.012)), dir: d, mainDir: -1,
      second: { c: V.mul(n, -(2 * rw + gap)), spec, dir: 1, rpm: S.rpm, motor: S.motor, role: 'double' } };
  }
  const chute = ex.id === 'transfer' ? 0.26 : 0.08;
  const hood = L.hoodTris({ rw, gap, squeeze: comp, wrap: S.wrap, launch: S.launch, width, thick: 0.004, guide, chute, ballR: R });
  const parts = { tris: hood.tris, mat, feed: hood.feedPoint, dir: hood.entryDir, second: null };
  if (ex.id === 'transfer') {
    const a0 = (90 + S.launch + S.wrap) * Math.PI / 180, nrm = [Math.cos(a0), 0, Math.sin(a0)], t = [Math.sin(a0), 0, -Math.cos(a0)];
    const h0 = V.mul(nrm, rw + gap + comp), roller = L.WHEELS.find((w) => w.id === 'roller48'), rr = roller.d / 2000;
    /* the roller sits far enough down the ramp to clear the flywheel, and presses 5 mm into the ball */
    const clear = Math.sqrt(Math.max(0, (rw + rr + 0.006) ** 2 - (rw - rr) ** 2)) + 0.01;
    const ballAt = V.add(V.add(h0, V.mul(t, -clear)), V.mul(nrm, -(R + 0.002)));
    parts.second = { c: V.add(ballAt, V.mul(nrm, -(R + rr - 0.005))), spec: roller, dir: 1, rpm: S.rollerRpm, motor: S.rollerMotor, role: 'roller' };
    parts.feed = V.add(V.add(h0, V.mul(t, -(clear + 0.035))), V.mul(nrm, -(R + 0.003)));
  }
  return parts;
}

function build() {
  const spec = wheelSpec(), H = S.H * IN, lift = (p) => [p[0], p[1], p[2] + H];
  sim = new L.Sim();
  sim.setHive(S.dist * IN, S.tilt);
  const cal = calibration();
  sim.cal = { muWheel: S.muW / 100, muScale: S.muH / 100 };
  sim.ballCal = { mass: cal.mass, k: cal.k };
  applyAir();
  const parts = shooterParts(spec);
  const mat = parts.mat;
  if (cal.e) mat.e = cal.e;
  const tris = new Float32Array(parts.tris.length);
  for (let i = 0; i < tris.length; i++) tris[i] = parts.tris[i] + (i % 3 === 2 ? H : 0);
  if (tris.length) sim.addMesh(tris, mat, 'shooter');
  const mainDir = (parts.mainDir || 1) * S.dir;
  sim.addWheel({ c: [0, 0, H], a: [0, 1, 0], spec, width: spec.w * S.wheelN + 10 * (S.wheelN - 1), count: S.wheelN, motor: motorOf(S.motor),
    G: +S.ratio || 1, V: +S.V, tested: S.tested, target: 0, dir: mainDir, discs: +S.discs, spinUp: true });
  if (parts.second) {
    const p2 = parts.second, sp = Object.assign({}, p2.spec);
    sim.addWheel({ c: lift(p2.c), a: [0, 1, 0], spec: sp, width: p2.role === 'double' ? spec.w * S.wheelN + 10 * (S.wheelN - 1) : sp.w,
      count: p2.role === 'double' ? S.wheelN : 1, motor: motorOf(p2.motor), G: p2.role === 'double' ? +S.ratio || 1 : 1, V: +S.V, tested: S.tested,
      target: 0, dir: p2.role === 'double' ? -mainDir : p2.dir, discs: p2.role === 'double' ? +S.discs : 0, role: p2.role });
  }
  world = { H, feed: lift(parts.feed), dir: parts.dir, tris, parts, spec };
  feeding = false; fed = 0; lastFeed = -9; startT = null; spinUp = null; seen = 0;
  readGap();
  $('labCalInfo').textContent = cal.text.length ? 'Using your measurements: ' + cal.text.join(', ') + '.' : 'No measurements entered yet, so the lab uses typical values.';
  wheelInfo();
  uploadScene();
  setTargets();
}

function applyAir() {
  if (!sim) return;
  sim.env.air = S.air; sim.env.Cd = +S.Cd; sim.env.CLscale = S.Cl / 100;
}

/* Motors only drive once Start is pressed, so the spin-up shows. */
function setTargets() {
  if (!sim) return;
  sim.wheels.forEach((w) => {
    const on = startT != null;
    w.target = on ? (w.role === 'roller' ? +S.rollerRpm : +S.rpm) * Math.PI / 30 : 0;
    w.V = +S.V;
    w.motor.wFree = w.motor.free * (S.tested ? 0.9 : 1) * Math.PI / 30;
  });
}

function readGap() {
  const out = $('labGap'), ball = L.BALLS[S.ball], D = ball.d;
  const w = sim.wheels[0];
  let gap = Infinity;
  if (sim.wheels[1] && sim.wheels[1].role === 'double') gap = V.len(V.sub(sim.wheels[1].c, w.c)) - w.r - sim.wheels[1].r;
  else if (sim.meshes.length) gap = L.rimGap(w, sim.meshes).gap;
  if (!isFinite(gap)) { out.textContent = S.src === 'stl' && !stl ? 'Load an STL to see the gap between the wheel and your hood.' : 'No hood surface faces the wheel rim, so nothing squeezes the ball.'; return; }
  const c = D - gap;
  out.textContent = 'Narrowest gap ' + (gap * 1000).toFixed(1) + ' mm → compression ' + (c * 1000).toFixed(1) + ' mm (' + Math.round(c / D * 100) + '% of the ball)';
  if (c < 0) out.textContent += '. The ball is smaller than the gap and will not be gripped.';
  else if (c / D > 0.35) out.textContent += '. That is a lot of squeeze: balls may jam.';
}

function wheelInfo() {
  const w = sim.wheels[0], spec = w.spec, tgt = S.rpm * Math.PI / 30;
  const grow = L.wheelGrowth(spec, tgt) * 1000;
  $('labWheelInfo').textContent = 'Spinning inertia J = ' + (w.J * 1e4).toFixed(2) + ' kg·cm². Rim speed at the target: ' + (tgt * w.r).toFixed(1) + ' m/s. Grip μ ≈ ' +
    spec.mu.toFixed(2) + ' on the ball' + (grow > 0.05 ? '. This soft wheel grows about ' + grow.toFixed(1) + ' mm in radius at this speed, which adds squeeze.' : '.');
  const mx = maxWheelRpm(), m = motorOf(S.motor);
  $('labMotorInfo').textContent = 'Fastest this motor can turn the flywheel: ' + Math.round(mx) + ' rpm at ' + (+S.V).toFixed(1) + ' V. Stall torque ' + m.stall.toFixed(3) + ' N·m.' +
    (S.rpm > mx * 0.97 ? ' The target is at or past the limit, so the wheel will never quite reach it.' : '') + (spinUp != null ? ' Spin-up to 98%: ' + spinUp.toFixed(2) + ' s.' : '');
}

/* ---------- 3D ---------- */
function cssColor(name, fb) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = /^#([0-9a-f]{6})$/i.exec(v);
  if (!m) return fb;
  const n = parseInt(m[1], 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
function readColors() {
  colors = { bg: cssColor('--sunk', [0.9, 0.9, 0.88]), tile: cssColor('--tile', [0.72, 0.74, 0.7]), honey: cssColor('--honey', [0.88, 0.63, 0]),
    part: cssColor('--part', [0.42, 0.45, 0.4]), ink: cssColor('--ink', [0.1, 0.1, 0.1]), good: cssColor('--good', [0.17, 0.48, 0.29]), bad: cssColor('--bad', [0.7, 0.15, 0.12]) };
  if (glv) glv.bg = colors.bg;
}

function uploadScene() {
  if (!glv) return;
  readColors();
  const h = sim.hive.raw;
  glv.setTris('cell', h.cell, [1, 1, 1]);
  glv.setTris('frame', h.frame, [1, 1, 1]);
  glv.setTris('shooter', world.tris.length ? world.tris : new Float32Array(9), [1, 1, 1]);
  const fl = [], L0 = -0.8, L1 = S.dist * IN + 1.4, W = 1.6;
  fl.push(L0, -W, 0, L1, -W, 0, L1, W, 0, L0, -W, 0, L1, W, 0, L0, W, 0);
  glv.setTris('floor', new Float32Array(fl), [1, 1, 1]);
  const g = [];
  for (let x = Math.ceil(L0 / 0.6096) * 0.6096; x <= L1; x += 0.6096) g.push(x, -W, 0.001, x, W, 0.001);
  for (let y = -W + 0.2; y <= W; y += 0.6096) g.push(L0, y, 0.001, L1, y, 0.001);
  glv.setLines('grid', g, [0.5, 0.5, 0.5]);
}

const CAMS = {
  shooter: () => ({ target: [0, 0, world.H], dist: 0.55, yaw: -Math.PI / 2, pitch: 0.12 }),
  side: () => ({ target: [S.dist * IN / 2, 0, 0.85], dist: Math.max(2.4, S.dist * IN * 1.45), yaw: -Math.PI / 2, pitch: 0.12 }),
  behind: () => ({ target: [S.dist * IN * 0.6, 0, 0.9], dist: Math.max(2.2, S.dist * IN * 1.1), yaw: Math.PI, pitch: 0.32 }),
  hive: () => ({ target: [S.dist * IN + 0.2, 0, L.HIVE.lip], dist: 1.1, yaw: -2.5, pitch: 0.55 })
};
function cam(name) { if (glv) { Object.assign(glv.cam, CAMS[name]()); } }

function scene() {
  const M = BBZ.LabGL.M, items = [];
  items.push({ geo: 'floor', tint: [...colors.tile, 1] });
  items.push({ geo: 'grid', tint: [...colors.ink, 0.25] });
  items.push({ geo: 'frame', tint: [...colors.part, 1] });
  items.push({ geo: 'cell', tint: [...colors.honey, 0.45] });
  items.push({ geo: 'shooter', tint: [0.55, 0.62, 0.72, S.src === 'stl' ? 0.85 : 0.8] });
  /* a low robot chassis (18 in square) so the scale reads at a glance */
  items.push({ geo: 'box', m: M.trs([-0.15, 0, 0.065], [0, 0, 1], 0, [0.2286, 0.2286, 0.04]), tint: [...colors.part, 0.5] });
  for (const w of sim.wheels) items.push({ geo: 'wheel', m: M.trs(w.c, w.a, w.angle, [w.r + w.growth, w.hw, w.r + w.growth]) });
  if (S.src === 'stl') items.push({ geo: 'box', m: M.trs(world.feed, [0, 0, 1], 0, 0.006), tint: [...colors.honey, 1] });
  const col = L.BALLS;
  for (const b of sim.balls) {
    if (b.st === 'gone') continue;
    const wl = V.len(b.w), ax = wl > 1e-6 ? V.mul(b.w, 1 / wl) : [0, 0, 1];
    items.push({ geo: 'ball', m: M.trs(b.p, ax, b.rot || 0, b.R), tint: [...col[b.type].color, 1] });
  }
  /* shot paths: the last few, green when scored */
  const paths = sim.balls.slice(-8), pts = { good: [], bad: [], live: [] };
  for (const b of paths) {
    const key = b.result === 'Scored' ? 'good' : b.result ? 'bad' : 'live';
    for (let i = 1; i < b.path.length; i++) pts[key].push(...b.path[i - 1], ...b.path[i]);
  }
  glv.setLines('pGood', pts.good, colors.good); glv.setLines('pBad', pts.bad, colors.bad); glv.setLines('pLive', pts.live, [1, 1, 1]);
  items.push({ geo: 'pGood' }, { geo: 'pBad' }, { geo: 'pLive', tint: [...colors.ink, 0.7] });
  return items;
}

/* ---------- the loop ---------- */
let running = false, lastFrame = 0;
function frame(now) {
  if (!running) return;
  requestAnimationFrame(frame);
  const real = Math.min(0.05, (now - (lastFrame || now)) / 1000);
  lastFrame = now;
  if (sim && !paused) step(real * timeScale);
  if (glv && sim) { if ((frameCount++ % 60) === 0) readColors(); glv.draw(scene()); }
  live();
}
let frameCount = 0;

function step(span) {
  let left = span, budget = 2600, slow = false;
  while (left > 1e-9) {
    const chunk = Math.min(0.002, left);
    feed();
    const before = sim.t;
    const done = sim.advance(chunk, budget);
    budget -= Math.max(1, Math.round((sim.t - before) / 2e-5));
    for (const b of sim.balls) b.rot = (b.rot || 0) + V.len(b.w) * done;
    left -= chunk;
    if (done < chunk - 1e-9 || budget <= 0) { slow = true; break; }
  }
  slowFrames = slow ? Math.min(60, slowFrames + 1) : Math.max(0, slowFrames - 1);
  $('labSlow').hidden = slowFrames < 20;
  const w = sim.wheels[0];
  if (startT != null && spinUp == null && Math.abs(w.omega) * 30 / Math.PI >= 0.98 * S.rpm) { spinUp = sim.t - startT; wheelInfo(); }
  /* tidy: balls that ended on the floor fade out after a second */
  sim.balls = sim.balls.filter((b) => !(b.st === 'floor' && sim.t - b.ended > 1.2));
  if (sim.shots.length > seen) { for (const s of sim.shots.slice(seen)) log.push(Object.assign({ n: log.length + 1, recover: null, simRef: sim }, s)); seen = sim.shots.length; results(); }
  /* recovery: time from a ball leaving the wheel until the wheel is back within 2%, read from the speed record */
  let changed = false;
  for (const s of log) {
    if (s.recover != null || !s.exit || s.simRef !== sim) continue;
    const hit = sim.trace.find(([t, r]) => t > s.exit.t && r >= 0.98 * S.rpm);
    if (hit) { s.recover = hit[0] - s.exit.t; changed = true; }
  }
  if (changed) results();
}

function feed() {
  if (!feeding || fed >= S.count) return;
  const w = sim.wheels[0], rpm = Math.abs(w.omega) * 30 / Math.PI;
  if (sim.t - lastFeed < S.interval) return;
  if (S.wait && Math.abs(rpm - S.rpm) > 0.02 * S.rpm) return;
  const R = L.BALLS[S.ball].d / 2;
  if (sim.balls.some((b) => b.st === 'live' && V.len(V.sub(b.p, world.feed)) < 2.05 * R)) return;
  const type = S.ball === 'P' ? 'P' : 'R';
  sim.addBall(type, world.feed, V.mul(world.dir, +S.feedV), [0, 0, 0], sim.ballCal);
  fed++; lastFeed = sim.t;
}

function live() {
  if (!sim) return;
  const w = sim.wheels[0];
  $('labLiveRpm').textContent = Math.round(Math.abs(w.omega) * 30 / Math.PI);
  $('labLiveTgt').textContent = startT != null ? S.rpm : 0;
  $('labLivePow').textContent = Math.round(Math.abs(w.u) * 100);
  const last = [...log].reverse().find((s) => s.exit);
  $('labLiveExit').textContent = last ? last.exit.v.toFixed(2) : '–';
  $('labLiveAng').textContent = last ? last.exit.ang.toFixed(1) : '–';
  $('labLiveSpin').textContent = last ? Math.round(last.exit.spin) : '–';
  chart();
}

function chart() {
  const c = $('labChart'), dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
  if (!W || !H) return;
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const g = c.getContext('2d'), tr = sim.trace, span = 4;
  g.clearRect(0, 0, W, H);
  const ink = getComputedStyle(c).color, top = Math.max(S.rpm * 1.15, 500);
  const x = (t) => W - (sim.t - t) / span * W, y = (r) => H - 6 * dpr - (r / top) * (H - 18 * dpr);
  g.font = (11 * dpr) + 'px system-ui, sans-serif'; g.fillStyle = ink; g.globalAlpha = 0.6;
  g.fillText('Flywheel rpm, last ' + span + ' s', 4 * dpr, 12 * dpr);
  if (startT != null) {
    g.setLineDash([4 * dpr, 4 * dpr]); g.strokeStyle = ink; g.globalAlpha = 0.5; g.beginPath(); g.moveTo(0, y(S.rpm)); g.lineTo(W, y(S.rpm)); g.stroke(); g.setLineDash([]);
    g.fillText('target ' + S.rpm, W - 80 * dpr, y(S.rpm) - 4 * dpr);
  }
  g.globalAlpha = 1; g.strokeStyle = 'rgb(' + colors.honey.map((v) => Math.round(v * 255)).join(',') + ')'; g.lineWidth = 2 * dpr;
  g.beginPath();
  let first = true;
  for (const [t, r] of tr) { if (sim.t - t > span) continue; if (first) { g.moveTo(x(t), y(r)); first = false; } else g.lineTo(x(t), y(r)); }
  g.stroke();
}

/* ---------- results ---------- */
const RES_CLASS = { Scored: 'res-good', 'Hit the CELL rim': 'res-warn', Short: 'res-bad', Long: 'res-bad', 'Hit the HIVE frame': 'res-bad', 'Bounced out': 'res-warn', 'Jammed in the shooter': 'res-bad', 'Never reached the flywheel': 'res-bad' };
function results() {
  const shots = log, n = shots.length, ex = shots.filter((s) => s.exit).map((s) => s.exit);
  const scored = shots.filter((s) => s.result === 'Scored').length;
  const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) * (v - m)))); };
  const speeds = ex.map((e) => e.v), drops = ex.map((e) => e.rpmBefore - e.rpmAfter), rec = shots.filter((s) => s.recover != null).map((s) => s.recover);
  const stat = (label, val, sub) => '<div><span class="hint">' + label + '</span><b>' + val + '</b>' + (sub ? '<span class="hint">' + sub + '</span>' : '') + '</div>';
  $('labStats').innerHTML = n ? [
    stat('Shots', String(n)),
    stat('Scored', scored + ' / ' + n, Math.round(scored / n * 100) + '%'),
    stat('Exit speed', speeds.length ? mean(speeds).toFixed(2) + ' m/s' : '–', speeds.length > 1 ? '± ' + sd(speeds).toFixed(2) + ' m/s spread' : ''),
    stat('Wheel slows per shot', drops.length ? Math.round(mean(drops)) + ' rpm' : '–', drops.length ? Math.round(mean(drops) / Math.max(1, S.rpm) * 100) + '% of target' : ''),
    stat('Back to speed', rec.length ? mean(rec).toFixed(2) + ' s' : '–', 'to within 2%'),
    stat('Spin-up', spinUp != null ? spinUp.toFixed(2) + ' s' : '–', 'from stopped')
  ].join('') : '<p class="hint">Press Start feeding to fire balls. Results show here.</p>';
  const body = $('labShots'); body.textContent = '';
  for (const s of shots.slice(-15).reverse()) {
    const tr = document.createElement('tr');
    const cells = ['' + s.n, s.result, s.exit ? s.exit.v.toFixed(2) + ' m/s' : '–', s.exit ? s.exit.ang.toFixed(1) + '°' : '–', s.exit ? Math.round(s.exit.spin) + ' rpm' : '–',
      s.exit ? Math.round(s.exit.rpmBefore) + ' → ' + Math.round(s.exit.rpmAfter) : '–'];
    cells.forEach((t, i) => { const td = document.createElement('td'); td.textContent = t; if (i === 1) td.className = RES_CLASS[t] || ''; tr.appendChild(td); });
    body.appendChild(tr);
  }
  $('labAdvice').textContent = advice(shots, speeds);
}

function advice(shots, speeds) {
  if (!shots.length) return '';
  const c = (r) => shots.filter((s) => s.result === r).length, n = shots.length, tips = [];
  if (c('Jammed in the shooter') > 0) tips.push('Balls are jamming: lower the compression or feed them faster into the wheel.');
  if (c('Never reached the flywheel') > 0) tips.push('Some balls never reached the flywheel: feed them faster, move the feed point closer, or speed up the transfer roller.');
  if (c('Short') / n > 0.3) tips.push('Shots fall short: raise the flywheel speed or the launch angle.');
  if (c('Long') / n > 0.3) tips.push('Shots go long: lower the flywheel speed or move closer.');
  if (c('Hit the CELL rim') / n > 0.3) tips.push('Shots clip the CELL rim: a small change in speed (about 50 rpm) or a steeper arc should drop them in.');
  if (c('Bounced out') / n > 0.2) tips.push('Balls bounce back out: a higher, slower arc lands them more softly.');
  const w = sim.wheels[0], ideal = (secondMode() === 'double' ? 1 : 0.5) * S.rpm * Math.PI / 30 * w.r;
  const m = speeds.reduce((a, b) => a + b, 0) / (speeds.length || 1);
  if (speeds.length && m < 0.7 * ideal) tips.push('The ball leaves at ' + Math.round(m / ideal * 100) + '% of the no-slip speed, so it is slipping: add compression, or use a grippier wheel or hood material.');
  if (speeds.length > 2) { const sd = Math.sqrt(speeds.reduce((a, v) => a + (v - m) * (v - m), 0) / speeds.length); if (sd > 0.12) tips.push('Exit speed varies by ±' + sd.toFixed(2) + ' m/s: wait longer between balls, add an inertia disc, or turn on Wait for the flywheel.'); }
  return tips.join(' ');
}

/* ---------- events ---------- */
function onChange(e) {
  const id = e.target.id, key = FIELDS[id];
  if (!key) return;
  const el = e.target;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (typeof DEF[key] === 'number') { v = parseFloat(v); if (!isFinite(v)) return; }
  S[key] = v;
  if (key === 'wheel') { const w = L.WHEELS.find((x) => x.id === v); S.wheelD = w.d; S.wheelW = w.w; S.wheelM = w.mass; writeUI(); }
  if (key === 'example') { const ex = EXAMPLES.find((x) => x.id === v); if (ex.wrap) S.wrap = ex.wrap; writeUI(); }
  if (key === 'rpm') S.rpm = Math.round(Math.min(S.rpm, +$('labRpm').max));
  save(); labels();
  if (LIVE.has(key)) { applyAir(); setTargets(); wheelInfo(); return; }
  if (e.type === 'input' && el.type === 'range') return;          // rebuild when the slider is let go
  rebuild();
}
let rebuildTimer = 0;
function rebuild() { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(() => { log = []; build(); results(); }, 60); }

$('view-lab').addEventListener('input', onChange);
$('view-lab').addEventListener('change', onChange);
$('labSrcEx').addEventListener('click', () => { S.src = 'ex'; save(); writeUI(); rebuild(); });
$('labSrcStl').addEventListener('click', () => { S.src = 'stl'; save(); writeUI(); rebuild(); });
$('labBallP').addEventListener('click', () => { S.ball = 'P'; save(); writeUI(); rebuild(); });
$('labBallR').addEventListener('click', () => { S.ball = 'R'; save(); writeUI(); rebuild(); });
$('labStart').addEventListener('click', () => {
  if (fed >= S.count && !sim.balls.some((b) => b.st === 'live')) { fed = 0; }
  if (startT == null) startT = sim.t;
  feeding = true; paused = false; setTargets(); $('labPause').textContent = 'Pause';
});
$('labPause').addEventListener('click', () => { paused = !paused; $('labPause').textContent = paused ? 'Resume' : 'Pause'; });
$('labReset').addEventListener('click', () => { build(); results(); });
$('labClear').addEventListener('click', () => { log = []; results(); });
document.querySelectorAll('[data-ts]').forEach((b) => b.addEventListener('click', () => {
  timeScale = +b.dataset.ts;
  document.querySelectorAll('[data-ts]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
}));
document.querySelectorAll('[data-cam]').forEach((b) => b.addEventListener('click', () => cam(b.dataset.cam)));

$('labStlFile').addEventListener('change', () => {
  const f = $('labStlFile').files[0];
  if (!f) return;
  if (f.size > 60 * 1024 * 1024) { $('labStlInfo').textContent = 'That file is over 60 MB. Export the shooter alone, or with a coarser mesh.'; return; }
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const tris = L.parseSTL(rd.result);
      if (tris.length / 9 > 400000) throw new Error('This model has ' + Math.round(tris.length / 9) + ' triangles. Export it with fewer than 400,000.');
      stl = { tris, name: f.name };
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < tris.length; i++) { lo[i % 3] = Math.min(lo[i % 3], tris[i]); hi[i % 3] = Math.max(hi[i % 3], tris[i]); }
      $('labStlInfo').textContent = f.name + ': ' + (tris.length / 9).toLocaleString() + ' triangles, ' + [0, 1, 2].map((k) => (hi[k] - lo[k]).toFixed(1)).join(' × ') +
        ' in file units. Read in your browser only; nothing was uploaded.';
      rebuild();
    } catch (err) { $('labStlInfo').textContent = err.message || 'This file could not be read as an STL.'; }
  };
  rd.readAsArrayBuffer(f);
});

$('labExDownload').addEventListener('click', () => {
  const parts = shooterParts(wheelSpec());
  const blob = new Blob([L.writeSTL(parts.tris)], { type: 'model/stl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'simyourcode-' + S.example + '.stl';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});

/* Start drawing when the tab opens and stop when it closes. */
document.addEventListener('bbz:view', (e) => {
  const on = e.detail === 'lab';
  if (on && !glv) {
    glv = BBZ.LabGL.create($('labCanvas'));
    $('labNoGl').hidden = !!glv;
    if (glv) { readColors(); uploadScene(); cam('side'); }
  }
  if (on && !running) { running = true; lastFrame = 0; requestAnimationFrame(frame); }
  if (!on) running = false;
});

/* Test hook: runs the lab for `sec` simulated seconds without waiting for animation frames, then draws once. */
BBZ.labStep = function (sec) {
  for (let t = 0; t < sec; t += 0.05) step(0.05);
  if (glv) glv.draw(scene());
  live();
  return { t: sim.t, rpm: Math.abs(sim.wheels[0].omega) * 30 / Math.PI, balls: sim.balls.length, shots: log.map((s) => s.result + (s.exit ? ' ' + s.exit.v.toFixed(2) : '')),
    live: sim.balls.filter((b) => b.st === 'live').map((b) => b.p.map((x) => +x.toFixed(3)).concat([+V.len(b.v).toFixed(2)])),
    wheels: sim.wheels.map((w) => ({ c: w.c.map((x) => +x.toFixed(3)), r: w.r, rpm: Math.round(w.omega * 30 / Math.PI), role: w.role })), feed: world.feed.map((x) => +x.toFixed(3)) };
};

writeUI();
readColors();
build();
results();
if (!$('view-lab').hidden) document.dispatchEvent(new CustomEvent('bbz:view', { detail: 'lab' }));
})();
