# Pepper — The Personal AI Prompter

Version 0.3.0. A Chrome and Edge extension (Manifest V3).

You type what you want in a few words. Pepper rewrites it into a prompt with six labelled parts (Role, Context, Task, Constraints, Output format, Success criteria), using only what you have told it about yourself. Then it places the prompt in the chat box of ChatGPT, Claude, Gemini, Perplexity or Copilot. You read it and press send. Pepper never sends anything for you.

## Install (unpacked)

1. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and choose this folder (the one containing `manifest.json`).
3. The welcome page opens. Choose where Pepper may learn, optionally add a model key, and answer three questions.

If you are updating from v0.2, Pepper keeps all your data, converts it to the new format, and opens the welcome page with a note about your old history. You can keep or delete it.

## Using it

On any of the five sites, click the green peppercorn in the bottom-right corner, or press **Alt+Shift+P**. Drag the peppercorn up or down if it covers something; Pepper remembers where you put it on each site.

1. Pick a project at the top of the panel, or leave it on No project.
2. Type your request, or start from a suggestion: your best-rated past requests, saved prompts, recurring tasks or project ideas.
3. Choose an approach (Balanced, Clarify, Expert role, Constraints, Deeper, Leaner), or let Pepper pick the one that has worked best for you.
4. Click **Write my prompt** (Ctrl+Enter, or ⌘+Enter on a Mac).
5. Check the result. Anything Pepper guessed about you is listed separately under **Pepper assumed these**. Assumptions are never in the prompt unless you click **Add to prompt** or **Add and remember**.
6. Use **Shorter**, **Longer**, **More formal**, **More casual** or **Edit** if needed, then **Insert into [site]**. If Pepper can't reach the box, it copies the prompt and tells you.
7. Press the site's own send button.

The dashboard (the settings button at the top of the panel, or the toolbar popup) holds your profile, memories, projects and files, saved prompts, history, what Pepper learned, privacy controls and model settings.

## With or without a model key

Without a key, Pepper writes the prompt with a built-in template on your device. It works offline and every profile answer still changes it.

With your own Anthropic or OpenAI key, your model writes the prompt. The default models are `claude-sonnet-5-5` and `gpt-5.6-sol`; you can type another model name in **Model and settings**. Use **Test connection** to check the key.

## Learning, and what it saves

Learning is set per site and is **off on all five until you turn it on** (in onboarding, the popup, or **Privacy and data**). With learning on for a site, Pepper saves each prompt you send there, up to 4,000 characters of the reply, and the stars you give it. With learning off, or Pepper switched off, nothing is saved.

From those records Pepper:

- picks the approach with your highest average rating for each kind of work, once you have rated 5 replies to prompts it wrote, and tells you why ("Pepper chose Expert role: your average 5.0 stars across 2 ratings.");
- aims for the length of your 4 and 5 star prompts, once there are 3, without leaving the length range you chose;
- suggests your best-rated past requests in the panel;
- with a model key, finds facts you stated about yourself in past prompts and offers them as memories, which you confirm or dismiss.

Only prompts sent within 10 minutes of an Insert, and still at least half the same text, count as written with Pepper. **What Pepper learned** shows every number it used, with a Reset for each kind of work.

Pepper does not paste your past prompts or replies into new prompts.

## How each question is used

| | Question | Where it changes the prompt |
|---|---|---|
| Q1 | Where you use AI | Keeps the prompt self-contained for the tools you named |
| Q2 | What you use AI for | The expert in Role when no project is active; a line in Context |
| Q3 | Role or occupation | Context ("I'm a…") |
| Q4 | Field or industry | Context; the expert in Role if nothing else sets it |
| Q5 | Response style | Constraints; step-by-step adds numbered steps to Output format |
| Q6 | Tone | Constraints (More formal and More casual override it once) |
| Q7 | Prompting experience | Beginner: a note under each section saying what it's for. Intermediate: one opening line. Advanced: nothing extra |
| Q8 | Formatting | Output format |
| Q9 | Response length | Constraints |
| Q10 | Goals | Context; a panel suggestion |
| Q11 | Recurring tasks | Panel suggestions; Context asks for a reusable structure |
| Q12 | Languages | The first one is the language of the prompt and the reply |
| Q13 | Things to avoid | Constraints |
| Q14 | Audience | Role, Constraints and Success criteria |
| Q15 | How much to expand | Target length: Light 150–250 words, Moderate 400–600, Heavy 800–950; also how much detail the template adds |

## Files

Text files (txt, md, csv, json, code and similar) are read when you add them. For PDF or Word files, paste the text once in **Projects and files**. Pepper uses up to 2,500 characters per file and 6,000 per prompt, and marks anything trimmed. File text is always sent and inserted as labelled data blocks, never mixed into Pepper's instructions, so a file that says "ignore previous instructions" can't change the Role. Untick **Attach file text** in the panel to insert the prompt without it.

## Privacy, in short

Everything is stored in this browser only. There is no Pepper server, account or analytics. With a model key, the text needed to write a prompt (your request, profile answers, active memories, the project and its file text) goes to that provider and nowhere else. The key is never exported or shown to the AI sites. See `PRIVACY.md` (also `privacy.html` in the extension), a draft that still needs legal review.

## Honest limits

- The page selectors in `lib/core.js` (`SITES`) are best guesses for the live sites as of October 2026. They were tested against local mock pages only. AI sites change their markup often, so insert, send detection and reply capture must be checked on the live sites with `docs/LIVE-TEST-PROTOCOL.md`.
- Reply capture reads the newest reply after you press send. If a site's reply can't be read, the record is kept with an empty reply and can still be rated.
- On Microsoft Edge 150 and later, Pepper can't run on Copilot: Edge blocks every third-party extension on `copilot.microsoft.com`, and no policy overrides it. Copilot works in Chrome.
- PDF and Word files are not parsed; paste their text.
- Learning needs ratings. Until you have rated 5 replies to Pepper-written prompts for a kind of work, Pepper uses Balanced.

## Files in this folder

`manifest.json`, `background.js` (storage writer, model calls), `content.js` (panel, insert, capture), `lib/core.js` (all prompt, parsing, consent, learning and migration logic), `dashboard.*`, `onboarding.*`, `popup.*`, `privacy.html`, `pages.css`, `content.css`, `icons/`, `PRIVACY.md`.
