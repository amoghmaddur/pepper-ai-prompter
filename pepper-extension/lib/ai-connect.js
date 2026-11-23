/* Pepper · connecting an AI from the setup and dashboard pages. Keys go straight to the worker's vault. */
(function (root) {
  "use strict";
  const A = root.PepperAssist, L = root.PepperLocalAI;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function fillSelect(sel, current) {
    sel.innerHTML = A.PROVIDERS.map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join("");
    sel.value = A.PROVIDERS.some(p => p.id === current) ? current : "none";
  }
  function helpHtml(id) {
    const p = A.PROVIDERS.find(x => x.id === id);
    return p && p.url ? `${esc(p.help)}: <a href="${p.url}" target="_blank" rel="noopener">get a key</a>.` : "";
  }
  /** The choice to start on: what's saved, else Chrome's own AI when this browser has it, else a free Gemini key. */
  async function suggested(current) {
    if (current && current !== "none") return current;
    return (await L.status()) === "unavailable" ? "gemini" : "chrome";
  }
  /** Saves the choice and tests it. For Chrome's AI this starts the one-time download, so call it from a click. */
  async function connect(provider, key, say) {
    if (provider === "chrome") {
      say("", "Getting Chrome's built-in AI ready…");
      const r = await L.enable(f => say("", `Downloading Chrome's on-device AI… ${Math.round(f * 100)}%`));
      if (!r.ok) {
        say("bad", r.status === "unavailable" ? "This browser doesn't have Chrome's built-in AI (it needs a recent Chrome on a capable computer). A free Google Gemini key works instead." : "Chrome couldn't start its AI: " + (r.error || r.status));
        return false;
      }
    }
    const keyed = A.PROVIDERS.some(p => p.id === provider && p.keyed);
    await chrome.runtime.sendMessage(key && keyed ? { type: "SET_KEY", provider, apiKey: key } : { type: "SET_KEY", provider });
    if (provider === "none") { say("", "No AI for now. Connect one any time in Pepper's settings."); return true; }
    say("", "Testing…");
    const t = await chrome.runtime.sendMessage({ type: "LLM", system: "Reply with the single word OK.", user: "ping", maxTokens: 16 });
    if (t && t.ok) { say("ok", `Connected to ${t.model}.`); return true; }
    say("bad", t && (t.error === "NO_KEY" || t.error === "NO_AI") ? "Paste a key first." : "Saved, but the AI returned: " + ((t && t.error) || "no reply"));
    return false;
  }
  root.PepperAIConnect = { fillSelect, helpHtml, suggested, connect };
})(typeof globalThis !== "undefined" ? globalThis : this);
