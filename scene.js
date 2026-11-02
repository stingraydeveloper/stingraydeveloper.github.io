// The stage: a dark bench, one leaf shutter, one key light. Three.js r183, vendored.
// The shutter is modelled here, not loaded: nine lens-shaped blades on pivot pins, a black
// anodised barrel, a brass scale ring with engraved ticks, a release on the left of the barrel.
// Nothing passes the blades until fire() is called by a person's click.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const TAU = Math.PI * 2;
const N_BLADES = 9;
const R_PIVOT = 0.80;
const R_LEAD = 0.70;
const PSI = (60 * Math.PI) / 180;
const R_CUT = 0.86;
const BLADE_T = 0.006;
const OPEN_MAX = (48 * Math.PI) / 180;
const HOUSING_R = 0.98; // blades are clipped here: inside the housing, behind the front plate
const SHUTTER_DIAMETER = 2.26; // barrel outer, used to frame the camera

const GrainShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAmount: { value: 0.03 }, uVignette: { value: 0.38 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uAmount; uniform float uVignette;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float n = hash(vUv * 1200.0 + fract(uTime) * 41.0) - 0.5;
      float lum = dot(c.rgb, vec3(0.3, 0.59, 0.11));
      c.rgb += n * uAmount * (0.55 + 0.45 * (1.0 - smoothstep(0.0, 0.5, lum)));
      float d = distance(vUv, vec2(0.5, 0.5));
      c.rgb *= 1.0 - uVignette * smoothstep(0.32, 0.95, d);
      gl_FragColor = c;
    }`,
};

function lens() {
  // Lens shape = disk(E, R_LEAD) ∩ disk(C, R_CUT), in the shutter frame for the blade whose
  // pivot sits at angle 0. Returned with the pivot at the origin.
  // E sits 0.02 short of R_LEAD from the centre so the leading arc overshoots the centre and the
  // nine blades close without a pinhole.
  const E = new THREE.Vector2((R_LEAD - 0.02) * Math.cos(PSI), (R_LEAD - 0.02) * Math.sin(PSI));
  const C = new THREE.Vector2(0, 0);
  const d = E.distanceTo(C);
  const a = (R_CUT * R_CUT - R_LEAD * R_LEAD + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(R_CUT * R_CUT - a * a, 0));
  const u = E.clone().sub(C).divideScalar(d);
  const mid = C.clone().add(u.clone().multiplyScalar(a));
  const perp = new THREE.Vector2(-u.y, u.x);
  const I1 = mid.clone().add(perp.clone().multiplyScalar(h));
  const I2 = mid.clone().sub(perp.clone().multiplyScalar(h));
  const norm = (x) => ((x % TAU) + TAU) % TAU;
  const arc = (center, radius, from, to, through, n) => {
    const a0 = Math.atan2(from.y - center.y, from.x - center.x);
    const a1 = Math.atan2(to.y - center.y, to.x - center.x);
    const at = Math.atan2(through.y - center.y, through.x - center.x);
    let ccw = norm(a1 - a0);
    if (norm(at - a0) > ccw) ccw -= TAU;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = a0 + (ccw * i) / n;
      pts.push(new THREE.Vector2(center.x + radius * Math.cos(t), center.y + radius * Math.sin(t)));
    }
    return pts;
  };
  const lead = arc(E, R_LEAD, I2, I1, C, 56);
  const tail = arc(C, R_CUT, I1, I2, new THREE.Vector2(R_CUT * Math.cos(PSI), R_CUT * Math.sin(PSI)), 36);
  const poly = lead.slice(0, -1).concat(tail.slice(0, -1));
  const P = new THREE.Vector2(R_PIVOT, 0);
  return poly.map((p) => p.sub(P));
}

function lathe(profile, segments = 160) {
  const pts = profile.map(([r, h]) => new THREE.Vector2(r, h));
  pts.push(pts[0].clone());
  const g = new THREE.LatheGeometry(pts, segments);
  g.rotateX(Math.PI / 2); // lathe axis Y -> Z, positive height faces the camera
  return g;
}

export function createStage(canvas, options = {}) {
  const reduced = !!options.reduced;
  const isMobile = matchMedia('(max-width: 900px)').matches || matchMedia('(pointer: coarse)').matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
  } catch (e) {
    return null;
  }
  if (!renderer.capabilities.isWebGL2) { renderer.dispose(); return null; }
  const DPR = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 1.75);
  renderer.setPixelRatio(DPR);
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !isMobile;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141516);
  scene.fog = new THREE.Fog(0x141516, 5, 14);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 60);
  camera.position.set(0, 0, 7);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.7;
  pmrem.dispose();

  // ---- materials ----
  const side = THREE.DoubleSide;
  const mAnod = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0d, metalness: 0.9, roughness: 0.4, anisotropy: 0.6, clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 0.9, side });
  const mMatte = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0b, metalness: 0.7, roughness: 0.5, anisotropy: 0.7, envMapIntensity: 0.7, side });
  const mSteel = new THREE.MeshPhysicalMaterial({ color: 0x0b1630, metalness: 1.0, roughness: 0.3, anisotropy: 0.5, envMapIntensity: 1.3 });
  // The blades swing wide when they open, as real iris blades do, and disappear into the housing.
  // The housing is implied: fragments beyond HOUSING_R in the shutter's own frame are discarded.
  const shutterInv = { value: new THREE.Matrix4() };
  mSteel.onBeforeCompile = (shader) => {
    shader.uniforms.uShutterInv = shutterInv;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uShutterInv; varying vec3 vWPos;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n{ vec3 lp = (uShutterInv * vec4(vWPos, 1.0)).xyz; if (length(lp.xy) > ' + HOUSING_R.toFixed(3) + ') discard; }');
  };
  const mBrass = new THREE.MeshPhysicalMaterial({ color: 0xc9a765, metalness: 1.0, roughness: 0.32, anisotropy: 0.5, envMapIntensity: 1.05, side });
  const mChrome = new THREE.MeshStandardMaterial({ color: 0xc4c5c8, metalness: 1.0, roughness: 0.2, envMapIntensity: 1.1, side });
  const mTick = new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0.2, roughness: 0.8 });
  const mBench = new THREE.MeshStandardMaterial({ color: 0x060607, metalness: 0.0, roughness: 0.95, envMapIntensity: 0.12 });
  const mLamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff1dc), toneMapped: false });

  // ---- the shutter ----
  const shutter = new THREE.Group();
  scene.add(shutter);
  const add = (geo, mat, name, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = shadow && !isMobile;
    m.receiveShadow = false;
    shutter.add(m);
    return m;
  };
  add(lathe([[1.00, 0.335], [1.08, 0.335], [1.11, 0.305], [1.11, 0.12], [1.095, 0.10], [1.095, 0.02], [1.11, 0.0], [1.11, -0.055], [1.08, -0.085], [0.95, -0.085], [0.95, 0.0], [1.00, 0.0]]), mAnod, 'barrel');
  add(lathe([[0.56, 0.0], [0.95, 0.0], [0.95, -0.04], [0.58, -0.04], [0.56, -0.02]], 96), mMatte, 'rear', false);
  add(lathe([[0.70, -0.085], [0.98, -0.085], [0.98, -0.12], [0.72, -0.12], [0.70, -0.10]], 96), mChrome, 'flange', false);
  add(lathe([[0.64, 0.305], [0.62, 0.285], [0.62, 0.262], [0.995, 0.262], [0.995, 0.305]]), mMatte, 'plate', false);
  add(lathe([[0.665, 0.312], [0.665, 0.305], [0.775, 0.305], [0.775, 0.312]], 128), mBrass, 'ring', false);

  // engraved ticks on the brass ring
  const tickGeo = new THREE.BoxGeometry(1, 1, 1);
  const ticks = new THREE.InstancedMesh(tickGeo, mTick, 72);
  const tmp = new THREE.Object3D();
  for (let k = 0; k < 72; k++) {
    const ang = (k * TAU) / 72;
    const long = k % 6 === 0;
    const [r0, r1] = long ? [0.675, 0.765] : [0.695, 0.745];
    const rm = (r0 + r1) / 2;
    tmp.position.set(rm * Math.cos(ang), rm * Math.sin(ang), 0.3128);
    tmp.rotation.set(0, 0, ang);
    tmp.scale.set(r1 - r0, long ? 0.0075 : 0.0045, 0.0018);
    tmp.updateMatrix();
    ticks.setMatrixAt(k, tmp.matrix);
  }
  ticks.name = 'ticks';
  shutter.add(ticks);

  // knurled grip around the barrel: 144 fine ridges, the thing a thumb would turn
  const knurl = new THREE.InstancedMesh(tickGeo, mAnod, 144);
  for (let k = 0; k < 144; k++) {
    const ang = (k * TAU) / 144;
    tmp.position.set(1.108 * Math.cos(ang), 1.108 * Math.sin(ang), 0.205);
    tmp.rotation.set(0, 0, ang);
    tmp.scale.set(0.012, 0.016, 0.17);
    tmp.updateMatrix();
    knurl.setMatrixAt(k, tmp.matrix);
  }
  knurl.castShadow = !isMobile;
  shutter.add(knurl);

  // screws on the plate, pivot pins behind it, the brass index pin at twelve o'clock
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 20);
  cyl.rotateX(Math.PI / 2);
  const screws = new THREE.InstancedMesh(cyl, mChrome, 6);
  for (let k = 0; k < 6; k++) {
    const ang = (k * TAU) / 6 + 0.26;
    tmp.position.set(0.90 * Math.cos(ang), 0.90 * Math.sin(ang), 0.311);
    tmp.rotation.set(0, 0, 0);
    tmp.scale.set(0.021, 0.021, 0.012);
    tmp.updateMatrix();
    screws.setMatrixAt(k, tmp.matrix);
  }
  shutter.add(screws);
  const pins = new THREE.InstancedMesh(cyl, mChrome, N_BLADES);
  for (let i = 0; i < N_BLADES; i++) {
    const ang = (i * TAU) / N_BLADES;
    tmp.position.set(R_PIVOT * Math.cos(ang), R_PIVOT * Math.sin(ang), 0.225);
    tmp.scale.set(0.014, 0.014, 0.09);
    tmp.updateMatrix();
    pins.setMatrixAt(i, tmp.matrix);
  }
  shutter.add(pins);
  const index = add(cyl.clone(), mBrass, 'index', false);
  index.position.set(0, 0.815, 0.32);
  index.scale.set(0.016, 0.016, 0.022);

  // the release: stem and knurled knob on the left side of the barrel
  const stemGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.17, 24);
  stemGeo.rotateZ(Math.PI / 2);
  const stem = add(stemGeo, mChrome, 'stem', false);
  stem.position.set(-1.17, 0.0, 0.20);
  const knobGeo = new THREE.CylinderGeometry(0.056, 0.05, 0.075, 40);
  knobGeo.rotateZ(Math.PI / 2);
  const knob = add(knobGeo, mBrass, 'knob', false);
  knob.position.set(-1.285, 0.0, 0.20);
  const knobRest = knob.position.x;

  // the lamp behind the rear aperture; only seen through open blades
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.52, 48), mLamp);
  lamp.position.set(0, 0, -0.3);
  shutter.add(lamp);
  // a soft halo behind the barrel: the backlight leaking round the rim, and the flash when it fires
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = haloCanvas.height = 256;
  const hc = haloCanvas.getContext('2d');
  const grad = hc.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,236,210,1)');
  grad.addColorStop(0.35, 'rgba(255,220,180,0.55)');
  grad.addColorStop(0.7, 'rgba(255,200,150,0.12)');
  grad.addColorStop(1, 'rgba(255,200,150,0)');
  hc.fillStyle = grad;
  hc.fillRect(0, 0, 256, 256);
  const haloTex = new THREE.CanvasTexture(haloCanvas);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  const mHalo = new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.12 });
  const halo = new THREE.Sprite(mHalo);
  halo.position.set(0, 0, -0.5);
  halo.scale.set(3.4, 3.4, 1);
  shutter.add(halo);

  // blades
  const shape = new THREE.Shape(lens());
  const bladeGeo = new THREE.ExtrudeGeometry(shape, { depth: BLADE_T, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelSegments: 2, curveSegments: 4 });
  const blades = [];
  for (let i = 0; i < N_BLADES; i++) {
    const th = (i * TAU) / N_BLADES;
    const b = new THREE.Mesh(bladeGeo, mSteel);
    b.name = `blade${i}`;
    b.castShadow = false;
    b.position.set(R_PIVOT * Math.cos(th), R_PIVOT * Math.sin(th), 0.19 + i * (BLADE_T + 0.0008));
    b.userData.theta = th;
    shutter.add(b);
    blades.push(b);
  }

  // ---- studio ----
  const bench = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), mBench);
  bench.rotation.x = -Math.PI / 2;
  bench.position.y = -1.112;
  bench.receiveShadow = true;
  scene.add(bench);

  const key = new THREE.SpotLight(0xffd6a8, 900, 0, 0.40, 0.8, 1.35);
  key.position.set(-3.0, 4.4, 4.2);
  key.target.position.set(0, -0.1, 0.1);
  key.castShadow = !isMobile;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0006;
  key.shadow.radius = 6;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 14;
  scene.add(key, key.target);
  const rim = new THREE.SpotLight(0xffb078, 140, 0, 0.33, 0.7, 1.3);
  rim.position.set(2.2, 1.9, -2.0);
  rim.target.position.set(0.1, 0.1, 0.2);
  scene.add(rim, rim.target);
  const fill = new THREE.PointLight(0x8fb3ff, 30, 0, 1.6);
  fill.position.set(3.2, 0.3, 3.2);
  scene.add(fill);
  const back = new THREE.PointLight(0xfff1dc, 0, 0, 1.2);
  back.position.set(0, 0.1, -1.1);
  scene.add(back);

  // ---- post ----
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: isMobile ? 0 : 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const grain = new ShaderPass(GrainShader);
  composer.addPass(grain);
  composer.addPass(new OutputPass());

  // ---- state ----
  const state = { open: 0, lamp: 0, knob: 0, yaw: -0.42, pitch: 0.03, pointerX: 0, pointerY: 0, yawTarget: -0.42, yawA: -0.42, yawB: -0.18, handover: 0, lights: reduced ? 1 : 0 };
  const KEY_I = key.intensity, RIM_I = rim.intensity, FILL_I = fill.intensity;
  const anchors = { a: null, b: null, t: 0 };
  let W = 1, H = 1, aspect = 1;
  let frameCount = 0;
  let running = true;
  let lastShutterVisible = true;

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    aspect = W / H;
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(canvas.parentElement);

  function rectOf(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, top: r.top, bottom: r.bottom };
  }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function frameCamera() {
    // The shutter follows the hero's anchor until that anchor rises past the pin line, then holds
    // on screen while the page scrolls, and attaches to the gate's slot when the slot arrives.
    const ra = rectOf(anchors.a);
    const rb = rectOf(anchors.b);
    const pinY = H * (isMobile ? 0.7 : 0.52);
    let r = ra || rb;
    let t = 0;
    if (ra && rb) {
      if (ra.cy >= pinY) { r = ra; t = 0; }
      else if (rb.cy <= pinY) { r = rb; t = 1; }
      else {
        t = THREE.MathUtils.clamp((pinY - ra.cy) / (rb.cy - ra.cy), 0, 1);
        const k = ease(t);
        r = { cx: ra.cx + (rb.cx - ra.cx) * k, cy: pinY, w: ra.w + (rb.w - ra.w) * k, h: ra.h + (rb.h - ra.h) * k, top: 0, bottom: 0 };
        r.top = r.cy - r.h / 2; r.bottom = r.cy + r.h / 2;
      }
    }
    state.handover = t;
    state.yawTarget = state.yawA + (state.yawB - state.yawA) * ease(t);
    if (!r) { camera.position.set(0, 0, 7); return true; }
    const fit = Math.min(r.w, r.h) * 0.9;                // the shutter's diameter on screen, in px
    const s = Math.max(fit / H, 0.05);                    // as a fraction of viewport height
    const halfH = (SHUTTER_DIAMETER / 2) / s;             // world half-height of the view at the shutter
    const D = halfH / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const nx = (r.cx / W) * 2 - 1;
    const ny = -((r.cy / H) * 2 - 1);
    const px = state.pointerX * 0.12, py = state.pointerY * 0.06;
    camera.position.set(-nx * halfH * aspect + px, -ny * halfH + py, D);
    camera.lookAt(camera.position.x, camera.position.y, 0);
    scene.fog.near = D - 1.2;                              // the fog travels with the camera, so the
    scene.fog.far = D + 7.5;                               // shutter stays clear at any framing
    if (D > 20) { camera.far = D + 30; camera.updateProjectionMatrix(); }
    return r.bottom > -H * 0.3 && r.top < H * 1.3;        // is the shutter anywhere near the viewport
  }

  const timer = new THREE.Timer();
  function render() {
    if (!running) return;
    requestAnimationFrame(render);
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    const visible = frameCamera();
    frameCount++;
    if (!visible && frameCount % 3 !== 0) return;         // offscreen: a third of the frames keeps the grain alive
    lastShutterVisible = visible;

    const yawGoal = state.yawTarget + (reduced ? 0 : state.pointerX * 0.09);
    const pitchGoal = 0.03 + (reduced ? 0 : -state.pointerY * 0.05);
    const k = 1 - Math.exp(-dt * 6);
    state.yaw += (yawGoal - state.yaw) * k;
    state.pitch += (pitchGoal - state.pitch) * k;
    shutter.rotation.set(state.pitch, state.yaw, 0);
    shutter.updateMatrixWorld();
    shutterInv.value.copy(shutter.matrixWorld).invert();

    const a = -state.open * OPEN_MAX;
    for (const b of blades) b.rotation.z = b.userData.theta + a;
    knob.position.x = knobRest + state.knob * 0.022;
    // the studio lights come up over the first moments, so the object is found rather than shown
    if (state.lights < 1) state.lights = Math.min(1, state.lights + dt / 1.6);
    const L = state.lights * state.lights * (3 - 2 * state.lights);
    key.intensity = KEY_I * L; rim.intensity = RIM_I * L; fill.intensity = FILL_I * L;
    if ('environmentIntensity' in scene) scene.environmentIntensity = 0.7 * (0.25 + 0.75 * L);
    const glow = 0.1 + state.lamp * 7.5;
    mLamp.color.setRGB(glow, glow * 0.94, glow * 0.84);
    back.intensity = state.lamp * 420;
    mHalo.opacity = (0.12 + state.lamp * 0.85) * L;
    const hs = 3.4 + state.lamp * 2.6;
    halo.scale.set(hs, hs, 1);
    grain.uniforms.uTime.value = reduced ? 0.37 : timer.getElapsed();
    composer.render();
  }
  render();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { running = false; } else if (!running) { running = true; timer.reset(); render(); }
  });

  // ---- tiny tween helper so this module does not depend on GSAP ----
  const tweens = new Set();
  function tween(obj, key, to, ms, easing = (t) => t) {
    return new Promise((resolve) => {
      const from = obj[key];
      const t0 = performance.now();
      const step = (now) => {
        const u = Math.min(1, (now - t0) / ms);
        obj[key] = from + (to - from) * easing(u);
        if (u < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }
  const easeIn2 = (t) => t * t;
  const easeOut3 = (t) => 1 - Math.pow(1 - t, 3);
  const easeOut2 = (t) => 1 - (1 - t) * (1 - t);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  let firing = false;
  const api = {
    renderer, scene, camera, shutter, state,
    setAnchors(a, b) { anchors.a = a; anchors.b = b; },
    setBlend(t) { anchors.t = t; },
    setYaw(y) { state.yawA = y; },
    setPointer(x, y) { state.pointerX = x; state.pointerY = y; },
    cock() { return tween(state, 'knob', 1, reduced ? 1 : 380, easeOut3); },
    uncock() { return tween(state, 'knob', 0, reduced ? 1 : 300, easeOut3); },
    async fire() {
      if (firing) return;
      firing = true;
      const open = reduced ? 1 : 95, hold = reduced ? 60 : 70, close = reduced ? 1 : 300;
      await tween(state, 'knob', -1, reduced ? 1 : 90, easeIn2);
      const p1 = tween(state, 'open', 1, open, easeIn2);
      const p2 = tween(state, 'lamp', 1, open * 0.8, easeOut2);
      await Promise.all([p1, p2]);
      const fullyOpen = performance.now();
      await wait(hold);
      tween(state, 'lamp', 0, close * 1.3, easeOut3);
      await tween(state, 'open', 0, close, easeOut3);
      tween(state, 'knob', 0, reduced ? 1 : 500, easeOut3);
      firing = false;
      return fullyOpen;
    },
    snapshot(scale = 1) {
      // renders one frame and returns a PNG data URL; used to make the poster
      composer.render();
      return renderer.domElement.toDataURL('image/png');
    },
    isShutterVisible() { return lastShutterVisible; },
  };
  return api;
}
