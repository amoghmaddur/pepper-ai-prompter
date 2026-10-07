/* ==========================================================================
   Pepper — The Personal AI Prompter · background worker (M8 + M10 writer)
   - Only module with network access, limited to the two provider hosts.
   - All list writes from every tab go through one serialized queue here,
     re-reading storage before each write, so two tabs never overwrite each
     other (C4). The learning engine (M7) recomputes inside the same queue.
   ========================================================================== */
importScripts("lib/core.js");
const C = self.PepperCore;

const LIST_KEYS = ["pepper_history", "pepper_saved_prompts", "pepper_memories", "pepper_files", "pepper_projects"];
const OBJ_KEYS = ["pepper_settings", "pepper_profile", "pepper_consent", "pepper_learning", "pepper_ui"];
const VALUE_KEYS = ["pepper_active_project"];
// Content scripts (running on AI sites) may only do these; everything else needs an extension page.
const CONTENT_ALLOWED = new Set([
  "listAdd:pepper_history", "listPatch:pepper_history", "listAdd:pepper_saved_prompts",
  "listAdd:pepper_memories", "set:pepper_active_project", "objPatch:pepper_ui"
]);
const CONTENT_HISTORY_PATCH_FIELDS = new Set(["rating", "response", "partial", "responseChars", "truncated"]);

const DEFAULT_MEMORIES = [
  { id: "default-1", text: "I write in a plain, humanized tone with no dashes", active: false }
];

/* ---------- install + migration ---------- */
chrome.runtime.onInstalled.addListener(async (details) => {
  await locked(async () => {
    const cur = await chrome.storage.local.get(null);
    const fresh = !cur.pepper_settings && !cur.pepper_history;
    let data = cur;
    if (fresh) {
      data = freshData(false);
      await chrome.storage.local.set(data);
    } else {
      const m = C.migrate(cur, Date.now());
      if (m.changed) await chrome.storage.local.set(m.data);
      data = m.data;
    }
    await recomputeLearning();
    const older = details.reason === "update" && versionLess(details.previousVersion || "0", "0.3.0");
    if (details.reason === "install" || older) {
      chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") + (older ? "#update" : "") });
    }
  });
});

function freshData(onboarded) {
  return {
    pepper_settings: { enabled: true, minChars: 6, provider: "none", apiKey: "", model: "", onboarded: !!onboarded },
    pepper_memories: DEFAULT_MEMORIES.map(m => ({ ...m })), pepper_history: [], pepper_profile: { answers: {}, completed: false },
    pepper_files: [], pepper_projects: [], pepper_saved_prompts: [], pepper_active_project: null,
    pepper_consent: C.defaultConsent(), pepper_learning: { types: {}, dismissedFacts: [] },
    pepper_ui: {}, pepper_schema: C.SCHEMA
  };
}

function versionLess(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x < y; }
  return false;
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

const senderHost = (fromContent) => typeof fromContent === "string" ? fromContent : "";
async function storeOp(op, fromContent) {
  const known = LIST_KEYS.includes(op.key) || OBJ_KEYS.includes(op.key) || VALUE_KEYS.includes(op.key);
  if (!known) return { ok: false, error: "Unknown key" };
  if (fromContent) {
    if (!CONTENT_ALLOWED.has(op.op + ":" + op.key)) return { ok: false, error: "Not allowed from a web page" };
    if (op.op === "listPatch" && Object.keys(op.patch || {}).some(k => !CONTENT_HISTORY_PATCH_FIELDS.has(k))) return { ok: false, error: "Field not allowed" };
  }
  return locked(async () => {
    if (fromContent && op.key === "pepper_history" && op.op === "listAdd") {
      // P2 enforced at the writer as well: a record from a web page is stored only if
      // the global switch and that site's learning flag are on right now, and the
      // record's site is the tab it came from.
      const s = await chrome.storage.local.get(["pepper_settings", "pepper_consent"]);
      const tabHost = senderHost(fromContent);
      if (!op.item || op.item.site !== tabHost || !C.consentAllows(s.pepper_settings, s.pepper_consent, tabHost)) {
        return { ok: false, error: "NO_CONSENT" };
      }
    }
    const cur = (await chrome.storage.local.get(op.key))[op.key];
    let next = applyOp(op, cur);
    if (op.key === "pepper_history") next = C.prune(next, Date.now());
    await chrome.storage.local.set({ [op.key]: next });
    if (op.key === "pepper_history" || op.key === "pepper_consent") await recomputeLearning();
    return { ok: true, id: op.item ? op.item.id : undefined };
  });
}

async function learningReset(type) {
  return locked(async () => {
    const s = await chrome.storage.local.get("pepper_learning");
    await chrome.storage.local.set({ pepper_learning: C.resetLearning(s.pepper_learning, type, Date.now()) });
    await recomputeLearning();
    return { ok: true };
  });
}

/* ---------- messages ---------- */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg || typeof msg !== "object") return; // foreign sender: no response
  const extOrigin = chrome.runtime.getURL("");
  const fromExtension = !!(sender.url && sender.url.startsWith(extOrigin));
  let fromContent = false;
  if (!fromExtension) { try { fromContent = new URL(sender.url || sender.origin || "").host || "unknown"; } catch (e) { fromContent = "unknown"; } }

  if (msg.type === "OPEN_PAGE") {
    const page = ["dashboard.html", "onboarding.html", "privacy.html"].includes(msg.page) ? msg.page : "dashboard.html";
    chrome.tabs.create({ url: chrome.runtime.getURL(page) + (msg.hash ? "#" + String(msg.hash).replace(/[^\w-]/g, "") : "") });
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === "LLM") {
    callLLM(msg.system, msg.user, msg.maxTokens || 3000).then(sendResponse);
    return true;
  }
  if (msg.type === "STORE") {
    storeOp(msg.op || {}, fromContent).then(sendResponse, e => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === "LEARNING_RESET" && !fromContent) {
    learningReset(String(msg.projectType || "General")).then(sendResponse);
    return true;
  }
  if (msg.type === "WIPE" && !fromContent) {
    locked(async () => {
      const keep = msg.keepKey ? (await chrome.storage.local.get("pepper_settings")).pepper_settings : null;
      await chrome.storage.local.clear();
      const data = freshData(true);
      if (keep && keep.apiKey) Object.assign(data.pepper_settings, { provider: keep.provider, apiKey: keep.apiKey, model: keep.model });
      await chrome.storage.local.set(data);
    }).then(() => sendResponse({ ok: true }), e => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === "RECOMPUTE" && !fromContent) {
    locked(recomputeLearning).then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-panel" && tab && tab.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" }).catch(() => {});
  }
});

/* ---------- model call (exactly two hosts; key never logged or returned) ---------- */
async function callLLM(system, user, maxTokens) {
  const { pepper_settings = {} } = await chrome.storage.local.get("pepper_settings");
  const { provider, apiKey } = pepper_settings;
  if (!provider || provider === "none" || !apiKey) return { ok: false, error: "NO_KEY" };
  const model = (pepper_settings.model || "").trim() || C.DEFAULT_MODELS[provider];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    let res, data;
    if (provider === "anthropic") {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: ctrl.signal,
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
        method: "POST", signal: ctrl.signal,
        headers: { "content-type": "application/json", "authorization": "Bearer " + apiKey },
        body: JSON.stringify({ model, max_completion_tokens: Math.max(maxTokens, 4000),
          messages: [{ role: "system", content: system }, { role: "user", content: user }] })
      });
      data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: (data.error && data.error.message) || ("HTTP " + res.status), status: res.status };
      return { ok: true, model, text: ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "").trim() };
    }
    return { ok: false, error: "Unknown provider" };
  } catch (e) {
    return { ok: false, error: e.name === "AbortError" ? "The model took longer than 30 seconds." : "Couldn't reach the provider: " + (e.message || String(e)) };
  } finally {
    clearTimeout(timer);
  }
}
