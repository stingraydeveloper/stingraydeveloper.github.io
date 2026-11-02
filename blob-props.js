// Everything else that gets drawn, in the same pencil: threads, knots, the crew's links, the gold
// thread, and the props of the work scenes. Pure data, no DOM or Three; a worker packs it.
import { makeRng, noise1, smoothstep, clamp, unit, cross, surfacePoint, surfaceNormal, surfaceFrame, MACRO_DIR, scribble, decimate, limitWidth } from './blob-geometry.js';

const lerp = (a, b, t) => a + (b - a) * t;
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

// A Catmull-Rom path through the given points, with a hand's wobble and a pressure curve.
export function curve(points, r, o = {}) {
  const ds = o.ds ?? 0.012, width = o.width ?? 0.004, wob = o.wob ?? 0.003, sh = o.sh ?? 1.06;
  const P = [points[0], ...points, points[points.length - 1]];
  const raw = [];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const steps = Math.max(2, Math.ceil(len(sub(p2, p1)) / ds));
    for (let k = 0; k < steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      const c = (a, b, cc, d) => 0.5 * (2 * b + (cc - a) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (3 * b - a - 3 * cc + d) * t3);
      raw.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1]), c(p0[2], p1[2], p2[2], p3[2])]);
    }
  }
  raw.push(points[points.length - 1]);
  const n1 = noise1(r), n2 = noise1(r), n3 = noise1(r), nw = noise1(r);
  let total = 0;
  for (let i = 1; i < raw.length; i++) total += len(sub(raw[i], raw[i - 1]));
  let s = 0;
  const taper = o.taper ?? 0.12;
  const pts = raw.map((p, i) => {
    if (i) s += len(sub(p, raw[i - 1]));
    const f = s / (total || 1);
    const lift = Math.min(1, smoothstep(0, taper, f) + 0.06) * Math.min(1, smoothstep(0, taper, 1 - f) + 0.06);
    const press = clamp(0.8 + 0.34 * nw(s * 2.1 + 4), 0.3, 1.15);
    const wf = o.widthAt ? o.widthAt(f) : 1;
    return {
      x: p[0] + n1(s * 9) * wob, y: p[1] + n2(s * 9) * wob, z: p[2] + n3(s * 9) * wob,
      w: width * press * lift * wf, p: clamp((o.pressure ?? 1) * press * lift, 0, 1), sh,
    };
  });
  return { kind: 'prop', tone: o.tone ?? 0.08, gold: o.gold ? 1 : 0, row: o.row ?? Math.floor(r() * 39) + 1, u0: r(), delay: o.delay ?? 0, points: o.keepAll ? pts : limitWidth(decimate(pts, 0.05, 0.08)) };
}

// A scribbled ball: loops wound around a centre, with no surface under them.
export function knot(center, radius, r, o = {}) {
  const out = [];
  const count = o.count ?? 22;
  for (let i = 0; i < count; i++) {
    const axisA = unit([r() - 0.5, r() - 0.5, r() - 0.5]);
    const axisB = unit(cross(axisA, unit([r() - 0.5, r() - 0.5, r() - 0.5])));
    const rad = radius * (0.5 + r() * 0.6);
    const turns = 1.3 + r() * 2.4;
    const n = Math.round(turns * 34);
    const nr = noise1(r), nd = noise1(r);
    const drift = unit([r() - 0.5, r() - 0.5, r() - 0.5]);
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const f = k / n, ph = f * turns * Math.PI * 2;
      const q = rad * (0.82 + 0.3 * nr(f * 4));
      const off = add(add([0, 0, 0], axisA, Math.cos(ph) * q), axisB, Math.sin(ph) * q * (0.7 + 0.3 * nd(f * 3)));
      const p = add(add(center, off), drift, (f - 0.5) * radius * 0.5);
      const lift = Math.min(1, smoothstep(0, 0.12, f) + 0.08) * Math.min(1, smoothstep(0, 0.12, 1 - f) + 0.08);
      pts.push({ x: p[0], y: p[1], z: p[2], w: (o.width ?? 0.0034) * (0.7 + r() * 0.1) * lift, p: lift, sh: 1.08 + i * 0.0005 });
    }
    out.push({ kind: 'prop', tone: o.tone ?? (r() < 0.7 ? 0.03 + r() * 0.12 : 0.28 + r() * 0.2), gold: o.gold ? 1 : 0, row: Math.floor(r() * 39) + 1, u0: r(), delay: (o.delay ?? 0) + r() * (o.delaySpread ?? 0.2), points: limitWidth(pts) });
  }
  return out;
}

// ---------- the hero's pieces ----------

// Act 1: rows of numbers drift in from the right and join the body.
export function stream(seed = 41) {
  const r = makeRng(seed);
  const strands = [];
  for (let i = 0; i < 15; i++) {
    const d = unit([0.55 + r() * 0.5, -0.1 + r() * 0.85, 0.5 + r() * 0.5]);
    const end = surfacePoint(d, 1.02);
    const n = surfaceNormal(d);
    const start = [3.9 + r() * 1.3, -0.5 + r() * 2.6, -0.3 + r() * 1.1];
    const mid = [lerp(end[0], start[0], 0.55) + (r() - 0.5) * 0.5, lerp(end[1], start[1], 0.55) + (r() - 0.35) * 0.7, lerp(end[2], start[2], 0.55) + 0.25 * r()];
    const near = add(end, n, 0.42 + r() * 0.3);
    const wide = 0.016 + r() * 0.009;
    strands.push(curve([start, mid, near, end], r, {
      width: wide, tone: 0.2 + r() * 0.34, pressure: 0.8, delay: r() * 0.42, taper: 0.03, ds: 0.03, wob: 0.012, sh: 1.1 + i * 0.001,
      widthAt: (f) => lerp(1, 0.2, smoothstep(0.62, 1, f)),
    }));
  }
  return { strands };
}

// Act 2: where the skill arrives. In body coordinates, on the patch the macro camera reads.
export function macroLayout() {
  const { p, n, right, up } = surfaceFrame(MACRO_DIR);
  const c = add(add(add(p, n, 0.1), right, 0.055), up, 0.036);
  return { p, n, right, up, knot: c };
}
export function skillKnot(seed = 43) {
  const r = makeRng(seed);
  const { n } = macroLayout();
  return { strands: knot([0, 0, 0], 0.03, r, { count: 16, width: 0.0021, tone: 0.1, delaySpread: 0 }).map((s) => { s.delay = 0; return s; }), normal: n };
}
export function skillThreads(seed = 47) {
  const r = makeRng(seed);
  const { p, n, right, up, knot: c } = macroLayout();
  const strands = [];
  const ends = [[0.3, 0.13], [0.27, -0.04], [0.17, -0.12], [0.02, -0.13], [-0.06, 0.08], [0.08, 0.17], [0.21, 0.2]];
  ends.forEach(([ex, ey], i) => {
    const d = unit(add(add(unit(MACRO_DIR), right, ex), up, ey));
    const end = surfacePoint(d, 1.03);
    const mid = add(add(c, sub(end, c), 0.55), n, 0.02 + r() * 0.03);
    const first = add(c, sub(end, c), 0.12);
    strands.push(curve([c, first, mid, end], r, { width: 0.0064 + r() * 0.0026, tone: 0.04 + r() * 0.14, delay: i * 0.05, taper: 0.06, ds: 0.004, wob: 0.0016, sh: 1.07 + i * 0.001, keepAll: true }));
  });
  return { strands };
}

// Act 3: the crew, placed around the body's lower right, and the threads that link them.
export function crewLayout() {
  const minis = [
    { p: [1.62, -0.46, 0.5], s: 0.29 },
    { p: [2.08, 0.34, 0.12], s: 0.24 },
    { p: [1.28, 0.92, 0.26], s: 0.215 },
    { p: [0.74, -1.02, 1.0], s: 0.25 },
  ];
  const r = makeRng(53);
  minis.forEach((m) => {
    const dir = unit([m.p[0], m.p[1], m.p[2] * 0.8 + 0.35]);
    m.start = surfacePoint(dir, 1.02);
    const to = unit(sub(m.start, m.p));
    m.end = add(m.p, to, m.s * 0.88);
    const mid = add(add(m.start, sub(m.end, m.start), 0.5), [0, -0.09 - r() * 0.1, 0.06], 1);
    m.ctrl = [m.start, mid, m.end];
  });
  return minis;
}
export function crewThreads(seed = 59) {
  const r = makeRng(seed);
  const strands = [];
  crewLayout().forEach((m, i) => {
    strands.push(curve(m.ctrl, r, { width: 0.0062, tone: 0.05, delay: i * 0.12, taper: 0.03, ds: 0.012, wob: 0.003, sh: 1.1 + i * 0.001 }));
    strands.push(curve(m.ctrl.map((p) => add(p, [0.004, 0.008, 0])), r, { width: 0.0028, tone: 0.3, delay: i * 0.12, taper: 0.1, ds: 0.012, wob: 0.006, sh: 1.1 + i * 0.001 }));
  });
  return { strands };
}
export function packet(seed = 61) {
  const r = makeRng(seed);
  return { strands: knot([0, 0, 0], 0.03, r, { count: 7, width: 0.0028, tone: 0.05, delaySpread: 0 }) };
}

// Act 4: the gold thread. It winds the body and leads off toward the viewer. Its only meaning is the
// human's control. leadF says where along it the lead starts; ends says where the lead runs.
export function goldThread(seed = 67) {
  const r = makeRng(seed);
  const pts = [];
  const turns = 2.75;
  const n = 170;
  // start at the back, wind down around the body, and leave from the lower left of the front
  const avoid = (x, y) => { // lift the path off the eyes
    const dl = Math.hypot((x + 0.415) / 0.2, (y + 0.2) / 0.17), dr = Math.hypot((x - 0.415) / 0.2, (y + 0.2) / 0.17);
    return Math.min(dl, dr);
  };
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const th = Math.PI * 0.5 + f * turns * Math.PI * 2;
    const lat = lerp(0.72, -0.5, f) + 0.17 * Math.sin(th * 1.0 + 0.6);
    let d = [Math.sin(th) * Math.cos(lat), Math.sin(lat), Math.cos(th) * Math.cos(lat)];
    let p = surfacePoint(d, 1.055);
    const m = avoid(p[0], p[1]);
    if (m < 1 && p[2] > 0) { d = unit([d[0], d[1] + (p[1] > -0.2 ? 1 : -1) * (1 - m) * 0.2, d[2]]); p = surfacePoint(d, 1.055); }
    pts.push(p);
  }
  const last = pts[pts.length - 1];
  const leadA = last;
  const leadB = [-0.86, -1.32, 6.6];
  const before = pts[pts.length - 2], lt = unit(sub(last, before));
  const off = add(last, lt, 0.1);
  const mid1 = [lerp(last[0], leadB[0], 0.28) + 0.1, lerp(last[1], leadB[1], 0.28) - 0.1, lerp(last[2], leadB[2], 0.28)];
  const mid2 = [lerp(last[0], leadB[0], 0.62) + 0.06, lerp(last[1], leadB[1], 0.62) + 0.04, lerp(last[2], leadB[2], 0.62)];
  const all = [...pts, off, mid1, mid2, leadB];
  const s = curve(all, r, { width: 0.0074, gold: true, tone: 0.5, taper: 0.004, ds: 0.016, wob: 0.0022, sh: 1.2, keepAll: true });
  s.points.forEach((q) => { q.p = 1; });
  // where the lead starts, as a fraction of arc length
  let total = 0, at = 0;
  for (let i = 1; i < s.points.length; i++) {
    const a = s.points[i], b = s.points[i - 1];
    total += Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    if (at === 0 && Math.hypot(a.x - last[0], a.y - last[1], a.z - last[2]) < 0.02) at = total;
  }
  return { strands: [s], leadF: at / total, leadA, leadB };
}

// The patch of pencil it sits on: a rubbed shadow, hatched by the same hand, on a sheet tilted to us.
export function groundShadow(seed = 71, { cx = 0.12, cy = -0.885, w = 1.02, h = 0.085, tone = 0.42, count = 64 } = {}) {
  const r = makeRng(seed);
  const strands = [];
  for (let i = 0; i < count; i++) {
    const a = Math.sqrt(r());
    const th = r() * Math.PI * 2;
    const y = cy + Math.sin(th) * a * h;
    const halfSpan = w * Math.sqrt(Math.max(0.02, 1 - ((y - cy) / h) ** 2)) * (0.25 + r() * 0.32);
    const x0 = cx + Math.cos(th) * a * w * 0.55;
    const pressure = 0.28 + 0.5 * (1 - a) * (1 - a);
    strands.push(curve([[x0 - halfSpan, y + (r() - 0.5) * 0.01, 0.2], [x0, y + (r() - 0.5) * 0.015, 0.2], [x0 + halfSpan, y + (r() - 0.5) * 0.01, 0.2]], r, {
      width: 0.0024 + r() * 0.002, tone: tone + r() * 0.2, taper: 0.34, ds: 0.03, wob: 0.003, sh: 0.9 + i * 0.0002, pressure: pressure * 0.8,
    }));
  }
  return { strands };
}

// A plain sealed note for the thread to carry.
export function noteProp(seed = 73) {
  const r = makeRng(seed);
  return { strands: sketchRect([0, 0, 0], [1, 0.04, 0], [-0.04, 1, 0], 0.13, 0.09, r, { tone: 0.05, width: 0.0034, hatch: 3 }) };
}
export function sendThread(seed = 79) {
  const r = makeRng(seed);
  const a = surfacePoint([0.76, 0.28, 0.6], 1.03);
  const pts = [a, [1.36, 0.62, 0.45], [2.5, 1.26, 0.25], [4.8, 2.5, 0]];
  return { strands: [curve(pts, r, { width: 0.0052, tone: 0.05, taper: 0.03, ds: 0.02, wob: 0.004, sh: 1.1 })], pts };
}

// ---------- sketch primitives for the work scenes ----------

export function sketchLine(a, b, r, o = {}) {
  const passes = o.passes ?? 1;
  const out = [];
  const ext = o.overshoot ?? 0.018;
  for (let i = 0; i < passes; i++) {
    const d = unit(sub(b, a));
    const jit = () => [(r() - 0.5) * (o.jitter ?? 0.012), (r() - 0.5) * (o.jitter ?? 0.012), 0];
    const A = add(add(a, d, -ext * r()), jit()), B = add(add(b, d, ext * r()), jit());
    const m = add(add(A, sub(B, A), 0.5), [(r() - 0.5) * (o.bow ?? 0.012), (r() - 0.5) * (o.bow ?? 0.012), 0]);
    out.push(curve([A, m, B], r, { width: o.width ?? 0.0042, tone: o.tone ?? 0.08, gold: o.gold, taper: o.taper ?? 0.1, ds: 0.03, wob: o.wob ?? 0.0022, sh: o.sh ?? 1.06, pressure: o.pressure ?? 1, delay: o.delay ?? 0 }));
  }
  return out;
}

// A rectangle in a plane, drawn loosely with overshot corners, with optional hatching over part of it.
export function sketchRect(center, u, v, w, h, r, o = {}) {
  const U = unit(u), V = unit(v);
  const P = (x, y) => add(add(center, U, x * w * 0.5), V, y * h * 0.5);
  const out = [];
  const passes = o.passes ?? 2;
  const ln = (a, b) => sketchLine(a, b, r, { passes, width: o.width ?? 0.0042, tone: o.tone ?? 0.07, gold: o.gold, jitter: o.jitter ?? 0.008, sh: o.sh, overshoot: o.overshoot ?? 0.012 });
  out.push(...ln(P(-1, 1), P(1, 1)), ...ln(P(1, 1), P(1, -1)), ...ln(P(1, -1), P(-1, -1)), ...ln(P(-1, -1), P(-1, 1)));
  const hatch = o.hatch ?? 0;
  if (hatch > 0) {
    const n = Math.round(hatch * (w + h) * 12);
    const ax = o.hatchFrom ?? -1, bx = o.hatchTo ?? 1;
    for (let i = 0; i < n; i++) {
      const t = (i + r()) / n;
      const x = lerp(ax, bx, t), span = 0.82 + r() * 0.16;
      const a = P(x - 0.08, -span), b = P(x + 0.08, span);
      out.push(curve([a, add(add(a, sub(b, a), 0.5), [(r() - 0.5) * 0.008, 0, 0]), b], r, { width: 0.0026 + r() * 0.0012, tone: o.hatchTone ?? 0.14 + r() * 0.2, taper: 0.1, ds: 0.03, wob: 0.0016, sh: (o.sh ?? 1.06) - 0.001, pressure: 0.6 + r() * 0.4 }));
    }
  }
  return out;
}

// A shaded box: the front, a top face and a side face, each with its own hatch.
export function sketchBox(center, w, h, d, r, o = {}) {
  const hx = w / 2, hy = h / 2, dx = d * 0.5, dy = d * 0.32;
  const out = [];
  out.push(...sketchRect(center, [1, 0, 0], [0, 1, 0], w, h, r, { hatch: o.hatch ?? 0.5, hatchTone: o.hatchTone ?? 0.3, tone: o.tone, sh: o.sh, width: o.width }));
  const c = center;
  const tl = [c[0] - hx, c[1] + hy, c[2]], tr = [c[0] + hx, c[1] + hy, c[2]], br = [c[0] + hx, c[1] - hy, c[2]];
  const back = [dx, dy, 0];
  const L = (a, b) => sketchLine(a, b, r, { passes: 2, width: o.width ?? 0.0042, tone: o.tone ?? 0.07, sh: o.sh, overshoot: 0.01, jitter: 0.006 });
  out.push(...L(tl, add(tl, back)), ...L(tr, add(tr, back)), ...L(br, add(br, back)), ...L(add(tl, back), add(tr, back)), ...L(add(tr, back), add(br, back)));
  // side face in shadow
  const n = Math.round(d * 34);
  for (let i = 0; i < n; i++) {
    const t = (i + r()) / n;
    const a = add(tr, back, t), b = add(br, back, t);
    out.push(curve([a, add(add(a, sub(b, a), 0.5), [(r() - 0.5) * 0.006, 0, 0]), b], r, { width: 0.0028, tone: 0.1 + r() * 0.14, taper: 0.08, ds: 0.03, wob: 0.0014, sh: (o.sh ?? 1.06) - 0.002, pressure: 0.8 }));
  }
  return out;
}

// Fast diagonal strokes filling a rectangle, heavier toward its lower right: tone made of marks.
export function shade(center, w, h, r, o = {}) {
  const out = [];
  const angle = o.angle ?? 1.05, dens = o.density ?? 1, sh = o.sh ?? 1.055;
  const n = Math.round(dens * w * h * 520);
  const L = o.len ?? 0.22;
  for (let i = 0; i < n; i++) {
    let x = r() - 0.5, y = r() - 0.5;
    const bias = o.even ? 1 : 0.2 + 0.8 * Math.min(1, (x + 0.5) * 0.9 + (0.5 - y) * 0.9);
    if (r() > bias) continue;
    x *= w; y *= h;
    const a = angle + (r() - 0.5) * 0.15;
    let dx = Math.cos(a) * L * (0.5 + r()), dy = Math.sin(a) * L * (0.5 + r());
    // clip the stroke to the rectangle
    const k = Math.min(1, ((w / 2) - Math.abs(x)) / Math.max(Math.abs(dx / 2), 1e-4), ((h / 2) - Math.abs(y)) / Math.max(Math.abs(dy / 2), 1e-4));
    if (k < 0.15) continue;
    dx *= k; dy *= k;
    const a0 = [center[0] + x - dx / 2, center[1] + y - dy / 2, center[2]], b0 = [center[0] + x + dx / 2, center[1] + y + dy / 2, center[2]];
    out.push(curve([a0, [(a0[0] + b0[0]) / 2 + (r() - 0.5) * 0.008, (a0[1] + b0[1]) / 2 + (r() - 0.5) * 0.008, center[2]], b0], r, {
      width: (o.width ?? 0.0048) * (0.6 + r() * 0.7), tone: (o.tone ?? 0.1) + r() * (o.toneVar ?? 0.26), taper: 0.16, ds: 0.05, wob: 0.0014, sh, pressure: 0.65 + r() * 0.35,
    }));
  }
  return out;
}

// A soft pencil shadow under something standing on the sheet.
export function castShadow(x, y, z, w, r, o = {}) {
  const out = [];
  const h = o.h ?? 0.05;
  for (let i = 0; i < (o.count ?? Math.round(w * 26)); i++) {
    const yy = y + (r() - 0.5) * h, span = w * (0.2 + r() * 0.34), x0 = x + (r() - 0.5) * w * 0.55;
    out.push(curve([[x0 - span, yy, z], [x0, yy + (r() - 0.5) * 0.006, z], [x0 + span, yy, z]], r, { width: 0.0048 + r() * 0.003, tone: 0.34 + r() * 0.2, taper: 0.34, ds: 0.05, wob: 0.002, sh: 1.0, pressure: 0.4 + r() * 0.3 }));
  }
  return out;
}

// A thread between two points that sags a little.
export function sag(a, b, r, o = {}) {
  const m = add(add(a, sub(b, a), 0.5), [(o.x ?? 0), -(o.drop ?? 0.14), o.z ?? 0.03]);
  return curve([a, m, b], r, { width: o.width ?? 0.0044, tone: o.tone ?? 0.06, gold: o.gold, taper: o.taper ?? 0.04, ds: 0.016, wob: o.wob ?? 0.0028, sh: o.sh ?? 1.08, delay: o.delay ?? 0 });
}

// Anything the worker can be asked for, by name.
export const RECIPES = { stream, skillKnot, skillThreads, crewThreads, packet, goldThread, groundShadow, noteProp, sendThread };
