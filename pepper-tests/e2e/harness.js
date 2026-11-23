// Lets context.route() see the extension service worker's fetches (the model API mock).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), os = require("os");
const { PAGES } = require("./mock-sites.js");
const EXT = path.resolve(__dirname, "../../pepper-extension");

/* Which browser. PEPPER_BROWSER = chromium (default) | brave | msedge | a path to a
   Chromium-based browser. PEPPER_CHROME (a path) and PEPPER_CHANNEL still work.
   Branded Google Chrome ignores --load-extension, so use Chromium, Brave or Edge. */
const SANDBOX_CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BRAVE = process.platform === "win32" ? "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"
  : process.platform === "darwin" ? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" : "/usr/bin/brave-browser";
function pickBrowser() {
  const want = process.env.PEPPER_BROWSER || process.env.PEPPER_CHANNEL || "";
  if (process.env.PEPPER_CHROME) return { name: "chromium", opts: { executablePath: process.env.PEPPER_CHROME } };
  if (want === "brave") return { name: "brave", opts: { executablePath: BRAVE } };
  if (/^msedge/.test(want)) return { name: "msedge", opts: { channel: want } };
  if (want && want !== "chromium" && fs.existsSync(want)) return { name: path.basename(want), opts: { executablePath: want } };
  if (fs.existsSync(SANDBOX_CHROME)) return { name: "chromium", opts: { executablePath: SANDBOX_CHROME } };
  return { name: "chromium", opts: { channel: "chromium" } };
}
const BROWSER = pickBrowser();
// Edge 150+ blocks every third-party extension on copilot.microsoft.com by design.
const IS_EDGE = BROWSER.name === "msedge";

/** A copy of the extension for tests. open: the shadow root is "open" so tests can click inside the
    panel (the only code difference; the closed root is checked on the real build). grant: optional
    permissions written into the copy, because a test can't click the browser's permission prompt. */
function extCopy({ open = false, grant = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pepper-ext-"));
  fs.cpSync(EXT, dir, { recursive: true });
  if (open) {
    const f = path.join(dir, "content.js");
    const src = fs.readFileSync(f, "utf8");
    if (!src.includes('attachShadow({ mode: "closed" })')) throw new Error("closed root marker not found");
    fs.writeFileSync(f, src.replace('attachShadow({ mode: "closed" })', 'attachShadow({ mode: "open" })'));
  }
  if (grant.length) {
    const mf = path.join(dir, "manifest.json");
    const m = JSON.parse(fs.readFileSync(mf, "utf8"));
    if (grant.includes("all")) m.host_permissions.push("<all_urls>");
    if (grant.includes("notifications")) m.permissions.push("notifications");
    fs.writeFileSync(mf, JSON.stringify(m, null, 2));
  }
  return dir;
}
const openRootCopy = () => extCopy({ open: true });

async function launch({ open = false, grant = [], onApi, launchOptions = {} } = {}) {
  const ext = open || grant.length ? extCopy({ open, grant }) : EXT;
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "pepper-prof-"));
  const ctx = await chromium.launchPersistentContext(userDir, {
    ...BROWSER.opts, headless: true, viewport: { width: 1280, height: 860 }, ...launchOptions,
    // No real hostname resolves, so nothing in a test can reach a live site by accident; every page
    // and the model API are served by the routes below.
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--no-first-run", "--no-default-browser-check",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost"]
  });
  await ctx.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.host === "api.anthropic.com" && onApi) return onApi(route);
    const page = PAGES[u.host];
    if (page && route.request().resourceType() === "document") return route.fulfill({ status: 200, contentType: "text/html", body: page });
    if (u.protocol === "chrome-extension:") return route.continue();
    return route.fulfill({ status: 404, body: "" });
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 10000 });
  const extId = new URL(sw.url()).host;
  // close the onboarding tab the install opened, after it has loaded
  await new Promise(r => setTimeout(r, 600));
  for (const p of ctx.pages()) if (p.url().includes("onboarding.html")) await p.close();
  const storage = {
    all: () => sw.evaluate(() => chrome.storage.local.get(null)),
    get: (k) => sw.evaluate((k) => chrome.storage.local.get(k).then(r => r[k]), k),
    patch: (key, patch) => sw.evaluate(async ([key, patch]) => {
      const cur = (await chrome.storage.local.get(key))[key] || {};
      await chrome.storage.local.set({ [key]: { ...cur, ...patch } });
    }, [key, patch]),
    set: (obj) => sw.evaluate((o) => chrome.storage.local.set(o), obj),
    consent: (site, on) => sw.evaluate(async ([site, on]) => {
      const c = (await chrome.storage.local.get("pepper_consent")).pepper_consent || {};
      c[site] = { learning: on }; await chrome.storage.local.set({ pepper_consent: c });
    }, [site, on])
  };
  /** Finishes setup the way onboarding would, merging any test-specific answers and settings. */
  storage.completeSetup = async (answers = {}, settings = {}) => {
    await storage.set({ pepper_profile: { answers: { ...SETUP_ANSWERS, ...answers }, completed: true } });
    await storage.patch("pepper_settings", { floating: "ai", onboarded: true, ...settings });
  };
  return { ctx, sw, extId, storage, ext, browser: BROWSER.name };
}
/** A tab the extension opened itself (chrome.tabs.create) can load before the routes attach, so it
    lands on a "can't resolve" error page. Reload it once; the mock then loads with routes in place. */
async function adopt(page) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  const mocked = await page.evaluate(() => "__sent" in window).catch(() => false);
  if (!mocked) { await page.reload({ waitUntil: "domcontentloaded" }); }
  return page;
}
const SETUP_ANSWERS = { name: "Maya", q3: "graduate student", q1: ["ChatGPT", "Claude"], q2: ["Job search"], q5: "Conversational", q6: "Professional", focus: "morning" };
module.exports = { launch, adopt, EXT, IS_EDGE, BROWSER, extCopy, openRootCopy, SETUP_ANSWERS };
