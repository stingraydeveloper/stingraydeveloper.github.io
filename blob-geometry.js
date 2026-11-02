// The blob's geometry: seeded pencil-scribble strands over a soft gumdrop surface.
// Isomorphic on purpose (no DOM, no Three): the browser packs it for the GPU, and a Node script
// exports the same data for Blender, so stills and the live model are one object.

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 1D value noise in -1..1, one independent curve per call
function noise1(r) {
  const n = 128, table = new Float32Array(n);
  for (let i = 0; i < n; i++) table[i] = r() * 2 - 1;
  return (x) => {
    const f = Math.floor(x), t = x - f, u = t * t * (3 - 2 * t);
    const i = ((f % n) + n) % n;
    return table[i] * (1 - u) + table[(i + 1) % n] * u;
  };
}

// 3D value noise in -1..1, fixed table: the surface must be the same in every process
const N3 = (() => {
  const r = makeRng(7331), size = 32, t = new Float32Array(size * size * size);
  for (let i = 0; i < t.length; i++) t[i] = r() * 2 - 1;
  return { t, size };
})();
function noise3(x, y, z) {
  const { t, size: s } = N3;
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  const ax = x - fx, ay = y - fy, az = z - fz;
  const ux = ax * ax * (3 - 2 * ax), uy = ay * ay * (3 - 2 * ay), uz = az * az * (3 - 2 * az);
  const at = (i, j, k) => t[(((i % s) + s) % s) + ((((j % s) + s) % s) * s) + ((((k % s) + s) % s) * s * s)];
  const lerp = (a, b, u) => a + (b - a) * u;
  return lerp(
    lerp(lerp(at(fx, fy, fz), at(fx + 1, fy, fz), ux), lerp(at(fx, fy + 1, fz), at(fx + 1, fy + 1, fz), ux), uy),
    lerp(lerp(at(fx, fy, fz + 1), at(fx + 1, fy, fz + 1), ux), lerp(at(fx, fy + 1, fz + 1), at(fx + 1, fy + 1, fz + 1), ux), uy),
    uz,
  );
}

// The soft body. Star-shaped around the origin: radius along a unit direction.
// Wider than tall, widest in the lower third, flattened underneath, a little lumpy, like a gumdrop.
export function shellRadius(x, y, z) {
  const h = Math.hypot(x, z);
  const low = smoothstep(0.35, -0.7, y);
  const a = 1.02 * (1 + 0.1 * low);
  const b = y > 0 ? 0.98 : 0.78;
  const p = 2 + 0.8 * low;
  const base = Math.pow(Math.pow(h / a, p) + Math.pow(Math.abs(y) / b, p), -1 / p);
  const lump = noise3(x * 1.6 + 11.3, y * 1.6 + 4.7, z * 1.6 + 8.1) * 0.75 + noise3(x * 3.3 + 2.1, y * 3.3 + 9.9, z * 3.3 + 1.2) * 0.25;
  return base * (1 + 0.035 * lump);
}

export function surfacePoint(dir, shell = 1) {
  const d = unit(dir), r = shellRadius(d[0], d[1], d[2]) * shell;
  return [d[0] * r, d[1] * r, d[2] * r];
}

export function surfaceNormal(dir) {
  const d = unit(dir), e = 0.01;
  const t = unit(Math.abs(d[1]) < 0.9 ? cross(d, [0, 1, 0]) : cross(d, [1, 0, 0]));
  const b = cross(d, t);
  const P = (v) => surfacePoint(v);
  const p1 = P([d[0] + t[0] * e, d[1] + t[1] * e, d[2] + t[2] * e]), p0 = P([d[0] - t[0] * e, d[1] - t[1] * e, d[2] - t[2] * e]);
  const q1 = P([d[0] + b[0] * e, d[1] + b[1] * e, d[2] + b[2] * e]), q0 = P([d[0] - b[0] * e, d[1] - b[1] * e, d[2] - b[2] * e]);
  const n = unit(cross([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]]));
  return dot(n, d) < 0 ? [-n[0], -n[1], -n[2]] : n;
}

function randomDir(r) {
  const y = r() * 2 - 1, a = r() * TAU, s = Math.sqrt(1 - y * y);
  return [s * Math.cos(a), y, s * Math.sin(a)];
}
function tangentAt(c, r) {
  const d = randomDir(r), k = dot(d, c);
  return unit([d[0] - c[0] * k, d[1] - c[1] * k, d[2] - c[2] * k]);
}
// the hand's angle changes slowly over the form: neighbouring strokes share a direction, as in a drawing
const handAngle = (d) => noise3(d[0] * 1.05 + 21, d[1] * 1.05 + 5, d[2] * 1.05 + 13) * Math.PI * 1.35;

// A scribble: an ellipse the hand keeps circling while its centre wanders. The ellipse opens and
// closes, turns, sometimes collapses to a back-and-forth hatch, and now and then the hand reverses.
function scribble(r, o) {
  const nA = noise1(r), nR = noise1(r), nPsi = noise1(r), nW = noise1(r), nS = noise1(r), nD = noise1(r), nV = noise1(r), nO = noise1(r);
  const t1 = noise1(r), t2 = noise1(r), t3 = noise1(r), t4 = noise1(r);
  const pts = [];
  let c = unit(o.center), v = tangentAt(c, r);
  let phi = r() * TAU, dir = r() < 0.5 ? 1 : -1, omega = dir;
  let nextFlip = o.flip > 0 ? o.flip * (0.5 + r()) : Infinity;
  const ref = o.axis || [0.31, 0.92, 0.2];
  const psi0 = o.psi ?? handAngle(c) + (r() - 0.5) * 0.7;
  if (o.ratio < 0.15) {
    // a hatch steps sideways across its own sweep
    const kr0 = dot(ref, c), e0 = unit([ref[0] - c[0] * kr0, ref[1] - c[1] * kr0, ref[2] - c[2] * kr0]), f0 = cross(c, e0);
    const cp0 = Math.cos(psi0), sp0 = Math.sin(psi0);
    v = unit([-e0[0] * sp0 + f0[0] * cp0, -e0[1] * sp0 + f0[1] * cp0, -e0[2] * sp0 + f0[2] * cp0]);
  }
  const ds = o.ds;
  let s = 0;
  while (s < o.length) {
    const A = o.A * (0.72 + 0.5 * nA(s / (o.A * 7) + 3));
    const B = A * clamp(o.ratio * (0.75 + 0.7 * nR(s / (o.A * 9) + 7)), 0.025, 1.1);
    const psi = psi0 + (o.ratio < 0.15 ? 0.25 : 0.9) * nPsi(s / (o.A * 16) + 11);
    // the sweep's direction is held in the world, not the wander: that is what keeps a patch coherent
    const kr = dot(ref, c);
    const e1 = unit([ref[0] - c[0] * kr, ref[1] - c[1] * kr, ref[2] - c[2] * kr]), e2 = cross(c, e1);
    const cp = Math.cos(psi), sp = Math.sin(psi);
    const a1 = [e1[0] * cp + e2[0] * sp, e1[1] * cp + e2[1] * sp, e1[2] * cp + e2[2] * sp];
    const a2 = [-e1[0] * sp + e2[0] * cp, -e1[1] * sp + e2[1] * cp, -e1[2] * sp + e2[2] * cp];
    const ca = Math.cos(phi) * A, cb = Math.sin(phi) * B;
    let off = [a1[0] * ca + a2[0] * cb, a1[1] * ca + a2[1] * cb, a1[2] * ca + a2[2] * cb];
    const tremA = 0.0028, tremB = 0.0009;
    off = [
      off[0] + t1(s * 13) * tremA + t3(s * 46) * tremB,
      off[1] + t2(s * 13) * tremA + t4(s * 46) * tremB,
      off[2] + t1(s * 13 + 40) * tremA + t3(s * 46 + 40) * tremB,
    ];
    const ol = Math.hypot(off[0], off[1], off[2]) || 1e-5;
    const co = Math.cos(ol), so = Math.sin(ol) / ol;
    const d = unit([c[0] * co + off[0] * so, c[1] * co + off[1] * so, c[2] * co + off[2] * so]);
    // the hand leaves the form sometimes, on the wide part of a loop, which roughens the silhouette
    const out = o.over ? o.over * smoothstep(0.42, 0.85, nO(s * 0.55 + 5)) * smoothstep(0.55, 1, Math.abs(Math.cos(phi))) * smoothstep(-0.7, -0.25, d[1]) : 0;
    const shell = o.shell + o.shellVar * nS(s * 1.3 + 2) + out;
    const rad = shellRadius(d[0], d[1], d[2]) * shell;
    // pressure: slow swell, tapered lift at both ends
    const press = clamp(0.62 + 0.62 * nW(s * 1.5 + 9), 0.25, 1.25);
    const lift = Math.min(1, smoothstep(0, o.taper, s) + 0.08) * Math.min(1, smoothstep(0, o.taper, o.length - s) + 0.08);
    pts.push({ x: d[0] * rad, y: d[1] * rad, z: d[2] * rad, w: o.width * press * lift, p: clamp(press * lift, 0, 1), sh: shell });
    // advance
    if (s > nextFlip) { dir = -dir; nextFlip = s + o.flip * (0.5 + r()); }
    omega += (dir - omega) * clamp(ds * 9, 0, 1);
    const rMean = Math.sqrt((A * A + B * B) / 2);
    phi += omega * (ds / rMean) * (1 + 0.28 * nV(s * 2.2));
    const k = ds * o.drift;
    c = unit([c[0] + v[0] * k, c[1] + v[1] * k, c[2] + v[2] * k]);
    const turn = nD(s * 0.9 + 3) * ds * 1.5;
    const e = cross(c, v), kv = dot(v, c);
    v = unit([v[0] - c[0] * kv + e[0] * turn, v[1] - c[1] * kv + e[1] * turn, v[2] - c[2] * kv + e[2] * turn]);
    s += ds;
  }
  return pts;
}

// A loose hair: leaves the surface tangentially and curls, thinning to nothing.
function flyaway(r, o) {
  const pts = [];
  const c = unit(o.center);
  let v = o.dir ? unit(o.dir) : tangentAt(c, r);
  const k0 = dot(v, c);
  v = unit([v[0] - c[0] * k0, v[1] - c[1] * k0, v[2] - c[2] * k0]);
  const curl = (r() < 0.5 ? -1 : 1) * (o.curl ?? 1.6 + r() * 2.5);
  const n = Math.round(o.length / o.ds);
  const base = surfacePoint(c, o.shell);
  let p = base.slice();
  let t = v;
  const up = c;
  const t1 = noise1(r);
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    pts.push({ x: p[0], y: p[1], z: p[2], w: o.width * (0.25 + 0.75 * Math.sin(Math.min(f * 1.15, 1) * Math.PI) ** 0.6) * (1 - f * f * 0.5), p: 1 - f * 0.55, sh: o.shell + 0.02 + f * 0.06 });
    // bend the heading: curl around the surface normal, and lift off it
    const a = curl * o.ds * (0.55 + 1.2 * f) + t1(f * 3) * o.ds * 2;
    const ca = Math.cos(a), sa = Math.sin(a), ax = up;
    const k = dot(ax, t), cr = cross(ax, t);
    t = unit([t[0] * ca + cr[0] * sa + ax[0] * k * (1 - ca), t[1] * ca + cr[1] * sa + ax[1] * k * (1 - ca), t[2] * ca + cr[2] * sa + ax[2] * k * (1 - ca)]);
    const lift = o.lift * (1 - f * 0.55);
    p = [p[0] + (t[0] + up[0] * lift) * o.ds, p[1] + (t[1] + up[1] * lift) * o.ds, p[2] + (t[2] + up[2] * lift) * o.ds];
  }
  return pts;
}

// Fewer points where the line runs straight; every point kept where it turns.
function decimate(pts, maxAngle, maxStep) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  let last = pts[0], lastDir = null;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], dx = p.x - last.x, dy = p.y - last.y, dz = p.z - last.z;
    const l = Math.hypot(dx, dy, dz);
    if (l < 1e-6) continue;
    const d = [dx / l, dy / l, dz / l];
    if (!lastDir) lastDir = d;
    const turned = dot(d, lastDir) < Math.cos(maxAngle);
    if (turned || l > maxStep) { out.push(p); lastDir = d; last = p; }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// A ribbon cannot be wider than the curve it follows, or it folds: on a tight turn the hand lifts.
function limitWidth(pts) {
  const n = pts.length;
  if (n < 3) return pts;
  const lim = new Float32Array(n).fill(1);
  for (let i = 1; i < n - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const u = [b.x - a.x, b.y - a.y, b.z - a.z], v = [c.x - b.x, c.y - b.y, c.z - b.z];
    const lu = Math.hypot(...u) || 1e-6, lv = Math.hypot(...v) || 1e-6;
    const ang = Math.acos(clamp((u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv), -1, 1));
    const R = ((lu + lv) * 0.5) / Math.max(ang, 1e-3);
    lim[i] = clamp((R * 1.5) / Math.max(b.w, 1e-4), 0.22, 1);
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < n - 1; i++) lim[i] = Math.min(lim[i], (lim[i - 1] + lim[i] * 2 + lim[i + 1]) / 4 + 0.02);
  }
  for (let i = 0; i < n; i++) { pts[i].w *= lim[i]; }
  return pts;
}

export const DEFAULTS = {
  seed: 1187,
  ds: 0.011,            // walk step before decimation
  mass: { length: 720, count: 200 },
  hatch: { length: 300, count: 100 },
  under: { length: 150, count: 60 },
  mid: { length: 880, count: 400 },
  top: { length: 480, count: 320 },
  gold: { count: 5 },
  flyaways: 46,
  crown: 7,
};

// Strand tones: 0 near-black, 0.2 charcoal, 0.5 mid, 1 bone.
export function generateBlob(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const r = makeRng(cfg.seed);
  const strands = [];
  const add = (kind, pts, tone, gold = 0) => {
    const k = limitWidth(decimate(pts, kind === 'fly' ? 0.09 : 0.095, 0.07));
    strands.push({ id: strands.length, kind, tone, gold, row: 0, u0: 0, points: k });
  };
  const logRange = (a, b) => a * Math.pow(b / a, r());
  // shadow side of the form takes more pencil: lower right and behind
  const centerFor = (bias) => {
    for (let i = 0; i < 12; i++) {
      const d = randomDir(r);
      const shade = 0.5 - 0.5 * (d[0] * -0.62 + d[1] * 0.72 - d[2] * 0.08);
      if (r() < 1 - bias + bias * shade * 1.6) return d;
    }
    return randomDir(r);
  };
  const lay = (length, count, make) => {
    const each = length / count;
    for (let i = 0; i < count; i++) make(each * (0.3 + r() * 1.4));
  };

  // the mass: wide soft strokes of charcoal, what gives the body its value before any line is drawn
  lay(cfg.mass.length, cfg.mass.count, (len) => {
    const zig = r() < 0.55;
    const pick = r();
    add('mass', scribble(r, {
      center: centerFor(0.15), length: len, ds: cfg.ds * 1.5,
      A: zig ? logRange(0.26, 0.72) : logRange(0.16, 0.6), ratio: zig ? 0.05 + r() * 0.08 : 0.4 + r() * 0.5,
      drift: zig ? 0.05 + r() * 0.07 : 0.08 + r() * 0.1, flip: 0,
      shell: 0.932 + r() * 0.03, shellVar: 0.006, width: 0.013 + r() * r() * 0.02, taper: 0.3,
    }), pick < 0.22 ? 0.08 + r() * 0.1 : pick < 0.72 ? 0.28 + r() * 0.2 : 0.5 + r() * 0.18);
  });
  // dark contour marks directly over the mass
  lay(cfg.under.length, cfg.under.count, (len) => {
    const zig = r() < 0.3;
    add('under', scribble(r, {
      center: centerFor(0.42), length: len, ds: cfg.ds,
      A: zig ? logRange(0.28, 0.7) : logRange(0.1, 0.42), ratio: zig ? 0.04 + r() * 0.05 : 0.42 + r() * 0.55,
      drift: zig ? 0.03 + r() * 0.04 : 0.07 + r() * 0.1, flip: r() < 0.35 ? 6 + r() * 10 : 0,
      shell: 0.962 + r() * 0.012, shellVar: 0.005, width: 0.008 + r() * 0.0065, taper: 0.14,
    }), 0.02 + r() * 0.08);
  });
  // hatching on the shadow side, all one hand's angle: the marks that say a person shaded this
  lay(cfg.hatch.length, cfg.hatch.count, (len) => {
    add('hatch', scribble(r, {
      center: centerFor(0.95), length: len, ds: cfg.ds, axis: [0.75, 0.62, 0.2], psi: (r() - 0.5) * 0.3,
      A: logRange(0.2, 0.46), ratio: 0.03 + r() * 0.025, drift: 0.018 + r() * 0.018, flip: 0,
      shell: 0.978 + r() * 0.014, shellVar: 0.004, width: 0.0042 + r() * 0.0032, taper: 0.1,
    }), 0.03 + r() * 0.08);
  });
  // the middle tones, and most of the visible scribble
  lay(cfg.mid.length, cfg.mid.count, (len) => {
    const zig = r() < 0.2;
    const big = r() < 0.3;
    const pick = r();
    add('mid', scribble(r, {
      center: centerFor(0.18), length: len, ds: cfg.ds,
      A: big ? logRange(0.5, 1.05) : zig ? logRange(0.26, 0.62) : logRange(0.07, 0.34), ratio: zig ? 0.035 + r() * 0.05 : big ? 0.28 + r() * 0.5 : 0.3 + r() * 0.65,
      drift: zig ? 0.025 + r() * 0.04 : 0.06 + r() * 0.1, flip: r() < 0.3 ? 5 + r() * 9 : 0,
      shell: 0.972 + r() * 0.024, shellVar: 0.008, width: 0.0052 + r() * r() * 0.0065, taper: 0.16,
    }), pick < 0.38 ? 0.03 + r() * 0.09 : 0.3 + r() * 0.34);
  });
  // the top: sparse, confident, the lightest and the darkest marks of the drawing
  lay(cfg.top.length, cfg.top.count, (len) => {
    const zig = r() < 0.2;
    const big = r() < 0.22;
    const pick = r();
    const heavy = r() < 0.09;
    const tone = pick < 0.3 ? 0.03 + r() * 0.07 : pick < 0.6 ? 0.42 + r() * 0.24 : 0.74 + r() * 0.26;
    add('top', scribble(r, {
      center: centerFor(-0.25), length: len, ds: cfg.ds,
      A: big ? logRange(0.4, 0.85) : zig ? logRange(0.24, 0.52) : logRange(tone > 0.7 ? 0.14 : 0.06, 0.3), ratio: zig ? 0.04 + r() * 0.05 : big ? 0.5 + r() * 0.45 : 0.35 + r() * 0.65,
      drift: zig ? 0.025 + r() * 0.035 : 0.09 + r() * 0.14, flip: r() < 0.25 ? 4 + r() * 8 : 0,
      shell: 0.998 + r() * 0.03, shellVar: 0.008, over: big ? 0.05 + r() * 0.05 : 0.02, width: heavy ? 0.0105 + r() * 0.004 : 0.0044 + r() * 0.0044, taper: 0.18,
    }), tone);
  });
  // rare warm gold: a line or two, never a patch
  for (let i = 0; i < cfg.gold.count; i++) {
    add('gold', scribble(r, {
      center: centerFor(-0.4), length: 0.9 + r() * 1.7, ds: cfg.ds,
      A: logRange(0.16, 0.5), ratio: 0.5 + r() * 0.45, drift: 0.09 + r() * 0.09, flip: 0,
      shell: 1.012 + r() * 0.02, shellVar: 0.006, width: 0.005 + r() * 0.0022, taper: 0.25,
    }), 0.8, 1);
  }
  // loose hairs at the silhouette, none of them long
  for (let i = 0; i < cfg.flyaways; i++) {
    const d = randomDir(r);
    add('fly', flyaway(r, { center: d, length: 0.07 + r() * r() * 0.3, ds: 0.006, shell: 0.985 + r() * 0.03, lift: 0.22 + r() * 0.42, width: 0.0042 + r() * 0.003 }), r() < 0.5 ? 0.06 + r() * 0.16 : 0.42 + r() * 0.4);
  }
  // a small cowlick at the crown
  for (let i = 0; i < cfg.crown; i++) {
    const a = r() * TAU, rr = 0.03 + r() * 0.13;
    const d = unit([Math.cos(a) * rr - 0.06, 1, Math.sin(a) * rr * 0.6 + 0.08]);
    add('fly', flyaway(r, { center: d, dir: [(r() - 0.6) * 1, 0, (r() - 0.5) * 0.5], length: 0.18 + r() * 0.2, ds: 0.006, shell: 0.99, lift: 0.75 + r() * 0.5, curl: (r() < 0.75 ? -1 : 1) * (3 + r() * 4), width: 0.0052 + r() * 0.0028 }), i < 4 ? 0.06 + r() * 0.08 : 0.62 + r() * 0.3);
  }
  return { seed: cfg.seed, strands };
}

// Real numbers for the strands: rows of the classifier's weight matrix, read in order.
// Each returned row is exactly `chars` characters, so it tiles seamlessly along a strand.
export function weightRows(model, rowCount, chars) {
  const rows = [];
  const fmt = (w) => w.toFixed(2).replace('-', '−');
  const stride = model.weights.length / rowCount;
  for (let i = 0; i < rowCount; i++) {
    const intent = Math.floor(i * stride);
    const row = model.weights[intent];
    const tokens = [];
    let used = 2;  // the two brackets
    for (const [, w] of row) {
      const t = fmt(w);
      if (used + t.length + (tokens.length ? 2 : 0) > chars) break;
      used += t.length + (tokens.length ? 2 : 0);
      tokens.push(t);
    }
    // justify: spare characters widen the gaps evenly
    let spare = chars - used;
    let line = '[';
    tokens.forEach((t, k) => {
      if (k) {
        const gaps = tokens.length - k;
        const extra = Math.round(spare / gaps);
        spare -= extra;
        line += ' '.repeat(2 + extra);
      }
      line += t;
    });
    line += ']';
    rows.push({ intent, label: model.labels[intent], line, values: tokens.length });
  }
  return rows;
}

// One draw call's worth of vertex data. Segments are ordered from the inner shell outward, so plain
// alpha blending is correct from any camera outside the body; the opaque core hides the far side.
export function packStrands(blob, { atlasAspect = 40, rows = 40, seed = 91 } = {}) {
  const r = makeRng(seed);
  let pointCount = 0, segCount = 0;
  for (const s of blob.strands) { pointCount += s.points.length; segCount += Math.max(0, s.points.length - 1); }
  const vertCount = pointCount * 2;
  const position = new Float32Array(vertCount * 3);
  const tangent = new Float32Array(vertCount * 3);
  const a = new Float32Array(vertCount * 4);  // u, width, side, pressure
  const b = new Float32Array(vertCount * 4);  // tone, gold, shell, row
  const keys = new Float32Array(segCount);
  const segA = new Uint32Array(segCount);
  let v = 0, sN = 0;
  for (const s of blob.strands) {
    const n = s.points.length;
    if (n < 2) continue;
    s.row = Math.floor(r() * rows);
    s.u0 = r();
    let u = s.u0;
    for (let i = 0; i < n; i++) {
      const p = s.points[i], q = s.points[Math.max(0, i - 1)], w = s.points[Math.min(n - 1, i + 1)];
      const t = unit([w.x - q.x, w.y - q.y, w.z - q.z]);
      if (i > 0) {
        const step = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
        // digit size follows pressure, so the numbers keep their proportions
        u += step / Math.max(p.w, 0.0022) / atlasAspect;
      }
      p.u = u;
      for (const side of [-1, 1]) {
        position.set([p.x, p.y, p.z], v * 3);
        tangent.set(t, v * 3);
        a.set([u, p.w, side, p.p], v * 4);
        b.set([s.tone, s.gold, p.sh, s.row], v * 4);
        v++;
      }
      if (i < n - 1) {
        keys[sN] = (p.sh + s.points[i + 1].sh) * 0.5;
        segA[sN] = v - 2;
        sN++;
      }
    }
  }
  // counting sort by shell
  const buckets = 2048, lo = 0.86, hi = 1.16;
  const counts = new Uint32Array(buckets + 1);
  const bucketOf = (k) => clamp(Math.floor(((k - lo) / (hi - lo)) * buckets), 0, buckets - 1);
  for (let i = 0; i < sN; i++) counts[bucketOf(keys[i]) + 1]++;
  for (let i = 0; i < buckets; i++) counts[i + 1] += counts[i];
  const index = new Uint32Array(sN * 6);
  for (let i = 0; i < sN; i++) {
    const at = counts[bucketOf(keys[i])]++ * 6, s = segA[i];
    index[at] = s; index[at + 1] = s + 1; index[at + 2] = s + 2;
    index[at + 3] = s + 2; index[at + 4] = s + 1; index[at + 5] = s + 3;
  }
  return { position, tangent, a, b, index, stats: { strands: blob.strands.length, points: pointCount, vertices: vertCount, triangles: sN * 2 } };
}

// The opaque body inside the strands: a UV sphere pushed out to the shell.
export function coreMesh(shell = 0.875, rings = 56, segs = 84) {
  const position = [], index = [];
  for (let i = 0; i <= rings; i++) {
    const th = (i / rings) * Math.PI;
    for (let j = 0; j <= segs; j++) {
      const ph = (j / segs) * TAU;
      const p = surfacePoint([Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)], shell);
      position.push(p[0], p[1], p[2]);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = i * (segs + 1) + j, b = a + segs + 1;
    index.push(a, a + 1, b, b, a + 1, b + 1);
  }
  return { position: new Float32Array(position), index: new Uint32Array(index) };
}

// Plain data for Blender: every strand as a list of points, plus the numbers it carries.
export function exportStrands(blob, { model, rows = 40, chars = 68, precision = 5 } = {}) {
  const f = (x) => +x.toFixed(precision);
  return {
    format: 'blob-strands/1',
    seed: blob.seed,
    units: 'blob radius about 1; y up; the face looks along +z',
    width: 'world units; ribbon width',
    u: 'along the strand in atlas repeats: one repeat is a full row of numbers',
    rows: model ? weightRows(model, rows, chars) : undefined,
    strands: blob.strands.map((s) => ({
      id: s.id, kind: s.kind, tone: f(s.tone), gold: s.gold, row: s.row,
      // x y z width u pressure, repeated
      points: s.points.flatMap((p) => [f(p.x), f(p.y), f(p.z), f(p.w), f(p.u ?? 0), f(p.p)]),
    })),
  };
}
