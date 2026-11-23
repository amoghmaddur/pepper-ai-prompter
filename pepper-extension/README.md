# Pepper — The Personal AI Prompter

Version 0.4.0. An extension for Chrome, Brave and Edge (Manifest V3).

Pepper is a small companion that floats on your screen. It turns a few words into a clear, six-part prompt built from what you've told it about yourself, fixes your writing anywhere, keeps your files and details one click away, and fills job applications. Everything stays in your browser. Pepper never sends anything for you.

## Install

1. Get the folder that has `manifest.json` directly inside it: either unzip `pepper-v0.4.0.zip`, or use this `pepper-extension` folder from the repository.
2. Open `chrome://extensions` (Brave: `brave://extensions`, Edge: `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and choose that folder.

If you see **"Manifest file is missing or unreadable"**, you picked the folder one level too high. Open it and choose the folder that contains `manifest.json`.

The welcome page opens. Answer the questions (about two minutes); Pepper unlocks when you finish.

## Using it

**The peppercorn.** Click it, or press **Alt+Shift+P** on any page. Drag it anywhere; it remembers the spot per site. Drop a file on it to keep the file in your Pocket.

**Write.** Type what you want; pick an approach or let Pepper start on the one that fits how you think. Click **Write my prompt**. Check the six parts and anything Pepper assumed (assumptions are never in the prompt unless you add them). On an AI site, **Insert** puts it in the box. Anywhere else, **Send to** opens your AI with the prompt in the box. Tick **Use this page** to bring the page along as source material.

**Fix.** Select text on any page and click **Fix** on the little pill, or right-click it. Fix (spelling, spacing, capitals) works offline. Improve, Shorter, More formal, Similar ideas and Explain run on your model if you added a key; otherwise Pepper writes a ready prompt for your AI. **Replace** puts the result back.

**Pocket.** Your files, links, templates and details. Drag a file onto an upload field, click **Attach**, or **Open** it. Click a link to open it. **Insert** a template into the field you're typing in; `{{fullName}}`, `{{email}}`, `{{name}}`, `{{role}}`, `{{today}}` and your other details fill in. Click a detail to copy it, or to fill the empty field you're in.

**Fill.** On an application form, Pepper lists the fields it recognizes. **Fill** puts your details into the empty ones; choose a file for each upload field and click **Attach**. Pepper never submits, never overwrites what you typed, and never fills password, payment or ID fields.

**Right-click** selected text, a link or a page for Fix, Ask AI and Save to Pocket.

## Where Pepper floats

You choose in onboarding, and can change it in the popup or Settings:

- **Only on AI sites** (default): ChatGPT, Claude, Gemini, Perplexity and Copilot. Call Pepper anywhere else with Alt+Shift+P, the toolbar button or the right-click menu; that uses the browser's "active tab" access for that one tab only.
- **Keep floating everywhere:** your browser asks once to allow Pepper on all sites. Hide it on any site from its panel or the popup.

## With or without a model key

Without a key, Pepper writes prompts with a built-in template and fixes text offline. With your own Anthropic or OpenAI key, your model writes prompts and runs the Fix tools. Defaults: `claude-sonnet-5-5` and `gpt-5.6-sol`; type another model name in **Settings → Model**, and use **Test connection**.

## Learning

Learning is per AI site and off until you turn it on. With it on, Pepper saves each prompt you send there, up to 4,000 characters of the reply, and the stars you give it. After 5 ratings of prompts it wrote for one kind of work, it starts on the approach with your best average and says why. **History → What Pepper learned** shows every number, with a Reset.

## Privacy, in short

Everything is stored in this browser. No Pepper server, account or analytics. With a model key, the text needed for what you asked goes to that provider and nowhere else; your details and file contents never do. See `PRIVACY.md` (also `privacy.html` in the extension).

## Honest limits

- Site selectors change when AI sites redesign. Gemini and Perplexity were checked live on 2026-11-22. ChatGPT and Claude show bot checks to automated browsers, so they were checked on faithful mock pages; please check them in your own browser.
- Microsoft Edge blocks all extensions on Copilot by design. Copilot works in Chrome and Brave (and asks logged-out visitors to sign in).
- PDF text isn't read; paste a PDF's text into its Pocket entry if you want prompts to use it. Word files are read.
- Dragging a file from the Pocket onto a page relies on the browser carrying it; if a site doesn't accept the drop, use **Attach**.
