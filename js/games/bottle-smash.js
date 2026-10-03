/**
 * Bottle Smash — three rounds, three balls per round.
 *
 * Bottles are cannon.js rigid bodies stacked 3-2-1 on a stand. A bottle counts
 * as down once it tips past ~55 degrees or drops below the stand. Clearing all
 * six pays a sweep bonus plus a bonus per unused ball. The aim reticle sways a
 * little more each round. Balls fly a fixed-time ballistic arc to the reticle.
 */
'use strict';

function BottleGame(){
  const self = this;
  const bx = BOOTH_X[0];
  const STAND_TOP = 1.15;   // y of the stand's top surface
  const STAND_Z = -.55;     // z of the bottle stack (also the aim plane)
  const ROUNDS = 3, BALLS_PER_ROUND = 3;
  const POINTS_PER_BOTTLE = 10, SWEEP_BONUS = 50, UNUSED_BALL_BONUS = 25;
  const SWAY_BY_ROUND = [1, 1.4, 1.85];
  const FLIGHT_TIME = .44;  // seconds from hand to target
  const THROW_COOLDOWN = .6;
  const ROUND_SETTLE_TIME = 2.4; // wait after the last ball before scoring the round

  this.name = 'Bottle Smash';
  this.goal = 200;
  this.camPos = new THREE.Vector3(bx, 1.72, 3.5);
  this.camTarget = new THREE.Vector3(bx, 1.48, -1.2);

  /* ---------------------------------------------------------------- physics world */
  const world = new CANNON.World();
  world.gravity.set(0, -9.82, 0);
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 20;
  world.allowSleep = true;
  const matStatic = new CANNON.Material('static'), matBottle = new CANNON.Material('bottle'), matBall = new CANNON.Material('ball');
  world.addContactMaterial(new CANNON.ContactMaterial(matBottle, matStatic, { friction: .45, restitution: .15 }));
  world.addContactMaterial(new CANNON.ContactMaterial(matBottle, matBottle, { friction: .3, restitution: .2 }));
  world.addContactMaterial(new CANNON.ContactMaterial(matBall, matBottle, { friction: .2, restitution: .3 }));
  world.addContactMaterial(new CANNON.ContactMaterial(matBall, matStatic, { friction: .4, restitution: .45 }));

  function staticBox(hx, hy, hz, x, y, z){
    const b = new CANNON.Body({ mass: 0, material: matStatic });
    b.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
    b.position.set(x, y, z);
    world.addBody(b);
  }
  const floor = new CANNON.Body({ mass: 0, material: matStatic });
  floor.addShape(new CANNON.Plane());
  floor.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  floor.position.set(0, .14, 0);
  world.addBody(floor);
  staticBox(2.3, 1.6, .06, bx, 1.55, -1.7);      // back wall
  staticBox(.06, 1.6, 1.8, bx - 2.2, 1.55, 0);   // side walls
  staticBox(.06, 1.6, 1.8, bx + 2.2, 1.55, 0);
  staticBox(2.2, .5, .23, bx, .5, 1.3);           // counter
  staticBox(.34, .03, .22, bx, STAND_TOP - .03, STAND_Z);              // stand top
  staticBox(.05, (STAND_TOP - .2) / 2, .05, bx, .14 + (STAND_TOP - .2) / 2, STAND_Z); // stand leg

  /* ---------------------------------------------------------------- stand visuals */
  const red = new THREE.MeshStandardMaterial({ color: 0xc22541, roughness: .5 });
  const standTop = new THREE.Mesh(new THREE.BoxGeometry(.68, .06, .44), red);
  standTop.position.set(bx, STAND_TOP - .03, STAND_Z);
  standTop.castShadow = standTop.receiveShadow = true;
  const standEdge = new THREE.Mesh(new THREE.BoxGeometry(.7, .02, .46), trimMat);
  standEdge.position.set(bx, STAND_TOP - .065, STAND_Z);
  const standLeg = new THREE.Mesh(new THREE.CylinderGeometry(.045, .06, STAND_TOP - .2, 10), trimMat);
  standLeg.position.set(bx, .14 + (STAND_TOP - .2) / 2, STAND_Z);
  standLeg.castShadow = true;
  const standFoot = new THREE.Mesh(new THREE.CylinderGeometry(.28, .32, .06, 24), red);
  standFoot.position.set(bx, .17, STAND_Z);
  standFoot.receiveShadow = true;
  scene.add(standTop, standEdge, standLeg, standFoot);

  /* ---------------------------------------------------------------- bottles */
  const profile = [[0, -.15], [.078, -.15], [.085, -.142], [.085, .02], [.074, .06], [.05, .095], [.042, .125], [.047, .135], [.047, .15], [0, .15]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const bottleGeo = new THREE.LatheGeometry(profile, 28);
  const bottleMat = new THREE.MeshStandardMaterial({ color: 0xdfe5ee, metalness: .45, roughness: .26 });
  const bandGeo = new THREE.CylinderGeometry(.0868, .0868, .055, 28, 1, true);
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xe8364f, roughness: .5, side: THREE.DoubleSide });
  // cannon's Cylinder runs along z; rotate the shape so it stands up along y
  const cylinderUpright = new CANNON.Quaternion();
  cylinderUpright.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  /** [x offset, row] for the 3-2-1 pyramid. */
  const SLOTS = [[-.18, 0], [0, 0], [.18, 0], [-.09, 1], [.09, 1], [0, 2]];
  const UP = new CANNON.Vec3(0, 1, 0), upWorld = new CANNON.Vec3();

  const bottles = SLOTS.map(slot => {
    const mesh = new THREE.Group();
    const shell = new THREE.Mesh(bottleGeo, bottleMat);
    shell.castShadow = shell.receiveShadow = true;
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.y = -.03;
    mesh.add(shell, band);
    scene.add(mesh);

    const body = new CANNON.Body({ mass: .55, material: matBottle, linearDamping: .05, angularDamping: .12 });
    body.addShape(new CANNON.Cylinder(.085, .085, .3, 12), new CANNON.Vec3(), cylinderUpright);
    body.allowSleep = true;
    body.sleepSpeedLimit = .15;
    body.sleepTimeLimit = .4;
    world.addBody(body);

    const bottle = { mesh, body, slot, down: false, lastSound: 0 };
    body.addEventListener('collide', e => {
      if (time - bottle.lastSound < .07) return;
      const impact = e.body.velocity.vsub(body.velocity).norm();
      if (impact > .7){ bottle.lastSound = time; Sound.clank(impact / 6); }
    });
    return bottle;
  });

  function syncBottles(){
    for (const b of bottles){ b.mesh.position.copy(b.body.position); b.mesh.quaternion.copy(b.body.quaternion); }
  }
  /** Re-stack the pyramid. Bottles start asleep so the stack can't creep before a ball arrives. */
  function resetRack(){
    for (const b of bottles){
      const [x, row] = b.slot;
      b.body.position.set(bx + x, STAND_TOP + .151 + row * .302, STAND_Z);
      b.body.quaternion.set(0, 0, 0, 1);
      b.body.velocity.set(0, 0, 0);
      b.body.angularVelocity.set(0, 0, 0);
      b.body.force.set(0, 0, 0);
      b.body.torque.set(0, 0, 0);
      b.body.sleep();
      b.down = false;
    }
    syncBottles();
  }
  resetRack();

  /* ---------------------------------------------------------------- balls */
  const ballGeo = new THREE.SphereGeometry(.07, 20, 14);
  const ballMat = new THREE.MeshStandardMaterial({ map: canvasTexture(baseballCanvas()), roughness: .6 });
  /** Spare balls resting on the counter, one per throw left. */
  const tray = [0, 1, 2].map(i => {
    const m = new THREE.Mesh(ballGeo, ballMat);
    m.position.set(bx + 1.25 + i * .17, 1.14, 1.22);
    m.rotation.set(rand(0, 3), rand(0, 3), 0);
    m.castShadow = true;
    scene.add(m);
    return m;
  });
  let balls = [];

  function spawnBall(target){
    const p0 = new CANNON.Vec3(bx + .32, 1.3, 2.75), T = FLIGHT_TIME;
    const body = new CANNON.Body({ mass: .45, material: matBall });
    body.addShape(new CANNON.Sphere(.07));
    body.position.copy(p0);
    // initial velocity that reaches `target` after T seconds under gravity
    body.velocity.set((target.x - p0.x) / T, (target.y - p0.y) / T + .5 * 9.82 * T, (target.z - p0.z) / T);
    body.angularVelocity.set(rand(-20, -8), rand(-4, 4), rand(-4, 4));
    body.allowSleep = false;
    world.addBody(body);
    const mesh = new THREE.Mesh(ballGeo, ballMat);
    mesh.castShadow = true;
    scene.add(mesh);

    const ball = { body, mesh, age: 0, lastSound: 0, wokeRack: false, hitBottle: false };
    body.addEventListener('collide', e => {
      const impact = e.body.velocity.vsub(body.velocity).norm();
      const isBottle = e.body.material === matBottle;
      if (isBottle && !ball.hitBottle && impact > 1.5){
        ball.hitBottle = true;
        addShake(.35);
        sparks.burst(new THREE.Vector3().copy(body.position), 0xfff3dd, 14, 3, .35);
      }
      if (time - ball.lastSound < .06 || impact < 1) return;
      ball.lastSound = time;
      if (isBottle) Sound.clank(impact / 7); else Sound.thud(impact / 8);
    });
    balls.push(ball);
  }
  function removeBall(i){ world.remove(balls[i].body); scene.remove(balls[i].mesh); balls.splice(i, 1); }
  function clearBalls(){ while (balls.length) removeBall(balls.length - 1); }

  /* ---------------------------------------------------------------- game state */
  const reticle = makeReticle(0xff4060);
  const aim = new THREE.Vector3(bx, 1.55, STAND_Z), aimRaw = new THREE.Vector3();
  /** 'idle' | 'intro' | 'aim' | 'sweep' | 'roundEnd' */
  let state = 'idle', stateTime = 0;
  let round = 0, ballsLeft = 0, score = 0, cooldown = 0, sinceThrow = 99, downCount = 0, sway = 1;

  function setState(s){ state = s; stateTime = 0; }

  function nextRound(){
    round++;
    clearBalls();
    resetRack();
    ballsLeft = BALLS_PER_ROUND;
    downCount = 0;
    sway = SWAY_BY_ROUND[round - 1];
    setState('intro');
    banner('Round ' + round, round === ROUNDS ? 'Final round · the aim gets shaky' : 'Knock all six off the stand');
    HUD.ammo('ball', BALLS_PER_ROUND, ballsLeft);
  }

  function throwBall(){
    if (state !== 'aim' || ballsLeft <= 0 || cooldown > 0) return;
    ballsLeft--;
    cooldown = THROW_COOLDOWN;
    sinceThrow = 0;
    spawnBall(reticle.position.clone());
    Sound.whoosh();
    HUD.ammo('ball', BALLS_PER_ROUND, ballsLeft);
  }

  function checkBottles(){
    for (const b of bottles){
      if (b.down) continue;
      b.body.quaternion.vmult(UP, upWorld);
      if (b.body.position.y < STAND_TOP - .02 || upWorld.y < .55){
        b.down = true;
        downCount++;
        score += POINTS_PER_BOTTLE;
        HUD.score(score);
        pop3(b.mesh.position, '+' + POINTS_PER_BOTTLE);
        sparks.burst(b.mesh.position, 0xffc54d, 10, 2.5, .5);
      }
    }
  }

  /* ---------------------------------------------------------------- game interface */
  this.start = function(){
    score = 0;
    round = 0;
    HUD.score(0);
    HUD.tip('Move to aim · click to throw · the sweet spot is where the bottom two rows meet');
    reticle.visible = true;
    nextRound();
  };
  this.stop = function(){
    setState('idle');
    reticle.visible = false;
    clearBalls();
    resetRack();
    tray.forEach(m => { m.visible = true; });
  };
  this.down = function(){};
  this.up = function(){ throwBall(); };
  this.key = function(code, isDown){ if (code === 'Space' && isDown) throwBall(); };

  this.update = function(dt){
    world.step(1 / 120, dt, 12); // small fixed step so a fast ball can't tunnel through a bottle
    syncBottles();
    for (let i = balls.length - 1; i >= 0; i--){
      const ball = balls[i];
      ball.age += dt;
      ball.mesh.position.copy(ball.body.position);
      ball.mesh.quaternion.copy(ball.body.quaternion);
      if (!ball.wokeRack && ball.body.position.z < STAND_Z + .7){ // wake the stack just before impact
        ball.wokeRack = true;
        bottles.forEach(b => b.body.wakeUp());
      }
      if (ball.age > 5 || ball.body.position.y < -1) removeBall(i);
    }
    if (state === 'idle') return;

    stateTime += dt;
    cooldown -= dt;
    sinceThrow += dt;

    if (aimOnPlane(STAND_Z, aimRaw)){
      aim.x = clamp(aimRaw.x, bx - 1.6, bx + 1.6);
      aim.y = clamp(aimRaw.y, .95, 2.6);
    }
    const A = .06 * sway;
    reticle.position.set(
      aim.x + Math.sin(time * 1.9) * A + Math.sin(time * 4.3) * A * .45,
      aim.y + Math.sin(time * 2.5 + 1) * A * .8 + Math.cos(time * 3.4) * A * .35,
      STAND_Z);
    reticle.userData.mat.opacity = state === 'aim' && ballsLeft > 0 && cooldown <= 0 ? .95 : .35;
    tray.forEach((m, i) => { m.visible = i < ballsLeft; });

    switch (state){
      case 'intro':
        if (stateTime > 1.2) setState('aim');
        break;
      case 'aim':
        checkBottles();
        if (downCount === bottles.length){
          const bonus = SWEEP_BONUS + UNUSED_BALL_BONUS * ballsLeft;
          score += bonus;
          HUD.score(score);
          banner('Clean sweep!', '+' + bonus + ' bonus', 'good');
          Sound.sweep();
          confettiBurst(new THREE.Vector3(bx, STAND_TOP + .4, STAND_Z), 110);
          addShake(.4);
          setState('sweep');
        } else if (ballsLeft === 0 && sinceThrow > ROUND_SETTLE_TIME){
          banner(downCount + ' of 6', 'Round ' + round + ' done', downCount >= 4 ? '' : 'bad');
          setState('roundEnd');
        }
        break;
      case 'sweep':
      case 'roundEnd':
        if (stateTime > 2){
          if (round < ROUNDS) nextRound();
          else { setState('idle'); reticle.visible = false; gameOver(self, score); }
        }
        break;
    }
  };
}
