/**
 * Balloon Darts — 12 darts at a 7x4 board of balloons.
 *
 * The aim reticle drifts. Holding the pointer (or Space) steadies it for a
 * couple of seconds, then the hand starts to shake; releasing throws. A dart
 * flies a short arc and pops whichever balloon its aim point lands on.
 * Balloons pay 10, gold balloons pay 30 and refund a dart, every third pop in
 * a row adds a 20-point hat trick, and clearing the board adds 50.
 */
'use strict';

function DartGame(){
  const self = this;
  const bx = BOOTH_X[2];
  const BOARD_Z = -1.45;   // cork board surface
  const AIM_Z = -1.1;      // front of the balloons; the aim plane
  const DARTS = 12, GOLD_BALLOONS = 3;
  const POP_POINTS = 10, GOLD_POINTS = 30, HAT_TRICK_BONUS = 20, CLEAR_BONUS = 50;
  const FLIGHT_TIME = .36, ARC_HEIGHT = .22;

  this.name = 'Balloon Darts';
  this.goal = 100;
  this.camPos = new THREE.Vector3(bx, 1.72, 3.5);
  this.camTarget = new THREE.Vector3(bx, 1.6, -1.2);

  /* ---------------------------------------------------------------- board */
  const board = new THREE.Mesh(new THREE.BoxGeometry(3.9, 2.15, .08), new THREE.MeshStandardMaterial({ map: canvasTexture(corkCanvas(), 2, 1.1), roughness: .95 }));
  board.position.set(bx, 1.75, BOARD_Z);
  board.receiveShadow = true;
  scene.add(board);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x7a35c4, roughness: .6 });
  for (const [w, h, x, y] of [[4.1, .1, 0, 2.875], [4.1, .1, 0, .625], [.1, 2.35, -2, 1.75], [.1, 2.35, 2, 1.75]]){
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, .14), frameMat);
    bar.position.set(bx + x, y, BOARD_Z + .02);
    bar.castShadow = true;
    scene.add(bar);
  }

  /* ---------------------------------------------------------------- balloons */
  const COLORS = [0xff3b5c, 0xff8a3d, 0x3bd16f, 0x2fa8ff, 0xb45cff, 0xff6fd0, 0x36d6c3];
  const GOLD = 0xffc54d;
  const colorMats = COLORS.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .18, metalness: .05, emissive: new THREE.Color(c).multiplyScalar(.18) }));
  const goldMat = new THREE.MeshStandardMaterial({ color: GOLD, roughness: .15, metalness: .55, emissive: 0x5a3a00 });
  const balloonGeo = new THREE.SphereGeometry(.16, 24, 18);
  const knotGeo = new THREE.ConeGeometry(.028, .05, 8);
  const shineMat = new THREE.SpriteMaterial({ map: HALO, color: 0xffffff, transparent: true, opacity: .6, depthWrite: false });
  const RX = .175, RY = .205; // hit ellipse radii, a touch generous

  const balloons = [];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 7; col++){
    const group = new THREE.Group();
    const body = new THREE.Mesh(balloonGeo, colorMats[0]);
    body.scale.set(1, 1.18, 1);
    body.castShadow = true;
    const knot = new THREE.Mesh(knotGeo, colorMats[0]);
    knot.position.y = -.2;
    const shine = new THREE.Sprite(shineMat);
    shine.scale.set(.08, .1, 1);
    shine.position.set(-.055, .08, .14);
    group.add(body, knot, shine);
    const home = new THREE.Vector3(bx + (col - 3) * .5, 1.05 + row * .46 + (col % 2) * .07, BOARD_Z + .21);
    group.position.copy(home);
    scene.add(group);
    balloons.push({ group, body, knot, home, alive: true, gold: false, color: COLORS[0], phase: Math.random() * TAU });
  }
  /** Fresh board: every balloon back, random colours, a few gold ones. */
  function inflateAll(){
    const golds = new Set();
    while (golds.size < GOLD_BALLOONS) golds.add(Math.floor(Math.random() * balloons.length));
    balloons.forEach((b, i) => {
      const k = Math.floor(Math.random() * COLORS.length);
      b.alive = true;
      b.group.visible = true;
      b.gold = golds.has(i);
      b.color = b.gold ? GOLD : COLORS[k];
      b.body.material = b.knot.material = b.gold ? goldMat : colorMats[k];
    });
  }
  inflateAll();

  /* ---------------------------------------------------------------- darts */
  const dartMetal = new THREE.MeshStandardMaterial({ color: 0xd5dbe5, metalness: .8, roughness: .25 });
  const flightMats = [0xe8364f, 0x36d6c3, 0xffc54d, 0x8d6bff].map(c => new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: .6 }));
  /** Dart with its tip at the origin pointing +z (so lookAt aims it). */
  function makeDart(){
    const g = new THREE.Group();
    const along = (mesh, z) => { mesh.rotation.x = Math.PI / 2; mesh.position.z = z; g.add(mesh); };
    along(new THREE.Mesh(new THREE.ConeGeometry(.008, .05, 8), dartMetal), -.025);
    along(new THREE.Mesh(new THREE.CylinderGeometry(.011, .011, .07, 10), trimMat), -.085);
    along(new THREE.Mesh(new THREE.CylinderGeometry(.005, .005, .13, 6), dartMetal), -.185);
    const fm = flightMats[Math.floor(Math.random() * flightMats.length)];
    const vane1 = new THREE.Mesh(new THREE.PlaneGeometry(.075, .065), fm);
    vane1.rotation.y = Math.PI / 2;
    const vane2 = new THREE.Mesh(new THREE.PlaneGeometry(.075, .065), fm);
    vane2.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    vane1.position.z = vane2.position.z = -.235;
    g.add(vane1, vane2);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    return g;
  }
  let flying = [], stuck = [];
  const HAND = new THREE.Vector3(bx + .38, 1.2, 2.6);
  const _p = new THREE.Vector3(), _ahead = new THREE.Vector3();
  function pathAt(dart, s, out){
    out.lerpVectors(dart.from, dart.to, s);
    out.y += ARC_HEIGHT * 4 * s * (1 - s);
    return out;
  }
  function removeAllDarts(){
    for (const d of flying.concat(stuck)) scene.remove(d.group);
    flying = [];
    stuck = [];
  }

  /* ---------------------------------------------------------------- game state */
  const reticle = makeReticle(0xfff3dd);
  const aim = new THREE.Vector3(bx, 1.75, AIM_Z), aimRaw = new THREE.Vector3();
  /** 'idle' | 'intro' | 'play' | 'ending' */
  let state = 'idle', stateTime = 0;
  let score = 0, dartsLeft = DARTS, dartsShown = DARTS, streak = 0;
  let holding = false, holdTime = 0;
  /** Sway multiplier: 1 = normal, ~.2 = steadied, >1.2 = shaking. */
  let wobble = 1;

  function setState(s){ state = s; stateTime = 0; }

  /** Target wobble for how long the throw has been held. */
  function wobbleFor(held){
    if (!holding) return 1;
    if (held < .5) return 1 - .78 * (held / .5);   // settling
    if (held < 1.9) return .22;                     // steady window
    return Math.min(2.4, .22 + (held - 1.9) * 1.3); // arm gets tired
  }

  function throwDart(){
    if (state !== 'play' || dartsLeft <= 0) return;
    dartsLeft--;
    HUD.ammo('dart', dartsShown, dartsLeft);
    const group = makeDart();
    const dart = {
      group, s: 0, checked: false,
      from: HAND.clone(),
      to: new THREE.Vector3(reticle.position.x, reticle.position.y, BOARD_Z + .045),
      aimX: reticle.position.x, aimY: reticle.position.y,
    };
    pathAt(dart, 0, group.position);
    flying.push(dart);
    Sound.whoosh();
  }

  function resolveDart(dart){
    let target = null, nearest = 1;
    for (const b of balloons){
      if (!b.alive) continue;
      const dx = (dart.aimX - b.group.position.x) / RX, dy = (dart.aimY - b.group.position.y) / RY;
      const d = dx * dx + dy * dy;
      if (d < nearest){ nearest = d; target = b; }
    }
    if (!target){
      streak = 0;
      HUD.combo('');
      pop3(new THREE.Vector3(dart.aimX, dart.aimY, AIM_Z), 'Miss', 'bad');
      return;
    }

    target.alive = false;
    target.group.visible = false;
    streak++;
    const p = target.group.position;
    let points = target.gold ? GOLD_POINTS : POP_POINTS;
    Sound.pop();
    addShake(.3);
    confetti.burst(p, target.color, 34, 3.2, .9, .5); // rubber shreds
    sparks.burst(p, 0xffffff, 10, 2, .3);
    if (target.gold){
      dartsLeft++;
      dartsShown = Math.max(dartsShown, dartsLeft);
      HUD.ammo('dart', dartsShown, dartsLeft);
      pop3(p, '+' + GOLD_POINTS + ' · bonus dart', 'gold');
      Sound.ding(1.5);
    } else {
      pop3(p, '+' + POP_POINTS);
    }
    if (streak % 3 === 0){
      points += HAT_TRICK_BONUS;
      setTimeout(() => banner('Hat trick!', '+' + HAT_TRICK_BONUS + ' bonus', 'good'), 150);
      Sound.sweep();
    }
    score += points;
    HUD.score(score);
    HUD.combo(streak > 1 ? streak + ' pops in a row' : '');
    if (balloons.every(b => !b.alive)){
      score += CLEAR_BONUS;
      HUD.score(score);
      banner('Board cleared!', '+' + CLEAR_BONUS + ' bonus', 'good');
      confettiBurst(new THREE.Vector3(bx, 1.8, AIM_Z), 160);
    }
  }

  /* ---------------------------------------------------------------- game interface */
  this.start = function(){
    removeAllDarts();
    inflateAll();
    score = 0; dartsLeft = dartsShown = DARTS; streak = 0; holding = false; holdTime = 0;
    HUD.score(0);
    HUD.ammo('dart', DARTS, DARTS);
    HUD.combo('');
    HUD.tip('Hold the mouse (or Space) to steady your hand · release to throw');
    reticle.visible = true;
    setState('intro');
    banner('Pop the balloons', 'Gold ones give a free dart');
  };
  this.stop = function(){ setState('idle'); reticle.visible = false; holding = false; };
  this.down = function(){ if (state === 'play' || state === 'intro'){ holding = true; holdTime = 0; } };
  this.up = function(){ if (holding){ holding = false; throwDart(); } };
  this.key = function(code, isDown){
    if (code !== 'Space') return;
    if (isDown && !holding) this.down();
    else if (!isDown) this.up();
  };

  this.update = function(dt){
    for (const b of balloons){
      if (!b.alive) continue;
      b.group.position.y = b.home.y + Math.sin(time * 1.6 + b.phase) * .014;
      b.group.rotation.z = Math.sin(time * 1.1 + b.phase) * .06;
    }

    for (let i = flying.length - 1; i >= 0; i--){
      const d = flying[i];
      d.s = Math.min(1, d.s + dt / FLIGHT_TIME);
      d.group.position.copy(pathAt(d, d.s, _p));
      if (d.s < 1) d.group.lookAt(pathAt(d, Math.min(1, d.s + .03), _ahead));
      if (!d.checked && d.s >= .9){ d.checked = true; resolveDart(d); } // ~ when it crosses the balloons
      if (d.s >= 1){
        flying.splice(i, 1);
        stuck.push({ group: d.group, quiver: 1, rx: d.group.rotation.x, ry: d.group.rotation.y });
        Sound.thunk();
        addShake(.06);
      }
    }
    for (const d of stuck){
      if (d.quiver <= 0) continue;
      d.quiver = Math.max(0, d.quiver - dt * 2.5);
      d.group.rotation.x = d.rx + Math.sin(time * 60) * .06 * d.quiver;
      d.group.rotation.y = d.ry + Math.cos(time * 55) * .05 * d.quiver;
    }

    if (state === 'idle') return;
    stateTime += dt;
    if (holding) holdTime += dt;
    wobble += (wobbleFor(holdTime) - wobble) * Math.min(1, dt * 8);

    if (aimOnPlane(AIM_Z, aimRaw)){
      aim.x = clamp(aimRaw.x, bx - 1.85, bx + 1.85);
      aim.y = clamp(aimRaw.y, .75, 2.75);
    }
    const A = .1 * wobble, jitter = wobble > 1.2 ? (wobble - 1.2) * .02 : 0;
    reticle.position.set(
      aim.x + Math.sin(time * 1.3) * A + Math.sin(time * 3.3 + 1) * A * .4 + rand(-jitter, jitter),
      aim.y + Math.sin(time * 1.9 + .7) * A * .8 + Math.cos(time * 2.7) * A * .3 + rand(-jitter, jitter),
      AIM_Z);
    const scale = .8 + wobble * .35;
    reticle.scale.set(scale, scale, 1);
    reticle.userData.mat.color.setHex(wobble < .45 ? 0x36d6c3 : wobble > 1.25 ? 0xff4060 : 0xfff3dd);
    reticle.userData.mat.opacity = dartsLeft > 0 && state === 'play' ? .95 : .3;

    switch (state){
      case 'intro':
        if (stateTime > 1.3) setState('play');
        break;
      case 'play':
        if ((dartsLeft === 0 && flying.length === 0) || balloons.every(b => !b.alive)){
          holding = false;
          setState('ending');
        }
        break;
      case 'ending':
        if (stateTime > 1.4){ setState('idle'); reticle.visible = false; gameOver(self, score); }
        break;
    }
  };
}
