/* Builds pepper-extension/privacy.html from PRIVACY.md, so the two never drift.
   Handles only what the notice uses: headings, paragraphs, lists, tables,
   **bold**, `code` and [needs review] markers.
     node tools/build-privacy.js          writes privacy.html
   unit/docs.test.js checks the file on disk matches what this would write. */
const fs = require("fs"), path = require("path");
const DIR = path.resolve(__dirname, "../../pepper-extension");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
  .replace(/\[needs review([^\]]*)\]/g, '<span class="review">[needs review$1]</span>');

function render(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (l.startsWith("# ")) { out.push(`<h1>${inline(l.slice(2))}</h1>`); i++; continue; }
    if (l.startsWith("## ")) { out.push(`<h2>${inline(l.slice(3))}</h2>`); i++; continue; }
    if (l.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) { rows.push(lines[i]); i++; }
      const cells = (r) => r.slice(1, -1).split("|").map(c => c.trim());
      const [head, , ...body] = rows;
      out.push(`<div class="tw"><table><thead><tr>${cells(head).map(c => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>` +
        body.map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join("")}</tr>`).join("") + `</tbody></table></div>`);
      continue;
    }
    if (/^(- |\d+\. )/.test(l)) {
      const ordered = /^\d+\. /.test(l);
      const items = [];
      while (i < lines.length && /^(- |\d+\. )/.test(lines[i])) { items.push(lines[i].replace(/^(- |\d+\. )/, "")); i++; }
      out.push(`<${ordered ? "ol" : "ul"}>${items.map(x => `<li>${inline(x)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#|\||- |\d+\. )/.test(lines[i])) { para.push(lines[i]); i++; }
    const text = para.join(" ");
    out.push(text.startsWith("**Draft") ? `<p class="draft">${inline(text)}</p>` : `<p>${inline(text)}</p>`);
  }
  return out.join("\n");
}

function build() {
  const md = fs.readFileSync(path.join(DIR, "PRIVACY.md"), "utf8");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy notice — Pepper — The Personal AI Prompter</title>
<link rel="stylesheet" href="pages.css">
<style>
.doc{max-width:760px;margin:0 auto;padding:40px 24px 72px}
.doc h1{font-size:32px;margin-bottom:16px}
.doc h2{margin:34px 0 10px}
.doc p,.doc li{max-width:68ch}
.doc p+p{margin-top:10px}
.doc ul,.doc ol{padding-left:22px;margin:8px 0}
.doc li+li{margin-top:6px}
.doc .draft{background:var(--warn-soft);color:var(--warn);border-radius:12px;padding:12px 14px}
.review{background:var(--corn-soft);color:var(--corn);font-weight:600;border-radius:4px;padding:0 4px}
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--surface);margin-top:12px}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;vertical-align:top;padding:10px 12px;border-top:1px solid var(--line)}
thead th{border-top:0;background:var(--sunk)}
code{font-size:13px;background:var(--sunk);border-radius:4px;padding:1px 4px;white-space:nowrap}
</style>
</head>
<body>
<main class="doc">
<!-- Generated from PRIVACY.md by pepper-tests/tools/build-privacy.js. Edit the Markdown, then run it. -->
${render(md)}
</main>
</body>
</html>
`;
}

if (require.main === module) {
  fs.writeFileSync(path.join(DIR, "privacy.html"), build());
  console.log("wrote privacy.html");
}
module.exports = { build };
