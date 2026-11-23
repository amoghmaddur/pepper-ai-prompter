/* A minimal fake of the chrome.* APIs background.js uses. storage.local adds a
   random async delay to every get/set so read-modify-write races are real. */
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const EXT = path.resolve(__dirname, "../../pepper-extension");

function makeArea({ jitter }) {
  let data = {};
  const delay = () => new Promise(r => setTimeout(r, Math.random() * jitter));
  const clone = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  return {
    async get(keys) {
      await delay();
      if (keys == null) return clone(data);
      const ks = Array.isArray(keys) ? keys : [keys];
      const out = {}; ks.forEach(k => { if (k in data) out[k] = clone(data[k]); });
      return out;
    },
    async set(obj) { await delay(); Object.assign(data, clone(obj)); },
    async remove(keys) { await delay(); (Array.isArray(keys) ? keys : [keys]).forEach(k => delete data[k]); },
    async clear() { await delay(); data = {}; },
    _raw: () => data, _seed: (d) => { data = clone(d); }
  };
}

function makeChrome({ jitter = 4, granted = {} } = {}) {
  const listeners = { message: [], installed: [], startup: [], command: [], changed: [], alarm: [], menu: [], permAdded: [], permRemoved: [], notifClick: [], notifButton: [] };
  const local = makeArea({ jitter }), session = makeArea({ jitter: 1 });
  const created = [], tabs = new Map(), notifications = [], injected = [];
  let nextTab = 100;
  const perms = { origins: new Set(granted.origins || []), permissions: new Set(granted.permissions || []) };
  const alarms = new Map(), registered = new Map(), menus = [];
  const chrome = {
    runtime: {
      id: "pepper-test-id",
      getURL: (p) => "chrome-extension://pepper-test-id/" + p,
      lastError: undefined,
      onMessage: { addListener: (f) => listeners.message.push(f) },
      onInstalled: { addListener: (f) => listeners.installed.push(f) },
      onStartup: { addListener: (f) => listeners.startup.push(f) }
    },
    storage: { local, session, onChanged: { addListener: (f) => listeners.changed.push(f) } },
    tabs: {
      create: async (o) => { const t = { id: nextTab++, url: o.url, index: 0 }; created.push(o.url); tabs.set(t.id, t); return t; },
      get: async (id) => tabs.get(id) || { id },
      query: async () => [...tabs.values()],
      sendMessage: async () => { throw new Error("no receiver"); }
    },
    commands: { onCommand: { addListener: (f) => listeners.command.push(f) } },
    contextMenus: {
      removeAll: (cb) => { menus.length = 0; cb && cb(); },
      create: (o, cb) => { menus.push(o); cb && cb(); },
      onClicked: { addListener: (f) => listeners.menu.push(f) }
    },
    permissions: {
      contains: async (q) => (q.origins || []).every(o => perms.origins.has(o)) && (q.permissions || []).every(p => perms.permissions.has(p)),
      onAdded: { addListener: (f) => listeners.permAdded.push(f) },
      onRemoved: { addListener: (f) => listeners.permRemoved.push(f) }
    },
    scripting: {
      registerContentScripts: async (list) => list.forEach(s => registered.set(s.id, s)),
      getRegisteredContentScripts: async (f) => [...registered.values()].filter(s => !f || !f.ids || f.ids.includes(s.id)),
      unregisterContentScripts: async (f) => (f.ids || []).forEach(id => registered.delete(id)),
      executeScript: async (o) => { injected.push(o.target.tabId); return []; },
      insertCSS: async () => {}
    },
    alarms: {
      create: async (name, info) => { alarms.set(name, { name, scheduledTime: info.when || Date.now() + (info.delayInMinutes || 0) * 60000 }); },
      clear: async (name) => alarms.delete(name),
      clearAll: async () => alarms.clear(),
      getAll: async () => [...alarms.values()],
      onAlarm: { addListener: (f) => listeners.alarm.push(f) }
    }
  };
  if (perms.permissions.has("notifications")) {
    chrome.notifications = {
      create: async (id, o) => { notifications.push({ id, ...o }); return id; },
      clear: async () => true,
      onClicked: { addListener: (f) => listeners.notifClick.push(f) },
      onButtonClicked: { addListener: (f) => listeners.notifButton.push(f) }
    };
  }
  return { chrome, listeners, created, tabs, notifications, injected, perms, alarms, registered, menus };
}

/** Loads the shipped background.js (and its lib/ scripts through importScripts) into a sandbox. */
function loadBackground(opts) {
  const fake = makeChrome(opts);
  const fetchCalls = [];
  const sandbox = {
    chrome: fake.chrome, console, setTimeout, clearTimeout, URL, AbortController, crypto: require("crypto").webcrypto,
    btoa, atob, TextEncoder, TextDecoder, Blob, Response, DecompressionStream,
    fetch: async (url, init) => { fetchCalls.push({ url, init }); return sandbox.__fetchImpl(url, init); },
    __fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ content: [{ text: "OK" }] }) })
  };
  sandbox.self = sandbox; sandbox.globalThis = sandbox;
  sandbox.importScripts = (...files) => files.forEach(f => vm.runInContext(fs.readFileSync(path.join(EXT, f), "utf8"), ctx, { filename: f }));
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(EXT, "background.js"), "utf8"), ctx, { filename: "background.js" });
  /** Sends a message as if from a sender; resolves with the response, or "NO_RESPONSE". */
  function send(msg, sender) {
    return new Promise((resolve) => {
      let async = false, done = false;
      const sendResponse = (r) => { done = true; resolve(r); };
      for (const l of fake.listeners.message) { if (l(msg, sender, sendResponse) === true) async = true; }
      if (!async && !done) setTimeout(() => { if (!done) resolve("NO_RESPONSE"); }, 30);
    });
  }
  const fromPage = (host, tabId = 7) => ({ id: "pepper-test-id", url: `https://${host}/c/123`, tab: { id: tabId, index: 0 } });
  const fromExt = { id: "pepper-test-id", url: "chrome-extension://pepper-test-id/dashboard.html" };
  /** Fires storage.onChanged the way the browser would after a write, so the worker reacts. */
  const changed = (ch) => Promise.all(fake.listeners.changed.map(f => f(ch, "local")));
  const settle = (ms = 40) => new Promise(r => setTimeout(r, ms));
  return { ...fake, sandbox, send, fromPage, fromExt, fetchCalls, storage: fake.chrome.storage.local, session: fake.chrome.storage.session,
    changed, settle, install: (details) => Promise.all(fake.listeners.installed.map(f => f(details))) };
}
module.exports = { makeChrome, loadBackground, EXT };
