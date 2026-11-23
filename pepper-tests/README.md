# Tests for Pepper — The Personal AI Prompter v0.4

These live next to the extension, not inside it, so nothing here ships.

## Unit tests (no install needed)

    npm test            # or: node --test unit/*.test.js

Node 18 or newer (22 recommended).

- `unit/core.test.js`: the prompt engine in `lib/core.js`.
- `unit/assist.test.js`: `lib/assist.js`: setup rules, personalization, autofill field matching, templates, quick fixes, helper prompts, reminders, the Pocket, Word text.
- `unit/background.test.js` and `unit/companion.test.js`: the real `background.js` inside a fake Chrome (`unit/fake-chrome.js`) whose storage adds random delays to every read and write, so races are real. Covers consent, the write queue (with a control test that shows the race losing records without it), what web pages may write, Pocket files, hand-offs, keep floating, reminders, the right-click menu, updates and wipe.
- `unit/docs.test.js`: every element a page script looks up exists, `privacy.html` matches `PRIVACY.md`, every storage key is in the privacy notice, and the package has `manifest.json` at its top.

## Browser tests

    npm install && npx playwright install chromium
    npm run test:browser

These load the extension into a real browser and drive local **mock** pages for ChatGPT, Claude, Gemini, Perplexity, Copilot and poe.com, plus an ordinary article page and a Greenhouse-style job application (`e2e/mock-sites.js`). The mocks copy only what Pepper touches. **They are not the live sites.**

- `e2e/browser.test.js`: the v0.3 guarantees on the v0.4 build: closed shadow root, not running outside its sites, nothing recorded without consent or before setup, the new reply captured, insert without sending on all five sites, the clipboard fallback, files as data, assumptions never inserted, learning, data controls, and that the dashboard can't be framed.
- `e2e/companion.test.js`: v0.4 end to end: the setup gate, onboarding, keep floating, the writing helper (with and without a model key), hand-offs to AI sites, the Pocket (keeping, inserting, dragging), filling a job form, hiding on a site, summoning anywhere, and the pages.

**Which browser:** `PEPPER_BROWSER=chromium` (default), `brave` or `msedge`, or `PEPPER_CHROME=/path/to/chrome` for a specific build. Branded Google Chrome ignores `--load-extension`, so it can't be used; Chromium is the open-source build it's made from. Edge 150+ blocks every third-party extension on `copilot.microsoft.com` by design, so on Edge the Copilot check asserts that Pepper is absent and logs why.

**On Windows**, if Playwright's Chromium fails with "side-by-side configuration is incorrect", copy its `chrome-win64` folder somewhere else and point `PEPPER_CHROME` at the copy's `chrome.exe`.

**No live traffic:** the test browser resolves no real hostnames, so nothing can reach a live site by accident. Tabs the extension opens itself can load before Playwright's routes attach; `adopt()` in `e2e/harness.js` reloads them onto the mock.

Most panel tests run on a temporary copy of the extension whose shadow root is `open` (the only code difference), so Playwright can click inside it; the closed root and the recording gates are tested on the unmodified build. Optional permissions (all sites, notifications) are written into a test copy, because a test can't click the browser's permission prompt. The model API is mocked with `context.route`.

Screenshots land in `e2e/shots/`.

## Live check

    PEPPER_BROWSER=brave node e2e/live-check.js

Opens the real AI sites logged out and checks that Pepper appears, opens and inserts into the real box. It never presses send and empties the box afterwards. ChatGPT and Claude show bot checks to automated browsers, and Copilot asks logged-out visitors to sign in, so those need a person; see `docs/LIVE-TEST-PROTOCOL.md`.

## Tools

    node tools/package.js [outDir]       # pepper-v<version>/ and .zip, manifest.json at the top
    node tools/build-privacy.js          # privacy.html from PRIVACY.md
