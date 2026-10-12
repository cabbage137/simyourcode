/* Home page extras: menu cards, the tool that follows the cursor, policy jump buttons and the erase-data button.
   Kept separate from the simulator so none of its code had to change. */
(function () {
'use strict';
const $ = (id) => document.getElementById(id);
const home = $('view-home'), tool = $('cursorTool');

/* menu cards and hero buttons open a tab */
document.querySelectorAll('[data-go]').forEach((el) => {
  el.addEventListener('click', () => {
    const tab = document.querySelector('.tab[data-view="' + el.dataset.go + '"]');
    if (tab) tab.click();
    try { window.scrollTo(0, 0); } catch (e) { /* ignore */ }
  });
});

/* the beta notice can be hidden for this visit */
const betaBar = $('betaBar'), betaClose = $('betaClose');
if (betaBar && betaClose) betaClose.addEventListener('click', () => { betaBar.hidden = true; });

/* policy jump buttons */
document.querySelectorAll('[data-jump]').forEach((el) => {
  el.addEventListener('click', () => {
    const target = $(el.dataset.jump);
    if (!target) return;
    target.scrollIntoView({ block: 'start' });
    try { target.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  });
});

/* Tool emoji pinned to the cursor on the Home tab. It is placed in the same event that reports the
   pointer position, with no easing, so it never lags behind or drifts. */
if (home && tool) {
  let calm = false;
  try { calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { calm = false; }
  const OFFSET = 10;                         /* just below-right of the pointer tip so it never covers what you click */
  /* The emoji glides to the pointer on a quick spring and leans into the direction of travel,
     then settles exactly on the target. Timing is based on real elapsed time, so it feels the
     same on slow and fast screens. */
  let shown = false, raf = 0, last = 0;
  let tx = 0, ty = 0, x = 0, y = 0, tilt = 0;
  const hide = () => { if (shown) { shown = false; tool.hidden = true; } if (raf) { window.cancelAnimationFrame(raf); raf = 0; } };
  const draw = () => { tool.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) rotate(' + tilt.toFixed(2) + 'deg)'; };
  const tick = (now) => {
    raf = 0;
    if (!shown) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now;
    const k = 1 - Math.exp(-dt * 22);                 /* closes about 90% of the gap every tenth of a second */
    const dx = tx - x, dy = ty - y;
    x += dx * k; y += dy * k;
    const lean = Math.max(-22, Math.min(22, dx * 0.9));
    tilt += (lean - tilt) * (1 - Math.exp(-dt * 14));
    if (Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15 && Math.abs(tilt) < 0.2) { x = tx; y = ty; tilt = 0; draw(); return; }
    draw();
    raf = window.requestAnimationFrame(tick);
  };
  const move = (e) => {
    if (home.hidden || e.pointerType === 'touch') { hide(); return; }
    tx = e.clientX + OFFSET; ty = e.clientY + OFFSET;
    if (!shown) { shown = true; x = tx; y = ty; tilt = 0; tool.hidden = false; draw(); }
    if (!raf) { last = window.performance.now(); raf = window.requestAnimationFrame(tick); }
  };
  if (!calm) {
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', hide);
    window.addEventListener('blur', hide);
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { if (t.dataset.view !== 'home') hide(); }));
  }
}

/* Four bees drift around the Home tab as if there were no gravity. Grab one and drag it, or throw it:
   it glides off, bounces from the edges and the other bees, then settles back to a slow wander. */
const beeLayer = $('bees');
if (home && beeLayer) {
  /* A round cartoon bee: fat yellow body with a thick outline, three brown stripes at the back, a little
     stinger, two small wings on top, one curly antenna and a tiny calm face. Each one needs its own clip id. */
  const BEE = (i) => '<svg viewBox="0 0 122 104" focusable="false">' +
    '<defs><clipPath id="beeBody' + i + '"><ellipse cx="68" cy="62" rx="50" ry="38"/></clipPath></defs>' +
    '<ellipse class="wing" cx="52" cy="20" rx="16" ry="11" fill="#ffffff" stroke="#111111" stroke-width="4"/>' +
    '<ellipse class="wing" cx="72" cy="19" rx="13" ry="10" fill="#ffffff" stroke="#111111" stroke-width="4"/>' +
    '<path d="M21 54L3 62l18 8z" fill="#111111"/>' +
    '<ellipse cx="68" cy="62" rx="50" ry="38" fill="#ffd400"/>' +
    '<g clip-path="url(#beeBody' + i + ')" fill="#8a4b08" stroke="#111111" stroke-width="2.5">' +
    '<rect x="30" y="14" width="8" height="96"/><rect x="44" y="14" width="8" height="96"/><rect x="58" y="14" width="8" height="96"/></g>' +
    '<ellipse cx="68" cy="62" rx="50" ry="38" fill="none" stroke="#111111" stroke-width="4.5"/>' +
    '<path d="M92 27q6-9 15-3" fill="none" stroke="#111111" stroke-width="4" stroke-linecap="round"/>' +
    '<circle cx="95" cy="58" r="2.8" fill="#111111"/><circle cx="108" cy="58" r="2.8" fill="#111111"/>' +
    '<path d="M98 65h7" stroke="#111111" stroke-width="2.6" stroke-linecap="round"/></svg>';
  const COUNT = 4, SIZE = 92, R = 38, CRUISE = 34;
  let still = false;
  try { still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { still = false; }
  const bees = [];
  for (let i = 0; i < COUNT; i++) {
    const el = document.createElement('div');
    el.className = 'bee'; el.innerHTML = BEE(i);
    beeLayer.append(el);
    const a = Math.random() * 6.283;
    bees.push({ el, x: 0, y: 0, vx: Math.cos(a) * CRUISE, vy: Math.sin(a) * CRUISE, held: false, placed: false, turn: Math.random() * 6.283, face: 1, mood: 0, pace: CRUISE, push: 26, lx: 0, ly: 0, lt: 0, ox: 0, oy: 0 });
  }
  /* The bees stay in the part of the Home tab that is on screen, so they follow as the page scrolls. */
  const bounds = () => {
    const r = home.getBoundingClientRect(), vh = window.innerHeight || 800;
    const top = Math.max(0, -r.top + 70), bottom = Math.min(r.height, vh - r.top);
    return { x0: 4, x1: Math.max(SIZE + 8, r.width - SIZE - 4), y0: top, y1: Math.max(top + SIZE + 8, bottom - SIZE - 4) };
  };
  const draw = (b) => { b.el.style.transform = 'translate3d(' + b.x.toFixed(1) + 'px,' + b.y.toFixed(1) + 'px,0) scaleX(' + b.face + ') rotate(' + (BBZ_clamp(b.vy * 0.06, -16, 16)).toFixed(1) + 'deg)'; };
  const BBZ_clamp = (v, a, c) => v < a ? a : v > c ? c : v;
  let raf = 0, last = 0;
  const tick = (now) => {
    raf = 0;
    if (home.hidden || document.hidden) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now;
    const bd = bounds();
    bees.forEach((b, i) => {
      if (!b.placed) { b.placed = true; b.x = bd.x0 + (bd.x1 - bd.x0) * (0.12 + 0.25 * i); b.y = bd.y0 + (bd.y1 - bd.y0) * (0.2 + 0.25 * ((i * 2) % 3)); }
      if (b.held) { draw(b); return; }
      if (!still) {
        /* a gentle, wandering push, and a slow fade of any extra speed from being thrown */
        /* Every so often a bee changes its mind: a new heading and a new pace. Sometimes it hovers almost still,
           sometimes it darts. Between those moments its heading jitters, so no two paths look alike. */
        b.mood -= dt;
        if (b.mood <= 0) {
          const roll = Math.random();
          b.mood = 0.5 + Math.random() * 2.2;
          b.turn += (Math.random() - 0.5) * 4.4;
          if (roll < 0.18) { b.pace = 6 + Math.random() * 8; b.push = 10; }
          else if (roll > 0.82) { b.pace = 70 + Math.random() * 50; b.push = 150; b.mood = 0.35 + Math.random() * 0.5; }
          else { b.pace = 22 + Math.random() * 34; b.push = 20 + Math.random() * 30; }
        }
        b.turn += (Math.random() - 0.5) * 9 * Math.sqrt(dt);
        b.vx += Math.cos(b.turn) * b.push * dt; b.vy += Math.sin(b.turn) * b.push * dt;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > b.pace) { const k = Math.max(b.pace / sp, Math.exp(-dt * 1.6)); b.vx *= k; b.vy *= k; }
        b.x += b.vx * dt; b.y += b.vy * dt;
      }
      if (b.x < bd.x0) { b.x = bd.x0; b.vx = Math.abs(b.vx); b.turn = Math.atan2(b.vy, b.vx); } else if (b.x > bd.x1) { b.x = bd.x1; b.vx = -Math.abs(b.vx); b.turn = Math.atan2(b.vy, b.vx); }
      if (b.y < bd.y0) { b.y += Math.min(bd.y0 - b.y, 900 * dt); b.vy = Math.abs(b.vy); b.turn = Math.atan2(b.vy, b.vx); } else if (b.y > bd.y1) { b.y -= Math.min(b.y - bd.y1, 900 * dt); b.vy = -Math.abs(b.vy); b.turn = Math.atan2(b.vy, b.vx); }
      if (Math.abs(b.vx) > 4) b.face = b.vx < 0 ? -1 : 1;
    });
    /* bees bump off each other */
    for (let i = 0; i < COUNT; i++) for (let j = i + 1; j < COUNT; j++) {
      const a = bees[i], c = bees[j], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
      if (d >= R * 2 || d < 0.01) continue;
      const nx = dx / d, ny = dy / d, push = (R * 2 - d) / 2;
      if (!a.held) { a.x -= nx * push; a.y -= ny * push; }
      if (!c.held) { c.x += nx * push; c.y += ny * push; }
      const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
      if (rel < 0) { if (!a.held) { a.vx += rel * nx; a.vy += rel * ny; } if (!c.held) { c.vx -= rel * nx; c.vy -= rel * ny; } }
    }
    bees.forEach(draw);
    raf = window.requestAnimationFrame(tick);
  };
  const wake = () => { if (!raf && !home.hidden) { last = window.performance.now(); raf = window.requestAnimationFrame(tick); } };
  bees.forEach((b) => {
    const point = (e) => { const r = home.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    b.el.addEventListener('pointerdown', (e) => {
      const p = point(e);
      b.held = true; b.ox = p.x - b.x; b.oy = p.y - b.y; b.lx = p.x; b.ly = p.y; b.lt = window.performance.now(); b.vx = 0; b.vy = 0;
      b.el.classList.add('is-held');
      try { b.el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      e.preventDefault(); wake();
    });
    b.el.addEventListener('pointermove', (e) => {
      if (!b.held) return;
      const p = point(e), now = window.performance.now(), dt = Math.max(0.008, (now - b.lt) / 1000);
      /* remember how fast the hand is moving so letting go throws the bee */
      b.vx = b.vx * 0.5 + (p.x - b.lx) / dt * 0.5; b.vy = b.vy * 0.5 + (p.y - b.ly) / dt * 0.5;
      b.lx = p.x; b.ly = p.y; b.lt = now;
      b.x = p.x - b.ox; b.y = p.y - b.oy;
      if (Math.abs(b.vx) > 30) b.face = b.vx < 0 ? -1 : 1;
    });
    const drop = () => {
      if (!b.held) return;
      b.held = false; b.el.classList.remove('is-held');
      if (window.performance.now() - b.lt > 120) { b.vx = 0; b.vy = 0; }      /* held still before letting go */
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 1500) { b.vx *= 1500 / sp; b.vy *= 1500 / sp; }
      b.turn = Math.atan2(b.vy, b.vx) || b.turn;
      wake();
    };
    b.el.addEventListener('pointerup', drop); b.el.addEventListener('pointercancel', drop); b.el.addEventListener('lostpointercapture', drop);
  });
  try { new MutationObserver(wake).observe(home, { attributes: true, attributeFilter: ['hidden'] }); } catch (e) { /* ignore */ }
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('scroll', wake, { passive: true });
  wake();
}

/* erase everything this site saved in the browser (two clicks, because confirm boxes are not available) */
const erase = $('btnErase'), msg = $('eraseMsg');
if (erase && msg) {
  let armed = 0;
  erase.addEventListener('click', () => {
    if (Date.now() > armed) {
      armed = Date.now() + 4000;
      erase.textContent = 'Click again to erase everything';
      setTimeout(() => { erase.textContent = 'Erase my saved data'; }, 4000);
      return;
    }
    armed = 0;
    erase.textContent = 'Erase my saved data';
    try { window.localStorage.removeItem('bbz-practice-sim-v1'); window.localStorage.removeItem('bbz-look-v1'); window.localStorage.removeItem('bbz-sound-v1'); } catch (e) { /* storage may be blocked */ }
    msg.textContent = 'Erased from this browser. If the page does not refresh by itself, reload it to start fresh.';
    try { window.location.reload(); } catch (e) { /* ignore */ }
  });
}
})();
