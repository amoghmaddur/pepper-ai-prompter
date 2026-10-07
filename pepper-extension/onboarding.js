/* Pepper — The Personal AI Prompter · onboarding (M5 first run).
   Learning is off on all five sites until the user turns it on here or in
   the dashboard. All writes go through the worker's serialized queue. */
const C = window.PepperCore;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = (op) => chrome.runtime.sendMessage({ type: "STORE", op });
const QUICK = ["q3", "q6", "q15"];

let S = {};
async function load() {
  const s = await chrome.storage.local.get(["pepper_settings", "pepper_consent", "pepper_profile", "pepper_history"]);
  S = {
    settings: { enabled: true, provider: "none", apiKey: "", ...(s.pepper_settings || {}) },
    consent: { ...C.defaultConsent(), ...(s.pepper_consent || {}) },
    profile: s.pepper_profile || { answers: {}, completed: false },
    history: s.pepper_history || []
  };
}

function renderConsent() {
  $("consentRows").innerHTML = C.SITES.map(site => {
    const on = !!(S.consent[site.id] && S.consent[site.id].learning);
    return `<div class="row consent ${on ? "on" : ""}"><div><b>${esc(site.name)}</b>
      <p class="site-sub">${on ? "Learning on: prompts, replies and ratings are saved" : "Off: Pepper writes prompts here but saves nothing"}</p></div>
      <label class="switch corn"><input type="checkbox" data-site="${site.id}" ${on ? "checked" : ""} aria-label="Learning on ${esc(site.name)}"><i></i></label></div>`;
  }).join("");
  $("consentRows").querySelectorAll("input[data-site]").forEach(i => i.onchange = () => setConsent({ [i.dataset.site]: { learning: i.checked } }));
}
async function setConsent(patch) {
  await store({ op: "objPatch", key: "pepper_consent", patch });
  Object.assign(S.consent, patch);
  renderConsent();
}
$("allOn").onclick = () => { const p = {}; C.SITES.forEach(s => p[s.id] = { learning: true }); setConsent(p); };
$("allOff").onclick = () => { const p = {}; C.SITES.forEach(s => p[s.id] = { learning: false }); setConsent(p); };

/* key */
function syncKey() {
  const none = $("provider").value === "none";
  $("key").disabled = none;
  $("saveKey").textContent = none ? "Save" : "Save and test";
}
$("provider").onchange = syncKey;
$("saveKey").onclick = async () => {
  const provider = $("provider").value, apiKey = $("key").value.trim();
  await store({ op: "objPatch", key: "pepper_settings", patch: { provider, apiKey: provider === "none" ? "" : apiKey } });
  const note = $("keyNote");
  if (provider === "none") { note.className = "small ok"; note.textContent = "Saved. Pepper will use the built-in template."; return; }
  if (!apiKey) { note.className = "small bad"; note.textContent = "Paste a key first."; return; }
  note.className = "small"; note.textContent = "Testing…";
  const r = await chrome.runtime.sendMessage({ type: "LLM", system: "Reply with the single word OK.", user: "ping", maxTokens: 16 });
  if (r && r.ok) { note.className = "small ok"; note.textContent = `Connected to ${r.model}.`; }
  else { note.className = "small bad"; note.textContent = "Saved, but your provider returned: " + ((r && r.error) || "no reply"); }
};

/* three quick questions */
function renderQuick() {
  const a = S.profile.answers || {};
  $("quick").innerHTML = QUICK.map(id => {
    const q = C.QUESTIONS.find(x => x.id === id);
    const body = q.type === "text"
      ? `<input type="text" data-q="${q.id}" value="${esc(a[q.id] || "")}" placeholder="${esc(q.ph || "")}" aria-label="${esc(q.t)}">`
      : `<div class="opts" data-q="${q.id}" role="group" aria-label="${esc(q.t)}">${q.opts.map(o =>
          `<button type="button" class="opt" data-o="${esc(o)}" aria-pressed="${a[q.id] === o}">${esc(o)}</button>`).join("")}</div>`;
    return `<div><div class="q-t">${esc(q.t)}</div>${body}<div class="q-e">${esc(q.effect)}</div></div>`;
  }).join("");
  $("quick").querySelectorAll(".opts").forEach(g => g.querySelectorAll(".opt").forEach(b => b.onclick = () => {
    const on = b.getAttribute("aria-pressed") === "true";
    g.querySelectorAll(".opt").forEach(x => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", String(!on));
    saveQuick();
  }));
  let t = null;
  $("quick").querySelectorAll("input[data-q]").forEach(i => i.oninput = () => { clearTimeout(t); t = setTimeout(saveQuick, 500); });
}
async function saveQuick() {
  // Merge with whatever is already stored (the dashboard may have more answers).
  const cur = (await chrome.storage.local.get("pepper_profile")).pepper_profile || { answers: {} };
  const answers = { ...(cur.answers || {}) };
  $("quick").querySelectorAll("input[data-q]").forEach(i => { if (i.value.trim()) answers[i.dataset.q] = i.value.trim(); else delete answers[i.dataset.q]; });
  $("quick").querySelectorAll(".opts").forEach(g => {
    const chosen = g.querySelector('.opt[aria-pressed="true"]');
    if (chosen) answers[g.dataset.q] = chosen.dataset.o; else delete answers[g.dataset.q];
  });
  await store({ op: "set", key: "pepper_profile", value: { answers, completed: Object.keys(answers).length >= 10 } });
  $("quickSaved").textContent = "Saved";
  setTimeout(() => $("quickSaved").textContent = "", 1400);
}

/* update from v0.2 */
function renderUpdate() {
  if (location.hash !== "#update" || !S.history.length) return;
  $("update").hidden = false;
  $("oldCount").textContent = `Pepper still has ${S.history.length} ${S.history.length === 1 ? "prompt" : "prompts"} recorded by the earlier version.`;
  const done = (msg) => { $("oldDone").textContent = msg; $("keepOld").disabled = $("dropOld").disabled = true; };
  $("keepOld").onclick = () => done("Kept. You can delete them any time in Privacy and data.");
  $("dropOld").onclick = async () => {
    if (!confirm(`Delete the ${S.history.length} recorded prompts and replies?`)) return;
    await store({ op: "listSet", key: "pepper_history", items: [] });
    done("Deleted.");
  };
}

$("done").onclick = async () => {
  await store({ op: "objPatch", key: "pepper_settings", patch: { onboarded: true } });
  $("done").hidden = true;
  $("ready").hidden = false;
  $("ready").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
};
$("openDash").onclick = () => chrome.runtime.sendMessage({ type: "OPEN_PAGE", page: "dashboard.html" });

(async function init() {
  await load();
  $("provider").value = S.settings.provider || "none";
  $("key").value = S.settings.apiKey || "";
  syncKey();
  renderConsent();
  renderQuick();
  renderUpdate();
  if (S.settings.onboarded) { $("done").hidden = true; $("ready").hidden = false; }
})();
