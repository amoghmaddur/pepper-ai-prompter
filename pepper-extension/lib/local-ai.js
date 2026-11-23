/* Pepper · Chrome's built-in AI (the on-device Prompt API). No key, and nothing leaves the computer.
   Used by the worker when Chrome exposes the API there, by the offscreen page when it doesn't,
   and by the setup pages, which start the one-time model download (that needs a click). */
(function (root) {
  "use strict";
  const OPTS = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };
  const api = () => root.LanguageModel || null;
  /** "available" | "downloadable" | "downloading" | "unavailable" */
  async function status() {
    const LM = api();
    if (!LM || !LM.availability) return "unavailable";
    try { return await LM.availability(OPTS); } catch (e) { return "unavailable"; }
  }
  async function run(system, user) {
    const st = await status();
    if (st !== "available") return { ok: false, error: st === "unavailable" || st === "downloadable" ? "NO_AI" : "Chrome's built-in AI is still downloading. Try again in a few minutes.", builtin: st };
    let session = null;
    try {
      session = await api().create({ ...OPTS, initialPrompts: [{ role: "system", content: system }] });
      const text = await session.prompt(user);
      return { ok: true, model: "Chrome's built-in AI", text: String(text || "").trim() };
    } catch (e) {
      return { ok: false, error: "Chrome's built-in AI: " + (e && e.message || e) };
    } finally {
      try { if (session) session.destroy(); } catch (e) { /* already gone */ }
    }
  }
  /** Starts (or finishes) the model download. Must run from a click on one of Pepper's pages. */
  async function enable(onProgress) {
    const LM = api();
    if (!LM) return { ok: false, status: "unavailable" };
    try {
      const s = await LM.create({ ...OPTS, monitor(m) { m.addEventListener("downloadprogress", e => onProgress && onProgress(e.loaded)); } });
      s.destroy();
      return { ok: true, status: "available" };
    } catch (e) { return { ok: false, status: await status(), error: String(e && e.message || e) }; }
  }
  root.PepperLocalAI = { OPTS, status, run, enable };
})(typeof globalThis !== "undefined" ? globalThis : this);
