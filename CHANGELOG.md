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

### Reviewed

An independent review of 0.4 before release found 14 problems. All are fixed, with tests:

- Autofill now ignores fields you can't see (off-screen, transparent, tiny or covered), works in one form at a time, and re-checks that a field is still empty when you click Fill, so a page can't use hidden fields to collect your details.
- Your API key and the contents of Pocket files moved out of `chrome.storage` (which the part of Pepper running on web pages can read) into an extension-only database. Big files are no longer broadcast to every open tab when they change.
- Pepper ignores key presses a page fakes. (Text you type into Pepper's panel on a website can still be seen by that site's scripts; the privacy notice says so.)
- Opening an HTML or SVG file from the Pocket downloads it instead of running it as the site you're on.
- After an update, open pages no longer show two peppercorns; switching to "Only on AI sites" hides Pepper on pages already open; right-click saves confirm on the toolbar instead of putting Pepper on the page.
- Quick fixes leave code and line breaks alone; field labels come from the nearest text, never a neighbouring field's; labels that name two details are skipped.
- The orb opens with Enter or Space; near the top of the screen the panel opens downwards and stays on screen.
- Re-running setup no longer widens learning consent; reminders don't fire after being turned off, after their snooze is cancelled, or hours late after sleep.
- Idle Pepper no longer animates every frame on pages where it floats.

A second review of those fixes found more, now fixed too:

- The hidden-field check was strengthened: opacity is multiplied through every parent, clipping containers and `clip-path` count, transparent text counts, fixed elements must be on the screen, and when you click Fill each field is scrolled into view and must not be covered by anything but its own label. Upload fields count only if the input, its label or a small wrapper holding just that field is visible, checked again at Attach.
- Quick fixes return fenced code untouched, and recognize imports, assignments, calls and shell commands as code.
- A saved key belongs to its provider; switching provider without a new key removes it, so a key is never sent to the other provider.
- Only up to 10,000 characters of a file's text sit beside the Pocket list (prompts use 2,500); the whole file stays in the vault. The privacy notice now says exactly this.
- The panel opens towards the side with more room and never runs off a short window; toasts sit beside Pepper so an open panel can't push them off the screen.
- A database error at startup no longer stops the menu, floating and reminders from being set up.
- "Address line 2" and "Apt, suite, unit" are left for you; "First and last name" gets the full name; a field's own name and placeholder beat a section heading above it.

### Verified

- 138 unit tests.
- 36 browser checks with the extension loaded, run in Chromium 153, Brave 157 and Microsoft Edge 154.
- Live, logged out: Gemini and Perplexity (Pepper appears, opens and inserts into the real box, nothing sent). ChatGPT and Claude show a bot check to automated browsers and need a person; Copilot asks logged-out visitors to sign in.

## 0.3.0 (2026-10-07)

Consent per site, off by default; a learning engine that picks your best-rated approach; assumptions held back from prompts; files as labelled data blocks; a serialized write queue; a closed shadow root; a rebuilt dashboard. The full report is in [`docs/archive/v0.3-report.md`](docs/archive/v0.3-report.md).
