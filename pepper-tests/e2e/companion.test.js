/* v0.4 end-to-end: mandatory onboarding, keep floating, the writing helper,
   hand-offs to AI sites, the Pocket (files, snippets, drag), filling a job form,
   hiding Pepper on a site, summoning it anywhere, and the new pages.
   Runs on a test copy with an open shadow root and with the optional
   permissions (all sites, notifications) already granted, because a test
   can't click the browser's permission prompt.
   Run: node --test e2e/companion.test.js   (PEPPER_BROWSER=brave|msedge to switch) */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { launch, adopt } = require("./harness.js");
const SHOTS = path.join(__dirname, "shots");
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000, step = 100) {
  const t0 = Date.now(); let v;
  while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await wait(step); }
  return v;
}
const P = (p, sel) => p.locator("#pepper-host").locator(sel);
const hostWidth = (p) => p.evaluate(() => { const h = document.getElementById("pepper-host"); return h ? h.getBoundingClientRect().width : -1; });
const boxText = (p, sel) => p.evaluate((s) => { const b = document.querySelector(s); return !b ? "" : b.tagName === "TEXTAREA" ? b.value : b.innerText; }, sel).catch(() => "");
// Open or close the panel explicitly, so one failed step can't flip the next one.
async function openP(p, tab) { if (!(await P(p, "#panel").isVisible())) await P(p, "#orb").click(); await P(p, "#panel").waitFor({ state: "visible" }); if (tab) await P(p, `.tab[data-tab="${tab}"]`).click(); }
async function closeP(p) { await wait(150); if (await P(p, "#panel").isVisible()) await P(p, "#close").click({ timeout: 2000 }).catch(() => {}); }

test("Pepper v0.4 companion", { timeout: 300000 }, async (t) => {
  let apiCalls = [];
  const { ctx, storage, sw, extId, browser } = await launch({ open: true, grant: ["all", "notifications"], onApi: async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    apiCalls.push(body);
    const text = /writing assistant/.test(body.system || "") ? (/five related/.test(body.system) ? "1. **Async rituals**: keeps teams in sync." : "Remote work helps many teams focus, because fewer interruptions leave longer blocks for deep work.")
      : "ROLE\nA\n\nCONTEXT\nB\n\nTASK\nC\n\nCONSTRAINTS\nD\n\nOUTPUT FORMAT\nE\n\nSUCCESS CRITERIA\nF\n===ASSUMPTIONS===\n- none";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ content: [{ type: "text", text }] }) });
  } });
  const base = `chrome-extension://${extId}/`;
  const errors = [];
  const watch = (p) => p.on("pageerror", e => errors.push(p.url() + ": " + e.message));
  try {
    await t.test("Before setup, the panel is a friendly gate that leads to onboarding", async () => {
      const gpt = await ctx.newPage(); watch(gpt); await gpt.goto("https://chatgpt.com/"); await gpt.waitForTimeout(1000);
      await P(gpt, "#orb").click();
      assert.equal(await P(gpt, "#gate").isVisible(), true);
      assert.equal(await P(gpt, "#raw").isVisible(), false, "no prompt writing before setup");
      assert.equal(await P(gpt, "#tabs").isVisible(), false);
      await wait(400); await gpt.screenshot({ path: path.join(SHOTS, "v04-gate.png") });
      const [ob] = await Promise.all([ctx.waitForEvent("page"), P(gpt, "#gateGo").click()]);
      await ob.waitForLoadState();
      assert.match(ob.url(), /onboarding\.html$/);
      await ob.close(); await gpt.close();
    });

    await t.test("Onboarding: one question at a time, required answers can't be skipped, choices saved", async () => {
      const ob = await ctx.newPage(); watch(ob); await ob.goto(base + "onboarding.html"); await ob.waitForTimeout(400);
      await ob.screenshot({ path: path.join(SHOTS, "v04-onboarding-1.png") });
      await ob.click("#next"); // welcome → you
      await ob.click("#next");
      assert.match(await ob.textContent("#err"), /call you/, "name is required");
      await ob.fill("#name", "Maya"); await ob.fill("#role", "CS grad student"); await ob.click("#next");
      await ob.click("#next"); assert.match(await ob.textContent("#err"), /at least one/);
      await ob.click('#sites .card[data-n="Claude"]'); await ob.click('#sites .card[data-n="ChatGPT"]');
      // cards stay in their fixed order (ChatGPT, Claude, …); the badge shows the order Maya tapped them
      assert.deepEqual(await ob.locator("#sites .card.on .rank").allTextContents(), ["2", "1"]);
      await ob.screenshot({ path: path.join(SHOTS, "v04-onboarding-sites.png") });
      await ob.click("#next");
      await ob.click('#uses .chip[data-u="Job search"]'); await ob.click('#uses .chip[data-u="Writing"]'); await ob.click("#next");
      await ob.click('#focus .card[data-v="morning"]'); await ob.check("#nudge"); await ob.click("#next");
      await ob.click('#float .card[data-v="ai"]'); await ob.click("#next");
      await ob.screenshot({ path: path.join(SHOTS, "v04-onboarding-powers.png") });
      await ob.check('#powers input[data-f="autofill"]'); await ob.check("#learn"); await ob.click("#next");
      await ob.fill('#details input[data-d="email"]', "maya@example.com"); await ob.click("#next");
      assert.equal(await ob.textContent("#next"), "Finish", "no question about which AI: one is on already");
      await ob.locator('[data-step="done"]').waitFor({ state: "visible" });
      assert.equal(await ob.textContent("#doneTitle"), "You're all set, Maya!");
      assert.deepEqual(await ob.locator("#goSites a").allTextContents(), ["Open Claude", "Open ChatGPT"]);
      await ob.screenshot({ path: path.join(SHOTS, "v04-onboarding-done.png") });
      const s = await storage.all();
      assert.equal(s.pepper_profile.completed, true);
      assert.deepEqual(s.pepper_profile.answers.q1, ["Claude", "ChatGPT"]);
      assert.ok(!("q5" in s.pepper_profile.answers) && !("q6" in s.pepper_profile.answers), "how Pepper should act isn't asked up front");
      assert.equal(s.pepper_settings.provider, "auto", "an AI is on without asking");
      await storage.patch("pepper_settings", { provider: "none" }); // the next checks are about Pepper with no AI
      assert.equal(s.pepper_profile.answers.focus, "morning");
      assert.equal(s.pepper_settings.floating, "ai");
      assert.equal(s.pepper_settings.features.autofill, true);
      assert.equal(s.pepper_settings.features.reminders, true);
      assert.equal(s.pepper_details.email, "maya@example.com");
      assert.equal(s.pepper_details.fullName, "Maya", "name carried over");
      assert.deepEqual(Object.entries(s.pepper_consent).filter(([, v]) => v.learning).map(([k]) => k).sort(), ["chatgpt", "claude"], "learning only on the sites picked");
      const alarms = await until(() => sw.evaluate(() => chrome.alarms.getAll().then(a => a.map(x => x.name))).then(n => n.length ? n : null));
      assert.deepEqual(alarms, ["rem:focus"], "the focus nudge is scheduled");
      await ob.close();
    });

    await t.test("After setup, Pepper opens on Write with a balanced approach and offers to connect an AI", async () => {
      const gpt = await ctx.newPage(); watch(gpt); await gpt.goto("https://chatgpt.com/"); await gpt.waitForTimeout(1000);
      await P(gpt, "#orb").click();
      assert.deepEqual(await P(gpt, ".tab:visible").allTextContents(), ["Write", "Fix", "Pocket", "Fill"]);
      assert.equal(await P(gpt, '#lenses .lens[aria-checked="true"]').textContent(), "Balanced");
      await until(async () => /No AI is on/.test(await P(gpt, "#setupNote").textContent()), 3000);
      await gpt.close();
    });

    let page;
    await t.test("Keep floating: on every site once chosen (with permission), gone again when switched back", async () => {
      await storage.patch("pepper_settings", { floating: "everywhere" });
      await sw.evaluate(() => syncFloating());
      page = await ctx.newPage(); watch(page); await page.goto("https://example.org/"); await page.waitForTimeout(1000);
      assert.ok(await hostWidth(page) > 0, "Pepper floats on an ordinary page");
      await storage.patch("pepper_settings", { floating: "ai" }); await sw.evaluate(() => syncFloating());
      await until(async () => (await hostWidth(page)) === 0, 3000);
      assert.equal(await hostWidth(page), 0, "hidden on the page that was already open, too");
      const p2 = await ctx.newPage(); await p2.goto("https://example.org/?2"); await p2.waitForTimeout(800);
      assert.equal(await hostWidth(p2), -1, "not injected when floating is AI-sites-only");
      await p2.close();
      await storage.patch("pepper_settings", { floating: "everywhere" }); await sw.evaluate(() => syncFloating());
      await until(async () => (await hostWidth(page)) > 0, 3000);
    });

    await t.test("Keyboard and placement: Enter opens Pepper; near the top of the screen the panel opens downwards and stays on screen", async () => {
      await P(page, "#orb").focus(); await page.keyboard.press("Enter");
      await P(page, "#panel").waitFor({ state: "visible", timeout: 3000 });
      await page.keyboard.press("Escape");
      await until(async () => !(await P(page, "#panel").isVisible()), 2000);
      await storage.patch("pepper_ui", { "example.org": { pos: { side: "right", x: 18, bottom: 760 } } });
      await page.reload(); await page.waitForTimeout(900);
      await P(page, "#orb").click();
      const box = await P(page, "#panel").boundingBox();
      assert.ok(box.y >= 0 && box.y + box.height <= 860 + 1, `panel inside the screen (top ${Math.round(box.y)}, bottom ${Math.round(box.y + box.height)})`);
      assert.ok(await P(page, "#close").isVisible());
      await P(page, "#close").click();
      try {
        await page.setViewportSize({ width: 1280, height: 560 });
        await storage.patch("pepper_ui", { "example.org": { pos: { side: "right", x: 18, bottom: 300 } } });
        await page.reload(); await page.waitForTimeout(900);
        await P(page, "#orb").click();
        const small = await P(page, "#panel").boundingBox();
        assert.ok(small.y >= 0 && small.y + small.height <= 561, `panel inside a 560px window (top ${Math.round(small.y)}, bottom ${Math.round(small.y + small.height)})`);
        await P(page, '.tab[data-tab="pocket"]').click();
        await P(page, "#pSavePage").click();
        await P(page, "#toast").waitFor({ state: "visible", timeout: 3000 });
        const t = await P(page, "#toast").boundingBox();
        assert.ok(t.y >= 0 && t.y + t.height <= 561, `the toast stays on screen while the panel is open (top ${Math.round(t.y)})`);
      } finally {
        await closeP(page);
        await page.setViewportSize({ width: 1280, height: 860 });
        await storage.patch("pepper_ui", { "example.org": {} }); await page.reload(); await page.waitForTimeout(900);
      }
    });

    await t.test("Writing helper: select text in a field, Pepper's pill appears, Fix corrects it offline and Replace puts it back", async () => {
      await page.evaluate(() => { const n = document.getElementById("notes"); n.focus(); n.select(); });
      await P(page, "#pill").waitFor({ state: "visible", timeout: 4000 });
      const near = async (sel) => { const pb = await P(page, "#pill").boundingBox(), tb = await page.locator(sel).boundingBox();
        return pb.y >= tb.y - 50 && pb.y <= tb.y + tb.height + 50 && pb.x + pb.width > tb.x && pb.x < tb.x + tb.width; };
      assert.ok(await near("#notes"), "the pill sits by the selected text, not in a corner");
      await wait(300); await page.screenshot({ path: path.join(SHOTS, "v04-selection-pill.png") });
      await P(page, "#pillFix").click();
      assert.equal(await P(page, "#fixIn").inputValue(), "i think teh plan is  good ,but i dont know");
      await P(page, '#fixKinds .kind[data-k="fix"]').click();
      assert.equal(await P(page, "#fixText").textContent(), "I think the plan is good, but I don't know");
      assert.match(await P(page, "#fixChanges").textContent(), /teh.*the/);
      await page.screenshot({ path: path.join(SHOTS, "v04-fix.png") });
      await P(page, "#fixReplace").click();
      assert.equal(await page.inputValue("#notes"), "I think the plan is good, but I don't know");
    });

    await t.test("Writing helper without a key: Similar ideas becomes a ready prompt sent to Maya's first AI (Claude), never sent", async () => {
      await closeP(page);
      await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById("para")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
      await P(page, "#pill").waitFor({ state: "visible", timeout: 4000 });
      { const pb = await P(page, "#pill").boundingBox(), tb = await page.locator("#para").boundingBox();
        assert.ok(pb.y >= tb.y - 50 && pb.y <= tb.y + tb.height + 50, "the pill sits by the selected paragraph"); }
      await P(page, "#pillFix").click();
      await P(page, '#fixKinds .kind[data-k="similar"]').click();
      assert.equal(await P(page, "#fixSend").textContent(), "Send to Claude");
      assert.equal(await P(page, "#fixReplace").isVisible(), false, "page text can't be replaced");
      const [cl] = await Promise.all([ctx.waitForEvent("page"), P(page, "#fixSend").click()]);
      await adopt(cl);
      const txt = await until(async () => { const v = await boxText(cl, "div.ProseMirror"); return /Suggest five related ideas/.test(v) ? v : null; });
      assert.match(txt, /Remote work boosts focus/);
      assert.equal(await cl.evaluate(() => window.__sent.length), 0, "Pepper never sends");
      await cl.close();
    });

    await t.test("Writing helper with a key: Improve and Similar ideas come from the model, with the text as data", async () => {
      await closeP(page);
      await storage.setKey("anthropic", "sk-ant-test"); await wait(300);
      await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById("para")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
      await P(page, "#pill").waitFor({ state: "visible", timeout: 4000 });
      await P(page, "#pillFix").click();
      apiCalls = [];
      await P(page, '#fixKinds .kind[data-k="improve"]').click();
      await until(async () => (await P(page, "#fixMeta").textContent()) === "From your model");
      assert.match(await P(page, "#fixText").textContent(), /fewer interruptions/);
      assert.match(apiCalls[0].messages[0].content, /^<text>\nRemote work boosts focus/);
      assert.ok(!apiCalls[0].system.includes("Remote work boosts"), "the text is not in the instructions");
      await storage.setKey("none"); await wait(300);
      await P(page, "#close").click();
    });

    await t.test("Write on any page: the page rides along as data and the prompt is handed to Claude's box", async () => {
      await closeP(page);
      await page.evaluate(() => getSelection().removeAllRanges());
      await openP(page, "prompt");
      if (await P(page, "#result").isVisible()) await P(page, "#back").click();
      await P(page, "#raw").fill("summarize this for my manager");
      await P(page, "#usePage").check();
      await P(page, "#go").click(); await P(page, "#result").waitFor({ state: "visible" });
      assert.equal(await P(page, "#insert").textContent(), "Send to Claude");
      assert.match(await P(page, "#filesUsed").textContent(), /page: Remote work notes/);
      const [cl] = await Promise.all([ctx.waitForEvent("page"), P(page, "#insert").click()]);
      await adopt(cl);
      const txt = await until(async () => { const v = await boxText(cl, "div.ProseMirror"); return /SOURCE FILES/.test(v) ? v : null; });
      assert.match(txt, /^Summarize this for my manager/);
      assert.match(txt, /SOURCE FILES[\s\S]*<file name="page: Remote work notes">[\s\S]*URL: https:\/\/example\.org\//);
      assert.equal(await cl.evaluate(() => window.__sent.length), 0);
      await cl.close();
    });

    let resumeId;
    await t.test("Pocket: keep a file from the floating Pepper, save the page, insert a template with your details", async () => {
      await openP(page, "pocket");
      await P(page, "#pFile").setInputFiles({ name: "Maya_Resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fake resume bytes") });
      const item = await until(async () => ((await storage.get("pepper_pocket")) || []).find(i => i.name === "Maya_Resume.pdf"));
      resumeId = item.id;
      assert.equal(item.role, "resume", "named like a resume, and the first one");
      assert.equal(item.size, 26);
      assert.equal(await sw.evaluate((k) => Vault.get(k), "pepper_blob_" + item.id), Buffer.from("%PDF-1.4 fake resume bytes").toString("base64"), "the bytes are in the worker's vault");
      assert.equal(await storage.get("pepper_blob_" + item.id), undefined, "and not in storage web pages' scripts can read");
      await P(page, "#pFile").setInputFiles({ name: "notes.html", mimeType: "text/html", buffer: Buffer.from("<script>window.__ran=1</script>hi") });
      const html = await until(async () => ((await storage.get("pepper_pocket")) || []).find(i => i.name === "notes.html"));
      await P(page, '.filters button[data-f="file"]').click();
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), P(page, `.pi[data-id="${html.id}"] button[data-a="open"]`).click()]);
      assert.equal(dl.suggestedFilename(), "notes.html", "HTML is downloaded, never opened as this site");
      assert.equal(await page.evaluate(() => window.__ran), undefined);
      await P(page, '.filters button[data-f="all"]').click();
      await P(page, "#pSavePage").click();
      await until(async () => (await storage.get("pepper_pocket")).some(i => i.kind === "link" && i.url === "https://example.org/"));
      await storage.patch("pepper_details", { fullName: "Maya Rao" });
      const list = await storage.get("pepper_pocket");
      await storage.set({ pepper_pocket: [{ id: "s1", kind: "snippet", title: "Intro", text: "Hi, I'm {{fullName}} ({{email}})." }, ...list] });
      await closeP(page);
      await page.click("#notes"); await page.evaluate(() => { const n = document.getElementById("notes"); n.value = ""; });
      await openP(page, "pocket");
      await P(page, '.pi[data-id="s1"] button[data-a="insert"]').click();
      assert.equal(await page.inputValue("#notes"), "Hi, I'm Maya Rao (maya@example.com).");
      await openP(page, "pocket");
      await wait(400); await page.screenshot({ path: path.join(SHOTS, "v04-pocket.png") });
    });

    await t.test("Pocket: dragging a file out of Pepper carries the real file, and the page's drop zone receives it", async () => {
      // Playwright's drag can't carry files made in JavaScript, so this runs Pepper's own dragstart
      // handler with a DataTransfer, then drops that same DataTransfer on the page, as the browser would.
      await openP(page, "pocket");
      const row = P(page, `.pi[data-id="${resumeId}"]`);
      await row.hover(); await wait(400); // Pepper reads the file when you point at it, so a drag can start at once
      const dropped = await row.evaluate((el) => {
        const dt = new DataTransfer();
        el.dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true, cancelable: true, composed: true }));
        const dz = document.getElementById("dz");
        dz.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
        return { files: [...dt.files].map(f => f.name + ":" + f.size + ":" + f.type), page: window.__dropped };
      });
      assert.deepEqual(dropped.files, ["Maya_Resume.pdf:26:application/pdf"]);
      assert.deepEqual(dropped.page, ["Maya_Resume.pdf:26"]);
      const link = await P(page, ".pi").filter({ hasText: "Remote work notes" }).first().evaluate((el) => {
        const dt = new DataTransfer(); el.dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true, cancelable: true, composed: true }));
        return dt.getData("text/uri-list");
      });
      assert.equal(link, "https://example.org/", "links drag as links");
      await closeP(page);
    });

    await t.test("Fill: on a job application Pepper offers to help, fills only empty fields, attaches the resume, never submits", async () => {
      // Values for every hidden trick on the page, so a leak would show up as a filled field.
      await storage.patch("pepper_details", { fullName: "Maya Rao", phone: "617-555-0100", linkedin: "https://linkedin.com/in/maya", country: "USA", city: "Boston",
        address: "1 Main St", postal: "02115", state: "MA", pronouns: "she/her" });
      const job = await ctx.newPage(); watch(job); await job.goto("https://boards.greenhouse.io/acme/jobs/1"); await job.waitForTimeout(800);
      await P(job, "#hint").waitFor({ state: "visible", timeout: 4000 });
      assert.match(await P(job, "#hintText").textContent(), /application\. I can fill \d+ fields? and attach your resume/);
      await job.screenshot({ path: path.join(SHOTS, "v04-job-hint.png") });
      await P(job, "#hintBtns button").filter({ hasText: "Fill it" }).click();
      await P(job, '[data-view="fill"]').waitFor({ state: "visible" });
      assert.match(await P(job, "#ctxChip").textContent(), /Form · \d+ fields I can fill/);
      await wait(400); await job.screenshot({ path: path.join(SHOTS, "v04-fill.png") });
      await P(job, "#fillGo").click();
      const v = await job.evaluate(() => Object.fromEntries(["first_name", "last_name", "email", "phone", "li", "country", "city", "pw", "why", "addr", "ghost", "hid", "t1", "t2", "t3", "t4", "t5"].map(id => [id, document.getElementById(id).value])));
      assert.deepEqual(v, { first_name: "Maya", last_name: "Rao", email: "maya@example.com", phone: "617-555-0100", li: "https://linkedin.com/in/maya", country: "US", city: "Already typed", pw: "", why: "",
        addr: "", ghost: "", hid: "", t1: "", t2: "", t3: "", t4: "", t5: "" },
        "fields a person can't see stay empty: off-screen, 1px, display:none, a 2% transparent container, a 1x1 clipping box, clip-path, covered, transparent text");
      assert.doesNotMatch(await P(job, "#fillBody").textContent(), /Street address/, "and aren't even listed");
      await P(job, '#fillBody button[data-attach="0"]').click();
      await until(() => job.evaluate(() => window.__changes.resume), 3000);
      assert.equal(await job.evaluate(() => window.__changes.resume), "Maya_Resume.pdf", "the site saw the file arrive (Pepper said: " + await P(job, "#toast").textContent() + ")");
      assert.equal(await job.evaluate(() => window.__submitted), 0, "never submits");
      await job.close();
    });

    await t.test("Hide on this site: the peppercorn goes away here and stays away after a reload", async () => {
      await openP(page);
      await P(page, "#lsBtn").click();
      await until(async () => (await hostWidth(page)) === 0, 3000);
      assert.equal(await hostWidth(page), 0);
      await page.reload(); await page.waitForTimeout(1000);
      assert.equal(await hostWidth(page), 0, "still hidden");
      assert.equal((await storage.get("pepper_ui"))["example.org"].hidden, true);
    });

    await t.test("Summon anywhere: with Pepper only on AI sites, the shortcut path injects it into the current page", async () => {
      await storage.patch("pepper_settings", { floating: "ai" }); await sw.evaluate(() => syncFloating());
      const plain = await ctx.newPage(); watch(plain); await plain.goto("https://example.org/?summon"); await plain.waitForTimeout(600);
      assert.equal(await hostWidth(plain), -1);
      await plain.bringToFront();
      await sw.evaluate(async () => { const [tab] = await chrome.tabs.query({ url: "https://example.org/?summon" }); return summon(tab, { type: "OPEN_PANEL", tab: "pocket" }); });
      await P(plain, "#panel").waitFor({ state: "visible", timeout: 4000 });
      assert.equal(await P(plain, '.tab[aria-selected="true"]').textContent(), "Pocket");
      await plain.close();
    });

    await t.test("Pages: dashboard sections, popup and privacy render with no errors; dashboard shows what onboarding set", async () => {
      const d = await ctx.newPage(); watch(d); await d.setViewportSize({ width: 1280, height: 900 });
      await d.goto(base + "dashboard.html#home"); await d.waitForTimeout(500);
      assert.match(await d.textContent("#hello"), /, Maya$/);
      await d.goto(base + "dashboard.html#pocket"); await d.waitForTimeout(400);
      assert.match(await d.textContent("#fileList"), /Maya_Resume\.pdf[\s\S]*Resume/);
      await d.screenshot({ path: path.join(SHOTS, "v04-dashboard-pocket.png"), fullPage: true });
      await d.goto(base + "dashboard.html#reminders"); await d.waitForTimeout(400);
      assert.equal(await d.locator(".rem").count(), 1);
      assert.equal(await d.inputValue('.rem input[type="time"]'), "09:30");
      await d.screenshot({ path: path.join(SHOTS, "v04-dashboard-reminders.png"), fullPage: true });
      await d.goto(base + "dashboard.html#you"); await d.waitForTimeout(400);
      await d.screenshot({ path: path.join(SHOTS, "v04-dashboard-you.png"), fullPage: true });
      await d.goto(base + "dashboard.html#settings"); await d.waitForTimeout(400);
      assert.equal(await d.isChecked('#floatChoice input[value="ai"]'), true);
      assert.match(await d.textContent("#hiddenSites"), /example\.org/);
      await d.screenshot({ path: path.join(SHOTS, "v04-dashboard-settings.png"), fullPage: true });
      await d.setViewportSize({ width: 340, height: 520 }); await d.goto(base + "popup.html"); await d.waitForTimeout(400);
      assert.equal(await d.textContent("#hello"), "Hi, Maya");
      await d.screenshot({ path: path.join(SHOTS, "v04-popup.png"), fullPage: true });
      await d.close();
      assert.deepEqual(errors, [], "no script errors on any page");
    });
    console.log("    browser:", browser);
  } finally { await ctx.close(); }
});
