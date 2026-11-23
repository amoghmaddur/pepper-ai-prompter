/* Pepper · offscreen page: runs Chrome's built-in AI for the worker when the worker can't reach it. */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== "offscreen" || sender.id !== chrome.runtime.id) return;
  const L = self.PepperLocalAI;
  const p = msg.type === "LOCAL_AI_STATUS" ? L.status().then(status => ({ ok: true, status })) : msg.type === "LOCAL_AI" ? L.run(msg.system, msg.user) : null;
  if (!p) return;
  p.then(sendResponse, e => sendResponse({ ok: false, error: String(e && e.message || e) }));
  return true;
});
