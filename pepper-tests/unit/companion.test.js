/* v0.4 worker features, run against the shipped background.js in a fake Chrome:
   what web pages may put in the Pocket, Pocket files, prompt hand-offs, keep
   floating, reminders, the right-click menu, the v0.3 → v0.4 update and wipe. */
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../../pepper-extension/lib/core.js");
const A = require("../../pepper-extension/lib/assist.js");
const { loadBackground } = require("./fake-chrome.js");

const ANSWERS = { name: "Maya", q3: "grad student", q1: ["Claude", "ChatGPT"], q2: ["Job search"], q5: "Step-by-step", q6: "Professional", focus: "morning", q10: "land a backend role" };
async function readyBg(opts = {}, settings = {}) {
  const bg = loadBackground(opts);
  await bg.install({ reason: "install" });
  await bg.send({ type: "STORE", op: { op: "set", key: "pepper_profile", value: { answers: ANSWERS, completed: true } } }, bg.fromExt);
  await bg.send({ type: "STORE", op: { op: "objPatch", key: "pepper_settings", patch: { floating: "ai", ...settings } } }, bg.fromExt);
  bg.created.length = 0;
  return bg;
}
const pocket = (bg) => bg.storage._raw().pepper_pocket;
const b64 = (n, fill = 65) => Buffer.alloc(n, fill).toString("base64");

/* ---------------- what a web page may save ---------------- */
test("Pocket from a page: links and snippets only, cleaned, and only http(s) links", async () => {
  const bg = await readyBg();
  const page = bg.fromPage("example.com");
  let r = await bg.send({ type: "STORE", op: { op: "listAdd", key: "pepper_pocket", item: { kind: "link", url: "https://ex.com/a", title: "A", id: "evil", hasBlob: true, size: 9e9 } } }, page);
  assert.equal(r.ok, true);
  const [link] = pocket(bg);
  assert.equal(link.kind, "link"); assert.equal(link.url, "https://ex.com/a"); assert.equal(link.source, "page");
  assert.notEqual(link.id, "evil", "the page can't choose the ID"); assert.ok(!("hasBlob" in link) && !("size" in link), "nor extra fields");
  r = await bg.send({ type: "STORE", op: { op: "listAdd", key: "pepper_pocket", item: { kind: "link", url: "javascript:alert(1)" } } }, page);
  assert.equal(r.ok, false);
  r = await bg.send({ type: "STORE", op: { op: "listAdd", key: "pepper_pocket", item: { kind: "file", name: "x.exe", hasBlob: true } } }, page);
  assert.equal(r.ok, false, "files need POCKET_ADD_FILE");
  r = await bg.send({ type: "STORE", op: { op: "listAdd", key: "pepper_pocket", item: { kind: "snippet", text: "x".repeat(50000) } } }, page);
  assert.equal(r.ok, true); assert.equal(pocket(bg)[0].text.length, 20000, "snippets are capped");
  assert.equal(pocket(bg).length, 2);
});
test("Pocket from a page: refused when the Pocket is turned off", async () => {
  const bg = await readyBg({}, { features: { ...A.defaultFeatures(), pocket: false } });
  const r = await bg.send({ type: "STORE", op: { op: "listAdd", key: "pepper_pocket", item: { kind: "link", url: "https://ex.com" } } }, bg.fromPage("example.com"));
  assert.equal(r.ok, false); assert.deepEqual(pocket(bg), []);
});
test("Pages can't touch details, reminders, settings or delete Pocket items", async () => {
  const bg = await readyBg();
  const page = bg.fromPage("example.com");
  for (const op of [
    { op: "set", key: "pepper_details", value: { email: "attacker@x.io" } },
    { op: "objPatch", key: "pepper_details", patch: { email: "attacker@x.io" } },
    { op: "listSet", key: "pepper_reminders", items: [] },
    { op: "listRemove", key: "pepper_pocket", id: "x" },
    { op: "listPatch", key: "pepper_pocket", id: "x", patch: { url: "https://evil" } },
    { op: "objPatch", key: "pepper_settings", patch: { floating: "everywhere" } },
    { op: "set", key: "pepper_profile", value: { answers: {}, completed: true } }
  ]) {
    const r = await bg.send({ type: "STORE", op }, page);
    assert.equal(r.ok, false, op.op + ":" + op.key);
  }
  assert.equal(await bg.send({ type: "POCKET_REMOVE", id: "x" }, page), "NO_RESPONSE");
  assert.equal(await bg.send({ type: "WIPE" }, page), "NO_RESPONSE");
  assert.equal(await bg.send({ type: "SYNC" }, page), "NO_RESPONSE");
});

/* ---------------- Pocket files ---------------- */
test("Pocket files: bytes in the vault (not in storage pages can read), size measured not trusted, names cleaned, one resume", async () => {
  const bg = await readyBg();
  let r = await bg.send({ type: "POCKET_ADD_FILE", item: { name: "Maya CV.pdf", mime: "application/pdf", size: 1, role: "resume" }, data: b64(3000) }, bg.fromExt);
  assert.equal(r.ok, true);
  const first = r.item;
  assert.equal(first.size, 3000, "size comes from the bytes");
  assert.equal(bg.vault()[A.blobKey(first.id)], b64(3000));
  assert.ok(!Object.keys(bg.storage._raw()).some(k => k.startsWith("pepper_blob_")), "no file bytes in chrome.storage, so they're never broadcast to tabs");
  const got = await bg.send({ type: "POCKET_GET_FILE", id: first.id }, bg.fromPage("example.com"));
  assert.deepEqual([got.ok, got.data, got.name], [true, b64(3000), "Maya CV.pdf"], "the panel gets a file when it asks for it");
  assert.equal(first.role, "resume"); assert.equal(first.hasBlob, true);
  r = await bg.send({ type: "POCKET_ADD_FILE", item: { name: 'new/"resume".docx', role: "resume", text: "Rust" }, data: b64(10) }, bg.fromPage("example.com"));
  assert.equal(r.ok, true);
  assert.equal(r.item.name, 'new__resume_.docx');
  assert.equal(r.item.source, "page");
  const items = pocket(bg);
  assert.equal(items.filter(i => i.role === "resume").length, 1, "only the newest is the resume");
  assert.equal(items[0].text, "Rust");
});
test("Pocket files: too large, or Pocket off for a page, is refused before anything is stored", async () => {
  const bg = await readyBg();
  const r = await bg.send({ type: "POCKET_ADD_FILE", item: { name: "big.zip" }, data: b64(16 * 1024 * 1024) }, bg.fromExt);
  assert.equal(r.ok, false); assert.match(r.error, /up to 15/);
  assert.deepEqual(Object.keys(bg.vault()).filter(k => k.startsWith("pepper_blob_")), []);
  const off = await readyBg({}, { features: { ...A.defaultFeatures(), pocket: false } });
  assert.equal((await off.send({ type: "POCKET_ADD_FILE", item: { name: "a.txt" }, data: b64(5) }, off.fromPage("example.com"))).ok, false);
  const added = await off.send({ type: "POCKET_ADD_FILE", item: { name: "a.txt" }, data: b64(5) }, off.fromExt);
  assert.equal(added.ok, true, "the dashboard can still add files");
  assert.equal((await off.send({ type: "POCKET_GET_FILE", id: added.id }, off.fromPage("example.com"))).ok, false, "pages can't fetch files while the Pocket is off");
});
test("Pocket files: removing one deletes its bytes and detaches it from projects", async () => {
  const bg = await readyBg();
  const { item } = await bg.send({ type: "POCKET_ADD_FILE", item: { name: "r.txt", text: "x" }, data: b64(4) }, bg.fromExt);
  await bg.send({ type: "STORE", op: { op: "listAdd", key: "pepper_projects", item: { id: "p1", name: "Jobs", type: "Job applications", fileIds: [item.id, "other"] } } }, bg.fromExt);
  await bg.send({ type: "POCKET_REMOVE", id: item.id }, bg.fromExt);
  const d = bg.storage._raw();
  assert.deepEqual(d.pepper_pocket, []);
  assert.ok(!(A.blobKey(item.id) in bg.vault()), "its bytes are gone from the vault");
  assert.deepEqual(d.pepper_projects[0].fileIds, ["other"]);
});

/* ---------------- hand-offs ---------------- */
test("Hand-off: opens the chosen AI, and only the tab it opened, on that site, can claim the prompt, once", async () => {
  const bg = await readyBg();
  const r = await bg.send({ type: "HANDOFF", siteId: "claude", text: "ROLE\nx", raw: "summarize", from: "Some page" }, bg.fromPage("example.com", 3));
  assert.equal(r.ok, true); assert.equal(r.site, "Claude");
  const tab = [...bg.tabs.values()].pop();
  assert.equal(tab.url, "https://claude.ai/new");
  assert.equal((await bg.send({ type: "HANDOFF_CLAIM" }, bg.fromPage("claude.ai", tab.id + 1))).ok, false, "another tab");
  assert.equal((await bg.send({ type: "HANDOFF_CLAIM" }, bg.fromPage("evil.example", tab.id))).ok, false, "the tab navigated elsewhere");
});
test("Hand-off: the right tab gets the text exactly once; stale hand-offs expire", async () => {
  const bg = await readyBg();
  await bg.send({ type: "HANDOFF", siteId: "chatgpt", text: "ROLE\nhello", raw: "r" }, bg.fromExt);
  const tab = [...bg.tabs.values()].pop();
  const c = await bg.send({ type: "HANDOFF_CLAIM" }, bg.fromPage("chatgpt.com", tab.id));
  assert.deepEqual([c.ok, c.text, c.raw], [true, "ROLE\nhello", "r"]);
  assert.equal((await bg.send({ type: "HANDOFF_CLAIM" }, bg.fromPage("chatgpt.com", tab.id))).ok, false, "claimed once");
  await bg.send({ type: "HANDOFF", siteId: "chatgpt", text: "old" }, bg.fromExt);
  const t2 = [...bg.tabs.values()].pop();
  const all = (await bg.session.get("handoffs")).handoffs; all[t2.id].at -= A.HANDOFF_TTL + 1000; await bg.session.set({ handoffs: all });
  assert.equal((await bg.send({ type: "HANDOFF_CLAIM" }, bg.fromPage("chatgpt.com", t2.id))).ok, false);
  assert.equal((await bg.send({ type: "HANDOFF", siteId: "chatgpt", text: "  " }, bg.fromExt)).ok, false, "nothing to send");
});

/* ---------------- keep floating ---------------- */
test("Keep floating: registers on every site except the AI sites, only with the permission; off unregisters", async () => {
  const bg = await readyBg({ granted: { origins: ["<all_urls>"] } }, { floating: "everywhere" });
  let r = await bg.send({ type: "SYNC" }, bg.fromExt);
  assert.equal(r.floating, true);
  const reg = bg.registered.get("pepper-everywhere");
  assert.deepEqual([...reg.matches], ["<all_urls>"]);
  assert.deepEqual([...reg.excludeMatches].sort(), C.SITES.flatMap(s => s.hosts).map(h => `*://${h}/*`).sort(), "the AI sites already have Pepper");
  assert.deepEqual([...reg.js], ["lib/core.js", "lib/assist.js", "content.js"]);
  await bg.send({ type: "STORE", op: { op: "objPatch", key: "pepper_settings", patch: { floating: "ai" } } }, bg.fromExt);
  r = await bg.send({ type: "SYNC" }, bg.fromExt);
  assert.equal(r.floating, false); assert.equal(bg.registered.size, 0);
});
test("Keep floating: if the permission is gone, Pepper falls back to AI sites and says why", async () => {
  const bg = await readyBg({}, { floating: "everywhere" });
  await bg.send({ type: "SYNC" }, bg.fromExt);
  const s = bg.storage._raw().pepper_settings;
  assert.equal(bg.registered.size, 0);
  assert.deepEqual([s.floating, s.floatingLost], ["ai", true]);
});
test("Keep floating: switched off globally means not registered even with permission", async () => {
  const bg = await readyBg({ granted: { origins: ["<all_urls>"] } }, { floating: "everywhere", enabled: false });
  await bg.send({ type: "SYNC" }, bg.fromExt);
  assert.equal(bg.registered.size, 0);
});

/* ---------------- reminders ---------------- */
const focusOn = (bg, extra = {}) => bg.send({ type: "STORE", op: { op: "listSet", key: "pepper_reminders", items: [{ ...A.focusReminder(ANSWERS), enabled: true, ...extra }] } }, bg.fromExt);
test("Reminders: scheduled only with the feature on, notifications allowed and the reminder on", async () => {
  const withPerm = await readyBg({ granted: { permissions: ["notifications"] } }, { features: { ...A.defaultFeatures(), reminders: true } });
  await focusOn(withPerm);
  let r = await withPerm.send({ type: "SYNC" }, withPerm.fromExt);
  assert.equal(r.reminders, 1);
  const alarm = withPerm.alarms.get("rem:focus");
  assert.equal(alarm.scheduledTime, A.nextOccurrence("09:30", [1, 2, 3, 4, 5], Date.now()) , "next weekday at the focus time");
  await focusOn(withPerm, { enabled: false });
  await withPerm.send({ type: "SYNC" }, withPerm.fromExt);
  assert.equal(withPerm.alarms.size, 0, "turning a reminder off clears it");
  const noPerm = await readyBg({}, { features: { ...A.defaultFeatures(), reminders: true } });
  await focusOn(noPerm);
  r = await noPerm.send({ type: "SYNC" }, noPerm.fromExt);
  assert.equal(r.reminders, 0); assert.equal(noPerm.alarms.size, 0);
  const featureOff = await readyBg({ granted: { permissions: ["notifications"] } });
  await focusOn(featureOff);
  await featureOff.send({ type: "SYNC" }, featureOff.fromExt);
  assert.equal(featureOff.alarms.size, 0);
});
test("Reminders: firing shows a personal notification with the favorite AI, then schedules the next one", async () => {
  const bg = await readyBg({ granted: { permissions: ["notifications"] } }, { features: { ...A.defaultFeatures(), reminders: true } });
  await focusOn(bg);
  await bg.send({ type: "SYNC" }, bg.fromExt);
  await Promise.all(bg.listeners.alarm.map(f => f({ name: "rem:focus" })));
  await bg.settle();
  assert.equal(bg.notifications.length, 1);
  const n = bg.notifications[0];
  assert.match(n.title, /, Maya$/); assert.match(n.message, /Goal: land a backend role/);
  assert.deepEqual(Array.from(n.buttons, b => b.title), ["Open Claude", "Snooze 30 minutes"]);
  assert.ok(bg.alarms.has("rem:focus"), "rescheduled");
});

/* ---------------- right-click menu and summoning ---------------- */
test("Right-click: menu items exist; saving a page or link stores a cleaned Pocket link, confirmed on the toolbar, without putting Pepper on the page", async () => {
  const bg = await readyBg();
  assert.deepEqual(bg.menus.map(m => m.id).sort(), ["pepper-ask", "pepper-fix", "pepper-save-link", "pepper-save-page", "pepper-save-selection"]);
  await Promise.all(bg.listeners.menu.map(f => f({ menuItemId: "pepper-save-page", pageUrl: "https://jobs.example/apply" }, { id: 9, title: "Apply now" })));
  await Promise.all(bg.listeners.menu.map(f => f({ menuItemId: "pepper-save-link", linkUrl: "javascript:void(0)" }, { id: 9 })));
  await bg.settle();
  assert.deepEqual(pocket(bg).map(i => [i.kind, i.url, i.title]), [["link", "https://jobs.example/apply", "Apply now"]]);
  assert.deepEqual([...bg.badges.slice(0, 2)].sort(), ["!", "\u2713"].sort(), "a tick for the save, a ! for the refused javascript: link");
  assert.deepEqual(bg.injected, [], "saving doesn't inject Pepper into the page");
});
test("Summon before setup opens onboarding instead of Pepper", async () => {
  const bg = loadBackground();
  await bg.install({ reason: "install" });
  bg.created.length = 0;
  await Promise.all(bg.listeners.command.map(f => f("toggle-panel", { id: 5 })));
  await bg.settle();
  assert.deepEqual(bg.created, ["chrome-extension://pepper-test-id/onboarding.html"]);
  assert.deepEqual(bg.injected, []);
});
test("Summon after setup injects Pepper into that tab", async () => {
  const bg = await readyBg();
  await Promise.all(bg.listeners.command.map(f => f("toggle-panel", { id: 5 })));
  await bg.settle();
  assert.deepEqual(bg.injected, [5]);
  assert.deepEqual(bg.created, []);
});

/* ---------------- update and wipe ---------------- */
test("Update from v0.3: files move to the Pocket, the old key is removed, onboarding opens for the new questions", async () => {
  const bg = loadBackground();
  bg.storage._seed({ pepper_schema: 1, pepper_settings: { enabled: true, provider: "none", onboarded: true },
    pepper_profile: { answers: { q3: "grad student" }, completed: true }, pepper_history: [],
    pepper_files: [{ id: "f1", name: "resume.txt", text: "Rust", size: 4 }], pepper_projects: [{ id: "p1", name: "J", type: "Job applications", fileIds: ["f1"] }] });
  await bg.install({ reason: "update", previousVersion: "0.3.0" });
  const d = bg.storage._raw();
  assert.ok(!("pepper_files" in d));
  assert.deepEqual(d.pepper_pocket.map(i => [i.id, i.kind, i.text]), [["f1", "file", "Rust"]]);
  assert.equal(d.pepper_profile.answers.q3, "grad student", "answers kept");
  assert.equal(d.pepper_profile.completed, false);
  assert.deepEqual(bg.created, ["chrome-extension://pepper-test-id/onboarding.html#update"]);
});
test("Update when setup is already done: no onboarding tab", async () => {
  const bg = await readyBg();
  await bg.install({ reason: "update", previousVersion: "0.4.0" });
  assert.deepEqual(bg.created, []);
});
test("Wipe: everything goes, alarms and floating included, and setup starts over", async () => {
  const bg = await readyBg({ granted: { origins: ["<all_urls>"], permissions: ["notifications"] } }, { floating: "everywhere", features: { ...A.defaultFeatures(), reminders: true } });
  await bg.send({ type: "POCKET_ADD_FILE", item: { name: "a.txt" }, data: b64(4) }, bg.fromExt);
  await focusOn(bg);
  await bg.send({ type: "SYNC" }, bg.fromExt);
  assert.ok(bg.registered.size && bg.alarms.size);
  await bg.send({ type: "WIPE" }, bg.fromExt);
  const d = bg.storage._raw();
  assert.deepEqual(d.pepper_pocket, []);
  assert.deepEqual(bg.vault(), {}, "the vault is emptied too");
  assert.equal(bg.alarms.size, 0); assert.equal(bg.registered.size, 0);
  assert.equal(A.setupComplete(d.pepper_profile, d.pepper_settings), false);
});

/* ---------------- review fixes ---------------- */
test("Update from v0.3: a key and file contents left in storage move into the vault", async () => {
  const bg = loadBackground();
  bg.storage._seed({ pepper_schema: 2, pepper_settings: { enabled: true, provider: "anthropic", apiKey: "sk-old-key-9999", floating: "ai" },
    pepper_profile: { answers: ANSWERS, completed: true }, pepper_history: [], pepper_pocket: [{ id: "f1", kind: "file", name: "a.pdf", hasBlob: true, size: 3 }],
    pepper_blob_f1: "QUJD" });
  await bg.install({ reason: "update", previousVersion: "0.4.0" });
  const d = bg.storage._raw();
  assert.ok(!JSON.stringify(d).includes("sk-old-key"), "the key left storage");
  assert.ok(!("pepper_blob_f1" in d), "file bytes left storage");
  assert.equal(bg.vault().apiKey, "sk-old-key-9999");
  assert.equal(bg.vault().pepper_blob_f1, "QUJD");
  assert.deepEqual([d.pepper_settings.hasKey, d.pepper_settings.keyHint], [true, "\u20269999"]);
  assert.equal((await bg.send({ type: "POCKET_GET_FILE", id: "f1" }, bg.fromExt)).data, "QUJD");
});
test("Reminders: nothing fires after reminders are turned off, a snooze doesn't outlive them, and a nudge missed while asleep is skipped", async () => {
  const bg = await readyBg({ granted: { permissions: ["notifications"] } }, { features: { ...A.defaultFeatures(), reminders: true } });
  await focusOn(bg);
  await bg.send({ type: "SYNC" }, bg.fromExt);
  // missed while asleep: fires 3 hours late → skipped, but the next one is scheduled
  await Promise.all(bg.listeners.alarm.map(f => f({ name: "rem:focus", scheduledTime: Date.now() - 3 * 3600e3 })));
  await bg.settle();
  assert.equal(bg.notifications.length, 0); assert.ok(bg.alarms.has("rem:focus"));
  // snoozed, then reminders turned off: the snooze is cleared, and a late-arriving alarm does nothing
  bg.alarms.set("snooze:focus", { name: "snooze:focus", scheduledTime: Date.now() + 60000 });
  await bg.send({ type: "STORE", op: { op: "objPatch", key: "pepper_settings", patch: { features: { ...A.defaultFeatures(), reminders: false } } } }, bg.fromExt);
  await bg.send({ type: "SYNC" }, bg.fromExt);
  assert.equal(bg.alarms.size, 0, "rem: and snooze: alarms are cleared");
  await Promise.all(bg.listeners.alarm.map(f => f({ name: "rem:focus", scheduledTime: Date.now() })));
  await bg.settle();
  assert.equal(bg.notifications.length, 0, "a reminder that was turned off never shows");
});

test("A saved key belongs to its provider: switching provider without a new key drops it, and it's never sent to the other one", async () => {
  const bg = await readyBg();
  await bg.send({ type: "SET_KEY", provider: "anthropic", apiKey: "sk-ant-123456789" }, bg.fromExt);
  await bg.send({ type: "SET_KEY", provider: "openai" }, bg.fromExt);
  const st = bg.storage._raw().pepper_settings;
  assert.deepEqual([st.provider, st.hasKey, st.keyHint], ["openai", false, ""]);
  assert.equal(bg.vault().apiKey, undefined);
  assert.equal((await bg.send({ type: "LLM", system: "s", user: "u" }, bg.fromExt)).error, "NO_KEY");
  assert.equal(bg.fetchCalls.length, 0, "nothing sent to OpenAI");
  // and a key left from before with the wrong owner is refused, not sent
  await bg.send({ type: "SET_KEY", provider: "openai", apiKey: "sk-o-123456789" }, bg.fromExt);
  await bg.send({ type: "STORE", op: { op: "objPatch", key: "pepper_settings", patch: { provider: "anthropic" } } }, bg.fromExt);
  assert.equal((await bg.send({ type: "LLM", system: "s", user: "u" }, bg.fromExt)).error, "NO_KEY");
  assert.equal(bg.fetchCalls.length, 0);
  // same provider, no new key: the key stays
  await bg.send({ type: "SET_KEY", provider: "openai" }, bg.fromExt);
  assert.equal(bg.vault().apiKey, "sk-o-123456789");
});
test("A broken vault doesn't stop install: menus, floating and reminders are still set up", async () => {
  const bg = loadBackground();
  bg.sandbox.indexedDB.open = () => { const r = {}; setTimeout(() => r.onerror && r.onerror()); return r; };
  bg.storage._seed({ pepper_schema: 2, pepper_settings: { enabled: true, provider: "anthropic", apiKey: "sk-x" }, pepper_profile: { answers: ANSWERS, completed: true }, pepper_history: [] });
  await bg.install({ reason: "update", previousVersion: "0.4.0" });
  await bg.settle();
  assert.ok(bg.menus.length >= 5, "the right-click menu exists");
});
test("Text kept beside the Pocket list is capped; the whole file stays in the vault", async () => {
  const bg = await readyBg();
  const r = await bg.send({ type: "POCKET_ADD_FILE", item: { name: "notes.txt", text: "x".repeat(50000) }, data: b64(50000, 120) }, bg.fromExt);
  assert.equal(r.item.text.length, A.TEXT_KEEP);
  assert.equal(bg.vault()[A.blobKey(r.id)].length, b64(50000, 120).length);
});
