/* Living honeycomb behind the page: one comb drifts slowly toward the top-left while raised 3D blocks glide
   into neighbouring cells or trade places. Decorative only.
   Built to be cheap: the grid lines and the resting block are each painted once into off-screen images and
   then just stamped every frame; only the few blocks that are gliding are drawn from scratch. */
(function () {
'use strict';
const cv = document.getElementById('bgHive');
if (!cv || !cv.getContext) return;
const ctx = cv.getContext('2d');
const R = 30, W = Math.sqrt(3) * R, H = 1.5 * R, GAP = 4;
const DRIFT_X = -9, DRIFT_Y = -6;                     // pixels per second, toward the top-left
const SWAP_TIME = 1.25, SWAP_MIN = 0.16, SWAP_MAX = 0.46;
const A_REF = 0.36;                                   // strength the resting-block image is painted at
let calm = false;
try { calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { calm = false; }

let w = 0, h = 0, cols = 0, rows = 0, PX = 1, PY = 1;
let tiles = [], taken = new Map();
let offX = 0, offY = 0, last = 0, lastDraw = 0, nextSwap = 0.5;
let grid = null, sprite = null;
const SPR = 96, SPR_C = 44;                           // sprite size and where the block centre sits inside it

const key = (c, r) => c + ',' + r;
const wrapC = (c) => ((c % cols) + cols) % cols, wrapR = (r) => ((r % rows) + rows) % rows;
const cx = (c, r) => c * W + (r & 1 ? W / 2 : 0), cy = (r) => r * H;
const sx = (x) => (((x + offX) % PX) + PX) % PX - W * 1.5, sy = (y) => (((y + offY) % PY) + PY) % PY - H * 1.5;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function hexPath(g, x, y, rad) {
  g.moveTo(x, y - rad);
  g.lineTo(x + rad * 0.866, y - rad / 2); g.lineTo(x + rad * 0.866, y + rad / 2);
  g.lineTo(x, y + rad); g.lineTo(x - rad * 0.866, y + rad / 2); g.lineTo(x - rad * 0.866, y - rad / 2);
  g.closePath();
}

/* One raised block: shadow, side walls, lit top face and a bright rim on the top-left edges. */
function block(g, x, y, rad, a, lift) {
  const s = rad * 0.866, depth = 6 + lift * 7, ty = y - lift * 7;
  const al = (m) => Math.min(1, a * m).toFixed(3);
  g.beginPath(); hexPath(g, x + 4 + lift * 5, y + depth + 4 + lift * 5, rad);
  g.fillStyle = 'rgba(0, 0, 0, ' + al(0.55) + ')'; g.fill();
  g.beginPath();
  g.moveTo(x - s, ty - rad / 2); g.lineTo(x - s, ty + rad / 2 + depth); g.lineTo(x, ty + rad + depth);
  g.lineTo(x + s, ty + rad / 2 + depth); g.lineTo(x + s, ty - rad / 2); g.closePath();
  g.fillStyle = 'rgba(122, 82, 0, ' + al(1.5) + ')'; g.fill();
  g.beginPath(); g.moveTo(x, ty + rad); g.lineTo(x, ty + rad + depth);
  g.strokeStyle = 'rgba(60, 40, 0, ' + al(1.2) + ')'; g.lineWidth = 1; g.stroke();
  const grad = g.createLinearGradient(x - s, ty - rad, x + s, ty + rad);
  grad.addColorStop(0, 'rgba(255, 214, 92, ' + al(1.5) + ')'); grad.addColorStop(1, 'rgba(214, 150, 0, ' + al(1.1) + ')');
  g.beginPath(); hexPath(g, x, ty, rad); g.fillStyle = grad; g.fill();
  g.beginPath(); g.moveTo(x - s, ty + rad / 2); g.lineTo(x - s, ty - rad / 2); g.lineTo(x, ty - rad); g.lineTo(x + s, ty - rad / 2);
  g.strokeStyle = 'rgba(255, 240, 190, ' + al(1.9) + ')'; g.lineWidth = 1.4; g.stroke();
}

function makeCanvas(cw, ch) { const c = document.createElement('canvas'); c.width = Math.ceil(cw); c.height = Math.ceil(ch); return c; }

function build() {
  /* one device pixel per CSS pixel: a soft background does not need retina sharpness, and it is 4x less to paint */
  w = window.innerWidth; h = window.innerHeight;
  cv.width = w; cv.height = h;
  cols = Math.ceil(w / W) + 3;
  rows = Math.ceil(h / H) + 3; if (rows % 2) rows++;   // an even row count lets the comb wrap seamlessly
  PX = cols * W; PY = rows * H;

  /* the whole grid of pressed-in cells, painted once; it repeats every W across and 2H down */
  grid = makeCanvas(w + W + 2, h + 2 * H + 2);
  const g = grid.getContext('2d');
  const gc = Math.ceil(grid.width / W) + 2, gr = Math.ceil(grid.height / H) + 2;
  g.lineWidth = 1.5;
  g.beginPath();
  for (let r = -1; r < gr; r++) for (let c = -1; c < gc; c++) hexPath(g, cx(c, r) + 1.5, cy(r) + 1.5, R - 1.5);
  g.strokeStyle = 'rgba(0, 0, 0, 0.16)'; g.stroke();
  g.beginPath();
  for (let r = -1; r < gr; r++) for (let c = -1; c < gc; c++) hexPath(g, cx(c, r), cy(r), R - 1.5);
  g.strokeStyle = 'rgba(224, 161, 0, 0.2)'; g.stroke();

  /* one resting block, painted once and stamped for every block that is not moving */
  sprite = makeCanvas(SPR, SPR);
  block(sprite.getContext('2d'), SPR_C, SPR_C, R - GAP, A_REF, 0);

  tiles = []; taken = new Map();
  const want = Math.round(cols * rows * 0.11);
  let guard = 0;
  while (tiles.length < want && guard++ < want * 20) {
    const c = Math.floor(Math.random() * cols), r = Math.floor(Math.random() * rows);
    if (taken.has(key(c, r))) continue;
    const t = { c, r, a: 0.16 + Math.random() * 0.2, mx: 0, my: 0, p: -1, nc: 0, nr: 0 };
    tiles.push(t); taken.set(key(c, r), t);
  }
}

function neighbours(c, r) {                            // [pixel dx, pixel dy, column, row] for the six sides
  const odd = r & 1;
  return [[-W, 0, c - 1, r], [W, 0, c + 1, r],
    [-W / 2, -H, odd ? c : c - 1, r - 1], [W / 2, -H, odd ? c + 1 : c, r - 1],
    [-W / 2, H, odd ? c : c - 1, r + 1], [W / 2, H, odd ? c + 1 : c, r + 1]];
}
function startMove(t, d) { t.mx = d[0]; t.my = d[1]; t.nc = wrapC(d[2]); t.nr = wrapR(d[3]); t.p = 0; }
function startSwap() {
  for (let tries = 0; tries < 12; tries++) {
    const t = tiles[Math.floor(Math.random() * tiles.length)];
    if (!t || t.p >= 0) continue;
    const d = neighbours(t.c, t.r)[Math.floor(Math.random() * 6)];
    const other = taken.get(key(wrapC(d[2]), wrapR(d[3])));
    if (other && other.p >= 0) continue;
    startMove(t, d);
    if (other) startMove(other, [-d[0], -d[1], t.c, t.r]);     // two blocks trade places
    else { taken.delete(key(t.c, t.r)); taken.set(key(t.nc, t.nr), t); }
    return;
  }
}

function draw() {
  ctx.clearRect(0, 0, w, h);
  /* the grid image is slid by the drift, wrapped to its repeat distance, so it never runs out;
     the 1.5-cell shift matches sx/sy so every block stays centred in a cell */
  const gx = (((offX - 1.5 * W) % W) + W) % W - W, gy = (((offY - 1.5 * H) % (2 * H)) + 2 * H) % (2 * H) - 2 * H;
  ctx.drawImage(grid, gx, gy);
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (t.p >= 0) continue;
    const x = sx(cx(t.c, t.r)), y = sy(cy(t.r));
    if (x < -SPR || y < -SPR || x > w + SPR || y > h + SPR) continue;
    ctx.globalAlpha = Math.min(1, t.a / A_REF);
    ctx.drawImage(sprite, x - SPR_C, y - SPR_C);
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (t.p < 0) continue;
    const k = ease(Math.min(1, t.p));
    block(ctx, sx(cx(t.c, t.r)) + t.mx * k, sy(cy(t.r)) + t.my * k, R - GAP, t.a, Math.sin(k * Math.PI));
  }
}

function frame(now) {
  window.requestAnimationFrame(frame);
  if (now - lastDraw < 32) return;                    // about 30 frames a second is plenty for a slow drift
  const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now; lastDraw = now;
  offX = (offX + DRIFT_X * dt) % PX; offY = (offY + DRIFT_Y * dt) % PY;
  nextSwap -= dt;
  if (nextSwap <= 0) { startSwap(); nextSwap = SWAP_MIN + Math.random() * (SWAP_MAX - SWAP_MIN); }
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (t.p < 0) continue;
    t.p += dt / SWAP_TIME;
    if (t.p >= 1) { t.c = t.nc; t.r = t.nr; t.mx = 0; t.my = 0; t.p = -1; taken.set(key(t.c, t.r), t); }
  }
  draw();
}

build(); draw();
document.documentElement.classList.add('bg-live');
let resizeTimer = 0;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { build(); draw(); }, 200); });
if (!calm) window.requestAnimationFrame(frame);
})();
