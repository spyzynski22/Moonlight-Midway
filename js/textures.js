/**
 * Moonlight Midway — procedural textures
 *
 * Every surface is painted at runtime on a 2D canvas; the game ships no image files.
 * Painters that draw text register with whenFonts() so they run again once the
 * web fonts finish loading, swapping the fallback face for Rye/Fredoka.
 */
'use strict';

/** Returns [canvas, 2d context]. */
function makeCanvas(w, h){
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

/** Wraps a canvas in a texture; pass rx/ry to tile it. */
function canvasTexture(c, rx, ry){
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = Math.min(8, maxAniso);
  if (rx){
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry == null ? rx : ry);
  }
  return t;
}

const fontJobs = [];
/** Runs a painter now, and again when the web fonts arrive (runFontJobs). */
function whenFonts(fn){ fontJobs.push(fn); fn(); }
function runFontJobs(){ fontJobs.forEach(fn => fn()); }

/* ------------------------------------------------------------------ sprites */
const HALO = (() => {
  const [c, g] = makeCanvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(.14, 'rgba(255,255,255,.95)');
  gr.addColorStop(.38, 'rgba(255,255,255,.28)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return canvasTexture(c);
})();

const SQUARE = (() => {
  const [c, g] = makeCanvas(16, 16);
  g.fillStyle = '#fff';
  g.fillRect(1, 3, 14, 10);
  return canvasTexture(c);
})();

/* ------------------------------------------------------------------ surfaces */
/** Awning fabric: alternating stripes with soft fold shading. */
function stripeCanvas(a, b, n, horizontal){
  const [c, g] = makeCanvas(512, 512);
  const w = 512 / n;
  const band = x => horizontal ? g.fillRect(0, x, 512, w + 1) : g.fillRect(x, 0, w + 1, 512);
  for (let i = 0; i < n; i++){
    const x = i * w;
    g.fillStyle = i % 2 ? b : a;
    band(x);
    const gr = horizontal ? g.createLinearGradient(0, x, 0, x + w) : g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, 'rgba(0,0,0,.24)');
    gr.addColorStop(.35, 'rgba(255,255,255,.07)');
    gr.addColorStop(.7, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,.26)');
    g.fillStyle = gr;
    band(x);
  }
  return c;
}

/** Planked wood with wavy grain. `dark` is an "r,g,b" string for the grain. */
function woodCanvas(base, dark){
  const [c, g] = makeCanvas(512, 512);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  for (let p = 0; p < 8; p++){
    g.fillStyle = `rgba(0,0,0,${(.04 + Math.random() * .1).toFixed(2)})`;
    g.fillRect(0, p * 64, 512, 64);
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.fillRect(0, p * 64, 512, 2);
  }
  for (let i = 0; i < 150; i++){
    g.strokeStyle = `rgba(${dark},${(.07 + Math.random() * .18).toFixed(2)})`;
    g.lineWidth = .5 + Math.random() * 2;
    g.beginPath();
    const y = Math.random() * 512;
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * .02 + i) * 3 + Math.random() * 1.5);
    g.stroke();
  }
  return c;
}

/** Speckle noise on a flat colour. `tints` is a list of [probability, "r,g,b", maxAlpha]. */
function speckleCanvas(base, count, tints){
  const [c, g] = makeCanvas(512, 512);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < count; i++){
    let r = Math.random(), tint = tints[tints.length - 1];
    for (const t of tints){ if (r < t[0]){ tint = t; break; } r -= t[0]; }
    g.fillStyle = `rgba(${tint[1]},${(Math.random() * tint[2]).toFixed(2)})`;
    const s = Math.random() * 3 + .5;
    g.fillRect(Math.random() * 512, Math.random() * 512, s, s);
  }
  return c;
}
const groundCanvas = () => speckleCanvas('#2b2019', 9000, [[.5, '0,0,0', .25], [.4, '120,90,60', .18], [.1, '235,205,140', .28]]);
const corkCanvas = () => speckleCanvas('#b98a52', 15000, [[.5, '90,55,25', .5], [.5, '235,195,135', .4]]);

/** Diagonal candy-cane stripes; tiles vertically. */
function candyCanvas(a, b){
  const [c, g] = makeCanvas(64, 256);
  g.fillStyle = a;
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = b;
  for (let y = -64; y < 320; y += 32){
    g.beginPath();
    g.moveTo(0, y); g.lineTo(64, y - 32); g.lineTo(64, y - 16); g.lineTo(0, y + 16);
    g.closePath();
    g.fill();
  }
  return c;
}

function baseballCanvas(){
  const [c, g] = makeCanvas(256, 128);
  g.fillStyle = '#f4efe4';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#c8202f';
  g.lineWidth = 2;
  const seam = x => 64 + 30 * Math.sin(x / 256 * TAU);
  for (const off of [-7, 7]){
    g.beginPath();
    for (let x = 0; x <= 256; x += 2){
      if (x) g.lineTo(x, seam(x) + off); else g.moveTo(x, seam(x) + off);
    }
    g.stroke();
  }
  for (let x = 4; x < 256; x += 8){
    g.beginPath(); g.moveTo(x - 3, seam(x) - 6); g.lineTo(x + 3, seam(x) + 6); g.stroke();
  }
  return c;
}

function targetCanvas(){
  const [c, g] = makeCanvas(128, 128);
  for (let i = 0; i < 5; i++){
    g.fillStyle = i % 2 ? '#fff3dd' : '#e8364f';
    g.beginPath();
    g.arc(64, 64, 62 - i * 12.5, 0, TAU);
    g.fill();
  }
  return c;
}

/** Five-point star, filled with the current fillStyle. */
function fillStar(g, x, y, r){
  g.beginPath();
  for (let k = 0; k < 10; k++){
    const a = k / 10 * TAU - Math.PI / 2, rr = k % 2 ? r * .45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}
