/* Local stand-ins for the AI sites. They reproduce only what Pepper touches:
   the prompt box, the send button, an older reply already on screen, a reply
   that streams in after send, a busy indicator, and an unrelated "Send
   feedback" button. They are NOT the live sites; selectors on live sites are
   verified only by the live-test protocol (H7). */
const common = (opts) => `<!doctype html><html><head><meta charset="utf-8"><title>${opts.title}</title>
<style>body{margin:0;font:15px/1.5 system-ui,sans-serif;background:${opts.bg};color:${opts.fg}}
main{max-width:760px;margin:0 auto;padding:24px 24px 160px}
.msg{padding:12px 14px;border-radius:10px;margin:10px 0;background:${opts.bubble}}
.user{opacity:.8}
footer{position:fixed;left:0;right:0;bottom:0;padding:16px;background:${opts.bg};border-top:1px solid #8884}
.box{display:flex;gap:8px;max-width:760px;margin:0 auto}
#in,#userInput,#ask-input,rich-textarea,#prompt-textarea,.ProseMirror{flex:1;min-height:44px;max-height:200px;overflow:auto;border:1px solid #8886;border-radius:12px;padding:10px 12px;background:${opts.bubble};color:inherit;font:inherit;white-space:pre-wrap}
button{font:inherit;padding:0 14px;border-radius:10px;border:1px solid #8886;background:${opts.bubble};color:inherit}
</style></head><body>
<main id="thread"><h3>${opts.title} (mock)</h3>
<div class="msg user">earlier question</div>
<${opts.respTag || "div"} class="msg ${opts.oldClass || ""}" ${opts.respAttr}>This is an OLD reply that was already on the page.</${opts.respTag || "div"}>
</main>
<footer><div class="box">${opts.input}<button type="button" ${opts.sendAttr}>Send</button><button type="button" id="feedback">Send feedback</button></div></footer>
<script>
window.__sent = [];
const box = document.querySelector(${JSON.stringify(opts.inputSel)});
const read = () => box.tagName === "TEXTAREA" ? box.value : box.innerText;
const clear = () => { if (box.tagName === "TEXTAREA") box.value = ""; else box.innerHTML = ""; };
function submit() {
  const t = read().trim(); if (!t) return;
  window.__sent.push(t); clear();
  const u = document.createElement("div"); u.className = "msg user"; u.textContent = t.slice(0, 200); thread.appendChild(u);
  const r = document.createElement(${JSON.stringify(opts.respTag || "div")}); r.className = "msg"; ${opts.respSet}; thread.appendChild(r);
  ${opts.busyOn || ""}
  const full = "NEW REPLY to: " + t.slice(0, 60).replace(/\\s+/g, " ") + ". " + "Here is a streamed answer. ".repeat(6);
  let i = 0; const iv = setInterval(() => { i += 12; r.textContent = full.slice(0, i); if (i >= full.length) { clearInterval(iv); ${opts.busyOff || ""} } }, window.__streamMs || 60);
}
document.querySelector(${JSON.stringify(opts.sendSel)}).addEventListener("click", submit);
box.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } });
document.getElementById("feedback").addEventListener("click", () => { window.__feedback = (window.__feedback || 0) + 1; });
</script></body></html>`;

const PAGES = {
  "chatgpt.com": common({ title: "ChatGPT", bg: "#212121", fg: "#ececec", bubble: "#303030",
    input: '<div id="prompt-textarea" contenteditable="true" class="ProseMirror"></div>', inputSel: "#prompt-textarea",
    sendAttr: 'data-testid="send-button" aria-label="Send prompt"', sendSel: '[data-testid="send-button"]',
    respAttr: 'data-message-author-role="assistant"', respSet: 'r.setAttribute("data-message-author-role","assistant")',
    busyOn: 'const st=document.createElement("button");st.setAttribute("data-testid","stop-button");st.textContent="Stop";document.querySelector(".box").appendChild(st);',
    busyOff: 'st.remove();' }),
  "claude.ai": common({ title: "Claude", bg: "#F5F4EF", fg: "#29261b", bubble: "#ffffff",
    input: '<div class="ProseMirror" contenteditable="true"></div>', inputSel: "div.ProseMirror",
    sendAttr: 'aria-label="Send message"', sendSel: 'button[aria-label="Send message"]',
    respAttr: "", oldClass: "font-claude-message", respSet: 'r.classList.add("font-claude-message")' }),
  "copilot.microsoft.com": common({ title: "Copilot", bg: "#ffffff", fg: "#111", bubble: "#f3f3f3",
    input: '<textarea id="userInput" rows="2"></textarea>', inputSel: "#userInput",
    sendAttr: 'aria-label="Submit message"', sendSel: 'button[aria-label="Submit message"]',
    respAttr: 'data-content="ai-message"', respSet: 'r.setAttribute("data-content","ai-message")' }),
  "gemini.google.com": common({ title: "Gemini", bg: "#131314", fg: "#e3e3e3", bubble: "#1e1f20",
    input: '<rich-textarea style="display:block;padding:0;border:0;background:none"><div class="ql-editor" contenteditable="true" style="min-height:44px;border:1px solid #8886;border-radius:12px;padding:10px 12px"></div></rich-textarea>',
    inputSel: ".ql-editor", sendAttr: 'class="send-button" aria-label="Send message"', sendSel: "button.send-button",
    respTag: "message-content", respAttr: "", respSet: "" }),
  "www.perplexity.ai": common({ title: "Perplexity", bg: "#fbfaf4", fg: "#13343b", bubble: "#ffffff",
    input: '<textarea id="ask-input" rows="2" placeholder="Ask anything"></textarea>', inputSel: "#ask-input",
    sendAttr: 'data-testid="submit-button" aria-label="Submit"', sendSel: 'button[data-testid="submit-button"]',
    respAttr: 'id="markdown-content-0"', respSet: 'r.id = "markdown-content-" + Date.now()' }),
  "poe.com": common({ title: "Poe (not a Pepper site)", bg: "#fff", fg: "#111", bubble: "#eee",
    input: '<textarea id="in"></textarea>', inputSel: "#in", sendAttr: 'id="s"', sendSel: "#s", respAttr: "", respSet: "" })
};
module.exports = { PAGES };
