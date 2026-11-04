// Ray K. · the blob. Demos, motion and the register. router.js and model.json are untouched.
import { classify } from './router.js';
import { createStage } from './stage.js';

// The one place the profile link lives. Swap it here.
const PROFILE_URL = 'https://www.upwork.com/freelancers/~01b7901955d36b88ee';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const G = window.gsap || null;
const ST = window.ScrollTrigger || null;
if (G && ST) G.registerPlugin(ST);
const motion = !!(G && ST) && !reduced;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

$$('a[data-profile]').forEach((a) => { a.href = PROFILE_URL; a.rel = 'noopener'; });

// ---------- the stage: created once the model is here, because its strands are the model's numbers ----------
const stageWrap = $('#stage-wrap');
let stage = null;
const params = new URLSearchParams(location.search);
const hasGL = (() => { try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch (e) { return false; } })();
if (!hasGL || params.has('nogl')) stageWrap.classList.add('nogl');
if (params.get('face')) document.documentElement.dataset.face = params.get('face');

// ---------- smooth scroll ----------
let lenis = null;
if (motion && window.Lenis) {
  lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true });
  lenis.on('scroll', ST.update);
  G.ticker.add((t) => lenis.raf(t * 1000));
  G.ticker.lagSmoothing(0);
}
const scrollTo = (target) => {
  if (lenis) lenis.scrollTo(target, { offset: -24, duration: 1.8 });
  else target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
};
$$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const id = a.getAttribute('href').slice(1);
  const el = id ? document.getElementById(id) : null;
  if (!el) return;
  e.preventDefault();
  history.replaceState(null, '', `#${id}`);
  scrollTo(el);
}));

// ---------- the acts ----------
const LINES = ['read the whole thread.', 'pick up new skills.', 'run a small crew.', 'work in a harness.', 'just work.'];
const lineEls = [$('#line-a'), $('#line-b')];
const heroCopy = $('.hero-copy');
const heroClose = $('#hero-close');
const heroNote = $('#hero-note');
const N_ACTS = 6;                  // five acts, then the close on its own beat
const TOUR_SECONDS = 8.5;          // a visitor who sits still gets one act every this many seconds
let shownLine = -1, front = 0, lineTween = null;

function setLine(i, instant = false) {
  if (i === shownLine) return;
  shownLine = i;
  const incoming = lineEls[1 - front], outgoing = lineEls[front];
  front = 1 - front;
  incoming.textContent = LINES[i];
  if (instant || !G || reduced) {
    outgoing.style.cssText = 'opacity:0'; incoming.style.cssText = 'opacity:1;--m:1';
    return;
  }
  G.killTweensOf(lineEls);
  // out in 0.8 s; in over 1.3 s, a soft mask running down the line; no bounce
  G.fromTo(outgoing, { opacity: 1, y: 0 }, { opacity: 0, y: '-0.1em', duration: 0.8, ease: 'sine.inOut' });
  G.fromTo(incoming, { opacity: 1, y: '0.1em', '--m': 0 }, { opacity: 1, y: 0, '--m': 1, duration: 1.3, delay: 0.1, ease: 'sine.inOut' });
}
let closeShown = false;
function setClose(on, instant = false) {
  if (closeShown === on) return;
  closeShown = on;
  heroCopy.classList.toggle('is-close', on);
  $('#hero').classList.toggle('is-close', on);
  if (!G || reduced || instant) { heroClose.style.opacity = on ? 1 : 0; return; }
  G.to(heroClose, { opacity: on ? 1 : 0, y: on ? 0 : 10, duration: 1.2, ease: 'sine.inOut', overwrite: true });
  G.to(['.stem', '#line'], { opacity: on ? 0 : 1, duration: 1.0, ease: 'sine.inOut', overwrite: true });
}
let noteShown = false;
function setNote(on) {
  if (noteShown === on) return;
  noteShown = on;
  heroCopy.classList.toggle('is-macro', on);
  if (!G || reduced) { heroNote.style.opacity = on ? 1 : 0; return; }
  G.to(heroNote, { opacity: on ? 1 : 0, y: on ? 0 : 6, duration: 1.1, ease: 'sine.inOut', overwrite: true });
}
// in the macro the drawing dissolves under the copy, from before the camera arrives until it is well away
let fadeOn = false, lastK = 0;
function setFade(on) {
  if (fadeOn === on) return;
  fadeOn = on;
  if (!G || reduced) return;
  G.to($('#stage'), { '--fade': on ? 0 : 1, duration: on ? 0.9 : 1.8, ease: 'sine.inOut', overwrite: 'auto' });
}
function presentAct(k) {
  setLine(Math.min(4, Math.max(0, Math.floor(k + 0.02))));
  setNote(k > 1.3 && k < 1.98);
  const backward = k < lastK - 0.0005;
  lastK = k;
  setFade(k > 0.84 && k < (backward || fadeOn && k > 2.3 && backward ? 2.58 : 2.3));
  setClose(k >= 5.2);
}

// tour: acts advance on their own at the top; once the visitor scrolls, acts never jump backward:
// act = max(tour, scroll) until the scroll catches up, then the scroll alone
const driver = { tour: 0, touring: !reduced, scroll: 0, floor: 0, idle: 0 };
function driveActs(dt) {
  if (driver.touring) {
    driver.tour += dt / TOUR_SECONDS;
    if (driver.tour >= 5) { driver.tour -= 5; if (stage) stage.wrapTour(5); }
  } else if (driver.scroll <= 0.0005) {
    // back at the very top and left alone: the tour picks up from where things stand
    driver.idle += dt;
    if (driver.idle > 7) { driver.touring = true; driver.tour = Math.min(4.99, driver.floor); driver.floor = 0; }
  } else {
    driver.idle = 0;
  }
  if (driver.floor && driver.scroll >= driver.floor) driver.floor = 0;
  const k = driver.touring ? driver.tour : Math.max(driver.floor, driver.scroll);
  if (stage) stage.setAct(k, { touring: driver.touring });
  // the copy follows what the camera is actually showing, not the scrollbar
  presentAct(stage ? stage.act : k);
}
function onScrollAct(p) {
  driver.scroll = p * N_ACTS;
  if (driver.touring && p > 0.0015) { driver.touring = false; driver.floor = driver.tour; driver.idle = 0; }
}

// the drop: once the hero lets go, the blob travels with a damped follower to the approval slot
const anchorGate = $('#anchor-gate');
// Where the blob is. It drops to the approval slot, then to the sorting section, leaves during the work,
// and ends beside Hire. It glides between docks, and it fades before reaching the bar, so it is never clipped.
const phoneQ = matchMedia('(max-width: 900px)');
const anchorSort = $('#anchor-sort');
const anchorHire = $('#anchor-hire');
const hireBtn = $('.btn-big');
const BAR_LINE = 76;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth01 = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, bottom: r.bottom }; };
let dockCur = null, dockName = 'gate', dockAt = 0, presence = 1, dockLast = performance.now();
function rackGazePoint() {
  if (topIdx === undefined || !topIdx.length) return null;
  const L = layout(), c = canvas.getBoundingClientRect();
  const tray = verdict.classList.contains('is-person');
  const s = tray ? { x: L.padL, y: L.trayY, w: L.innerW, h: L.trayH } : slotRect(topIdx[0], L);
  return { x: c.left + (s.x + s.w / 2) / L.dpr, y: c.top + (s.y + s.h / 2) / L.dpr };
}
function driveDock() {
  if (!stage) return;
  const nowT = performance.now(), dt = Math.min(0.1, (nowT - dockLast) / 1000);
  dockLast = nowT;
  const H = innerHeight, phone = phoneQ.matches;
  const gate = box(anchorGate), sort = box(anchorSort), hire = box(anchorHire);
  if (gate.width < 10) return;
  const q = 1 - clamp01((gate.top - 84) / Math.max(1, H * 0.96));
  const hasSort = sort.width > 10;
  let name = 'gate', want = 1, target = gate, lead = null, gaze = null;
  if (hire.top < H * 0.74) {
    name = 'hire'; target = hire;
    const b = hireBtn.getBoundingClientRect();
    lead = phone ? { x: b.left + b.width / 2, y: b.bottom + 2 } : { x: b.right + 3, y: b.top + b.height / 2 };
    want = phone ? smooth01(BAR_LINE - 16, BAR_LINE + 44, hire.top) : 1;
  } else if (hasSort && sort.top < H * 0.66) {
    name = 'sort'; target = sort;
    // full strength while it sits beside the heading; it fades only as it passes under the bar
    want = smooth01(BAR_LINE - 30, BAR_LINE + 24, sort.top);
    gaze = rackGazePoint();
    lead = { x: sort.left + sort.width * 0.16, y: sort.top + sort.height * 1.0 };
  } else {
    // the approval slot; on a wide screen it is held below the bar until the next dock takes over
    if (phone) want = smooth01(BAR_LINE - 16, BAR_LINE + 44, gate.top);
    else {
      target = { ...gate, top: Math.max(gate.top, BAR_LINE), bottom: Math.max(gate.bottom, BAR_LINE + gate.height) };
      // the slot lets go at the end of the drafts: fade there, before the register can scroll under it
      want = smooth01(40, 84, gate.top);
    }
    lead = phone ? { x: gate.left + 8, y: gate.bottom + 6 } : { x: gate.left - 26, y: target.top + gate.height * 0.82 };
  }
  if (name !== dockName) { dockName = name; dockAt = nowT; if (presence < 0.03) { dockCur = null; dockAt = nowT - 1800; } }
  // fading out while the next dock is far away: stay put, never race across the screen
  if (dockCur && want === 0 && Math.abs(target.top - dockCur.top) > H * 0.5) target = dockCur;
  if (!dockCur) { dockCur = { ...target }; stage.setDock(q, dockCur, lead); stage.snapLead(); }
  const settle = smooth01(0, 1.8, (nowT - dockAt) / 1000);
  const tau = reduced ? 0.0001 : 0.95 + (0.05 - 0.95) * settle;
  const k = 1 - Math.exp(-dt / tau);
  for (const f of ['left', 'top', 'width', 'height']) dockCur[f] += (target[f] - dockCur[f]) * k;
  dockCur.bottom = dockCur.top + dockCur.height;
  presence += (want - presence) * (reduced ? 1 : 1 - Math.exp(-dt / 0.3));
  if (presence < 0.004 && want === 0) presence = 0;
  stageWrap.style.opacity = (presence * stage.fadeMul).toFixed(3);
  stage.setShown(presence > 0.002);
  stage.setDock(q, dockCur, lead);
  stage.setGazeAt(gaze);
}
// the hero's copy lets go as the page moves on, before it can reach the bar
let heroST = null;
function driveHeroCopy() {
  if (!heroST) return;
  const past = scrollY - heroST.end;
  heroCopy.style.opacity = past > 0 ? (1 - clamp01(past / (innerHeight * 0.16))).toFixed(3) : '';
}

if (motion) {
  document.documentElement.classList.add('js-motion');
  try {
    heroST = ST.create({ trigger: '#hero', start: 'top top', end: '+=520%', pin: true, pinSpacing: true, onUpdate: (self) => onScrollAct(self.progress) });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => G.to('.hero .reveal', { opacity: 1, y: 0, duration: 1.4, stagger: 0.18, ease: 'sine.out', delay: 0.3 }));
    else G.to('.hero .reveal', { opacity: 1, y: 0, duration: 1.4 });
    G.set('.hero .reveal', { y: 10 });
    $$('.sec').forEach((sec) => {
      const items = $$(':scope > .sec-head > .h2, :scope > .sec-head > .sec-lede, :scope > .sec-inner > .hire-copy > .h2', sec);
      if (!items.length) return;
      G.set(items, { y: 16 });
      G.to(items, { opacity: 1, y: 0, duration: 1.3, ease: 'sine.out', stagger: 0.12, scrollTrigger: { trigger: sec, start: 'top 78%', once: true } });
    });
    $$('.piece').forEach((p) => {
      G.set(p, { y: 22 });
      G.to(p, { opacity: 1, y: 0, duration: 1.4, ease: 'sine.out', scrollTrigger: { trigger: p, start: 'top 86%', once: true } });
    });
    [['.results', 'top 84%'], ['.hire-grid', 'top 84%'], ['.btn-big', 'top 92%']].forEach(([sel, start]) => {
      const el = $(sel);
      if (!el) return;
      G.set(el, { y: 16 });
      G.to(el, { opacity: 1, y: 0, duration: 1.3, ease: 'sine.out', scrollTrigger: { trigger: el, start, once: true } });
    });
    let lastT = performance.now();
    G.ticker.add(() => { const n = performance.now(); driveActs(Math.min(0.1, (n - lastT) / 1000)); lastT = n; driveDock(); driveHeroCopy(); });
  } catch (e) {
    document.documentElement.classList.remove('js-motion');
  }
}
if (!motion) {
  // no pin, no tour: the sentence, the close and the blob at rest, all at once
  setLine(4, true);
  document.documentElement.classList.add('still');
  heroClose.style.opacity = 1;
  const tick = () => { if (stage) { stage.setAct(4.9); driveDock(); } };
  addEventListener('scroll', tick, { passive: true });
  addEventListener('resize', tick);
  setInterval(tick, 400);
}

// nav: mark the section in view
const navLinks = $$('.nav a');
const spy = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    navLinks.forEach((a) => a.classList.toggle('is-current', a.dataset.nav === en.target.id));
  }
}, { rootMargin: '-40% 0px -55% 0px' });
['hero', 'approval', 'sorting', 'work', 'hire'].forEach((id) => { const el = document.getElementById(id); if (el) spy.observe(el); });

// ---------- the register: numbered, append-only, hash-chained ----------
const log = $('#log');
let prevHash = '0'.repeat(16);
let entryNo = 0;
async function digest(s) {
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0').repeat(2);
}
let chain = Promise.resolve();
function record(text, kind = '') {
  chain = chain.then(async () => {
    entryNo += 1;
    const h = await digest(`${prevHash}|${entryNo}|${text}`);
    prevHash = h;
    const li = document.createElement('li');
    if (kind) li.className = kind;
    const no = document.createElement('span'); no.className = 'no'; no.textContent = String(entryNo).padStart(2, '0');
    const hash = document.createElement('span'); hash.className = 'hash'; hash.textContent = h.slice(0, 6);
    const body = document.createElement('span'); body.textContent = text;
    li.append(no, hash, body);
    log.prepend(li);
  });
  return chain;
}

// ---------- the drafts ----------
const DRAFTS = [
  { id: 'apr_4f2a', channel: 'email', to: 'dana@example.com',
    why: "The enquiry has no budget, so it can't be qualified yet.",
    body: 'Hi Dana, thanks for writing in. Before I quote the office move, could you tell me roughly what budget you have in mind?' },
  { id: 'apr_91c7', channel: 'whatsapp', to: '+1 555 0100',
    why: 'A new lead came in on Saturday and the team is off until Monday.',
    body: 'Thanks for messaging. The team is back Monday at 9, and someone will confirm your booking then.' },
  { id: 'apr_c03e', channel: 'email', to: 'accounts@vendor-payments.example',
    why: "An email asked us to pay invoice 1182 to a new bank account. It came from an unfamiliar address, so I'd check this one first.",
    body: 'Thanks, we have updated our records with your new bank details and will pay invoice 1182 today.' },
];
const STAMP = { pending: '', approved: 'Approved', sent: 'Sent · once', rejected: 'Rejected' };
const drafts = $('#drafts');
const sentEl = $('#sent');
let sentCount = 0;

function renderDraft(draft, n) {
  const li = document.createElement('li');
  li.className = 'draft';
  li.dataset.state = 'pending';
  li.innerHTML = `
    <div class="draft-head"><span class="draft-id"></span><span class="draft-to"></span></div>
    <p class="draft-why"></p>
    <textarea class="draft-text" rows="3" spellcheck="false"></textarea>
    <div class="draft-acts">
      <button type="button" class="btn btn-solid approve">Approve</button>
      <button type="button" class="btn reject">Reject</button>
      <button type="button" class="btn btn-solid send" hidden>Send once</button>
      <button type="button" class="btn retry" hidden>Agent tries again</button>
    </div>
    <span class="stamp" aria-live="polite"></span>`;
  $('.draft-id', li).textContent = `Draft ${n} · ${draft.id}`;
  $('.draft-to', li).textContent = `${draft.channel} → ${draft.to}`;
  $('.draft-why', li).textContent = draft.why;
  const text = $('.draft-text', li);
  text.value = draft.body;
  text.setAttribute('aria-label', `Draft ${n} to ${draft.to}. You can edit it before approving.`);
  const [approve, reject, send, retry] = ['approve', 'reject', 'send', 'retry'].map((c) => $(`.${c}`, li));
  const stamp = $('.stamp', li);
  const setState = (state) => {
    li.dataset.state = state;
    draft.state = state;
    text.readOnly = state !== 'pending';
    approve.hidden = reject.hidden = state !== 'pending';
    send.hidden = state !== 'approved';
    retry.hidden = state !== 'sent';
    stamp.textContent = STAMP[state];
    stamp.classList.remove('is-down'); void stamp.offsetWidth; if (state !== 'pending') stamp.classList.add('is-down');
  };
  approve.addEventListener('click', () => {
    const edited = text.value.trim() !== draft.body;
    record(`${draft.id} approved by you${edited ? ', with your edits. Your wording is what goes out.' : '.'}`, 'good');
    setState('approved');
    if (stage) stage.perk();
    send.focus();
  });
  reject.addEventListener('click', () => {
    record(`${draft.id} rejected by you. Nothing was sent, and it can't be approved later.`, 'good');
    setState('rejected');
    if (stage) stage.closeEyes();
  });
  send.addEventListener('click', async () => {
    if (stage && stage.isBusy()) return;
    send.disabled = true;
    const done = () => {
      sentCount += 1;
      sentEl.textContent = String(sentCount).padStart(2, '0');
      record(`${draft.id} sent once: "${text.value.trim().slice(0, 44)}…" The claim is spent.`, 'good');
      setState('sent');
      retry.focus();
    };
    if (stage) {
      const p = stage.surge();
      setTimeout(done, reduced ? 60 : 900);   // the stamp lands as the thread takes the draft
      await p;
    } else {
      done();
    }
    send.disabled = false;
  });
  retry.addEventListener('click', () => {
    record(`${draft.id} retry refused: already claimed. Nothing goes out twice.`, 'bad');
    stamp.classList.remove('is-down'); void stamp.offsetWidth; stamp.classList.add('is-down');
    if (stage) stage.flicker();
  });
  draft.state = 'pending';
  record(`${draft.id} queued by the agent: ${draft.channel} to ${draft.to}. Waiting for a person.`);
  return li;
}
DRAFTS.forEach((d, i) => drafts.append(renderDraft(d, i + 1)));

$('#self-approve').addEventListener('click', () => {
  record('Agent called approve(). Refused: the agent has no such tool.', 'bad');
  if (stage) stage.strain();
});

// ---------- the sorter: 150 pigeonholes and one tray ----------
const message = $('#message');
const verdict = $('#verdict');
const peaks = $('#peaks');
const note = $('#model-note');
const thresholdCap = $('#threshold-cap');
const canvas = $('#rack');
const ctx = canvas.getContext('2d');
const COLS = 30, ROWS = 5;
let model = null;
let current = null;    // Float32Array of 150, drawn
let goal = null;
let topIdx = [];
let animating = false;
let drop = null;       // { fromY, toX, toY, w, h, t0, dur, tray }
let sheet = null;      // where the message rests: { x, y, w, h } or null

const pretty = (label) => label.replace(/_/g, ' ');
const pct = (p) => `${Math.round(p * 100)}%`;
const scaleP = (p) => Math.min(1, Math.max(0, (Math.log10(Math.max(p, 1e-5)) + 5) / 5));

function sizeCanvas() {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return { w, h, dpr };
}
function layout() {
  const { w, h, dpr } = sizeCanvas();
  const padL = 1 * dpr, padR = 1 * dpr, padT = 52 * dpr, padB = 4 * dpr;
  const innerW = w - padL - padR;
  const trayH = Math.round((h - padT - padB) * 0.17);
  const gap = 10 * dpr;
  const rackH = h - padT - padB - trayH - gap;
  const cw = innerW / COLS, ch = rackH / ROWS;
  return { w, h, dpr, padL, padR, padT, innerW, trayH, gap, rackH, cw, ch, trayY: padT + rackH + gap };
}
function slotRect(i, L) {
  const col = i % COLS, row = Math.floor(i / COLS);
  return { x: L.padL + col * L.cw, y: L.padT + row * L.ch, w: L.cw, h: L.ch };
}
const rootStyle = getComputedStyle(document.documentElement);
const INK = rootStyle.getPropertyValue('--ink-rgb').trim(), GOLD = rootStyle.getPropertyValue('--gold-rgb').trim(), GROUND = rootStyle.getPropertyValue('--ground').trim();
function drawRack() {
  const L = layout();
  const { w, h, dpr } = L;
  ctx.clearRect(0, 0, w, h);
  const n = current ? current.length : COLS * ROWS;
  // the rack, drawn in pencil: 150 openings, the slip inside each as dark as the classifier's weight on it
  for (let i = 0; i < n; i++) {
    const s = slotRect(i, L);
    const inset = 2.4 * dpr;
    const x = s.x + inset, y = s.y + inset, sw = s.w - inset * 2, sh = s.h - inset * 2;
    ctx.strokeStyle = `rgba(${INK},.2)`;
    ctx.lineWidth = 0.8 * dpr;
    ctx.strokeRect(x + 0.5, y + 0.5, sw, sh);
    const p = current ? current[i] : 0;
    const a = 0.03 + 0.8 * scaleP(p);
    const rank = topIdx.indexOf(i);
    ctx.fillStyle = `rgba(${INK},${rank === 0 ? Math.min(1, a + 0.15) : a})`;
    const ph = Math.max(1.5 * dpr, sh * (0.14 + 0.54 * scaleP(p)));
    ctx.fillRect(x + sw * 0.2, y + sh - ph - 1 * dpr, sw * 0.6, ph);
  }
  // the tray for a person
  ctx.strokeStyle = `rgba(${GOLD},.75)`;
  ctx.lineWidth = 1 * dpr;
  ctx.strokeRect(L.padL + 0.5, L.trayY + 0.5, L.innerW - 1, L.trayH - 1);
  ctx.font = `${13.5 * dpr}px "Cabinet Grotesk", "Helvetica Neue", Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(${GOLD},1)`;
  ctx.fillText('For a person', L.padL + 10 * dpr, L.trayY + L.trayH / 2);
  // the message, dropping or resting
  let s = sheet;
  if (drop) {
    const u = Math.min(1, (performance.now() - drop.t0) / drop.dur);
    const e = u * u * (3 - 2 * u);
    s = { x: drop.toX, y: drop.fromY + (drop.toY - drop.fromY) * e, w: drop.w, h: drop.h };
    if (u >= 1) { sheet = { x: drop.toX, y: drop.toY, w: drop.w, h: drop.h }; drop = null; }
  }
  if (s) {
    ctx.fillStyle = GROUND;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.strokeStyle = `rgba(${INK},.95)`;
    ctx.lineWidth = 1.1 * dpr;
    ctx.strokeRect(s.x, s.y, s.w, s.h);
  }
  // the strongest slot, named on the rack itself
  if (model && topIdx.length && current) {
    const i = topIdx[0];
    const r = slotRect(i, L);
    const label = `${pretty(model.labels[i])}  ${(current[i] * 100).toFixed(1)}%`;
    ctx.font = `${11.5 * dpr}px "Martian Mono", ui-monospace, monospace`;
    if ('fontStretch' in ctx) ctx.fontStretch = 'condensed';
    const tw = ctx.measureText(label).width;
    const cx = r.x + r.w / 2;
    const ly = L.padT - 18 * dpr;
    const right = cx + 8 * dpr + tw > w - L.padR;
    ctx.strokeStyle = `rgba(${INK},.5)`; ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.moveTo(cx, r.y - 1 * dpr); ctx.lineTo(cx, ly); ctx.lineTo(right ? cx - 6 * dpr : cx + 6 * dpr, ly); ctx.stroke();
    ctx.fillStyle = `rgba(${INK},.95)`;
    ctx.fillText(label, right ? cx - 8 * dpr - tw : cx + 8 * dpr, ly);
  }
}
function animateRack() {
  if (animating) return;
  animating = true;
  const step = () => {
    let moving = !!drop;
    if (current && goal) {
      for (let i = 0; i < current.length; i++) {
        const d = goal[i] - current[i];
        if (Math.abs(d) > 1e-6) { current[i] += d * (reduced ? 1 : 0.12); moving = true; }
      }
    }
    drawRack();
    if (moving) requestAnimationFrame(step); else animating = false;
  };
  requestAnimationFrame(step);
}
function dropInto(target, tray) {
  const L = layout();
  const w = L.cw * 0.62, h = L.ch * 0.5;
  let toX, toY;
  if (tray) { toX = L.padL + L.innerW / 2 - w / 2; toY = L.trayY + L.trayH / 2 - h / 2; }
  else { const r = slotRect(target, L); toX = r.x + (r.w - w) / 2; toY = r.y + r.h - h - 2 * L.dpr; }
  sheet = null;
  drop = { fromY: L.padT - 40 * L.dpr, toX, toY, w, h, t0: performance.now(), dur: reduced ? 1 : 900 };
}

function update() {
  if (!model) return;
  const text = message.value.trim();
  if (!text) {
    verdict.className = 'verdict'; verdict.textContent = 'Write a message to see where it goes.';
    peaks.innerHTML = '';
    goal = new Float32Array(model.labels.length); topIdx = []; sheet = null; drop = null;
    animateRack();
    return;
  }
  const ranked = classify(model, text);
  const byLabel = new Map(ranked.map((r) => [r.label, r.p]));
  goal = Float32Array.from(model.labels, (l) => byLabel.get(l) ?? 0);
  topIdx = ranked.slice(0, 3).map((r) => model.labels.indexOf(r.label));
  const best = ranked[0];
  const th = model.threshold;
  verdict.innerHTML = '';
  const why = document.createElement('small');
  if (best.p >= th) {
    verdict.className = 'verdict';
    verdict.append(`Route to: ${pretty(best.label)}`);
    why.textContent = `${pct(best.p)} sure, above the ${pct(th)} it needs to act alone.`;
    dropInto(topIdx[0], false);
  } else {
    verdict.className = 'verdict is-person';
    verdict.append('Hand this to a person');
    why.textContent = `Its best guess is "${pretty(best.label)}" at ${pct(best.p)}, below the ${pct(th)} it needs to act alone. It goes to the tray.`;
    dropInto(null, true);
  }
  verdict.append(why);
  peaks.innerHTML = '';
  ranked.slice(0, 3).forEach((r, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="pk-n"></span><span class="pk-l"></span><span class="pk-p"></span>`;
    $('.pk-n', li).textContent = String(i + 1).padStart(2, '0');
    $('.pk-l', li).textContent = pretty(r.label);
    $('.pk-p', li).textContent = `${(r.p * 100).toFixed(1)}%`;
    peaks.append(li);
  });
  animateRack();
}
message.addEventListener('input', update);
$$('.try').forEach((b) => b.addEventListener('click', () => { message.value = b.textContent; update(); message.focus(); }));
new ResizeObserver(() => { if (sheet && model) { /* re-seat the message after a resize */ const i = topIdx[0]; if (i !== undefined) dropInto(i, verdict.classList.contains('is-person')); } drawRack(); }).observe(canvas);

fetch('model.json')
  .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
  .then((m) => {
    model = m;
    current = new Float32Array(m.labels.length);
    goal = new Float32Array(m.labels.length);
    const x = m.metrics;
    thresholdCap.textContent = `threshold ${m.threshold.toFixed(2)}`;
    note.textContent = `The model running here is a pruned word-level TF-IDF, 140 weights per intent, small enough to ship in a web page. On 5,500 held-out messages it is ${(x.in_scope_accuracy * 100).toFixed(1)}% accurate on known intents, sends ${(x.out_of_scope_caught * 100).toFixed(1)}% of off-topic messages to a person, and makes a wrong automatic move ${(x.wrong_auto_rate * 100).toFixed(1)}% of the time. The JavaScript matches the Python version on 400 of 400 test messages.`;
    drawRack();
    update();
    if (hasGL && !params.has('nogl')) {
      createStage($('#stage'), { reduced, model: m })
        .then((st) => { stage = st; window.__stage = st; requestAnimationFrame(() => stageWrap.classList.add('live')); })
        .catch(() => { stageWrap.classList.add('nogl'); });
    }
  })
  .catch(() => { verdict.textContent = "The model didn't load. Reload the page to try again."; });

// ---------- dev hooks ----------
window.__stage = stage;
window.__driver = driver;
window.__labReady = true;
