/* Field, robot, motor/servo and scoring model. Units: inches, seconds, radians.
   Field origin is the audience-side corner next to the red alliance; x runs toward blue, y toward the rear wall. */
(function () {
'use strict';
const BBZ = window.BBZ = window.BBZ || {};

const FIELD = 144;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = (a, b) => a + Math.random() * (b - a);

const MOTORS = {
  gb312: { label: 'goBILDA Yellow Jacket 312 RPM', rpm: 312, tpr: 537.7 },
  gb435: { label: 'goBILDA Yellow Jacket 435 RPM', rpm: 435, tpr: 384.5 },
  rev20: { label: 'REV HD Hex 20:1 (300 RPM)', rpm: 300, tpr: 560 },
  rev40: { label: 'REV HD Hex 40:1 (150 RPM)', rpm: 150, tpr: 1120 },
  core: { label: 'REV Core Hex (125 RPM)', rpm: 125, tpr: 288 }
};
const WHEELS = {
  w75: { label: '75 mm (2.95 in)', d: 2.95 },
  w96: { label: '96 mm (3.78 in)', d: 3.78 },
  w104: { label: '104 mm (4.09 in)', d: 4.09 }
};
const MECH_MOTOR = { rpm: 312, tpr: 537.7 };          // intake and lift gearmotor
const LAUNCH_MOTOR = { rpm: 6000, tpr: 28 };          // bare motor on the flywheel
const LIFT_MAX_IN = 26, LIFT_SPOOL_IN = 1.5;
const FLOWER_TOP_IN = 21.5, FLOWER_CAP = 7;
const TIP_WEIGHT = 8, NECTAR_WEIGHT = 5 / 3;         // 8 pollen, or 3 pollen + 3 nectar, tips a hive

const ROLES = {
  fl: { kind: 'motor', label: 'Front left wheel', def: 'fl' },
  fr: { kind: 'motor', label: 'Front right wheel', def: 'fr' },
  bl: { kind: 'motor', label: 'Back left wheel', def: 'bl' },
  br: { kind: 'motor', label: 'Back right wheel', def: 'br' },
  left: { kind: 'motor', label: 'Left wheels', def: 'leftDrive' },
  right: { kind: 'motor', label: 'Right wheels', def: 'rightDrive' },
  intake: { kind: 'motor', label: 'Intake roller', def: 'intake' },
  launcher: { kind: 'motor', label: 'Launcher flywheel', def: 'launcher' },
  feeder: { kind: 'servo', label: 'Launcher feeder', def: 'feeder' },
  lift: { kind: 'motor', label: 'Lift', def: 'lift' },
  gate: { kind: 'servo', label: 'Drop gate', def: 'gate' },
  imu: { kind: 'imu', label: 'IMU (gyro)', def: 'imu' },
  distance: { kind: 'distance', label: 'Front distance sensor', def: 'distance' }
};
const TOOLS = {
  intake: { label: 'Intake roller', roles: ['intake'], blurb: 'Spins to pull POLLEN and NECTAR in from the floor or from the bottom of a FLOWER. Reverse it to push pieces back out.' },
  launcher: { label: 'Flywheel launcher', roles: ['launcher', 'feeder'], blurb: 'A spinning wheel plus a feeder servo. Faster wheel = longer shot. Use it to LAUNCH into your HIVE.' },
  lift: { label: 'Lift + drop gate', roles: ['lift', 'gate'], blurb: 'Raises pieces up to the top of a FLOWER (21.5 in). The gate servo lets one piece go.' },
  imu: { label: 'IMU (gyro)', roles: ['imu'], blurb: 'Tells your code which way the robot is facing, in degrees. Great for accurate turns.' },
  distance: { label: 'Distance sensor', roles: ['distance'], blurb: 'Measures how far the nearest wall or the HIVE is in front of the robot.' }
};
const RESERVED = new Set(('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null ' +
  'runtime telemetry hardwareMap gamepad1 gamepad2 forward strafe turn power inches degrees ticks error max target correction').split(' '));

function validName(s) { return typeof s === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(s) && !RESERVED.has(s); }

function defaultRobot() {
  const names = {};
  Object.keys(ROLES).forEach((r) => { names[r] = ROLES[r].def; });
  return {
    name: 'Starter Bee', alliance: 'red', start: 'hive', drive: 'mecanum', motor: 'gb312', wheel: 'w104',
    realistic: true, width: 17, length: 17,
    tools: { intake: true, launcher: true, lift: true, imu: true, distance: true },
    names
  };
}

/* Returns a clean config built only from known keys; anything unexpected falls back to the default. */
function sanitizeRobot(o) {
  const d = defaultRobot();
  if (!o || typeof o !== 'object') return d;
  const pick = (v, set, def) => (typeof v === 'string' && Object.prototype.hasOwnProperty.call(set, v)) ? v : def;
  d.name = typeof o.name === 'string' ? o.name.replace(/[^\w .\-']/g, '').slice(0, 24) || d.name : d.name;
  d.alliance = o.alliance === 'blue' ? 'blue' : 'red';
  d.start = pick(o.start, { hive: 1, garden: 1, zone: 1 }, 'hive');
  d.drive = o.drive === 'tank' ? 'tank' : 'mecanum';
  d.motor = pick(o.motor, MOTORS, 'gb312');
  d.wheel = pick(o.wheel, WHEELS, 'w104');
  d.realistic = o.realistic !== false;
  const dim = (v, def) => (typeof v === 'number' && isFinite(v)) ? clamp(Math.round(v * 2) / 2, 12, 18) : def;
  d.width = dim(o.width, 17); d.length = dim(o.length, 17);
  if (o.tools && typeof o.tools === 'object') Object.keys(TOOLS).forEach((t) => { d.tools[t] = o.tools[t] === true; });
  const seen = new Set();
  Object.keys(ROLES).forEach((r) => {
    const v = o.names && typeof o.names === 'object' ? o.names[r] : null;
    let nm = validName(v) ? v : ROLES[r].def;
    if (seen.has(nm)) nm = ROLES[r].def;
    seen.add(nm); d.names[r] = nm;
  });
  return d;
}

function driveRoles(cfg) { return cfg.drive === 'mecanum' ? ['fl', 'fr', 'bl', 'br'] : ['left', 'right']; }
function deviceList(cfg) {
  const roles = driveRoles(cfg).slice();
  Object.keys(TOOLS).forEach((t) => { if (cfg.tools[t]) TOOLS[t].roles.forEach((r) => roles.push(r)); });
  return roles.map((r) => ({ role: r, kind: ROLES[r].kind, label: ROLES[r].label, name: cfg.names[r] }));
}
function turnK(cfg) { return cfg.drive === 'mecanum' ? (cfg.width - 2) / 2 + (cfg.length - 5) / 2 : (cfg.width - 2) / 2; }
function ticksPerInch(cfg) { return MOTORS[cfg.motor].tpr / (Math.PI * WHEELS[cfg.wheel].d); }
function liftTicksPerInch() { return MECH_MOTOR.tpr / (Math.PI * LIFT_SPOOL_IN); }

/* ----- field geometry (red side; blue is the same field turned 180 degrees) ----- */
const HIVE_BOX = { x0: 47.27, y0: 52.5, x1: 96.73, y1: 91.5 };
const CELL_Y = { aud: [56.6, 68.6], rear: [75.4, 87.4] };
const HIVE_X = { R: [49.5, 69.5], B: [74.5, 94.5] };
const ZONES = {
  R: { load: { x0: 0, y0: 96.5, x1: 11, y1: 119.5 }, garden: { x0: 0, y0: 0, x1: 23, y1: 2 } },
  B: { load: { x0: 133, y0: 24.5, x1: 144, y1: 47.5 }, garden: { x0: 121, y0: 142, x1: 144, y1: 144 } }
};
const FLOWER_SPOTS = [
  { x: 60, y: 141, tx: 1, ty: 0 }, { x: 141, y: 84, tx: 0, ty: -1 },
  { x: 84, y: 3, tx: -1, ty: 0 }, { x: 3, y: 60, tx: 0, ty: 1 }
];
const START_SPOTS = {
  hive: { label: 'Audience wall, facing your HIVE' },
  garden: { label: 'Alliance wall, near your GARDEN' },
  zone: { label: 'Alliance wall, near your LOADING ZONE' }
};
function startPose(cfg) {
  const hl = cfg.length / 2 + 0.05;
  let p;
  if (cfg.start === 'garden') p = { x: hl, y: 36, th: 0 };
  else if (cfg.start === 'zone') p = { x: hl, y: 84, th: 0 };
  else p = { x: 59.5, y: hl, th: Math.PI / 2 };
  if (cfg.alliance === 'blue') p = { x: FIELD - p.x, y: FIELD - p.y, th: p.th + Math.PI };
  return p;
}

/* ----- actuators ----- */
class Motor {
  constructor(role, name, spec, opt) {
    opt = opt || {};
    this.role = role; this.name = name; this.rpm = spec.rpm; this.tpr = spec.tpr;
    this.tps = spec.rpm / 60 * spec.tpr;
    this.mount = opt.mount || 1; this.gain = opt.gain || 1; this.tau = opt.tau || 0.1;
    this.min = opt.min; this.max = opt.max;
    this.raw = 0; this.off = 0; this.u = 0;
    this.resetSoft();
  }
  resetSoft() { this.power = 0; this.dir = 1; this.mode = 'RUN_WITHOUT_ENCODER'; this.zpb = 'BRAKE'; this.target = 0; this.hasTarget = false; }
  position() { return Math.round((this.raw - this.off) * this.dir); }
  velocity() { return this.u * this.tps * this.dir; }
  isBusy() { return this.mode === 'RUN_TO_POSITION' && Math.abs(this.target - (this.raw - this.off) * this.dir) > 12; }
  setPower(p) {
    if (typeof p !== 'number' || isNaN(p)) throw new Error('setPower() needs a number from -1.0 to 1.0.');
    this.power = clamp(p, -1, 1);
  }
  setMode(m) {
    if (['RUN_WITHOUT_ENCODER', 'RUN_USING_ENCODER', 'RUN_TO_POSITION', 'STOP_AND_RESET_ENCODER'].indexOf(m) < 0) throw new Error('setMode() needs a DcMotor.RunMode, like DcMotor.RunMode.RUN_USING_ENCODER.');
    if (m === 'RUN_TO_POSITION' && !this.hasTarget) throw new Error('Call ' + this.name + '.setTargetPosition(...) before switching to RUN_TO_POSITION. A real robot stops with the same error.');
    if (m === 'STOP_AND_RESET_ENCODER') this.off = this.raw;
    this.mode = m;
  }
  update(dt, enabled) {
    let cmd = 0;
    if (enabled) {
      if (this.mode === 'RUN_TO_POSITION') {
        const e = this.target - (this.raw - this.off) * this.dir;
        const lim = Math.abs(this.power);
        cmd = this.dir * clamp(e * 1.5 / this.tpr, -lim, lim);
      } else if (this.mode !== 'STOP_AND_RESET_ENCODER') cmd = this.power * this.dir;
    }
    cmd *= this.gain;
    const tau = cmd === 0 ? (this.zpb === 'BRAKE' ? this.tau * 0.6 : this.tau * 6) : this.tau;
    this.u += (cmd - this.u) * (1 - Math.exp(-dt / tau));
    if (cmd === 0 && Math.abs(this.u) < 0.002) this.u = 0;
    this.raw += this.u * this.tps * dt;
    if (this.min !== undefined && this.raw < this.min) { this.raw = this.min; if (this.u < 0) this.u = 0; }
    if (this.max !== undefined && this.raw > this.max) { this.raw = this.max; if (this.u > 0) this.u = 0; }
  }
}
class Servo {
  constructor(role, name) { this.role = role; this.name = name; this.cmd = 0; this.dir = 1; this.actual = 0; this.live = false; }
  resetSoft() { this.dir = 1; this.live = false; this.cmd = this.actual; }
  setPosition(p) {
    if (typeof p !== 'number' || isNaN(p)) throw new Error('setPosition() needs a number from 0.0 to 1.0.');
    this.cmd = clamp(p, 0, 1); this.live = true;
  }
  update(dt) {
    if (!this.live) return;
    const target = this.dir < 0 ? 1 - this.cmd : this.cmd, step = dt / 0.3;
    this.actual += clamp(target - this.actual, -step, step);
  }
}

function segEnter(x0, y0, x1, y1, b) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const P = [-dx, dx, -dy, dy], Q = [x0 - b.x0, b.x1 - x0, y0 - b.y0, b.y1 - y0];
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) { if (Q[i] < 0) return null; }
    else {
      const t = Q[i] / P[i];
      if (P[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
      else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
  }
  return t0;
}
const inBox = (x, y, b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;

class World {
  constructor(cfg) { this.cfg = cfg; this.reset(); }

  reset() {
    const c = this.cfg, spec = MOTORS[c.motor];
    this.me = c.alliance === 'red' ? 'R' : 'B';
    this.time = 0; this.mode = 'idle'; this.clock = 0; this.enabled = false; this.endgame = false;
    this.events = []; this.phaseChanged = false; this.crossed = false;
    this.autoLeave = false; this.autoPark = false; this.autoDone = false; this.fouls = 0;
    this.wheelSpeed = spec.rpm / 60 * Math.PI * WHEELS[c.wheel].d;
    this.turnK = turnK(c);

    this.m = {}; this.s = {}; this.motorList = []; this.servoList = []; this.devices = new Map();
    deviceList(c).forEach((d) => {
      if (d.kind === 'motor') {
        let m;
        if (ROLES[d.role] && (d.role === 'intake')) m = new Motor(d.role, d.name, MECH_MOTOR, { tau: 0.12 });
        else if (d.role === 'launcher') m = new Motor(d.role, d.name, LAUNCH_MOTOR, { tau: 0.45 });
        else if (d.role === 'lift') m = new Motor(d.role, d.name, MECH_MOTOR, { tau: 0.08, min: 0, max: LIFT_MAX_IN * liftTicksPerInch() });
        else m = new Motor(d.role, d.name, spec, { tau: 0.1, gain: 0.85, mount: (c.realistic && (d.role === 'fl' || d.role === 'bl' || d.role === 'left')) ? -1 : 1 });
        this.m[d.role] = m; this.motorList.push(m);
        this.devices.set(d.name, { kind: 'motor', dev: m, api: motorApi(m) });
      } else if (d.kind === 'servo') {
        const s = new Servo(d.role, d.name);
        this.s[d.role] = s; this.servoList.push(s);
        this.devices.set(d.name, { kind: 'servo', dev: s, api: servoApi(s) });
      } else if (d.kind === 'imu') this.devices.set(d.name, { kind: 'imu', api: imuApi(this) });
      else if (d.kind === 'distance') this.devices.set(d.name, { kind: 'distance', api: distanceApi(this) });
    });

    const sp = startPose(c);
    this.robot = { x: sp.x, y: sp.y, th: sp.th, th0: sp.th, vx: 0, vy: 0, om: 0, held: [], intakeT: 0, feederUp: false, gateOpen: false, spin: 0, roll: 0 };

    this.balls = []; this.nextId = 1;
    const mk = (type, st, x, y) => { const b = { id: this.nextId++, type, st, x: x || 0, y: y || 0, vx: 0, vy: 0, r: type === 'P' ? 1.4 : 1.8, air: null }; this.balls.push(b); return b; };
    this.mk = mk;
    this.flowers = FLOWER_SPOTS.map((f, i) => ({ id: i, x: f.x, y: f.y, tx: f.tx, ty: f.ty, box: { x0: f.x - 3, y0: f.y - 3, x1: f.x + 3, y1: f.y + 3 }, stack: [0, 1, 2, 3].map(() => mk('P', 'flower')) }));
    for (let i = 0; i < 4; i++) { mk('P', 'floor', 1.4 + 2.8 * i, 1.4); mk('P', 'floor', FIELD - 1.4 - 2.8 * i, FIELD - 1.4); }
    for (let i = 0; i < 4; i++) this.robot.held.push(mk('P', 'held'));
    const three = (t) => [0, 1, 2].map(() => mk(t, 'cell'));
    this.hives = {
      R: { color: 'R', x0: HIVE_X.R[0], x1: HIVE_X.R[1], up: 'aud', cells: { aud: three('R'), rear: [] }, tipsAuto: 0, tipsTele: 0, flash: 0 },
      B: { color: 'B', x0: HIVE_X.B[0], x1: HIVE_X.B[1], up: 'rear', cells: { aud: [], rear: three('B') }, tipsAuto: 0, tipsTele: 0, flash: 0 }
    };
    this.staged = 5;
    this.obstacles = [HIVE_BOX].concat(this.flowers.map((f) => f.box));
  }

  emit(kind, text) { this.events.push({ kind, text, t: this.time }); if (kind === 'foul') this.fouls++; }
  device(name) { return this.devices.get(name) || null; }
  newOpMode() { this.motorList.forEach((m) => m.resetSoft()); this.servoList.forEach((s) => s.resetSoft()); }
  stopActuators() { this.motorList.forEach((m) => { m.power = 0; }); this.enabled = false; }

  yawDeg() { let d = (this.robot.th - this.robot.th0) * 180 / Math.PI; d = ((d + 180) % 360 + 360) % 360 - 180; return d; }
  liftHeight() { return this.m.lift ? this.m.lift.raw / liftTicksPerInch() : 0; }
  frontPoint(extra) { const r = this.robot, d = this.cfg.length / 2 + (extra || 0); return { x: r.x + Math.cos(r.th) * d, y: r.y + Math.sin(r.th) * d }; }
  distanceIn() {
    const r = this.robot, p = this.frontPoint(0), cx = Math.cos(r.th), sy = Math.sin(r.th);
    let best = 1e9;
    if (cx > 1e-6) best = Math.min(best, (FIELD - p.x) / cx); else if (cx < -1e-6) best = Math.min(best, -p.x / cx);
    if (sy > 1e-6) best = Math.min(best, (FIELD - p.y) / sy); else if (sy < -1e-6) best = Math.min(best, -p.y / sy);
    const t = segEnter(p.x, p.y, p.x + cx * 250, p.y + sy * 250, HIVE_BOX);
    if (t !== null) best = Math.min(best, t * 250);
    return clamp(best, 0, 80);
  }

  robotPoints() {
    const r = this.robot, hl = this.cfg.length / 2, hw = this.cfg.width / 2, c = Math.cos(r.th), s = Math.sin(r.th);
    return [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [hl, 0], [-hl, 0], [0, hw], [0, -hw], [0, 0]].map((q) => ({ x: r.x + q[0] * c - q[1] * s, y: r.y + q[0] * s + q[1] * c }));
  }
  robotInBox(b) {
    if (this.robotPoints().some((q) => q.x >= b.x0 && q.x <= b.x1 && q.y >= b.y0 && q.y <= b.y1)) return true;
    const r = this.robot, hl = this.cfg.length / 2, hw = this.cfg.width / 2, c = Math.cos(r.th), s = Math.sin(r.th);
    return [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].some((q) => {
      const dx = q[0] - r.x, dy = q[1] - r.y;
      return Math.abs(dx * c + dy * s) <= hl && Math.abs(-dx * s + dy * c) <= hw;
    });
  }
  inLoadingZone() { return this.robotInBox(ZONES[this.me].load); }
  offWall() { return this.robotPoints().slice(0, 4).every((q) => q.x > 0.6 && q.x < FIELD - 0.6 && q.y > 0.6 && q.y < FIELD - 0.6); }

  /* ----- one physics step ----- */
  step(dt) {
    this.time += dt;
    for (let i = 0; i < this.motorList.length; i++) this.motorList[i].update(dt, this.enabled);
    for (let i = 0; i < this.servoList.length; i++) this.servoList[i].update(dt);
    this.driveStep(dt);
    this.mechStep(dt);
    this.ballStep(dt);
    this.hives.R.flash = Math.max(0, this.hives.R.flash - dt);
    this.hives.B.flash = Math.max(0, this.hives.B.flash - dt);
    if (this.mode === 'auto' || this.mode === 'transition' || this.mode === 'teleop') {
      this.clock -= dt;
      if (this.mode === 'auto' && !this.crossed && (this.me === 'R' ? this.robot.x > 72 : this.robot.x < 72)) {
        this.crossed = true;
        this.emit('info', 'G402: your robot crossed to the other alliance\'s half during AUTO. That is risky and can earn a MAJOR FOUL.');
      }
      if (this.mode === 'teleop' && this.clock <= 60 && !this.endgame) {
        this.endgame = true;
        this.emit('info', '60 seconds left: NECTAR may now go into FLOWERS.');
        this.releaseNectar(99);
      }
      if (this.clock <= 0) {
        if (this.mode === 'auto') { this.autoLeave = this.offWall(); this.autoPark = this.inLoadingZone(); this.autoDone = true; this.mode = 'transition'; this.clock = 8; }
        else if (this.mode === 'transition') { this.mode = 'teleop'; this.clock = 120; }
        else { this.mode = 'over'; this.clock = 0; }
        this.phaseChanged = true;
      }
    }
  }

  driveStep(dt) {
    const c = this.cfg, r = this.robot, M = this.m, ws = this.wheelSpeed;
    let vx, vy = 0, om;
    if (c.drive === 'mecanum') {
      const fl = M.fl.u * M.fl.mount * ws, fr = M.fr.u * M.fr.mount * ws, bl = M.bl.u * M.bl.mount * ws, br = M.br.u * M.br.mount * ws;
      vx = (fl + fr + bl + br) / 4;
      vy = (-fl + fr + bl - br) / 4 * 0.85;
      om = (-fl + fr - bl + br) / (4 * this.turnK);
    } else {
      const l = M.left.u * M.left.mount * ws, rr = M.right.u * M.right.mount * ws;
      vx = (l + rr) / 2; om = (rr - l) / (2 * this.turnK);
    }
    const ox = r.x, oy = r.y, oth = r.th, cs = Math.cos(r.th), sn = Math.sin(r.th);
    r.x += (vx * cs - vy * sn) * dt; r.y += (vx * sn + vy * cs) * dt; r.th += om * dt;
    this.collideRobot();
    r.vx = (r.x - ox) / dt; r.vy = (r.y - oy) / dt; r.om = (r.th - oth) / dt;
  }

  collideRobot() {
    const r = this.robot, hl = this.cfg.length / 2, hw = this.cfg.width / 2;
    const pts = [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [hl, 0], [-hl, 0], [0, hw], [0, -hw]];
    for (let pass = 0; pass < 2; pass++) {
      const c = Math.cos(r.th), s = Math.sin(r.th);
      for (let i = 0; i < 4; i++) {
        const wx = r.x + pts[i][0] * c - pts[i][1] * s, wy = r.y + pts[i][0] * s + pts[i][1] * c;
        if (wx < 0) r.x -= wx; else if (wx > FIELD) r.x -= wx - FIELD;
        if (wy < 0) r.y -= wy; else if (wy > FIELD) r.y -= wy - FIELD;
      }
      for (let k = 0; k < this.obstacles.length; k++) {
        const b = this.obstacles[k];
        if (Math.abs(r.x - (b.x0 + b.x1) / 2) > (b.x1 - b.x0) / 2 + 14 || Math.abs(r.y - (b.y0 + b.y1) / 2) > (b.y1 - b.y0) / 2 + 14) continue;
        for (let i = 0; i < 8; i++) {
          const wx = r.x + pts[i][0] * c - pts[i][1] * s, wy = r.y + pts[i][0] * s + pts[i][1] * c;
          if (inBox(wx, wy, b)) {
            const dl = wx - b.x0, dr = b.x1 - wx, dd = wy - b.y0, du = b.y1 - wy, mn = Math.min(dl, dr, dd, du);
            if (mn === dl) r.x -= dl; else if (mn === dr) r.x += dr; else if (mn === dd) r.y -= dd; else r.y += du;
          }
        }
        const corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]];
        for (let i = 0; i < 4; i++) {
          const dx = corners[i][0] - r.x, dy = corners[i][1] - r.y, lx = dx * c + dy * s, ly = -dx * s + dy * c;
          if (Math.abs(lx) < hl && Math.abs(ly) < hw) {
            const px = hl - Math.abs(lx), py = hw - Math.abs(ly);
            if (px < py) { const k2 = lx > 0 ? -px : px; r.x += k2 * c; r.y += k2 * s; }
            else { const k2 = ly > 0 ? -py : py; r.x -= k2 * s; r.y += k2 * c; }
          }
        }
      }
    }
  }

  /* ----- mechanisms ----- */
  mechStep(dt) {
    const r = this.robot, held = r.held, hl = this.cfg.length / 2, hw = this.cfg.width / 2;
    r.intakeT -= dt;
    if (this.m.intake) {
      const u = this.m.intake.u;
      r.roll += u * dt * 14;
      if (u > 0.25 && held.length < 4 && r.intakeT <= 0) {
        const c = Math.cos(r.th), s = Math.sin(r.th);
        let got = null;
        for (let i = 0; i < this.balls.length && !got; i++) {
          const b = this.balls[i];
          if (b.st !== 'floor') continue;
          const dx = b.x - r.x, dy = b.y - r.y, lx = dx * c + dy * s, ly = -dx * s + dy * c;
          if (lx > hl - 0.5 && lx < hl + b.r + 2.2 && Math.abs(ly) < hw - 0.5) got = b;
        }
        if (!got) {
          const p = this.frontPoint(0);
          for (let i = 0; i < this.flowers.length && !got; i++) {
            const f = this.flowers[i];
            if (Math.hypot(p.x - f.x, p.y - f.y) < 8.5 && f.stack.length && f.stack[0].type === 'P') got = f.stack.shift();
          }
        }
        if (got) {
          got.st = 'held'; got.vx = got.vy = 0; held.push(got);
          r.intakeT = 0.28 / Math.max(u, 0.3);
          if (got.type !== 'P' && got.type !== this.me) this.emit('foul', 'G408: your robot picked up the other alliance\'s NECTAR. Referees would call a foul.');
        }
      } else if (u < -0.25 && held.length && r.intakeT <= 0) {
        const b = held.pop(), p = this.frontPoint(b.r + 0.4), c = Math.cos(r.th), s = Math.sin(r.th);
        b.st = 'floor'; b.x = p.x; b.y = p.y; b.vx = r.vx + c * 16 * -u; b.vy = r.vy + s * 16 * -u;
        r.intakeT = 0.3;
      }
    }
    if (this.m.launcher) {
      r.spin += this.m.launcher.u * dt * 40;
      if (this.s.feeder) {
        const up = this.s.feeder.actual >= 0.5;
        if (up && !r.feederUp && held.length) this.launch();
        r.feederUp = up;
      }
    }
    if (this.s.gate) {
      const open = this.s.gate.actual >= 0.5;
      if (open && !r.gateOpen && held.length) this.drop();
      r.gateOpen = open;
    }
  }

  launch() {
    const r = this.robot, b = r.held.shift(), f = Math.max(0, this.m.launcher.u);
    const ang = r.th + rnd(-1, 1) * Math.PI / 180;
    const range = (f < 0.15 ? this.cfg.length / 2 + 4 : 12 + 78 * f * f) * rnd(0.98, 1.02);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let x1 = r.x + dx * range, y1 = r.y + dy * range, dest = null, bvx = dx * 10, bvy = dy * 10;
    ['R', 'B'].forEach((k) => {
      const h = this.hives[k], cy = CELL_Y[h.up];
      if (x1 > h.x0 && x1 < h.x1 && y1 > cy[0] && y1 < cy[1]) dest = h;
    });
    if (!dest && inBox(x1, y1, HIVE_BOX)) {
      const t = segEnter(r.x, r.y, x1, y1, HIVE_BOX) || 0;
      const d = Math.max(0, t * range - 2.5);
      x1 = r.x + dx * d; y1 = r.y + dy * d; bvx = -dx * 14; bvy = -dy * 14;
      this.emit('info', 'A launched piece bounced off the HIVE. Only the upward-facing CELL catches pieces.');
    }
    if (x1 < 2 || x1 > FIELD - 2 || y1 < 2 || y1 > FIELD - 2) { x1 = clamp(x1, 2, FIELD - 2); y1 = clamp(y1, 2, FIELD - 2); bvx = -dx * 8; bvy = -dy * 8; }
    b.st = 'air'; b.x = r.x; b.y = r.y;
    b.air = { x0: r.x, y0: r.y, x1, y1, t: 0, T: 0.3 + range / 150, dest, vx: bvx, vy: bvy };
    this.m.launcher.u *= 0.86;                       // each shot takes energy out of the flywheel
  }

  drop() {
    const r = this.robot, b = r.held.shift(), p = this.frontPoint(2), h = this.liftHeight();
    let fl = null;
    this.flowers.forEach((f) => { if (Math.hypot(p.x - f.x, p.y - f.y) < 9) fl = f; });
    if (fl && h >= FLOWER_TOP_IN && fl.stack.length < FLOWER_CAP) {
      b.st = 'flower'; fl.stack.push(b);
      if (b.type !== 'P' && (this.mode === 'auto' || this.mode === 'transition' || (this.mode === 'teleop' && this.clock > 60)))
        this.emit('foul', 'G410: NECTAR went into a FLOWER before the last 60 seconds. That is a MAJOR FOUL in a real match.');
      else this.emit('good', (b.type === 'P' ? 'POLLEN' : 'NECTAR') + ' placed in a FLOWER.');
      return;
    }
    if (fl && h < FLOWER_TOP_IN) this.emit('info', 'The lift is at ' + h.toFixed(1) + ' in. Raise it to at least ' + FLOWER_TOP_IN + ' in to reach the top of a FLOWER.');
    else if (fl) this.emit('info', 'That FLOWER is full, so the piece rolled off.');
    const q = this.frontPoint(b.r + 0.5);
    b.st = 'floor'; b.x = q.x; b.y = q.y; b.vx = r.vx + Math.cos(r.th) * 5; b.vy = r.vy + Math.sin(r.th) * 5;
  }

  checkTip(h) {
    const cell = h.cells[h.up];
    let w = 0;
    cell.forEach((b) => { w += b.type === 'P' ? 1 : NECTAR_WEIGHT; });
    if (w < TIP_WEIGHT - 0.01) return;
    const side = h.up, dirY = side === 'aud' ? -1 : 1;
    cell.forEach((b) => {
      b.st = 'floor'; b.x = rnd(h.x0 + 2, h.x1 - 2);
      b.y = side === 'aud' ? HIVE_BOX.y0 - b.r - rnd(0.3, 2.5) : HIVE_BOX.y1 + b.r + rnd(0.3, 2.5);
      b.vx = rnd(-8, 8); b.vy = dirY * rnd(10, 26);
    });
    h.cells[side] = []; h.up = side === 'aud' ? 'rear' : 'aud'; h.flash = 1.2;
    const auto = this.mode === 'auto' || this.mode === 'transition';
    if (auto) h.tipsAuto++; else h.tipsTele++;
    if (h.color === this.me) {
      this.emit('good', 'HIVE TIP! +20 points. The other CELL is now facing up.');
      this.releaseNectar(1);
    } else this.emit('info', 'You tipped the other alliance\'s HIVE. That scores for them.');
  }

  releaseNectar(n) {
    const z = ZONES[this.me].load, k = Math.min(n, this.staged);
    for (let i = 0; i < k; i++) {
      const idx = 5 - this.staged;
      const x = this.me === 'R' ? z.x0 + 3 + (idx % 2) * 4.4 : z.x1 - 3 - (idx % 2) * 4.4;
      const y = z.y0 + 3 + Math.floor(idx / 2) * 5 + (idx % 2);
      this.mk(this.me, 'floor', x, y);
      this.staged--;
    }
    if (k > 0) this.emit('info', 'Your human player put ' + k + ' NECTAR in your LOADING ZONE.');
  }

  ballBox(b, box) {
    const x0 = box.x0 - b.r, x1 = box.x1 + b.r, y0 = box.y0 - b.r, y1 = box.y1 + b.r;
    if (!(b.x > x0 && b.x < x1 && b.y > y0 && b.y < y1)) return;
    const dl = b.x - x0, dr = x1 - b.x, dd = b.y - y0, du = y1 - b.y, mn = Math.min(dl, dr, dd, du);
    if (mn === dl) { b.x = x0; if (b.vx > 0) b.vx *= -0.4; }
    else if (mn === dr) { b.x = x1; if (b.vx < 0) b.vx *= -0.4; }
    else if (mn === dd) { b.y = y0; if (b.vy > 0) b.vy *= -0.4; }
    else { b.y = y1; if (b.vy < 0) b.vy *= -0.4; }
  }

  ballStep(dt) {
    const r = this.robot, hl = this.cfg.length / 2, hw = this.cfg.width / 2, c = Math.cos(r.th), s = Math.sin(r.th);
    const floor = [];
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      if (b.st === 'air') {
        const a = b.air; a.t += dt;
        const k = Math.min(1, a.t / a.T);
        b.x = a.x0 + (a.x1 - a.x0) * k; b.y = a.y0 + (a.y1 - a.y0) * k;
        if (k >= 1) {
          b.air = null;
          if (a.dest) { b.st = 'cell'; a.dest.cells[a.dest.up].push(b); this.checkTip(a.dest); }
          else { b.st = 'floor'; b.vx = a.vx; b.vy = a.vy; }
        }
        continue;
      }
      if (b.st !== 'floor') continue;
      floor.push(b);
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0) {
        const ns = sp - 30 * dt;
        if (ns <= 0.3) { b.vx = 0; b.vy = 0; } else { b.vx *= ns / sp; b.vy *= ns / sp; b.x += b.vx * dt; b.y += b.vy * dt; }
      }
      /* pushed by the robot */
      const dx = b.x - r.x, dy = b.y - r.y;
      if (Math.abs(dx) < 16 && Math.abs(dy) < 16) {
        const lx = dx * c + dy * s, ly = -dx * s + dy * c, cx = clamp(lx, -hl, hl), cy = clamp(ly, -hw, hw);
        let nx = 0, ny = 0, pen = 0;
        if (cx === lx && cy === ly) {
          const px = hl - Math.abs(lx), py = hw - Math.abs(ly);
          if (px < py) { nx = lx >= 0 ? 1 : -1; pen = px + b.r; } else { ny = ly >= 0 ? 1 : -1; pen = py + b.r; }
        } else {
          const ex = lx - cx, ey = ly - cy, d = Math.hypot(ex, ey);
          if (d < b.r && d > 0) { nx = ex / d; ny = ey / d; pen = b.r - d; }
        }
        if (pen > 0) {
          const wx = nx * c - ny * s, wy = nx * s + ny * c;
          b.x += wx * pen; b.y += wy * pen;
          const vn = (r.vx - r.om * dy) * wx + (r.vy + r.om * dx) * wy, bn = b.vx * wx + b.vy * wy;
          if (vn > bn) { b.vx += (vn - bn) * wx; b.vy += (vn - bn) * wy; }
        }
      }
    }
    for (let i = 0; i < floor.length; i++) {
      const a = floor[i];
      for (let j = i + 1; j < floor.length; j++) {
        const b = floor[j], dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r;
        if (Math.abs(dx) >= min || Math.abs(dy) >= min) continue;
        const d = Math.hypot(dx, dy);
        if (d >= min) continue;
        const nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0, pen = (min - d) / 2;
        a.x -= nx * pen; a.y -= ny * pen; b.x += nx * pen; b.y += ny * pen;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) { const j2 = -rel * 0.75; a.vx -= nx * j2; a.vy -= ny * j2; b.vx += nx * j2; b.vy += ny * j2; }
      }
    }
    for (let i = 0; i < floor.length; i++) {
      const b = floor[i];
      for (let k = 0; k < this.obstacles.length; k++) this.ballBox(b, this.obstacles[k]);
      if (b.x < b.r) { b.x = b.r; if (b.vx < 0) b.vx *= -0.35; } else if (b.x > FIELD - b.r) { b.x = FIELD - b.r; if (b.vx > 0) b.vx *= -0.35; }
      if (b.y < b.r) { b.y = b.r; if (b.vy < 0) b.vy *= -0.35; } else if (b.y > FIELD - b.r) { b.y = FIELD - b.r; if (b.vy > 0) b.vy *= -0.35; }
    }
  }

  /* ----- scoring for the player's alliance ----- */
  flowerInfo(f) {
    let owner = null, bottom = null;
    for (let i = 1; i < f.stack.length; i++) { const t = f.stack[i].type; if (t !== 'P') { if (!bottom) bottom = t; owner = t; } }
    return { owner, bottom, count: Math.max(0, f.stack.length - 1) };
  }
  score() {
    const me = this.me, h = this.hives[me], g = ZONES[me].garden;
    const timed = this.mode !== 'idle' && this.mode !== 'practice';
    const live = this.mode === 'auto';
    const leave = this.autoDone ? this.autoLeave : (live && this.offWall());
    const apark = this.autoDone ? this.autoPark : (live && this.inLoadingZone());
    let owned = 0, bonus = 0, garden = 0;
    this.flowers.forEach((f) => { const fi = this.flowerInfo(f); if (fi.owner === me) owned += fi.count; if (fi.bottom === me) bonus++; });
    this.balls.forEach((b) => { if (b.st === 'floor' && b.x - b.r < g.x1 && b.x + b.r > g.x0 && b.y - b.r < g.y1 && b.y + b.r > g.y0) garden++; });
    const cell = h.cells[h.up].length;
    const park = (this.mode === 'teleop' || this.mode === 'over' || this.mode === 'practice') && this.inLoadingZone();
    const items = [
      { label: 'LEAVE the wall (AUTO)', n: leave ? 1 : 0, each: 3 },
      { label: 'PARK in LOADING ZONE (AUTO)', n: apark ? 1 : 0, each: 5 },
      { label: 'HIVE TIPS in AUTO', n: h.tipsAuto, each: 20 },
      { label: 'HIVE TIPS in TELEOP', n: h.tipsTele, each: 20 },
      { label: 'Pieces left in upward CELL', n: cell, each: 2 },
      { label: 'Pieces in FLOWERS you own', n: owned, each: 2 },
      { label: 'Bottom NECTAR bonus', n: bonus, each: 5 },
      { label: 'Pieces in your GARDEN', n: garden, each: 1 },
      { label: 'PARK in LOADING ZONE (TELEOP)', n: park ? 1 : 0, each: 5 }
    ];
    let total = 0;
    items.forEach((it) => { it.pts = it.n * it.each; total += it.pts; });
    return { items, total, tips: h.tipsAuto + h.tipsTele, swarm: (leave ? 3 : 0) + (apark ? 5 : 0) + (park ? 5 : 0), timed };
  }
}

/* ----- objects handed to student code ----- */
const need = (v, what) => { if (typeof v !== 'number' || isNaN(v)) throw new Error(what + ' needs a number.'); return v; };
function motorApi(m) {
  const M = Object.create(null);
  M.setPower = (a) => { m.setPower(a[0]); };
  M.getPower = () => m.power;
  M.setDirection = (a) => { if (a[0] !== 'FORWARD' && a[0] !== 'REVERSE') throw new Error('setDirection() needs DcMotor.Direction.FORWARD or DcMotor.Direction.REVERSE.'); m.dir = a[0] === 'REVERSE' ? -1 : 1; };
  M.getDirection = () => m.dir < 0 ? 'REVERSE' : 'FORWARD';
  M.setMode = (a) => { m.setMode(a[0]); };
  M.getMode = () => m.mode;
  M.setTargetPosition = (a) => { m.target = Math.round(need(a[0], 'setTargetPosition()')); m.hasTarget = true; };
  M.getTargetPosition = () => m.target;
  M.getCurrentPosition = () => m.position();
  M.isBusy = () => m.isBusy();
  M.setZeroPowerBehavior = (a) => { if (a[0] !== 'BRAKE' && a[0] !== 'FLOAT') throw new Error('setZeroPowerBehavior() needs DcMotor.ZeroPowerBehavior.BRAKE or FLOAT.'); m.zpb = a[0]; };
  M.getZeroPowerBehavior = () => m.zpb;
  M.setVelocity = (a) => { m.setPower(clamp(need(a[0], 'setVelocity()') / m.tps, -1, 1)); };
  M.getVelocity = () => m.velocity();
  M.setTargetPositionTolerance = () => undefined;
  M.getDeviceName = () => m.name;
  return { __t: 'DcMotor', __m: M, __s: () => 'DcMotor ' + m.name };
}
function servoApi(s) {
  const M = Object.create(null);
  M.setPosition = (a) => { s.setPosition(a[0]); };
  M.getPosition = () => s.cmd;
  M.setDirection = (a) => { if (a[0] !== 'FORWARD' && a[0] !== 'REVERSE') throw new Error('setDirection() needs Servo.Direction.FORWARD or Servo.Direction.REVERSE.'); s.dir = a[0] === 'REVERSE' ? -1 : 1; };
  M.getDirection = () => s.dir < 0 ? 'REVERSE' : 'FORWARD';
  M.scaleRange = () => undefined;
  M.getDeviceName = () => s.name;
  return { __t: 'Servo', __m: M, __s: () => 'Servo ' + s.name };
}
function imuApi(w) {
  const A = Object.create(null);
  const rad = (u) => u === 'RADIANS';
  A.getYaw = (a) => rad(a[0]) ? w.yawDeg() * Math.PI / 180 : w.yawDeg();
  A.getPitch = () => 0; A.getRoll = () => 0;
  const angles = { __t: 'YawPitchRollAngles', __m: A };
  const M = Object.create(null);
  M.initialize = () => true;
  M.resetYaw = () => { w.robot.th0 = w.robot.th; };
  M.getRobotYawPitchRollAngles = () => angles;
  return { __t: 'IMU', __m: M };
}
function distanceApi(w) {
  const M = Object.create(null);
  M.getDistance = (a) => { const d = w.distanceIn(), u = a[0]; return u === 'CM' ? d * 2.54 : u === 'MM' ? d * 25.4 : u === 'METER' ? d * 0.0254 : d; };
  return { __t: 'DistanceSensor', __m: M };
}

/* ----- drawing ----- */
function text(ctx, str, x, y, size, color, align, rot) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, -1); if (rot) ctx.rotate(rot);
  ctx.font = '600 ' + size + 'px "Bahnschrift","DIN Alternate","Segoe UI",system-ui,sans-serif';
  ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(str, 0, 0); ctx.restore();
}
function ballColor(type, col) { return type === 'P' ? col.pollen : type === 'R' ? col.red : col.blue; }
function drawBall(ctx, x, y, r, type, col) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = ballColor(type, col); ctx.fill();
  ctx.lineWidth = 0.25; ctx.strokeStyle = col.ballEdge; ctx.stroke();
}
function rr(ctx, x, y, w, h, rad) {
  ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath();
}

/* Robot drawn in its own frame: +x is the front. `st` carries live state (may be sparse for the build preview).
   Part colours are fixed so every part reads the same in white and black mode. */
const PART = { rail: '#9aa39a', motor: '#d2a52c', intake: '#2f9a5f', intakeOn: '#63e39b', launcher: '#e8892b', lift: '#19a7b8',
  servo: '#8b63d9', hub: '#7f8892', battery: '#2d5da6', sensor: '#e0559a', imu: '#f4f4f0' };
function drawRobot(ctx, cfg, st, col) {
  const hl = cfg.length / 2, hw = cfg.width / 2, ac = cfg.alliance === 'red' ? col.red : col.blue, T = cfg.tools;
  const mec = cfg.drive === 'mecanum', ww = mec ? 4 : 5.2;
  const wheels = mec ? [[hl - 4.6, hw - 1.6, 1], [hl - 4.6, -hw - 0.4, -1], [-hl + 0.6, hw - 1.6, -1], [-hl + 0.6, -hw - 0.4, 1]]
    : [[-2.6, hw - 1.6, 0], [-2.6, -hw - 0.4, 0]];
  ctx.lineJoin = 'round';
  /* wheels */
  wheels.forEach((q) => {
    ctx.fillStyle = col.wheel; rr(ctx, q[0], q[1], ww, 2, 0.5); ctx.fill();
    ctx.strokeStyle = col.wheelMark; ctx.lineWidth = 0.28; ctx.beginPath();
    if (q[2]) for (let k = 0; k < 3; k++) { ctx.moveTo(q[0] + 0.6 + k * 1.2, q[1] + (q[2] > 0 ? 0.2 : 1.8)); ctx.lineTo(q[0] + 1.4 + k * 1.2, q[1] + (q[2] > 0 ? 1.8 : 0.2)); }
    else for (let k = 0; k < 4; k++) { ctx.moveTo(q[0] + 0.8 + k * 1.2, q[1] + 0.2); ctx.lineTo(q[0] + 0.8 + k * 1.2, q[1] + 1.8); }
    ctx.stroke();
  });
  /* chassis plate, side rails and drive motors */
  rr(ctx, -hl, -hw + 0.9, cfg.length, cfg.width - 1.8, 1.4);
  ctx.fillStyle = col.body; ctx.fill(); ctx.lineWidth = 0.7; ctx.strokeStyle = ac; ctx.stroke();
  ctx.fillStyle = PART.rail;
  ctx.fillRect(-hl + 1.2, hw - 2.3, cfg.length - 2.4, 0.7); ctx.fillRect(-hl + 1.2, -hw + 1.6, cfg.length - 2.4, 0.7);
  if (!mec) { ctx.fillStyle = col.wheelMark; ctx.beginPath(); ctx.arc(hl - 2.4, hw - 3.4, 0.9, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.arc(hl - 2.4, -hw + 3.4, 0.9, 0, 6.2832); ctx.fill(); }
  ctx.fillStyle = PART.motor;
  wheels.forEach((q) => { rr(ctx, q[0] + ww / 2 - 1.1, q[1] > 0 ? q[1] - 2.1 : q[1] + 2.9, 2.2, 1.2, 0.4); ctx.fill(); });
  /* control hub (with its IMU chip) and battery along the right side */
  const xa = -hl + 4.4, span = cfg.length - 8.8, rowH = clamp(hw - 4.6, 1.3, 3), y0 = -hw + 2.7;
  ctx.fillStyle = PART.hub; rr(ctx, xa, y0, span * 0.46, rowH, 0.4); ctx.fill();
  ctx.fillStyle = '#35d07f'; ctx.fillRect(xa + 0.35, y0 + 0.35, 0.55, 0.55);
  if (T.imu) { ctx.fillStyle = PART.imu; ctx.fillRect(xa + span * 0.46 - 1.3, y0 + rowH / 2 - 0.45, 0.9, 0.9); }
  ctx.fillStyle = PART.battery; rr(ctx, xa + span * 0.54, y0, span * 0.46, rowH, 0.4); ctx.fill();
  ctx.fillStyle = '#9fc0f0'; ctx.fillRect(xa + span - 0.8, y0 + 0.3, 0.45, rowH - 0.6);
  /* intake roller and distance sensor at the front */
  if (T.intake) {
    const u = st.intake || 0;
    ctx.fillStyle = u > 0.05 ? PART.intakeOn : u < -0.05 ? col.warn : PART.intake;
    rr(ctx, hl - 1.5, -hw + 2.2, 1.5, cfg.width - 4.4, 0.6); ctx.fill();
    ctx.strokeStyle = col.body; ctx.lineWidth = 0.3; ctx.beginPath();
    const ph = ((st.roll || 0) % 1.6 + 1.6) % 1.6;
    for (let y = -hw + 2.4 + ph; y < hw - 2.4; y += 1.6) { ctx.moveTo(hl - 1.4, y); ctx.lineTo(hl - 0.1, y); }
    ctx.stroke();
  }
  if (T.distance) { ctx.fillStyle = PART.sensor; rr(ctx, hl - 3, -0.9, 1.2, 1.8, 0.3); ctx.fill(); }
  /* launcher flywheel with its feeder servo */
  if (T.launcher) {
    const on = Math.abs(st.launcher || 0) > 0.05, a = st.spin || 0;
    ctx.fillStyle = PART.servo; rr(ctx, -3, -1, 1.4, 2, 0.3); ctx.fill();
    ctx.beginPath(); ctx.arc(1.5, 0, 3, 0, 6.2832); ctx.fillStyle = '#3b2a12'; ctx.fill();
    ctx.strokeStyle = PART.launcher; ctx.lineWidth = on ? 0.95 : 0.6; ctx.stroke();
    ctx.lineWidth = 0.5; ctx.beginPath();
    for (let k = 0; k < 3; k++) { ctx.moveTo(1.5, 0); ctx.lineTo(1.5 + Math.cos(a + k * 2.094) * 2.6, Math.sin(a + k * 2.094) * 2.6); }
    ctx.stroke();
    ctx.beginPath(); ctx.arc(1.5, 0, 0.75, 0, 6.2832); ctx.fillStyle = PART.launcher; ctx.fill();
  }
  /* lift (fills as it rises) with its gate servo */
  if (T.lift) {
    const k = clamp((st.lift || 0) / LIFT_MAX_IN, 0.1, 1);
    ctx.fillStyle = '#0d3f46'; ctx.fillRect(-hl + 1.2, -3, 2.4, 6);
    ctx.fillStyle = PART.lift; ctx.fillRect(-hl + 1.2, -3, 2.4, 6 * k);
    ctx.strokeStyle = PART.lift; ctx.lineWidth = 0.35; ctx.strokeRect(-hl + 1.2, -3, 2.4, 6);
    ctx.fillStyle = PART.servo; rr(ctx, -hl + 1.5, 3.3, 1.8, 1.1, 0.3); ctx.fill();
  }
  /* front marker in the alliance colour, then whatever the robot is carrying */
  ctx.strokeStyle = ac; ctx.lineWidth = 0.75; ctx.lineCap = 'round'; ctx.beginPath();
  ctx.moveTo(hl - 5, 2.1); ctx.lineTo(hl - 3.6, 0); ctx.lineTo(hl - 5, -2.1); ctx.stroke(); ctx.lineCap = 'butt';
  const held = st.held || [];
  for (let i = 0; i < held.length; i++) drawBall(ctx, -hl + 5.2 + i * Math.min(2.6, (cfg.length - 8.4) / 3.2), hw - 3.9, 1.15, held[i], col);
}

function drawField(ctx, w, px, col) {
  const cfg = w.cfg, M = 7, k = px / (FIELD + 2 * M);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = col.bg; ctx.fillRect(0, 0, px, px);
  ctx.setTransform(k, 0, 0, -k, M * k, px - M * k);
  ctx.fillStyle = col.tile; ctx.fillRect(0, 0, FIELD, FIELD);
  ctx.strokeStyle = col.tileLine; ctx.lineWidth = 0.35; ctx.beginPath();
  for (let i = 1; i < 6; i++) { ctx.moveTo(i * 24, 0); ctx.lineTo(i * 24, FIELD); ctx.moveTo(0, i * 24); ctx.lineTo(FIELD, i * 24); }
  ctx.stroke();
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) text(ctx, 'ABCDEF'[i] + (j + 1), i * 24 + 3.6, j * 24 + 2.6, 2.6, col.tileText);
  /* tape */
  [['R', col.red], ['B', col.blue]].forEach((z) => {
    const L = ZONES[z[0]].load, G = ZONES[z[0]].garden;
    ctx.globalAlpha = 0.16; ctx.fillStyle = z[1]; ctx.fillRect(L.x0, L.y0, L.x1 - L.x0, L.y1 - L.y0); ctx.globalAlpha = 1;
    ctx.strokeStyle = z[1]; ctx.lineWidth = 1; ctx.strokeRect(L.x0 + 0.5, L.y0 + 0.5, L.x1 - L.x0 - 1, L.y1 - L.y0 - 1);
    ctx.fillStyle = z[1]; ctx.globalAlpha = 0.8; ctx.fillRect(G.x0, G.y0, G.x1 - G.x0, G.y1 - G.y0); ctx.globalAlpha = 1;
    text(ctx, 'LOAD', (L.x0 + L.x1) / 2, (L.y0 + L.y1) / 2, 2.4, z[1]);
    text(ctx, 'GARDEN', (G.x0 + G.x1) / 2, z[0] === 'R' ? 5 : FIELD - 5, 2.4, z[1]);
  });
  /* walls and side labels */
  ctx.strokeStyle = col.wall; ctx.lineWidth = 1.4; ctx.strokeRect(-0.7, -0.7, FIELD + 1.4, FIELD + 1.4);
  ctx.strokeStyle = col.red; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-0.7, 0); ctx.lineTo(-0.7, FIELD); ctx.stroke();
  ctx.strokeStyle = col.blue; ctx.beginPath(); ctx.moveTo(FIELD + 0.7, 0); ctx.lineTo(FIELD + 0.7, FIELD); ctx.stroke();
  text(ctx, 'RED ALLIANCE', -4, 72, 3, col.red, 'center', -Math.PI / 2);
  text(ctx, 'BLUE ALLIANCE', FIELD + 4, 72, 3, col.blue, 'center', Math.PI / 2);
  text(ctx, 'AUDIENCE', 72, -4, 3, col.muted);
  /* hive */
  ctx.fillStyle = col.hive; ctx.globalAlpha = 0.5; ctx.fillRect(HIVE_BOX.x0, HIVE_BOX.y0, HIVE_BOX.x1 - HIVE_BOX.x0, HIVE_BOX.y1 - HIVE_BOX.y0); ctx.globalAlpha = 1;
  ctx.strokeStyle = col.wall; ctx.lineWidth = 0.8; ctx.strokeRect(HIVE_BOX.x0, HIVE_BOX.y0, HIVE_BOX.x1 - HIVE_BOX.x0, HIVE_BOX.y1 - HIVE_BOX.y0);
  ['R', 'B'].forEach((key) => {
    const h = w.hives[key], hc = key === 'R' ? col.red : col.blue;
    ['aud', 'rear'].forEach((side) => {
      const y = CELL_Y[side], up = h.up === side, cw = h.x1 - h.x0, ch = y[1] - y[0];
      ctx.globalAlpha = up ? 0.3 : 0.08; ctx.fillStyle = hc; ctx.fillRect(h.x0, y[0], cw, ch); ctx.globalAlpha = 1;
      ctx.strokeStyle = hc; ctx.lineWidth = up ? 1 : 0.4;
      if (!up) ctx.setLineDash([1.5, 1.5]);
      ctx.strokeRect(h.x0, y[0], cw, ch); ctx.setLineDash([]);
      if (up) {
        const cell = h.cells[side]; let wt = 0;
        cell.forEach((b, i) => { wt += b.type === 'P' ? 1 : NECTAR_WEIGHT; drawBall(ctx, h.x0 + 2.4 + (i % 5) * 3.8, y[0] + 2.6 + Math.floor(i / 5) * 3.6, 1.5, b.type, col); });
        const frac = clamp(wt / TIP_WEIGHT, 0, 1);
        ctx.fillStyle = col.meterBg; ctx.fillRect(h.x0 + 1, y[1] - 1.9, cw - 2, 1.1);
        ctx.fillStyle = col.accent; ctx.fillRect(h.x0 + 1, y[1] - 1.9, (cw - 2) * frac, 1.1);
      } else text(ctx, 'DOWN', (h.x0 + h.x1) / 2, (y[0] + y[1]) / 2, 2.2, hc);
    });
    text(ctx, (key === 'R' ? 'RED' : 'BLUE') + ' HIVE', (h.x0 + h.x1) / 2, 72, 2.4, hc);
    if (h.flash > 0) { ctx.globalAlpha = Math.min(1, h.flash); ctx.strokeStyle = col.accent; ctx.lineWidth = 1.6; ctx.strokeRect(h.x0 - 1.5, HIVE_BOX.y0 - 1.5, h.x1 - h.x0 + 3, HIVE_BOX.y1 - HIVE_BOX.y0 + 3); ctx.globalAlpha = 1; }
  });
  /* flowers */
  w.flowers.forEach((f) => {
    const fi = w.flowerInfo(f), oc = fi.owner === 'R' ? col.red : fi.owner === 'B' ? col.blue : col.petal;
    ctx.fillStyle = oc; ctx.globalAlpha = 0.9;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(f.x + Math.cos(i * 1.0472) * 2.3, f.y + Math.sin(i * 1.0472) * 2.3, 1.25, 0, 6.2832); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(f.x, f.y, 1.7, 0, 6.2832); ctx.fillStyle = col.flowerCore; ctx.fill();
    for (let i = 0; i < FLOWER_CAP; i++) {
      const x = f.x + f.tx * (5.6 + i * 2.5), y = f.y + f.ty * (5.6 + i * 2.5) + (f.ty === 0 ? (f.y > 72 ? 0.6 : -0.6) : 0);
      const b = f.stack[i];
      if (b) drawBall(ctx, x, y, 1.05, b.type, col);
      else { ctx.beginPath(); ctx.arc(x, y, 0.95, 0, 6.2832); ctx.strokeStyle = col.tileText; ctx.lineWidth = 0.25; if (i === 0) ctx.setLineDash([0.6, 0.6]); ctx.stroke(); ctx.setLineDash([]); }
    }
  });
  /* pieces on the floor */
  w.balls.forEach((b) => { if (b.st === 'floor') drawBall(ctx, b.x, b.y, b.r, b.type, col); });
  /* robot */
  const r = w.robot;
  if (cfg.tools.distance && w.enabled) {
    const p = w.frontPoint(0), d = w.distanceIn();
    ctx.strokeStyle = col.accent; ctx.globalAlpha = 0.5; ctx.lineWidth = 0.3; ctx.setLineDash([1.2, 1.2]);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(r.th) * d, p.y + Math.sin(r.th) * d); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.th);
  drawRobot(ctx, cfg, { intake: w.m.intake ? w.m.intake.u : 0, launcher: w.m.launcher ? w.m.launcher.u : 0, spin: r.spin, roll: r.roll, lift: w.liftHeight(), held: r.held.map((b) => b.type) }, col);
  ctx.restore();
  /* pieces in the air */
  w.balls.forEach((b) => {
    if (b.st !== 'air') return;
    const kk = Math.min(1, b.air.t / b.air.T), lift = Math.sin(kk * Math.PI);
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(b.x + lift * 1.5, b.y - lift * 1.5, b.r, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
    drawBall(ctx, b.x, b.y, b.r * (1 + lift * 0.7), b.type, col);
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

Object.assign(BBZ, {
  World, MOTORS, WHEELS, ROLES, TOOLS, START_SPOTS, defaultRobot, sanitizeRobot, deviceList, driveRoles, validName,
  turnK, ticksPerInch, liftTicksPerInch, drawField, drawRobot, LIFT_MAX_IN, FLOWER_TOP_IN, clamp
});
})();
