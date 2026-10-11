/* FTC-style Blocks, built on Blockly (the same open-source library the real FTC Blocks editor uses).
   This file defines the robot blocks, turns a block program into Java, runs the editor, and supplies the
   Blocks examples. Blocks never run directly: the Java they produce goes through the interpreter. */
(function () {
'use strict';
const BBZ = window.BBZ, h = BBZ.h, legacy = BBZ.Blocks, B = window.Blockly;
const ok = !!(B && B.inject && B.serialization && B.Generator);
let cfg = BBZ.defaultRobot();                 // the bot whose device names fill the dropdowns
const fx = (name) => { try { if (BBZ.Sound) BBZ.Sound.play(name); } catch (e) { /* sound is optional */ } };
const names = (kind) => BBZ.deviceList(cfg).filter((d) => d.kind === kind).map((d) => d.name);
const SET = 147, GET = 151, FN = 289, NOTE = 200;

const PAD_NUM = { LeftStickX: 'left_stick_x', LeftStickY: 'left_stick_y', RightStickX: 'right_stick_x', RightStickY: 'right_stick_y', LeftTrigger: 'left_trigger', RightTrigger: 'right_trigger' };
const PAD_BOOL = { A: 'a', B: 'b', X: 'x', Y: 'y', DpadUp: 'dpad_up', DpadDown: 'dpad_down', DpadLeft: 'dpad_left', DpadRight: 'dpad_right', LeftBumper: 'left_bumper', RightBumper: 'right_bumper', Start: 'start', Back: 'back' };
const pairs = (list) => list.map((x) => [x, x]);

/* ---------- block shapes ---------- */
function defineBlocks() {
  const dd = (list) => new B.FieldDropdown(pairs(list));
  const dev = (kind, i) => {
    const field = new B.FieldDropdown(() => { const n = names(kind); return n.length ? pairs(n) : [['(none on this bot)', '']]; });
    const n = names(kind);
    if (i && n[i]) field.setValue(n[i]);
    return field;
  };
  const stmt = (b) => { b.setPreviousStatement(true); b.setNextStatement(true); };
  const def = (type, init) => { B.Blocks[type] = { init }; };

  def('ftc_runOpMode', function () {
    this.appendDummyInput().appendField('to').appendField('runOpMode');
    this.appendStatementInput('DO');
    this.setColour(290); this.setDeletable(false);
    this.setTooltip('Everything inside this block runs when the OpMode is chosen on the Driver Station.');
  });
  def('ftc_comment', function () {
    this.appendDummyInput().appendField(new B.FieldTextInput('Put blocks here.'), 'TEXT');
    stmt(this); this.setColour(NOTE); this.setTooltip('A note for people. The robot ignores it.');
  });
  def('linearOpMode_waitForStart', function () {
    this.appendDummyInput().appendField('call').appendField('waitForStart');
    stmt(this); this.setColour(FN); this.setTooltip('Waits here until START is pressed.');
  });
  def('linearOpMode_opModeIsActive', function () {
    this.appendDummyInput().appendField('call').appendField('opModeIsActive');
    this.setOutput(true, 'Boolean'); this.setColour(FN); this.setTooltip('True while the OpMode is running.');
  });
  def('linearOpMode_sleep', function () {
    this.appendValueInput('MS').setCheck('Number').appendField('call').appendField('sleep').appendField('milliseconds');
    stmt(this); this.setColour(FN); this.setTooltip('Pauses the program. 1000 milliseconds is one second.');
  });
  def('linearOpMode_getRuntime', function () {
    this.appendDummyInput().appendField('call').appendField('getRuntime');
    this.setOutput(true, 'Number'); this.setColour(FN); this.setTooltip('Seconds since the OpMode began.');
  });

  def('dcMotor_setProperty_Number', function () {
    this.appendValueInput('VALUE').setCheck('Number').appendField('set').appendField(dev('motor'), 'DEVICE').appendField('.')
      .appendField(dd(['Power', 'TargetPosition', 'Velocity']), 'PROP').appendField('to');
    stmt(this); this.setColour(SET); this.setTooltip('Power goes from -1 (full reverse) to 1 (full forward).');
  });
  const multi = (type, count) => def(type, function () {
    this.appendDummyInput().appendField('set').appendField(dd(['Power', 'TargetPosition', 'Velocity']), 'PROP');
    for (let i = 1; i <= count; i++) this.appendValueInput('VALUE' + i).setCheck('Number').setAlign(B.inputs ? B.inputs.Align.RIGHT : 1).appendField(dev('motor', i - 1), 'DEVICE' + i).appendField('to');
    this.setInputsInline(false); stmt(this); this.setColour(SET);
    this.setTooltip('Sets ' + count + ' motors at the same moment. Use a negative number to run a motor the other way.');
  });
  multi('dcMotor_setDualProperty', 2);
  multi('dcMotor_setQuadProperty', 4);
  const enumPair = (prop, values, check, tip) => {
    def('dcMotor_setProperty_' + prop, function () {
      this.appendValueInput('VALUE').setCheck(check).appendField('set').appendField(dev('motor'), 'DEVICE').appendField('.').appendField(prop === 'RunMode' ? 'Mode' : prop).appendField('to');
      stmt(this); this.setColour(SET); this.setTooltip(tip);
    });
    def('dcMotor_enum_' + prop, function () {
      this.appendDummyInput().appendField(prop).appendField('.').appendField(dd(values), 'VALUE');
      this.setOutput(true, check); this.setColour(GET);
    });
  };
  enumPair('Direction', ['REVERSE', 'FORWARD'], 'DcMotor.Direction', 'REVERSE makes positive power spin the motor the other way.');
  enumPair('RunMode', ['RUN_USING_ENCODER', 'RUN_WITHOUT_ENCODER', 'RUN_TO_POSITION', 'STOP_AND_RESET_ENCODER'], 'DcMotor.RunMode', 'Chooses how the motor uses its encoder.');
  enumPair('ZeroPowerBehavior', ['BRAKE', 'FLOAT'], 'DcMotor.ZeroPowerBehavior', 'What the motor does at zero power: hold still or coast.');
  def('dcMotor_getProperty_Number', function () {
    this.appendDummyInput().appendField(dev('motor'), 'DEVICE').appendField('.').appendField(dd(['CurrentPosition', 'Power', 'TargetPosition', 'Velocity']), 'PROP');
    this.setOutput(true, 'Number'); this.setColour(GET); this.setTooltip('CurrentPosition is the encoder count in ticks.');
  });
  def('dcMotor_isBusy', function () {
    this.appendDummyInput().appendField('call').appendField(dev('motor'), 'DEVICE').appendField('.').appendField('isBusy');
    this.setOutput(true, 'Boolean'); this.setColour(FN); this.setTooltip('True while a RUN_TO_POSITION move is still under way.');
  });
  def('servo_setProperty_Number', function () {
    this.appendValueInput('VALUE').setCheck('Number').appendField('set').appendField(dev('servo'), 'DEVICE').appendField('.').appendField('Position').appendField('to');
    stmt(this); this.setColour(SET); this.setTooltip('Servo positions go from 0 to 1.');
  });
  def('servo_getProperty_Number', function () {
    this.appendDummyInput().appendField(dev('servo'), 'DEVICE').appendField('.').appendField('Position');
    this.setOutput(true, 'Number'); this.setColour(GET);
  });
  def('gamepad_getProperty_Number', function () {
    this.appendDummyInput().appendField(dd(['gamepad1', 'gamepad2']), 'GAMEPAD').appendField('.').appendField(dd(Object.keys(PAD_NUM)), 'PROP');
    this.setOutput(true, 'Number'); this.setColour(GET); this.setTooltip('Sticks give -1 to 1. Pushing a stick forward gives a NEGATIVE Y value.');
  });
  def('gamepad_getProperty_Boolean', function () {
    this.appendDummyInput().appendField(dd(['gamepad1', 'gamepad2']), 'GAMEPAD').appendField('.').appendField(dd(Object.keys(PAD_BOOL)), 'PROP');
    this.setOutput(true, 'Boolean'); this.setColour(GET); this.setTooltip('True while the button is held.');
  });
  def('imu_getYaw', function () {
    this.appendDummyInput().appendField(dev('imu'), 'DEVICE').appendField('.').appendField('Yaw').appendField('(degrees)');
    this.setOutput(true, 'Number'); this.setColour(GET); this.setTooltip('How far the robot has turned. Turning left counts up.');
  });
  def('imu_resetYaw', function () {
    this.appendDummyInput().appendField('call').appendField(dev('imu'), 'DEVICE').appendField('.').appendField('resetYaw');
    stmt(this); this.setColour(FN); this.setTooltip('Makes the way the robot faces now count as 0 degrees.');
  });
  def('distanceSensor_getDistance', function () {
    this.appendDummyInput().appendField('call').appendField(dev('distance'), 'DEVICE').appendField('.').appendField('getDistance').appendField(dd(['INCH', 'CM']), 'UNIT');
    this.setOutput(true, 'Number'); this.setColour(FN);
  });
  const addData = (type, label, check) => def(type, function () {
    this.appendDummyInput().appendField('call').appendField('Telemetry').appendField('.').appendField('addData');
    this.appendValueInput('KEY').setCheck('String').setAlign(B.inputs ? B.inputs.Align.RIGHT : 1).appendField('key');
    this.appendValueInput('VALUE').setCheck(check).setAlign(B.inputs ? B.inputs.Align.RIGHT : 1).appendField(label);
    this.setInputsInline(false); stmt(this); this.setColour(FN); this.setTooltip('Queues a line for the Driver Station screen. It appears after Telemetry.update.');
  });
  addData('telemetry_addNumericData', 'number', 'Number');
  addData('telemetry_addTextData', 'text', 'String');
  def('telemetry_update', function () {
    this.appendDummyInput().appendField('call').appendField('Telemetry').appendField('.').appendField('update');
    stmt(this); this.setColour(FN); this.setTooltip('Sends the queued telemetry lines to the Driver Station screen.');
  });
}

/* ---------- toolbox, laid out like the FTC Blocks palette ---------- */
function toolbox() {
  const n = (v) => ({ shadow: { type: 'math_number', fields: { NUM: v } } });
  const t = (v) => ({ shadow: { type: 'text', fields: { TEXT: v } } });
  const b = (type, inputs, fields) => { const o = { kind: 'block', type }; if (inputs) o.inputs = inputs; if (fields) o.fields = fields; return o; };
  const cat = (name, colour, contents) => ({ kind: 'category', name, colour: String(colour), contents });
  return { kind: 'categoryToolbox', contents: [
    cat('LinearOpMode', FN, [b('ftc_comment'), b('linearOpMode_waitForStart'), b('linearOpMode_opModeIsActive'), b('linearOpMode_sleep', { MS: n(1000) }), b('linearOpMode_getRuntime')]),
    cat('Gamepad', GET, [b('gamepad_getProperty_Number'), b('gamepad_getProperty_Boolean')]),
    cat('Actuators', SET, [
      cat('DcMotor', SET, [
        b('dcMotor_setProperty_Number', { VALUE: n(0) }),
        b('dcMotor_setDualProperty', { VALUE1: n(0), VALUE2: n(0) }),
        b('dcMotor_setQuadProperty', { VALUE1: n(0), VALUE2: n(0), VALUE3: n(0), VALUE4: n(0) }),
        b('dcMotor_setProperty_Direction', { VALUE: { shadow: { type: 'dcMotor_enum_Direction' } } }),
        b('dcMotor_setProperty_RunMode', { VALUE: { shadow: { type: 'dcMotor_enum_RunMode' } } }),
        b('dcMotor_setProperty_ZeroPowerBehavior', { VALUE: { shadow: { type: 'dcMotor_enum_ZeroPowerBehavior' } } }),
        b('dcMotor_getProperty_Number'), b('dcMotor_isBusy'),
        b('dcMotor_enum_Direction'), b('dcMotor_enum_RunMode'), b('dcMotor_enum_ZeroPowerBehavior')]),
      cat('Servo', SET, [b('servo_setProperty_Number', { VALUE: n(0) }), b('servo_getProperty_Number')])]),
    cat('Sensors', GET, [b('imu_getYaw'), b('imu_resetYaw'), b('distanceSensor_getDistance')]),
    cat('Utilities', FN, [
      cat('Telemetry', FN, [b('telemetry_addNumericData', { KEY: t('key'), VALUE: n(123) }), b('telemetry_addTextData', { KEY: t('key'), VALUE: t('text') }), b('telemetry_update')])]),
    { kind: 'sep' },
    cat('Logic', 210, [b('controls_if'), b('controls_if', null, null), b('logic_compare'), b('logic_operation'), b('logic_negate'), b('logic_boolean')]),
    cat('Loops', 120, [b('controls_whileUntil'), b('controls_repeat_ext', { TIMES: n(10) }), b('controls_flow_statements')]),
    cat('Math', 230, [b('math_number', null, { NUM: 0 }), b('math_arithmetic', { A: n(1), B: n(1) }), b('math_single', { NUM: n(9) }), b('math_constrain', { VALUE: n(50), LOW: n(-1), HIGH: n(1) }), b('math_modulo', { DIVIDEND: n(64), DIVISOR: n(10) }), b('math_round', { NUM: n(3.1) })]),
    cat('Text', 160, [b('text')]),
    { kind: 'category', name: 'Variables', colour: '330', custom: 'VARIABLE' }
  ] };
}

/* ---------- building block programs in code (blank program and examples) ---------- */
function builder() {
  const vars = [];
  const V = (name) => { if (vars.indexOf(name) < 0) vars.push(name); return { id: 'var_' + name }; };
  const blk = (type, fields, inputs) => {
    const o = { type };
    if (fields) o.fields = fields;
    if (inputs) { o.inputs = {}; Object.keys(inputs).forEach((k) => { if (inputs[k]) o.inputs[k] = { block: inputs[k] }; }); }
    return o;
  };
  const chain = (list) => { const a = list.filter(Boolean); for (let i = 0; i < a.length - 1; i++) a[i].next = { block: a[i + 1] }; return a[0] || null; };
  const num = (v) => blk('math_number', { NUM: v });
  const txt = (v) => blk('text', { TEXT: v });
  const note = (v) => blk('ftc_comment', { TEXT: v });
  const op = (o, a, b) => blk('math_arithmetic', { OP: o }, { A: a, B: b });
  const cmp = (o, a, b) => blk('logic_compare', { OP: o }, { A: a, B: b });
  const and = (a, b) => blk('logic_operation', { OP: 'AND' }, { A: a, B: b });
  const neg = (a) => blk('math_single', { OP: 'NEG' }, { NUM: a });
  const get = (name) => blk('variables_get', { VAR: V(name) });
  const set = (name, v) => blk('variables_set', { VAR: V(name) }, { VALUE: v });
  const active = () => blk('linearOpMode_opModeIsActive');
  const padN = (p) => blk('gamepad_getProperty_Number', { GAMEPAD: 'gamepad1', PROP: p });
  const padB = (p) => blk('gamepad_getProperty_Boolean', { GAMEPAD: 'gamepad1', PROP: p });
  const power = (m, v) => blk('dcMotor_setProperty_Number', { DEVICE: m, PROP: 'Power' }, { VALUE: v });
  const powers = (ms, vs) => {
    const f = { PROP: 'Power' }, inp = {};
    ms.forEach((m, i) => { f['DEVICE' + (i + 1)] = m; inp['VALUE' + (i + 1)] = vs[i]; });
    return blk(ms.length === 4 ? 'dcMotor_setQuadProperty' : 'dcMotor_setDualProperty', f, inp);
  };
  const servo = (s, v) => blk('servo_setProperty_Number', { DEVICE: s }, { VALUE: v });
  const reverse = (m) => blk('dcMotor_setProperty_Direction', { DEVICE: m }, { VALUE: blk('dcMotor_enum_Direction', { VALUE: 'REVERSE' }) });
  const pos = (m) => blk('dcMotor_getProperty_Number', { DEVICE: m, PROP: 'CurrentPosition' });
  const sleep = (ms) => blk('linearOpMode_sleep', null, { MS: num(ms) });
  const loopWhile = (cond, body) => blk('controls_whileUntil', { MODE: 'WHILE' }, { BOOL: cond, DO: chain(body) });
  const repeat = (times, body) => blk('controls_repeat_ext', null, { TIMES: num(times), DO: chain(body) });
  /* arms: [[condition, [blocks...]], ...]; other: blocks for the final else (or null) */
  const iff = (arms, other) => {
    const o = { type: 'controls_if', inputs: {} };
    if (arms.length > 1 || other) o.extraState = { elseIfCount: arms.length - 1, hasElse: !!other };
    if (o.extraState && !o.extraState.elseIfCount) delete o.extraState.elseIfCount;
    arms.forEach((a, i) => { o.inputs['IF' + i] = { block: a[0] }; const d = chain(a[1]); if (d) o.inputs['DO' + i] = { block: d }; });
    if (other) { const e = chain(other); if (e) o.inputs.ELSE = { block: e }; }
    return o;
  };
  const numData = (key, v) => blk('telemetry_addNumericData', null, { KEY: txt(key), VALUE: v });
  const update = () => blk('telemetry_update');
  const program = (body) => ({
    blocks: { languageVersion: 0, blocks: [{ type: 'ftc_runOpMode', x: 20, y: 20, inputs: { DO: { block: chain(body) } } }] },
    variables: vars.map((name) => ({ name, id: 'var_' + name }))
  });
  return { blk, chain, num, txt, note, op, cmp, and, neg, get, set, active, padN, padB, power, powers, servo, reverse, pos, sleep, loopWhile, repeat, iff, numData, update, program };
}
/* The starting point for a new op mode: the same skeleton FTC Blocks gives you. */
function blank() {
  const b = builder();
  return b.program([
    b.note('Put initialization blocks here.'),
    b.blk('linearOpMode_waitForStart'),
    b.iff([[b.active(), [
      b.note('Put run blocks here.'),
      b.loopWhile(b.active(), [b.note('Put loop blocks here.'), b.update()])
    ]]])
  ]);
}

/* ---------- Java generator ---------- */
const O = { ATOMIC: 0, UNARY: 2, MULT: 3, ADD: 4, REL: 6, EQ: 7, AND: 11, OR: 12, NONE: 99 };
let G = null, gen = null;                     // gen holds per-run state (errors, loop counter, variable names)
function defineGenerator() {
  G = new B.Generator('Java');
  G.INDENT = '    ';
  G.scrub_ = function (block, code, thisOnly) {
    const next = block.nextConnection && block.nextConnection.targetBlock();
    return code + (next && !thisOnly ? this.blockToCode(next) : '');
  };
  const F = G.forBlock;
  const str = (s) => '"' + String(s).replace(/[\u0000-\u001f]/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  const numLit = (v) => { const x = Number(v); if (!isFinite(x)) return '0.0'; return Number.isInteger(x) ? x + '.0' : String(x); };
  const val = (b, name, order, dflt) => G.valueToCode(b, name, order) || dflt;
  const device = (b, field, kind) => {
    const v = b.getFieldValue(field);
    if (!v) { gen.errs.push('A block needs a ' + kind + ', but your bot does not have one. Add it in Build Bot, or remove that block.'); return 'missing'; }
    return v;
  };
  const setNumber = (m, prop, v) => prop === 'Power' ? m + '.setPower(' + v + ');\n'
    : prop === 'Velocity' ? m + '.setVelocity(' + v + ');\n' : m + '.setTargetPosition((int) (' + v + '));\n';

  F.ftc_comment = (b) => '// ' + String(b.getFieldValue('TEXT')).replace(/[\r\n]/g, ' ') + '\n';
  F.linearOpMode_waitForStart = () => 'waitForStart();\n';
  F.linearOpMode_opModeIsActive = () => ['opModeIsActive()', O.ATOMIC];
  F.linearOpMode_sleep = (b) => 'sleep((long) (' + val(b, 'MS', O.NONE, '0.0') + '));\n';
  F.linearOpMode_getRuntime = () => ['getRuntime()', O.ATOMIC];
  F.dcMotor_setProperty_Number = (b) => setNumber(device(b, 'DEVICE', 'motor'), b.getFieldValue('PROP'), val(b, 'VALUE', O.NONE, '0.0'));
  const multi = (count) => (b) => {
    let code = '';
    for (let i = 1; i <= count; i++) code += setNumber(device(b, 'DEVICE' + i, 'motor'), b.getFieldValue('PROP'), val(b, 'VALUE' + i, O.NONE, '0.0'));
    return code;
  };
  F.dcMotor_setDualProperty = multi(2);
  F.dcMotor_setQuadProperty = multi(4);
  F.dcMotor_setProperty_Direction = (b) => device(b, 'DEVICE', 'motor') + '.setDirection(' + val(b, 'VALUE', O.NONE, 'DcMotor.Direction.FORWARD') + ');\n';
  F.dcMotor_enum_Direction = (b) => ['DcMotor.Direction.' + b.getFieldValue('VALUE'), O.ATOMIC];
  F.dcMotor_setProperty_RunMode = (b) => device(b, 'DEVICE', 'motor') + '.setMode(' + val(b, 'VALUE', O.NONE, 'DcMotor.RunMode.RUN_USING_ENCODER') + ');\n';
  F.dcMotor_enum_RunMode = (b) => ['DcMotor.RunMode.' + b.getFieldValue('VALUE'), O.ATOMIC];
  F.dcMotor_setProperty_ZeroPowerBehavior = (b) => device(b, 'DEVICE', 'motor') + '.setZeroPowerBehavior(' + val(b, 'VALUE', O.NONE, 'DcMotor.ZeroPowerBehavior.BRAKE') + ');\n';
  F.dcMotor_enum_ZeroPowerBehavior = (b) => ['DcMotor.ZeroPowerBehavior.' + b.getFieldValue('VALUE'), O.ATOMIC];
  F.dcMotor_getProperty_Number = (b) => {
    const m = device(b, 'DEVICE', 'motor'), p = b.getFieldValue('PROP');
    if (p === 'Power') return [m + '.getPower()', O.ATOMIC];
    if (p === 'Velocity') return [m + '.getVelocity()', O.ATOMIC];
    return ['(double) ' + m + (p === 'TargetPosition' ? '.getTargetPosition()' : '.getCurrentPosition()'), O.UNARY];
  };
  F.dcMotor_isBusy = (b) => [device(b, 'DEVICE', 'motor') + '.isBusy()', O.ATOMIC];
  F.servo_setProperty_Number = (b) => device(b, 'DEVICE', 'servo') + '.setPosition(' + val(b, 'VALUE', O.NONE, '0.0') + ');\n';
  F.servo_getProperty_Number = (b) => [device(b, 'DEVICE', 'servo') + '.getPosition()', O.ATOMIC];
  F.gamepad_getProperty_Number = (b) => [b.getFieldValue('GAMEPAD') + '.' + (PAD_NUM[b.getFieldValue('PROP')] || 'left_stick_x'), O.ATOMIC];
  F.gamepad_getProperty_Boolean = (b) => [b.getFieldValue('GAMEPAD') + '.' + (PAD_BOOL[b.getFieldValue('PROP')] || 'a'), O.ATOMIC];
  F.imu_getYaw = (b) => [device(b, 'DEVICE', 'IMU') + '.getRobotYawPitchRollAngles().getYaw(AngleUnit.DEGREES)', O.ATOMIC];
  F.imu_resetYaw = (b) => device(b, 'DEVICE', 'IMU') + '.resetYaw();\n';
  F.distanceSensor_getDistance = (b) => [device(b, 'DEVICE', 'distance sensor') + '.getDistance(DistanceUnit.' + (b.getFieldValue('UNIT') === 'CM' ? 'CM' : 'INCH') + ')', O.ATOMIC];
  F.telemetry_addNumericData = (b) => 'telemetry.addData(' + val(b, 'KEY', O.NONE, '"key"') + ', ' + val(b, 'VALUE', O.NONE, '0.0') + ');\n';
  F.telemetry_addTextData = (b) => 'telemetry.addData(' + val(b, 'KEY', O.NONE, '"key"') + ', ' + val(b, 'VALUE', O.NONE, '""') + ');\n';
  F.telemetry_update = () => 'telemetry.update();\n';

  F.controls_if = (b) => {
    let code = '', i = 0;
    while (b.getInput('IF' + i)) {
      code += (i ? ' else ' : '') + 'if (' + val(b, 'IF' + i, O.NONE, 'false') + ') {\n' + G.statementToCode(b, 'DO' + i) + '}';
      i++;
    }
    if (b.getInput('ELSE')) code += ' else {\n' + G.statementToCode(b, 'ELSE') + '}';
    return code + '\n';
  };
  F.controls_whileUntil = (b) => {
    let c = val(b, 'BOOL', O.NONE, 'false');
    if (b.getFieldValue('MODE') === 'UNTIL') c = '!(' + c + ')';
    return 'while (' + c + ') {\n' + G.statementToCode(b, 'DO') + '}\n';
  };
  F.controls_repeat_ext = (b) => {
    const v = 'count' + (++gen.loop);
    return 'for (int ' + v + ' = 0; ' + v + ' < (int) (' + val(b, 'TIMES', O.NONE, '0.0') + '); ' + v + '++) {\n' + G.statementToCode(b, 'DO') + '}\n';
  };
  F.controls_flow_statements = (b) => (b.getFieldValue('FLOW') === 'BREAK' ? 'break;\n' : 'continue;\n');
  F.logic_compare = (b) => {
    const ops = { EQ: '==', NEQ: '!=', LT: '<', LTE: '<=', GT: '>', GTE: '>=' }, o = b.getFieldValue('OP');
    const order = (o === 'EQ' || o === 'NEQ') ? O.EQ : O.REL;
    return [val(b, 'A', order, '0.0') + ' ' + ops[o] + ' ' + val(b, 'B', order, '0.0'), order];
  };
  F.logic_operation = (b) => {
    const isAnd = b.getFieldValue('OP') === 'AND', order = isAnd ? O.AND : O.OR;
    return [val(b, 'A', order, 'false') + (isAnd ? ' && ' : ' || ') + val(b, 'B', order, 'false'), order];
  };
  F.logic_negate = (b) => ['!' + val(b, 'BOOL', O.UNARY, 'true'), O.UNARY];
  F.logic_boolean = (b) => [b.getFieldValue('BOOL') === 'TRUE' ? 'true' : 'false', O.ATOMIC];
  F.math_number = (b) => { const s = numLit(b.getFieldValue('NUM')); return [s, s[0] === '-' ? O.UNARY : O.ATOMIC]; };
  F.math_arithmetic = (b) => {
    const o = b.getFieldValue('OP');
    if (o === 'POWER') return ['Math.pow(' + val(b, 'A', O.NONE, '0.0') + ', ' + val(b, 'B', O.NONE, '0.0') + ')', O.ATOMIC];
    const sym = { ADD: '+', MINUS: '-', MULTIPLY: '*', DIVIDE: '/' }[o], order = (o === 'ADD' || o === 'MINUS') ? O.ADD : O.MULT;
    return [val(b, 'A', order, '0.0') + ' ' + sym + ' ' + val(b, 'B', order, '0.0'), order];
  };
  F.math_single = (b) => {
    const o = b.getFieldValue('OP');
    if (o === 'NEG') return ['-' + val(b, 'NUM', O.UNARY, '0.0'), O.UNARY];
    const a = val(b, 'NUM', O.NONE, '0.0');
    const fn = { ROOT: 'Math.sqrt(', ABS: 'Math.abs(', LN: 'Math.log(', EXP: 'Math.exp(', LOG10: 'Math.log(', POW10: 'Math.pow(10.0, ' }[o] || 'Math.abs(';
    return [fn + a + ')' + (o === 'LOG10' ? ' / Math.log(10.0)' : ''), o === 'LOG10' ? O.MULT : O.ATOMIC];
  };
  F.math_constrain = (b) => ['Math.min(Math.max(' + val(b, 'VALUE', O.NONE, '0.0') + ', ' + val(b, 'LOW', O.NONE, '0.0') + '), ' + val(b, 'HIGH', O.NONE, '0.0') + ')', O.ATOMIC];
  F.math_modulo = (b) => [val(b, 'DIVIDEND', O.MULT, '0.0') + ' % ' + val(b, 'DIVISOR', O.MULT, '1.0'), O.MULT];
  F.math_round = (b) => {
    const fn = { ROUND: 'Math.round', ROUNDUP: 'Math.ceil', ROUNDDOWN: 'Math.floor' }[b.getFieldValue('OP')] || 'Math.round';
    return ['(double) ' + fn + '(' + val(b, 'NUM', O.NONE, '0.0') + ')', O.UNARY];
  };
  F.text = (b) => [str(b.getFieldValue('TEXT')), O.ATOMIC];
  F.variables_get = (b) => [gen.varName(b.getFieldValue('VAR')), O.ATOMIC];
  F.variables_set = (b) => gen.varName(b.getFieldValue('VAR')) + ' = ' + val(b, 'VALUE', O.NONE, gen.varType(b.getFieldValue('VAR')) === 'boolean' ? 'false' : gen.varType(b.getFieldValue('VAR')) === 'String' ? '""' : '0.0') + ';\n';
  F.math_change = (b) => gen.varName(b.getFieldValue('VAR')) + ' += ' + val(b, 'DELTA', O.NONE, '0.0') + ';\n';
  F.ftc_runOpMode = () => '';
}

const validState = (s) => !!(s && typeof s === 'object' && !Array.isArray(s) && s.blocks && Array.isArray(s.blocks.blocks));

function generate(prog, c) {
  if (!ok) throw new Error('The Blocks editor did not load, so these blocks cannot run. Reload the page and try again.');
  cfg = c;
  const ws = new B.Workspace();
  try {
    B.serialization.workspaces.load(validState(prog.blocks) ? prog.blocks : blank(), ws);
    const root = ws.getTopBlocks(true).find((b) => b.type === 'ftc_runOpMode');
    if (!root) throw new Error('This program has no "to runOpMode" block, so there is nothing to run.');
    /* variables: pick a Java name and a type for each one */
    const devNames = new Set(BBZ.deviceList(c).map((d) => d.name)), used = new Set(), info = new Map();
    ws.getAllVariables().forEach((v) => {
      let nm = String(v.name).replace(/[^A-Za-z0-9_]/g, '_');
      if (!BBZ.validName(nm) || devNames.has(nm)) nm = 'var_' + nm.slice(0, 18);
      let k = 2; const base = nm;
      while (used.has(nm)) nm = base + (k++);
      used.add(nm);
      info.set(v.getId(), { name: nm, type: null });
    });
    ws.getAllBlocks(false).forEach((b) => {
      if (b.type !== 'variables_set') return;
      const it = info.get(b.getFieldValue('VAR')), t = b.getInputTargetBlock('VALUE');
      if (!it) return;
      const check = t && t.outputConnection ? t.outputConnection.getCheck() : null;
      const type = check && check.indexOf('Boolean') >= 0 ? 'boolean' : check && check.indexOf('String') >= 0 ? 'String' : 'double';
      it.type = it.type && it.type !== type ? 'double' : type;
    });
    gen = { errs: [], loop: 0,
      varName: (id) => (info.get(id) || { name: 'unknown' }).name,
      varType: (id) => (info.get(id) || {}).type || 'double' };
    const body = G.statementToCode(root, 'DO');
    if (gen.errs.length) throw new Error(gen.errs[0]);

    const devs = BBZ.deviceList(c), has = (kind) => devs.some((d) => d.kind === kind);
    const typeOf = (d) => d.kind === 'motor' ? 'DcMotor' : d.kind === 'servo' ? 'Servo' : d.kind === 'imu' ? 'IMU' : 'DistanceSensor';
    const L = ['// Made from your blocks. The package, import and @ lines are what a real robot needs;', '// the simulator skips them.',
      'package org.firstinspires.ftc.teamcode;', '',
      'import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;',
      'import com.qualcomm.robotcore.eventloop.opmode.' + (prog.mode === 'auto' ? 'Autonomous' : 'TeleOp') + ';',
      'import com.qualcomm.robotcore.hardware.DcMotor;'];
    if (has('servo')) L.push('import com.qualcomm.robotcore.hardware.Servo;');
    if (has('imu')) L.push('import com.qualcomm.robotcore.hardware.IMU;', 'import com.qualcomm.hardware.rev.RevHubOrientationOnRobot;', 'import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;');
    if (has('distance')) L.push('import com.qualcomm.robotcore.hardware.DistanceSensor;', 'import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;');
    const q = (s) => '"' + String(s).replace(/[\u0000-\u001f]/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    L.push('', (prog.mode === 'auto' ? '@Autonomous' : '@TeleOp') + '(name = ' + q(prog.name) + (prog.group ? ', group = ' + q(prog.group) : '') + ')');
    L.push('public class ' + legacy.className(prog.name) + ' extends LinearOpMode {', '');
    devs.forEach((d) => L.push('    private ' + typeOf(d) + ' ' + d.name + ';'));
    info.forEach((it) => L.push('    ' + (it.type || 'double') + ' ' + it.name + ';'));
    L.push('', '    /**', '     * This function is executed when this OpMode is selected from the Driver Station.', '     */', '    @Override', '    public void runOpMode() {');
    devs.forEach((d) => L.push('        ' + d.name + ' = hardwareMap.get(' + typeOf(d) + '.class, ' + q(d.name) + ');'));
    if (has('imu')) {
      const imu = devs.find((d) => d.kind === 'imu').name;
      L.push('        ' + imu + '.initialize(new IMU.Parameters(new RevHubOrientationOnRobot(',
        '                RevHubOrientationOnRobot.LogoFacingDirection.UP,', '                RevHubOrientationOnRobot.UsbFacingDirection.FORWARD)));');
    }
    L.push('');
    body.split('\n').forEach((line) => { if (line.length) L.push('    ' + line); });
    L.push('    }', '}', '');
    return L.join('\n');
  } finally { ws.dispose(); gen = null; }
}

/* Loads untrusted saved data into a throw-away workspace and saves it back out, which keeps only
   what Blockly recognises. Anything it cannot read becomes a blank program. */
function sanitize(s) {
  if (!validState(s)) return blank();
  let copy;
  try { const json = JSON.stringify(s); if (json.length > 250000) return blank(); copy = JSON.parse(json); } catch (e) { return blank(); }
  if (!ok) return copy;
  const ws = new B.Workspace();
  try {
    B.serialization.workspaces.load(copy, ws);
    if (ws.getAllBlocks(false).length > 800 || !ws.getTopBlocks(false).some((b) => b.type === 'ftc_runOpMode')) return blank();
    return B.serialization.workspaces.save(ws);
  } catch (e) { return blank(); } finally { ws.dispose(); }
}

/* ---------- the editor ---------- */
let ws = null, holder = null, cur = null, quietUntil = 0, darkTheme = null;
const isDark = () => { try { return getComputedStyle(document.documentElement).colorScheme.indexOf('dark') >= 0; } catch (e) { return false; } };
function theme() {
  if (!darkTheme) darkTheme = B.Theme.defineTheme('simDark', { name: 'simDark', base: B.Themes.Classic, componentStyles: {
    workspaceBackgroundColour: '#1c2017', toolboxBackgroundColour: '#10130c', toolboxForegroundColour: '#eceee4',
    flyoutBackgroundColour: '#262b1f', flyoutForegroundColour: '#cfd3c6', flyoutOpacity: 1,
    scrollbarColour: '#7d8672', scrollbarOpacity: 0.5, insertionMarkerColour: '#ffffff', insertionMarkerOpacity: 0.3 } });
  return isDark() ? darkTheme : B.Themes.Classic;
}
function onChange(e) {
  if (!cur || !ws || e.isUiEvent) return;
  if (e.type === B.Events.BLOCK_MOVE && Date.now() > quietUntil) {
    if (e.newParentId && e.newParentId !== e.oldParentId) fx('snap');
  }
  try { cur.prog.blocks = B.serialization.workspaces.save(ws); } catch (x) { return; }
  cur.api.changed();
}
function render(root, prog, c, api) {
  cfg = c;
  if (!ok) { root.textContent = 'The Blocks editor could not load. Reload the page; if it still fails, your browser may be blocking the Blockly files.'; return; }
  cur = { prog, api };
  if (!ws || !holder || holder.parentNode !== root) {
    root.textContent = '';
    holder = h('div', { class: 'bly' });
    root.append(holder);
    ws = B.inject(holder, { toolbox: toolbox(), media: 'blockly/media/', sounds: false, trashcan: true, renderer: 'geras', theme: theme(),
      zoom: { controls: true, wheel: false, startScale: 0.85, maxScale: 1.6, minScale: 0.4, scaleSpeed: 1.15 },
      move: { scrollbars: true, drag: true, wheel: true } });
    ws.addChangeListener(onChange);
    if (window.ResizeObserver) new ResizeObserver(() => { if (ws) B.svgResize(ws); }).observe(holder);
    const retheme = () => { if (ws) ws.setTheme(theme()); };
    try { new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-look', 'class'] }); } catch (e) { /* ignore */ }
    try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme); } catch (e) { /* ignore */ }
  }
  quietUntil = Date.now() + 600;
  B.Events.disable();
  try {
    ws.clear();
    try { B.serialization.workspaces.load(validState(prog.blocks) ? prog.blocks : blank(), ws); }
    catch (e) { ws.clear(); prog.blocks = blank(); B.serialization.workspaces.load(prog.blocks, ws); api.notify('That Blocks program could not be opened, so it was reset to a blank one.'); }
  } finally { B.Events.enable(); }
  ws.clearUndo();
  B.svgResize(ws);
  ws.scroll(10, 10);
}

/* ---------- Blocks examples ---------- */
function examples(c) {
  const n = c.names, T = c.tools, mec = c.drive === 'mecanum';
  const drive = BBZ.driveRoles(c).map((r) => n[r]);
  const leftSide = mec ? [n.fl, n.bl] : [n.left];
  const enc = mec ? n.fr : n.right;                        // a right-side motor: its encoder counts up going forward and turning left
  const tpi = BBZ.ticksPerInch(c), K = BBZ.turnK(c);
  const speed = (p) => p * 0.85 * BBZ.MOTORS[c.motor].rpm / 60 * Math.PI * BBZ.WHEELS[c.wheel].d;   // inches per second at power p
  const need = (tools) => { const miss = tools.filter((t) => !T[t]).map((t) => BBZ.TOOLS[t].label); return miss.length ? 'Needs ' + miss.join(' and ') : null; };

  /* shared pieces */
  const init = (b) => [b.note('Put initialization blocks here.')].concat(c.realistic ? leftSide.map((m) => b.reverse(m)) : []);
  const all = (b, p) => b.powers(drive, drive.map(() => b.num(p)));
  const spin = (b, p) => b.powers(drive, mec ? [b.num(-p), b.num(p), b.num(-p), b.num(p)] : [b.num(-p), b.num(p)]);
  const teleop = (b, loop) => b.program(init(b).concat([
    b.blk('linearOpMode_waitForStart'),
    b.iff([[b.active(), [b.note('Put run blocks here.'), b.loopWhile(b.active(), [b.note('Put loop blocks here.')].concat(loop, [b.update()]))]]])
  ]));
  const auto = (b, steps) => b.program(init(b).concat([b.blk('linearOpMode_waitForStart'), b.iff([[b.active(), [b.note('Put run blocks here.')].concat(steps)]])]));
  /* Drive a distance by watching one encoder. The stop comes a little early because the robot coasts. */
  const forward = (b, inches, p) => {
    const ticks = Math.max(1, Math.round((inches - speed(p) * 0.075) * tpi));
    return [b.set('start', b.pos(enc)), all(b, p),
      b.loopWhile(b.and(b.active(), b.cmp('LT', b.op('MINUS', b.pos(enc), b.get('start')), b.num(ticks))), []),
      all(b, 0), b.sleep(250)];
  };
  /* Turn on the spot: by the IMU if the bot has one, otherwise by counting encoder ticks. */
  const turn = (b, deg, p) => {
    const left = deg > 0, a = Math.abs(deg), coast = speed(p) / K * 0.075 * 180 / Math.PI;
    const out = [];
    let cond;
    if (T.imu) {
      out.push(b.blk('imu_resetYaw', { DEVICE: n.imu }));
      const yaw = b.blk('imu_getYaw', { DEVICE: n.imu });
      cond = left ? b.cmp('LT', yaw, b.num(Math.round(a - coast))) : b.cmp('GT', yaw, b.num(-Math.round(a - coast)));
    } else {
      out.push(b.set('start', b.pos(enc)));
      const ticks = Math.round((a - coast) * Math.PI / 180 * K * tpi), delta = b.op('MINUS', b.pos(enc), b.get('start'));
      cond = left ? b.cmp('LT', delta, b.num(ticks)) : b.cmp('GT', delta, b.num(-ticks));
    }
    out.push(spin(b, left ? p : -p), b.loopWhile(b.and(b.active(), cond), []), all(b, 0), b.sleep(250));
    return out;
  };

  const list = [];
  list.push({ id: 'blocks-drive', name: 'Blocks Drive Only', lang: 'blocks', mode: 'teleop', why: null,
    desc: 'The classic first program: one stick drives. Y is forward and back, X steers.',
    make: () => {
      const b = builder();
      const y = () => b.get('y'), x = () => b.get('x');
      const mix = mec ? [b.op('ADD', y(), x()), b.op('MINUS', y(), x()), b.op('ADD', y(), x()), b.op('MINUS', y(), x())] : [b.op('ADD', y(), x()), b.op('MINUS', y(), x())];
      return teleop(b, [b.set('x', b.padN('RightStickX')), b.set('y', b.neg(b.padN('RightStickY'))), b.powers(drive, mix)]);
    } });
  list.push({ id: 'blocks-full', name: 'Blocks Full TeleOp', lang: 'blocks', mode: 'teleop', why: null,
    desc: 'Drives and works every tool on your bot, with an if / else block for each button.',
    make: () => {
      const b = builder(), loop = [];
      const y = () => b.get('y'), x = () => b.get('x'), t = () => b.get('turn');
      loop.push(b.set('y', b.neg(b.padN('LeftStickY'))));
      if (mec) loop.push(b.set('x', b.padN('LeftStickX')));
      loop.push(b.set('turn', b.padN('RightStickX')));
      loop.push(b.powers(drive, mec
        ? [b.op('ADD', b.op('ADD', y(), x()), t()), b.op('MINUS', b.op('MINUS', y(), x()), t()), b.op('ADD', b.op('MINUS', y(), x()), t()), b.op('MINUS', b.op('ADD', y(), x()), t())]
        : [b.op('ADD', y(), t()), b.op('MINUS', y(), t())]));
      if (T.intake) loop.push(b.iff([[b.padB('RightBumper'), [b.power(n.intake, b.num(1))]], [b.padB('LeftBumper'), [b.power(n.intake, b.num(-1))]]], [b.power(n.intake, b.num(0))]));
      if (T.launcher) {
        loop.push(b.power(n.launcher, b.op('MULTIPLY', b.padN('RightTrigger'), b.num(0.75))));
        loop.push(b.iff([[b.padB('A'), [b.servo(n.feeder, b.num(1))]]], [b.servo(n.feeder, b.num(0))]));
      }
      if (T.lift) {
        loop.push(b.iff([[b.padB('DpadUp'), [b.power(n.lift, b.num(0.9))]], [b.padB('DpadDown'), [b.power(n.lift, b.num(-0.9))]]], [b.power(n.lift, b.num(0))]));
        loop.push(b.iff([[b.padB('X'), [b.servo(n.gate, b.num(1))]]], [b.servo(n.gate, b.num(0))]));
      }
      loop.push(b.numData('Run time', b.blk('linearOpMode_getRuntime')));
      return teleop(b, loop);
    } });
  list.push({ id: 'blocks-tip', name: 'Blocks Tip & Park Auto', lang: 'blocks', mode: 'auto', why: null,
    desc: 'Launches 3 POLLEN to tip the HIVE, leaves the wall, then parks. Start facing your HIVE.',
    make: () => {
      const b = builder(), steps = [];
      if (T.launcher) {
        const p = +Math.sqrt((62.6 - (c.length / 2 + 0.05) - 12) / 78).toFixed(2);
        steps.push(b.note('Spin the launcher up, then feed 3 POLLEN into the HIVE.'), b.power(n.launcher, b.num(p)), b.sleep(1500),
          b.repeat(3, [b.servo(n.feeder, b.num(1)), b.sleep(300), b.servo(n.feeder, b.num(0)), b.sleep(700)]), b.power(n.launcher, b.num(0)));
      }
      steps.push(b.note('Leave the wall, then drive round to the LOADING ZONE and park.'));
      [].concat(forward(b, 8, 0.5), turn(b, 90, 0.3), forward(b, 40, 0.6), turn(b, -90, 0.3), forward(b, 92, 0.7), turn(b, 90, 0.3), forward(b, 6, 0.4)).forEach((s) => steps.push(s));
      return auto(b, steps);
    } });
  list.push({ id: 'blocks-leave', name: 'Blocks Leave Only', lang: 'blocks', mode: 'auto', why: null,
    desc: 'Drive forward for half a second and stop. That is enough for the 3 LEAVE points.',
    make: () => { const b = builder(); return auto(b, [all(b, 0.4), b.sleep(600), all(b, 0)]); } });
  list.push({ id: 'blocks-square', name: 'Blocks Square Path', lang: 'blocks', mode: 'auto', why: null,
    desc: 'Repeats "drive 20 inches, turn left 90" four times to trace a square.',
    make: () => { const b = builder(); return auto(b, [b.repeat(4, forward(b, 20, 0.5).concat(turn(b, 90, 0.3)))]); } });
  list.push({ id: 'blocks-distance', name: 'Blocks Distance Stop', lang: 'blocks', mode: 'auto', why: need(['distance']),
    desc: 'Drives forward while the distance sensor reads more than 12 inches, then stops.',
    make: () => {
      const b = builder();
      const dist = () => b.blk('distanceSensor_getDistance', { DEVICE: n.distance, UNIT: 'INCH' });
      return auto(b, [all(b, 0.35), b.loopWhile(b.and(b.active(), b.cmp('GT', dist(), b.num(12))), [b.numData('Distance', dist()), b.update()]), all(b, 0)]);
    } });
  return list;
}

if (ok) { defineBlocks(); defineGenerator(); }
const javaList = BBZ.Samples.list;
BBZ.Samples.list = (c) => { cfg = c; return javaList(c).filter((e) => e.lang === 'java').concat(examples(c)); };
BBZ.Blocks = { render, generate, sanitize, blank, className: legacy.className, resetCursor() {},
  legacyJava: legacy.generate, legacySanitize: legacy.sanitize, ready: ok };
})();
