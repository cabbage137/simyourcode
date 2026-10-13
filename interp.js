/* Runs the Java code students write. */
(function () {
'use strict';
const BBZ = window.BBZ = window.BBZ || {};

class JavaError extends Error {
  constructor(msg, line) { super(msg); this.name = 'JavaError'; this.line = line || 0; }
}

const MODS = new Set(['public', 'private', 'protected', 'static', 'final', 'abstract', 'volatile', 'transient', 'synchronized']);
const PRIMS = new Set(['int', 'double', 'float', 'long', 'short', 'byte', 'char', 'boolean', 'void']);
const INT_TYPES = new Set(['int', 'long', 'short', 'byte', 'Integer', 'Long']);
const NUM_TYPES = new Set(['int', 'long', 'short', 'byte', 'double', 'float', 'Integer', 'Long', 'Double', 'Float']);
const OPS2 = ['==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '<<', '>>'];
const OPS1 = '{}()[];,.=+-*/%<>!?:&|^~';

/* ---------- tokenizer ---------- */
function tokenize(src) {
  const toks = [];
  const n = src.length;
  let i = 0, line = 1;
  const idStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$';
  const digit = (c) => c >= '0' && c <= '9';
  const idPart = (c) => idStart(c) || digit(c);
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '﻿') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const start = line; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
      if (i >= n) throw new JavaError('This /* comment is never closed with */', start);
      i += 2; continue;
    }
    if (idStart(c)) {
      let j = i + 1; while (j < n && idPart(src[j])) j++;
      toks.push({ k: 'id', v: src.slice(i, j), line }); i = j; continue;
    }
    if (digit(c) || (c === '.' && digit(src[i + 1] || ''))) {
      let j = i, isInt = true;
      if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
        j = i + 2; while (j < n && /[0-9a-fA-F]/.test(src[j])) j++;
        const v = parseInt(src.slice(i + 2, j), 16) || 0;
        if (src[j] === 'L' || src[j] === 'l') j++;
        toks.push({ k: 'num', v, int: true, line }); i = j; continue;
      }
      while (j < n && (digit(src[j]) || src[j] === '_')) j++;
      if (src[j] === '.' && digit(src[j + 1] || '')) { isInt = false; j++; while (j < n && digit(src[j])) j++; }
      if (src[j] === 'e' || src[j] === 'E') {
        let k = j + 1; if (src[k] === '+' || src[k] === '-') k++;
        if (digit(src[k] || '')) { isInt = false; j = k; while (j < n && digit(src[j])) j++; }
      }
      const text = src.slice(i, j).replace(/_/g, '');
      const suf = src[j] || '';
      if (suf === 'f' || suf === 'F' || suf === 'd' || suf === 'D') { isInt = false; j++; }
      else if (suf === 'l' || suf === 'L') j++;
      toks.push({ k: 'num', v: parseFloat(text), int: isInt, line }); i = j; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < n && src[j] !== c) {
        if (src[j] === '\n') break;
        if (src[j] === '\\') { j++; const e = src[j]; s += e === 'n' ? '\n' : e === 't' ? '\t' : (e === undefined ? '' : e); j++; }
        else s += src[j++];
      }
      if (j >= n || src[j] !== c) throw new JavaError('This text is missing its closing quote ' + c, line);
      toks.push({ k: 'str', v: s, line }); i = j + 1; continue;
    }
    if (c === '@') {                       // annotations are skipped
      let j = i + 1; while (j < n && (idPart(src[j]) || src[j] === '.')) j++;
      let k = j; while (k < n && (src[k] === ' ' || src[k] === '\t')) k++;
      if (src[k] === '(') {
        let depth = 0;
        while (k < n) {
          const ch = src[k];
          if (ch === '"') { k++; while (k < n && src[k] !== '"' && src[k] !== '\n') { if (src[k] === '\\') k++; k++; } }
          else if (ch === '(') depth++;
          else if (ch === ')') { depth--; if (depth === 0) { k++; break; } }
          else if (ch === '\n') line++;
          k++;
        }
        j = k;
      }
      i = j; continue;
    }
    const two = src.substr(i, 2);
    if (OPS2.indexOf(two) >= 0) { toks.push({ k: 'p', v: two, line }); i += 2; continue; }
    if (OPS1.indexOf(c) >= 0) { toks.push({ k: 'p', v: c, line }); i++; continue; }
    throw new JavaError('Unexpected character "' + c + '"', line);
  }
  toks.push({ k: 'eof', v: '', line });
  return toks;
}

/* ---------- parser ---------- */
function parse(src) {
  const t = tokenize(String(src));
  let p = 0;
  const tk = (o) => t[Math.min(p + (o || 0), t.length - 1)];
  const isP = (v, o) => { const x = tk(o); return x.k === 'p' && x.v === v; };
  const isW = (v, o) => { const x = tk(o); return x.k === 'id' && x.v === v; };
  const desc = (x) => x.k === 'eof' ? 'the end of the program' : x.k === 'str' ? 'the text "' + x.v + '"' : '"' + x.v + '"';
  const fail = (m, line) => { throw new JavaError(m, line || tk().line); };
  const eatP = (v) => { if (isP(v)) { p++; return true; } return false; };
  const needP = (v, why) => {
    if (!isP(v)) fail('Expected "' + v + '"' + (why ? ' ' + why : '') + ' but found ' + desc(tk()) + '.');
    return t[p++];
  };
  const needSemi = () => {
    if (!isP(';')) fail('Missing semicolon ";" at the end of this line.', t[Math.max(0, p - 1)].line);
    p++;
  };
  const needId = (what) => {
    const x = tk();
    if (x.k !== 'id') fail('Expected ' + what + ' but found ' + desc(x) + '.');
    p++; return x.v;
  };

  function parseType() {
    let name = needId('a type name');
    while (isP('.') && tk(1).k === 'id' && tk(1).v !== 'class') { p += 2; name = t[p - 1].v; }
    if (isP('<')) {
      let d = 0;
      do {
        if (tk().k === 'eof') fail('This "<" is never closed with ">".');
        if (isP('<')) d++; else if (isP('>')) d--; else if (isP('>>')) d -= 2;
        p++;
      } while (d > 0);
    }
    let dims = 0;
    while (isP('[') && isP(']', 1)) { p += 2; dims++; }
    return { name, dims };
  }

  function looksLikeDecl() {
    const x = tk();
    if (x.k !== 'id') return false;
    if (x.v === 'final' || PRIMS.has(x.v)) return true;
    const save = p;
    try {
      parseType();
      return tk().k === 'id' && (isP('=', 1) || isP(';', 1) || isP(',', 1) || isP(':', 1) || isP('[', 1));
    } catch (e) { return false; } finally { p = save; }
  }

  function parseArrLit() {
    const line = tk().line; needP('{');
    const items = [];
    if (!isP('}')) { do { if (isP('}')) break; items.push(isP('{') ? parseArrLit() : parseExpr()); } while (eatP(',')); }
    needP('}', 'to close the list');
    return { k: 'ArrLit', items, line };
  }

  function parseVarDecl() {
    const line = tk().line;
    while (isW('final')) p++;
    const type = parseType();
    if (type.name === 'void') fail('"void" can only be used as a method return type.');
    const decls = [];
    do {
      const name = needId('a variable name');
      let dims = type.dims;
      while (isP('[') && isP(']', 1)) { p += 2; dims++; }
      let init = null;
      if (eatP('=')) init = isP('{') ? parseArrLit() : parseExpr();
      decls.push({ name, init, type: { name: type.name, dims } });
    } while (eatP(','));
    return { k: 'Var', decls, line };
  }

  function parseBlock() {
    const line = tk().line; needP('{');
    const body = [];
    while (!isP('}')) {
      if (tk().k === 'eof') fail('This "{" is never closed with "}".', line);
      body.push(parseStmt());
    }
    p++;
    return { k: 'Block', body, line };
  }

  function parseStmt() {
    const x = tk(), line = x.line;
    if (x.k === 'p') {
      if (x.v === '{') return parseBlock();
      if (x.v === ';') { p++; return { k: 'Empty', line }; }
    }
    if (x.k === 'id') {
      switch (x.v) {
        case 'if': {
          p++; needP('(', 'after "if"'); const c = parseExpr(); needP(')', 'to close the "if" condition');
          const a = parseStmt(); let b = null;
          if (isW('else')) { p++; b = parseStmt(); }
          return { k: 'If', c, a, b, line };
        }
        case 'while': {
          p++; needP('(', 'after "while"'); const c = parseExpr(); needP(')', 'to close the "while" condition');
          return { k: 'While', c, body: parseStmt(), line };
        }
        case 'do': {
          p++; const body = parseStmt();
          if (!isW('while')) fail('A "do" loop needs "while (...)" after its block.');
          p++; needP('('); const c = parseExpr(); needP(')'); needSemi();
          return { k: 'DoWhile', c, body, line };
        }
        case 'for': {
          p++; needP('(', 'after "for"');
          if (looksLikeDecl()) {
            const save = p;
            while (isW('final')) p++;
            const ty = parseType();
            if (tk().k === 'id' && isP(':', 1)) {
              const name = t[p].v; p += 2;
              const it = parseExpr(); needP(')');
              return { k: 'ForEach', type: ty, name, it, body: parseStmt(), line };
            }
            p = save;
          }
          let init = null;
          if (!isP(';')) {
            if (looksLikeDecl()) init = parseVarDecl();
            else { const list = []; do list.push(parseExpr()); while (eatP(',')); init = { k: 'ExprList', list, line }; }
          }
          needSemi();
          let c = null; if (!isP(';')) c = parseExpr();
          needSemi();
          const upd = [];
          if (!isP(')')) { do upd.push(parseExpr()); while (eatP(',')); }
          needP(')', 'to close the "for" header');
          return { k: 'For', init, c, upd, body: parseStmt(), line };
        }
        case 'return': { p++; let v = null; if (!isP(';')) v = parseExpr(); needSemi(); return { k: 'Return', v, line }; }
        case 'break': p++; needSemi(); return { k: 'Break', line };
        case 'continue': p++; needSemi(); return { k: 'Continue', line };
        case 'try': {
          p++; const body = parseBlock(); let fin = null;
          while (isW('catch')) {
            p++; needP('(');
            let d = 1;
            while (d > 0) { if (tk().k === 'eof') fail('Unclosed "(" after catch.'); if (isP('(')) d++; else if (isP(')')) d--; p++; }
            parseBlock();
          }
          if (isW('finally')) { p++; fin = parseBlock(); }
          return { k: 'Try', body, fin, line };
        }
        case 'else': fail('"else" needs an "if" right before it.'); break;
        case 'switch': case 'throw': case 'synchronized': case 'case':
          fail('"' + x.v + '" is not supported in this simulator yet. Use if / else instead.'); break;
        case 'class': case 'enum': case 'interface':
          fail('Declaring a ' + x.v + ' inside a method is not supported in this simulator.'); break;
      }
      if (looksLikeDecl()) { const d = parseVarDecl(); needSemi(); return d; }
    }
    const e = parseExpr(); needSemi();
    return { k: 'Expr', e, line };
  }

  const ASSIGN = new Set(['=', '+=', '-=', '*=', '/=', '%=']);
  const LEVELS = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];

  function parseExpr() {
    const left = parseTernary();
    const x = tk();
    if (x.k === 'p' && ASSIGN.has(x.v)) {
      if (left.k !== 'Id' && left.k !== 'Field' && left.k !== 'Index') fail('The left side of "' + x.v + '" must be a variable.');
      p++;
      return { k: 'Assign', op: x.v, target: left, v: parseExpr(), line: x.line };
    }
    return left;
  }
  function parseTernary() {
    const c = parseBin(0);
    if (isP('?')) {
      const line = tk().line; p++;
      const a = parseExpr(); needP(':', 'in the ? : expression');
      const b = parseExpr();
      return { k: 'Tern', c, a, b, line };
    }
    return c;
  }
  function parseBin(lv) {
    if (lv >= LEVELS.length) return parseUnary();
    let l = parseBin(lv + 1);
    for (;;) {
      const x = tk();
      if (x.k === 'p' && LEVELS[lv].indexOf(x.v) >= 0) {
        p++;
        l = { k: 'Bin', op: x.v, l, r: parseBin(lv + 1), line: x.line };
      } else return l;
    }
  }
  function tryCast() {
    if (tk(1).k !== 'id') return null;
    let q = p + 1, name = t[q].v; q++;
    while (t[q].k === 'p' && t[q].v === '.' && t[q + 1].k === 'id') { name = t[q + 1].v; q += 2; }
    if (!(t[q].k === 'p' && t[q].v === ')')) return null;
    const after = t[q + 1];
    const startsValue = after.k === 'id' || after.k === 'num' || after.k === 'str' ||
      (after.k === 'p' && (after.v === '(' || after.v === '!' || after.v === '~'));
    if (PRIMS.has(name)) { if (!(startsValue || (after.k === 'p' && (after.v === '-' || after.v === '+')))) return null; }
    else if (!(/^[A-Z]/.test(name) && /[a-z]/.test(name) && startsValue)) return null;
    const line = tk().line;
    p = q + 1;
    return { k: 'Cast', type: name, e: parseUnary(), line };
  }
  function parseUnary() {
    const x = tk();
    if (x.k === 'p') {
      if (x.v === '-' || x.v === '+' || x.v === '!' || x.v === '~') {
        p++; const e = parseUnary();
        if (x.v === '-' && e.k === 'Num') return { k: 'Num', v: -e.v, int: e.int, line: x.line };
        return { k: 'Un', op: x.v, e, line: x.line };
      }
      if (x.v === '++' || x.v === '--') { p++; return { k: 'IncDec', op: x.v, prefix: true, target: parseUnary(), line: x.line }; }
      if (x.v === '(') { const c = tryCast(); if (c) return c; }
    }
    return parsePostfix();
  }
  function parseArgs() {
    const a = []; needP('(');
    if (!isP(')')) { do a.push(parseExpr()); while (eatP(',')); }
    needP(')', 'to close the brackets');
    return a;
  }
  function parsePrimary() {
    const x = tk(), line = x.line;
    if (x.k === 'num') { p++; return { k: 'Num', v: x.v, int: x.int, line }; }
    if (x.k === 'str') { p++; return { k: 'Str', v: x.v, line }; }
    if (x.k === 'p' && x.v === '(') { p++; const e = parseExpr(); needP(')', 'to close the brackets'); return e; }
    if (x.k === 'id') {
      p++;
      switch (x.v) {
        case 'true': return { k: 'Bool', v: true, line };
        case 'false': return { k: 'Bool', v: false, line };
        case 'null': return { k: 'Null', line };
        case 'this': return { k: 'This', line };
        case 'new': {
          const type = parseType();
          if (type.dims > 0) { const lit = parseArrLit(); lit.elem = type.name; return lit; }
          if (isP('[')) { p++; const size = parseExpr(); needP(']'); return { k: 'NewArr', type: type.name, size, line }; }
          const args = parseArgs();
          if (isP('{')) fail('Anonymous classes are not supported in this simulator.');
          return { k: 'New', type: type.name, args, line };
        }
      }
      if (isP('(')) return { k: 'Call', obj: null, name: x.v, args: parseArgs(), line };
      return { k: 'Id', name: x.v, line };
    }
    return fail('A value was expected here but I found ' + desc(x) + '.');
  }
  function parsePostfix() {
    let e = parsePrimary();
    for (;;) {
      const x = tk();
      if (x.k !== 'p') return e;
      if (x.v === '.') {
        p++; const name = needId('a name after "."');
        if (name === 'class') { e = { k: 'ClassLit', name: e.name || '?', line: x.line }; continue; }
        if (isP('(')) e = { k: 'Call', obj: e, name, args: parseArgs(), line: x.line };
        else e = { k: 'Field', obj: e, name, line: x.line };
      } else if (x.v === '[') {
        p++; const idx = parseExpr(); needP(']');
        e = { k: 'Index', obj: e, idx, line: x.line };
      } else if (x.v === '++' || x.v === '--') {
        p++; e = { k: 'IncDec', op: x.v, prefix: false, target: e, line: x.line };
      } else return e;
    }
  }

  /* file header */
  while (isW('package') || isW('import')) {
    while (!isP(';')) { if (tk().k === 'eof') fail('Missing ";" after the import line.'); p++; }
    p++;
  }
  while (tk().k === 'id' && MODS.has(tk().v)) p++;
  if (!isW('class')) fail('A program starts with a class, like:  public class MyOpMode extends LinearOpMode { ... }');
  p++;
  const cname = needId('a class name');
  let base = 'LinearOpMode';
  if (isW('extends')) { p++; base = parseType().name; }
  if (isW('implements')) { p++; do parseType(); while (eatP(',')); }
  const cl = tk().line;
  needP('{', 'after the class name');
  const fields = [], methods = new Map();
  while (!isP('}')) {
    if (tk().k === 'eof') fail('The class is missing its closing "}". Count your { and } brackets.', cl);
    if (eatP(';')) continue;
    const line = tk().line;
    while (tk().k === 'id' && MODS.has(tk().v)) p++;
    if (isW('class') || isW('enum') || isW('interface')) fail('Nested classes and enums are not supported in this simulator.');
    if (tk().k === 'id' && isP('(', 1)) fail('Constructors are not supported. Put your setup code at the top of runOpMode().');
    const save = p;
    const type = parseType();
    const name = needId('a name');
    if (isP('(')) {
      p++;
      const params = [];
      if (!isP(')')) {
        do {
          while (isW('final')) p++;
          const pt = parseType(); const pn = needId('a parameter name');
          let dims = pt.dims; while (isP('[') && isP(']', 1)) { p += 2; dims++; }
          params.push({ name: pn, type: { name: pt.name, dims } });
        } while (eatP(','));
      }
      needP(')', 'to close the parameter list');
      if (isW('throws')) { p++; do parseType(); while (eatP(',')); }
      const body = parseBlock();
      if (methods.has(name)) fail('There are two methods named "' + name + '". Give each method its own name.', line);
      methods.set(name, { name, params, ret: type, body, line });
    } else {
      p = save;
      const d = parseVarDecl(); needSemi();
      fields.push(d);
    }
  }
  return { name: cname, base, fields, methods };
}

/* ---------- formatting helpers ---------- */
function fmtDouble(v) {
  if (!isFinite(v)) return isNaN(v) ? 'NaN' : (v > 0 ? 'Infinity' : '-Infinity');
  if (Number.isInteger(v) && Math.abs(v) < 1e7) return v.toFixed(1);
  return String(v);
}
function jstr(v, isInt) {
  if (typeof v === 'number') return isInt ? String(v) : fmtDouble(v);
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v === null) return 'null';
  if (v === undefined) return '';
  if (v instanceof StaticRef) return v.name;
  if (v.arr) return '[' + v.arr.map((x) => jstr(x, v.int)).join(', ') + ']';
  if (typeof v.__s === 'function') return v.__s();
  return v.__t || 'object';
}
function javaFormat(fmt, args, ints) {
  let i = 0;
  return String(fmt).replace(/%([-+0,]*)(\d+)?(?:\.(\d+))?([a-zA-Z%])/g, (m, flags, width, prec, conv) => {
    if (conv === '%') return '%';
    if (conv === 'n') return '\n';
    const v = args[i], isI = ints ? ints[i] : false; i++;
    let s;
    if (conv === 'd') s = String(Math.trunc(Number(v)));
    else if (conv === 'f') s = Number(v).toFixed(prec === undefined ? 6 : Math.min(12, +prec));
    else if (conv === 'e') s = Number(v).toExponential(prec === undefined ? 6 : Math.min(12, +prec));
    else s = jstr(v, isI);
    if (flags.indexOf('+') >= 0 && (conv === 'd' || conv === 'f') && Number(v) >= 0) s = '+' + s;
    if (width) { const w = Math.min(40, +width); s = flags.indexOf('-') >= 0 ? s.padEnd(w) : s.padStart(w, flags.indexOf('0') >= 0 ? '0' : ' '); }
    return s;
  });
}

class StaticRef { constructor(name) { this.name = name; } }

class Scope {
  constructor(parent) { this.v = new Map(); this.parent = parent || null; }
  find(name) { let s = this; while (s) { const x = s.v.get(name); if (x) return x; s = s.parent; } return null; }
  declare(name, type, value, line) {
    if (this.v.has(name)) throw new JavaError('The variable "' + name + '" is already declared here.', line);
    const slot = { v: value, int: type.dims === 0 && INT_TYPES.has(type.name), type };
    this.v.set(name, slot);
    return slot;
  }
}

const SLICE = { slice: true };
const BRK = { brk: true }, CNT = { cnt: true };
const BUDGET = 3000;
const ARITH = new Set(['+', '-', '*', '/', '%', '&', '|', '^', '<<', '>>']);
const INT_METHODS = new Set(['getCurrentPosition', 'getTargetPosition', 'length', 'round', 'size', 'getPortNumber', 'indexOf', 'parseInt']);

/* ---------- interpreter ---------- */
function start(src, host) {
  const cls = parse(src);
  const rt = { line: 0, steps: 0, depth: 0 };
  const T = (name) => ({ name, dims: 0 });
  const cscope = new Scope(null);
  cscope.declare('hardwareMap', T('HardwareMap'), host.hardwareMap);
  cscope.declare('telemetry', T('Telemetry'), host.telemetry);
  cscope.declare('gamepad1', T('Gamepad'), host.gamepad1);
  cscope.declare('gamepad2', T('Gamepad'), host.gamepad2);
  const THIS = { __t: cls.name, __m: Object.create(null) };

  const err = (msg, n) => new JavaError(msg, (n && n.line) || rt.line);
  const show = (v) => v === undefined ? 'nothing (that method returns void)' : v === null ? 'null'
    : typeof v === 'string' ? 'the text "' + v + '"' : typeof v === 'number' ? 'the number ' + v
    : typeof v === 'boolean' ? String(v) : v instanceof StaticRef ? v.name : v.arr ? 'an array' : 'a ' + (v.__t || 'object');
  const num = (v, n) => { if (typeof v !== 'number') throw err('A number was expected here, but I got ' + show(v) + '.', n); return v; };
  const nullMsg = (objNode) => {
    const nm = objNode && objNode.k === 'Id' ? '"' + objNode.name + '"' : 'This value';
    return nm + ' is null (empty). Did you forget to set it with hardwareMap.get(...) before using it?';
  };
  const defaultFor = (type) => type.dims > 0 ? null : NUM_TYPES.has(type.name) ? 0 : type.name === 'boolean' ? false : null;

  function isInt(n, sc) {
    if (n._i !== undefined) return n._i;
    let r = false, s;
    switch (n.k) {
      case 'Num': r = n.int; break;
      case 'Id': s = sc.find(n.name); r = !!(s && s.int); break;
      case 'Field':
        if (n.obj.k === 'This') { s = cscope.find(n.name); r = !!(s && s.int); }
        else r = n.name === 'length' || n.name === 'id' || ((n.name === 'MAX_VALUE' || n.name === 'MIN_VALUE') && n.obj.k === 'Id' && n.obj.name === 'Integer');
        break;
      case 'Index': if (n.obj.k === 'Id') { s = sc.find(n.obj.name); r = !!(s && s.type.dims > 0 && INT_TYPES.has(s.type.name)); } break;
      case 'Un': r = n.op !== '!' && isInt(n.e, sc); break;
      case 'IncDec': r = isInt(n.target, sc); break;
      case 'Bin': r = ARITH.has(n.op) && isInt(n.l, sc) && isInt(n.r, sc); break;
      case 'Assign': r = isInt(n.target, sc); break;
      case 'Tern': r = isInt(n.a, sc) && isInt(n.b, sc); break;
      case 'Cast': r = INT_TYPES.has(n.type) || n.type === 'char'; break;
      case 'Call':
        if (!n.obj || n.obj.k === 'This') { const m = cls.methods.get(n.name); r = !!(m && m.ret.dims === 0 && INT_TYPES.has(m.ret.name)); }
        else if (INT_METHODS.has(n.name)) r = true;
        else if (n.obj.k === 'Id' && n.obj.name === 'Math' && (n.name === 'abs' || n.name === 'max' || n.name === 'min')) r = n.args.every((a) => isInt(a, sc));
        break;
    }
    n._i = r;
    return r;
  }

  function coerce(v, type, node, sc, name) {
    if (type.dims > 0) return v;
    if (INT_TYPES.has(type.name)) {
      if (typeof v !== 'number') throw err('"' + name + '" is a whole number (' + type.name + '), but you are giving it ' + show(v) + '.', node);
      if (!isInt(node, sc)) throw err('"' + name + '" is an ' + type.name + ' (whole number) but you are giving it a decimal value. Use double instead, or convert with (int).', node);
      return v;
    }
    if (type.name === 'double' || type.name === 'float') {
      if (typeof v !== 'number') throw err('"' + name + '" is a number (' + type.name + '), but you are giving it ' + show(v) + '.', node);
    } else if (type.name === 'boolean') {
      if (typeof v !== 'boolean') throw err('"' + name + '" is a boolean (true/false), but you are giving it ' + show(v) + '.', node);
    }
    return v;
  }

  function binop(op, a, b, n, sc, ln, rn) {
    switch (op) {
      case '+':
        if (typeof a === 'string' || typeof b === 'string') return jstr(a, isInt(ln, sc)) + jstr(b, isInt(rn, sc));
        return num(a, n) + num(b, n);
      case '-': return num(a, n) - num(b, n);
      case '*': return num(a, n) * num(b, n);
      case '/': {
        const x = num(a, n), y = num(b, n);
        if (isInt(ln, sc) && isInt(rn, sc)) {
          if (y === 0) throw err('Division by zero. A whole number cannot be divided by 0.', n);
          return Math.trunc(x / y);
        }
        return x / y;
      }
      case '%': {
        const x = num(a, n), y = num(b, n);
        if (y === 0 && isInt(ln, sc) && isInt(rn, sc)) throw err('Division by zero in "%".', n);
        return x % y;
      }
      case '==': return a === b;
      case '!=': return a !== b;
      case '<': return num(a, n) < num(b, n);
      case '>': return num(a, n) > num(b, n);
      case '<=': return num(a, n) <= num(b, n);
      case '>=': return num(a, n) >= num(b, n);
      case '&': return typeof a === 'boolean' ? (a && b === true) : (num(a, n) & num(b, n));
      case '|': return typeof a === 'boolean' ? (a || b === true) : (num(a, n) | num(b, n));
      case '^': return typeof a === 'boolean' ? (a !== b) : (num(a, n) ^ num(b, n));
      case '<<': return num(a, n) << num(b, n);
      case '>>': return num(a, n) >> num(b, n);
    }
    throw err('Unknown operator ' + op, n);
  }

  function arrGet(a, i, n) {
    if (a === null || a === undefined) throw err(nullMsg(n.obj), n);
    if (!a.arr) throw err('The [ ] brackets only work on arrays.', n);
    if (typeof i !== 'number' || !Number.isInteger(i)) throw err('An array position must be a whole number.', n);
    if (i < 0 || i >= a.arr.length) throw err('Array position ' + i + ' is outside the array (it has ' + a.arr.length + ' items, numbered 0 to ' + (a.arr.length - 1) + ').', n);
    return a.arr[i];
  }

  function getField(o, n) {
    if (o === null || o === undefined) throw err(nullMsg(n.obj), n);
    if (o instanceof StaticRef) {
      if (o.name === 'Math') { if (n.name === 'PI') return Math.PI; if (n.name === 'E') return Math.E; }
      if (o.name === 'Integer') { if (n.name === 'MAX_VALUE') return 2147483647; if (n.name === 'MIN_VALUE') return -2147483648; }
      if (o.name === 'Double') { if (n.name === 'MAX_VALUE') return Number.MAX_VALUE; if (n.name === 'POSITIVE_INFINITY') return Infinity; if (n.name === 'NEGATIVE_INFINITY') return -Infinity; }
      if (/^[A-Z][A-Z0-9_]*$/.test(n.name)) return n.name;          // enum constant
      return new StaticRef(o.name + '.' + n.name);
    }
    if (o.arr && !o.__m) { if (n.name === 'length') return o.arr.length; throw err('Arrays only have .length', n); }
    if (typeof o === 'string') throw err('Text has no field "' + n.name + '". Did you mean ' + n.name + '() ?', n);
    if (typeof o !== 'object') throw err('A ' + typeof o + ' has no field "' + n.name + '".', n);
    const g = o.__f && o.__f[n.name];
    if (typeof g === 'function') return g();
    throw err((o.__t || 'This object') + ' has no field called "' + n.name + '".' + (o.__m && o.__m[n.name] ? ' Did you mean ' + n.name + '() ?' : ''), n);
  }

  function construct(type) {
    if (type === 'ElapsedTime') {
      let t0 = host.now();
      const M = Object.create(null);
      M.reset = () => { t0 = host.now(); };
      M.seconds = () => host.now() - t0;
      M.time = M.seconds;
      M.milliseconds = () => (host.now() - t0) * 1000;
      M.startTime = () => t0;
      return { __t: 'ElapsedTime', __m: M, __s: () => (host.now() - t0).toFixed(2) + ' seconds' };
    }
    return { __t: type, __m: Object.create(null) };
  }

  function strCall(s, n, a) {
    switch (n.name) {
      case 'equals': return s === a[0];
      case 'equalsIgnoreCase': return typeof a[0] === 'string' && s.toLowerCase() === a[0].toLowerCase();
      case 'length': return s.length;
      case 'isEmpty': return s.length === 0;
      case 'contains': return s.indexOf(String(a[0])) >= 0;
      case 'startsWith': return s.startsWith(String(a[0]));
      case 'endsWith': return s.endsWith(String(a[0]));
      case 'indexOf': return s.indexOf(String(a[0]));
      case 'toUpperCase': return s.toUpperCase();
      case 'toLowerCase': return s.toLowerCase();
      case 'trim': return s.trim();
      case 'toString': return s;
    }
    throw err('Text has no method called ' + n.name + '() in this simulator.', n);
  }

  function* staticCall(c, n, a, ints) {
    const name = n.name;
    const N = (i) => num(a[i], n);
    if (c === 'Math') {
      switch (name) {
        case 'abs': return Math.abs(N(0));
        case 'max': return Math.max(N(0), N(1));
        case 'min': return Math.min(N(0), N(1));
        case 'sqrt': return Math.sqrt(N(0));
        case 'cbrt': return Math.cbrt(N(0));
        case 'pow': return Math.pow(N(0), N(1));
        case 'sin': return Math.sin(N(0));
        case 'cos': return Math.cos(N(0));
        case 'tan': return Math.tan(N(0));
        case 'asin': return Math.asin(N(0));
        case 'acos': return Math.acos(N(0));
        case 'atan': return Math.atan(N(0));
        case 'atan2': return Math.atan2(N(0), N(1));
        case 'hypot': return Math.hypot(N(0), N(1));
        case 'toRadians': return N(0) * Math.PI / 180;
        case 'toDegrees': return N(0) * 180 / Math.PI;
        case 'signum': return Math.sign(N(0));
        case 'round': return Math.round(N(0));
        case 'floor': return Math.floor(N(0));
        case 'ceil': return Math.ceil(N(0));
        case 'exp': return Math.exp(N(0));
        case 'log': return Math.log(N(0));
        case 'random': return Math.random();
      }
    } else if (c === 'Range') {
      if (name === 'clip') return Math.min(Math.max(N(0), N(1)), N(2));
      if (name === 'scale') return N(3) + (N(0) - N(1)) * (N(4) - N(3)) / (N(2) - N(1));
    } else if (c === 'String') {
      if (name === 'format') return javaFormat(a[0], a.slice(1), ints.slice(1));
      if (name === 'valueOf') return jstr(a[0], ints[0]);
    } else if (c === 'Thread') {
      if (name === 'sleep') { const ms = N(0); if (ms > 0) yield { wait: ms / 1000 }; return undefined; }
    } else if (c === 'System.out') {
      if (name === 'println' || name === 'print') { host.log(a.length ? jstr(a[0], ints[0]) : ''); return undefined; }
    } else if (c === 'System') {
      if (name === 'currentTimeMillis') return Math.round(host.now() * 1000);
      if (name === 'nanoTime') return Math.round(host.now() * 1e9);
    } else if (c === 'Integer') {
      if (name === 'parseInt') { const v = parseInt(String(a[0]), 10); if (isNaN(v)) throw err('"' + a[0] + '" is not a whole number.', n); return v; }
    } else if (c === 'Double') {
      if (name === 'parseDouble') { const v = parseFloat(String(a[0])); if (isNaN(v)) throw err('"' + a[0] + '" is not a number.', n); return v; }
      if (name === 'isNaN') return isNaN(N(0));
    }
    if (typeof host.statics === 'function') { const r = host.statics(c, name, a); if (r !== undefined) return r; }
    throw err('This simulator does not know ' + c + '.' + name + '(). Check the spelling.', n);
  }

  function* builtin(n, a) {
    switch (n.name) {
      case 'waitForStart': while (!host.isStarted() && !host.isStopRequested()) yield SLICE; return undefined;
      case 'opModeIsActive': yield SLICE; return host.isStarted() && !host.isStopRequested();
      case 'opModeInInit': yield SLICE; return !host.isStarted() && !host.isStopRequested();
      case 'isStopRequested': return host.isStopRequested();
      case 'isStarted': return host.isStarted();
      case 'sleep': { const ms = num(a[0], n); if (ms > 0) yield { wait: ms / 1000 }; return undefined; }
      case 'idle': yield SLICE; return undefined;
      case 'getRuntime': return host.now();
      case 'resetRuntime': return undefined;
      case 'requestOpModeStop': case 'terminateOpModeNow': host.requestStop(); yield SLICE; return undefined;
    }
    throw err('There is no method called ' + n.name + '(). Check the spelling, or write it yourself as a helper method.', n);
  }

  function* callUser(m, args, n) {
    if (args.length !== m.params.length) throw err(m.name + '() needs ' + m.params.length + ' value(s) in its brackets, but it got ' + args.length + '.', n);
    if (++rt.depth > 120) throw err('Too many nested method calls. Does ' + m.name + '() call itself forever?', n);
    const s = new Scope(cscope);
    for (let i = 0; i < m.params.length; i++) {
      const pr = m.params[i]; let v = args[i];
      if (pr.type.dims === 0 && NUM_TYPES.has(pr.type.name)) {
        if (typeof v !== 'number') throw err(m.name + '() expects a number for "' + pr.name + '" but got ' + show(v) + '.', n);
        if (INT_TYPES.has(pr.type.name)) v = Math.trunc(v);
      }
      s.declare(pr.name, pr.type, v, m.line);
    }
    const r = yield* exec(m.body, s);
    rt.depth--;
    if (n) rt.line = n.line;
    if (r && r.ret !== undefined) {
      return (m.ret.dims === 0 && INT_TYPES.has(m.ret.name) && typeof r.ret === 'number') ? Math.trunc(r.ret) : r.ret;
    }
    return undefined;
  }

  function* call(n, sc) {
    const self = !n.obj || n.obj.k === 'This';
    let o = null;
    if (!self) o = yield* ev(n.obj, sc);
    const args = [];
    for (let i = 0; i < n.args.length; i++) args.push(yield* ev(n.args[i], sc));
    rt.line = n.line;
    if (self) {
      const m = cls.methods.get(n.name);
      if (m) return yield* callUser(m, args, n);
      return yield* builtin(n, args);
    }
    if (o === null || o === undefined) throw err(nullMsg(n.obj), n);
    const ints = n.args.map((a) => isInt(a, sc));
    if (o instanceof StaticRef) return yield* staticCall(o.name, n, args, ints);
    if (typeof o === 'string') return strCall(o, n, args);
    if (typeof o !== 'object') throw err('Numbers and true/false values have no methods.', n);
    if (o.arr && !o.__m) throw err('Arrays have no methods here. Use .length without brackets.', n);
    const f = o.__m && o.__m[n.name];
    if (typeof f !== 'function') {
      const known = o.__m ? Object.keys(o.__m) : [];
      const lower = n.name.toLowerCase();
      const near = known.find((kname) => kname.toLowerCase() === lower);
      throw err((o.__t || 'This object') + ' has no method called ' + n.name + '().' + (near ? ' Did you mean ' + near + '() ?' : ''), n);
    }
    return f(args, ints);
  }

  function* getRef(t, sc) {
    if (t.k === 'Id' || (t.k === 'Field' && t.obj.k === 'This')) {
      const s = t.k === 'Id' ? sc.find(t.name) : cscope.find(t.name);
      if (!s) throw err('I don\'t know the variable "' + t.name + '". Declare it first, like:  double ' + t.name + ' = 0;', t);
      return { get: () => s.v, set: (v) => { s.v = v; }, int: s.int, type: s.type, name: t.name };
    }
    if (t.k === 'Index') {
      const a = yield* ev(t.obj, sc);
      const i = yield* ev(t.idx, sc);
      arrGet(a, i, t);
      const elemInt = isInt(t, sc);
      return { get: () => a.arr[i], set: (v) => { a.arr[i] = v; }, int: elemInt, type: { name: elemInt ? 'int' : 'Object', dims: 0 }, name: 'this array item' };
    }
    throw err('You can only assign to a variable or an array item.', t);
  }

  function* arrLit(n, sc) {
    const out = [];
    for (let i = 0; i < n.items.length; i++) {
      const it = n.items[i];
      out.push(it.k === 'ArrLit' ? (yield* arrLit(it, sc)) : (yield* ev(it, sc)));
    }
    return { arr: out, int: INT_TYPES.has(n.elem || '') };
  }

  function* cond(n, sc) {
    const v = yield* ev(n, sc);
    if (typeof v !== 'boolean') throw err('This condition must be true or false, but it is ' + show(v) + '.', n);
    return v;
  }

  function* ev(n, sc) {
    switch (n.k) {
      case 'Num': case 'Str': case 'Bool': return n.v;
      case 'Null': return null;
      case 'This': return THIS;
      case 'ClassLit': return new StaticRef(n.name);
      case 'Id': {
        const s = sc.find(n.name);
        if (s) return s.v;
        if (/^[A-Z]/.test(n.name)) return new StaticRef(n.name);
        throw err('I don\'t know what "' + n.name + '" is. Did you forget to declare it, or is it spelled differently?', n);
      }
      case 'Field': {
        if (n.obj.k === 'This') {
          const s = cscope.find(n.name);
          if (!s) throw err('This class has no variable called "' + n.name + '".', n);
          return s.v;
        }
        return getField(yield* ev(n.obj, sc), n);
      }
      case 'Index': { const a = yield* ev(n.obj, sc); const i = yield* ev(n.idx, sc); return arrGet(a, i, n); }
      case 'Un': {
        const v = yield* ev(n.e, sc);
        if (n.op === '!') { if (typeof v !== 'boolean') throw err('"!" only works on true/false values.', n); return !v; }
        const x = num(v, n);
        return n.op === '-' ? -x : n.op === '~' ? ~x : x;
      }
      case 'Bin': {
        if (n.op === '&&') return (yield* cond(n.l, sc)) && (yield* cond(n.r, sc));
        if (n.op === '||') return (yield* cond(n.l, sc)) || (yield* cond(n.r, sc));
        const a = yield* ev(n.l, sc);
        const b = yield* ev(n.r, sc);
        return binop(n.op, a, b, n, sc, n.l, n.r);
      }
      case 'Tern': return (yield* cond(n.c, sc)) ? (yield* ev(n.a, sc)) : (yield* ev(n.b, sc));
      case 'Cast': {
        const v = yield* ev(n.e, sc);
        if (INT_TYPES.has(n.type)) return Math.trunc(num(v, n));
        if (n.type === 'double' || n.type === 'float') return num(v, n);
        return v;
      }
      case 'Assign': {
        const ref = yield* getRef(n.target, sc);
        let v;
        if (n.op === '=') {
          v = yield* ev(n.v, sc);
          if (n.v.k === 'ArrLit') throw err('Use  new double[] {...}  to make a new array here.', n);
          v = coerce(v, ref.type, n.v, sc, ref.name);
        } else {
          const cur = ref.get();
          const r = yield* ev(n.v, sc);
          v = binop(n.op[0], cur, r, n, sc, n.target, n.v);
          if (ref.int && typeof v === 'number') v = Math.trunc(v);
        }
        ref.set(v);
        return v;
      }
      case 'IncDec': {
        const ref = yield* getRef(n.target, sc);
        const cur = num(ref.get(), n);
        const nv = n.op === '++' ? cur + 1 : cur - 1;
        ref.set(nv);
        return n.prefix ? nv : cur;
      }
      case 'ArrLit': return yield* arrLit(n, sc);
      case 'NewArr': {
        const size = yield* ev(n.size, sc);
        if (typeof size !== 'number' || !Number.isInteger(size) || size < 0 || size > 10000) throw err('An array size must be a whole number from 0 to 10000.', n);
        const fill = NUM_TYPES.has(n.type) ? 0 : n.type === 'boolean' ? false : null;
        return { arr: new Array(size).fill(fill), int: INT_TYPES.has(n.type) };
      }
      case 'New': {
        for (let i = 0; i < n.args.length; i++) yield* ev(n.args[i], sc);
        return construct(n.type);
      }
      case 'Call': return yield* call(n, sc);
    }
    throw err('The simulator cannot run this expression.', n);
  }

  function* exec(n, sc) {
    rt.line = n.line;
    if (++rt.steps > BUDGET) { rt.steps = 0; yield SLICE; }
    switch (n.k) {
      case 'Expr': yield* ev(n.e, sc); return undefined;
      case 'Empty': return undefined;
      case 'Var':
        for (let i = 0; i < n.decls.length; i++) {
          const d = n.decls[i];
          let v = defaultFor(d.type);
          if (d.init) {
            if (d.init.k === 'ArrLit') { d.init.elem = d.init.elem || d.type.name; v = yield* arrLit(d.init, sc); }
            else { v = yield* ev(d.init, sc); v = coerce(v, d.type, d.init, sc, d.name); }
          }
          sc.declare(d.name, d.type, v, n.line);
        }
        return undefined;
      case 'Block': {
        const s = new Scope(sc);
        for (let i = 0; i < n.body.length; i++) { const r = yield* exec(n.body[i], s); if (r) return r; }
        return undefined;
      }
      case 'If': {
        if (yield* cond(n.c, sc)) return yield* exec(n.a, new Scope(sc));
        if (n.b) return yield* exec(n.b, new Scope(sc));
        return undefined;
      }
      case 'While':
        while (yield* cond(n.c, sc)) {
          const r = yield* exec(n.body, new Scope(sc));
          if (r === BRK) break;
          if (r && r !== CNT) return r;
        }
        return undefined;
      case 'DoWhile':
        do {
          const r = yield* exec(n.body, new Scope(sc));
          if (r === BRK) break;
          if (r && r !== CNT) return r;
        } while (yield* cond(n.c, sc));
        return undefined;
      case 'For': {
        const s = new Scope(sc);
        if (n.init) yield* exec(n.init, s);
        while (n.c ? (yield* cond(n.c, s)) : true) {
          const r = yield* exec(n.body, new Scope(s));
          if (r === BRK) break;
          if (r && r !== CNT) return r;
          for (let i = 0; i < n.upd.length; i++) yield* ev(n.upd[i], s);
        }
        return undefined;
      }
      case 'ExprList': for (let i = 0; i < n.list.length; i++) yield* ev(n.list[i], sc); return undefined;
      case 'ForEach': {
        const a = yield* ev(n.it, sc);
        if (!a || !a.arr) throw err('This kind of "for" loop needs an array after the colon.', n);
        const items = a.arr.slice();
        for (let i = 0; i < items.length; i++) {
          const s = new Scope(sc);
          s.declare(n.name, n.type, items[i], n.line);
          const r = yield* exec(n.body, s);
          if (r === BRK) break;
          if (r && r !== CNT) return r;
        }
        return undefined;
      }
      case 'Return': return { ret: n.v ? (yield* ev(n.v, sc)) : undefined };
      case 'Break': return BRK;
      case 'Continue': return CNT;
      case 'Try': {
        const r = yield* exec(n.body, sc);
        if (n.fin) { const r2 = yield* exec(n.fin, sc); if (r2) return r2; }
        return r;
      }
    }
    throw err('The simulator cannot run this statement.', n);
  }

  function* main() {
    for (let i = 0; i < cls.fields.length; i++) yield* exec(cls.fields[i], cscope);
    const M = (name) => cls.methods.get(name);
    if (M('runOpMode')) { yield* callUser(M('runOpMode'), [], null); return; }
    if (M('loop')) {
      if (M('init')) yield* callUser(M('init'), [], null);
      while (!host.isStarted() && !host.isStopRequested()) {
        if (M('init_loop')) yield* callUser(M('init_loop'), [], null);
        host.flushTelemetry(); yield SLICE;
      }
      if (M('start')) yield* callUser(M('start'), [], null);
      while (host.isStarted() && !host.isStopRequested()) {
        yield* callUser(M('loop'), [], null);
        host.flushTelemetry(); yield SLICE;
      }
      if (M('stop')) yield* callUser(M('stop'), [], null);
      return;
    }
    throw new JavaError('I could not find runOpMode(). A LinearOpMode needs:  public void runOpMode() { ... }', 1);
  }

  const gen = main();
  let wakeAt = -1, done = false;
  return {
    className: cls.name,
    /* Runs one slice of the program. */
    step(now) {
      if (done) return true;
      if (now < wakeAt) return false;
      rt.steps = 0;
      try {
        const r = gen.next();
        if (r.done) { done = true; return true; }
        if (r.value && r.value.wait !== undefined) wakeAt = now + r.value.wait;
      } catch (e) {
        done = true;
        if (e instanceof JavaError) { if (!e.line) e.line = rt.line; throw e; }
        throw new JavaError((e && e.message) ? e.message : String(e), rt.line);
      }
      return false;
    }
  };
}

BBZ.Java = { JavaError, parse, start, jstr, javaFormat };
})();
