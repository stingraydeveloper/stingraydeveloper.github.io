// Ray K. · the shutter. Demos, motion and the record. router.js and model.json are untouched.
import { classify } from './router.js';
import { createStage } from './scene.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
const G = window.gsap || null;
const ST = window.ScrollTrigger || null;
if (G && ST) G.registerPlugin(ST);
if (G && window.SplitText) G.registerPlugin(window.SplitText);
const motion = !!(G && ST) && !reduced;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------- the stage ----------
const stageWrap = $('#stage-wrap');
let stage = null;
try {
  stage = createStage($('#stage'), { reduced });
} catch (e) {
  stage = null;
}
if (stage) {
  stage.setAnchors($('#anchor-hero'), $('#anchor-gate'));
  stage.setYaw(-0.42);
  requestAnimationFrame(() => requestAnimationFrame(() => stageWrap.classList.add('live')));
  if (finePointer && !reduced) {
    addEventListener('pointermove', (e) => {
      stage.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    }, { passive: true });
  }
} else {
  stageWrap.classList.add('nogl');
}

// ---------- smooth scroll + scroll choreography ----------
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

if (motion) {
  document.documentElement.classList.add('js-motion');
  try {
    // hero: lines of the headline rise out of a mask once the fonts are in
    const revealHero = () => {
      const h1 = $('#h1');
      let lines = null;
      if (window.SplitText) {
        try {
          const split = window.SplitText.create(h1, { type: 'lines', mask: 'lines', linesClass: 'line' });
          lines = split.lines;
        } catch (e) { lines = null; }
      }
      const tl = G.timeline({ defaults: { ease: 'power4.out' } });
      if (lines && lines.length) tl.from(lines, { yPercent: 112, duration: 1.15, stagger: 0.085 }, 0.25);
      else tl.from(h1, { opacity: 0, y: 24, duration: 1.0 }, 0.25);
      tl.to('.hero .reveal', { opacity: 1, y: 0, duration: 1.0, stagger: 0.12 }, 0.55);
      tl.from('.plate span', { opacity: 0, x: 8, duration: .8, stagger: .08 }, 0.9);
    };
    G.set('.hero .reveal', { y: 18 });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(revealHero); else revealHero();

    // sections: marks, titles and ledes come up as they arrive
    $$('.sec').forEach((sec) => {
      const items = $$(':scope > .sec-head > .sec-mark, :scope > .sec-head > .h2, :scope > .sec-head > .sec-lede, :scope > .sec-mark, :scope > .h2', sec);
      if (!items.length) return;
      G.set(items, { y: 22 });
      G.to(items, { opacity: 1, y: 0, duration: 1.0, ease: 'power3.out', stagger: 0.1,
        scrollTrigger: { trigger: sec, start: 'top 76%', once: true } });
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
  }
}

// nav: mark the section in view
const navLinks = $$('.nav a');
const spy = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    navLinks.forEach((a) => a.classList.toggle('is-current', a.dataset.nav === en.target.id));
  }
}, { rootMargin: '-40% 0px -55% 0px' });
['gate', 'sorter', 'work', 'hire'].forEach((id) => { const el = document.getElementById(id); if (el) spy.observe(el); });

// ---------- sound: a shutter click, off until asked for ----------
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
soundBtn.addEventListener('click', () => { setSound(!soundOn); if (soundOn) click(0.6); });
function click(level = 1) {
  if (!soundOn) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime;
    const burst = (at, gain, freq) => {
      const len = Math.floor(actx.sampleRate * 0.05);
      const buf = actx.createBuffer(1, len, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      const src = actx.createBufferSource(); src.buffer = buf;
      const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 0.9;
      const g = actx.createGain(); g.gain.value = gain * level;
      src.connect(bp).connect(g).connect(actx.destination);
      src.start(at);
    };
    burst(t, 0.55, 2600);
    const o = actx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.09);
    const g2 = actx.createGain(); g2.gain.setValueAtTime(0.3 * level, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    o.connect(g2).connect(actx.destination); o.start(t); o.stop(t + 0.15);
    burst(t + 0.16, 0.35, 1900);
  } catch (e) { /* no audio, no problem */ }
}

// ---------- the record: append-only, hash-chained ----------
const log = $('#log');
let prevHash = '0'.repeat(16);
async function digest(s) {
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0x811c9dc5; // FNV-1a when there is no secure context
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0').repeat(2);
}
let chain = Promise.resolve();
function record(text, kind = '') {
  chain = chain.then(async () => {
    const h = await digest(`${prevHash}|${text}`);
    prevHash = h;
    const li = document.createElement('li');
    if (kind) li.className = kind;
    const hash = document.createElement('span'); hash.className = 'hash'; hash.textContent = h.slice(0, 6);
    const body = document.createElement('span'); body.textContent = text;
    li.append(hash, body);
    log.prepend(li);
  });
  return chain;
}

// ---------- the flash ----------
const flash = $('#flash');
function exposure() {
  if (reduced || !G) return;
  G.killTweensOf(flash);
  G.fromTo(flash, { opacity: 0 }, { opacity: 0.6, duration: 0.07, ease: 'power2.in', yoyo: true, repeat: 1, repeatDelay: 0.03 });
}

// ---------- the gate ----------
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
const STAMP = { pending: '', approved: 'Approved · cocked', sent: 'Sent · once', rejected: 'Rejected' };
const proofs = $('#proofs');
const frameEl = $('#frame');
let frames = 0;

function renderProof(draft, n) {
  const li = document.createElement('li');
  li.className = 'proof';
  li.dataset.state = 'pending';
  li.innerHTML = `
    <div class="proof-head"><span class="proof-id"></span><span class="proof-to"></span></div>
    <p class="proof-why"></p>
    <textarea class="proof-text" rows="3" spellcheck="false"></textarea>
    <div class="proof-acts">
      <button type="button" class="btn btn-dark approve">Approve</button>
      <button type="button" class="btn btn-ghost-dark reject">Reject</button>
      <button type="button" class="btn btn-brass send" hidden>Send once</button>
      <button type="button" class="btn btn-ghost-dark retry" hidden>Agent retries the send</button>
    </div>
    <span class="stamp" aria-live="polite"></span>`;
  $('.proof-id', li).textContent = `Proof ${n} · ${draft.id}`;
  $('.proof-to', li).textContent = `${draft.channel} → ${draft.to}`;
  $('.proof-why', li).textContent = draft.why;
  const text = $('.proof-text', li);
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
    if (stage) stage.cock();
    send.focus();
  });
  reject.addEventListener('click', () => {
    record(`${draft.id} rejected by you. Nothing was sent, and it can't be approved later.`, 'good');
    setState('rejected');
  });
  send.addEventListener('click', async () => {
    send.disabled = true;
    const onOpen = () => {
      exposure(); click();
      frames += 1;
      frameEl.textContent = String(frames).padStart(4, '0');
      record(`${draft.id} released once: "${text.value.trim().slice(0, 44)}…" The claim is spent.`, 'good');
      setState('sent');
      retry.focus();
    };
    if (stage) {
      const t = await stage.fire();
      if (t === undefined) { send.disabled = false; return; }
      onOpen();
    } else {
      onOpen();
    }
    send.disabled = false;
  });
  retry.addEventListener('click', () => {
    record(`${draft.id} retry refused: already claimed. Nothing goes out twice.`, 'bad');
    stamp.classList.remove('is-down'); void stamp.offsetWidth; stamp.classList.add('is-down');
  });
  draft.state = 'pending';
  record(`${draft.id} queued by the agent: ${draft.channel} to ${draft.to}. Waiting for a person.`);
  return li;
}
DRAFTS.forEach((d, i) => proofs.append(renderProof(d, i + 1)));

$('#self-approve').addEventListener('click', () => {
  record('Agent called approve(). Refused: the agent has no such tool. The release is on your side.', 'bad');
});

// ---------- the sorter ----------
const message = $('#message');
const verdict = $('#verdict');
const peaks = $('#peaks');
const note = $('#model-note');
const thresholdCap = $('#threshold-cap');
const canvas = $('#spectrum');
const ctx = canvas.getContext('2d');
let model = null;
let current = null;    // Float32Array of 150 probabilities, drawn
let goal = null;       // where they are heading
let topIdx = [];
let animating = false;

const pretty = (label) => label.replace(/_/g, ' ');
const pct = (p) => `${Math.round(p * 100)}%`;
const scaleP = (p) => Math.min(1, Math.max(0, (Math.log10(Math.max(p, 1e-5)) + 5) / 5)); // 1e-5 → 0, 1 → 1

function sizeCanvas() {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return { w, h, dpr };
}
function drawSpectrum() {
  const { w, h, dpr } = sizeCanvas();
  ctx.clearRect(0, 0, w, h);
  const padL = 18 * dpr, padR = 18 * dpr, padT = 30 * dpr, padB = 26 * dpr;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const baseY = h - padB;
  const n = current ? current.length : 150;
  // baseline and ticks every 10 intents
  ctx.strokeStyle = 'rgba(236,232,225,.16)'; ctx.lineWidth = 1 * dpr;
  ctx.beginPath(); ctx.moveTo(padL, baseY + 0.5); ctx.lineTo(w - padR, baseY + 0.5); ctx.stroke();
  ctx.strokeStyle = 'rgba(236,232,225,.22)';
  for (let i = 0; i < n; i += 10) {
    const x = padL + (innerW * i) / (n - 1);
    ctx.beginPath(); ctx.moveTo(x, baseY + 3 * dpr); ctx.lineTo(x, baseY + (i % 50 === 0 ? 10 : 6) * dpr); ctx.stroke();
  }
  if (model) {
    const ty = baseY - innerH * scaleP(model.threshold);
    ctx.save();
    ctx.setLineDash([3 * dpr, 5 * dpr]);
    ctx.strokeStyle = 'rgba(201,167,101,.75)'; ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.moveTo(padL, ty + 0.5); ctx.lineTo(w - padR, ty + 0.5); ctx.stroke();
    ctx.restore();
  }
  if (!current) return;
  const top = new Set(topIdx);
  // leader labels for the three strongest lines, drawn on the instrument itself
  if (model && topIdx.length) {
    ctx.font = `${10 * dpr}px "Martian Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'middle';
    const placed = [];
    topIdx.forEach((i, rank) => {
      const p = current[i];
      const x = Math.round(padL + (innerW * i) / (n - 1)) + 0.5;
      const yTop = baseY - innerH * scaleP(p);
      const label = `${pretty(model.labels[i])}  ${(p * 100).toFixed(1)}%`;
      const tw = ctx.measureText(label).width;
      let ly = Math.max(padT + 14 * dpr, yTop - (14 + rank * 4) * dpr);
      for (const q of placed) if (Math.abs(q - ly) < 13 * dpr) ly = q - 13 * dpr;
      placed.push(ly);
      const right = x + 10 * dpr + tw > w - padR;
      const lx = right ? x - 10 * dpr - tw : x + 10 * dpr;
      ctx.strokeStyle = rank === 0 ? 'rgba(236,232,225,.55)' : 'rgba(236,232,225,.3)';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath(); ctx.moveTo(x, yTop); ctx.lineTo(x, ly); ctx.lineTo(right ? x - 6 * dpr : x + 6 * dpr, ly); ctx.stroke();
      ctx.fillStyle = rank === 0 ? 'rgba(236,232,225,.95)' : 'rgba(236,232,225,.6)';
      ctx.fillText(label, lx, ly);
    });
  }
  for (let i = 0; i < n; i++) {
    const p = current[i];
    const x = Math.round(padL + (innerW * i) / (n - 1)) + 0.5;
    const hh = innerH * scaleP(p);
    const rank = topIdx.indexOf(i);
    if (rank === 0) { ctx.strokeStyle = 'rgba(236,232,225,1)'; ctx.lineWidth = 2 * dpr; ctx.shadowColor = 'rgba(236,232,225,.55)'; ctx.shadowBlur = 10 * dpr; }
    else if (rank > 0) { ctx.strokeStyle = 'rgba(236,232,225,.7)'; ctx.lineWidth = 1.5 * dpr; ctx.shadowBlur = 0; }
    else { ctx.strokeStyle = `rgba(110,134,166,${0.22 + 0.5 * scaleP(p)})`; ctx.lineWidth = 1 * dpr; ctx.shadowBlur = 0; }
    ctx.beginPath(); ctx.moveTo(x, baseY); ctx.lineTo(x, baseY - hh); ctx.stroke();
  }
  ctx.shadowBlur = 0;
  void top;
}
function animateSpectrum() {
  if (animating) return;
  animating = true;
  const step = () => {
    let moving = false;
    for (let i = 0; i < current.length; i++) {
      const d = goal[i] - current[i];
      if (Math.abs(d) > 1e-6) { current[i] += d * (reduced ? 1 : 0.22); moving = true; }
    }
    drawSpectrum();
    if (moving) requestAnimationFrame(step); else animating = false;
  };
  requestAnimationFrame(step);
}

function update() {
  if (!model) return;
  const text = message.value.trim();
  if (!text) {
    verdict.className = 'verdict'; verdict.textContent = 'Write a message to see where it goes.';
    peaks.innerHTML = '';
    goal = new Float32Array(model.labels.length); topIdx = [];
    animateSpectrum();
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
  } else {
    verdict.className = 'verdict is-person';
    verdict.append('Hand this to a person');
    why.textContent = `Its best guess is "${pretty(best.label)}" at ${pct(best.p)}, below the ${pct(th)} it needs to act alone.`;
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
  animateSpectrum();
}
message.addEventListener('input', update);
$$('.try').forEach((b) => b.addEventListener('click', () => { message.value = b.textContent; update(); message.focus(); }));
new ResizeObserver(() => drawSpectrum()).observe(canvas);

fetch('model.json')
  .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
  .then((m) => {
    model = m;
    current = new Float32Array(m.labels.length);
    goal = new Float32Array(m.labels.length);
    const x = m.metrics;
    thresholdCap.textContent = `threshold ${m.threshold.toFixed(2)}`;
    note.textContent = `The model running here is a pruned word-level TF-IDF, 140 weights per intent, small enough to ship in a web page. On 5,500 held-out messages it is ${(x.in_scope_accuracy * 100).toFixed(1)}% accurate on known intents, sends ${(x.out_of_scope_caught * 100).toFixed(1)}% of off-topic messages to a person, and makes a wrong automatic move ${(x.wrong_auto_rate * 100).toFixed(1)}% of the time. The JavaScript matches the Python version on 400 of 400 test messages. The brass line is where it hands off.`;
    drawSpectrum();
    update();
  })
  .catch(() => { verdict.textContent = "The model didn't load. Reload the page to try again."; });

// ---------- dev hook for the poster capture ----------
window.__stage = stage;
