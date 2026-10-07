/* ==========================================================================
   Pepper — The Personal AI Prompter · content script (v0.3)
   M1 site adapter + input bridge · M3/M4 expansion and assumptions UI ·
   M5 consent check at send time · M6 recorder and capture.
   Runs only on the five tier-1 sites (manifest + site table).
   ========================================================================== */
(() => {
  if (window.__pepperInjected) return;
  window.__pepperInjected = true;
  const C = globalThis.PepperCore;
  const HOST = location.host;
  const SITE = C.siteForHost(HOST);
  if (!C || !SITE) return; // never run outside the five sites

  /* ---------------- state ---------------- */
  const S = {
    settings: { enabled: true, minChars: 6, provider: "none" }, profile: { answers: {} }, memories: [], projects: [],
    files: [], saved: [], history: [], learning: { types: {} }, consent: {}, activeProjectId: null, ui: {}
  };
  async function loadState() {
    const s = await chrome.storage.local.get(null);
    S.settings = redactKey(s.pepper_settings || S.settings);
    S.profile = s.pepper_profile || S.profile;
    S.memories = s.pepper_memories || [];
    S.projects = s.pepper_projects || [];
    S.files = s.pepper_files || [];
    S.saved = s.pepper_saved_prompts || [];
    S.history = s.pepper_history || [];
    S.learning = s.pepper_learning || { types: {} };
    S.consent = s.pepper_consent || {};
    S.activeProjectId = s.pepper_active_project ?? null;
    S.ui = s.pepper_ui || {};
  }
  // The content script only needs to know whether a key exists; the key itself stays in the worker.
  const redactKey = (st) => ({ ...(st || {}), apiKey: st && st.apiKey ? "set" : "" });
  const store = (op) => chrome.runtime.sendMessage({ type: "STORE", op }).catch(e => ({ ok: false, error: String(e) }));
  const hasKey = () => S.settings.provider && S.settings.provider !== "none" && !!S.settings.apiKey;
  const learningOn = () => C.consentAllows(S.settings, S.consent, HOST);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const titleCase = (label) => label ? label[0] + label.slice(1).toLowerCase() : "";

  /* ---------------- UI shell (closed shadow root: page scripts can't read it) ---------------- */
  const hostEl = document.createElement("div");
  hostEl.id = "pepper-host";
  hostEl.style.cssText = "position:fixed;z-index:2147483646;right:18px;bottom:24px;pointer-events:none;";
  document.documentElement.appendChild(hostEl);
  const root = hostEl.attachShadow({ mode: "closed" });

  const ICON = {
    close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    gear: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.5h7M12.5 4.5h1M2.5 11.5h1M6.5 11.5h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="11" cy="4.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="5" cy="11.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    back: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  root.innerHTML = `
<style>
:host{all:initial}
.wrap{--sans:"Seravek","Gill Sans Nova",Ubuntu,Calibri,"DejaVu Sans","Source Sans 3",sans-serif;
  --serif:Charter,"Bitstream Charter","Sitka Text",Cambria,"Noto Serif",serif;
  --surface:#FFFFFF;--sunk:#F1F4F1;--ink:#18231D;--muted:#56655C;--line:#D6DED8;
  --pepper:#2E6B4A;--pepper-hi:#245A3D;--pepper-ink:#FFFFFF;--pepper-soft:#E4EFE8;
  --corn:#B5395F;--corn-soft:#FAEAF0;--warn:#7E4D00;--warn-soft:#FBF1DD;
  --shadow:0 22px 60px -18px rgba(14,34,24,.42),0 2px 8px rgba(14,34,24,.10);
  font-family:var(--sans);color:var(--ink);font-size:14px;line-height:1.45;
  position:relative;display:flex;flex-direction:column;align-items:flex-end;gap:10px;pointer-events:none}
/* The wrapper is as wide as its widest child; only real surfaces take clicks,
   so the empty space around the orb never blocks the site's own buttons. */
.wrap>*{pointer-events:auto}
.wrap[data-theme="dark"]{--surface:#18221D;--sunk:#111915;--ink:#E4EBE6;--muted:#9EAEA5;--line:#2B3932;
  --pepper:#80CDA2;--pepper-hi:#9BDAB6;--pepper-ink:#0E1A13;--pepper-soft:#1F3529;
  --corn:#F284A4;--corn-soft:#3B1F2A;--warn:#F0C77E;--warn-soft:#3A2F18;--shadow:0 22px 60px -14px rgba(0,0,0,.75)}
.wrap[hidden]{display:none}
*{box-sizing:border-box;font-family:inherit}
button{font:inherit;color:inherit;cursor:pointer}
:focus-visible{outline:2px solid var(--pepper);outline-offset:2px;border-radius:8px}
svg{width:16px;height:16px;display:block}

/* orb: a peppercorn */
.orb{width:48px;height:48px;border-radius:50%;border:0;padding:0;position:relative;touch-action:none;
  background:radial-gradient(circle at 34% 30%,#6FA585 0,#3C7556 22%,#22513A 58%,#173A29 100%);
  box-shadow:inset -4px -6px 10px rgba(0,0,0,.28),inset 3px 3px 6px rgba(255,255,255,.18),0 8px 22px -6px rgba(14,34,24,.55);
  transition:transform .15s ease}
.orb:hover{transform:scale(1.06)}
.orb:active{cursor:grabbing}
.orb::after{content:"";position:absolute;inset:9px 12px 15px 10px;border-radius:50%;border-top:1.5px solid rgba(255,255,255,.22);transform:rotate(-18deg)}
.orb .dot{position:absolute;top:1px;right:1px;width:12px;height:12px;border-radius:50%;background:var(--corn);
  border:2px solid var(--surface);display:none}
.orb.typed .dot{display:block}
.orb.rec{box-shadow:0 0 0 3px var(--corn),inset -4px -6px 10px rgba(0,0,0,.28),0 8px 22px -6px rgba(14,34,24,.55);animation:rec 1.8s ease-in-out infinite}
@keyframes rec{50%{box-shadow:0 0 0 7px transparent,inset -4px -6px 10px rgba(0,0,0,.28),0 8px 22px -6px rgba(14,34,24,.55)}}

/* surfaces */
.panel,.rate,.toast{background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow)}
.panel{width:min(420px,calc(100vw - 32px));max-height:min(80vh,740px);border-radius:18px;display:none;flex-direction:column;overflow:hidden}
.panel.show{display:flex}
.ph{display:flex;align-items:center;gap:8px;padding:12px 12px 10px 16px;border-bottom:1px solid var(--line)}
.mark{width:14px;height:14px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#6FA585,#22513A 60%);flex:none}
.pname{font-family:var(--serif);font-size:17px;font-weight:600;letter-spacing:-.01em;margin-right:auto}
select.proj{max-width:170px;height:30px;border-radius:999px;border:1px solid var(--line);background:var(--sunk);color:var(--ink);padding:0 26px 0 12px;font-size:12.5px;
  appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);
  background-position:calc(100% - 14px) 13px,calc(100% - 10px) 13px;background-size:4px 4px;background-repeat:no-repeat}
.icon{width:30px;height:30px;border-radius:9px;border:0;background:transparent;display:grid;place-items:center;color:var(--muted)}
.icon:hover{background:var(--sunk);color:var(--ink)}
.body{padding:14px 16px 16px;overflow:auto;overscroll-behavior:contain}
label.lbl{display:block;font-weight:600;font-size:13.5px;margin:0 0 6px}
textarea{width:100%;border:1px solid var(--line);border-radius:12px;background:var(--sunk);color:var(--ink);padding:10px 12px;font-size:14px;line-height:1.5;resize:vertical}
textarea:focus{outline:none;border-color:var(--pepper);background:var(--surface)}
.sugcap{margin-top:12px}
.sugs{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 2px}
.sug{max-width:100%;display:flex;gap:6px;align-items:baseline;border:1px solid var(--line);background:var(--surface);border-radius:10px;padding:6px 10px;font-size:12.5px;text-align:left;line-height:1.35}
.sug:hover{border-color:var(--pepper)}
.sug .k{color:var(--pepper);font-weight:600;white-space:nowrap}
.sug.worked .k{color:var(--corn)}
.sug .t{overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.lensbar{margin-top:14px}
.cap{font-size:12.5px;color:var(--muted);margin-bottom:6px}
.lenses{display:flex;flex-wrap:wrap;gap:6px}
.lens{height:30px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font-size:12.5px;position:relative}
.lens[aria-checked="true"]{border-color:var(--pepper);background:var(--pepper-soft);color:var(--pepper);font-weight:600}
.lens.best::after{content:"";position:absolute;top:-2px;right:-2px;width:8px;height:8px;border-radius:50%;background:var(--corn);border:2px solid var(--surface)}
.learned{font-size:12.5px;color:var(--muted);margin:8px 0 0;min-height:0}
.learned b{color:var(--corn);font-weight:600}
.primary{width:100%;height:44px;margin-top:14px;border:0;border-radius:12px;background:var(--pepper);color:var(--pepper-ink);font-weight:700;font-size:14.5px;display:flex;align-items:center;justify-content:center;gap:10px}
.primary:hover{background:var(--pepper-hi)}
.primary[disabled]{opacity:.5;cursor:not-allowed}
.primary kbd{font:inherit;font-size:11.5px;font-weight:500;opacity:.75;border:1px solid currentColor;border-radius:6px;padding:1px 6px}
.secondary{height:44px;padding:0 16px;margin-top:14px;border:1px solid var(--line);border-radius:12px;background:var(--surface);font-weight:600}
.secondary:hover{border-color:var(--pepper)}
.note{font-size:12.5px;color:var(--muted);margin:10px 0 0}
.note button{border:0;background:none;padding:0;color:var(--pepper);font-weight:600;text-decoration:underline;text-underline-offset:2px}
.busy .primary{position:relative;color:transparent}
.busy .primary::after{content:"Writing your prompt…";position:absolute;color:var(--pepper-ink);font-weight:600}

/* result */
.rhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.back{display:flex;align-items:center;gap:4px;border:0;background:none;padding:4px 6px 4px 0;color:var(--muted);font-size:13px}
.back:hover{color:var(--ink)}
.meta{font-size:12px;color:var(--muted);display:flex;gap:10px}
.meta .wc{color:var(--ink);font-weight:600}
.warn{display:none;font-size:12.5px;background:var(--warn-soft);color:var(--warn);border-radius:10px;padding:8px 10px;margin-bottom:10px}
.warn.show{display:block}
.prompt{border:1px solid var(--line);border-radius:14px;background:var(--sunk);max-height:300px;overflow:auto}
.sec{padding:10px 14px 11px;border-top:1px solid var(--line)}
.sec:first-child{border-top:0}
.sec-l{font-size:12px;font-weight:700;color:var(--pepper);line-height:1.3;margin-bottom:3px}
.sec-p{font-size:12px;color:var(--muted);font-style:italic;margin-bottom:4px}
.sec-b{font-family:var(--serif);font-size:13.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
.sec.pre .sec-l{color:var(--muted)}
.editor{min-height:240px;font-family:var(--serif);font-size:13.5px}
.files{display:none;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;color:var(--muted);margin-top:8px}
.files.show{display:flex}
.files label{display:flex;align-items:center;gap:6px;white-space:nowrap;color:var(--ink)}
.assume{display:none;margin-top:12px;border-radius:14px;background:var(--corn-soft);padding:10px 12px 12px;border-left:3px solid var(--corn)}
.assume.show{display:block}
.assume h3{margin:0 0 2px;font-size:13.5px;font-weight:700}
.assume p{margin:0 0 8px;font-size:12.5px;color:var(--muted)}
.as{padding:8px 0;border-top:1px solid color-mix(in srgb,var(--corn) 25%,transparent)}
.as:first-of-type{border-top:0}
.as input{width:100%;border:1px solid transparent;background:transparent;color:var(--ink);font-size:13px;padding:4px 6px;border-radius:8px;margin-left:-6px}
.as input:hover,.as input:focus{border-color:var(--line);background:var(--surface);outline:none}
.as-btns{display:flex;gap:6px;margin-top:4px;flex-wrap:wrap}
.as-btns button{height:28px;padding:0 10px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font-size:12px}
.as-btns button.yes{border-color:var(--corn);color:var(--corn);font-weight:600}
.as.done{opacity:.7}
.as.done .as-btns{display:none}
.as .state{font-size:12px;color:var(--corn);font-weight:600}
.tools{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.tools button{height:30px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font-size:12.5px}
.tools button:hover{border-color:var(--pepper)}
.tools button[disabled]{opacity:.5;cursor:wait}
.actions{display:flex;gap:8px;position:sticky;bottom:-16px;margin:0 -16px -16px;padding:0 16px 16px;background:var(--surface)}
.actions .secondary{padding:0 14px}
.actions .primary{flex:1}
.engine{font-size:12px;color:var(--muted);margin:10px 0 0}
.pf{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 16px;border-top:1px solid var(--line);font-size:12px;color:var(--muted);background:var(--sunk)}
.pf .ls{display:flex;align-items:center;gap:6px}
.pf .ls i{width:8px;height:8px;border-radius:50%;background:var(--line);display:inline-block}
.pf .ls.on i{background:var(--corn)}
.pf button{border:0;background:none;padding:0;color:var(--pepper);font-weight:600;font-size:12px}

/* rating card + toast */
.rate{width:min(320px,calc(100vw - 32px));border-radius:16px;padding:12px 14px 12px;display:none}
.rate.show{display:block}
.rate-h{display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:14px}
.rate-snip{font-family:var(--serif);font-size:12.5px;color:var(--muted);margin:6px 0 8px;max-height:56px;overflow:hidden}
.stars{display:flex;gap:4px}
.star{width:36px;height:36px;border:0;background:none;font-size:24px;line-height:1;color:var(--muted);opacity:.45;padding:0;border-radius:8px}
.star.on{opacity:1}
.star.on{color:var(--corn)}
.rate-foot{font-size:12px;color:var(--muted);margin:6px 0 0}
.toast{display:none;max-width:min(320px,calc(100vw - 32px));border-radius:12px;padding:9px 12px;font-size:13px}
.toast.show{display:block}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>

<div class="wrap" id="wrap" hidden>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>

  <section class="rate" id="rate" aria-label="Rate the reply">
    <div class="rate-h">How was that reply?<button class="icon" id="rateSkip" aria-label="Skip rating">${ICON.close}</button></div>
    <p class="rate-snip" id="rateSnip"></p>
    <div class="stars" id="stars" role="radiogroup" aria-label="Rating">
      ${[1, 2, 3, 4, 5].map(n => `<button class="star" data-n="${n}" role="radio" aria-checked="false" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`).join("")}
    </div>
    <p class="rate-foot">Your ratings teach Pepper which approach works for you.</p>
  </section>

  <section class="panel" id="panel" role="dialog" aria-label="Pepper">
    <header class="ph">
      <span class="mark" aria-hidden="true"></span><span class="pname">Pepper</span>
      <select class="proj" id="proj" aria-label="Project"></select>
      <button class="icon" id="dash" title="Open your Pepper dashboard" aria-label="Open dashboard">${ICON.gear}</button>
      <button class="icon" id="close" aria-label="Close Pepper">${ICON.close}</button>
    </header>
    <div class="body" id="body">
      <div id="compose">
        <label class="lbl" for="raw">What do you want the AI to do?</label>
        <textarea id="raw" rows="3" placeholder="e.g. write a cover letter for the Stripe new-grad SWE role"></textarea>
        <div class="cap sugcap" id="sugCap" hidden>Start from</div>
        <div class="sugs" id="sugs"></div>
        <div class="lensbar">
          <div class="cap" id="lensCap">Approach</div>
          <div class="lenses" id="lenses" role="radiogroup" aria-labelledby="lensCap"></div>
        </div>
        <p class="learned" id="learnedNote"></p>
        <button class="primary" id="go">Write my prompt <kbd id="kbd">Ctrl ↵</kbd></button>
        <p class="note" id="setupNote"></p>
      </div>
      <div id="result" hidden>
        <div class="rhead">
          <button class="back" id="back">${ICON.back}Change request</button>
          <span class="meta"><span class="wc" id="wc"></span><span id="target"></span></span>
        </div>
        <div class="warn" id="warn" role="alert"></div>
        <div class="prompt" id="prompt" tabindex="0" aria-label="Your prompt"></div>
        <textarea class="editor" id="editor" hidden aria-label="Edit your prompt"></textarea>
        <div class="files" id="files"><span id="filesUsed"></span><label><input type="checkbox" id="attach" checked> Attach file text</label></div>
        <div class="assume" id="assume" aria-live="polite"></div>
        <div class="tools" id="tools">
          <button data-t="shorten">Shorter</button><button data-t="expand">Longer</button>
          <button data-t="pro">More formal</button><button data-t="casual">More casual</button>
          <button id="editBtn">Edit</button>
        </div>
        <p class="engine" id="engine"></p>
        <div class="actions">
          <button class="primary" id="insert">Insert into ${esc(SITE.name)}</button>
          <button class="secondary" id="copy">Copy</button>
          <button class="secondary" id="saveBtn" title="Keep this prompt under Saved prompts">Save</button>
        </div>
      </div>
    </div>
    <footer class="pf">
      <span class="ls" id="ls"><i></i><span id="lsText"></span></span>
      <button id="lsBtn"></button>
    </footer>
  </section>

  <button class="orb" id="orb" aria-label="Open Pepper (Alt+Shift+P)" title="Pepper (Alt+Shift+P)"><span class="dot" aria-hidden="true"></span></button>
</div>`;

  const $ = (id) => root.getElementById(id);
  const wrap = $("wrap"), orb = $("orb"), panel = $("panel"), rate = $("rate");
  $("kbd").textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ ↵" : "Ctrl ↵";

  /* ---------------- theme follows the host page ---------------- */
  function pageIsDark() {
    const pick = (el) => el && getComputedStyle(el).backgroundColor;
    let bg = pick(document.body);
    if (!bg || /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) bg = pick(document.documentElement);
    const m = String(bg || "").match(/\d+(\.\d+)?/g);
    if (!m || (m.length === 4 && +m[3] === 0)) return matchMedia("(prefers-color-scheme: dark)").matches;
    const [r, g, b] = m.map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.45;
  }
  const applyTheme = () => { wrap.dataset.theme = pageIsDark() ? "dark" : "light"; };

  /* ---------------- keep page shortcuts from stealing keys typed in Pepper ---------------- */
  // Some sites focus their own composer when you type anywhere. Events from inside
  // Pepper are handled here and stopped before the page sees them; typing still works.
  function shieldKeys(e) {
    if (!e.composedPath().includes(hostEl)) return;
    if (e.type === "keydown") panelKey(e);
    e.stopImmediatePropagation();
  }
  ["keydown", "keyup", "keypress", "paste", "copy", "cut"].forEach(t => window.addEventListener(t, shieldKeys, true));

  function panelKey(e) {
    const active = root.activeElement;
    if (e.key === "Escape") { if (panel.classList.contains("show")) { e.preventDefault(); closePanel(); orb.focus(); } return; }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && active === $("raw")) { e.preventDefault(); runExpand(); }
  }

  /* ---------------- orb: click to open, drag to move ---------------- */
  let drag = null;
  orb.addEventListener("pointerdown", (e) => {
    drag = { y: e.clientY, bottom: parseInt(hostEl.style.bottom, 10) || 24, moved: false };
    orb.setPointerCapture(e.pointerId);
  });
  orb.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dy = drag.y - e.clientY;
    if (Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) hostEl.style.bottom = Math.max(8, Math.min(innerHeight - 64, drag.bottom + dy)) + "px";
  });
  orb.addEventListener("pointerup", () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (moved) { store({ op: "objPatch", key: "pepper_ui", patch: { [SITE.id]: { bottom: parseInt(hostEl.style.bottom, 10) } } }); return; }
    togglePanel();
  });
  orb.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); togglePanel(); } });

  /* ---------------- panel state ---------------- */
  let currentLens = "auto", lensSource = "auto", out = null, attachFiles = true;
  let lastInsert = null; // {insertedAt, insertedText, raw, lens, lensSource, projectId, projectType, engine}

  const ctxNow = () => C.buildContext({ ...S, siteName: SITE.name });

  function togglePanel() { panel.classList.contains("show") ? closePanel() : openPanel(); }
  function openPanel() {
    if (S.settings.enabled === false) return;
    applyTheme();
    rate.classList.remove("show");
    renderProjects(); pickLearnedLens(); renderLenses(); renderSugs(); renderFooter(); renderSetup();
    const raw = $("raw");
    if (!raw.value.trim()) raw.value = getInputText().trim();
    panel.classList.add("show");
    orb.classList.remove("typed");
    setTimeout(() => (out ? $("insert") : raw).focus(), 0);
  }
  function closePanel() { panel.classList.remove("show"); }
  $("close").onclick = () => { closePanel(); orb.focus(); };
  $("dash").onclick = () => chrome.runtime.sendMessage({ type: "OPEN_PAGE", page: "dashboard.html" });
  $("back").onclick = () => showCompose();

  function renderProjects() {
    const sel = $("proj");
    sel.innerHTML = `<option value="">No project</option>` + S.projects.map(p =>
      `<option value="${esc(p.id)}" ${String(p.id) === String(S.activeProjectId) ? "selected" : ""}>${esc(p.name)}</option>`).join("");
    sel.onchange = async () => {
      S.activeProjectId = sel.value || null;
      await store({ op: "set", key: "pepper_active_project", value: S.activeProjectId });
      lensSource = "auto"; pickLearnedLens(); renderLenses(); renderSugs();
    };
  }

  function learnedFor(type) { return (S.learning.types || {})[type] || null; }
  function pickLearnedLens() {
    if (lensSource === "user") return;
    const L = learnedFor(ctxNow().projectType);
    if (L && L.lens && L.lens !== "auto") { currentLens = L.lens; lensSource = "learned"; }
    else { currentLens = "auto"; lensSource = "auto"; }
  }
  function renderLenses() {
    const type = ctxNow().projectType;
    const L = learnedFor(type);
    $("lenses").innerHTML = C.LENSES.map(l =>
      `<button class="lens${L && L.lens === l.id && l.id !== "auto" ? " best" : ""}" role="radio" aria-checked="${l.id === currentLens}" data-l="${l.id}" title="${esc(l.hint)}">${esc(l.label)}</button>`).join("");
    $("lenses").querySelectorAll(".lens").forEach(b => b.onclick = () => { currentLens = b.dataset.l; lensSource = "user"; renderLenses(); });
    const note = $("learnedNote");
    if (L && L.lens !== "auto" && lensSource === "learned") {
      note.innerHTML = `<b>Pepper chose ${esc(C.lensLabel(L.lens))}</b>: ${esc(L.reason)}.`;
    } else if (L && L.lens !== "auto") {
      note.innerHTML = `Your best approach for ${esc(type)} is <b>${esc(C.lensLabel(L.lens))}</b> (marked with a dot).`;
    } else if (learningOn()) {
      const need = L ? L.needed : C.MIN_RATINGS;
      const what = type === "General" ? "prompts written with Pepper" : `${type} prompts`;
      note.textContent = need > 0 ? `Rate ${need} more ${need === 1 ? "reply" : "replies"} to ${what} and Pepper will start picking the approach that works best for you.` : "";
    } else note.textContent = "";
  }
  function renderSugs() {
    const ctx = ctxNow();
    const list = C.suggestions(S, ctx);
    $("sugCap").hidden = !list.length;
    $("sugs").innerHTML = list.map((s, i) =>
      `<button class="sug ${s.kind}" data-i="${i}" title="${esc(s.text)}"><span class="k">${esc(s.label)}</span><span class="t">${esc(s.title || s.text)}</span></button>`).join("");
    $("sugs").querySelectorAll(".sug").forEach(b => b.onclick = () => {
      const s = list[+b.dataset.i];
      if (s.kind === "saved") { showResult({ engine: "saved", prompt: s.text, assumptions: [], status: "ok", raw: s.title || "", lens: currentLens, lensSource, ctx }); return; }
      $("raw").value = s.text; $("raw").focus();
      const i = s.text.indexOf("["); if (i >= 0) $("raw").setSelectionRange(i, s.text.indexOf("]", i) + 1 || s.text.length);
    });
  }
  function renderSetup() {
    const n = $("setupNote");
    const a = (S.profile && S.profile.answers) || {};
    if (!hasKey()) n.innerHTML = `Using Pepper's built-in template. <button id="addKey">Add your model key</button> for a fuller rewrite.`;
    else if (Object.keys(a).length < 5) n.innerHTML = `Pepper knows little about you yet. <button id="addKey">Answer a few questions</button> to tailor every prompt.`;
    else n.textContent = "";
    const b = root.getElementById("addKey");
    if (b) b.onclick = () => chrome.runtime.sendMessage({ type: "OPEN_PAGE", page: "dashboard.html", hash: hasKey() ? "about" : "settings" });
  }
  function renderFooter() {
    const on = learningOn();
    $("ls").classList.toggle("on", on);
    $("lsText").textContent = on ? `Learning on ${SITE.name}` : `Learning is off on ${SITE.name}`;
    $("lsBtn").textContent = on ? "What Pepper learned" : "Turn on";
    $("lsBtn").onclick = () => chrome.runtime.sendMessage({ type: "OPEN_PAGE", page: "dashboard.html", hash: on ? "learned" : "privacy" });
  }

  /* ---------------- expansion (M3) ---------------- */
  function llm(system, user, maxTokens) {
    return Promise.race([
      chrome.runtime.sendMessage({ type: "LLM", system, user, maxTokens: maxTokens || 3000 }),
      new Promise(r => setTimeout(() => r({ ok: false, error: "The model took longer than 30 seconds." }), 31000))
    ]).catch(e => ({ ok: false, error: String(e.message || e) }));
  }

  async function runExpand() {
    const raw = $("raw").value.trim();
    if (raw.length < 2) { $("raw").focus(); return; }
    const ctx = ctxNow();
    const lens = currentLens;
    setBusy(true);
    let res;
    if (hasKey()) {
      const r = await llm(C.buildSystemPrompt(ctx, lens), C.buildUserMessage(raw, ctx));
      if (r && r.ok && r.text) res = { engine: "llm", model: r.model, ...C.parseReply(r.text) };
      else res = { engine: "template", error: (r && r.error) || "No reply", prompt: C.template(raw, ctx, lens), assumptions: [], status: "ok" };
    } else {
      res = { engine: "template", noKey: true, prompt: C.template(raw, ctx, lens), assumptions: [], status: "ok" };
    }
    setBusy(false);
    showResult({ ...res, raw, lens, lensSource, ctx, overrides: {} });
  }
  $("go").onclick = runExpand;

  function setBusy(b) {
    $("compose").classList.toggle("busy", b);
    $("go").disabled = b;
    root.querySelectorAll("#tools button").forEach(x => x.disabled = b);
  }

  function showCompose() { $("result").hidden = true; $("compose").hidden = false; $("raw").focus(); }

  function showResult(o) {
    out = { edited: false, editing: false, ...o, assumptions: (o.assumptions || []).map(t => ({ text: t, state: "open" })) };
    $("compose").hidden = true; $("result").hidden = false;
    attachFiles = true; $("attach").checked = true;
    if (out.status === "malformed") { out.editing = true; }
    renderResult();
    $("body").scrollTop = 0;
  }

  function renderResult() {
    const o = out;
    const target = C.lengthTarget(o.ctx || ctxNow(), o.lens);
    $("wc").textContent = C.words(o.prompt) + " words";
    $("target").textContent = o.engine === "llm" ? `aim ${target.min}–${target.max}` : "";
    // warnings
    const w = [];
    if (o.status === "malformed") w.push("The model's reply didn't follow the expected layout, so it's shown in full. Edit it before inserting.");
    if (o.engine === "llm" && o.status === "missing") w.push("The model did not list assumptions — review before inserting.");
    const miss = C.missingSections(o.prompt);
    if (miss.length && o.status !== "malformed") w.push("Missing: " + miss.map(titleCase).join(", ") + ".");
    $("warn").textContent = w.join(" ");
    $("warn").classList.toggle("show", w.length > 0);
    // prompt view / editor
    $("prompt").hidden = o.editing; $("editor").hidden = !o.editing;
    if (o.editing) { if ($("editor").value !== o.prompt) $("editor").value = o.prompt; }
    else {
      $("prompt").innerHTML = C.splitSections(o.prompt).map(s => {
        // A beginner's "Purpose:" line is part of the prompt, but shown as a note so it doesn't read as an instruction.
        const m = s.body.match(/^Purpose: ([^\n]*)\n?/);
        const body = m ? s.body.slice(m[0].length) : s.body;
        return `<div class="sec${s.label ? "" : " pre"}"><div class="sec-l">${s.label ? esc(titleCase(s.label)) : "Note"}</div>${m ? `<div class="sec-p">${esc(m[1].charAt(0).toUpperCase() + m[1].slice(1))}</div>` : ""}<div class="sec-b">${esc(body)}</div></div>`;
      }).join("");
    }
    $("editBtn").textContent = o.editing ? "Done editing" : "Edit";
    // files
    const used = (o.ctx || ctxNow()).files.filter(f => f.text && !f.skipped);
    $("files").classList.toggle("show", used.length > 0);
    $("filesUsed").textContent = used.length ? "Using " + used.map(f => f.name + (f.truncated ? " (trimmed)" : "")).join(", ") : "";
    // assumptions
    renderAssumptions();
    // engine note
    const model = o.model ? ` (${o.model})` : "";
    $("engine").textContent =
      o.engine === "llm" ? `Expanded with your model${model}.` :
      o.engine === "saved" ? "From your saved prompts." :
      o.error ? `Your model returned: ${o.error} Used the local template instead.` :
      o.noKey ? "No API key — used the local template." : "Built with the local template.";
    const blocked = o.status === "malformed" && !o.edited;
    $("insert").disabled = blocked;
    $("insert").title = blocked ? "Edit the prompt first" : "";
  }

  function renderAssumptions() {
    const box = $("assume");
    const list = out.assumptions;
    box.classList.toggle("show", list.length > 0);
    if (!list.length) { box.innerHTML = ""; return; }
    box.innerHTML = `<h3>Pepper assumed these</h3><p>None of them are in your prompt. Add the ones that are true; fix the wording first if needed.</p>` +
      list.map((a, i) => `<div class="as ${a.state !== "open" ? "done" : ""}" data-i="${i}">
        <input value="${esc(a.text)}" aria-label="Assumption ${i + 1}" ${a.state !== "open" ? "disabled" : ""}>
        ${a.state === "open" ? `<div class="as-btns"><button class="yes" data-a="add">Add to prompt</button><button data-a="remember">Add and remember</button><button data-a="dismiss">Dismiss</button></div>`
          : `<span class="state">${a.state === "dismissed" ? "Dismissed" : a.state === "remembered" ? "Added and saved to your memories" : "Added to the prompt"}</span>`}
      </div>`).join("");
    box.querySelectorAll(".as").forEach(row => {
      const i = +row.dataset.i;
      row.querySelectorAll("button[data-a]").forEach(b => b.onclick = async () => {
        const text = row.querySelector("input").value.trim();
        const act = b.dataset.a;
        if (act === "dismiss") { out.assumptions[i].state = "dismissed"; renderAssumptions(); return; }
        if (!text) return;
        out.prompt = C.addToContext(out.prompt, text);
        out.assumptions[i] = { text, state: act === "remember" ? "remembered" : "added" };
        if (act === "remember") await store({ op: "listAdd", key: "pepper_memories", item: { id: C.uuid(), text, active: true, source: "assumption" } });
        renderResult();
      });
    });
  }

  $("editBtn").onclick = () => {
    if (out.editing) { out.prompt = $("editor").value; out.editing = false; if (out.status === "malformed") out.status = "ok"; }
    else out.editing = true;
    renderResult();
    if (out.editing) $("editor").focus();
  };
  $("editor").addEventListener("input", () => { out.prompt = $("editor").value; out.edited = true; $("insert").disabled = false; $("wc").textContent = C.words(out.prompt) + " words"; });
  $("attach").onchange = (e) => { attachFiles = e.target.checked; };

  $("saveBtn").onclick = async () => {
    if (!out) return;
    await store({ op: "listAdd", key: "pepper_saved_prompts", item: { id: C.uuid(), text: out.prompt, title: (out.raw || "").slice(0, 90),
      projectId: S.activeProjectId, createdAt: new Date().toISOString(), source: HOST } });
    toast("Saved. You'll find it under Saved prompts.");
  };

  root.querySelectorAll("#tools button[data-t]").forEach(b => b.onclick = () => runTransform(b.dataset.t));
  async function runTransform(kind) {
    if (!out) return;
    if (out.editing) { out.prompt = $("editor").value; out.editing = false; }
    setBusy(true);
    if (out.engine === "llm" && hasKey()) {
      const r = await llm(C.buildTransformSystem(), C.transformInstruction(kind) + "\n\nPROMPT:\n" + out.prompt);
      setBusy(false);
      if (r && r.ok && r.text) {
        const p = C.parseReply(r.text);
        const kept = out.assumptions.filter(a => a.state === "open").map(a => a.text);
        showResult({ ...out, ...p, assumptions: [...new Set([...kept, ...p.assumptions])], engine: "llm", model: r.model });
        return;
      }
      toast("Your model returned: " + ((r && r.error) || "no reply") + " The prompt is unchanged.");
      renderResult();
      return;
    }
    // Template engine: rebuild from the request with the new setting.
    const ov = { ...(out.overrides || {}) };
    const order = ["light", "moderate", "heavy"];
    const cur = order.indexOf(ov.tier || out.ctx.tier.id);
    if (kind === "shorten") ov.tier = order[Math.max(0, cur - 1)];
    if (kind === "expand") ov.tier = order[Math.min(2, cur + 1)];
    if (kind === "pro") ov.tone = "Professional";
    if (kind === "casual") ov.tone = "Casual";
    const hadEdits = out.edited;
    setBusy(false);
    if (!out.raw) { toast("Saved prompts can't be rebuilt. Use Edit to change it."); return; }
    showResult({ ...out, prompt: C.template(out.raw, out.ctx, out.lens, ov), overrides: ov, assumptions: [], status: "ok" });
    if (hadEdits) toast("Rebuilt from your request, so your manual edits were replaced.");
  }

  /* ---------------- input bridge (M1) ---------------- */
  let inputEl = null;
  const visible = (el) => !!(el && el.isConnected && el.getClientRects().length && el.getBoundingClientRect().width > 100);
  function findInput() {
    let list = [...document.querySelectorAll(SITE.input)].filter(visible);
    if (!list.length) list = [...document.querySelectorAll(C.GENERIC_INPUT)].filter(el => visible(el) && !hostEl.contains(el));
    return list.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0] || null;
  }
  const isField = (el) => el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
  function getInputText() {
    if (!inputEl || !inputEl.isConnected) inputEl = findInput();
    if (!inputEl) return "";
    return isField(inputEl) ? inputEl.value : (inputEl.innerText || "");
  }
  const sameText = (a, b) => C.collapse(a) === C.collapse(b) || C.similarity(a, b) >= 0.985;
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));

  /** Writes the prompt into the site's box. Never presses Enter, never clicks send. */
  async function insertIntoSite(text) {
    const el = (inputEl && inputEl.isConnected) ? inputEl : (inputEl = findInput());
    if (!el) return clipboardFallback(text);
    el.focus();
    let method;
    if (isField(el)) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      method = "value";
    } else {
      const selectAll = () => { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
      selectAll();
      const ok = document.execCommand("insertText", false, text);
      method = "insertText";
      await nextFrame();
      if (!ok || !sameText(el.innerText, text)) {
        selectAll();
        const dt = new DataTransfer(); dt.setData("text/plain", text);
        el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
        method = "paste";
      }
    }
    await nextFrame();
    const back = isField(el) ? el.value : el.innerText;
    if (!sameText(back, text)) return clipboardFallback(text);
    return { ok: true, method };
  }
  async function clipboardFallback(text) {
    try { await navigator.clipboard.writeText(text); return { ok: false, method: "clipboard" }; }
    catch (e) { return { ok: false, method: "none" }; }
  }

  $("insert").onclick = async () => {
    if (!out || $("insert").disabled) return;
    if (out.editing) out.prompt = $("editor").value;
    const text = C.composeInsert(out.prompt, (out.ctx || ctxNow()).files, attachFiles);
    const r = await insertIntoSite(text);
    lastInsert = { insertedAt: Date.now(), insertedText: text, raw: out.raw || "", lens: out.lens, lensSource: out.lensSource,
      projectId: S.activeProjectId, projectType: (out.ctx || ctxNow()).projectType, engine: out.engine };
    closePanel();
    if (r.ok) toast(`Inserted. Read it over in ${SITE.name}, then press send.`);
    else if (r.method === "clipboard") toast("Copied — paste it into the box.");
    else toast("Pepper couldn't reach the box. Use Copy in the panel instead.");
  };
  $("copy").onclick = async () => {
    if (!out) return;
    if (out.editing) out.prompt = $("editor").value;
    try { await navigator.clipboard.writeText(C.composeInsert(out.prompt, (out.ctx || ctxNow()).files, attachFiles)); toast("Copied."); }
    catch (e) { toast("Your browser blocked copying. Use Edit, then select the text."); }
  };

  /* ---------------- toast ---------------- */
  let toastTimer;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 4200);
  }

  /* ---------------- typing hint ---------------- */
  function onType() {
    const n = getInputText().trim().length;
    orb.classList.toggle("typed", n >= (S.settings.minChars || 6) && !panel.classList.contains("show"));
  }

  /* ---------------- consent (M5): re-read at every send, never cached ---------------- */
  async function canRecord() {
    const s = await chrome.storage.local.get(["pepper_settings", "pepper_consent"]);
    return C.consentAllows(s.pepper_settings, s.pepper_consent, HOST);
  }

  /* ---------------- send detection + capture (M6) ---------------- */
  let lastSend = null, pending = null;
  function onKeyDownCapture(e) {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.altKey) return;
    if (!inputEl || !(e.target === inputEl || inputEl.contains(e.target))) return;
    onSend();
  }
  function onClickCapture(e) {
    const t = e.target;
    if (!t || !t.closest || !t.closest(SITE.send)) return;
    onSend();
  }

  async function onSend() {
    const text = getInputText().trim();
    if (text.length < 2) return;
    const now = Date.now();
    if (lastSend && now - lastSend.at < 2000 && C.collapse(lastSend.text) === C.collapse(text)) return; // one send seen twice
    lastSend = { at: now, text };
    const startCount = document.querySelectorAll(SITE.response).length; // snapshot before anything async
    const ins = lastInsert; lastInsert = null; // an Insert attributes at most one send
    if (!(await canRecord())) return; // learning off or Pepper off: nothing is stored
    const att = C.attribute(text, ins, now);
    const rec = {
      id: C.uuid(), prompt: text, raw: att.assisted && ins ? ins.raw : "", assisted: att.assisted, similarity: att.similarity,
      lens: att.assisted && ins ? ins.lens : null, lensSource: att.assisted && ins ? ins.lensSource : null, engine: att.assisted && ins ? ins.engine : null,
      projectId: S.activeProjectId, projectType: att.assisted && ins ? ins.projectType : ctxNow().projectType,
      site: HOST, ts: new Date(now).toISOString(), response: "", responseChars: 0, truncated: false, partial: false, rating: null
    };
    if (pending) pending.cancelled = true;
    pending = rec;
    orb.classList.add("rec");
    capture(rec, startCount);
  }

  function capture(rec, startCount) {
    const t0 = Date.now();
    let lastText = null, lastChange = Date.now(), saved = false;
    const iv = setInterval(async () => {
      if (rec.cancelled) { clearInterval(iv); if (pending === rec) { pending = null; orb.classList.remove("rec"); } return; }
      const nodes = SITE.response ? document.querySelectorAll(SITE.response) : [];
      const text = nodes.length > startCount ? (nodes[nodes.length - 1].innerText || "").trim() : "";
      if (text !== lastText) { lastText = text; lastChange = Date.now(); }
      const busy = SITE.busy && document.querySelector(SITE.busy);
      const elapsed = Date.now() - t0;
      if (text && !busy && Date.now() - lastChange >= 1600) { clearInterval(iv); await finish(rec, text, false, saved); return; }
      if (!saved && elapsed >= 45000) { saved = true; await finish(rec, text, true, false, true); }
      if (elapsed >= 180000) { clearInterval(iv); await finish(rec, text, true, saved); }
    }, 250);
  }

  async function finish(rec, text, partial, alreadySaved, keepWatching) {
    if (rec.cancelled) return;
    if (!(await canRecord())) { rec.cancelled = true; if (pending === rec) { pending = null; orb.classList.remove("rec"); } return; } // revoked mid-capture
    const patch = { response: text.slice(0, 4000), responseChars: text.length, truncated: text.length > 4000, partial };
    if (alreadySaved) await store({ op: "listPatch", key: "pepper_history", id: rec.id, patch });
    else {
      const r = await store({ op: "listAdd", key: "pepper_history", item: { ...rec, ...patch } });
      if (!r || !r.ok) { rec.cancelled = true; orb.classList.remove("rec"); return; }
      askRating(rec, patch.response);
    }
    orb.classList.remove("rec");
    if (!keepWatching && pending === rec) pending = null;
  }

  function askRating(rec, response) {
    $("rateSnip").textContent = response ? response.slice(0, 180) + (response.length > 180 ? "…" : "") : "Pepper couldn't read this reply, but you can still rate it.";
    const stars = root.querySelectorAll(".star");
    const paint = (n) => stars.forEach(s => { const on = +s.dataset.n <= n; s.classList.toggle("on", on); s.setAttribute("aria-checked", String(+s.dataset.n === n)); });
    paint(0);
    root.querySelector(".rate-foot").textContent = rec.assisted
      ? "You sent a prompt Pepper wrote. Your rating teaches Pepper which approach works for you."
      : "Pepper keeps this rating with the prompt. Only prompts Pepper wrote change the approach it picks.";
    stars.forEach(s => {
      s.onmouseenter = () => paint(+s.dataset.n);
      s.onfocus = () => paint(+s.dataset.n);
      s.onclick = async () => {
        await store({ op: "listPatch", key: "pepper_history", id: rec.id, patch: { rating: +s.dataset.n } });
        rate.classList.remove("show");
        toast(rec.assisted ? "Thanks. Pepper will use that rating to pick your approach." : "Thanks. Rating saved.");
      };
    });
    $("stars").onmouseleave = () => paint(0);
    $("rateSkip").onclick = () => rate.classList.remove("show");
    if (!panel.classList.contains("show")) { applyTheme(); rate.classList.add("show"); }
  }

  /* ---------------- on/off (C1): a hard gate on everything ---------------- */
  let observer = null, attachTimer = null, bound = false;
  function attach() {
    const el = findInput();
    if (el && el !== inputEl) {
      if (inputEl) inputEl.removeEventListener("input", onType, true);
      inputEl = el;
      el.addEventListener("input", onType, true);
    }
  }
  function scheduleAttach() { if (attachTimer) return; attachTimer = setTimeout(() => { attachTimer = null; attach(); }, 250); }
  function bind() {
    if (bound) return; bound = true;
    attach();
    observer = new MutationObserver(scheduleAttach);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("keydown", onKeyDownCapture, true);
    document.addEventListener("click", onClickCapture, true);
  }
  function unbind() {
    if (!bound) return; bound = false;
    if (observer) observer.disconnect(); observer = null;
    if (inputEl) inputEl.removeEventListener("input", onType, true);
    document.removeEventListener("keydown", onKeyDownCapture, true);
    document.removeEventListener("click", onClickCapture, true);
    if (pending) { pending.cancelled = true; pending = null; }
    orb.classList.remove("rec", "typed");
  }
  function applyEnabled() {
    const on = S.settings.enabled !== false;
    wrap.hidden = !on;
    if (on) bind(); else { closePanel(); rate.classList.remove("show"); unbind(); }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !msg) return;
    if (msg.type === "TOGGLE_PANEL" && S.settings.enabled !== false) togglePanel();
    if (msg.type === "OPEN_PANEL" && S.settings.enabled !== false && !panel.classList.contains("show")) togglePanel();
    // The popup asks which site this tab is, so it needs no "tabs" permission.
    if (msg.type === "WHO") sendResponse({ site: SITE.id, name: SITE.name, host: HOST });
  });

  /* ---------------- boot ---------------- */
  (async function boot() {
    await loadState();
    const pos = S.ui && S.ui[SITE.id] && S.ui[SITE.id].bottom;
    if (pos) hostEl.style.bottom = Math.max(8, Math.min(innerHeight - 64, pos)) + "px";
    applyTheme();
    applyEnabled();
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== "local") return;
      const map = { pepper_settings: "settings", pepper_profile: "profile", pepper_memories: "memories", pepper_projects: "projects",
        pepper_files: "files", pepper_saved_prompts: "saved", pepper_history: "history", pepper_learning: "learning",
        pepper_consent: "consent", pepper_ui: "ui", pepper_active_project: "activeProjectId" };
      for (const [k, v] of Object.entries(map)) if (ch[k]) S[v] = ch[k].newValue ?? (v === "activeProjectId" ? null : S[v]);
      if (ch.pepper_settings) S.settings = redactKey(S.settings);
      if (ch.pepper_settings) applyEnabled();
      if ((ch.pepper_consent || ch.pepper_settings) && pending && !learningOn()) { pending.cancelled = true; } // revoked mid-capture
      if (panel.classList.contains("show")) {
        if (ch.pepper_learning || ch.pepper_active_project || ch.pepper_projects) { renderProjects(); pickLearnedLens(); renderLenses(); }
        if (ch.pepper_consent || ch.pepper_settings) { renderFooter(); renderLenses(); renderSetup(); }
        if (ch.pepper_saved_prompts || ch.pepper_history) renderSugs();
      }
    });
  })();
})();
