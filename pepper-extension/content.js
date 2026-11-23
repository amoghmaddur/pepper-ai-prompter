/* ==========================================================================
   Pepper — The Personal AI Prompter · the floating companion (v0.4)
   On the five AI sites: writes prompts, inserts them (never sends), and with
   consent records sends, replies and ratings. On any other page (when the
   user keeps Pepper floating, or summons it): fixes and improves text, keeps
   the Pocket at hand, fills forms, and hands prompts to the user's AI.
   All UI lives in a closed shadow root that page scripts can't read.
   ========================================================================== */
(() => {
  if (window.__pepperInjected) return;
  window.__pepperInjected = true;
  if (window.top !== window) return; // never inside frames
  const C = globalThis.PepperCore, A = globalThis.PepperAssist;
  if (!C || !A || !document.documentElement) return;
  const HOST = location.host;
  const SITE = C.siteForHost(HOST); // an AI site adapter, or null on any other page
  const UI_KEY = SITE ? SITE.id : HOST;

  /* ---------------- state ---------------- */
  const S = {
    settings: { enabled: true, minChars: 6, provider: "none" }, profile: { answers: {} }, memories: [], projects: [],
    pocket: [], details: {}, saved: [], history: [], learning: { types: {} }, consent: {}, activeProjectId: null, ui: {}
  };
  const KEYMAP = { pepper_settings: "settings", pepper_profile: "profile", pepper_memories: "memories", pepper_projects: "projects",
    pepper_pocket: "pocket", pepper_details: "details", pepper_saved_prompts: "saved", pepper_history: "history",
    pepper_learning: "learning", pepper_consent: "consent", pepper_ui: "ui", pepper_active_project: "activeProjectId" };
  async function loadState() {
    const s = await chrome.storage.local.get(Object.keys(KEYMAP));
    for (const [k, v] of Object.entries(KEYMAP)) if (s[k] !== undefined) S[v] = s[k];
    S.settings = redactKey(S.settings);
  }
  // The content script only needs to know whether a key exists; the key itself stays in the worker.
  const redactKey = (st) => ({ ...(st || {}), apiKey: st && st.apiKey ? "set" : "" });
  const store = (op) => chrome.runtime.sendMessage({ type: "STORE", op }).catch(e => ({ ok: false, error: String(e) }));
  const send = (msg) => chrome.runtime.sendMessage(msg).catch(e => ({ ok: false, error: String(e && e.message || e) }));
  const hasKey = () => S.settings.provider && S.settings.provider !== "none" && !!S.settings.apiKey;
  const learningOn = () => !!SITE && C.consentAllows(S.settings, S.consent, HOST);
  const ready = () => A.setupComplete(S.profile, S.settings);
  const feature = (id) => ({ ...A.defaultFeatures(), ...(S.settings.features || {}) })[id];
  const answers = () => (S.profile && S.profile.answers) || {};
  const fav = () => A.favorites(answers())[0];
  const files = () => (S.pocket || []).filter(i => i.kind === "file");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const titleCase = (label) => label ? label[0] + label.slice(1).toLowerCase() : "";
  const words = (s) => C.words(s);
  const uiFor = () => (S.ui && S.ui[UI_KEY]) || {};
  const patchUi = (patch) => store({ op: "objPatch", key: "pepper_ui", patch: { [UI_KEY]: { ...uiFor(), ...patch } } });

  /* ---------------- UI shell ---------------- */
  const hostEl = document.createElement("div");
  hostEl.id = "pepper-host";
  hostEl.style.cssText = "position:fixed;z-index:2147483646;right:18px;bottom:24px;pointer-events:none;";
  document.documentElement.appendChild(hostEl);
  const root = hostEl.attachShadow({ mode: "closed" });

  const I = {
    close: '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    gear: '<svg viewBox="0 0 16 16"><path d="M2.5 4.5h7M12.5 4.5h1M2.5 11.5h1M6.5 11.5h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="11" cy="4.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="5" cy="11.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    back: '<svg viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    write: '<svg viewBox="0 0 16 16"><path d="M3 13l1-3.5L10.5 3a1.4 1.4 0 012 2L6 11.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M12.5 10.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="currentColor"/></svg>',
    fix: '<svg viewBox="0 0 16 16"><path d="M2.5 13.5l7-7M8.5 4.5l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M11 1.5l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5zM13.5 6l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z" fill="currentColor"/></svg>',
    pocket: '<svg viewBox="0 0 16 16"><path d="M3 5h10l-.8 8.2a1 1 0 01-1 .8H4.8a1 1 0 01-1-.8z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M5.5 5V4a2.5 2.5 0 015 0v1" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    fill: '<svg viewBox="0 0 16 16"><rect x="2.5" y="2" width="11" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5 5.5h6M5 8h6M5 10.5h3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    plus: '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    file: '<svg viewBox="0 0 16 16"><path d="M4 1.8h5.2L12.5 5v9.2H4z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9 2v3.3h3.3" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    image: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="6" cy="6.5" r="1.2" fill="currentColor"/><path d="M2.5 12l3.5-3.5 2.5 2.5 2-2 3 3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    link: '<svg viewBox="0 0 16 16"><path d="M7 9a3 3 0 004.2 0l2-2a3 3 0 00-4.2-4.2l-.8.8M9 7a3 3 0 00-4.2 0l-2 2A3 3 0 007 13.2l.8-.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    snippet: '<svg viewBox="0 0 16 16"><path d="M3 4h10M3 7h10M3 10h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M11 10.5l1.5 1.5L15 9.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    person: '<svg viewBox="0 0 16 16"><circle cx="8" cy="5.5" r="2.7" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.8 14a5.2 5.2 0 0110.4 0" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    grip: '<svg viewBox="0 0 16 16"><circle cx="6" cy="4" r="1.1" fill="currentColor"/><circle cx="10" cy="4" r="1.1" fill="currentColor"/><circle cx="6" cy="8" r="1.1" fill="currentColor"/><circle cx="10" cy="8" r="1.1" fill="currentColor"/><circle cx="6" cy="12" r="1.1" fill="currentColor"/><circle cx="10" cy="12" r="1.1" fill="currentColor"/></svg>'
  };
  // Pepper, the peppercorn. Eyes blink and follow the pointer; it smiles when something worked.
  const PEPPER_SVG = (cls) => `<svg class="pep ${cls || ""}" viewBox="0 0 48 48" aria-hidden="true">
    <defs><radialGradient id="pg${cls || ""}" cx="34%" cy="28%" r="78%"><stop offset="0" stop-color="#86C29D"/><stop offset=".32" stop-color="#3E7A59"/><stop offset=".74" stop-color="#22513A"/><stop offset="1" stop-color="#163826"/></radialGradient></defs>
    <path d="M24.5 10.5c.3-3.2 1.8-5.6 4.6-7" stroke="#6B4A2B" stroke-width="2.3" fill="none" stroke-linecap="round"/>
    <path class="leaf" d="M28 4.6c3.6-2.6 7.6-2.2 10 .4-3.4 2.4-7 2.4-10-.4z" fill="#9BD8AC"/>
    <circle cx="24" cy="27.5" r="17.5" fill="url(#pg${cls || ""})"/>
    <ellipse cx="16.8" cy="19.5" rx="5.2" ry="2.8" fill="#fff" opacity=".2" transform="rotate(-28 16.8 19.5)"/>
    <g class="eyes"><g class="eye"><ellipse cx="18" cy="26.5" rx="3.7" ry="4.3" fill="#fff"/><circle class="pupil" cx="18.3" cy="27.1" r="2.05" fill="#13211A"/><circle cx="17.5" cy="26.1" r=".6" fill="#fff"/></g>
      <g class="eye"><ellipse cx="30" cy="26.5" rx="3.7" ry="4.3" fill="#fff"/><circle class="pupil" cx="30.3" cy="27.1" r="2.05" fill="#13211A"/><circle cx="29.5" cy="26.1" r=".6" fill="#fff"/></g></g>
    <g class="joy" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M14.6 27.6c1.2-2.6 5.2-2.6 6.6 0"/><path d="M26.6 27.6c1.2-2.6 5.2-2.6 6.6 0"/></g>
    <ellipse cx="12.6" cy="32.4" rx="2.6" ry="1.5" fill="#F48FB1" opacity=".6"/><ellipse cx="35.4" cy="32.4" rx="2.6" ry="1.5" fill="#F48FB1" opacity=".6"/>
    <path class="mouth" d="M21.2 33.6c1.7 1.9 4 1.9 5.6 0" stroke="#0E1B14" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  </svg>`;

  const CSS = `
:host{all:initial}
.wrap{--sans:"Segoe UI Variable Text","Segoe UI",Seravek,"Gill Sans Nova",Ubuntu,Calibri,"DejaVu Sans",system-ui,sans-serif;
  --serif:Charter,"Bitstream Charter","Sitka Text",Cambria,"Noto Serif",Georgia,serif;
  --surface:#FFFFFF;--sunk:#F1F4F1;--ink:#18231D;--muted:#56655C;--line:#D6DED8;
  --pepper:#2E6B4A;--pepper-hi:#245A3D;--pepper-ink:#FFFFFF;--pepper-soft:#E4EFE8;
  --corn:#B5395F;--corn-soft:#FAEAF0;--warn:#7E4D00;--warn-soft:#FBF1DD;
  --shadow:0 22px 60px -18px rgba(14,34,24,.42),0 2px 8px rgba(14,34,24,.10);
  font-family:var(--sans);color:var(--ink);font-size:14px;line-height:1.45;
  position:relative;display:flex;flex-direction:column;align-items:flex-end;gap:10px;pointer-events:none}
.wrap.left{align-items:flex-start}
/* Only real surfaces take clicks, so the space around Pepper never blocks the page. */
.wrap>*{pointer-events:auto}
.wrap[data-theme="dark"]{--surface:#18221D;--sunk:#111915;--ink:#E4EBE6;--muted:#9EAEA5;--line:#2B3932;
  --pepper:#80CDA2;--pepper-hi:#9BDAB6;--pepper-ink:#0E1A13;--pepper-soft:#1F3529;
  --corn:#F284A4;--corn-soft:#3B1F2A;--warn:#F0C77E;--warn-soft:#3A2F18;--shadow:0 22px 60px -14px rgba(0,0,0,.75)}
.wrap[hidden],[hidden]{display:none!important}
*{box-sizing:border-box;font-family:inherit}
button{font:inherit;color:inherit;cursor:pointer}
:focus-visible{outline:2px solid var(--pepper);outline-offset:2px;border-radius:8px}
svg{width:16px;height:16px;display:block;flex:none}

/* Pepper herself */
.orb{width:54px;height:54px;border:0;padding:0;background:none;position:relative;touch-action:none;cursor:pointer;display:grid;place-items:center;
  filter:drop-shadow(0 8px 14px rgba(14,34,24,.38));transition:transform .18s ease,opacity .2s}
.orb.small{width:46px;height:46px;opacity:.88}
.orb.small:hover{opacity:1}
.orb:hover{transform:scale(1.07) rotate(-3deg)}
.orb:active{cursor:grabbing}
.orb .pep{width:100%;height:100%;overflow:visible;animation:bob 4.2s ease-in-out infinite}
.pep .eye{transform-box:fill-box;transform-origin:center;animation:blink 5.3s infinite}
.pep .eye:last-child{animation-delay:.04s}
.pep .pupil{transform:translate(var(--px,0px),var(--py,0px));transition:transform .12s ease-out}
.pep .joy{opacity:0}
.pep .leaf{transform-box:fill-box;transform-origin:left center;animation:leaf 6s ease-in-out infinite}
.orb.happy .pep .eyes{opacity:0}.orb.happy .pep .joy{opacity:1}
.orb.happy .pep{animation:hop .7s ease-out 2}
.orb.think .pep .pupil{transform:translate(1.2px,-1.6px)}
.orb.think::after{content:"";position:absolute;top:-6px;right:-2px;width:20px;height:8px;border-radius:9px;
  background:radial-gradient(circle at 4px 4px,var(--pepper) 2px,transparent 2.5px),radial-gradient(circle at 10px 4px,var(--pepper) 2px,transparent 2.5px),radial-gradient(circle at 16px 4px,var(--pepper) 2px,transparent 2.5px);
  animation:dots 1s steps(3) infinite}
.orb.drop .pep{transform:scale(1.15)}
.orb .dot{position:absolute;top:2px;right:2px;width:13px;height:13px;border-radius:50%;background:var(--corn);border:2px solid var(--surface);display:none}
.orb.typed .dot,.orb.alert .dot{display:block}
.orb.rec .pep{filter:drop-shadow(0 0 0 var(--corn));animation:rec 1.8s ease-in-out infinite}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.5px)}}
@keyframes blink{0%,94%,100%{transform:scaleY(1)}96.5%{transform:scaleY(.1)}}
@keyframes leaf{0%,100%{transform:rotate(0)}50%{transform:rotate(-9deg)}}
@keyframes hop{0%{transform:translateY(0)}35%{transform:translateY(-7px) scale(1.04)}70%{transform:translateY(0) scale(.98)}}
@keyframes dots{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes rec{50%{filter:drop-shadow(0 0 6px var(--corn))}}

/* surfaces */
.panel,.rate,.toast,.hint{background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow)}
.panel{width:min(420px,calc(100vw - 32px));max-height:min(82vh,760px);border-radius:18px;display:none;flex-direction:column;overflow:hidden}
.panel.show{display:flex;animation:pop .16s ease-out}
@keyframes pop{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:none}}
.ph{display:flex;align-items:center;gap:8px;padding:10px 10px 8px 12px}
.ph .mini{width:26px;height:26px}
.ph .mini .pep{width:26px;height:26px}
.pname{font-family:var(--serif);font-size:17px;font-weight:600;letter-spacing:-.01em}
.chip{display:inline-flex;align-items:center;gap:5px;max-width:170px;height:24px;padding:0 9px;border-radius:999px;background:var(--sunk);color:var(--muted);font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-right:auto}
.chip.corn{background:var(--corn-soft);color:var(--corn)}
select.proj{max-width:150px;height:28px;border-radius:999px;border:1px solid var(--line);background:var(--sunk);color:var(--ink);padding:0 24px 0 10px;font-size:12.5px;
  appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);
  background-position:calc(100% - 13px) 12px,calc(100% - 9px) 12px;background-size:4px 4px;background-repeat:no-repeat}
.icon{width:30px;height:30px;border-radius:9px;border:0;background:transparent;display:grid;place-items:center;color:var(--muted);flex:none}
.icon:hover{background:var(--sunk);color:var(--ink)}
.tabs{display:flex;gap:4px;padding:0 10px 8px;border-bottom:1px solid var(--line)}
.tab{flex:1;height:32px;border:0;border-radius:9px;background:none;color:var(--muted);font-weight:600;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px}
.tab:hover{background:var(--sunk);color:var(--ink)}
.tab[aria-selected="true"]{background:var(--pepper-soft);color:var(--pepper)}
.body{padding:14px 16px 16px;overflow:auto;overscroll-behavior:contain;flex:1}
label.lbl,.lbl{display:block;font-weight:600;font-size:13.5px;margin:0 0 6px}
textarea,input[type=text],input[type=search],select.inp{width:100%;border:1px solid var(--line);border-radius:12px;background:var(--sunk);color:var(--ink);padding:9px 11px;font-size:14px;line-height:1.5}
textarea{resize:vertical}
textarea:focus,input:focus,select.inp:focus{outline:none;border-color:var(--pepper);background:var(--surface)}
.cap{font-size:12.5px;color:var(--muted);margin-bottom:6px}
.sugcap{margin-top:12px}
.sugs{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 2px}
.sug{max-width:100%;display:flex;gap:6px;align-items:baseline;border:1px solid var(--line);background:var(--surface);border-radius:10px;padding:6px 10px;font-size:12.5px;text-align:left;line-height:1.35}
.sug:hover{border-color:var(--pepper)}
.sug .k{color:var(--pepper);font-weight:600;white-space:nowrap}
.sug.worked .k{color:var(--corn)}
.sug .t{overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.lensbar{margin-top:14px}
.lenses,.kinds{display:flex;flex-wrap:wrap;gap:6px}
.lens,.kind{height:30px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font-size:12.5px;position:relative}
.lens:hover,.kind:hover{border-color:var(--pepper)}
.lens[aria-checked="true"],.kind[aria-pressed="true"]{border-color:var(--pepper);background:var(--pepper-soft);color:var(--pepper);font-weight:600}
.lens.best::after{content:"";position:absolute;top:-2px;right:-2px;width:8px;height:8px;border-radius:50%;background:var(--corn);border:2px solid var(--surface)}
.learned{font-size:12.5px;color:var(--muted);margin:8px 0 0}
.learned b{color:var(--corn);font-weight:600}
.primary{width:100%;height:44px;margin-top:14px;border:0;border-radius:12px;background:var(--pepper);color:var(--pepper-ink);font-weight:700;font-size:14.5px;display:flex;align-items:center;justify-content:center;gap:10px}
.primary:hover{background:var(--pepper-hi)}
.primary[disabled]{opacity:.5;cursor:not-allowed}
.primary kbd{font:inherit;font-size:11.5px;font-weight:500;opacity:.75;border:1px solid currentColor;border-radius:6px;padding:1px 6px}
.secondary{height:44px;padding:0 14px;margin-top:14px;border:1px solid var(--line);border-radius:12px;background:var(--surface);font-weight:600;white-space:nowrap}
.secondary:hover{border-color:var(--pepper)}
.secondary[disabled]{opacity:.5;cursor:not-allowed;border-color:var(--line)}
.secondary.sm,.primary.sm{height:34px;margin-top:0;font-size:13px;border-radius:10px;padding:0 12px}
.primary.sm{width:auto}
.note{font-size:12.5px;color:var(--muted);margin:10px 0 0}
.link,.note button{border:0;background:none;padding:0;color:var(--pepper);font-weight:600;text-decoration:underline;text-underline-offset:2px;font-size:12.5px}
.check{display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--ink);margin-top:10px}
.check input{accent-color:var(--pepper)}
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
.prompt{border:1px solid var(--line);border-radius:14px;background:var(--sunk);max-height:290px;overflow:auto}
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
.actions{display:flex;gap:8px;position:sticky;bottom:-16px;margin:0 -16px -16px;padding:0 16px 16px;background:var(--surface);align-items:flex-end}
.actions .primary{flex:1}
.sendrow{display:flex;gap:6px;align-items:center;margin-top:10px;font-size:12.5px;color:var(--muted)}
.sendrow select{height:28px;border-radius:8px;border:1px solid var(--line);background:var(--sunk);color:var(--ink);font-size:12.5px;padding:0 6px}
.engine{font-size:12px;color:var(--muted);margin:10px 0 0}

/* fix */
.srcline{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:12.5px;color:var(--muted)}
.outbox{margin-top:12px;border:1px solid var(--line);border-radius:14px;background:var(--sunk);padding:10px 12px;font-family:var(--serif);font-size:13.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;max-height:240px;overflow:auto}
.outhead{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-top:12px;font-size:12.5px}
.outhead b{font-size:13px}
.changes{font-size:12px;color:var(--muted);margin-top:6px}
.changes s{color:var(--corn)}
.row2{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}

/* pocket */
.ptools{display:flex;gap:6px}
.ptools input{height:34px;padding:6px 10px}
.filters{display:flex;gap:4px;margin:8px 0;flex-wrap:wrap}
.filters button{height:26px;padding:0 10px;border-radius:999px;border:1px solid var(--line);background:none;font-size:12px;color:var(--muted)}
.filters button[aria-pressed="true"]{background:var(--ink);color:var(--surface);border-color:var(--ink)}
.plist{display:flex;flex-direction:column;gap:6px}
.pi{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:8px 8px 8px 10px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
.pi[draggable="true"]{cursor:grab}
.pi:hover{border-color:var(--pepper)}
.pi .ic{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--sunk);color:var(--pepper)}
.pi .ic.pdf{color:#C0392B}.pi .ic.image{color:#7A4FB5}.pi .ic.link{color:#1F6FB2}.pi .ic.snippet{color:var(--corn)}
.pi .t{min-width:0}
.pi .t b{display:block;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pi .t small{display:block;font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pi .b{display:flex;gap:4px}
.pi .b button{height:26px;padding:0 9px;border-radius:8px;border:1px solid var(--line);background:var(--surface);font-size:12px;font-weight:600}
.pi .b button:hover{border-color:var(--pepper);color:var(--pepper)}
.details{display:flex;flex-wrap:wrap;gap:6px}
.det{display:flex;flex-direction:column;align-items:flex-start;max-width:100%;border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:5px 9px;text-align:left}
.det:hover{border-color:var(--pepper)}
.det small{font-size:11px;color:var(--muted);font-weight:600}
.det span{font-size:12.5px;max-width:170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pdrop{margin-top:10px;border:1.5px dashed var(--line);border-radius:12px;padding:12px;text-align:center;font-size:12.5px;color:var(--muted)}
.pdrop.over{border-color:var(--pepper);background:var(--pepper-soft);color:var(--pepper)}
.quick{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.empty{padding:16px;text-align:center;color:var(--muted);font-size:13px;border:1px dashed var(--line);border-radius:12px}
.sub{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin:14px 0 6px}

/* fill */
.fl{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;align-items:center;padding:7px 2px;border-top:1px solid var(--line);font-size:13px}
.fl:first-child{border-top:0}
.fl input{accent-color:var(--pepper)}
.fl .v{grid-column:2;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fl.done{opacity:.6}
.fbox{border:1px solid var(--line);border-radius:12px;padding:2px 10px;background:var(--surface)}
.fres{display:flex;gap:8px;align-items:center;margin-top:10px;padding:10px;border-radius:12px;background:var(--pepper-soft);font-size:12.5px}
.fres select{flex:1;min-width:0;height:30px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:12.5px}

/* gate */
.gate{text-align:center;padding:18px 8px 8px}
.gate .pep{width:84px;height:84px;margin:0 auto 6px;animation:wave 2.4s ease-in-out infinite}
@keyframes wave{0%,100%{transform:rotate(0)}20%{transform:rotate(-8deg)}40%{transform:rotate(6deg)}60%{transform:rotate(-4deg)}}
.gate h3{font-family:var(--serif);font-size:20px;margin:6px 0 6px}
.gate p{color:var(--muted);font-size:13.5px;margin:0 auto;max-width:300px}
.gate ul{list-style:none;padding:0;margin:14px auto 0;max-width:300px;text-align:left;font-size:13px}
.gate li{display:flex;gap:8px;padding:4px 0}
.gate li::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--pepper);margin-top:6px;flex:none}

.pf{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 14px;border-top:1px solid var(--line);font-size:12px;color:var(--muted);background:var(--sunk)}
.pf .ls{display:flex;align-items:center;gap:6px}
.pf .ls i{width:8px;height:8px;border-radius:50%;background:var(--line);display:inline-block}
.pf .ls.on i{background:var(--corn)}
.pf button{border:0;background:none;padding:0;color:var(--pepper);font-weight:600;font-size:12px}

/* rating card, toast, hint bubble, selection pill */
.rate{width:min(320px,calc(100vw - 32px));border-radius:16px;padding:12px 14px 12px;display:none}
.rate.show{display:block}
.rate-h{display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:14px}
.rate-snip{font-family:var(--serif);font-size:12.5px;color:var(--muted);margin:6px 0 8px;max-height:56px;overflow:hidden}
.stars{display:flex;gap:4px}
.star{width:36px;height:36px;border:0;background:none;font-size:24px;line-height:1;color:var(--muted);opacity:.45;padding:0;border-radius:8px}
.star.on{opacity:1;color:var(--corn)}
.rate-foot{font-size:12px;color:var(--muted);margin:6px 0 0}
.toast{display:none;max-width:min(320px,calc(100vw - 32px));border-radius:12px;padding:9px 12px;font-size:13px}
.toast.show{display:block;animation:pop .16s ease-out}
.hint{display:none;max-width:260px;border-radius:16px 16px 4px 16px;padding:10px 12px;font-size:13px;position:relative}
.wrap.left .hint{border-radius:16px 16px 16px 4px}
.hint.show{display:block;animation:pop .2s ease-out}
.hint p{margin:0 22px 8px 0}
.hint .x{position:absolute;top:4px;right:4px;width:24px;height:24px}
.hint .row2{margin-top:0}
.pill{position:absolute;display:none;align-items:center;gap:2px;padding:3px;border-radius:999px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);z-index:3}
.pill.show{display:flex;animation:pop .14s ease-out}
.pill .pep{width:24px;height:24px;animation:none}
.pill button{height:26px;border:0;background:none;border-radius:999px;padding:0 10px;font-size:12.5px;font-weight:700;color:var(--ink)}
.pill button:hover{background:var(--pepper-soft);color:var(--pepper)}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;

  root.innerHTML = `
<div class="wrap" id="wrap" hidden>
  <div class="pill" id="pill" role="toolbar" aria-label="Pepper for your selection">${PEPPER_SVG("p")}<button id="pillFix">Fix</button><button id="pillAsk">Ask AI</button><button id="pillSave" title="Save to your Pocket">Save</button></div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <div class="hint" id="hint" role="status" aria-live="polite"><button class="icon x" id="hintX" aria-label="Dismiss">${I.close}</button><p id="hintText"></p><div class="row2" id="hintBtns"></div></div>

  <section class="rate" id="rate" aria-label="Rate the reply">
    <div class="rate-h">How was that reply?<button class="icon" id="rateSkip" aria-label="Skip rating">${I.close}</button></div>
    <p class="rate-snip" id="rateSnip"></p>
    <div class="stars" id="stars" role="radiogroup" aria-label="Rating">
      ${[1, 2, 3, 4, 5].map(n => `<button class="star" data-n="${n}" role="radio" aria-checked="false" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`).join("")}
    </div>
    <p class="rate-foot">Your ratings teach Pepper which approach works for you.</p>
  </section>

  <section class="panel" id="panel" role="dialog" aria-label="Pepper">
    <header class="ph">
      <span class="mini">${PEPPER_SVG("m")}</span><span class="pname">Pepper</span>
      <span class="chip" id="ctxChip"></span>
      <select class="proj" id="proj" aria-label="Project"></select>
      <button class="icon" id="dash" title="Open your Pepper dashboard" aria-label="Open dashboard">${I.gear}</button>
      <button class="icon" id="close" aria-label="Close Pepper">${I.close}</button>
    </header>
    <nav class="tabs" id="tabs" role="tablist" aria-label="Pepper tools">
      <button class="tab" role="tab" data-tab="prompt">${I.write}Write</button>
      <button class="tab" role="tab" data-tab="fix">${I.fix}Fix</button>
      <button class="tab" role="tab" data-tab="pocket">${I.pocket}Pocket</button>
      <button class="tab" role="tab" data-tab="fill">${I.fill}Fill</button>
    </nav>
    <div class="body" id="body">
      <div class="gate" id="gate" hidden>
        ${PEPPER_SVG("g")}
        <h3>Hi, I'm Pepper!</h3>
        <p>Let's set me up first. It takes about two minutes, and everything I do afterwards fits the way you work.</p>
        <ul><li>Prompts written in your voice, for your goals</li><li>Your resume, links and details one click away</li><li>Help on any page you choose</li></ul>
        <button class="primary" id="gateGo">Set up Pepper</button>
      </div>

      <div data-view="prompt" hidden>
        <div id="compose">
          <label class="lbl" for="raw">What do you want the AI to do?</label>
          <textarea id="raw" rows="3" placeholder="e.g. write a cover letter for the Stripe new-grad SWE role"></textarea>
          <label class="check" id="usePageRow" hidden><input type="checkbox" id="usePage"> <span id="usePageText">Use this page</span></label>
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
            <button class="back" id="back">${I.back}Change request</button>
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
          <div class="sendrow" id="sendRow" hidden>Send to <select id="sendTo" aria-label="Which AI"></select></div>
          <div class="actions">
            <button class="primary" id="insert">Insert</button>
            <button class="secondary" id="copy">Copy</button>
            <button class="secondary" id="saveBtn" title="Keep this prompt under Saved prompts">Save</button>
          </div>
        </div>
      </div>

      <div data-view="fix" hidden>
        <div class="srcline"><span id="fixSrc">Your text</span><button class="link" id="fixGrab">Use my selection</button></div>
        <textarea id="fixIn" rows="5" placeholder="Select text on the page, or paste it here"></textarea>
        <div class="cap" style="margin-top:12px">What should I do with it?</div>
        <div class="kinds" id="fixKinds">${A.HELPER_IDS.map(k => `<button class="kind" data-k="${k}" aria-pressed="false">${esc(A.HELPERS[k].label)}</button>`).join("")}</div>
        <div id="fixOut" hidden>
          <div class="outhead"><b id="fixTitle"></b><span class="muted" id="fixMeta"></span></div>
          <div class="outbox" id="fixText" tabindex="0"></div>
          <div class="changes" id="fixChanges"></div>
          <div class="row2">
            <button class="primary sm" id="fixReplace">Replace on the page</button>
            <button class="secondary sm" id="fixCopy">Copy</button>
            <button class="secondary sm" id="fixSend"></button>
          </div>
        </div>
        <p class="note" id="fixNote"></p>
      </div>

      <div data-view="pocket" hidden>
        <div class="ptools"><input type="search" id="pq" placeholder="Search your Pocket" aria-label="Search your Pocket"></div>
        <div class="filters" id="pFilters">${[["all", "All"], ["file", "Files"], ["link", "Links"], ["snippet", "Templates"], ["details", "My details"]].map(([k, l]) =>
          `<button data-f="${k}" aria-pressed="${k === "all"}">${l}</button>`).join("")}</div>
        <div id="pBody"></div>
        <div class="pdrop" id="pDrop">Drop files here to keep them, or <button class="link" id="pPick">choose files</button><input type="file" id="pFile" multiple hidden></div>
        <div class="quick">
          <button class="secondary sm" id="pSavePage">${"Save this page"}</button>
          <button class="secondary sm" id="pSaveSel">Save selection</button>
          <button class="secondary sm" id="pManage">Manage</button>
        </div>
      </div>

      <div data-view="fill" hidden>
        <p class="lbl" id="fillHead">Looking for fields…</p>
        <div id="fillBody"></div>
        <div class="row2">
          <button class="primary sm" id="fillGo" disabled>Fill</button>
          <button class="secondary sm" id="fillScan">Scan again</button>
          <button class="secondary sm" id="fillDetails">Edit my details</button>
        </div>
        <p class="note">Pepper fills empty fields only and never submits anything. Check the form before you send it.</p>
      </div>
    </div>
    <footer class="pf">
      <span class="ls" id="ls"><i></i><span id="lsText"></span></span>
      <button id="lsBtn"></button>
    </footer>
  </section>

  <button class="orb" id="orb" aria-label="Open Pepper (Alt+Shift+P)" title="Pepper (Alt+Shift+P)">${PEPPER_SVG("o")}<span class="dot" aria-hidden="true"></span></button>
</div>`;
  try { const sheet = new CSSStyleSheet(); sheet.replaceSync(CSS); root.adoptedStyleSheets = [sheet]; }
  catch (e) { const st = document.createElement("style"); st.textContent = CSS; root.prepend(st); }

  const $ = (id) => root.getElementById(id);
  const wrap = $("wrap"), orb = $("orb"), panel = $("panel"), rate = $("rate");
  $("kbd").textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ ↵" : "Ctrl ↵";
  if (!SITE) orb.classList.add("small");

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
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && active === $("fixIn")) { e.preventDefault(); runFix(fixKind || "fix"); }
  }

  /* ---------------- Pepper's mood ---------------- */
  let moodTimer = null;
  function mood(name, ms) {
    orb.classList.remove("happy", "think");
    clearTimeout(moodTimer);
    if (!name) return;
    orb.classList.add(name);
    if (ms) moodTimer = setTimeout(() => orb.classList.remove(name), ms);
  }
  // Eyes follow the pointer, a little.
  let eyeRaf = 0;
  window.addEventListener("pointermove", (e) => {
    if (eyeRaf || wrap.hidden) return;
    eyeRaf = requestAnimationFrame(() => {
      eyeRaf = 0;
      const r = orb.getBoundingClientRect();
      if (!r.width) return;
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 300);
      root.querySelectorAll(".pep").forEach(p => { p.style.setProperty("--px", (dx / d * 1.4 * k).toFixed(2) + "px"); p.style.setProperty("--py", (dy / d * 1.4 * k).toFixed(2) + "px"); });
    });
  }, { passive: true });

  /* ---------------- position: drag Pepper anywhere; she remembers per site ---------------- */
  function placeHost(pos) {
    const p = pos || {};
    const side = p.side === "left" ? "left" : "right";
    const x = Math.max(8, Math.min(innerWidth - 70, +p.x || 18));
    const y = Math.max(8, Math.min(innerHeight - 70, +p.bottom || 24));
    hostEl.style.left = side === "left" ? x + "px" : "auto";
    hostEl.style.right = side === "right" ? x + "px" : "auto";
    hostEl.style.bottom = y + "px";
    wrap.classList.toggle("left", side === "left");
  }
  let drag = null;
  orb.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const r = orb.getBoundingClientRect();
    drag = { sx: e.clientX, sy: e.clientY, cx: r.left + r.width / 2, cy: r.top + r.height / 2, moved: false };
    orb.setPointerCapture(e.pointerId);
  });
  orb.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > 5) drag.moved = true;
    if (!drag.moved) return;
    const cx = drag.cx + dx, cy = drag.cy + dy;
    const side = cx < innerWidth / 2 ? "left" : "right";
    drag.pos = { side, x: side === "left" ? cx - 27 : innerWidth - cx - 27, bottom: innerHeight - cy - 27 };
    placeHost(drag.pos);
  });
  orb.addEventListener("pointerup", () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.moved) { patchUi({ pos: d.pos }); return; }
    togglePanel();
  });
  orb.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); togglePanel(); } });

  /* ---------------- files dropped on Pepper go into the Pocket ---------------- */
  for (const el of [orb, panel]) {
    el.addEventListener("dragover", (e) => { if (hasFiles(e)) { e.preventDefault(); orb.classList.add("drop"); if (el === panel) $("pDrop").classList.add("over"); } });
    el.addEventListener("dragleave", () => { orb.classList.remove("drop"); $("pDrop").classList.remove("over"); });
    el.addEventListener("drop", (e) => {
      orb.classList.remove("drop"); $("pDrop").classList.remove("over");
      if (!hasFiles(e)) return;
      e.preventDefault(); e.stopPropagation();
      if (!ready()) { openPanel(); return; }
      if (!feature("pocket")) { toast("Turn on the Pocket in Pepper's settings to keep files."); return; }
      addFiles(e.dataTransfer.files);
    });
  }
  const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");

  /* ---------------- panel ---------------- */
  let tab = "prompt";
  let currentLens = "auto", lensSource = "auto", out = null, attachFiles = true;
  let lastInsert = null; // {insertedAt, insertedText, raw, lens, lensSource, projectId, projectType, engine}
  const ctxNow = () => C.buildContext({ ...S, files: files(), siteName: SITE ? SITE.name : "" });

  function togglePanel(opts) { panel.classList.contains("show") ? closePanel() : openPanel(opts); }
  function openPanel(opts) {
    const o = opts || {};
    if (S.settings.enabled === false) return;
    wrap.hidden = false;
    applyTheme();
    rate.classList.remove("show"); hideHint(); hidePill();
    const gate = !ready();
    $("gate").hidden = !gate; $("tabs").hidden = gate;
    if (gate) { root.querySelectorAll("[data-view]").forEach(v => v.hidden = true); $("proj").hidden = true; $("ctxChip").textContent = ""; }
    else {
      captureSource(o.text);
      const kind = pageContext();
      renderTabs();
      const want = o.tab && tabAllowed(o.tab) ? o.tab : A.defaultTab(kind, S.settings.features, answers());
      showTab(tabAllowed(want) ? want : "prompt", o);
    }
    renderFooter();
    panel.classList.add("show");
    orb.classList.remove("typed", "alert");
    setTimeout(() => {
      if (gate) $("gateGo").focus();
      else if (tab === "prompt") (out ? $("insert") : $("raw")).focus();
      else if (tab === "fix") $("fixIn").focus();
      else if (tab === "pocket") $("pq").focus();
    }, 0);
  }
  function closePanel() { panel.classList.remove("show"); if (uiFor().hidden && !SITE) wrap.hidden = true; }
  $("close").onclick = () => { closePanel(); orb.focus(); };
  $("dash").onclick = () => send({ type: "OPEN_PAGE", page: "dashboard.html" });
  $("back").onclick = () => showCompose();
  $("gateGo").onclick = () => { send({ type: "OPEN_PAGE", page: "onboarding.html" }); closePanel(); };

  const tabAllowed = (t) => t === "prompt" || (t === "fix" && feature("writing")) || (t === "pocket" && feature("pocket")) || (t === "fill" && feature("autofill"));
  function renderTabs() {
    root.querySelectorAll(".tab").forEach(b => { b.hidden = !tabAllowed(b.dataset.tab); b.setAttribute("aria-selected", String(b.dataset.tab === tab)); });
  }
  root.querySelectorAll(".tab").forEach(b => b.onclick = () => showTab(b.dataset.tab));
  function showTab(t, o) {
    tab = t;
    renderTabs();
    root.querySelectorAll("[data-view]").forEach(v => v.hidden = v.dataset.view !== t);
    $("proj").hidden = t !== "prompt";
    if (t === "prompt") {
      renderProjects(); pickLearnedLens(); renderLenses(); renderSugs(); renderSetup(); renderPageOption();
      const raw = $("raw");
      if (o && o.text) { raw.value = o.text; showCompose(); }
      else if (!raw.value.trim() && SITE) raw.value = getInputText().trim();
    }
    if (t === "fix") renderFix(o);
    if (t === "pocket") renderPocket();
    if (t === "fill") scanForm();
    $("body").scrollTop = 0;
  }

  /* ---------------- page context: what Pepper notices about this page ---------------- */
  let source = { text: "", target: null }; // the text Fix works on, and where Replace puts it back
  let lastEditable = null;
  document.addEventListener("focusin", (e) => { const el = editableFrom(e.target); if (el) lastEditable = el; }, true);
  function editableFrom(t) {
    if (!t || hostEl.contains(t)) return null;
    if (t instanceof HTMLTextAreaElement) return t;
    if (t instanceof HTMLInputElement && /^(text|search|email|url|tel|)$/.test(t.type)) return t;
    const ce = t.closest && t.closest('[contenteditable="true"],[contenteditable=""],[contenteditable="plaintext-only"]');
    return ce || null;
  }
  function selectionInfo() {
    const a = document.activeElement;
    if ((a instanceof HTMLTextAreaElement || (a instanceof HTMLInputElement && a.type !== "password")) && a.selectionEnd > a.selectionStart) {
      return { text: a.value.slice(a.selectionStart, a.selectionEnd), target: { el: a, start: a.selectionStart, end: a.selectionEnd } };
    }
    const sel = getSelection();
    const text = sel ? String(sel).trim() : "";
    if (!text || !sel.rangeCount) return { text: "", target: null };
    const range = sel.getRangeAt(0);
    if (hostEl.contains(range.commonAncestorContainer)) return { text: "", target: null };
    const node = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    const ed = node && editableFrom(node);
    return { text, target: ed ? { el: ed, range: range.cloneRange() } : null };
  }
  function captureSource(given) {
    const sel = selectionInfo();
    if (sel.text) source = sel;
    else if (given) source = { text: given, target: null };
    else if (lastEditable && lastEditable.isConnected && fieldText(lastEditable).trim() && !(SITE && lastEditable === inputEl)) source = { text: fieldText(lastEditable), target: { el: lastEditable, all: true } };
    else source = { text: "", target: null };
  }
  const fieldText = (el) => (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) ? el.value : (el.innerText || "");
  let formCache = null;
  function pageContext() {
    const chip = $("ctxChip");
    chip.classList.remove("corn");
    if (SITE) { chip.textContent = SITE.name; return "ai"; }
    formCache = feature("autofill") ? scanFields() : null;
    const fillable = formCache ? formCache.fields.length : 0, resumeInputs = formCache ? formCache.files.length : 0;
    const kind = A.pageKind({ isAI: false, fillable, resumeInputs, host: HOST, selectionWords: words(source.text) });
    if (kind === "form") { chip.textContent = `Form · ${fillable} field${fillable === 1 ? "" : "s"} I can fill`; chip.classList.add("corn"); }
    else if (kind === "selection") chip.textContent = `${words(source.text)} words selected`;
    else chip.textContent = HOST.replace(/^www\./, "");
    return kind;
  }

  /* ================= WRITE (prompts) ================= */
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
    if (L && L.lens && L.lens !== "auto") { currentLens = L.lens; lensSource = "learned"; return; }
    const p = A.defaultLens(answers());
    currentLens = p; lensSource = p === "auto" ? "auto" : "profile";
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
    } else if (lensSource === "profile") {
      const t = A.THINK.find(x => x.value === answers().q5);
      note.innerHTML = `Starting on <b>${esc(C.lensLabel(currentLens))}</b> because you told Pepper “${esc(t ? t.label : "")}”.`;
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
    const list = C.suggestions({ ...S, files: files() }, ctx);
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
    n.innerHTML = hasKey() ? "" : `Using Pepper's built-in template. <button id="addKey">Add your model key</button> for a fuller rewrite.`;
    const b = root.getElementById("addKey");
    if (b) b.onclick = () => send({ type: "OPEN_PAGE", page: "dashboard.html", hash: "settings" });
  }
  function renderPageOption() {
    $("usePageRow").hidden = !!SITE;
    if (SITE) return;
    const sel = words(source.text);
    $("usePageText").textContent = sel ? `Use my selection (${sel} words) and this page's link` : "Use this page (title, link and main text)";
  }
  /** On a regular page, the page itself rides along as a labelled data block, like a file. */
  function pageBlock() {
    if (SITE || !$("usePage").checked) return null;
    let text = source.text;
    if (!text) {
      const main = document.querySelector("main, article, [role=main]") || document.body;
      text = (main && main.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
    }
    const body = `URL: ${location.href}\n\n${text}`;
    return { name: "page: " + (document.title || HOST).slice(0, 80), text: body.slice(0, C.FILE_BUDGET), truncated: body.length > C.FILE_BUDGET, skipped: false };
  }
  function ctxWithPage() { const ctx = ctxNow(); const p = pageBlock(); if (p) ctx.files = [...ctx.files, p]; return ctx; }

  function llm(system, user, maxTokens) {
    return Promise.race([
      chrome.runtime.sendMessage({ type: "LLM", system, user, maxTokens: maxTokens || 3000 }),
      new Promise(r => setTimeout(() => r({ ok: false, error: "The model took longer than 30 seconds." }), 31000))
    ]).catch(e => ({ ok: false, error: String(e.message || e) }));
  }

  async function runExpand() {
    const raw = $("raw").value.trim();
    if (raw.length < 2) { $("raw").focus(); return; }
    const ctx = ctxWithPage();
    const lens = currentLens;
    setBusy(true); mood("think");
    let res;
    if (hasKey()) {
      const r = await llm(C.buildSystemPrompt(ctx, lens), C.buildUserMessage(raw, ctx));
      if (r && r.ok && r.text) res = { engine: "llm", model: r.model, ...C.parseReply(r.text) };
      else res = { engine: "template", error: (r && r.error) || "No reply", prompt: C.template(raw, ctx, lens), assumptions: [], status: "ok" };
    } else {
      res = { engine: "template", noKey: true, prompt: C.template(raw, ctx, lens), assumptions: [], status: "ok" };
    }
    setBusy(false); mood(null);
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
    $("wc").textContent = words(o.prompt) + " words";
    $("target").textContent = o.engine === "llm" ? `aim ${target.min}–${target.max}` : "";
    const w = [];
    if (o.status === "malformed") w.push("The model's reply didn't follow the expected layout, so it's shown in full. Edit it before inserting.");
    if (o.engine === "llm" && o.status === "missing") w.push("The model did not list assumptions — review before inserting.");
    const miss = C.missingSections(o.prompt);
    if (miss.length && o.status !== "malformed") w.push("Missing: " + miss.map(titleCase).join(", ") + ".");
    $("warn").textContent = w.join(" ");
    $("warn").classList.toggle("show", w.length > 0);
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
    const used = (o.ctx || ctxNow()).files.filter(f => f.text && !f.skipped);
    $("files").classList.toggle("show", used.length > 0);
    $("filesUsed").textContent = used.length ? "Using " + used.map(f => f.name + (f.truncated ? " (trimmed)" : "")).join(", ") : "";
    renderAssumptions();
    const model = o.model ? ` (${o.model})` : "";
    $("engine").textContent =
      o.engine === "llm" ? `Expanded with your model${model}.` :
      o.engine === "saved" ? "From your saved prompts." :
      o.error ? `Your model returned: ${o.error} Used the local template instead.` :
      o.noKey ? "No API key — used the local template." : "Built with the local template.";
    // On an AI site the prompt goes in this box; anywhere else it goes to the user's AI.
    $("sendRow").hidden = !!SITE;
    if (!SITE) {
      const sites = A.favorites(answers()).concat(A.AI_SITES.filter(s => !A.favorites(answers()).includes(s)));
      const cur = $("sendTo").value || sites[0].id;
      $("sendTo").innerHTML = sites.map(s => `<option value="${s.id}" ${s.id === cur ? "selected" : ""}>${esc(s.name)}</option>`).join("");
    }
    $("insert").textContent = SITE ? `Insert into ${SITE.name}` : `Send to ${(A.AI_SITES.find(s => s.id === $("sendTo").value) || fav()).name}`;
    const blocked = o.status === "malformed" && !o.edited;
    $("insert").disabled = blocked;
    $("insert").title = blocked ? "Edit the prompt first" : "";
  }
  $("sendTo").onchange = () => { $("insert").textContent = `Send to ${(A.AI_SITES.find(s => s.id === $("sendTo").value) || fav()).name}`; };

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
  $("editor").addEventListener("input", () => { out.prompt = $("editor").value; out.edited = true; $("insert").disabled = false; $("wc").textContent = words(out.prompt) + " words"; });
  $("attach").onchange = (e) => { attachFiles = e.target.checked; };
  $("saveBtn").onclick = async () => {
    if (!out) return;
    await store({ op: "listAdd", key: "pepper_saved_prompts", item: { id: C.uuid(), text: out.prompt, title: (out.raw || "").slice(0, 90),
      projectId: S.activeProjectId, createdAt: new Date().toISOString(), source: HOST } });
    toast("Saved. You'll find it under Saved prompts."); mood("happy", 1500);
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

  /* ---------------- input bridge: the AI site's prompt box ---------------- */
  let inputEl = null;
  const visible = (el) => !!(el && el.isConnected && el.getClientRects().length && el.getBoundingClientRect().width > 100);
  function findInput() {
    if (!SITE) return null;
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
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));
  // Editors reformat what they're given (Gemini turns "- x" lines into a real list), so compare the words, not the characters.
  const bare = (s) => String(s || "").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
  const landed = (el, want) => { const a = bare(el.innerText), b = bare(want); return a === b || (b.length > 40 && C.similarity(a, b) >= 0.97); };

  /** Writes text into a field or editor. Never presses Enter, never clicks send. */
  async function writeInto(el, text, range) {
    el.focus();
    if (isField(el)) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const v = range && range.start != null ? el.value.slice(0, range.start) + text + el.value.slice(range.end) : text;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      await nextFrame();
      return el.value === v;
    }
    const sel = getSelection();
    const place = () => {
      if (range && range.range) { sel.removeAllRanges(); sel.addRange(range.range); return; }
      if (!range || range.all) { const r = document.createRange(); r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r); }
    };
    const whole = !(range && range.range); // replacing everything, so the result can be checked
    // 1. Rich editors (ProseMirror on ChatGPT and Claude, Lexical on Perplexity, Quill on Gemini)
    //    take a paste best: it keeps line breaks, which typing the text in would lose.
    place();
    const dt = new DataTransfer(); dt.setData("text/plain", text);
    const paste = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(paste);
    if (paste.defaultPrevented) {
      for (let i = 0; i < 8; i++) { await nextFrame(); if (!whole || landed(el, text)) return true; }
    }
    // 2. A plain editable area ignores a synthetic paste, so type it in instead.
    place();
    const ok = document.execCommand("insertText", false, text);
    await nextFrame();
    return whole ? landed(el, text) : ok;
  }
  async function insertIntoSite(text) {
    const el = (inputEl && inputEl.isConnected) ? inputEl : (inputEl = findInput());
    if (!el) return clipboardFallback(text);
    const ok = await writeInto(el, text);
    if (!ok) return clipboardFallback(text);
    return { ok: true };
  }
  async function clipboardFallback(text) {
    try { await navigator.clipboard.writeText(text); return { ok: false, method: "clipboard" }; }
    catch (e) { return { ok: false, method: "none" }; }
  }
  const insertText = () => { if (out.editing) out.prompt = $("editor").value; return C.composeInsert(out.prompt, (out.ctx || ctxNow()).files, attachFiles); };
  $("insert").onclick = async () => {
    if (!out || $("insert").disabled) return;
    const text = insertText();
    if (!SITE) {
      const r = await send({ type: "HANDOFF", siteId: $("sendTo").value || fav().id, text, raw: out.raw || "", from: document.title });
      if (r && r.ok) { toast(`Opening ${r.site}. Your prompt will be in the box; you press send.`); mood("happy", 1600); closePanel(); }
      else toast((r && r.error) || "Couldn't open your AI. Use Copy instead.");
      return;
    }
    const r = await insertIntoSite(text);
    lastInsert = { insertedAt: Date.now(), insertedText: text, raw: out.raw || "", lens: out.lens, lensSource: out.lensSource,
      projectId: S.activeProjectId, projectType: (out.ctx || ctxNow()).projectType, engine: out.engine };
    closePanel();
    if (r.ok) { toast(`Inserted. Read it over in ${SITE.name}, then press send.`); mood("happy", 1800); }
    else if (r.method === "clipboard") toast("Copied — paste it into the box.");
    else toast("Pepper couldn't reach the box. Use Copy in the panel instead.");
  };
  $("copy").onclick = async () => {
    if (!out) return;
    try { await navigator.clipboard.writeText(insertText()); toast("Copied."); }
    catch (e) { toast("Your browser blocked copying. Use Edit, then select the text."); }
  };

  /* ================= FIX (writing helper) ================= */
  let fixKind = null, fixResult = null, fixFrom = null;
  function renderFix(o) {
    if (o && o.text && !source.text) source = { text: o.text, target: null };
    // New text to work on: start fresh rather than showing the last result.
    if (source.text && source.text !== fixFrom) { $("fixIn").value = source.text; fixResult = null; fixKind = null; fixFrom = source.text; }
    const where = source.target ? (source.target.all ? "From the field you were typing in" : "Your selection (Replace puts it back)") : source.text ? "Your selection" : "Your text";
    $("fixSrc").textContent = where;
    $("fixGrab").hidden = !selectionInfo().text;
    $("fixOut").hidden = !fixResult;
    $("fixNote").textContent = hasKey() ? "Your model does the work; the text is sent only to your provider." : "Fix works offline. The others go to your AI with a ready-made prompt, or add a model key to get them right here.";
    root.querySelectorAll("#fixKinds .kind").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.k === fixKind)));
  }
  $("fixGrab").onclick = () => { captureSource(); fixResult = null; renderFix(); };
  $("fixIn").addEventListener("input", () => { if (source.target && $("fixIn").value !== source.text) source = { text: $("fixIn").value, target: source.target }; });
  root.querySelectorAll("#fixKinds .kind").forEach(b => b.onclick = () => runFix(b.dataset.k));
  async function runFix(kind) {
    const text = $("fixIn").value;
    if (!text.trim()) { $("fixIn").focus(); toast("Select some text on the page, or paste it here."); return; }
    fixKind = kind;
    root.querySelectorAll("#fixKinds .kind").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.k === kind)));
    const ctx = ctxNow();
    const h = A.HELPERS[kind];
    $("fixTitle").textContent = h.label;
    $("fixChanges").textContent = ""; $("fixMeta").textContent = "";
    if (hasKey()) {
      mood("think"); $("fixText").textContent = "Thinking…"; $("fixOut").hidden = false;
      const r = await llm(A.helperSystem(kind, ctx), A.helperUser(text), 1500);
      mood(null);
      if (r && r.ok && r.text) fixResult = { kind, text: r.text, replaceable: kind !== "similar" && kind !== "explain" };
      else if (kind === "fix") { const t = A.tidyText(text); fixResult = { kind, text: t.text, changes: t.changes, replaceable: true, offline: true }; toast("Your model didn't answer, so Pepper did a quick offline fix."); }
      else fixResult = { kind, prompt: A.helperPrompt(kind, text, ctx, { title: document.title, url: location.href }), error: (r && r.error) || "No reply" };
    } else if (kind === "fix") {
      const t = A.tidyText(text);
      fixResult = { kind, text: t.text, changes: t.changes, replaceable: true, offline: true };
    } else {
      fixResult = { kind, prompt: A.helperPrompt(kind, text, ctx, SITE ? null : { title: document.title, url: location.href }) };
    }
    renderFixResult();
  }
  function renderFixResult() {
    const r = fixResult;
    $("fixOut").hidden = !r;
    if (!r) return;
    const f = fav();
    if (r.prompt) {
      $("fixMeta").textContent = r.error ? "Your model didn't answer" : "Needs an AI";
      $("fixText").textContent = r.prompt;
      $("fixChanges").textContent = `Pepper wrote this prompt for ${f.name}. Send it there, or copy it.`;
      $("fixReplace").hidden = true;
      $("fixSend").hidden = false; $("fixSend").textContent = `Send to ${f.name}`;
      $("fixCopy").textContent = "Copy prompt";
      return;
    }
    $("fixText").textContent = r.text;
    $("fixCopy").textContent = "Copy";
    $("fixSend").hidden = true;
    $("fixReplace").hidden = !(r.replaceable && source.target && source.target.el && source.target.el.isConnected);
    if (r.offline) {
      const n = (r.changes || []).length;
      $("fixMeta").textContent = n ? `${n} fix${n === 1 ? "" : "es"}, offline` : "Looks clean";
      const wordsFixed = (r.changes || []).filter(c => c.kind === "word").map(c => `<s>${esc(c.from)}</s> ${esc(c.to)}`);
      const other = [];
      if ((r.changes || []).some(c => c.kind === "space")) other.push("spacing");
      if ((r.changes || []).some(c => c.kind === "caps")) other.push("capitals");
      const parts = [];
      if (wordsFixed.length) parts.push(wordsFixed.join(" · "));
      if (other.length) parts.push("Fixed " + other.join(" and ") + ".");
      if (!n) parts.push("No spelling or spacing problems found.");
      if (!hasKey()) parts.push("For full grammar, add a model key.");
      $("fixChanges").innerHTML = parts.join(wordsFixed.length ? ". " : " ").replace(/\.\. /g, ". ");
    } else $("fixMeta").textContent = "From your model";
  }
  $("fixCopy").onclick = async () => {
    if (!fixResult) return;
    try { await navigator.clipboard.writeText(fixResult.prompt || fixResult.text); toast("Copied."); } catch (e) { toast("Your browser blocked copying."); }
  };
  $("fixSend").onclick = async () => {
    if (!fixResult || !fixResult.prompt) return;
    if (SITE) { const r = await insertIntoSite(fixResult.prompt); closePanel(); toast(r.ok ? `Inserted. Read it over in ${SITE.name}, then press send.` : "Copied — paste it into the box."); return; }
    const r = await send({ type: "HANDOFF", siteId: fav().id, text: fixResult.prompt, raw: A.HELPERS[fixResult.kind].label, from: document.title });
    if (r && r.ok) { toast(`Opening ${r.site} with your prompt. You press send.`); closePanel(); } else toast((r && r.error) || "Couldn't open your AI.");
  };
  $("fixReplace").onclick = async () => {
    const t = source.target;
    if (!fixResult || !t || !t.el || !t.el.isConnected) return;
    const ok = await writeInto(t.el, fixResult.text, t.all ? { all: true } : t.range ? { range: t.range } : { start: t.start, end: t.end });
    if (ok) { toast("Replaced. Undo with Ctrl+Z if you change your mind."); mood("happy", 1500); source = { text: fixResult.text, target: null }; fixResult = null; closePanel(); }
    else { await clipboardFallback(fixResult.text); toast("Couldn't replace it here, so it's copied. Paste it in."); }
  };

  /* ================= POCKET ================= */
  let pFilter = "all";
  const fileCache = new Map(); // id → File, filled before a drag can start
  root.querySelectorAll("#pFilters button").forEach(b => b.onclick = () => { pFilter = b.dataset.f; root.querySelectorAll("#pFilters button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); renderPocket(); });
  $("pq").addEventListener("input", () => renderPocket());
  $("pPick").onclick = () => $("pFile").click();
  $("pFile").onchange = () => { addFiles($("pFile").files); $("pFile").value = ""; };
  $("pManage").onclick = () => send({ type: "OPEN_PAGE", page: "dashboard.html", hash: "pocket" });
  $("pSavePage").onclick = async () => {
    const r = await store({ op: "listAdd", key: "pepper_pocket", item: { kind: "link", url: location.href, title: document.title || location.href } });
    toast(r && r.ok ? "Saved this page to your Pocket." : (r && r.error) || "Couldn't save it."); if (r && r.ok) mood("happy", 1200);
  };
  $("pSaveSel").onclick = async () => {
    const t = selectionInfo().text || source.text;
    if (!t) { toast("Select some text on the page first."); return; }
    const r = await store({ op: "listAdd", key: "pepper_pocket", item: { kind: "snippet", text: t, title: t.slice(0, 60) } });
    toast(r && r.ok ? "Saved your selection to your Pocket." : (r && r.error) || "Couldn't save it."); if (r && r.ok) mood("happy", 1200);
  };

  async function addFiles(list) {
    let n = 0;
    for (const f of [...list]) {
      const why = A.pocketRejects(S.pocket, f.size);
      if (why) { toast(why); continue; }
      const buf = await f.arrayBuffer();
      let text = "";
      if (A.isTextLike(f.name, f.type)) text = new TextDecoder().decode(buf).slice(0, 200000);
      else if (/\.docx$/i.test(f.name)) text = await A.extractDocxText(buf);
      const r = await send({ type: "POCKET_ADD_FILE", item: { name: f.name, mime: f.type, text, role: A.isResumeLabel(f.name) && !A.pickResume(S.pocket) ? "resume" : undefined }, data: A.bytesToBase64(new Uint8Array(buf)) });
      if (r && r.ok) n++; else toast((r && r.error) || `Couldn't keep ${f.name}.`);
    }
    if (n) { toast(`Kept ${n} file${n === 1 ? "" : "s"} in your Pocket.`); mood("happy", 1500); if (!panel.classList.contains("show") || tab !== "pocket") { openPanel({ tab: "pocket" }); } }
  }
  async function fileFor(item) {
    if (fileCache.has(item.id)) return fileCache.get(item.id);
    let bytes;
    if (item.hasBlob) {
      const k = A.blobKey(item.id);
      const b64 = (await chrome.storage.local.get(k))[k];
      if (!b64) return null;
      bytes = A.base64ToBytes(b64);
    } else bytes = new TextEncoder().encode(item.text || "");
    const f = new File([bytes], item.name, { type: item.mime || "application/octet-stream" });
    fileCache.set(item.id, f);
    return f;
  }
  const fileInputs = () => [...document.querySelectorAll('input[type="file"]')].filter(el => !hostEl.contains(el) && !el.disabled);
  const vars = () => A.templateVars(answers(), S.details);

  function renderPocket() {
    if (!S.pocket.length && !hasDetails() && pFilter === "all") {
      $("pBody").innerHTML = `<div class="empty">Your Pocket is empty. Drop a file below, save this page, or add your resume and details in the dashboard.</div>`;
      return;
    }
    const q = $("pq").value.trim().toLowerCase();
    const match = (i) => !q || [i.name, i.title, i.url, i.text].filter(Boolean).join(" ").toLowerCase().includes(q);
    const items = S.pocket.filter(i => (pFilter === "all" || pFilter === i.kind) && match(i))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.role === "resume") - (a.role === "resume"));
    const hasInputs = fileInputs().length > 0;
    const row = (i) => {
      if (i.kind === "file") {
        const k = A.fileKind(i.name, i.mime);
        return `<div class="pi" draggable="true" data-id="${esc(i.id)}"><span class="ic ${k}">${k === "image" ? I.image : I.file}</span>
          <span class="t"><b>${esc(i.name)}</b><small>${i.role === "resume" ? "Resume · " : ""}${A.formatBytes(i.size)} · drag onto the page</small></span>
          <span class="b">${hasInputs ? `<button data-a="attach">Attach</button>` : ""}<button data-a="open">Open</button></span></div>`;
      }
      if (i.kind === "link") {
        let host = ""; try { host = new URL(i.url).host.replace(/^www\./, ""); } catch (e) {}
        return `<div class="pi" draggable="true" data-id="${esc(i.id)}"><span class="ic link">${I.link}</span>
          <span class="t"><b>${esc(i.title || host)}</b><small>${esc(host)}</small></span>
          <span class="b"><button data-a="go">Open</button><button data-a="copy">Copy</button></span></div>`;
      }
      const filled = A.fillTemplate(i.text, vars()).text;
      return `<div class="pi" draggable="true" data-id="${esc(i.id)}"><span class="ic snippet">${I.snippet}</span>
        <span class="t"><b>${esc(i.title || filled.slice(0, 50))}</b><small>${esc(filled.slice(0, 80))}</small></span>
        <span class="b"><button data-a="insert">Insert</button><button data-a="copy">Copy</button></span></div>`;
    };
    let html = "";
    if (pFilter === "details" || (pFilter === "all" && !q)) html += detailsHtml();
    if (pFilter !== "details") html += items.length ? `<div class="plist">${items.map(row).join("")}</div>` : (q ? `<div class="empty">Nothing matches “${esc(q)}”.</div>` : "");
    $("pBody").innerHTML = html || `<div class="empty">Nothing here yet.</div>`;
    bindDetails($("pBody"));
    $("pBody").querySelectorAll(".pi").forEach(el => {
      const item = S.pocket.find(x => String(x.id) === el.dataset.id);
      if (!item) return;
      if (item.kind === "file") el.addEventListener("pointerenter", () => { fileFor(item); }, { once: true });
      el.addEventListener("dragstart", (e) => dragItem(e, item));
      el.querySelectorAll("button[data-a]").forEach(b => b.onclick = (e) => { e.stopPropagation(); pocketAction(item, b.dataset.a); });
    });
    $("pSaveSel").hidden = !selectionInfo().text && !source.text;
  }
  const hasDetails = () => A.DETAIL_IDS.some(id => A.detailValue(id, S.details)) || (S.details.custom || []).length > 0;
  function detailsHtml() {
    if (!feature("autofill") && pFilter !== "details") return "";
    // What the user saved, plus first and last name split from a full name; nothing shown twice.
    const shownValues = new Set();
    const list = A.DETAILS.map(d => ({ id: d.id, label: d.label, value: (S.details[d.id] || "").trim() || (["firstName", "lastName"].includes(d.id) ? A.detailValue(d.id, S.details) : "") }))
      .filter(d => d.value && !(d.id === "preferredName" && shownValues.has(d.value)) && (shownValues.add(d.value), true))
      .concat((S.details.custom || []).filter(c => c && c.value).map((c, i) => ({ id: "custom" + i, label: c.label, value: c.value })));
    if (!list.length) return pFilter === "details" ? `<div class="empty">No details yet. <button class="link" id="addDetails">Add them once</button> and copy or fill them anywhere.</div>` : "";
    return `<div class="sub">My details · click to copy or fill</div><div class="details">${list.map(d =>
      `<button class="det" data-v="${esc(d.value)}" title="${esc(d.value)}"><small>${esc(d.label)}</small><span>${esc(d.value)}</span></button>`).join("")}</div><div class="sub">Saved</div>`;
  }
  function bindDetails(el) {
    el.querySelectorAll(".det").forEach(b => b.onclick = async () => {
      const v = b.dataset.v;
      // Into the form field you were last in, if it's empty; otherwise to the clipboard.
      if (!SITE && lastEditable && lastEditable.isConnected && isField(lastEditable) && !lastEditable.value.trim()) {
        if (await writeInto(lastEditable, v)) { flash(lastEditable); toast("Filled in."); return; }
      }
      try { await navigator.clipboard.writeText(v); toast(`Copied ${b.querySelector("small").textContent.toLowerCase()}.`); } catch (e) { toast("Your browser blocked copying."); }
    });
    const add = el.querySelector("#addDetails"); if (add) add.onclick = () => send({ type: "OPEN_PAGE", page: "dashboard.html", hash: "pocket" });
  }
  function dragItem(e, item) {
    const dt = e.dataTransfer;
    dt.effectAllowed = "copy";
    if (item.kind === "file") {
      const f = fileCache.get(item.id);
      if (f) { try { dt.items.add(f); } catch (err) { /* some pages refuse */ } }
      else { e.preventDefault(); fileFor(item); toast("Getting it ready — drag again."); return; }
      dt.setData("text/plain", item.name);
    } else if (item.kind === "link") {
      dt.setData("text/uri-list", item.url); dt.setData("text/plain", item.url);
    } else dt.setData("text/plain", A.fillTemplate(item.text, vars()).text);
  }
  async function pocketAction(item, a) {
    if (a === "go") { window.open(item.url, "_blank", "noopener"); return; }
    if (a === "copy") {
      const t = item.kind === "link" ? item.url : A.fillTemplate(item.text, vars()).text;
      try { await navigator.clipboard.writeText(t); toast("Copied."); } catch (e) { toast("Your browser blocked copying."); }
      return;
    }
    if (a === "insert") {
      const { text, missing } = A.fillTemplate(item.text, vars());
      const el = SITE ? (inputEl && inputEl.isConnected ? inputEl : findInput()) : (lastEditable && lastEditable.isConnected ? lastEditable : null);
      let ok = false;
      if (el && isField(el)) {
        const at = el.selectionStart != null ? { start: el.selectionStart, end: el.selectionEnd } : { start: el.value.length, end: el.value.length };
        ok = await writeInto(el, text, at);
      } else if (el && SITE) {
        // The AI site's editor: add the snippet after what's already there.
        const cur = getInputText().replace(/\s+$/, "");
        ok = await writeInto(el, cur ? cur + "\n\n" + text : text);
      }
      if (!ok) { try { await navigator.clipboard.writeText(text); toast("Copied — click where it should go and paste."); } catch (e) { toast("Your browser blocked copying."); } return; }
      toast(missing.length ? `Inserted. Fill in: ${missing.join(", ")}.` : "Inserted."); mood("happy", 1200);
      return;
    }
    const f = await fileFor(item);
    if (!f) { toast("Couldn't read that file."); return; }
    if (a === "open") { const url = URL.createObjectURL(f); window.open(url, "_blank", "noopener"); setTimeout(() => URL.revokeObjectURL(url), 60000); return; }
    if (a === "attach") {
      const inputs = fileInputs();
      const target = inputs.find(i => A.isResumeLabel(fieldDescriptor(i).label + " " + (i.name || "") + " " + (i.id || ""))) || inputs[0];
      if (!target) { toast("There's no upload field on this page. Drag the file instead."); return; }
      toast(attachFile(target, f) ? `Attached ${item.name}.` : "This upload field didn't accept it. Drag the file onto it instead.");
    }
  }
  function attachFile(input, file) {
    try {
      const dt = new DataTransfer(); dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      flash(input);
      return input.files && input.files.length > 0 && input.files[0].name === file.name;
    } catch (e) { return false; }
  }

  /* ================= FILL (forms) ================= */
  function labelFor(el) {
    if (el.labels && el.labels.length) return [...el.labels].map(l => l.innerText).join(" ");
    const lb = el.getAttribute("aria-labelledby");
    if (lb) return lb.split(/\s+/).map(id => (document.getElementById(id) || {}).innerText || "").join(" ");
    const wrapL = el.closest("label");
    if (wrapL) return wrapL.innerText;
    let p = el.parentElement;
    for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
      const t = [...p.childNodes].filter(n => n !== el && !(n.contains && n.contains(el)) && !(n.querySelector && n.querySelector("input,select,textarea")))
        .map(n => n.textContent || "").join(" ").replace(/\s+/g, " ").trim();
      if (t && t.length < 80) return t;
    }
    return "";
  }
  function fieldDescriptor(el) {
    return { tag: el.tagName.toLowerCase(), type: el.type || "", name: el.name || "", id: el.id || "", autocomplete: el.getAttribute("autocomplete") || "",
      label: labelFor(el), placeholder: el.placeholder || "", aria: el.getAttribute("aria-label") || "" };
  }
  const shown = (el) => !!(el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
  function scanFields() {
    const fields = [], fileFields = [];
    for (const el of document.querySelectorAll("input, select, textarea")) {
      if (hostEl.contains(el) || el.disabled || el.readOnly) continue;
      if (el.type === "file") { const d = fieldDescriptor(el); fileFields.push({ el, label: d.label || d.name || "File upload", resume: A.isResumeLabel(d.label + " " + d.name + " " + d.id + " " + (el.accept || "")) }); continue; }
      if (!shown(el)) continue;
      const c = A.classifyField(fieldDescriptor(el));
      if (!c) continue;
      const value = A.detailValue(c.key, S.details);
      fields.push({ el, key: c.key, label: (A.DETAILS.find(d => d.id === c.key) || {}).label || c.key, value, filled: !!(el.value && String(el.value).trim()) });
    }
    return { fields, files: fileFields };
  }
  function scanForm() {
    formCache = scanFields();
    const { fields, files: fileFields } = formCache;
    const canFill = fields.filter(f => f.value && !f.filled);
    $("fillHead").textContent = fields.length || fileFields.length
      ? `Found ${fields.length} field${fields.length === 1 ? "" : "s"} I recognize${fileFields.length ? ` and ${fileFields.length} upload${fileFields.length === 1 ? "" : "s"}` : ""}.`
      : "I don't see a form I can fill on this page.";
    const resume = A.pickResume(S.pocket);
    const fl = files();
    $("fillBody").innerHTML = (fields.length ? `<div class="fbox">${fields.map((f, i) => `<label class="fl ${f.filled ? "done" : ""}">
        <input type="checkbox" data-i="${i}" ${f.value && !f.filled ? "checked" : ""} ${!f.value || f.filled ? "disabled" : ""}>
        <span>${esc(f.label)}</span><span class="v">${f.filled ? "Already filled" : f.value ? esc(f.value) : "Not in your details yet"}</span></label>`).join("")}</div>` : "") +
      fileFields.map((f, i) => `<div class="fres"><span>${esc(f.label.slice(0, 40))}</span>
        <select data-fi="${i}" aria-label="File for ${esc(f.label)}">${fl.length ? fl.map(x => `<option value="${esc(x.id)}" ${(f.resume && resume && x.id === resume.id) ? "selected" : ""}>${esc(x.name)}</option>`).join("") : `<option value="">No files in your Pocket</option>`}</select>
        <button class="secondary sm" data-attach="${i}" ${fl.length ? "" : "disabled"}>Attach</button></div>`).join("");
    $("fillGo").disabled = !canFill.length;
    $("fillGo").textContent = canFill.length ? `Fill ${canFill.length} field${canFill.length === 1 ? "" : "s"}` : "Nothing to fill";
    $("fillBody").querySelectorAll("input[data-i]").forEach(c => c.onchange = () => {
      const n = $("fillBody").querySelectorAll("input[data-i]:checked").length;
      $("fillGo").disabled = !n; $("fillGo").textContent = n ? `Fill ${n} field${n === 1 ? "" : "s"}` : "Nothing selected";
    });
    $("fillBody").querySelectorAll("[data-attach]").forEach(b => b.onclick = async () => {
      const i = +b.dataset.attach, id = $("fillBody").querySelector(`select[data-fi="${i}"]`).value;
      const item = S.pocket.find(x => String(x.id) === id);
      if (!item) return;
      const f = await fileFor(item);
      toast(f && attachFile(fileFields[i].el, f) ? `Attached ${item.name}.` : "This upload field didn't take it. Drag the file from the Pocket instead.");
    });
  }
  $("fillScan").onclick = scanForm;
  $("fillDetails").onclick = () => send({ type: "OPEN_PAGE", page: "dashboard.html", hash: "pocket" });
  $("fillGo").onclick = () => {
    if (!formCache) return;
    let n = 0;
    $("fillBody").querySelectorAll("input[data-i]:checked").forEach(c => {
      const f = formCache.fields[+c.dataset.i];
      if (f && f.el.isConnected && setFieldValue(f.el, f.value)) n++;
    });
    toast(n ? `Filled ${n} field${n === 1 ? "" : "s"}. Check them before you submit.` : "Nothing was filled.");
    if (n) mood("happy", 1600);
    scanForm();
  };
  function setFieldValue(el, value) {
    if (el.tagName === "SELECT") {
      const v = A.matchOption([...el.options].map(o => ({ value: o.value, text: o.text })), value);
      if (v == null) return false;
      el.value = v;
    } else {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    flash(el);
    return true;
  }
  function flash(el) {
    const prev = el.style.outline;
    el.style.outline = "2px solid #2E6B4A";
    setTimeout(() => { el.style.outline = prev; }, 1400);
  }

  /* ---------------- footer ---------------- */
  function renderFooter() {
    const btn = $("lsBtn");
    if (!ready()) { $("ls").classList.remove("on"); $("lsText").textContent = "Setup comes first"; btn.textContent = ""; return; }
    if (SITE) {
      const on = learningOn();
      $("ls").classList.toggle("on", on);
      $("lsText").textContent = on ? `Learning on ${SITE.name}` : `Learning is off on ${SITE.name}`;
      btn.textContent = on ? "What Pepper learned" : "Turn on";
      btn.onclick = () => send({ type: "OPEN_PAGE", page: "dashboard.html", hash: on ? "history" : "settings" });
      return;
    }
    const hidden = !!uiFor().hidden;
    $("ls").classList.remove("on");
    $("lsText").textContent = hidden ? "Hidden on this site" : "Floating here";
    btn.textContent = hidden ? "Show me here again" : "Hide me on this site";
    btn.onclick = async () => { await patchUi({ hidden: !hidden }); toast(hidden ? "I'll float here again." : "I'll stay hidden here. Press Alt+Shift+P to call me."); if (!hidden) closePanel(); renderFooter(); };
  }

  /* ---------------- toast, hint bubble, selection pill ---------------- */
  let toastTimer;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 4200);
  }
  function hint(text, buttons) {
    if (panel.classList.contains("show")) return;
    $("hintText").textContent = text;
    $("hintBtns").innerHTML = "";
    for (const [label, fn, primary] of buttons || []) {
      const b = document.createElement("button");
      b.className = primary ? "primary sm" : "secondary sm"; b.textContent = label; b.onclick = () => { hideHint(); fn(); };
      $("hintBtns").appendChild(b);
    }
    applyTheme();
    $("hint").classList.add("show");
  }
  function hideHint() { $("hint").classList.remove("show"); }
  $("hintX").onclick = () => { hideHint(); if (hintDismiss) hintDismiss(); };
  let hintDismiss = null;

  const pill = $("pill");
  let pillTimer = null;
  function hidePill() { pill.classList.remove("show"); }
  function maybePill() {
    clearTimeout(pillTimer);
    pillTimer = setTimeout(() => {
      if (!ready() || !feature("writing") || S.settings.selectionButton === false || S.settings.enabled === false || panel.classList.contains("show")
        || (!SITE && uiFor().hidden) || document.fullscreenElement) return hidePill();
      // A text field with a selection comes first: its range sits outside the field and has no
      // on-screen box, so place the pill by the field. Otherwise use the page selection's box.
      const a = document.activeElement;
      let text = "", r = null;
      if (a instanceof HTMLInputElement && a.type === "password") return hidePill();
      if ((a instanceof HTMLTextAreaElement || (a instanceof HTMLInputElement && /^(text|search|email|url|)$/.test(a.type))) && !hostEl.contains(a) && a.selectionEnd > a.selectionStart) {
        text = a.value.slice(a.selectionStart, a.selectionEnd).trim();
        const b = a.getBoundingClientRect();
        r = { right: Math.min(b.right - 12, innerWidth - 8), bottom: Math.min(b.bottom, innerHeight - 48), top: b.top };
      } else {
        const s = getSelection();
        if (s && s.rangeCount && String(s).trim()) {
          const range = s.getRangeAt(0);
          if (hostEl.contains(range.commonAncestorContainer)) return;
          const rects = range.getClientRects();
          const box = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
          if (box && (box.width || box.height)) { text = String(s).trim(); r = box; }
        }
      }
      const n = words(text);
      if (n < 3 || n > 3000 || !r) return hidePill();
      wrap.hidden = false;
      applyTheme();
      pill.classList.add("show");
      const pw = pill.offsetWidth || 190, ph = pill.offsetHeight || 32;
      const host = hostEl.getBoundingClientRect();
      // The pill is fixed to the viewport; place it under the end of the selection, inside the screen.
      const left = Math.max(8, Math.min(innerWidth - pw - 8, r.right - pw / 2));
      const top = r.bottom + 8 + ph > innerHeight ? r.top - ph - 8 : r.bottom + 8;
      pill.style.left = (left - host.left) + "px";
      pill.style.top = (top - host.top) + "px";
    }, 280);
  }
  document.addEventListener("selectionchange", maybePill);
  document.addEventListener("mouseup", (e) => { if (!e.composedPath().includes(hostEl)) maybePill(); }, true);
  document.addEventListener("keyup", (e) => { if (e.shiftKey && !e.composedPath().includes(hostEl)) maybePill(); }, true);
  document.addEventListener("select", maybePill, true);
  window.addEventListener("scroll", hidePill, { passive: true, capture: true });
  $("pillFix").onclick = () => { hidePill(); openPanel({ tab: "fix" }); };
  $("pillAsk").onclick = () => { hidePill(); const t = selectionInfo().text; openPanel({ tab: "prompt", text: t ? `Explain this and suggest what I should do next:\n\n${t}` : "" }); };
  $("pillSave").onclick = async () => {
    hidePill();
    const t = selectionInfo().text;
    if (!t) return;
    if (!feature("pocket")) { toast("Turn on the Pocket in settings to save text."); return; }
    const r = await store({ op: "listAdd", key: "pepper_pocket", item: { kind: "snippet", text: t, title: t.slice(0, 60) } });
    toast(r && r.ok ? "Saved to your Pocket." : (r && r.error) || "Couldn't save it."); if (r && r.ok) mood("happy", 1200);
  };
  pill.addEventListener("mousedown", (e) => e.preventDefault()); // keep the page selection while clicking

  /* ---------------- typing hint on AI sites ---------------- */
  function onType() {
    const n = getInputText().trim().length;
    orb.classList.toggle("typed", n >= (S.settings.minChars || 6) && !panel.classList.contains("show"));
  }

  /* ---------------- consent: re-read at every send, never cached ---------------- */
  async function canRecord() {
    const s = await chrome.storage.local.get(["pepper_settings", "pepper_consent"]);
    return C.consentAllows(s.pepper_settings, s.pepper_consent, HOST);
  }

  /* ---------------- send detection + reply capture (AI sites only) ---------------- */
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
        if (+s.dataset.n >= 4) mood("happy", 1600);
      };
    });
    $("stars").onmouseleave = () => paint(0);
    $("rateSkip").onclick = () => rate.classList.remove("show");
    if (!panel.classList.contains("show")) { applyTheme(); rate.classList.add("show"); }
  }

  /* ---------------- on/off: a hard gate on everything ---------------- */
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
    if (bound || !SITE) return; bound = true;
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
    const hiddenHere = !SITE && !!uiFor().hidden && !panel.classList.contains("show");
    wrap.hidden = !on || hiddenHere || !!document.fullscreenElement;
    orb.classList.toggle("alert", on && !ready());
    if (on && ready()) bind(); else if (!on) { closePanel(); rate.classList.remove("show"); hidePill(); unbind(); }
    else unbind(); // not set up yet: Pepper shows, but records nothing
  }
  document.addEventListener("fullscreenchange", applyEnabled);

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !msg) return;
    if (msg.type === "PING") { sendResponse({ pong: true }); return; }
    if (msg.type === "TOGGLE_PANEL" && S.settings.enabled !== false) togglePanel();
    if (msg.type === "OPEN_PANEL" && S.settings.enabled !== false) { if (panel.classList.contains("show") && !msg.tab) return; openPanel({ tab: msg.tab, text: msg.text }); }
    if (msg.type === "TOAST" && msg.text) { wrap.hidden = false; toast(String(msg.text)); mood("happy", 1200); }
    // The popup asks which site this tab is, so it needs no "tabs" permission.
    if (msg.type === "WHO") sendResponse({ site: SITE ? SITE.id : null, name: SITE ? SITE.name : HOST, host: HOST, ai: !!SITE });
  });

  /* ---------------- arriving from a hand-off: put the prompt in the box ---------------- */
  async function claimHandoff() {
    if (!SITE) return;
    const h = await send({ type: "HANDOFF_CLAIM" });
    if (!h || !h.ok || !h.text) return;
    for (let i = 0; i < 40 && !findInput(); i++) await new Promise(r => setTimeout(r, 250));
    const r = await insertIntoSite(h.text);
    lastInsert = { insertedAt: Date.now(), insertedText: h.text, raw: h.raw || "", lens: currentLens, lensSource, projectId: S.activeProjectId, projectType: ctxNow().projectType, engine: "handoff" };
    toast(r.ok ? `Pepper brought your prompt${h.from ? " from “" + h.from.slice(0, 40) + "”" : ""}. Read it, then press send.` : "Your prompt is copied — paste it into the box.");
    mood("happy", 1800);
  }

  /* ---------------- gentle nudges ---------------- */
  function nudges() {
    if (S.settings.enabled === false || wrap.hidden) return;
    if (!ready()) {
      // At most once a day per site, so it never nags.
      if (SITE && Date.now() - (uiFor().setupHintAt || 0) > 864e5) {
        patchUi({ setupHintAt: Date.now() });
        hint("Hi! I'm Pepper. Set me up in two minutes and I'll write prompts that fit you.", [["Set up", () => send({ type: "OPEN_PAGE", page: "onboarding.html" }), true]]);
      }
      return;
    }
    if (!SITE && feature("autofill") && !uiFor().noFormHint) {
      const f = scanFields();
      const kind = A.pageKind({ fillable: f.fields.length, resumeInputs: f.files.length, host: HOST });
      if (kind === "form") {
        const can = f.fields.filter(x => x.value && !x.filled).length;
        hintDismiss = () => patchUi({ noFormHint: true });
        hint(can ? `This looks like an application. I can fill ${can} field${can === 1 ? "" : "s"}${f.files.length ? " and attach your resume" : ""}.` : "This looks like an application. Add your details once and I'll fill forms like this.",
          [[can ? "Fill it" : "Add details", () => can ? openPanel({ tab: "fill" }) : send({ type: "OPEN_PAGE", page: "dashboard.html", hash: "pocket" }), true], ["Not now", () => {}]]);
      }
    }
  }

  /* ---------------- boot ---------------- */
  (async function boot() {
    await loadState();
    placeHost(uiFor().pos || (uiFor().bottom ? { side: "right", x: 18, bottom: uiFor().bottom } : null));
    applyTheme();
    applyEnabled();
    claimHandoff();
    setTimeout(nudges, 1500);
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== "local") return;
      for (const [k, v] of Object.entries(KEYMAP)) if (ch[k]) S[v] = ch[k].newValue ?? (v === "activeProjectId" ? null : S[v]);
      if (ch.pepper_settings) S.settings = redactKey(S.settings);
      if (ch.pepper_settings || ch.pepper_profile || ch.pepper_ui) applyEnabled();
      if ((ch.pepper_consent || ch.pepper_settings) && pending && !learningOn()) { pending.cancelled = true; } // revoked mid-capture
      if (ch.pepper_pocket) { const ids = new Set(S.pocket.map(i => String(i.id))); for (const k of fileCache.keys()) if (!ids.has(String(k))) fileCache.delete(k); }
      if (panel.classList.contains("show")) {
        if ((ch.pepper_profile || ch.pepper_settings) && !$("gate").hidden === ready()) { openPanel(); return; }
        if (tab === "prompt") {
          if (ch.pepper_learning || ch.pepper_active_project || ch.pepper_projects) { renderProjects(); pickLearnedLens(); renderLenses(); }
          if (ch.pepper_consent || ch.pepper_settings) { renderLenses(); renderSetup(); }
          if (ch.pepper_saved_prompts || ch.pepper_history) renderSugs();
        }
        if (ch.pepper_consent || ch.pepper_settings || ch.pepper_ui) renderFooter();
        if (tab === "pocket" && (ch.pepper_pocket || ch.pepper_details)) renderPocket();
        if (tab === "fill" && (ch.pepper_details || ch.pepper_pocket)) scanForm();
      }
    });
  })();
})();
