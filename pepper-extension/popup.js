/* Pepper — The Personal AI Prompter · toolbar popup (M9) */
const C = window.PepperCore;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = (op) => chrome.runtime.sendMessage({ type: "STORE", op });

let tab = null, here = null;

async function whoIsTab() {
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id == null) return null;
    // Asks the content script; works without the "tabs" permission and only on the five sites.
    return await chrome.tabs.sendMessage(tab.id, { type: "WHO" });
  } catch (e) { return null; }
}

async function render() {
  const s = await chrome.storage.local.get(["pepper_settings", "pepper_consent", "pepper_history", "pepper_profile"]);
  const settings = s.pepper_settings || { enabled: true };
  const consent = { ...C.defaultConsent(), ...(s.pepper_consent || {}) };
  const history = s.pepper_history || [];
  const on = settings.enabled !== false;
  $("master").checked = on;
  $("masterHelp").textContent = on ? "On for the five AI sites" : "Off everywhere. Nothing is recorded.";

  if (!on) {
    $("here").className = "here";
    $("here").innerHTML = `<p class="off-note">Pepper is hidden on every site and records nothing. Turn it on above to use it.</p>`;
  } else if (here && here.site) {
    const site = C.SITES.find(x => x.id === here.site);
    const learn = !!(consent[site.id] && consent[site.id].learning);
    $("here").className = "here" + (learn ? " on" : "");
    $("here").innerHTML = `<div class="row-h"><div class="grow"><b>Learning on ${esc(site.name)}</b>
      <p>${learn ? "Saving prompts you send here, replies and ratings" : "Off. Pepper writes prompts here but saves nothing"}</p></div>
      <label class="switch corn"><input type="checkbox" id="learnHere" ${learn ? "checked" : ""} aria-label="Learning on ${esc(site.name)}"><i></i></label></div>
      <button class="btn" id="openHere">Open Pepper on this page</button>`;
    $("learnHere").onchange = (e) => store({ op: "objPatch", key: "pepper_consent", patch: { [site.id]: { learning: e.target.checked } } });
    $("openHere").onclick = async () => { try { await chrome.tabs.sendMessage(tab.id, { type: "OPEN_PANEL" }); } catch (e) {} window.close(); };
  } else {
    $("here").className = "here";
    $("here").innerHTML = `<p class="off-note">Pepper works on ChatGPT, Claude, Gemini, Perplexity and Copilot. Open one of them and click the peppercorn in the corner.</p>`;
  }

  if (history.length) {
    const rated = history.filter(r => r.rating != null);
    const avg = rated.length ? (rated.reduce((a, b) => a + b.rating, 0) / rated.length).toFixed(1) : "–";
    $("figs").innerHTML = `<div><dt>${history.length}</dt><dd>prompts saved</dd></div>
      <div><dt>${C.assistedShare(history)}%</dt><dd>went through Pepper</dd></div>
      <div><dt>${avg}</dt><dd>average stars (${rated.length})</dd></div>`;
    $("figs").hidden = false;
  } else $("figs").hidden = true;

  const answered = Object.keys((s.pepper_profile && s.pepper_profile.answers) || {}).length;
  const learningAnywhere = C.SITES.some(x => consent[x.id] && consent[x.id].learning);
  const nudge = answered < 3 ? `Answer a few questions about you so Pepper's prompts fit you. ${answered} of 15 so far.`
    : !learningAnywhere ? "Learning is off on every site, so Pepper can't learn what works for you yet."
    : "";
  $("nudge").textContent = nudge;
  $("nudge").hidden = !nudge || !on;
}

$("master").onchange = (e) => store({ op: "objPatch", key: "pepper_settings", patch: { enabled: e.target.checked } });
$("dash").onclick = () => { chrome.runtime.sendMessage({ type: "OPEN_PAGE", page: "dashboard.html" }); window.close(); };
$("about").onclick = () => { chrome.runtime.sendMessage({ type: "OPEN_PAGE", page: "dashboard.html", hash: "about" }); window.close(); };
chrome.storage.onChanged.addListener((ch, area) => { if (area === "local") render(); });

(async () => { here = await whoIsTab(); render(); })();
