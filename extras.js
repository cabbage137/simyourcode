/* White and black mode, and Java colouring. */
(function () {
'use strict';
const $ = (id) => document.getElementById(id);
const root = document.documentElement;

/* ---------- appearance: white / black mode and font colour ---------- */
const LOOK_KEY = 'bbz-look-v1';
const MODES = ['auto', 'white', 'black'], INKS = ['', 'honey', 'sky', 'mint', 'rose', 'violet'];
const look = { mode: 'auto', ink: '' };
try {
  const raw = JSON.parse(window.localStorage.getItem(LOOK_KEY) || 'null');
  if (raw && typeof raw === 'object') {
    if (MODES.indexOf(raw.mode) >= 0) look.mode = raw.mode;
    if (INKS.indexOf(raw.ink) >= 0) look.ink = raw.ink;
  }
} catch (e) { /* storage may be blocked; the defaults are used */ }
function applyLook(save) {
  if (look.mode === 'auto') root.removeAttribute('data-look'); else root.setAttribute('data-look', look.mode);
  if (look.ink) root.setAttribute('data-ink', look.ink); else root.removeAttribute('data-ink');
  /* the class change tells the simulator to re-read its canvas colours */
  MODES.forEach((m) => root.classList.toggle('look-' + m, m === look.mode));
  document.querySelectorAll('[data-look]').forEach((b) => { if (b !== root) b.setAttribute('aria-pressed', String(b.dataset.look === look.mode)); });
  document.querySelectorAll('[data-ink]').forEach((b) => { if (b !== root) b.setAttribute('aria-pressed', String(b.dataset.ink === look.ink)); });
  if (save) { try { window.localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch (e) { /* ignore */ } }
}
const panel = $('lookPanel'), lookBtn = $('btnLook');
if (panel && lookBtn) {
  lookBtn.addEventListener('click', () => { panel.hidden = !panel.hidden; lookBtn.setAttribute('aria-expanded', String(!panel.hidden)); });
  panel.querySelectorAll('button[data-look]').forEach((b) => b.addEventListener('click', () => { look.mode = MODES.indexOf(b.dataset.look) >= 0 ? b.dataset.look : 'auto'; applyLook(true); }));
  panel.querySelectorAll('button[data-ink]').forEach((b) => b.addEventListener('click', () => { look.ink = INKS.indexOf(b.dataset.ink) >= 0 ? b.dataset.ink : ''; applyLook(true); }));
}
applyLook(false);

/* ---------- Java colouring ---------- */
const KW = new Set(('abstract boolean break byte case catch char class continue default do double else enum extends final finally float for if implements import ' +
  'instanceof int interface long new package private protected public return short static super switch this throw throws try void volatile while').split(' '));
const LIT = new Set(['true', 'false', 'null']);
const isIdStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$';
const isDigit = (c) => c >= '0' && c <= '9';

/* Fills `el` with coloured spans for `code`. */
function paint(el, code) {
  const frag = document.createDocumentFragment();
  let plain = '';
  const flush = () => { if (plain) { frag.append(plain); plain = ''; } };
  const put = (cls, text) => { flush(); const s = document.createElement('span'); s.className = cls; s.textContent = text; frag.append(s); };
  const n = code.length;
  let i = 0, depth = 0;
  while (i < n) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '/') { let j = code.indexOf('\n', i); if (j < 0) j = n; put('hc', code.slice(i, j)); i = j; continue; }
    if (c === '/' && code[i + 1] === '*') { let j = code.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; put('hc', code.slice(i, j)); i = j; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && code[j] !== c && code[j] !== '\n') { if (code[j] === '\\') j++; j++; }
      if (j < n && code[j] === c) j++;
      j = Math.min(j, n);
      put('hs', code.slice(i, j)); i = j; continue;
    }
    if (c === '@' && isIdStart(code[i + 1] || '')) { let j = i + 1; while (j < n && (isIdStart(code[j]) || isDigit(code[j]))) j++; put('ha', code.slice(i, j)); i = j; continue; }
    if (isDigit(c)) { let j = i + 1; while (j < n && (isDigit(code[j]) || isIdStart(code[j]) || code[j] === '.')) j++; put('hn', code.slice(i, j)); i = j; continue; }
    if (isIdStart(c)) {
      let j = i + 1; while (j < n && (isIdStart(code[j]) || isDigit(code[j]))) j++;
      const word = code.slice(i, j);
      let k = j; while (code[k] === ' ') k++;
      if (KW.has(word)) put('hk', word);
      else if (LIT.has(word)) put('hn', word);
      else if (word.length > 1 && /^[A-Z][A-Z0-9_]*$/.test(word)) put('hn', word);
      else if (c >= 'A' && c <= 'Z') put('ht', word);
      else if (code[k] === '(') put('hf', word);
      else plain += word;
      i = j; continue;
    }
    if (c === '(' || c === '[' || c === '{') { put('hb' + (depth % 4), c); depth++; i++; continue; }
    if (c === ')' || c === ']' || c === '}') { depth--; if (depth < 0) { depth = 0; put('hbx', c); } else put('hb' + (depth % 4), c); i++; continue; }
    plain += c; i++;
  }
  flush();
  el.textContent = '';
  el.append(frag);
}

/* editor: a coloured layer sits exactly behind the (transparent-text) typing box */
const ta = $('code'), layer = $('hl'), inner = $('hlIn');
if (ta && layer && inner) {
  let lastVal = null, queued = false;
  const sync = () => { layer.scrollTop = ta.scrollTop; layer.scrollLeft = ta.scrollLeft; };
  const refresh = () => {
    queued = false;
    if (ta.value !== lastVal) { lastVal = ta.value; try { paint(inner, lastVal + '\n\n'); } catch (e) { layer.parentNode.parentNode.classList.remove('hl-on'); return; } }
    sync();
  };
  const soon = () => { if (!queued) { queued = true; setTimeout(refresh, 0); } };
  ta.addEventListener('input', refresh);
  ta.addEventListener('scroll', sync);
  ['progSel', 'newSel', 'btnDelete', 'btnToJava'].forEach((id) => { const el = $(id); if (el) { el.addEventListener('change', soon); el.addEventListener('click', soon); } });
  document.querySelectorAll('.tab, [data-go]').forEach((el) => el.addEventListener('click', soon));
  window.addEventListener('bbz-editor', soon);
  setInterval(refresh, 250);                 /* safety net for any change made without an event */
  refresh();
  layer.parentNode.parentNode.classList.add('hl-on');
}

/* the "Java these blocks make" box and the tutorial samples */
const gen = $('genJava');
if (gen && window.MutationObserver) {
  const obs = new MutationObserver(() => {
    const text = gen.textContent;
    try { paint(gen, text); } catch (e) { gen.textContent = text; }
    obs.takeRecords();
  });
  obs.observe(gen, { childList: true, characterData: true, subtree: true });
}
document.querySelectorAll('pre.java').forEach((p) => { try { paint(p, p.textContent); } catch (e) { /* leave it plain */ } });

})();
