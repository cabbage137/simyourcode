/* Page wiring: storage, program editor, driver station, gamepad input, instruments and the Build Bot tab. */
(function () {
'use strict';
const BBZ = window.BBZ, h = BBZ.h, J = BBZ.Java;
const $ = (id) => document.getElementById(id);
const KEY = 'bbz-practice-sim-v1';
const STEP = 1 / 120;
const MAX_PROGRAMS = 30, MAX_CODE = 60000;

const state = { robot: BBZ.defaultRobot(), programs: [], open: 0, auto: -1, tele: -1, speed: 1 };
let world = null;
let runner = null, runProg = null, started = false, startAt = 0, stopReq = false, matchOn = false;
let errInfo = null;              // { line, progId }
let pid = 1;

/* ---------- storage ---------- */
const cleanName = (s, def) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f<>]/g, '').slice(0, 40).trim() : '') || def || 'My program';
/* Converts Blocks programs from the old editor into Java op modes. */
function convertLegacy(p) {
  const name = cleanName(p.name), mode = p.mode === 'auto' ? 'auto' : 'teleop', group = cleanGroup(p.group);
  let code;
  try { code = BBZ.Blocks.legacyJava({ name, mode, group, blocks: BBZ.Blocks.legacySanitize(p.blocks) }, state.robot); }
  catch (e) { code = '// This op mode was made with the old Blocks editor and could not be converted:\n// ' + String(e && e.message ? e.message : e).replace(/[\r\n]/g, ' ') + '\n'; }
  return { id: pid++, name: cleanName(name.slice(0, 26) + ' (was Blocks)'), lang: 'java', mode, group, desc: cleanDesc(p.desc), code: code.slice(0, MAX_CODE), blocks: [] };
}
function cleanProgram(p) {
  if (!p || typeof p !== 'object') return null;
  const lang = p.lang === 'blocks' ? 'blocks' : 'java';
  if (lang === 'blocks' && Array.isArray(p.blocks)) return convertLegacy(p);
  return {
    id: pid++, name: cleanName(p.name), lang, mode: p.mode === 'auto' ? 'auto' : 'teleop', group: cleanGroup(p.group), desc: cleanDesc(p.desc),
    code: lang === 'java' && typeof p.code === 'string' ? p.code.slice(0, MAX_CODE) : '',
    blocks: lang === 'blocks' ? BBZ.Blocks.sanitize(p.blocks) : [],
    ex: (typeof p.ex === 'string' && /^[a-z-]{1,30}$/.test(p.ex)) ? p.ex : '', sig: (typeof p.sig === 'string' && /^[0-9a-z]{1,16}$/.test(p.sig)) ? p.sig : ''
  };
}
/* A short fingerprint of a program's contents. */
function sigOf(p) {
  const s = p.lang === 'java' ? p.code : JSON.stringify(p.blocks);
  let a = 2166136261;
  for (let i = 0; i < s.length; i++) { a ^= s.charCodeAt(i); a = Math.imul(a, 16777619); }
  return (a >>> 0).toString(36) + s.length.toString(36);
}
const isPure = (p) => !!(p.ex && p.sig && sigOf(p) === p.sig);
function seed() {
  const list = BBZ.Samples.list(state.robot);
  state.programs = ['java-full', 'java-tip', 'blocks-full', 'blocks-tip'].map((id) => fromExample(list.find((e) => e.id === id)));
  normalise();
  state.open = 0; state.auto = state.programs.findIndex((p) => p.mode === 'auto'); state.tele = 0;
}
const cleanGroup = (s) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f<>"]/g, '').slice(0, 24).trim() : '') || 'My Op Modes';
const cleanDesc = (s) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f<>]/g, '').slice(0, 140) : '');
function load() {
  let raw = null;
  try { raw = JSON.parse(window.localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
  if (raw && typeof raw === 'object') {
    state.robot = BBZ.sanitizeRobot(raw.robot);
    BBZ.Blocks.useRobot(state.robot);            /* block dropdowns must know this bot's device names before programs are read */
    if (Array.isArray(raw.programs)) state.programs = raw.programs.slice(0, MAX_PROGRAMS).map(cleanProgram).filter(Boolean); normalise();
    const idx = (v) => (typeof v === 'number' && Number.isInteger(v) && v >= -1 && v < state.programs.length) ? v : -1;
    state.open = Math.max(0, idx(raw.open)); state.auto = idx(raw.auto); state.tele = idx(raw.tele);
    state.speed = raw.speed === 2 || raw.speed === 4 ? raw.speed : 1;
  }
  if (!state.programs.length) seed();
  else renewOldExamples();
  fixMatchPicks();
}
/* Moves example op modes saved by an earlier version into an "Older versions" group. */
function renewOldExamples() {
  let list = null;
  const fresh = [];
  state.programs.forEach((p) => {
    if (p.ex || p.group !== 'Examples') return;
    list = list || BBZ.Samples.list(state.robot);
    const ex = list.find((e) => e.name === p.name && e.lang === p.lang);
    if (!ex || ex.why || state.programs.length + fresh.length >= MAX_PROGRAMS) return;
    try { fresh.push({ at: p, prog: fromExample(ex) }); } catch (e) { return; }
    p.name = cleanName(p.name.slice(0, 34) + ' (old)'); p.group = 'Older versions';
  });
  fresh.forEach((f) => { state.programs.splice(state.programs.indexOf(f.at), 0, f.prog); });
  if (fresh.length) normalise();
}
function fixMatchPicks() {
  const ok = (i, mode) => i >= 0 && state.programs[i] && state.programs[i].mode === mode;
  if (!ok(state.auto, 'auto')) state.auto = state.programs.findIndex((p) => p.mode === 'auto');
  if (!ok(state.tele, 'teleop')) state.tele = state.programs.findIndex((p) => p.mode === 'teleop');
  if (state.open >= state.programs.length) state.open = 0;
}
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({
        robot: state.robot, open: state.open, auto: state.auto, tele: state.tele, speed: state.speed,
        programs: state.programs.map((p) => ({ name: p.name, lang: p.lang, mode: p.mode, group: p.group, desc: p.desc, code: p.code, blocks: p.blocks, ex: p.ex || '', sig: p.sig || '' }))
      }));
    } catch (e) { /* storage can be unavailable; the page still works */ }
  }, 350);
}

let toastTimer = 0;
function notify(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3600);
}

/* ---------- colours for the canvas, read from the theme tokens ---------- */
let col = null;
function readColors() {
  const cs = getComputedStyle(document.documentElement), g = (n) => cs.getPropertyValue(n).trim() || '#888';
  col = {
    bg: g('--sunk'), tile: g('--tile'), tileLine: g('--tile-line'), tileText: g('--tile-text'), wall: g('--wall'), muted: g('--muted'),
    red: g('--red'), blue: g('--blue'), pollen: g('--pollen'), ballEdge: g('--ball-edge'), hive: g('--hive'), accent: g('--honey'),
    body: g('--body'), part: g('--part'), wheel: g('--wheel'), wheelMark: g('--wheel-mark'), good: g('--good'), warn: g('--warn'),
    petal: g('--petal'), flowerCore: g('--flower-core'), meterBg: g('--meter-bg')
  };
}

/* ---------- telemetry, gamepads and hardware map handed to student code ---------- */
const tele = { pending: [], shown: null, dirty: true, update() { this.shown = this.pending.slice(0, 30); this.pending = []; this.dirty = true; } };
const PAD_KEYS = ['left_stick_x', 'left_stick_y', 'right_stick_x', 'right_stick_y', 'left_trigger', 'right_trigger', 'a', 'b', 'x', 'y',
  'left_bumper', 'right_bumper', 'dpad_up', 'dpad_down', 'dpad_left', 'dpad_right', 'start', 'back', 'left_stick_button', 'right_stick_button', 'guide', 'touchpad'];
const ANALOG = { left_stick_x: 1, left_stick_y: 1, right_stick_x: 1, right_stick_y: 1, left_trigger: 1, right_trigger: 1 };
const blankPad = () => { const p = {}; PAD_KEYS.forEach((k) => { p[k] = ANALOG[k] ? 0 : false; }); return p; };
const pad = blankPad(), pad2 = blankPad();
function padApi(src) {
  const F = Object.create(null);
  PAD_KEYS.forEach((k) => { F[k] = () => src[k]; });
  F.cross = F.a; F.circle = F.b; F.square = F.x; F.triangle = F.y;
  F.options = F.start; F.share = F.back; F.ps = F.guide;                  /* the PlayStation names for the same buttons */
  return { __t: 'Gamepad', __f: F, __m: Object.create(null) };
}
const KIND_OF = { DcMotor: 'motor', DcMotorEx: 'motor', DcMotorSimple: 'motor', Servo: 'servo', IMU: 'imu', DistanceSensor: 'distance', Rev2mDistanceSensor: 'distance', WebcamName: 'camera', CameraName: 'camera' };
const KIND_LABEL = { motor: 'motor', servo: 'servo', imu: 'IMU', distance: 'distance sensor', camera: 'webcam' };
/* The vision objects student code gets from AprilTagProcessor and VisionPortal, shaped like the FTC SDK ones. */
function tagObject(d) {
  const P = Object.create(null), F = Object.create(null), MD = Object.create(null);
  P.range = () => d.range; P.bearing = () => d.bearing; P.yaw = () => d.yaw; P.x = () => d.x; P.y = () => d.y; P.z = () => 0;
  P.elevation = () => 0; P.pitch = () => 0; P.roll = () => 0;
  MD.id = () => d.id; MD.name = () => d.name; MD.tagsize = () => 4;
  const pose = { __t: 'AprilTagPoseFtc', __f: P, __m: Object.create(null) }, meta = { __t: 'AprilTagMetadata', __f: MD, __m: Object.create(null) };
  F.id = () => d.id; F.ftcPose = () => pose; F.metadata = () => meta; F.decisionMargin = () => 80;
  return { __t: 'AprilTagDetection', __f: F, __m: Object.create(null), __s: () => 'AprilTag ' + d.id };
}
function visionStatics(cls, name, a) {
  if (cls === 'AprilTagProcessor' && name === 'easyCreateWithDefaults') {
    const M = Object.create(null);
    const list = () => {
      const items = world.tagDetections().map(tagObject), L = Object.create(null);
      L.size = () => items.length; L.isEmpty = () => items.length === 0;
      L.get = (x) => { const i = x[0]; if (typeof i !== 'number' || i < 0 || i >= items.length) throw new Error('The list has ' + items.length + ' detection(s), so get(' + i + ') is outside it. Check size() first.'); return items[i]; };
      return { arr: items, __t: 'List', __m: L, __s: () => items.length + ' AprilTag detection(s)' };
    };
    M.getDetections = list; M.getFreshDetections = list; M.setDecimation = () => undefined;
    return { __t: 'AprilTagProcessor', __m: M };
  }
  if (cls === 'VisionPortal' && name === 'easyCreateWithDefaults') {
    if (!a[0] || a[0].__t !== 'WebcamName') throw new Error('VisionPortal.easyCreateWithDefaults needs your webcam first, like hardwareMap.get(WebcamName.class, "' + state.robot.names.camera + '").');
    if (!a[1] || a[1].__t !== 'AprilTagProcessor') throw new Error('VisionPortal.easyCreateWithDefaults needs an AprilTagProcessor as its second value.');
    const M = Object.create(null);
    M.close = () => undefined; M.stopStreaming = () => undefined; M.resumeStreaming = () => undefined; M.setProcessorEnabled = () => undefined;
    M.getCameraState = () => 'STREAMING';
    return { __t: 'VisionPortal', __m: M };
  }
  return undefined;
}
function getDevice(cls, name) {
  if (typeof name !== 'string') throw new Error('hardwareMap.get needs the device name in quotes, like hardwareMap.get(DcMotor.class, "fl").');
  let d = world.device(name);
  if (!d && name === 'Webcam 1') d = world.device(state.robot.names.camera);          // the usual name on a real robot
  if (!d && KIND_OF[cls] === 'camera' && !state.robot.tools.camera) throw new Error('Your bot has no webcam. Tick "Webcam (AprilTags)" under Sensors on the Build Bot tab, then run again.');
  if (!d) throw new Error('There is no device named "' + name + '" on your bot. It has: ' + BBZ.deviceList(state.robot).map((x) => x.name).join(', ') + '. Names must match the Build Bot tab exactly, capitals included.');
  if (cls) {
    const want = KIND_OF[cls];
    if (!want) throw new Error('This simulator has no device type called ' + cls + '. Use DcMotor, Servo, IMU, DistanceSensor or WebcamName.');
    if (want !== d.kind) throw new Error('"' + name + '" is a ' + KIND_LABEL[d.kind] + ', but your code asks for a ' + cls + '.');
  }
  return d.api;
}
function makeHost() {
  const t0 = world.time;
  const say = (text) => { if (tele.pending.length < 40) tele.pending.push(String(text).slice(0, 160)); };
  const TM = Object.create(null);
  TM.addData = (a, ints) => {
    const v = (a.length > 2 && typeof a[1] === 'string') ? J.javaFormat(a[1], a.slice(2), ints.slice(2)) : J.jstr(a[1], ints[1]);
    say(J.jstr(a[0], ints[0]) + ' : ' + v); return null;
  };
  TM.addLine = (a, ints) => { say(a.length ? J.jstr(a[0], ints[0]) : ''); return null; };
  TM.update = () => { tele.update(); return true; };
  TM.clear = () => { tele.pending = []; };
  TM.clearAll = TM.clear;
  TM.setAutoClear = () => undefined; TM.speak = () => undefined; TM.setMsTransmissionInterval = () => undefined;
  const sub = (cls) => { const M = Object.create(null); M.get = (a) => getDevice(cls, a[0]); return { __t: 'DeviceMapping', __m: M }; };
  const HM = Object.create(null), HF = Object.create(null);
  HM.get = (a) => a.length >= 2 ? getDevice(a[0] && a[0].name, a[1]) : getDevice(null, a[0]);
  HF.dcMotor = () => sub('DcMotor'); HF.servo = () => sub('Servo');
  return {
    now: () => world.time - t0,
    isStarted: () => started,
    isStopRequested: () => stopReq,
    statics: visionStatics,
    requestStop: () => { stopReq = true; },
    log: (s) => addLog('info', 'Printed: ' + String(s).slice(0, 200)),
    flushTelemetry: () => { if (tele.pending.length) tele.update(); },
    telemetry: { __t: 'Telemetry', __m: TM },
    hardwareMap: { __t: 'HardwareMap', __m: HM, __f: HF },
    gamepad1: padApi(pad), gamepad2: padApi(pad2)
  };
}

/* ---------- running programs ---------- */
const openProg = () => state.programs[state.open] || null;
function setStatus(s) { $('dsStatus').textContent = s; }
function clearError() {
  errInfo = null;
  const c = $('console'); c.className = 'console'; c.textContent = 'No problems found. Errors in your code show up here with a line number.';
  $('errLine').hidden = true;
}
function showError(e, prog) {
  prog = prog || runProg || openProg();
  const line = e && e.line ? e.line : 0, msg = (e && e.message) ? e.message : String(e);
  let text;
  if (prog && prog.lang === 'blocks') text = line ? 'Problem in your blocks (line ' + line + ' of the Java they make): ' + msg : msg;
  else text = (line ? 'Line ' + line + ': ' : '') + msg;
  if (prog && prog !== openProg()) text = 'In "' + prog.name + '": ' + text;
  const c = $('console'); c.className = 'console is-bad'; c.textContent = text;
  errInfo = (prog && prog.lang === 'java' && line) ? { line, progId: prog.id } : null;
  if (errInfo && prog === openProg()) { const ta = $('code'); ta.scrollTop = Math.max(0, (line - 6) * 20); }
  placeErrLine();
  addLog('foul', 'Program stopped: ' + text);
}
function placeErrLine() {
  const el = $('errLine'), p = openProg();
  if (!errInfo || !p || p.id !== errInfo.progId || p.lang !== 'java') { el.hidden = true; return; }
  const y = 10 + (errInfo.line - 1) * 20 - $('code').scrollTop;
  if (y < -20 || y > $('code').clientHeight) { el.hidden = true; return; }
  el.hidden = false; el.style.top = y + 'px';
}
function startOpMode(prog) {
  endOpMode();
  clearError();
  let src;
  try { src = prog.lang === 'java' ? prog.code : BBZ.Blocks.generate(prog, state.robot); }
  catch (e) { showError(e, prog); return false; }
  world.newOpMode();
  tele.pending = []; tele.shown = null; tele.dirty = true;
  started = false; stopReq = false; startAt = world.time + 0.35;
  try { runner = J.start(src, makeHost()); }
  catch (e) { runner = null; showError(e, prog); return false; }
  runProg = prog; world.enabled = true;
  return true;
}
function endOpMode() {
  cancelCountdown();
  runner = null; runProg = null; started = false;
  if (world) world.stopActuators();
}
/* Ends a practice run. */
function endPractice() {
  if (world.mode !== 'practice' && world.mode !== 'autotest') return false;
  world.practiceDone();
  return true;
}
function runOpen() {
  const p = openProg();
  if (!p) return;
  /* An autonomous run always begins from a fresh field. */
  const fresh = p.mode === 'auto';
  if (matchOn || world.mode === 'over' || fresh) { endOpMode(); world.reset(); clearLog(); rebuildHw(); }
  matchOn = false;
  world.mode = fresh ? 'autotest' : 'practice';            /* an autonomous run on its own is scored as AUTO */
  if (startOpMode(p)) { setStatus('Running "' + p.name + '"' + (fresh ? ' from the start spot' : '') + '. Press Stop when you are done.'); addLog('info', 'Started ' + p.name + (fresh ? ' on a fresh field (practice, no clock).' : ' (practice, no clock).')); }
  else { world.mode = 'idle'; setStatus('That program has a problem. Check the box under the editor.'); }
}
const sfx = (name) => { try { if (BBZ.Sound) BBZ.Sound.play(name); } catch (e) { /* sound is optional */ } };
let countTimer = 0;
function cancelCountdown() {
  if (countTimer) { clearTimeout(countTimer); countTimer = 0; }
  const o = $('countOverlay');
  if (o) o.hidden = true;
}
/* Shows a big number over the field and replays its pop animation. */
function showCount(text) {
  const o = $('countOverlay'), n = $('countNum');
  if (!o || !n) return;
  n.textContent = text;
  o.hidden = false;
  n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop');
}
/* Competition-style start: the field resets, "3, 2, 1" counts down with beeps, then the charge call starts AUTO. */
function runMatch() {
  endOpMode();
  world.reset(); clearLog(); rebuildHw();
  matchOn = false; world.mode = 'idle';
  /* The op mode open in the editor plays in the match: as the autonomous or as the TeleOp, whichever it is. */
  const openNow = openProg(), at = state.programs.indexOf(openNow);
  if (openNow && at >= 0) {
    if (openNow.mode === 'auto') state.auto = at; else state.tele = at;
    matchList($('autoSel'), 'auto', state.auto); matchList($('teleSel'), 'teleop', state.tele); save();
  }
  const teleNow = state.programs[state.tele];
  setStatus('Drivers, hands off the controls. AUTO starts after the countdown.' + (teleNow ? ' TELEOP will run "' + teleNow.name + '".' : ''));
  let n = 3;
  const tick = () => {
    countTimer = 0;
    if (n === 0) {
      beginMatch();
      showCount('GO!'); sfx('charge');
      countTimer = setTimeout(cancelCountdown, 700);
      return;
    }
    showCount(String(n)); sfx('count');
    n--;
    countTimer = setTimeout(tick, 1000);
  };
  tick();
}
function beginMatch() {
  matchOn = true; world.mode = 'auto'; world.clock = 30;
  const p = state.programs[state.auto];
  addLog('info', 'Match started. AUTO: 30 seconds, no driver control.');
  if (p) {
    const keep = countTimer;                 /* starting an op mode clears timers; keep the one hiding "GO!" */
    countTimer = 0;
    const ok = startOpMode(p);
    countTimer = keep;
    if (!ok) { matchOn = false; world.mode = 'idle'; setStatus('The autonomous program has a problem. Fix it and try again.'); return; }
    setStatus('AUTO: running "' + p.name + '".');
  } else setStatus('AUTO: no autonomous program picked, so the robot waits.');
}
function onPhase() {
  if (world.mode === 'transition') {
    endOpMode();
    addLog('info', 'AUTO is over. 8 second pause: robots must not move.'); sfx('buzzer');
    setStatus('Pause before TELEOP. Get your hands ready.');
  } else if (world.mode === 'teleop') {
    const p = state.programs[state.tele];
    addLog('info', 'TELEOP: 2 minutes. You have the controls.'); sfx('charge');
    if (p && startOpMode(p)) setStatus('TELEOP: running "' + p.name + '". Drive!');
    else setStatus(p ? 'The TeleOp program has a problem. The clock keeps running.' : 'TELEOP: no TeleOp program picked.');
  } else if (world.mode === 'over') {
    endOpMode(); matchOn = false;
    const s = world.score();
    sfx('buzzerLong');
    addLog('good', 'Match over. Final score: ' + s.total + ' points with ' + s.tips + ' HIVE TIP' + (s.tips === 1 ? '' : 'S') + '.');
    setStatus('Match over. Final score: ' + s.total + '. Press Reset field to play again.');
  }
}
function stopAll() {
  const was = runner || matchOn || countTimer;
  endOpMode();
  if (matchOn) { matchOn = false; addLog('info', 'Match stopped early.'); }
  endPractice();
  if (world.mode !== 'over') world.mode = 'idle';
  if (was) setStatus('Stopped. The field stays as it is; press Reset field to start fresh.');
}
function resetField() {
  endOpMode(); matchOn = false;
  world.reset(); clearLog(); rebuildHw();
  tele.pending = []; tele.shown = null; tele.dirty = true;
  setStatus('Field reset. Pick a program and press Run.');
}

function simStep() {
  if (runner) {
    if (!started && world.time >= startAt) started = true;
    try {
      if (runner.step(world.time)) {
        const name = runProg ? runProg.name : 'Program';
        endOpMode();
        if (endPractice()) setStatus('"' + name + '" finished.' + (world.autoDone ? ' The Score sheet shows what it earned.' : ''));
        addLog('info', name + ' reached the end of its code.');
      } else if (stopReq) { endOpMode(); endPractice(); setStatus('The program asked to stop.'); }
    } catch (e) {
      const prog = runProg;
      endOpMode();
      endPractice();
      showError(e, prog);
      setStatus('The program stopped with an error.');
    }
  }
  world.step(STEP);
  if (world.phaseChanged) { world.phaseChanged = false; onPhase(); }
}

/* ---------- log ---------- */
const logItems = [];
function addLog(kind, text) {
  logItems.unshift({ kind, text, t: world ? world.time : 0 });
  if (logItems.length > 60) logItems.pop();
  renderLog();
}
function clearLog() { logItems.length = 0; renderLog(); }
function renderLog() {
  const ul = $('log'); ul.textContent = '';
  if (!logItems.length) { ul.append(h('li', { text: 'Nothing has happened yet.' })); return; }
  logItems.forEach((it) => ul.append(h('li', { class: 'k-' + it.kind }, h('time', { text: it.t.toFixed(1) + 's' }), it.text)));
}

/* ---------- instruments ---------- */
let hwRows = [];
function rebuildHw() {
  const tb = $('hwBody'); tb.textContent = ''; hwRows = [];
  BBZ.deviceList(state.robot).forEach((d) => {
    const fill = h('i'), bar = h('div', { class: 'bar' + (d.kind === 'motor' ? ' mid' : '') }, fill), val = h('td', { class: 'num mono' });
    const out = d.kind === 'motor' || d.kind === 'servo' ? bar : h('span', { class: 'hint', text: d.kind === 'imu' ? 'heading' : d.kind === 'camera' ? 'tags in view' : 'distance' });
    tb.append(h('tr', null, h('td', { class: 'mono', text: d.name }), h('td', null, out), val));
    hwRows.push({ d, fill, val, dev: (world.device(d.name) || {}).dev });
  });
}
function updateHw() {
  hwRows.forEach((r) => {
    if (r.d.kind === 'motor' && r.dev) {
      const u = BBZ.clamp(r.dev.u, -1, 1);
      r.fill.style.left = (u >= 0 ? 50 : 50 + u * 50) + '%'; r.fill.style.width = Math.abs(u) * 50 + '%';
      r.val.textContent = r.dev.position() + ' ticks';
    } else if (r.d.kind === 'servo' && r.dev) {
      r.fill.style.left = '0'; r.fill.style.width = r.dev.actual * 100 + '%';
      r.val.textContent = r.dev.actual.toFixed(2);
    } else if (r.d.kind === 'imu') r.val.textContent = world.yawDeg().toFixed(1) + '°';
    else if (r.d.kind === 'distance') r.val.textContent = world.distanceIn().toFixed(1) + ' in';
    else if (r.d.kind === 'camera') { const seen = world.tagDetections(); r.val.textContent = seen.length ? 'ID ' + seen.map((t) => t.id).join(', ') : 'none'; }
  });
}
const PHASE = { idle: 'READY', practice: 'PRACTICE', autotest: 'AUTO TEST', auto: 'AUTO', transition: 'PAUSE', teleop: 'TELEOP', over: 'FINAL' };
let lastHeld = '';
const heard = { endgame: false, beep: 0 };
function updateHud() {
  const s = world.score();
  $('phase').textContent = world.mode === 'teleop' && world.clock <= 60 ? 'ENDGAME' : PHASE[world.mode];
  let clock = '–:––';
  if (world.mode === 'auto' || world.mode === 'transition' || world.mode === 'teleop') { const t = Math.max(0, Math.ceil(world.clock)); clock = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
  else if (world.mode === 'over') clock = '0:00';
  $('clock').textContent = clock;
  $('score').textContent = String(s.total);
  $('tips').textContent = String(s.tips);
  const heldKey = world.robot.held.map((b) => b.type).join('');
  if (heldKey !== lastHeld || !$('held').childNodes.length) {
    lastHeld = heldKey;
    const el = $('held'); el.textContent = '';
    for (let i = 0; i < 4; i++) el.append(h('i', { class: 'dot ' + (heldKey[i] ? 'dot-' + heldKey[i] : 'dot-none') }));
  }
  if (tele.dirty) {
    tele.dirty = false;
    $('telemetry').textContent = tele.shown === null ? 'Nothing yet. Use telemetry.addData(...) then telemetry.update().' : (tele.shown.join('\n') || '(empty)');
  }
  updateHw();
  const tb = $('scoreBody'); tb.textContent = '';
  s.items.forEach((it) => tb.append(h('tr', null, h('td', { text: it.label }), h('td', { class: 'num', text: it.n + ' × ' + it.each }), h('td', { class: 'num', text: String(it.pts) }))));
  tb.append(h('tr', { class: 'total' }, h('td', { text: 'Total' }), h('td'), h('td', { class: 'num', text: String(s.total) })));
  $('scoreHint').textContent = world.mode === 'over' ? 'Final' : 'If the match ended now';
  $('rpHint').textContent = 'Tips: ' + s.tips + ' (4 earns POLLINATOR 1, 7 earns POLLINATOR 2). LEAVE + PARK points: ' + s.swarm + ' of the 16 your alliance needs for SWARM.' +
    (world.fouls ? ' Fouls a referee would call: ' + world.fouls + '.' : '');
  if (world.events.length) world.events.splice(0).forEach((ev) => { addLog(ev.kind, ev.text); if (ev.text.indexOf('HIVE TIP') === 0) sfx('tip'); else if (ev.kind === 'foul') sfx('error'); });
  if (world.endgame && !heard.endgame) sfx('endgame');
  heard.endgame = world.endgame;
  const beep = world.mode === 'transition' ? Math.ceil(world.clock) : 0;
  if (beep && beep <= 3 && beep !== heard.beep) sfx('count');
  heard.beep = beep;
}

/* ---------- gamepad input ---------- */
const keys = Object.create(null), vbtn = Object.create(null), vstick = { lx: 0, ly: 0, rx: 0, ry: 0 };
const KEYMAP = { KeyQ: 'left_bumper', KeyE: 'right_bumper', KeyZ: 'left_trigger', KeyC: 'right_trigger', KeyK: 'a', KeyL: 'b', KeyJ: 'x', KeyI: 'y',
  KeyT: 'dpad_up', KeyG: 'dpad_down', KeyF: 'dpad_left', KeyH: 'dpad_right' };
const DRIVE_KEYS = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };
const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
/* Reads up to two controllers: the first is gamepad1 and the second is gamepad2. */
const padPair = [pad, pad2];
let screenTo = 0, swapPads = false, padSeen = '';
const HW_BUTTONS = ['a', 'b', 'x', 'y', 'left_bumper', 'right_bumper', null, null, 'back', 'start', 'left_stick_button', 'right_stick_button', 'dpad_up', 'dpad_down', 'dpad_left', 'dpad_right', 'guide', 'touchpad'];
function readControllers() {
  const found = [];
  try {
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < gps.length && found.length < 2; i++) {
      const g = gps[i];
      if (!g || !g.connected || !g.buttons || g.buttons.length < 10 || !g.axes || g.axes.length < 4) continue;
      const dz = (v) => Math.abs(v) < 0.08 ? 0 : v, s = { name: String(g.id || 'Controller').replace(/\s*\(.*$/, '').slice(0, 36) || 'Controller', b: {} };
      s.lx = dz(g.axes[0] || 0); s.ly = dz(g.axes[1] || 0); s.rx = dz(g.axes[2] || 0); s.ry = dz(g.axes[3] || 0);
      s.lt = g.buttons[6] ? g.buttons[6].value || 0 : 0; s.rt = g.buttons[7] ? g.buttons[7].value || 0 : 0;
      HW_BUTTONS.forEach((n, j) => { if (n && g.buttons[j] && g.buttons[j].pressed) s.b[n] = true; });
      found.push(s);
    }
  } catch (e) { /* the Gamepad API can be blocked; keyboard and on-screen controls still work */ }
  if (swapPads && found.length === 2) found.reverse();
  return found;
}
function showControllers(found) {
  const key = found.map((f) => f.name).join('|') + '/' + screenTo + '/' + swapPads;
  if (key === padSeen) return;
  padSeen = key;
  const el = $('padStatus');
  if (el) el.textContent = found.length
    ? found.map((f, i) => 'Controller ' + (i + 1) + ' (' + f.name + ') is gamepad' + (i + 1)).join('. ') + '.' + (found.length < 2 ? ' Connect a second one and press a button on it for gamepad2.' : '')
    : 'No controller found yet. Plug one in or pair it, then press any button on it. The first one becomes gamepad1 and the second gamepad2.';
  document.querySelectorAll('[data-pt]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.pt === screenTo)));
  const sw = $('btnSwapPads'); if (sw) sw.disabled = found.length < 2;
}
function pollPad() {
  const k = (c) => keys[c] ? 1 : 0;
  const scr = { lx: k('KeyD') - k('KeyA') + vstick.lx, ly: k('KeyS') - k('KeyW') + vstick.ly, rx: k('ArrowRight') - k('ArrowLeft') + vstick.rx, ry: k('ArrowDown') - k('ArrowUp') + vstick.ry, b: {} };
  Object.keys(KEYMAP).forEach((c) => { if (keys[c]) scr.b[KEYMAP[c]] = true; });
  Object.keys(vbtn).forEach((n) => { if (vbtn[n]) scr.b[n] = true; });
  scr.lt = scr.b.left_trigger ? 1 : 0; scr.rt = scr.b.right_trigger ? 1 : 0;
  const found = readControllers();
  const live = !(world.mode === 'auto' || world.mode === 'transition' || world.mode === 'autotest');
  const c1 = (v) => BBZ.clamp(v, -1, 1);
  let lit = scr.b;
  for (let i = 0; i < 2; i++) {
    const a = i === screenTo ? scr : null, h = found[i] || null, p = padPair[i];
    const sum = (key) => (a ? a[key] : 0) + (h ? h[key] : 0), b = Object.assign({}, a ? a.b : null, h ? h.b : null);
    p.left_stick_x = live ? c1(sum('lx')) : 0; p.left_stick_y = live ? c1(sum('ly')) : 0;
    p.right_stick_x = live ? c1(sum('rx')) : 0; p.right_stick_y = live ? c1(sum('ry')) : 0;
    p.left_trigger = live ? Math.max(a ? a.lt : 0, h ? h.lt : 0) : 0; p.right_trigger = live ? Math.max(a ? a.rt : 0, h ? h.rt : 0) : 0;
    PAD_KEYS.forEach((n) => { if (!ANALOG[n]) p[n] = live && b[n] === true; });
    if (i === screenTo) { lit = b; if (h) { if (h.lt > 0.5) lit.left_trigger = true; if (h.rt > 0.5) lit.right_trigger = true; } }
  }
  document.querySelectorAll('.pb').forEach((el) => { el.classList.toggle('is-down', lit[el.dataset.pad] === true); });
  showControllers(found);
}
function wireInput() {
  document.querySelectorAll('[data-pt]').forEach((b) => b.addEventListener('click', () => { screenTo = +b.dataset.pt === 1 ? 1 : 0; padSeen = ''; }));
  if ($('btnSwapPads')) $('btnSwapPads').addEventListener('click', () => { swapPads = !swapPads; padSeen = ''; notify(swapPads ? 'Swapped: the second controller is now gamepad1.' : 'Back to normal: the first controller is gamepad1.'); });
  window.addEventListener('gamepadconnected', () => { padSeen = ''; });
  window.addEventListener('gamepaddisconnected', () => { padSeen = ''; });
  window.addEventListener('keydown', (e) => {
    if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (KEYMAP[e.code] || DRIVE_KEYS[e.code]) { keys[e.code] = true; if (!$('view-drive').hidden) e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => { delete keys[e.code]; });
  window.addEventListener('blur', () => { Object.keys(keys).forEach((c) => { delete keys[c]; }); });
  document.querySelectorAll('.pb').forEach((el) => {
    const n = el.dataset.pad;
    const up = () => { vbtn[n] = false; };
    el.addEventListener('pointerdown', (e) => { vbtn[n] = true; try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } e.preventDefault(); });
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    el.addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code === 'Enter') { vbtn[n] = true; e.preventDefault(); } });
    el.addEventListener('keyup', up); el.addEventListener('blur', up);
  });
  const stick = (el, ax, ay) => {
    const knob = el.querySelector('.knob');
    let active = false;
    const set = (e) => {
      const r = el.getBoundingClientRect(), R = r.width / 2;
      let x = (e.clientX - r.left - R) / (R * 0.7), y = (e.clientY - r.top - R) / (R * 0.7);
      const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
      vstick[ax] = x; vstick[ay] = y;
      knob.style.transform = 'translate(' + (x * R * 0.55) + 'px,' + (y * R * 0.55) + 'px)';
    };
    const end = () => { active = false; vstick[ax] = 0; vstick[ay] = 0; knob.style.transform = ''; };
    el.addEventListener('pointerdown', (e) => { active = true; try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } set(e); e.preventDefault(); });
    el.addEventListener('pointermove', (e) => { if (active) set(e); });
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
  };
  stick($('stickL'), 'lx', 'ly'); stick($('stickR'), 'rx', 'ry');
}

/* ---------- program editor (laid out like the FTC Robot Controller programming pages) ---------- */
function fillSelect(sel, items, value) {
  sel.textContent = '';
  items.forEach((it) => sel.append(h('option', { value: String(it[0]) }, it[1])));
  sel.value = String(value);
}
/* Keeps every group's op modes next to each other, in the order the groups first appear. */
function normalise() {
  const order = [];
  state.programs.forEach((p) => { if (order.indexOf(p.group) < 0) order.push(p.group); });
  state.programs = state.programs.map((p, i) => ({ p, i })).sort((a, b) => (order.indexOf(a.p.group) - order.indexOf(b.p.group)) || (a.i - b.i)).map((x) => x.p);
}
/* Runs a change to the op mode list, then points "open" and the match picks back at the same op modes. */
function withPrograms(fn) {
  const ids = [openProg(), state.programs[state.auto], state.programs[state.tele]].map((p) => (p ? p.id : -1));
  fn();
  normalise();
  const at = (id) => state.programs.findIndex((p) => p.id === id);
  state.open = Math.max(0, at(ids[0])); state.auto = at(ids[1]); state.tele = at(ids[2]);
  fixMatchPicks(); renderProgramLists(); save();
}
function fromExample(ex) {
  const p = { id: pid++, name: ex.name, lang: ex.lang, mode: ex.mode, group: 'Examples', desc: ex.desc,
    code: ex.lang === 'java' ? ex.make() : '', blocks: ex.lang === 'blocks' ? BBZ.Blocks.sanitize(ex.make()) : [], ex: ex.id, sig: '' };
  p.sig = sigOf(p);
  return p;
}
function matchList(sel, mode, value) {
  sel.textContent = '';
  sel.append(h('option', { value: '-1' }, 'None'));
  let cur = null, grp = null;
  state.programs.forEach((p, i) => {
    if (p.mode !== mode) return;
    if (p.group !== cur) { cur = p.group; grp = h('optgroup', { label: cur }); sel.append(grp); }
    grp.append(h('option', { value: String(i) }, p.name + (p.lang === 'blocks' ? ' (Blocks)' : '')));
  });
  sel.value = String(value);
}
function orderButtons(noUp, noDown, up, down, what) {
  return h('span', { class: 'ord' },
    h('button', { type: 'button', disabled: noUp, title: 'Move up', 'aria-label': 'Move ' + what + ' up', onclick: up }, '▲'),
    h('button', { type: 'button', disabled: noDown, title: 'Move down', 'aria-label': 'Move ' + what + ' down', onclick: down }, '▼'));
}
const lastOpen = { java: -1, blocks: -1 };
function openById(id) {
  const i = state.programs.findIndex((p) => p.id === id);
  if (i < 0) return;
  state.open = i; renderProgramLists(); renderEditor(); save();
}
/* Moves all of group `a` so it sits just before group `b`. */
function moveGroup(a, b) {
  withPrograms(() => {
    const block = state.programs.filter((p) => p.group === a), rest = state.programs.filter((p) => p.group !== a);
    const i = rest.findIndex((p) => p.group === b);
    if (i < 0) return;
    state.programs = rest.slice(0, i).concat(block, rest.slice(i));
  });
}
function swapProg(p, q) {
  withPrograms(() => {
    const i = state.programs.indexOf(p), j = state.programs.indexOf(q);
    if (i < 0 || j < 0) return;
    state.programs[i] = q; state.programs[j] = p;
  });
}
function renderProgramLists() {
  const cur = openProg(), lang = cur ? cur.lang : 'java';
  $('tabBlocks').setAttribute('aria-selected', String(lang === 'blocks'));
  $('tabJava').setAttribute('aria-selected', String(lang === 'java'));
  $('opTitle').textContent = lang === 'blocks' ? 'My Blocks Op Modes' : 'My OnBotJava Op Modes';
  const tb = $('opBody'); tb.textContent = '';
  const mine = state.programs.filter((p) => p.lang === lang), groups = [];
  mine.forEach((p) => { if (groups.indexOf(p.group) < 0) groups.push(p.group); });
  groups.forEach((g, gi) => {
    const rows = mine.filter((p) => p.group === g);
    tb.append(h('tr', { class: 'op-group' },
      h('td', null, orderButtons(gi === 0, gi === groups.length - 1, () => moveGroup(g, groups[gi - 1]), () => moveGroup(groups[gi + 1], g), 'group ' + g)),
      h('td', { colspan: '3' }, h('b', { text: 'Group: ' + g }), h('span', { class: 'hint', text: '   ' + rows.length + (rows.length === 1 ? ' op mode' : ' op modes') }))));
    rows.forEach((p, ri) => {
      const open = p === cur;
      tb.append(h('tr', { class: 'op-row' + (open ? ' is-open' : '') },
        h('td', null, orderButtons(ri === 0, ri === rows.length - 1, () => swapProg(p, rows[ri - 1]), () => swapProg(p, rows[ri + 1]), p.name)),
        h('td', null, h('button', { type: 'button', class: 'op-name', 'aria-current': open ? 'true' : null, onclick: () => openById(p.id) }, p.name)),
        h('td', null, h('span', { class: 'op-pill ' + p.mode, text: p.mode === 'auto' ? 'Autonomous' : 'TeleOp' })),
        h('td', { class: 'op-desc', text: p.desc || '(no description yet)' })));
    });
  });
  matchList($('autoSel'), 'auto', state.auto);
  matchList($('teleSel'), 'teleop', state.tele);
  const dl = $('groupList'); dl.textContent = '';
  const all = [];
  state.programs.forEach((p) => { if (all.indexOf(p.group) < 0) all.push(p.group); });
  all.forEach((g) => dl.append(h('option', { value: g })));
}
function renderExamples() {
  const tb = $('exBody');
  if (!tb) return;
  tb.textContent = '';
  BBZ.Samples.list(state.robot).forEach((ex) => {
    const add = ex.why ? h('span', { class: 'hint', text: ex.why }) : h('button', { type: 'button', class: 'rc-btn', 'aria-label': 'Add ' + ex.name, onclick: () => addExample(ex.id) }, 'Add');
    tb.append(h('tr', null,
      h('td', null, h('b', { text: ex.name })),
      h('td', null, h('span', { class: 'op-pill ' + ex.lang, text: ex.lang === 'java' ? 'Java' : 'Blocks' }), ' ', h('span', { class: 'op-pill ' + ex.mode, text: ex.mode === 'auto' ? 'Autonomous' : 'TeleOp' })),
      h('td', { class: 'op-desc', text: ex.desc }),
      h('td', null, add)));
  });
}
function updateGutter() {
  const n = Math.min(5000, $('code').value.split('\n').length);
  let s = '';
  for (let i = 1; i <= n; i++) s += i + '\n';
  $('gutter').textContent = s;
  $('gutter').scrollTop = $('code').scrollTop;
}
function refreshGenJava() {
  const p = openProg(), pre = $('genJava');
  if (!p || p.lang !== 'blocks' || pre.hidden) return;
  try { pre.textContent = BBZ.Blocks.generate(p, state.robot); }
  catch (e) { pre.textContent = '// These blocks cannot be turned into Java yet:\n// ' + e.message; }
}
const blocksApi = { changed() { save(); refreshGenJava(); }, notify };
function setFilePath(p) {
  $('filePath').textContent = p.lang === 'java' ? 'TeamCode / org.firstinspires.ftc.teamcode / ' + BBZ.Blocks.className(p.name) + '.java' : 'Blocks / ' + p.name + '.blk';
}
function renderEditor() {
  const p = openProg();
  if (!p) return;
  lastOpen[p.lang] = p.id;
  $('progName').value = p.name; $('modeSel').value = p.mode; $('progGroup').value = p.group; $('progDesc').value = p.desc;
  setFilePath(p);
  const java = p.lang === 'java';
  $('javaPane').hidden = !java; $('blocksPane').hidden = java;
  if (java) { $('code').value = p.code; $('code').scrollTop = 0; updateGutter(); }
  else { BBZ.Blocks.resetCursor(); BBZ.Blocks.render($('blocksRoot'), p, state.robot, blocksApi); refreshGenJava(); }
  placeErrLine();
  try { window.dispatchEvent(new Event('bbz-editor')); } catch (e) { /* ignore */ }
}
const BLANK_JAVA = ['package org.firstinspires.ftc.teamcode;', '', 'import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;', 'import com.qualcomm.robotcore.eventloop.opmode.TeleOp;', '',
  '@TeleOp(name = "My OpMode")', 'public class MyOpMode extends LinearOpMode {', '', '    @Override', '    public void runOpMode() {',
  '        // Set up your motors and servos here.', '', '        telemetry.addData("Status", "Ready");', '        telemetry.update();', '', '        waitForStart();', '',
  '        while (opModeIsActive()) {', '            // Your code runs here over and over.', '', '            telemetry.update();', '        }', '    }', '}', ''].join('\n');
function pushProgram(p) {
  if (state.programs.length >= MAX_PROGRAMS) { notify('You can keep up to ' + MAX_PROGRAMS + ' op modes. Delete one first.'); return; }
  let name = cleanName(p.name), k = 2;
  while (state.programs.some((x) => x.name === name)) name = cleanName(p.name).slice(0, 36) + ' ' + (k++);
  p.name = name; p.id = pid++; p.group = cleanGroup(p.group); p.desc = cleanDesc(p.desc);
  withPrograms(() => { state.programs.push(p); });
  openById(p.id);
  notify('Added "' + name + '".');
}
function addBlank(lang) {
  pushProgram(lang === 'java'
    ? { name: 'My OpMode', lang: 'java', mode: 'teleop', group: 'My Op Modes', desc: '', code: BLANK_JAVA, blocks: [] }
    : { name: 'My Blocks', lang: 'blocks', mode: 'teleop', group: 'My Op Modes', desc: '', code: '', blocks: BBZ.Blocks.blank() });
}
function addExample(id) {
  const ex = BBZ.Samples.list(state.robot).find((e) => e.id === id);
  if (!ex || ex.why) return;
  pushProgram(fromExample(ex));
}
function showLang(lang) {
  const cur = openProg();
  if (cur && cur.lang === lang) return;
  const back = state.programs.find((p) => p.id === lastOpen[lang]) || state.programs.find((p) => p.lang === lang);
  if (back) openById(back.id); else addBlank(lang);
}
let delArmed = 0;
function wireEditor() {
  $('tabBlocks').addEventListener('click', () => showLang('blocks'));
  $('tabJava').addEventListener('click', () => showLang('java'));
  $('btnNewBlocks').addEventListener('click', () => addBlank('blocks'));
  $('btnNewJava').addEventListener('click', () => addBlank('java'));
  $('btnExamples').addEventListener('click', () => {
    const panel = $('exPanel'); panel.hidden = !panel.hidden;
    $('btnExamples').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) renderExamples();
  });
  $('btnCopyOp').addEventListener('click', () => {
    const p = openProg(); if (!p) return;
    pushProgram({ name: p.name + ' copy', lang: p.lang, mode: p.mode, group: p.group, desc: p.desc, code: p.code, blocks: BBZ.Blocks.sanitize(p.blocks) });
  });
  $('progName').addEventListener('input', (e) => { const p = openProg(); if (!p) return; p.name = cleanName(e.target.value, 'My program'); renderProgramLists(); setFilePath(p); refreshGenJava(); save(); });
  $('progName').addEventListener('blur', (e) => { const p = openProg(); if (p) e.target.value = p.name; });
  $('progGroup').addEventListener('change', (e) => { const p = openProg(); if (!p) return; withPrograms(() => { p.group = cleanGroup(e.target.value); }); e.target.value = p.group; refreshGenJava(); });
  $('progDesc').addEventListener('input', (e) => { const p = openProg(); if (!p) return; p.desc = cleanDesc(e.target.value); save(); });
  $('progDesc').addEventListener('change', () => renderProgramLists());
  $('modeSel').addEventListener('change', (e) => { const p = openProg(); if (!p) return; p.mode = e.target.value === 'auto' ? 'auto' : 'teleop'; fixMatchPicks(); renderProgramLists(); refreshGenJava(); save(); });
  $('autoSel').addEventListener('change', (e) => { state.auto = +e.target.value; save(); });
  $('teleSel').addEventListener('change', (e) => { state.tele = +e.target.value; save(); });
  $('btnDelete').addEventListener('click', () => {
    if (state.programs.length <= 1) { notify('Keep at least one op mode.'); return; }
    const btn = $('btnDelete');
    if (Date.now() > delArmed) { delArmed = Date.now() + 3500; btn.textContent = 'Click again to delete'; setTimeout(() => { btn.textContent = 'Delete Selected'; }, 3500); return; }
    delArmed = 0; btn.textContent = 'Delete Selected';
    const gone = openProg();
    if (!gone) return;
    if (runProg === gone) stopAll();
    withPrograms(() => { state.programs = state.programs.filter((p) => p !== gone); });
    openById((state.programs.find((p) => p.lang === gone.lang) || state.programs[0]).id);
    notify('Deleted "' + gone.name + '".');
  });
  const ta = $('code');
  ta.addEventListener('input', () => {
    const p = openProg(); if (!p || p.lang !== 'java') return;
    if (ta.value.length > MAX_CODE) { ta.value = ta.value.slice(0, MAX_CODE); notify('That is the longest a program can be here.'); }
    p.code = ta.value; updateGutter(); save();
    if (errInfo && errInfo.progId === p.id) { errInfo = null; placeErrLine(); }
  });
  ta.addEventListener('scroll', () => { $('gutter').scrollTop = ta.scrollTop; placeErrLine(); });
  ta.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    e.preventDefault();
    const s = ta.selectionStart, en = ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + '    ' + ta.value.slice(en);
    ta.selectionStart = ta.selectionEnd = s + 4;
    ta.dispatchEvent(new Event('input'));
  });
  $('btnViewJava').addEventListener('click', () => {
    const pre = $('genJava'); pre.hidden = !pre.hidden;
    $('btnViewJava').setAttribute('aria-expanded', String(!pre.hidden));
    $('btnViewJava').textContent = pre.hidden ? 'Show the Java these blocks make' : 'Hide the Java';
    refreshGenJava();
  });
  $('btnToJava').addEventListener('click', () => {
    const p = openProg(); if (!p || p.lang !== 'blocks') return;
    let code;
    try { code = BBZ.Blocks.generate(p, state.robot); } catch (e) { showError(e, p); return; }
    pushProgram({ name: p.name + ' (Java)', lang: 'java', mode: p.mode, group: p.group, desc: p.desc, code, blocks: [] });
  });
}

/* ---------- driver station ---------- */
function renderStation() {
  const c = state.robot;
  $('allianceRed').setAttribute('aria-pressed', String(c.alliance === 'red'));
  $('allianceBlue').setAttribute('aria-pressed', String(c.alliance === 'blue'));
  fillSelect($('startSel'), Object.keys(BBZ.START_SPOTS).map((k) => [k, BBZ.START_SPOTS[k].label]), c.start);
  document.querySelectorAll('.speed').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.s === state.speed)));
}
function wireStation() {
  $('btnRun').addEventListener('click', runOpen);
  $('btnMatch').addEventListener('click', runMatch);
  $('btnStop').addEventListener('click', stopAll);
  $('btnReset').addEventListener('click', resetField);
  const side = (a) => () => { state.robot.alliance = a; applyRobot(false); };
  $('allianceRed').addEventListener('click', side('red'));
  $('allianceBlue').addEventListener('click', side('blue'));
  $('startSel').addEventListener('change', (e) => { state.robot.start = e.target.value; applyRobot(false); });
  document.querySelectorAll('.speed').forEach((b) => b.addEventListener('click', () => { state.speed = +b.dataset.s || 1; renderStation(); save(); }));
}

/* ---------- build bot ---------- */
/* Example op modes nobody has edited are rewritten whenever the bot changes, so they always fit its parts and names. */
function refreshExamples() {
  let list = null, n = 0;
  state.programs.forEach((p) => {
    if (!isPure(p)) return;
    list = list || BBZ.Samples.list(state.robot);
    const ex = list.find((e) => e.id === p.ex);
    if (!ex || ex.why) return;
    try {
      if (ex.lang === 'java') p.code = ex.make(); else p.blocks = BBZ.Blocks.sanitize(ex.make());
      p.desc = ex.desc; p.sig = sigOf(p); n++;
    } catch (e) { /* keep the old copy if the example cannot be rebuilt */ }
  });
  return n;
}
function applyRobot(rerenderBuild) {
  state.robot = BBZ.sanitizeRobot(state.robot);
  BBZ.Blocks.useRobot(state.robot);
  endOpMode(); matchOn = false;
  world = new BBZ.World(state.robot);
  refreshExamples();
  clearLog(); rebuildHw(); renderStation(); renderExamples();
  tele.pending = []; tele.shown = null; tele.dirty = true;
  setStatus('Field reset for your bot. Pick a program and press Run.');
  if (rerenderBuild !== false) renderBuild();
  else { drawPreview(); renderChecks(); }
  renderProgramLists();
  const p = openProg();
  if (p && p.lang === 'blocks') { BBZ.Blocks.render($('blocksRoot'), p, state.robot, blocksApi); refreshGenJava(); }
  else if (p && $('code').value !== p.code) { $('code').value = p.code; updateGutter(); try { window.dispatchEvent(new Event('bbz-editor')); } catch (e) { /* ignore */ } }
  save();
}
/* Where each device would plug in on a real Control Hub, to make the table read like the Configure Robot screen. */
function portOf(d, i, kindIndex) {
  if (d.kind === 'motor') return kindIndex < 4 ? 'Control Hub motor ' + kindIndex : 'Expansion Hub motor ' + (kindIndex - 4);
  if (d.kind === 'servo') return 'Control Hub servo ' + kindIndex;
  if (d.kind === 'imu') return 'I2C bus 0 (built in)';
  if (d.kind === 'distance') return 'I2C bus 1';
  return 'USB';
}
const TYPE_LABEL = { motor: 'DcMotor', servo: 'Servo', imu: 'IMU', distance: 'DistanceSensor', camera: 'Webcam' };
/* Changes a device name everywhere it is used: Java text and the dropdowns inside saved Blocks programs. */
function renameEverywhere(from, to) {
  const re = new RegExp('(^|[^A-Za-z0-9_])' + from + '(?![A-Za-z0-9_])', 'g');
  let n = 0;
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (o.fields && typeof o.fields === 'object') Object.keys(o.fields).forEach((k) => { if (k.indexOf('DEVICE') === 0 && o.fields[k] === from) { o.fields[k] = to; n++; } });
    Object.keys(o).forEach((k) => { if (k !== 'fields') walk(o[k]); });
  };
  state.programs.forEach((p) => {
    if (isPure(p)) return;                                   // untouched examples are rebuilt from scratch instead
    if (p.lang === 'java') { const next = p.code.replace(re, (m, a) => { n++; return a + to; }); p.code = next.slice(0, MAX_CODE); }
    else walk(p.blocks);
  });
  return n;
}
function renderChecks() {
  const c = state.robot, devs = BBZ.deviceList(c), motors = devs.filter((d) => d.kind === 'motor').length, servos = devs.filter((d) => d.kind === 'servo').length;
  const speed = BBZ.topSpeed(c);
  const ul = $('checks'); ul.textContent = '';
  const li = (pill, cls, text) => ul.append(h('li', null, h('span', { class: 'pill' + (cls ? ' ' + cls : ''), text: pill }), h('span', { text })));
  li('OK', '', motors + ' of 8 motors used (rule R503).');
  li('OK', '', servos + ' of 8 servos used (rule R503).');
  li('OK', '', 'Starting size ' + c.width + ' × ' + c.length + ' in fits the 18 in cube (rule R102).');
  li('INFO', 'info', BBZ.DRIVES[c.drive].label + ' drive: top speed about ' + speed.toFixed(0) + ' in/s (' + (speed / 12).toFixed(1) + ' ft/s). ' + BBZ.ticksPerInch(c).toFixed(1) + ' encoder ticks per inch.');
  const claw = c.tools.intake && c.kit.intake === 'claw';
  li('INFO', 'info', 'Carries up to 4 pieces at a time (rule G407).' + (c.tools.intake ? (claw ? ' A claw bot starts with 3 so the claw has room for one more.' : '') : ' With no intake it can only use its 4 pre-loaded POLLEN.'));
  if (c.tools.intake) li('INFO', 'info', BBZ.KITS.intake[c.kit.intake].label + ' on the ' + BBZ.FACE_NAME[c.layout.intake.face] + '.');
  if (c.tools.launcher) li('INFO', 'info', BBZ.KITS.launcher[c.kit.launcher].label + ' shooting out of the ' + BBZ.FACE_NAME[c.layout.launcher.face] + '.' + (c.layout.launcher.face ? ' Your code must turn that side toward the target.' : ''));
  if (c.tools.lift) li('INFO', 'info', BBZ.KITS.lift[c.kit.lift].label + ': reaches ' + BBZ.liftMax(c) + ' in, ' + BBZ.liftTicksPerInch(c).toFixed(1) + ' ticks per inch. Pieces drop off the ' + BBZ.FACE_NAME[c.layout.lift.face] + '.');
  if (!c.tools.launcher && !c.tools.lift) li('INFO', 'info', 'With no shooter and no lift, this bot can only push or carry pieces and park.');
}

/* The preview is also the layout editor, where parts are picked and dragged. */
let pickKey = '', dragKey = '';
const PREVIEW_SPAN = 26;                                    // inches shown across the preview
function drawBot(cv, cfg, pick, label) {
  if (!col) readColors();
  const ctx = cv.getContext('2d'), px = cv.width, k = px / PREVIEW_SPAN;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = col.tile; ctx.fillRect(0, 0, px, px);
  ctx.setTransform(k, 0, 0, -k, px / 2, px / 2);
  ctx.strokeStyle = col.tileLine; ctx.lineWidth = 0.15; ctx.setLineDash([0.6, 0.6]); ctx.strokeRect(-9, -9, 18, 18); ctx.setLineDash([]);
  ctx.rotate(Math.PI / 2);
  BBZ.drawRobot(ctx, cfg, { held: ['P', 'P', 'P'], lift: 8, spin: 0.6, roll: 0, claw: 0.2, cata: 0 }, col, pick);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (label) { ctx.fillStyle = col.tileText; ctx.font = '600 ' + Math.round(px / 30) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('FRONT', px / 2, px / 24); }
}
/* The big picture shows either a 3D model you can turn, or the flat top view where parts are dragged about. */
let view3d = true, turning = false, spinRaf = 0, spinAt = 0;
const mainView = { yaw: -0.9, pitch: 0.62 };
const has3d = () => !!(BBZ.Bot3D && view3d);
function drawPreview() {
  if (has3d()) { if (!col) readColors(); BBZ.Bot3D.draw($('preview'), state.robot, { yaw: mainView.yaw, pitch: mainView.pitch, pick: pickKey, label: true, colors: col }); }
  else drawBot($('preview'), state.robot, pickKey, true);
}
/* The 3D model turns slowly by itself while the Build Bot tab is open. */
let calmMotion = false;
try { calmMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { calmMotion = false; }
function spinTick(ts) {
  spinRaf = 0;
  if (!has3d() || calmMotion || turning || $('view-build').hidden || document.hidden) return;
  if (ts - spinAt >= 33) { mainView.yaw -= Math.min(0.1, (ts - spinAt) / 1000) * 0.22; spinAt = ts; drawPreview(); }
  spinRaf = window.requestAnimationFrame(spinTick);
}
function startSpin() { if (!spinRaf && has3d() && !calmMotion) { spinAt = window.performance.now(); spinRaf = window.requestAnimationFrame(spinTick); } }
function setViewMode(on) {
  view3d = on;
  document.querySelectorAll('[data-vm]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.vm === '3d') === on)));
  $('preview').style.cursor = on ? 'grab' : 'default';
  describePick(); drawPreview(); startSpin();
}
/* A small 3D picture that can be turned by dragging it. */
function mini3d(cv, cfg, only) {
  if (!BBZ.Bot3D) { drawBot(cv, cfg, '', false); return; }
  const view = { yaw: -0.9, pitch: 0.6 };
  const paint = () => { if (!col) readColors(); BBZ.Bot3D.draw(cv, cfg, { yaw: view.yaw, pitch: view.pitch, only, colors: col }); };
  BBZ.Bot3D.orbit(cv, view, paint);
  paint();
}
/* Turns a pointer position on the preview into robot inches (+x front, +y left). */
function previewPoint(e) {
  const cv = $('preview'), r = cv.getBoundingClientRect(), k = r.width / PREVIEW_SPAN;
  const X = (e.clientX - r.left - r.width / 2) / k, Y = -(e.clientY - r.top - r.height / 2) / k;
  return { x: Y, y: -X };
}
function partAt(pt) {
  const c = state.robot;
  let best = '', bd = 1e9;
  BBZ.partList(c).forEach((p) => {
    let d;
    if (p.edge) {
      const a = p.face * Math.PI / 2, along = -(pt.x - p.x) * Math.sin(a) + (pt.y - p.y) * Math.cos(a), out = (pt.x - p.x) * Math.cos(a) + (pt.y - p.y) * Math.sin(a);
      const span = (p.face % 2 === 0 ? c.width : c.length) / 2;
      d = (Math.abs(along) < span && out > -2 && out < 3.4) ? Math.abs(out) : 1e9;
    } else { d = Math.hypot(pt.x - p.x, pt.y - p.y); if (d > p.r + 1.2) d = 1e9; }
    if (d < bd) { bd = d; best = p.key; }
  });
  return best;
}
function movePart(key, pt) {
  const c = state.robot, L = c.layout[key], hl = c.length / 2, hw = c.width / 2;
  if (BBZ.PARTS[key].edge) L.face = Math.abs(pt.x) / hl >= Math.abs(pt.y) / hw ? (pt.x >= 0 ? 0 : 2) : (pt.y >= 0 ? 1 : 3);
  else { L.u = BBZ.clamp(pt.x / Math.max(1, hl - 2.6), -1, 1); L.v = BBZ.clamp(pt.y / Math.max(1, hw - 3.4), -1, 1); }
}
function describePick() {
  const c = state.robot, msg = $('layoutMsg'), P = BBZ.PARTS[pickKey];
  $('btnTurnPart').disabled = !(P && P.turns);
  if (has3d()) {
    msg.textContent = (P ? P.label + ' is outlined in yellow' + (P.turns ? ' and points out of the ' + BBZ.FACE_NAME[c.layout[pickKey].face] + '. ' : '. ') : 'Drag the picture to look at your robot from any side. ') +
      'To move a part, switch to Top view' + (P ? ', or use the arrow keys.' : '.');
    return;
  }
  if (!P) { msg.textContent = 'Click a part in the picture, or pick one from the list, then drag it where you want it.'; return; }
  const L = c.layout[pickKey];
  msg.textContent = P.label + ' selected' + (P.turns ? ', pointing out of the ' + BBZ.FACE_NAME[L.face] + '.' : '.') +
    (P.edge ? ' Drag it to another side of the robot.' : ' Drag it, or use the arrow keys.') + (P.turns ? ' Turn changes the way it points.' : '');
}
function renderPartButtons() {
  const box = $('partList'); box.textContent = '';
  BBZ.partList(state.robot).forEach((p) => box.append(h('button', { type: 'button', 'aria-pressed': String(p.key === pickKey), onclick: () => { pickKey = p.key; renderPartButtons(); describePick(); drawPreview(); } }, p.label)));
}
function renderPresets() {
  const box = $('presetList'); box.textContent = '';
  BBZ.PRESETS.forEach((p) => {
    const cv = h('canvas', { width: 260, height: 260, role: 'img', 'aria-label': '3D view of ' + p.name + '. Drag to turn it.' });
    box.append(h('div', { class: 'preset' }, cv,
      h('b', { text: p.name }), h('span', { class: 'cat-chip', text: p.style }), h('span', { class: 'hint', text: p.blurb }),
      h('button', { type: 'button', class: 'btn btn-small', 'aria-label': 'Use ' + p.name, onclick: () => {
        state.robot = BBZ.presetRobot(p.id, state.robot.alliance); pickKey = '';
        applyRobot(); notify('Loaded "' + p.name + '". Change anything you like, it is your bot now.');
        try { $('view-build').scrollIntoView({ block: 'start' }); } catch (e) { /* ignore */ }
      } }, 'Use this bot')));
    mini3d(cv, BBZ.presetRobot(p.id, state.robot.alliance));
  });
}
function renderBuild() {
  const c = state.robot;
  $('botName').value = c.name;
  const dl = $('driveList'); dl.textContent = '';
  Object.keys(BBZ.DRIVES).forEach((k) => {
    const d = BBZ.DRIVES[k];
    const pic = h('canvas', { class: 'thumb3d wide', width: 220, height: 150, 'aria-hidden': 'true' });
    dl.append(h('button', { type: 'button', 'aria-pressed': String(c.drive === k), onclick: () => { c.drive = k; applyRobot(); } }, pic, h('b', { text: d.label }), h('span', { class: 'hint', text: d.blurb })));
    if (BBZ.Bot3D) { const demo = BBZ.sanitizeRobot(Object.assign({}, c, { drive: k })); BBZ.Bot3D.draw(pic, demo, { only: 'drive', colors: col }); }
  });
  const pl = $('paintList'); pl.textContent = '';
  Object.keys(BBZ.PAINTS).forEach((k) => pl.append(h('button', { type: 'button', class: 'swatch', style: 'background:' + BBZ.PAINTS[k], title: k, 'aria-label': 'Frame colour ' + k, 'aria-pressed': String(c.paint === k), onclick: () => { c.paint = k; applyRobot(); } })));
  fillSelect($('motorSel'), Object.keys(BBZ.MOTORS).map((k) => [k, BBZ.MOTORS[k].label]), c.motor);
  fillSelect($('wheelSel'), Object.keys(BBZ.WHEELS).map((k) => [k, BBZ.WHEELS[k].label]), c.wheel);
  $('widthRange').value = c.width; $('lengthRange').value = c.length;
  $('widthOut').textContent = c.width + ' in'; $('lengthOut').textContent = c.length + ' in';
  $('realistic').checked = c.realistic;
  $('realisticBox').classList.toggle('is-on', c.realistic);
  const tl = $('toolList'), sl = $('sensorList'); tl.textContent = ''; sl.textContent = '';
  Object.keys(BBZ.TOOLS).forEach((t) => {
    const tool = BBZ.TOOLS[t], id = 'tool-' + t, kits = BBZ.KITS[t];
    const cb = h('input', { type: 'checkbox', id, checked: c.tools[t], onchange: (e) => { c.tools[t] = e.target.checked; applyRobot(); } });
    const uses = BBZ.toolRoles(c, t).map((r) => BBZ.ROLES[r].kind === 'motor' ? '1 motor' : BBZ.ROLES[r].kind === 'servo' ? '1 servo' : '1 sensor').join(' + ');
    const label = h('label', { for: id }, h('b', { text: tool.label }), h('span', { class: 'hint', text: tool.blurb }), h('span', { class: 'uses', text: 'Uses ' + uses }));
    const card = h('div', { class: 'tool' + (c.tools[t] ? ' is-on' : '') }, cb, label);
    if (BBZ.Bot3D) {
      const pic = h('canvas', { class: 'thumb3d', width: 180, height: 180, role: 'img', 'aria-label': '3D view of the ' + tool.label + '. Drag to turn it.' });
      card.append(pic);
      mini3d(pic, c, t === 'imu' ? 'hub' : t);
    }
    if (kits) {
      const sel = h('select', { id: 'kit-' + t, 'aria-label': 'Type of ' + tool.label, disabled: !c.tools[t], onchange: (e) => { c.kit[t] = e.target.value; applyRobot(); } });
      Object.keys(kits).forEach((k) => sel.append(h('option', { value: k }, kits[k].label)));
      sel.value = c.kit[t];
      card.append(h('div', { class: 'kit' }, h('span', { class: 'field-label', text: 'Type' }), sel, h('span', { class: 'hint', text: kits[c.kit[t]].blurb })));
    }
    ((t === 'imu' || t === 'distance' || t === 'camera') ? sl : tl).append(card);
  });
  const tb = $('hwNames'); tb.textContent = '';
  const count = {};
  BBZ.deviceList(c).forEach((d, i) => {
    const ki = count[d.kind] = (count[d.kind] === undefined ? 0 : count[d.kind] + 1);
    const inp = h('input', { type: 'text', class: 'name-in', id: 'name-' + d.role, value: d.name, maxlength: 24, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Name for ' + d.label });
    inp.addEventListener('change', () => {
      const v = inp.value.trim(), msg = $('nameMsg');
      if (v === c.names[d.role]) return;
      const clash = BBZ.deviceList(c).some((x) => x.role !== d.role && x.name === v);
      if (!BBZ.validName(v) || clash) {
        inp.value = c.names[d.role]; inp.classList.add('is-bad');
        msg.textContent = clash ? '"' + v + '" is already used by another part. Every name must be different.' : '"' + v + '" cannot be used. Start with a letter, then letters, numbers or _ only, and avoid Java words like "int" or "power".';
        setTimeout(() => inp.classList.remove('is-bad'), 1500);
        return;
      }
      const n = renameEverywhere(c.names[d.role], v);
      msg.textContent = 'Renamed to "' + v + '".' + (n ? ' Your op modes were updated in ' + n + ' place' + (n === 1 ? '' : 's') + ' to match.' : ' Blocks and examples now use the new name.');
      c.names[d.role] = v; applyRobot();
      const again = $('name-' + d.role); if (again) { try { again.focus(); } catch (e) { /* ignore */ } }
    });
    tb.append(h('tr', null, h('td', { text: d.label }), h('td', { class: 'mono', text: TYPE_LABEL[d.kind] }), h('td', { class: 'hint', text: portOf(d, i, ki) }), h('td', null, inp)));
  });
  renderPartButtons(); describePick(); renderChecks(); drawPreview(); renderPresets();
}
/* Ready-made naming styles teams commonly use for the drive motors. */
const NAME_SETS = {
  short: { fl: 'fl', fr: 'fr', bl: 'bl', br: 'br', left: 'leftDrive', right: 'rightDrive' },
  long: { fl: 'frontLeft', fr: 'frontRight', bl: 'backLeft', br: 'backRight', left: 'leftDrive', right: 'rightDrive' },
  sdk: { fl: 'leftFront', fr: 'rightFront', bl: 'leftBack', br: 'rightBack', left: 'left_drive', right: 'right_drive' }
};
function wireBuild() {
  const c = () => state.robot;
  $('botName').addEventListener('change', (e) => { c().name = e.target.value; applyRobot(); });
  $('motorSel').addEventListener('change', (e) => { c().motor = e.target.value; applyRobot(); });
  $('wheelSel').addEventListener('change', (e) => { c().wheel = e.target.value; applyRobot(); });
  const size = (key, out) => (e) => { c()[key] = parseFloat(e.target.value); $(out).textContent = c()[key] + ' in'; drawPreview(); };
  $('widthRange').addEventListener('input', size('width', 'widthOut'));
  $('lengthRange').addEventListener('input', size('length', 'lengthOut'));
  $('widthRange').addEventListener('change', () => applyRobot());
  $('lengthRange').addEventListener('change', () => applyRobot());
  $('realistic').addEventListener('change', (e) => { c().realistic = e.target.checked; applyRobot(); });
  $('btnResetBot').addEventListener('click', () => { state.robot = BBZ.presetRobot('bee', c().alliance); pickKey = ''; applyRobot(); notify('Back to the starter bot.'); });
  document.querySelectorAll('[data-names]').forEach((b) => b.addEventListener('click', () => {
    const set = NAME_SETS[b.dataset.names], roles = BBZ.driveRoles(c());
    if (!set) return;
    const taken = BBZ.deviceList(c()).filter((d) => roles.indexOf(d.role) < 0).map((d) => d.name);
    if (roles.some((r) => taken.indexOf(set[r]) >= 0)) { $('nameMsg').textContent = 'One of those names is already used by another part, so nothing was changed.'; return; }
    /* renames through temporary names so two swapped names cannot collide */
    let n = 0;
    roles.forEach((r, i) => { n += renameEverywhere(c().names[r], 'zzTmpName' + i); });
    roles.forEach((r, i) => { renameEverywhere('zzTmpName' + i, set[r]); c().names[r] = set[r]; });
    $('nameMsg').textContent = 'Drive motors renamed to ' + roles.map((r) => set[r]).join(', ') + '.' + (n ? ' Your op modes were updated to match.' : '');
    applyRobot();
  }));

  /* layout editor */
  const cv = $('preview');
  document.querySelectorAll('[data-vm]').forEach((b) => b.addEventListener('click', () => setViewMode(b.dataset.vm === '3d')));
  let turnX = 0, turnY = 0;
  cv.addEventListener('pointerdown', (e) => {
    if (has3d()) {
      turning = true; turnX = e.clientX; turnY = e.clientY; cv.style.cursor = 'grabbing';
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      e.preventDefault(); return;
    }
    const key = partAt(previewPoint(e));
    pickKey = key; dragKey = key;
    if (key) { try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } sfx('lift'); }
    renderPartButtons(); describePick(); drawPreview();
    e.preventDefault();
  });
  cv.addEventListener('pointermove', (e) => {
    if (has3d()) {
      if (!turning) return;
      mainView.yaw -= (e.clientX - turnX) * 0.011; mainView.pitch = BBZ.clamp(mainView.pitch + (e.clientY - turnY) * 0.008, 0.18, 1.4);
      turnX = e.clientX; turnY = e.clientY; drawPreview();
      return;
    }
    if (!dragKey) { cv.style.cursor = partAt(previewPoint(e)) ? 'grab' : 'default'; return; }
    cv.style.cursor = 'grabbing';
    movePart(dragKey, previewPoint(e)); drawPreview();
  });
  const drop = () => {
    if (turning) { turning = false; cv.style.cursor = 'grab'; return; }      /* stays where you left it; it only spins again after a tab change */
    if (!dragKey) return;
    dragKey = ''; sfx('snap'); applyRobot();
  };
  cv.addEventListener('pointerup', drop); cv.addEventListener('pointercancel', drop);
  cv.addEventListener('dblclick', () => { if (pickKey && !has3d()) $('btnTurnPart').click(); });
  cv.addEventListener('keydown', (e) => {
    const P = BBZ.PARTS[pickKey], L = P && c().layout[pickKey];
    if (!P) return;
    const step = { ArrowUp: [0.1, 0], ArrowDown: [-0.1, 0], ArrowLeft: [0, 0.1], ArrowRight: [0, -0.1] }[e.key];
    if (step) {
      if (P.edge) L.face = { ArrowUp: 0, ArrowLeft: 1, ArrowDown: 2, ArrowRight: 3 }[e.key];
      else { L.u = BBZ.clamp(L.u + step[0], -1, 1); L.v = BBZ.clamp(L.v + step[1], -1, 1); }
      e.preventDefault(); applyRobot();
    } else if (e.key === 'r' || e.key === 'R') { $('btnTurnPart').click(); e.preventDefault(); }
  });
  $('btnTurnPart').addEventListener('click', () => {
    const P = BBZ.PARTS[pickKey];
    if (!P || !P.turns) return;
    c().layout[pickKey].face = (c().layout[pickKey].face + 1) % 4; sfx('snap'); applyRobot();
  });
  $('btnResetLayout').addEventListener('click', () => { c().layout = BBZ.defaultLayout(); applyRobot(); notify('Every part is back in its usual place.'); });
}

/* ---------- navigation and the frame loop ---------- */
const VIEWS = ['home', 'drive', 'build', 'learn', 'tutorial', 'manual', 'legal'];
function showView(name, fromHash) {
  if (VIEWS.indexOf(name) < 0) name = 'home';
  const was = VIEWS.find((v) => !$('view-' + v).hidden);
  VIEWS.forEach((v) => { $('view-' + v).hidden = v !== name; });
  if (was !== name) {
    /* the new tab glides in from the side it sits on in the tab bar */
    const el = $('view-' + name);
    el.classList.remove('view-in', 'from-left');
    void el.offsetWidth;
    if (was && VIEWS.indexOf(name) < VIEWS.indexOf(was)) el.classList.add('from-left');
    el.classList.add('view-in');
  }
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === name)));
  if (name === 'build') { renderBuild(); startSpin(); }
  if (name === 'drive') { resizeField(); updateGutter(); }
  if (!fromHash) { try { history.replaceState(null, '', '#' + name); } catch (e) { /* ignore */ } }
}
function resizeField() {
  const wrap = $('fieldWrap'), cv = $('field'), w = wrap.clientWidth;
  if (!w) return;
  const px = Math.round(Math.min(1400, w * Math.min(2, window.devicePixelRatio || 1)));
  if (cv.width !== px) { cv.width = px; cv.height = px; }
}
let last = 0, acc = 0, hudAt = 0;
function frame(ts) {
  window.requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000)); last = ts;
  pollPad();
  acc += dt * state.speed;
  let n = 0;
  while (acc >= STEP && n < 30) { simStep(); acc -= STEP; n++; }
  if (n === 30) acc = 0;
  if (!$('view-drive').hidden) {
    if (!col) readColors();
    BBZ.drawField($('field').getContext('2d'), world, $('field').width, col);
    if (ts - hudAt > 100) { hudAt = ts; updateHud(); }
  }
}

/* Runs a program on a private copy of the field with nobody at the controls and reports what happened. */
BBZ.dryRun = (src, cfg, mode, seconds, pads) => {
  const keep = { world, started, startAt, stopReq, robot: state.robot, pending: tele.pending, shown: tele.shown };
  const out = { error: null, finished: false };
  try {
    state.robot = cfg; world = new BBZ.World(cfg);
    world.mode = mode === 'auto' ? 'auto' : 'practice'; world.clock = 30; world.enabled = true;
    started = false; stopReq = false; startAt = 0.35;
    let r = J.start(src, makeHost());
    while (world.time < seconds) {
      if (!started && world.time >= startAt) started = true;
      if (pads) { const want = pads(world.time, world) || {}, two = want.two || {}; PAD_KEYS.forEach((k) => { pad[k] = want[k] !== undefined ? want[k] : (ANALOG[k] ? 0 : false); pad2[k] = two[k] !== undefined ? two[k] : (ANALOG[k] ? 0 : false); }); }
      if (r && (r.step(world.time) || stopReq)) { r = null; out.finished = true; world.stopActuators(); }
      world.step(STEP);
      if (world.phaseChanged) { world.phaseChanged = false; r = null; world.stopActuators(); }
    }
    const s = world.score();
    out.score = s.total; out.tips = s.tips; out.items = s.items.filter((i) => i.n).map((i) => i.label + ' x' + i.n);
    out.x = +world.robot.x.toFixed(1); out.y = +world.robot.y.toFixed(1); out.deg = +(world.robot.th * 180 / Math.PI).toFixed(0);
    out.fouls = world.fouls; out.held = world.robot.held.length; out.world = world;
    if (pads) PAD_KEYS.forEach((k) => { pad[k] = ANALOG[k] ? 0 : false; pad2[k] = ANALOG[k] ? 0 : false; }); out.tele = (tele.shown || []).slice(0, 6);
  } catch (e) { out.error = (e && e.line ? 'line ' + e.line + ': ' : '') + (e && e.message ? e.message : String(e)); }
  world = keep.world; started = keep.started; startAt = keep.startAt; stopReq = keep.stopReq; state.robot = keep.robot;
  tele.pending = keep.pending; tele.shown = keep.shown; tele.dirty = true;
  return out;
};
BBZ.colors = () => { readColors(); return col; };
BBZ.currentRobot = () => state.robot;
function init() {
  load();
  readColors();
  world = new BBZ.World(state.robot);
  wireInput(); wireEditor(); wireStation(); wireBuild();
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
  renderProgramLists(); renderEditor(); renderStation(); rebuildHw(); renderLog(); clearError();
  showView((window.location.hash || '').replace('#', '') || 'home', true);
  if (window.ResizeObserver) new ResizeObserver(resizeField).observe($('fieldWrap')); else window.addEventListener('resize', resizeField);
  const retheme = () => { readColors(); if (!$('view-build').hidden) drawPreview(); };
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme); } catch (e) { /* older browsers */ }
  try { new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] }); } catch (e) { /* ignore */ }
  window.requestAnimationFrame(frame);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
