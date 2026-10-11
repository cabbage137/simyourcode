/* Sound effects, all made on the spot with the Web Audio API (no audio files are loaded).
   Browsers only allow sound after the first click or key press, so nothing plays before that. */
(function () {
'use strict';
const BBZ = window.BBZ = window.BBZ || {};
const KEY = 'bbz-sound-v1';
let on = true;
try { on = window.localStorage.getItem(KEY) !== 'off'; } catch (e) { on = true; }
let ac = null, master = null, hiss = null;

function audio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
    hiss = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.4), ac.sampleRate);
    const d = hiss.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') { try { ac.resume(); } catch (e) { /* ignore */ } }
  return ac;
}
/* One note. o: f (start Hz), f2 (end Hz), at (delay s), dur (s), type, vol, cut (low-pass Hz). */
function tone(o) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + (o.at || 0), osc = a.createOscillator(), g = a.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol || 0.15, t + Math.min(0.012, o.dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  let out = g;
  if (o.cut) { const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.cut; g.connect(lp); out = lp; }
  osc.connect(g); out.connect(master);
  osc.start(t); osc.stop(t + o.dur + 0.03);
}
/* A short burst of filtered noise: the "tick" of plastic or a click. */
function burst(o) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + (o.at || 0), src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = hiss; f.type = o.kind || 'bandpass'; f.frequency.value = o.f; f.Q.value = o.q || 1;
  g.gain.setValueAtTime(o.vol || 0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + o.dur + 0.02);
}
const NOTE = { G4: 392, C5: 523.25, E5: 659.25, G5: 783.99 };
const S = {
  click() { tone({ f: 1500, f2: 950, dur: 0.035, type: 'triangle', vol: 0.11 }); },
  lift() { tone({ f: 420, f2: 640, dur: 0.07, type: 'triangle', vol: 0.09 }); },
  /* two plastic bricks pressing together: a bright tick, then a lower, fuller clack */
  snap() {
    burst({ f: 3600, q: 1.2, dur: 0.018, vol: 0.4 });
    tone({ f: 2300, f2: 1700, dur: 0.02, type: 'square', vol: 0.05 });
    burst({ at: 0.05, f: 1500, q: 1.6, dur: 0.035, vol: 0.55 });
    tone({ at: 0.05, f: 640, f2: 420, dur: 0.05, type: 'triangle', vol: 0.14 });
  },
  count() { tone({ f: 880, dur: 0.17, type: 'square', vol: 0.1, cut: 2600 }); },
  /* the classic "charge" bugle call that starts a period */
  charge() {
    [['G4', 0.11], ['C5', 0.11], ['E5', 0.11], ['G5', 0.2], ['E5', 0.11], ['G5', 0.5]].reduce((at, n) => {
      tone({ at, f: NOTE[n[0]], dur: n[1] + 0.03, type: 'sawtooth', vol: 0.13, cut: 2400 });
      return at + n[1];
    }, 0);
  },
  buzzer() { tone({ f: 124, dur: 0.75, type: 'square', vol: 0.13, cut: 1400 }); tone({ f: 127, dur: 0.75, type: 'sawtooth', vol: 0.1, cut: 1400 }); },
  buzzerLong() { tone({ f: 118, dur: 1.4, type: 'square', vol: 0.14, cut: 1400 }); tone({ f: 121, dur: 1.4, type: 'sawtooth', vol: 0.11, cut: 1400 }); },
  endgame() { [0, 0.18, 0.36].forEach((at) => tone({ at, f: 1250, dur: 0.11, type: 'square', vol: 0.09, cut: 3000 })); },
  tip() { [660, 880, 1320].forEach((f, i) => tone({ at: i * 0.07, f, dur: 0.22, type: 'sine', vol: 0.13 })); },
  error() { tone({ f: 210, f2: 140, dur: 0.2, type: 'square', vol: 0.09, cut: 1200 }); }
};

function showState() {
  document.querySelectorAll('[data-sound]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.sound === 'on') === on)));
}
BBZ.Sound = {
  play(name) { if (!on || !S[name]) return; try { S[name](); } catch (e) { /* never let a sound break the page */ } },
  isOn: () => on,
  set(v) { on = !!v; try { window.localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ } showState(); }
};

/* Sounds for ordinary clicks: a short tick for tabs, buttons, lists and checkboxes.
   The drive pad and block gaps stay silent so they are not noisy while you work. */
document.addEventListener('click', (e) => {
  const t = e.target;
  if (!t || !t.closest) return;
  const snd = t.closest('[data-sound]');
  if (snd) { BBZ.Sound.set(snd.dataset.sound === 'on'); BBZ.Sound.play('click'); return; }
  if (t.closest('.pb, .stick, .slot, .pal-btn, #code')) return;
  if (t.closest('button, select, input[type="checkbox"], input[type="range"], a')) BBZ.Sound.play('click');
}, true);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showState); else showState();
})();
