// The blob in WebGL. Strands are camera-facing ribbons whose texture is a strip of real numbers, and
// mipmaps are the level of detail: far away a strand reads as a pencil line, close up it is digits.
// The canvas is transparent: the sheet of paper is the page itself, so the same drawing sits on the
// page, in a saved image, or anywhere else without a rectangle around it.
import * as THREE from 'three';
import { coreMesh, surfacePoint, surfaceNormal, weightRows } from './blob-geometry.js';

export const FOV = 22;

export const EYE = { x: 0.415, y: -0.2, rx: 0.09, ry: 0.096 };

// Same function as the shader's breathe(), for things placed from JS.
export function breatheJS(p, b) {
  const t = Math.min(1, Math.max(0, (0.7 - p[1]) / 1.2));
  const low = t * t * (3 - 2 * t);
  const k = b * (0.016 + 0.016 * low);
  const u = Math.min(1, Math.max(0, (p[1] + 0.2) / 1.2));
  return [p[0] * (1 + k), p[1] * (1 + k * 0.75) + b * 0.012 * u * u * (3 - 2 * u), p[2] * (1 + k)];
}
const BREATHE_GLSL = /* glsl */`
  uniform float uBreath;
  vec3 breathe(vec3 p) {
    float low = smoothstep(0.7, -0.5, p.y);
    float k = uBreath * (0.016 + 0.016 * low);
    vec3 q = p;
    q.xz *= 1.0 + k;
    q.y = q.y * (1.0 + k * 0.75) + uBreath * 0.012 * smoothstep(-0.2, 1.0, p.y);
    return q;
  }`;

const NOISE_GLSL = /* glsl */`
  float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }`;

const STRAND_VERT = /* glsl */`
  precision highp float;
  in vec3 position; in vec4 aT; in vec3 aA; in vec4 aB; in vec3 aC;
  uniform mat4 modelViewMatrix, projectionMatrix; uniform mat3 normalMatrix;
  uniform vec2 uViewport; uniform float uTime, uFocus, uAperture, uMaxCoc, uMinPx, uRowTex, uFarGain, uDrift;
  uniform float uMassSolid, uBody, uBlink, uFlow, uAlpha, uTaut, uLead0, uFlicker, uSag;
  uniform vec3 uKey, uLeadA, uLeadB, uClearP; uniform float uClear;
  uniform vec4 uEyeL, uEyeR; uniform vec2 uEyeZ; uniform vec2 uDraw;
  ${BREATHE_GLSL}
  out vec3 vCol; out float vAlpha; out float vU; out float vV; out float vRow; out float vBias; out float vGain;
  out float vWpx; out float vCoc; out float vFloor; out float vSoft; out float vFar; out vec2 vGrain; out float vTip; out float vGold;

  float eyeDist(vec3 p, vec4 e, float z) { return length((p - vec3(e.xy, z)) / vec3(e.z, e.w, e.z)); }

  void main() {
    float u = aA.x + uFlow, width = aA.y, s = aA.z, side = aT.w > 0.0 ? 1.0 : -1.0;
    vec3 T0 = aT.xyz;
    float tone = aB.x / 255.0, press = aB.y / 255.0, gold = aB.z / 255.0, row = aB.w;
    float shell = aC.x, f = aC.y, delay = aC.z;
    float phase = row * 1.7 + tone * 31.0;

    // the draw-on: a strand exists only between its tail and its head
    float head = clamp((uDraw.x - delay) / max(1.0 - delay, 1e-3), -0.1, 1.1);
    float tail = clamp((uDraw.y - delay) / max(1.0 - delay, 1e-3), -0.1, 1.1);
    float len = f > 0.001 ? s / f : 0.2;
    vTip = (head - f) * len;
    float tailD = (f - tail) * len;
    if (head <= 0.0 || f > head + 0.02 || f < tail - 0.02) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }

    vec3 p0 = position;
    if (uTaut > 0.001) {
      // the lead pulled straight, from where it leaves the body to the hand holding it
      float k = smoothstep(uLead0, uLead0 + 0.04, f) * uTaut;
      float tl = clamp((f - uLead0) / (1.0 - uLead0), 0.0, 1.0);
      vec3 straight = mix(uLeadA, uLeadB, tl);
      straight.y -= uSag * 4.0 * tl * (1.0 - tl);
      p0 = mix(p0, straight, k);
    }
    // a slow drift along the strand, no jitter
    p0 += T0 * uDrift * sin(uTime * 0.31 + phase + dot(p0, vec3(2.1, 1.7, 2.6)));
    vec3 nObj = normalize(p0 * vec3(0.95, 1.05, 0.95));
    float contact = 0.0;
    if (uBody > 0.5) {
      p0 += nObj * uDrift * 0.5 * sin(uTime * 0.23 + phase * 0.7 + dot(p0, vec3(1.3, 2.3, 1.1)));
      // strands part around the eyes and sit darker against them
      float dE = min(eyeDist(p0, uEyeL, uEyeZ.x), eyeDist(p0, uEyeR, uEyeZ.y));
      float inEye = (1.0 - smoothstep(0.7, 1.0, dE)) * (1.0 - uBlink * 0.92);
      p0 -= nObj * inEye * 0.1;
      contact = (1.0 - smoothstep(0.95, 1.5, dE)) * (1.0 - uBlink);
    }

    vec3 p1 = breathe(p0);
    vec3 p2 = breathe(p0 + T0 * 0.012);
    vec4 mv = modelViewMatrix * vec4(p1, 1.0);
    vec3 P = mv.xyz;
    vec3 T = normalize((modelViewMatrix * vec4(p2, 1.0)).xyz - P);
    vec3 V = normalize(-P);
    vec3 S = cross(V, T);
    float sl = length(S);
    S = sl > 1e-4 ? S / sl : vec3(0.0, 1.0, 0.0);

    vec3 N = normalize(normalMatrix * nObj);
    float ndv = dot(N, V);
    // the far side of the body is behind the core: skip it, which also halves the overdraw
    if (uBody > 0.5 && ndv < -0.1) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float key = pow(clamp(dot(N, uKey) * 0.5 + 0.5, 0.0, 1.0), 1.4);
    if (uBody < 0.5) key = 0.62;

    float z = max(-P.z, 1e-3);
    float px = projectionMatrix[1][1] * uViewport.y * 0.5 / z;
    float wpx = width * px;
    float lod0 = log2(max(uRowTex / max(wpx, 0.5), 1.0));
    float farness = smoothstep(1.0, 3.0, lod0);
    // pencil shading: where the light falls the line is finer
    wpx *= mix(1.0, mix(1.22, 0.76, key), farness * uBody);

    float coc = min(uAperture * abs(z - uFocus) / z * uViewport.y, uMaxCoc);
    float w2 = max(wpx, uMinPx);
    float cover = wpx / w2;
    float hw = (w2 + 2.0 * coc + 2.0) * 0.5;
    P += S * side * hw / px;
    gl_Position = projectionMatrix * vec4(P, 1.0);

    float massK = uBody * smoothstep(0.985, 0.97, shell);
    vU = u;
    vV = side * hw / w2;
    vRow = row;
    vWpx = w2;
    vCoc = coc;
    vSoft = massK * 0.18 * w2;
    // wide strokes are the side of the pencil: grain, not a blurred edge
    vFar = max(farness, massK * smoothstep(0.0, 2.0, lod0));
    vBias = log2(1.0 + coc * 0.8);
    vGain = mix(1.0, uFarGain, smoothstep(1.0, 3.6, lod0));
    // far away the digits close up into a continuous line, broken only by the pressure of the numbers
    vFloor = mix(smoothstep(3.4, 4.6, lod0) * 0.62, max(smoothstep(2.6, 3.6, lod0), uMassSolid) * 0.82, massK);
    // grain is anchored to the strand in world units, so it travels with the line when the camera moves
    float gk = clamp(px * 0.62, 40.0, 320.0);
    vGrain = vec2(s, side * width * hw / w2) * gk + vec2(phase * 13.0, phase * 7.0);

    float a = mix(0.62, 1.0, press) * cover * uAlpha;
    // a strand pointing straight at the lens has no width to show: let it go rather than twist
    a *= smoothstep(0.06, 0.3, sl);
    // graphite on the sheet: dark value is the pencil, light strokes are a white pencil on top
    float lit = smoothstep(0.34, 0.96, key);
    float tn = tone;
    vec3 col = mix(vec3(0.098, 0.09, 0.082), vec3(0.40, 0.378, 0.345), clamp(tn / 0.72, 0.0, 1.0));
    if (uBody > 0.5) {
      a *= mix(1.0, 0.3, lit * (0.45 + 0.55 * clamp(tn * 1.6, 0.0, 1.0)));
      // lines pile up where the form turns away: thin them, so the edge is a turning, not an outline
      a *= mix(0.14, 1.0, smoothstep(0.03, 0.56, ndv));
      a *= mix(1.0, smoothstep(0.12, 0.62, ndv) * 0.55, massK);
      a *= mix(0.5, 1.0, smoothstep(-0.8, -0.42, p0.y));
      a = mix(a, min(1.0, a * 1.25), contact);
      if (tn > 0.72) {
        float wh = smoothstep(0.72, 0.8, tn);
        col = mix(col, vec3(0.992, 0.978, 0.94), wh);
        a = mix(a, press * cover * mix(0.15, 0.85, key) * uAlpha, wh);
      }
      // the macro camera clears the air around the lines it reads
      if (uClear > 0.001 && shell < 1.05) {
        float dc = length(p0 - uClearP);
        a *= mix(1.0, mix(0.5, 0.3, 1.0 - massK), uClear * (1.0 - smoothstep(0.34, 0.62, dc)));
      }
      // the lines placed by hand are read, not shaded
      if (shell >= 1.05) a = mix(a, press * cover * uAlpha, uClear);
    }
    // gold means the human's thread and nothing else
    col = mix(col, vec3(0.70, 0.52, 0.2), gold);
    if (gold > 0.5) a = press * cover * uAlpha * smoothstep(0.06, 0.3, sl);
    // what falls out of focus sinks toward the paper
    col = mix(col, vec3(0.5, 0.46, 0.39), smoothstep(2.0, 18.0, coc) * 0.34);
    a *= smoothstep(0.0, 0.012, tailD);
    a *= 1.0 - uFlicker * 0.55;
    vGold = gold;
    vCol = col;
    vAlpha = a;
  }`;

const STRAND_FRAG = /* glsl */`
  precision highp float;
  uniform highp sampler2D tAtlas; uniform float uRows;
  ${NOISE_GLSL}
  in vec3 vCol; in float vAlpha; in float vU; in float vV; in float vRow; in float vBias; in float vGain; in float vWpx; in float vCoc; in float vFloor; in float vSoft; in float vFar; in vec2 vGrain; in float vTip; in float vGold;
  out vec4 fragColor;
  void main() {
    if (vTip < 0.0) discard;
    float vv = clamp(vV, -0.5, 0.5);
    float atlasV = (vRow + 0.5 - vv) / uRows;
    float ink = texture(tAtlas, vec2(vU, atlasV), vBias).r;
    float d = abs(vV) * vWpx;
    float halfW = 0.5 * vWpx;
    float soft = max(max(0.7, vCoc), vSoft);
    float prof = 1.0 - smoothstep(halfW - soft, halfW + soft, d);
    float energy = vWpx / (vWpx + vCoc * 1.1);
    float a = max(max(clamp(ink * vGain, 0.0, 1.0), vFloor), vGold * 0.82) * prof * energy * vAlpha;
    // the tooth of the sheet: the pencil catches on the high points and skips the low ones
    if (vFar > 0.01) {
      float tooth = vnoise(vGrain) * 0.62 + vnoise(vGrain * 2.3 + 5.0) * 0.38;
      a *= mix(1.0, smoothstep(0.1, 0.64, tooth + a * 0.34 - 0.14), vFar * 0.92);
    }
    if (a < 0.002) discard;
    fragColor = vec4(vCol * a, a);
  }`;

const CORE_VERT = /* glsl */`
  precision highp float;
  in vec3 position;
  uniform mat4 modelViewMatrix, projectionMatrix;
  ${BREATHE_GLSL}
  void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(breathe(position), 1.0); }`;
const CORE_FRAG = /* glsl */`
  precision highp float;
  out vec4 fragColor;
  void main() { fragColor = vec4(0.0); }`;

const EYE_VERT = /* glsl */`
  precision highp float;
  in vec3 position;
  uniform mat4 modelViewMatrix, projectionMatrix;
  out vec3 vL;
  void main() {
    vL = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

// A drawn eye. Graphite pressed hard and matte, an outline the hand did not quite close evenly, and a
// catchlight that is a small patch of sheet the pencil went around. Closed, it is one pencil stroke.
const EYE_FRAG = /* glsl */`
  precision highp float;
  uniform float uBlink; uniform vec2 uLook; uniform float uSeed;
  ${NOISE_GLSL}
  in vec3 vL;
  out vec4 fragColor;
  void main() {
    vec2 l = vL.xy;
    if (vL.z < 0.0) discard;
    float r = length(l);
    float ang = atan(l.y, l.x);
    float wob = vnoise(vec2(ang * 1.9 + uSeed, 1.3)) * 0.075 + vnoise(vec2(ang * 7.0 + uSeed, 4.2)) * 0.03;
    float grain = vnoise(l * 34.0 + uSeed) * 0.6 + vnoise(l * 79.0 + uSeed * 2.0) * 0.4;
    float edge = 1.0 - smoothstep(0.8 - wob, 0.99 - wob, r + (grain - 0.5) * 0.17);

    // the lid: closing is the top coming down onto a low arc
    float b = uBlink;
    float arc = -0.4 + 0.46 * l.x * l.x;
    float top = mix(1.3, arc, b);
    float thick = mix(2.6, 0.17 * (1.0 - 0.72 * l.x * l.x), b * b * b);
    float bot = top - thick;
    float aa = fwidth(l.y) * 1.4;
    float lid = (1.0 - smoothstep(top - aa, top + aa, l.y + (grain - 0.5) * 0.05 * b)) * smoothstep(bot - aa, bot + aa, l.y + (grain - 0.5) * 0.05 * b);
    float wide = mix(1.0, 1.0 - smoothstep(0.96, 1.04, abs(l.x)), b);
    float shape = mix(edge, wide, smoothstep(0.75, 1.0, b)) * lid;
    if (shape < 0.32) discard;

    // pressed graphite: mostly solid, a few flecks where the sheet shows through at the edges
    // visible strokes of the pencil, all one way, so it reads as filled in by hand and not as a bead
    float st = vnoise(vec2((l.x * 0.82 + l.y * 0.57) * 15.0 + uSeed, (l.y * 0.82 - l.x * 0.57) * 2.4));
    float st2 = vnoise(vec2((l.x * 0.82 + l.y * 0.57) * 38.0 + uSeed * 1.7, (l.y * 0.82 - l.x * 0.57) * 4.1));
    float tone = 0.125 + (st * 0.6 + st2 * 0.4) * 0.085;
    float fleck = smoothstep(0.62, 0.9, grain) * smoothstep(0.3, 0.85, r) * 0.7 + smoothstep(0.72, 0.92, st2) * smoothstep(0.76, 0.95, grain) * 0.42;
    float a = shape * (1.0 - fleck) * mix(0.97, 0.9, b);
    // the unmarked patch; it sits still when the eye closes because the lid has already passed it
    vec2 c = vec2(-0.3, 0.36) + uLook * 0.06;
    float dc = length((l - c) / vec2(1.0, 0.92));
    float patchEdge = 0.135 + vnoise(vec2(atan(l.y - c.y, l.x - c.x) * 1.7 + uSeed, 2.0)) * 0.09;
    float p = 1.0 - smoothstep(patchEdge - 0.035, patchEdge + 0.035, dc + (grain - 0.5) * 0.05);
    a *= 1.0 - p;
    vec3 col = vec3(tone, tone * 0.955, tone * 0.91);
    fragColor = vec4(col * a, a);
  }`;

export async function buildAtlas(model, { size = 4096, rows = 40, weight = 500 } = {}) {
  try { await document.fonts.load(`${weight} 72px "Martian Mono"`, '0123456789.−[]'); } catch (e) { /* the fallback mono still shows real numbers */ }
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rowH = size / rows;
  ctx.font = `${weight} 100px "Martian Mono", ui-monospace, Menlo, monospace`;
  const m = ctx.measureText('0');
  const fontPx = (0.62 * rowH) / (m.actualBoundingBoxAscent / 100);
  ctx.font = `${weight} ${fontPx}px "Martian Mono", ui-monospace, Menlo, monospace`;
  ctx.fontKerning = 'none';
  const adv = ctx.measureText('0').width * 1.015;
  const chars = Math.floor(size / adv);
  const step = size / chars;
  const lines = weightRows(model, rows, chars);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
  const cap = ctx.measureText('0').actualBoundingBoxAscent;
  lines.forEach((row, i) => {
    const y = (i + 0.5) * rowH + cap * 0.5;
    for (let k = 0; k < row.line.length; k++) {
      const ch = row.line[k];
      if (ch !== ' ') ctx.fillText(ch, (k + 0.5) * step, y);
    }
  });
  const rgba = ctx.getImageData(0, 0, size, size).data;
  const data = new Uint8Array(size * size);
  for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4];
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return { texture: tex, canvas, lines, chars, rowH, rows, font: ctx.font };
}

// Off the main thread when a worker is available, on it when not. Same seed, same strands either way.
let worker = null, nextId = 1;
const pending = new Map();
export function packAsync(options, pack) {
  try {
    if (!worker) {
      worker = new Worker(new URL('./blob-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => { const r = pending.get(e.data.id); pending.delete(e.data.id); if (r) r(e.data); };
    }
    return new Promise((res) => { const id = nextId++; pending.set(id, res); worker.postMessage({ id, options, pack }); });
  } catch (e) {
    return Promise.reject(e);
  }
}

// What every strand material shares, updated once per frame.
export function makeShared(atlas) {
  return {
    tAtlas: { value: atlas.texture }, uRows: { value: atlas.rows }, uRowTex: { value: atlas.rowH },
    uViewport: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uFocus: { value: 6 }, uAperture: { value: 0 }, uMaxCoc: { value: 22 },
    uMinPx: { value: 1.05 }, uFarGain: { value: 3.4 }, uMassSolid: { value: 1 },
    uKey: { value: new THREE.Vector3(-0.48, 0.62, 0.62).normalize() },
  };
}

export function strandMaterial(shared, { body = 0, breath = { value: 0 } } = {}) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: STRAND_VERT, fragmentShader: STRAND_FRAG,
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    uniforms: {
      ...shared,
      uBreath: breath, uBody: { value: body }, uDrift: { value: body ? 0.005 : 0.002 }, uBlink: { value: 0 }, uFlow: { value: 0 }, uAlpha: { value: 1 },
      uDraw: { value: new THREE.Vector2(1.2, -0.2) }, uTaut: { value: 0 }, uSag: { value: 0 }, uLead0: { value: 0.8 }, uLeadA: { value: new THREE.Vector3() }, uLeadB: { value: new THREE.Vector3() },
      uClear: { value: 0 }, uClearP: { value: new THREE.Vector3() }, uFlicker: { value: 0 },
      uEyeL: { value: new THREE.Vector4(9, 9, 1, 1) }, uEyeR: { value: new THREE.Vector4(9, 9, 1, 1) }, uEyeZ: { value: new THREE.Vector2() },
    },
  });
}

export function strandMesh(packed, shared, opts = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(packed.position, 3));
  geo.setAttribute('aT', new THREE.BufferAttribute(packed.tangent, 4, true));
  geo.setAttribute('aA', new THREE.BufferAttribute(packed.a, 3));
  geo.setAttribute('aB', new THREE.BufferAttribute(packed.b, 4, false));
  geo.setAttribute('aC', new THREE.BufferAttribute(packed.c, 3));
  geo.setIndex(new THREE.BufferAttribute(packed.index, 1));
  const m = new THREE.Mesh(geo, strandMaterial(shared, opts));
  m.frustumCulled = false;
  m.renderOrder = opts.order ?? 5;
  return m;
}

const SHARED_CORE = (() => {
  let g = null;
  return () => {
    if (g) return g;
    const c = coreMesh();
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(c.position, 3));
    g.setIndex(new THREE.BufferAttribute(c.index, 1));
    return g;
  };
})();
const DOME = new THREE.SphereGeometry(1, 30, 22);

// A body: depth-only core, strands, two drawn eyes, its own breath and blink.
export class Creature {
  constructor(packed, shared, { order = 5, scale = 1, seed = 1, breathPhase = 0, eyeScale = 1 } = {}) {
    this.eyeScale = eyeScale;
    this.root = new THREE.Group();
    this.breath = { value: 0 };
    this.breathPhase = breathPhase;
    this.look = new THREE.Vector2();
    this.lookTarget = new THREE.Vector2();
    this.gazeTau = 0.9;
    this.blink = 0;
    this.blinkHold = 0;
    this.blinkStart = -10;
    this.autoBlink = true;
    this.time = 0;
    this.nextBlink = 3 + ((seed * 7.3) % 4);
    this.period = 11;
    this.lean = 0;       // straining forward
    this.scale = scale;
    this.seed = seed;
    this.coreMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: CORE_VERT, fragmentShader: CORE_FRAG, colorWrite: false,
      uniforms: { uBreath: this.breath },
    });
    this.core = new THREE.Mesh(SHARED_CORE(), this.coreMat);
    this.core.frustumCulled = false; this.core.renderOrder = order - 2;
    this.root.add(this.core);
    this.strands = strandMesh(packed, shared, { body: 1, breath: this.breath, order });
    this.root.add(this.strands);
    this.eyeMats = [];
    const makeEye = (i) => {
      const mat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: EYE_VERT, fragmentShader: EYE_FRAG,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, transparent: false,
        uniforms: { uBlink: { value: 0 }, uLook: { value: new THREE.Vector2() }, uSeed: { value: seed * 3.1 + i * 11.7 } },
      });
      this.eyeMats.push(mat);
      const m = new THREE.Mesh(DOME, mat);
      m.frustumCulled = false; m.renderOrder = order - 1;
      this.root.add(m);
      return m;
    };
    this.eyeL = makeEye(0);
    this.eyeR = makeEye(1);
    this.placeEyes(0);
  }

  placeEyes(breath) {
    const e = EYE, u = this.strands.material.uniforms;
    const shift = this.look;
    for (const [g, sign, uni] of [[this.eyeL, -1, u.uEyeL], [this.eyeR, 1, u.uEyeR]]) {
      const x = sign * e.x + shift.x * 0.04, y = e.y + shift.y * 0.026;
      let d = [x, y, Math.sqrt(Math.max(0.02, 1 - x * x - y * y))];
      let p = surfacePoint(d);
      for (let i = 0; i < 5; i++) {
        d = [d[0] + (x - p[0]) * 0.8, d[1] + (y - p[1]) * 0.8, d[2]];
        p = surfacePoint(d);
      }
      const n = surfaceNormal(d);
      const b = breatheJS(p, breath);
      g.position.set(b[0], b[1], b[2]);
      const f = new THREE.Vector3(n[0] * 0.7, n[1] * 0.7, n[2] * 0.7 + 0.3).normalize();
      g.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(f, new THREE.Vector3(), new THREE.Vector3(0, 1, 0)));
      g.scale.set(e.rx * this.eyeScale, e.ry * this.eyeScale, Math.min(e.rx, e.ry) * 0.16);
      uni.value.set(p[0], p[1], e.rx * this.eyeScale, e.ry * this.eyeScale);
      if (sign < 0) u.uEyeZ.value.x = p[2]; else u.uEyeZ.value.y = p[2];
    }
  }

  // waveform: slow sine with a touch of hold at the top and bottom, as a resting breath has
  breathAt(t) {
    const s = Math.sin(((t + this.breathPhase) / this.period) * Math.PI * 2);
    return Math.sign(s) * Math.pow(Math.abs(s), 0.85);
  }

  update(dt, { frozen = false } = {}) {
    if (!frozen) this.time += dt;
    const t = this.time;
    const b = this.breathAt(t);
    this.breath.value = b;
    const k = frozen ? 1 : 1 - Math.exp(-dt / this.gazeTau);
    this.look.lerp(this.lookTarget, k);
    const yaw = this.look.x * 0.075 + Math.sin(t * 0.17 + this.seed) * 0.012;
    const pitch = -this.look.y * 0.04;
    this.root.rotation.set(pitch + this.lean * 0.2, yaw, Math.sin(t * 0.13 + 1.0 + this.seed) * 0.008);
    this.eyeMats.forEach((m) => m.uniforms.uLook.value.copy(this.look));
    if (!frozen && this.autoBlink) {
      if (t > this.nextBlink && this.blinkHold <= 0) { this.blinkStart = t; this.nextBlink = t + 6 + ((t * 13.7 + this.seed) % 6); }
      const e = t - this.blinkStart;
      const close = 0.38, hold = 0.09, open = 0.66;
      let v = 0;
      if (e < close) { const u = e / close; v = u * u * (3 - 2 * u); }
      else if (e < close + hold) v = 1;
      else if (e < close + hold + open) { const u = (e - close - hold) / open; v = 1 - u * u * (3 - 2 * u); }
      this.blinkTarget = v;
    }
    let target = this.blinkTarget ?? 0;
    if (this.blinkHold > 0) { this.blinkHold -= dt; target = 1; }
    if (!frozen) this.blink += (target - this.blink) * (1 - Math.exp(-dt / 0.05));
    this.eyeMats.forEach((m) => { m.uniforms.uBlink.value = this.blink; });
    this.strands.material.uniforms.uBlink.value = this.blink;
    this.placeEyes(b);
  }
}

export function applyPose(camera, pose, w, h) {
  const dir = new THREE.Vector3(pose.dir[0], pose.dir[1], pose.dir[2]).normalize();
  const t = new THREE.Vector3(pose.target[0], pose.target[1], pose.target[2]);
  camera.position.copy(t).addScaledVector(dir, pose.dist);
  camera.up.set(pose.up[0], pose.up[1], pose.up[2]);
  camera.lookAt(t);
  camera.aspect = w / h;
  camera.fov = FOV;
  camera.setViewOffset(w, h, -(pose.sx || 0) * w, -(pose.sy || 0) * h, w, h);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

export function frameShared(shared, camera, renderer, dpr, t, pose) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  shared.uViewport.value.copy(size);
  shared.uAperture.value = pose.aperture ?? 0.0005;
  shared.uFocus.value = pose.focus ?? pose.dist;
  shared.uMinPx.value = 1.0 * dpr;
  shared.uTime.value = t;
  shared.uKey.value.set(-0.48, 0.62, 0.62).normalize().transformDirection(camera.matrixWorldInverse);
  shared.uMassSolid.value = THREE.MathUtils.smoothstep(camera.position.length(), 1.9, 3.2);
}

export { surfacePoint, surfaceNormal };
