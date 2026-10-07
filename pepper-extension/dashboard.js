/* Pepper — The Personal AI Prompter · dashboard (M9). No network of its own;
   model calls go through the worker. Every list write goes through the
   worker's serialized queue, so a content tab writing at the same moment
   can't be overwritten. */
const C = window.PepperCore;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = (op) => chrome.runtime.sendMessage({ type: "STORE", op });
const when = (iso) => { try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } };
const siteName = (host) => (C.siteForHost(host) || { name: String(host || "").replace(/^www\./, "") }).name;
const MAX_FILE_TEXT = 200000;

let D = {};
async function load() {
  const s = await chrome.storage.local.get(null);
  D = {
    settings: { enabled: true, minChars: 6, provider: "none", apiKey: "", model: "", ...(s.pepper_settings || {}) },
    profile: s.pepper_profile || { answers: {}, completed: false },
    memories: s.pepper_memories || [], projects: s.pepper_projects || [], files: s.pepper_files || [],
    saved: s.pepper_saved_prompts || [],
    // newest first by time, whatever order storage holds
    history: (s.pepper_history || []).slice().sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || ""))),
    consent: { ...C.defaultConsent(), ...(s.pepper_consent || {}) },
    learning: s.pepper_learning || { types: {}, dismissedFacts: [] },
    activeProjectId: s.pepper_active_project ?? null
  };
}
const hasKey = () => D.settings.provider !== "none" && !!D.settings.apiKey;
const answeredCount = () => Object.keys(D.profile.answers || {}).length;
const consentCount = () => C.SITES.filter(s => D.consent[s.id] && D.consent[s.id].learning).length;

/* ---------------- routing ---------------- */
const SECTIONS = ["home", "about", "memories", "projects", "saved", "history", "learned", "privacy", "settings"];
let current = "home";
function route() {
  const h = (location.hash || "#home").slice(1);
  current = SECTIONS.includes(h) ? h : "home";
  document.querySelectorAll("[data-section]").forEach(s => s.hidden = s.dataset.section !== current);
  document.querySelectorAll("#nav a").forEach(a => { if (a.dataset.s === current) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  render(current);
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

function render(name) {
  renderChrome();
  ({ home: renderHome, about: renderAbout, memories: renderMemories, projects: renderProjects, saved: renderSaved,
    history: renderHistory, learned: renderLearned, privacy: renderPrivacy, settings: renderSettings })[name]();
}
function renderChrome() {
  const on = D.settings.enabled !== false;
  $("masterSwitch").checked = on;
  $("masterLabel").textContent = on ? "Pepper is on" : "Pepper is off";
  $("masterHelp").textContent = on ? "Shows Pepper on the five AI sites." : "Hidden everywhere. Nothing is recorded.";
  $("navAbout").textContent = `${answeredCount()}/15`;
}
$("masterSwitch").onchange = async (e) => { await store({ op: "objPatch", key: "pepper_settings", patch: { enabled: e.target.checked } }); };

/* ---------------- HOME ---------------- */
function renderHome() {
  const n = answeredCount();
  const projWithFile = D.projects.some(p => (p.fileIds || []).some(id => D.files.find(f => String(f.id) === String(id) && f.text)));
  const items = [
    { done: n >= 10, title: "Tell Pepper about you", desc: `${n} of 15 questions answered. Each one changes your prompts.`, href: "#about", cta: n ? "Keep going" : "Answer questions" },
    { done: projWithFile, title: "Create a project and attach your resume or notes", desc: "Pepper treats a project's files as the source of truth.", href: "#projects", cta: "Add a project" },
    { done: consentCount() > 0, title: "Turn learning on for the sites you use", desc: consentCount() ? `On for ${consentCount()} of 5 sites.` : "Off everywhere. Pepper can't learn what works for you yet.", href: "#privacy", cta: "Choose sites" },
    { done: hasKey(), title: "Add your model key", desc: "Optional. Your own model writes much fuller prompts than the built-in template.", href: "#settings", cta: "Add key" },
    { done: D.history.some(h => h.assisted) || D.saved.length > 0, title: "Write your first prompt", desc: "Open ChatGPT, Claude, Gemini, Perplexity or Copilot and click the green peppercorn in the corner, or press Alt+Shift+P.", href: null }
  ];
  $("checklist").innerHTML = items.map((it, i) => `<li class="${it.done ? "done" : ""}">
    <span class="tick" aria-hidden="true">${it.done ? "✓" : i + 1}</span>
    <div><b>${esc(it.title)}</b><p>${esc(it.desc)}</p></div>
    ${it.href && !it.done ? `<a class="btn sm" href="${it.href}">${esc(it.cta)}</a>` : `<span class="small muted">${it.done ? "Done" : ""}</span>`}
  </li>`).join("");

  const h = D.history;
  if (!h.length) {
    $("figures").innerHTML = `<div class="wide"><dd>Figures appear once you send prompts on a site with learning on.</dd></div>`;
  } else {
    const rated = h.filter(r => r.rating != null);
    const avg = rated.length ? (rated.reduce((a, b) => a + b.rating, 0) / rated.length).toFixed(1) : "—";
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

/* ---------------- ABOUT YOU ---------------- */
const GROUPS = [
  { title: "You", ids: ["q3", "q4", "q2", "q10", "q12"] },
  { title: "How you like answers", ids: ["q6", "q5", "q8", "q9", "q14", "q13"] },
  { title: "How Pepper works for you", ids: ["q15", "q7", "q11", "q1"] }
];
let aboutTimer = null;
function renderAbout() {
  const a = D.profile.answers || {};
  $("quiz").innerHTML = GROUPS.map(g => `<div class="qgroup"><h2>${esc(g.title)}</h2>${g.ids.map(id => {
    const q = C.QUESTIONS.find(x => x.id === id);
    const has = a[id] != null && (!Array.isArray(a[id]) || a[id].length);
    let body;
    if (q.type === "text") body = `<input type="text" data-q="${q.id}" value="${esc(a[q.id] || "")}" placeholder="${esc(q.ph || "")}" aria-label="${esc(q.t)}">`;
    else {
      const cur = q.type === "multi" ? (Array.isArray(a[q.id]) ? a[q.id] : []) : (a[q.id] ? [a[q.id]] : []);
      body = `<div class="opts" data-q="${q.id}" data-type="${q.type}" role="group" aria-label="${esc(q.t)}">${q.opts.map(o =>
        `<button type="button" class="opt" data-o="${esc(o)}" aria-pressed="${cur.includes(o)}">${esc(o)}</button>`).join("")}</div>`;
    }
    return `<div class="q ${has ? "answered" : ""}" data-qrow="${q.id}"><div class="q-t">${esc(q.t)}</div>${body}<div class="q-e">${esc(q.effect)}</div></div>`;
  }).join("")}</div>`).join("");
  $("quiz").querySelectorAll(".opts").forEach(group => group.querySelectorAll(".opt").forEach(b => b.onclick = () => {
    const single = group.dataset.type === "single";
    const on = b.getAttribute("aria-pressed") === "true";
    if (single) group.querySelectorAll(".opt").forEach(x => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", String(!on));
    saveAbout();
  }));
  $("quiz").querySelectorAll("input[data-q]").forEach(i => i.oninput = () => { clearTimeout(aboutTimer); aboutTimer = setTimeout(saveAbout, 500); });
  updateAboutProgress();
}
function collectAnswers() {
  const answers = {};
  $("quiz").querySelectorAll("input[data-q]").forEach(i => { if (i.value.trim()) answers[i.dataset.q] = i.value.trim(); });
  $("quiz").querySelectorAll(".opts").forEach(g => {
    const chosen = [...g.querySelectorAll('.opt[aria-pressed="true"]')].map(o => o.dataset.o);
    if (g.dataset.type === "single") { if (chosen[0]) answers[g.dataset.q] = chosen[0]; }
    else if (chosen.length) answers[g.dataset.q] = chosen;
  });
  return answers;
}
async function saveAbout() {
  const answers = collectAnswers();
  D.profile = { answers, completed: Object.keys(answers).length >= 10 };
  await store({ op: "set", key: "pepper_profile", value: D.profile });
  $("aboutSaved").textContent = "Saved";
  setTimeout(() => $("aboutSaved").textContent = "", 1400);
  $("quiz").querySelectorAll("[data-qrow]").forEach(r => r.classList.toggle("answered", answers[r.dataset.qrow] != null));
  updateAboutProgress(); renderChrome();
}
function updateAboutProgress() {
  const n = answeredCount();
  $("aboutCount").textContent = `${n} of 15 answered`;
  $("aboutBar").style.width = (n / 15 * 100) + "%";
}

/* ---------------- MEMORIES ---------------- */
function renderMemories() {
  const list = $("memList");
  list.innerHTML = D.memories.length ? `<div class="rows">${D.memories.map(m => `
    <div class="row mem ${m.active ? "" : "off"}" data-id="${esc(m.id)}">
      <label class="switch" title="${m.active ? "On: added to every prompt" : "Off: not used"}"><input type="checkbox" ${m.active ? "checked" : ""} aria-label="Use this memory"><i></i></label>
      <input type="text" value="${esc(m.text)}" aria-label="Memory text">
      <button class="btn sm danger" data-del>Delete</button>
    </div>`).join("")}</div>` : `<div class="empty">No memories yet. Add one above, or let Pepper suggest some from your prompts below.</div>`;
  list.querySelectorAll(".mem").forEach(row => {
    const id = row.dataset.id;
    row.querySelector(".switch input").onchange = (e) => store({ op: "listPatch", key: "pepper_memories", id, patch: { active: e.target.checked } });
    row.querySelector('input[type=text]').onchange = (e) => { const t = e.target.value.trim(); if (t) store({ op: "listPatch", key: "pepper_memories", id, patch: { text: t } }); };
    row.querySelector("[data-del]").onclick = () => store({ op: "listRemove", key: "pepper_memories", id });
  });
  const hist = D.history.length;
  $("factsBtn").disabled = !hasKey() || !hist;
  $("factsNote").textContent = !hasKey() ? "Needs a model key (Model and settings)." : !hist ? "Needs prompts in your history first." : "";
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

/* ---------------- PROJECTS + FILES ---------------- */
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
  $("projList").innerHTML = D.projects.length ? `<div class="rows">${D.projects.map(p => {
    const active = String(p.id) === String(D.activeProjectId);
    const chips = D.files.length ? D.files.map(f => `<button type="button" class="fchip" data-f="${esc(f.id)}" aria-pressed="${(p.fileIds || []).map(String).includes(String(f.id))}">${esc(f.name)}</button>`).join("")
      : `<span class="small muted">Add files below, then attach them here.</span>`;
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
      if (!confirm(`Delete the project "${p.name}"? Its files stay in your library.`)) return;
      await store({ op: "listRemove", key: "pepper_projects", id });
      if (String(D.activeProjectId) === id) await store({ op: "set", key: "pepper_active_project", value: null });
    };
  });
  renderFiles();
}
const drop = $("drop"), fileInput = $("fileInput");
$("pick").onclick = () => fileInput.click();
fileInput.onchange = () => { handleFiles(fileInput.files); fileInput.value = ""; };
["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => handleFiles(e.dataTransfer.files));
const isTextLike = (f) => /\.(txt|md|markdown|csv|tsv|json|js|ts|jsx|tsx|py|java|c|cpp|cs|go|rb|php|html|css|xml|ya?ml|log|sql|sh|rtf|tex)$/i.test(f.name) || (f.type || "").startsWith("text");
async function handleFiles(list) {
  for (const f of list) {
    const rec = { id: C.uuid(), name: f.name, type: f.type || "", size: f.size, text: "", needsPaste: false, addedAt: new Date().toISOString() };
    if (isTextLike(f)) rec.text = (await f.text()).slice(0, MAX_FILE_TEXT); else rec.needsPaste = true;
    await store({ op: "listAdd", key: "pepper_files", end: true, item: rec });
  }
}
function renderFiles() {
  $("fileList").innerHTML = D.files.length ? `<div class="rows">${D.files.map(f => `<div class="row" data-id="${esc(f.id)}">
    <div class="row-h"><div class="grow"><b>${esc(f.name)}</b>
      <p class="small muted">${(f.size / 1024).toFixed(1)} KB, ${f.text ? f.text.length.toLocaleString() + " characters" + (f.text.length > C.FILE_BUDGET ? ` (Pepper uses the first ${C.FILE_BUDGET.toLocaleString()})` : "") : "no text yet"}</p></div>
      <button class="btn sm danger" data-del>Delete</button></div>
    ${f.text ? `<details><summary class="small link">Preview</summary><div class="prev text">${esc(f.text.slice(0, 1200))}${f.text.length > 1200 ? "…" : ""}</div></details>`
      : `<div class="paste"><textarea rows="4" placeholder="Pepper can't read this file type. Paste its text here, for example your resume."></textarea><div><button class="btn sm primary" data-save>Save text</button></div></div>`}
  </div>`).join("")}</div>` : `<div class="empty">No files yet. Your resume is a good first one.</div>`;
  $("fileList").querySelectorAll(".row").forEach(row => {
    const id = row.dataset.id;
    row.querySelector("[data-del]").onclick = async () => {
      await store({ op: "listRemove", key: "pepper_files", id });
      for (const p of D.projects) if ((p.fileIds || []).map(String).includes(id))
        await store({ op: "listPatch", key: "pepper_projects", id: p.id, patch: { fileIds: p.fileIds.filter(x => String(x) !== id) } });
    };
    const sv = row.querySelector("[data-save]");
    if (sv) sv.onclick = () => { const t = row.querySelector("textarea").value; if (t.trim()) store({ op: "listPatch", key: "pepper_files", id, patch: { text: t.slice(0, MAX_FILE_TEXT), needsPaste: false } }); };
  });
}

/* ---------------- SAVED ---------------- */
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

/* ---------------- HISTORY ---------------- */
let histLimit = 50;
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
    : `<div class="empty">${D.history.length ? "No prompts match." : (consentCount() ? "Nothing yet. Send a prompt on a site with learning on." : "Learning is off on every site, so nothing is recorded.")}${!consentCount() ? `<br><a class="btn sm" href="#privacy">Turn on learning</a>` : ""}</div>`;
  bindRecRows($("histList"));
  const m = $("more"); if (m) m.onclick = () => { histLimit += 50; renderHistory(); };
}

/* ---------------- WHAT PEPPER LEARNED ---------------- */
function renderLearned() {
  const on = consentCount();
  $("learnStatus").innerHTML = on ? `<div class="notice pepper">Learning is on for ${on} of 5 sites. <a href="#privacy">Change</a></div>`
    : `<div class="notice warn">Learning is off on every site, so Pepper can't learn anything yet. <a href="#privacy">Turn it on</a></div>`;
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
    if (!confirm(`Reset what Pepper learned for ${b.dataset.reset}? Your history stays; Pepper goes back to Balanced and counts only new ratings.`)) return;
    await chrome.runtime.sendMessage({ type: "LEARNING_RESET", projectType: b.dataset.reset });
  });
  const lift = C.ratingLift(D.history, D.learning);
  $("liftBlock").innerHTML = lift.afterN ? `<h2>Since Pepper started choosing</h2>
    <p>Prompts written after Pepper picked your approach average <b>${lift.after} stars</b> (${lift.afterN}), against <b>${lift.before ?? "—"}</b> before (${lift.beforeN}).</p>` : "";
  const best = D.history.filter(h => h.assisted && h.rating >= 4 && h.raw).sort((a, b) => b.rating - a.rating).slice(0, 8);
  $("bestList").innerHTML = best.length ? `<div class="rows">${best.map(h => `<div class="row row-h"><div class="grow">${esc(h.raw)}</div><span class="tag corn">${h.rating}★</span><span class="tag">${esc(h.projectType || "General")}</span></div>`).join("")}</div>`
    : `<div class="empty">None yet.</div>`;
}

/* ---------------- PRIVACY ---------------- */
function renderPrivacy() {
  $("consentRows").innerHTML = C.SITES.map(s => {
    const on = !!(D.consent[s.id] && D.consent[s.id].learning);
    return `<div class="row consent"><div><b>${esc(s.name)}</b><p class="small muted">${s.hosts.join(", ")}: ${on ? "saving prompts, replies and ratings" : "writing prompts only, nothing saved"}</p></div>
      <label class="switch corn"><input type="checkbox" data-site="${s.id}" ${on ? "checked" : ""} aria-label="Learning on ${esc(s.name)}"><i></i></label></div>`;
  }).join("");
  $("consentRows").querySelectorAll("input[data-site]").forEach(i => i.onchange = () => setConsent({ [i.dataset.site]: { learning: i.checked } }));
  $("histCount").textContent = `${D.history.length} prompts recorded. Your ratings and what Pepper learned from them go too.`;
  $("keyState").textContent = hasKey() ? `A ${D.settings.provider === "anthropic" ? "Anthropic" : "OpenAI"} key is stored in this browser.` : "No key stored.";
  $("removeKey").disabled = !D.settings.apiKey;
}
const setConsent = (patch) => store({ op: "objPatch", key: "pepper_consent", patch });
$("allOn").onclick = () => { const p = {}; C.SITES.forEach(s => p[s.id] = { learning: true }); setConsent(p); };
$("allOff").onclick = () => { const p = {}; C.SITES.forEach(s => p[s.id] = { learning: false }); setConsent(p); };
$("export").onclick = async () => {
  const s = await chrome.storage.local.get(null);
  delete s.pepper_settings; // settings hold the key: never exported
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), product: C.PRODUCT, ...s }, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "pepper-data.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$("clearHist").onclick = async () => {
  if (!confirm("Delete all recorded prompts, replies and ratings? Profile, memories, projects, files and saved prompts are kept.")) return;
  await store({ op: "listSet", key: "pepper_history", items: [] });
};
$("removeKey").onclick = async () => { if (confirm("Remove your API key from this browser?")) await store({ op: "objPatch", key: "pepper_settings", patch: { apiKey: "", provider: "none" } }); };
$("wipe").onclick = async () => {
  if (!confirm("Delete everything Pepper has stored in this browser, including your API key? This can't be undone.")) return;
  await chrome.runtime.sendMessage({ type: "WIPE" });
};

/* ---------------- SETTINGS ---------------- */
function renderSettings() {
  $("sProvider").value = D.settings.provider || "none";
  $("sKey").value = D.settings.apiKey || "";
  $("sModel").value = D.settings.model || "";
  $("sMin").value = D.settings.minChars || 6;
  syncModelHelp();
}
function syncModelHelp() {
  const p = $("sProvider").value;
  const def = C.DEFAULT_MODELS[p];
  $("sModel").placeholder = def || "";
  $("sModel").disabled = $("sKey").disabled = p === "none";
  $("testKey").disabled = p === "none";
  $("modelHelp").textContent = def ? `Leave blank to use ${def}. Check your provider's model list if it fails.` : "Not needed for the built-in template.";
}
$("sProvider").onchange = syncModelHelp;
$("showKey").onclick = () => { const k = $("sKey"); k.type = k.type === "password" ? "text" : "password"; $("showKey").textContent = k.type === "password" ? "Show" : "Hide"; };
$("shortcuts").onclick = () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
async function saveSettings() {
  await store({ op: "objPatch", key: "pepper_settings", patch: {
    provider: $("sProvider").value, apiKey: $("sKey").value.trim(), model: $("sModel").value.trim(),
    minChars: Math.max(2, Math.min(40, +$("sMin").value || 6)) } });
}
$("settingsForm").onsubmit = async (e) => { e.preventDefault(); await saveSettings(); $("settingsSaved").textContent = "Saved"; setTimeout(() => $("settingsSaved").textContent = "", 1500); };
$("testKey").onclick = async () => {
  await saveSettings();
  $("testNote").className = "small"; $("testNote").textContent = "Testing…";
  const r = await chrome.runtime.sendMessage({ type: "LLM", system: "Reply with the single word OK.", user: "ping", maxTokens: 16 });
  if (r && r.ok) { $("testNote").className = "small ok"; $("testNote").textContent = `Connected to ${r.model}. Settings saved.`; }
  else { $("testNote").className = "small bad"; $("testNote").textContent = r && r.error === "NO_KEY" ? "Add a key first." : "Your provider returned: " + ((r && r.error) || "no reply"); }
};

/* ---------------- live updates ---------------- */
let reTimer = null;
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== "local") return;
  clearTimeout(reTimer);
  reTimer = setTimeout(async () => {
    await load();
    // Don't re-render a form while the user is typing in it.
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest("#quiz, #settingsForm, #memForm, #projForm, .paste, .fact");
    if (typing && (current === "about" || current === "settings")) { renderChrome(); return; }
    if (current === "about") { renderChrome(); return; }
    render(current);
  }, 120);
});

(async function init() { await load(); route(); })();
