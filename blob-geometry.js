// The blob's geometry: seeded pencil strands over a soft gumdrop surface, and the pieces that join it.
// Isomorphic on purpose (no DOM, no Three): a worker packs it for the GPU, and a Node script exports
// the same data for anyone working outside the browser, so everything drawn is one object.

const TAU = Math.PI * 2;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

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
export function noise1(r) {
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

// The body. Star-shaped around the origin: radius along a unit direction. A gumdrop: a rounded top,
// widest in the lower third, a soft flattened base, leaning a little, with a few slow lumps.
export function shellRadius(x, y, z) {
  const h = Math.hypot(x, z);
  const low = smoothstep(0.55, -0.55, y);
  const a = 0.9 + 0.22 * low;
  const b = y > 0 ? 1.03 : 0.76;
  const p = 2 + 0.34 * low;
  const base = Math.pow(Math.pow(h / a, p) + Math.pow(Math.abs(y) / b, p), -1 / p);
  const lean = 1 - 0.075 * x * y + 0.03 * z * low;
  const lump = noise3(x * 1.45 + 11.3, y * 1.45 + 4.7, z * 1.45 + 8.1) * 0.8 + noise3(x * 3.1 + 2.1, y * 3.1 + 9.9, z * 3.1 + 1.2) * 0.2;
  return base * lean * (1 + 0.05 * lump);
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
  const p1 = P(add3(d, t, e)), p0 = P(add3(d, t, -e));
  const q1 = P(add3(d, b, e)), q0 = P(add3(d, b, -e));
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
const handAngle = (d) => noise3(d[0] * 0.95 + 21, d[1] * 0.95 + 5, d[2] * 0.95 + 13) * Math.PI * 1.25 + 0.7;

// A scribble: an ellipse the hand keeps circling while its centre wanders. The ellipse opens and
// closes, turns, sometimes collapses to a back-and-forth hatch, and now and then the hand reverses.
export function scribble(r, o) {
  const nA = noise1(r), nR = noise1(r), nPsi = noise1(r), nW = noise1(r), nS = noise1(r), nD = noise1(r), nV = noise1(r), nO = noise1(r);
  const t1 = noise1(r), t2 = noise1(r), t3 = noise1(r), t4 = noise1(r);
  const pts = [];
  let c = unit(o.center), v = tangentAt(c, r);
  let phi = r() * TAU, dir = r() < 0.5 ? 1 : -1, omega = dir;
  let nextFlip = o.flip > 0 ? o.flip * (0.5 + r()) : Infinity;
  const ref = o.axis || [0.31, 0.92, 0.2];
  const psi0 = o.psi ?? handAngle(c) + (r() - 0.5) * (o.spread ?? 0.7);
  if (o.ratio < 0.15) {
    // a hatch steps sideways across its own sweep
    const kr0 = dot(ref, c), e0 = unit([ref[0] - c[0] * kr0, ref[1] - c[1] * kr0, ref[2] - c[2] * kr0]), f0 = cross(c, e0);
    const cp0 = Math.cos(psi0), sp0 = Math.sin(psi0);
    v = unit([-e0[0] * sp0 + f0[0] * cp0, -e0[1] * sp0 + f0[1] * cp0, -e0[2] * sp0 + f0[2] * cp0]);
  }
  const ds = o.ds;
  const trem = o.tremble ?? 1;
  let s = 0;
  while (s < o.length) {
    const A = o.A * (0.72 + 0.5 * nA(s / (o.A * 7) + 3));
    const B = A * clamp(o.ratio * (0.75 + 0.7 * nR(s / (o.A * 9) + 7)), 0.02, 1.1);
    const psi = psi0 + (o.ratio < 0.15 ? 0.22 : 0.9) * nPsi(s / (o.A * 16) + 11);
    // the sweep's direction is held in the world, not the wander: that is what keeps a patch coherent
    const kr = dot(ref, c);
    const e1 = unit([ref[0] - c[0] * kr, ref[1] - c[1] * kr, ref[2] - c[2] * kr]), e2 = cross(c, e1);
    const cp = Math.cos(psi), sp = Math.sin(psi);
    const a1 = [e1[0] * cp + e2[0] * sp, e1[1] * cp + e2[1] * sp, e1[2] * cp + e2[2] * sp];
    const a2 = [-e1[0] * sp + e2[0] * cp, -e1[1] * sp + e2[1] * cp, -e1[2] * sp + e2[2] * cp];
    const ca = Math.cos(phi) * A, cb = Math.sin(phi) * B;
    let off = [a1[0] * ca + a2[0] * cb, a1[1] * ca + a2[1] * cb, a1[2] * ca + a2[2] * cb];
    const tremA = 0.0022 * trem, tremB = 0.0008 * trem;
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
    if (s > nextFlip) { dir = -dir; nextFlip = s + o.flip * (0.5 + r()); }
    omega += (dir - omega) * clamp(ds * 9, 0, 1);
    const rMean = Math.sqrt((A * A + B * B) / 2);
    phi += omega * (ds / rMean) * (1 + 0.28 * nV(s * 2.2));
    const k = ds * o.drift;
    c = unit(add3(c, v, k));
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
  let p = surfacePoint(c, o.shell);
  let t = v;
  const up = c;
  const t1 = noise1(r);
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    pts.push({ x: p[0], y: p[1], z: p[2], w: o.width * (0.25 + 0.75 * Math.sin(Math.min(f * 1.15, 1) * Math.PI) ** 0.6) * (1 - f * f * 0.5), p: 1 - f * 0.55, sh: o.shell + 0.02 + f * 0.06 });
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
export function decimate(pts, maxAngle, maxStep) {
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
export function limitWidth(pts) {
  const n = pts.length;
  if (n < 3) return pts;
  const lim = new Float32Array(n).fill(1);
  for (let i = 1; i < n - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const u = [b.x - a.x, b.y - a.y, b.z - a.z], v = [c.x - b.x, c.y - b.y, c.z - b.z];
    const lu = Math.hypot(u[0], u[1], u[2]) || 1e-6, lv = Math.hypot(v[0], v[1], v[2]) || 1e-6;
    const ang = Math.acos(clamp((u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv), -1, 1));
    const R = ((lu + lv) * 0.5) / Math.max(ang, 1e-3);
    lim[i] = clamp((R * 1.5) / Math.max(b.w, 1e-4), 0.14, 1);
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < n - 1; i++) lim[i] = Math.min(lim[i], (lim[i - 1] + lim[i] * 2 + lim[i + 1]) / 4 + 0.02);
  }
  for (let i = 0; i < n; i++) pts[i].w *= lim[i];
  return pts;
}

export const DEFAULTS = {
  seed: 1187,
  density: 1,
  ds: 0.011,
  mass: { length: 300, count: 90 },
  hatchDark: { length: 1900, count: 1300 },
  hatchLight: { length: 1000, count: 760 },
  loops: { length: 340, count: 340 },
  gesture: { length: 150, count: 34 },
  big: { length: 42, count: 7 },
  white: { length: 36, count: 34 },
  flyaways: 22,
  crown: 5,
};

// Where the macro camera looks: high on the lit side of the body, clear of the eyes.
export const MACRO_DIR = unit([-0.22, 0.42, 0.88]);

// Strand tones: 0 near-black graphite, 0.5 a light pressure, above 0.72 a white pencil.
export function generateBlob(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const D = cfg.density;
  const r = makeRng(cfg.seed);
  const strands = [];
  const add = (kind, pts, tone, gold = 0) => {
    const k = limitWidth(decimate(pts, kind === 'fly' ? 0.09 : 0.1, 0.07));
    if (cfg.widthK) for (const q of k) q.w *= cfg.widthK;
    strands.push({ id: strands.length, kind, tone, gold, row: 0, u0: 0, points: k });
  };
  const logRange = (a, b) => a * Math.pow(b / a, r());
  // Marks go where the form turns from the light: the lower right. Almost all of them on the side
  // anyone sees, because the camera stays within 30 degrees of the face.
  const shadeAt = (d) => 0.5 - 0.5 * (d[0] * -0.74 + d[1] * 0.56 + d[2] * 0.34);
  const centerFor = (bias) => {
    for (let i = 0; i < 24; i++) {
      const d = randomDir(r);
      if (d[2] < -0.25 && r() < 0.86) continue;
      if (r() < 1 - bias + bias * Math.pow(shadeAt(d), 1.5) * 2.2) return d;
    }
    return randomDir(r);
  };
  const lay = (spec, make) => {
    const count = Math.max(1, Math.round(spec.count * D)), each = (spec.length * D) / count;
    for (let i = 0; i < count; i++) make(each * (0.35 + r() * 1.3));
  };

  // side of the pencil: wide grainy tone, only in the shadow
  lay(cfg.mass, (len) => {
    add('mass', scribble(r, {
      center: centerFor(0.95), length: len, ds: cfg.ds * 1.6,
      A: logRange(0.16, 0.42), ratio: 0.05 + r() * 0.06, drift: 0.05 + r() * 0.06, flip: 0, spread: 0.5,
      shell: 0.94 + r() * 0.025, shellVar: 0.006, width: 0.016 + r() * r() * 0.03, taper: 0.28,
    }), 0.22 + r() * 0.3);
  });
  // the fine fast hatching that does most of the work, thick with pencil in the shadow
  lay(cfg.hatchDark, (len) => {
    const cross2 = r() < 0.32;
    const c = centerFor(0.86);
    add('hatch', scribble(r, {
      center: c, length: len, ds: cfg.ds,
      A: logRange(0.07, 0.27), ratio: 0.025 + r() * 0.03, drift: 0.016 + r() * 0.024, flip: 0, spread: 0.4,
      psi: cross2 ? handAngle(c) + 1.15 + (r() - 0.5) * 0.4 : undefined,
      shell: 0.97 + r() * 0.03, shellVar: 0.004, width: 0.0024 + r() * 0.002, taper: 0.06, tremble: 0.7,
    }), 0.03 + r() * r() * 0.3);
  });
  // lighter hatching across the body, so the lit side still has a surface
  lay(cfg.hatchLight, (len) => {
    add('hatch', scribble(r, {
      center: centerFor(0.2), length: len, ds: cfg.ds,
      A: logRange(0.07, 0.24), ratio: 0.025 + r() * 0.03, drift: 0.02 + r() * 0.026, flip: 0, spread: 0.5,
      shell: 0.975 + r() * 0.025, shellVar: 0.004, width: 0.0022 + r() * 0.0012, taper: 0.06, tremble: 0.7,
    }), 0.26 + r() * 0.3);
  });
  // small loops: the scribble's own texture, small enough to read as tone from far away
  lay(cfg.loops, (len) => {
    add('loop', scribble(r, {
      center: centerFor(0.45), length: len, ds: cfg.ds * 0.8,
      A: logRange(0.016, 0.07), ratio: 0.45 + r() * 0.5, drift: 0.12 + r() * 0.3, flip: r() < 0.3 ? 2 + r() * 3 : 0,
      shell: 0.985 + r() * 0.025, shellVar: 0.004, width: 0.0024 + r() * 0.0018, taper: 0.06,
    }), r() < 0.7 ? 0.04 + r() * 0.2 : 0.3 + r() * 0.25);
  });
  // a few larger gestures that hold it all together
  lay(cfg.gesture, (len) => {
    add('gesture', scribble(r, {
      center: centerFor(0.15), length: len, ds: cfg.ds,
      A: logRange(0.2, 0.46), ratio: 0.22 + r() * 0.4, drift: 0.05 + r() * 0.09, flip: 0,
      shell: 1.0 + r() * 0.02, shellVar: 0.006, over: 0.008, width: 0.0034 + r() * 0.0024, taper: 0.22,
    }), 0.04 + r() * 0.14);
  });
  lay(cfg.big, (len) => {
    add('big', scribble(r, {
      center: centerFor(0), length: len, ds: cfg.ds,
      A: logRange(0.55, 0.95), ratio: 0.45 + r() * 0.35, drift: 0.05 + r() * 0.08, flip: 0,
      shell: 1.015 + r() * 0.012, shellVar: 0.006, over: 0.022, width: 0.0034 + r() * 0.0016, taper: 0.4,
    }), 0.1 + r() * 0.14);
  });
  // white pencil, sparingly, on the lit side
  lay(cfg.white, (len) => {
    add('white', scribble(r, {
      center: centerFor(-0.5), length: len, ds: cfg.ds,
      A: logRange(0.05, 0.2), ratio: 0.04 + r() * 0.3, drift: 0.04 + r() * 0.06, flip: 0,
      shell: 1.03 + r() * 0.008, shellVar: 0.002, width: 0.0026 + r() * 0.0012, taper: 0.1,
    }), 0.8 + r() * 0.2);
  });
  // loose hairs at the silhouette, none of them long
  const fly = Math.round(cfg.flyaways * Math.max(D, 0.25));
  for (let i = 0; i < fly; i++) {
    const d = randomDir(r);
    add('fly', flyaway(r, { center: d, length: 0.06 + r() * r() * 0.2, ds: 0.006, shell: 0.985 + r() * 0.03, lift: 0.2 + r() * 0.36, width: 0.0028 + r() * 0.0016 }), 0.08 + r() * 0.34);
  }
  // a small cowlick at the crown
  const crown = Math.round(cfg.crown * Math.max(D, 0.4));
  for (let i = 0; i < crown; i++) {
    const a = r() * TAU, rr = 0.03 + r() * 0.11;
    const d = unit([Math.cos(a) * rr - 0.08, 1, Math.sin(a) * rr * 0.6 + 0.1]);
    add('fly', flyaway(r, { center: d, dir: [(r() - 0.6), 0, (r() - 0.5) * 0.5], length: 0.14 + r() * 0.16, ds: 0.006, shell: 0.99, lift: 0.72 + r() * 0.5, curl: (r() < 0.75 ? -1 : 1) * (3 + r() * 4), width: 0.0032 + r() * 0.0016 }), 0.06 + r() * 0.2);
  }
  // the two lines the macro camera reads, placed by hand: they run left to right above everything
  if (cfg.readers !== false) for (const s of readerStrands(r)) strands.push({ id: strands.length, ...s });
  return { seed: cfg.seed, density: D, strands };
}

// A local frame on the surface at a direction: normal, a tangent running to the right on screen, up.
export function surfaceFrame(dir) {
  const n = surfaceNormal(dir);
  const right = unit(cross([0, 1, 0], n));
  return { p: surfacePoint(dir), n, right, up: cross(n, right) };
}

function readerStrands(r) {
  const { right, up } = surfaceFrame(MACRO_DIR);
  const base = unit(MACRO_DIR);
  const line = (dy, half, width, tone, bow, row) => {
    const pts = [];
    const n = Math.round((half * 2) / 0.012);
    const wob = noise1(r);
    for (let i = 0; i <= n; i++) {
      const f = i / n, t = -half + f * half * 2;
      const y = dy + bow * (t / half) * (t / half) + wob(f * 3) * 0.004;
      const d = unit([base[0] + right[0] * t + up[0] * y, base[1] + right[1] * t + up[1] * y, base[2] + right[2] * t + up[2] * y]);
      const rad = shellRadius(d[0], d[1], d[2]) * 1.055;
      const lift = Math.min(1, smoothstep(0, 0.12, f) + 0.05) * Math.min(1, smoothstep(0, 0.12, 1 - f) + 0.05);
      pts.push({ x: d[0] * rad, y: d[1] * rad, z: d[2] * rad, w: width * lift, p: lift, sh: 1.055 });
    }
    return { kind: 'reader', tone, gold: 0, row, u0: 0.03, points: pts };
  };
  return [line(0.012, 0.42, 0.0098, 0.03, -0.012, 3), line(-0.066, 0.3, 0.0074, 0.12, 0.008, 17)];
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
// alpha blending is correct from any camera outside the body; the depth-only core hides the far side.
// Attributes: position; aT (tangent, side) as bytes; aA (u, width, s); aB (tone, pressure, gold, row)
// as bytes; aC (shell, f along the strand, delay before it starts drawing).
export function packStrands(blob, { atlasAspect = 40, rows = 40, seed = 91 } = {}) {
  const r = makeRng(seed);
  let pointCount = 0, segCount = 0;
  for (const s of blob.strands) { if (s.points.length >= 2) { pointCount += s.points.length; segCount += s.points.length - 1; } }
  const vertCount = pointCount * 2;
  const position = new Float32Array(vertCount * 3);
  const tangent = new Int8Array(vertCount * 4);
  const a = new Float32Array(vertCount * 3);
  const b = new Uint8Array(vertCount * 4);
  const c = new Float32Array(vertCount * 3);
  const keys = new Float32Array(segCount);
  const segA = new Uint32Array(segCount);
  let v = 0, sN = 0;
  for (const s of blob.strands) {
    const n = s.points.length;
    if (n < 2) continue;
    if (s.row === 0 && s.kind !== 'reader') s.row = Math.floor(r() * rows);
    s.u0 = s.u0 || r();
    let u = s.u0, arc = 0;
    let total = 0;
    for (let i = 1; i < n; i++) { const p = s.points[i], q = s.points[i - 1]; total += Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z); }
    const delay = s.delay ?? 0;
    for (let i = 0; i < n; i++) {
      const p = s.points[i], q = s.points[Math.max(0, i - 1)], w = s.points[Math.min(n - 1, i + 1)];
      const t = unit([w.x - q.x, w.y - q.y, w.z - q.z]);
      if (i > 0) {
        const step = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
        arc += step;
        // digit size follows pressure, so the numbers keep their proportions
        u += step / Math.max(p.w, 0.0022) / atlasAspect;
      }
      p.u = u;
      const f = total > 0 ? arc / total : 0;
      const tb = [Math.round(t[0] * 127), Math.round(t[1] * 127), Math.round(t[2] * 127)];
      for (const side of [-1, 1]) {
        position[v * 3] = p.x; position[v * 3 + 1] = p.y; position[v * 3 + 2] = p.z;
        tangent[v * 4] = tb[0]; tangent[v * 4 + 1] = tb[1]; tangent[v * 4 + 2] = tb[2]; tangent[v * 4 + 3] = side * 127;
        a[v * 3] = u; a[v * 3 + 1] = p.w; a[v * 3 + 2] = arc;
        b[v * 4] = Math.round(clamp(s.tone, 0, 1) * 255); b[v * 4 + 1] = Math.round(clamp(p.p, 0, 1) * 255); b[v * 4 + 2] = s.gold ? 255 : 0; b[v * 4 + 3] = s.row;
        c[v * 3] = p.sh; c[v * 3 + 1] = f; c[v * 3 + 2] = delay;
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
  const buckets = 2048, lo = 0.86, hi = 1.3;
  const counts = new Uint32Array(buckets + 1);
  const bucketOf = (k) => clamp(Math.floor(((k - lo) / (hi - lo)) * buckets), 0, buckets - 1);
  for (let i = 0; i < sN; i++) counts[bucketOf(keys[i]) + 1]++;
  for (let i = 0; i < buckets; i++) counts[i + 1] += counts[i];
  const index = new Uint32Array(sN * 6);
  for (let i = 0; i < sN; i++) {
    const at = counts[bucketOf(keys[i])]++ * 6, g = segA[i];
    index[at] = g; index[at + 1] = g + 1; index[at + 2] = g + 2;
    index[at + 3] = g + 2; index[at + 4] = g + 1; index[at + 5] = g + 3;
  }
  return { position, tangent, a, b, c, index, stats: { strands: blob.strands.length, points: pointCount, vertices: vertCount, triangles: sN * 2 } };
}

// The depth-only body inside the strands: a UV sphere pushed out to the shell.
export function coreMesh(shell = 0.93, rings = 48, segs = 72) {
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

// Plain data for use outside the browser: every strand as a list of points, plus the numbers it carries.
export function exportStrands(blob, { model, rows = 40, chars = 74, precision = 5 } = {}) {
  const f = (x) => +x.toFixed(precision);
  return {
    format: 'blob-strands/2',
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
