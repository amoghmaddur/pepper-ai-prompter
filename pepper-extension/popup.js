/* Pepper — The Personal AI Prompter · toolbar popup (v0.4).
   Opening the popup grants activeTab, so "Open Pepper here" works on any
   ordinary page without asking for access to every site. */
const C = window.PepperCore, A = window.PepperAssist;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = (op) => chrome.runtime.sendMessage({ type: "STORE", op });

let tab = null, host = "";

async function render() {
  const s = await chrome.storage.local.get(["pepper_settings", "pepper_consent", "pepper_profile", "pepper_details", "pepper_pocket", "pepper_ui"]);
  const settings = s.pepper_settings || { enabled: true };
  const profile = s.pepper_profile || { answers: {} };
  const answers = profile.answers || {};
  const on = settings.enabled !== false;
  const ready = A.setupComplete(profile, settings);
  $("master").checked = on;
  $("masterHelp").textContent = !on ? "Off everywhere. Nothing is recorded." : settings.floating === "everywhere" ? "Floating on every site" : "Floating on the five AI sites";
  const who = A.firstName(answers, s.pepper_details);
  $("hello").textContent = who ? `Hi, ${who}` : "Pepper";
  $("setup").hidden = ready;
  $("ready").hidden = !ready;
  $("pocket").hidden = !ready;
  if (!ready) return;

  const site = C.siteForHost(host);
  const page = /^https?:/.test((tab && tab.url) || "");
  const consent = { ...C.defaultConsent(), ...(s.pepper_consent || {}) };
  const uiKey = site ? site.id : host;
  const hidden = !!((s.pepper_ui || {})[uiKey] || {}).hidden;
  if (!on) {
    $("here").className = "here";
    $("here").innerHTML = `<p class="off-note">Pepper is hidden on every site and records nothing. Turn it on above to use it.</p>`;
  } else if (site) {
    const learn = !!(consent[site.id] && consent[site.id].learning);
    $("here").className = "here" + (learn ? " on" : "");
    $("here").innerHTML = `<div class="row-h"><div class="grow"><b>Learning on ${esc(site.name)}</b>
      <p>${learn ? "Saving prompts you send here, replies and ratings" : "Off. Pepper writes prompts here but saves nothing"}</p></div>
      <label class="switch corn"><input type="checkbox" id="learnHere" ${learn ? "checked" : ""} aria-label="Learning on ${esc(site.name)}"><i></i></label></div>
      <button class="btn" id="openHere">Open Pepper on this page</button>`;
    $("learnHere").onchange = (e) => store({ op: "objPatch", key: "pepper_consent", patch: { [site.id]: { learning: e.target.checked } } });
  } else if (page) {
    $("here").className = "here";
    $("here").innerHTML = `<div class="row-h"><div class="grow"><b>${esc(host.replace(/^www\./, ""))}</b><p>${settings.floating === "everywhere" ? (hidden ? "Pepper is hidden on this site" : "Pepper floats here") : "Call Pepper here to fix text, fill forms or use your Pocket"}</p></div>
      ${settings.floating === "everywhere" ? `<label class="switch" title="Show Pepper on this site"><input type="checkbox" id="showHere" ${hidden ? "" : "checked"} aria-label="Show Pepper on this site"><i></i></label>` : ""}</div>
      <button class="btn" id="openHere">Open Pepper on this page</button>`;
    const sh = $("showHere");
    if (sh) sh.onchange = () => store({ op: "objPatch", key: "pepper_ui", patch: { [uiKey]: { ...((s.pepper_ui || {})[uiKey] || {}), hidden: !sh.checked } } });
  } else {
    $("here").className = "here";
    $("here").innerHTML = `<p class="off-note">Browsers don't let extensions run on this page. Open any website, or one of your AI sites below.</p>`;
  }
  const oh = $("openHere");
  if (oh) oh.onclick = async () => {
    const r = await chrome.runtime.sendMessage({ type: "SUMMON", tabId: tab.id });
    if (r && r.ok) window.close(); else { oh.textContent = (r && r.error) === "SETUP" ? "Finish setup first" : "Pepper can't run on this page"; oh.disabled = true; }
  };

  $("floating").checked = settings.floating === "everywhere";
  $("floatHelp").textContent = settings.floating === "everywhere" ? "On every page. Hide me on any site." : "Now: only on AI sites.";
  $("favs").innerHTML = A.favorites(answers).concat(A.AI_SITES.filter(x => !A.favorites(answers).includes(x))).slice(0, 5)
    .map((x, i) => `<a class="fav ${i ? "" : "first"}" href="${x.url}" target="_blank" rel="noopener">${esc(x.name)}</a>`).join("");
  const consentAny = C.SITES.some(x => consent[x.id] && consent[x.id].learning);
  const resume = A.pickResume(s.pepper_pocket);
  const nudge = !resume ? "Tip: put your resume in your Pocket to drag it onto job sites." : !consentAny ? "Tip: turn on learning so Pepper picks the approach you rate best." : "";
  $("nudge").textContent = nudge;
  $("nudge").hidden = !nudge || !on;
}

$("master").onchange = (e) => store({ op: "objPatch", key: "pepper_settings", patch: { enabled: e.target.checked } });
$("floating").onchange = async (e) => {
  if (e.target.checked) {
    const ok = await chrome.permissions.request({ origins: ["<all_urls>"] }).catch(() => false);
    if (!ok) { e.target.checked = false; $("floatHelp").textContent = "Your browser didn't allow it."; return; }
  }
  await store({ op: "objPatch", key: "pepper_settings", patch: { floating: e.target.checked ? "everywhere" : "ai", floatingLost: false } });
  await chrome.runtime.sendMessage({ type: "SYNC" });
};
$("setupGo").onclick = () => { chrome.runtime.sendMessage({ type: "OPEN_PAGE", page: "onboarding.html" }); window.close(); };
$("dash").onclick = () => { chrome.runtime.sendMessage({ type: "OPEN_PAGE", page: "dashboard.html" }); window.close(); };
$("pocket").onclick = () => { chrome.runtime.sendMessage({ type: "OPEN_PAGE", page: "dashboard.html", hash: "pocket" }); window.close(); };
chrome.storage.onChanged.addListener((ch, area) => { if (area === "local") render(); });

(async () => {
  try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); host = tab && tab.url ? new URL(tab.url).host : ""; } catch (e) { host = ""; }
  render();
})();
