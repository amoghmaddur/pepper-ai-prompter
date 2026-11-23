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
/* An ordinary page (for "keep floating", the writing helper and the Pocket):
   readable text, a textarea, a rich editor and a drop zone that records files. */
PAGES["example.org"] = `<!doctype html><html><head><meta charset="utf-8"><title>Remote work notes</title>
<style>body{margin:0;font:16px/1.6 Georgia,serif;background:#fff;color:#222}main{max-width:720px;margin:0 auto;padding:32px 24px 200px}
textarea,#ce{width:100%;min-height:80px;border:1px solid #bbb;border-radius:8px;padding:10px;font:15px/1.5 system-ui}#dz{margin-top:16px;border:2px dashed #999;border-radius:12px;padding:30px;text-align:center}</style></head>
<body><main><h1>Remote work notes</h1>
<p id="para">Remote work boosts focus for many teams because fewer interruptions leave longer blocks for deep work.</p>
<label for="notes">Your notes</label><textarea id="notes">i think teh plan is  good ,but i dont know</textarea>
<div id="ce" contenteditable="true">draft here</div>
<div id="dz">Drop files here</div>
</main><script>
window.__dropped = [];
dz.addEventListener("dragover", e => e.preventDefault());
dz.addEventListener("drop", e => { e.preventDefault(); window.__dropped.push(...[...e.dataTransfer.files].map(f => f.name + ":" + f.size)); });
</script></body></html>`;

/* A job application in the style of Greenhouse: labelled fields, a country
   select, a resume upload, a password field Pepper must never fill, and a
   submit handler that counts submissions (Pepper must never submit). */
PAGES["boards.greenhouse.io"] = `<!doctype html><html><head><meta charset="utf-8"><title>Software Engineer, New Grad - Apply</title>
<style>body{margin:0;font:15px/1.5 system-ui;background:#f7f7f7;color:#222}form{max-width:640px;margin:24px auto;background:#fff;padding:24px;border-radius:12px;display:grid;gap:10px}
input,select,textarea{font:inherit;padding:8px;border:1px solid #bbb;border-radius:6px}</style></head>
<body><form id="app">
<h1>Apply for this job</h1>
<label for="first_name">First Name *</label><input id="first_name" name="job_application[first_name]">
<label for="last_name">Last Name *</label><input id="last_name" name="job_application[last_name]">
<label for="email">Email *</label><input id="email" type="email" name="job_application[email]">
<label for="phone">Phone</label><input id="phone" name="job_application[phone]" value="">
<label>LinkedIn Profile <input id="li" name="urls[LinkedIn]"></label>
<label for="country">Country</label><select id="country"><option value="">Select...</option><option value="CA">Canada</option><option value="US">United States</option></select>
<label for="city">City</label><input id="city" name="job_application[location]" value="Already typed">
<label for="resume">Resume/CV</label><input type="file" id="resume" name="job_application[resume]">
<label for="pw">Create a password</label><input type="password" id="pw">
<label for="why">Why do you want to work here?</label><textarea id="why"></textarea>
<button type="submit">Submit application</button>
</form><script>
window.__submitted = 0; window.__changes = {};
app.addEventListener("submit", e => { e.preventDefault(); window.__submitted++; });
document.querySelectorAll("input,select").forEach(el => el.addEventListener("change", () => { window.__changes[el.id] = el.type === "file" ? (el.files[0] || {}).name : el.value; }));
</script></body></html>`;

module.exports = { PAGES };
