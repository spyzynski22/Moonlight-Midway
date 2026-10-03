/**
 * Moonlight Midway — the midway
 *
 * Builds the world: sky, ground, lights, the ferris wheel, tents, string
 * lights and bunting, and the three game booths. updateMidway() animates it.
 */
'use strict';

/* ------------------------------------------------------------------ sky, ground, lights */
(function buildEnvironment(){
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x04031a) },
      mid: { value: new THREE.Color(0x171046) },
      bot: { value: new THREE.Color(0x5a2160) },
    },
    vertexShader: `
      varying vec3 vP;
      void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      uniform vec3 top, mid, bot;
      varying vec3 vP;
      void main(){
        float h = vP.y;
        vec3 c = h > .12 ? mix(mid, top, smoothstep(.12, .75, h)) : mix(bot, mid, smoothstep(-.05, .12, h));
        gl_FragColor = vec4(c, 1.);
      }`,
  }));
  scene.add(sky);

  const STARS = 800, starPos = new Float32Array(STARS * 3);
  for (let i = 0; i < STARS; i++){
    const th = Math.random() * TAU, y = rand(.08, 1), r = Math.sqrt(1 - y * y);
    starPos[i*3] = Math.cos(th) * r * 170;
    starPos[i*3+1] = y * 170;
    starPos[i*3+2] = Math.sin(th) * r * 170;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, color: 0xfff6e0, transparent: true, opacity: .85, fog: false })));

  const moon = new THREE.Mesh(new THREE.CircleGeometry(6, 40), new THREE.MeshBasicMaterial({ color: 0xfff1d0, fog: false }));
  moon.position.set(-55, 62, -140);
  moon.lookAt(0, 0, 0);
  scene.add(moon);
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: HALO, color: 0xc9b8ff, transparent: true, opacity: .4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  moonGlow.scale.set(55, 55, 1);
  moonGlow.position.copy(moon.position);
  scene.add(moonGlow);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ map: canvasTexture(groundCanvas(), 55), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  scene.add(new THREE.HemisphereLight(0x7d6cff, 0x3a2414, .55));
  const moonLight = new THREE.DirectionalLight(0x9fb0ff, .32);
  moonLight.position.set(-10, 20, 8);
  scene.add(moonLight);
  const warm = new THREE.PointLight(0xffa860, .9, 32, 1.6);
  warm.position.set(0, 5.5, 7);
  scene.add(warm);
})();

/* ------------------------------------------------------------------ ferris wheel */
const ferris = (function buildFerrisWheel(){
  const R = 9, HUB_Y = 11;
  const root = new THREE.Group();
  root.position.set(3, 0, -27);
  scene.add(root);
  const steel = new THREE.MeshStandardMaterial({ color: 0xd8d0f2, roughness: .45, metalness: .35 });
  for (const sx of [-1, 1]) for (const sz of [-1.4, 1.4]){
    root.add(cylinderBetween(new THREE.Vector3(sx * 5.2, 0, sz), new THREE.Vector3(0, HUB_Y, sz * .6), .16, steel));
  }

  const wheel = new THREE.Group();
  wheel.position.y = HUB_Y;
  root.add(wheel);
  const RIM_BULBS = 80, SPOKES = 16, SPOKE_BULBS = 6;
  const bulbPts = [];
  for (const z of [-.75, .75]){
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, .1, 8, 120), steel); rim.position.z = z; wheel.add(rim);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(R * .55, .07, 6, 80), steel); inner.position.z = z; wheel.add(inner);
    for (let k = 0; k < RIM_BULBS; k++){ const a = k / RIM_BULBS * TAU; bulbPts.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, z * 1.05)); }
  }
  for (let k = 0; k < SPOKES; k++){
    const a = k / SPOKES * TAU;
    for (const z of [-.75, .75]) wheel.add(cylinderBetween(new THREE.Vector3(0, 0, z), new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, z), .05, steel));
    for (let s = 1; s <= SPOKE_BULBS; s++){ const rr = R * s / (SPOKE_BULBS + 1); bulbPts.push(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, .8)); }
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(.7, .7, 2, 20), steel);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);

  const rimCount = RIM_BULBS * 2;
  new Bulbs(wheel, bulbPts, (i, t, out) => {
    if (i < rimCount){ out.setHSL(((i % RIM_BULBS) / RIM_BULBS + t * .12) % 1, .9, .62); return; } // rainbow sweep
    const spoke = Math.floor((i - rimCount) / SPOKE_BULBS), s = (i - rimCount) % SPOKE_BULBS;
    out.copy(WARM).multiplyScalar((s + Math.floor(t * 7) + spoke) % SPOKE_BULBS === 0 ? 1.3 : .5); // runs outward
  }, 1.1);

  const carColors = [0xe8364f, 0xffc54d, 0x36d6c3, 0x8d6bff];
  const gondolas = [];
  for (let k = 0; k < 12; k++){
    const a = k / 12 * TAU, gp = new THREE.Group();
    gp.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    const car = new THREE.Mesh(new THREE.CylinderGeometry(.75, .6, .9, 12), new THREE.MeshStandardMaterial({ color: carColors[k % 4], roughness: .5 }));
    car.position.y = -1;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(.85, .45, 12), steel);
    roof.position.y = -.25;
    gp.add(car, roof);
    wheel.add(gp);
    gondolas.push(gp);
  }
  return { wheel, gondolas };
})();

/* ------------------------------------------------------------------ tents */
/** Striped big-top tent; returns its flag so it can wave. */
function buildTent(x, z, r, h, a, b){
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  scene.add(g);
  const mat = new THREE.MeshStandardMaterial({ map: canvasTexture(stripeCanvas(a, b, 2), 8, 1), roughness: .9, side: THREE.DoubleSide });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h * .42, 32, 1, true), mat);
  wall.position.y = h * .21;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.15, h * .58, 32, 1, true), mat);
  roof.position.y = h * .71;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0xffc54d }));
  pole.position.y = h + .7;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(.9, .5), new THREE.MeshStandardMaterial({ color: 0xffc54d, side: THREE.DoubleSide, emissive: 0x553300 }));
  flag.position.set(.45, h + 1.25, 0);
  g.add(wall, roof, pole, flag);
  const pts = [];
  for (let k = 0; k < 40; k++){ const an = k / 40 * TAU; pts.push(new THREE.Vector3(Math.cos(an) * r * 1.15, h * .42, Math.sin(an) * r * 1.15)); }
  new Bulbs(g, pts, chaseWarm, .7);
  return flag;
}
const tentFlags = [
  buildTent(-17, -15, 4.2, 7, '#c22541', '#fff3dd'),
  buildTent(17.5, -13, 3.8, 6.4, '#2479c9', '#ffc54d'),
  buildTent(-30, -30, 5, 8, '#7a35c4', '#fff3dd'),
  buildTent(30, -34, 5.5, 8.5, '#d42a45', '#ffc54d'),
];

/* ------------------------------------------------------------------ poles, string lights, bunting */
(function buildStrings(){
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b1d2e, roughness: .6 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xffc54d, metalness: .5, roughness: .3, emissive: 0x3a2200 });
  const front = [-11, -2.8, 2.8, 11].map(x => new THREE.Vector3(x, 5.2, 4.6));
  const back = [-12, -4, 4, 12].map(x => new THREE.Vector3(x, 6.6, -8));
  for (const p of front.concat(back)){
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.07, .09, p.y, 8), poleMat);
    pole.position.set(p.x, p.y / 2, p.z);
    pole.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.14, 12, 8), capMat);
    cap.position.copy(p).setY(p.y + .1);
    scene.add(pole, cap);
  }

  const bulbPts = [], pennants = [];
  for (let i = 0; i < 3; i++){ // across the front
    const pts = catenary(front[i], front[i + 1], .8, 120);
    wire(pts);
    for (let k = 0; k <= 120; k += 6) bulbPts.push(pts[k]);
    for (let k = 0; k < 120; k += 4) pennants.push([pts[k], pts[k + 3]]);
  }
  for (let i = 0; i < 4; i++){ // front to back, over the booths
    const pts = catenary(front[i], back[i], 1, 140);
    wire(pts);
    for (let k = 0; k <= 140; k += 7) bulbPts.push(pts[k]);
  }
  new Bulbs(scene, bulbPts, twinkleWarm, .6);

  // all pennants in one vertex-coloured mesh
  const colors = [0xe8364f, 0xffc54d, 0x36d6c3, 0xfff3dd, 0x8d6bff].map(h => new THREE.Color(h));
  const pos = [], col = [];
  pennants.forEach(([a, b], i) => {
    const tip = new THREE.Vector3().lerpVectors(a, b, .5);
    tip.y -= .38;
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, tip.x, tip.y, tip.z);
    const c = colors[i % colors.length];
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
})();

/* ------------------------------------------------------------------ booth materials & props */
const woodMat = new THREE.MeshStandardMaterial({ map: canvasTexture(woodCanvas('#7a4a28', '40,20,5'), 1, 1), roughness: .8 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: .35, metalness: .55, emissive: 0x2a1800 });

/** A plush prize bear built from spheres. */
function makeBear(color){
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color, roughness: .95 });
  const muzzle = new THREE.MeshStandardMaterial({ color: 0xfff3dd, roughness: .95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1010, roughness: .5 });
  const ball = (r, mat, x, y, z, scale) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
    s.position.set(x, y, z);
    if (scale) s.scale.set(...scale);
    s.castShadow = true;
    g.add(s);
  };
  ball(.15, fur, 0, 0, 0, [1, 1.1, .9]);                          // body
  ball(.11, fur, 0, .2, 0);                                        // head
  ball(.045, fur, -.08, .29, 0); ball(.045, fur, .08, .29, 0);     // ears
  ball(.05, muzzle, 0, .18, .09, [1, .8, .7]);
  ball(.015, dark, -.04, .23, .095); ball(.015, dark, .04, .23, .095); ball(.018, dark, 0, .19, .13);
  ball(.05, fur, -.14, .04, .04, [1, 1.4, 1]); ball(.05, fur, .14, .04, .04, [1, 1.4, 1]); // arms
  ball(.06, fur, -.07, -.15, .06); ball(.06, fur, .07, -.15, .06);                         // feet
  return g;
}

function paintSign(c, g, title, sub, color){
  const w = c.width, h = c.height;
  g.clearRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, color);
  gr.addColorStop(1, '#1a0d1c');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#ffc54d';
  g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 28);
  g.lineWidth = 2; g.strokeRect(28, 28, w - 56, h - 56);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '400 112px Rye, Georgia, serif';
  g.lineWidth = 10; g.strokeStyle = '#2a0a12'; g.strokeText(title, w / 2, h * .43);
  g.fillStyle = '#ffc54d'; g.fillText(title, w / 2, h * .43);
  g.font = '600 30px Fredoka, sans-serif';
  g.fillStyle = '#fff3dd';
  g.fillText(sub.split('').join(' '), w / 2, h * .8); // hair spaces for tracking
}

function paintCounter(c, g, color, text){
  g.fillStyle = color; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = 'rgba(0,0,0,.18)';
  for (let x = 0; x < 1024; x += 128) g.fillRect(x, 0, 6, 256);
  g.strokeStyle = '#ffc54d'; g.lineWidth = 8; g.strokeRect(10, 10, 1004, 236);
  g.fillStyle = '#fff3dd'; g.beginPath(); g.ellipse(512, 128, 250, 70, 0, 0, TAU); g.fill();
  g.strokeStyle = '#2a0a12'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#2a0a12'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '400 54px Rye, Georgia, serif';
  g.fillText(text, 512, 132);
}

/** Painted velvet backdrop with gold stars and a heading. */
function velvetMat(color, title){
  const [c, g] = makeCanvas(1024, 720);
  const t = canvasTexture(c);
  const stars = Array.from({ length: 26 }, () => [40 + Math.random() * 944, 160 + Math.random() * 520, 4 + Math.random() * 7]);
  whenFonts(() => {
    g.fillStyle = color; g.fillRect(0, 0, 1024, 720);
    for (let x = 0; x < 1024; x += 48){
      const gr = g.createLinearGradient(x, 0, x + 48, 0);
      gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(.5, 'rgba(255,255,255,.08)'); gr.addColorStop(1, 'rgba(0,0,0,.35)');
      g.fillStyle = gr; g.fillRect(x, 0, 48, 720);
    }
    g.fillStyle = '#ffc54d';
    for (const [x, y, r] of stars) fillStar(g, x, y, r);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '400 84px Rye, Georgia, serif';
    g.lineWidth = 10; g.strokeStyle = '#2a0a12'; g.strokeText(title, 512, 90);
    g.fillStyle = '#ffc54d'; g.fillText(title, 512, 90);
    t.needsUpdate = true;
  });
  return new THREE.MeshStandardMaterial({ map: t, roughness: .95 });
}

/** Painted moonlit lake for the shooting gallery. */
function lakeMat(){
  const [c, g] = makeCanvas(1024, 720);
  const gr = g.createLinearGradient(0, 0, 0, 720);
  gr.addColorStop(0, '#0f1d52'); gr.addColorStop(.6, '#2b4fa0'); gr.addColorStop(1, '#5a86d6');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 720);
  g.fillStyle = '#fff1c8'; g.beginPath(); g.arc(820, 130, 62, 0, TAU); g.fill();       // crescent moon
  g.fillStyle = '#2b4fa0'; g.beginPath(); g.arc(845, 115, 56, 0, TAU); g.fill();
  g.fillStyle = '#fff6e0';
  for (let k = 0; k < 70; k++){ g.globalAlpha = Math.random() * .8 + .2; g.fillRect(Math.random() * 1024, Math.random() * 330, 2.5, 2.5); }
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(255,255,255,.85)';
  for (const [x, y, s] of [[180, 140, 1], [480, 90, .8], [640, 220, .7]]){
    for (let k = 0; k < 5; k++){ g.beginPath(); g.arc(x + k * 34 * s, y - (k % 2) * 18 * s, 38 * s, 0, TAU); g.fill(); }
  }
  g.fillStyle = '#163a2a'; // reeds
  for (let x = 0; x < 1024; x += 14){
    const h = 60 + Math.random() * 120;
    g.fillRect(x, 720 - h, 5, h);
    g.beginPath(); g.ellipse(x + 2, 720 - h, 6, 20, 0, 0, TAU); g.fill();
  }
  return new THREE.MeshStandardMaterial({ map: canvasTexture(c), roughness: .9 });
}

/* ------------------------------------------------------------------ booths */
/**
 * A striped booth with awning, counter, lit sign, prize bears and a spotlight.
 * Booth-local layout: floor at y=0, back wall at z=-1.7, counter front at z≈1.5.
 */
function buildBooth(i, cfg){
  const bx = BOOTH_X[i];
  const g = new THREE.Group();
  g.position.x = bx;
  scene.add(g);
  const fabric = new THREE.MeshStandardMaterial({ map: canvasTexture(stripeCanvas(cfg.c1, cfg.c2, 10), 1, 1), roughness: .9 });
  const add = (geo, mat, x, y, z, castShadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = castShadow;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  // shell
  add(new THREE.BoxGeometry(4.7, .14, 3.6), woodMat, 0, .07, 0);
  const back = add(new THREE.BoxGeometry(4.5, 3.1, .1), cfg.backMat, 0, 1.55, -1.7);
  add(new THREE.BoxGeometry(.1, 3.1, 3.3), fabric, -2.25, 1.55, -.05);
  add(new THREE.BoxGeometry(.1, 3.1, 3.3), fabric, 2.25, 1.55, -.05);
  add(new THREE.BoxGeometry(4.7, .1, 3.6), fabric, 0, 3.15, -.05);

  // awning with a scalloped edge
  add(new THREE.BoxGeometry(4.9, .05, 1.35), fabric, 0, 3.05, 1.95).rotation.x = .38;
  const scallopMats = [cfg.c1, cfg.c2].map(color => new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: .9 }));
  const scallop = new THREE.CircleGeometry(.2, 16, Math.PI, Math.PI);
  for (let k = 0; k < 12; k++) add(scallop, scallopMats[k % 2], -2.2 + k * .4, 2.82, 2.58);

  // candy-striped posts
  const candy = new THREE.MeshStandardMaterial({ map: canvasTexture(candyCanvas(cfg.c1, '#fff3dd'), 1, 3), roughness: .5 });
  add(new THREE.CylinderGeometry(.075, .075, 3, 12), candy, -2.2, 1.5, 1.55);
  add(new THREE.CylinderGeometry(.075, .075, 3, 12), candy, 2.2, 1.5, 1.55);

  // counter
  const [cc, cg] = makeCanvas(1024, 256);
  const counterTex = canvasTexture(cc);
  whenFonts(() => { paintCounter(cc, cg, cfg.c1, cfg.price); counterTex.needsUpdate = true; });
  const counterFront = new THREE.MeshStandardMaterial({ map: counterTex, roughness: .7 });
  add(new THREE.BoxGeometry(4.4, 1, .45), [woodMat, woodMat, woodMat, woodMat, counterFront, woodMat], 0, .5, 1.3);
  add(new THREE.BoxGeometry(4.6, .07, .65), woodMat, 0, 1.035, 1.3);
  add(new THREE.BoxGeometry(4.6, .04, .04), trimMat, 0, 1, 1.63, false);

  // lit sign
  const [sc, sg] = makeCanvas(1024, 256);
  const signTex = canvasTexture(sc);
  whenFonts(() => { paintSign(sc, sg, cfg.title, cfg.sub, cfg.c1); signTex.needsUpdate = true; });
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: .6, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: .35 });
  add(new THREE.BoxGeometry(3.7, .95, .1), [trimMat, trimMat, trimMat, trimMat, signMat, trimMat], 0, 3.98, 1.75);
  add(new THREE.BoxGeometry(.08, .6, .08), trimMat, -1.4, 3.35, 1.72);
  add(new THREE.BoxGeometry(.08, .6, .08), trimMat, 1.4, 3.35, 1.72);
  const signPts = [];
  for (let k = 0; k <= 18; k++){ const x = -1.85 + k * 3.7 / 18; signPts.push(new THREE.Vector3(x, 4.455, 1.82), new THREE.Vector3(x, 3.505, 1.82)); }
  for (let k = 1; k < 5; k++){ const y = 3.505 + k * .95 / 5; signPts.push(new THREE.Vector3(-1.85, y, 1.82), new THREE.Vector3(1.85, y, 1.82)); }
  const signBulbs = new Bulbs(g, signPts, chaseWarm, .42);

  // party lights along the back wall (visible while playing)
  const inner = catenary(new THREE.Vector3(-2.15, 2.95, -1.58), new THREE.Vector3(2.15, 2.95, -1.58), .18, 18);
  wire(inner, g);
  new Bulbs(g, inner, partyBulbs, .32);

  // prize bears hanging on the side walls
  [[-2.12, -1, 0], [-2.12, .2, 1], [2.12, -1, 2], [2.12, .2, 0]].forEach(([x, z, k]) => {
    const bear = makeBear(cfg.bears[k]);
    bear.position.set(x, 2.35, z);
    bear.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    const hook = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .35, 4), trimMat);
    hook.position.set(x, 2.68, z);
    g.add(bear, hook);
  });

  const spot = new THREE.SpotLight(0xffd9a0, 1.8, 13, .95, .55, 1);
  spot.position.set(bx, 3, 2.5);
  spot.target.position.set(bx, 1, -1.2);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -.0006;
  spot.shadow.camera.near = .5;
  spot.shadow.camera.far = 12;
  scene.add(spot, spot.target);

  // invisible box for picking the booth from the hub view
  const hit = new THREE.Mesh(new THREE.BoxGeometry(4.8, 4.8, 3.9), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(0, 2.4, .1);
  hit.userData.booth = i;
  g.add(hit);

  return { group: g, back, hit, signBulbs, fabric };
}

const booths = [
  buildBooth(0, { title: 'BOTTLE SMASH', sub: 'THREE BALLS · KNOCK EM ALL', price: '3 BALLS · 1 PLAY', c1: '#c22541', c2: '#fff3dd',
    bears: [0xff8fb1, 0xffc54d, 0x36d6c3], backMat: velvetMat('#5c0f22', "KNOCK 'EM DOWN") }),
  buildBooth(1, { title: 'DUCK SHOOT', sub: 'SHOOTING GALLERY', price: '40 SECONDS', c1: '#2479c9', c2: '#fff3dd',
    bears: [0xffc54d, 0xe8364f, 0x8d6bff], backMat: lakeMat() }),
  buildBooth(2, { title: 'BALLOON DARTS', sub: 'POP · POP · POP', price: '12 DARTS', c1: '#7a35c4', c2: '#ffc54d',
    bears: [0x36d6c3, 0xff8fb1, 0xffc54d], backMat: velvetMat('#2a0f4a', 'POP TO WIN') }),
];
const boothHits = booths.map(b => b.hit);

/* ------------------------------------------------------------------ animation */
function updateMidway(dt){
  ferris.wheel.rotation.z += dt * .11;
  for (const g of ferris.gondolas) g.rotation.z = -ferris.wheel.rotation.z + Math.sin(time * 1.3 + g.position.x) * .05; // stay upright, sway a little
  tentFlags.forEach((f, i) => { f.rotation.y = Math.sin(time * 2 + i) * .35; });
  for (const b of allBulbs) b.update(time, dt);
}
