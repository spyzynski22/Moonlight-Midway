/**
 * Moonlight Midway — helpers shared by the booth games
 *
 * Each game is a constructor exposing the same interface, used by main.js:
 *   name, goal, camPos, camTarget
 *   start()            reset and begin a run
 *   stop()             abandon the run and tidy the booth
 *   update(dt)         called every frame, even when idle (keeps the booth animated)
 *   down(e) / up(e)    pointer input while playing
 *   key(code, isDown)  keyboard input while playing
 * A game calls gameOver(game, score) when a run ends.
 */
'use strict';

/** Aiming ring drawn on top of everything; userData.mat lets games recolour it. */
function makeReticle(color){
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .95, depthTest: false });
  g.add(new THREE.Mesh(new THREE.RingGeometry(.06, .078, 40), mat));
  g.add(new THREE.Mesh(new THREE.CircleGeometry(.013, 12), mat));
  for (let k = 0; k < 4; k++){
    const a = k * Math.PI / 2;
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(.035, .008), mat);
    tick.position.set(Math.cos(a) * .105, Math.sin(a) * .105, 0);
    tick.rotation.z = a;
    g.add(tick);
  }
  g.traverse(o => { o.renderOrder = 20; });
  g.visible = false;
  g.userData.mat = mat;
  scene.add(g);
  return g;
}

/** Where the pointer ray meets the plane z = const. Writes into `out`; false if it doesn't. */
function aimOnPlane(z, out){
  raycaster.setFromCamera(ndc, camera);
  const ray = raycaster.ray;
  if (Math.abs(ray.direction.z) < 1e-4) return false;
  const t = (z - ray.origin.z) / ray.direction.z;
  if (t < 0) return false;
  out.copy(ray.direction).multiplyScalar(t).add(ray.origin);
  return true;
}
