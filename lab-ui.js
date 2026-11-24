/* Shooter Lab tab: settings, example shooters, CAD loading, the robot on the official field, dragging parts,
   auto-placing the flywheel, the auto-feeder, the 3D view and the results. */
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
  { id: 'double', name: 'Double flywheel, no hood', blurb: 'Two wheels spinning opposite ways squeeze the ball between them. It leaves with almost no spin.', wrap: 0, second: 'double' },
  { id: 'transfer', name: '90° hood with a transfer roller', blurb: 'A slow roller pushes each ball up a ramp into the hood, like a real transfer system. Watch how the roller speed changes the feed.', wrap: 90, second: 'transfer' }
];
const DEF = {
  src: 'ex', example: 'hood90', launch: 45, wrap: 90, comp: 10, exMat: 'pla',
  stlUnits: '0.001', stlMat: 'pla', stlRot: '0', stlX: 0, stlY: 0, stlZ: 0, feedX: -90, feedZ: 265, feedA: 45,
  wheel: 'tpe96', wheelD: 96, wheelW: 38, wheelM: 75, wheelN: 1, discs: 1, dir: 1, wheelX: 0, wheelZ: 305,
  second: 'none', roller: 'roller48', rollerRpm: 1200, rollerMotor: 'gb1620', secX: 0, secZ: 155,
  motor: 'gb6000', ratio: 1, custFree: 6000, custStall: 0.144, rpm: 2650, V: 12.5, tested: true,
  ball: 'P', count: 6, interval: 0.6, feedV: 1, wait: true,
  alliance: 'blue', robotX: 12.75, robotY: 60, heading: -90,
  robUnits: '0.001', robRot: '0', robMX: 0, robMY: 0, robMZ: 0, robHit: true, lock: false,
  mass: 0, sqW: 0, sqD: 0, dropH: 0, bounceH: 0, muW: 100, muH: 100, Cd: 0.5, Cl: 100, air: true, hiveE: 0.4
};
let S = Object.assign({}, DEF);
try { const saved = JSON.parse(localStorage.getItem('bbz-lab2') || 'null'); if (saved && typeof saved === 'object') for (const k in DEF) if (typeof saved[k] === typeof DEF[k]) S[k] = saved[k]; } catch (e) { /* storage blocked */ }
const save = () => { try { localStorage.setItem('bbz-lab2', JSON.stringify(S)); } catch (e) { /* storage blocked */ } };
S.comp = Math.max(0, Math.min(25, +S.comp || 0));

let cad = null;            // the shooter file: { tris (file units, or mm for STEP), name, step }
let robot = null;          // the robot file, same shape
let field = null, fieldError = false;
let sim = null, world = null, feeding = false, paused = false, timeScale = 1, fed = 0, lastFeed = -9, startT = null, spinUp = null;
let log = [], seen = 0, glv = null, colors = null, slowFrames = 0, dragging = null;

/* ---------- filling the controls ---------- */
const opt = (sel, list, val) => { sel.textContent = ''; list.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }); if (val != null) sel.value = val; };
opt($('labExample'), EXAMPLES.map((e) => [e.id, e.name]));
const mats = Object.keys(L.SURFACES).map((k) => [k, L.SURFACES[k].name]);
opt($('labExMat'), mats); opt($('labStlMat'), mats);
opt($('labWheel'), L.WHEELS.filter((w) => w.id !== 'roller48').map((w) => [w.id, w.name]));
opt($('labRoller'), L.WHEELS.map((w) => [w.id, w.name]));
opt($('labMotor'), L.MOTORS.map((m) => [m.id, m.name]));
opt($('labRollerMotor'), L.MOTORS.filter((m) => m.id !== 'custom').map((m) => [m.id, m.name]));

const FIELDS = { labExample: 'example', labLaunch: 'launch', labWrap: 'wrap', labComp: 'comp', labComp2: 'comp', labExMat: 'exMat', labStlUnits: 'stlUnits', labStlMat: 'stlMat',
  labStlRot: 'stlRot', labStlX: 'stlX', labStlY: 'stlY', labStlZ: 'stlZ', labFeedX: 'feedX', labFeedZ: 'feedZ', labFeedA: 'feedA', labWheel: 'wheel', labWheelD: 'wheelD',
  labWheelW: 'wheelW', labWheelM: 'wheelM', labWheelN: 'wheelN', labDiscs: 'discs', labDir: 'dir', labWheelX: 'wheelX', labWheelZ: 'wheelZ', labSecond: 'second', labRoller: 'roller',
  labRollerRpm: 'rollerRpm', labRollerMotor: 'rollerMotor', labSecX: 'secX', labSecZ: 'secZ', labMotor: 'motor', labRatio: 'ratio', labCustFree: 'custFree', labCustStall: 'custStall',
  labRpm: 'rpm', labV: 'V', labTested: 'tested', labCount: 'count', labInterval: 'interval', labFeedV: 'feedV', labWait: 'wait',
  labRobX: 'robotX', labRobY: 'robotY', labHead: 'heading', labRobUnits: 'robUnits', labRobRot: 'robRot', labRobMX: 'robMX', labRobMY: 'robMY', labRobMZ: 'robMZ',
  labRobHit: 'robHit', labLock: 'lock',
  labMass: 'mass', labSqW: 'sqW', labSqD: 'sqD', labDropH: 'dropH', labBounceH: 'bounceH', labMuW: 'muW', labMuH: 'muH', labCd: 'Cd', labCl: 'Cl', labAir: 'air', labHiveE: 'hiveE' };
/* Settings that change the running simulation without starting it again. */
const LIVE = new Set(['rpm', 'V', 'tested', 'count', 'interval', 'feedV', 'wait', 'Cd', 'Cl', 'air', 'rollerRpm', 'lock']);

function writeUI() {
  for (const id in FIELDS) {
    const el = $(id), v = S[FIELDS[id]];
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!v; else el.value = String(v);
  }
  $('labSrcEx').setAttribute('aria-pressed', String(S.src === 'ex'));
  $('labSrcStl').setAttribute('aria-pressed', String(S.src === 'stl'));
  $('labBallP').setAttribute('aria-pressed', String(S.ball === 'P'));
  $('labBallR').setAttribute('aria-pressed', String(S.ball !== 'P'));
  $('labAllRed').setAttribute('aria-pressed', String(S.alliance === 'red'));
  $('labAllBlue').setAttribute('aria-pressed', String(S.alliance === 'blue'));
  labels();
}

function labels() {
  const ex = EXAMPLES.find((e) => e.id === S.example) || EXAMPLES[0];
  $('labExBox').hidden = S.src !== 'ex'; $('labStlBox').hidden = S.src !== 'stl';
  $('labExBlurb').textContent = ex.blurb;
  $('labWrap').disabled = ex.wrap === 0;
  $('labLaunchOut').textContent = S.launch + '°';
  $('labWrapOut').textContent = ex.wrap === 0 ? 'no hood' : S.wrap + '°';
  const D = L.BALLS[S.ball].d * 1000, compText = S.comp + ' mm (' + Math.round(S.comp / D * 100) + '%)';
  $('labCompOut').textContent = compText; $('labComp2Out').textContent = compText;
  $('labRpmOut').textContent = S.rpm + ' rpm';
  $('labVOut').textContent = (+S.V).toFixed(1) + ' V';
  $('labMuWOut').textContent = S.muW + '%'; $('labMuHOut').textContent = S.muH + '%'; $('labClOut').textContent = S.Cl + '%';
  $('labCustomBox').hidden = S.motor !== 'custom';
  const second = secondMode();
  $('labSecond').disabled = S.src === 'ex';
  if (S.src === 'ex') $('labSecond').value = second;
  $('labSecondBox').hidden = second === 'none' || S.src === 'ex' && second === 'double';
  for (const id of ['labSecPosX', 'labSecPosZ']) $(id).hidden = S.src === 'ex';
  for (const id of ['labRoller', 'labRollerRpm', 'labRollerMotor']) $(id).closest('label').hidden = second !== 'transfer';
  $('labRobotBox').hidden = !robot; $('labRobotHitBox').hidden = !robot;
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

/* ---------- robot frame and field frame ----------
   Robot frame: metres from the middle of the robot on the floor, +x forward, +y left, +z up.
   Field frame: metres from the middle of the field, tile tops at z = 0 (the same frame as the field CAD). */
const pose = () => ({ x: S.robotX * IN, y: S.robotY * IN, h: S.heading * Math.PI / 180 });
function toField(l, P) { const c = Math.cos(P.h), s = Math.sin(P.h); return [P.x + c * l[0] - s * l[1], P.y + s * l[0] + c * l[1], l[2]]; }
function dirToField(d, P) { const c = Math.cos(P.h), s = Math.sin(P.h); return [c * d[0] - s * d[1], s * d[0] + c * d[1], d[2]]; }
function dirToRobot(d, P) { const c = Math.cos(P.h), s = Math.sin(P.h); return [c * d[0] + s * d[1], -s * d[0] + c * d[1], d[2]]; }
function trisToField(t, P) {
  const out = new Float32Array(t.length), c = Math.cos(P.h), s = Math.sin(P.h);
  for (let i = 0; i < t.length; i += 3) { out[i] = P.x + c * t[i] - s * t[i + 1]; out[i + 1] = P.y + s * t[i] + c * t[i + 1]; out[i + 2] = t[i + 2]; }
  return out;
}
const wheelAt = () => [S.wheelX / 1000, 0, S.wheelZ / 1000];

/* Scales, spins and moves CAD points (file units) into the robot frame. */
function cadToRobot(tris, units, rot, ox, oy, oz) {
  const s = +units, out = new Float32Array(tris.length);
  const ax = rot[0], ang = rot === '0' ? 0 : (+rot.slice(1)) * Math.PI / 180, c = Math.cos(ang), sn = Math.sin(ang);
  for (let i = 0; i < tris.length; i += 3) {
    let x = tris[i] * s, y = tris[i + 1] * s, z = tris[i + 2] * s;
    if (ax === 'x') { const yy = y * c - z * sn; z = y * sn + z * c; y = yy; }
    else if (ax === 'y') { const xx = x * c + z * sn; z = -x * sn + z * c; x = xx; }
    else if (ax === 'z') { const xx = x * c - y * sn; y = x * sn + y * c; x = xx; }
    out[i] = x + ox / 1000; out[i + 1] = y + oy / 1000; out[i + 2] = z + oz / 1000;
  }
  return out;
}
const shooterCad = (ox, oy, oz) => cadToRobot(cad.solid, cad.step ? '0.001' : S.stlUnits, S.stlRot, ox == null ? S.stlX : ox, oy == null ? S.stlY : oy, oz == null ? S.stlZ : oz);
const robotCad = () => cadToRobot(robot.solid, robot.step ? '0.001' : S.robUnits, S.robRot, S.robMX, S.robMY, S.robMZ);

/* ---------- building the world ---------- */

/* Calibration turns real measurements into model numbers. */
function calibration() {
  const out = { text: [] };
  if (S.mass > 0) { out.mass = S.mass / 1000; out.text.push('ball mass ' + S.mass + ' g'); }
  if (S.sqW > 0 && S.sqD > 0) { out.k = (S.sqW / 1000 * L.G) / (S.sqD / 1000); out.text.push('ball stiffness ' + Math.round(out.k) + ' N/m'); }
  if (S.dropH > 0 && S.bounceH > 0 && S.bounceH < S.dropH) { out.e = Math.sqrt(S.bounceH / S.dropH); out.text.push('bounce e = ' + out.e.toFixed(2) + ' on your hood material'); }
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

/* The shooter in the robot frame: triangles, material, the feed point and direction, and any second wheel.
   Examples are built round the flywheel, so they move with it; a CAD shooter stays where it was put. */
function shooterParts(spec) {
  const ball = L.BALLS[S.ball], R = ball.d / 2, rw = spec.d / 2000, comp = S.comp / 1000, gap = ball.d - comp;
  const hwTotal = (spec.w * S.wheelN + 10 * (S.wheelN - 1)) / 2000;
  const guide = Math.max(R + 0.006, hwTotal + 0.004), width = 2 * guide, W = wheelAt();
  if (S.src === 'stl') {
    const a = S.feedA * Math.PI / 180;
    const parts = { tris: cad ? shooterCad() : new Float32Array(0), mat: Object.assign({}, L.SURFACES[S.stlMat]),
      feed: [S.feedX / 1000, 0, S.feedZ / 1000], dir: [Math.cos(a), 0, Math.sin(a)], second: null };
    if (S.second === 'double') parts.second = { c: [S.secX / 1000, 0, S.secZ / 1000], spec, dir: -1, rpm: S.rpm, motor: S.motor, role: 'double' };
    if (S.second === 'transfer') parts.second = { c: [S.secX / 1000, 0, S.secZ / 1000], spec: L.WHEELS.find((w) => w.id === S.roller), dir: 1, rpm: S.rollerRpm, motor: S.rollerMotor, role: 'roller' };
    return parts;
  }
  const ex = EXAMPLES.find((e) => e.id === S.example) || EXAMPLES[0];
  const mat = Object.assign({}, L.SURFACES[S.exMat]);
  const shift = (t) => { const o = new Float32Array(t.length); for (let i = 0; i < t.length; i++) o[i] = t[i] + W[i % 3]; return o; };
  if (ex.id === 'double') {
    const A = S.launch * Math.PI / 180, d = [Math.cos(A), 0, Math.sin(A)], n = [-Math.sin(A), 0, Math.cos(A)];
    const P = (s) => V.add(V.mul(n, -(rw + gap / 2)), V.mul(d, s));
    const tris = chuteTris(P(-0.24), P(-(rw + 0.012)), V.mul(n, -1), guide, R);
    return { tris: shift(new Float32Array(tris)), mat, feed: V.add(W, P(-(rw + R + 0.012))), dir: d, mainDir: -1,
      second: { c: V.add(W, V.mul(n, -(2 * rw + gap))), spec, dir: 1, rpm: S.rpm, motor: S.motor, role: 'double' } };
  }
  const chute = ex.id === 'transfer' ? 0.26 : 0.08;
  const hood = L.hoodTris({ rw, gap, squeeze: comp, wrap: S.wrap, launch: S.launch, width, thick: 0.004, guide, chute, ballR: R });
  const parts = { tris: shift(hood.tris), mat, feed: V.add(W, hood.feedPoint), dir: hood.entryDir, second: null };
  if (ex.id === 'transfer') {
    const a0 = (90 + S.launch + S.wrap) * Math.PI / 180, nrm = [Math.cos(a0), 0, Math.sin(a0)], t = [Math.sin(a0), 0, -Math.cos(a0)];
    const h0 = V.mul(nrm, rw + gap + comp), roller = L.WHEELS.find((w) => w.id === 'roller48'), rr = roller.d / 2000;
    /* the roller sits far enough down the ramp to clear the flywheel, and presses 5 mm into the ball */
    const clear = Math.sqrt(Math.max(0, (rw + rr + 0.006) ** 2 - (rw - rr) ** 2)) + 0.01;
    const ballAt = V.add(V.add(h0, V.mul(t, -clear)), V.mul(nrm, -(R + 0.002)));
    parts.second = { c: V.add(W, V.add(ballAt, V.mul(nrm, -(R + rr - 0.005)))), spec: roller, dir: 1, rpm: S.rollerRpm, motor: S.rollerMotor, role: 'roller' };
    parts.feed = V.add(W, V.add(V.add(h0, V.mul(t, -(clear + 0.035))), V.mul(nrm, -(R + 0.003))));
  }
  return parts;
}

function boxOf(t) {
  if (!t || !t.length) return null;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < t.length; i++) { const k = i % 3; if (t[i] < lo[k]) lo[k] = t[i]; if (t[i] > hi[k]) hi[k] = t[i]; }
  return { lo, hi };
}

/* Places everything on the field. `light` only moves things for drawing (used while dragging); a full build also makes the simulation. */
function place(spec) {
  const P = pose(), parts = shooterParts(spec);
  const tris = trisToField(parts.tris, P);
  const rtris = robot ? trisToField(robotCad(), P) : null;
  world = { P, parts, spec, tris, rtris, shooterBox: boxOf(tris), robotBox: boxOf(rtris),
    wheelC: toField(wheelAt(), P), axis: dirToField([0, 1, 0], P),
    secondC: parts.second ? toField(parts.second.c, P) : null,
    feed: toField(parts.feed, P), dir: dirToField(parts.dir, P) };
  return world;
}

function target() { return field ? field.cells.find((c) => c.up && c.color === S.alliance) : null; }

function build(light) {
  const spec = wheelSpec();
  place(spec);
  if (light) {
    if (sim) { sim.wheels[0].c = world.wheelC; sim.wheels[0].a = world.axis; if (sim.wheels[1] && world.secondC) { sim.wheels[1].c = world.secondC; sim.wheels[1].a = world.axis; } }
    uploadMoving(); aimInfo();
    return;
  }
  const parts = world.parts;
  sim = new L.Sim();
  const cal = calibration();
  sim.cal = { muWheel: S.muW / 100, muScale: S.muH / 100 };
  sim.ballCal = { mass: cal.mass, k: cal.k };
  applyAir();
  const tgt = target();
  if (field) field.hive.mat = Object.assign({}, L.FIELD_MAT.hive, { e: Math.min(0.95, Math.max(0.05, +S.hiveE || 0.4)) });
  if (field && tgt) {
    const o = world.wheelC, dx = tgt.center[0] - o[0], dy = tgt.center[1] - o[1], d = Math.hypot(dx, dy) || 1;
    sim.setField(field, tgt, { o, h: [dx / d, dy / d, 0], d });
  }
  const mat = parts.mat;
  if (cal.e) mat.e = cal.e;
  if (world.tris.length) sim.addMesh(world.tris, mat, 'shooter');
  if (world.rtris && S.robHit) sim.addMesh(world.rtris, Object.assign({}, L.SURFACES.alu), 'robot');
  const mainDir = (parts.mainDir || 1) * S.dir;
  const widthMain = spec.w * S.wheelN + 10 * (S.wheelN - 1);
  sim.addWheel({ c: world.wheelC, a: world.axis, spec, width: widthMain, count: S.wheelN, motor: motorOf(S.motor),
    G: +S.ratio || 1, V: +S.V, tested: S.tested, target: 0, dir: mainDir, discs: +S.discs, spinUp: true });
  if (parts.second) {
    const p2 = parts.second, sp = Object.assign({}, p2.spec), dbl = p2.role === 'double';
    sim.addWheel({ c: world.secondC, a: world.axis, spec: sp, width: dbl ? widthMain : sp.w, count: dbl ? S.wheelN : 1, motor: motorOf(p2.motor),
      G: dbl ? +S.ratio || 1 : 1, V: +S.V, tested: S.tested, target: 0, dir: dbl ? -mainDir : p2.dir, discs: dbl ? +S.discs : 0, role: p2.role });
  }
  feeding = false; fed = 0; lastFeed = -9; startT = null; spinUp = null; seen = 0;
  readGap();
  $('labCalInfo').textContent = cal.text.length ? 'Using your measurements: ' + cal.text.join(', ') + '.' : 'No measurements entered yet, so the lab uses typical values.';
  wheelInfo(); aimInfo();
  uploadMoving(); uploadTarget();
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
  const out = $('labGap'), D = L.BALLS[S.ball].d, w = sim.wheels[0];
  let gap = Infinity;
  if (sim.wheels[1] && sim.wheels[1].role === 'double') gap = V.len(V.sub(sim.wheels[1].c, w.c)) - w.r - sim.wheels[1].r;
  else { const m = sim.meshes.filter((x) => x.tag === 'shooter'); if (m.length) gap = L.rimGap(w, m).gap; }
  if (!isFinite(gap)) { out.textContent = S.src === 'stl' && !cad ? 'Load your shooter to see the gap between the wheel and the hood.' : 'No hood surface faces the wheel rim, so nothing squeezes the ball. Drag the flywheel under the hood, or press Auto-place flywheel.'; return; }
  const c = D - gap;
  out.textContent = 'Narrowest gap ' + (gap * 1000).toFixed(1) + ' mm → squeeze ' + (c * 1000).toFixed(1) + ' mm (' + Math.round(c / D * 100) + '% of the ball) before the wheel spins';
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

function aimInfo() {
  const t = target(), el = $('labAimInfo');
  if (!t) { el.textContent = field ? '' : ''; return; }
  const o = world.wheelC, d = Math.hypot(t.center[0] - o[0], t.center[1] - o[1]);
  const want = Math.atan2(t.center[1] - o[1], t.center[0] - o[0]) * 180 / Math.PI;
  let off = ((S.heading - want) % 360 + 540) % 360 - 180;
  el.textContent = 'Flywheel to the middle of the ' + S.alliance + ' CELL: ' + (d / IN).toFixed(1) + ' in across the floor, ' + ((t.center[2] - o[2]) / IN).toFixed(1) + ' in up. ' +
    (Math.abs(off) < 1 ? 'Aimed straight at it.' : 'Pointing ' + Math.abs(off).toFixed(0) + '° to the ' + (off > 0 ? 'left' : 'right') + ' of it.');
}

/* ---------- auto-place: put the flywheel where the hood wraps round it ---------- */

/* The shooter cut through the plane y = y0 into 2D segments [x, z] in the robot frame. */
function slice(raw, y0) {
  const segs = [];
  for (let i = 0; i < raw.length; i += 9) {
    const pts = [];
    for (let k = 0; k < 3; k++) {
      const a = i + k * 3, b = i + ((k + 1) % 3) * 3, ya = raw[a + 1] - y0, yb = raw[b + 1] - y0;
      if ((ya <= 0 && yb > 0) || (ya > 0 && yb <= 0)) { const t = ya / (ya - yb); pts.push([raw[a] + (raw[b] - raw[a]) * t, raw[a + 2] + (raw[b + 2] - raw[a + 2]) * t]); }
    }
    if (pts.length === 2) segs.push(pts);
  }
  return segs;
}

/* Round a centre: the nearest surface, and the longest run of directions (in 5° steps) where a surface lies within `reach`. */
const BINS = 72;
function arcAt(cx, cz, segs, reach, inside) {
  let dmin = Infinity;
  const hit = new Uint8Array(BINS), binMin = new Float64Array(BINS).fill(Infinity);
  for (const [a, b] of segs) {
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((cx - a[0]) * dx + (cz - a[1]) * dz) / l2)) : 0;
    const qx = a[0] + dx * t, qz = a[1] + dz * t, d = Math.hypot(qx - cx, qz - cz);
    if (inside && d < inside) continue;             // the axle, hub and anything else inside the wheel itself
    if (d < dmin) dmin = d;
    if (d < reach) { const bi = Math.floor(((Math.atan2(qz - cz, qx - cx) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * BINS) % BINS; hit[bi] = 1; binMin[bi] = Math.min(binMin[bi], d); }
  }
  let run = 0, best = 0, end = -1;
  for (let k = 0; k < BINS * 2; k++) { if (hit[k % BINS]) { run++; if (run > best && run <= BINS) { best = run; end = k % BINS; } } else run = 0; }
  /* the narrowest gap along that run: where the ball is squeezed on its way through */
  let pathMin = Infinity;
  for (let k = 0; k < best; k++) pathMin = Math.min(pathMin, binMin[(end - k + BINS) % BINS]);
  return { dmin, run: best, end, pathMin, binMin };
}

/* Given the wheel centre and the covered arc, pick the spin that throws the ball forwards and upwards,
   and put the feed point just before the hood's entry. */
function finishPlace(cx, cz, arc, rw, gap) {
  const R = L.BALLS[S.ball].d / 2, ang = (b) => (b + 0.5) / BINS * 2 * Math.PI;
  const thB = ang(arc.end), thA = ang((arc.end - arc.run + 1 + BINS) % BINS);
  const cw = { exit: [Math.sin(thA), -Math.cos(thA)], enter: thB, dir: 1 };          // spinning +y moves the rim clockwise in this view
  const ccw = { exit: [-Math.sin(thB), Math.cos(thB)], enter: thA, dir: -1 };
  const good = (o) => o.exit[0] + 0.6 * o.exit[1];
  const pick = good(cw) >= good(ccw) ? cw : ccw;
  /* the feed point: in the entry half of the hood, where it gives the ball the most room, halfway between rim and hood */
  const startBin = pick.dir === 1 ? arc.end : (arc.end - arc.run + 1 + BINS) % BINS, stepBin = pick.dir === 1 ? -1 : 1;
  let fb = startBin, room = -Infinity;
  for (let k = 0; k < Math.max(1, Math.ceil(arc.run / 2)); k++) {
    const b = (startBin + stepBin * k + BINS) % BINS, m = arc.binMin ? arc.binMin[b] : rw + gap;
    if (isFinite(m) && m > room + 0.001) { room = m; fb = b; }
  }
  const th = ang(fb), travel = pick.dir === 1 ? [Math.sin(th), -Math.cos(th)] : [-Math.sin(th), Math.cos(th)];
  const hood = isFinite(room) ? room : rw + gap, r0 = Math.max(rw + 0.002 + Math.min(R, (hood - rw) / 2), (rw + hood) / 2);
  S.wheelX = Math.round(cx * 1000); S.wheelZ = Math.round(cz * 1000); S.dir = pick.dir;
  S.feedX = Math.round((cx + r0 * Math.cos(th)) * 1000);
  S.feedZ = Math.round((cz + r0 * Math.sin(th)) * 1000);
  S.feedA = Math.round(Math.atan2(travel[1], travel[0]) * 180 / Math.PI);
  return { exitDeg: Math.round(Math.atan2(pick.exit[1], pick.exit[0]) * 180 / Math.PI), wrap: Math.round(arc.run * 360 / BINS), dir: pick.dir };
}

/* Test-fires one ball from spots all round the wheel, both spin directions, with the real physics (no air, flywheel already at speed),
   and keeps the setup that throws the ball forwards fastest at a useful angle. Positions are in the robot frame. */
/* Lets the page breathe between test shots (a message is not slowed down like a timer in a background tab). */
const breathe = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
async function bestFeed(cx, cz, rw, raw, spec, progress) {
  const ball = L.BALLS[S.ball], R = ball.d / 2, cal = calibration();
  const mesh = L.makeMesh(raw, Object.assign({}, L.SURFACES[S.stlMat], cal.e ? { e: cal.e } : {}));
  mesh.tag = 'shooter';
  const segs = slice(raw, 0), width = spec.w * S.wheelN + 10 * (S.wheelN - 1);
  const clearOf = (x, z) => { let d = Infinity; for (const [a, b] of segs) { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0; d = Math.min(d, Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z)); } return d; };
  let best = null, tried = 0;
  const D = ball.d;
  for (let k = 0; k < 24; k++) for (const press of [0.003, 0.012, 0.022]) {
    if (press === 0.003) { if (progress) progress(k / 24); await breathe(); }
    const th = k / 24 * 2 * Math.PI, r0 = rw + R - press, x = cx + r0 * Math.cos(th), z = cz + r0 * Math.sin(th);
    /* a ball can start here if the hood presses into it no more than a quarter of its size, and the squeeze in total stays under 40% */
    const hoodPress = Math.max(0, R - clearOf(x, z));
    if (hoodPress > 0.25 * D || press + hoodPress > 0.4 * D) continue;
    if (press > 0.003 && clearOf(x, z) > R + 0.003) continue;     // deeper starts only where the ball rests against the hood or floor
    for (const dir of [1, -1]) {
      const travel = dir === 1 ? [Math.sin(th), 0, -Math.cos(th)] : [-Math.sin(th), 0, Math.cos(th)];
      const t = new L.Sim();
      t.cal = { muWheel: S.muW / 100, muScale: S.muH / 100 }; t.env.air = false;
      t.meshes.push(mesh);
      t.addWheel({ c: [cx, 0, cz], a: [0, 1, 0], spec, width, count: S.wheelN, motor: motorOf(S.motor), G: +S.ratio || 1, V: +S.V, tested: S.tested,
        target: S.rpm, dir, discs: +S.discs, spinUp: false });
      const b = t.addBall(S.ball === 'P' ? 'P' : 'R', [x, 0, z], V.mul(travel, +S.feedV || 1), [0, 0, 0], { mass: cal.mass, k: cal.k });
      /* stop as soon as the ball has left (or clearly will not): exit recorded, gone 25 cm, or sitting still */
      let still = 0;
      for (let u = 0; u < 0.35 && !b.exit && b.st === 'live'; u += 0.01) {
        t.advance(0.01, 1e9);
        if (V.len(V.sub(b.p, [x, 0, z])) > 0.25) break;
        still = V.len(b.v) < 0.05 ? still + 0.01 : 0;
        if (still >= 0.05) break;
      }
      if (!b.exit && b.launched && b.st === 'live') t.advance(0.03, 1e9);
      tried++;
      if (!b.exit) continue;
      const v = b.exit.v, fwd = b.v[0] / Math.max(1e-6, Math.hypot(b.v[0], b.v[1], b.v[2])), ang = b.exit.ang;
      if (fwd < 0.2 || ang < 5) continue;
      const squeeze = (b.comp || 0) / D;
      const score = v * Math.max(0.2, 1 - Math.abs(ang - 50) / 60) * (squeeze > 0.3 ? 0.5 : 1);
      if (!best || score > best.score) best = { score, x, z, dir, travel, v, ang, comp: b.comp || 0 };
    }
  }
  return { best, tried };
}

function placeFeed(cx, cz, b) {
  S.wheelX = Math.round(cx * 1000); S.wheelZ = Math.round(cz * 1000); S.dir = b.dir;
  S.feedX = Math.round(b.x * 1000); S.feedZ = Math.round(b.z * 1000); S.feedA = Math.round(Math.atan2(b.travel[2], b.travel[0]) * 180 / Math.PI);
}

let placing = false;
async function autoPlace() {
  if (placing) return;
  placing = true; $('labAutoPlace').disabled = true;
  try { await autoPlaceRun(); } finally { placing = false; $('labAutoPlace').disabled = false; }
}
async function autoPlaceRun() {
  const info = $('labAutoInfo');
  if (!cad) { info.textContent = 'Load your shooter file first.'; return; }
  const D = L.BALLS[S.ball].d, R = D / 2;
  const raw = shooterCad(S.stlX, 0, S.stlZ);
  /* a flywheel modelled in the CAD tells us exactly where the wheel goes and how big it is */
  if (cad.wheel && cad.wheel.length) {
    const wb = boxOf(cadToRobot(cad.wheel, cad.step ? '0.001' : S.stlUnits, S.stlRot, S.stlX, 0, S.stlZ));
    const size = [0, 1, 2].map((k) => wb.hi[k] - wb.lo[k]), c = [0, 1, 2].map((k) => (wb.lo[k] + wb.hi[k]) / 2);
    /* the axle runs along the side whose two other sides are equal (the round face) */
    const roundness = (k) => { const o = [0, 1, 2].filter((i) => i !== k).map((i) => size[i]); return Math.abs(o[0] - o[1]) / Math.max(o[0], o[1]); };
    const axle = [0, 1, 2].reduce((a, k) => (roundness(k) < roundness(a) ? k : a), 0);
    if (axle !== 1 || roundness(1) > 0.12) { info.textContent = 'The flywheel in your CAD does not have its axle running left to right. Use "Spin the part" so the axle points sideways, then press Auto-place again.'; return; }
    const dia = (size[0] + size[2]) / 2, rw = dia / 2;
    S.wheelD = Math.round(dia * 1000); S.wheelW = Math.max(8, Math.round(size[1] * 1000));
    S.stlY = Math.round(-c[1] * 1000);
    const segs = slice(raw, c[1]);
    const near = segs.length ? arcAt(c[0], c[2], segs, rw + D + 0.004, rw + 0.001) : { dmin: Infinity, run: 0 };
    const gap = near.pathMin - rw;
    if (!segs.length || near.run < 4 || !isFinite(gap)) {
      S.wheelX = Math.round(c[0] * 1000); S.wheelZ = Math.round(c[2] * 1000);
      info.textContent = 'Placed the flywheel where your CAD has it (' + S.wheelD + ' mm), but no hood surface curves round it, so set the spin direction and feed point by hand.';
    } else {
      const f = await bestFeed(c[0], c[2], rw, shooterCad(), wheelSpec(), (q) => { info.textContent = 'Test-firing balls from spots round the wheel… ' + Math.round(q * 100) + '%'; });
      if (f.best) {
        placeFeed(c[0], c[2], f.best);
        info.textContent = 'Used the flywheel from your CAD (' + cad.wheelNames.join(', ') + ', ' + S.wheelD + ' mm) and test-fired ' + f.tried + ' balls from spots round it. Best: feed at the honey dot, wheel spinning ' +
          (f.best.dir === 1 ? 'forward' : 'in reverse') + ', ' + f.best.v.toFixed(1) + ' m/s at ' + Math.round(f.best.ang) + '° with ' + (f.best.comp * 1000).toFixed(1) + ' mm of squeeze. If your balls really come in somewhere else, drag the dot there. Check the wheel type in Step 2 matches yours.';
      } else {
        const r = finishPlace(c[0], c[2], arcAt(c[0], c[2], segs, near.pathMin + 0.006, rw + 0.001), rw, gap);
        info.textContent = 'Used the flywheel from your CAD (' + cad.wheelNames.join(', ') + '), but no test shot came out cleanly. Spin set to ' + (r.dir === 1 ? 'forward' : 'reverse') + '; drag the feed dot to where your balls come in.';
      }
    }
    save(); writeUI(); rebuild();
    return;
  }
  /* otherwise search for the spot where a wheel of the chosen size sits under the hood with the target squeeze */
  const spec = wheelSpec(), rw = spec.d / 2000, gap = D - S.comp / 1000, want = rw + gap;
  const box = boxOf(raw), y0 = (box.lo[1] + box.hi[1]) / 2, segs = slice(raw, y0);
  if (segs.length < 3) { info.textContent = 'The middle of your shooter has no surfaces for a ball to roll on. Drag the flywheel into place instead.'; return; }
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const s of segs) for (const p of s) { lo = [Math.min(lo[0], p[0]), Math.min(lo[1], p[1])]; hi = [Math.max(hi[0], p[0]), Math.max(hi[1], p[1])]; }
  let best = null;
  for (let cx = lo[0] - want; cx <= hi[0] + want; cx += 0.003) for (let cz = lo[1] - want; cz <= hi[1] + want; cz += 0.003) {
    const a = arcAt(cx, cz, segs, want + 0.006);
    if (Math.abs(a.dmin - want) > 0.0015) continue;
    const score = a.run - Math.abs(a.dmin - want) * 1000;
    if (!best || score > best.score) best = Object.assign({ score, cx, cz }, a);
  }
  if (!best || best.run < 6) { info.textContent = 'No part of your shooter curves round a ' + spec.d + ' mm wheel with that squeeze. Try another wheel size or squeeze, or drag the flywheel into place.'; return; }
  S.stlY = Math.round(-y0 * 1000);
  const f = await bestFeed(best.cx, best.cz, rw, shooterCad(), spec, (q) => { info.textContent = 'Test-firing balls from spots round the wheel… ' + Math.round(q * 100) + '%'; });
  if (f.best) {
    placeFeed(best.cx, best.cz, f.best);
    info.textContent = 'Placed the flywheel where your hood wraps ' + Math.round(best.run * 360 / BINS) + '° round it with ' + S.comp + ' mm of squeeze, then test-fired ' + f.tried + ' balls. Best: wheel spinning ' +
      (f.best.dir === 1 ? 'forward' : 'in reverse') + ', ' + f.best.v.toFixed(1) + ' m/s at ' + Math.round(f.best.ang) + '°. Drag the feed dot if your balls come in somewhere else.';
  } else {
    const r = finishPlace(best.cx, best.cz, best, rw, gap);
    info.textContent = 'Placed: your hood wraps ' + r.wrap + '° round the wheel with ' + S.comp + ' mm of squeeze, the wheel spins ' + (r.dir === 1 ? 'forward' : 'in reverse') +
      '. No test shot came out cleanly, so drag the feed dot to where your balls come in.';
  }
  save(); writeUI(); rebuild();
}

/* ---------- reading CAD files ---------- */
let stepWorker = null;
function readCad(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 80 * 1024 * 1024) { reject(new Error('That file is over 80 MB. Export only the parts you need.')); return; }
    const rd = new FileReader();
    rd.onerror = () => reject(new Error('The file could not be opened.'));
    rd.onload = () => {
      const step = /\.(step|stp)$/i.test(file.name);
      if (!step) {
        try { resolve(splitWheels({ tris: L.parseSTL(rd.result), name: file.name, step: false })); } catch (err) { reject(err); }
        return;
      }
      try { if (!stepWorker) stepWorker = new Worker('step-worker.js'); } catch (err) { reject(new Error('This browser cannot read STEP files here. Export an STL instead.')); return; }
      stepWorker.onmessage = (ev) => ev.data.error ? reject(new Error(ev.data.error)) : resolve(splitWheels({ tris: ev.data.tris, parts: ev.data.parts, name: file.name, step: true }));
      stepWorker.onerror = () => { stepWorker = null; reject(new Error('The STEP reader could not start. Export an STL instead.')); };
      stepWorker.postMessage({ buffer: rd.result }, [rd.result]);
    };
    rd.readAsArrayBuffer(file);
  });
}
/* A flywheel or roller modelled in a STEP file would be a solid, still wheel that blocks every ball. The lab's own spinning
   wheel replaces it, so it is left out of the collisions and kept aside for Auto-place. STL files have no part names. */
const WHEEL_PART = /fly ?wheel|\bwheels?\b|roller|compliant/i, NOT_WHEEL = /axle|shaft|motor|cable|gear|pinion|plate|tape|mount|bracket|spacer|hub ?mount/i;
function splitWheels(f) {
  f.solid = f.tris; f.wheel = null; f.wheelNames = [];
  if (!f.parts) return f;
  const keep = [], wheel = [];
  for (const p of f.parts) (WHEEL_PART.test(p.name) && !NOT_WHEEL.test(p.name) ? wheel : keep).push(p);
  if (!wheel.length) return f;
  const cut = (list) => { const out = new Float32Array(list.reduce((a, p) => a + p.end - p.start, 0)); let k = 0; for (const p of list) { out.set(f.tris.subarray(p.start, p.end), k); k += p.end - p.start; } return out; };
  f.solid = cut(keep); f.wheel = cut(wheel); f.wheelNames = wheel.map((p) => p.name);
  return f;
}
function describe(f, isRobot) {
  const b = boxOf(f.tris);
  return f.name + ': ' + (f.tris.length / 9).toLocaleString() + ' triangles, ' + [0, 1, 2].map((k) => (b.hi[k] - b.lo[k]).toFixed(1)).join(' × ') + (f.step ? ' mm' : ' in file units') +
    '. Read in your browser only; nothing was uploaded.' + (f.wheelNames.length ? ' Found a modelled wheel (' + f.wheelNames.join(', ') + '): ' + (isRobot ? 'it is left out of the bounces so it cannot block the balls.' : 'the lab’s spinning flywheel replaces it, and Auto-place uses its exact spot.') : '');
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
  colors = { bg: cssColor('--sunk', [0.9, 0.9, 0.88]), honey: cssColor('--honey', [0.88, 0.63, 0]), part: cssColor('--part', [0.42, 0.45, 0.4]),
    ink: cssColor('--ink', [0.1, 0.1, 0.1]), good: cssColor('--good', [0.17, 0.48, 0.29]), bad: cssColor('--bad', [0.7, 0.15, 0.12]) };
  if (glv) glv.bg = colors.bg;
}

/* The field: the CAD parts once, and the tiles drawn as plain squares (their edge detail is left out of the field file). */
function uploadField() {
  if (!glv) return;
  const h = field ? field.half : 1.793, fl = [], g = [];
  fl.push(-h, -h, 0, h, -h, 0, h, h, 0, -h, -h, 0, h, h, 0, -h, h, 0);
  glv.setTris('floor', new Float32Array(fl), [0.26, 0.27, 0.26]);
  for (let k = -3; k <= 3; k++) { const v = k * 0.6096 * (h / 1.8288); g.push(v, -h, 0.001, v, h, 0.001, -h, v, 0.001, h, v, 0.001); }
  glv.setLines('grid', g, [0.5, 0.5, 0.5]);
  if (!field) return;
  glv.setParts('field', field.parts.filter((p) => !/Glass/.test(p.name)).map((p) => ({ tris: p.tris, color: p.color })));
  glv.setParts('glass', field.parts.filter((p) => /Glass/.test(p.name)).map((p) => ({ tris: p.tris, color: [0.85, 0.9, 0.95] })));
}

/* The target CELL as a glowing block, from its outline. */
function uploadTarget() {
  if (!glv) return;
  const t = target();
  if (!t) { glv.setTris('target', new Float32Array(9), [1, 1, 1]); return; }
  const out = [], hh = t.hull, P = (x, q) => [x, q[0], q[1]];
  for (let i = 0; i < hh.length; i++) { const a = hh[i], b = hh[(i + 1) % hh.length]; out.push(...P(t.x0, a), ...P(t.x1, a), ...P(t.x1, b), ...P(t.x0, a), ...P(t.x1, b), ...P(t.x0, b)); }
  for (let i = 1; i < hh.length - 1; i++) for (const x of [t.x0, t.x1]) out.push(...P(x, hh[0]), ...P(x, hh[i]), ...P(x, hh[i + 1]));
  glv.setTris('target', new Float32Array(out), [1, 1, 1]);
}

/* Everything that moves when parts or the robot are dragged. */
function uploadMoving() {
  if (!glv || !world) return;
  glv.setTris('shooter', world.tris.length ? world.tris : new Float32Array(9), [1, 1, 1]);
  glv.setTris('robot', world.rtris || new Float32Array(9), [1, 1, 1]);
  const P = world.P, s = 0.2286, c = [[-s, -s], [s, -s], [s, s], [-s, s]].map((q) => toField([q[0], q[1], 0.003], P)), pts = [];
  for (let i = 0; i < 4; i++) pts.push(...c[i], ...c[(i + 1) % 4]);
  const nose = toField([s + 0.05, 0, 0.003], P);                  // a small arrow shows which way the robot faces
  pts.push(...toField([s - 0.03, -0.04, 0.003], P), ...nose, ...nose, ...toField([s - 0.03, 0.04, 0.003], P));
  glv.setLines('footprint', pts, [1, 1, 1]);
}

const CAMS = {
  shooter: () => ({ target: world.wheelC.slice(), dist: 0.6, yaw: world.P.h - Math.PI / 2, pitch: 0.12 }),
  side: () => { const t = target(), c = t ? t.center : V.add(world.wheelC, dirToField([1.5, 0, 0.8], world.P)), m = V.mul(V.add(world.wheelC, c), 0.5);
    return { target: [m[0], m[1], 0.85], dist: Math.max(2.6, V.len(V.sub(c, world.wheelC)) * 1.6), yaw: world.P.h - Math.PI / 2, pitch: 0.15 }; },
  behind: () => { const t = target(), c = t ? t.center : V.add(world.wheelC, dirToField([1.5, 0, 0.8], world.P)), m = V.add(V.mul(world.wheelC, 0.4), V.mul(c, 0.6));
    return { target: [m[0], m[1], 0.9], dist: Math.max(2.4, V.len(V.sub(c, world.wheelC)) * 1.3), yaw: world.P.h + Math.PI, pitch: 0.32 }; },
  hive: () => { const t = target(), c = t ? t.center : world.wheelC; return { target: c.slice(), dist: 1.3, yaw: world.P.h + Math.PI + 0.6, pitch: 0.5 }; },
  top: () => ({ target: [0, 0, 0.3], dist: 5.6, yaw: -Math.PI / 2, pitch: 1.45 })
};
function cam(name) { if (glv && world) Object.assign(glv.cam, CAMS[name]()); }

function scene() {
  const M = BBZ.LabGL.M, items = [];
  items.push({ geo: 'floor' }, { geo: 'grid', tint: [...colors.ink, 0.2] });
  if (field) items.push({ geo: 'field' });
  items.push({ geo: 'shooter', tint: [0.55, 0.62, 0.72, 0.85] });
  if (world.rtris) items.push({ geo: 'robot', tint: [0.62, 0.64, 0.6, 1] });
  items.push({ geo: 'footprint', tint: [...colors.honey, 0.9] });
  for (const w of sim.wheels) items.push({ geo: 'wheel', m: M.trs(w.c, w.a, w.angle, [w.r + w.growth, w.hw, w.r + w.growth]) });
  if (S.src === 'stl' && !S.lock) items.push({ geo: 'ball', m: M.trs(world.feed, [0, 0, 1], 0, 0.012), tint: [...colors.honey, 1], lit: false });
  for (const b of sim.balls) {
    if (b.st === 'gone') continue;
    const wl = V.len(b.w), ax = wl > 1e-6 ? V.mul(b.w, 1 / wl) : [0, 0, 1];
    items.push({ geo: 'ball', m: M.trs(b.p, ax, b.rot || 0, b.R), tint: [...L.BALLS[b.type].color, 1] });
  }
  /* shot paths: the last few, green when scored */
  const paths = sim.balls.slice(-8), pts = { good: [], bad: [], live: [] };
  for (const b of paths) {
    const key = b.result === 'Scored' ? 'good' : b.result ? 'bad' : 'live';
    for (let i = 1; i < b.path.length; i++) pts[key].push(...b.path[i - 1], ...b.path[i]);
  }
  glv.setLines('pGood', pts.good, colors.good); glv.setLines('pBad', pts.bad, colors.bad); glv.setLines('pLive', pts.live, [1, 1, 1]);
  items.push({ geo: 'pGood' }, { geo: 'pBad' }, { geo: 'pLive', tint: [...colors.ink, 0.7] });
  if (field) items.push({ geo: 'glass', tint: [1, 1, 1, 0.22] }, { geo: 'target', tint: [...colors.honey, 0.28] });
  return items;
}

/* ---------- dragging parts in the 3D view ---------- */
function raySphere(ray, c, r) {
  const oc = V.sub(ray.o, c), b = V.dot(oc, ray.d), q = V.dot(oc, oc) - r * r, disc = b * b - q;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}
function rayBox(ray, bx) {
  if (!bx) return null;
  let t0 = 0, t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(ray.d[k]) < 1e-12) { if (ray.o[k] < bx.lo[k] || ray.o[k] > bx.hi[k]) return null; continue; }
    let a = (bx.lo[k] - ray.o[k]) / ray.d[k], b = (bx.hi[k] - ray.o[k]) / ray.d[k];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}
function rayPlane(ray, p0, n) {
  const den = V.dot(ray.d, n);
  if (Math.abs(den) < 1e-9) return null;
  const t = V.dot(V.sub(p0, ray.o), n) / den;
  return t > 0 ? V.add(ray.o, V.mul(ray.d, t)) : null;
}

/* What is under the pointer: the feed dot, a wheel, the shooter, the robot model or the robot's outline on the floor. */
function pick(ray, hover) {
  if (S.lock || !world || !sim) return null;
  const hits = [];
  const add = (kind, t, at) => { if (t != null) hits.push({ kind, t, at }); };
  if (S.src === 'stl') add('feed', raySphere(ray, world.feed, 0.03), world.feed);
  add('wheel', raySphere(ray, world.wheelC, sim.wheels[0].r + 0.01), world.wheelC);
  if (world.secondC && S.src === 'stl') add('second', raySphere(ray, world.secondC, sim.wheels[1].r + 0.01), world.secondC);
  if (world.tris.length) add('shooter', rayBox(ray, world.shooterBox));
  if (world.rtris) add('robot', rayBox(ray, world.robotBox));
  const f = rayPlane(ray, [0, 0, 0], [0, 0, 1]);
  if (f) { const l = dirToRobot(V.sub(f, [world.P.x, world.P.y, 0]), world.P); if (Math.abs(l[0]) < 0.24 && Math.abs(l[1]) < 0.24) add('robot', V.len(V.sub(f, ray.o)) + 0.001); }
  if (!hits.length) return null;
  hits.sort((a, b) => a.t - b.t);
  /* a small target in front of a big one wins: the feed dot and wheels before the shooter box */
  const h = hits.find((x) => x.kind === 'feed' || x.kind === 'wheel' || x.kind === 'second') || hits[0];
  if (hover) return h;
  const at = V.add(ray.o, V.mul(ray.d, h.t));
  const plane = h.kind === 'robot' ? { p0: [0, 0, 0], n: [0, 0, 1] } : { p0: at, n: world.axis };
  const start = rayPlane(ray, plane.p0, plane.n) || at;
  return { kind: h.kind, plane, start, S0: Object.assign({}, S) };
}

let dragFrame = 0;
function dragTo(h, ray) {
  const p = rayPlane(ray, h.plane.p0, h.plane.n);
  if (!p) return;
  const d = V.sub(p, h.start), O = h.S0;
  dragging = h;
  if (h.kind === 'robot') {
    const lim = (field ? field.half : 1.793) / IN - 9;
    S.robotX = Math.round(Math.max(-lim, Math.min(lim, O.robotX + d[0] / IN)) * 10) / 10;
    S.robotY = Math.round(Math.max(-lim, Math.min(lim, O.robotY + d[1] / IN)) * 10) / 10;
  } else {
    const l = dirToRobot(d, world.P), dx = Math.round(l[0] * 1000), dz = Math.round(l[2] * 1000);
    if (h.kind === 'wheel' || (h.kind === 'shooter' && S.src === 'ex')) { S.wheelX = O.wheelX + dx; S.wheelZ = Math.max(30, O.wheelZ + dz); }
    else if (h.kind === 'feed') { S.feedX = O.feedX + dx; S.feedZ = O.feedZ + dz; }
    else if (h.kind === 'second') { S.secX = O.secX + dx; S.secZ = O.secZ + dz; }
    else if (h.kind === 'shooter') { S.stlX = O.stlX + dx; S.stlZ = O.stlZ + dz; }
  }
  if (!dragFrame) dragFrame = requestAnimationFrame(() => { dragFrame = 0; writeUI(); build(true); if (!running && glv) glv.draw(scene()); });
}
function dragEnd() {
  dragging = null;
  save(); writeUI(); log = []; build(); results();
}

/* ---------- the loop ---------- */
let running = false, lastFrame = 0, frameCount = 0;
function frame(now) {
  if (!running) return;
  requestAnimationFrame(frame);
  const real = Math.min(0.05, (now - (lastFrame || now)) / 1000);
  lastFrame = now;
  if (sim && !paused && !dragging) step(real * timeScale);
  if (glv && sim) { if ((frameCount++ % 60) === 0) readColors(); glv.draw(scene()); }
  live();
}

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
  const type = S.ball === 'P' ? 'P' : S.alliance === 'blue' ? 'B' : 'R';
  sim.addBall(type, world.feed, V.mul(world.dir, +S.feedV), [0, 0, 0], sim.ballCal);
  fed++; lastFeed = sim.t;
}

const mmPct = (c) => (c * 1000).toFixed(1) + ' mm (' + Math.round(c / L.BALLS[S.ball].d * 100) + '%)';
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
  const lc = [...log].reverse().find((s) => s.comp > 0);
  $('labLiveComp').textContent = lc ? (lc.comp * 1000).toFixed(1) : '–';
  $('labLiveCompPct').textContent = lc ? 'mm · ' + Math.round(lc.comp / L.BALLS[S.ball].d * 100) + '% of the ball' : 'mm';
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
const RES_CLASS = { Scored: 'res-good', 'Hit the CELL rim': 'res-warn', 'Hit the HIVE': 'res-bad', Short: 'res-bad', Long: 'res-bad', 'Bounced out': 'res-warn', 'Missed the opening': 'res-warn', 'Jammed in the shooter': 'res-bad', 'Never reached the flywheel': 'res-bad' };
function results() {
  const shots = log, n = shots.length, ex = shots.filter((s) => s.exit).map((s) => s.exit);
  const scored = shots.filter((s) => s.result === 'Scored').length;
  const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) * (v - m)))); };
  const speeds = ex.map((e) => e.v), drops = ex.map((e) => e.rpmBefore - e.rpmAfter), rec = shots.filter((s) => s.recover != null).map((s) => s.recover);
  const comps = shots.filter((s) => s.comp > 0).map((s) => s.comp);
  const stat = (label, val, sub) => '<div><span class="hint">' + label + '</span><b>' + val + '</b>' + (sub ? '<span class="hint">' + sub + '</span>' : '') + '</div>';
  $('labStats').innerHTML = n ? [
    stat('Shots', String(n)),
    stat('Scored', scored + ' / ' + n, Math.round(scored / n * 100) + '%'),
    stat('Exit speed', speeds.length ? mean(speeds).toFixed(2) + ' m/s' : '–', speeds.length > 1 ? '± ' + sd(speeds).toFixed(2) + ' m/s spread' : ''),
    stat('Squeeze', comps.length ? (mean(comps) * 1000).toFixed(1) + ' mm' : '–', comps.length ? Math.round(mean(comps) / L.BALLS[S.ball].d * 100) + '% of the ball, average' : ''),
    stat('Wheel slows per shot', drops.length ? Math.round(mean(drops)) + ' rpm' : '–', drops.length ? Math.round(mean(drops) / Math.max(1, S.rpm) * 100) + '% of target' : ''),
    stat('Back to speed', rec.length ? mean(rec).toFixed(2) + ' s' : '–', 'to within 2%'),
    stat('Spin-up', spinUp != null ? spinUp.toFixed(2) + ' s' : '–', 'from stopped')
  ].join('') : '<p class="hint">Press Start feeding to fire balls. Results show here.</p>';
  const body = $('labShots'); body.textContent = '';
  for (const s of shots.slice(-15).reverse()) {
    const tr = document.createElement('tr');
    const cells = ['' + s.n, s.result, s.comp > 0 ? mmPct(s.comp) : '–', s.exit ? s.exit.v.toFixed(2) + ' m/s' : '–', s.exit ? s.exit.ang.toFixed(1) + '°' : '–',
      s.exit ? Math.round(s.exit.spin) + ' rpm' : '–', s.exit ? Math.round(s.exit.rpmBefore) + ' → ' + Math.round(s.exit.rpmAfter) : '–'];
    cells.forEach((t, i) => { const td = document.createElement('td'); td.textContent = t; if (i === 1) td.className = RES_CLASS[t] || ''; tr.appendChild(td); });
    body.appendChild(tr);
  }
  $('labAdvice').textContent = advice(shots, speeds);
}

function advice(shots, speeds) {
  if (!shots.length) return '';
  const c = (r) => shots.filter((s) => s.result === r).length, n = shots.length, tips = [];
  if (c('Jammed in the shooter') > 0) tips.push('Balls are jamming: lower the compression or feed them faster into the wheel.');
  if (c('Never reached the flywheel') > 0) tips.push('Some balls never reached the flywheel: move the feed point closer, feed them faster, or speed up the transfer roller.');
  if (c('Short') / n > 0.3) tips.push('Shots fall short: raise the flywheel speed, raise the launch angle or move closer.');
  if (c('Long') / n > 0.3) tips.push('Shots go long: lower the flywheel speed or move further back.');
  if (c('Hit the CELL rim') / n > 0.3) tips.push('Shots clip the CELL rim: a small change in speed (about 50 rpm) or a steeper arc should drop them in.');
  if (c('Hit the HIVE') / n > 0.3) tips.push('Shots hit the HIVE: check Aim at the HIVE, then adjust the speed so the ball drops into the CELL opening.');
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
  if (key === 'comp') writeUI();
  save(); labels();
  if (LIVE.has(key)) { applyAir(); setTargets(); wheelInfo(); return; }
  if (e.type === 'input' && (el.type === 'range' || el.type === 'number')) return;      // rebuild when the slider is let go or the box is left
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
$('labAllRed').addEventListener('click', () => { if (S.alliance !== 'red') { S.alliance = 'red'; mirrorToAlliance(); } });
$('labAllBlue').addEventListener('click', () => { if (S.alliance !== 'blue') { S.alliance = 'blue'; mirrorToAlliance(); } });
/* The two alliances' upward CELLS mirror each other through the middle of the field, so switching alliance moves the robot to the mirrored spot. */
function mirrorToAlliance() {
  S.robotX = -S.robotX; S.robotY = -S.robotY; S.heading = ((S.heading + 360) % 360) - 180;
  save(); writeUI(); rebuild();
}
$('labAim').addEventListener('click', () => {
  const t = target(); if (!t) return;
  const o = world.wheelC;
  S.heading = Math.round(Math.atan2(t.center[1] - o[1], t.center[0] - o[0]) * 180 / Math.PI);
  /* turning moves the flywheel if it is off the robot's centre, so aim twice */
  place(wheelSpec());
  const o2 = world.wheelC; S.heading = Math.round(Math.atan2(t.center[1] - o2[1], t.center[0] - o2[0]) * 180 / Math.PI);
  save(); writeUI(); rebuild();
});
$('labAutoPlace').addEventListener('click', autoPlace);
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

$('labStlFile').addEventListener('change', async () => {
  const f = $('labStlFile').files[0];
  if (!f) return;
  $('labStlInfo').textContent = /\.(step|stp)$/i.test(f.name) ? 'Reading the STEP file… big assemblies can take a minute.' : 'Reading…';
  try {
    const got = await readCad(f);
    if (got.tris.length / 9 > 400000) throw new Error('This model has ' + Math.round(got.tris.length / 9).toLocaleString() + ' triangles. Export only the shooter, or with a coarser mesh (under 400,000).');
    cad = got;
    $('labStlInfo').textContent = describe(got);
    rebuild();
  } catch (err) { $('labStlInfo').textContent = err.message || 'This file could not be read.'; }
});

$('labRobotFile').addEventListener('change', async () => {
  const f = $('labRobotFile').files[0];
  if (!f) return;
  $('labRobotInfo').textContent = /\.(step|stp)$/i.test(f.name) ? 'Reading the STEP file… big assemblies can take a minute.' : 'Reading…';
  try {
    const got = await readCad(f);
    if (got.tris.length / 9 > 600000) throw new Error('This robot has ' + Math.round(got.tris.length / 9).toLocaleString() + ' triangles. Export it with a coarser mesh (under 600,000).');
    robot = got;
    /* stand the robot on the floor, centred on the robot's middle, unless it was moved before */
    const b = boxOf(cadToRobot(got.solid, got.step ? '0.001' : S.robUnits, S.robRot, 0, 0, 0));
    S.robMX = Math.round(-(b.lo[0] + b.hi[0]) / 2 * 1000); S.robMY = Math.round(-(b.lo[1] + b.hi[1]) / 2 * 1000); S.robMZ = Math.round(-b.lo[2] * 1000);
    $('labRobotInfo').textContent = describe(got, true) + ' It has been stood on the floor in the middle of the robot; use the boxes below to line it up.';
    save(); writeUI(); rebuild();
  } catch (err) { $('labRobotInfo').textContent = err.message || 'This file could not be read.'; }
});
$('labRobotRemove').addEventListener('click', () => { robot = null; $('labRobotFile').value = ''; $('labRobotInfo').textContent = 'Without a robot file the lab shows just the flywheel and shooter.'; writeUI(); rebuild(); });

$('labExDownload').addEventListener('click', () => {
  const spec = wheelSpec(), parts = shooterParts(spec), W = wheelAt(), t = new Float32Array(parts.tris.length);
  for (let i = 0; i < t.length; i++) t[i] = parts.tris[i] - W[i % 3];          // saved round the flywheel axle
  const blob = new Blob([L.writeSTL(t)], { type: 'model/stl' });
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
    if (glv) {
      glv.pick = pick; glv.dragTo = dragTo; glv.dragEnd = dragEnd;
      readColors(); uploadField(); uploadMoving(); uploadTarget(); cam('side');
    }
  }
  if (on && !running) { running = true; lastFrame = 0; requestAnimationFrame(frame); }
  if (!on) running = false;
});

/* The official field is a separate file, loaded once. */
fetch('biobuzz-field.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((doc) => {
  const bin = atob(doc.data), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  field = L.parseField(bytes.buffer);
  $('labFieldInfo').textContent = 'Official BIOBUZZ field loaded from the field CAD: HIVES, walls and FLOWERS are all solid, so balls bounce off them.';
  uploadField(); build(); results();
  if (glv) cam('side');
}).catch(() => {
  fieldError = true;
  $('labFieldInfo').textContent = 'The field model could not be loaded, so there is no HIVE to aim at. Reload the page to try again.';
});

/* Test hook: runs the lab for `sec` simulated seconds without waiting for animation frames, then draws once. */
BBZ.labStep = function (sec) {
  for (let t = 0; t < sec; t += 0.05) step(0.05);
  if (glv) glv.draw(scene());
  live();
  return { t: sim.t, rpm: Math.abs(sim.wheels[0].omega) * 30 / Math.PI, balls: sim.balls.length, field: !!field,
    shots: log.map((s) => s.result + (s.exit ? ' ' + s.exit.v.toFixed(2) : '') + (s.comp ? ' sq' + (s.comp * 1000).toFixed(1) : '')),
    live: sim.balls.filter((b) => b.st === 'live').map((b) => b.p.map((x) => +x.toFixed(3)).concat([+V.len(b.v).toFixed(2)])),
    wheels: sim.wheels.map((w) => ({ c: w.c.map((x) => +x.toFixed(3)), r: w.r, rpm: Math.round(w.omega * 30 / Math.PI), role: w.role })), feed: world.feed.map((x) => +x.toFixed(3)) };
};
BBZ.labTest = { pick, dragTo, dragEnd, autoPlace, state: () => S, world: () => world, sim: () => sim, field: () => field, cad: () => cad };

writeUI();
readColors();
build();
results();
if (!$('view-lab').hidden) document.dispatchEvent(new CustomEvent('bbz:view', { detail: 'lab' }));
})();
