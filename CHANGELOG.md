# Changelog

## 0.4.0 — the floating companion (2026-11-22)

Pepper grows from a prompt writer on five AI sites into a small companion that floats wherever you want it.

### New

- **Setup comes first, and it's short.** A one-question-per-screen onboarding: what to call you, what you do, which AI sites you use (in order), what you use AI for, how you like answers, your tone, when you do your best work, where Pepper should float, and which features you want. Each feature shows a preview of what it does. Pepper's features stay locked until the required answers are in.
- **Pepper adapts to how you think.** "Walk me through it" starts prompts on Clarify, "Get to the point" on Leaner, "Go deep" on Deeper, until your ratings teach it better. Your first-pick AI is where prompts from other pages go. What you use AI for decides which tool opens first.
- **Keep floating everywhere, or only on AI sites.** Floating everywhere asks your browser for permission only when you choose it. You can always call Pepper on any page with Alt+Shift+P, the toolbar button or the right-click menu, and hide it on any site.
- **A character, not a button.** The peppercorn has eyes that blink and follow your pointer, smiles when something worked, thinks while your model writes, and can be dragged anywhere.
- **Fix:** select text anywhere and click Fix or Ask AI. Spelling, spacing and capitals are fixed offline; with a model key, Fix, Improve, Shorter, More formal, Similar ideas and Explain run on your model. Without a key, Pepper writes a ready prompt and puts it in your AI's box. Replace puts the result back where the text came from.
- **Pocket:** files of any type (up to 15 MB each), links and templates, one click away. Drop files on the peppercorn to keep them, drag them out onto upload fields, or let Pepper attach your resume. Templates fill in your details with `{{fullName}}`, `{{email}}` and so on. Word files' text is read so prompts can use it.
- **Fill:** on job applications and other forms, Pepper recognizes name, email, phone, links, address, school and job fields, fills only the empty ones when you click Fill, attaches your resume, and never submits. It refuses to store or fill passwords, card numbers and ID numbers.
- **Send to your AI from any page:** write a prompt anywhere, optionally with the page as source material, and Pepper opens your AI with the prompt in the box. You press send.
- **Focus nudges:** an optional notification when your best working hours start, with your goal and your AI one click away. Add your own reminders with times and weekdays.
- **Right-click:** "Fix or improve with Pepper", "Ask AI about this", and "Save to Pepper's Pocket" for text, links and pages.

### Changed

- The dashboard has seven sections instead of nine: Home, You (profile and memories), Pocket (files, links, templates, details), Projects, History (sent, learned, saved), Reminders and Settings (placement, features, learning, model, data).
- Project files now live in the Pocket; existing files move there on update with their links to projects intact.
- Inserting into rich editors (ChatGPT, Claude, Perplexity, Gemini) now pastes, which keeps line breaks.
- Perplexity's new chat box (a Lexical editor) and Copilot's move to copilot.com are supported, both checked on the live sites.
- `privacy.html` is generated from `PRIVACY.md`, and a test fails if they drift.
- A packaged build (`node pepper-tests/tools/package.js`) puts `manifest.json` at the top of both the folder and the zip, so "Load unpacked" finds it.

### Fixed

- "Manifest file is missing or unreadable" when loading the repository folder: the extension is in `pepper-extension/`, and the packaged build removes the guesswork.
- On Perplexity, the prompt box wasn't found after the site's redesign.
- On Copilot, Pepper didn't load after the move to copilot.com.

### Verified

- 129 unit tests.
- 35 browser checks with the extension loaded, run in Chromium 153, Brave 157 and Microsoft Edge 154.
- Live, logged out: Gemini and Perplexity (Pepper appears, opens and inserts into the real box, nothing sent). ChatGPT and Claude show a bot check to automated browsers and need a person; Copilot asks logged-out visitors to sign in.

## 0.3.0 (2026-10-07)

Consent per site, off by default; a learning engine that picks your best-rated approach; assumptions held back from prompts; files as labelled data blocks; a serialized write queue; a closed shadow root; a rebuilt dashboard. The full report is in [`docs/archive/v0.3-report.md`](docs/archive/v0.3-report.md).
