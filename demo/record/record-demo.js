/* Records the Pepper v0.4 walkthrough: the real extension, driven by Playwright,
   on the local mock pages from pepper-tests/e2e/mock-sites.js. It runs the real
   setup, writes a prompt on ChatGPT, fixes text on an article, hands a prompt to
   Claude, uses the Pocket, fills a job form and opens the dashboard. Adds an
   on-screen cursor and captions, stitches the tabs into one video with ffmpeg,
   and writes demo/media/pepper-demo.mp4, pepper-demo.gif and poster.png.

   Run from pepper-tests/ (it uses that folder's Playwright):
     PEPPER_BROWSER=brave node ../demo/record/record-demo.js     (or msedge, or PEPPER_CHROME=…)
   Needs ffmpeg on PATH (or FFMPEG=/path/to/ffmpeg). */
const path = require("path"), fs = require("fs"), os = require("os");
const { spawnSync } = require("child_process");
const { launch, adopt } = require("../../pepper-tests/e2e/harness.js");

const MEDIA = path.resolve(__dirname, "../media");
const VID_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pepper-video-"));
const W = 1280, H = 800;
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const REPO = "github.com/amoghmaddur/pepper-ai-prompter";
const wait = (ms) => new Promise(r => setTimeout(r, ms));

/* ---------- overlay: captions, cursor, honesty badge ---------- */
const OVERLAY_CSS = `
#demo-cap{position:fixed;z-index:2147483647;max-width:740px;background:#0D1812;color:#F2F5F1;border-radius:16px;
  padding:14px 20px 16px;box-shadow:0 18px 40px -12px rgba(0,0,0,.55);font-family:"Segoe UI",system-ui,sans-serif;pointer-events:none;
  border:1px solid rgba(128,205,162,.35);transition:opacity .35s ease, transform .35s ease;opacity:0;transform:translateY(-6px)}
#demo-cap.on{opacity:1;transform:none}
#demo-cap.tl{left:24px;top:20px}#demo-cap.br{right:24px;bottom:22px;max-width:430px}#demo-cap.bl{left:24px;bottom:22px;max-width:520px}
#demo-cap .k{font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#80CDA2}
#demo-cap .t{font-family:Cambria,Georgia,serif;font-size:24px;line-height:1.22;margin-top:4px;font-weight:600}
#demo-cap .s{font-size:15px;line-height:1.4;color:#B9C7BF;margin-top:6px}
#demo-cursor{position:fixed;left:0;top:0;z-index:2147483647;width:22px;height:22px;pointer-events:none;
  transition:transform .55s cubic-bezier(.3,.7,.2,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
#demo-ring{position:fixed;z-index:2147483647;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:3px solid #F284A4;pointer-events:none;opacity:0}
#demo-ring.go{animation:demoRing .5s ease-out}
@keyframes demoRing{from{opacity:.95;transform:scale(.4)}to{opacity:0;transform:scale(1.5)}}
#demo-badge{position:fixed;right:16px;top:12px;z-index:2147483647;font:600 11px "Segoe UI",system-ui,sans-serif;color:#fff;
  background:rgba(13,24,18,.78);padding:4px 9px;border-radius:999px;pointer-events:none;letter-spacing:.02em}`;

let cursor = [W / 2, H / 2];
async function overlay(page) {
  await page.evaluate(([css, at]) => {
    if (document.getElementById("demo-cap")) return;
    const st = document.createElement("style"); st.textContent = css; document.documentElement.appendChild(st);
    const cap = document.createElement("div"); cap.id = "demo-cap"; cap.className = "tl"; cap.innerHTML = '<div class="k"></div><div class="t"></div><div class="s"></div>';
    const cur = document.createElement("div"); cur.id = "demo-cursor";
    cur.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 2l17 10-7.5 1.6L9 21z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    cur.style.transform = `translate(${at[0]}px,${at[1]}px)`;
    const ring = document.createElement("div"); ring.id = "demo-ring";
    const badge = document.createElement("div"); badge.id = "demo-badge"; badge.textContent = "Demo · local mock pages";
    document.documentElement.append(cap, ring, cur, badge);
  }, [OVERLAY_CSS, cursor]);
}
async function caption(page, k, t, s, pos = "tl") {
  await page.evaluate(([k, t, s, pos]) => {
    const c = document.getElementById("demo-cap"); c.classList.remove("on");
    setTimeout(() => {
      c.className = pos; c.querySelector(".k").textContent = k; c.querySelector(".t").textContent = t;
      c.querySelector(".s").textContent = s || ""; c.querySelector(".s").style.display = s ? "" : "none";
      requestAnimationFrame(() => c.classList.add("on"));
    }, 260);
  }, [k, t, s, pos]);
  await wait(650);
}
async function moveTo(page, loc) {
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const b = await loc.boundingBox();
  if (!b) throw new Error("no box for " + loc);
  cursor = [b.x + Math.min(b.width / 2, 60), b.y + b.height / 2];
  await page.evaluate(([x, y]) => { const c = document.getElementById("demo-cursor"); if (c) c.style.transform = `translate(${x - 3}px,${y - 2}px)`; }, cursor);
  await page.mouse.move(cursor[0], cursor[1], { steps: 6 });
  await wait(560);
}
async function click(page, loc, pause = 350) {
  await moveTo(page, loc);
  await page.evaluate(([x, y]) => { const r = document.getElementById("demo-ring"); if (!r) return; r.style.left = x + "px"; r.style.top = y + "px"; r.classList.remove("go"); void r.offsetWidth; r.classList.add("go"); }, cursor);
  await loc.click();
  await wait(pause);
}
async function card(page, html) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;background:radial-gradient(1200px 700px at 30% 20%,#1E3428 0,#0F1612 60%);color:#E4EBE6;font-family:"Segoe UI",system-ui,sans-serif}
    .c{height:100%;display:flex;flex-direction:column;justify-content:center;padding:0 110px}
    .orb{width:96px;height:96px}
    h1{font-family:Cambria,Georgia,serif;font-size:60px;line-height:1.05;margin:26px 0 0;letter-spacing:-.02em}
    p{font-size:23px;line-height:1.45;color:#B9C7BF;max-width:920px;margin:20px 0 0}
    .k{font-size:15px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#80CDA2;margin-top:30px}
    .row{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}.pill{border:1px solid #2F4A3B;border-radius:999px;padding:8px 16px;font-size:18px;color:#E4EBE6;background:#17211C}
    b{color:#80CDA2}
    .fade{animation:f .8s ease both}@keyframes f{from{opacity:0;transform:translateY(10px)}to{opacity:1}}
  </style></head><body><div class="c fade">${html}</div></body></html>`);
}
const PEP = `<svg class="orb" viewBox="0 0 48 48"><defs><radialGradient id="g" cx="34%" cy="28%" r="78%"><stop offset="0" stop-color="#86C29D"/><stop offset=".32" stop-color="#3E7A59"/><stop offset=".74" stop-color="#22513A"/><stop offset="1" stop-color="#163826"/></radialGradient></defs>
  <path d="M24.5 10.5c.3-3.2 1.8-5.6 4.6-7" stroke="#6B4A2B" stroke-width="2.3" fill="none" stroke-linecap="round"/><path d="M28 4.6c3.6-2.6 7.6-2.2 10 .4-3.4 2.4-7 2.4-10-.4z" fill="#9BD8AC"/>
  <circle cx="24" cy="27.5" r="17.5" fill="url(#g)"/><ellipse cx="18" cy="26.5" rx="3.7" ry="4.3" fill="#fff"/><circle cx="18.3" cy="27.1" r="2.05" fill="#13211A"/>
  <ellipse cx="30" cy="26.5" rx="3.7" ry="4.3" fill="#fff"/><circle cx="30.3" cy="27.1" r="2.05" fill="#13211A"/>
  <ellipse cx="12.6" cy="32.4" rx="2.6" ry="1.5" fill="#F48FB1" opacity=".6"/><ellipse cx="35.4" cy="32.4" rx="2.6" ry="1.5" fill="#F48FB1" opacity=".6"/>
  <path d="M21.2 33.6c1.7 1.9 4 1.9 5.6 0" stroke="#0E1B14" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;

/* ---------- run ---------- */
(async () => {
  fs.mkdirSync(MEDIA, { recursive: true });
  const { ctx, storage, extId } = await launch({
    open: true, grant: ["all", "notifications"],
    launchOptions: { viewport: { width: W, height: H }, recordVideo: { dir: VID_DIR, size: { width: W, height: H } } }
  });
  const base = `chrome-extension://${extId}/`;
  const P = (page, sel) => page.locator("#pepper-host").locator(sel);
  // Clips from each tab, by wall-clock time, stitched in order at the end.
  const born = new Map(), clips = [], marks = {};
  let live = null;
  const start = (page) => { live = { page, a: Date.now() }; };
  const stop = () => { if (live) { clips.push({ ...live, b: Date.now() }); live = null; } };
  const mark = (name) => { marks[name] = clips.reduce((s, c) => s + (c.b - c.a), 0) + (live ? Date.now() - live.a : 0); };

  const page = await ctx.newPage(); born.set(page, Date.now());
  start(page);
  try {
    /* 0 · title */
    await card(page, `${PEP}<h1>Pepper 0.4</h1><p>A little companion that floats on your screen: better prompts, cleaner writing, your files and details one click away, and job forms filled for you.</p>`);
    mark("title"); await wait(4200);

    /* 1 · setup, for real */
    await page.goto(base + "onboarding.html"); await page.waitForTimeout(500); await overlay(page);
    mark("setup");
    await caption(page, "01 · Setup", "Two minutes, one question at a time.", "Pepper stays locked until it knows how you work.", "br");
    await click(page, page.locator("#next"), 400);
    await click(page, page.locator("#name"), 100); await page.locator("#name").pressSequentially("Maya", { delay: 40 });
    await click(page, page.locator("#role"), 100); await page.locator("#role").pressSequentially("CS grad student", { delay: 25 });
    await click(page, page.locator("#next"), 300);
    await caption(page, "01 · Setup", "The AI sites she uses, in order.", "Her first pick is where Pepper sends prompts from other pages.", "br");
    await click(page, page.locator('#sites .card[data-n="Claude"]'), 150); await click(page, page.locator('#sites .card[data-n="ChatGPT"]'), 400);
    await click(page, page.locator("#next"), 300);
    await click(page, page.locator('#uses .chip[data-u="Job search"]'), 120); await click(page, page.locator('#uses .chip[data-u="Writing"]'), 300);
    await click(page, page.locator("#next"), 300);
    await caption(page, "01 · Setup", "How she likes answers shapes every prompt.", "“Walk me through it” starts prompts on Clarify.", "br");
    await click(page, page.locator('#think .card[data-v="Step-by-step"]'), 150); await click(page, page.locator('#tone .chip[data-t="Professional"]'), 300);
    await click(page, page.locator("#next"), 300);
    await click(page, page.locator('#focus .card[data-v="morning"]'), 150); await click(page, page.locator("#nudge"), 300);
    await click(page, page.locator("#next"), 300);
    await caption(page, "01 · Setup", "Keep floating everywhere, or only on AI sites.", "Everywhere asks the browser once.", "br");
    await click(page, page.locator('#float .card[data-v="everywhere"]'), 500);
    await click(page, page.locator("#next"), 300);
    await caption(page, "01 · Setup", "Pick your superpowers.", "Each one shows what it does before you turn it on.", "br");
    await click(page, page.locator('#powers input[data-f="autofill"]'), 300); await click(page, page.locator("#learn"), 500);
    await click(page, page.locator("#next"), 300);
    await page.locator("#file").setInputFiles({ name: "Maya_Resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 Maya R. resume") });
    await click(page, page.locator('#details input[data-d="email"]'), 100); await page.locator('#details input[data-d="email"]').pressSequentially("maya@example.com", { delay: 18 });
    await wait(500);
    await click(page, page.locator("#next"), 300);
    await click(page, page.locator("#next"), 900); // no model key: Pepper works without one
    await caption(page, "01 · Setup", "Done. Pepper fits her now.", null, "br");
    await wait(1600);
    await storage.patch("pepper_details", { fullName: "Maya Rao", phone: "617-555-0100", linkedin: "https://linkedin.com/in/maya", country: "USA" });

    /* 2 · write a prompt on ChatGPT */
    await page.goto("https://chatgpt.com/"); await page.waitForTimeout(900); await overlay(page);
    mark("write");
    await caption(page, "02 · Write · ChatGPT", "A few words in, a six-part prompt out.", "It starts on Clarify, because she likes things step by step.");
    await click(page, P(page, "#orb"), 600);
    await click(page, P(page, "#raw"), 150);
    await P(page, "#raw").pressSequentially("write a cover letter for the Stripe new-grad SWE role", { delay: 26 });
    await moveTo(page, P(page, "#learnedNote")); await wait(900);
    await click(page, P(page, "#go"), 900);
    for (let i = 0; i < 4; i++) { await P(page, "#prompt").evaluate(el => el.scrollBy({ top: 110, behavior: "smooth" })); await wait(450); }
    await caption(page, "02 · Write · ChatGPT", "Into ChatGPT's box. Pepper never presses send.", "She reads it, then sends it herself.");
    await click(page, P(page, "#insert"), 1500);

    /* 3 · fix text anywhere */
    await page.goto("https://example.org/"); await page.waitForTimeout(900); await overlay(page);
    mark("fix");
    await caption(page, "03 · Fix · any page", "Select text, and Pepper offers to help.", "Spelling, spacing and capitals are fixed offline.");
    await moveTo(page, page.locator("#notes"));
    await page.evaluate(() => { const n = document.getElementById("notes"); n.focus(); n.select(); });
    await P(page, "#pill").waitFor({ state: "visible", timeout: 4000 }); await wait(600);
    await click(page, P(page, "#pillFix"), 500);
    await click(page, P(page, '#fixKinds .kind[data-k="fix"]'), 1100);
    await click(page, P(page, "#fixReplace"), 1200);

    /* 4 · hand a prompt to Claude */
    mark("handoff");
    await caption(page, "04 · Ask AI", "Similar ideas? Pepper writes the prompt for her AI.", "Without a model key, it opens Claude with the prompt in the box.");
    await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById("para")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
    await moveTo(page, page.locator("#para"));
    await P(page, "#pill").waitFor({ state: "visible", timeout: 4000 }); await wait(400);
    await click(page, P(page, "#pillFix"), 400);
    await click(page, P(page, '#fixKinds .kind[data-k="similar"]'), 900);
    const [cl] = await Promise.all([ctx.waitForEvent("page"), click(page, P(page, "#fixSend"), 200)]);
    born.set(cl, Date.now());
    stop();
    await adopt(cl); await cl.waitForTimeout(400); await overlay(cl);
    start(cl);
    await caption(cl, "04 · Ask AI · Claude", "Claude opens with the prompt ready.", "She checks it and presses send.");
    await wait(3200);
    stop();
    await cl.close();
    await page.bringToFront();
    start(page);

    /* 5 · the Pocket */
    mark("pocket");
    await caption(page, "05 · Pocket", "Her resume, links, templates and details.", "Drag files onto upload fields; copy or fill any detail.");
    await click(page, P(page, "#orb"), 400);
    await click(page, P(page, '.tab[data-tab="pocket"]'), 2400);

    /* 6 · fill a job application */
    await page.goto("https://boards.greenhouse.io/acme/jobs/1"); await page.waitForTimeout(900); await overlay(page);
    mark("fill");
    await caption(page, "06 · Fill · job application", "Pepper spots the application.", "It fills only empty fields she can see, and never submits.", "bl");
    await P(page, "#hint").waitFor({ state: "visible", timeout: 5000 }); await wait(900);
    await click(page, P(page, "#hintBtns button").filter({ hasText: "Fill it" }), 900);
    await click(page, P(page, "#fillGo"), 900);
    await click(page, P(page, '#fillBody button[data-attach="0"]'), 1600);

    /* 7 · dashboard */
    await page.goto(base + "dashboard.html#home"); await page.waitForTimeout(700); await overlay(page);
    mark("dashboard");
    await caption(page, "07 · Dashboard", "Everything stays in her browser.", "No Pepper server, account or analytics.", "br");
    await wait(2400);
    await click(page, page.locator('#nav a[data-s="pocket"]'), 2000);

    /* 8 · end */
    await card(page, `${PEP}<h1>Pepper v0.4</h1>
      <div class="row"><span class="pill"><b>133</b> unit tests</span><span class="pill"><b>36</b> browser checks</span><span class="pill">Chromium · Brave · Edge</span><span class="pill">no server</span></div>
      <p class="k">Code</p><p style="margin-top:8px;color:#E4EBE6">${REPO}</p>`);
    mark("end"); await wait(4200);
    mark("done");
    stop();
  } finally {
    const videos = new Map();
    for (const p of born.keys()) { try { videos.set(p, p.video()); } catch (e) {} }
    await ctx.close();
    const parts = [];
    for (const c of clips) {
      const v = videos.get(c.page);
      if (!v) continue;
      const src = await v.path();
      parts.push({ src, from: (c.a - born.get(c.page)) / 1000, to: (c.b - born.get(c.page)) / 1000 });
    }
    fs.writeFileSync(path.join(MEDIA, "scenes.json"), JSON.stringify(marks, null, 2));
    encode(parts, marks);
    fs.rmSync(VID_DIR, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exit(1); });

/* ---------- ffmpeg ---------- */
function ff(args) {
  const r = spawnSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed: " + args.join(" "));
}
function encode(parts, marks) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pepper-cut-"));
  const list = parts.map((p, i) => {
    const out = path.join(tmp, `part${i}.mp4`);
    ff(["-ss", p.from.toFixed(2), "-to", p.to.toFixed(2), "-i", p.src, "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p", "-r", "30", "-an", out]);
    return out;
  });
  fs.writeFileSync(path.join(tmp, "list.txt"), list.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
  const mp4 = path.join(MEDIA, "pepper-demo.mp4");
  ff(["-f", "concat", "-safe", "0", "-i", path.join(tmp, "list.txt"), "-c", "copy", "-movflags", "+faststart", mp4]);
  // poster: Pepper's six-part prompt on ChatGPT
  ff(["-ss", String(marks.write / 1000 + 12), "-i", mp4, "-frames:v", "1", path.join(MEDIA, "poster.png")]);
  // README gif: fix on a page, then filling a job form
  const pal = path.join(tmp, "palette.png");
  const g0 = marks.fix / 1000, g1 = Math.min(marks.handoff / 1000, g0 + 14);
  const f0 = marks.fill / 1000, f1 = marks.dashboard / 1000;
  const gifSrc = path.join(tmp, "gif.mp4");
  fs.writeFileSync(path.join(tmp, "gif.txt"), [`file '${mp4.replace(/\\/g, "/")}'\ninpoint ${g0}\noutpoint ${g1}`, `file '${mp4.replace(/\\/g, "/")}'\ninpoint ${f0}\noutpoint ${f1}`].join("\n"));
  ff(["-f", "concat", "-safe", "0", "-i", path.join(tmp, "gif.txt"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", gifSrc]);
  const vf = "setpts=PTS/1.2,fps=12,scale=960:-1:flags=lanczos";
  ff(["-i", gifSrc, "-vf", vf + ",palettegen=max_colors=160:stats_mode=diff", pal]);
  ff(["-i", gifSrc, "-i", pal, "-lavfi", vf + "[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", path.join(MEDIA, "pepper-demo.gif")]);
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const f of ["pepper-demo.mp4", "pepper-demo.gif", "poster.png"]) console.log(f, (fs.statSync(path.join(MEDIA, f)).size / 1e6).toFixed(2) + " MB");
  console.log("scenes:", Object.entries(marks).map(([k, v]) => `${k}@${(v / 1000).toFixed(1)}`).join("  "));
}
