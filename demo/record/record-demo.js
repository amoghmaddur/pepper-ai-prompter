/* Records the Pepper demo video: the real extension, driven by Playwright,
   on the local mock sites from pepper-tests/e2e/mock-sites.js, with the model
   API mocked. Adds an on-screen cursor and captions, then uses ffmpeg to make
   demo/media/pepper-demo.mp4, pepper-demo.gif, poster.png and screenshots.

   Run from pepper-tests/ (it uses that folder's Playwright):
     PEPPER_CHANNEL=msedge node ../demo/record/record-demo.js
   Needs ffmpeg on PATH (or FFMPEG=/path/to/ffmpeg). */
const path = require("path"), fs = require("fs"), os = require("os");
const { spawnSync } = require("child_process");
const { launch } = require("../../pepper-tests/e2e/harness.js");
const C = require("../../pepper-extension/lib/core.js");

const MEDIA = path.resolve(__dirname, "../media");
const VID_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pepper-video-"));
const W = 1280, H = 800;
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const REPO = "github.com/amoghmaddur/pepper-ai-prompter";
const SITE_URL = "amoghmaddur.github.io/pepper-ai-prompter";
const wait = (ms) => new Promise(r => setTimeout(r, ms));

/* ---------- Maya, the demo user (fictional) ---------- */
const ANSWERS = { q1: ["ChatGPT", "Claude"], q2: ["Job search", "Coding"], q3: "graduate student", q4: "computer science",
  q5: "Concise & direct", q6: "Professional", q7: "Intermediate", q8: ["Bullet points"], q9: "Medium",
  q10: "land a new-grad backend engineering role by spring", q11: "cover letters, recruiter follow-ups", q12: "English",
  q13: "no em dashes, no buzzwords like passionate", q14: "recruiters and hiring managers", q15: "Light touch" };
const RESUME = "Maya R. | M.S. Computer Science, expected May 2027\n- Built a Rust payments ledger (course project); 2,000 transactions/s in load tests\n- Intern, Acme Cloud: cut CI time 38% by caching build layers\n- Teaching assistant, Distributed Systems";
const PROJECT = { id: "p1", name: "New-grad SWE search", type: "Job applications", description: "Backend and infrastructure roles starting summer 2027", fileIds: ["f1"] };
const MODEL_REPLY = `ROLE
You are a career coach who has screened thousands of new-grad software engineering applications for fintech companies. You know what a hiring manager looks for in the first ten seconds.

CONTEXT
I'm a graduate student in computer science, graduating in May 2027, targeting backend and infrastructure roles. Use my resume (resume.txt, attached under SOURCE FILES) as the only source of facts about me.

TASK
Write a cover letter for Stripe's new-grad software engineer role. Lead with the project most relevant to payments infrastructure, connect it to the role, and close with a specific ask.

CONSTRAINTS
- Professional, concise and direct.
- No em dashes and no buzzwords like "passionate".
- Never invent experience, numbers or employers that are not in my resume.

OUTPUT FORMAT
Three short paragraphs and a one-line sign-off, as plain text ready to paste.

SUCCESS CRITERIA
- A recruiter sees the fit within the first two sentences.
- Every claim about me traces to resume.txt.
===ASSUMPTIONS===
- I am applying for roles in the United States.
- I can start full-time in July 2027.`;

/* ---------- overlay: captions, cursor, honesty badge ---------- */
const OVERLAY_CSS = `
#demo-cap{position:fixed;z-index:2147483647;max-width:740px;background:#0D1812;color:#F2F5F1;border-radius:16px;
  padding:14px 20px 16px;box-shadow:0 18px 40px -12px rgba(0,0,0,.55);font-family:"Segoe UI",system-ui,sans-serif;pointer-events:none;
  border:1px solid rgba(128,205,162,.35);transition:opacity .35s ease, transform .35s ease;opacity:0;transform:translateY(-6px)}
#demo-cap.on{opacity:1;transform:none}
#demo-cap.tl{left:24px;top:20px}#demo-cap.br{right:24px;bottom:22px}
#demo-cap .k{font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#80CDA2}
#demo-cap .t{font-family:Cambria,Georgia,serif;font-size:25px;line-height:1.22;margin-top:4px;font-weight:600}
#demo-cap .s{font-size:15px;line-height:1.4;color:#B9C7BF;margin-top:6px}
#demo-cursor{position:fixed;left:0;top:0;z-index:2147483647;width:22px;height:22px;pointer-events:none;
  transition:transform .55s cubic-bezier(.3,.7,.2,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
#demo-ring{position:fixed;z-index:2147483647;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:3px solid #F284A4;pointer-events:none;opacity:0}
#demo-ring.go{animation:demoRing .5s ease-out}
@keyframes demoRing{from{opacity:.95;transform:scale(.4)}to{opacity:0;transform:scale(1.5)}}
#demo-badge{position:fixed;left:16px;bottom:10px;z-index:2147483647;font:600 11px "Segoe UI",system-ui,sans-serif;color:#fff;
  background:rgba(13,24,18,.78);padding:4px 9px;border-radius:999px;pointer-events:none;letter-spacing:.02em}
#demo-badge.ext{left:auto;bottom:auto;right:16px;top:12px}`;

async function overlay(page) {
  await page.evaluate(([css, cursorAt]) => {
    if (document.getElementById("demo-cap")) return;
    const st = document.createElement("style"); st.textContent = css; document.documentElement.appendChild(st);
    const cap = document.createElement("div"); cap.id = "demo-cap"; cap.className = "tl"; cap.innerHTML = '<div class="k"></div><div class="t"></div><div class="s"></div>';
    const cur = document.createElement("div"); cur.id = "demo-cursor";
    cur.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 2l17 10-7.5 1.6L9 21z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    cur.style.transform = `translate(${cursorAt[0]}px,${cursorAt[1]}px)`;
    const ring = document.createElement("div"); ring.id = "demo-ring";
    const badge = document.createElement("div"); badge.id = "demo-badge"; badge.textContent = "Demo · local mock sites · model reply mocked";
    if (location.protocol === "chrome-extension:") badge.classList.add("ext");
    document.documentElement.append(cap, ring, cur, badge);
  }, [OVERLAY_CSS, cursor]);
}
let cursor = [W / 2, H / 2];
async function caption(page, k, t, s, pos = "tl") {
  await page.evaluate(([k, t, s, pos]) => {
    const c = document.getElementById("demo-cap"); c.classList.remove("on");
    setTimeout(() => {
      c.className = pos; c.querySelector(".k").textContent = k; c.querySelector(".t").textContent = t;
      c.querySelector(".s").textContent = s || ""; c.querySelector(".s").style.display = s ? "" : "none";
      requestAnimationFrame(() => c.classList.add("on"));
    }, 260);
  }, [k, t, s, pos]);
  await wait(600);
}
async function hideCaption(page) { await page.evaluate(() => document.getElementById("demo-cap").classList.remove("on")); await wait(350); }
async function moveTo(page, loc) {
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const b = await loc.boundingBox();
  if (!b) throw new Error("no box for " + loc);
  cursor = [b.x + Math.min(b.width / 2, 60), b.y + b.height / 2];
  await page.evaluate(([x, y]) => { document.getElementById("demo-cursor").style.transform = `translate(${x - 3}px,${y - 2}px)`; }, cursor);
  await page.mouse.move(cursor[0], cursor[1], { steps: 6 });
  await wait(580);
}
async function click(page, loc, pause = 350) {
  await moveTo(page, loc);
  await page.evaluate(([x, y]) => { const r = document.getElementById("demo-ring"); r.style.left = x + "px"; r.style.top = y + "px"; r.classList.remove("go"); void r.offsetWidth; r.classList.add("go"); }, cursor);
  await loc.click();
  await wait(pause);
}
async function shot(page, name) {
  await page.evaluate(() => ["demo-cap", "demo-cursor", "demo-badge"].forEach(id => { const e = document.getElementById(id); if (e) e.style.visibility = "hidden"; }));
  await page.screenshot({ path: path.join(MEDIA, name) });
  await page.evaluate(() => ["demo-cap", "demo-cursor", "demo-badge"].forEach(id => { const e = document.getElementById(id); if (e) e.style.visibility = ""; }));
}
async function card(page, html) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;background:radial-gradient(1200px 700px at 30% 20%,#1E3428 0,#0F1612 60%);color:#E4EBE6;font-family:"Segoe UI",system-ui,sans-serif}
    .c{height:100%;display:flex;flex-direction:column;justify-content:center;padding:0 110px}
    .orb{width:84px;height:84px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#98D9B0 0,#2E6B4A 45%,#123222 100%);box-shadow:inset -6px -8px 16px rgba(0,0,0,.4),0 20px 50px -10px rgba(128,205,162,.35)}
    h1{font-family:Cambria,Georgia,serif;font-size:64px;line-height:1.05;margin:30px 0 0;letter-spacing:-.02em}
    p{font-size:24px;line-height:1.45;color:#B9C7BF;max-width:900px;margin:22px 0 0}
    .k{font-size:15px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#80CDA2;margin-top:34px}
    .row{display:flex;gap:14px;flex-wrap:wrap;margin-top:30px}.pill{border:1px solid #2F4A3B;border-radius:999px;padding:8px 16px;font-size:18px;color:#E4EBE6;background:#17211C}
    b{color:#80CDA2}
    .fade{animation:f .8s ease both}@keyframes f{from{opacity:0;transform:translateY(10px)}to{opacity:1}}
  </style></head><body><div class="c fade">${html}</div></body></html>`);
}

/* ---------- run ---------- */
(async () => {
  fs.mkdirSync(MEDIA, { recursive: true });
  const { ctx, storage, sw, extId } = await launch({
    open: true,
    onApi: (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ content: [{ type: "text", text: MODEL_REPLY }] }) }),
    launchOptions: { viewport: { width: W, height: H }, recordVideo: { dir: VID_DIR, size: { width: W, height: H } } }
  });
  const P = (page, sel) => page.locator("#pepper-host").locator(sel);
  const marks = [];
  let t0;
  const mark = (name) => marks.push({ name, t: (Date.now() - t0) / 1000 });

  await storage.set({
    pepper_profile: { answers: ANSWERS, completed: true },
    pepper_memories: [{ id: "m1", text: "I graduate in May 2027.", active: true }, { id: "m2", text: "I'm targeting backend and infrastructure roles.", active: true }],
    pepper_files: [{ id: "f1", name: "resume.txt", type: "text/plain", size: RESUME.length, text: RESUME, addedAt: new Date().toISOString() }],
    pepper_projects: [PROJECT], pepper_active_project: "p1"
  });
  for (const s of ["chatgpt", "claude", "gemini", "perplexity", "copilot"]) await storage.consent(s, true);
  await storage.patch("pepper_settings", { onboarded: true });

  const page = await ctx.newPage();
  t0 = Date.now();
  try {
    /* 0 · title */
    await card(page, `<div class="orb"></div><h1>Pepper — The Personal<br>AI Prompter</h1><p>Type a few words. Get a six-part prompt built only from what you've told Pepper about yourself, placed in the chat box of the AI you already use.</p>`);
    mark("title"); await wait(4200);

    /* 1 · the problem */
    await page.goto("https://chatgpt.com/"); await page.waitForTimeout(900); await overlay(page);
    mark("problem");
    await caption(page, "ChatGPT · local mock page", "Maya needs a cover letter.", "She's a CS grad student applying for new-grad backend roles.");
    await click(page, page.locator("#prompt-textarea"));
    await page.keyboard.type("cover letter stripe swe", { delay: 70 });
    await wait(700);
    await caption(page, "The problem", "Five words in, a generic letter out.", "The AI doesn't know her, her resume, or what a good answer looks like.");
    await wait(2300);
    await page.evaluate(() => { document.getElementById("prompt-textarea").innerHTML = ""; });

    /* 2 · compose */
    mark("compose");
    await caption(page, "01 · Compose", "She opens Pepper and types what she wants.", "The peppercorn sits on all five sites. Alt+Shift+P works too.");
    await click(page, P(page, "#orb"), 700);
    await click(page, P(page, "#raw"), 200);
    await P(page, "#raw").pressSequentially("write a cover letter for the Stripe new-grad SWE role", { delay: 32 });
    await wait(500);
    await moveTo(page, P(page, "#lenses"));
    await caption(page, "01 · Compose", "Six approaches. Pepper starts on Balanced.", "Once she has rated a few replies, it starts on whatever has worked best for her.");
    await wait(1400);
    await click(page, P(page, "#go"), 900);
    mark("result");
    await caption(page, "02 · Result", "A six-part prompt, built from her profile.", "Role, Context, Task, Constraints, Output format, Success criteria. This one is the on-device template, with no API key.");
    await wait(1200);
    await shot(page, "shot-template.png");
    for (let i = 0; i < 6; i++) { await P(page, "#prompt").evaluate(el => el.scrollBy({ top: 95, behavior: "smooth" })); await wait(520); }
    await P(page, "#prompt").evaluate(el => el.scrollTo({ top: 0, behavior: "smooth" }));
    await wait(500);

    /* 3 · rewrite */
    mark("rewrite");
    await caption(page, "03 · Adjust", "One-click rewrites.", "Shorter, Longer, More formal, More casual. Watch the word count.");
    await click(page, P(page, '#tools button[data-t="expand"]'), 900);
    await click(page, P(page, '#tools button[data-t="casual"]'), 900);
    await click(page, P(page, '#tools button[data-t="pro"]'), 700);

    /* 4 · insert, send, rate */
    mark("insert");
    await caption(page, "04 · Insert", "Pepper puts it in ChatGPT's box. It never presses send.", "Insert types nothing and clicks nothing. Maya reads it first.");
    await click(page, P(page, "#insert"), 1800);
    await shot(page, "shot-inserted.png");
    await caption(page, "04 · Insert", "Maya presses send herself.", "With learning on for this site, Pepper saves the prompt and the new reply, in her browser only.");
    await click(page, page.locator('button[data-testid="send-button"]'), 300);
    await P(page, "#rate").waitFor({ state: "visible", timeout: 15000 });
    mark("rate");
    await caption(page, "05 · Rate", "She rates the reply.", "Ratings on prompts Pepper wrote teach it which approach works for her.");
    await moveTo(page, P(page, '#rate .star[data-n="3"]'));
    await wait(1100);
    await click(page, P(page, '#rate .star[data-n="5"]'), 1500);

    /* 5 · model path with assumptions */
    await storage.patch("pepper_settings", { provider: "anthropic", apiKey: "sk-ant-demo-not-a-real-key" });
    await page.reload(); await page.waitForTimeout(1000); await overlay(page);
    mark("model");
    await caption(page, "06 · Her own model", "With her Anthropic or OpenAI key, her model writes the prompt.", "Her resume goes along as a labelled data block. (The model reply is mocked in this demo.)");
    await click(page, P(page, "#orb"), 600);
    if (await P(page, "#result").isVisible()) await click(page, P(page, "#back"), 400);
    await click(page, P(page, "#raw"), 150);
    await P(page, "#raw").fill("");
    await P(page, "#raw").pressSequentially("write a cover letter for the Stripe new-grad SWE role", { delay: 18 });
    await click(page, P(page, "#go"), 600);
    for (let i = 0; i < 50 && !(await P(page, "#engine").textContent()).startsWith("Expanded with your model"); i++) await wait(100);
    await wait(1000);
    await P(page, "#assume").scrollIntoViewIfNeeded();
    mark("assume");
    await caption(page, "07 · Assumptions", "Anything the model guessed about her is held back.", "The guesses are listed in pink. None of them are in the prompt until she says they're true.");
    await wait(1600);
    await shot(page, "shot-assumptions.png");
    await click(page, P(page, '#assume .as[data-i="0"] button[data-a="add"]'), 900);
    await click(page, P(page, '#assume .as[data-i="1"] button[data-a="dismiss"]'), 900);
    await caption(page, "07 · Assumptions", "She confirms one and dismisses the other.", "The confirmed fact goes into Context. The dismissed one never reaches the AI.");
    await wait(1400);
    await click(page, P(page, "#insert"), 1600);
    await page.evaluate(() => { const b = document.getElementById("prompt-textarea"); b.scrollTop = b.scrollHeight; });
    await caption(page, "07 · Assumptions", "Prompt in, resume attached as data, guesses left out.", "A file that says “ignore previous instructions” can't change the Role.");
    await wait(2600);
    await page.evaluate(() => { document.getElementById("prompt-textarea").innerHTML = ""; });
    await storage.patch("pepper_settings", { provider: "none", apiKey: "" });

    /* 6 · the other sites */
    mark("sites");
    for (const [url, name] of [["https://claude.ai/", "Claude"], ["https://gemini.google.com/", "Gemini"], ["https://www.perplexity.ai/", "Perplexity"]]) {
      await page.goto(url); await page.waitForTimeout(900); await overlay(page);
      await caption(page, `${name} · local mock page`, `Same Pepper on ${name}.`, "The panel follows each site's light or dark theme.");
      await click(page, P(page, "#orb"), 400);
      await click(page, P(page, "#raw"), 100);
      await P(page, "#raw").pressSequentially("summarize this article for my manager", { delay: 14 });
      await click(page, P(page, "#go"), 900);
      await click(page, P(page, "#insert"), 1100);
    }

    /* 7 · learning */
    const ctx0 = C.buildContext({ profile: { answers: ANSWERS }, memories: [], projects: [PROJECT], activeProjectId: "p1" });
    const now = Date.now();
    const seed = [["rewrite my resume summary for infrastructure roles", "role", 5], ["tailor my resume bullets to this job description", "role", 5],
      ["cover letter for a fintech backend new-grad role", "auto", 3], ["short thank-you note after a phone screen", "auto", 2],
      ["follow-up email to a recruiter after my onsite", "clarify", 4]].map(([raw, lens, rating], i) => ({
      id: "seed" + i, site: "chatgpt.com", assisted: true, similarity: 0.97, lens, rating, projectType: "Job applications", projectId: "p1", raw,
      prompt: C.template(raw, ctx0, lens), ts: new Date(now - (10 - i) * 864e5).toISOString(), response: "(reply)", partial: false }));
    await storage.set({ pepper_history: [...(await storage.get("pepper_history")), ...seed] });
    await sw.evaluate(() => recomputeLearning());
    await page.goto("https://chatgpt.com/"); await page.waitForTimeout(1000); await overlay(page);
    mark("learn");
    await caption(page, "08 · Learning", "A week later, after more ratings…", "Learning is per site, and off on all five until she turns it on.");
    await click(page, P(page, "#orb"), 900);
    await moveTo(page, P(page, "#learnedNote"));
    await caption(page, "08 · Learning", "Pepper starts on her best approach, and says why.", "Expert role: her average 5.0 stars across 2 ratings. Her best-rated past requests become suggestions.");
    await wait(2600);
    await shot(page, "shot-learned.png");
    await moveTo(page, P(page, "#sugs"));
    await wait(1200);

    /* 8 · dashboard */
    await page.goto(`chrome-extension://${extId}/dashboard.html#home`); await page.waitForTimeout(800); await overlay(page);
    mark("dashboard");
    await caption(page, "09 · Dashboard", "Everything lives in her browser.", "Profile, memories, projects and files, history. No Pepper server, account or analytics.", "br");
    await wait(2600);
    await shot(page, "shot-dashboard.png");
    await click(page, page.locator('#nav a[data-s="learned"]'), 700);
    await caption(page, "09 · Dashboard", "Every number Pepper learned, with a Reset.", "Approach and target length for each kind of work.", "br");
    await page.mouse.wheel(0, 260); await wait(2200);
    await click(page, page.locator('#nav a[data-s="privacy"]'), 700);
    await caption(page, "09 · Dashboard", "She decides what Pepper may keep.", "One switch per site. Export, delete one record, or clear everything.", "br");
    await wait(2800);
    await hideCaption(page);

    /* 9 · end */
    await card(page, `<div class="orb"></div><h1>Pepper v0.3</h1>
      <div class="row"><span class="pill"><b>75</b> unit tests</span><span class="pill"><b>20</b> browser checks</span><span class="pill">Manifest V3</span><span class="pill"><b>2</b> permissions</span><span class="pill">no server</span></div>
      <p class="k">Try it in your browser</p><p style="margin-top:8px;color:#E4EBE6">${SITE_URL}</p>
      <p class="k">Code</p><p style="margin-top:8px;color:#E4EBE6">${REPO}</p>`);
    mark("end"); await wait(4500);
    mark("done");
  } finally {
    const video = page.video();
    await ctx.close();
    const src = await video.path();
    const webm = path.join(MEDIA, "raw.webm");
    fs.copyFileSync(src, webm);
    fs.rmSync(VID_DIR, { recursive: true, force: true });
    fs.writeFileSync(path.join(MEDIA, "scenes.json"), JSON.stringify(marks, null, 2));
    console.log("scenes:", marks.map(m => `${m.name}@${m.t.toFixed(1)}`).join("  "));
    encode(webm, marks);
  }
})().catch(e => { console.error(e); process.exit(1); });

/* ---------- ffmpeg ---------- */
function ff(args) {
  const r = spawnSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed: " + args.join(" "));
}
function encode(webm, marks) {
  const at = (n) => (marks.find(m => m.name === n) || {}).t;
  const start = at("title"), end = at("done");
  const mp4 = path.join(MEDIA, "pepper-demo.mp4");
  ff(["-ss", String(start), "-to", String(end), "-i", webm, "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", "-an", mp4]);
  // poster: the finished six-part prompt
  ff(["-ss", String(at("result") - start + 2.2), "-i", mp4, "-frames:v", "1", path.join(MEDIA, "poster.png")]);
  // README gif: compose → insert, the core loop, sped up 1.25x
  const g0 = at("compose") - start, g1 = at("rate") - start + 2.5;
  const pal = path.join(MEDIA, "palette.png");
  const vf = "setpts=PTS/1.25,fps=12,scale=960:-1:flags=lanczos";
  ff(["-ss", String(g0), "-to", String(g1), "-i", mp4, "-vf", vf + ",palettegen=max_colors=160:stats_mode=diff", pal]);
  ff(["-ss", String(g0), "-to", String(g1), "-i", mp4, "-i", pal, "-lavfi", vf + "[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", path.join(MEDIA, "pepper-demo.gif")]);
  fs.rmSync(pal); fs.rmSync(webm);
  // README panel crops (the panel's position is fixed at this viewport)
  for (const [n, top] of [["template", 99], ["assumptions", 72], ["learned", 72]])
    ff(["-i", path.join(MEDIA, `shot-${n}.png`), "-vf", `crop=432:${726 - top}:836:${top}`, path.join(MEDIA, `panel-${n}.png`)]);
  for (const f of ["pepper-demo.mp4", "pepper-demo.gif", "poster.png"]) console.log(f, (fs.statSync(path.join(MEDIA, f)).size / 1e6).toFixed(2) + " MB");
}
