/**
 * Headless smoke test.
 *
 * Loads the game's scripts in the order index.html lists them, inside a Node
 * vm context with a stubbed DOM and a no-op WebGL renderer, then lets simple
 * bots play each booth to its result screen and back to the midway.
 *
 * Catches runtime errors, broken game flow, and scoring that no longer adds up.
 * It does not check rendering; open index.html in a browser for that.
 *
 *   npm install && npm test
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);
assert.ok(scripts.length >= 5, 'expected the game scripts to be listed in index.html');

/* ------------------------------------------------------------------ stubs */
const THREE = require('three');
const CANNON = require('cannon');
THREE.WebGLRenderer = class {
  constructor(){ this.shadowMap = {}; this.capabilities = { getMaxAnisotropy: () => 8 }; }
  setPixelRatio(){} setSize(){} render(){}
};

const ctx2d = new Proxy({}, {
  get: (t, k) => {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop(){} });
    return k in t ? t[k] : () => {};
  },
  set: (t, k, v) => { t[k] = v; return true; },
});

function makeElement(tag){
  const listeners = {};
  const classes = new Set();
  return {
    tag, listeners, style: {}, dataset: {}, hidden: false, textContent: '', innerHTML: '', className: '', offsetWidth: 1,
    width: 0, height: 0,
    classList: {
      add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
    },
    addEventListener(name, fn){ (listeners[name] = listeners[name] || []).push(fn); },
    appendChild(){}, remove(){}, focus(){}, setAttribute(){}, setPointerCapture(){},
    querySelector: () => makeElement('span'),
    getContext: () => ctx2d,
  };
}

const elements = {};
const cards = [0, 1, 2].map(i => { const c = makeElement('button'); c.dataset.g = String(i); return c; });
const storage = {};
const windowListeners = {};
let now = 0, rafCallback = null;

const sandbox = {
  THREE, CANNON, console, Math, JSON, Promise, Set, Map, Array, Object, Float32Array, Number, String, Error, Proxy,
  setTimeout, clearTimeout, setInterval: () => 0,
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  performance: { now: () => now },
  requestAnimationFrame: fn => { rafCallback = fn; },
  matchMedia: () => ({ matches: false }),
  localStorage: { getItem: k => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); } },
  addEventListener: (name, fn) => { (windowListeners[name] = windowListeners[name] || []).push(fn); },
  document: {
    getElementById: id => elements[id] || (elements[id] = makeElement(id)),
    querySelectorAll: sel => (sel === '.gcard' ? cards : []),
    createElement: tag => makeElement(tag),
    fonts: { load: () => Promise.resolve() },
  },
};
sandbox.window = sandbox;
const context = vm.createContext(sandbox);
for (const file of scripts){
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
}
const game = expr => vm.runInContext(expr, context);

/* ------------------------------------------------------------------ helpers */
const canvas = elements.c;
function fire(name, extra){
  for (const fn of canvas.listeners[name] || []){
    fn(Object.assign({ pointerType: 'mouse', button: 0, pointerId: 1, clientX: 640, clientY: 360, preventDefault(){} }, extra));
  }
}
/** Moves the pointer over a world-space point; returns the event coordinates. */
function pointAt(v){
  const p = v.clone().project(game('camera'));
  const e = { clientX: (p.x + 1) / 2 * 1280, clientY: (1 - p.y) / 2 * 720 };
  fire('pointermove', e);
  return e;
}
function step(frames){
  for (let i = 0; i < frames; i++){ now += 1000 / 60; rafCallback(now); }
}
const flush = ms => new Promise(r => setTimeout(r, ms));
function findInScene(test){
  let found = null;
  game('scene').traverse(o => { if (!found && test(o)) found = o; });
  return found;
}

async function play(index, bot, maxSeconds){
  game(`enterGame(${index})`);
  let t = 0;
  for (let f = 0; f < maxSeconds * 60 && game('mode') !== 'result'; f++){
    step(1);
    t += 1 / 60;
    if (game('mode') === 'play') bot(t);
    if (f % 600 === 0) await flush(0);
  }
  assert.strictEqual(game('mode'), 'result', `game ${index} should reach the result screen`);
  await flush(1000); // result card appears after a short delay
  const result = {
    name: game(`games[${index}].name`),
    goal: game(`games[${index}].goal`),
    score: Number(elements.resScore.textContent.replace(/,/g, '')),
    tickets: elements.resTix.textContent,
    title: elements.resTitle.textContent,
    seconds: t.toFixed(1),
  };
  assert.strictEqual(elements.result.hidden, false, 'result card should be visible');
  game('toMidway()');
  step(120);
  assert.strictEqual(game('mode'), 'hub', 'should fly back to the midway');
  return result;
}

/* ------------------------------------------------------------------ bots */
function bottleBot(){
  let last = -9;
  return t => {
    const e = pointAt(new THREE.Vector3(game('BOOTH_X[0]'), 1.45, -.55)); // the sweet spot
    if (t - last > 1.1){ last = t; fire('pointerdown', e); fire('pointerup', e); }
  };
}
function duckBot(){
  let last = -9;
  return t => {
    if (t - last < .35) return;
    last = t;
    const box = findInScene(o => {
      if (!o.userData.slot || o.userData.slot.down) return false;
      const w = new THREE.Vector3(); o.getWorldPosition(w);
      return Math.abs(w.x) < 1.5;
    });
    if (!box) return;
    const w = new THREE.Vector3(); box.getWorldPosition(w);
    const e = pointAt(w); fire('pointerdown', e); fire('pointerup', e);
  };
}
function dartBot(){
  let holding = false, since = 0;
  return t => {
    const balloon = findInScene(o => o.isGroup && o.visible && o.children.length === 3 && o.children[0].geometry &&
      o.children[0].geometry.parameters && o.children[0].geometry.parameters.radius === .16);
    if (!balloon) return;
    const e = pointAt(new THREE.Vector3(balloon.position.x, balloon.position.y, -1.1));
    if (!holding){ fire('pointerdown', e); holding = true; since = t; }
    else if (t - since > .7){ fire('pointerup', e); holding = false; }
  };
}

/* ------------------------------------------------------------------ run */
(async () => {
  step(60);
  assert.strictEqual(game('mode'), 'hub');

  const results = [];
  results.push(await play(0, bottleBot(), 60));
  results.push(await play(1, duckBot(), 90));
  results.push(await play(2, dartBot(), 60));

  for (const r of results){
    console.log(`  ${r.name.padEnd(14)} score ${String(r.score).padStart(5)} / goal ${r.goal}  ${r.title.padEnd(10)} ${r.tickets} tickets  (${r.seconds}s)`);
    assert.ok(r.score > 0, `${r.name}: bot should score`);
    assert.ok(r.score >= r.goal, `${r.name}: an accurate bot should beat the goal`);
  }

  const tickets = game('tickets');
  assert.ok(tickets > 0, 'tickets should accumulate');
  assert.strictEqual(JSON.parse(storage.mm_tickets), tickets, 'tickets should persist');
  assert.deepStrictEqual(JSON.parse(storage.mm_best), results.map(r => r.score), 'best scores should persist');

  // a second run of the same game starts cleanly
  results.push(await play(2, dartBot(), 60));

  console.log('\n  smoke test passed');
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
