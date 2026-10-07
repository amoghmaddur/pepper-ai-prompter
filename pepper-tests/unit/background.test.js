/* Tests run against the shipped background.js in a fake Chrome (see fake-chrome.js).
   Storage calls have random delays, so these exercise real interleavings. */
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../../pepper-extension/lib/core.js");
const { loadBackground, makeChrome } = require("./fake-chrome.js");

const rec = (site, extra = {}) => ({ id: C.uuid(), prompt: "hello there", site, ts: new Date().toISOString(), assisted: false, rating: null, ...extra });
async function freshBg(consent) {
  const bg = loadBackground();
  await bg.install({ reason: "install" });
  if (consent) await bg.send({ type: "STORE", op: { op: "objPatch", key: "pepper_consent", patch: consent } }, bg.fromExt);
  return bg;
}

test("C11 fresh install: learning off on all five, default memory inactive, schema 1, onboarding opened", async () => {
  const bg = await freshBg();
  const d = bg.storage._raw();
  assert.deepEqual(d.pepper_consent, C.defaultConsent());
  assert.ok(d.pepper_memories.every(m => m.active === false));
  assert.equal(d.pepper_schema, 1);
  assert.deepEqual(bg.created, ["chrome-extension://pepper-test-id/onboarding.html"]);
});

test("N5/C11 fresh install: 3 sends on each of 2 sites leave history empty", async () => {
  const bg = await freshBg();
  for (const host of ["chatgpt.com", "claude.ai"]) for (let i = 0; i < 3; i++) {
    const r = await bg.send({ type: "STORE", op: { op: "listAdd", key: "pepper_history", item: rec(host) } }, bg.fromPage(host));
    assert.equal(r.error, "NO_CONSENT");
  }
  assert.deepEqual(bg.storage._raw().pepper_history, []);
});

test("C11 learning on for one site records only there", async () => {
  const bg = await freshBg({ claude: { learning: true } });
  await bg.send({ type: "STORE", op: { op: "listAdd", key: "pepper_history", item: rec("claude.ai") } }, bg.fromPage("claude.ai"));
  await bg.send({ type: "STORE", op: { op: "listAdd", key: "pepper_history", item: rec("chatgpt.com") } }, bg.fromPage("chatgpt.com"));
  assert.deepEqual(bg.storage._raw().pepper_history.map(r => r.site), ["claude.ai"]);
});

test("C1/N5 global switch off: nothing recorded even with learning on", async () => {
  const bg = await freshBg({ claude: { learning: true } });
  await bg.send({ type: "STORE", op: { op: "objPatch", key: "pepper_settings", patch: { enabled: false } } }, bg.fromExt);
  const r = await bg.send({ type: "STORE", op: { op: "listAdd", key: "pepper_history", item: rec("claude.ai") } }, bg.fromPage("claude.ai"));
  assert.equal(r.error, "NO_CONSENT");
  assert.equal(bg.storage._raw().pepper_history.length, 0);
});

test("Writer check: a tab can't file a record under another site's name", async () => {
  const bg = await freshBg({ claude: { learning: true } });
  const r = await bg.send({ type: "STORE", op: { op: "listAdd", key: "pepper_history", item: rec("claude.ai") } }, bg.fromPage("chatgpt.com"));
  assert.equal(r.error, "NO_CONSENT");
});

test("Content scripts are limited to a whitelist of writes", async () => {
  const bg = await freshBg({ claude: { learning: true } });
  const page = bg.fromPage("claude.ai");
  for (const op of [
    { op: "listSet", key: "pepper_history", items: [] },
    { op: "objPatch", key: "pepper_settings", patch: { enabled: true } },
    { op: "objPatch", key: "pepper_consent", patch: { chatgpt: { learning: true } } },
    { op: "listRemove", key: "pepper_memories", id: "default-1" },
    { op: "set", key: "pepper_profile", value: {} },
    { op: "listPatch", key: "pepper_history", id: "x", patch: { site: "chatgpt.com" } }
  ]) {
    const r = await bg.send({ type: "STORE", op }, page);
    assert.equal(r.ok, false, JSON.stringify(op));
  }
  const r = await bg.send({ type: "WIPE" }, page);
  assert.equal(r, "NO_RESPONSE");
});

test("C3 a message from another extension gets no response", async () => {
  const bg = await freshBg();
  const r = await bg.send({ type: "LLM", system: "s", user: "u" }, { id: "some-other-extension", url: "chrome-extension://other/x.html" });
  assert.equal(r, "NO_RESPONSE");
  assert.equal(bg.fetchCalls.length, 0);
});

test("C4 two tabs sending within 200 ms both keep their records (40 concurrent writes)", async () => {
  const bg = await freshBg({ chatgpt: { learning: true }, claude: { learning: true } });
  const sends = [];
  for (let i = 0; i < 20; i++) {
    sends.push(bg.send({ type: "STORE", op: { op: "listAdd", key: "pepper_history", item: rec("chatgpt.com", { id: "a" + i }) } }, bg.fromPage("chatgpt.com")));
    sends.push(bg.send({ type: "STORE", op: { op: "listAdd", key: "pepper_history", item: rec("claude.ai", { id: "b" + i }) } }, bg.fromPage("claude.ai")));
  }
  const t0 = Date.now(); await Promise.all(sends);
  const ids = bg.storage._raw().pepper_history.map(r => r.id);
  assert.equal(ids.length, 40, `kept ${ids.length} of 40 in ${Date.now() - t0} ms`);
  assert.equal(new Set(ids).size, 40);
});

test("C4 control: the same race WITHOUT the queue loses records (proves the test can fail)", async () => {
  const { chrome } = makeChrome();
  const local = chrome.storage.local; await local.set({ h: [] });
  const naive = async (item) => { const cur = (await local.get("h")).h; await local.set({ h: [item, ...cur] }); };
  await Promise.all(Array.from({ length: 40 }, (_, i) => naive({ id: i })));
  assert.ok((await local.get("h")).h.length < 40);
});

test("C4 no stored record contains _done", async () => {
  const bg = await freshBg({ claude: { learning: true } });
  await bg.send({ type: "STORE", op: { op: "listAdd", key: "pepper_history", item: rec("claude.ai", { _done: true }) } }, bg.fromPage("claude.ai"));
  assert.ok(!JSON.stringify(bg.storage._raw().pepper_history).includes("_done"));
});

test("C4 update from v0.2: records kept, enhanced → assisted, onboarding opened with #update", async () => {
  const bg = loadBackground();
  bg.storage._seed({ pepper_settings: { enabled: true, provider: "none" },
    pepper_history: [{ id: 1, prompt: "p", enhanced: "p", site: "chatgpt.com", ts: new Date().toISOString(), rating: 5, _done: true }] });
  await bg.install({ reason: "update", previousVersion: "0.2.0" });
  const d = bg.storage._raw();
  assert.equal(d.pepper_history.length, 1);
  assert.equal(d.pepper_history[0].assisted, true);
  assert.equal(d.pepper_history[0].id, "1");
  assert.deepEqual(bg.created, ["chrome-extension://pepper-test-id/onboarding.html#update"]);
});

test("M7 learning recomputes in the writer after a rating, and ignores sites with learning off", async () => {
  const bg = await freshBg({ claude: { learning: true } });
  const page = bg.fromPage("claude.ai");
  const ids = [];
  for (const [lens, rating] of [["role", 5], ["role", 5], ["auto", 2], ["auto", 3], ["clarify", 4]]) {
    const item = rec("claude.ai", { assisted: true, lens, projectType: "Research" });
    await bg.send({ type: "STORE", op: { op: "listAdd", key: "pepper_history", item } }, page);
    await bg.send({ type: "STORE", op: { op: "listPatch", key: "pepper_history", id: item.id, patch: { rating } } }, page);
    ids.push(item.id);
  }
  assert.equal(bg.storage._raw().pepper_learning.types.Research.lens, "role");
  // revoking consent removes that site's ratings from learning
  await bg.send({ type: "STORE", op: { op: "objPatch", key: "pepper_consent", patch: { claude: { learning: false } } } }, bg.fromExt);
  assert.equal(bg.storage._raw().pepper_learning.types.Research.lens, "auto");
  // reset
  await bg.send({ type: "STORE", op: { op: "objPatch", key: "pepper_consent", patch: { claude: { learning: true } } } }, bg.fromExt);
  await bg.send({ type: "LEARNING_RESET", projectType: "Research" }, bg.fromExt);
  const L = bg.storage._raw().pepper_learning.types.Research;
  assert.equal(L.lens, "auto"); assert.ok(L.resetAt);
  assert.equal(bg.storage._raw().pepper_history.length, 5, "history kept");
});

test("N8 the worker calls only the chosen provider host, with the key, and never returns the key", async () => {
  const bg = await freshBg();
  await bg.send({ type: "STORE", op: { op: "objPatch", key: "pepper_settings", patch: { provider: "anthropic", apiKey: "sk-secret" } } }, bg.fromExt);
  const r = await bg.send({ type: "LLM", system: "s", user: "u", maxTokens: 10 }, bg.fromPage("chatgpt.com"));
  assert.equal(r.ok, true);
  assert.equal(bg.fetchCalls.length, 1);
  assert.equal(new URL(bg.fetchCalls[0].url).host, "api.anthropic.com");
  assert.equal(bg.fetchCalls[0].init.headers["x-api-key"], "sk-secret");
  assert.equal(JSON.parse(bg.fetchCalls[0].init.body).model, C.DEFAULT_MODELS.anthropic);
  assert.ok(!JSON.stringify(r).includes("sk-secret"));
  await bg.send({ type: "STORE", op: { op: "objPatch", key: "pepper_settings", patch: { provider: "openai", apiKey: "sk-o" } } }, bg.fromExt);
  bg.sandbox.__fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "OK" } }] }) });
  await bg.send({ type: "LLM", system: "s", user: "u", maxTokens: 10 }, bg.fromExt);
  assert.equal(new URL(bg.fetchCalls[1].url).host, "api.openai.com");
  assert.ok("max_completion_tokens" in JSON.parse(bg.fetchCalls[1].init.body));
});

test("M8 no key → NO_KEY without any network call; HTTP error surfaces the provider message", async () => {
  const bg = await freshBg();
  assert.equal((await bg.send({ type: "LLM", system: "s", user: "u" }, bg.fromExt)).error, "NO_KEY");
  assert.equal(bg.fetchCalls.length, 0);
  await bg.send({ type: "STORE", op: { op: "objPatch", key: "pepper_settings", patch: { provider: "anthropic", apiKey: "k" } } }, bg.fromExt);
  bg.sandbox.__fetchImpl = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "rate limited" } }) });
  const r = await bg.send({ type: "LLM", system: "s", user: "u" }, bg.fromExt);
  assert.deepEqual([r.ok, r.error, r.status], [false, "rate limited", 429]);
});

test("Export excludes pepper_settings (the key) — dashboard export logic", async () => {
  // The dashboard deletes pepper_settings before building the file; mirror that and check nothing else holds the key.
  const bg = await freshBg();
  await bg.send({ type: "STORE", op: { op: "objPatch", key: "pepper_settings", patch: { provider: "anthropic", apiKey: "sk-secret" } } }, bg.fromExt);
  const all = await bg.storage.get(null); delete all.pepper_settings;
  assert.ok(!JSON.stringify(all).includes("sk-secret"));
  const src = require("fs").readFileSync(require("path").join(__dirname, "../../pepper-extension/dashboard.js"), "utf8");
  assert.match(src, /delete s\.pepper_settings;/);
});

test("WIPE from an extension page clears everything and restores safe defaults", async () => {
  const bg = await freshBg({ claude: { learning: true } });
  await bg.send({ type: "STORE", op: { op: "listAdd", key: "pepper_history", item: rec("claude.ai") } }, bg.fromPage("claude.ai"));
  await bg.send({ type: "WIPE" }, bg.fromExt);
  const d = bg.storage._raw();
  assert.deepEqual(d.pepper_history, []); assert.deepEqual(d.pepper_consent, C.defaultConsent()); assert.equal(d.pepper_settings.apiKey, "");
});
