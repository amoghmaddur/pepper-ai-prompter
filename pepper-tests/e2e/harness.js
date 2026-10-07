// Lets context.route() see the extension service worker's fetches (the model API mock).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), os = require("os");
const { PAGES } = require("./mock-sites.js");
const EXT = path.resolve(__dirname, "../../pepper-extension");
// Browser: PEPPER_CHROME (an executable path), then the build sandbox's Chromium,
// then PEPPER_CHANNEL (e.g. "msedge"), then Playwright's bundled full Chromium.
// Branded Chrome ignores --load-extension, so use Chromium or Edge.
const SANDBOX_CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const CHROME = process.env.PEPPER_CHROME || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : null);
const BROWSER = CHROME ? { executablePath: CHROME } : { channel: process.env.PEPPER_CHANNEL || "chromium" };

/** A copy of the extension whose shadow root is "open", so tests can click inside the panel.
    The only difference is that one word; the closed root itself is checked on the real build. */
function openRootCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pepper-open-"));
  fs.cpSync(EXT, dir, { recursive: true });
  const f = path.join(dir, "content.js");
  const src = fs.readFileSync(f, "utf8");
  if (!src.includes('attachShadow({ mode: "closed" })')) throw new Error("closed root marker not found");
  fs.writeFileSync(f, src.replace('attachShadow({ mode: "closed" })', 'attachShadow({ mode: "open" })'));
  return dir;
}

async function launch({ open = false, onApi, launchOptions = {} } = {}) {
  const ext = open ? openRootCopy() : EXT;
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "pepper-prof-"));
  const ctx = await chromium.launchPersistentContext(userDir, {
    ...BROWSER, headless: true, viewport: { width: 1280, height: 860 }, ...launchOptions,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--no-first-run", "--no-default-browser-check"]
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
  return { ctx, sw, extId, storage, ext };
}
// Edge 150+ blocks every third-party extension on copilot.microsoft.com by design.
const IS_EDGE = !CHROME && /^msedge/.test(BROWSER.channel);
module.exports = { launch, EXT, IS_EDGE };
