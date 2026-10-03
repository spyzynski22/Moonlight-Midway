/**
 * Moonlight Midway — HUD and on-screen feedback
 *
 * Floating score popups anchored to 3D points, the centre banner, and the
 * in-game HUD (score, goal bar, ammo icons, timer, combo, tip line).
 */
'use strict';

const popsEl = $('pops');
const bannerEl = $('banner');
const _projected = new THREE.Vector3();

/** Floating text that rises from a world-space point. cls: '', 'big', 'gold', 'bad', 'teal'. */
function pop3(worldPos, text, cls = ''){
  _projected.copy(worldPos).project(camera);
  if (_projected.z > 1) return; // behind the camera
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  el.style.left = ((_projected.x + 1) / 2 * innerWidth + rand(-14, 14)) + 'px';
  el.style.top = ((1 - _projected.y) / 2 * innerHeight - 20) + 'px';
  el.addEventListener('animationend', () => el.remove());
  popsEl.appendChild(el);
}

/** Big centred announcement. cls: '', 'good', 'bad'. */
function banner(main, sub = '', cls = ''){
  $('banM').textContent = main;
  $('banS').textContent = sub;
  bannerEl.className = '';
  void bannerEl.offsetWidth; // restart the CSS animation
  bannerEl.className = 'show ' + cls;
}

const AMMO_ICONS = {
  ball: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#f4efe4"/><path d="M6.5 4.5c3 4 3 11 0 15M17.5 4.5c-3 4-3 11 0 15" stroke="#c8202f" stroke-width="1.6" fill="none" stroke-dasharray="2 1.4"/></svg>',
  cork: '<svg viewBox="0 0 24 24"><path d="M7.5 4h9l-1.6 16H9.1z" fill="#d7a25e"/><ellipse cx="12" cy="4" rx="4.5" ry="1.6" fill="#f0c890"/><circle cx="10" cy="11" r=".9" fill="#8a5a2b"/><circle cx="13.5" cy="15" r=".9" fill="#8a5a2b"/></svg>',
  dart: '<svg viewBox="0 0 24 24"><path d="M12 1l1.1 5-.5 11h-1.2l-.5-11z" fill="#cfd6e0"/><rect x="10.6" y="6" width="2.8" height="5" rx="1" fill="#ffc54d"/><path d="M12 15l4.5 8-4.5-2.6L7.5 23z" fill="#e8364f"/></svg>',
};

const HUD = {
  game: null,
  lastScore: -1,

  set(game){
    this.game = game;
    $('hudName').textContent = game.name;
    $('hudGoal').textContent = 'Win at ' + game.goal;
    this.lastScore = -1;
    this.score(0);
    this.timer(null);
    this.combo('');
  },
  score(value){
    if (value === this.lastScore) return;
    const el = $('hudScore');
    el.textContent = value.toLocaleString();
    if (this.lastScore >= 0 && value > this.lastScore){
      el.classList.add('bump');
      setTimeout(() => el.classList.remove('bump'), 120);
    }
    this.lastScore = value;
    const goal = this.game ? this.game.goal : 1;
    $('goalFill').style.width = Math.min(100, value / goal * 100) + '%';
    $('goalBar').classList.toggle('met', value >= goal);
  },
  /** Row of ammo icons; the first `left` are lit, the rest greyed out. */
  ammo(kind, total, left){
    let html = '';
    for (let i = 0; i < total; i++) html += `<span class="ic${i < left ? '' : ' spent'}">${AMMO_ICONS[kind]}</span>`;
    $('hudRes').innerHTML = html;
  },
  /** Seconds remaining, or null to hide the timer. */
  timer(seconds){
    const el = $('hudTimer');
    if (seconds == null){ el.hidden = true; return; }
    el.hidden = false;
    el.textContent = Math.ceil(seconds);
    el.classList.toggle('urgent', seconds <= 5 && seconds > 0);
  },
  tip(text){ $('hudTip').textContent = text; },
  combo(text){ $('hudCombo').textContent = text; },
};
