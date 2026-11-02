// Look development for the blob: the body alone on the sheet. URL params: cam, t (freeze), d, ap.
import * as THREE from 'three';
import { Creature, buildAtlas, packAsync, makeShared, applyPose, frameShared } from './blob-render.js';
import { MACRO_DIR, surfaceFrame } from './blob-geometry.js';

const params = new URLSearchParams(location.search);
const state = { cam: params.get('cam') || 'hero', frozen: params.has('t') };
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance', stencil: false });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x000000, 0);
const maxDpr = Number(params.get('dpr')) || 2;
renderer.setPixelRatio(Math.min(devicePixelRatio, maxDpr));
const camera = new THREE.PerspectiveCamera(22, 1.6, 0.02, 60);
const scene = new THREE.Scene();

const model = await fetch('model.json').then((r) => r.json());
const atlas = await buildAtlas(model);
const shared = makeShared(atlas);
const t0 = performance.now();
const packed = await packAsync({}, { atlasAspect: atlas.rows, rows: atlas.rows });
const genWall = Math.round(performance.now() - t0);
const blob = new Creature(packed, shared, { seed: 1 });
scene.add(blob.root);
if (state.frozen) blob.time = Number(params.get('t')) || 0;

const mac = surfaceFrame(MACRO_DIR);
const yawPitch = (yaw, pitch) => [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
const rad = Math.PI / 180;
const CAMS = {
  hero: { target: [0, -0.03, 0], dir: yawPitch(0, 1 * rad), up: [0, 1, 0], dist: 7.9, sx: 0.15, aperture: 0.0005 },
  center: { target: [0, -0.03, 0], dir: yawPitch(0, 1 * rad), up: [0, 1, 0], dist: 7.9, aperture: 0.0005 },
  face: { target: [0, -0.1, 0], dir: yawPitch(0, 0), up: [0, 1, 0], dist: 4.9, aperture: 0.0008 },
  left: { target: [0, -0.02, 0], dir: yawPitch(-28 * rad, 6 * rad), up: [0, 1, 0], dist: 7.9, aperture: 0.0005 },
  right: { target: [0, -0.02, 0], dir: yawPitch(28 * rad, 0), up: [0, 1, 0], dist: 7.9, aperture: 0.0005 },
  low: { target: [0, -0.02, 0], dir: yawPitch(14 * rad, -18 * rad), up: [0, 1, 0], dist: 7.9, aperture: 0.0005 },
  macro: { target: [mac.p[0] + mac.n[0] * 0.055, mac.p[1] + mac.n[1] * 0.055, mac.p[2] + mac.n[2] * 0.055], dir: [mac.n[0] - mac.right[0] * 0.22, mac.n[1] - mac.right[1] * 0.22, mac.n[2] - mac.right[2] * 0.22], up: mac.up, dist: Number(params.get('d')) || 0.56, sx: 0.0, aperture: Number(params.get('ap')) || 0.07 },
};
function applyCam(name) {
  const pose = CAMS[name] || CAMS.hero;
  state.pose = pose;
  applyPose(camera, pose, canvas.width, canvas.height);
  blob.strands.material.uniforms.uClear.value = name === 'macro' ? 1 : 0;
  blob.strands.material.uniforms.uClearP.value.set(mac.p[0], mac.p[1], mac.p[2]);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); applyCam(state.cam); }
addEventListener('resize', resize);
resize();
addEventListener('pointermove', (e) => {
  blob.lookTarget.set((e.clientX / innerWidth - 0.6) * 1.5, -(e.clientY / innerHeight - 0.5) * 1.5);
  blob.lookTarget.clampLength(0, 1);
});

function hud() {
  const el = document.getElementById('hud');
  if (params.get('hud') === '0') { document.body.classList.add('hidehud'); return; }
  const link = (value) => { const q = new URLSearchParams(location.search); q.set('cam', value); return `<a href="?${q}" class="${state.cam === value ? 'on' : ''}">${value}</a>`; };
  el.innerHTML = `<span>camera</span>${Object.keys(CAMS).map(link).join('')}`;
}
hud();

let last = performance.now(), paused = false;
const fps = { frames: 0, start: last, value: 0 };
function draw() {
  frameShared(shared, camera, renderer, renderer.getPixelRatio(), blob.time, state.pose);
  renderer.render(scene, camera);
}
function frame(now) {
  requestAnimationFrame(frame);
  if (paused) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  blob.update(dt, { frozen: state.frozen });
  draw();
  fps.frames++;
  if (now - fps.start > 1000) { fps.value = (fps.frames * 1000) / (now - fps.start); fps.frames = 0; fps.start = now; }
}
requestAnimationFrame(frame);

window.__lab = {
  state, blob, camera, renderer, atlas,
  stats() { const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return { ...packed.stats, genWall, fps: +fps.value.toFixed(1), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown', calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, buffer: [canvas.width, canvas.height] }; },
  set({ cam, t, look, blink } = {}) {
    if (cam) { state.cam = cam; applyCam(cam); }
    if (t !== undefined) { blob.time = t; state.frozen = true; }
    if (look) { blob.lookTarget.set(look[0], look[1]); blob.look.set(look[0], look[1]); }
    if (blink !== undefined) { blob.blink = blink; state.frozen = true; }
    return this;
  },
  // Render at an exact size, composite on the paper colour, POST the PNG to the lab server.
  async shot(name, { w = 1600, h = 1000, dpr = 1, paper = true, dir = 'review-shots-blob' } = {}) {
    paused = true;
    const pr = renderer.getPixelRatio();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    applyCam(state.cam);
    blob.update(0, { frozen: true });
    draw();
    const out = document.createElement('canvas');
    out.width = canvas.width; out.height = canvas.height;
    const x = out.getContext('2d');
    if (paper) {
      const g = x.createRadialGradient(out.width * 0.6, out.height * 0.45, 0, out.width * 0.6, out.height * 0.45, out.width * 0.75);
      g.addColorStop(0, '#efe8d8'); g.addColorStop(1, '#e8ddc4');
      x.fillStyle = g; x.fillRect(0, 0, out.width, out.height);
    }
    x.drawImage(canvas, 0, 0);
    const png = await new Promise((res) => out.toBlob(res, 'image/png'));
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight, false);
    applyCam(state.cam);
    paused = false;
    const r = await fetch(`/__shot?name=${encodeURIComponent(name)}.png&dir=${dir}`, { method: 'POST', body: png });
    return r.json();
  },
  bench({ w, h, dpr, frames = 30 } = {}) {
    paused = true;
    const gl = renderer.getContext();
    const pr = renderer.getPixelRatio();
    if (w) { renderer.setPixelRatio(dpr || 1); renderer.setSize(w, h, false); applyCam(state.cam); }
    const px = new Uint8Array(4), times = [];
    for (let i = 0; i < frames; i++) {
      const s = performance.now();
      blob.update(1 / 60, { frozen: false });
      draw();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      times.push(performance.now() - s);
    }
    times.sort((a, b) => a - b);
    const out = { size: [canvas.width, canvas.height], medianMs: +times[frames >> 1].toFixed(2) };
    renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false); applyCam(state.cam);
    paused = false;
    return out;
  },
};
window.__labReady = true;
