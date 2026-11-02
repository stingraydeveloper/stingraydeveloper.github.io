// The blob in WebGL. Strands are camera-facing ribbons whose texture is a strip of real numbers, and
// mipmaps are the level of detail: far away a strand reads as a pencil line, close up it is digits.
// The canvas is transparent, so the same drawing sits on either ground, or in a saved image.
import * as THREE from 'three';
import { coreMesh, surfacePoint, surfaceNormal, weightRows, EYE } from './blob-geometry.js';

export const FOV = 22;
export { EYE };

export const THEMES = {
  light: { paper: 1, ground: '#ece5d4' },
  dark: { paper: 0, ground: '#191613' },
};

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
  uniform float uPaper, uBody, uBlink, uFlow, uAlpha, uTaut, uLead0, uFlicker, uSag, uPressAlpha, uTailSoft, uHug, uFaceLift;
  uniform vec3 uKey, uLeadA, uLeadB, uClearP; uniform float uClear;
  uniform vec4 uEyeL, uEyeR; uniform vec2 uEyeZ; uniform vec2 uDraw;
  ${BREATHE_GLSL}
  out vec3 vCol; out float vAlpha; out float vU; out float vV; out float vRow; out float vBias; out float vGain;
  out float vWpx; out float vCoc; out float vFloor; out float vSoft; out float vFar; out vec2 vGrain; out float vTip; out float vGold;

  float eyeDist(vec3 p, vec4 e, float z) { return length((p - vec3(e.xy, z)) / vec3(e.z, e.w, e.z)); }
  vec3 ramp(float v) {
    vec3 ink = vec3(0.047, 0.040, 0.032), mid = vec3(0.40, 0.375, 0.335), bone = vec3(0.945, 0.915, 0.85);
    return v < 0.5 ? mix(ink, mid, v / 0.5) : mix(mid, bone, (v - 0.5) / 0.5);
  }

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
    if (uTaut > 0.001 && tone > 0.9) {
      // the lead pulled straight, from where it leaves the body to the hand holding it
      float k = smoothstep(uLead0, uLead0 + 0.04, f) * uTaut;
      float tl = clamp((f - uLead0) / (1.0 - uLead0), 0.0, 1.0);
      vec3 straight = mix(uLeadA, uLeadB, tl);
      straight.y -= uSag * 4.0 * tl * (1.0 - tl);
      p0 = mix(p0, straight, k);
    }
    // a slow drift along the strand, no jitter
    p0 += T0 * uDrift * sin(uTime * 0.31 + phase + dot(p0, vec3(2.1, 1.7, 2.6)));
    vec3 nObj = normalize(p0 * vec3(0.92, 1.08, 0.92));
    float contact = 0.0, face = 0.0, clearZ = 0.0, clearK = 0.0, ringE = 9.0;
    if (uBody > 0.5) {
      p0 += nObj * uDrift * 0.5 * sin(uTime * 0.23 + phase * 0.7 + dot(p0, vec3(1.3, 2.3, 1.1)));
      // strands part around the eyes and sit darker against them
      float dE = min(eyeDist(p0, uEyeL, uEyeZ.x), eyeDist(p0, uEyeR, uEyeZ.y));
      ringE = dE;
      float front = smoothstep(0.1, 0.45, p0.z);
      float inEye = (1.0 - smoothstep(0.7, 0.97, dE)) * (1.0 - uBlink * 0.9);
      p0 -= nObj * inEye * 0.09;
      contact = (1.0 - smoothstep(0.9, 1.75, dE)) * front * (1.0 - uBlink);
      face = (1.0 - smoothstep(0.1, 1.0, length((p0.xy - vec2(0.0, 0.5 * (uEyeL.y + uEyeR.y))) / vec2(0.85, 0.42)))) * front;
      // under each eye, a soft zone where dark marks do not gather, so nothing reads as a tear
      vec2 qL = (p0.xy - uEyeL.xy) / uEyeL.zw, qR = (p0.xy - uEyeR.xy) / uEyeR.zw;
      clearZ = (1.0 - smoothstep(0.8, 1.5, min(length(vec2(qL.x, (qL.y + 1.55) / 1.25)), length(vec2(qR.x, (qR.y + 1.55) / 1.25))))) * step(0.0, p0.z);
      // the macro camera keeps only what it reads in focus
      if (uClear > 0.001 && shell < 1.05) clearK = uClear * (1.0 - smoothstep(0.34, 0.62, length(p0 - uClearP)));
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
    float ndvS = dot(N, V);
    // the far side of the body is behind the core: skip it, which also halves the overdraw
    if (uBody > 0.5 && ndvS < -0.12) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float ndv = max(ndvS, 0.0);
    float key = pow(clamp(dot(N, uKey) * 0.5 + 0.5, 0.0, 1.0), 1.5);
    float rim = pow(1.0 - ndv, 3.2);
    float depth = smoothstep(0.925, 1.0, shell);

    float z = max(-P.z, 1e-3);
    float px = projectionMatrix[1][1] * uViewport.y * 0.5 / z;
    float wpx = width * px;
    float lod0 = log2(max(uRowTex / max(wpx, 0.5), 1.0));
    float farness = smoothstep(1.0, 3.0, lod0);
    // pencil shading: where the light falls the line is finer
    wpx *= mix(1.0, mix(1.22, 0.74, key), farness * uBody);

    float coc = max(min(uAperture * abs(z - uFocus) / z * uViewport.y, uMaxCoc), clearK * 11.0 * uViewport.y / 900.0);
    float w2 = max(wpx, uMinPx);
    float cover = wpx / w2;
    float hw = (w2 + 2.0 * coc + 2.0) * 0.5;
    P += S * side * hw / px;
    gl_Position = projectionMatrix * vec4(P, 1.0);

    float massK = uBody * smoothstep(0.99, 0.975, shell);
    vU = u;
    vV = side * hw / w2;
    vRow = row;
    vWpx = w2;
    vCoc = coc;
    vSoft = uBody * smoothstep(0.985, 0.94, shell) * 0.26 * w2;
    vFar = farness;
    vBias = log2(1.0 + coc * 0.8);
    vGain = mix(1.0, uFarGain, smoothstep(1.0, 3.6, lod0));
    // far away the digits close up into a continuous line, broken only by the pressure of the numbers
    vFloor = mix(smoothstep(2.7, 4.3, lod0) * 0.6, smoothstep(1.7, 3.1, lod0) * mix(0.96, 0.84, uPaper), massK);
    // grain is anchored to the strand, so it travels with the line when the camera moves
    float gk = clamp(px * 0.62, 40.0, 320.0);
    vGrain = vec2(s, side * width * hw / w2) * gk + vec2(phase * 13.0, phase * 7.0);

    float a = mix(0.62, 1.0, press) * cover * uAlpha;
    // a strand pointing straight at the lens has no width to show: let it go rather than twist
    a *= smoothstep(0.06, 0.3, sl);
    float tn = tone;
    vec3 col;
    if (uBody > 0.5) {
      // lines pile up where the form turns away: thin them, or the edge reads as a nest
      a *= mix(0.42, 1.0, smoothstep(0.02, 0.5, ndv));
      if (uPaper < 0.5) {
        // light pencil on a dark ground
        float shade = mix(0.16, 1.5, key) * mix(0.85, 1.0, depth);
        float massL = smoothstep(0.99, 0.975, shell);
        float v = (tone + massL * 0.3) * shade * mix(1.0, 0.9 + 0.5 * key, massL) + 0.015;
        v += face * uFaceLift * mix(0.5, 1.0, key) * (0.4 + 0.6 * depth);
        v *= 1.0 - contact * 0.5;
        col = ramp(clamp(v, 0.0, 1.0));
        col += vec3(0.80, 0.56, 0.24) * pow(rim, 1.8) * (0.04 + 0.34 * smoothstep(0.3, 0.8, key)) * depth;
        a *= mix(0.82, 1.0, depth);
        // the wide light strokes step back near the eyes, so the eyes keep the ground around them
        a *= mix(1.0, 0.4, massL * (1.0 - smoothstep(1.0, 2.4, ringE)));
      } else {
        // graphite on paper: dark value is the pencil, light strokes are a white pencil on top
        float lit = smoothstep(0.42, 0.98, key);
        col = mix(vec3(0.085, 0.078, 0.07), vec3(0.42, 0.395, 0.355), clamp(tn / 0.72, 0.0, 1.0));
        a *= mix(1.0, 0.36, lit * (0.4 + 0.6 * clamp(tn * 1.5, 0.0, 1.0)));
        a *= mix(0.5, 1.0, depth);
        if (tn > 0.72) {
          float wh = smoothstep(0.72, 0.8, tn);
          col = mix(col, vec3(0.992, 0.975, 0.93), wh);
          a = mix(a, press * cover * mix(0.35, 0.95, key) * uAlpha, wh);
        }
        col = mix(col, vec3(0.62, 0.44, 0.17), rim * 0.35 * smoothstep(0.25, 0.8, key));
        a *= 1.0 - face * uFaceLift * 0.6;
        a = mix(a, min(1.0, a * 1.3), contact);
      }
      // dark marks leave the zone under the eyes, the lighter lines stay
      a *= mix(1.0, mix(0.16, 0.85, smoothstep(0.12, 0.3, tn)), clearZ);
      a *= mix(1.0, mix(0.5, 0.3, 1.0 - massK), clearK);
      // the lines placed by hand are read, not shaded
      if (shell >= 1.05) {
        a = mix(a, press * cover * uAlpha, uClear);
        col = mix(col, uPaper < 0.5 ? vec3(0.945, 0.915, 0.85) : vec3(0.085, 0.078, 0.07), uClear);
      }
    } else if (uPaper < 0.5 && shell < 1.005) {
      // a pencil shadow under a prop stays a shadow on the dark ground
      col = vec3(0.012, 0.01, 0.008);
      a *= 0.8;
    } else {
      col = uPaper < 0.5
        ? mix(vec3(0.93, 0.90, 0.84), vec3(0.62, 0.585, 0.53), clamp(tn / 0.72, 0.0, 1.0))
        : mix(vec3(0.098, 0.09, 0.082), vec3(0.40, 0.378, 0.345), clamp(tn / 0.72, 0.0, 1.0));
    }
    // gold means the human's thread and nothing else
    col = mix(col, uPaper < 0.5 ? vec3(0.88, 0.70, 0.38) : vec3(0.70, 0.52, 0.2), gold);
    if (gold > 0.5) a = press * cover * uAlpha * smoothstep(0.06, 0.3, sl);
    // a strap thins out as the form turns away and goes behind; the lead leaves the body and does not
    if (uHug > 0.5 && (f < uLead0 || tone < 0.9)) a *= smoothstep(0.1, 0.34, ndv);
    // what falls out of focus sinks toward the ground
    col = mix(col, uPaper < 0.5 ? vec3(0.42, 0.38, 0.31) : vec3(0.5, 0.46, 0.39), smoothstep(2.0, 18.0, coc) * 0.34);
    a *= smoothstep(0.0, uTailSoft, tailD);
    a *= mix(1.0, press, uPressAlpha);
    a *= 1.0 - uFlicker * 0.55;
    vGold = gold;
    vCol = col;
    vAlpha = a;
  }`;

const STRAND_FRAG = /* glsl */`
  precision highp float;
  uniform highp sampler2D tAtlas; uniform float uRows, uPaper;
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
    // the tooth of the sheet: far away the pencil catches on the high points and skips the low ones
    if (vFar > 0.01) {
      float tooth = vnoise(vGrain) * 0.65 + hash(floor(vGrain * 1.7)) * 0.35;
      float amt = vFar * (uPaper > 0.5 ? 0.9 : 0.55) * (1.0 - vGold * 0.85);
      a *= mix(1.0, smoothstep(0.08, 0.62, tooth + a * 0.34 - 0.12), amt);
    }
    if (a < 0.002) discard;
    fragColor = vec4(vCol * a, a);
  }`;

const CORE_VERT = /* glsl */`
  precision highp float;
  in vec3 position;
  uniform mat4 modelViewMatrix, projectionMatrix; uniform mat3 normalMatrix;
  ${BREATHE_GLSL}
  out vec3 vN; out vec3 vP; out vec3 vO;
  void main() {
    vec3 q = breathe(position);
    vec4 mv = modelViewMatrix * vec4(q, 1.0);
    vP = mv.xyz; vO = position;
    vN = normalMatrix * normalize(position * vec3(0.92, 1.08, 0.92));
    gl_Position = projectionMatrix * mv;
  }`;

const CORE_FRAG = /* glsl */`
  precision highp float;
  uniform float uPaper, uCoreBlur, uBlink, uCoreAlpha; uniform vec3 uKey; uniform vec3 uGround; uniform vec4 uEyeL, uEyeR; uniform vec2 uEyeZ;
  in vec3 vN; in vec3 vP; in vec3 vO;
  out vec4 fragColor;
  float h(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(h(i), h(i+vec3(1,0,0)), f.x), mix(h(i+vec3(0,1,0)), h(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(h(i+vec3(0,0,1)), h(i+vec3(1,0,1)), f.x), mix(h(i+vec3(0,1,1)), h(i+vec3(1,1,1)), f.x), f.y), f.z); }
  // Irregular streaks in object space, like graphite rubbed along the form. Not stripes: stripes moire.
  float streak(vec3 p, vec3 dir, vec3 perp, float seed) {
    vec3 q = p + 0.22 * vec3(n3(p * 1.9 + seed), n3(p * 1.9 + seed + 7.0), n3(p * 1.9 + seed + 13.0));
    float a = n3(vec3(dot(q, dir) * 52.0, dot(q, perp) * 3.2, seed));
    float b = n3(vec3(dot(q, dir) * 19.0, dot(q, perp) * 1.6, seed + 3.0));
    return mix(0.5, a * 0.6 + b * 0.4, 1.0 - uCoreBlur);
  }
  void main() {
    vec3 N = normalize(vN), V = normalize(-vP);
    float key = pow(clamp(dot(N, uKey) * 0.5 + 0.5, 0.0, 1.0), 1.5);
    float ndv = max(dot(N, V), 0.0);
    vec3 d1 = normalize(vec3(0.9, -0.62, 0.25)), p1 = normalize(cross(d1, vec3(0.1, 0.2, 1.0)));
    vec3 d2 = normalize(vec3(0.5, 0.82, -0.2)), p2 = normalize(cross(d2, vec3(0.9, 0.1, 0.2)));
    float st = max(streak(vO, d1, p1, 2.0), streak(vO, d2, p2, 6.0));
    vec3 col; float a;
    if (uPaper < 0.5) {
      float t = clamp(key, 0.0, 1.0);
      col = mix(vec3(0.022, 0.018, 0.015), vec3(0.052, 0.038, 0.022), uCoreBlur) + vec3(0.25, 0.228, 0.195) * t * t * smoothstep(0.3, 0.75, st) * (1.0 - uCoreBlur * 0.6);
      a = smoothstep(0.0, 0.14, ndv);
    } else {
      // the sheet with a little rubbed pencil in the shadow: tone, without the look of a glass ball
      float sh = clamp(1.0 - key, 0.0, 1.0);
      float tone = smoothstep(0.15, 1.0, sh + (st - 0.5) * 0.5) * 0.36;
      col = mix(uGround * vec3(0.99, 0.98, 0.965), vec3(0.47, 0.43, 0.37), tone);
      a = smoothstep(0.0, 0.3, ndv);
    }
    float dE = min(length((vO - vec3(uEyeL.xy, uEyeZ.x)) / uEyeL.zwz), length((vO - vec3(uEyeR.xy, uEyeZ.y)) / uEyeR.zwz));
    col *= 1.0 - (1.0 - smoothstep(0.85, 1.3, dE)) * smoothstep(0.1, 0.45, vO.z) * (uPaper > 0.5 ? 0.22 : 0.5) * (1.0 - uBlink);
    a *= uCoreAlpha;
    fragColor = vec4(col * a, a);
  }`;

const MASK_VERT = /* glsl */`
  precision highp float;
  in vec3 position;
  uniform mat4 modelViewMatrix, projectionMatrix;
  ${BREATHE_GLSL}
  void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(breathe(position), 1.0); }`;
const MASK_FRAG = /* glsl */`
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

// A tall dark oval with a soft highlight high on the side the light is. Closing, an arched lid comes down
// and ends as a low arc, so no frame of a blink has a corner in it.
const EYE_FRAG = /* glsl */`
  precision highp float;
  uniform float uBlink, uPaper; uniform vec2 uLook;
  ${NOISE_GLSL}
  in vec3 vL;
  out vec4 fragColor;
  void main() {
    vec2 l = vL.xy;
    // the edge is drawn, not cut: a small wobble so it belongs with the pencil around it
    float ang = atan(l.y, l.x);
    float wob = vnoise(vec2(ang * 3.1 + 7.0, 1.3)) * 0.05 + vnoise(vec2(ang * 11.0, 4.2)) * 0.022;
    float edgeAA = fwidth(length(l)) * 1.3;
    float edge = 1.0 - smoothstep(0.955 - wob - edgeAA, 0.955 - wob + edgeAA, length(l));
    float b = uBlink;
    float arcK = smoothstep(0.72, 1.0, b);
    float top = mix(1.3, -0.4, b) + mix(-0.62, 0.46, arcK) * l.x * l.x;
    float thick = mix(2.6, 0.17 * (1.0 - 0.72 * l.x * l.x), arcK * arcK * arcK);
    float bot = top - thick;
    float aa = fwidth(l.y) * 1.4;
    float lid = (1.0 - smoothstep(top - aa, top + aa, l.y)) * smoothstep(bot - aa, bot + aa, l.y);
    float wide = mix(1.0, 1.0 - smoothstep(0.96, 1.04, abs(l.x)), b);
    float vis = mix(edge, wide, smoothstep(0.75, 1.0, b)) * lid;
    if (vis < 0.01) discard;
    vec3 col = vec3(0.026, 0.021, 0.017);
    col += vec3(0.082, 0.062, 0.040) * smoothstep(0.35, 1.0, -l.y + 0.12 * l.x) * smoothstep(1.05, 0.55, length(l));
    vec2 c1 = vec2(-0.30, 0.40) + uLook * 0.1;
    float d1 = length((l - c1) / vec2(0.34, 0.36));
    col += vec3(0.98, 0.93, 0.83) * (1.0 - smoothstep(0.22, 1.0, d1)) * 0.86;
    float g = vnoise(vec2(l.x * 22.0 + l.y * 9.0, l.y * 34.0 - l.x * 6.0)) * 0.6 + vnoise(l * 60.0) * 0.4;
    col += vec3(0.024, 0.021, 0.018) * g * (uPaper > 0.5 ? 1.5 : 0.6);
    // in dark ground the closed lid is a light stroke, since a dark one would vanish
    if (uPaper < 0.5) col = mix(col, vec3(0.8, 0.77, 0.7), arcK);
    fragColor = vec4(col * vis, vis);
  }`;

const SHADOW_FRAG = /* glsl */`
  precision highp float;
  uniform float uPaper, uAlpha;
  in vec2 vUv; out vec4 fragColor;
  void main() {
    vec2 e = abs(vUv - 0.5) * 2.0;
    vec2 q = (vUv - 0.5) * 2.0 / vec2(0.5, 0.34);
    float a = exp(-dot(q, q) * 1.1) * (1.0 - smoothstep(0.62, 1.0, e.x)) * (1.0 - smoothstep(0.62, 1.0, e.y)) * uAlpha * (uPaper > 0.5 ? 0.42 : 0.72);
    vec3 c = uPaper > 0.5 ? vec3(0.40, 0.335, 0.235) : vec3(0.0);
    fragColor = vec4(c * a, a);
  }`;
const SHADOW_VERT = /* glsl */`
  in vec3 position; in vec2 uv; uniform mat4 modelViewMatrix, projectionMatrix; out vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

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
export function makeShared(atlas, theme = 'light') {
  const shared = {
    tAtlas: { value: atlas.texture }, uRows: { value: atlas.rows }, uRowTex: { value: atlas.rowH },
    uViewport: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uFocus: { value: 6 }, uAperture: { value: 0 }, uMaxCoc: { value: 22 },
    uMinPx: { value: 1.05 }, uFarGain: { value: 3.6 }, uCoreBlur: { value: 0 },
    uKey: { value: new THREE.Vector3(-0.48, 0.62, 0.62).normalize() },
    uPaper: { value: 1 }, uGround: { value: new THREE.Color() }, uFaceLift: { value: 0.28 },
  };
  setTheme(shared, theme);
  return shared;
}
export function setTheme(shared, name) {
  const t = THEMES[name] || THEMES.light;
  shared.uPaper.value = t.paper;
  shared.uGround.value.setStyle(t.ground, THREE.LinearSRGBColorSpace);
  shared.uFaceLift.value = t.paper ? 0.28 : 0.16;
}

export function strandMaterial(shared, { body = 0, breath = { value: 0 } } = {}) {
  const { uCoreBlur, uGround, ...forStrands } = shared;
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: STRAND_VERT, fragmentShader: STRAND_FRAG,
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    uniforms: {
      ...forStrands,
      uBreath: breath, uBody: { value: body }, uDrift: { value: body ? 0.0055 : 0.002 }, uBlink: { value: 0 }, uFlow: { value: 0 }, uAlpha: { value: 1 },
      uDraw: { value: new THREE.Vector2(1.2, -0.2) }, uTaut: { value: 0 }, uSag: { value: 0 }, uLead0: { value: 0.8 }, uLeadA: { value: new THREE.Vector3() }, uLeadB: { value: new THREE.Vector3() },
      uClear: { value: 0 }, uClearP: { value: new THREE.Vector3() }, uFlicker: { value: 0 }, uPressAlpha: { value: 0 }, uTailSoft: { value: 0.012 }, uHug: { value: 0 },
      uEyeL: { value: new THREE.Vector4(9, 9, 1, 1) }, uEyeR: { value: new THREE.Vector4(9, 9, 1, 1) }, uEyeZ: { value: new THREE.Vector2() },
    },
  });
}

// A body-shaped mask: writes depth and no colour, so what is drawn after it passes behind the body.
export function depthBody(shell, breath, order) {
  const c = coreMesh(shell);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(c.position, 3));
  g.setIndex(new THREE.BufferAttribute(c.index, 1));
  const m = new THREE.Mesh(g, new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: MASK_VERT, fragmentShader: MASK_FRAG, colorWrite: false, transparent: true, depthWrite: true, uniforms: { uBreath: breath } }));
  m.frustumCulled = false; m.renderOrder = order;
  return m;
}

// The soft shadow it rests in, on either ground.
export function softShadow(shared, order = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.2), new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: SHADOW_VERT, fragmentShader: SHADOW_FRAG, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uPaper: shared.uPaper, uAlpha: { value: 1 } },
  }));
  m.position.set(0.018, -0.87, -0.2);
  m.renderOrder = order;
  m.frustumCulled = false;
  return m;
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
const DOME = new THREE.SphereGeometry(1, 36, 28);

// A body: opaque core, strands, two eyes, its own breath and blink.
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
    this.strands = strandMesh(packed, shared, { body: 1, breath: this.breath, order });
    const U = this.strands.material.uniforms;
    this.coreMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: CORE_VERT, fragmentShader: CORE_FRAG, transparent: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: { uBreath: this.breath, uKey: shared.uKey, uPaper: shared.uPaper, uGround: shared.uGround, uCoreBlur: shared.uCoreBlur, uEyeL: U.uEyeL, uEyeR: U.uEyeR, uEyeZ: U.uEyeZ, uBlink: U.uBlink, uCoreAlpha: { value: 1 } },
    });
    this.core = new THREE.Mesh(SHARED_CORE(), this.coreMat);
    this.core.frustumCulled = false; this.core.renderOrder = order - 2;
    this.root.add(this.core);
    this.root.add(this.strands);
    this.eyeMats = [];
    const makeEye = () => {
      const mat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: EYE_VERT, fragmentShader: EYE_FRAG,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, transparent: false,
        uniforms: { uBlink: { value: 0 }, uLook: { value: new THREE.Vector2() }, uPaper: shared.uPaper },
      });
      this.eyeMats.push(mat);
      const m = new THREE.Mesh(DOME, mat);
      m.frustumCulled = false; m.renderOrder = order - 1;
      this.root.add(m);
      return m;
    };
    this.eyeL = makeEye();
    this.eyeR = makeEye();
    this.placeEyes(0);
  }

  placeEyes(breath) {
    const e = EYE, u = this.strands.material.uniforms;
    const shift = this.look;
    for (const [g, sign, uni] of [[this.eyeL, -1, u.uEyeL], [this.eyeR, 1, u.uEyeR]]) {
      const x = sign * e.x + shift.x * 0.035, y = e.y + shift.y * 0.022;
      let d = [x, y, Math.sqrt(Math.max(0.02, 1 - x * x - y * y))];
      let p = surfacePoint(d);
      for (let i = 0; i < 5; i++) {
        d = [d[0] + (x - p[0]) * 0.8, d[1] + (y - p[1]) * 0.8, d[2]];
        p = surfacePoint(d);
      }
      const n = surfaceNormal(d);
      const b = breatheJS(p, breath);
      g.position.set(b[0], b[1], b[2]);
      const f = new THREE.Vector3(n[0] * 0.55, n[1] * 0.55, n[2] * 0.55 + 0.45).normalize();
      g.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(f, new THREE.Vector3(), new THREE.Vector3(sign * e.tilt, 1, 0)));
      const rx = e.rx * this.eyeScale, ry = e.ry * this.eyeScale;
      g.scale.set(rx, ry, Math.min(rx, ry) * 0.44);
      uni.value.set(p[0], p[1], rx, ry);
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
      const close = 0.3, hold = 0.12, open = 0.42;
      const sharp = (u) => { const a = u * u * (3 - 2 * u); return a * a * (3 - 2 * a); };
      let v = 0;
      if (e < close) v = sharp(e / close);
      else if (e < close + hold) v = 1;
      else if (e < close + hold + open) v = 1 - sharp((e - close - hold) / open);
      this.blinkTarget = v;
    } else if (!frozen) {
      this.blinkTarget = 0;
    }
    let target = this.blinkTarget ?? 0;
    if (this.blinkHold > 0) { this.blinkHold -= dt; target = 1; }
    if (!frozen) this.blink += (target - this.blink) * (1 - Math.exp(-dt / 0.025));
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
  shared.uMinPx.value = 1.05 * dpr;
  shared.uTime.value = t;
  shared.uKey.value.set(-0.48, 0.62, 0.62).normalize().transformDirection(camera.matrixWorldInverse);
  // up close the core is behind the focal plane: its streaks melt into plain tone
  shared.uCoreBlur.value = 1 - THREE.MathUtils.smoothstep(camera.position.length(), 1.8, 2.8);
}

export { surfacePoint, surfaceNormal };
