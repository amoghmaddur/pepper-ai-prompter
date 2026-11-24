/* End-to-end tests in a real Chromium with the extension loaded, against the
   local mock sites in mock-sites.js. Run: node --test e2e/browser.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { launch, IS_EDGE } = require("./harness.js");
const SHOTS = path.join(__dirname, "shots");
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000, step = 100) {
  const t0 = Date.now(); let v;
  while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await wait(step); }
  return v;
}
const hostBox = (p) => p.evaluate(() => { const h = document.getElementById("pepper-host"); if (!h) return null; const r = h.getBoundingClientRect(); return { w: r.width, h: r.height }; });

/* ---------------- real build (closed shadow root) ---------------- */
test("real build", { timeout: 120000 }, async (t) => {
  const { ctx, storage } = await launch();
  try {
    const gpt = await ctx.newPage(); await gpt.goto("https://chatgpt.com/"); await gpt.waitForTimeout(1200);

    await t.test("C3 shadow root is closed: the page sees null", async () => {
      assert.equal(await gpt.evaluate(() => !!document.getElementById("pepper-host")), true);
      assert.equal(await gpt.evaluate(() => document.getElementById("pepper-host").shadowRoot), null);
      const box = await hostBox(gpt); assert.ok(box.w > 0, "orb visible");
    });

    await t.test("C2 not injected on a site outside the five (poe.com)", async () => {
      const poe = await ctx.newPage(); await poe.goto("https://poe.com/"); await poe.waitForTimeout(1000);
      assert.equal(await poe.evaluate(() => !!document.getElementById("pepper-host")), false);
      await poe.close();
    });

    await t.test("N5 fresh install: 3 sends on ChatGPT (Enter) and 3 on Copilot (click) store nothing", async () => {
      const cop = await ctx.newPage(); await cop.goto("https://copilot.microsoft.com/"); await cop.waitForTimeout(1000);
      for (let i = 0; i < 3; i++) {
        await gpt.click("#prompt-textarea"); await gpt.keyboard.type("hello number " + i); await gpt.keyboard.press("Enter");
        await cop.fill("#userInput", "copilot question " + i); await cop.click('button[aria-label="Submit message"]');
        await wait(400);
      }
      await wait(2500);
      assert.equal((await gpt.evaluate(() => window.__sent.length)), 3);
      assert.equal((await cop.evaluate(() => window.__sent.length)), 3);
      assert.deepEqual(await storage.get("pepper_history"), []);
      await cop.close();
    });

    await t.test("v0.4 before setup: learning on still records nothing; setup is required first", async () => {
      await storage.consent("chatgpt", true); await wait(300);
      await gpt.click("#prompt-textarea"); await gpt.keyboard.type("not set up yet"); await gpt.keyboard.press("Enter");
      await wait(2500);
      assert.deepEqual(await storage.get("pepper_history"), []);
      await storage.completeSetup(); await wait(400);
    });

    await t.test("M6 learning on for ChatGPT: one send records the NEW reply, not the old one", async () => {
      await storage.consent("chatgpt", true);
      await gpt.click("#prompt-textarea"); await gpt.keyboard.type("what is a good name for a cat"); await gpt.keyboard.press("Enter");
      const h = await until(async () => { const x = await storage.get("pepper_history"); return x && x.length && x[0].response ? x : null; }, 10000);
      assert.equal(h.length, 1);
      assert.equal(h[0].prompt, "what is a good name for a cat");
      assert.match(h[0].response, /^NEW REPLY to: what is a good name for a cat/);
      assert.ok(!h[0].response.includes("OLD reply"));
      assert.equal(h[0].assisted, false);
      assert.equal(h[0].site, "chatgpt.com");
      assert.equal(h[0].partial, false);
    });

    await t.test("C9 clicking 'Send feedback' creates no record", async () => {
      // The rating card is showing now; a real click must still reach the site's button next to it.
      await gpt.click("#feedback", { timeout: 3000 }); await gpt.click("#feedback", { timeout: 3000 }); await wait(1500);
      assert.equal((await storage.get("pepper_history")).length, 1);
      assert.equal(await gpt.evaluate(() => window.__feedback), 2);
    });

    await t.test("M5 revoking learning mid-reply discards the pending record", async () => {
      await gpt.evaluate(() => { window.__streamMs = 250; });
      await gpt.click("#prompt-textarea"); await gpt.keyboard.type("slow reply please"); await gpt.keyboard.press("Enter");
      await wait(500);
      await storage.consent("chatgpt", false);
      await wait(6000);
      assert.equal((await storage.get("pepper_history")).length, 1, "still only the earlier record");
      await gpt.evaluate(() => { window.__streamMs = 60; });
    });

    await t.test("C1 global switch off: orb gone, nothing recorded even with learning on", async () => {
      await storage.consent("chatgpt", true);
      await storage.patch("pepper_settings", { enabled: false });
      await wait(400);
      const box = await hostBox(gpt); assert.equal(box.w, 0, "host collapses when hidden");
      for (let i = 0; i < 3; i++) { await gpt.click("#prompt-textarea"); await gpt.keyboard.type("off " + i); await gpt.keyboard.press("Enter"); await wait(300); }
      await wait(3000);
      assert.equal((await storage.get("pepper_history")).length, 1);
      await storage.patch("pepper_settings", { enabled: true }); await wait(400);
      assert.ok((await hostBox(gpt)).w > 0, "orb back");
    });
    await gpt.screenshot({ path: path.join(SHOTS, "site-chatgpt-orb.png") });
  } finally { await ctx.close(); }
});

/* ---------------- open-root copy: drive the panel ---------------- */
test("panel flows (open-root test copy)", { timeout: 180000 }, async (t) => {
  let apiCalls = [], apiDelay = 0;
  let apiReply = "ROLE\nYou are a career coach.\n\nCONTEXT\nI'm a graduate student in software.\n\nTASK\nWrite a cover letter for the Stripe new-grad SWE role.\n\nCONSTRAINTS\n- Professional tone.\n\nOUTPUT FORMAT\nThree paragraphs.\n\nSUCCESS CRITERIA\n- A recruiter sees the fit fast.\n===ASSUMPTIONS===\n- I am applying for roles in the United States.\n- I graduate in May 2027.";
  const { ctx, storage, sw, extId } = await launch({ open: true, onApi: async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    apiCalls.push({ url: route.request().url(), headers: route.request().headers(), body });
    if (apiDelay) await new Promise(r => setTimeout(r, apiDelay));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ content: [{ type: "text", text: apiReply }] }) });
  } });
  const P = (p, sel) => p.locator("#pepper-host").locator(sel);
  try {
    await storage.completeSetup({ q3: "graduate student", q4: "software", q6: "Professional", q7: "Beginner", q13: "no em dashes", q14: "recruiters", q15: "Light touch" });
    await storage.consent("chatgpt", true); await storage.consent("claude", true); await storage.consent("copilot", true);
    const gpt = await ctx.newPage(); await gpt.goto("https://chatgpt.com/"); await gpt.waitForTimeout(1200);

    await t.test("compose without an AI: Pepper's own writer gives the request its expert, the details and your background", async () => {
      await P(gpt, "#orb").click();
      await gpt.waitForTimeout(300);
      await gpt.screenshot({ path: path.join(SHOTS, "panel-open.png") }); // what the panel shows first (kept by CI)
      await P(gpt, "#raw").fill("write a cover letter for the Stripe new-grad SWE role");
      await gpt.screenshot({ path: path.join(SHOTS, "panel-compose.png") });
      await P(gpt, "#go").click();
      await P(gpt, "#result").waitFor({ state: "visible" });
      assert.match(await P(gpt, "#engine").textContent(), /^Improved by Pepper on this device\./);
      const body = await P(gpt, "#prompt").innerText();
      assert.match(body, /^You're an experienced recruiter and career coach in software\.\nWrite a cover letter for the Stripe new-grad SWE role\./);
      assert.match(body, /About me: I'm a graduate student in software\./);
      assert.match(body, /no em dashes/);
      assert.equal(await P(gpt, "#prompt .sec-l").count(), 0, "a plain prompt, not six boxes");
      assert.deepEqual(await P(gpt, '#tools button[data-t]:visible').allTextContents(), ["Shorter", "Longer"], "formal and casual need an AI");
      await gpt.screenshot({ path: path.join(SHOTS, "panel-result-offline.png") });
    });

    await t.test("Insert puts the prompt in ChatGPT's box without sending; user's send is attributed as assisted", async () => {
      await P(gpt, "#insert").click();
      await wait(300);
      const boxText = await gpt.evaluate(() => document.getElementById("prompt-textarea").innerText);
      assert.match(boxText, /^You're an experienced recruiter[\s\S]*Write a cover letter for the Stripe new-grad SWE role\./); assert.match(boxText, /job description/);
      assert.equal(await gpt.evaluate(() => window.__sent.length), 0, "Pepper never sends");
      await gpt.click("#prompt-textarea"); await gpt.keyboard.press("End"); await gpt.keyboard.press("Enter");
      const h = await until(async () => { const x = await storage.get("pepper_history"); return x && x[0] && x[0].response ? x : null; });
      assert.equal(h[0].assisted, true);
      assert.ok(h[0].similarity >= 0.95, String(h[0].similarity));
      assert.equal(h[0].raw, "write a cover letter for the Stripe new-grad SWE role");
      assert.equal(h[0].lens, "auto");
    });

    await t.test("rating card appears after the reply and stores the stars", async () => {
      await P(gpt, "#rate").waitFor({ state: "visible", timeout: 5000 });
      await gpt.screenshot({ path: path.join(SHOTS, "site-rating-card.png") });
      await P(gpt, '#rate .star[data-n="4"]').click();
      const r = await until(async () => { const x = await storage.get("pepper_history"); return x[0].rating; });
      assert.equal(r, 4);
    });

    await t.test("Claude, Gemini (contenteditable), Perplexity and Copilot (textarea): insert and attribution work", async () => {
      await storage.consent("gemini", true); await storage.consent("perplexity", true);
      for (const [url, boxSel, sendSel] of [["https://claude.ai/", "div.ProseMirror", 'button[aria-label="Send message"]'],
                                            ["https://gemini.google.com/", ".ql-editor", "button.send-button"],
                                            ["https://www.perplexity.ai/", "#ask-input", 'button[data-testid="submit-button"]'],
                                            ["https://copilot.microsoft.com/", "#userInput", 'button[aria-label="Submit message"]']]) {
        const p = await ctx.newPage(); await p.goto(url); await p.waitForTimeout(1200);
        if (IS_EDGE && url.includes("copilot.microsoft.com")) {
          // Edge refuses to inject any extension here, so there is nothing to drive.
          assert.equal(await p.evaluate(() => !!document.getElementById("pepper-host")), false, "Edge blocks extensions on Copilot");
          console.log("    Edge: extensions are blocked on copilot.microsoft.com, so Copilot is checked on Chromium only");
          await p.close(); continue;
        }
        const before = (await storage.get("pepper_history")).length;
        await P(p, "#orb").click();
        await P(p, "#raw").fill("summarize this article for my manager");
        await P(p, "#go").click(); await P(p, "#result").waitFor({ state: "visible" });
        await p.screenshot({ path: path.join(SHOTS, `panel-result-${new URL(url).host.split(".")[0]}.png`) });
        await P(p, "#insert").click(); await wait(300);
        const txt = await p.evaluate((s) => { const b = document.querySelector(s); return b.value != null && b.tagName === "TEXTAREA" ? b.value : b.innerText; }, boxSel);
        assert.match(txt, /^Summarize this article for my manager/, url);
        await p.click(sendSel);
        const h = await until(async () => { const x = await storage.get("pepper_history"); return x.length > before && x[0].response ? x : null; });
        assert.equal(h[0].assisted, true, url); assert.equal(h[0].site, new URL(url).host);
        assert.match(h[0].response, /^NEW REPLY/, url + " captured the new reply");
        assert.equal(await p.evaluate(() => window.__sent.length), 1, url + " sent once, by the site");
        await p.close();
      }
    });

    await t.test("no reachable box: Insert copies instead and says so", async () => {
      await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://chatgpt.com" });
      await gpt.evaluate(() => { const b = document.getElementById("prompt-textarea"); b.style.display = "none"; });
      await P(gpt, "#orb").click();
      if (await P(gpt, "#result").isVisible()) await P(gpt, "#back").click();
      await P(gpt, "#raw").fill("draft a thank you note");
      await P(gpt, "#go").click(); await P(gpt, "#result").waitFor({ state: "visible" });
      await P(gpt, "#insert").click();
      await until(async () => (await P(gpt, "#toast").textContent()) === "Copied — paste it into the box.", 3000);
      assert.equal(await P(gpt, "#toast").textContent(), "Copied — paste it into the box.");
      const clip = await gpt.evaluate(() => navigator.clipboard.readText());
      assert.match(clip, /^Draft a thank you note/);
      await gpt.evaluate(() => { document.getElementById("prompt-textarea").style.display = ""; });
      await gpt.reload(); await gpt.waitForTimeout(1200);
    });

    await t.test("model path: request goes to the provider with files as data; assumptions shown, never inserted", async () => {
      await storage.set({
        pepper_pocket: [{ id: "f1", kind: "file", name: "resume.txt", text: "Built a payments ledger at Acme in Rust.", size: 39, hasBlob: false }],
        pepper_projects: [{ id: "p1", name: "Jobs 2026", type: "Job applications", description: "New-grad SWE roles", fileIds: ["f1"] }],
        pepper_active_project: "p1"
      });
      await storage.setKey("anthropic", "sk-ant-test");
      assert.ok(!JSON.stringify(await storage.get("pepper_settings")).includes("sk-ant-test"), "the key isn't in storage web pages' scripts can read");
      await wait(400);
      await P(gpt, "#orb").click();
      if (await P(gpt, "#result").isVisible()) await P(gpt, "#back").click();
      await P(gpt, "#raw").fill("write a cover letter for the Stripe new-grad SWE role");
      await P(gpt, "#go").click(); await P(gpt, "#result").waitFor({ state: "visible" });
      await until(async () => (await P(gpt, "#engine").textContent()).startsWith("Improved by"));
      assert.equal(apiCalls.length, 1, "one call");
      const call = apiCalls[0];
      assert.equal(new URL(call.url).host, "api.anthropic.com");
      assert.equal(call.headers["x-api-key"], "sk-ant-test");
      assert.ok(!call.body.system.includes("payments ledger"), "file text not in system prompt");
      assert.match(call.body.messages[0].content, /<file name="resume.txt">\nBuilt a payments ledger at Acme in Rust.\n<\/file>/);
      assert.match(call.body.system, /Stay under 250 words/, "Q15 Light tier");
      assert.match(call.body.system, /about to send to ChatGPT/);
      assert.match(call.body.messages[0].content, /<rough>\nwrite a cover letter for the Stripe new-grad SWE role\n<\/rough>/);
      const assume = await P(gpt, "#assume .as input").evaluateAll(els => els.map(e => e.value));
      assert.deepEqual(assume, ["I am applying for roles in the United States.", "I graduate in May 2027."]);
      assert.ok(!(await P(gpt, "#prompt").innerText()).includes("United States"));
      assert.match(await P(gpt, "#filesUsed").textContent(), /resume.txt/);
      await gpt.screenshot({ path: path.join(SHOTS, "panel-result-model.png") });
      // Add one assumption → it lands in CONTEXT; dismiss the other → never inserted
      await P(gpt, '#assume .as[data-i="0"] button[data-a="add"]').click();
      await P(gpt, '#assume .as[data-i="1"] button[data-a="dismiss"]').click();
      await gpt.screenshot({ path: path.join(SHOTS, "panel-assumptions-resolved.png") });
      await gpt.evaluate(() => { document.getElementById("prompt-textarea").innerHTML = ""; });
      await P(gpt, "#insert").click(); await wait(300);
      const boxText = await gpt.evaluate(() => document.getElementById("prompt-textarea").innerText);
      assert.match(boxText, /CONTEXT[\s\S]*I am applying for roles in the United States\.[\s\S]*TASK/);
      assert.ok(!boxText.includes("May 2027"), "dismissed assumption not inserted");
      assert.ok(!boxText.includes("ASSUMPTIONS"));
      assert.match(boxText, /SOURCE FILES[\s\S]*<file name="resume.txt">/, "file text attached as data");
      await gpt.evaluate(() => { document.getElementById("prompt-textarea").innerHTML = ""; });
    });

    await t.test("Improve in place: type in the chat box, one click rewrites it there, Undo puts it back, Alt+Enter works too", async () => {
      apiReply = "I'm a graduate student in software. Give me a 5-day study plan for my algorithms exam, about 2 hours a day, hardest topics first.\n===ASSUMPTIONS===\n- My exam is next week.";
      await storage.set({ pepper_active_project: null });
      const box = gpt.locator("#prompt-textarea");
      const sent = await gpt.evaluate(() => window.__sent.length);
      await box.click(); await gpt.keyboard.type("study plan algos exam");
      await P(gpt, "#imp").waitFor({ state: "visible", timeout: 3000 });
      assert.equal(await P(gpt, "#impText").textContent(), "Improve");
      await gpt.screenshot({ path: path.join(SHOTS, "improve-chip.png") });
      const before = apiCalls.length;
      await P(gpt, "#imp").click();
      await until(async () => (await P(gpt, "#impText").textContent()) === "Undo", 5000);
      assert.equal(apiCalls.length, before + 1, "one call");
      assert.match(apiCalls.at(-1).body.messages[0].content, /<rough>\nstudy plan algos exam\n<\/rough>/);
      assert.match(await box.innerText(), /^I'm a graduate student in software\. Give me a 5-day study plan/);
      assert.ok(!(await box.innerText()).includes("ASSUMPTIONS"), "assumptions never go in the box");
      await gpt.screenshot({ path: path.join(SHOTS, "improve-done.png") });
      await P(gpt, "#imp").click(); // Undo
      await until(async () => (await box.innerText()).trim() === "study plan algos exam", 3000);
      await box.click(); await gpt.keyboard.press("End"); await gpt.keyboard.press("Alt+Enter");
      await until(async () => /^I'm a graduate student/.test(await box.innerText()), 5000);
      assert.equal(await gpt.evaluate(() => window.__sent.length), sent, "Pepper never sends");
      await P(gpt, "#orb").click();
      assert.equal(await P(gpt, "#result").isVisible(), true, "the panel shows what was just improved");
      assert.deepEqual(await P(gpt, "#assume .as input").evaluateAll(els => els.map(e => e.value)), ["My exam is next week."]);
      await P(gpt, "#close").click();
      await gpt.evaluate(() => { document.getElementById("prompt-textarea").innerHTML = ""; });
      await storage.set({ pepper_active_project: "p1" });
    });

    await t.test("A slow AI: Pepper's own draft goes in the box at once, then the AI's version replaces it", async () => {
      apiDelay = 4500;
      apiReply = "Polished by the AI: plan me a 3-day budget trip to Goa.\n===ASSUMPTIONS===\n- none";
      const box = gpt.locator("#prompt-textarea");
      await gpt.evaluate(() => { document.getElementById("prompt-textarea").innerHTML = ""; });
      await box.click(); await gpt.keyboard.type("goa trip 3 days cheap");
      await P(gpt, "#imp").waitFor({ state: "visible", timeout: 3000 });
      const t0 = Date.now();
      await P(gpt, "#imp").click();
      await until(async () => /Plan a 3-day trip to Goa on a tight budget\./.test(await box.innerText()), 4000);
      assert.ok(Date.now() - t0 < 4400, `Pepper's draft is in before the AI answers (${Date.now() - t0} ms)`);
      assert.ok(!/Polished by the AI/.test(await box.innerText()), "the AI hasn't answered yet");
      await until(async () => (await P(gpt, "#imp").getAttribute("data-mode")) === "polish", 2000);
      assert.equal(await P(gpt, "#imp").getAttribute("data-mode"), "polish", "Undo stays on while the AI polishes");
      await until(async () => /^Polished by the AI/.test(await box.innerText()), 8000);
      await until(async () => (await P(gpt, "#imp").getAttribute("data-mode")) === "done", 2000);
      apiDelay = 0;
      await gpt.evaluate(() => { document.getElementById("prompt-textarea").innerHTML = ""; });
    });

    await t.test("M7 learned lens is preselected with the reason shown", async () => {
      await storage.setKey("none");
      const now = Date.now();
      const seed = [["role", 5], ["role", 5], ["auto", 3], ["auto", 2], ["clarify", 4]].map(([lens, rating], i) => ({
        id: "seed" + i, site: "chatgpt.com", assisted: true, lens, rating, projectType: "Job applications", raw: "seed " + i,
        prompt: "w ".repeat(200), ts: new Date(now - (10 - i) * 60000).toISOString(), response: "r" }));
      const cur = await storage.get("pepper_history");
      await storage.set({ pepper_history: [...seed, ...cur] });
      await sw.evaluate(() => recomputeLearning());
      await gpt.reload(); await gpt.waitForTimeout(1200);
      await P(gpt, "#orb").click();
      const checked = await P(gpt, '#lenses .lens[aria-checked="true"]').textContent();
      assert.equal(checked, "Expert role");
      assert.equal(await P(gpt, "#learnedNote").textContent(), "Pepper chose Expert role: your average 5.0 stars across 2 ratings.");
      const sugs = await P(gpt, "#sugs .sug.worked .t").allTextContents();
      assert.ok(sugs.includes("seed 0"), "worked-well-before suggestion from a 5-star prompt");
      await gpt.screenshot({ path: path.join(SHOTS, "panel-learned-lens.png") });
      await P(gpt, "#close").click();
    });

    await t.test("Alt+Shift+P shortcut is declared in the manifest (pressing it is not exercised)", async () => {
      const mf = require(path.join(__dirname, "../../pepper-extension/manifest.json"));
      assert.equal(mf.commands["toggle-panel"].suggested_key.default, "Alt+Shift+P");
    });

    // screenshots of extension pages for visual review
    await t.test("extension pages render (screenshots)", async () => {
      const base = `chrome-extension://${extId}/`;
      const pg = await ctx.newPage(); await pg.setViewportSize({ width: 1280, height: 900 });
      for (const s of ["home", "you", "pocket", "projects", "history", "reminders", "settings"]) {
        await pg.goto(base + "dashboard.html#" + s); await pg.waitForTimeout(500);
        const errs = []; pg.on("pageerror", e => errs.push(e.message));
        await pg.screenshot({ path: path.join(SHOTS, `dashboard-${s}.png`), fullPage: true });
        assert.deepEqual(errs, []);
      }
      await pg.goto(base + "onboarding.html#update"); await pg.waitForTimeout(500);
      await pg.screenshot({ path: path.join(SHOTS, "onboarding.png"), fullPage: true });
      assert.equal(await pg.isVisible("#updateNote"), true, "the update note shows on the first step");
      await pg.goto(base + "privacy.html"); await pg.waitForTimeout(300);
      await pg.screenshot({ path: path.join(SHOTS, "privacy.png"), fullPage: true });
      await pg.setViewportSize({ width: 340, height: 420 });
      await pg.goto(base + "popup.html"); await pg.waitForTimeout(500);
      await pg.screenshot({ path: path.join(SHOTS, "popup.png"), fullPage: true });
      await pg.setViewportSize({ width: 390, height: 844 });
      await pg.goto(base + "dashboard.html#home"); await pg.waitForTimeout(400);
      await pg.screenshot({ path: path.join(SHOTS, "dashboard-mobile.png"), fullPage: true });
      await pg.close();
    });
    await t.test("N5 dashboard data controls: delete one, export without key, remove key, clear all", async () => {
      await storage.setKey("anthropic", "sk-ant-SECRET-123");
      const pg = await ctx.newPage();
      await pg.goto(`chrome-extension://${extId}/dashboard.html#history`); await pg.waitForTimeout(500);
      const before = (await storage.get("pepper_history")).length;
      const firstId = await pg.locator("#histList .rec").first().getAttribute("data-id");
      await pg.locator("#histList .rec").first().locator("[data-del]").click();
      await until(async () => (await storage.get("pepper_history")).length === before - 1);
      const after = await storage.get("pepper_history");
      assert.equal(after.length, before - 1); assert.ok(!after.some(r => r.id === firstId));
      await pg.goto(`chrome-extension://${extId}/dashboard.html#privacy`); await pg.waitForTimeout(400);
      const [dl] = await Promise.all([pg.waitForEvent("download"), pg.click("#export")]);
      const file = await dl.path(); const text = require("fs").readFileSync(file, "utf8");
      const data = JSON.parse(text);
      assert.ok(!text.includes("sk-ant-SECRET-123"), "key not in export");
      assert.ok(!("pepper_settings" in data));
      assert.equal(data.pepper_history.length, before - 1);
      pg.on("dialog", d => d.accept());
      await pg.click("#removeKey");
      await until(async () => (await storage.get("pepper_settings")).hasKey === false);
      assert.equal((await storage.get("pepper_settings")).hasKey, false);
      assert.equal(await sw.evaluate(() => Vault.get("apiKey")), undefined, "removed from the vault");
      await pg.click("#clearHist");
      await until(async () => (await storage.get("pepper_history")).length === 0);
      assert.deepEqual(await storage.get("pepper_history"), []);
      assert.ok((await storage.get("pepper_projects")).length > 0, "clear-all history keeps projects");
      await pg.close();
    });

    await t.test("C2 framing the dashboard from a website fails", async () => {
      const p = await ctx.newPage(); await p.goto("https://chatgpt.com/"); await p.waitForTimeout(600);
      await p.evaluate((id) => { const f = document.createElement("iframe"); f.id = "evil"; f.src = `chrome-extension://${id}/dashboard.html`; document.body.appendChild(f); }, extId);
      await p.waitForTimeout(1200);
      const fr = p.frames().find(f => f !== p.mainFrame());
      const url = fr ? fr.url() : "";
      const loaded = fr && url.startsWith("chrome-extension://") ? await fr.evaluate(() => !!document.getElementById("nav")).catch(() => false) : false;
      console.log("    framing check: iframe ended at", JSON.stringify(url));
      assert.equal(loaded, false, "dashboard did not load inside the page (frame url: " + url + ")");
      await p.close();
    });

  } finally { await ctx.close(); }
});
