// One scene per project, in the same pencil as the top of the page. The tools/capture.html page renders
// each to a transparent image, so it sits on the sheet like a drawing in a sketchbook.
import { makeRng, surfacePoint, unit } from './blob-geometry.js';
import { curve, knot, sketchRect, sketchLine, sag, shade, castShadow, noteProp } from './blob-props.js';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const onBody = (c, s, d, shell = 1.02) => { const p = surfacePoint(d, shell); return [c[0] + p[0] * s, c[1] + p[1] * s, c[2] + p[2] * s]; };
const U = [1, 0, 0], V = [0, 1, 0];

// a thread drawn from a body to a point, leaving where the body faces it
const threadFrom = (c, s, to, r, o = {}) => {
  const d = unit([to[0] - c[0], to[1] - c[1], (to[2] - c[2]) * 0.6 + 0.55]);
  return sag(onBody(c, s, d), to, r, o);
};

// a filled shape: its outline, and a depth-only patch so whatever is behind it stays behind it
const hide = (fills, center, w, h, a = 0) => fills.push({ c: center, w, h, a });
const ink = (a, b, r, o = {}) => sketchLine(a, b, r, { passes: 3, width: 0.0064, tone: 0.04, jitter: 0.007, ...o });
const outline = (c, w, h, r, o = {}) => sketchRect(c, U, V, w, h, r, { passes: 3, width: 0.0064, tone: 0.04, jitter: 0.006, overshoot: 0.016, ...o });

function mcp() {
  const r = makeRng(101);
  const c = [0, -0.06, 0], s = 1.14;
  const back = [], front = [], fills = [];
  const spots = [[-2.06, 1.04], [-2.2, 0.02], [-2.02, -1.0], [2.06, 1.04], [2.2, 0.02], [2.02, -1.0]];
  spots.forEach(([x, y], i) => {
    const center = [x, y, 0.2], w = 0.62, h = 0.62;
    back.push(...shade(center, w * 0.96, h * 0.96, r, { density: 1.5, tone: 0.1, angle: 0.95 + i * 0.09 }));
    back.push(...outline(center, w, h, r));
    // a different little scribble on each: six different systems, and no logos
    const k = knot([x - 0.02, y + 0.01, 0.2], 0.1 + (i % 3) * 0.02, r, { count: 7 + i, width: 0.0052, tone: 0.03, delaySpread: 0 });
    back.push(...k);
    back.push(...castShadow(x + 0.05, y - h / 2 - 0.05, 0.2, w * 0.9, r));
    const edge = [x + (x < 0 ? w / 2 : -w / 2), y, 0.2];
    front.push(threadFrom(c, s, edge, r, { drop: 0.1 + r() * 0.1, width: 0.0078, tone: 0.04 }));
    front.push(threadFrom(c, s, [edge[0], edge[1] + 0.015, 0.2], r, { drop: 0.12 + r() * 0.1, width: 0.0034, tone: 0.3 }));
  });
  return { blob: { c, s }, back, front, fills, pose: { dist: 10.4, target: [0, -0.02, 0] } };
}

function backOffice() {
  const r = makeRng(103);
  const c = [-0.72, -0.2, 0], s = 1.08;
  const back = [], front = [], fills = [];
  // three stacked trays of papers
  [[1.72, 1.08], [1.72, 0.46], [1.72, -0.16]].forEach(([x, y], i) => {
    const center = [x, y, 0], w = 1.3, h = 0.3;
    // papers sticking up out of the tray
    for (let k = 0; k < 5 - i; k++) {
      const yy = y + 0.17 + k * 0.03, off = (r() - 0.5) * 0.06;
      back.push(...sketchRect([x + off, yy, 0.02], [1, (r() - 0.5) * 0.03, 0], V, w * 0.84, 0.03, r, { passes: 2, width: 0.0044, tone: 0.09 + r() * 0.1, overshoot: 0.008, jitter: 0.004 }));
    }
    back.push(...shade(center, w, h, r, { density: 2.6, tone: 0.06, len: 0.14, angle: 1.2 }));
    back.push(...shade([x + 0.2, y - 0.04, 0], w * 0.62, h * 0.7, r, { density: 2.2, tone: 0.03, len: 0.11, angle: 2.0 }));
    back.push(...outline(center, w, h, r));
    back.push(...castShadow(x + 0.1, y - 0.2, 0, w, r));
  });
  // paper stacks on the desk at the left
  [[-2.12, -1.18, 12, 0.72]].forEach(([x, y, n, w]) => {
    for (let k = 0; k < n; k++) {
      const yy = y + k * 0.042, off = (r() - 0.5) * 0.07;
      back.push(...sketchRect([x + off, yy, 0], [1, (r() - 0.5) * 0.03, 0], V, w, 0.036, r, { passes: 2, width: 0.0046, tone: 0.06 + r() * 0.1, overshoot: 0.008, jitter: 0.004 }));
    }
    back.push(...shade([x + 0.1, y + (n * 0.042) / 2 - 0.02, 0], w * 0.76, n * 0.042, r, { density: 1.4, tone: 0.1, len: 0.1, angle: 1.45 }));
    back.push(...castShadow(x + 0.08, y - 0.06, 0, w, r));
  });
  // the sealed envelope, in front, held by a gold thread
  const e = [0.9, -1.12, 1.2], ew = 0.86, eh = 0.56;
  hide(fills, [e[0], e[1], e[2] - 0.01], ew, eh, -0.06);
  front.push(...shade([e[0], e[1] - 0.05, e[2]], ew * 0.92, eh * 0.8, r, { density: 1.2, tone: 0.14, len: 0.16, angle: 1.1 }));
  front.push(...sketchRect(e, [1, -0.06, 0], [0.06, 1, 0], ew, eh, r, { passes: 3, tone: 0.03, width: 0.0074, jitter: 0.005 }));
  const P = (x, y) => [e[0] + x * ew * 0.5 + y * 0.016, e[1] + y * eh * 0.5 - x * 0.026, e[2]];
  front.push(...ink(P(-1, 1), P(0, -0.1), r, { width: 0.0062 }), ...ink(P(1, 1), P(0, -0.1), r, { width: 0.0062 }));
  const seal = P(0, -0.1);
  front.push(...knot([seal[0], seal[1], seal[2] + 0.01], 0.045, r, { count: 9, width: 0.0052, gold: true, delaySpread: 0 }));
  front.push(curve([seal, add(seal, [0.1, 0.5, 0.2]), [1.78, 1.5, 1.4], [2.76, 2.5, 2.4]], r, { width: 0.0098, gold: true, taper: 0.01, ds: 0.02, wob: 0.003, sh: 1.2 }));
  front[front.length - 1].points.forEach((q) => { q.p = 1; });
  back.push(...castShadow(e[0] + 0.06, e[1] - 0.33, 1.2, ew, r));
  return { blob: { c, s }, back, front, fills, pose: { dist: 10.2, target: [0, 0, 0] } };
}

function voice() {
  const r = makeRng(107);
  const c = [1.14, -0.04, 0], s = 1.14;
  const back = [], front = [], fills = [];
  // a handset: one contour, a bowed handle and two heads, shaded with fast strokes inside it
  const hc = [-1.6, -0.3, 0.2];
  const rot = (x, y) => { const a = 0.56; return [hc[0] + x * Math.cos(a) - y * Math.sin(a), hc[1] + x * Math.sin(a) + y * Math.cos(a), hc[2]]; };
  const bow = (x) => 0.2 * (1 - (x / 0.98) * (x / 0.98));
  const upper = (x) => bow(x) + 0.075 + 0.05 * smooth(0.6, 0.92, Math.abs(x));
  const lower = (x) => { const d = Math.abs(x); const cup = smooth(0.42, 0.62, d) * (1 - smooth(0.92, 1.0, d)); return bow(x) - 0.075 - cup * 0.24; };
  const contour = [];
  for (let i = 0; i <= 44; i++) { const x = -1 + (i / 44) * 2; contour.push(rot(x, upper(x))); }
  for (let i = 44; i >= 0; i--) { const x = -1 + (i / 44) * 2; contour.push(rot(x, lower(x))); }
  contour.push(contour[0]);
  for (let k = 0; k < 3; k++) back.push(curve(contour.map((p) => [p[0] + (r() - 0.5) * 0.002, p[1] + (r() - 0.5) * 0.002, p[2]]), r, { width: 0.0068, tone: 0.03, taper: 0.01, ds: 0.012, wob: 0.0028, sh: 1.06 }));
  for (let k = 0; k < 340; k++) {
    const x = -0.98 + r() * 1.96, lo = lower(x), up = upper(x);
    const fy = r(), y = lo + (up - lo) * fy;
    if (r() > 0.45 + 0.55 * (1 - fy)) continue;
    const L = 0.04 + r() * 0.1;
    const y2 = Math.min(up - 0.004, Math.max(lo + 0.004, y + L));
    const x2 = Math.max(-0.99, Math.min(0.99, x + (y2 - y) * 0.55));
    const A = rot(x, y), B = rot(x2, Math.min(y2, upper(x2) - 0.004));
    back.push(curve([A, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, A[2]], B], r, { width: 0.0046 + r() * 0.003, tone: 0.02 + r() * 0.12, taper: 0.14, ds: 0.05, wob: 0.0012, sh: 1.05, pressure: 0.7 + r() * 0.3 }));
  }
  // the coiled cord
  const cord = [];
  for (let i = 0; i <= 200; i++) {
    const f = i / 200, ph = f * 62;
    const base = [lerp(-2.4, -1.22, f), -0.92 - 0.36 * Math.sin(f * Math.PI) - 0.14 * f * f, 0.2];
    cord.push([base[0] + Math.cos(ph) * 0.05, base[1] + Math.sin(ph) * 0.08, base[2]]);
  }
  back.push(curve(cord, r, { width: 0.0058, tone: 0.04, taper: 0.03, ds: 0.012, wob: 0.0012, keepAll: true }));
  back.push(...castShadow(-1.72, -1.5, 0.2, 1.3, r, { count: 22 }));
  // the voice: strands of digits shaped by the sound, running from the handset to the listener
  const src = rot(0.98, 0.02);
  const envelope = (f) => 0.08 + 0.36 * Math.pow(Math.sin(f * Math.PI * 2.1 + 0.2) * 0.5 + 0.5, 1.4) * Math.sin(f * Math.PI);
  [[1, 0.0, 0.052, 0.04], [0.58, 1.5, 0.03, 0.14], [0.3, 2.8, 0.02, 0.3]].forEach(([amp, ph0, width, tone], k) => {
    const pts = [];
    const end = onBody(c, s, unit([-0.92, 0.02 + k * 0.05, 0.42]));
    for (let i = 0; i <= 110; i++) {
      const f = i / 110;
      const x = lerp(src[0], end[0], f), base = lerp(src[1], end[1], f);
      pts.push([x, base + Math.sin(f * 15 + ph0) * envelope(f) * amp * smooth(0, 0.08, f) * smooth(1, 0.84, f), 0.5]);
    }
    front.push(curve(pts, r, { width, tone, taper: 0.03, ds: 0.012, wob: 0.0012, keepAll: true, sh: 1.1 + k * 0.001 }));
    front[front.length - 1].points.forEach((q) => { q.p = 1; });
  });
  return { blob: { c, s, blink: 1 }, back, front, fills, pose: { dist: 10.4, target: [-0.12, -0.14, 0] } };
}
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function gate() {
  const r = makeRng(109);
  const c = [-0.1, 0.34, -0.2], s = 1.22;
  const back = [], front = [], fills = [];
  const y0 = -1.42, y1 = -0.46, z = 1.3;
  const post = (x) => {
    const w = 0.15, h = y1 + 0.16 - y0, center = [x, (y0 + y1 + 0.16) / 2, z];
    hide(fills, [x, center[1], z - 0.02], w, h);
    front.push(...shade(center, w, h, r, { density: 3.4, tone: 0.03, len: 0.12, angle: 1.45, sh: 1.1 }));
    front.push(...outline(center, w, h, r, { width: 0.0072, sh: 1.11 }));
  };
  const picket = (x) => {
    const w = 0.15, top = y1 - 0.02 + r() * 0.05, h = top - (y0 + 0.08), center = [x, (top + y0 + 0.08) / 2, z];
    hide(fills, [x, center[1], z - 0.02], w, h);
    front.push(...shade([x + 0.015, center[1] - 0.02, z], w * 0.84, h * 0.92, r, { density: 2.2, tone: 0.08, len: 0.12, angle: 1.3, sh: 1.1 }));
    front.push(...outline(center, w, h, r, { width: 0.0062, sh: 1.11 }));
  };
  [-0.72, -0.43, -0.14, 0.15, 0.44, 0.73].forEach(picket);
  post(-1.06); post(1.06);
  // rails and a brace, in front of the pickets
  for (const y of [y0 + 0.24, y1 - 0.24]) {
    hide(fills, [0, y, z + 0.005], 1.98, 0.075);
    front.push(...shade([0, y, z + 0.01], 1.98, 0.075, r, { density: 2.6, tone: 0.08, len: 0.14, angle: 0.08, even: true, sh: 1.13 }));
    front.push(...sketchRect([0, y, z + 0.01], U, V, 1.98, 0.075, r, { passes: 2, width: 0.0062, tone: 0.04, overshoot: 0.012, jitter: 0.004, sh: 1.14 }));
  }
  // the latch is gold: it is the human's
  const lx = 0.95, ly = (y0 + y1) / 2 + 0.16;
  front.push(curve([[lx - 0.3, ly, z + 0.02], [lx - 0.1, ly + 0.018, z + 0.02], [lx + 0.11, ly, z + 0.02], [lx + 0.14, ly + 0.12, z + 0.02], [lx + 0.02, ly + 0.13, z + 0.02]], r, { width: 0.022, gold: true, taper: 0.03, ds: 0.012, wob: 0.0014, sh: 1.2 }));
  front[front.length - 1].points.forEach((q) => { q.p = 1; });
  back.push(...castShadow(0.05, y0 - 0.04, 1.3, 2.1, r, { h: 0.09, count: 44 }));
  // the draft it holds, resting on the gate
  const dc = [0.56, -0.52, 1.34], dw = 0.5, dh = 0.36, ang = -0.1;
  hide(fills, [dc[0], dc[1], z + 0.03], dw, dh, ang);
  const dcz = z + 0.04;
  const u = [Math.cos(ang), Math.sin(ang), 0], v = [-Math.sin(ang), Math.cos(ang), 0];
  front.push(...sketchRect(dc, u, v, dw, dh, r, { tone: 0.04, width: 0.0072, passes: 3, sh: 1.15, jitter: 0.004 }));
  for (let k = 0; k < 4; k++) {
    const yy = 0.1 - k * 0.066, x1 = 0.05 + r() * 0.13;
    front.push(...sketchLine([dc[0] - 0.17, dc[1] + yy + 0.017, dc[2]], [dc[0] + x1, dc[1] + yy - x1 * 0.1, dc[2]], r, { width: 0.0052, tone: 0.06, jitter: 0.003, sh: 1.15, passes: 2 }));
  }
  return { blob: { c, s }, back, front, fills, pose: { dist: 9.2, target: [0, -0.26, 0] } };
}

function router() {
  const r = makeRng(113);
  const c = [-1.5, -0.26, 0], s = 0.98;
  const back = [], front = [], fills = [];
  // the rack: many small pigeonholes, dark openings, a slip in some
  const cols = 11, rows = 6, x0 = 0.02, y0 = 1.46, cw = 0.225, ch = 0.225;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const cx = x0 + i * cw, cy = y0 - j * ch, w = cw * 0.84, h = ch * 0.84;
    back.push(...shade([cx, cy, 0], w, h, r, { density: 5.5, tone: 0.03, len: 0.09, angle: 1.3 + (r() - 0.5) * 0.3, even: true, toneVar: 0.14 }));
    back.push(...sketchRect([cx, cy, 0], U, V, w, h, r, { passes: 2, tone: 0.04, width: 0.0048, overshoot: 0.006, jitter: 0.004 }));
    if (r() < 0.4) {
      const sh = 0.06 + r() * 0.08, spot = [cx, cy - h * 0.5 + sh / 2 + 0.008, 0.01];
      hide(fills, spot, w * 0.62, sh);
      back.push(...sketchRect(spot, U, V, w * 0.62, sh, r, { passes: 2, tone: 0.06, width: 0.0042, overshoot: 0.002, jitter: 0.002, sh: 1.07 }));
    }
  }
  // the stream: notes along a soft arc from the body to the rack
  const from = onBody(c, s, unit([0.84, 0.32, 0.5]));
  const to = [x0 - 0.14, y0 - 0.48, 0.3];
  const apex = 1.2;
  const arc = (f) => [lerp(from[0], to[0], f), lerp(from[1], to[1], f) + 4 * (apex - lerp(from[1], to[1], 0.5)) * f * (1 - f), 0.5];
  const pts = []; for (let i = 0; i <= 26; i++) pts.push(arc(i / 26));
  front.push(curve(pts, r, { width: 0.0074, tone: 0.1, taper: 0.05, ds: 0.012, wob: 0.003, sh: 1.08, pressure: 0.8 }));
  [0.34, 0.6, 0.86].forEach((f) => {
    const p = arc(f), a = (f - 0.5) * -1;
    hide(fills, [p[0], p[1], 0.61], 0.22, 0.15, a);
    front.push(...sketchRect([p[0], p[1], 0.62], [Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], 0.22, 0.15, r, { passes: 3, tone: 0.03, width: 0.0058, overshoot: 0.004, jitter: 0.003, sh: 1.1 }));
    front.push(...sketchLine([p[0] - 0.06, p[1] + 0.012, 0.62], [p[0] + 0.06, p[1] + 0.012 - a * 0.12, 0.62], r, { width: 0.0038, tone: 0.1, jitter: 0.002, sh: 1.1 }));
  });
  // the tray for a person, gold at the lip because it is theirs, and one note dropping into it
  const tx = 1.14, ty = -0.92, tw = 2.34, th = 0.34;
  back.push(...shade([tx, ty, 0], tw, th, r, { density: 2.4, tone: 0.06, len: 0.14, angle: 1.2 }));
  back.push(...outline([tx, ty, 0], tw, th, r));
  back.push(...sketchLine([tx - tw / 2, ty + th / 2, 0.02], [tx + tw / 2, ty + th / 2, 0.02], r, { width: 0.0124, gold: true, jitter: 0.002, pressure: 1, sh: 1.12 }));
  back.push(...castShadow(tx + 0.1, ty - th / 2 - 0.05, 0, tw, r));
  const nx = tx + 0.3, ny = ty + 0.5, na = 0.2;
  hide(fills, [nx, ny, 0.29], 0.32, 0.22, na);
  front.push(...sketchRect([nx, ny, 0.3], [Math.cos(na), Math.sin(na), 0], [-Math.sin(na), Math.cos(na), 0], 0.32, 0.22, r, { tone: 0.03, width: 0.0068, passes: 3, jitter: 0.003, sh: 1.11 }));
  front.push(...sketchLine([nx - 0.09, ny + 0.03, 0.3], [nx + 0.09, ny + 0.06, 0.3], r, { width: 0.0042, tone: 0.1, jitter: 0.002, sh: 1.11 }));
  for (let k = 0; k < 3; k++) front.push(...sketchLine([nx - 0.08 + k * 0.08, ny + 0.36 - (k % 2) * 0.06, 0.3], [nx - 0.08 + k * 0.08, ny + 0.17, 0.3], r, { width: 0.0042, tone: 0.3, jitter: 0.002, sh: 1.08, pressure: 0.6 }));
  return { blob: { c, s }, back, front, fills, pose: { dist: 10.4, target: [-0.04, 0.04, 0] } };
}

function poster() {
  return { blob: { c: [0, 0, 0], s: 1 }, back: [], front: [], fills: [], pose: { dist: 8.2, target: [0, -0.05, 0] } };
}

export const SCENES = {
  'mcp-layer': mcp,
  'back-office': backOffice,
  'voice-agent': voice,
  'approval-gate': gate,
  'intent-router': router,
  'blob-poster': poster,
};
export { noteProp };
