/* Blocks editor, the blocks-to-Java generator, and the example programs. */
(function () {
'use strict';
const BBZ = window.BBZ = window.BBZ || {};

/* Safe element builder: text always goes in as text nodes, never as HTML. */
function h(tag, attrs) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') e[k] = !!v;
      else e.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (let i = 2; i < arguments.length; i++) {
    const c = arguments[i];
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) c.forEach((x) => { if (x !== null && x !== undefined && x !== false) e.append(x.nodeType ? x : document.createTextNode(String(x))); });
    else e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}
BBZ.h = h;

const BTN = [['a', 'A'], ['b', 'B'], ['x', 'X'], ['y', 'Y'], ['left_bumper', 'left bumper'], ['right_bumper', 'right bumper'],
  ['left_trigger', 'left trigger'], ['right_trigger', 'right trigger'], ['dpad_up', 'D-pad up'], ['dpad_down', 'D-pad down'],
  ['dpad_left', 'D-pad left'], ['dpad_right', 'D-pad right']];
const COND = [['btn', 'gamepad button pressed:'], ['time', 'timer is more than (s)'], ['dist', 'distance is less than (in)'], ['lift', 'lift is above (in)']];
const VAL = [['timer', 'timer (s)'], ['heading', 'heading (deg)'], ['distance', 'distance (in)'], ['lift', 'lift height (in)'], ['none', 'nothing else']];
const CATS = [{ id: 'control', label: 'Control' }, { id: 'drive', label: 'Drive' }, { id: 'mech', label: 'Tools' }, { id: 'output', label: 'Telemetry' }];

const N = (f, d, min, max, step) => ({ f, t: 'num', d, min, max, step });
const S = (f, opts) => ({ f, t: 'sel', opts, d: opts[0][0] });
const D = (f, kind) => ({ f, t: 'dev', kind });
const SPEC = {
  forever: { cat: 'control', title: 'repeat while running', parts: ['repeat while the OpMode is running'], body: true },
  repeat: { cat: 'control', title: 'repeat N times', parts: ['repeat', N('n', 3, 1, 500, 1), 'times'], body: true },
  if: { cat: 'control', title: 'if / else', parts: ['if', { f: 'c', t: 'cond' }], body: true, els: true },
  wait_until: { cat: 'control', title: 'wait until', parts: ['wait until', { f: 'c', t: 'cond' }] },
  wait: { cat: 'control', title: 'wait seconds', parts: ['wait', N('s', 1, 0, 60, 0.1), 'seconds'] },
  drive_pad: { cat: 'drive', title: 'drive with gamepad', parts: ['drive with the gamepad sticks at', N('p', 1, 0.1, 1, 0.05), 'speed'] },
  drive_set: { cat: 'drive', title: 'set drive power', parts: ['drive power: forward', N('f', 0.5, -1, 1, 0.05), 'strafe', N('s', 0, -1, 1, 0.05), 'turn', N('t', 0, -1, 1, 0.05)] },
  drive_stop: { cat: 'drive', title: 'stop driving', parts: ['stop driving'] },
  drive_in: { cat: 'drive', title: 'drive inches', parts: ['drive forward', N('d', 24, -144, 144, 0.5), 'inches at power', N('p', 0.6, 0.1, 1, 0.05)] },
  strafe_in: { cat: 'drive', title: 'strafe inches', parts: ['strafe right', N('d', 12, -144, 144, 0.5), 'inches at power', N('p', 0.6, 0.1, 1, 0.05)], mecanum: true },
  turn: { cat: 'drive', title: 'turn degrees', parts: ['turn', S('dir', [['left', 'left'], ['right', 'right']]), N('a', 90, 1, 180, 1), 'degrees at power', N('p', 0.5, 0.1, 1, 0.05)] },
  intake: { cat: 'mech', title: 'intake', parts: ['intake', S('m', [['in', 'pull in'], ['out', 'push out'], ['off', 'off']])], tool: 'intake' },
  launcher: { cat: 'mech', title: 'launcher wheel', parts: ['launcher wheel power', N('p', 0.75, 0, 1, 0.01)], tool: 'launcher' },
  launch_one: { cat: 'mech', title: 'launch one piece', parts: ['launch one piece'], tool: 'launcher' },
  lift_to: { cat: 'mech', title: 'move lift', parts: ['move lift to', N('h', 22, 0, 26, 0.5), 'inches', S('w', [['wait', 'and wait'], ['go', 'without waiting']])], tool: 'lift' },
  drop_one: { cat: 'mech', title: 'drop one piece', parts: ['open the gate to drop one piece'], tool: 'lift' },
  motor: { cat: 'mech', title: 'set motor power', parts: ['set motor', D('r', 'motor'), 'power', N('p', 0.5, -1, 1, 0.05)] },
  servo: { cat: 'mech', title: 'set servo position', parts: ['set servo', D('r', 'servo'), 'to position', N('p', 1, 0, 1, 0.05)] },
  show: { cat: 'output', title: 'show on telemetry', parts: ['show', { f: 't', t: 'text', d: 'Timer' }, 'and', { f: 'v', t: 'val' }] }
};
const MAX_BLOCKS = 300, MAX_DEPTH = 6;

let uid = 1;
const newId = () => 'b' + (uid++) + Math.floor(Math.random() * 1e6).toString(36);
const isOpt = (opts, v) => opts.some((o) => o[0] === v);
const fixNum = (v, p) => { v = typeof v === 'number' && isFinite(v) ? v : p.d; return Math.min(p.max, Math.max(p.min, v)); };
function fixCond(c) {
  c = c && typeof c === 'object' ? c : {};
  return { kind: isOpt(COND, c.kind) ? c.kind : 'btn', btn: isOpt(BTN, c.btn) ? c.btn : 'a', n: typeof c.n === 'number' && isFinite(c.n) ? Math.min(999, Math.max(0, c.n)) : 5, not: c.not === true };
}
function firstDev(cfg, kind) { const d = BBZ.deviceList(cfg).find((x) => x.kind === kind); return d ? d.role : ''; }

function makeBlock(type, cfg, f) {
  const sp = SPEC[type], b = { id: newId(), type, f: {}, body: [], els: [] };
  sp.parts.forEach((p) => {
    if (typeof p === 'string') return;
    if (p.t === 'num') b.f[p.f] = p.d;
    else if (p.t === 'sel') b.f[p.f] = p.d;
    else if (p.t === 'dev') b.f[p.f] = cfg ? firstDev(cfg, p.kind) : '';
    else if (p.t === 'text') b.f[p.f] = p.d;
    else if (p.t === 'cond') b.f[p.f] = fixCond(null);
    else if (p.t === 'val') b.f[p.f] = 'timer';
  });
  if (f) Object.keys(f).forEach((k) => { b.f[k] = f[k]; });
  return b;
}

/* Rebuilds a block list from untrusted data (saved storage), keeping only known shapes. */
function sanitize(list, depth, counter) {
  depth = depth || 0; counter = counter || { n: 0 };
  if (!Array.isArray(list) || depth > MAX_DEPTH) return [];
  const out = [];
  list.forEach((raw) => {
    if (!raw || typeof raw !== 'object' || !Object.prototype.hasOwnProperty.call(SPEC, raw.type) || counter.n >= MAX_BLOCKS) return;
    counter.n++;
    const sp = SPEC[raw.type], src = raw.f && typeof raw.f === 'object' ? raw.f : {}, b = { id: newId(), type: raw.type, f: {}, body: [], els: [] };
    sp.parts.forEach((p) => {
      if (typeof p === 'string') return;
      const v = src[p.f];
      if (p.t === 'num') b.f[p.f] = fixNum(v, p);
      else if (p.t === 'sel') b.f[p.f] = isOpt(p.opts, v) ? v : p.d;
      else if (p.t === 'dev') b.f[p.f] = (typeof v === 'string' && Object.prototype.hasOwnProperty.call(BBZ.ROLES, v) && BBZ.ROLES[v].kind === p.kind) ? v : '';
      else if (p.t === 'text') b.f[p.f] = typeof v === 'string' ? v.slice(0, 30) : p.d;
      else if (p.t === 'cond') b.f[p.f] = fixCond(v);
      else if (p.t === 'val') b.f[p.f] = isOpt(VAL, v) ? v : 'timer';
    });
    if (sp.body) b.body = sanitize(raw.body, depth + 1, counter);
    if (sp.els) b.els = sanitize(raw.els, depth + 1, counter);
    out.push(b);
  });
  return out;
}
function countBlocks(list) { let n = 0; list.forEach((b) => { n += 1 + countBlocks(b.body) + countBlocks(b.els); }); return n; }

/* ---------- Java generation ---------- */
const str = (s) => '"' + String(s).replace(/[\u0000-\u001f]/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const num = (v) => String(+(+v).toFixed(3));
function className(name) {
  const parts = String(name).replace(/[^A-Za-z0-9 ]/g, ' ').split(' ').filter(Boolean);
  let s = parts.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  if (!/^[A-Za-z]/.test(s)) s = 'My' + s;
  return s.slice(0, 40) || 'MyOpMode';
}

function helperLines(name, cfg) {
  const n = cfg.names, four = BBZ.holo(cfg), T = cfg.tools;
  const dm = BBZ.driveRoles(cfg).map((r) => n[r]);
  const each = (fn) => dm.map(fn);
  switch (name) {
    case 'setDrive':
      if (four) return [
        '// Mixes forward, strafe (right is +) and turn (right is +) into the four wheel powers.',
        'void setDrive(double forward, double strafe, double turn) {',
        '    ' + n.fl + '.setPower(forward + strafe + turn);',
        '    ' + n.fr + '.setPower(forward - strafe - turn);',
        '    ' + n.bl + '.setPower(forward - strafe + turn);',
        '    ' + n.br + '.setPower(forward + strafe - turn);',
        '}'];
      return [
        '// Mixes forward and turn (right is +) into the left and right wheel powers.',
        '// A tank drive cannot slide sideways, so strafe is ignored.',
        'void setDrive(double forward, double strafe, double turn) {',
        '    ' + n.left + '.setPower(forward + turn);',
        '    ' + n.right + '.setPower(forward - turn);',
        '}'];
    case 'moveTicks': {
      const params = four ? ['tFL', 'tFR', 'tBL', 'tBR'] : ['tLeft', 'tRight'];
      return [].concat(
        ['// Runs every drive motor to its own encoder target, then stops.',
          'void moveTicks(' + params.map((p) => 'int ' + p).join(', ') + ', double power) {'],
        each((m) => '    ' + m + '.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER);'),
        dm.map((m, i) => '    ' + m + '.setTargetPosition(' + params[i] + ');'),
        each((m) => '    ' + m + '.setMode(DcMotor.RunMode.RUN_TO_POSITION);'),
        each((m) => '    ' + m + '.setPower(power);'),
        ['    while (opModeIsActive() && (' + dm.map((m) => m + '.isBusy()').join(' || ') + ')) {', '        idle();', '    }',
          '    sleep(250);       // let the motors settle exactly on their targets before letting go'],
        each((m) => '    ' + m + '.setPower(0);'),
        each((m) => '    ' + m + '.setMode(DcMotor.RunMode.RUN_USING_ENCODER);'),
        ['}']);
    }
    case 'driveInches': return [
      '// Drives straight using the wheel encoders. Negative inches goes backward.',
      'void driveInches(double inches, double power) {',
      '    int count = (int) Math.round(inches * TICKS_PER_INCH);',
      '    moveTicks(' + (four ? 'count, count, count, count' : 'count, count') + ', power);',
      '}'];
    case 'strafeInches': return [
      '// Slides sideways to the right (negative = left). Wheels slip a little when strafing,',
      '// so the robot travels a bit less than asked. Tune the number on your real robot.',
      'void strafeInches(double inches, double power) {',
      '    int count = (int) Math.round(inches * TICKS_PER_INCH);',
      '    moveTicks(count, -count, -count, count, power);',
      '}'];
    case 'turnLeft':
      if (T.imu) return [
        '// Turns on the spot using the IMU. Positive degrees turns left, negative turns right.',
        '// For a half turn, call it twice with 90.',
        'void turnLeft(double degrees, double power) {',
        '    ' + n.imu + '.resetYaw();',
        '    ElapsedTime onTarget = new ElapsedTime();',
        '    // Keep correcting until the robot has stayed within 1 degree for a quarter of a second.',
        '    while (opModeIsActive() && onTarget.seconds() < 0.25) {',
        '        double error = degrees - ' + n.imu + '.getRobotYawPitchRollAngles().getYaw(AngleUnit.DEGREES);',
        '        if (Math.abs(error) > 1.0) {',
        '            onTarget.reset();',
        '        }',
        '        // The further off it is, the harder it turns, so it slows down as it arrives.',
        '        setDrive(0, 0, -Range.clip(error * 0.02, -power, power));',
        '    }',
        '    setDrive(0, 0, 0);',
        '}'];
      return [
        '// Turns on the spot by counting encoder ticks (add an IMU for more accurate turns).',
        'void turnLeft(double degrees, double power) {',
        '    int count = (int) Math.round(degrees * TICKS_PER_DEGREE);',
        '    moveTicks(' + (four ? '-count, count, -count, count' : '-count, count') + ', power);',
        '}'];
    case 'launchOne':
      if (T.launcher && cfg.kit.launcher === 'catapult') return [
        '// Lets the catapult arm go, then pulls it back down ready for the next piece.',
        'void launchOne() {',
        '    ' + n.catapult + '.setPosition(1.0);',
        '    sleep(300);',
        '    ' + n.catapult + '.setPosition(0.0);',
        '    sleep(700);',
        '}'];
      return [
        '// Pushes one piece into the spinning launcher wheel, then pulls the feeder back.',
        'void launchOne() {',
        '    ' + n.feeder + '.setPosition(1.0);',
        '    sleep(300);',
        '    ' + n.feeder + '.setPosition(0.0);',
        '    sleep(700);       // let the wheel get back up to speed',
        '}'];
    case 'dropOne': return [
      '// Opens the gate long enough for one piece to fall out, then closes it.',
      'void dropOne() {',
      '    ' + n.gate + '.setPosition(1.0);',
      '    sleep(350);',
      '    ' + n.gate + '.setPosition(0.0);',
      '    sleep(300);',
      '}'];
    case 'liftTo': return [
      '// Sends the lift to a height in inches. It can wait there or return right away.',
      'void liftTo(double inches, boolean waitUntilThere) {',
      '    ' + n.lift + '.setTargetPosition((int) Math.round(inches * LIFT_TICKS_PER_INCH));',
      '    ' + n.lift + '.setMode(DcMotor.RunMode.RUN_TO_POSITION);',
      '    ' + n.lift + '.setPower(1.0);',
      '    while (waitUntilThere && opModeIsActive() && ' + n.lift + '.isBusy()) {',
      '        idle();',
      '    }',
      '}'];
    case 'findTag': return [
      '// Looks through everything the webcam can see for one tag ID. Gives back null if it is not in view.',
      'AprilTagDetection findTag(int id) {',
      '    for (AprilTagDetection detection : aprilTag.getDetections()) {',
      '        if (detection.id == id) {',
      '            return detection;',
      '        }',
      '    }',
      '    return null;',
      '}'];
  }
  return [];
}

const TYPE_OF = { motor: 'DcMotor', servo: 'Servo', imu: 'IMU', distance: 'DistanceSensor' };
/* Builds a full OpMode class around `body`. */
function scaffold(o) {
  const cfg = o.cfg, n = cfg.names, all = BBZ.deviceList(cfg);
  const use = new Set(o.use || []), consts = new Set(o.consts || []);
  if (use.has('driveInches') || use.has('strafeInches')) { use.add('moveTicks'); consts.add('TPI'); }
  if (use.has('turnLeft')) { if (cfg.tools.imu) use.add('setDrive'); else { use.add('moveTicks'); consts.add('TPD'); } }
  if (use.has('liftTo')) consts.add('LIFT');
  const helpers = [];
  ['setDrive', 'moveTicks', 'driveInches', 'strafeInches', 'turnLeft', 'launchOne', 'dropOne', 'liftTo', 'findTag'].forEach((hn) => {
    if (use.has(hn)) helpers.push(helperLines(hn, cfg));
  });
  const text = o.body.concat(o.extra || [], o.constLines || [], [].concat.apply([], helpers)).join('\n');
  const mentions = (word) => new RegExp('(^|[^A-Za-z0-9_])' + word + '([^A-Za-z0-9_]|$)').test(text);
  const drive = new Set(BBZ.driveRoles(cfg));
  const devs = all.filter((d) => d.kind !== 'camera' && (drive.has(d.role) || mentions(d.name)));
  const has = (kind) => devs.some((d) => d.kind === kind);
  const vision = mentions('aprilTag'), timer = mentions('runtime'), cam = all.find((d) => d.kind === 'camera');
  const L = [];
  (o.intro || []).forEach((s) => L.push('// ' + s));
  L.push('package org.firstinspires.ftc.teamcode;', '');
  L.push('import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;');
  L.push('import com.qualcomm.robotcore.eventloop.opmode.' + (o.mode === 'auto' ? 'Autonomous' : 'TeleOp') + ';');
  L.push('import com.qualcomm.robotcore.hardware.DcMotor;');
  if (has('servo')) L.push('import com.qualcomm.robotcore.hardware.Servo;');
  if (has('imu')) L.push('import com.qualcomm.robotcore.hardware.IMU;', 'import com.qualcomm.hardware.rev.RevHubOrientationOnRobot;', 'import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;');
  if (has('distance')) L.push('import com.qualcomm.robotcore.hardware.DistanceSensor;', 'import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;');
  if (vision) L.push('import org.firstinspires.ftc.robotcore.external.hardware.camera.WebcamName;', 'import org.firstinspires.ftc.vision.VisionPortal;',
    'import org.firstinspires.ftc.vision.apriltag.AprilTagDetection;', 'import org.firstinspires.ftc.vision.apriltag.AprilTagProcessor;');
  if (timer || mentions('ElapsedTime')) L.push('import com.qualcomm.robotcore.util.ElapsedTime;');
  if (mentions('Range')) L.push('import com.qualcomm.robotcore.util.Range;');
  L.push('', (o.mode === 'auto' ? '@Autonomous' : '@TeleOp') + '(name = ' + str(o.title) + (o.group ? ', group = ' + str(o.group) : '') + ')');
  L.push('public class ' + o.cls + ' extends LinearOpMode {');
  if (consts.has('TPI')) L.push('    static final double TICKS_PER_INCH = ' + BBZ.ticksPerInch(cfg).toFixed(2) + ';      // wheel encoder ticks for one inch');
  if (consts.has('TPD')) L.push('    static final double TICKS_PER_DEGREE = ' + (BBZ.ticksPerInch(cfg) * BBZ.turnK(cfg) * Math.PI / 180).toFixed(3) + ';   // wheel ticks to turn one degree');
  if (consts.has('LIFT')) L.push('    static final double LIFT_TICKS_PER_INCH = ' + BBZ.liftTicksPerInch(cfg).toFixed(2) + ';');
  (o.constLines || []).forEach((s) => L.push('    ' + s));
  if (consts.size || (o.constLines || []).length) L.push('');
  devs.forEach((d) => L.push('    private ' + TYPE_OF[d.kind] + ' ' + d.name + ';'));
  if (vision) L.push('    private AprilTagProcessor aprilTag;', '    private VisionPortal visionPortal;');
  if (timer) L.push('    private ElapsedTime runtime = new ElapsedTime();');
  L.push('', '    @Override', '    public void runOpMode() {');
  const B = (s) => L.push(s === '' ? '' : '        ' + s);
  devs.forEach((d) => B(d.name + ' = hardwareMap.get(' + TYPE_OF[d.kind] + '.class, ' + str(d.name) + ');'));
  if (cfg.realistic) {
    B('');
    B('// The left motors are mounted the other way round, so they are reversed.');
    (BBZ.holo(cfg) ? [n.fl, n.bl] : [n.left]).forEach((m) => B(m + '.setDirection(DcMotor.Direction.REVERSE);'));
  }
  const lift = devs.find((d) => d.role === 'lift');
  if (lift) { B(lift.name + '.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER);'); B(lift.name + '.setMode(DcMotor.RunMode.RUN_USING_ENCODER);'); }
  if (has('imu')) {
    B(n.imu + '.initialize(new IMU.Parameters(new RevHubOrientationOnRobot(');
    B('        RevHubOrientationOnRobot.LogoFacingDirection.UP,');
    B('        RevHubOrientationOnRobot.UsbFacingDirection.FORWARD)));');
    B(n.imu + '.resetYaw();');
  }
  devs.filter((d) => d.kind === 'servo').forEach((d) => B(d.name + '.setPosition(0.0);'));
  if (vision) {
    B('');
    B('// The AprilTag processor finds tags in the picture; the VisionPortal connects it to the webcam.');
    B('aprilTag = AprilTagProcessor.easyCreateWithDefaults();');
    B('visionPortal = VisionPortal.easyCreateWithDefaults(hardwareMap.get(WebcamName.class, ' + str(cam ? cam.name : n.camera) + '), aprilTag);');
  }
  B('');
  B('telemetry.addData("Status", "Initialized");');
  B('telemetry.update();');
  B('// Wait for the game to start (driver presses START)');
  B('waitForStart();');
  if (timer) B('runtime.reset();');
  B('');
  o.body.forEach(B);
  L.push('    }');
  helpers.forEach((lines) => { L.push(''); lines.forEach((s) => L.push('    ' + s)); });
  if (o.extra && o.extra.length) { L.push(''); o.extra.forEach((s) => L.push(s === '' ? '' : '    ' + s)); }
  L.push('}', '');
  return L.join('\n');
}

function generate(prog, cfg) {
  const n = cfg.names, T = cfg.tools;
  const ctx = { use: new Set(), consts: new Set(), errs: [], loop: 0, depth: 0, pending: false };
  const fail = (m) => { ctx.errs.push(m); };
  const needTool = (tool, what) => { if (!T[tool]) { fail(what + ' needs the ' + BBZ.TOOLS[tool].label + '. Add it in Build Bot, or remove that block.'); return false; } return true; };
  const devName = (role, kind, what) => {
    const d = BBZ.deviceList(cfg).find((x) => x.role === role && x.kind === kind);
    if (!d) { fail('The block "' + what + '" has no ' + kind + ' picked (or your bot no longer has it). Choose one from its list.'); return 'missing'; }
    return d.name;
  };
  const cond = (c) => {
    let s;
    if (c.kind === 'btn') s = (c.btn === 'left_trigger' || c.btn === 'right_trigger') ? 'gamepad1.' + c.btn + ' > 0.5' : 'gamepad1.' + c.btn;
    else if (c.kind === 'time') s = 'runtime.seconds() > ' + num(c.n);
    else if (c.kind === 'dist') { needTool('distance', 'The condition "distance is less than"'); s = n.distance + '.getDistance(DistanceUnit.INCH) < ' + num(c.n); }
    else { needTool('lift', 'The condition "lift is above"'); ctx.consts.add('LIFT'); s = n.lift + '.getCurrentPosition() > ' + num(c.n) + ' * LIFT_TICKS_PER_INCH'; }
    return c.not ? '!(' + s + ')' : s;
  };
  const val = (v) => {
    if (v === 'timer') return 'runtime.seconds()';
    if (v === 'heading') { needTool('imu', 'Showing the heading'); return n.imu + '.getRobotYawPitchRollAngles().getYaw(AngleUnit.DEGREES)'; }
    if (v === 'distance') { needTool('distance', 'Showing the distance'); return n.distance + '.getDistance(DistanceUnit.INCH)'; }
    if (v === 'lift') { needTool('lift', 'Showing the lift height'); ctx.consts.add('LIFT'); return n.lift + '.getCurrentPosition() / LIFT_TICKS_PER_INCH'; }
    return null;
  };
  function list(blocks, ind) {
    const out = [], pad = '    '.repeat(ind), P = (s) => out.push(pad + s);
    blocks.forEach((b) => {
      const sp = SPEC[b.type], f = b.f;
      if (sp.tool && !needTool(sp.tool, 'The block "' + sp.title + '"')) return;
      if (sp.mecanum && !BBZ.holo(cfg)) { fail('The block "' + sp.title + '" only works with a mecanum drivetrain. A tank drive cannot slide sideways.'); return; }
      const loopBody = (open) => {
        P(open); ctx.depth++;
        list(b.body, ind + 1).forEach((s) => out.push(s));
        ctx.depth--;
        if (ctx.depth === 0 && ctx.pending) { out.push(pad + '    telemetry.update();'); ctx.pending = false; }
        P('}');
      };
      switch (b.type) {
        case 'forever': loopBody('while (opModeIsActive()) {'); break;
        case 'repeat': { const v = 'i' + (++ctx.loop); loopBody('for (int ' + v + ' = 0; ' + v + ' < ' + Math.round(f.n) + ' && opModeIsActive(); ' + v + '++) {'); break; }
        case 'if':
          P('if (' + cond(f.c) + ') {');
          list(b.body, ind + 1).forEach((s) => out.push(s));
          if (b.els.length) { P('} else {'); list(b.els, ind + 1).forEach((s) => out.push(s)); }
          P('}');
          break;
        case 'wait_until': P('while (opModeIsActive() && !(' + cond(f.c) + ')) {'); P('    idle();'); P('}'); break;
        case 'wait': P('sleep(' + Math.round(f.s * 1000) + ');'); break;
        case 'drive_pad': ctx.use.add('setDrive'); P('setDrive(-gamepad1.left_stick_y * ' + num(f.p) + ', gamepad1.left_stick_x * ' + num(f.p) + ', gamepad1.right_stick_x * ' + num(f.p) + ');'); break;
        case 'drive_set': ctx.use.add('setDrive'); P('setDrive(' + num(f.f) + ', ' + num(f.s) + ', ' + num(f.t) + ');'); break;
        case 'drive_stop': ctx.use.add('setDrive'); P('setDrive(0, 0, 0);'); break;
        case 'drive_in': ctx.use.add('driveInches'); P('driveInches(' + num(f.d) + ', ' + num(f.p) + ');'); break;
        case 'strafe_in': ctx.use.add('strafeInches'); P('strafeInches(' + num(f.d) + ', ' + num(f.p) + ');'); break;
        case 'turn': ctx.use.add('turnLeft'); P('turnLeft(' + num(f.dir === 'left' ? f.a : -f.a) + ', ' + num(f.p) + ');'); break;
        case 'intake': P(n.intake + '.setPower(' + (f.m === 'in' ? '1.0' : f.m === 'out' ? '-1.0' : '0') + ');'); break;
        case 'launcher': P(n.launcher + '.setPower(' + num(f.p) + ');'); break;
        case 'launch_one': ctx.use.add('launchOne'); P('launchOne();'); break;
        case 'lift_to': ctx.use.add('liftTo'); P('liftTo(' + num(f.h) + ', ' + (f.w === 'wait' ? 'true' : 'false') + ');'); break;
        case 'drop_one': ctx.use.add('dropOne'); P('dropOne();'); break;
        case 'motor': P(devName(f.r, 'motor', sp.title) + '.setPower(' + num(f.p) + ');'); break;
        case 'servo': P(devName(f.r, 'servo', sp.title) + '.setPosition(' + num(f.p) + ');'); break;
        case 'show': {
          const v = val(f.v);
          P(v === null ? 'telemetry.addLine(' + str(f.t) + ');' : 'telemetry.addData(' + str(f.t) + ', "%.1f", ' + v + ');');
          if (ctx.depth === 0) P('telemetry.update();'); else ctx.pending = true;
          break;
        }
      }
    });
    return out;
  }
  const body = list(prog.blocks, 0);
  if (!prog.blocks.length) body.push('// Add blocks to tell the robot what to do.');
  if (ctx.errs.length) throw new Error(ctx.errs[0]);
  return scaffold({
    cfg, mode: prog.mode, title: prog.name, group: prog.group, cls: className(prog.name), body, use: ctx.use, consts: ctx.consts,
    intro: ['Made from your blocks. The package, import and @ lines are what a real robot needs;', 'the simulator skips them.']
  });
}

/* ---------- editor ---------- */
let cursor = null;                         // { list, idx } where the next block lands
let openCat = 'drive';                     // toolbox category whose blocks are showing
let snapId = null;                         // id of the block that just connected, so it can play its snap
let swallow = false;                       // true for a moment after a drag so the mouse-up is not treated as a click
const fx = (name) => { try { if (BBZ.Sound) BBZ.Sound.play(name); } catch (e) { /* sound is optional */ } };
/* How many levels of nested lists a block carries inside it (0 for a plain block). */
function innerDepth(b) {
  if (!SPEC[b.type].body) return 0;
  let d = 0;
  b.body.concat(b.els).forEach((k) => { d = Math.max(d, innerDepth(k)); });
  return d + 1;
}
function listReachable(root, target) {
  if (root === target) return true;
  return root.some((b) => listReachable(b.body, target) || listReachable(b.els, target));
}
function clone(b) { return { id: newId(), type: b.type, f: JSON.parse(JSON.stringify(b.f)), body: b.body.map(clone), els: b.els.map(clone) }; }

/* Draws the palette and workspace into `root`. */
function render(root, prog, cfg, api) {
  root.textContent = '';
  if (!cursor || !listReachable(prog.blocks, cursor.list)) cursor = { list: prog.blocks, idx: prog.blocks.length };
  cursor.idx = Math.min(cursor.idx, cursor.list.length);
  const redraw = () => { render(root, prog, cfg, api); api.changed(); };
  const depthOf = (target, list, d) => {
    if (list === target) return d;
    for (let i = 0; i < list.length; i++) {
      const a = depthOf(target, list[i].body, d + 1); if (a >= 0) return a;
      const e = depthOf(target, list[i].els, d + 1); if (e >= 0) return e;
    }
    return -1;
  };
  const add = (type) => {
    if (countBlocks(prog.blocks) >= MAX_BLOCKS) { api.notify('That is the most blocks one program can hold (' + MAX_BLOCKS + ').'); return; }
    if (SPEC[type].body && depthOf(cursor.list, prog.blocks, 0) >= MAX_DEPTH - 1) { api.notify('Blocks cannot be nested any deeper than this.'); return; }
    const made = makeBlock(type, cfg);
    cursor.list.splice(cursor.idx, 0, made);
    cursor.idx++;
    snapId = made.id;
    redraw();
  };

  /* ----- drag and drop: pick a block up from the flyout or the workspace and drop it on a gap ----- */
  const slotInfo = new WeakMap();           // gap element -> { list, idx }
  function dropBlock(src, info) {
    const list = info.list;
    let idx = info.idx, made;
    const depth = depthOf(list, prog.blocks, 0);
    if (src.block) {
      const from = src.list.indexOf(src.block);
      if (from < 0) return;
      if (list === src.list && (idx === from || idx === from + 1)) { snapId = src.block.id; redraw(); return; }
      const inner = innerDepth(src.block);
      if (inner > 0 && depth + inner > MAX_DEPTH - 1) { api.notify('Blocks cannot be nested any deeper than this.'); return; }
      src.list.splice(from, 1);
      if (list === src.list && idx > from) idx--;
      made = src.block;
    } else {
      if (countBlocks(prog.blocks) >= MAX_BLOCKS) { api.notify('That is the most blocks one program can hold (' + MAX_BLOCKS + ').'); return; }
      if (SPEC[src.type].body && depth >= MAX_DEPTH - 1) { api.notify('Blocks cannot be nested any deeper than this.'); return; }
      made = makeBlock(src.type, cfg);
    }
    list.splice(idx, 0, made);
    cursor = { list, idx: idx + 1 };
    snapId = made.id;
    redraw();
  }
  function beginDrag(e, src, label, cat, srcEl) {
    if (e.button !== undefined && e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY, pid = e.pointerId;
    let ghost = null, target = null, active = false;
    /* a block cannot be dropped inside itself */
    const allowed = (info) => !src.block || !(listReachable(src.block.body, info.list) || listReachable(src.block.els, info.list));
    const pick = (x, y) => {
      let best = null, bd = 1e9;
      root.querySelectorAll('.slot').forEach((s) => {
        const info = slotInfo.get(s);
        if (!info || !allowed(info)) return;
        const r = s.getBoundingClientRect();
        if (!r.width) return;
        const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
        const d = Math.abs(y - (r.top + r.height / 2)) + dx * 0.5;
        if (d < bd) { bd = d; best = s; }
      });
      return bd < 70 ? best : null;
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
      if (ghost) ghost.remove();
      if (target) target.classList.remove('is-target');
      if (srcEl) srcEl.classList.remove('is-lifted');
      root.classList.remove('is-dragging');
    };
    function move(ev) {
      if (ev.pointerId !== pid) return;
      if (!active) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        active = true;
        ghost = h('div', { class: 'drag-ghost cat-' + cat }, label);
        document.body.append(ghost);
        root.classList.add('is-dragging');
        if (srcEl) srcEl.classList.add('is-lifted');
        fx('lift');
      }
      if (ev.cancelable) ev.preventDefault();
      ghost.style.transform = 'translate(' + (ev.clientX + 10) + 'px,' + (ev.clientY + 8) + 'px)';
      const wsEl = root.querySelector('.ws');
      if (wsEl) {
        const wr = wsEl.getBoundingClientRect();
        if (ev.clientY < wr.top + 28) wsEl.scrollTop -= 14; else if (ev.clientY > wr.bottom - 28) wsEl.scrollTop += 14;
      }
      const t = pick(ev.clientX, ev.clientY);
      if (t !== target) { if (target) target.classList.remove('is-target'); target = t; if (target) target.classList.add('is-target'); }
    }
    function end(ev) {
      if (ev.pointerId !== pid) return;
      const info = active && target && ev.type === 'pointerup' ? slotInfo.get(target) : null;
      const was = active;
      cleanup();
      if (!was) return;
      swallow = true; setTimeout(() => { swallow = false; }, 60);
      if (info) dropBlock(src, info);
    }
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  /* toolbox: a column of categories; the open one shows its blocks in a flyout beside it */
  const pal = h('div', { class: 'toolbox', role: 'group', 'aria-label': 'Block categories' });
  CATS.forEach((cat) => {
    const on = openCat === cat.id;
    pal.append(h('button', { type: 'button', class: 'tb-cat cat-' + cat.id + (on ? ' is-on' : ''), 'aria-pressed': String(on),
      onclick: () => { openCat = on ? '' : cat.id; render(root, prog, cfg, api); } }, h('i', { class: 'tb-dot' }), cat.label));
  });
  const fly = h('div', { class: 'flyout cat-' + (openCat || 'none'), hidden: !openCat });
  if (openCat) {
    Object.keys(SPEC).forEach((t) => {
      if (SPEC[t].cat !== openCat) return;
      const sp = SPEC[t], off = (sp.tool && !cfg.tools[sp.tool]) || (sp.mecanum && !BBZ.holo(cfg));
      fly.append(h('button', { type: 'button', class: 'pal-btn cat-' + openCat + (off ? ' is-off' : ''), title: off ? 'Your bot does not have the part this block needs' : 'Click to add, or drag into your program',
        onclick: () => add(t), onpointerdown: (e) => beginDrag(e, { type: t }, sp.title, openCat, null) }, sp.title));
    });
  }

  function fieldEl(b, p) {
    const f = b.f;
    if (p.t === 'num') {
      return h('input', { type: 'number', class: 'f-num', value: f[p.f], min: p.min, max: p.max, step: p.step, 'aria-label': 'number',
        onchange: (e) => { const v = parseFloat(e.target.value); f[p.f] = fixNum(isNaN(v) ? p.d : v, p); e.target.value = f[p.f]; api.changed(); } });
    }
    if (p.t === 'sel' || p.t === 'val') {
      const opts = p.t === 'val' ? VAL : p.opts;
      const s = h('select', { class: 'f-sel', 'aria-label': 'choice', onchange: (e) => { f[p.f] = e.target.value; api.changed(); } }, opts.map((o) => h('option', { value: o[0] }, o[1])));
      s.value = f[p.f]; return s;
    }
    if (p.t === 'dev') {
      const devs = BBZ.deviceList(cfg).filter((d) => d.kind === p.kind);
      const s = h('select', { class: 'f-sel', 'aria-label': p.kind, onchange: (e) => { f[p.f] = e.target.value; api.changed(); } },
        h('option', { value: '' }, 'choose…'), devs.map((d) => h('option', { value: d.role }, d.name)));
      s.value = devs.some((d) => d.role === f[p.f]) ? f[p.f] : ''; return s;
    }
    if (p.t === 'text') {
      return h('input', { type: 'text', class: 'f-text', value: f[p.f], maxlength: 30, 'aria-label': 'caption', oninput: (e) => { f[p.f] = e.target.value.slice(0, 30); api.changed(); } });
    }
    /* condition */
    const c = f[p.f], wrap = h('span', { class: 'f-cond' });
    const notSel = h('button', { type: 'button', class: 'f-not', 'aria-pressed': String(c.not), title: 'Flip this condition (not)', onclick: () => { c.not = !c.not; notSel.setAttribute('aria-pressed', String(c.not)); api.changed(); } }, 'not');
    const kind = h('select', { class: 'f-sel', 'aria-label': 'condition', onchange: (e) => { c.kind = e.target.value; redraw(); } }, COND.map((o) => h('option', { value: o[0] }, o[1])));
    kind.value = c.kind;
    wrap.append(notSel, kind);
    if (c.kind === 'btn') {
      const bs = h('select', { class: 'f-sel', 'aria-label': 'button', onchange: (e) => { c.btn = e.target.value; api.changed(); } }, BTN.map((o) => h('option', { value: o[0] }, o[1])));
      bs.value = c.btn; wrap.append(bs);
    } else {
      wrap.append(h('input', { type: 'number', class: 'f-num', value: c.n, min: 0, max: 999, step: 0.5, 'aria-label': 'number',
        onchange: (e) => { const v = parseFloat(e.target.value); c.n = isNaN(v) ? 0 : Math.min(999, Math.max(0, v)); e.target.value = c.n; api.changed(); } }));
    }
    return wrap;
  }

  function slot(list, idx) {
    const on = cursor.list === list && cursor.idx === idx;
    const gap = h('button', { type: 'button', class: 'slot' + (on ? ' is-on' : ''), 'aria-label': 'Put the next block here', onclick: () => { cursor = { list, idx }; render(root, prog, cfg, api); } },
      on ? 'next block goes here' : '');
    slotInfo.set(gap, { list, idx });
    return gap;
  }
  function listEl(list) {
    const box = h('div', { class: 'blk-list' });
    list.forEach((b, i) => { box.append(slot(list, i), blockEl(b, list, i)); });
    box.append(slot(list, list.length));
    return box;
  }
  function blockEl(b, list, i) {
    const sp = SPEC[b.type];
    const row = h('div', { class: 'blk-row' }, h('span', { class: 'blk-grip', title: 'Drag to move this block', 'aria-hidden': 'true' }, '⠿'));
    sp.parts.forEach((p) => row.append(typeof p === 'string' ? h('span', { class: 'blk-word', text: p }) : fieldEl(b, p)));
    const tools = h('span', { class: 'blk-tools' },
      h('button', { type: 'button', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { list.splice(i, 1); list.splice(i - 1, 0, b); cursor = null; redraw(); } }, '↑'),
      h('button', { type: 'button', title: 'Move down', 'aria-label': 'Move down', disabled: i === list.length - 1, onclick: () => { list.splice(i, 1); list.splice(i + 1, 0, b); cursor = null; redraw(); } }, '↓'),
      h('button', { type: 'button', title: 'Copy', 'aria-label': 'Copy block', onclick: () => { if (countBlocks(prog.blocks) + countBlocks([b]) > MAX_BLOCKS) { api.notify('Not enough room to copy that many blocks.'); return; } list.splice(i + 1, 0, clone(b)); redraw(); } }, '⧉'),
      h('button', { type: 'button', title: 'Delete', 'aria-label': 'Delete block', class: 'del', onclick: () => { list.splice(i, 1); cursor = null; redraw(); } }, '✕'));
    row.append(tools);
    const el = h('div', { class: 'blk cat-' + sp.cat, 'data-id': b.id }, row);
    row.addEventListener('pointerdown', (e) => {
      if (e.target.closest('input, select, button')) return;                  // typing and the arrow buttons still work
      if (e.pointerType === 'touch' && !e.target.closest('.blk-grip')) return; // on touch, drag by the grip so the page can still scroll
      e.preventDefault();
      beginDrag(e, { block: b, list }, sp.title, sp.cat, el);
    });
    if (sp.body) el.append(h('div', { class: 'blk-body' }, listEl(b.body)));
    if (sp.els) el.append(h('div', { class: 'blk-else', text: 'else' }), h('div', { class: 'blk-body' }, listEl(b.els)));
    return el;
  }

  const ws = h('div', { class: 'ws' }, h('div', { class: 'ws-hat', text: 'when START is pressed' }), listEl(prog.blocks));
  root.append(h('div', { class: 'bk' }, pal, fly, ws));
  if (!root.bbzDragWired) {                  /* once per workspace: ignore the click that ends a drag */
    root.bbzDragWired = true;
    root.addEventListener('click', (e) => { if (swallow) { e.stopPropagation(); e.preventDefault(); } }, true);
  }
  if (snapId) {                              /* the block that just connected pops into place with a click */
    const done = root.querySelector('[data-id="' + snapId + '"]');
    snapId = null;
    if (done) {
      done.classList.add('snap');
      try { done.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ }
      fx('snap');
    }
  }
}

/* ---------- example programs ---------- */
/* How long to hold a power to cover a distance or an angle. */
const timing = (function () {
  const TAU = 0.1, BRAKE = 0.06;
  const solve = (amount, rate, chained) => {
    if (chained) return amount / rate;
    const travelled = (t) => { const k = 1 - Math.exp(-t / TAU); return rate * (t - TAU * k) + rate * k * BRAKE; };
    let lo = 0, hi = 30;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (travelled(mid) < amount) lo = mid; else hi = mid; }
    return hi;
  };
  const ms = (s) => Math.max(20, Math.round(s * 100) * 10);
  return {
    drive: (cfg, inches, p, chained) => ms(solve(Math.abs(inches), BBZ.topSpeed(cfg) * p, chained)),
    strafe: (cfg, inches, p, chained) => ms(solve(Math.abs(inches), BBZ.topSpeed(cfg) * p * BBZ.DRIVES[cfg.drive].ks / BBZ.DRIVES[cfg.drive].kf, chained)),
    turn: (cfg, deg, p, chained) => ms(solve(Math.abs(deg) * Math.PI / 180, BBZ.topSpeed(cfg) * p / BBZ.turnK(cfg), chained))
  };
})();

/* Facts about the current bot that every example needs: which mechanisms it has and the numbers that fit it. */
function botFacts(cfg) {
  const n = cfg.names, T = cfg.tools, kit = cfg.kit, hl = cfg.length / 2;
  const shooter = T.launcher ? kit.launcher : null, face = cfg.layout.launcher.face;
  const reach = shooter ? BBZ.shooterReach(cfg) : 0;
  const wheels = shooter === 'dual' ? [n.launcher, n.launcher2] : shooter === 'flywheel' ? [n.launcher] : [];
  /* Every autonomous starts by driving to the line in front of its HIVE. */
  const startY = cfg.start === 'hive' ? hl + 0.05 : 36;
  /* A catapult cannot change its range, so the robot itself moves until the CELL is exactly one throw away. */
  let shift = 0;
  if (shooter === 'catapult') {
    shift = Math.round((Math.max(62.6 - BBZ.CATAPULT_RANGE - reach, hl + 0.05) - startY) * 2) / 2;
    if (Math.abs(shift) < 1.5) shift = 0;
  }
  const shootY = startY + shift, hiveShot = 62.6 - shootY - reach;
  const half = (v) => Math.round(v * 2) / 2;
  /* The list of moves for "tip the HIVE, then park". */
  const route = (slides) => {
    const s = [], toHive = half(59.5 - hl - 0.05);
    if (cfg.start === 'garden') s.push(['D', toHive], ['T', 90]);
    else if (cfg.start === 'zone') {
      /* a FLOWER stands on the wall here, so the route leaves the wall first */
      if (slides) s.push(['D', 9], ['S', -48], ['D', toHive - 9], ['T', 90]);
      else s.push(['D', 9], ['T', -90], ['D', 48], ['T', 90], ['D', toHive - 9], ['T', 90]);
    }
    let y = startY;
    if (shooter) { if (shift) { s.push(['D', shift]); y = shootY; } s.push(['SHOOT']); }
    const last = half(13.5 - hl);                                  /* stops about 6 inches short of the wall, inside the LOADING ZONE */
    if (slides) s.push(['S', 40], ['D', half(108.5 - y)], ['S', last]);
    else {
      const pre = Math.max(0, Math.round(hl + 8 - y));           /* get clear of the wall before turning */
      if (pre) s.push(['D', pre]);
      s.push(['T', 90], ['D', 40], ['T', -90], ['D', half(108.5 - y - pre)], ['T', 90], ['D', last]);
    }
    return s;
  };
  return {
    n, T, kit, shooter, face, reach, hiveShot, wheels, route, start: cfg.start,
    four: BBZ.holo(cfg), claw: T.intake && kit.intake === 'claw', roller: T.intake && kit.intake !== 'claw',
    hivePower: +BBZ.shotPower(hiveShot).toFixed(2),
    hiveTag: cfg.alliance === 'red' ? 1 : 4,
    startName: BBZ.START_SPOTS[cfg.start].label,
    atHive: cfg.start === 'hive',
    spin: (p) => wheels.map((w) => w + '.setPower(' + p + ');')
  };
}
function need(cfg, tools, extra) {
  const miss = tools.filter((t) => !cfg.tools[t]).map((t) => BBZ.TOOLS[t].label);
  (extra || []).forEach((x) => { if (x) miss.push(x); });
  return miss.length ? 'Needs ' + miss.join(' and ') : null;
}

function javaSample(mode, cfg) {
  const f = botFacts(cfg), n = f.n, T = f.T, body = [], use = [], constLines = [];
  if (mode === 'teleop') {
    use.push('setDrive');
    body.push('// run until the end of the match (driver presses STOP)', 'while (opModeIsActive()) {');
    body.push('    // Left stick drives' + (f.four ? ' and slides sideways' : '') + ', right stick turns.');
    body.push('    // Pushing a stick forward gives a NEGATIVE y value, so it is flipped here.');
    body.push('    setDrive(-gamepad1.left_stick_y, gamepad1.left_stick_x, gamepad1.right_stick_x);', '');
    if (f.roller) body.push(
      '    // Intake: right bumper pulls pieces in, left bumper pushes them out.',
      '    if (gamepad1.right_bumper) {', '        ' + n.intake + '.setPower(1.0);',
      '    } else if (gamepad1.left_bumper) {', '        ' + n.intake + '.setPower(-1.0);',
      '    } else {', '        ' + n.intake + '.setPower(0);', '    }', '');
    if (f.claw) body.push(
      '    // Claw: hold the right bumper to close it on a piece, let go to open it again.',
      '    ' + n.claw + '.setPosition(gamepad1.right_bumper ? 1.0 : 0.0);', '');
    if (f.wheels.length) {
      constLines.push('static final double LAUNCH_POWER = 0.75;       // try other values: faster wheel = longer shot');
      body.push('    // Launcher: hold the right trigger to spin the wheel' + (f.wheels.length > 1 ? 's' : '') + ', press A to feed one piece.');
      f.wheels.forEach((w) => body.push('    ' + w + '.setPower(gamepad1.right_trigger * LAUNCH_POWER);'));
      body.push('    ' + n.feeder + '.setPosition(gamepad1.a ? 1.0 : 0.0);', '');
    }
    if (f.shooter === 'catapult') body.push(
      '    // Catapult: press A to fire. Let go and the arm pulls back down for the next piece.',
      '    ' + n.catapult + '.setPosition(gamepad1.a ? 1.0 : 0.0);', '');
    if (T.lift) body.push(
      '    // Lift: D-pad up and down. X opens the gate to drop one piece.',
      '    if (gamepad1.dpad_up) {', '        ' + n.lift + '.setPower(0.9);',
      '    } else if (gamepad1.dpad_down) {', '        ' + n.lift + '.setPower(-0.9);',
      '    } else {', '        ' + n.lift + '.setPower(0);', '    }',
      '    ' + n.gate + '.setPosition(gamepad1.x ? 1.0 : 0.0);', '');
    if (T.imu) body.push('    telemetry.addData("Heading", "%.1f deg", ' + n.imu + '.getRobotYawPitchRollAngles().getYaw(AngleUnit.DEGREES));');
    if (T.distance) body.push('    telemetry.addData("Distance", "%.1f in", ' + n.distance + '.getDistance(DistanceUnit.INCH));');
    body.push('    telemetry.addData("Status", "Running");', '    telemetry.update();', '}');
    return scaffold({ cfg, mode, title: 'Full TeleOp', cls: 'FullTeleOp', body, use, constLines,
      intro: ['Full TeleOp: drive with the gamepad and work every tool on your bot.'] });
  }
  /* Quarter turns that point the shooter's side at the HIVE (dir 1) and back again (dir -1). */
  const aim = (dir) => (f.face === 2 ? [90, 90] : [f.face === 1 ? -90 : 90]).map((d) => 'turnLeft(' + d * dir + ', 0.4);');
  const steps = f.route(false), shootAt = steps.findIndex((s) => s[0] === 'SHOOT');
  const move = (s) => s[0] === 'D' ? 'driveInches(' + s[1] + ', ' + (Math.abs(s[1]) >= 30 ? '0.7' : '0.5') + ');' : 'turnLeft(' + s[1] + ', 0.5);';
  use.push('driveInches', 'turnLeft');
  let step = 1;
  if (shootAt > 0) {
    body.push('// ' + (step++) + '. Drive to the line in front of your HIVE and face it.');
    steps.slice(0, shootAt).forEach((s) => body.push(move(s)));
    body.push('');
  }
  if (f.shooter) {
    use.push('launchOne');
    if (f.face) { body.push('// Your shooter points out of the ' + BBZ.FACE_NAME[f.face] + ', so turn that side toward the HIVE.'); aim(1).forEach((s) => body.push(s)); }
    if (f.shooter === 'catapult') body.push('// ' + (step++) + '. A catapult always throws the same distance. From here that lands in the upward CELL.');
    else {
      constLines.push('static final double LAUNCH_POWER = ' + f.hivePower.toFixed(2) + ';       // tuned for the distance to the HIVE from here');
      body.push('// ' + (step++) + '. Spin up the launcher and shoot 3 POLLEN into the upward CELL.');
      f.spin('LAUNCH_POWER').forEach((s) => body.push(s));
      body.push('sleep(1500);');
    }
    body.push('//    That CELL starts with 3 NECTAR, so 3 more POLLEN tips the HIVE (20 points).',
      'for (int i = 0; i < 3 && opModeIsActive(); i++) {', '    launchOne();', '}');
    f.spin('0').forEach((s) => body.push(s));
    if (f.face) aim(-1).forEach((s) => body.push(s));
    body.push('');
  }
  body.push('// ' + step + '. LEAVE the wall (3 points), then drive to the LOADING ZONE and PARK (5 points).');
  steps.slice(shootAt + 1).forEach((s) => body.push(move(s)));
  return scaffold({ cfg, mode, title: 'Tip & Park Auto', cls: 'TipAndParkAuto', body, use, constLines,
    intro: ['Tip & Park Auto. It is written for the start spot "' + f.startName + '".'] });
}

BBZ.Blocks = { SPEC, render, generate, sanitize, makeBlock, countBlocks, className, resetCursor: () => { cursor = null; } };
/* The example library: every entry has a name, a one-line description and a maker for the current bot. */
function exampleList(cfg) {
  const f = botFacts(cfg), n = f.n;
  const J = (o) => () => scaffold(Object.assign({ cfg, intro: [o.title + ': ' + o.about] }, o));
  const dm = BBZ.driveRoles(cfg).map((r) => n[r]);
  const loop = (lines) => ['// run until the end of the match (driver presses STOP)', 'while (opModeIsActive()) {'].concat(lines.map((s) => s === '' ? '' : '    ' + s), ['}']);
  const mix = f.four
    ? [n.fl + '.setPower(y + x + turn);', n.fr + '.setPower(y - x - turn);', n.bl + '.setPower(y - x + turn);', n.br + '.setPower(y + x - turn);']
    : [n.left + '.setPower(y + turn);', n.right + '.setPower(y - turn);'];
  /* Some examples drive forward toward what a sensor sees, so they only make sense when it looks out of the front. */
  const frontOnly = (part, label) => (cfg.tools[part] && cfg.layout[part].face) ? 'the ' + label + ' pointing out of the front' : null;
  const tagRange = 34, camReach = cfg.tools.camera ? BBZ.partPos(cfg, 'camera').x : 0;
  const tagShot = tagRange + 10.1 + camReach - f.reach;                      // from the shooter to the middle of the CELL
  const cataRange = Math.round(BBZ.CATAPULT_RANGE - 10.1 - camReach + f.reach) - 4;      // a little close, so the wall behind is never in the way
  return [
    { id: 'java-drive', name: 'Drive Only TeleOp', lang: 'java', mode: 'teleop', why: null,
      desc: 'The simplest TeleOp: the sticks drive the robot and nothing else. Start here.',
      make: J({ mode: 'teleop', title: 'Drive Only TeleOp', cls: 'DriveOnlyTeleOp', about: 'the sticks drive the robot and nothing else.', body: loop([
        '// Pushing a stick forward gives a NEGATIVE y value, so it is flipped here.',
        'double y = -gamepad1.left_stick_y;'].concat(f.four ? ['double x = gamepad1.left_stick_x;'] : [], [
        'double turn = gamepad1.right_stick_x;', ''], mix, ['',
        'telemetry.addData("Status", "Running");',
        'telemetry.update();'])) }) },
    { id: 'java-full', name: 'Full TeleOp', lang: 'java', mode: 'teleop', why: null,
      desc: 'Drives and works every tool on your bot. It changes to match the parts you picked in Build Bot.',
      make: () => javaSample('teleop', cfg) },
    { id: 'java-two', name: 'Two Driver TeleOp', lang: 'java', mode: 'teleop', why: (f.T.intake || f.T.launcher || f.T.lift) ? null : 'Needs at least one scoring tool',
      desc: 'For two controllers: gamepad1 drives, gamepad2 works the tools. No second controller? Switch the on-screen pad to Gamepad 2.',
      make: () => javaSample('teleop', cfg).split('\n').map((line) => line.indexOf('setDrive(') >= 0 ? line : line.replace(/gamepad1\./g, 'gamepad2.')).join('\n')
        .replace('Full TeleOp: drive with the gamepad and work every tool on your bot.', 'Two Driver TeleOp: the driver on gamepad1 steers, the operator on gamepad2 works every tool.')
        .replace('"Full TeleOp"', '"Two Driver TeleOp"').replace('class FullTeleOp', 'class TwoDriverTeleOp')
        .replace('// Left stick drives', '// Driver (gamepad1): left stick drives') },
    { id: 'java-slow', name: 'Slow Mode TeleOp', lang: 'java', mode: 'teleop', why: null,
      desc: 'Hold the left trigger to drive at one-third speed for careful lining up.',
      make: J({ mode: 'teleop', title: 'Slow Mode TeleOp', cls: 'SlowModeTeleOp', about: 'hold the left trigger for slow, careful driving.', use: ['setDrive'], body: loop([
        '// The ? : picks one of two values: slow while the trigger is held, full speed otherwise.',
        'double speed = gamepad1.left_trigger > 0.5 ? 0.35 : 1.0;',
        'setDrive(-gamepad1.left_stick_y * speed, gamepad1.left_stick_x * speed, gamepad1.right_stick_x * speed);',
        'telemetry.addData("Speed", speed == 1.0 ? "FULL" : "SLOW");',
        'telemetry.update();']) }) },
    { id: 'java-field', name: 'Field-Centric TeleOp', lang: 'java', mode: 'teleop', why: need(cfg, ['imu'], [f.four ? null : 'a drivetrain that can slide sideways']),
      desc: 'Stick up always drives away from you, whichever way the robot faces. Press Y to reset.',
      make: J({ mode: 'teleop', title: 'Field-Centric TeleOp', cls: 'FieldCentricTeleOp', about: 'stick directions follow the field, not the robot.', use: ['setDrive'], body: loop([
        'double stickForward = -gamepad1.left_stick_y;',
        'double stickRight = gamepad1.left_stick_x;',
        '// How far has the robot turned since it started?',
        'double heading = ' + n.imu + '.getRobotYawPitchRollAngles().getYaw(AngleUnit.RADIANS);',
        '',
        '// Rotate the stick by that angle so "up" always means the same direction on the field.',
        'double forward = stickForward * Math.cos(heading) - stickRight * Math.sin(heading);',
        'double strafe = stickRight * Math.cos(heading) + stickForward * Math.sin(heading);',
        'setDrive(forward, strafe, gamepad1.right_stick_x);',
        '',
        '// Y makes the way the robot faces right now the new "forward".',
        'if (gamepad1.y) {',
        '    ' + n.imu + '.resetYaw();',
        '}',
        'telemetry.addData("Heading", "%.0f deg", Math.toDegrees(heading));',
        'telemetry.update();']) }) },
    { id: 'java-motortest', name: 'Motor Test', lang: 'java', mode: 'teleop', why: null,
      desc: 'Spins each drive motor for one second and shows its encoder. Use it to check your wiring and names.',
      make: J({ mode: 'teleop', title: 'Motor Test', cls: 'MotorTest', about: 'spins each drive motor in turn so you can check wiring and direction.',
        body: dm.map((m) => 'testMotor(' + m + ', ' + str(m) + ');'),
        extra: [
          '// Runs one motor forward for a second while showing its encoder count.',
          'void testMotor(DcMotor motor, String label) {',
          '    motor.setPower(0.5);',
          '    for (int i = 0; i < 20 && opModeIsActive(); i++) {',
          '        telemetry.addData("Testing", label);',
          '        telemetry.addData("Encoder", motor.getCurrentPosition());',
          '        telemetry.update();',
          '        sleep(50);',
          '    }',
          '    motor.setPower(0);',
          '    sleep(300);',
          '}'] }) },
    { id: 'java-tune', name: 'Shooter Tuning TeleOp', lang: 'java', mode: 'teleop', why: f.wheels.length ? null : 'Needs a flywheel shooter',
      desc: 'D-pad up and down change the wheel power in small steps, A fires. Use it to find the power for any distance.',
      make: J({ mode: 'teleop', title: 'Shooter Tuning TeleOp', cls: 'ShooterTuningTeleOp', about: 'find the launcher power that reaches your target.', use: ['setDrive'], body: [
        'double power = 0.60;',
        'boolean wasUp = false;',
        'boolean wasDown = false;',
        ''].concat(loop([
        'setDrive(-gamepad1.left_stick_y, gamepad1.left_stick_x, gamepad1.right_stick_x);',
        '',
        '// Change the power once per press, not once per loop.',
        'if (gamepad1.dpad_up && !wasUp) {',
        '    power = Math.min(1.0, power + 0.05);',
        '}',
        'if (gamepad1.dpad_down && !wasDown) {',
        '    power = Math.max(0.0, power - 0.05);',
        '}',
        'wasUp = gamepad1.dpad_up;',
        'wasDown = gamepad1.dpad_down;',
        ''].concat(f.spin('power'), [
        n.feeder + '.setPosition(gamepad1.a ? 1.0 : 0.0);',
        'telemetry.addData("Launcher power", "%.2f", power);',
        'telemetry.update();']))) }) },
    { id: 'java-tags', name: 'AprilTag Reader', lang: 'java', mode: 'teleop', why: need(cfg, ['camera']),
      desc: 'Drive around and watch the webcam report every AprilTag it sees: ID, range, bearing and yaw.',
      make: J({ mode: 'teleop', title: 'AprilTag Reader', cls: 'AprilTagReader', about: 'shows every AprilTag the webcam can see.', use: ['setDrive'], body: loop([
        'setDrive(-gamepad1.left_stick_y, gamepad1.left_stick_x, gamepad1.right_stick_x);',
        '',
        'telemetry.addData("Tags in view", aprilTag.getDetections().size());',
        'for (AprilTagDetection detection : aprilTag.getDetections()) {',
        '    telemetry.addLine("Tag " + detection.id + ": " + detection.metadata.name);',
        '    telemetry.addData("  range", "%.1f in", detection.ftcPose.range);',
        '    telemetry.addData("  bearing", "%.1f deg", detection.ftcPose.bearing);',
        '    telemetry.addData("  yaw", "%.1f deg", detection.ftcPose.yaw);',
        '}',
        'telemetry.update();']) }) },
    { id: 'java-leave', name: 'Leave Only Auto', lang: 'java', mode: 'auto', why: null,
      desc: 'The shortest useful autonomous: drive off the wall for 3 LEAVE points.',
      make: J({ mode: 'auto', title: 'Leave Only Auto', cls: 'LeaveOnlyAuto', about: 'drives off the wall for the LEAVE points.', use: ['setDrive'], body: [
        '// LEAVE is worth 3 points: the robot only has to stop touching the wall.',
        'setDrive(0.4, 0, 0);',
        'sleep(600);',
        'setDrive(0, 0, 0);'] }) },
    { id: 'java-tip', name: 'Tip & Park Auto', lang: 'java', mode: 'auto', why: null,
      desc: (f.shooter ? 'Shoots 3 POLLEN to tip the HIVE, leaves the wall, then parks.' : 'Leaves the wall and parks in the LOADING ZONE.') + ' Written for the start spot "' + f.startName + '".',
      make: () => javaSample('auto', cfg) },
    { id: 'java-square', name: 'Square Path Auto', lang: 'java', mode: 'auto', why: null,
      desc: 'Drives a 20 inch square and returns to the start. Great for tuning distances and turns.',
      make: J({ mode: 'auto', title: 'Square Path Auto', cls: 'SquarePathAuto', about: 'drives a square to practise encoder distances and turns.', use: ['driveInches', 'turnLeft'], body: [
        '// Four sides, four left turns. If it does not end where it began, tune the numbers.',
        'for (int side = 0; side < 4 && opModeIsActive(); side++) {',
        '    driveInches(20, 0.6);',
        '    turnLeft(90, 0.5);',
        '}'] }) },
    { id: 'java-distance', name: 'Distance Stop Auto', lang: 'java', mode: 'auto', why: need(cfg, ['distance'], [frontOnly('distance', 'distance sensor')]),
      desc: 'Creeps forward until the distance sensor reads under 12 inches, then stops.',
      make: J({ mode: 'auto', title: 'Distance Stop Auto', cls: 'DistanceStopAuto', about: 'uses the distance sensor to stop before hitting something.', use: ['setDrive'], body: [
        '// Drive slowly until something is closer than 12 inches, then stop.',
        'setDrive(0.4, 0, 0);',
        'while (opModeIsActive() && ' + n.distance + '.getDistance(DistanceUnit.INCH) > 12) {',
        '    telemetry.addData("Distance", "%.1f in", ' + n.distance + '.getDistance(DistanceUnit.INCH));',
        '    telemetry.update();',
        '}',
        'setDrive(0, 0, 0);'] }) },
    { id: 'java-lift', name: 'Lift & Drop Auto', lang: 'java', mode: 'auto', why: need(cfg, ['lift']),
      desc: 'Raises the lift to FLOWER height with RUN_TO_POSITION, drops one piece, then lowers again.',
      make: J({ mode: 'auto', title: 'Lift & Drop Auto', cls: 'LiftAndDropAuto', about: 'raises the lift to an exact height, drops a piece and comes back down.', use: ['liftTo', 'dropOne'], body: [
        '// The top of a FLOWER is 21.5 inches up, so 22 inches clears it.',
        'liftTo(22, true);',
        'dropOne();',
        'liftTo(0, true);'] }) },
    { id: 'java-tagaim', name: 'AprilTag Aim Auto', lang: 'java', mode: 'auto', why: need(cfg, ['camera'], [frontOnly('camera', 'webcam'), f.atHive ? null : 'the start spot that faces your HIVE']),
      desc: 'Uses the webcam to turn until your HIVE tag is dead ahead and ' + (f.shooter && !f.face ? 'drive to shooting distance, then fires.' : 'drive to a set distance from it.'),
      make: J({ mode: 'auto', title: 'AprilTag Aim Auto', cls: 'AprilTagAimAuto', about: 'lines the robot up on an AprilTag using the webcam.', use: ['setDrive', 'findTag'].concat(f.shooter ? ['launchOne'] : []),
        constLines: ['static final int HIVE_TAG = ' + f.hiveTag + ';            // the tag on your side of your HIVE',
          'static final double TARGET_RANGE = ' + (f.shooter === 'catapult' ? cataRange : tagRange) + ';     // how many inches from the tag to stop'],
        body: [
          '// Keep correcting until the tag is straight ahead and at the right distance (or 10 seconds pass).',
          'while (opModeIsActive() && runtime.seconds() < 10) {',
          '    AprilTagDetection tag = findTag(HIVE_TAG);',
          '    if (tag == null) {',
          '        setDrive(0, 0, 0.25);          // not in view: turn slowly to look for it',
          '    } else if (Math.abs(tag.ftcPose.bearing) < 1.5 && Math.abs(tag.ftcPose.range - TARGET_RANGE) < 1.0) {',
          '        break;                         // lined up',
          '    } else {',
          '        // bearing is + when the tag is to the left, and a left turn is a negative turn value.',
          '        double turn = Range.clip(-tag.ftcPose.bearing * 0.03, -0.3, 0.3);',
          '        double forward = Range.clip((tag.ftcPose.range - TARGET_RANGE) * 0.05, -0.4, 0.4);',
          '        setDrive(forward, 0, turn);',
          '        telemetry.addData("Range", "%.1f in", tag.ftcPose.range);',
          '        telemetry.addData("Bearing", "%.1f deg", tag.ftcPose.bearing);',
          '        telemetry.update();',
          '    }',
          '}',
          'setDrive(0, 0, 0);'].concat(f.shooter && !f.face ? [''].concat(
            f.shooter === 'catapult' ? [] : ['// Spin up, then shoot 3 POLLEN.'].concat(f.spin(BBZ.shotPower(tagShot).toFixed(2)), ['sleep(1500);']),
            ['for (int i = 0; i < 3 && opModeIsActive(); i++) {', '    launchOne();', '}'], f.spin('0')) : []) }) }
  ];
}

BBZ.Samples = { java: javaSample, list: exampleList, facts: botFacts, timing, need };
})();
