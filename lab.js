// Look development for the blob. URL params: bg, eye, cam, t (freeze at a time), seed, hud=0.
import * as THREE from 'three';
import { ScribbleBlob, buildAtlas, EYES, BACKGROUNDS, surfacePoint, surfaceNormal } from './blob-render.js';

const params = new URLSearchParams(location.search);
const state = {
  bg: params.get('bg') in BACKGROUNDS ? params.get('bg') : 'graphite',
  eye: params.get('eye') in EYES ? params.get('eye') : 'pebble',
  cam: params.get('cam') || 'hero',
  frozen: params.has('t'),
};
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.autoClear = true;
renderer.setClearColor(0x17130e, 1);
const maxDpr = Number(params.get('dpr')) || 2;
renderer.setPixelRatio(Math.min(devicePixelRatio, maxDpr));

const camera = new THREE.PerspectiveCamera(22, 1.6, 0.02, 40);

const model = await fetch('model.json').then((r) => r.json());
const atlas = await buildAtlas(model);
const blob = new ScribbleBlob({ model, atlas, eye: state.eye, bg: state.bg, seed: Number(params.get('seed')) || undefined });
if (state.frozen) blob.time = Number(params.get('t')) || 0;

// Find a place on the body where a light strand runs level across the frame, away from the eyes.
function findMacro(dark) {
  let best = null, bestScore = -1;
  const span = 14;
  // how crowded the top layers are around a point: a clean patch photographs better
  const near = [];
  for (const s of blob.blob.strands) if (s.kind === 'top' || s.kind === 'mid') for (let i = 0; i < s.points.length; i += 4) { const p = s.points[i]; if (p.z > 0.3 && p.y > 0) near.push(p); }
  const crowd = (p) => { let c = 0; for (const q of near) { const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z; if (dx * dx + dy * dy + dz * dz < 0.0064) c++; } return c; };
  for (const s of blob.blob.strands) {
    if (s.kind !== 'top' || (dark ? s.tone > 0.12 : s.tone < 0.72)) continue;
    for (let i = span; i < s.points.length - span; i += 3) {
      const p = s.points[i], q = s.points[i + span], o = s.points[i - span];
      if (p.z < 0.45 || p.y < 0.12) continue;
      if (Math.abs(p.x) > 0.62) continue;
      const a = [q.x - p.x, q.y - p.y, q.z - p.z], b = [p.x - o.x, p.y - o.y, p.z - o.z];
      const la = Math.hypot(...a), lb = Math.hypot(...b);
      if (la < 0.03 || lb < 0.03) continue;
      const straight = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb);
      const t = [(a[0] + b[0]) / (la + lb), (a[1] + b[1]) / (la + lb), (a[2] + b[2]) / (la + lb)];
      if (t[0] < 0.45) continue;  // runs left to right, so the digits read upright once the camera rolls
      let score = straight * 1.5 + p.w * 220 + Math.min(la + lb, 0.2) * 3 - (p.p < 0.7 ? 1 : 0);
      if (score <= bestScore - 2) continue;
      score -= crowd(p) * 0.032;
      if (score > bestScore) { bestScore = score; best = { p: [p.x, p.y, p.z], t, w: p.w, strand: s.id, tone: s.tone }; }
    }
  }
  return best;
}
const macros = { graphite: findMacro(false), paper: findMacro(true) };

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const CAMS = {
  hero: { pos: [0.0, 0.14, 7.9], target: [0, -0.03, 0], shift: -0.15, aperture: 0.0007 },
  center: { pos: [0.0, 0.14, 7.4], target: [0, -0.03, 0], shift: 0, aperture: 0.0007 },
  face: { pos: [0.0, 0.0, 4.9], target: [0, -0.08, 0], shift: 0, aperture: 0.0012 },
  left: { pos: [-3.9, 0.5, 6.2], target: [0, -0.02, 0], shift: 0, aperture: 0.0008 },
  right: { pos: [4.9, 0.0, 5.4], target: [0, -0.02, 0], shift: 0, aperture: 0.0008 },
  high: { pos: [0.6, 3.8, 6.2], target: [0, -0.02, 0], shift: 0, aperture: 0.0008 },
  low: { pos: [-0.5, -2.8, 6.8], target: [0, -0.02, 0], shift: 0, aperture: 0.0008 },
  back: { pos: [1.2, 0.8, -7.2], target: [0, -0.02, 0], shift: 0, aperture: 0.0008 },
  macro: null,
};
function applyCam(name) {
  camera.up.set(0, 1, 0);
  camera.clearViewOffset();
  const w = renderer.domElement.width, h = renderer.domElement.height;
  camera.aspect = w / h;
  const macro = macros[state.bg];
  if (name === 'macro' && macro) {
    const P = V(macro.p), T = V(macro.t);
    const N = V(surfaceNormal(macro.p));
    const dist = Number(params.get('d')) || 0.36;
    // slightly oblique along the strand, so the focal plane falls across the surface
    const pos = P.clone().add(N.clone().multiplyScalar(dist)).add(T.clone().multiplyScalar(-dist * 0.42));
    camera.position.copy(pos);
    const up = new THREE.Vector3().crossVectors(N, T).normalize();
    camera.up.copy(up);
    camera.lookAt(P);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    blob.camSettings = { aperture: Number(params.get('ap')) || 0.085, focus: pos.distanceTo(P) };
  } else {
    const c = CAMS[name] || CAMS.hero;
    camera.position.set(...c.pos);
    camera.lookAt(...c.target);
    if (c.shift) camera.setViewOffset(w, h, c.shift * w, 0, w, h);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    blob.camSettings = { aperture: c.aperture, focus: camera.position.length() };
  }
  blob.setCameraUniforms(camera, renderer, blob.camSettings);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  applyCam(state.cam);
}
addEventListener('resize', resize);
resize();

addEventListener('pointermove', (e) => {
  blob.lookTarget.set((e.clientX / innerWidth - 0.6) * 1.5, -(e.clientY / innerHeight - 0.5) * 1.5);
  blob.lookTarget.clampLength(0, 1);
});

// HUD: plain links, so a reviewer can click through every combination
function hud() {
  const el = document.getElementById('hud');
  if (params.get('hud') === '0') { document.body.classList.add('hidehud'); return; }
  const link = (key, value, label = value) => {
    const q = new URLSearchParams(location.search); q.set(key, value);
    const on = state[key] === value;
    return `<a href="?${q}" class="${on ? 'on' : ''}">${label}</a>`;
  };
  el.innerHTML = [
    `<span>ground</span>${link('bg', 'graphite')}${link('bg', 'paper')}`,
    `<span>eyes</span>${Object.keys(EYES).map((k) => link('eye', k)).join('')}`,
    `<span>camera</span>${['hero', 'macro', 'face', 'left', 'right', 'high', 'low', 'back'].map((k) => link('cam', k)).join('')}`,
  ].join('<br>');
}
hud();

let last = performance.now();
let paused = false;
const fps = { frames: 0, start: last, value: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  if (paused) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  blob.update(dt, { frozen: state.frozen });
  blob.setCameraUniforms(camera, renderer, blob.camSettings);
  renderer.render(blob.scene, camera);
  fps.frames++;
  if (now - fps.start > 1000) { fps.value = (fps.frames * 1000) / (now - fps.start); fps.frames = 0; fps.start = now; }
}
requestAnimationFrame(frame);

// The test surface: everything a screenshot script needs, deterministic when frozen.
window.__lab = {
  state, blob, camera, renderer, macros, atlas,
  stats() {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { ...blob.stats, fps: +fps.value.toFixed(1), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown', drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, buffer: [canvas.width, canvas.height], dpr: renderer.getPixelRatio(), atlasFont: atlas.font, chars: atlas.chars, maxAniso: renderer.capabilities.getMaxAnisotropy() };
  },
  set({ bg, eye, cam, t, look, blink, aperture, focus, d } = {}) {
    if (bg) { state.bg = bg; blob.setBackground(bg); }
    if (eye) { state.eye = eye; blob.setEyes(eye); }
    if (d !== undefined) params.set('d', d);
    if (aperture !== undefined) params.set('ap', aperture);
    if (cam) state.cam = cam;
    if (bg || cam || d !== undefined || aperture !== undefined) applyCam(state.cam);
    if (t !== undefined) { blob.time = t; state.frozen = true; }
    if (look) { blob.lookTarget.set(look[0], look[1]); blob.look.set(look[0], look[1]); }
    if (blink !== undefined) { blob.blink = blink; state.frozen = true; }
    return this;
  },
  // Render at an exact size and POST the PNG to the lab server.
  async shot(name, { w = 1600, h = 1000, dpr = 1 } = {}) {
    paused = true;
    const pr = renderer.getPixelRatio();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    applyCam(state.cam);
    blob.update(0, { frozen: true });
    blob.setCameraUniforms(camera, renderer, blob.camSettings);
    renderer.render(blob.scene, camera);
    const png = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight, false);
    applyCam(state.cam);
    paused = false;
    const r = await fetch(`/__shot?name=${encodeURIComponent(name)}.png`, { method: 'POST', body: png });
    return r.json();
  },
  // Frame time with the GPU forced to finish: honest even when the pane is hidden and rAF throttles.
  bench({ w, h, dpr, frames = 40 } = {}) {
    paused = true;
    const gl = renderer.getContext();
    const pr = renderer.getPixelRatio();
    if (w) { renderer.setPixelRatio(dpr || 1); renderer.setSize(w, h, false); applyCam(state.cam); }
    const px = new Uint8Array(4);
    const times = [];
    for (let i = 0; i < frames; i++) {
      const t0 = performance.now();
      blob.update(1 / 60, { frozen: false });
      blob.setCameraUniforms(camera, renderer, blob.camSettings);
      renderer.render(blob.scene, camera);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const out = { size: [canvas.width, canvas.height], medianMs: +times[frames >> 1].toFixed(2), p90Ms: +times[Math.floor(frames * 0.9)].toFixed(2) };
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight, false);
    applyCam(state.cam);
    paused = false;
    return out;
  },
  async saveAtlas() {
    const png = await new Promise((res) => atlas.canvas.toBlob(res, 'image/png'));
    const r = await fetch('/__press?name=atlas.png', { method: 'POST', body: png });
    return r.json();
  },
};
window.__labReady = true;
