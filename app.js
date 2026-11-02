import { classify } from "./router.js";

// ---- The approval demo: the same rules as approval-gate, in memory. ----
const DRAFTS = [
  {
    id: "apr_4f2a",
    channel: "email",
    to: "dana@example.com",
    why: "The enquiry has no budget, so it can't be qualified yet.",
    body: "Hi Dana, thanks for writing in. Before I quote the office move, could you tell me roughly what budget you have in mind?",
  },
  {
    id: "apr_91c7",
    channel: "whatsapp",
    to: "+1 555 0100",
    why: "A new lead came in on Saturday and the team is off until Monday.",
    body: "Thanks for messaging. The team is back Monday at 9, and someone will confirm your booking then.",
  },
  {
    id: "apr_c03e",
    channel: "email",
    to: "accounts@vendor-payments.example",
    why: "An email asked us to pay invoice 1182 to a new bank account. It came from an unfamiliar address, so I'd check this one first.",
    body: "Thanks, we have updated our records with your new bank details and will pay invoice 1182 today.",
  },
];

const list = document.querySelector("#drafts");
const log = document.querySelector("#log");

function say(text, kind = "") {
  const li = document.createElement("li");
  li.textContent = text;
  if (kind) li.className = kind;
  log.prepend(li);
}

const LAMP = { pending: "Locked", approved: "Released", sent: "Sent", rejected: "Stopped" };

function render(draft) {
  const li = document.createElement("li");
  li.className = "draft";
  li.dataset.state = "pending";
  li.innerHTML = `
    <div class="lever-bay" aria-hidden="true">
      <div class="lever"><span class="rod"></span><span class="quadrant"></span></div>
      <span class="lamp">${LAMP.pending}</span>
    </div>
    <div class="draft-body">
      <p class="to"></p>
      <p class="why"></p>
      <textarea rows="4"></textarea>
      <div class="acts">
        <button type="button" class="act approve">Approve</button>
        <button type="button" class="act quiet reject">Reject</button>
        <button type="button" class="act send" hidden>Send it</button>
        <button type="button" class="act quiet retry" hidden>Make the agent retry</button>
      </div>
    </div>`;
  li.querySelector(".to").textContent = `${draft.channel} to ${draft.to}`;
  li.querySelector(".why").textContent = draft.why;
  const text = li.querySelector("textarea");
  text.value = draft.body;
  text.setAttribute("aria-label", `Draft to ${draft.to}. You can edit it before approving.`);
  const [approve, reject, send, retry] = ["approve", "reject", "send", "retry"].map((c) => li.querySelector(`.${c}`));

  const setState = (state) => {
    li.dataset.state = state;
    draft.state = state;
    li.querySelector(".lamp").textContent = LAMP[state];
    text.readOnly = state !== "pending";
    approve.hidden = reject.hidden = state !== "pending";
    send.hidden = state !== "approved";
    retry.hidden = state !== "sent";
  };

  approve.addEventListener("click", () => {
    const edited = text.value.trim() !== draft.body;
    say(`${draft.id} approved by you${edited ? ", with your edits" : ""}`, "good");
    setState("approved");
    send.focus();
  });
  reject.addEventListener("click", () => {
    say(`${draft.id} rejected by you. Nothing was sent.`, "good");
    setState("rejected");
  });
  send.addEventListener("click", () => {
    say(`${draft.id} released once: "${text.value.trim().slice(0, 42)}..."`, "good");
    setState("sent");
    retry.focus();
  });
  retry.addEventListener("click", () => {
    say(`${draft.id} retry refused: already claimed. Nothing was sent twice.`, "bad");
  });
  draft.state = "pending";
  say(`${draft.id} queued by agent: ${draft.channel} to ${draft.to}`);
  return li;
}

for (const draft of DRAFTS) list.append(render(draft));

document.querySelector("#self-approve").addEventListener("click", () => {
  say('Agent called approve(). Refused: this agent has no such tool.', "bad");
});

// ---- The classifier demo. ----
const message = document.querySelector("#message");
const verdict = document.querySelector("#verdict");
const bars = document.querySelector("#bars");
const note = document.querySelector("#model-note");
let model;

const pretty = (label) => label.replace(/_/g, " ");
const pct = (p) => `${Math.round(p * 100)}%`;

function update() {
  if (!model) return;
  const text = message.value.trim();
  if (!text) {
    verdict.textContent = "Write a message to see where it goes.";
    bars.innerHTML = "";
    return;
  }
  const ranked = classify(model, text).slice(0, 3);
  const best = ranked[0];
  const threshold = model.threshold;
  if (best.p >= threshold) {
    verdict.innerHTML = "";
    verdict.append(`Route to: ${pretty(best.label)}`);
    const why = document.createElement("small");
    why.textContent = `${pct(best.p)} sure, above the ${pct(threshold)} it needs to act alone.`;
    verdict.append(why);
  } else {
    verdict.innerHTML = "";
    verdict.append("Hand this to a person");
    const why = document.createElement("small");
    why.textContent = `Its best guess is only ${pct(best.p)} sure, below the ${pct(threshold)} it needs to act alone.`;
    verdict.append(why);
  }
  bars.innerHTML = "";
  for (const row of ranked) {
    const li = document.createElement("li");
    li.innerHTML = `<div class="bar-label"><span></span><span></span></div><div class="bar"><i></i><span class="tick"></span></div>`;
    const [name, value] = li.querySelectorAll(".bar-label span");
    name.textContent = pretty(row.label);
    value.textContent = pct(row.p);
    li.querySelector("i").style.width = pct(row.p);
    li.querySelector(".tick").style.left = pct(threshold);
    bars.append(li);
  }
}

message.addEventListener("input", update);
document.querySelectorAll(".try").forEach((b) =>
  b.addEventListener("click", () => {
    message.value = b.textContent;
    update();
  }),
);

fetch("model.json")
  .then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  })
  .then((m) => {
    model = m;
    const x = m.metrics;
    note.textContent = `This pruned browser model, on 5,500 held-out messages: ${pct(x.in_scope_accuracy)} accurate on known intents, sends ${pct(x.out_of_scope_caught)} of off-topic messages to a person, and makes a wrong automatic move ${(x.wrong_auto_rate * 100).toFixed(1)}% of the time. The red tick marks where it hands off.`;
    update();
  })
  .catch(() => {
    verdict.textContent = "The model didn't load. Reload the page to try again.";
  });
