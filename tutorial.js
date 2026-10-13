/* Tutorial tab: category switching and the pictures. */
(function () {
'use strict';
const BBZ = window.BBZ, B = window.Blockly;
const $ = (id) => document.getElementById(id);
const CATS = ['tour', 'drive', 'game', 'parts', 'build', 'blocks', 'java', 'vision'];
const M = 7, FIELD = 144;
if (!BBZ || !BBZ.World || !$('view-tutorial')) return;

const bot = (over) => {
  const c = BBZ.defaultRobot();
  if (over) {
    Object.keys(over).forEach((k) => { if (k !== 'tools' && k !== 'kit' && k !== 'layout') c[k] = over[k]; });
    Object.assign(c.tools, over.tools); Object.assign(c.kit, over.kit);
    if (over.layout) Object.keys(over.layout).forEach((k) => Object.assign(c.layout[k], over.layout[k]));
  }
  return BBZ.sanitizeRobot(c);
};
const withCam = () => bot({ tools: { camera: true } });

/* ---------- drawing helpers ---------- */
/* The page's own text colour, so labels inside a picture stay readable in white mode and black mode. */
const inkOf = (cv) => { try { return getComputedStyle(cv).color || '#888'; } catch (e) { return '#888'; } };
function badge(ctx, x, y, label, col) {
  ctx.beginPath(); ctx.arc(x, y, 15, 0, 6.2832); ctx.fillStyle = col.accent; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#1b1608'; ctx.stroke();
  ctx.fillStyle = '#1b1608'; ctx.font = '700 17px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(label), x, y + 1);
}
function caption(ctx, x, y, text, col) {
  ctx.font = '600 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 16;
  ctx.fillStyle = col.bg; ctx.globalAlpha = 0.85; ctx.fillRect(x - w / 2, y - 12, w, 24); ctx.globalAlpha = 1;
  ctx.fillStyle = col.accent; ctx.fillText(text, x, y);
}
function arrow(ctx, x0, y0, x1, y1, col) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.strokeStyle = col.accent; ctx.fillStyle = col.accent; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - Math.cos(a) * 6, y1 - Math.sin(a) * 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - Math.cos(a - 0.5) * 13, y1 - Math.sin(a - 0.5) * 13); ctx.lineTo(x1 - Math.cos(a + 0.5) * 13, y1 - Math.sin(a + 0.5) * 13); ctx.closePath(); ctx.fill();
  ctx.lineCap = 'butt';
}
/* A piece of the real field. */
function fieldScene(cv, o) {
  const col = BBZ.colors(), w = new BBZ.World(o.cfg || bot());
  if (o.setup) o.setup(w);
  const S = o.rect ? 1000 : 1500, big = document.createElement('canvas'); big.width = S; big.height = S;
  BBZ.drawField(big.getContext('2d'), w, S, col);
  const k = S / (FIELD + 2 * M), v = o.view || [-M, -M, FIELD + M, FIELD + M];
  const ctx = cv.getContext('2d');
  const R = o.rect || [0, 0, cv.width, cv.height];
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(R[0], R[1], R[2], R[3]);
  ctx.drawImage(big, (v[0] + M) * k, S - (v[3] + M) * k, (v[2] - v[0]) * k, (v[3] - v[1]) * k, R[0], R[1], R[2], R[3]);
  const px = (x) => R[0] + (x - v[0]) / (v[2] - v[0]) * R[2], py = (y) => R[1] + (v[3] - y) / (v[3] - v[1]) * R[3];
  (o.marks || []).forEach((m) => badge(ctx, px(m[0]), py(m[1]), m[2], col));
  (o.notes || []).forEach((m) => caption(ctx, px(m[0]), py(m[1]), m[2], col));
}
/* One or more robots in a row. */
function botRow(cv, items) {
  const col = BBZ.colors(), ctx = cv.getContext('2d'), n = items.length, cell = cv.width / n, k = Math.min(cell, cv.height - 44) / 25;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = col.tile; ctx.fillRect(0, 0, cv.width, cv.height);
  items.forEach((it, i) => {
    const cx = cell * (i + 0.5), cy = (cv.height - 34) / 2 + 4;
    ctx.setTransform(k, 0, 0, -k, cx, cy); ctx.rotate(Math.PI / 2);
    BBZ.drawRobot(ctx, it.cfg, Object.assign({ held: [], lift: 8, spin: 0.6, roll: 0, claw: 0.15, cata: 0 }, it.st), col, it.pick || '');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const at = (rx, ry) => [cx - ry * k, cy - rx * k];
    if (it.arrows) {
      const hl = it.cfg.length / 2, hw = it.cfg.width / 2, far = 3;
      let p = at(hl + 0.6, 0), q = at(hl + far, 0); arrow(ctx, p[0], p[1], q[0], q[1], col);
      p = at(-hl - 0.6, 0); q = at(-hl - far, 0); arrow(ctx, p[0], p[1], q[0], q[1], col);
      if (it.arrows === 'holo') {
        p = at(0, hw + 0.9); q = at(0, hw + far + 0.3); arrow(ctx, p[0], p[1], q[0], q[1], col);
        p = at(0, -hw - 0.9); q = at(0, -hw - far - 0.3); arrow(ctx, p[0], p[1], q[0], q[1], col);
      }
    }
    (it.marks || []).forEach((m) => { const p = at(m[0], m[1]); badge(ctx, p[0], p[1], m[2], col); });
    if (it.overlay) it.overlay(ctx, at, k, col);
    if (it.title) { ctx.fillStyle = inkOf(cv); ctx.font = '600 16px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(it.title, cx, cv.height - 18); }
  });
}
function gamepad(cv) {
  const col = BBZ.colors(), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = col.tile; ctx.fillRect(0, 0, W, H);
  const box = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  const text = (s, x, y, size, c, weight) => { ctx.fillStyle = c; ctx.font = (weight || 600) + ' ' + size + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y); };
  /* body */
  box(110, 110, 540, 230, 90); ctx.fillStyle = col.body; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = col.wall; ctx.stroke();
  /* bumpers and triggers */
  [[150, 'LB', 'Q', 'LT', 'Z'], [480, 'RB', 'E', 'RT', 'C']].forEach((s) => {
    box(s[0], 78, 130, 30, 10); ctx.fillStyle = col.wheel; ctx.fill(); text(s[1] + '  ·  key ' + s[2], s[0] + 65, 93, 14, col.accent);
    box(s[0] + 15, 40, 100, 30, 10); ctx.fillStyle = col.wheel; ctx.fill(); text(s[3] + '  ·  key ' + s[4], s[0] + 65, 55, 14, col.accent);
  });
  /* sticks */
  [[230, 190, 'Left stick', 'W A S D'], [450, 270, 'Right stick', 'arrow keys']].forEach((s) => {
    ctx.beginPath(); ctx.arc(s[0], s[1], 44, 0, 6.2832); ctx.fillStyle = col.wheel; ctx.fill();
    ctx.beginPath(); ctx.arc(s[0], s[1], 24, 0, 6.2832); ctx.fillStyle = col.accent; ctx.fill();
    text(s[2], s[0], s[1] + 62, 14, inkOf(cv)); text(s[3], s[0], s[1] + 80, 14, col.accent, 700);
  });
  /* d-pad */
  const dx = 310, dy = 270;
  ctx.fillStyle = col.wheel; box(dx - 14, dy - 44, 28, 88, 6); ctx.fill(); box(dx - 44, dy - 14, 88, 28, 6); ctx.fill();
  text('T', dx, dy - 30, 14, col.accent, 700); text('G', dx, dy + 30, 14, col.accent, 700); text('F', dx - 30, dy, 14, col.accent, 700); text('H', dx + 30, dy, 14, col.accent, 700);
  text('D-pad', dx, dy + 62, 14, inkOf(cv));
  /* face buttons */
  const fx = 540, fy = 190;
  [[0, -34, 'Y', 'I'], [0, 34, 'A', 'K'], [-34, 0, 'X', 'J'], [34, 0, 'B', 'L']].forEach((b) => {
    ctx.beginPath(); ctx.arc(fx + b[0], fy + b[1], 18, 0, 6.2832); ctx.fillStyle = col.wheel; ctx.fill();
    text(b[2], fx + b[0], fy + b[1] - 1, 15, '#fff', 700);
    text(b[3], fx + b[0] * 1.9 + (b[0] ? 0 : 30), fy + b[1] * 1.9 - (b[0] ? 0 : (b[1] < 0 ? -14 : 14)), 14, col.accent, 700);
  });
  text('Yellow letters and words are the keyboard keys', W / 2, H - 22, 15, inkOf(cv));
}

/* ---------- the pictures ---------- */
const FIGS = {
  field: (cv) => fieldScene(cv, { cfg: withCam(), marks: [[46, 9, 1], [72, 97, 2], [12, 60, 3], [17, 108, 4], [29, 5, 5], [80, 6, 6]] }),
  pad: gamepad,
  drives: (cv) => botRow(cv, [
    { cfg: bot({ drive: 'mecanum', tools: { launcher: false, lift: false } }), title: 'Mecanum', arrows: 'holo' },
    { cfg: bot({ drive: 'tank', tools: { launcher: false, lift: false } }), title: 'Tank', arrows: 'tank' },
    { cfg: bot({ drive: 'xdrive', tools: { launcher: false, lift: false } }), title: 'X-drive', arrows: 'holo' }]),
  tip: (cv) => fieldScene(cv, { view: [10.5, -1, 133.5, 83.2],
    setup: (w) => { w.m.launcher.u = 0.74; w.launch(); for (let i = 0; i < 26; i++) w.step(1 / 120); w.m.launcher.u = 0.74; },
    notes: [[59.5, 72, 'Upward CELL'], [33, 9, 'The robot shoots from here']] }),
  flower: (cv) => fieldScene(cv, { view: [-5, 40.6, 65, 79.3],
    setup: (w) => { const r = w.robot; r.x = 6.4 + w.cfg.length / 2; r.y = 60; r.th = Math.PI; w.m.lift.raw = 22 * BBZ.liftTicksPerInch(w.cfg); },
    notes: [[3, 68, 'FLOWER'], [38, 71, 'Lift raised to 22 in']] }),
  park: (cv) => fieldScene(cv, { view: [-5, 88.6, 65, 127.3],
    setup: (w) => { const r = w.robot; r.x = 10.5; r.y = 108; r.th = Math.PI; },
    notes: [[19, 123, 'LOADING ZONE']] }),
  robot: (cv) => botRow(cv, [{ cfg: withCam(), st: { held: ['P', 'P'] },
    marks: [[8.3, 5.6, 1], [0.3, 0, 2], [-5.9, 1.4, 3], [5.7, 4.1, 4], [5.7, -4.1, 5], [1.9, -5.4, 6], [-3.6, -5.4, 7], [-6.4, -9.6, 8]] }]),
  intakes: (cv) => botRow(cv, ['roller', 'wheels', 'claw'].map((k) => ({ cfg: bot({ kit: { intake: k }, tools: { launcher: false, lift: false, distance: false } }), title: BBZ.KITS.intake[k].label, pick: 'intake', st: { claw: 0.1 } }))),
  shooters: (cv) => botRow(cv, ['flywheel', 'dual', 'catapult'].map((k) => ({ cfg: bot({ kit: { launcher: k }, tools: { intake: false, lift: false, distance: false } }), title: BBZ.KITS.launcher[k].label, pick: 'launcher' }))),
  lifts: (cv) => botRow(cv, ['slide', 'arm'].map((k) => ({ cfg: bot({ kit: { lift: k }, tools: { intake: false, launcher: false, distance: false } }), title: BBZ.KITS.lift[k].label, pick: 'lift', st: { lift: 14 } }))),
  layout: (cv) => botRow(cv, [
    { cfg: bot(), title: 'Usual layout' },
    { cfg: bot({ layout: { intake: { face: 2 }, launcher: { u: -0.1, v: 0.35, face: 1 }, lift: { u: 0.2, v: -0.55 }, hub: { u: -0.7, v: -1 }, battery: { u: -0.7, v: 0.2 } } }), title: 'After moving parts', pick: 'launcher' }]),
  gallery: (cv) => botRow(cv, ['revstyle', 'gbstyle', 'clawstyle'].map((id) => ({ cfg: BBZ.presetRobot(id, 'red'), title: BBZ.PRESETS.find((p) => p.id === id).name }))),
  tags: (cv) => fieldScene(cv, { cfg: withCam(), view: [14.5, -4, 104.5, 57.6],
    setup: (w) => { const r = w.robot; r.x = 52; r.y = 17; r.th = Math.PI / 2 - 0.12; },
    notes: [[59.5, 47, 'Tag 1'], [84.5, 47, 'Tag 3'], [80, 28, 'range = inches along a blue line']] })
};
/* ---------- more pictures: step-by-step strips, screen guides and diagrams ---------- */
const FONT = 'system-ui, sans-serif';
function txt(ctx, s, x, y, size, color, align, weight) {
  ctx.fillStyle = color; ctx.font = (weight || 600) + ' ' + size + 'px ' + FONT; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}
function rbox(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}
function clear(cv, col) { const ctx = cv.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = col.tile; ctx.fillRect(0, 0, cv.width, cv.height); return ctx; }
/* Several pieces of the field side by side, each with a title underneath. */
function strip(cv, panels) {
  const col = BBZ.colors(), ctx = clear(cv, col), n = panels.length, gap = 10, w = (cv.width - gap * (n + 1)) / n, h = cv.height - 44;
  panels.forEach((p, i) => {
    const x = gap + i * (w + gap), sp = p.span, sh = sp * h / w;
    fieldScene(cv, { cfg: p.cfg, setup: p.setup, marks: p.marks, notes: p.notes, rect: [x, 8, w, h], view: [p.at[0] - sp / 2, p.at[1] - sh / 2, p.at[0] + sp / 2, p.at[1] + sh / 2] });
    ctx.strokeStyle = col.wall; ctx.lineWidth = 2; ctx.strokeRect(x, 8, w, h);
    badge(ctx, x + 22, 30, i + 1, col);
    txt(ctx, p.title, x + w / 2, cv.height - 18, 16, inkOf(cv));
  });
}
const run = (w, n) => { for (let i = 0; i < n; i++) w.step(1 / 120); };
const pose = (w, x, y, th) => { const r = w.robot; r.x = x; r.y = y; r.th = th; };
/* Places pieces in the upward CELL of the red HIVE. */
const fill = (w, n) => { const h = w.hives.R; for (let i = 0; i < n; i++) { const b = w.mk('P', 'cell'); h.cells[h.up].push(b); } };
/* Small arrows beside each wheel of a mecanum bot: +1 forward, -1 backward, 0 none. */
function wheelArrows(dirs, names) {
  return (ctx, at, k, col) => {
    const hl = 8.5, hw = 8.5, spots = [[hl - 2.6, hw + 2.2], [hl - 2.6, -hw - 2.2], [-hl + 2.6, hw + 2.2], [-hl + 2.6, -hw - 2.2]];
    spots.forEach((s, i) => {
      if (dirs && dirs[i]) { const a = at(s[0] - dirs[i] * 1.9, s[1]), b = at(s[0] + dirs[i] * 1.9, s[1]); arrow(ctx, a[0], a[1], b[0], b[1], col); }
      if (names) { const p = at(s[0], s[1] + (s[1] > 0 ? 1.6 : -1.6)); caption(ctx, p[0], p[1], names[i], col); }
    });
  };
}
const plain = () => bot({ tools: { intake: false, launcher: false, lift: false, distance: false } });

Object.assign(FIGS, {
  /* ----- tour ----- */
  screen(cv) {
    const col = BBZ.colors(), ctx = clear(cv, col), ink = inkOf(cv), W = cv.width;
    const part = (x, y, w, h, n, label, sub) => { rbox(ctx, x, y, w, h, 10, col.body, col.wall); badge(ctx, x + 24, y + 24, n, col); txt(ctx, label, x + w / 2 + 10, y + h / 2 - (sub ? 9 : 0), 17, ink); if (sub) txt(ctx, sub, x + w / 2 + 10, y + h / 2 + 13, 13, col.muted, 'center', 500); };
    part(10, 10, W - 20, 50, 1, 'Phase, clock, score, tips, pieces held');
    part(10, 70, 330, 250, 2, 'The field', 'watch your robot here');
    part(10, 330, 330, 90, 3, 'Driver Station', 'Run, Stop, Reset, match');
    part(10, 430, 330, 110, 4, 'Gamepad 1', 'sticks and buttons');
    part(350, 70, W - 360, 110, 5, 'Robot Controller Console', 'your list of op modes');
    part(350, 190, W - 360, 190, 6, 'The editor', 'Java code or Blocks');
    part(350, 390, W - 360, 44, 7, 'Problems box');
    part(350, 444, (W - 370) / 2, 96, 8, 'Telemetry', 'and motors');
    part(350 + (W - 370) / 2 + 10, 444, (W - 370) / 2, 96, 9, 'Score sheet', 'and match log');
  },
  station(cv) {
    const col = BBZ.colors(), ctx = clear(cv, col), ink = inkOf(cv);
    const btn = (x, y, w, label, fill, fg, n) => { rbox(ctx, x, y, w, 40, 8, fill || col.body, fill ? null : col.wall); txt(ctx, label, x + w / 2, y + 21, 16, fg || ink); if (n) badge(ctx, x + w - 4, y + 2, n, col); };
    rbox(ctx, 10, 10, cv.width - 20, cv.height - 20, 12, null, col.wall);
    txt(ctx, 'DRIVER STATION', 34, 38, 18, ink, 'left', 700);
    btn(30, 66, 70, 'Red', col.red, '#fff'); btn(100, 66, 70, 'Blue', null, null, 1);
    btn(200, 66, 330, 'Start spot: facing your HIVE  ▾', null, null, 2);
    btn(560, 66, 50, '1×', col.accent, '#1b1608'); btn(610, 66, 50, '2×'); btn(660, 66, 50, '4×', null, null, 3);
    btn(30, 126, 250, '▶  Run open program', col.accent, '#1b1608', 4);
    btn(300, 126, 110, '■  Stop', col.red, '#fff', 5);
    btn(430, 126, 170, '↺  Reset field', null, null, 6);
    btn(30, 186, 250, 'Match autonomous  ▾', null, null, 7); btn(300, 186, 250, 'Match TeleOp  ▾');
    btn(30, 246, 250, 'Play full match (2:38)', col.accent, '#1b1608', 8);
  },
  console(cv) {
    const col = BBZ.colors(), ctx = clear(cv, col), ink = inkOf(cv), W = cv.width;
    rbox(ctx, 10, 10, W - 20, cv.height - 20, 12, null, col.wall);
    txt(ctx, 'ROBOT CONTROLLER CONSOLE', 30, 36, 17, col.accent, 'left', 700);
    rbox(ctx, 470, 16, 100, 38, 6, col.body, col.wall); txt(ctx, 'Blocks', 520, 36, 15, ink);
    rbox(ctx, 575, 16, 130, 38, 6, col.accent); txt(ctx, 'OnBotJava', 640, 36, 15, '#1b1608'); badge(ctx, 716, 20, 1, col);
    ['Create New Op Mode', 'Examples', 'Copy Selected', 'Delete Selected'].forEach((s, i) => { const x = 24 + i * 178; rbox(ctx, x, 66, 168, 36, 6, col.body, col.wall); txt(ctx, s, x + 84, 85, 14, ink); });
    badge(ctx, 24 + 4 * 178 - 6, 66, 2, col);
    const row = (y, name, mode, desc, open) => {
      if (open) { ctx.fillStyle = col.accent; ctx.globalAlpha = 0.16; ctx.fillRect(24, y, W - 48, 38); ctx.globalAlpha = 1; }
      txt(ctx, '▲ ▼', 52, y + 20, 13, col.muted); txt(ctx, name, 90, y + 20, 15, open ? ink : col.accent, 'left');
      rbox(ctx, 290, y + 7, 110, 24, 12, mode === 'TeleOp' ? col.blue : col.good); txt(ctx, mode, 345, y + 20, 13, '#fff');
      txt(ctx, desc, 420, y + 20, 13, col.muted, 'left', 500);
    };
    txt(ctx, 'Group: Examples', 30, 126, 14, ink, 'left', 700); badge(ctx, 180, 126, 3, col);
    row(144, 'Full TeleOp', 'TeleOp', 'Drives and works every tool', true); row(184, 'Tip & Park Auto', 'Autonomous', 'Tips the HIVE, then parks');
    badge(ctx, W - 40, 164, 4, col);
    rbox(ctx, 24, 234, W - 48, 150, 8, col.bg, col.wall); badge(ctx, W - 40, 250, 5, col);
    const code = [[[60, col.accent], [150, ink]], [[20, ink], [90, col.blue], [70, ink]], [[40, ink], [120, col.good], [50, col.accent]], [[40, ink], [200, col.muted]], [[20, ink]]];
    code.forEach((ln, i) => { txt(ctx, String(i + 1), 44, 256 + i * 26, 13, col.muted); let x = 66; ln.forEach((s) => { ctx.fillStyle = s[1]; ctx.globalAlpha = 0.75; ctx.fillRect(x, 250 + i * 26, s[0], 10); ctx.globalAlpha = 1; x += s[0] + 10; }); });
    rbox(ctx, 24, 394, W - 48, 38, 8, col.body, col.wall); txt(ctx, 'No problems found. Errors show up here with a line number.', 40, 414, 14, ink, 'left', 500); badge(ctx, W - 40, 398, 6, col);
  },
  instruments(cv) {
    const col = BBZ.colors(), ctx = clear(cv, col), ink = inkOf(cv), w = (cv.width - 30) / 2;
    const panel = (x, y, title, lines, draw) => {
      rbox(ctx, x, y, w, 160, 10, col.body, col.wall); txt(ctx, title, x + 16, y + 24, 16, col.accent, 'left', 700);
      lines.forEach((s, i) => txt(ctx, s, x + 16, y + 56 + i * 26, 14, ink, 'left', 500));
      if (draw) draw(x, y);
    };
    panel(10, 10, 'TELEMETRY', ['Heading : 12.4 deg', 'Distance : 31.0 in', 'Status : Running']);
    panel(20 + w, 10, 'MOTORS & SERVOS', ['fl', 'intake', 'feeder'], (x, y) => {
      [[0.7, '1240 ticks'], [1, '88 ticks'], [0.25, '0.25']].forEach((v, i) => {
        const bx = x + 90, by = y + 49 + i * 26; ctx.fillStyle = col.meterBg; ctx.fillRect(bx, by, 130, 14);
        ctx.fillStyle = col.accent; ctx.fillRect(i < 2 ? bx + 65 : bx, by, (i < 2 ? 65 : 130) * v[0], 14);
        txt(ctx, v[1], x + w - 16, by + 8, 13, ink, 'right', 500);
      });
    });
    panel(10, 180, 'SCORE SHEET', ['LEAVE the wall (AUTO)      1 × 3 = 3', 'HIVE TIPS in AUTO            1 × 20 = 20', 'Total                                         23']);
    panel(20 + w, 180, 'MATCH LOG', ['12.4s  HIVE TIP! +20 points', '30.0s  AUTO is over', '38.0s  TELEOP: you have control']);
  },
  /* ----- driving ----- */
  firstdrive: (cv) => strip(cv, [
    { title: 'Hold C, tap K three times', at: [59.5, 33], span: 62, setup: (w) => { w.m.launcher.u = 0.74; w.launch(); run(w, 22); } },
    { title: 'Touch a FLOWER, hold E', at: [20, 60], span: 46, setup: (w) => { pose(w, 6.4 + 8.5, 60, Math.PI); w.m.intake.u = 1; } },
    { title: 'Park in your LOAD box', at: [22, 108], span: 46, setup: (w) => pose(w, 10.5, 108, Math.PI) }]),
  reverse: (cv) => botRow(cv, [
    { cfg: plain(), title: 'Same power, left motors not reversed: it spins', overlay: wheelArrows([-1, 1, -1, 1]) },
    { cfg: plain(), title: 'Left motors set to REVERSE: it drives straight', overlay: wheelArrows([1, 1, 1, 1]) }]),
  /* ----- the game ----- */
  timeline(cv) {
    const col = BBZ.colors(), ctx = clear(cv, col), ink = inkOf(cv), x0 = 30, full = cv.width - 60, total = 158;
    const seg = (from, len, fill, label, sub) => {
      const x = x0 + from / total * full, w = len / total * full;
      rbox(ctx, x + 2, 50, w - 4, 70, 8, fill); txt(ctx, label, x + w / 2, 76, 17, '#111', 'center', 700); txt(ctx, sub, x + w / 2, 100, 14, '#111', 'center', 500);
    };
    seg(0, 30, col.accent, 'AUTO', '30 s'); seg(30, 8, col.muted, '', '8 s'); seg(38, 60, col.good, 'TELEOP', 'first 60 s'); seg(98, 60, col.red, 'ENDGAME', 'last 60 s');
    txt(ctx, 'Only your code drives', x0 + 15 / total * full, 28, 14, ink);
    txt(ctx, 'pause', x0 + 34 / total * full, 140, 13, ink);
    txt(ctx, 'Drivers use the gamepad', x0 + 98 / total * full, 28, 14, ink);
    txt(ctx, 'NECTAR may go into FLOWERS. Park before 0:00.', x0 + full, 140, 13, ink, 'right');
    txt(ctx, 'LEAVE and PARK are checked at the end of AUTO', x0 + 22 / total * full, 168, 13, col.muted, 'left', 500);
  },
  leave: (cv) => strip(cv, [
    { title: 'Start: touching the wall', at: [59.5, 14], span: 50 },
    { title: 'End of AUTO: clear of the wall = 3 points', at: [59.5, 14], span: 50, setup: (w) => pose(w, 59.5, 21.5, Math.PI / 2) }]),
  tipsteps: (cv) => strip(cv, [
    { title: 'Starts with 3 NECTAR', at: [59.5, 66], span: 36 },
    { title: '2 POLLEN in: bar nearly full', at: [59.5, 66], span: 36, setup: (w) => fill(w, 2), notes: [[59.5, 50, 'one more tips it']] },
    { title: 'Tipped: +20, other CELL is up', at: [59.5, 76], span: 36, setup: (w) => { fill(w, 3); w.checkTip(w.hives.R); run(w, 200); } }]),
  stack(cv) {
    const col = BBZ.colors(), ctx = clear(cv, col), ink = inkOf(cv);
    const ex = [['P', 'P', 'P', 'R', 'P', 'R'], ['P', 'P', 'B', 'P', 'R'], ['P', 'P', 'P', 'P']];
    const notes = [['Top NECTAR is red:', 'red owns it', '5 above the bottom', '× 2 = 10', 'Lowest NECTAR red: +5', 'Red scores 15'],
      ['Top NECTAR is red:', 'red owns it', '4 above the bottom', '× 2 = 8', 'Lowest NECTAR blue: +0', 'Red scores 8'],
      ['No NECTAR:', 'nobody owns it', '', '', '', 'Scores 0']];
    const fillOf = { P: col.pollen, R: col.red, B: col.blue };
    ex.forEach((s, i) => {
      const x = 60 + i * 250, base = 300;
      rbox(ctx, x - 26, 40, 52, 276, 26, null, col.wall);
      for (let j = 0; j < 7; j++) {
        const y = base - j * 38;
        ctx.beginPath(); ctx.arc(x, y, 16, 0, 6.2832);
        if (s[j]) { ctx.fillStyle = fillOf[s[j]]; ctx.fill(); } else { ctx.strokeStyle = col.muted; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]); }
      }
      txt(ctx, 'bottom', x, 334, 13, col.muted, 'center', 500);
      notes[i].forEach((t, j) => txt(ctx, t, x + 40, 64 + j * 30 + (j > 1 ? 14 : 0) + (j > 3 ? 14 : 0) + (j > 4 ? 20 : 0), j === 5 ? 18 : 14, j === 5 ? col.accent : ink, 'left', j === 5 ? 700 : 500));
    });
  },
  garden: (cv) => strip(cv, [
    { title: 'Push pieces into your GARDEN strip: 1 point each', at: [24, 14], span: 60, cfg: plain(), setup: (w) => { pose(w, 34, 12, Math.PI); for (let i = 0; i < 3; i++) w.mk('P', 'floor', 19 + i * 3.4, 3.2 + (i % 2) * 2.6); } },
    { title: 'PARK: any part over the tape counts', at: [20, 108], span: 50, cfg: plain(), setup: (w) => pose(w, 14, 108, Math.PI) }]),
  halves(cv) {
    const col = BBZ.colors();
    fieldScene(cv, { notes: [[36, 126, 'Your half in AUTO (red)'], [108, 126, 'Stay out during AUTO']] });
    const ctx = cv.getContext('2d'), k = cv.width / (FIELD + 2 * M), x = (FIELD / 2 + M) * k;
    ctx.fillStyle = col.red; ctx.globalAlpha = 0.14; ctx.fillRect(x, M * k, FIELD / 2 * k, FIELD * k); ctx.globalAlpha = 1;
    ctx.strokeStyle = col.accent; ctx.lineWidth = 4; ctx.setLineDash([14, 10]); ctx.beginPath(); ctx.moveTo(x, M * k); ctx.lineTo(x, (FIELD + M) * k); ctx.stroke(); ctx.setLineDash([]);
  },
  /* ----- robot parts ----- */
  robot3d(cv) { if (BBZ.Bot3D) BBZ.Bot3D.draw(cv, withCam(), { yaw: 2.35, pitch: 0.42 }); },
  actuators(cv) {
    const col = BBZ.colors(), ctx = clear(cv, col), ink = inkOf(cv);
    txt(ctx, 'Motor: setPower(-1.0 to 1.0)', 190, 30, 17, ink, 'center', 700);
    ctx.fillStyle = col.meterBg; ctx.fillRect(40, 70, 300, 26); ctx.fillStyle = col.accent; ctx.fillRect(190, 70, 105, 26);
    ctx.fillStyle = ink; ctx.fillRect(189, 62, 2, 42);
    txt(ctx, '-1.0', 40, 120, 14, ink); txt(ctx, '0', 190, 120, 14, ink); txt(ctx, '1.0', 340, 120, 14, ink);
    txt(ctx, 'full reverse', 40, 140, 12, col.muted, 'center', 500); txt(ctx, 'stopped', 190, 140, 12, col.muted, 'center', 500); txt(ctx, 'full forward', 340, 140, 12, col.muted, 'center', 500);
    txt(ctx, 'here: 0.7', 242, 54, 13, col.accent);
    txt(ctx, 'Keeps spinning. Its encoder counts how far.', 190, 176, 13, ink, 'center', 500);
    txt(ctx, 'Servo: setPosition(0.0 to 1.0)', 570, 30, 17, ink, 'center', 700);
    ctx.strokeStyle = col.meterBg; ctx.lineWidth = 16; ctx.beginPath(); ctx.arc(570, 150, 80, Math.PI, 0); ctx.stroke();
    ctx.strokeStyle = col.accent; ctx.beginPath(); ctx.arc(570, 150, 80, Math.PI, Math.PI * 1.75); ctx.stroke();
    ctx.strokeStyle = ink; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(570, 150); ctx.lineTo(570 + Math.cos(Math.PI * 1.75) * 70, 150 + Math.sin(Math.PI * 1.75) * 70); ctx.stroke();
    ctx.beginPath(); ctx.arc(570, 150, 9, 0, 6.2832); ctx.fillStyle = '#8b63d9'; ctx.fill();
    txt(ctx, '0.0', 478, 168, 14, ink); txt(ctx, '0.5', 570, 54, 14, ink); txt(ctx, '1.0', 662, 168, 14, ink);
    txt(ctx, 'Swings to one spot and holds there.', 570, 190, 13, ink, 'center', 500);
  },
  range(cv) {
    const col = BBZ.colors(), ctx = clear(cv, col), ink = inkOf(cv), x0 = 70, y0 = 250, sx = 62, sy = 2.2;
    txt(ctx, 'How far a flywheel throws at each power', cv.width / 2, 24, 16, ink, 'center', 700);
    ctx.strokeStyle = col.muted; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0, 40); ctx.lineTo(x0, y0); ctx.lineTo(cv.width - 20, y0); ctx.stroke();
    [0, 30, 60, 90].forEach((d) => { txt(ctx, d + ' in', x0 - 8, y0 - d * sy, 13, ink, 'right', 500); ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(x0, y0 - d * sy); ctx.lineTo(cv.width - 20, y0 - d * sy); ctx.stroke(); ctx.globalAlpha = 1; });
    for (let i = 0; i < 10; i++) {
      const p = (i + 1) / 10, d = 12 + 78 * p * p, x = x0 + 14 + i * sx;
      rbox(ctx, x, y0 - d * sy, 44, d * sy, 5, Math.abs(d - 54) < 6 ? col.good : col.accent);
      txt(ctx, p.toFixed(1), x + 22, y0 + 16, 13, ink); txt(ctx, Math.round(d), x + 22, y0 - d * sy - 10, 13, ink);
    }
    ctx.strokeStyle = col.red; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(x0, y0 - 54 * sy); ctx.lineTo(cv.width - 20, y0 - 54 * sy); ctx.stroke(); ctx.setLineDash([]);
    txt(ctx, 'the HIVE from the start wall: about 54 in', x0 + 8, y0 - 54 * sy - 12, 13, col.red, 'left');
    txt(ctx, 'power', cv.width / 2, y0 + 38, 13, col.muted, 'center', 500);
  },
  sides: (cv) => strip(cv, [
    { title: 'Shooter on the front: shoots ahead', at: [59.5, 23.5], span: 70, setup: (w) => { w.m.launcher.u = 0.74; w.launch(); run(w, 20); } },
    { title: 'Shooter turned left: the robot must turn', at: [59.5, 23.5], span: 70, cfg: bot({ layout: { launcher: { face: 1 } } }), setup: (w) => { pose(w, 59.5, 12, 0); w.m.launcher.u = 0.72; w.launch(); run(w, 20); } }]),
  /* ----- build bot ----- */
  build3d(cv) {
    const col = BBZ.colors(), ctx = clear(cv, col), h = cv.height - 40, a = document.createElement('canvas'), b = document.createElement('canvas');
    a.width = a.height = h; b.width = b.height = h;
    if (BBZ.Bot3D) BBZ.Bot3D.draw(a, bot(), { yaw: -0.8, pitch: 0.45 });
    botRow(b, [{ cfg: bot(), pick: 'launcher' }]);
    ctx.drawImage(a, cv.width / 4 - h / 2, 4); ctx.drawImage(b, cv.width * 3 / 4 - h / 2, 4);
    txt(ctx, '3D view: drag to look around', cv.width / 4, cv.height - 18, 16, inkOf(cv));
    txt(ctx, 'Top view: drag parts to move them', cv.width * 3 / 4, cv.height - 18, 16, inkOf(cv));
  },
  names: (cv) => botRow(cv, [
    { cfg: plain(), title: 'Mecanum or X-drive: four motors', overlay: wheelArrows(null, ['fl', 'fr', 'bl', 'br']) },
    { cfg: bot({ drive: 'tank', tools: { intake: false, launcher: false, lift: false, distance: false } }), title: 'Tank: two motors',
      overlay: (ctx, at, k, col) => { let p = at(-2.6, 12.4); caption(ctx, p[0], p[1], 'leftDrive', col); p = at(-2.6, -12.4); caption(ctx, p[0], p[1], 'rightDrive', col); } }]),
  /* ----- java ----- */
  mix: (cv) => botRow(cv, [
    { cfg: plain(), title: 'forward: all four the same', overlay: wheelArrows([1, 1, 1, 1]) },
    { cfg: plain(), title: 'strafe right: corners in pairs', overlay: wheelArrows([1, -1, -1, 1]) },
    { cfg: plain(), title: 'turn right: sides go opposite ways', overlay: wheelArrows([1, -1, 1, -1]) }]),
  encoder(cv) {
    const col = BBZ.colors(), ctx = clear(cv, col), ink = inkOf(cv), tpi = BBZ.ticksPerInch(bot());
    txt(ctx, 'driveInches(20, 0.6) on the starter bot', cv.width / 2, 26, 16, ink, 'center', 700);
    ctx.beginPath(); ctx.arc(110, 130, 62, 0, 6.2832); ctx.fillStyle = col.wheel; ctx.fill();
    ctx.strokeStyle = col.accent; ctx.lineWidth = 3;
    for (let i = 0; i < 24; i++) { const t = i / 24 * 6.2832; ctx.beginPath(); ctx.moveTo(110 + Math.cos(t) * 48, 130 + Math.sin(t) * 48); ctx.lineTo(110 + Math.cos(t) * 60, 130 + Math.sin(t) * 60); ctx.stroke(); }
    txt(ctx, 'encoder', 110, 122, 14, '#fff'); txt(ctx, 'ticks', 110, 140, 14, '#fff');
    arrow(ctx, 200, 130, 290, 130, col);
    rbox(ctx, 310, 96, 420, 68, 10, col.body, col.wall);
    txt(ctx, '20 inches × ' + tpi.toFixed(1) + ' ticks per inch', 520, 118, 15, ink);
    txt(ctx, '= ' + Math.round(20 * tpi) + ' ticks to travel', 520, 144, 17, col.accent, 'center', 700);
    txt(ctx, 'setTargetPosition → RUN_TO_POSITION → wait while isBusy() → stop', cv.width / 2, 206, 14, ink, 'center', 500);
  },
  /* ----- sensors and AprilTags ----- */
  sensors: (cv) => fieldScene(cv, { view: [14.5, -4, 104.5, 57.6], setup: (w) => { pose(w, 59.5, 16, Math.PI / 2 + 0.5); w.robot.th0 = Math.PI / 2; w.enabled = true; },
    notes: [[40, 44, 'dashed line = what the distance sensor reads'], [84, 12, 'IMU heading: about 29 degrees left']] }),
  tagmap: (cv) => fieldScene(cv, { cfg: withCam(), marks: BBZ.TAGS.map((t) => [t.x + Math.cos(t.a) * 9, t.y + Math.sin(t.a) * 9, t.id]) })
});

function drawFigs(root) {
  root.querySelectorAll('canvas[data-fig]').forEach((cv) => {
    const fn = FIGS[cv.dataset.fig];
    if (!fn) return;
    try { fn(cv); cv.removeAttribute('data-err'); } catch (e) { cv.setAttribute('data-err', String(e && e.message)); /* a picture that fails to draw must never break the lesson text */ }
  });
}

/* ---------- pictures of real blocks ---------- */
let blockFigs = [];
function clearBlocks() { blockFigs.forEach((ws) => { try { ws.dispose(); } catch (e) { /* ignore */ } }); blockFigs = []; }
function drawBlocks(root) {
  clearBlocks();
  if (!B || !BBZ.Blocks || !BBZ.Blocks.ready) return;
  const cfg = withCam();
  root.querySelectorAll('.blkfig').forEach((el) => {
    try {
      let state;
      if (el.dataset.blk === 'blank') state = BBZ.Blocks.blank();
      else { const ex = BBZ.Samples.list(cfg).find((e) => e.id === el.dataset.blk); if (!ex) return; state = ex.make(); }
      el.textContent = '';
      const ws = B.inject(el, { readOnly: true, media: 'blockly/media/', sounds: false, renderer: 'geras', theme: BBZ.Blocks.theme(), move: { scrollbars: false, drag: false, wheel: false }, zoom: { controls: false, wheel: false, startScale: 0.7 } });
      B.Events.disable();
      try { B.serialization.workspaces.load(state, ws); } finally { B.Events.enable(); }
      /* sizes the picture to fit the blocks */
      const box = ws.getBlocksBoundingBox(), bw = Math.max(1, box.right - box.left), bh = Math.max(1, box.bottom - box.top);
      const s = Math.min(0.8, (el.clientWidth - 28) / bw);
      el.style.height = Math.ceil(bh * s + 28) + 'px';
      B.svgResize(ws); ws.setScale(s);
      ws.scroll(14 - box.left * s, 14 - box.top * s);
      blockFigs.push(ws);
    } catch (e) { el.textContent = 'Open the Blocks tab on Drive & Code to see these blocks.'; }
  });
  /* restores the editor's dropdowns to the student's own bot */
  try { BBZ.Samples.list(BBZ.currentRobot()); } catch (e) { /* ignore */ }
}

/* ---------- categories ---------- */
let current = 'tour';
function show(name) {
  if (CATS.indexOf(name) < 0) name = 'tour';
  current = name;
  CATS.forEach((t) => { const sec = $('tut-' + t); if (sec) sec.hidden = t !== name; });
  document.querySelectorAll('[data-tut]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.tut === name)));
  const sec = $('tut-' + name);
  if (!sec) return;
  sec.classList.remove('fade-in'); void sec.offsetWidth; sec.classList.add('fade-in');
  refresh();
}
function refresh() {
  const sec = $('tut-' + current);
  if (!sec || $('view-tutorial').hidden) return;
  drawFigs(sec); drawBlocks(sec);
}
document.querySelectorAll('[data-tut]').forEach((b) => b.addEventListener('click', () => show(b.dataset.tut)));
/* redraws when the Tutorial tab opens or the colours change */
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { if (t.dataset.view === 'tutorial') setTimeout(refresh, 0); else clearBlocks(); }));
document.querySelectorAll('[data-go="tutorial"]').forEach((t) => t.addEventListener('click', () => setTimeout(refresh, 0)));
try { new MutationObserver(() => setTimeout(refresh, 60)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-look', 'data-ink'] }); } catch (e) { /* ignore */ }

const tt = $('tagTable');
if (tt && BBZ.TAGS) BBZ.TAGS.forEach((t) => {
  const tr = document.createElement('tr'), a = document.createElement('td'), b = document.createElement('td');
  a.textContent = String(t.id); b.textContent = t.name; tr.append(a, b); tt.append(tr);
});
setTimeout(refresh, 0);
})();
