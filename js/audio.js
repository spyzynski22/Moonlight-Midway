/**
 * Moonlight Midway — audio
 *
 * Everything you hear is synthesized with the Web Audio API: an original
 * calliope waltz (16 bars in 3/4) plus every sound effect. The AudioContext is
 * created on the first user gesture, as browsers require; until then every
 * call is a silent no-op.
 */
'use strict';

/* ------------------------------------------------------------------ the waltz */
const TEMPO_BPM = 168;
/** Chords as MIDI notes: [bass, three chord tones]. */
const CHORDS = { C: [48, 60, 64, 67], G7: [43, 59, 62, 65], F: [41, 60, 65, 69], G: [43, 59, 62, 67] };
const PROGRESSION = ['C', 'G7', 'G7', 'C', 'C', 'F', 'G7', 'G', 'F', 'C', 'G7', 'C', 'C', 'G7', 'G7', 'C'];
/** Melody as [MIDI note, beats]; 48 beats = 16 bars of 3/4. */
const MELODY = [
  [76,2],[79,1], [77,2],[74,1], [71,2],[74,1], [72,3],
  [76,2],[79,1], [81,2],[79,1], [77,1],[76,1],[74,1], [79,3],
  [81,2],[77,1], [76,2],[72,1], [74,1],[76,1],[77,1], [76,2],[74,1],
  [72,2],[76,1], [74,2],[71,1], [72,1],[74,1],[71,1], [72,3],
];
const LOOP_BEATS = 48;
/** Beat index -> melody note starting on that beat. */
const MELODY_AT = {};
{ let beat = 0; for (const n of MELODY){ MELODY_AT[beat] = n; beat += n[1]; } }

/* ------------------------------------------------------------------ engine */
const Sound = {
  ctx: null,
  muted: !!store.get('muted', false),
  beat: 0,
  nextBeatTime: 0,

  init(){
    if (this.ctx){ if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let c;
    try { c = this.ctx = new AC(); } catch (e){ return; }

    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    comp.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : .85; this.master.connect(comp);
    this.music = c.createGain(); this.music.gain.value = .22; this.music.connect(this.master);
    this.sfx = c.createGain(); this.sfx.gain.value = .9; this.sfx.connect(this.master);

    // a short filtered echo gives the calliope some fairground air
    const delay = c.createDelay(); delay.delayTime.value = .21;
    const feedback = c.createGain(); feedback.gain.value = .25;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    this.music.connect(delay); delay.connect(lp); lp.connect(feedback); feedback.connect(delay); lp.connect(this.master);

    const buf = c.createBuffer(1, c.sampleRate, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this.nextBeatTime = c.currentTime + .15;
    setInterval(() => this.schedule(), 30);
  },
  setMuted(m){
    this.muted = m;
    store.set('muted', m);
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : .85, this.ctx.currentTime, .05);
  },
  setMusic(level){ if (this.music) this.music.gain.setTargetAtTime(level, this.ctx.currentTime, .4); },

  /* ---- building blocks */
  envelope(g, t, attack, peak, dur){
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  },
  /** One enveloped oscillator. opts: { to: glide target Hz, lp: lowpass Hz, a: attack s } */
  osc(type, freq, t, dur, peak, dest, opts = {}){
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    let out = o;
    if (opts.lp){ const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; o.connect(f); out = f; }
    out.connect(g);
    g.connect(dest || this.sfx);
    this.envelope(g, t, opts.a || .005, peak, dur);
    o.start(t);
    o.stop(t + dur + .05);
  },
  /** One enveloped burst of filtered noise. opts: { to: filter sweep Hz, q, a } */
  noise(t, dur, peak, filterType, freq, opts = {}){
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf;
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    if (opts.q) f.Q.value = opts.q;
    s.connect(f); f.connect(g); g.connect(this.sfx);
    this.envelope(g, t, opts.a || .003, peak, dur);
    s.start(t, Math.random() * .5, dur + .1);
  },
  /** Breathy organ-pipe voice with vibrato. */
  calliope(freq, t, dur){
    const c = this.ctx, g = c.createGain();
    g.connect(this.music);
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(.15, t + .03);
    g.gain.setValueAtTime(.15, t + dur * .7);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    const lfo = c.createOscillator(), depth = c.createGain();
    lfo.frequency.value = 5.8;
    depth.gain.value = freq * .008;
    lfo.connect(depth);
    for (const [type, mul, vol] of [['triangle', 1, 1], ['sine', 2, .35], ['square', 1, .05]]){
      const o = c.createOscillator(), og = c.createGain();
      o.type = type;
      o.frequency.value = freq * mul;
      depth.connect(o.frequency);
      og.gain.value = vol;
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + dur + .05);
    }
    lfo.start(t); lfo.stop(t + dur + .05);
  },

  /* ---- music scheduler (look-ahead) */
  schedule(){
    const c = this.ctx;
    if (!c || c.state !== 'running'){ if (c) this.nextBeatTime = c.currentTime + .1; return; }
    const spb = 60 / TEMPO_BPM;
    while (this.nextBeatTime < c.currentTime + .15){
      this.playBeat(this.beat, this.nextBeatTime, spb);
      this.nextBeatTime += spb;
      this.beat++;
    }
  },
  /** Oom-pah-pah: bass on beat one, chord stabs on two and three, melody on top. */
  playBeat(b, t, spb){
    const chord = CHORDS[PROGRESSION[Math.floor(b / 3) % PROGRESSION.length]];
    if (b % 3 === 0){
      this.osc('triangle', mtof(chord[0]), t, .32, .22, this.music);
      this.osc('sine', mtof(chord[0] - 12), t, .3, .16, this.music);
    } else {
      for (let k = 1; k < 4; k++) this.osc('square', mtof(chord[k]), t, .12, .028, this.music, { lp: 1600 });
    }
    const note = MELODY_AT[b % LOOP_BEATS];
    if (note) this.calliope(mtof(note[0]), t, note[1] * spb * .92);
  },

  /* ---- sound effects */
  /** Runs fn(now) only when audio is live. */
  play(fn){ if (this.ctx && this.ctx.state === 'running') fn(this.ctx.currentTime); },

  click(){ this.play(t => this.osc('sine', 700, t, .07, .15, null, { to: 1000 })); },
  whoosh(){ this.play(t => this.noise(t, .3, .28, 'bandpass', 500, { to: 2600, q: 1.4 })); },
  /** Metal bottle hit; v is impact strength 0..1. */
  clank(v){
    this.play(t => {
      v = clamp(v, .08, 1);
      const detune = rand(.94, 1.06);
      [1180, 1720, 2490, 3330].forEach((f, k) => this.osc('sine', f * detune, t, .35 + k * .08, .1 * v / (k * .6 + 1)));
      this.noise(t, .03, .25 * v, 'highpass', 4000);
    });
  },
  thud(v){
    this.play(t => {
      v = clamp(v, .1, 1);
      this.osc('sine', 120, t, .16, .5 * v, null, { to: 55 });
      this.noise(t, .08, .3 * v, 'lowpass', 600);
    });
  },
  pop(){
    this.play(t => {
      this.noise(t, .09, .9, 'highpass', 900, { a: .001 });
      this.osc('sine', 230, t, .12, .5, null, { to: 70 });
      this.noise(t, .22, .12, 'bandpass', 3000, { q: 3 });
    });
  },
  cork(){
    this.play(t => {
      this.noise(t, .06, .75, 'bandpass', 1400, { q: 2 });
      this.osc('square', 560, t, .07, .12, null, { to: 140, lp: 2200 });
    });
  },
  /** Gallery bell; pitch is a ratio (1 = base). */
  ding(pitch = 1){
    this.play(t => {
      this.osc('sine', 1320 * pitch, t, .55, .22);
      this.osc('sine', 2640 * pitch, t, .3, .07);
      this.osc('triangle', 1980 * pitch, t, .25, .05);
    });
  },
  reload(){
    this.play(t => {
      this.noise(t, .03, .5, 'highpass', 2500);
      this.osc('square', 320, t, .02, .06);
      this.noise(t + .28, .05, .5, 'highpass', 1700);
      this.osc('square', 240, t + .28, .03, .06);
    });
  },
  empty(){ this.play(t => this.noise(t, .025, .35, 'highpass', 3200)); },
  thunk(){
    this.play(t => {
      this.noise(t, .09, .6, 'lowpass', 750);
      this.osc('sine', 170, t, .1, .35, null, { to: 90 });
    });
  },
  puff(){ this.play(t => this.noise(t, .12, .3, 'lowpass', 1200, { to: 300 })); },
  tick(){ this.play(t => this.osc('sine', 1800, t, .05, .2)); },
  beep(high){ this.play(t => this.osc('square', high ? 990 : 660, t, high ? .35 : .14, .1, null, { lp: 3000 })); },
  ticket(n){
    this.play(t => { for (let k = 0; k < Math.min(n, 8); k++) this.osc('square', 988 + k * 60, t + k * .06, .06, .05, null, { lp: 3000 }); });
  },
  sweep(){ this.play(t => [79, 84, 88, 91].forEach((m, k) => this.osc('triangle', mtof(m), t + k * .08, .35, .16))); },
  fanfare(){
    this.play(t => {
      [72, 76, 79, 84].forEach((m, k) => this.osc('sawtooth', mtof(m), t + k * .12, .26, .11, null, { lp: 2600 }));
      [72, 76, 79, 84].forEach(m => this.osc('triangle', mtof(m), t + .55, 1.4, .09));
      [60, 67].forEach(m => this.osc('sawtooth', mtof(m), t + .55, 1.3, .05, null, { lp: 1800 }));
      this.noise(t + .55, 1.1, .14, 'highpass', 6000);
    });
  },
  /** Sad trombone: three falling notes, then a long wobbling one. */
  wahwah(){
    this.play(t => {
      [55, 54, 53].forEach((m, k) => this.osc('sawtooth', mtof(m), t + k * .42, .4, .16, null, { lp: 900, a: .04 }));
      const c = this.ctx, start = t + 1.26, end = t + 2.7;
      const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(), lfo = c.createOscillator(), depth = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = mtof(52);
      f.type = 'lowpass'; f.frequency.value = 900;
      lfo.frequency.value = 6; depth.gain.value = 6;
      lfo.connect(depth); depth.connect(o.frequency);
      o.connect(f); f.connect(g); g.connect(this.sfx);
      this.envelope(g, start, .05, .17, 1.3);
      o.start(start); o.stop(end); lfo.start(start); lfo.stop(end);
    });
  },
};
