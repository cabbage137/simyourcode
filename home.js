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
