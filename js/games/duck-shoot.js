/**
 * Duck Shoot — 40-second shooting gallery.
 *
 * Three rows of ducks ride past on painted waves, faster as the clock runs down.
 * Yellow 10, blue 20, golden 50; clock targets add 5 seconds (capped at 15 bonus
 * seconds per run). Every 5 hits in a row raises the multiplier, up to x3; a miss
 * resets it. Six corks per clip; R, right-click or an empty clip reloads.
 */
'use strict';

function DuckGame(){
  const self = this;
  const bx = BOOTH_X[1];
  const ROUND_TIME = 40, CLIP = 6, RELOAD_TIME = .9;
  const MAX_BONUS_TIME = 15, CLOCK_BONUS = 5;
  const HITS_PER_MULT = 5, MAX_MULT = 3;
  const POINTS = { yellow: 10, blue: 20, gold: 50, clock: 5 };
  const ROWS = [
    { y: 1.1, z: -.5, speed: .8, dir: 1 },
    { y: 1.55, z: -.95, speed: 1.1, dir: -1 },
    { y: 2.0, z: -1.38, speed: 1.5, dir: 1 },
  ];
  const PER_ROW = 5;
  const TRACK = 4.8, HALF_TRACK = TRACK / 2; // ducks wrap out of sight behind the side masks
  const TIP = 'Click to shoot · R or right-click to reload';

  this.name = 'Duck Shoot';
  this.goal = 450;
  this.camPos = new THREE.Vector3(bx, 1.72, 3.5);
  this.camTarget = new THREE.Vector3(bx, 1.55, -1.2);

  /* ---------------------------------------------------------------- targets */
  const bodyMats = {
    yellow: new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: .4 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x47b8ff, roughness: .4 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xffb21e, roughness: .25, metalness: .6, emissive: 0x5a3300 }),
  };
  const beakMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: .5 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: .3 });
  const bullseyeMat = new THREE.MeshStandardMaterial({ map: canvasTexture(targetCanvas()), roughness: .6 });
  const geo = {
    body: new THREE.SphereGeometry(.13, 20, 14),
    head: new THREE.SphereGeometry(.085, 16, 12),
    beak: new THREE.ConeGeometry(.03, .09, 10),
    tail: new THREE.ConeGeometry(.045, .1, 8),
    eye: new THREE.SphereGeometry(.016, 8, 6),
    bullseye: new THREE.CircleGeometry(.062, 24),
    hitbox: new THREE.BoxGeometry(.44, .42, .16),
  };
  const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });

  /** Duck facing +x, origin at its base. Returns the meshes whose material changes with type. */
  function makeDuck(){
    const g = new THREE.Group();
    const body = new THREE.Mesh(geo.body, bodyMats.yellow);
    body.scale.set(1.3, .85, .8); body.position.y = .13; body.castShadow = true;
    const head = new THREE.Mesh(geo.head, bodyMats.yellow);
    head.position.set(.13, .28, 0); head.castShadow = true;
    const beak = new THREE.Mesh(geo.beak, beakMat);
    beak.rotation.z = -Math.PI / 2; beak.position.set(.235, .27, 0);
    const tail = new THREE.Mesh(geo.tail, bodyMats.yellow);
    tail.rotation.z = Math.PI / 2 + .7; tail.position.set(-.18, .19, 0);
    const eyeL = new THREE.Mesh(geo.eye, eyeMat); eyeL.position.set(.18, .31, .06);
    const eyeR = new THREE.Mesh(geo.eye, eyeMat); eyeR.position.set(.18, .31, -.06);
    const bullseye = new THREE.Mesh(geo.bullseye, bullseyeMat); bullseye.position.set(-.01, .13, .107);
    g.add(body, head, beak, tail, eyeL, eyeR, bullseye);
    return { group: g, tinted: [body, head, tail] };
  }

  const [clockCanvas, clockCtx] = makeCanvas(128, 128);
  const clockTex = canvasTexture(clockCanvas);
  whenFonts(() => {
    const g = clockCtx;
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = '#1f9a8c'; g.beginPath(); g.arc(64, 64, 62, 0, TAU); g.fill();
    g.fillStyle = '#fff3dd'; g.beginPath(); g.arc(64, 64, 48, 0, TAU); g.fill();
    g.fillStyle = '#0c3a35'; g.font = '700 40px Fredoka, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('+' + CLOCK_BONUS + 's', 64, 67);
    clockTex.needsUpdate = true;
  });
  const clockMat = new THREE.MeshStandardMaterial({ map: clockTex, roughness: .5, emissive: 0x0c3a35 });
  function makeClock(){
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .25, 6), trimMat);
    stick.position.y = .12;
    const face = new THREE.Mesh(new THREE.CircleGeometry(.13, 28), clockMat);
    face.position.set(0, .32, .02);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.13, .012, 6, 28), trimMat);
    rim.position.set(0, .32, .02);
    g.add(stick, face, rim);
    return g;
  }

  /* ---------------------------------------------------------------- set dressing */
  const [waveCanvas, wg] = makeCanvas(512, 128);
  const waveY = x => 34 + 12 * Math.sin(x / 512 * TAU * 4);
  wg.beginPath(); wg.moveTo(0, 128);
  for (let x = 0; x <= 512; x += 4) wg.lineTo(x, waveY(x));
  wg.lineTo(512, 128); wg.closePath();
  const waterGrad = wg.createLinearGradient(0, 20, 0, 128);
  waterGrad.addColorStop(0, '#3f9cf0'); waterGrad.addColorStop(1, '#123a7a');
  wg.fillStyle = waterGrad; wg.fill();
  wg.strokeStyle = '#fff3dd'; wg.lineWidth = 7; wg.beginPath();
  for (let x = 0; x <= 512; x += 4){ if (x) wg.lineTo(x, waveY(x)); else wg.moveTo(x, waveY(x)); }
  wg.stroke();

  const waveTextures = ROWS.map((row, i) => {
    const t = canvasTexture(waveCanvas, 2.6, 1);
    t.offset.x = i * .3;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(4.6, .42), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: .4, roughness: .5 }));
    strip.position.set(bx, row.y - .15, row.z + .16);
    strip.receiveShadow = true;
    scene.add(strip);
    return t;
  });

  // side masks and a top valance frame the gallery and hide the wrap-around
  const maskMat = booths[1].fabric;
  for (const side of [-1, 1]){
    const mask = new THREE.Mesh(new THREE.BoxGeometry(.42, 2, .08), maskMat);
    mask.position.set(bx + side * 2.04, 1.6, -.3);
    mask.castShadow = true;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(.05, 2, .1), trimMat);
    trim.position.set(bx + side * 1.83, 1.6, -.3);
    scene.add(mask, trim);
  }
  const valance = new THREE.Mesh(new THREE.BoxGeometry(4.5, .3, .08), maskMat);
  valance.position.set(bx, 2.62, -.3);
  const valanceTrim = new THREE.Mesh(new THREE.BoxGeometry(3.7, .04, .1), trimMat);
  valanceTrim.position.set(bx, 2.47, -.3);
  scene.add(valance, valanceTrim);

  /* ---------------------------------------------------------------- slots (one target each) */
  let clockAllowed = false, bonusTime = 0;
  function rollType(rowIndex){
    const r = Math.random();
    if (r < .07) return 'gold';
    if (r < .13 && clockAllowed && bonusTime < MAX_BONUS_TIME) return 'clock';
    return rowIndex === 2 ? 'blue' : 'yellow';
  }
  function setType(slot, type){
    slot.type = type;
    slot.duck.group.visible = type !== 'clock';
    slot.clock.visible = type === 'clock';
    if (type !== 'clock') slot.duck.tinted.forEach(m => { m.material = bodyMats[type]; });
  }
  function respawn(slot){
    slot.down = false;
    slot.downTime = 0;
    slot.pivot.rotation.x = 0;
    setType(slot, rollType(slot.rowIndex));
  }

  const slots = [], hitboxes = [];
  ROWS.forEach((row, rowIndex) => {
    for (let k = 0; k < PER_ROW; k++){
      const group = new THREE.Group();
      group.position.set(bx, row.y, row.z);
      const pivot = new THREE.Group(); // tips backwards when hit
      const duck = makeDuck(), clock = makeClock();
      const hitbox = new THREE.Mesh(geo.hitbox, hitboxMat);
      hitbox.position.y = .22;
      pivot.add(duck.group, clock, hitbox);
      group.add(pivot);
      scene.add(group);
      const slot = { group, pivot, duck, clock, hitbox, row, rowIndex, k, x: 0, type: 'yellow', down: false, downTime: 0, phase: Math.random() * 6 };
      hitbox.userData.slot = slot;
      slots.push(slot);
      hitboxes.push(hitbox);
    }
  });
  function resetSlots(){
    for (const s of slots){
      s.x = -HALF_TRACK + s.k * (TRACK / PER_ROW) + s.rowIndex * .32;
      respawn(s);
    }
  }
  resetSlots();

  /* ---------------------------------------------------------------- cork gun (lives in camera space) */
  const gun = new THREE.Group();
  const gunMetal = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: .7, roughness: .35 });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.016, .02, .56, 12), gunMetal);
  barrel.rotation.x = Math.PI / 2; barrel.position.z = .28;
  const barrelBand = new THREE.Mesh(new THREE.CylinderGeometry(.026, .026, .05, 12), trimMat);
  barrelBand.rotation.x = Math.PI / 2; barrelBand.position.z = .12;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(.065, .1, .36), woodMat);
  stock.position.set(0, -.035, -.06);
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(.017, .014, .035, 10), new THREE.MeshStandardMaterial({ color: 0xd7a25e, roughness: .9 }));
  cork.rotation.x = Math.PI / 2; cork.position.z = .575;
  const muzzleFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: HALO, color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  muzzleFlash.scale.set(.3, .3, 1); muzzleFlash.position.z = .62; muzzleFlash.visible = false;
  gun.add(barrel, barrelBand, stock, cork, muzzleFlash);
  gun.position.set(.3, -.3, -.62);
  gun.visible = false;
  camera.add(gun);
  const crosshair = $('cross');

  /* ---------------------------------------------------------------- game state */
  /** 'idle' | 'intro' | 'play' | 'ending' */
  let state = 'idle', stateTime = 0;
  let score = 0, ammo = CLIP, reloading = false, reloadLeft = 0, streak = 0;
  let timeLeft = ROUND_TIME, recoil = 0, flashLeft = 0, lastTickSecond = 99;
  const aimPoint = new THREE.Vector3();

  function setState(s){ state = s; stateTime = 0; }
  function multiplier(){ return Math.min(MAX_MULT, 1 + Math.floor(streak / HITS_PER_MULT)); }

  function startReload(){
    if (reloading || ammo === CLIP) return;
    reloading = true;
    reloadLeft = RELOAD_TIME;
    Sound.reload();
    HUD.tip('Reloading…');
  }

  function hit(slot, point){
    slot.down = true;
    slot.downTime = 0;
    streak++;
    const m = multiplier(), value = POINTS[slot.type] * m;
    score += value;
    HUD.score(score);
    if (slot.type === 'gold'){
      pop3(point, 'Golden duck! +' + value, 'gold');
      confettiBurst(point, 60);
      Sound.ding(1.5); Sound.sweep();
      addShake(.35);
    } else if (slot.type === 'clock'){
      timeLeft += CLOCK_BONUS;
      bonusTime += CLOCK_BONUS;
      pop3(point, '+' + CLOCK_BONUS + ' seconds', 'teal');
      Sound.ding(1.25);
      sparks.burst(point, 0x36d6c3, 26, 3, .6);
    } else {
      pop3(point, '+' + value, m > 1 ? 'big' : '');
      Sound.ding(slot.type === 'blue' ? 1.19 : 1);
    }
    sparks.burst(point, 0xffc54d, 18, 3.2, .45);
    HUD.combo(m > 1 ? `x${m} combo · ${streak} in a row` : streak > 1 ? `${streak} in a row` : '');
  }

  function miss(){
    if (streak >= HITS_PER_MULT) pop3(aimPoint, 'Combo lost', 'bad');
    streak = 0;
    HUD.combo('');
    const wall = raycaster.intersectObject(booths[1].back, false);
    confetti.burst(wall.length ? wall[0].point : aimPoint, 0xd8c7a6, 10, 1.4, .5); // cork dust
    Sound.puff();
  }

  function shoot(){
    if (state !== 'play' || reloading) return;
    if (ammo <= 0){ Sound.empty(); startReload(); return; }
    ammo--;
    recoil = 1;
    flashLeft = .06;
    Sound.cork();
    addShake(.12);
    crosshair.classList.add('kick');
    setTimeout(() => crosshair.classList.remove('kick'), 60);
    HUD.ammo('cork', CLIP, ammo);

    raycaster.setFromCamera(ndc, camera);
    const live = hitboxes.filter(h => !h.userData.slot.down);
    const hits = raycaster.intersectObjects(live, false);
    if (hits.length) hit(hits[0].object.userData.slot, hits[0].point);
    else miss();

    if (ammo === 0) startReload();
    else HUD.tip(TIP);
  }

  /* ---------------------------------------------------------------- game interface */
  this.start = function(){
    score = 0; ammo = CLIP; reloading = false; streak = 0;
    timeLeft = ROUND_TIME; lastTickSecond = 99; clockAllowed = true; bonusTime = 0;
    resetSlots();
    HUD.score(0); HUD.ammo('cork', CLIP, CLIP); HUD.timer(ROUND_TIME); HUD.combo(''); HUD.tip(TIP);
    gun.visible = true;
    crosshair.style.display = 'block';
    setState('intro');
    banner('Ready?', ROUND_TIME + ' seconds on the clock');
    Sound.beep(false);
  };
  this.stop = function(){
    setState('idle');
    clockAllowed = false;
    gun.visible = false;
    crosshair.style.display = 'none';
    HUD.timer(null);
    HUD.combo('');
  };
  this.down = function(e){ if (e.button === 2) startReload(); else shoot(); };
  this.up = function(){};
  this.key = function(code, isDown){
    if (!isDown) return;
    if (code === 'KeyR') startReload();
    if (code === 'Space') shoot();
  };

  this.update = function(dt){
    // targets keep moving even in the hub view
    const speedUp = state === 'play' ? 1 + clamp(1 - timeLeft / ROUND_TIME, 0, 1) * .55 : 1;
    waveTextures.forEach((t, i) => { t.offset.x -= ROWS[i].dir * dt * .08; });
    for (const s of slots){
      s.x += s.row.speed * s.row.dir * dt * speedUp;
      if (Math.abs(s.x) > HALF_TRACK){ s.x -= Math.sign(s.x) * TRACK; respawn(s); }
      s.group.position.x = bx + s.x;
      s.duck.group.scale.x = s.row.dir; // face the direction of travel
      s.pivot.position.y = Math.sin(time * 5 + s.phase) * .012;
      s.pivot.rotation.z = Math.sin(time * 4 + s.phase) * .05;
      if (s.down){ s.downTime += dt; s.pivot.rotation.x = -Math.min(1, s.downTime / .15) * 1.45; }
    }

    if (gun.visible){
      raycaster.setFromCamera(ndc, camera);
      aimPoint.copy(raycaster.ray.direction).multiplyScalar(5).add(raycaster.ray.origin);
      camera.updateMatrixWorld();
      gun.lookAt(aimPoint);
      recoil = Math.max(0, recoil - dt * 7);
      gun.rotateX(-recoil * .22);
      gun.position.z = -.62 + recoil * .06;
      flashLeft -= dt;
      muzzleFlash.visible = flashLeft > 0;
      crosshair.style.left = pointerPx.x + 'px';
      crosshair.style.top = pointerPx.y + 'px';
    }

    if (reloading){
      reloadLeft -= dt;
      if (reloadLeft <= 0){ reloading = false; ammo = CLIP; HUD.ammo('cork', CLIP, CLIP); HUD.tip(TIP); }
    }

    stateTime += dt;
    switch (state){
      case 'intro':
        if (stateTime > 1.5){ setState('play'); banner('Go!', '', 'good'); Sound.beep(true); }
        break;
      case 'play': {
        timeLeft -= dt;
        HUD.timer(Math.max(0, timeLeft));
        const second = Math.ceil(timeLeft);
        if (second <= 5 && second > 0 && second !== lastTickSecond){ lastTickSecond = second; Sound.tick(); }
        if (timeLeft <= 0){
          const won = score >= self.goal;
          clockAllowed = false;
          HUD.timer(0);
          banner("Time's up!", won ? 'You beat the goal' : 'Not quite enough', won ? 'good' : 'bad');
          Sound.beep(true);
          setState('ending');
        }
        break;
      }
      case 'ending':
        if (stateTime > 1.6){
          setState('idle');
          gun.visible = false;
          crosshair.style.display = 'none';
          gameOver(self, score);
        }
        break;
    }
  };
}
