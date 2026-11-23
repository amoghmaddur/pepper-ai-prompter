/* Renders Pepper's icon (the peppercorn with a sparkle) to icons/icon{16,32,48,128}.png.
   Usage: PEPPER_CHROME=<chrome.exe> node tools/make-icons.js */
const path = require("path");
const { chromium } = require("playwright");

const OUT = path.join(__dirname, "..", "..", "pepper-extension", "icons");
// Small sizes drop the fine detail (highlight, blush, eye glints) so the face stays readable.
const svg = (size) => {
  const tiny = size <= 16, small = size <= 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
  <defs><radialGradient id="g" cx="34%" cy="28%" r="78%"><stop offset="0" stop-color="#8FD1A6"/><stop offset=".32" stop-color="#3E7A59"/><stop offset=".74" stop-color="#22513A"/><stop offset="1" stop-color="#163826"/></radialGradient></defs>
  <path d="M23.2 12c.3-3.4 1.9-5.8 4.8-7.3" stroke="#6B4A2B" stroke-width="${tiny ? 3.4 : 2.6}" fill="none" stroke-linecap="round"/>
  <path d="M26.6 5.4c3.8-2.8 8-2.3 10.6.4-3.6 2.6-7.4 2.6-10.6-.4z" fill="#9BD8AC"/>
  <circle cx="22.5" cy="28.5" r="${tiny ? 18.6 : 18}" fill="url(#g)"/>
  ${small ? "" : `<ellipse cx="15" cy="20.5" rx="5.4" ry="2.9" fill="#fff" opacity=".22" transform="rotate(-28 15 20.5)"/>`}
  <ellipse cx="16.4" cy="27.8" rx="${tiny ? 4.4 : 3.9}" ry="${tiny ? 5 : 4.5}" fill="#fff"/><ellipse cx="28.6" cy="27.8" rx="${tiny ? 4.4 : 3.9}" ry="${tiny ? 5 : 4.5}" fill="#fff"/>
  <circle cx="16.9" cy="28.5" r="${tiny ? 2.6 : 2.2}" fill="#13211A"/><circle cx="29.1" cy="28.5" r="${tiny ? 2.6 : 2.2}" fill="#13211A"/>
  ${small ? "" : `<circle cx="16.1" cy="27.3" r=".7" fill="#fff"/><circle cx="28.3" cy="27.3" r=".7" fill="#fff"/>
  <ellipse cx="10.6" cy="34" rx="2.7" ry="1.6" fill="#F48FB1" opacity=".65"/><ellipse cx="34.4" cy="34" rx="2.7" ry="1.6" fill="#F48FB1" opacity=".65"/>`}
  <path d="M19.4 35.2c1.8 2 4.4 2 6.2 0" stroke="#0E1B14" stroke-width="${tiny ? 2.4 : 1.8}" fill="none" stroke-linecap="round"/>
  <path d="M41 9.5l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="#F2C14E" stroke="#163826" stroke-width="${tiny ? 0 : .8}" stroke-linejoin="round"/>
</svg>`;
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PEPPER_CHROME || undefined });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of [16, 32, 48, 128]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size)}</body></html>`);
    await page.screenshot({ path: path.join(OUT, `icon${size}.png`), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  }
  // A large preview to eyeball the drawing.
  await page.setViewportSize({ width: 256, height: 256 });
  await page.setContent(`<html><body style="margin:0;background:#fff">${svg(256)}</body></html>`);
  await page.screenshot({ path: path.join(__dirname, "..", "e2e", "shots", "icon-preview.png") });
  await browser.close();
  console.log("icons written to " + OUT);
})();
