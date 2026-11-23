/* Packages the extension for people to load.
     node tools/package.js [outDir]
   Writes <outDir>/pepper-v<version>/ (a folder with manifest.json at its top,
   ready for "Load unpacked") and <outDir>/pepper-v<version>.zip (the same files
   at the zip's top level, which is what the Chrome Web Store and Edge Add-ons
   expect). outDir defaults to ../dist. No dependencies: a small zip writer. */
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const EXT = path.resolve(__dirname, "../../pepper-extension");

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };

function filesIn(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    if (e.name.startsWith(".")) return [];
    return e.isDirectory() ? filesIn(full, base) : [path.relative(base, full).split(path.sep).join("/")];
  }).sort();
}

function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  const time = 0, date = ((2026 - 1980) << 9) | (11 << 5) | 22; // fixed stamp, so builds are reproducible
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = packed.length < data.length;
    const body = useDeflate ? packed : data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(useDeflate ? 8 : 0, 8); local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10); central.writeUInt16LE(time, 12); central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

function build(outDir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, "manifest.json"), "utf8"));
  const name = `pepper-v${manifest.version}`;
  const files = filesIn(EXT).filter(f => f !== "README.md" && f !== "PRIVACY.md"); // docs live in the repo; privacy.html ships
  const folder = path.join(outDir, name);
  fs.rmSync(folder, { recursive: true, force: true });
  for (const f of files) { fs.mkdirSync(path.dirname(path.join(folder, f)), { recursive: true }); fs.copyFileSync(path.join(EXT, f), path.join(folder, f)); }
  const zipPath = path.join(outDir, name + ".zip");
  fs.writeFileSync(zipPath, zip(files.map(f => ({ name: f, data: fs.readFileSync(path.join(EXT, f)) }))));
  return { folder, zip: zipPath, files };
}

if (require.main === module) {
  const out = path.resolve(process.argv[2] || path.join(__dirname, "../../dist"));
  fs.mkdirSync(out, { recursive: true });
  const r = build(out);
  console.log(`${r.files.length} files\n${r.folder}\n${r.zip} (${(fs.statSync(r.zip).size / 1024).toFixed(0)} KB)`);
}
module.exports = { build, zip, crc32 };
