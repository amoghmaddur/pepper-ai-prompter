/* Live check against the real AI sites (not run in CI). For each site it opens
   the page logged out, and checks that Pepper appears, its panel opens, and
   Insert puts a prompt in the site's own box. It never presses send, and it
   empties the box again afterwards. Sites that need a login are reported as such.
     PEPPER_BROWSER=brave node e2e/live-check.js        (or chromium / msedge) */
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), os = require("os");
const { BROWSER, extCopy } = require("./harness.js");
const C = require("../../pepper-extension/lib/core.js");

const SITES = [
  ["chatgpt", "https://chatgpt.com/"], ["claude", "https://claude.ai/new"], ["gemini", "https://gemini.google.com/app"],
  ["perplexity", "https://www.perplexity.ai/"], ["copilot", "https://copilot.microsoft.com/"]
];
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const ext = extCopy({ open: true });
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "pepper-live-")), {
    ...BROWSER.opts, headless: process.env.HEADED ? false : true, viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--no-first-run", "--no-default-browser-check"]
  });
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 10000 });
  await wait(600);
  for (const p of ctx.pages()) if (p.url().includes("onboarding.html")) await p.close();
  await sw.evaluate(async () => {
    await chrome.storage.local.set({ pepper_profile: { answers: { name: "Test", q3: "student", q1: ["ChatGPT"], q2: ["Writing"], q5: "Conversational", q6: "Friendly", focus: "varies" }, completed: true } });
    const s = (await chrome.storage.local.get("pepper_settings")).pepper_settings;
    await chrome.storage.local.set({ pepper_settings: { ...s, floating: "ai", onboarded: true } });
  });
  const rows = [];
  for (const [id, url] of SITES) {
    const site = C.SITES.find(s => s.id === id);
    const row = { site: site.name, browser: BROWSER.name };
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      let box = null;
      for (let i = 0; i < 30 && !box; i++) { await wait(500); box = await page.$(site.input); if (box && !(await box.isVisible())) box = null; }
      row.url = page.url().split("?")[0];
      row.pepper = await page.evaluate(() => !!document.getElementById("pepper-host"));
      row.box = box ? "found" : (/login|signin|auth/i.test(page.url()) ? "login required" : "not found");
      if (box) {
        const P = (sel) => page.locator("#pepper-host").locator(sel);
        await P("#orb").click();
        row.panel = await P("#panel").isVisible();
        await P("#raw").fill("explain how vaccines train the immune system");
        await P("#go").click(); await P("#result").waitFor({ state: "visible", timeout: 5000 });
        await P("#insert").click(); await wait(800);
        const text = await page.evaluate((sel) => { const b = document.querySelector(sel); return b ? (b.value ?? b.innerText) : ""; }, site.input);
        row.insert = /^This prompt has six|^ROLE/m.test(text) && /SUCCESS CRITERIA/.test(text) ? "ok" : "failed";
        row.sent = false; // Pepper presses nothing; we never press send either
        // leave the box empty again
        await box.click(); await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A"); await page.keyboard.press("Backspace");
      }
    } catch (e) { row.error = e.message.split("\n")[0]; }
    rows.push(row);
    console.log(JSON.stringify(row));
    await page.close();
  }
  await ctx.close();
  fs.rmSync(ext, { recursive: true, force: true });
})();
