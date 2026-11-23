/* Pepper — The Personal AI Prompter · dashboard (v0.4). No network of its own;
   model calls go through the worker. Every list write goes through the
   worker's serialized queue, so a tab writing at the same moment can't be
   overwritten. Opens onboarding instead while setup isn't finished. */
const C = window.PepperCore, A = window.PepperAssist;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = (op) => chrome.runtime.sendMessage({ type: "STORE", op });
const when = (iso) => { try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } };
const siteName = (host) => (C.siteForHost(host) || { name: String(host || "").replace(/^www\./, "") }).name;
const flashSaved = (id) => { $(id).textContent = "Saved"; setTimeout(() => { $(id).textContent = ""; }, 1400); };

let D = {};
async function load() {
  const s = await chrome.storage.local.get(["pepper_settings", "pepper_profile", "pepper_memories", "pepper_projects", "pepper_pocket", "pepper_details",
    "pepper_saved_prompts", "pepper_history", "pepper_consent", "pepper_learning", "pepper_active_project", "pepper_reminders", "pepper_ui"]);
  D = {
    settings: { enabled: true, minChars: 6, provider: "none", hasKey: false, model: "", ...(s.pepper_settings || {}) },
    profile: s.pepper_profile || { answers: {}, completed: false },
    memories: s.pepper_memories || [], projects: s.pepper_projects || [], pocket: s.pepper_pocket || [], details: s.pepper_details || {},
    saved: s.pepper_saved_prompts || [],
    // newest first by time, whatever order storage holds
    history: (s.pepper_history || []).slice().sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || ""))),
    consent: { ...C.defaultConsent(), ...(s.pepper_consent || {}) },
    learning: s.pepper_learning || { types: {}, dismissedFacts: [] },
    activeProjectId: s.pepper_active_project ?? null,
    reminders: s.pepper_reminders || [], ui: s.pepper_ui || {}
  };
  D.features = { ...A.defaultFeatures(), ...(D.settings.features || {}) };
}
const answers = () => D.profile.answers || {};
// The key itself is in the worker's vault; pages only know whether one is saved, and its last four characters.
const hasKey = () => D.settings.provider !== "none" && !!D.settings.hasKey;
const aiOn = () => hasKey() || D.settings.provider === "chrome";
const AI = self.PepperAIConnect;
const keyedAI = (p) => A.PROVIDERS.some(x => x.id === p && x.keyed);
const consentCount = () => C.SITES.filter(s => D.consent[s.id] && D.consent[s.id].learning).length;
const files = () => D.pocket.filter(i => i.kind === "file");
const setFeature = (id, on) => store({ op: "objPatch", key: "pepper_settings", patch: { features: { ...D.features, [id]: on } } });

/* ---------------- routing ---------------- */
const SECTIONS = ["home", "you", "pocket", "projects", "history", "reminders", "settings"];
// Old links from v0.3 still land somewhere sensible.
const ALIASES = { about: "you", memories: "you", saved: "history", learned: "history", privacy: "settings" };
let current = "home";
function route() {
  let h = (location.hash || "#home").slice(1);
  h = ALIASES[h] || h;
  current = SECTIONS.includes(h) ? h : "home";
  document.querySelectorAll("[data-section]").forEach(s => s.hidden = s.dataset.section !== current);
  document.querySelectorAll("#nav a").forEach(a => { if (a.dataset.s === current) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if (location.hash === "#learned") showHist("learned");
  if (location.hash === "#saved") showHist("saved");
  render(current);
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
function render(name) {
  renderChrome();
  ({ home: renderHome, you: renderYou, pocket: renderPocket, projects: renderProjects, history: renderHistoryAll,
    reminders: renderReminders, settings: renderSettings })[name]();
}
function renderChrome() {
  const on = D.settings.enabled !== false;
  $("masterSwitch").checked = on;
  $("masterLabel").textContent = on ? "Pepper is on" : "Pepper is off";
  $("masterHelp").textContent = !on ? "Hidden everywhere. Nothing is recorded." : D.settings.floating === "everywhere" ? "Floating on every site." : "Floating on the five AI sites.";
  $("navPocket").textContent = D.pocket.length ? String(D.pocket.length) : "";
}
$("masterSwitch").onchange = async (e) => { await store({ op: "objPatch", key: "pepper_settings", patch: { enabled: e.target.checked } }); };

/* ---------------- HOME ---------------- */
function renderHome() {
  const a = answers();
  const who = A.firstName(a, D.details);
  $("hello").textContent = `${A.greeting(new Date().getHours())}${who ? ", " + who : ""}`;
  const focus = A.FOCUS.find(f => f.id === a.focus);
  const goal = (a.q10 || "").trim();
  $("helloLede").textContent = [goal ? `Working toward: ${goal}.` : "", focus && focus.time ? `Your focus time is ${focus.label.toLowerCase()}.` : ""].filter(Boolean).join(" ") || "Pepper is ready when you are.";
  const fav = A.favorites(a);
  $("quickrow").innerHTML = fav.slice(0, 3).map((s, i) => `<a class="btn ${i ? "" : "primary"}" href="${s.url}" target="_blank" rel="noopener">Open ${esc(s.name)}</a>`).join("") +
    `<a class="btn" href="#pocket">Open your Pocket</a>`;
  const resume = A.pickResume(D.pocket);
  const detailsN = A.DETAIL_IDS.filter(id => A.detailValue(id, D.details)).length;
  const items = [
    { done: !!resume, title: "Put your resume in your Pocket", desc: "Drag it onto job sites from the floating Pepper, or let Pepper attach it.", href: "#pocket", cta: "Add resume" },
    D.features.autofill ? { done: detailsN >= 4, title: "Add the details you type on every application", desc: `${detailsN} saved. Pepper fills them in when you click Fill.`, href: "#pocket", cta: "Add details", hash: "details" } : null,
    { done: consentCount() > 0, title: "Let Pepper learn what works for you", desc: consentCount() ? `On for ${consentCount()} of 5 sites.` : "Off everywhere, so Pepper can't learn which approach you like.", href: "#settings", cta: "Choose sites" },
    { done: aiOn(), title: "Connect an AI", desc: "Chrome's built-in AI or a free Gemini key turns your rough prompts into clear ones, right in the chat box.", href: "#settings", cta: "Connect" },
    { done: D.features.reminders && D.reminders.some(r => r.enabled), title: "Get a nudge at your focus time", desc: "A notification when your best hours start.", href: "#reminders", cta: "Set it up" },
    { done: D.history.some(h => h.assisted) || D.saved.length > 0, title: `Write your first prompt on ${fav[0].name}`, desc: "Click the peppercorn in the corner, or press Alt+Shift+P.", href: null }
  ].filter(Boolean);
  $("checklist").innerHTML = items.map((it, i) => `<li class="${it.done ? "done" : ""}">
    <span class="tick" aria-hidden="true">${it.done ? "✓" : i + 1}</span>
    <div><b>${esc(it.title)}</b><p>${esc(it.desc)}</p></div>
    ${it.href && !it.done ? `<a class="btn sm" href="${it.href}" ${it.hash ? `data-sub="${it.hash}"` : ""}>${esc(it.cta)}</a>` : `<span class="small muted">${it.done ? "Done" : ""}</span>`}
  </li>`).join("");
  $("checklist").querySelectorAll("[data-sub]").forEach(l => l.onclick = () => setTimeout(() => showPocket(l.dataset.sub), 0));
  const h = D.history;
  if (!h.length) {
    $("figures").innerHTML = `<div class="wide"><dd>Figures appear once you send prompts on a site with learning on.</dd></div>`;
  } else {
    const rated = h.filter(r => r.rating != null);
    const avg = rated.length ? (rated.reduce((x, y) => x + y.rating, 0) / rated.length).toFixed(1) : "—";
    const learned = Object.values(D.learning.types || {}).filter(t => t.lens && t.lens !== "auto").length;
    $("figures").innerHTML = `
      <div><dt>${C.assistedShare(h)}%</dt><dd>of the ${h.length} prompts you sent went through Pepper</dd></div>
      <div><dt>${avg}${avg !== "—" ? " ★" : ""}</dt><dd>average rating across ${rated.length} rated ${rated.length === 1 ? "reply" : "replies"}</dd></div>
      <div><dt>${learned}</dt><dd>${learned === 1 ? "kind of work where" : "kinds of work where"} Pepper picks your best approach</dd></div>`;
  }
  $("recent").innerHTML = h.length ? `<div class="rows">${h.slice(0, 3).map(recRow).join("")}</div>`
    : `<div class="empty">Nothing yet. Prompts appear here when learning is on for the site you use.</div>`;
  bindRecRows($("recent"));
}

/* ---------------- YOU ---------------- */
// The first group is what onboarding asked; required answers can be changed but not emptied.
const GROUPS = [
  { title: "The basics", ids: ["name", "q3", "q4", "q1", "q2", "q5", "q6", "focus"] },
  { title: "How you like answers", ids: ["q8", "q9", "q14", "q13", "q12"] },
  { title: "How Pepper works for you", ids: ["q10", "q11", "q15", "q7"] }
];
const EXTRA_Q = {
  name: { id: "name", t: "What should Pepper call you?", type: "text", ph: "Your first name", effect: "Used to greet you and in templates as {{name}}. Not added to prompts." },
  focus: { id: "focus", t: "When do you do your best work?", type: "single", opts: A.FOCUS.map(f => f.id), labels: Object.fromEntries(A.FOCUS.map(f => [f.id, `${f.label} (${f.hint})`])), effect: "Sets your focus reminder." }
};
function question(id) {
  if (EXTRA_Q[id]) return EXTRA_Q[id];
  const q = C.QUESTIONS.find(x => x.id === id);
  if (id === "q1") return { ...q, t: "Which AI sites do you use? (in order)", opts: A.AI_SITES.map(s => s.name), effect: "Your first pick is where Pepper sends prompts from other pages." };
  if (id === "q5") return { ...q, labels: Object.fromEntries(A.THINK.map(t => [t.value, t.label])) };
  return q;
}
let youTimer = null;
function renderYou() {
  const a = answers();
  $("quiz").innerHTML = GROUPS.map(g => `<div class="qgroup"><h2>${esc(g.title)}</h2>${g.ids.map(id => {
    const q = question(id);
    const has = a[id] != null && (!Array.isArray(a[id]) || a[id].length) && a[id] !== "";
    const req = A.REQUIRED.includes(id);
    let body;
    if (q.type === "text") body = `<input type="text" data-q="${q.id}" value="${esc(a[q.id] || "")}" placeholder="${esc(q.ph || "")}" aria-label="${esc(q.t)}">`;
    else {
      const cur = q.type === "multi" ? (Array.isArray(a[q.id]) ? a[q.id] : []) : (a[q.id] ? [a[q.id]] : []);
      body = `<div class="opts" data-q="${q.id}" data-type="${q.type}" role="group" aria-label="${esc(q.t)}">${q.opts.map(o =>
        `<button type="button" class="opt" data-o="${esc(o)}" aria-pressed="${cur.includes(o)}">${q.id === "q1" && cur.includes(o) ? `<b class="ord">${cur.indexOf(o) + 1}</b> ` : ""}${esc((q.labels && q.labels[o]) || o)}</button>`).join("")}</div>`;
    }
    return `<div class="q ${has ? "answered" : ""}" data-qrow="${q.id}"><div class="q-t">${esc(q.t)}${req ? ' <span class="req">required</span>' : ""}</div>${body}<div class="q-e">${esc(q.effect)}</div></div>`;
  }).join("")}</div>`).join("");
  $("quiz").querySelectorAll(".opts").forEach(group => group.querySelectorAll(".opt").forEach(b => b.onclick = () => {
    const id = group.dataset.q, o = b.dataset.o;
    const cur = { ...answers() };
    if (group.dataset.type === "single") cur[id] = cur[id] === o && !A.REQUIRED.includes(id) ? "" : o;
    else { const list = Array.isArray(cur[id]) ? cur[id] : []; cur[id] = list.includes(o) ? list.filter(x => x !== o) : [...list, o]; }
    saveYou(cur, true);
  }));
  $("quiz").querySelectorAll("input[data-q]").forEach(i => i.oninput = () => {
    clearTimeout(youTimer);
    youTimer = setTimeout(() => { const cur = { ...answers() }; cur[i.dataset.q] = i.value.trim(); saveYou(cur, false); }, 500);
  });
  renderMemories();
  updateYouProgress();
}
async function saveYou(next, rerender) {
  const miss = A.REQUIRED.filter(k => !(Array.isArray(next[k]) ? next[k].length : String(next[k] || "").trim()));
  if (miss.length) {
    $("aboutSaved").className = "small bad";
    $("aboutSaved").textContent = "That one's required, so Pepper kept your earlier answer.";
    setTimeout(() => { $("aboutSaved").className = "saved"; $("aboutSaved").textContent = ""; }, 2600);
    if (rerender) renderYou();
    return;
  }
  D.profile = { ...D.profile, answers: next };
  await store({ op: "set", key: "pepper_profile", value: D.profile });
  // Focus time drives the focus reminder.
  const f = A.focusReminder(next), had = D.reminders.find(r => r.id === "focus");
  if (f && (!had || had.time !== f.time)) await saveReminders([{ ...f, enabled: had ? had.enabled : false, days: had ? had.days : f.days }, ...D.reminders.filter(r => r.id !== "focus")]);
  $("aboutSaved").className = "saved"; flashSaved("aboutSaved");
  if (rerender) renderYou(); else { $("quiz").querySelectorAll("[data-qrow]").forEach(r => { const v = next[r.dataset.qrow]; r.classList.toggle("answered", Array.isArray(v) ? v.length > 0 : !!v); }); updateYouProgress(); }
}
function updateYouProgress() {
  const all = GROUPS.flatMap(g => g.ids), a = answers();
  const n = all.filter(id => Array.isArray(a[id]) ? a[id].length : !!a[id]).length;
  $("aboutCount").textContent = `${n} of ${all.length} answered`;
  $("aboutBar").style.width = (n / all.length * 100) + "%";
}
function renderMemories() {
  const list = $("memList");
  list.innerHTML = D.memories.length ? `<div class="rows">${D.memories.map(m => `
    <div class="row mem ${m.active ? "" : "off"}" data-id="${esc(m.id)}">
      <label class="switch" title="${m.active ? "On: added to every prompt" : "Off: not used"}"><input type="checkbox" ${m.active ? "checked" : ""} aria-label="Use this memory"><i></i></label>
      <input type="text" value="${esc(m.text)}" aria-label="Memory text">
      <button class="btn sm danger" data-del>Delete</button>
    </div>`).join("")}</div>` : `<div class="empty">No memories yet. Add one above, or let Pepper suggest some from your prompts.</div>`;
  list.querySelectorAll(".mem").forEach(row => {
    const id = row.dataset.id;
    row.querySelector(".switch input").onchange = (e) => store({ op: "listPatch", key: "pepper_memories", id, patch: { active: e.target.checked } });
    row.querySelector('input[type=text]').onchange = (e) => { const t = e.target.value.trim(); if (t) store({ op: "listPatch", key: "pepper_memories", id, patch: { text: t } }); };
    row.querySelector("[data-del]").onclick = () => store({ op: "listRemove", key: "pepper_memories", id });
  });
  $("factsBtn").disabled = !hasKey() || !D.history.length;
  $("factsNote").textContent = !aiOn() ? "Needs an AI (Settings)." : !D.history.length ? "Needs prompts in your history first." : "";
}
$("memForm").onsubmit = async (e) => {
  e.preventDefault();
  const t = $("memNew").value.trim(); if (!t) return;
  await store({ op: "listAdd", key: "pepper_memories", end: true, item: { id: C.uuid(), text: t, active: true } });
  $("memNew").value = "";
};
$("factsBtn").onclick = async () => {
  $("factsBtn").disabled = true; $("factsNote").textContent = "Reading your prompts…";
  const r = await chrome.runtime.sendMessage({ type: "LLM", system: C.FACT_SYSTEM, user: C.factPromptFrom(D.history, 30), maxTokens: 600 });
  $("factsBtn").disabled = false;
  if (!r || !r.ok) { $("factsNote").textContent = "Your model returned: " + ((r && r.error) || "no reply"); return; }
  const facts = C.parseFacts(r.text, D.memories.map(m => m.text), D.learning.dismissedFacts);
  $("factsNote").textContent = facts.length ? `${facts.length} found. Add the ones that are true.` : "No new facts found.";
  $("factsList").innerHTML = facts.length ? `<div class="rows">${facts.map((f, i) => `<div class="row fact" data-i="${i}">
    <input type="text" value="${esc(f)}" aria-label="Suggested fact"><span><button class="btn sm primary" data-add>Add memory</button> <button class="btn sm" data-dis>Dismiss</button></span></div>`).join("")}</div>` : "";
  $("factsList").querySelectorAll(".fact").forEach(row => {
    row.querySelector("[data-add]").onclick = async () => {
      const t = row.querySelector("input").value.trim();
      if (t) await store({ op: "listAdd", key: "pepper_memories", end: true, item: { id: C.uuid(), text: t, active: true, source: "history" } });
      row.remove();
    };
    row.querySelector("[data-dis]").onclick = async () => {
      const t = row.querySelector("input").value.trim();
      await store({ op: "objPatch", key: "pepper_learning", patch: { dismissedFacts: [...(D.learning.dismissedFacts || []), t].slice(-200) } });
      row.remove();
    };
  });
};

/* ---------------- POCKET ---------------- */
let pocketTab = "files";
function showPocket(t) {
  pocketTab = t;
  document.querySelectorAll("#pocketNav button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.p === t)));
  document.querySelectorAll("[data-pocket]").forEach(s => s.hidden = s.dataset.pocket !== t);
  renderPocket();
}
document.querySelectorAll("#pocketNav button").forEach(b => b.onclick = () => showPocket(b.dataset.p));
function renderPocket() {
  const used = A.pocketUsage(D.pocket);
  $("pocketUse").textContent = `${D.pocket.length} item${D.pocket.length === 1 ? "" : "s"} · ${A.formatBytes(used)} of ${A.formatBytes(A.POCKET_LIMITS.total)}`;
  $("pocketBar").style.width = Math.min(100, used / A.POCKET_LIMITS.total * 100) + "%";
  if (pocketTab === "files") renderFiles();
  if (pocketTab === "links") renderLinks();
  if (pocketTab === "snippets") renderSnippets();
  if (pocketTab === "details") renderDetails();
}
const drop = $("drop"), fileInput = $("fileInput");
$("pick").onclick = () => fileInput.click();
fileInput.onchange = () => { handleFiles(fileInput.files); fileInput.value = ""; };
["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => handleFiles(e.dataTransfer.files));
async function handleFiles(list) {
  let n = 0;
  for (const f of [...list]) {
    const why = A.pocketRejects(D.pocket, f.size);
    if (why) { $("dropNote").className = "small bad"; $("dropNote").textContent = why; continue; }
    $("dropNote").className = "small"; $("dropNote").textContent = `Adding ${f.name}…`;
    const buf = await f.arrayBuffer();
    const text = (A.isTextLike(f.name, f.type) ? new TextDecoder().decode(buf) : /\.docx$/i.test(f.name) ? await A.extractDocxText(buf) : "").slice(0, A.TEXT_KEEP);
    const r = await chrome.runtime.sendMessage({ type: "POCKET_ADD_FILE", item: { name: f.name, mime: f.type, text, role: A.isResumeLabel(f.name) && !A.pickResume(D.pocket) ? "resume" : undefined }, data: A.bytesToBase64(new Uint8Array(buf)) });
    if (r && r.ok) { n++; D.pocket = [r.item, ...D.pocket]; } else { $("dropNote").className = "small bad"; $("dropNote").textContent = (r && r.error) || `Couldn't add ${f.name}.`; }
  }
  if (n) { $("dropNote").className = "small saved"; $("dropNote").textContent = `Added ${n} file${n === 1 ? "" : "s"}.`; }
}
function renderFiles() {
  const fl = files();
  $("fileList").innerHTML = fl.length ? `<div class="rows">${fl.map(f => {
    const k = A.fileKind(f.name, f.mime);
    return `<div class="row" data-id="${esc(f.id)}">
      <div class="row-h"><span class="fk ${k}">${esc(k === "other" ? "file" : k)}</span><div class="grow"><b>${esc(f.name)}</b>
        <p class="small muted">${A.formatBytes(f.size)}${f.text ? ` · ${f.text.length.toLocaleString()} characters of text for prompts` : f.hasBlob ? " · no text for prompts yet" : ""}${f.addedAt ? " · added " + when(f.addedAt) : ""}</p></div>
        ${f.role === "resume" ? `<span class="tag corn">Resume</span>` : `<button class="btn sm" data-role>Mark as resume</button>`}
        ${f.hasBlob ? `<button class="btn sm" data-dl>Download</button>` : ""}
        <button class="btn sm danger" data-del>Delete</button></div>
      ${f.text ? `<details><summary class="small link">Text Pepper can use in prompts</summary><div class="prev text">${esc(f.text.slice(0, 1500))}${f.text.length > 1500 ? "…" : ""}</div></details>`
        : `<details ${f.needsText ? "open" : ""}><summary class="small link">Add its text so prompts can use it</summary><div class="paste"><textarea rows="4" placeholder="Pepper can't read PDFs. Paste the text here, for example your resume's."></textarea><div><button class="btn sm primary" data-save>Save text</button></div></div></details>`}
    </div>`;
  }).join("")}</div>` : `<div class="empty">No files yet. Your resume is a good first one.</div>`;
  $("fileList").querySelectorAll(".row").forEach(row => {
    const id = row.dataset.id, f = D.pocket.find(x => String(x.id) === id);
    row.querySelector("[data-del]").onclick = async () => { if (confirm(`Delete ${f.name} from your Pocket?`)) await chrome.runtime.sendMessage({ type: "POCKET_REMOVE", id }); };
    const role = row.querySelector("[data-role]");
    if (role) role.onclick = async () => {
      for (const x of files()) if (x.role === "resume") await store({ op: "listPatch", key: "pepper_pocket", id: x.id, patch: { role: null } });
      await store({ op: "listPatch", key: "pepper_pocket", id, patch: { role: "resume" } });
    };
    const dl = row.querySelector("[data-dl]");
    if (dl) dl.onclick = async () => {
      const r = await chrome.runtime.sendMessage({ type: "POCKET_GET_FILE", id });
      if (!r || !r.ok) return;
      const url = URL.createObjectURL(new Blob([A.base64ToBytes(r.data)], { type: f.mime }));
      const a = document.createElement("a"); a.href = url; a.download = f.name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };
    const sv = row.querySelector("[data-save]");
    if (sv) sv.onclick = () => { const t = row.querySelector("textarea").value; if (t.trim()) store({ op: "listPatch", key: "pepper_pocket", id, patch: { text: t.slice(0, A.TEXT_KEEP), needsText: false } }); };
  });
}
$("linkForm").onsubmit = async (e) => {
  e.preventDefault();
  const url = A.normalizeUrl($("linkUrl").value);
  if (!url) { $("linkUrl").focus(); return; }
  await store({ op: "listAdd", key: "pepper_pocket", item: { id: C.uuid(), kind: "link", url, title: $("linkTitle").value.trim() || url, addedAt: new Date().toISOString() } });
  $("linkUrl").value = ""; $("linkTitle").value = "";
};
function renderLinks() {
  const ls = D.pocket.filter(i => i.kind === "link");
  $("linkList").innerHTML = ls.length ? `<div class="rows">${ls.map(l => `<div class="row row-h" data-id="${esc(l.id)}">
    <div class="grow"><input type="text" class="bare" value="${esc(l.title || "")}" aria-label="Link name"><p class="small muted"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url)}</a></p></div>
    <button class="btn sm danger" data-del>Delete</button></div>`).join("")}</div>` : `<div class="empty">No links yet. Save sites you visit a lot: your portfolio, a job tracker, a course page. Right-click any page to save it too.</div>`;
  $("linkList").querySelectorAll(".row").forEach(row => {
    const id = row.dataset.id;
    row.querySelector("input").onchange = (e) => store({ op: "listPatch", key: "pepper_pocket", id, patch: { title: e.target.value.trim() } });
    row.querySelector("[data-del]").onclick = () => chrome.runtime.sendMessage({ type: "POCKET_REMOVE", id });
  });
}
function renderSnippets() {
  const vars = A.templateVars(answers(), D.details);
  $("snipVars").textContent = "Fill-ins you can use: " + Object.keys(vars).map(k => `{{${k}}}`).join(" ");
  const ss = D.pocket.filter(i => i.kind === "snippet");
  $("snipList").innerHTML = ss.length ? `<div class="rows">${ss.map(s => {
    const f = A.fillTemplate(s.text, vars);
    return `<div class="row" data-id="${esc(s.id)}"><div class="row-h"><div class="grow"><input type="text" class="bare" value="${esc(s.title || "")}" aria-label="Template name"></div><button class="btn sm danger" data-del>Delete</button></div>
      <textarea rows="3" aria-label="Template text">${esc(s.text)}</textarea>
      <p class="small muted">Preview: ${esc(f.text.slice(0, 220))}${f.missing.length ? ` <span class="bad">(not in your details yet: ${esc(f.missing.join(", "))})</span>` : ""}</p></div>`;
  }).join("")}</div>` : `<div class="empty">No templates yet. Save things you write over and over: an intro, a follow-up, a sign-off.</div>`;
  $("snipList").querySelectorAll(".row").forEach(row => {
    const id = row.dataset.id;
    row.querySelector("input").onchange = (e) => store({ op: "listPatch", key: "pepper_pocket", id, patch: { title: e.target.value.trim() } });
    row.querySelector("textarea").onchange = (e) => store({ op: "listPatch", key: "pepper_pocket", id, patch: { text: e.target.value } });
    row.querySelector("[data-del]").onclick = () => chrome.runtime.sendMessage({ type: "POCKET_REMOVE", id });
  });
}
$("snipForm").onsubmit = async (e) => {
  e.preventDefault();
  const text = $("snipText").value.trim(); if (!text) { $("snipText").focus(); return; }
  await store({ op: "listAdd", key: "pepper_pocket", item: { id: C.uuid(), kind: "snippet", title: $("snipTitle").value.trim() || text.slice(0, 50), text, addedAt: new Date().toISOString() } });
  $("snipText").value = ""; $("snipTitle").value = "";
};
let detTimer = null;
function renderDetails() {
  const d = D.details;
  $("detailsForm").innerHTML = A.DETAILS.map(x => `<label class="field"><span>${esc(x.label)}</span><input type="text" data-d="${x.id}" value="${esc(d[x.id] || "")}" autocomplete="off"></label>`).join("");
  $("detailsForm").querySelectorAll("input[data-d]").forEach(i => i.oninput = () => { clearTimeout(detTimer); detTimer = setTimeout(saveDetails, 500); });
  const custom = Array.isArray(d.custom) ? d.custom : [];
  $("customList").innerHTML = custom.length ? `<div class="rows">${custom.map((c, i) => `<div class="row row-h"><div class="grow"><b>${esc(c.label)}</b><p class="small muted">${esc(c.value)}</p></div><button class="btn sm danger" data-i="${i}">Delete</button></div>`).join("")}</div>` : "";
  $("customList").querySelectorAll("[data-i]").forEach(b => b.onclick = () => { const next = custom.filter((_, i) => i !== +b.dataset.i); store({ op: "set", key: "pepper_details", value: { ...collectDetails(), custom: next } }); });
}
function collectDetails() {
  const out = { custom: Array.isArray(D.details.custom) ? D.details.custom : [] };
  $("detailsForm").querySelectorAll("input[data-d]").forEach(i => { const v = i.value.trim(); if (v) out[i.dataset.d] = v; });
  return out;
}
async function saveDetails() {
  const next = collectDetails();
  if (Object.values(next).some(v => typeof v === "string" && A.looksLikeCard(v))) { $("detailsSaved").className = "small bad"; $("detailsSaved").textContent = "That looks like a card number, so it wasn't saved."; return; }
  D.details = next;
  await store({ op: "set", key: "pepper_details", value: next });
  $("detailsSaved").className = "saved"; flashSaved("detailsSaved");
}
$("customForm").onsubmit = async (e) => {
  e.preventDefault();
  const label = $("customLabel").value.trim(), value = $("customValue").value.trim();
  if (!label || !value) return;
  if (A.sensitiveLabel(label) || A.looksLikeCard(value)) { $("customNote").textContent = "Pepper doesn't keep passwords, payment details or ID numbers."; return; }
  $("customNote").textContent = "";
  await store({ op: "set", key: "pepper_details", value: { ...collectDetails(), custom: [...(D.details.custom || []), { label, value }] } });
  $("customLabel").value = ""; $("customValue").value = "";
};

/* ---------------- PROJECTS ---------------- */
$("pType").innerHTML = C.PROJECT_TYPES.map(t => `<option>${esc(t)}</option>`).join("");
$("projForm").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("pName").value.trim(); if (!name) return;
  const id = C.uuid();
  await store({ op: "listAdd", key: "pepper_projects", end: true, item: { id, name, type: $("pType").value, description: $("pDesc").value.trim(), fileIds: [], createdAt: new Date().toISOString() } });
  if (!D.activeProjectId) await store({ op: "set", key: "pepper_active_project", value: id });
  $("pName").value = ""; $("pDesc").value = ""; $("projCreate").open = false;
};
function renderProjects() {
  if (!D.projects.length) $("projCreate").open = true;
  const fl = files();
  $("projList").innerHTML = D.projects.length ? `<div class="rows">${D.projects.map(p => {
    const active = String(p.id) === String(D.activeProjectId);
    const chips = fl.length ? fl.map(f => `<button type="button" class="fchip" data-f="${esc(f.id)}" aria-pressed="${(p.fileIds || []).map(String).includes(String(f.id))}" title="${f.text ? "" : "Add this file's text in the Pocket so prompts can use it"}">${esc(f.name)}${f.text ? "" : " ·  no text"}</button>`).join("")
      : `<span class="small muted">Add files to your Pocket, then attach them here.</span>`;
    return `<div class="row proj ${active ? "active" : ""}" data-id="${esc(p.id)}">
      <div class="row-h"><div class="grow"><h3>${esc(p.name)}</h3><p class="desc">${esc(p.description || "")}</p></div>
        <span class="tag">${esc(p.type)}</span>
        ${active ? `<span class="tag pepper">Active</span>` : `<button class="btn sm" data-act>Make active</button>`}
        <button class="btn sm danger" data-del>Delete</button></div>
      <div class="small muted" style="margin-top:10px">Files used as the source of truth (click to attach or detach):</div>
      <div class="chips">${chips}</div>
    </div>`;
  }).join("")}</div>` : "";
  $("projList").querySelectorAll(".proj").forEach(row => {
    const id = row.dataset.id;
    const p = D.projects.find(x => String(x.id) === id);
    row.querySelectorAll(".fchip").forEach(c => c.onclick = () => {
      const s = new Set((p.fileIds || []).map(String)); const f = c.dataset.f;
      s.has(f) ? s.delete(f) : s.add(f);
      store({ op: "listPatch", key: "pepper_projects", id, patch: { fileIds: [...s] } });
    });
    const act = row.querySelector("[data-act]"); if (act) act.onclick = () => store({ op: "set", key: "pepper_active_project", value: id });
    row.querySelector("[data-del]").onclick = async () => {
      if (!confirm(`Delete the project "${p.name}"? Its files stay in your Pocket.`)) return;
      await store({ op: "listRemove", key: "pepper_projects", id });
      if (String(D.activeProjectId) === id) await store({ op: "set", key: "pepper_active_project", value: null });
    };
  });
}

/* ---------------- HISTORY (sent, learned, saved) ---------------- */
let histTab = "sent", histLimit = 50;
function showHist(t) {
  histTab = t;
  document.querySelectorAll("#histNav button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.h === t)));
  document.querySelectorAll("[data-hist]").forEach(s => s.hidden = s.dataset.hist !== t);
  renderHistoryAll();
}
document.querySelectorAll("#histNav button").forEach(b => b.onclick = () => showHist(b.dataset.h));
function renderHistoryAll() {
  $("histCount").textContent = D.history.length ? String(D.history.length) : "";
  if (histTab === "sent") renderHistory();
  if (histTab === "learned") renderLearned();
  if (histTab === "saved") renderSaved();
}
$("histSearch").oninput = () => { histLimit = 50; renderHistory(); };
$("histSite").onchange = () => { histLimit = 50; renderHistory(); };
$("histKind").onchange = () => { histLimit = 50; renderHistory(); };
function recRow(h) {
  const proj = D.projects.find(p => String(p.id) === String(h.projectId));
  const stars = [1, 2, 3, 4, 5].map(n => `<button class="star ${h.rating && n <= h.rating ? "on" : ""}" data-n="${n}" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`).join("");
  return `<div class="row rec" data-id="${esc(h.id)}">
    <div class="row-h"><div class="grow"><span class="tag">${esc(siteName(h.site))}</span>
      ${h.assisted ? `<span class="tag corn" title="Similarity to what Pepper inserted: ${Math.round((h.similarity || 0) * 100)}%">Through Pepper</span>` : ""}
      ${h.assisted && h.lens ? `<span class="tag">${esc(C.lensLabel(h.lens))}</span>` : ""}
      ${proj ? `<span class="tag">${esc(proj.name)}</span>` : ""}</div><span class="when">${when(h.ts)}</span></div>
    <div class="prompt text clamp">${esc(h.assisted && h.raw ? "You asked: " + h.raw : h.prompt)}</div>
    <details><summary>Show full prompt and reply</summary>
      <div class="prompt text serif" style="margin-top:8px">${esc(h.prompt)}</div>
      ${h.response ? `<div class="reply text">${esc(h.response)}${h.truncated ? "\n[reply trimmed to 4,000 characters]" : ""}${h.partial ? "\n[reply was still arriving when Pepper saved it]" : ""}</div>` : `<p class="small muted">Pepper couldn't read the reply on this page.</p>`}
    </details>
    <div class="foot"><span class="stars" role="group" aria-label="Your rating">${stars}</span><button class="link danger small" data-del>Delete</button></div>
  </div>`;
}
function bindRecRows(el) {
  el.querySelectorAll(".rec").forEach(row => {
    const id = row.dataset.id;
    row.querySelectorAll(".star").forEach(s => s.onclick = () => store({ op: "listPatch", key: "pepper_history", id, patch: { rating: +s.dataset.n } }));
    const d = row.querySelector("[data-del]"); if (d) d.onclick = () => store({ op: "listRemove", key: "pepper_history", id });
  });
}
function renderHistory() {
  const sites = [...new Set(D.history.map(h => siteName(h.site)))];
  const sel = $("histSite"), keep = sel.value;
  sel.innerHTML = `<option value="">All sites</option>` + sites.map(s => `<option ${s === keep ? "selected" : ""}>${esc(s)}</option>`).join("");
  const q = $("histSearch").value.toLowerCase(), site = sel.value, kind = $("histKind").value;
  const items = D.history.filter(h => (!q || (h.prompt + " " + (h.response || "") + " " + (h.raw || "")).toLowerCase().includes(q))
    && (!site || siteName(h.site) === site) && (!kind || (kind === "assisted" ? h.assisted : h.rating == null)));
  $("histList").innerHTML = items.length ? `<div class="rows">${items.slice(0, histLimit).map(recRow).join("")}</div>
    ${items.length > histLimit ? `<p style="margin-top:12px"><button class="btn" id="more">Show more (${items.length - histLimit} left)</button></p>` : ""}`
    : `<div class="empty">${D.history.length ? "No prompts match." : (consentCount() ? "Nothing yet. Send a prompt on a site with learning on." : "Learning is off on every site, so nothing is recorded.")}${!consentCount() ? `<br><a class="btn sm" href="#settings">Turn on learning</a>` : ""}</div>`;
  bindRecRows($("histList"));
  const m = $("more"); if (m) m.onclick = () => { histLimit += 50; renderHistory(); };
}
function renderLearned() {
  const on = consentCount();
  $("learnStatus").innerHTML = on ? `<div class="notice pepper">Learning is on for ${on} of 5 sites. <a href="#settings">Change</a></div>`
    : `<div class="notice warn">Learning is off on every site, so Pepper can't learn anything yet. <a href="#settings">Turn it on</a></div>`;
  const types = Object.entries(D.learning.types || {}).filter(([, t]) => t.total > 0 || t.resetAt);
  $("learnTypes").innerHTML = types.length ? `<div class="rows">${types.map(([T, t]) => {
    const head = t.lens && t.lens !== "auto"
      ? `<div class="big">Pepper picks ${esc(C.lensLabel(t.lens))} first</div><p class="why">Because of ${esc(t.reason)}.</p>`
      : `<div class="big">Still learning</div><p class="why">${t.needed > 0 ? `Rate ${t.needed} more ${t.needed === 1 ? "reply" : "replies"} from prompts written with Pepper.` : esc(t.reason || "")}</p>`;
    const rows = Object.entries(t.stats || {}).sort((a, b) => b[1].mean - a[1].mean).map(([l, s]) =>
      `<tr class="${l === t.lens && t.lens !== "auto" ? "best" : ""}"><td>${esc(C.lensLabel(l))}</td><td><span class="meter"><i style="width:${s.mean / 5 * 100}%"></i></span> ${s.mean.toFixed(1)}</td><td class="n">${s.n}</td></tr>`).join("");
    const len = t.words ? `Aims for about ${t.words} words, the median of your ${t.topCount} prompts rated 4 or 5 stars (kept inside your length setting).`
      : `Length: needs 3 prompts rated 4 or 5 stars to learn a length (${t.topCount || 0} so far).`;
    return `<div class="row ltype"><div class="row-h"><div class="grow"><span class="tag">${esc(T)}</span>${head}</div>
      <button class="btn sm" data-reset="${esc(T)}">Reset</button></div>
      ${rows ? `<table><thead><tr><th>Approach</th><th>Average rating</th><th class="n">Ratings</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
      <p class="small muted" style="margin-top:10px">${len}</p>
      ${t.resetAt ? `<p class="small muted">Counting ratings since you reset on ${when(t.resetAt)}.</p>` : ""}
    </div>`;
  }).join("")}</div>` : `<div class="empty">Nothing learned yet. Send prompts through Pepper on a site with learning on and rate the replies. After ${C.MIN_RATINGS} ratings for one kind of work, Pepper starts picking the approach that scored best.</div>`;
  $("learnTypes").querySelectorAll("[data-reset]").forEach(b => b.onclick = async () => {
    if (!confirm(`Reset what Pepper learned for ${b.dataset.reset}? Your history stays; Pepper goes back to its starting approach and counts only new ratings.`)) return;
    await chrome.runtime.sendMessage({ type: "LEARNING_RESET", projectType: b.dataset.reset });
  });
  const lift = C.ratingLift(D.history, D.learning);
  $("liftBlock").innerHTML = lift.afterN ? `<div class="block"><h2>Since Pepper started choosing</h2>
    <p>Prompts written after Pepper picked your approach average <b>${lift.after} stars</b> (${lift.afterN}), against <b>${lift.before ?? "—"}</b> before (${lift.beforeN}).</p></div>` : "";
  const best = D.history.filter(h => h.assisted && h.rating >= 4 && h.raw).sort((a, b) => b.rating - a.rating).slice(0, 8);
  $("bestList").innerHTML = best.length ? `<div class="rows">${best.map(h => `<div class="row row-h"><div class="grow">${esc(h.raw)}</div><span class="tag corn">${h.rating}★</span><span class="tag">${esc(h.projectType || "General")}</span></div>`).join("")}</div>`
    : `<div class="empty">None yet.</div>`;
}
$("savedSearch").oninput = () => renderSaved();
function renderSaved() {
  const q = $("savedSearch").value.toLowerCase();
  const items = D.saved.filter(s => !q || (s.text + " " + (s.title || "")).toLowerCase().includes(q));
  $("savedList").innerHTML = items.length ? `<div class="rows">${items.map(s => {
    const proj = D.projects.find(p => String(p.id) === String(s.projectId));
    const title = s.title || s.text.split("\n").find(l => l.trim() && !C.SECTIONS.includes(l.trim().toUpperCase())) || "Saved prompt";
    return `<div class="row rec" data-id="${esc(s.id)}">
      <div class="row-h"><div class="grow"><b>${esc(title)}</b></div>${proj ? `<span class="tag">${esc(proj.name)}</span>` : ""}<span class="when">${when(s.createdAt)}</span></div>
      <details><summary>Show prompt (${C.words(s.text)} words)</summary><div class="prompt text serif">${esc(s.text)}</div></details>
      <div class="foot"><span></span><span><button class="btn sm" data-copy>Copy</button> <button class="btn sm danger" data-del>Delete</button></span></div>
    </div>`;
  }).join("")}</div>` : `<div class="empty">${q ? "No saved prompts match." : "Nothing saved yet. After Pepper writes a prompt, click Save in the panel."}</div>`;
  $("savedList").querySelectorAll(".rec").forEach(row => {
    const s = D.saved.find(x => String(x.id) === row.dataset.id);
    row.querySelector("[data-copy]").onclick = async (e) => { await navigator.clipboard.writeText(s.text); e.target.textContent = "Copied"; setTimeout(() => e.target.textContent = "Copy", 1200); };
    row.querySelector("[data-del]").onclick = () => store({ op: "listRemove", key: "pepper_saved_prompts", id: s.id });
  });
}

/* ---------------- REMINDERS ---------------- */
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const saveReminders = (items) => store({ op: "listSet", key: "pepper_reminders", items });
async function renderReminders() {
  const perm = await chrome.permissions.contains({ permissions: ["notifications"] });
  const on = D.features.reminders;
  $("remStatus").className = "notice " + (on && perm ? "pepper" : "warn");
  $("remStatus").innerHTML = on && perm ? `Reminders are on. <button class="link" id="remOff">Turn them off</button>`
    : `Reminders are off${on && !perm ? " because your browser hasn't allowed notifications" : ""}. <button class="btn sm primary" id="remOn">Turn on reminders</button>`;
  const onBtn = $("remOn"), offBtn = $("remOff");
  if (onBtn) onBtn.onclick = async () => {
    const ok = await chrome.permissions.request({ permissions: ["notifications"] }).catch(() => false);
    if (!ok) { $("remNote").textContent = "Your browser didn't allow notifications."; return; }
    await setFeature("reminders", true);
    if (!D.reminders.length) { const f = A.focusReminder(answers()); if (f) await saveReminders([f]); }
  };
  if (offBtn) offBtn.onclick = () => setFeature("reminders", false);
  $("remList").innerHTML = D.reminders.length ? `<div class="rows">${D.reminders.map(r => {
    const days = r.days && r.days.length ? r.days : [0, 1, 2, 3, 4, 5, 6];
    return `<div class="row rem" data-id="${esc(r.id)}">
      <label class="switch" title="On or off"><input type="checkbox" ${r.enabled !== false ? "checked" : ""} aria-label="Reminder on"><i></i></label>
      <div class="grow"><input type="text" class="bare" value="${esc(r.text)}" aria-label="Reminder text">
        <div class="days">${DAYS.map((d, i) => `<button type="button" data-day="${i}" aria-pressed="${days.includes(i)}" aria-label="${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]}">${d}</button>`).join("")}</div></div>
      <input type="time" value="${esc(r.time)}" aria-label="Time">
      ${r.id === "focus" ? `<span class="tag pepper">Focus</span>` : `<button class="btn sm danger" data-del>Delete</button>`}
    </div>`;
  }).join("")}</div>` : `<div class="empty">No reminders yet. Add one below.</div>`;
  $("remList").querySelectorAll(".rem").forEach(row => {
    const id = row.dataset.id;
    const patch = (p) => saveReminders(D.reminders.map(r => String(r.id) === id ? { ...r, ...p } : r));
    row.querySelector(".switch input").onchange = (e) => patch({ enabled: e.target.checked });
    row.querySelector("input.bare").onchange = (e) => patch({ text: e.target.value.trim() || "Time to focus." });
    row.querySelector('input[type="time"]').onchange = (e) => { if (A.parseTime(e.target.value)) patch({ time: e.target.value }); };
    row.querySelectorAll("[data-day]").forEach(b => b.onclick = () => {
      const r = D.reminders.find(x => String(x.id) === id);
      const set = new Set(r.days && r.days.length ? r.days : [0, 1, 2, 3, 4, 5, 6]);
      const d = +b.dataset.day; set.has(d) ? set.delete(d) : set.add(d);
      if (!set.size) return;
      patch({ days: [...set].sort() });
    });
    const del = row.querySelector("[data-del]"); if (del) del.onclick = () => saveReminders(D.reminders.filter(r => String(r.id) !== id));
  });
}
$("remForm").onsubmit = async (e) => {
  e.preventDefault();
  const text = $("remText").value.trim(), time = $("remTime").value;
  if (!text || !A.parseTime(time)) return;
  await saveReminders([...D.reminders, { id: C.uuid(), kind: "custom", text, time, days: [1, 2, 3, 4, 5], enabled: true }]);
  $("remText").value = "";
  if (!D.features.reminders) $("remNote").textContent = "Saved. Turn reminders on above so it can fire.";
};
$("remTest").onclick = async () => {
  const r = await chrome.runtime.sendMessage({ type: "REMINDER_TEST" });
  $("remNote").textContent = r && r.ok ? "Sent. Check your notifications." : "Turn reminders on first, and allow notifications.";
};

/* ---------------- SETTINGS ---------------- */
function renderSettings() {
  document.querySelectorAll('#floatChoice input').forEach(r => { r.checked = r.value === (D.settings.floating || "ai"); });
  $("floatNote").textContent = D.settings.floatingLost ? "The all-sites permission was removed, so Pepper went back to AI sites only." : "";
  const hidden = Object.entries(D.ui || {}).filter(([, v]) => v && v.hidden).map(([k]) => k);
  $("hiddenSites").innerHTML = hidden.length ? `<p class="small muted">Hidden on: ${hidden.map(h => `<span class="tag">${esc(h)} <button class="link" data-show="${esc(h)}">show</button></span>`).join(" ")}</p>` : "";
  $("hiddenSites").querySelectorAll("[data-show]").forEach(b => b.onclick = () => store({ op: "objPatch", key: "pepper_ui", patch: { [b.dataset.show]: { ...(D.ui[b.dataset.show] || {}), hidden: false } } }));
  const rows = A.FEATURES.map(f => ({ id: f.id, label: f.label, line: f.line, on: !!D.features[f.id] }))
    .concat([{ id: "selectionButton", label: "Selection button", line: "Show a small Fix · Ask AI button when you select text (needs the writing helper).", on: D.settings.selectionButton !== false }]);
  $("featureRows").innerHTML = rows.map(r => `<div class="row consent"><div><b>${esc(r.label)}</b><p class="small muted">${esc(r.line)}</p></div>
    <label class="switch"><input type="checkbox" data-feature="${r.id}" ${r.on ? "checked" : ""} aria-label="${esc(r.label)}"><i></i></label></div>`).join("");
  $("featureRows").querySelectorAll("input[data-feature]").forEach(i => i.onchange = async () => {
    const id = i.dataset.feature;
    if (id === "selectionButton") return store({ op: "objPatch", key: "pepper_settings", patch: { selectionButton: i.checked } });
    if (id === "reminders" && i.checked && !(await chrome.permissions.request({ permissions: ["notifications"] }).catch(() => false))) { i.checked = false; return; }
    setFeature(id, i.checked);
  });
  $("consentRows").innerHTML = C.SITES.map(s => {
    const on = !!(D.consent[s.id] && D.consent[s.id].learning);
    return `<div class="row consent"><div><b>${esc(s.name)}</b><p class="small muted">${s.hosts.join(", ")}: ${on ? "saving prompts, replies and ratings" : "writing prompts only, nothing saved"}</p></div>
      <label class="switch corn"><input type="checkbox" data-site="${s.id}" ${on ? "checked" : ""} aria-label="Learning on ${esc(s.name)}"><i></i></label></div>`;
  }).join("");
  $("consentRows").querySelectorAll("input[data-site]").forEach(i => i.onchange = () => setConsent({ [i.dataset.site]: { learning: i.checked } }));
  AI.fillSelect($("sProvider"), D.settings.provider || "none");
  $("sImprove").checked = D.settings.improveButton !== false;
  $("sKey").value = "";
  $("sKey").placeholder = hasKey() ? `A key is saved (${D.settings.keyHint || "hidden"}). Paste a new one to replace it.` : "Paste your key";
  $("sModel").value = D.settings.model || "";
  $("sMin").value = D.settings.minChars || 6;
  syncModelHelp();
  $("histCount2").textContent = `${D.history.length} prompts recorded. Your ratings and what Pepper learned from them go too.`;
  $("keyState").textContent = hasKey() ? `A ${({ anthropic: "Anthropic", openai: "OpenAI", gemini: "Google Gemini" })[D.settings.provider] || ""} key is stored in this browser.` : "No key stored.";
  $("removeKey").disabled = !D.settings.hasKey;
}
document.querySelectorAll('#floatChoice input').forEach(r => r.onchange = async () => {
  if (r.value === "everywhere") {
    const ok = await chrome.permissions.request({ origins: ["<all_urls>"] }).catch(() => false);
    if (!ok) { $("floatNote").textContent = "Your browser didn't allow it, so Pepper stays on AI sites."; renderSettings(); return; }
  }
  await store({ op: "objPatch", key: "pepper_settings", patch: { floating: r.value, floatingLost: false } });
  const s = await chrome.runtime.sendMessage({ type: "SYNC" });
  $("floatNote").textContent = r.value === "everywhere" ? (s && s.floating ? "Pepper now floats on every page, including the tabs you have open." : "Saved.") : "Pepper floats on AI sites only.";
});
const setConsent = (patch) => store({ op: "objPatch", key: "pepper_consent", patch });
$("allOn").onclick = () => { const p = {}; C.SITES.forEach(s => p[s.id] = { learning: true }); setConsent(p); };
$("allOff").onclick = () => { const p = {}; C.SITES.forEach(s => p[s.id] = { learning: false }); setConsent(p); };
function syncModelHelp() {
  const p = $("sProvider").value;
  const def = C.DEFAULT_MODELS[p];
  $("sModel").placeholder = def || "";
  $("sModel").disabled = $("sKey").disabled = !keyedAI(p);
  $("sKeyField").hidden = $("sModelField").hidden = !keyedAI(p);
  $("testKey").disabled = p === "none";
  $("testKey").textContent = p === "chrome" ? "Turn it on" : "Test connection";
  $("modelHelp").textContent = def ? `Leave blank to use ${def}. Check your provider's model list if it fails.` : "";
  $("providerHelp").innerHTML = p === "chrome" ? "Runs on this computer, so nothing you type leaves it. Needs a recent Chrome on a capable computer."
    : p === "none" ? "Without an AI, Pepper asks the chat's own AI to work out what you mean before it answers." : AI.helpHtml(p);
}
$("sProvider").onchange = syncModelHelp;
$("showKey").onclick = () => { const k = $("sKey"); k.type = k.type === "password" ? "text" : "password"; $("showKey").textContent = k.type === "password" ? "Show" : "Hide"; };
$("shortcuts").onclick = () => chrome.tabs.create({ url: navigator.userAgent.includes("Edg/") ? "edge://extensions/shortcuts" : "chrome://extensions/shortcuts" });
async function saveSettings() {
  const provider = $("sProvider").value, key = $("sKey").value.trim();
  // Keys go to the worker's vault, never into storage that web pages' scripts could read.
  if (key && keyedAI(provider)) await chrome.runtime.sendMessage({ type: "SET_KEY", provider, apiKey: key });
  else await chrome.runtime.sendMessage({ type: "SET_KEY", provider }); // a different provider drops the old key
  await store({ op: "objPatch", key: "pepper_settings", patch: { model: $("sModel").value.trim(), minChars: Math.max(2, Math.min(40, +$("sMin").value || 6)), improveButton: $("sImprove").checked } });
  $("sKey").value = "";
}
$("settingsForm").onsubmit = async (e) => { e.preventDefault(); await saveSettings(); flashSaved("settingsSaved"); };
$("testKey").onclick = async () => {
  const provider = $("sProvider").value;
  if (provider !== "chrome") await saveSettings();
  await AI.connect(provider, "", (cls, text) => { $("testNote").className = "small " + cls; $("testNote").textContent = text; });
};
$("export").onclick = async () => {
  const s = await chrome.storage.local.get(null);
  delete s.pepper_settings; // settings hold the key: never exported
  // File contents and the key live in the worker's vault and aren't exported; download files from the Pocket.
  for (const k of Object.keys(s)) if (k.startsWith("pepper_blob_")) delete s[k]; // in case an old copy is still in storage
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), product: C.PRODUCT, ...s }, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "pepper-data.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$("clearHist").onclick = async () => {
  if (!confirm("Delete all recorded prompts, replies and ratings? Your profile, Pocket, memories, projects and saved prompts are kept.")) return;
  await store({ op: "listSet", key: "pepper_history", items: [] });
};
$("removeKey").onclick = async () => { if (confirm("Remove your API key from this browser?")) await chrome.runtime.sendMessage({ type: "SET_KEY", provider: "none" }); };
$("wipe").onclick = async () => {
  if (!confirm("Delete everything Pepper has stored in this browser, including your Pocket and API key? This can't be undone.")) return;
  await chrome.runtime.sendMessage({ type: "WIPE" });
  location.href = "onboarding.html";
};

/* ---------------- live updates ---------------- */
let reTimer = null;
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== "local") return;
  clearTimeout(reTimer);
  reTimer = setTimeout(async () => {
    await load();
    if (!A.setupComplete(D.profile, D.settings)) { location.replace("onboarding.html"); return; }
    // Don't re-render a form while the user is typing in it.
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest("#quiz, #settingsForm, #memForm, #projForm, .paste, .fact, #detailsForm, #customForm, #linkForm, #snipForm, #snipList, #remList, #remForm, #linkList");
    if (typing) { renderChrome(); return; }
    render(current);
  }, 120);
});

(async function init() {
  await load();
  if (!A.setupComplete(D.profile, D.settings)) { location.replace("onboarding.html"); return; }
  route();
})();
