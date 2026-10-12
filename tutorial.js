/* Tutorial tab: category switching and the pictures. Every picture is drawn with the simulator's own
   field and robot code, so the lessons always show exactly what the other tabs show. */
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
/* A piece of the real field. `view` is [x0, y0, x1, y1] in field inches; `marks` are numbered badges at field spots. */
function fieldScene(cv, o) {
  const col = BBZ.colors(), w = new BBZ.World(o.cfg || bot());
  if (o.setup) o.setup(w);
  const S = 1500, big = document.createElement('canvas'); big.width = S; big.height = S;
  BBZ.drawField(big.getContext('2d'), w, S, col);
  const k = S / (FIELD + 2 * M), v = o.view || [-M, -M, FIELD + M, FIELD + M];
  const ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.drawImage(big, (v[0] + M) * k, S - (v[3] + M) * k, (v[2] - v[0]) * k, (v[3] - v[1]) * k, 0, 0, cv.width, cv.height);
  const px = (x) => (x - v[0]) / (v[2] - v[0]) * cv.width, py = (y) => (v[3] - y) / (v[3] - v[1]) * cv.height;
  (o.marks || []).forEach((m) => badge(ctx, px(m[0]), py(m[1]), m[2], col));
  (o.notes || []).forEach((m) => caption(ctx, px(m[0]), py(m[1]), m[2], col));
}
/* One or more robots in a row. Each item: { cfg, st, title, pick, marks: [[robotX, robotY, label]], arrows: 'holo' | 'tank' }. */
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
function drawFigs(root) {
  root.querySelectorAll('canvas[data-fig]').forEach((cv) => {
    const fn = FIGS[cv.dataset.fig];
    if (!fn) return;
    try { fn(cv); } catch (e) { /* a picture that fails to draw must never break the lesson text */ }
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
      /* size the picture to the blocks: as wide as the lesson allows, as tall as the program needs */
      const box = ws.getBlocksBoundingBox(), bw = Math.max(1, box.right - box.left), bh = Math.max(1, box.bottom - box.top);
      const s = Math.min(0.8, (el.clientWidth - 28) / bw);
      el.style.height = Math.ceil(bh * s + 28) + 'px';
      B.svgResize(ws); ws.setScale(s);
      ws.scroll(14 - box.left * s, 14 - box.top * s);
      blockFigs.push(ws);
    } catch (e) { el.textContent = 'Open the Blocks tab on Drive & Code to see these blocks.'; }
  });
  /* the editor on Drive & Code shares the block definitions, so point its dropdowns back at the student's own bot */
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
/* draw when the Tutorial tab opens, and again when the colours change */
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
