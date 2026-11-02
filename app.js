// Ray K. · the harness. Demos, motion and the register. router.js and model.json are untouched.
import { classify } from './router.js';
import { createStage } from './scene.js';

// The one place the profile link lives. Swap it here.
const PROFILE_URL = 'https://www.upwork.com/freelancers/~01b7901955d36b88ee';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const G = window.gsap || null;
const ST = window.ScrollTrigger || null;
if (G && ST) G.registerPlugin(ST);
if (G && window.SplitText) G.registerPlugin(window.SplitText);
const motion = !!(G && ST) && !reduced;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const film = new URLSearchParams(location.search).has('film'); // recording mode: no grain at all
if (film) document.documentElement.classList.add('film');

$$('a[data-profile]').forEach((a) => { a.href = PROFILE_URL; a.rel = 'noopener'; });

// ---------- the stage ----------
const stageWrap = $('#stage-wrap');
let stage = null;
try {
  stage = createStage($('#stage'), { reduced, grain: film ? 0 : 0.012 });
} catch (e) {
  stage = null;
}
if (stage) {
  stage.setAnchors($('#hero'), $('#anchor-gate'));
  requestAnimationFrame(() => requestAnimationFrame(() => stageWrap.classList.add('live')));
} else {
  stageWrap.classList.add('nogl');
}

// ---------- smooth scroll ----------
let lenis = null;
if (motion && window.Lenis) {
  lenis = new window.Lenis({ lerp: 0.11, smoothWheel: true });
  lenis.on('scroll', ST.update);
  G.ticker.add((t) => lenis.raf(t * 1000));
  G.ticker.lagSmoothing(0);
}
const scrollTo = (target) => {
  if (lenis) lenis.scrollTo(target, { offset: -24, duration: 1.4 });
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

// ---------- the harness sequence ----------
const labels = $$('#labels li');
const heroClose = $('#hero-close');
let seqProgress = 0;
const labelState = new Map();
function showLabel(li, on) {
  if (labelState.get(li) === on) return;
  labelState.set(li, on);
  if (!G || reduced) { li.classList.toggle('is-on', on); return; }
  if (on) {
    li.classList.add('is-on');
    G.fromTo(li, { opacity: 0, y: -14 }, { opacity: 1, y: 0, duration: 0.55, ease: 'back.out(2.2)', overwrite: true });
  } else {
    G.to(li, { opacity: 0, y: -8, duration: 0.25, ease: 'power2.in', overwrite: true, onComplete: () => li.classList.remove('is-on') });
  }
}
let closeShown = null;
function showClose(on) {
  if (closeShown === on) return;
  closeShown = on;
  if (!G || reduced) { heroClose.classList.toggle('is-on', on); return; }
  if (on) {
    heroClose.classList.add('is-on');
    G.fromTo(heroClose.children, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.1, overwrite: true });
  } else {
    G.to(heroClose.children, { opacity: 0, y: 10, duration: 0.3, overwrite: true, onComplete: () => heroClose.classList.remove('is-on') });
  }
}
function setSequence(p) {
  seqProgress = p;
  if (stage) stage.setSequence(p);
  for (const li of labels) showLabel(li, p >= parseFloat(li.dataset.at));
  showClose(p >= 0.9);
}
// labels follow their anchors on the horse (on phones they are a static strip under it)
const phoneLabels = matchMedia('(max-width: 900px)');
function placeLabels() {
  requestAnimationFrame(placeLabels);
  if (!stage) return;
  if (phoneLabels.matches) { for (const li of labels) { li.style.left = ''; li.style.top = ''; li.style.visibility = ''; } return; }
  for (const li of labels) {
    const pt = stage.project(parseFloat(li.dataset.u), parseFloat(li.dataset.v));
    li.style.left = `${pt.x.toFixed(1)}px`;
    li.style.top = `${pt.y.toFixed(1)}px`;
    li.style.visibility = pt.inside && li.classList.contains('is-on') ? 'visible' : 'hidden';
  }
}
if (stage) placeLabels(); else labels.forEach((li) => { li.hidden = true; });

if (motion) {
  document.documentElement.classList.add('js-motion');
  try {
    ST.create({
      trigger: '#hero', start: 'top top', end: '+=320%', pin: true, pinSpacing: true, scrub: 0.6, anticipatePin: 1,
      onUpdate: (self) => setSequence(self.progress),
    });
    setSequence(0);
    const revealHero = () => {
      const h1 = $('#h1');
      let lines = null;
      if (window.SplitText) {
        try { lines = window.SplitText.create(h1, { type: 'lines', mask: 'lines', linesClass: 'line' }).lines; } catch (e) { lines = null; }
      }
      const tl = G.timeline({ defaults: { ease: 'power4.out' } });
      if (lines && lines.length) tl.from(lines, { yPercent: 112, duration: 1.15, stagger: 0.085 }, 0.3);
      else tl.from(h1, { opacity: 0, y: 24, duration: 1.0 }, 0.3);
      tl.to('.hero .reveal', { opacity: 1, y: 0, duration: 1.0, stagger: 0.12 }, 0.6);
    };
    G.set('.hero .reveal', { y: 18 });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(revealHero); else revealHero();

    $$('.sec').forEach((sec) => {
      const items = $$(':scope > .sec-head > .sec-mark, :scope > .sec-head > .h2, :scope > .sec-head > .sec-lede, :scope > .sec-mark, :scope > .h2', sec);
      if (!items.length) return;
      G.set(items, { y: 22 });
      G.to(items, { opacity: 1, y: 0, duration: 1.0, ease: 'power3.out', stagger: 0.1, scrollTrigger: { trigger: sec, start: 'top 76%', once: true } });
    });
    $$('.piece').forEach((p) => {
      G.set(p, { y: 34 });
      G.to(p, { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out', scrollTrigger: { trigger: p, start: 'top 84%', once: true } });
      const img = $('.piece-fig img', p);
      if (img) G.fromTo(img, { yPercent: -7 }, { yPercent: 7, ease: 'none', scrollTrigger: { trigger: p, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    [['.results', 'top 82%'], ['.hire-grid', 'top 82%'], ['.btn-big', 'top 90%']].forEach(([sel, start]) => {
      const el = $(sel);
      if (!el) return;
      G.set(el, { y: 22 });
      G.to(el, { opacity: 1, y: 0, duration: 1.0, ease: 'power3.out', scrollTrigger: { trigger: el, start, once: true } });
    });
  } catch (e) {
    document.documentElement.classList.remove('js-motion');
    setSequence(1);
  }
} else {
  setSequence(1);
}

// nav: mark the section in view
const navLinks = $$('.nav a');
const spy = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    navLinks.forEach((a) => a.classList.toggle('is-current', a.dataset.nav === en.target.id));
  }
}, { rootMargin: '-40% 0px -55% 0px' });
['approval', 'sorting', 'work', 'hire'].forEach((id) => { const el = document.getElementById(id); if (el) spy.observe(el); });

// ---------- sound: off until asked for ----------
const soundBtn = $('#sound');
let soundOn = false;
try { soundOn = localStorage.getItem('rk-sound') === '1'; } catch (e) { soundOn = false; }
let actx = null;
const setSound = (on) => {
  soundOn = on;
  soundBtn.setAttribute('aria-pressed', String(on));
  $('.sound-text', soundBtn).textContent = on ? 'Sound on' : 'Sound off';
  try { localStorage.setItem('rk-sound', on ? '1' : '0'); } catch (e) { /* private window */ }
};
setSound(soundOn);
soundBtn.addEventListener('click', () => { setSound(!soundOn); if (soundOn) thump(0.5); });
function thump(level = 1) {
  // a low, soft sound of leather taking weight; no high clicks
  if (!soundOn) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime;
    const o = actx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 * level, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.32);
    const len = Math.floor(actx.sampleRate * 0.12);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    const src = actx.createBufferSource(); src.buffer = buf;
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g2 = actx.createGain(); g2.gain.value = 0.18 * level;
    src.connect(lp).connect(g2).connect(actx.destination); src.start(t + 0.01);
  } catch (e) { /* no audio, no problem */ }
}

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
      <button type="button" class="btn btn-dark approve">Approve</button>
      <button type="button" class="btn btn-ghost-dark reject">Reject</button>
      <button type="button" class="btn btn-brass send" hidden>Send once</button>
      <button type="button" class="btn btn-ghost-dark retry" hidden>Agent tries again</button>
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
    send.focus();
  });
  reject.addEventListener('click', () => {
    record(`${draft.id} rejected by you. Nothing was sent, and it can't be approved later.`, 'good');
    setState('rejected');
    if (stage) stage.dim();
  });
  send.addEventListener('click', async () => {
    if (stage && stage.isBusy()) return;
    send.disabled = true;
    const done = () => {
      thump();
      sentCount += 1;
      sentEl.textContent = String(sentCount).padStart(2, '0');
      record(`${draft.id} sent once: "${text.value.trim().slice(0, 44)}…" The claim is spent.`, 'good');
      setState('sent');
      retry.focus();
    };
    if (stage) {
      const p = stage.surge();
      setTimeout(done, reduced ? 60 : 520);   // the stamp lands as the head comes up
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
  const padL = 16 * dpr, padR = 16 * dpr, padT = 52 * dpr, padB = 14 * dpr;
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
function drawRack() {
  const L = layout();
  const { w, h, dpr } = L;
  ctx.clearRect(0, 0, w, h);
  const n = current ? current.length : COLS * ROWS;
  // the rack: a slab with 150 openings
  ctx.fillStyle = '#17181b';
  ctx.fillRect(L.padL - 6 * dpr, L.padT - 6 * dpr, L.innerW + 12 * dpr, L.rackH + 12 * dpr);
  for (let i = 0; i < n; i++) {
    const s = slotRect(i, L);
    const inset = 1.6 * dpr;
    const x = s.x + inset, y = s.y + inset, sw = s.w - inset * 2, sh = s.h - inset * 2;
    // the dark opening
    ctx.fillStyle = '#0a0b0c';
    ctx.fillRect(x, y, sw, sh);
    // the slip of paper inside: brighter where the classifier puts weight
    const p = current ? current[i] : 0;
    const a = 0.05 + 0.75 * scaleP(p);
    const rank = topIdx.indexOf(i);
    ctx.fillStyle = rank === 0 ? `rgba(236,232,225,${Math.min(1, a + 0.2)})` : `rgba(226,220,208,${a})`;
    const ph = Math.max(2 * dpr, sh * (0.18 + 0.5 * scaleP(p)));
    ctx.fillRect(x + sw * 0.18, y + sh - ph, sw * 0.64, ph);
    // the top edge catching light
    ctx.fillStyle = 'rgba(236,232,225,.09)';
    ctx.fillRect(s.x, s.y, s.w, 1 * dpr);
  }
  // the tray for a person
  ctx.fillStyle = '#121315';
  ctx.fillRect(L.padL - 6 * dpr, L.trayY, L.innerW + 12 * dpr, L.trayH);
  ctx.fillStyle = 'rgba(201,167,101,.85)';
  ctx.fillRect(L.padL - 6 * dpr, L.trayY, L.innerW + 12 * dpr, 1.2 * dpr);
  ctx.font = `${9.5 * dpr}px "Martian Mono", ui-monospace, monospace`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(201,167,101,.9)';
  ctx.fillText('FOR A PERSON', L.padL + 8 * dpr, L.trayY + L.trayH / 2);
  // the message, dropping or resting
  let s = sheet;
  if (drop) {
    const u = Math.min(1, (performance.now() - drop.t0) / drop.dur);
    const e = u * u * (3 - 2 * u) * (1 - 0.18 * Math.sin(u * Math.PI));   // weight, a touch of bounce
    s = { x: drop.toX, y: drop.fromY + (drop.toY - drop.fromY) * e, w: drop.w, h: drop.h };
    if (u >= 1) { sheet = { x: drop.toX, y: drop.toY, w: drop.w, h: drop.h }; drop = null; }
  }
  if (s) {
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(s.x + 1.5 * dpr, s.y + 2 * dpr, s.w, s.h);
    ctx.fillStyle = '#ece8e1';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.fillRect(s.x, s.y + s.h - 1.5 * dpr, s.w, 1.5 * dpr);
  }
  // the strongest slot, named on the rack itself
  if (model && topIdx.length && current) {
    const i = topIdx[0];
    const r = slotRect(i, L);
    const label = `${pretty(model.labels[i])}  ${(current[i] * 100).toFixed(1)}%`;
    ctx.font = `${10 * dpr}px "Martian Mono", ui-monospace, monospace`;
    const tw = ctx.measureText(label).width;
    const cx = r.x + r.w / 2;
    const ly = L.padT - 18 * dpr;
    const right = cx + 8 * dpr + tw > w - L.padR;
    ctx.strokeStyle = 'rgba(236,232,225,.5)'; ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.moveTo(cx, r.y - 2 * dpr); ctx.lineTo(cx, ly); ctx.lineTo(right ? cx - 6 * dpr : cx + 6 * dpr, ly); ctx.stroke();
    ctx.fillStyle = 'rgba(236,232,225,.95)';
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
        if (Math.abs(d) > 1e-6) { current[i] += d * (reduced ? 1 : 0.22); moving = true; }
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
  drop = { fromY: L.padT - 40 * L.dpr, toX, toY, w, h, t0: performance.now(), dur: reduced ? 1 : 520 };
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
  })
  .catch(() => { verdict.textContent = "The model didn't load. Reload the page to try again."; });

// ---------- dev hooks ----------
window.__stage = stage;
window.__seq = setSequence;
