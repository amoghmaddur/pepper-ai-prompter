/* ==========================================================================
   Pepper — The Personal AI Prompter · background worker (v0.4)
   - The only module with network access, limited to the three provider hosts,
     plus Chrome's built-in on-device AI when there's no key.
   - The only module that reads the vault (API key, file contents).
   - Every list write from every tab goes through one serialized queue, so two
     tabs never overwrite each other; consent is re-checked before any record
     from a web page is stored, and web pages may only make whitelisted writes.
   - Also: Pocket files, prompt hand-offs to AI sites, "keep floating"
     everywhere, focus reminders, the right-click menu and Alt+Shift+P.
   ========================================================================== */
importScripts("lib/core.js", "lib/assist.js", "lib/local-ai.js");
const C = self.PepperCore;
const A = self.PepperAssist;

const LIST_KEYS = ["pepper_history", "pepper_saved_prompts", "pepper_memories", "pepper_pocket", "pepper_projects", "pepper_reminders"];
const OBJ_KEYS = ["pepper_settings", "pepper_profile", "pepper_consent", "pepper_learning", "pepper_ui", "pepper_details"];
const VALUE_KEYS = ["pepper_active_project"];
// Content scripts (running on web pages) may only do these; everything else needs an extension page.
const CONTENT_ALLOWED = new Set([
  "listAdd:pepper_history", "listPatch:pepper_history", "listAdd:pepper_saved_prompts",
  "listAdd:pepper_memories", "set:pepper_active_project", "objPatch:pepper_ui", "listAdd:pepper_pocket"
]);
const CONTENT_HISTORY_PATCH_FIELDS = new Set(["rating", "response", "partial", "responseChars", "truncated"]);
const SCRIPT_FILES = ["lib/core.js", "lib/assist.js", "content.js"];
const EVERYWHERE_ID = "pepper-everywhere";
const AI_PATTERNS = C.SITES.flatMap(s => s.hosts).map(h => `*://${h}/*`);

const DEFAULT_MEMORIES = [
  { id: "default-1", text: "I write in a plain, humanized tone with no dashes", active: false }
];

/* ---------- the vault: the API key and file contents, in an IndexedDB only Pepper's own pages
   and worker can open. chrome.storage.local is readable by content scripts, so secrets and
   big blobs don't go there (and blobs there would be broadcast to every tab on each change). ---------- */
const Vault = (() => {
  let opening = null;
  const open = () => opening || (opening = new Promise((resolve, reject) => {
    const r = indexedDB.open("pepper-vault", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => { opening = null; reject(r.error); };
  }));
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction("kv", mode);
      const req = fn(t.objectStore("kv"));
      let out;
      if (req) req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => resolve(out);
      t.onerror = t.onabort = () => reject(t.error);
    });
  };
  return {
    get: (k) => run("readonly", s => s.get(k)),
    set: (k, v) => run("readwrite", s => s.put(v, k)),
    del: (k) => run("readwrite", s => s.delete(k)),
    clear: () => run("readwrite", s => s.clear())
  };
})();
const keyHint = (k) => (k && k.length > 8 ? "…" + k.slice(-4) : "");
/** A key belongs to one provider: switching provider without a new key drops it, so an Anthropic
    key is never sent to OpenAI (or the other way round). */
const KEY_PROVIDERS = ["anthropic", "openai", "gemini"];
async function setKey(provider, apiKey) {
  const p = KEY_PROVIDERS.includes(provider) || provider === "chrome" ? provider : "none";
  const key = String(apiKey || "").trim();
  if (key && KEY_PROVIDERS.includes(p)) {
    await Vault.set("apiKey", key);
    await Vault.set("keyProvider", p);
    return storeOp({ op: "objPatch", key: "pepper_settings", patch: { provider: p, hasKey: true, keyHint: keyHint(key) } }, false);
  }
  const owner = await Vault.get("keyProvider").catch(() => null);
  if (!KEY_PROVIDERS.includes(p) || (owner && owner !== p)) {
    await Vault.del("apiKey"); await Vault.del("keyProvider");
    return storeOp({ op: "objPatch", key: "pepper_settings", patch: { provider: p, hasKey: false, keyHint: "" } }, false);
  }
  return storeOp({ op: "objPatch", key: "pepper_settings", patch: { provider: p } }, false);
}
/** Moves a key or file contents left in chrome.storage by earlier versions into the vault. */
async function moveSecretsToVault() {
  return locked(async () => {
    const all = await chrome.storage.local.get(null);
    const st = all.pepper_settings;
    if (st && "apiKey" in st) {
      if (st.apiKey) { await Vault.set("apiKey", st.apiKey); await Vault.set("keyProvider", st.provider || "anthropic"); }
      const next = { ...st, hasKey: !!st.apiKey || !!st.hasKey, keyHint: st.apiKey ? keyHint(st.apiKey) : (st.keyHint || "") };
      delete next.apiKey;
      await chrome.storage.local.set({ pepper_settings: next });
    }
    const blobs = Object.keys(all).filter(k => k.startsWith("pepper_blob_"));
    for (const k of blobs) await Vault.set(k, all[k]);
    if (blobs.length) await chrome.storage.local.remove(blobs);
  });
}

/* ---------- install, update, startup ---------- */
chrome.runtime.onInstalled.addListener(async (details) => {
  await locked(async () => {
    const cur = await chrome.storage.local.get(null);
    const fresh = !cur.pepper_settings && !cur.pepper_history;
    let data;
    if (fresh) {
      data = freshData();
      await chrome.storage.local.set(data);
    } else {
      const m = C.migrate(cur, Date.now());
      if (m.changed) {
        await chrome.storage.local.set(m.data);
        if (!("pepper_files" in m.data) && "pepper_files" in cur) await chrome.storage.local.remove("pepper_files");
      }
      data = m.data;
    }
    await recomputeLearning();
    const update = details.reason === "update";
    if (details.reason === "install" || (update && !A.setupComplete(data.pepper_profile, data.pepper_settings))) {
      chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") + (update ? "#update" : "") });
    }
  });
  await moveSecretsToVault().catch(e => console.warn("Pepper: couldn't move secrets to the vault", e));
  setupMenus();
  await syncFloating();
  await syncReminders();
});
chrome.runtime.onStartup.addListener(async () => {
  await moveSecretsToVault().catch(e => console.warn("Pepper: couldn't move secrets to the vault", e));
  await syncFloating(); await syncReminders();
});

function freshData() {
  return {
    pepper_settings: { enabled: true, minChars: 6, provider: "none", hasKey: false, keyHint: "", model: "", onboarded: false,
      floating: null, features: A.defaultFeatures(), selectionButton: true },
    pepper_memories: DEFAULT_MEMORIES.map(m => ({ ...m })), pepper_history: [], pepper_profile: { answers: {}, completed: false },
    pepper_pocket: [], pepper_details: {}, pepper_reminders: [], pepper_projects: [], pepper_saved_prompts: [],
    pepper_active_project: null, pepper_consent: C.defaultConsent(), pepper_learning: { types: {}, dismissedFacts: [] },
    pepper_ui: {}, pepper_schema: C.SCHEMA
  };
}

/* ---------- serialized writer ---------- */
let chain = Promise.resolve();
function locked(fn) {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

async function recomputeLearning() {
  const s = await chrome.storage.local.get(["pepper_history", "pepper_consent", "pepper_learning"]);
  const next = C.computeLearning(s.pepper_history || [], s.pepper_consent || {}, s.pepper_learning || { types: {} }, Date.now());
  await chrome.storage.local.set({ pepper_learning: next });
}

function applyOp(op, cur) {
  switch (op.op) {
    case "listAdd": {
      const list = Array.isArray(cur) ? cur : [];
      const item = C.cleanRecord({ ...op.item, id: op.item.id || C.uuid() });
      return op.end ? [...list, item] : [item, ...list];
    }
    case "listPatch": {
      const list = Array.isArray(cur) ? cur : [];
      return list.map(x => String(x.id) === String(op.id) ? C.cleanRecord({ ...x, ...op.patch }) : x);
    }
    case "listRemove": {
      const list = Array.isArray(cur) ? cur : [];
      const ids = new Set((op.ids || [op.id]).map(String));
      return list.filter(x => !ids.has(String(x.id)));
    }
    case "listSet": return (op.items || []).map(C.cleanRecord);
    case "objPatch": return { ...(cur && typeof cur === "object" ? cur : {}), ...op.patch };
    case "set": return op.value;
    default: throw new Error("Unknown op " + op.op);
  }
}

/** A web page may add only a link or a short text snippet to the Pocket; files go through POCKET_ADD_FILE. */
function cleanPageItem(item) {
  const i = item || {};
  if (i.kind === "link") {
    const url = A.normalizeUrl(i.url);
    if (!url) return null;
    return { id: C.uuid(), kind: "link", url, title: String(i.title || url).slice(0, 200), addedAt: new Date().toISOString(), source: "page" };
  }
  if (i.kind === "snippet") {
    const text = String(i.text || "").slice(0, 20000);
    if (!text.trim()) return null;
    return { id: C.uuid(), kind: "snippet", title: String(i.title || text.slice(0, 60)).slice(0, 120), text, addedAt: new Date().toISOString(), source: "page" };
  }
  return null;
}

const senderHost = (fromContent) => typeof fromContent === "string" ? fromContent : "";
async function storeOp(op, fromContent) {
  const known = LIST_KEYS.includes(op.key) || OBJ_KEYS.includes(op.key) || VALUE_KEYS.includes(op.key);
  if (!known) return { ok: false, error: "Unknown key" };
  if (op.key === "pepper_settings") {
    // The key lives in the vault (setKey); it never goes into storage that web pages' scripts can read.
    const strip = (o) => { if (!o || typeof o !== "object") return o; const c = { ...o }; delete c.apiKey; return c; };
    op = { ...op, patch: strip(op.patch), value: strip(op.value) };
  }
  if (fromContent) {
    if (!CONTENT_ALLOWED.has(op.op + ":" + op.key)) return { ok: false, error: "Not allowed from a web page" };
    if (op.op === "listPatch" && Object.keys(op.patch || {}).some(k => !CONTENT_HISTORY_PATCH_FIELDS.has(k))) return { ok: false, error: "Field not allowed" };
    if (op.key === "pepper_pocket") {
      const item = cleanPageItem(op.item);
      if (!item) return { ok: false, error: "Only links and text can be saved from a page" };
      op = { ...op, item, end: false };
    }
  }
  return locked(async () => {
    if (fromContent && op.key === "pepper_history" && op.op === "listAdd") {
      // Enforced at the writer as well: a record from a web page is stored only if
      // the global switch and that site's learning flag are on right now, and the
      // record's site is the tab it came from.
      const s = await chrome.storage.local.get(["pepper_settings", "pepper_consent"]);
      const tabHost = senderHost(fromContent);
      if (!op.item || op.item.site !== tabHost || !C.consentAllows(s.pepper_settings, s.pepper_consent, tabHost)) {
        return { ok: false, error: "NO_CONSENT" };
      }
    }
    if (fromContent && op.key === "pepper_pocket") {
      const s = await chrome.storage.local.get(["pepper_settings", "pepper_pocket"]);
      if (!featureOn(s.pepper_settings, "pocket")) return { ok: false, error: "The Pocket is turned off" };
      if ((s.pepper_pocket || []).length >= A.POCKET_LIMITS.items) return { ok: false, error: "Your Pocket is full" };
    }
    const cur = (await chrome.storage.local.get(op.key))[op.key];
    let next = applyOp(op, cur);
    if (op.key === "pepper_history") next = C.prune(next, Date.now());
    await chrome.storage.local.set({ [op.key]: next });
    if (op.key === "pepper_history" || op.key === "pepper_consent") await recomputeLearning();
    return { ok: true, id: op.item ? op.item.id : undefined };
  });
}
const featureOn = (settings, id) => { const f = { ...A.defaultFeatures(), ...((settings && settings.features) || {}) }; return settings && settings.enabled !== false && !!f[id]; };

async function learningReset(type) {
  return locked(async () => {
    const s = await chrome.storage.local.get("pepper_learning");
    await chrome.storage.local.set({ pepper_learning: C.resetLearning(s.pepper_learning, type, Date.now()) });
    await recomputeLearning();
    return { ok: true };
  });
}

/* ---------- Pocket files: metadata in pepper_pocket, bytes under their own key ---------- */
async function pocketAddFile(msg, fromContent) {
  const meta = msg.item || {};
  const data = typeof msg.data === "string" ? msg.data : "";
  const size = Math.floor(data.length * 3 / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
  if (!data || !meta.name) return { ok: false, error: "No file" };
  return locked(async () => {
    const s = await chrome.storage.local.get(["pepper_pocket", "pepper_settings"]);
    if (fromContent && !featureOn(s.pepper_settings, "pocket")) return { ok: false, error: "The Pocket is turned off" };
    const list = s.pepper_pocket || [];
    const why = A.pocketRejects(list, size);
    if (why) return { ok: false, error: why };
    const id = C.uuid();
    const name = String(meta.name).replace(/[\\/:*?"<>|\n\r]/g, "_").slice(0, 160);
    const item = { id, kind: "file", name, mime: A.mimeFromName(name, meta.mime), size, hasBlob: true,
      text: typeof meta.text === "string" ? meta.text.slice(0, A.TEXT_KEEP) : "", role: meta.role === "resume" ? "resume" : undefined,
      addedAt: new Date().toISOString(), source: fromContent ? "page" : "dashboard" };
    if (item.role === "resume") list.forEach(x => { if (x.role === "resume") delete x.role; });
    await Vault.set(A.blobKey(id), data);
    await chrome.storage.local.set({ pepper_pocket: [item, ...list] });
    return { ok: true, id, item };
  });
}
async function pocketRemove(ids) {
  return locked(async () => {
    const del = new Set(ids.map(String));
    const s = await chrome.storage.local.get(["pepper_pocket", "pepper_projects"]);
    const list = (s.pepper_pocket || []).filter(i => !del.has(String(i.id)));
    const projects = (s.pepper_projects || []).map(p => ({ ...p, fileIds: (p.fileIds || []).filter(f => !del.has(String(f))) }));
    await chrome.storage.local.set({ pepper_pocket: list, pepper_projects: projects });
    for (const id of del) await Vault.del(A.blobKey(id));
    return { ok: true };
  });
}

/** One Pocket file, asked for by Pepper's panel (to attach, drag or open) or the dashboard (to download). */
async function pocketGetFile(id, fromContent) {
  const s = await chrome.storage.local.get(["pepper_pocket", "pepper_settings"]);
  if (fromContent && !featureOn(s.pepper_settings, "pocket")) return { ok: false, error: "The Pocket is turned off" };
  const item = (s.pepper_pocket || []).find(i => String(i.id) === String(id) && i.kind === "file");
  if (!item) return { ok: false, error: "Not in your Pocket" };
  const data = item.hasBlob ? await Vault.get(A.blobKey(item.id)) : A.bytesToBase64(new TextEncoder().encode(item.text || ""));
  if (!data) return { ok: false, error: "The file's contents are missing" };
  return { ok: true, data, name: item.name, mime: item.mime };
}

/* ---------- hand-off: carry a prompt to an AI site's box (never sends) ---------- */
// Pending hand-offs are keyed by the tab Pepper opened, so no other tab can claim them.
async function handoffs() { return (await chrome.storage.session.get("handoffs")).handoffs || {}; }
async function handoff(msg, sender) {
  const site = A.AI_SITES.find(s => s.id === msg.siteId) || A.AI_SITES[0];
  const text = String(msg.text || "").slice(0, 60000);
  if (!text.trim()) return { ok: false, error: "Nothing to send" };
  const tab = await chrome.tabs.create({ url: site.url, active: true, index: sender && sender.tab ? sender.tab.index + 1 : undefined });
  const all = await handoffs();
  const now = Date.now();
  for (const k of Object.keys(all)) if (now - all[k].at > A.HANDOFF_TTL) delete all[k];
  all[tab.id] = { text, raw: String(msg.raw || "").slice(0, 2000), from: String(msg.from || "").slice(0, 200), siteId: site.id, at: now };
  await chrome.storage.session.set({ handoffs: all });
  return { ok: true, site: site.name };
}
async function handoffClaim(sender) {
  const tabId = sender && sender.tab && sender.tab.id;
  if (tabId == null) return { ok: false };
  const all = await handoffs();
  const h = all[tabId];
  if (!h) return { ok: false };
  delete all[tabId];
  await chrome.storage.session.set({ handoffs: all });
  if (Date.now() - h.at > A.HANDOFF_TTL) return { ok: false };
  const host = (() => { try { return new URL(sender.url).host; } catch (e) { return ""; } })();
  const site = C.siteForHost(host);
  if (!site || site.id !== h.siteId) return { ok: false };
  return { ok: true, text: h.text, raw: h.raw, from: h.from };
}

/* ---------- summon Pepper on any page (Alt+Shift+P, toolbar, right-click) ---------- */
async function ensureInjected(tabId) {
  try { const r = await chrome.tabs.sendMessage(tabId, { type: "PING" }); if (r && r.pong) return true; } catch (e) { /* not there yet */ }
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
    await chrome.scripting.executeScript({ target: { tabId }, files: SCRIPT_FILES });
    return true;
  } catch (e) { return false; } // chrome:// pages, the web store, PDFs and the like
}
async function summon(tab, payload) {
  const s = await chrome.storage.local.get(["pepper_profile", "pepper_settings"]);
  if (!A.setupComplete(s.pepper_profile, s.pepper_settings)) { openPage("onboarding.html"); return { ok: false, error: "SETUP" }; }
  if (!tab || tab.id == null) return { ok: false };
  if (!(await ensureInjected(tab.id))) return { ok: false, error: "Pepper can't run on this page." };
  try { await chrome.tabs.sendMessage(tab.id, payload); } catch (e) { return { ok: false }; }
  return { ok: true };
}
function openPage(page, hash) {
  const p = ["dashboard.html", "onboarding.html", "privacy.html"].includes(page) ? page : "dashboard.html";
  return chrome.tabs.create({ url: chrome.runtime.getURL(p) + (hash ? "#" + String(hash).replace(/[^\w-]/g, "") : "") });
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-panel") summon(tab, { type: "TOGGLE_PANEL" });
  if (command === "improve-prompt") summon(tab, { type: "IMPROVE" });
});

/* ---------- right-click menu ---------- */
function setupMenus() {
  chrome.contextMenus.removeAll(() => {
    const add = (o) => chrome.contextMenus.create(o, () => void chrome.runtime.lastError);
    add({ id: "pepper-fix", title: "Fix or improve with Pepper", contexts: ["selection", "editable"] });
    add({ id: "pepper-ask", title: "Ask AI about this with Pepper", contexts: ["selection"] });
    add({ id: "pepper-save-selection", title: "Save to Pepper's Pocket", contexts: ["selection"] });
    add({ id: "pepper-save-link", title: "Save link to Pepper's Pocket", contexts: ["link"] });
    add({ id: "pepper-save-page", title: "Save this page to Pepper's Pocket", contexts: ["page"] });
  });
}
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const id = info.menuItemId;
  if (id === "pepper-fix") return summon(tab, { type: "OPEN_PANEL", tab: "fix", text: info.selectionText || "" });
  if (id === "pepper-ask") return summon(tab, { type: "OPEN_PANEL", tab: "prompt", text: info.selectionText || "" });
  let item = null;
  if (id === "pepper-save-selection") item = { kind: "snippet", text: info.selectionText, title: (info.selectionText || "").slice(0, 60) };
  if (id === "pepper-save-link") item = { kind: "link", url: info.linkUrl, title: info.selectionText || info.linkUrl };
  if (id === "pepper-save-page") item = { kind: "link", url: info.pageUrl || (tab && tab.url), title: (tab && tab.title) || info.pageUrl };
  if (!item) return;
  const r = await storeOp({ op: "listAdd", key: "pepper_pocket", item }, "contextmenu");
  // A tick on the toolbar button confirms it, without putting Pepper on a page where it isn't floating.
  if (tab && tab.id != null && chrome.action) {
    const quiet = (p) => Promise.resolve(p).catch(() => {});
    quiet(chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: r.ok ? "#2E6B4A" : "#B5395F" }));
    quiet(chrome.action.setBadgeText({ tabId: tab.id, text: r.ok ? "\u2713" : "!" }));
    quiet(chrome.action.setTitle({ tabId: tab.id, title: r.ok ? "Saved to your Pocket" : (r.error || "Couldn't save that") }));
    setTimeout(() => { quiet(chrome.action.setBadgeText({ tabId: tab.id, text: "" })); quiet(chrome.action.setTitle({ tabId: tab.id, title: "Pepper" })); }, 3000);
  }
});

/* ---------- keep floating: Pepper on every site, only with the user's permission ---------- */
async function syncFloating() {
  const s = (await chrome.storage.local.get("pepper_settings")).pepper_settings || {};
  const want = s.enabled !== false && s.floating === "everywhere";
  const has = await chrome.permissions.contains({ origins: ["<all_urls>"] }).catch(() => false);
  const regs = await chrome.scripting.getRegisteredContentScripts({ ids: [EVERYWHERE_ID] }).catch(() => []);
  if (want && has) {
    if (!regs.length) {
      await chrome.scripting.registerContentScripts([{ id: EVERYWHERE_ID, matches: ["<all_urls>"], excludeMatches: AI_PATTERNS,
        js: SCRIPT_FILES, css: ["content.css"], runAt: "document_idle", allFrames: false, persistAcrossSessions: true }]).catch(() => {});
      await injectOpenTabs();
    }
  } else if (regs.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [EVERYWHERE_ID] }).catch(() => {});
  }
  // The permission was removed (for example in chrome://extensions): fall back to AI sites only.
  if (s.floating === "everywhere" && !has) {
    await storeOp({ op: "objPatch", key: "pepper_settings", patch: { floating: "ai", floatingLost: true } }, false);
  }
  return { ok: true, active: want && has };
}
async function injectOpenTabs() {
  const tabs = await chrome.tabs.query({}).catch(() => []);
  for (const t of tabs.slice(0, 60)) {
    if (!t.url || !/^https?:/.test(t.url) || C.siteForHost(new URL(t.url).host)) continue;
    await ensureInjected(t.id);
  }
}
chrome.permissions.onRemoved.addListener(() => { syncFloating(); syncReminders(); });
chrome.permissions.onAdded.addListener(() => { bindNotifications(); syncFloating(); syncReminders(); });

/* ---------- reminders ---------- */
const hasNotifications = () => chrome.permissions.contains({ permissions: ["notifications"] }).catch(() => false);
async function syncReminders() {
  const s = await chrome.storage.local.get(["pepper_settings", "pepper_reminders"]);
  const on = featureOn(s.pepper_settings, "reminders") && await hasNotifications();
  const list = on ? (s.pepper_reminders || []).filter(r => r && r.enabled !== false) : [];
  const all = await chrome.alarms.getAll();
  const existing = all.filter(a => a.name.startsWith("rem:"));
  const want = new Map(list.map(r => ["rem:" + r.id, r]));
  for (const a of existing) if (!want.has(a.name)) await chrome.alarms.clear(a.name);
  // A snoozed reminder doesn't outlive its reminder, or reminders being turned off.
  for (const a of all.filter(a => a.name.startsWith("snooze:"))) if (!want.has("rem:" + a.name.slice(7))) await chrome.alarms.clear(a.name);
  for (const [name, r] of want) {
    const when = A.nextOccurrence(r.time, r.days, Date.now());
    if (!when) continue;
    const cur = existing.find(a => a.name === name);
    if (cur && Math.abs(cur.scheduledTime - when) < 60000) continue;
    await chrome.alarms.create(name, { when });
  }
  return { ok: true, count: want.size };
}
async function fireReminder(id, test) {
  const s = await chrome.storage.local.get(["pepper_reminders", "pepper_profile", "pepper_details", "pepper_settings"]);
  const r = test ? { id: "test", text: "This is how Pepper will nudge you." } : (s.pepper_reminders || []).find(x => String(x.id) === String(id));
  if (!r || !chrome.notifications) return { ok: false };
  if (!test && (!featureOn(s.pepper_settings, "reminders") || r.enabled === false)) return { ok: false }; // turned off since it was scheduled
  const answers = (s.pepper_profile && s.pepper_profile.answers) || {};
  const fav = A.favorites(answers)[0];
  const who = A.firstName(answers, s.pepper_details);
  await chrome.notifications.create(`pepper|${r.id}|${Date.now()}`, {
    type: "basic", iconUrl: "icons/icon128.png", priority: 1,
    title: `${A.greeting(new Date().getHours())}${who ? ", " + who : ""}`,
    message: r.text || "Time to focus.",
    buttons: [{ title: `Open ${fav.name}` }, { title: "Snooze 30 minutes" }]
  });
  return { ok: true };
}
const LATE_MS = 15 * 60 * 1000;
chrome.alarms.onAlarm.addListener(async (alarm) => {
  const [kind, id] = alarm.name.split(":");
  // Missed while the computer slept: a "your focus time starts now" hours later is noise, so skip it.
  const late = Date.now() - (alarm.scheduledTime || Date.now()) > LATE_MS;
  if (kind === "rem") { if (!late) await fireReminder(id); await syncRemindersAfterFire(alarm.name); }
  if (kind === "snooze" && !late) await fireReminder(id);
});
async function syncRemindersAfterFire(name) { await chrome.alarms.clear(name); await syncReminders(); }
let notificationsBound = false;
function bindNotifications() {
  if (notificationsBound || !chrome.notifications) return;
  notificationsBound = true;
  const openFav = async () => {
    const answers = ((await chrome.storage.local.get("pepper_profile")).pepper_profile || {}).answers || {};
    chrome.tabs.create({ url: A.favorites(answers)[0].url });
  };
  chrome.notifications.onClicked.addListener((nid) => { if (nid.startsWith("pepper|")) { openFav(); chrome.notifications.clear(nid); } });
  chrome.notifications.onButtonClicked.addListener((nid, i) => {
    if (!nid.startsWith("pepper|")) return;
    const id = nid.split("|")[1];
    if (i === 0) openFav(); else if (id !== "test") chrome.alarms.create("snooze:" + id, { delayInMinutes: 30 });
    chrome.notifications.clear(nid);
  });
}
bindNotifications();

/* ---------- settings changes made anywhere take effect here ---------- */
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== "local") return;
  if (ch.pepper_settings) {
    const a = ch.pepper_settings.oldValue || {}, b = ch.pepper_settings.newValue || {};
    if (a.floating !== b.floating || a.enabled !== b.enabled) syncFloating();
    if (JSON.stringify(a.features || {}) !== JSON.stringify(b.features || {}) || a.enabled !== b.enabled) syncReminders();
  }
  if (ch.pepper_reminders) syncReminders();
});

/* ---------- messages ---------- */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg || typeof msg !== "object") return; // foreign sender: no response
  const extOrigin = chrome.runtime.getURL("");
  const fromExtension = !!(sender.url && sender.url.startsWith(extOrigin));
  let fromContent = false;
  if (!fromExtension) { try { fromContent = new URL(sender.url || sender.origin || "").host || "unknown"; } catch (e) { fromContent = "unknown"; } }
  const reply = (p) => { p.then(sendResponse, e => sendResponse({ ok: false, error: String(e && e.message || e) })); return true; };

  switch (msg.type) {
    case "OPEN_PAGE": openPage(msg.page, msg.hash); sendResponse({ ok: true }); return;
    case "LLM": return reply(callLLM(msg.system, msg.user, msg.maxTokens || 3000, msg.budgetMs));
    case "AI_STATUS": return reply(aiStatus());
    case "STORE": return reply(storeOp(msg.op || {}, fromContent));
    case "POCKET_ADD_FILE": return reply(pocketAddFile(msg, fromContent));
    case "HANDOFF": return reply(handoff(msg, sender));
    case "POCKET_GET_FILE": return reply(pocketGetFile(msg.id, fromContent));
    case "HANDOFF_CLAIM": return fromContent ? reply(handoffClaim(sender)) : undefined;
  }
  if (fromContent) return; // everything below is for Pepper's own pages
  switch (msg.type) {
    case "POCKET_REMOVE": return reply(pocketRemove(msg.ids || [msg.id]));
    case "SET_KEY": return reply(setKey(msg.provider, msg.apiKey));
    case "LEARNING_RESET": return reply(learningReset(String(msg.projectType || "General")));
    case "RECOMPUTE": return reply(locked(recomputeLearning).then(() => ({ ok: true })));
    case "SYNC": return reply(Promise.all([syncFloating(), syncReminders()]).then(([f, r]) => ({ ok: true, floating: f.active, reminders: r.count })));
    case "SUMMON": return reply(chrome.tabs.get(msg.tabId).then(t => summon(t, { type: "OPEN_PANEL", tab: msg.tab })));
    case "REMINDER_TEST": return reply(fireReminder("test", true));
    case "WIPE": return reply(locked(async () => {
      const keep = msg.keepKey ? (await chrome.storage.local.get("pepper_settings")).pepper_settings : null;
      const key = keep && keep.hasKey ? await Vault.get("apiKey") : null;
      const owner = key ? await Vault.get("keyProvider") : null;
      await chrome.storage.local.clear();
      await Vault.clear();
      const data = freshData();
      if (key) {
        await Vault.set("apiKey", key); await Vault.set("keyProvider", owner || keep.provider);
        Object.assign(data.pepper_settings, { provider: keep.provider, hasKey: true, keyHint: keep.keyHint, model: keep.model });
      }
      await chrome.storage.local.set(data);
      await chrome.alarms.clearAll();
      return { ok: true };
    }).then(async (r) => { await syncFloating(); return r; }));
  }
});

/* ---------- Chrome's built-in AI: in the worker if Chrome exposes it there, else in an offscreen page ---------- */
let offscreenOpening = null;
async function viaOffscreen(msg) {
  if (!chrome.offscreen || !chrome.runtime.getContexts) return { ok: false, error: "NO_AI", status: "unavailable" };
  try {
    const open = (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length > 0;
    if (!open) {
      offscreenOpening = offscreenOpening || chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["WORKERS"],
        justification: "Runs Chrome's built-in on-device AI to rewrite prompts." }).finally(() => { offscreenOpening = null; });
      await offscreenOpening;
    }
    return (await chrome.runtime.sendMessage({ target: "offscreen", ...msg })) || { ok: false, error: "NO_AI" };
  } catch (e) { return { ok: false, error: "NO_AI", status: "unavailable" }; }
}
const LocalAI = self.PepperLocalAI;
const builtinStatus = async () => self.LanguageModel ? LocalAI.status() : ((await viaOffscreen({ type: "LOCAL_AI_STATUS" })).status || "unavailable");
const callBuiltin = (system, user) => self.LanguageModel ? LocalAI.run(system, user) : viaOffscreen({ type: "LOCAL_AI", system, user });
/** Which AI writes prompts right now: "key" (the user's provider), "builtin", or "none". */
async function aiStatus() {
  const { pepper_settings = {} } = await chrome.storage.local.get("pepper_settings");
  const keyed = KEY_PROVIDERS.includes(pepper_settings.provider) && !!pepper_settings.hasKey;
  const builtin = keyed ? "skipped" : await builtinStatus();
  return { ok: true, provider: pepper_settings.provider || "none", engine: keyed ? "key" : builtin === "available" ? "builtin" : "none", builtin };
}

/* ---------- model call (exactly three hosts; key never logged or returned) ---------- */
// Busy or overloaded answers are worth another try; Gemini also has lighter models to fall back on.
const RETRYABLE = (st) => st === 408 || st === 429 || st === 500 || st === 502 || st === 503 || st === 504 || st === 529;
const GEMINI_FALLBACKS = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
const pause = (ms) => new Promise(r => setTimeout(r, ms));
// Speed: a prompt rewrite doesn't need a model to "think" first, which is most of the wait. Models differ in
// how that's switched off, so each way is tried once and the one that works is remembered for this session.
const THINK_OFF = [{ thinkingBudget: 0 }, { thinkingLevel: "minimal" }, { thinkingLevel: "low" }, null];
const thinkFor = new Map();   // model -> index into THINK_OFF that it accepted
const busyUntil = new Map();  // model -> time until which it's skipped, after it said it was busy
const OPENAI_FAST = new Map(); // model -> false once it refused reasoning_effort

async function callProvider(provider, model, apiKey, system, user, maxTokens, signal) {
  let res, data;
  if (provider === "anthropic") {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal,
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] })
    });
    data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data.error && data.error.message) || ("HTTP " + res.status), status: res.status };
    return { ok: true, model, text: (data.content || []).map(b => b.text || "").join("\n").trim() };
  }
  if (provider === "openai") {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", signal,
      headers: { "content-type": "application/json", "authorization": "Bearer " + apiKey },
      body: JSON.stringify({ model, max_completion_tokens: Math.max(maxTokens, 4000),
        ...(OPENAI_FAST.get(model) === false ? {} : { reasoning_effort: "low" }),
        messages: [{ role: "system", content: system }, { role: "user", content: user }] })
    });
    data = await res.json().catch(() => ({}));
    if (res.status === 400 && OPENAI_FAST.get(model) !== false && /reasoning/i.test((data.error && data.error.message) || "")) {
      OPENAI_FAST.set(model, false);
      return callProvider(provider, model, apiKey, system, user, maxTokens, signal);
    }
    if (!res.ok) return { ok: false, error: (data.error && data.error.message) || ("HTTP " + res.status), status: res.status };
    return { ok: true, model, text: ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "").trim() };
  }
  if (provider === "gemini") {
    const ti = thinkFor.has(model) ? thinkFor.get(model) : 0;
    const think = THINK_OFF[ti];
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", signal,
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: think ? Math.max(maxTokens, 2048) : Math.max(maxTokens, 8192), temperature: 0.4, ...(think ? { thinkingConfig: think } : {}) } })
    });
    data = await res.json().catch(() => ({}));
    // This model won't take that way of turning thinking off: try the next way.
    if (res.status === 400 && think && /think/i.test((data.error && data.error.message) || "")) {
      thinkFor.set(model, ti + 1);
      return callProvider(provider, model, apiKey, system, user, maxTokens, signal);
    }
    if (res.ok) thinkFor.set(model, ti);
    if (!res.ok) return { ok: false, error: (data.error && data.error.message) || ("HTTP " + res.status), status: res.status };
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const text = parts.filter(x => !x.thought).map(x => x.text || "").join("").trim();
    return text ? { ok: true, model, text } : { ok: false, error: "The model sent back an empty answer.", status: 503 };
  }
  return { ok: false, error: "Unknown provider" };
}

async function callLLM(system, user, maxTokens, budgetMs) {
  const { pepper_settings = {} } = await chrome.storage.local.get("pepper_settings");
  const provider = pepper_settings.provider;
  const keyed = KEY_PROVIDERS.includes(provider);
  const apiKey = keyed ? await Vault.get("apiKey").catch(() => null) : null;
  const owner = apiKey ? await Vault.get("keyProvider").catch(() => null) : null;
  const builtin = async (fallbackError) => {
    if (pepper_settings.builtin === false) return fallbackError;
    const r = await callBuiltin(system, user);
    return r.ok || r.error !== "NO_AI" ? r : fallbackError;
  };
  // A key is only ever sent to the provider it was saved for. Without one, Chrome's built-in AI
  // writes the prompt when it's on this computer; otherwise the page uses Pepper's own writer.
  if (!keyed || !apiKey || (owner && owner !== provider)) return builtin({ ok: false, error: keyed ? "NO_KEY" : "NO_AI" });
  const chosen = (pepper_settings.model || "").trim().replace(/^models\//, "") || C.DEFAULT_MODELS[provider];
  const all = provider === "gemini" ? [...new Set([chosen, ...GEMINI_FALLBACKS])] : [chosen];
  // A model that said it was busy a moment ago is tried last, so the next one gets the first, fast try.
  const now = Date.now();
  const models = [...all.filter(m => !(busyUntil.get(m) > now)), ...all.filter(m => busyUntil.get(m) > now)];
  const deadline = Date.now() + Math.max(5000, Math.min(budgetMs || 40000, 40000));
  let last = { ok: false, error: "No reply" };
  for (let i = 0; i < models.length && Date.now() < deadline - 2000; i++) {
    // The chosen model gets one quick retry when it's busy; fallbacks get one try each.
    for (let attempt = 0; attempt < (i === 0 ? 2 : 1) && Date.now() < deadline - 2000; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), Math.min(25000, deadline - Date.now()));
      try { last = await callProvider(provider, models[i], apiKey, system, user, maxTokens, ctrl.signal); }
      catch (e) { last = { ok: false, error: e.name === "AbortError" ? "The model took too long to answer." : "Couldn't reach the provider: " + (e.message || String(e)), status: e.name === "AbortError" ? 408 : 0 }; }
      finally { clearTimeout(timer); }
      if (last.ok) { busyUntil.delete(models[i]); return last; }
      if (RETRYABLE(last.status)) busyUntil.set(models[i], Date.now() + 5 * 60000);
      if (!RETRYABLE(last.status) && last.status !== 0) break; // a wrong key or a bad request won't fix itself
      if (models.length > 1) break; // other models are waiting: move on rather than retry this one
      if (attempt === 0) await pause(300);
    }
    if (last.status && !RETRYABLE(last.status) && last.status !== 404) break; // a missing model moves on to the next one
  }
  // Still nothing: Chrome's own AI, if this computer has it; else the error, and Pepper's own writer takes over.
  const r = await builtin(null);
  return r && r.ok ? r : { ...last, busy: RETRYABLE(last.status) };
}
