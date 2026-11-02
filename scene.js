// The stage: one dark bench, one machined horse in harness, lit by a key light and its own core.
// The horse is a set of still frames rendered to the same camera; this module shows them through a
// shader that reveals the form from darkness, crossfades between frames, and lights the core and the
// eye. Nothing here loads before the page's own type has painted.
import * as THREE from 'three';

export const FRAMES = [
  { id: 0, name: 'bare' },
  { id: 1, name: 'collar' },
  { id: 2, name: 'pad and girth' },
  { id: 3, name: 'traces' },
  { id: 4, name: 'breeching' },
  { id: 5, name: 'bridle' },
  { id: 6, name: 'reins' },       // full harness at rest
  { id: 7, name: 'head up' },     // answering the rein
  { id: 8, name: 'straining' },   // the harness holds
];
export const REST = 6, HEAD_UP = 7, STRAIN = 8;
export const IMG_W = 1920, IMG_H = 1200;
// where the heart and the eye sit in each frame (image uv, y down); the head moves in 7 and 8
const REST_CORE = [0.623, 0.48], REST_EYE = [0.427, 0.183];
export const ANCHORS = {
  0: { core: REST_CORE, eye: REST_EYE }, 1: { core: REST_CORE, eye: REST_EYE }, 2: { core: REST_CORE, eye: REST_EYE },
  3: { core: REST_CORE, eye: REST_EYE }, 4: { core: REST_CORE, eye: REST_EYE }, 5: { core: REST_CORE, eye: REST_EYE },
  6: { core: REST_CORE, eye: REST_EYE },
  7: { core: [0.625, 0.48], eye: [0.443, 0.123] },
  8: { core: [0.604, 0.49], eye: [0.339, 0.279] },
};
export const FOCUS_UV = [0.6, 0.47];   // what the cover-crop keeps when the frame is narrow

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tA; uniform sampler2D tB; uniform float uMix;
  uniform vec2 uScale; uniform vec2 uOffset;      // cover mapping of the image into the quad
  uniform float uReveal; uniform vec2 uCore; uniform vec2 uEye; uniform float uCoreLevel; uniform float uEyeLevel;
  uniform float uDrop;                             // the incoming frame drops in from above a little
  uniform float uTime; uniform float uGrain; uniform float uFeather; uniform vec3 uBg; uniform float uLift;
  uniform float uAspectFix;                        // image aspect / quad aspect, for round glows
  float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
  void main(){
    vec2 iuv = vUv * uScale + uOffset;             // image uv, y up
    vec2 iuvB = iuv + vec2(0.0, -uDrop);
    vec3 a = texture2D(tA, iuv).rgb;
    vec3 b = texture2D(tB, iuvB).rgb;
    vec3 img = mix(a, b, uMix);
    // outside the image there is only the bench; the left edge fades over 9% so the floor has no seam
    float inl = smoothstep(0.0, 0.09, iuv.x);
    vec2 inb = smoothstep(0.0, 0.025, iuv) * smoothstep(0.0, 0.025, 1.0 - iuv);
    img = mix(uBg, img, inl * inb.y * smoothstep(0.0, 0.025, 1.0 - iuv.x));
    // the photograph's own backdrop and floor are a neutral dark grey; they become the page's
    // graphite so the still has no edge. Leather is warm and metal is bright, so both survive.
    float lum0 = dot(img, vec3(0.3, 0.59, 0.11));
    float sat0 = max(img.r, max(img.g, img.b)) - min(img.r, min(img.g, img.b));
    float bgness = (1.0 - smoothstep(0.11, 0.34, lum0)) * (1.0 - smoothstep(0.012, 0.045, sat0));
    // the key's spill (top left) and the bench (bottom) are neutral but brighter: pull them too
    // the spill is tungsten-tinted, so left of the muzzle it is keyed on brightness alone
    float spill = smoothstep(0.34, 0.08, iuv.x) * smoothstep(0.33, 0.68, iuv.y);
    float bench = smoothstep(0.2, 0.0, iuv.y);
    float wide = (1.0 - smoothstep(0.03, 0.09, sat0)) * (1.0 - smoothstep(0.22, 0.55, lum0)) * bench;
    wide = max(wide, spill * (1.0 - smoothstep(0.45, 0.9, lum0)));
    bgness = max(bgness, wide);
    img = mix(img, uBg, bgness);
    // the amber core and eye are keyed by warmth, so they stay lit while the body is still dark
    float lum = dot(img, vec3(0.3, 0.59, 0.11));
    float warmth = clamp((img.r - img.b) * 2.2, 0.0, 1.0);
    float key = smoothstep(0.18, 0.55, lum * warmth);
    vec2 d = (iuv - uCore) * vec2(uAspectFix, 1.0);
    float dist = length(d);
    float n = noise(iuv * 9.0 + uTime * 0.05) * 0.14;
    float form = smoothstep(0.0, 0.22, uReveal * 1.35 - dist * 0.9 + n - 0.1);
    float vis = max(form, key * smoothstep(0.0, 0.35, uReveal + 0.35));
    vec3 col = img * vis;
    // the core breathes; the eye follows it
    float breath = 0.5 + 0.5 * sin(uTime * 1.1);
    float core = uCoreLevel * (0.82 + 0.18 * breath);
    vec3 amber = vec3(1.0, 0.62, 0.26);
    col += amber * core * (0.55 * exp(-dist * dist * 160.0) + 0.16 * exp(-dist * dist * 22.0));
    col += img * key * core * 0.9;
    vec2 de = (iuv - uEye) * vec2(uAspectFix, 1.0);
    float deye = length(de);
    col += amber * uEyeLevel * core * 0.7 * exp(-deye * deye * 9000.0);
    col += img * smoothstep(0.004, 0.0, deye) * uEyeLevel * core;
    // lift the blacks toward the page and feather the quad edge into it
    col = mix(col, uBg, uLift);
    float fe = max(uFeather, 0.0005);
    vec2 e = smoothstep(0.0, fe, vUv) * smoothstep(0.0, fe, 1.0 - vUv);
    float feather = uFeather > 0.0 ? e.x * e.y : 1.0;
    col = mix(uBg, col, feather);
    // grain, quiet and slow
    float g = hash(vUv * 900.0 + floor(uTime * 5.0) * 0.37) - 0.5;
    col += g * uGrain;
    gl_FragColor = vec4(col, 1.0);
  }`;

export function createStage(canvas, options = {}) {
  const reduced = !!options.reduced;
  const isMobile = matchMedia('(max-width: 900px)').matches || matchMedia('(pointer: coarse)').matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, depth: false });
  } catch (e) { return null; }
  if (!renderer.capabilities.isWebGL2) { renderer.dispose(); return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 2 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x141516, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  const loader = new THREE.TextureLoader();
  const size = isMobile ? 1280 : 1920;
  const textures = new Map();
  const blank = new THREE.DataTexture(new Uint8Array([20, 21, 22, 255]), 1, 1);
  blank.needsUpdate = true;
  const loadFrame = (i) => {
    if (textures.has(i)) return textures.get(i);
    const p = new Promise((resolve) => {
      loader.load(`assets/horse/f${i}-${size}.jpg`, (t) => {
        t.colorSpace = THREE.NoColorSpace;   // sampled raw; the shader writes display values directly
        t.minFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        resolve(t);
      }, undefined, () => resolve(blank));
    });
    textures.set(i, p);
    return p;
  };
  const ready = new Map(); // id -> THREE.Texture once loaded
  const want = (i) => loadFrame(i).then((t) => { ready.set(i, t); return t; });

  const uniforms = {
    tA: { value: blank }, tB: { value: blank }, uMix: { value: 0 },
    uScale: { value: new THREE.Vector2(1, 1) }, uOffset: { value: new THREE.Vector2(0, 0) },
    uReveal: { value: reduced ? 1 : 0 }, uCore: { value: new THREE.Vector2(REST_CORE[0], 1 - REST_CORE[1]) },
    uEye: { value: new THREE.Vector2(REST_EYE[0], 1 - REST_EYE[1]) }, uCoreLevel: { value: 0.55 }, uEyeLevel: { value: 1.0 },
    uDrop: { value: 0 }, uTime: { value: 0 }, uGrain: { value: options.grain ?? 0.012 }, uFeather: { value: 0.0 },
    // raw display-space graphite, the same value the page's CSS uses, so the quad has no edge
    uBg: { value: new THREE.Vector3(20 / 255, 21 / 255, 22 / 255) }, uLift: { value: 0.06 }, uAspectFix: { value: IMG_W / IMG_H },
  };
  // DoubleSide: the camera's y is flipped to CSS space and the quad's y scale is negative, which
  // together invert the winding once more than three's determinant check expects.
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  quad.frustumCulled = false;
  scene.add(quad);

  // ---- state ----
  const state = { frame: 0, frameB: 0, mix: 0, reveal: reduced ? 1 : 0, core: 0.55, eye: 1, drop: 0, seq: 0 };
  const anchors = { a: null, b: null };
  let W = 1, H = 1;
  let running = true;
  let shown = { x: 0, y: 0, w: 1, h: 1 };
  let shownScale = new THREE.Vector2(1, 1), shownOffset = new THREE.Vector2(0, 0);

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width)); H = Math.max(1, Math.round(rect.height));
    renderer.setSize(W, H, false);
    camera.left = 0; camera.right = W; camera.top = 0; camera.bottom = H;   // y down, in CSS px
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(canvas.parentElement);

  const rectOf = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, top: r.top, bottom: r.bottom };
  };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function placeQuad() {
    // Follow the hero's rect until it rises past the pin line, hold, then attach to the gate's slot.
    const ra = rectOf(anchors.a), rb = rectOf(anchors.b);
    const pinY = H * 0.5;
    let r = ra || rb, t = 0;
    if (ra && rb) {
      if (ra.cy >= pinY - 2) { r = ra; t = 0; }
      else if (rb.cy <= pinY) { r = rb; t = 1; }
      else {
        t = THREE.MathUtils.clamp((pinY - ra.cy) / (rb.cy - ra.cy), 0, 1);
        const k = ease(t);
        r = { cx: ra.cx + (rb.cx - ra.cx) * k, cy: pinY, w: ra.w + (rb.w - ra.w) * k, h: ra.h + (rb.h - ra.h) * k };
        r.top = r.cy - r.h / 2; r.bottom = r.cy + r.h / 2;
      }
    }
    state.handover = t;
    if (!r) return false;
    // the quad is the rect, grown a little so the feathered edge sits outside it
    const grow = t > 0 ? 0.26 : 0.0;
    const w = r.w * (1 + grow), h = r.h * (1 + grow);
    quad.position.set(r.cx, r.cy, 0);
    quad.scale.set(w, -h, 1);
    uniforms.uFeather.value = t > 0 ? 0.3 : 0.06;
    uniforms.uLift.value = 0.0;
    // Landscape quads: cover the quad with the image, keeping FOCUS_UV in view.
    // Portrait quads (phones): show the horse as a band in the lower part, above which the copy sits.
    const qa = w / h, ia = IMG_W / IMG_H;
    let sx, sy, ox, oy;
    const fx = FOCUS_UV[0], fy = 1 - FOCUS_UV[1];
    if (qa >= 1.1) {
      // In the hero the image takes the right 85% of the frame so the headline has the left; in the
      // slot it covers the whole rect. Between, the occupancy eases from one to the other.
      const occ = 0.8 + 0.2 * ease(t);
      sx = 1 / occ;
      ox = -(1 - occ) / occ;                   // right-aligned
      const hb = (qa * occ) / ia;              // image height as a fraction of the quad height
      if (hb >= 1) { sy = 1 / hb; oy = THREE.MathUtils.clamp(fy - sy * 0.5, 0, 1 - sy); }
      else { sy = 1 / hb; oy = 0; }            // shorter than the quad: sit on the bench, dark above
    } else {
      const zoom = 1.04;                       // the whole horse, reins included
      sx = 1 / zoom;
      ox = THREE.MathUtils.clamp(0.6 - sx * 0.5, 0, 1 - sx);
      const hb = Math.min(1, (qa / ia) * zoom); // band height as a fraction of the quad
      const v0 = t > 0 ? (1 - hb) * 0.5 : 0.15; // above the label strip in the hero, centred in the slot
      sy = 1 / hb;
      oy = -v0 / hb;
    }
    uniforms.uScale.value.set(sx, sy);
    uniforms.uOffset.value.set(ox, oy);
    uniforms.uAspectFix.value = ia;
    shown = { x: r.cx - w / 2, y: r.cy - h / 2, w, h };
    shownScale.set(sx, sy); shownOffset.set(ox, oy);
    return r.bottom > -H * 0.2 && r.top < H * 1.2;
  }

  // image uv (y down, as measured on the still) -> viewport px
  function project(u, v) {
    const iu = u, iv = 1 - v;
    const qx = (iu - shownOffset.x) / shownScale.x;
    const qy = 1 - (iv - shownOffset.y) / shownScale.y;
    return { x: shown.x + qx * shown.w, y: shown.y + qy * shown.h, inside: qx >= 0 && qx <= 1 && qy >= 0 && qy <= 1 };
  }

  const timer = new THREE.Timer();
  let frameCount = 0;
  function render() {
    if (!running) return;
    requestAnimationFrame(render);
    timer.update();
    frameCount++;
    const visible = placeQuad();
    if (!visible && frameCount % 4 !== 0) return;
    const ta = ready.get(state.frame) || nearest(state.frame);
    const tb = ready.get(state.frameB) || ta;
    uniforms.tA.value = ta || blank;
    uniforms.tB.value = tb || ta || blank;
    uniforms.uMix.value = tb === ta ? 0 : state.mix;
    // the heart and eye follow the frame that is actually showing
    const aA = ANCHORS[state.frame] || ANCHORS[REST], aB = ANCHORS[state.frameB] || aA;
    const m = tb === ta ? 0 : state.mix;
    uniforms.uCore.value.set(aA.core[0] + (aB.core[0] - aA.core[0]) * m, 1 - (aA.core[1] + (aB.core[1] - aA.core[1]) * m));
    uniforms.uEye.value.set(aA.eye[0] + (aB.eye[0] - aA.eye[0]) * m, 1 - (aA.eye[1] + (aB.eye[1] - aA.eye[1]) * m));
    uniforms.uReveal.value = state.reveal;
    uniforms.uCoreLevel.value = state.core;
    uniforms.uEyeLevel.value = state.eye;
    uniforms.uDrop.value = state.drop;
    uniforms.uTime.value = reduced ? 1.0 : timer.getElapsed();
    renderer.render(scene, camera);
  }
  function nearest(i) {
    // the closest loaded frame, so a fast scroll never shows a hole
    let best = null, bd = 99;
    for (const [k, t] of ready) { const d = Math.abs(k - i); if (d < bd) { bd = d; best = t; } }
    return best;
  }
  render();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false; else if (!running) { running = true; timer.reset(); render(); }
  });

  // first frames first, then the rest in the order the sequence needs them; the form resolves on
  // its own as soon as the first frame is in, so the first screen is never empty
  want(0).then(() => {
    if (!reduced) tweenReveal();
    return want(REST);
  }).then(() => { [1, 2, 3, 4, 5, HEAD_UP, STRAIN].forEach((i) => want(i)); });
  function tweenReveal() {
    const t0 = performance.now();
    const step = (now) => {
      const u = Math.min(1, (now - t0) / 1800);
      state.reveal = Math.max(state.reveal, u * u * (3 - 2 * u));
      if (u < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---- tiny tween helper ----
  function tween(obj, key, to, ms, easing = (t) => t) {
    return new Promise((resolve) => {
      const from = obj[key], t0 = performance.now();
      const step = (now) => {
        const u = Math.min(1, (now - t0) / ms);
        obj[key] = from + (to - from) * easing(u);
        if (u < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }
  const easeOut3 = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn2 = (t) => t * t;
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const dur = (ms) => (reduced ? Math.max(1, ms * 0.25) : ms);

  // crossfade from the current frame to another, settling on it
  async function go(to, ms, drop = 0) {
    if (state.frame === to && state.mix === 0) return;
    state.frameB = to; state.mix = 0; state.drop = drop;
    const p1 = tween(state, 'mix', 1, dur(ms), easeInOut);
    if (drop) tween(state, 'drop', 0, dur(ms * 1.1), easeOut3);
    await p1;
    state.frame = to; state.mix = 0; state.drop = 0;
  }

  let busy = false;
  const api = {
    renderer, state, project,
    setAnchors(a, b) { anchors.a = a; anchors.b = b; },
    // the scroll sequence: p in [0,1]. Darkness, the form, then the harness piece by piece.
    setSequence(p) {
      state.seq = p;
      if (busy) return;
      if (reduced) state.reveal = 1;
      // frames 0..6 across [0, 0.9]; the closing beat uses the last tenth
      const steps = REST;          // 6 transitions
      const q = THREE.MathUtils.clamp(p / 0.9, 0, 1) * steps;
      const i = Math.min(steps - 1, Math.floor(q));
      const f = q - i;             // position inside this transition
      // each piece lands in the first 55% of its slot, then holds
      const k = THREE.MathUtils.clamp(f / 0.55, 0, 1);
      const eased = 1 - Math.pow(1 - k, 3);
      if (q >= steps) { state.frame = REST; state.frameB = REST; state.mix = 0; state.drop = 0; }
      else { state.frame = i; state.frameB = i + 1; state.mix = eased; state.drop = (1 - eased) * 0.012; }
      state.core = 0.4 + 0.25 * Math.min(1, state.reveal + p);
      want(Math.min(REST, i + 1));
    },
    // the demo states
    async surge() {           // approve and send: the rein is given, the head lifts, the message leaves
      if (busy) return; busy = true;
      await want(HEAD_UP);
      tween(state, 'core', 1.6, dur(260), easeIn2);
      tween(state, 'eye', 1.8, dur(260), easeIn2);
      await go(HEAD_UP, 460);
      await wait(dur(900));
      tween(state, 'core', 0.65, dur(900), easeOut3);
      tween(state, 'eye', 1.0, dur(900), easeOut3);
      await go(REST, 700);
      busy = false;
    },
    async strain() {          // the agent reaches for approval: the harness holds
      if (busy) return; busy = true;
      await want(STRAIN);
      tween(state, 'core', 2.4, dur(220), easeIn2);
      tween(state, 'eye', 2.2, dur(220), easeIn2);
      await go(STRAIN, 380);
      await wait(dur(520));
      tween(state, 'core', 0.65, dur(1100), easeOut3);
      tween(state, 'eye', 1.0, dur(1100), easeOut3);
      await go(REST, 900);
      busy = false;
    },
    async flicker() {         // a retry: already gone, nothing moves
      const c = state.core;
      await tween(state, 'core', c * 0.35, dur(90));
      await tween(state, 'core', c * 1.3, dur(120));
      await tween(state, 'core', c, dur(260), easeOut3);
    },
    async dim() {             // a rejection: the core dims, nothing leaves
      const c = state.core;
      await tween(state, 'core', 0.18, dur(380), easeOut3);
      await wait(dur(700));
      await tween(state, 'core', c, dur(900), easeInOut);
    },
    setGrain(v) { uniforms.uGrain.value = v; },
    isBusy() { return busy; },
    debug: { scene, camera, quad, uniforms, ready, render: () => renderer.render(scene, camera) },
  };
  return api;
}
