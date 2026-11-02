// The page's stage. One fixed transparent canvas over the sheet: the blob, what happens to it in each
// act, its drop down the page, and how it answers the demo's approval states.
import * as THREE from 'three';
import { Creature, buildAtlas, packAsync, makeShared, applyPose, frameShared, strandMesh, FOV } from './blob-render.js';
import { unit, smoothstep, surfaceFrame, MACRO_DIR } from './blob-geometry.js';
import { macroLayout, crewLayout } from './blob-props.js';

const rad = Math.PI / 180;
const yp = (yaw, pitch) => [Math.sin(yaw * rad) * Math.cos(pitch * rad), Math.sin(pitch * rad), Math.cos(yaw * rad) * Math.cos(pitch * rad)];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const easeInOutSoft = (x) => { const t = clamp01(x); return t * t * t * (t * (6 * t - 15) + 10); };

function buildPoses(narrow) {
  const mac = surfaceFrame(MACRO_DIR);
  const macTarget = [mac.p[0] + mac.n[0] * 0.055, mac.p[1] + mac.n[1] * 0.055, mac.p[2] + mac.n[2] * 0.055];
  const macDir = [mac.n[0] - mac.right[0] * 0.22, mac.n[1] - mac.right[1] * 0.22, mac.n[2] - mac.right[2] * 0.22];
  const Y = [0, 1, 0];
  const k = narrow ? 1.78 : 1;      // on a phone everything sits further back
  const sx = narrow ? 0 : 0.19;
  const sy = narrow ? 0.2 : 0;
  const hero = { target: [0, -0.03, 0], dir: yp(0, 1), up: Y, dist: 8.4 * k, sx, sy, aperture: 0.0004 };
  return [
    [0, hero],
    [0.45, { target: [0.12, 0.02, 0], dir: yp(-5, 2), up: Y, dist: 7.6 * k, sx: narrow ? 0 : 0.2, sy, aperture: 0.0004 }],
    [0.95, { target: [0.12, 0.02, 0], dir: yp(-6, 2), up: Y, dist: 7.4 * k, sx: narrow ? 0 : 0.2, sy, aperture: 0.0004 }],
    [1.32, { target: macTarget, dir: macDir, up: mac.up, dist: narrow ? 0.72 : 0.56, sx: narrow ? 0 : 0.12, sy: narrow ? 0.17 : 0, aperture: 0.07 }],
    [1.92, { target: macTarget, dir: macDir, up: mac.up, dist: narrow ? 0.68 : 0.52, sx: narrow ? 0 : 0.12, sy: narrow ? 0.17 : 0, aperture: 0.07 }],
    [2.32, { target: [narrow ? 0.66 : 0.82, -0.1, 0.2], dir: yp(8, -16), up: Y, dist: narrow ? 21 : 10.5, sx: narrow ? 0 : 0.2, sy, aperture: 0.0004 }],
    [2.95, { target: [narrow ? 0.66 : 0.82, -0.1, 0.2], dir: yp(10, -14), up: Y, dist: narrow ? 20.5 : 10.2, sx: narrow ? 0 : 0.2, sy, aperture: 0.0004 }],
    [3.3, { target: [-0.05, -0.1, 0], dir: yp(-8, 7), up: Y, dist: 7.9 * k, sx: narrow ? 0 : 0.2, sy, aperture: 0.0006 }],
    [3.95, { target: [-0.05, -0.1, 0], dir: yp(-6, 5), up: Y, dist: 7.7 * k, sx: narrow ? 0 : 0.2, sy, aperture: 0.0006 }],
    [4.42, hero],
    [5, hero],
    [6.2, hero],
  ];
}

function poseAt(poses, k) {
  if (k <= poses[0][0]) return poses[0][1];
  for (let i = 1; i < poses.length; i++) {
    const [k1, b] = poses[i];
    if (k <= k1) {
      const [k0, a] = poses[i - 1];
      const t = easeInOutSoft((k - k0) / (k1 - k0));
      const mix3 = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
      return {
        target: mix3(a.target, b.target), dir: unit(mix3(a.dir, b.dir)), up: unit(mix3(a.up, b.up)),
        dist: Math.exp(Math.log(a.dist) + (Math.log(b.dist) - Math.log(a.dist)) * t),
        sx: a.sx + (b.sx - a.sx) * t, sy: a.sy + (b.sy - a.sy) * t,
        aperture: Math.exp(Math.log(a.aperture) + (Math.log(b.aperture) - Math.log(a.aperture)) * t),
      };
    }
  }
  return poses[poses.length - 1][1];
}

export function pickTier() {
  const params = new URLSearchParams(location.search);
  if (params.get('tier')) return params.get('tier');
  const small = Math.min(screen.width, screen.height) < 700 || matchMedia('(max-width: 900px)').matches;
  const lowMem = (navigator.deviceMemory || 8) <= 4;
  const fewCores = (navigator.hardwareConcurrency || 8) <= 4;
  return small || lowMem || fewCores ? 'lo' : 'hi';
}

export async function createStage(canvas, { reduced = false, tier = pickTier(), model, onReady } = {}) {
  const lo = tier === 'lo';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  let dpr = Math.min(devicePixelRatio || 1, lo ? 1.5 : 2);
  renderer.setPixelRatio(dpr);
  const camera = new THREE.PerspectiveCamera(FOV, 1.6, 0.02, 60);
  const scene = new THREE.Scene();

  const atlas = await buildAtlas(model, { size: lo ? 2048 : 4096 });
  const shared = makeShared(atlas);
  const packOpts = { atlasAspect: atlas.rows, rows: atlas.rows };
  const [mainP, miniP, streamP, knotP, threadsP, crewP, packetP, goldP, shadowP, noteP, sendP] = await Promise.all([
    packAsync({ density: lo ? 0.55 : 1 }, packOpts),
    packAsync({ density: 0.16, readers: false, seed: 311, widthK: 0.72, mass: { length: 40, count: 16 }, big: { length: 0, count: 0 } }, packOpts),
    packAsync({ recipe: 'stream' }, packOpts),
    packAsync({ recipe: 'skillKnot' }, packOpts),
    packAsync({ recipe: 'skillThreads' }, packOpts),
    packAsync({ recipe: 'crewThreads' }, packOpts),
    packAsync({ recipe: 'packet' }, packOpts),
    packAsync({ recipe: 'goldThread' }, packOpts),
    packAsync({ recipe: 'groundShadow' }, packOpts),
    packAsync({ recipe: 'noteProp' }, packOpts),
    packAsync({ recipe: 'sendThread' }, packOpts),
  ]);

  const main = new Creature(mainP, shared, { seed: 1, order: 10 });
  scene.add(main.root);
  main.gazeTau = 1.5;
  const M = main.strands.material.uniforms;
  const mac = macroLayout();
  M.uClearP.value.set(mac.p[0], mac.p[1], mac.p[2]);

  const prop = (packed, order, parent = main.root) => {
    const m = strandMesh(packed, shared, { body: 0, order });
    m.visible = false;
    parent.add(m);
    return m;
  };
  const shadow = prop(shadowP, 2); shadow.visible = true;
  const streamM = prop(streamP, 14);
  const threadsM = prop(threadsP, 15);
  const knotM = prop(knotP, 16);
  const crewM = prop(crewP, 12);
  const packetM = prop(packetP, 19);
  const goldM = prop(goldP, 18);
  const noteM = prop(noteP, 19);
  const sendM = prop(sendP, 13);
  goldM.material.uniforms.uDrift.value = 0.001;
  // where the gold lead starts; from the recipe's own arithmetic
  const goldInfo = goldP.info || {};
  goldM.material.uniforms.uLead0.value = goldInfo.leadF ?? 0.8;
  if (goldInfo.leadA) { goldM.material.uniforms.uLeadA.value.fromArray(goldInfo.leadA); goldM.material.uniforms.uLeadB.value.fromArray(goldInfo.leadB); }

  const layout = crewLayout();
  const minis = layout.map((m, i) => {
    const c = new Creature(miniP, shared, { seed: 2 + i * 1.7, order: 20 + i * 4, breathPhase: i * 2.3, eyeScale: 1.32 });
    c.root.position.fromArray(m.p);
    c.root.scale.setScalar(m.s);
    c.root.visible = false;
    c.autoBlink = true;
    c.gazeTau = 2;
    main.root.add(c.root);
    c.baseYaw = -0.4 - i * 0.05;
    c.mainDir = new THREE.Vector2(-Math.sign(m.p[0]) * 0.7, -m.p[1] * 0.4);
    return c;
  });

  // ---------- state ----------
  const narrowQ = matchMedia('(max-width: 900px)');
  let poses = buildPoses(narrowQ.matches);
  let act = 0;
  let actTarget = 0;
  let goldFade = 1;        // the tour fades the thread before it loops
  let touring = false;
  let dock = { q: 0, rect: null, corner: 0 };
  let qShown = 0, squash = 0, squashV = 0, peakV = 0;
  let pointerSet = false;
  const pointer = new THREE.Vector2();
  let last = performance.now();
  let now = 0;
  let running = true;
  let visible = true;
  let surgeT = -10, strainT = -10, perkT = -10, flickerT = -10, sendT = -10;
  const reveal = { v: reduced ? 1 : 0 };
  const frames = { n: 0, start: 0, ms: [] };

  function size() {
    renderer.setSize(innerWidth, innerHeight, false);
    poses = buildPoses(narrowQ.matches);
  }
  addEventListener('resize', size);
  size();
  addEventListener('pointermove', (e) => {
    pointerSet = true;
    pointer.set((e.clientX / innerWidth - 0.66) * 1.7, -(e.clientY / innerHeight - 0.5) * 1.5);
    pointer.clampLength(0, 1);
  }, { passive: true });

  function slotPose(base, rect) {
    const W = innerWidth, H = innerHeight;
    const R = Math.min(rect.width * 0.4, rect.height * 0.44);
    const dist = (H / (2 * Math.tan((FOV * rad) / 2))) / Math.max(R, 40);
    return {
      target: [0, -0.03, 0], dir: yp(0, 1), up: [0, 1, 0], dist,
      sx: (rect.left + rect.width / 2) / W - 0.5, sy: (rect.top + rect.height / 2) / H - 0.5 + 0.03 * (Math.max(R, 40) / H), aperture: 0.0004,
    };
  }

  function composePose(k) {
    let p = poseAt(poses, k);
    if (dock.rect && qShown > 0) {
      const s = slotPose(p, dock.rect), t = easeInOutSoft(qShown);
      p = {
        target: [p.target[0] + (s.target[0] - p.target[0]) * t, p.target[1] + (s.target[1] - p.target[1]) * t, p.target[2] + (s.target[2] - p.target[2]) * t],
        dir: unit([p.dir[0] + (s.dir[0] - p.dir[0]) * t, p.dir[1] + (s.dir[1] - p.dir[1]) * t, p.dir[2] + (s.dir[2] - p.dir[2]) * t]),
        up: p.up, dist: Math.exp(Math.log(p.dist) + (Math.log(s.dist) - Math.log(p.dist)) * t),
        sx: p.sx + (s.sx - p.sx) * t, sy: p.sy + (s.sy - p.sy) * t, aperture: p.aperture,
      };
    }
    return p;
  }

  function setActs(k, t, dt) {
    // Act 1: rows of numbers drift in and join the body
    const s1 = ease((k - 0.02) / 0.62), s1t = ease((k - 0.72) / 0.42);
    streamM.visible = s1 > 0.001 && s1t < 0.999;
    streamM.material.uniforms.uDraw.value.set(s1 * 1.05, s1t * 1.05 - 0.02);
    streamM.material.uniforms.uFlow.value = -t * 0.0042;
    // Act 2: a knot arrives; its threads splice in
    const k2in = ease((k - 1.24) / 0.3), k2t = ease((k - 1.52) / 0.42), k2out = 1 - ease((k - 2.14) / 0.2);
    knotM.visible = k2in > 0.001 && k2out > 0.001;
    threadsM.visible = k2t > 0.001 && k2out > 0.001;
    knotM.material.uniforms.uAlpha.value = k2out;
    threadsM.material.uniforms.uAlpha.value = k2out;
    const from = new THREE.Vector3().fromArray(mac.knot).addScaledVector(new THREE.Vector3().fromArray(mac.right), 0.34).addScaledVector(new THREE.Vector3().fromArray(mac.n), 0.13).addScaledVector(new THREE.Vector3().fromArray(mac.up), 0.12);
    const to = new THREE.Vector3().fromArray(mac.knot);
    knotM.position.lerpVectors(from, to, easeInOutSoft(k2in));
    knotM.material.uniforms.uDraw.value.set(0.4 + k2in * 0.8, -0.2);
    threadsM.material.uniforms.uDraw.value.set(k2t * 1.05, -0.2);
    threadsM.material.uniforms.uFlow.value = -t * 0.0026;
    // the air around what the macro camera reads
    const camDist = camera.position.length();
    M.uClear.value = 1 - ease((camDist - 1.5) / 1.3);
    // Act 3: the crew comes up, the threads link them, a small piece of work goes along each in turn
    const c3 = ease((k - 2.2) / 0.32), c3t = ease((k - 2.32) / 0.42), c3out = 1 - ease((k - 3.05) / 0.22);
    crewM.visible = c3t > 0.001 && c3out > 0.001;
    crewM.material.uniforms.uDraw.value.set(c3t * 1.05, -0.2);
    crewM.material.uniforms.uAlpha.value = c3out;
    crewM.material.uniforms.uFlow.value = -t * 0.003;
    minis.forEach((c, i) => {
      const on = ease((k - 2.22 - i * 0.05) / 0.3) * c3out;
      c.root.visible = on > 0.001;
      if (!c.root.visible) return;
      c.strands.material.uniforms.uDraw.value.set(on * 1.05, -0.2);
      c.eyeMats.forEach((m) => { m.visible = on > 0.7; });
      c.eyeL.visible = c.eyeR.visible = on > 0.72;
      c.lookTarget.copy(c.mainDir);
      c.update(dt);
    });
    const crewOn = crewM.visible && c3t > 0.9;
    packetM.visible = crewOn;
    if (crewOn) {
      const period = 3.6, idx = Math.floor(t / period) % layout.length, f = (t / period) % 1;
      const m = layout[idx];
      const u = easeInOutSoft(f < 0.5 ? f * 2 : 2 - f * 2);
      const [a, b, c] = m.ctrl;
      const v = 1 - u;
      packetM.position.set(v * v * a[0] + 2 * v * u * b[0] + u * u * c[0], v * v * a[1] + 2 * v * u * b[1] + u * u * c[1], v * v * a[2] + 2 * v * u * b[2] + u * u * c[2]);
      packetM.material.uniforms.uAlpha.value = c3out;
    }
    // Act 4: the gold thread winds on and leads off toward the viewer
    const g4 = ease((k - 3.12) / 0.78);
    goldM.visible = g4 > 0.001;
    goldM.material.uniforms.uDraw.value.set(g4 * 1.03, -0.2);
    goldFade += ((touring && k > 4.5 ? 0 : 1) - goldFade) * (1 - Math.exp(-dt / 0.5));
    goldM.material.uniforms.uAlpha.value = goldFade;
    goldM.material.uniforms.uFlow.value = -t * 0.0012;
    shadow.material.uniforms.uAlpha.value = 1 - ease((1.9 - camDist) / 0.8);
  }

  function setGaze(k, t) {
    // reading: the eyes travel slowly along the incoming rows
    const reading = ease(k / 0.2) * (1 - ease((k - 0.9) / 0.2));
    const crew = ease((k - 2.3) / 0.2) * (1 - ease((k - 3.05) / 0.2));
    const gx = 0.72 + 0.26 * Math.sin(t * 0.55), gy = 0.28 + 0.14 * Math.sin(t * 0.37);
    const hold = pointerSet ? pointer : new THREE.Vector2(0, 0);
    main.lookTarget.set(
      THREE.MathUtils.lerp(THREE.MathUtils.lerp(hold.x, gx, reading), 0.72, crew),
      THREE.MathUtils.lerp(THREE.MathUtils.lerp(hold.y, gy, reading), -0.28, crew),
    );
  }

  function updateResponses(t) {
    // approve: a small lift
    const perk = perkT > 0 ? Math.exp(-(t - perkT) / 0.8) * ease((t - perkT) / 0.25) : 0;
    // send: a fuller lift while the thread takes the draft out
    const surge = t - surgeT < 2.6 ? Math.sin(clamp01((t - surgeT) / 2.6) * Math.PI) : 0;
    // self-approve: leans in, the thread goes taut and holds, it settles back
    const st = t - strainT;
    const strain = st < 3.4 ? ease(st / 0.9) * (1 - ease((st - 2.0) / 1.4)) : 0;
    main.lean = strain * 0.9;
    // in the slot the thread runs to the person's side of the page, slack until something pulls it
    const G = goldM.material.uniforms, docked = easeInOutSoft(qShown);
    G.uTaut.value = docked;
    G.uSag.value = (1 - strain) * 0.34;
    if (dock.rect && docked > 0) {
      const W = innerWidth, H = innerHeight, R = Math.max(Math.min(dock.rect.width * 0.4, dock.rect.height * 0.44), 40);
      const below = narrowQ.matches;
      const corner = dock.corner > 0.5;
      const bx = corner ? -1.45 : below ? -(dock.rect.width * 0.5 - 8) / R : -(dock.rect.width * 0.5 + 26) / R;
      const by = corner ? -0.3 : below ? -(dock.rect.height * 0.5 + 8) / R : -0.72;
      G.uLeadB.value.set(bx, by, 0.5);
    }
    const lift = perk * 0.05 + surge * 0.08;
    const stretch = perk * 0.018 + surge * 0.03;
    const s = squash;
    main.root.scale.set(1 + s * 0.55 - stretch * 0.4, 1 - s + stretch, 1 + s * 0.55 - stretch * 0.4);
    main.root.position.set(0, lift - s * 0.72, strain * 0.22);
    // the thread that carries a draft out
    const sn = t - sendT;
    const on = sn < 2.8;
    sendM.visible = on; noteM.visible = on && sn > 0.3 && sn < 2.5;
    if (on) {
      const head = ease(sn / 1.3), tail = ease((sn - 1.4) / 1.3);
      sendM.material.uniforms.uDraw.value.set(head * 1.03, tail * 1.03 - 0.02);
      const u = easeInOutSoft((sn - 0.3) / 2.2);
      const a = sendP.info.pts;
      const seg = u * (a.length - 1), i = Math.min(a.length - 2, Math.floor(seg)), f = seg - i;
      noteM.position.set(a[i][0] + (a[i + 1][0] - a[i][0]) * f, a[i][1] + (a[i + 1][1] - a[i][1]) * f + 0.03, a[i][2] + (a[i + 1][2] - a[i][2]) * f);
    }
    // retry: a small flicker, nothing moves
    const fl = t - flickerT;
    M.uFlicker.value = fl < 0.7 ? Math.sin((fl / 0.7) * Math.PI) * 0.55 : 0;
  }

  function step(nowMs) {
    const dt = Math.min(0.05, (nowMs - last) / 1000);
    last = nowMs;
    now += dt;
    const k0 = act;
    act += (actTarget - act) * (1 - Math.exp(-dt / (reduced ? 0.001 : 0.85)));
    // the follower for the drop, with velocity read off it for the squash
    const prevQ = qShown;
    qShown += (dock.q - qShown) * (1 - Math.exp(-dt / (reduced ? 0.001 : 0.28)));
    const v = (qShown - prevQ) / Math.max(dt, 1e-3);
    // a damped spring: stretched while it travels, a soft squash when it lands, one settle
    const targetS = reduced ? 0 : THREE.MathUtils.clamp(-v * 0.06, -0.04, 0.04);
    const K = 30, C = 5.6;
    peakV = Math.max(v, peakV * Math.exp(-dt / 0.8));
    if (!reduced && prevQ < 0.985 && qShown >= 0.985 && peakV > 0.15) { squashV += 0.62 * Math.min(1, peakV / 0.8) + 0.12; peakV = 0; }
    squashV += (K * (targetS - squash) - C * squashV) * dt;
    squash += squashV * dt;
    squash = THREE.MathUtils.clamp(squash, -0.09, 0.09);
    return { dt, v, k0 };
  }

  function drawFrame(dt, frozen = false) {
    const pose = composePose(act);
    const w = canvas.width, h = canvas.height;
    applyPose(camera, pose, w, h);
    setActs(act, now, dt);
    setGaze(act, now);
    updateResponses(now);
    main.update(dt, { frozen: frozen || reduced });
    frameShared(shared, camera, renderer, renderer.getPixelRatio(), now, pose);
    renderer.render(scene, camera);
  }

  function offscreen() {
    if (!dock.rect || dock.q < 0.999) return false;
    return dock.rect.bottom < -60 || dock.rect.top > innerHeight + 60;
  }

  function adapt(nowMs, dtMs) {
    // watch the first second of real frames; a slow machine gets fewer pixels, not a slideshow
    frames.ms.push(dtMs);
    if (frames.ms.length < 50) return;
    const sorted = frames.ms.slice().sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    frames.ms.length = 0;
    frames.median = med;
    if (med > 24 && dpr > 1) {
      dpr = Math.max(1, dpr - 0.25);
      renderer.setPixelRatio(dpr);
      size();
    }
  }

  let lastDtMs = 16;
  function loop(nowMs) {
    requestAnimationFrame(loop);
    if (!running || !visible || document.hidden) { last = nowMs; return; }
    const off = offscreen();
    canvas.style.visibility = off ? 'hidden' : 'visible';
    if (off) { last = nowMs; return; }
    lastDtMs = nowMs - last;
    const { dt } = step(nowMs);
    drawFrame(dt);
    adapt(nowMs, lastDtMs);
  }

  canvas.classList.add('ready');
  requestAnimationFrame(loop);
  onReady && onReady();

  const packStats = { main: mainP.stats, atlas: atlas.canvas.width, tier };
  if (goldInfo.leadA) goldM.material.uniforms.uLeadA.value.fromArray(goldInfo.leadA);
  return {
    camera, renderer, main, minis, shared,
    get act() { return act; },
    setAct(k, { touring: t = false } = {}) { actTarget = k; touring = t; },
    wrapTour(by) { act -= by; actTarget -= by; },
    setDock(q, rect, corner = 0) { dock.q = q; dock.rect = rect; dock.corner = corner; },
    // the approval states
    perk() { perkT = now; },
    surge() { surgeT = now; sendT = now; return new Promise((res) => setTimeout(res, reduced ? 50 : 1300)); },
    flicker() { flickerT = now; },
    strain() { strainT = now; },
    closeEyes() { main.blinkHold = reduced ? 0.5 : 2.0; },
    isBusy() { return now - sendT < 1.2; },
    pause(on) { running = !on; },
    stats() {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return { ...packStats, dpr, medianFrameMs: frames.median, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown' };
    },
    // a deterministic frame for checks and captures
    renderAt(k, t) { act = k; actTarget = k; now = t; main.time = t; drawFrame(0, false); },
  };
}
