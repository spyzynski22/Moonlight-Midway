/**
 * Moonlight Midway — core
 *
 * Shared helpers, persistent storage, and the Three.js renderer, scene and camera.
 * All scripts are plain (non-module) scripts so the game runs straight from
 * file:// with no build step. They share top-level declarations and must load
 * in the order listed in index.html.
 */
'use strict';

const $ = id => document.getElementById(id);

if (!window.THREE || !window.CANNON){
  $('err').hidden = false;
  $('loading').classList.add('done');
  throw new Error('Moonlight Midway: three.js or cannon.js failed to load from the CDN.');
}

/* ------------------------------------------------------------------ math helpers */
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeInOut = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
/** MIDI note number to frequency in Hz. */
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

const reducedMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)').matches : false;

/* ------------------------------------------------------------------ storage */
/** localStorage wrapper that never throws (private windows, blocked storage). */
const store = {
  PREFIX: 'mm_',
  get(key, fallback){
    try { const v = localStorage.getItem(this.PREFIX + key); return v == null ? fallback : JSON.parse(v); }
    catch (e){ return fallback; }
  },
  set(key, value){
    try { localStorage.setItem(this.PREFIX + key, JSON.stringify(value)); } catch (e){ /* storage unavailable */ }
  }
};

/* ------------------------------------------------------------------ layout */
/** World-space x position of each booth, left to right. */
const BOOTH_X = [-5.6, 0, 5.6];

/* ------------------------------------------------------------------ renderer, scene, camera */
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const maxAniso = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x2a1440, 28, 95);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 400);
scene.add(camera); // the duck-gallery gun is parented to the camera

const raycaster = new THREE.Raycaster();
/** Pointer position in normalized device coordinates, updated by main.js. */
const ndc = new THREE.Vector2(0, 0);
/** Pointer position in CSS pixels. */
const pointerPx = { x: innerWidth / 2, y: innerHeight / 2 };

/* ------------------------------------------------------------------ shared frame state */
/** Seconds since start; advanced by the main loop. */
let time = 0;
/** Current camera-shake amount; decays in the main loop. */
let shake = 0;
function addShake(amount){ shake = Math.max(shake, amount * (reducedMotion ? .3 : 1)); }
