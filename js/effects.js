/**
 * Moonlight Midway — effects
 *
 * Bulbs: strings of glowing carnival lights drawn as two additive point layers
 * (halo + core), recoloured every frame by a per-bulb colour function.
 * Particles: a small CPU particle system used for sparks and confetti.
 * Also a few geometry helpers used to build the midway.
 */
'use strict';

const _color = new THREE.Color();

/* ------------------------------------------------------------------ bulbs */
/** Every Bulbs instance registers here so the main loop can animate them. */
const allBulbs = [];

class Bulbs {
  /**
   * @param {THREE.Object3D} parent
   * @param {THREE.Vector3[]} pts      bulb positions in parent space
   * @param {(i:number, t:number, out:THREE.Color, boost:number) => void} colorFn
   * @param {number} [size=.55]        halo size in world units
   */
  constructor(parent, pts, colorFn, size = .55){
    this.n = pts.length;
    const pos = new Float32Array(this.n * 3);
    pts.forEach((p, i) => { pos[i*3] = p.x; pos[i*3+1] = p.y; pos[i*3+2] = p.z; });
    this.col = new Float32Array(this.n * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const common = { map: HALO, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
    this.halo = new THREE.Points(this.geo, new THREE.PointsMaterial({ ...common, size, opacity: .75, fog: false }));
    this.core = new THREE.Points(this.geo, new THREE.PointsMaterial({ ...common, size: size * .28 }));
    this.halo.frustumCulled = this.core.frustumCulled = false;
    parent.add(this.halo, this.core);
    this.colorFn = colorFn;
    /** Set to 1 to brighten and speed up the pattern (hovered booth sign). */
    this.boost = 0;
    this.boostT = 0;
    allBulbs.push(this);
  }
  update(t, dt){
    this.boostT += ((this.boost ? 1 : 0) - this.boostT) * Math.min(1, dt * 6);
    for (let i = 0; i < this.n; i++){
      this.colorFn(i, t, _color, this.boostT);
      this.col[i*3] = _color.r; this.col[i*3+1] = _color.g; this.col[i*3+2] = _color.b;
    }
    this.geo.attributes.color.needsUpdate = true;
  }
}

const WARM = new THREE.Color(0xffc871);
const PARTY = [0xff4d6d, 0xffc54d, 0x36d6c3, 0x8d6bff, 0xff8a3d].map(h => new THREE.Color(h));
/** Classic marquee chase: every third bulb lit, moving along the string. */
function chaseWarm(i, t, out, boost){
  const lit = (i + Math.floor(t * (6 + boost * 10))) % 3 === 0;
  out.copy(WARM).multiplyScalar((lit ? 1 : .45 + boost * .3) * (1 + boost * .4));
}
function twinkleWarm(i, t, out){ out.copy(WARM).multiplyScalar(.75 + .25 * Math.sin(t * 2.3 + i * 12.9898)); }
function partyBulbs(i, t, out){ out.copy(PARTY[i % PARTY.length]).multiplyScalar(.7 + .3 * Math.sin(t * 3 + i * .9)); }

/* ------------------------------------------------------------------ geometry helpers */
/** Points along a sagging string between a and b (parabolic approximation). */
function catenary(a, b, sag, n){
  const pts = [];
  for (let k = 0; k <= n; k++){
    const s = k / n;
    const p = new THREE.Vector3().lerpVectors(a, b, s);
    p.y -= sag * 4 * s * (1 - s);
    pts.push(p);
  }
  return pts;
}
function wire(pts, parent = scene){
  parent.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x120a10 })));
}
function cylinderBetween(a, b, r, mat){
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), mat);
  m.position.copy(a).addScaledVector(d, .5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/* ------------------------------------------------------------------ particles */
class Particles {
  /**
   * @param {number} max        ring-buffer capacity
   * @param {THREE.Texture} map
   * @param {number} blending   THREE blending mode
   * @param {number} size       point size in world units
   * @param {number} gravity    downward acceleration
   * @param {number} drag       fraction of velocity kept per second
   * @param {boolean} flicker   fake tumbling (confetti)
   */
  constructor(max, map, blending, size, gravity, drag, flicker){
    Object.assign(this, { max, gravity, drag, flicker, idx: 0 });
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.base = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i*3+1] = -999; // park unused particles out of sight
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
      size, map, vertexColors: true, transparent: true, blending, depthWrite: false,
      alphaTest: blending === THREE.NormalBlending ? .3 : 0,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, color, life){
    const i = this.idx, j = i * 3;
    this.idx = (this.idx + 1) % this.max;
    this.pos[j] = x; this.pos[j+1] = y; this.pos[j+2] = z;
    this.vel[j] = vx; this.vel[j+1] = vy; this.vel[j+2] = vz;
    _color.set(color);
    this.base[j] = _color.r; this.base[j+1] = _color.g; this.base[j+2] = _color.b;
    this.life[i] = this.maxLife[i] = life;
  }
  /** Spherical burst. `color` may be one colour or an array to cycle through. */
  burst(p, color, n, speed, life, up = 0){
    for (let k = 0; k < n; k++){
      const th = Math.random() * TAU, ph = Math.acos(rand(-1, 1)), s = speed * rand(.35, 1);
      const c = Array.isArray(color) ? color[k % color.length] : color;
      this.emit(p.x, p.y, p.z,
        Math.sin(ph) * Math.cos(th) * s, Math.sin(ph) * Math.sin(th) * s + up, Math.cos(ph) * s,
        c, life * rand(.6, 1.2));
    }
  }
  update(dt){
    const keep = Math.pow(this.drag, dt);
    for (let i = 0; i < this.max; i++){
      if (this.life[i] <= 0) continue;
      const j = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0){ this.pos[j+1] = -999; continue; }
      this.vel[j+1] -= this.gravity * dt;
      this.vel[j] *= keep; this.vel[j+1] *= keep; this.vel[j+2] *= keep;
      this.pos[j] += this.vel[j] * dt; this.pos[j+1] += this.vel[j+1] * dt; this.pos[j+2] += this.vel[j+2] * dt;
      let f = this.life[i] / this.maxLife[i];
      if (this.flicker) f = Math.min(1, f * 3) * (.55 + .45 * Math.abs(Math.sin(this.life[i] * 14 + i)));
      this.col[j] = this.base[j] * f; this.col[j+1] = this.base[j+1] * f; this.col[j+2] = this.base[j+2] * f;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

const sparks = new Particles(500, HALO, THREE.AdditiveBlending, .14, 3, .12, false);
const confetti = new Particles(900, SQUARE, THREE.NormalBlending, .06, 2.2, .35, true);
const CONFETTI_COLORS = [0xe8364f, 0xffc54d, 0x36d6c3, 0xfff3dd, 0x8d6bff, 0xff8fb1];
function confettiBurst(p, n = 120){ confetti.burst(p, CONFETTI_COLORS, n, 5, 2.6, 3); }
