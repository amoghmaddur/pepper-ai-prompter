# Tests for Pepper — The Personal AI Prompter v0.3

These live next to the extension, not inside it, so nothing here ships.

## Unit tests (no install needed)

    npm test            # or: node --test unit/*.test.js

Node 18 or newer. `unit/core.test.js` tests `lib/core.js`. `unit/background.test.js` runs the real `background.js` inside a fake Chrome (`unit/fake-chrome.js`) whose storage adds random delays to every read and write, so the two-tab race in C4 is real. It includes a control test showing the same race loses records without Pepper's write queue.

## Browser tests

    npm install && npx playwright install chromium
    npm run test:browser

These load the extension into Chromium and drive local **mock** pages for ChatGPT, Claude, Gemini, Perplexity, Copilot and poe.com (`e2e/mock-sites.js`). The mocks copy only what Pepper touches: the prompt box, the send button, an old reply already on screen, a reply that streams in, and an unrelated "Send feedback" button. **They are not the live sites.** Passing here says the logic works against Pepper's own selectors; whether those selectors match the live sites today is what the live-test protocol (H7) checks.

The real build's shadow root is closed, so a page can't reach into the panel, and neither can Playwright. The panel tests therefore run on a temporary copy that differs only in `mode: "closed"` → `mode: "open"` (`openRootCopy()` in `e2e/harness.js`). The closed root itself, recording gates and capture are tested on the unmodified build.

The model API is mocked with `context.route`, which needs `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` to see the extension worker's requests; the harness sets it. Without it, requests go to the real provider.

By default the harness uses Playwright's bundled Chromium. Set `PEPPER_CHANNEL=msedge` to run in Microsoft Edge, or `PEPPER_CHROME=/path/to/chrome` for a specific build. Branded Google Chrome ignores `--load-extension`, so it can't load the extension. Edge 150 and later block every third-party extension on `copilot.microsoft.com` by design, so on Edge the Copilot insert check asserts that Pepper is absent and logs why. Copilot is fully exercised on Chromium.

Screenshots land in `e2e/shots/`. `node e2e/mobile-width.js` checks the dashboard doesn't scroll sideways at 390 px.
