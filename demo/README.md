# Pepper demos

Two ways to see Pepper without installing anything.

## Playground (interactive)

**Live:** https://amoghmaddur.github.io/pepper-ai-prompter/

`index.html`, `playground.css` and `playground.js` make a single page that loads Pepper's real engine, `pepper-extension/lib/core.js`, and runs it in the browser. It doesn't reimplement anything. Every prompt, parse, check and learning result on the page comes from the same functions the extension calls. It has five sections:

1. **Playground.** Four sample people (a CS grad student, a startup founder, a Spanish-speaking teacher and a blank slate) send the same kind of request. Edit any of the 15 profile answers and the lines it changes are highlighted. Insert drops the prompt into a mock of each site's chat box, and you press send.
2. **Safety.** A sample model reply goes through `parseReply()`: assumptions are split off, and Add, Add and remember, and Dismiss work as they do in the panel. A resume with a hidden "ignore previous instructions" line shows the Role stays identical, and a fake `</file>` tag gets defused.
3. **Learning.** Rate six past sends and `computeLearning()` picks an approach once there are five ratings, with the same reason string the extension shows. "Use this in the playground" carries the result back to section 1.
4. **Video.** The recorded walkthrough below.
5. **How it's built.** Permissions, architecture and test counts.

To open it locally, open `demo/index.html` in a browser. When `core.js` isn't beside the page, it loads `../pepper-extension/lib/core.js`. The Pages workflow (`.github/workflows/pages.yml`) copies `core.js` in at deploy time, so the site always runs the shipped engine.

## Video walkthrough

`media/pepper-demo.mp4` (about 2 minutes) and `media/pepper-demo.gif` (the compose → insert → rate loop, for the README).

`record/record-demo.js` drives the real extension with Playwright on the local mock sites from `pepper-tests/e2e/mock-sites.js`, with the model API mocked. It adds an on-screen cursor and captions, then uses ffmpeg to produce the MP4, the GIF, the poster frame and the README screenshots. Like the browser tests, it uses the test copy of the extension whose shadow root is `open`, the only difference from the shipped build, so Playwright can click inside the panel.

```bash
cd pepper-tests && npm install && npx playwright install chromium
PEPPER_CHANNEL=msedge node ../demo/record/record-demo.js
```

This needs ffmpeg on `PATH` (or `FFMPEG=/path/to/ffmpeg`). Leave out `PEPPER_CHANNEL` to use Playwright's Chromium. Branded Google Chrome ignores `--load-extension`, so it can't be used.

Maya and the other people are fictional. The video skips Copilot because it was recorded in Edge, which blocks extensions on `copilot.microsoft.com`.
