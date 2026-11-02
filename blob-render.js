// The blob in WebGL: one draw call of camera-facing ribbons whose texture is a strip of real numbers.
// Mipmaps are the level of detail: far away a strand reads as a pencil line, close up it is digits.
import * as THREE from 'three';
import { generateBlob, packStrands, coreMesh, surfacePoint, surfaceNormal, weightRows, shellRadius } from './blob-geometry.js';

export const ATLAS = { size: 4096, rows: 40 };

export const EYES = {
  // rx, ry in world units; x, y place the eye on the front of the body
  bean: { x: 0.38, y: -0.13, rx: 0.088, ry: 0.12, tilt: 0.0, rim: 0, lid: 0 },
  pebble: { x: 0.47, y: -0.21, rx: 0.116, ry: 0.122, tilt: 0.0, rim: 0, lid: 0 },
  button: { x: 0.43, y: -0.17, rx: 0.112, ry: 0.118, tilt: 0.0, rim: 0.16, lid: 0 },
  sleepy: { x: 0.44, y: -0.19, rx: 0.108, ry: 0.112, tilt: 0.0, rim: 0, lid: 0.26 },
};

export const BACKGROUNDS = {
  graphite: { paper: 0, base: '#191613', haze: '#7f5519', hazeAmt: 0.38, grain: 0.05 },
  paper: { paper: 1, base: '#ece4d3', haze: '#eedcb0', hazeAmt: 0.7, grain: 0.032 },
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
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }`;

const STRAND_VERT = /* glsl */`
  precision highp float;
  in vec3 position; in vec3 aT; in vec4 aA; in vec4 aB;
  uniform mat4 modelViewMatrix, projectionMatrix; uniform mat3 normalMatrix;
  uniform vec2 uViewport; uniform float uTime, uFocus, uAperture, uMaxCoc, uMinPx, uRowTex, uRows, uFarGain, uDrift;
  uniform float uPaper, uMassSolid; uniform vec3 uKey; uniform vec4 uEyeL, uEyeR; uniform vec2 uEyeZ; uniform float uBlink, uFaceLift;
  ${BREATHE_GLSL}
  out vec3 vCol; out float vAlpha; out float vU; out float vV; out float vRow; out float vBias; out float vGain;
  out float vWpx; out float vCoc; out float vFloor; out float vSoft; out float vFar;

  float eyeDist(vec3 p, vec4 e, float z) { return length((p - vec3(e.xy, z)) / vec3(e.z, e.w, e.z)); }

  vec3 ramp(float v) {
    vec3 ink = vec3(0.047, 0.040, 0.032), mid = vec3(0.40, 0.375, 0.335), bone = vec3(0.945, 0.915, 0.85);
    return v < 0.5 ? mix(ink, mid, v / 0.5) : mix(mid, bone, (v - 0.5) / 0.5);
  }

  void main() {
    float u = aA.x, width = aA.y, side = aA.z, press = aA.w;
    float tone = aB.x, gold = aB.y, shell = aB.z, row = aB.w;
    float phase = row * 1.7 + tone * 31.0;
    vec3 p0 = position;
    // a slow drift along the strand, no jitter
    p0 += aT * uDrift * sin(uTime * 0.31 + phase + dot(p0, vec3(2.1, 1.7, 2.6)));
    vec3 nObj = normalize(p0 * vec3(0.92, 1.08, 0.92));
    p0 += nObj * uDrift * 0.5 * sin(uTime * 0.23 + phase * 0.7 + dot(p0, vec3(1.3, 2.3, 1.1)));

    // strands part around the eyes and sit darker against them
    float dL = eyeDist(p0, uEyeL, uEyeZ.x), dR = eyeDist(p0, uEyeR, uEyeZ.y);
    float dE = min(dL, dR);
    float front = smoothstep(0.1, 0.45, p0.z);
    float inEye = (1.0 - smoothstep(0.62, 0.9, dE)) * (1.0 - uBlink * 0.9);
    p0 -= nObj * inEye * 0.09;
    float contact = (1.0 - smoothstep(0.9, 1.75, dE)) * (1.0 - uBlink);
    float face = (1.0 - smoothstep(0.1, 1.0, length((p0.xy - vec2(0.0, 0.5 * (uEyeL.y + uEyeR.y))) / vec2(0.85, 0.42)))) * front;

    vec3 p1 = breathe(p0);
    vec3 p2 = breathe(p0 + aT * 0.012);
    vec4 mv = modelViewMatrix * vec4(p1, 1.0);
    vec3 P = mv.xyz;
    vec3 T = normalize((modelViewMatrix * vec4(p2, 1.0)).xyz - P);
    vec3 V = normalize(-P);
    vec3 S = cross(V, T);
    float sl = length(S);
    S = sl > 1e-4 ? S / sl : vec3(0.0, 1.0, 0.0);

    vec3 N = normalize(normalMatrix * nObj);
    // the far side of the body is behind the core: skip it, which also halves the overdraw
    if (dot(N, V) < -0.12 && shell < 1.06) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float ndl = dot(N, uKey);
    float key = pow(clamp(ndl * 0.5 + 0.5, 0.0, 1.0), 1.5);
    float ndv = max(dot(N, V), 0.0);
    float rim = pow(1.0 - ndv, 3.2);
    float depth = smoothstep(0.925, 1.0, shell);

    // pencil shading: where the light falls the line is finer
    float z = max(-P.z, 1e-3);
    float px = projectionMatrix[1][1] * uViewport.y * 0.5 / z;
    float wpx = width * px;
    float lod0 = log2(max(uRowTex / max(wpx, 0.5), 1.0));
    float farness = smoothstep(1.0, 3.0, lod0);
    float shadeW = mix(1.0, mix(1.22, 0.74, key), farness);
    wpx *= shadeW;

    float coc = min(uAperture * abs(z - uFocus) / z * uViewport.y, uMaxCoc);
    float w2 = max(wpx, uMinPx);
    float cover = wpx / w2;
    float hw = (w2 + 2.0 * coc + 2.0) * 0.5;
    P += S * side * hw / px;
    gl_Position = projectionMatrix * vec4(P, 1.0);

    float massK = smoothstep(0.99, 0.975, shell);
    vU = u;
    vV = side * hw / w2;
    vRow = row;
    vWpx = w2;
    vCoc = coc;
    vSoft = smoothstep(0.985, 0.94, shell) * 0.16 * w2;
    // wide strokes are the side of the pencil: grain, not a blurred edge
    vFar = max(farness, massK * smoothstep(0.0, 2.0, lod0));
    vBias = log2(1.0 + coc * 0.8);
    vGain = mix(1.0, uFarGain, smoothstep(1.0, 3.6, lod0));
    // far away the digits close up into a continuous line, broken only by the pressure of the numbers
    vFloor = mix(smoothstep(3.4, 4.6, lod0) * 0.6, max(smoothstep(2.6, 3.6, lod0), uMassSolid) * mix(0.72, 0.84, uPaper), massK);

    float a = mix(0.62, 1.0, press) * cover;
    // a strand pointing straight at the lens has no width to show: let it go rather than twist
    a *= smoothstep(0.06, 0.3, sl);
    // lines pile up where the form turns away: thin them, or the edge reads as a nest
    a *= mix(0.42, 1.0, smoothstep(0.02, 0.5, ndv));
    // nothing on the far side of the body has to shade
    vec3 col;
    if (uPaper < 0.5) {
      float shade = mix(0.06, 1.72, key * key * (3.0 - 2.0 * key)) * mix(0.92, 1.0, depth);
      // on the dark ground the mass is what carries the light: chalk on a dark sheet, not wire on a ball
      float massL = smoothstep(0.99, 0.975, shell);
      // lit like the drawing it is: pale wide strokes, darker pencil over them, a few bone highlights
      float lineTone = tone < 0.7 ? tone * 0.46 : tone * 0.9;
      float tv = mix(lineTone, 0.5 + (tone - 0.33) * 0.26, massL);
      float v = tv * shade + 0.015;
      v += massL * face * uFaceLift * mix(0.5, 1.0, key);
      v *= 1.0 - contact * 0.5;
      col = ramp(clamp(v, 0.0, 1.0));
      vec3 goldCol = vec3(0.80, 0.655, 0.39);
      col = mix(col, goldCol * (0.3 + 0.9 * key), gold);
      col += vec3(0.80, 0.56, 0.24) * pow(rim, 1.6) * (0.2 + 0.2 * smoothstep(0.3, 0.8, key)) * depth;
      a *= mix(0.82, 1.0, depth);
    } else {
      // graphite on paper: dark value is the pencil, light strokes are a white pencil on top
      float lit = smoothstep(0.42, 0.98, key);
      float tn = tone;
      vec3 graphite = mix(vec3(0.085, 0.078, 0.07), vec3(0.42, 0.395, 0.355), clamp(tn / 0.72, 0.0, 1.0));
      col = graphite;
      a *= mix(1.0, 0.46, lit * (0.4 + 0.6 * clamp(tn * 1.5, 0.0, 1.0)));
      a *= mix(0.5, 1.0, depth);
      if (tn > 0.72) {
        float wh = smoothstep(0.72, 0.8, tn);
        col = mix(col, vec3(0.992, 0.975, 0.93), wh);
        a = mix(a, press * cover * mix(0.35, 0.95, key), wh);
      }
      col = mix(col, vec3(0.71, 0.5, 0.17), gold);
      a = mix(a, press * cover * 0.95, gold);
      col = mix(col, vec3(0.62, 0.44, 0.17), rim * 0.35 * smoothstep(0.25, 0.8, key));
      a *= 1.0 - face * uFaceLift * 0.6;
      a = mix(a, min(1.0, a * 1.2), contact);
    }
    // what falls out of focus sinks into the warm of the room
    float sink = smoothstep(2.0, 18.0, coc) * 0.42;
    col = mix(col, uPaper < 0.5 ? vec3(0.62, 0.47, 0.25) * (0.3 + 0.7 * dot(col, vec3(0.33))) * 1.3 : vec3(0.47, 0.39, 0.27), sink);
    vCol = col;
    vAlpha = a;
  }`;

const STRAND_FRAG = /* glsl */`
  precision highp float;
  uniform highp sampler2D tAtlas; uniform float uRows; uniform float uPaper;
  ${NOISE_GLSL}
  in float vFar;
  in vec3 vCol; in float vAlpha; in float vU; in float vV; in float vRow; in float vBias; in float vGain; in float vWpx; in float vCoc; in float vFloor; in float vSoft;
  out vec4 fragColor;
  void main() {
    float vv = clamp(vV, -0.5, 0.5);
    float atlasV = (vRow + 0.5 - vv) / uRows;
    float ink = texture(tAtlas, vec2(vU, atlasV), vBias).r;
    float d = abs(vV) * vWpx;
    float halfW = 0.5 * vWpx;
    float soft = max(max(0.7, vCoc), vSoft);
    float prof = 1.0 - smoothstep(halfW - soft, halfW + soft, d);
    float energy = vWpx / (vWpx + vCoc * 1.1);
    float a = max(clamp(ink * vGain, 0.0, 1.0), vFloor) * prof * energy * vAlpha;
    // the tooth of the sheet: far away the pencil catches on the high points and skips the low ones
    if (vFar > 0.01) {
      float tooth = vnoise(gl_FragCoord.xy * vec2(0.82)) * 0.65 + hash(gl_FragCoord.xy) * 0.35;
      float amt = vFar * (uPaper > 0.5 ? 0.92 : 0.62);
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
  uniform float uPaper, uCoreBlur, uBlink; uniform vec3 uKey; uniform vec3 uPaperCol; uniform vec4 uEyeL, uEyeR; uniform vec2 uEyeZ;
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
      col = mix(vec3(0.022, 0.018, 0.015), vec3(0.052, 0.038, 0.022), uCoreBlur) + vec3(0.34, 0.315, 0.27) * smoothstep(0.34, 1.0, t) * (0.72 + 0.9 * (st - 0.5)) * (1.0 - uCoreBlur * 0.8);
      a = 1.0;
    } else {
      float sh = clamp(1.0 - key, 0.0, 1.0);
      float tone = smoothstep(0.2, 1.0, sh + (st - 0.5) * 0.5) * 0.3;
      col = mix(uPaperCol * vec3(0.975, 0.962, 0.935), vec3(0.45, 0.415, 0.36), tone);
      a = smoothstep(0.0, 0.3, ndv);
    }
    float dE = min(length((vO - vec3(uEyeL.xy, uEyeZ.x)) / uEyeL.zwz), length((vO - vec3(uEyeR.xy, uEyeZ.y)) / uEyeR.zwz));
    col *= 1.0 - (1.0 - smoothstep(0.85, 1.2, dE)) * (uPaper > 0.5 ? 0.42 : 0.72) * (1.0 - uBlink);
    fragColor = vec4(col * a, a);
  }`;

const EYE_VERT = /* glsl */`
  precision highp float;
  in vec3 position; in vec3 normal;
  uniform mat4 modelViewMatrix, projectionMatrix; uniform mat3 normalMatrix;
  out vec3 vN; out vec3 vP; out vec3 vL;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vP = mv.xyz; vL = position;
    vN = normalMatrix * normal;
    gl_Position = projectionMatrix * mv;
  }`;

const EYE_FRAG = /* glsl */`
  precision highp float;
  uniform float uBlink, uLid, uRimPass, uPaper; uniform vec2 uLook;
  in vec3 vN; in vec3 vP; in vec3 vL;
  out vec4 fragColor;
  ${NOISE_GLSL}
  void main() {
    vec2 l = vL.xy;
    // the edge is drawn, not cut: a small wobble so it belongs with the pencil around it
    float ang = atan(l.y, l.x);
    float wob = vnoise(vec2(ang * 3.1 + 7.0, 1.3)) * 0.05 + vnoise(vec2(ang * 11.0, 4.2)) * 0.022;
    float edgeAA = fwidth(length(l)) * 1.3;
    float edge = 1.0 - smoothstep(0.955 - wob - edgeAA, 0.955 - wob + edgeAA, length(l));
    if (edge < 0.01) discard;
    // lids are not drawn: the eye is cut, and the body's own strands show where it closes
    float blink = uBlink;
    float rest = uLid;
    float top = mix(1.2 - rest * 1.5 - rest * 1.15 * l.x * l.x, -0.42 + 0.42 * l.x * l.x, blink);
    float bot = mix(-1.2, top - 0.13, blink * blink * blink);
    float aa = fwidth(l.y) * 1.2;
    float vis = (1.0 - smoothstep(top - aa, top + aa, l.y)) * smoothstep(bot - aa, bot + aa, l.y);
    if (vis < 0.01) discard;
    vec3 N = normalize(vN), V = normalize(-vP);
    vec3 col;
    if (uRimPass > 0.5) {
      col = uPaper > 0.5 ? vec3(0.985, 0.965, 0.915) : vec3(0.84, 0.81, 0.75);
      col *= 0.86 + 0.14 * smoothstep(-1.0, 0.6, l.y);
    } else {
      // a dark wet dome: faint warm bounce low down, one soft catchlight high on the side the light is
      float sheen = smoothstep(-1.0, -0.2, -l.y);
      col = vec3(0.026, 0.021, 0.017);
      col += vec3(0.082, 0.062, 0.040) * smoothstep(0.35, 1.0, -l.y + 0.12 * l.x) * smoothstep(1.05, 0.55, length(l));
      vec2 c1 = vec2(-0.3, 0.42 - rest * 0.62) + uLook * 0.1;
      float d1 = length((l - c1) / vec2(0.3, 0.255));
      col += vec3(0.98, 0.93, 0.83) * (1.0 - smoothstep(0.3, 1.0, d1)) * (uPaper > 0.5 ? 0.92 : 0.86);
      col *= 1.0 - 0.0 * sheen;
    }
    if (uRimPass < 0.5) {
      // pressed graphite, faintly uneven; the catchlight stays clean
      float g = vnoise(vec2(l.x * 22.0 + l.y * 9.0, l.y * 34.0 - l.x * 6.0)) * 0.6 + vnoise(l * 60.0) * 0.4;
      col += vec3(0.024, 0.021, 0.018) * g * (uPaper > 0.5 ? 1.5 : 0.6);
    }
    vis *= edge;
    fragColor = vec4(col * vis, vis);
  }`;

const BACK_VERT = /* glsl */`
  in vec3 position; out vec2 vUv;
  void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }`;

const BACK_FRAG = /* glsl */`
  precision highp float;
  uniform float uPaper, uHazeAmt, uShadow; uniform vec3 uBase, uHaze; uniform vec2 uCenter; uniform float uRadius, uAspect;
  in vec2 vUv; out vec4 fragColor;
  ${NOISE_GLSL}
  void main() {
    vec2 px = gl_FragCoord.xy;
    vec2 q = (vUv - uCenter) * vec2(uAspect, 1.0);
    vec3 col = uBase;
    // a soft haze, centred a little up and to the left of the body, where the light comes from
    float hd = length((q - vec2(-0.09, 0.08)) / vec2(1.25, 1.0)) / max(uRadius, 1e-3);
    float haze = exp(-hd * hd * (uPaper > 0.5 ? 0.42 : 0.8));
    float slow = fbm(q * 2.2 + 3.0);
    col = mix(col, uHaze, haze * uHazeAmt * (0.84 + 0.32 * slow));
    if (uPaper > 0.5) {
      // sheet of paper: long soft fibres, a warm falloff toward the corners
      float fibre = fbm(vec2(px.x * 0.012, px.y * 0.05)) - 0.5;
      float tooth = vnoise(px * 0.62) - 0.5;
      col *= 1.0 + fibre * 0.02 + tooth * 0.016;
      col *= mix(1.0, 0.915, smoothstep(0.35, 1.05, length((vUv - 0.5) * vec2(1.25, 1.1))));
    } else {
      float tooth = vnoise(px * 0.7) - 0.5;
      col *= 1.0 + tooth * 0.075;
      col *= mix(1.0, 0.72, smoothstep(0.3, 1.0, length((vUv - 0.5) * vec2(1.2, 1.1))));
    }
    // the shadow it rests in
    vec2 sq = (q - vec2(0.018, -0.86 * uRadius)) / (uRadius * vec2(0.96, 0.17));
    float sh = exp(-dot(sq, sq) * 1.1);
    vec3 shadowCol = uPaper > 0.5 ? vec3(0.40, 0.335, 0.235) : vec3(0.0);
    // on paper the shadow is rubbed in by hand, along the ground
    float rub = uPaper > 0.5 ? 0.84 + 0.32 * fbm(vec2(px.x * 0.05, px.y * 0.6)) : 1.0;
    col = mix(col, shadowCol, clamp(sh * uShadow * (uPaper > 0.5 ? 0.58 : 0.72) * rub, 0.0, 1.0));
    col += (hash(px + 7.1) - 0.5) / 255.0 * 2.0;
    fragColor = vec4(col, 1.0);
  }`;

const GRAIN_FRAG = /* glsl */`
  precision highp float;
  uniform float uGrain, uPaper, uVignette;
  in vec2 vUv; out vec4 fragColor;
  ${NOISE_GLSL}
  void main() {
    vec2 px = gl_FragCoord.xy;
    float n = hash(px) * 0.6 + hash(px * 0.5 + 3.1) * 0.4 - 0.5;
    // multiply, so the grain is finest in the darks and never lifts them
    float m = 1.0 + n * uGrain * 2.0;
    fragColor = vec4(vec3(m * 0.5), 1.0);
  }`;

export async function buildAtlas(model, { size = ATLAS.size, rows = ATLAS.rows, weight = 500 } = {}) {
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
  return { texture: tex, canvas, lines, chars, rowH, font: ctx.font };
}

export class ScribbleBlob {
  constructor({ model, atlas, eye = 'bean', bg = 'graphite', seed }) {
    this.model = model;
    this.atlas = atlas;
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    const t0 = performance.now();
    this.blob = generateBlob(seed ? { seed } : {});
    const packed = packStrands(this.blob, { atlasAspect: ATLAS.rows, rows: ATLAS.rows });
    this.stats = { ...packed.stats, genMs: Math.round(performance.now() - t0) };
    this._uShared = {
      uBreath: { value: 0 }, uKey: { value: new THREE.Vector3(-0.48, 0.62, 0.62).normalize() }, uPaper: { value: 0 },
    };
    this._buildBackdrop();
    this._buildCore();
    this._buildStrands(packed);
    this._buildEyes();
    this._buildGrain();
    this.time = 0;
    this.breathPeriod = 11;
    this.look = new THREE.Vector2();
    this.lookTarget = new THREE.Vector2();
    this.setBackground(bg);
    this.setEyes(eye);
    this.blink = 0;
    this.nextBlink = 3 + Math.random() * 3;
    this.blinkStart = -10;
  }

  _buildBackdrop() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this._tri = geo;
    this.backMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: BACK_VERT, fragmentShader: BACK_FRAG, depthTest: false, depthWrite: false,
      uniforms: { uPaper: this._uShared.uPaper, uBase: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() }, uHazeAmt: { value: 0.5 }, uCenter: { value: new THREE.Vector2(0.6, 0.5) }, uRadius: { value: 0.33 }, uAspect: { value: 1.6 }, uShadow: { value: 1 } },
    });
    const m = new THREE.Mesh(geo, this.backMat);
    m.frustumCulled = false; m.renderOrder = -10;
    this.scene.add(m);
  }

  _buildCore() {
    const c = coreMesh(0.915);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(c.position, 3));
    geo.setIndex(new THREE.BufferAttribute(c.index, 1));
    this.coreMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: CORE_VERT, fragmentShader: CORE_FRAG,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, transparent: false,
      uniforms: { uBreath: this._uShared.uBreath, uKey: this._uShared.uKey, uPaper: this._uShared.uPaper, uPaperCol: { value: new THREE.Color() }, uCoreBlur: { value: 0 } },
    });
    const m = new THREE.Mesh(geo, this.coreMat);
    m.renderOrder = 0; m.frustumCulled = false;
    this.root.add(m);
    this.core = m;
    this.stats.coreTriangles = c.index.length / 3;
  }

  _buildStrands(p) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p.position, 3));
    geo.setAttribute('aT', new THREE.BufferAttribute(p.tangent, 3));
    geo.setAttribute('aA', new THREE.BufferAttribute(p.a, 4));
    geo.setAttribute('aB', new THREE.BufferAttribute(p.b, 4));
    geo.setIndex(new THREE.BufferAttribute(p.index, 1));
    this.strandMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: STRAND_VERT, fragmentShader: STRAND_FRAG,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: {
        tAtlas: { value: this.atlas.texture }, uRows: { value: ATLAS.rows }, uRowTex: { value: this.atlas.rowH },
        uViewport: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uFocus: { value: 6 }, uAperture: { value: 0 }, uMaxCoc: { value: 26 },
        uMassSolid: { value: 1 }, uMinPx: { value: 1.3 }, uFarGain: { value: 3.6 }, uDrift: { value: 0.0055 }, uFaceLift: { value: 0.1 },
        uEyeL: { value: new THREE.Vector4() }, uEyeR: { value: new THREE.Vector4() }, uEyeZ: { value: new THREE.Vector2() }, uBlink: { value: 0 },
        uBreath: this._uShared.uBreath, uKey: this._uShared.uKey, uPaper: this._uShared.uPaper,
      },
    });
    this.coreMat.uniforms.uEyeL = this.strandMat.uniforms.uEyeL;
    this.coreMat.uniforms.uEyeR = this.strandMat.uniforms.uEyeR;
    this.coreMat.uniforms.uEyeZ = this.strandMat.uniforms.uEyeZ;
    this.coreMat.uniforms.uBlink = this.strandMat.uniforms.uBlink;
    const m = new THREE.Mesh(geo, this.strandMat);
    m.renderOrder = 5; m.frustumCulled = false;
    this.root.add(m);
    this.strands = m;
  }

  _buildEyes() {
    const dome = new THREE.SphereGeometry(1, 36, 28);
    const mat = (rimPass) => new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: EYE_VERT, fragmentShader: EYE_FRAG,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, transparent: false,
      uniforms: { uBlink: { value: 0 }, uLid: { value: 0 }, uRimPass: { value: rimPass }, uPaper: this._uShared.uPaper, uLook: { value: new THREE.Vector2() } },
    });
    this.eyeMat = mat(0);
    this.rimMat = mat(1);
    const make = () => {
      const g = new THREE.Group();
      const rim = new THREE.Mesh(dome, this.rimMat);
      const pupil = new THREE.Mesh(dome, this.eyeMat);
      rim.renderOrder = 2; pupil.renderOrder = 3;
      rim.frustumCulled = pupil.frustumCulled = false;
      g.add(rim); g.add(pupil);
      g.userData = { rim, pupil };
      this.root.add(g);
      return g;
    };
    this.eyeL = make();
    this.eyeR = make();
  }

  _buildGrain() {
    this.grainMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: BACK_VERT, fragmentShader: GRAIN_FRAG, depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor,
      uniforms: { uGrain: { value: 0.05 }, uPaper: this._uShared.uPaper, uVignette: { value: 0 } },
    });
    const m = new THREE.Mesh(this._tri, this.grainMat);
    m.frustumCulled = false; m.renderOrder = 100;
    this.scene.add(m);
  }

  setBackground(name) {
    const b = BACKGROUNDS[name] || BACKGROUNDS.graphite;
    this.bgName = name;
    this._uShared.uPaper.value = b.paper;
    // colours are authored in display space and written straight out
    const c = (hex, v) => v.setStyle(hex, THREE.LinearSRGBColorSpace);
    c(b.base, this.backMat.uniforms.uBase.value);
    c(b.haze, this.backMat.uniforms.uHaze.value);
    c(b.base, this.coreMat.uniforms.uPaperCol.value);
    this.backMat.uniforms.uHazeAmt.value = b.hazeAmt;
    this.grainMat.uniforms.uGrain.value = b.grain;
    this.strandMat.uniforms.uFaceLift.value = b.paper ? 0.28 : 0.16;
  }

  setEyes(name) {
    const e = EYES[name] || EYES.bean;
    this.eyeName = name;
    this.eyeCfg = e;
    this.eyeMat.uniforms.uLid.value = e.lid;
    this.rimMat.uniforms.uLid.value = e.lid;
    for (const [g, sign] of [[this.eyeL, -1], [this.eyeR, 1]]) {
      g.userData.rim.visible = e.rim > 0;
      g.userData.sign = sign;
    }
    this._placeEyes(0);
  }

  _placeEyes(breath) {
    const e = this.eyeCfg;
    const shift = this.look;
    for (const [g, sign, uni] of [[this.eyeL, -1, this.strandMat.uniforms.uEyeL], [this.eyeR, 1, this.strandMat.uniforms.uEyeR]]) {
      const x = sign * e.x + shift.x * 0.035, y = e.y + shift.y * 0.022;
      const dir = [x, y, Math.sqrt(Math.max(0.02, 1 - x * x - y * y))];
      // solve for the surface point whose xy matches the eye's placement, a few steps is plenty
      let d = dir.slice();
      let p = surfacePoint(d);
      for (let i = 0; i < 5; i++) {
        d = [d[0] + (x - p[0]) * 0.8, d[1] + (y - p[1]) * 0.8, d[2]];
        p = surfacePoint(d);
      }
      const n = surfaceNormal(d);
      const b = breatheJS(p, breath);
      const inset = Math.min(e.rx, e.ry) * 0.12;
      g.position.set(b[0] - n[0] * inset, b[1] - n[1] * inset, b[2] - n[2] * inset);
      // face halfway between the surface normal and straight ahead, so the two eyes look together
      const f = new THREE.Vector3(n[0] * 0.62, n[1] * 0.62, n[2] * 0.62 + 0.38).normalize();
      const up = new THREE.Vector3(sign * e.tilt, 1, 0);
      const m = new THREE.Matrix4().lookAt(f, new THREE.Vector3(), up);
      g.quaternion.setFromRotationMatrix(m);
      const depth = Math.min(e.rx, e.ry) * 0.3;
      const { rim, pupil } = g.userData;
      if (e.rim > 0) {
        // the pupil fills most of the eye and slides inside the rim as it looks
        const fill = 1 - e.rim;
        rim.scale.set(e.rx, e.ry, depth * 0.92);
        pupil.scale.set(e.rx * fill, e.ry * fill, depth);
        pupil.position.set(shift.x * e.rx * e.rim * 0.9, shift.y * e.ry * e.rim * 0.9 - e.ry * e.rim * 0.2, depth * 0.08);
      } else {
        pupil.scale.set(e.rx, e.ry, depth);
        pupil.position.set(0, 0, 0);
      }
      uni.value.set(p[0], p[1], e.rx, e.ry);
      if (sign < 0) this.strandMat.uniforms.uEyeZ.value.x = p[2]; else this.strandMat.uniforms.uEyeZ.value.y = p[2];
    }
  }

  // waveform: slow sine with a touch of hold at the top and bottom, as a resting breath has
  breathAt(t) {
    const s = Math.sin((t / this.breathPeriod) * Math.PI * 2);
    return Math.sign(s) * Math.pow(Math.abs(s), 0.85);
  }

  update(dt, { frozen = false } = {}) {
    if (!frozen) this.time += dt;
    const t = this.time;
    const b = this.breathAt(t);
    this._uShared.uBreath.value = b;
    this.strandMat.uniforms.uTime.value = t;
    // lazy gaze: nearly a second to catch up, never a snap
    const k = 1 - Math.exp(-dt / 0.9);
    this.look.lerp(this.lookTarget, frozen ? 1 : k);
    this.root.rotation.y = this.look.x * 0.075 + Math.sin(t * 0.17) * 0.012;
    this.root.rotation.x = -this.look.y * 0.04;
    this.root.rotation.z = Math.sin(t * 0.13 + 1.0) * 0.008;
    this.eyeMat.uniforms.uLook.value.copy(this.look);
    this.rimMat.uniforms.uLook.value.copy(this.look);
    // slow blinks
    if (!frozen) {
      if (t > this.nextBlink) { this.blinkStart = t; this.nextBlink = t + 6 + Math.random() * 6; }
      const e = t - this.blinkStart;
      const close = 0.34, hold = 0.09, open = 0.62;
      let v = 0;
      if (e < close) { const u = e / close; v = u * u * (3 - 2 * u); }
      else if (e < close + hold) v = 1;
      else if (e < close + hold + open) { const u = (e - close - hold) / open; v = 1 - u * u * (3 - 2 * u); }
      this.blink = v;
    }
    this.eyeMat.uniforms.uBlink.value = this.blink;
    this.rimMat.uniforms.uBlink.value = this.blink;
    this.strandMat.uniforms.uBlink.value = this.blink;
    this._placeEyes(b);
  }

  setCameraUniforms(camera, renderer, { aperture = 0, focus = null } = {}) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const u = this.strandMat.uniforms;
    u.uViewport.value.copy(size);
    u.uAperture.value = aperture;
    u.uFocus.value = focus ?? camera.position.distanceTo(this.root.position);
    u.uMinPx.value = 1.05 * renderer.getPixelRatio();
    u.uKey.value.set(-0.48, 0.62, 0.62).normalize().transformDirection(camera.matrixWorldInverse);
    // project the body to the screen for the haze and shadow behind it
    const c = new THREE.Vector3(0, 0, 0).project(camera);
    const top = new THREE.Vector3(0, 1, 0).project(camera);
    const bu = this.backMat.uniforms;
    bu.uCenter.value.set(c.x * 0.5 + 0.5, c.y * 0.5 + 0.5);
    const rad = Math.abs(top.y - c.y) * 0.5;
    bu.uRadius.value = rad;
    bu.uAspect.value = size.x / size.y;
    bu.uShadow.value = THREE.MathUtils.smoothstep(camera.position.length(), 1.6, 3.2);
    // up close the core is behind the focal plane: its hatching melts into plain tone
    const dist = camera.position.length();
    this.coreMat.uniforms.uCoreBlur.value = 1 - THREE.MathUtils.smoothstep(dist, 1.8, 2.8);
    u.uMassSolid.value = THREE.MathUtils.smoothstep(dist, 1.8, 3.2);
  }
}

export { surfacePoint, surfaceNormal, shellRadius };
