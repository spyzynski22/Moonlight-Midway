/**
 * Moonlight Midway — main
 *
 * Owns the game flow (hub -> camera flight -> play -> result), tickets and
 * prizes, the camera, input routing and the render loop.
 */
'use strict';

const games = [new BottleGame(), new DuckGame(), new DartGame()];

/* ------------------------------------------------------------------ tickets & prizes */
const POINTS_PER_TICKET = 10;
const WIN_BONUS_TICKETS = 15;
const PRIZES = [
  { name: 'Glow bracelet', cost: 25,
    svg: '<svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="9" fill="none" stroke="#36d6c3" stroke-width="3.5"/><circle cx="14" cy="14" r="9" fill="none" stroke="#c8fff7" stroke-width="1"/></svg>' },
  { name: 'Rubber duck', cost: 60,
    svg: '<svg viewBox="0 0 28 28"><ellipse cx="13" cy="18" rx="10" ry="6" fill="#ffd23f"/><circle cx="18" cy="10" r="5" fill="#ffd23f"/><path d="M22.5 10.5l4 1-4 1.5z" fill="#ff7a1a"/><circle cx="19.5" cy="9" r="1" fill="#111"/></svg>' },
  { name: 'Plush bear', cost: 120,
    svg: '<svg viewBox="0 0 28 28"><circle cx="7.5" cy="7.5" r="3.5" fill="#b8742f"/><circle cx="20.5" cy="7.5" r="3.5" fill="#b8742f"/><circle cx="14" cy="15" r="9" fill="#c98a43"/><ellipse cx="14" cy="18" rx="4" ry="3" fill="#f3d6a8"/><circle cx="10.5" cy="13" r="1.2" fill="#111"/><circle cx="17.5" cy="13" r="1.2" fill="#111"/><circle cx="14" cy="17" r="1.3" fill="#111"/></svg>' },
  { name: 'Giant unicorn', cost: 250,
    svg: '<svg viewBox="0 0 28 28"><path d="M15 2l2.6 9-4.4.6z" fill="#ffc54d"/><ellipse cx="14" cy="17" rx="8" ry="8.5" fill="#fff3dd"/><path d="M6 13c-1 5 1 10 4 12 0-4 0-8 1-12z" fill="#ff6fd0"/><path d="M8 9c2-2 5-2 7 0-3 0-5 1-7 3z" fill="#8d6bff"/><circle cx="17" cy="16" r="1.3" fill="#111"/><ellipse cx="18.5" cy="21" rx="2.5" ry="1.6" fill="#ffb3cf"/></svg>' },
];

let tickets = store.get('tickets', 0);
const best = store.get('best', [0, 0, 0]);

function renderHub(){
  $('tixCount').textContent = tickets.toLocaleString();
  $('prizes').innerHTML = PRIZES.map(p =>
    `<div class="prize${tickets >= p.cost ? ' won' : ''}">${p.svg}<span><b>${p.name}</b> <span class="cost">${p.cost} tickets</span></span></div>`
  ).join('');
  document.querySelectorAll('.gcard').forEach(card => {
    const i = +card.dataset.g;
    card.querySelector('.goal').textContent = 'Win at ' + games[i].goal;
    card.querySelector('.best').textContent = 'Best ' + (best[i] || 0);
  });
}

/* ------------------------------------------------------------------ game flow */
/** 'hub' | 'fly' (camera moving) | 'play' | 'result' */
let mode = 'hub';
let active = null;
/** Active camera flight, or null. */
let fly = null;
const resultEl = $('result');

/** Called by a game when its run ends. */
function gameOver(game, score){
  if (active !== game) return;
  mode = 'result';
  const idx = games.indexOf(game);
  const win = score >= game.goal;
  const earned = Math.floor(score / POINTS_PER_TICKET) + (win ? WIN_BONUS_TICKETS : 0);
  const prev = tickets;
  tickets += earned;
  store.set('tickets', tickets);
  const isBest = score > (best[idx] || 0);
  if (isBest){ best[idx] = score; store.set('best', best); }
  const unlocked = PRIZES.filter(p => prev < p.cost && tickets >= p.cost);

  $('resTitle').textContent = win ? 'Winner!' : 'So close!';
  $('resTitle').className = win ? 'win' : '';
  $('resSub').textContent = win
    ? `You beat the goal of ${game.goal}${isBest ? ' and set a new best' : ''}. Bonus ${WIN_BONUS_TICKETS} tickets.`
    : `${game.goal - score} points short of the ${game.goal} goal. One more go?`;
  $('resScore').textContent = score.toLocaleString();
  $('resTix').textContent = '+' + earned;
  $('resBest').textContent = best[idx].toLocaleString();
  $('resPrize').textContent = unlocked.length ? 'New prize unlocked: ' + unlocked.map(p => p.name).join(' & ') + '!' : '';

  if (win){ Sound.fanfare(); confettiBurst(new THREE.Vector3(BOOTH_X[idx], 2.2, 0), 220); }
  else Sound.wahwah();
  HUD.tip('');

  setTimeout(() => {
    if (mode !== 'result') return;
    resultEl.hidden = false;
    $('tix').hidden = false;
    $('tixCount').textContent = tickets.toLocaleString();
    $('tix').classList.add('bump');
    setTimeout(() => $('tix').classList.remove('bump'), 220);
    Sound.ticket(earned);
    $('againBtn').focus({ preventScroll: true });
  }, 900);
}

function enterGame(i){
  if (mode !== 'hub') return;
  Sound.init(); Sound.click(); Sound.setMusic(.09);
  active = games[i];
  mode = 'fly';
  $('hub').classList.add('gone');
  $('tix').hidden = true;
  setHover(-1);
  fly = {
    fromP: cam.pos.clone(), fromT: cam.tgt.clone(), toHub: false, t: 0, dur: 1.35,
    done: () => {
      mode = 'play';
      HUD.set(active);
      $('hud').classList.add('on');
      active.start();
      canvas.focus({ preventScroll: true });
    },
  };
}

function toMidway(){
  if (!active || mode === 'fly') return;
  active.stop();
  active = null;
  resultEl.hidden = true;
  $('hud').classList.remove('on');
  HUD.tip('');
  mode = 'fly';
  Sound.setMusic(.22); Sound.click();
  fly = {
    fromP: cam.pos.clone(), fromT: cam.tgt.clone(), toHub: true, t: 0, dur: 1.3,
    done: () => {
      mode = 'hub';
      $('hub').classList.remove('gone');
      $('tix').hidden = false;
      renderHub();
    },
  };
}

function playAgain(){
  if (!active) return;
  resultEl.hidden = true;
  $('tix').hidden = true;
  mode = 'play';
  Sound.click();
  HUD.set(active);
  active.start();
  canvas.focus({ preventScroll: true });
}

/* ------------------------------------------------------------------ buttons */
$('againBtn').addEventListener('click', playAgain);
$('midwayBtn').addEventListener('click', toMidway);
$('backBtn').addEventListener('click', toMidway);
document.querySelectorAll('.gcard').forEach(card => {
  card.addEventListener('click', () => enterGame(+card.dataset.g));
  card.addEventListener('mouseenter', () => setHover(+card.dataset.g));
  card.addEventListener('mouseleave', () => setHover(-1));
});

const SPEAKER_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
function renderMute(){
  $('mute').innerHTML = Sound.muted ? SPEAKER_OFF : SPEAKER_ON;
  $('mute').setAttribute('aria-label', Sound.muted ? 'Unmute sound' : 'Mute sound');
}
function toggleMute(){ Sound.init(); Sound.setMuted(!Sound.muted); renderMute(); }
$('mute').addEventListener('click', toggleMute);

/* ------------------------------------------------------------------ camera */
const cam = { pos: new THREE.Vector3(0, 6, 22), tgt: new THREE.Vector3(0, 2.6, -2) };
const hubP = new THREE.Vector3(), hubT = new THREE.Vector3();

/** Slowly drifting overview of all three booths; pulls back on tall screens. */
function updateHubView(){
  const aspect = innerWidth / innerHeight;
  const back = aspect < 1.2 ? 15 + (1.2 / aspect - 1) * 13 : 15;
  const sway = reducedMotion ? 0 : 1;
  hubP.set(Math.sin(time * .12) * 2.2 * sway, 4.4 + Math.sin(time * .2) * .2 * sway, back);
  hubT.set(Math.sin(time * .12) * .8 * sway, 2.6, -2);
}

/** Vertical FOV that keeps the booth (or the whole midway) in frame at any aspect ratio. */
function fitFov(inGame){
  const aspect = innerWidth / innerHeight;
  const halfH = THREE.MathUtils.degToRad(inGame ? 26 : 30);
  const need = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(halfH) / aspect));
  return Math.max(inGame ? 50 : 52, Math.min(inGame ? 88 : 75, need * 1.05));
}

/* ------------------------------------------------------------------ input */
let hover = -1;
function setHover(i){
  if (hover === i) return;
  hover = i;
  booths.forEach((b, k) => { b.signBulbs.boost = k === i ? 1 : 0; });
  document.querySelectorAll('.gcard').forEach(c => c.classList.toggle('hot', +c.dataset.g === i));
  canvas.style.cursor = i >= 0 ? 'pointer' : '';
}
function setPointer(e){
  pointerPx.x = e.clientX;
  pointerPx.y = e.clientY;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
}
function boothUnderPointer(){
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(boothHits, false);
  return hits.length ? hits[0].object.userData.booth : -1;
}

canvas.addEventListener('pointermove', e => {
  setPointer(e);
  if (mode === 'hub' && e.pointerType === 'mouse') setHover(boothUnderPointer());
});
canvas.addEventListener('pointerdown', e => {
  setPointer(e);
  Sound.init();
  if (mode === 'hub'){
    const i = boothUnderPointer();
    if (i >= 0) enterGame(i);
    return;
  }
  if (mode === 'play' && active){
    try { canvas.setPointerCapture(e.pointerId); } catch (_){ /* not supported */ }
    active.down(e);
  }
});
canvas.addEventListener('pointerup', e => { setPointer(e); if (mode === 'play' && active) active.up(e); });
canvas.addEventListener('pointercancel', () => { if (mode === 'play' && active) active.up({}); });
canvas.addEventListener('contextmenu', e => e.preventDefault());

addEventListener('keydown', e => {
  if (e.code === 'Space' && mode === 'play') e.preventDefault();
  if (e.code === 'Escape'){ if (mode === 'play' || mode === 'result') toMidway(); return; }
  if (e.code === 'KeyM'){ toggleMute(); return; }
  if (e.repeat) return;
  if (mode === 'play' && active){ Sound.init(); active.key(e.code, true); }
  else if (mode === 'result' && e.code === 'KeyR') playAgain();
});
addEventListener('keyup', e => { if (mode === 'play' && active) active.key(e.code, false); });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ------------------------------------------------------------------ loop */
function updateCamera(dt){
  updateHubView();
  if (fly){
    fly.t += dt;
    const k = easeInOut(Math.min(1, fly.t / fly.dur));
    const toP = fly.toHub ? hubP : active.camPos;
    const toT = fly.toHub ? hubT : active.camTarget;
    cam.pos.lerpVectors(fly.fromP, toP, k);
    cam.pos.y += Math.sin(k * Math.PI) * 1.2; // arc up and over
    cam.tgt.lerpVectors(fly.fromT, toT, k);
    if (k >= 1){ const done = fly.done; fly = null; done(); }
  } else if (mode === 'hub'){
    const k = 1 - Math.pow(.02, dt);
    cam.pos.lerp(hubP, k);
    cam.tgt.lerp(hubT, k);
  } else if (active){
    cam.pos.copy(active.camPos);
    cam.tgt.copy(active.camTarget);
    if (!reducedMotion){ cam.pos.x += ndc.x * .07; cam.pos.y += ndc.y * .04; } // slight parallax
  }

  shake = Math.max(0, shake - dt * 2.5);
  camera.position.copy(cam.pos);
  if (shake > 0){
    const s = shake * shake * .06;
    camera.position.x += rand(-s, s);
    camera.position.y += rand(-s, s);
  }
  camera.lookAt(cam.tgt);

  const inGame = mode === 'play' || mode === 'result' || (fly && !fly.toHub && fly.t / fly.dur > .5);
  const fov = fitFov(inGame);
  if (Math.abs(camera.fov - fov) > .01){
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
}

function update(dt){
  time += dt;
  updateMidway(dt);
  for (const g of games) g.update(dt);
  sparks.update(dt);
  confetti.update(dt);
  updateCamera(dt);
}

let last = performance.now();
function frame(now){
  const dt = Math.min(.05, (now - last) / 1000); // clamp long frames (tab switches)
  last = now;
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ boot */
renderHub();
renderMute();
camera.fov = fitFov(false);
camera.updateProjectionMatrix();
requestAnimationFrame(frame);
setTimeout(() => $('loading').classList.add('done'), 250);

if (document.fonts && document.fonts.load){
  Promise.all([
    document.fonts.load('400 80px Rye'),
    document.fonts.load('600 30px Fredoka'),
    document.fonts.load('700 40px Fredoka'),
  ]).then(runFontJobs).catch(() => { /* keep fallback fonts */ });
}
