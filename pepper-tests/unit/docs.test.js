/* Static checks on the extension's pages: every element a script looks up
   exists in its page, and the privacy page matches PRIVACY.md. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path");
const DIR = path.resolve(__dirname, "../../pepper-extension");
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");

const idsIn = (html) => new Set([...html.matchAll(/\bid="([\w-]+)"/g)].map(m => m[1]));
const lookups = (js) => new Set([...js.matchAll(/\$\("([\w-]+)"\)/g)].map(m => m[1]));

for (const [page, script] of [["onboarding.html", "onboarding.js"], ["dashboard.html", "dashboard.js"], ["popup.html", "popup.js"]]) {
  test(`Wiring: every $("id") in ${script} exists in ${page} (or is created by the script)`, () => {
    const js = read(script);
    const have = new Set([...idsIn(read(page)), ...idsIn(js)]); // ids the script renders itself count too
    const missing = [...lookups(js)].filter(id => !have.has(id));
    assert.deepEqual(missing, []);
  });
}
test("Wiring: every $(\"id\") in content.js exists in the panel it builds", () => {
  const js = read("content.js");
  const missing = [...lookups(js)].filter(id => !idsIn(js).has(id));
  assert.deepEqual(missing, []);
});
test("Wiring: the panel keeps the element IDs the browser tests and v0.3 relied on", () => {
  const ids = idsIn(read("content.js"));
  for (const id of ["orb", "raw", "go", "result", "prompt", "engine", "tools", "insert", "rate", "assume", "filesUsed", "warn", "learnedNote", "lenses", "sugs", "back", "close", "toast", "compose", "editor", "attach"])
    assert.ok(ids.has(id), id);
});
test("Docs: privacy.html is generated from PRIVACY.md and is up to date", () => {
  const { build } = require("../tools/build-privacy.js");
  assert.equal(read("privacy.html"), build(), "run: node tools/build-privacy.js");
});
test("Docs: every storage key the code writes is described in the privacy notice", () => {
  const notice = read("PRIVACY.md");
  const code = ["background.js", "content.js", "dashboard.js", "onboarding.js", "popup.js", "lib/core.js", "lib/assist.js"].map(read).join("\n");
  const keys = new Set([...code.matchAll(/\b(pepper_[a-z_]+)\b/g)].map(m => m[1]).filter(k => k !== "pepper_files" && !k.startsWith("pepper_blob")));
  const missing = [...keys].filter(k => !notice.includes("`" + k + "`"));
  assert.deepEqual(missing, []);
  assert.ok(notice.includes("`pepper-vault`"), "the notice says where the key and file contents live");
});
test("Docs: the product name is exact in every page title", () => {
  for (const f of ["dashboard.html", "onboarding.html", "privacy.html"]) {
    const t = read(f).match(/<title>([^<]*)<\/title>/)[1];
    assert.ok(t.includes("Pepper — The Personal AI Prompter"), f + ": " + t);
  }
});
test("Package: the zip has manifest.json at its top level and every file round-trips byte for byte", () => {
  const os = require("os"), zlib = require("zlib");
  const { build } = require("../tools/package.js");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "pepper-pkg-"));
  const r = build(out);
  const buf = fs.readFileSync(r.zip);
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    const plain = method === 8 ? zlib.inflateRawSync(data) : data;
    assert.ok(plain.equals(fs.readFileSync(path.join(DIR, name))), name);
    names.push(name);
    p += 46 + nlen + xlen + clen;
  }
  assert.ok(names.includes("manifest.json"), "manifest.json at the top, so Load unpacked finds it");
  assert.ok(!names.some(n => n.split("/")[0] === path.basename(r.folder)), "no extra wrapping folder");
  for (const must of ["background.js", "content.js", "lib/core.js", "lib/assist.js", "privacy.html", "icons/icon128.png"]) assert.ok(names.includes(must), must);
  assert.ok(!names.some(n => /test|node_modules|\.md$/.test(n)), "no tests or docs in the package");
  assert.ok(fs.existsSync(path.join(r.folder, "manifest.json")), "the unpacked folder has manifest.json at its top too");
  fs.rmSync(out, { recursive: true, force: true });
});
