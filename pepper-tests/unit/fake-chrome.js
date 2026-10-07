/* A minimal fake of the chrome.* APIs background.js uses. storage.local adds a
   random async delay to every get/set so read-modify-write races are real. */
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const EXT = path.resolve(__dirname, "../../pepper-extension");

function makeChrome({ jitter = 4 } = {}) {
  let data = {};
  const listeners = { message: [], installed: [], command: [], changed: [] };
  const delay = () => new Promise(r => setTimeout(r, Math.random() * jitter));
  const clone = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const local = {
    async get(keys) {
      await delay();
      if (keys == null) return clone(data);
      const ks = Array.isArray(keys) ? keys : [keys];
      const out = {}; ks.forEach(k => { if (k in data) out[k] = clone(data[k]); });
      return out;
    },
    async set(obj) { await delay(); Object.assign(data, clone(obj)); },
    async clear() { await delay(); data = {}; },
    _raw: () => data, _seed: (d) => { data = clone(d); }
  };
  const created = [];
  const chrome = {
    runtime: {
      id: "pepper-test-id",
      getURL: (p) => "chrome-extension://pepper-test-id/" + p,
      onMessage: { addListener: (f) => listeners.message.push(f) },
      onInstalled: { addListener: (f) => listeners.installed.push(f) }
    },
    storage: { local, onChanged: { addListener: (f) => listeners.changed.push(f) } },
    tabs: { create: (o) => { created.push(o.url); return Promise.resolve({}); }, sendMessage: () => Promise.resolve() },
    commands: { onCommand: { addListener: (f) => listeners.command.push(f) } }
  };
  return { chrome, listeners, created };
}

/** Loads the shipped background.js (and lib/core.js through importScripts) into a sandbox. */
function loadBackground(opts) {
  const fake = makeChrome(opts);
  const fetchCalls = [];
  const sandbox = {
    chrome: fake.chrome, console, setTimeout, clearTimeout, URL, AbortController, crypto: require("crypto").webcrypto,
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
  const fromPage = (host) => ({ id: "pepper-test-id", url: `https://${host}/c/123`, tab: { id: 7 } });
  const fromExt = { id: "pepper-test-id", url: "chrome-extension://pepper-test-id/dashboard.html" };
  return { ...fake, sandbox, send, fromPage, fromExt, fetchCalls, storage: fake.chrome.storage.local,
    install: (details) => Promise.all(fake.listeners.installed.map(f => f(details))) };
}
module.exports = { makeChrome, loadBackground, EXT };
