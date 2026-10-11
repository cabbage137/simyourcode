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
function cleanProgram(p) {
  if (!p || typeof p !== 'object') return null;
  const lang = p.lang === 'blocks' ? 'blocks' : 'java';
  return {
    id: pid++, name: cleanName(p.name), lang, mode: p.mode === 'auto' ? 'auto' : 'teleop', group: cleanGroup(p.group), desc: cleanDesc(p.desc),
    code: lang === 'java' && typeof p.code === 'string' ? p.code.slice(0, MAX_CODE) : '',
    blocks: lang === 'blocks' ? BBZ.Blocks.sanitize(p.blocks) : []
  };
}
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
    if (Array.isArray(raw.programs)) state.programs = raw.programs.slice(0, MAX_PROGRAMS).map(cleanProgram).filter(Boolean); normalise();
    const idx = (v) => (typeof v === 'number' && Number.isInteger(v) && v >= -1 && v < state.programs.length) ? v : -1;
    state.open = Math.max(0, idx(raw.open)); state.auto = idx(raw.auto); state.tele = idx(raw.tele);
    state.speed = raw.speed === 2 || raw.speed === 4 ? raw.speed : 1;
  }
  if (!state.programs.length) seed();
  fixMatchPicks();
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
        programs: state.programs.map((p) => ({ name: p.name, lang: p.lang, mode: p.mode, group: p.group, desc: p.desc, code: p.code, blocks: p.blocks }))
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
  'left_bumper', 'right_bumper', 'dpad_up', 'dpad_down', 'dpad_left', 'dpad_right', 'start', 'back'];
const ANALOG = { left_stick_x: 1, left_stick_y: 1, right_stick_x: 1, right_stick_y: 1, left_trigger: 1, right_trigger: 1 };
const blankPad = () => { const p = {}; PAD_KEYS.forEach((k) => { p[k] = ANALOG[k] ? 0 : false; }); return p; };
const pad = blankPad(), pad2 = blankPad();
function padApi(src) {
  const F = Object.create(null);
  PAD_KEYS.forEach((k) => { F[k] = () => src[k]; });
  F.cross = F.a; F.circle = F.b; F.square = F.x; F.triangle = F.y;
  F.left_stick_button = () => false; F.right_stick_button = () => false;
  return { __t: 'Gamepad', __f: F, __m: Object.create(null) };
}
const KIND_OF = { DcMotor: 'motor', DcMotorEx: 'motor', DcMotorSimple: 'motor', Servo: 'servo', IMU: 'imu', DistanceSensor: 'distance', Rev2mDistanceSensor: 'distance' };
const KIND_LABEL = { motor: 'motor', servo: 'servo', imu: 'IMU', distance: 'distance sensor' };
function getDevice(cls, name) {
  if (typeof name !== 'string') throw new Error('hardwareMap.get needs the device name in quotes, like hardwareMap.get(DcMotor.class, "frontLeft").');
  const d = world.device(name);
  if (!d) throw new Error('There is no device named "' + name + '" on your bot. It has: ' + BBZ.deviceList(state.robot).map((x) => x.name).join(', ') + '. Names must match the Build Bot tab exactly, capitals included.');
  if (cls) {
    const want = KIND_OF[cls];
    if (!want) throw new Error('This simulator has no device type called ' + cls + '. Use DcMotor, Servo, IMU or DistanceSensor.');
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
function runOpen() {
  const p = openProg();
  if (!p) return;
  if (matchOn || world.mode === 'over') { world.reset(); clearLog(); rebuildHw(); }
  matchOn = false;
  world.mode = 'practice';
  if (startOpMode(p)) { setStatus('Running "' + p.name + '". Press Stop when you are done.'); addLog('info', 'Started ' + p.name + ' (practice, no clock).'); }
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
  setStatus('Drivers, hands off the controls. AUTO starts after the countdown.');
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
        if (world.mode === 'practice') { world.mode = 'idle'; setStatus('"' + name + '" finished.'); }
        addLog('info', name + ' reached the end of its code.');
      } else if (stopReq) { endOpMode(); if (world.mode === 'practice') world.mode = 'idle'; setStatus('The program asked to stop.'); }
    } catch (e) {
      const prog = runProg;
      endOpMode();
      if (world.mode === 'practice') world.mode = 'idle';
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
    const out = d.kind === 'motor' || d.kind === 'servo' ? bar : h('span', { class: 'hint', text: d.kind === 'imu' ? 'heading' : 'ahead' });
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
  });
}
const PHASE = { idle: 'READY', practice: 'PRACTICE', auto: 'AUTO', transition: 'PAUSE', teleop: 'TELEOP', over: 'FINAL' };
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
function pollPad() {
  const k = (c) => keys[c] ? 1 : 0;
  let lx = k('KeyD') - k('KeyA') + vstick.lx, ly = k('KeyS') - k('KeyW') + vstick.ly;
  let rx = k('ArrowRight') - k('ArrowLeft') + vstick.rx, ry = k('ArrowDown') - k('ArrowUp') + vstick.ry;
  const b = {};
  Object.keys(KEYMAP).forEach((c) => { if (keys[c]) b[KEYMAP[c]] = true; });
  Object.keys(vbtn).forEach((n) => { if (vbtn[n]) b[n] = true; });
  let lt = b.left_trigger ? 1 : 0, rt = b.right_trigger ? 1 : 0;
  try {
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < gps.length; i++) {
      const g = gps[i];
      if (!g || !g.connected || g.mapping !== 'standard') continue;
      const dz = (v) => Math.abs(v) < 0.08 ? 0 : v, B = (n) => !!(g.buttons[n] && g.buttons[n].pressed);
      lx += dz(g.axes[0] || 0); ly += dz(g.axes[1] || 0); rx += dz(g.axes[2] || 0); ry += dz(g.axes[3] || 0);
      ['a', 'b', 'x', 'y', 'left_bumper', 'right_bumper'].forEach((n, j) => { if (B(j)) b[n] = true; });
      lt = Math.max(lt, g.buttons[6] ? g.buttons[6].value : 0); rt = Math.max(rt, g.buttons[7] ? g.buttons[7].value : 0);
      if (B(8)) b.back = true; if (B(9)) b.start = true;
      if (B(12)) b.dpad_up = true; if (B(13)) b.dpad_down = true; if (B(14)) b.dpad_left = true; if (B(15)) b.dpad_right = true;
      break;
    }
  } catch (e) { /* the Gamepad API can be blocked; keyboard and on-screen controls still work */ }
  const live = !(world.mode === 'auto' || world.mode === 'transition');
  const c1 = (v) => BBZ.clamp(v, -1, 1);
  pad.left_stick_x = live ? c1(lx) : 0; pad.left_stick_y = live ? c1(ly) : 0;
  pad.right_stick_x = live ? c1(rx) : 0; pad.right_stick_y = live ? c1(ry) : 0;
  pad.left_trigger = live ? lt : 0; pad.right_trigger = live ? rt : 0;
  PAD_KEYS.forEach((n) => { if (!ANALOG[n]) pad[n] = live && b[n] === true; });
  document.querySelectorAll('.pb').forEach((el) => { el.classList.toggle('is-down', b[el.dataset.pad] === true); });
}
function wireInput() {
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
  return { id: pid++, name: ex.name, lang: ex.lang, mode: ex.mode, group: 'Examples', desc: ex.desc,
    code: ex.lang === 'java' ? ex.make() : '', blocks: ex.lang === 'blocks' ? BBZ.Blocks.sanitize(ex.make()) : [] };
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
    : { name: 'My Blocks', lang: 'blocks', mode: 'teleop', group: 'My Op Modes', desc: '', code: '', blocks: [] });
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
function applyRobot(rerenderBuild) {
  state.robot = BBZ.sanitizeRobot(state.robot);
  endOpMode(); matchOn = false;
  world = new BBZ.World(state.robot);
  clearLog(); rebuildHw(); renderStation(); renderExamples();
  tele.pending = []; tele.shown = null; tele.dirty = true;
  setStatus('Field reset for your bot. Pick a program and press Run.');
  if (rerenderBuild !== false) renderBuild();
  else { drawPreview(); renderChecks(); }
  const p = openProg();
  if (p && p.lang === 'blocks') { BBZ.Blocks.render($('blocksRoot'), p, state.robot, blocksApi); refreshGenJava(); }
  save();
}
function renderChecks() {
  const c = state.robot, devs = BBZ.deviceList(c), motors = devs.filter((d) => d.kind === 'motor').length, servos = devs.filter((d) => d.kind === 'servo').length;
  const spec = BBZ.MOTORS[c.motor], speed = spec.rpm / 60 * Math.PI * BBZ.WHEELS[c.wheel].d * 0.85;
  const ul = $('checks'); ul.textContent = '';
  const li = (pill, cls, text) => ul.append(h('li', null, h('span', { class: 'pill' + (cls ? ' ' + cls : ''), text: pill }), h('span', { text })));
  li('OK', '', motors + ' of 8 motors used (rule R503).');
  li('OK', '', servos + ' of 8 servos used (rule R503).');
  li('OK', '', 'Starting size ' + c.width + ' × ' + c.length + ' in fits the 18 in cube (rule R102).');
  li('INFO', 'info', 'Top speed about ' + speed.toFixed(0) + ' in/s (' + (speed / 12).toFixed(1) + ' ft/s). ' + BBZ.ticksPerInch(c).toFixed(1) + ' encoder ticks per inch.');
  li('INFO', 'info', 'Carries up to 4 pieces at a time (rule G407).' + (c.tools.intake ? '' : ' With no intake it can only use its 4 pre-loaded POLLEN.'));
  if (!c.tools.launcher && !c.tools.lift) li('INFO', 'info', 'With no launcher and no lift, this bot can only push pieces and park.');
}
function drawPreview() {
  if (!col) readColors();
  const cv = $('preview'), ctx = cv.getContext('2d'), px = cv.width, k = px / 26;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = col.tile; ctx.fillRect(0, 0, px, px);
  ctx.setTransform(k, 0, 0, -k, px / 2, px / 2);
  ctx.strokeStyle = col.tileLine; ctx.lineWidth = 0.15; ctx.setLineDash([0.6, 0.6]); ctx.strokeRect(-9, -9, 18, 18); ctx.setLineDash([]);
  ctx.rotate(Math.PI / 2);
  BBZ.drawRobot(ctx, state.robot, { held: ['P', 'P', 'P', 'P'], lift: 8, spin: 0.6, roll: 0 }, col);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = col.tileText; ctx.font = '600 13px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('FRONT', px / 2, 16);
}
function renderBuild() {
  const c = state.robot;
  $('botName').value = c.name;
  $('driveMecanum').setAttribute('aria-pressed', String(c.drive === 'mecanum'));
  $('driveTank').setAttribute('aria-pressed', String(c.drive === 'tank'));
  fillSelect($('motorSel'), Object.keys(BBZ.MOTORS).map((k) => [k, BBZ.MOTORS[k].label]), c.motor);
  fillSelect($('wheelSel'), Object.keys(BBZ.WHEELS).map((k) => [k, BBZ.WHEELS[k].label]), c.wheel);
  $('widthRange').value = c.width; $('lengthRange').value = c.length;
  $('widthOut').textContent = c.width + ' in'; $('lengthOut').textContent = c.length + ' in';
  $('realistic').checked = c.realistic;
  $('realisticBox').classList.toggle('is-on', c.realistic);
  const tl = $('toolList'), sl = $('sensorList'); tl.textContent = ''; if (sl) sl.textContent = '';
  Object.keys(BBZ.TOOLS).forEach((t) => {
    const tool = BBZ.TOOLS[t], id = 'tool-' + t;
    const cb = h('input', { type: 'checkbox', id, checked: c.tools[t], onchange: (e) => { c.tools[t] = e.target.checked; applyRobot(); } });
    const uses = tool.roles.map((r) => BBZ.ROLES[r].kind === 'motor' ? '1 motor' : BBZ.ROLES[r].kind === 'servo' ? '1 servo' : '1 sensor').join(' + ');
    ((sl && (t === 'imu' || t === 'distance')) ? sl : tl).append(h('div', { class: 'tool' + (c.tools[t] ? ' is-on' : '') }, cb, h('label', { for: id }, h('b', { text: tool.label }), h('span', { class: 'hint', text: tool.blurb }), h('span', { class: 'uses', text: 'Uses ' + uses }))));
  });
  const tb = $('hwNames'); tb.textContent = '';
  BBZ.deviceList(c).forEach((d) => {
    const inp = h('input', { type: 'text', class: 'name-in', id: 'name-' + d.role, value: d.name, maxlength: 24, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Name for ' + d.label });
    inp.addEventListener('change', () => {
      const v = inp.value.trim(), msg = $('nameMsg');
      const clash = BBZ.deviceList(c).some((x) => x.role !== d.role && x.name === v);
      if (!BBZ.validName(v) || clash) {
        inp.value = c.names[d.role]; inp.classList.add('is-bad');
        msg.textContent = clash ? '"' + v + '" is already used by another part. Every name must be different.' : '"' + v + '" cannot be used. Start with a letter, then letters, numbers or _ only, and avoid Java words like "int" or "power".';
        setTimeout(() => inp.classList.remove('is-bad'), 1500);
        return;
      }
      msg.textContent = 'Renamed to "' + v + '". Update your code to use the new name.';
      c.names[d.role] = v; applyRobot();
    });
    const ty = d.kind === 'motor' ? 'DcMotor' : d.kind === 'servo' ? 'Servo' : d.kind === 'imu' ? 'IMU' : 'DistanceSensor';
    tb.append(h('tr', null, h('td', { text: d.label }), h('td', { class: 'mono', text: ty }), h('td', null, inp)));
  });
  renderChecks(); drawPreview();
}
function wireBuild() {
  const c = () => state.robot;
  $('botName').addEventListener('change', (e) => { c().name = e.target.value; applyRobot(); });
  $('driveMecanum').addEventListener('click', () => { c().drive = 'mecanum'; applyRobot(); });
  $('driveTank').addEventListener('click', () => { c().drive = 'tank'; applyRobot(); });
  $('motorSel').addEventListener('change', (e) => { c().motor = e.target.value; applyRobot(); });
  $('wheelSel').addEventListener('change', (e) => { c().wheel = e.target.value; applyRobot(); });
  const size = (key, out) => (e) => { c()[key] = parseFloat(e.target.value); $(out).textContent = c()[key] + ' in'; drawPreview(); };
  $('widthRange').addEventListener('input', size('width', 'widthOut'));
  $('lengthRange').addEventListener('input', size('length', 'lengthOut'));
  $('widthRange').addEventListener('change', () => applyRobot());
  $('lengthRange').addEventListener('change', () => applyRobot());
  $('realistic').addEventListener('change', (e) => { c().realistic = e.target.checked; applyRobot(); });
  $('btnResetBot').addEventListener('click', () => { const a = c().alliance; state.robot = BBZ.defaultRobot(); state.robot.alliance = a; applyRobot(); notify('Back to the starter bot.'); });
}

/* ---------- navigation and the frame loop ---------- */
const VIEWS = ['home', 'drive', 'build', 'learn', 'tutorial', 'manual', 'legal'];
function showView(name, fromHash) {
  if (VIEWS.indexOf(name) < 0) name = 'home';
  VIEWS.forEach((v) => { $('view-' + v).hidden = v !== name; });
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === name)));
  if (name === 'build') { renderBuild(); }
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
