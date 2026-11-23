/* Pepper — The Personal AI Prompter · onboarding (v0.4).
   One question per screen. Pepper's features stay locked until every required
   answer is in (A.REQUIRED plus where Pepper floats). Optional steps can be
   skipped. All writes go through the worker's serialized queue. */
const C = window.PepperCore, A = window.PepperAssist;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = (op) => chrome.runtime.sendMessage({ type: "STORE", op });

const STEPS = ["welcome", "you", "sites", "uses", "focus", "float", "powers", "kit", "key", "done"];
const USES = C.QUESTIONS.find(q => q.id === "q2").opts;
let step = 0;
let D = { answers: {}, settings: {}, details: {}, features: A.defaultFeatures(), learn: false, nudge: false, floating: null };

/* ---------------- the buddy: Pepper changes mood as you go ---------------- */
const pep = (mood) => `<svg viewBox="0 0 48 48" class="pep ${mood}"><defs><radialGradient id="bg" cx="34%" cy="28%" r="78%"><stop offset="0" stop-color="#86C29D"/><stop offset=".32" stop-color="#3E7A59"/><stop offset=".74" stop-color="#22513A"/><stop offset="1" stop-color="#163826"/></radialGradient></defs>
  <path d="M24.5 10.5c.3-3.2 1.8-5.6 4.6-7" stroke="#6B4A2B" stroke-width="2.3" fill="none" stroke-linecap="round"/><path class="leaf" d="M28 4.6c3.6-2.6 7.6-2.2 10 .4-3.4 2.4-7 2.4-10-.4z" fill="#9BD8AC"/>
  <circle cx="24" cy="27.5" r="17.5" fill="url(#bg)"/><ellipse cx="16.8" cy="19.5" rx="5.2" ry="2.8" fill="#fff" opacity=".2" transform="rotate(-28 16.8 19.5)"/>
  <g class="eyes"><g class="eye"><ellipse cx="18" cy="26.5" rx="3.7" ry="4.3" fill="#fff"/><circle cx="18.3" cy="27.1" r="2.05" fill="#13211A"/></g><g class="eye"><ellipse cx="30" cy="26.5" rx="3.7" ry="4.3" fill="#fff"/><circle cx="30.3" cy="27.1" r="2.05" fill="#13211A"/></g></g>
  <g class="joy" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M14.6 27.6c1.2-2.6 5.2-2.6 6.6 0"/><path d="M26.6 27.6c1.2-2.6 5.2-2.6 6.6 0"/></g>
  <ellipse cx="12.6" cy="32.4" rx="2.6" ry="1.5" fill="#F48FB1" opacity=".6"/><ellipse cx="35.4" cy="32.4" rx="2.6" ry="1.5" fill="#F48FB1" opacity=".6"/>
  <path d="M21.2 33.6c1.7 1.9 4 1.9 5.6 0" stroke="#0E1B14" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;

/* ---------------- load what's already there (re-runs and updates keep answers) ---------------- */
async function load() {
  const s = await chrome.storage.local.get(["pepper_profile", "pepper_settings", "pepper_details", "pepper_consent", "pepper_pocket", "pepper_reminders"]);
  const st = s.pepper_settings || {};
  D.answers = { ...((s.pepper_profile && s.pepper_profile.answers) || {}) };
  D.settings = st;
  D.details = { ...(s.pepper_details || {}) };
  D.features = { ...A.defaultFeatures(), ...(st.features || {}) };
  D.floating = st.floating === "ai" || st.floating === "everywhere" ? st.floating : null;
  D.consent = s.pepper_consent || {};
  D.learn = D.learnInitial = C.SITES.some(x => D.consent[x.id] && D.consent[x.id].learning);
  D.nudge = !!D.features.reminders;
  D.resume = A.pickResume(s.pepper_pocket);
  if (!Array.isArray(D.answers.q1)) D.answers.q1 = D.answers.q1 ? [D.answers.q1] : [];
  D.answers.q1 = D.answers.q1.filter(n => A.AI_SITES.some(x => x.name === n));
}

/* ---------------- each step: render, and a check that must pass to continue ---------------- */
const R = {
  welcome: { render() { $("updateNote").hidden = location.hash !== "#update"; }, check: () => "" },
  you: {
    render() { $("name").value = D.answers.name || ""; $("role").value = D.answers.q3 || ""; setTimeout(() => $("name").focus(), 50); },
    check() {
      D.answers.name = $("name").value.trim(); D.answers.q3 = $("role").value.trim();
      if (!D.answers.name) return "Tell me what to call you.";
      if (!D.answers.q3) return "A few words about what you do, please. It shapes every prompt.";
      return "";
    }
  },
  sites: {
    render() {
      const picked = D.answers.q1;
      $("sites").innerHTML = A.AI_SITES.map(s => {
        const i = picked.indexOf(s.name);
        return `<button type="button" class="card site ${i >= 0 ? "on" : ""}" data-n="${esc(s.name)}" aria-pressed="${i >= 0}"><span class="rank">${i >= 0 ? i + 1 : ""}</span><b>${esc(s.name)}</b></button>`;
      }).join("");
      $("sites").querySelectorAll(".card").forEach(b => b.onclick = () => {
        const n = b.dataset.n, list = D.answers.q1;
        D.answers.q1 = list.includes(n) ? list.filter(x => x !== n) : [...list, n];
        R.sites.render(); clearErr();
      });
    },
    check: () => D.answers.q1.length ? "" : "Pick at least one."
  },
  uses: {
    render() {
      const cur = Array.isArray(D.answers.q2) ? D.answers.q2 : [];
      $("uses").innerHTML = USES.map(u => `<button type="button" class="chip" aria-pressed="${cur.includes(u)}" data-u="${esc(u)}">${esc(u)}</button>`).join("");
      $("uses").querySelectorAll(".chip").forEach(b => b.onclick = () => {
        let list = Array.isArray(D.answers.q2) ? D.answers.q2 : [];
        const u = b.dataset.u;
        if (list.includes(u)) list = list.filter(x => x !== u);
        else if (list.length < 3) list = [...list, u];
        else { err("Three is plenty. Unpick one first."); return; }
        D.answers.q2 = list; R.uses.render(); clearErr();
      });
    },
    check: () => (Array.isArray(D.answers.q2) && D.answers.q2.length) ? "" : "Pick at least one."
  },
  focus: {
    render() {
      $("focus").innerHTML = A.FOCUS.map(f => `<button type="button" class="card ${D.answers.focus === f.id ? "on" : ""}" data-v="${f.id}" aria-pressed="${D.answers.focus === f.id}"><b>${esc(f.label)}</b><small>${esc(f.hint)}</small></button>`).join("");
      $("focus").querySelectorAll(".card").forEach(b => b.onclick = () => { D.answers.focus = b.dataset.v; R.focus.render(); clearErr(); });
      const f = A.FOCUS.find(x => x.id === D.answers.focus);
      $("nudgeRow").hidden = !f || !f.time;
      $("nudge").checked = D.nudge;
      if (f && f.time) $("nudgeHelp").textContent = `A notification at ${fmtTime(f.time)} on weekdays. You can change the time and days later.`;
    },
    check: () => D.answers.focus ? "" : "Pick one. \"It changes\" is fine too."
  },
  float: {
    render() {
      $("float").querySelectorAll(".card").forEach(b => { const on = b.dataset.v === D.floating; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    },
    check: () => D.floating ? "" : "Pick where I should float."
  },
  powers: {
    render() {
      const ex = {
        pocket: `<span class="ex"><span class="f">resume.pdf</span><span class="f">portfolio link</span><span class="f">intro template</span></span>`,
        writing: `<span class="ex"><span class="sel">i think teh plan is good</span><span class="pill">Fix · Ask AI</span></span>`,
        autofill: `<span class="ex"><span class="fld">Email <i>you@mail.com</i></span><span class="fld">Phone <i>(555) 010 2030</i></span></span>`,
        reminders: `<span class="ex"><span class="note">Good morning! Your focus time starts now.</span></span>`
      };
      $("powers").innerHTML = A.FEATURES.map(f => `<label class="power ${D.features[f.id] ? "on" : ""}">
        <input type="checkbox" data-f="${f.id}" ${D.features[f.id] ? "checked" : ""}>
        <span class="pt"><b>${esc(f.label)}</b><small>${esc(f.line)}</small></span>${ex[f.id] || ""}</label>`).join("");
      $("powers").querySelectorAll("input[data-f]").forEach(c => c.onchange = async () => {
        if (c.dataset.f === "reminders" && c.checked && !(await askNotifications())) { c.checked = false; err("Your browser didn't allow notifications, so focus nudges stay off."); }
        D.features[c.dataset.f] = c.checked;
        if (c.dataset.f === "reminders") D.nudge = c.checked;
        c.closest(".power").classList.toggle("on", c.checked);
      });
      $("learn").checked = D.learn;
      const fav = (D.answers.q1 || []).join(", ") || "your AI sites";
      $("learnHelp").textContent = `On ${fav}, I keep the prompts you send, the replies and your star ratings, in this browser, to pick the approach that gets your best results. Off unless you turn it on.`;
    },
    check() { D.learn = $("learn").checked; return ""; }
  },
  kit: {
    skipIf: () => !D.features.pocket && !D.features.autofill,
    render() {
      $("kitResume").hidden = !D.features.pocket;
      $("kitDetails").hidden = !D.features.autofill;
      if (D.resume) $("resumeNote").textContent = `In your Pocket: ${D.resume.name}`;
      if (!D.details.fullName && D.answers.name) D.details.fullName = D.answers.name;
      const show = ["fullName", "email", "phone", "linkedin", "city", "country"];
      $("details").innerHTML = show.map(id => {
        const d = A.DETAILS.find(x => x.id === id);
        return `<label class="field"><span>${esc(d.label)}</span><input type="text" data-d="${id}" value="${esc(D.details[id] || "")}" autocomplete="off"></label>`;
      }).join("");
    },
    check() {
      $("details").querySelectorAll("input[data-d]").forEach(i => { const v = i.value.trim(); if (v) D.details[i.dataset.d] = v; else delete D.details[i.dataset.d]; });
      if (Object.values(D.details).some(v => typeof v === "string" && A.looksLikeCard(v))) return "That looks like a card number. Pepper doesn't store those.";
      return "";
    }
  },
  key: {
    async render() {
      $("key").value = "";
      $("key").placeholder = D.settings.hasKey ? `A key is saved (${D.settings.keyHint || "hidden"}). Paste a new one to replace it.` : "Paste your key";
      if (!$("provider").options.length) AI.fillSelect($("provider"), await AI.suggested(D.settings.provider));
      syncKey();
    },
    check: () => ""
  },
  done: {
    render() {
      const name = D.answers.name;
      $("doneTitle").textContent = `You're all set, ${name}!`;
      $("doneLede").textContent = D.floating === "everywhere"
        ? "I'll float on every page. Open your favorite AI to try your first prompt, or select some text anywhere."
        : "Open your favorite AI and click me in the corner to write your first prompt.";
      $("goSites").innerHTML = A.favorites(D.answers).map((s, i) => `<a class="btn ${i ? "" : "primary"}" href="${s.url}" target="_blank" rel="noopener">Open ${esc(s.name)}</a>`).join("");
    },
    check: () => ""
  }
};

/* ---------------- permissions, asked only when the user picks something that needs them ---------------- */
async function askNotifications() {
  try { return await chrome.permissions.request({ permissions: ["notifications"] }); } catch (e) { return false; }
}
$("float").querySelectorAll(".card").forEach(b => b.onclick = async () => {
  clearErr();
  if (b.dataset.v === "everywhere") {
    let ok = false;
    try { ok = await chrome.permissions.request({ origins: ["<all_urls>"] }); } catch (e) { ok = false; }
    if (!ok) { $("floatNote").textContent = "Your browser didn't allow it, so I'll stay on AI sites. You can switch any time in settings."; D.floating = "ai"; R.float.render(); return; }
    $("floatNote").textContent = "Allowed. I'll float on every page, and you can hide me on any site.";
  } else $("floatNote").textContent = "";
  D.floating = b.dataset.v; R.float.render();
});
$("nudge").onchange = async () => {
  if ($("nudge").checked && !(await askNotifications())) { $("nudge").checked = false; err("Your browser didn't allow notifications, so nudges stay off."); }
  D.nudge = $("nudge").checked; D.features.reminders = D.nudge;
};

/* ---------------- resume ---------------- */
$("pick").onclick = () => $("file").click();
$("file").onchange = () => { if ($("file").files[0]) addResume($("file").files[0]); $("file").value = ""; };
const drop = $("drop");
["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => { if (e.dataTransfer.files[0]) addResume(e.dataTransfer.files[0]); });
async function addResume(f) {
  const why = A.pocketRejects([], f.size);
  if (why) { $("resumeNote").textContent = why; return; }
  $("resumeNote").textContent = "Adding…";
  const buf = await f.arrayBuffer();
  const text = (A.isTextLike(f.name, f.type) ? new TextDecoder().decode(buf) : /\.docx$/i.test(f.name) ? await A.extractDocxText(buf) : "").slice(0, A.TEXT_KEEP);
  const r = await chrome.runtime.sendMessage({ type: "POCKET_ADD_FILE", item: { name: f.name, mime: f.type, text, role: "resume" }, data: A.bytesToBase64(new Uint8Array(buf)) });
  $("resumeNote").textContent = r && r.ok ? `In your Pocket: ${f.name}${text ? " (I can read its text, too)" : ""}` : (r && r.error) || "Couldn't add it.";
  if (r && r.ok) D.resume = r.item;
}

/* ---------------- model key ---------------- */
const AI = self.PepperAIConnect;
const keyedAI = (p) => A.PROVIDERS.some(x => x.id === p && x.keyed);
function syncKey() {
  const p = $("provider").value;
  $("keyField").hidden = !keyedAI(p); $("key").disabled = !keyedAI(p);
  $("testKey").hidden = p === "none";
  $("testKey").textContent = p === "chrome" ? "Turn it on" : "Save and test";
  $("keyHelp").innerHTML = AI.helpHtml(p);
  $("keyNote").textContent = "";
  $("keyWhy").textContent = p === "chrome" ? "It runs on this computer, so what you type never leaves it. The first time, Chrome downloads the model."
    : p === "none" ? "You can connect one any time in Pepper's settings."
    : "When you ask Pepper to write, what you typed, your profile answers, active memories, your project's files and the end of the chat on screen go to that provider, and nowhere else. The key stays in this browser.";
}
$("provider").onchange = syncKey;
const say = (cls, text) => { $("keyNote").className = "small " + cls; $("keyNote").textContent = text; };
$("testKey").onclick = async () => {
  const provider = $("provider").value, apiKey = $("key").value.trim();
  if (keyedAI(provider) && !apiKey && !(D.settings.hasKey && D.settings.provider === provider)) { say("bad", "Paste a key first."); return; }
  await AI.connect(provider, apiKey, say);
  $("key").value = "";
  D.settings = (await chrome.storage.local.get("pepper_settings")).pepper_settings || D.settings;
};

/* ---------------- saving ---------------- */
async function saveProgress() {
  await store({ op: "set", key: "pepper_profile", value: { answers: D.answers, completed: false } });
}
async function finish() {
  const settingsPatch = { onboarded: true, floating: D.floating, features: D.features };
  // Keys go to the worker's vault, never into settings.
  const pv = $("provider").value || "none", key = $("key").value.trim();
  // Finish is a click, so Chrome's model download can start from here.
  if (pv === "chrome") { self.PepperLocalAI.enable(); await chrome.runtime.sendMessage({ type: "SET_KEY", provider: "chrome" }); }
  else if (keyedAI(pv) && key) await chrome.runtime.sendMessage({ type: "SET_KEY", provider: pv, apiKey: key });
  else if (!(keyedAI(pv) && D.settings.hasKey && D.settings.provider === pv)) await chrome.runtime.sendMessage({ type: "SET_KEY", provider: "none" });
  await store({ op: "objPatch", key: "pepper_settings", patch: settingsPatch });
  if (D.features.autofill || Object.keys(D.details).length) await store({ op: "set", key: "pepper_details", value: D.details });
  // Learning consent changes only if the switch was changed here: turning it on covers your favorite sites,
  // turning it off covers all. Re-running setup never widens what someone already allowed site by site.
  if (D.learn !== D.learnInitial) {
    const consent = {};
    C.SITES.forEach(s => { consent[s.id] = { learning: D.learn ? ((D.answers.q1 || []).includes(s.name) || !!(D.consent[s.id] && D.consent[s.id].learning)) : false }; });
    await store({ op: "objPatch", key: "pepper_consent", patch: consent });
  }
  const cur = (await chrome.storage.local.get("pepper_reminders")).pepper_reminders || [];
  const focus = A.focusReminder(D.answers);
  const others = cur.filter(r => r.id !== "focus");
  await store({ op: "listSet", key: "pepper_reminders", items: focus ? [{ ...focus, enabled: D.nudge }, ...others] : others });
  const settings = { ...D.settings, ...settingsPatch };
  const miss = A.missingSetup({ answers: D.answers }, settings);
  if (miss.length) return "Something's missing: " + miss.join(", ") + ". Go back and fill it in.";
  await store({ op: "set", key: "pepper_profile", value: { answers: D.answers, completed: true, completedAt: new Date().toISOString() } });
  await chrome.runtime.sendMessage({ type: "SYNC" });
  return "";
}

/* ---------------- navigation ---------------- */
function err(m) { $("err").textContent = m; }
function clearErr() { $("err").textContent = ""; }
const fmtTime = (hhmm) => { const t = A.parseTime(hhmm); if (!t) return hhmm; const d = new Date(); d.setHours(t.h, t.m, 0, 0); return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); };
const MOODS = { welcome: "wave", you: "", sites: "look", uses: "look", focus: "", float: "", powers: "joy", kit: "", key: "", done: "joy" };

function show(i) {
  step = Math.max(0, Math.min(STEPS.length - 1, i));
  const name = STEPS[step];
  document.querySelectorAll("[data-step]").forEach(s => s.hidden = s.dataset.step !== name);
  R[name].render();
  clearErr();
  const total = STEPS.length - 2; // welcome and done aren't counted
  $("bar").style.width = (step / (STEPS.length - 1) * 100) + "%";
  $("stepNo").textContent = name === "welcome" || name === "done" ? "" : `Step ${step} of ${total}`;
  $("back").hidden = step === 0 || name === "done";
  $("next").textContent = name === "welcome" ? "Let's go" : name === "done" ? "Close" : name === "key" ? "Finish" : (name === "kit" || name === "key") ? "Continue" : "Next";
  $("next").classList.toggle("ghost", name === "done");
  $("buddy").innerHTML = pep(MOODS[name] || "");
  window.scrollTo(0, 0);
}
async function next() {
  const name = STEPS[step];
  if (name === "done") { window.close(); return; }
  const problem = R[name].check();
  if (problem) { err(problem); return; }
  if (["you", "sites", "uses", "focus"].includes(name)) await saveProgress();
  if (name === "key") {
    $("next").disabled = true;
    const why = await finish();
    $("next").disabled = false;
    if (why) { err(why); return; }
  }
  let n = step + 1;
  while (STEPS[n] && R[STEPS[n]].skipIf && R[STEPS[n]].skipIf()) n++;
  show(n);
}
function back() {
  let n = step - 1;
  while (n > 0 && R[STEPS[n]].skipIf && R[STEPS[n]].skipIf()) n--;
  show(n);
}
$("next").onclick = next;
$("back").onclick = back;
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLSelectElement)) { e.preventDefault(); next(); }
});
$("openDash").onclick = () => chrome.runtime.sendMessage({ type: "OPEN_PAGE", page: "dashboard.html" });

// Next stays disabled until saved answers are loaded, so an early click can't be undone by the load.
(async function init() {
  await load();
  show(0);
  $("next").disabled = false;
})();
