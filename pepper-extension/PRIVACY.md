# Pepper — The Personal AI Prompter: privacy notice

**Draft for review. Every statement marked [needs review] must be checked by a qualified reviewer before this notice is published. This draft does not claim compliance with any law.**

Version 0.4.0. Last updated 2026-11-22.

## The short version

Pepper keeps everything in your own browser. There is no Pepper server, no account, no analytics and no tracking. The only time anything leaves your browser is when you have added your own model key: then the text Pepper needs goes to the provider you chose (Anthropic or OpenAI), and nowhere else.

Pepper saves the prompts you send, the replies and your ratings only on AI sites where you have turned learning on. Learning is off until you turn it on.

## What Pepper stores, and where

Everything below is kept in your browser's extension storage (`chrome.storage.local`) on this device. It is not synced to other devices.

| Storage key | What it holds | When it is written |
|---|---|---|
| `pepper_settings` | Whether Pepper is on, where it floats, which features are on, your provider, whether a key is saved and its last four characters, the model name, the typing-hint length | When you change a setting |
| `pepper_profile` | Your setup answers: what to call you, your role, favorite AI sites, what you use AI for, how you like answers, your tone, your focus time, and the optional prompt preferences | When you answer them |
| `pepper_details` | Personal details you chose to keep for forms, such as your name, email, phone, links, address, school and current job | When you edit them |
| `pepper_pocket` | The list of things in your Pocket: file names, sizes and types, up to 10,000 characters of text from text and Word files (so prompts can use them), links you saved and templates you wrote | When you add, edit or remove an item |
| `pepper_reminders` | Your reminders: text, time, days and whether each is on | When you change them |
| `pepper_memories` | Facts you asked Pepper to remember, each on or off | When you add, edit, confirm or delete one |
| `pepper_projects` | Your projects: name, type, description and which Pocket files are attached | When you create or edit a project |
| `pepper_active_project` | Which project is active | When you pick one |
| `pepper_saved_prompts` | Prompts you clicked Save on | When you click Save |
| `pepper_consent` | Whether learning is on for each of the five AI sites | When you change it |
| `pepper_history` | Only on AI sites with learning on: each prompt you sent, the rough request you typed into Pepper (if you used it), whether it went through Pepper and how closely it matched, the approach, the project, the site, the time, the reply (up to 4,000 characters) and your star rating | When you press send on that site, and when the reply finishes |
| `pepper_learning` | What Pepper worked out from your rated history: the best approach and typical length per kind of work, the numbers behind it, when you last reset it, and facts you dismissed | Recalculated whenever history or consent changes |
| `pepper_ui` | Where you dragged the peppercorn on each site, sites where you hid it, and hints you dismissed | When you move it, hide it or dismiss a hint |
| `pepper_schema` | The storage format version, used to upgrade your data safely | On install and update |

**Your API key and the full contents of the files in your Pocket are kept apart,** in a database inside the extension (IndexedDB, named `pepper-vault`) that only Pepper's own pages and its background worker can open. Scripts on web pages can't read it, and neither can the part of Pepper that runs on web pages: its panel asks the worker for a file when you point at it in the Pocket (so a drag can start straight away), attach, drag or open it. A key is used only with the provider it was saved for; switching provider without a new key removes it.

When you send a prompt from another page to an AI site, Pepper holds it in the browser's session storage for up to two minutes, tied to the tab it opened, and deletes it once it is placed in the box.

## What Pepper reads on the pages you visit

- **On the five AI sites** (chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, perplexity.ai and copilot.microsoft.com), Pepper reads the prompt box and, only where learning is on, the newest reply after you press send.
- **On other sites, only where Pepper is running:** that is every site if you chose "Keep floating everywhere" and your browser allowed it, or a single tab when you call Pepper there with Alt+Shift+P, the toolbar button or the right-click menu. There Pepper reads the text you select, the text field you are typing in when you ask it to fix something, the labels of form fields (to recognize ones it can fill) and, if you tick "Use this page", the page's title, address and main text.
- None of this is stored or sent anywhere unless you act on it: saving to your Pocket, filling a form, or using a model key.
- What you type into Pepper's panel on a website can be seen by that website's own scripts, the same as anything else typed on that page. Don't type secrets into Pepper on a site you don't trust. [needs review]

## How long it is kept

History older than 90 days is deleted automatically, and Pepper keeps at most 2,000 history records, removing the oldest first. Everything else stays until you delete it or uninstall Pepper.

## What is sent to your model provider

Only if you have added an API key. Pepper sends these to the one provider you chose (`api.anthropic.com` or `api.openai.com`), using your key:

1. **When you click "Write my prompt":** what you typed into Pepper; your profile answers; your active memories; the active project's name, type and description; the text of that project's attached files (up to 2,500 characters per file and 6,000 in total); if you ticked "Use this page", the page's address and up to 2,500 characters of its text; the approach; a target length; any assumptions you added.
2. **When you click Shorter, Longer, More formal or More casual:** the current prompt.
3. **When you use Fix, Improve, Shorter, More formal, Similar ideas or Explain:** the text you chose, and your role, tone, audience and things to avoid.
4. **When you click "Suggest memories":** up to 30 of your recorded prompts, each cut to 800 characters.
5. **When you click "Test connection":** the word "ping".

**Your profile, the text of your project files and any text you ask Pepper to fix go to that provider when you use these features with a key set.** What the provider does with that data is governed by your agreement with them, not by Pepper. [needs review]

Your personal details and the contents of Pocket files are never sent to a model provider. Your API key is sent only to the provider it belongs to. It is never sent anywhere else, never logged, never shown on web pages and never included in an export.

Without a key, nothing leaves your browser. Pepper writes prompts and does quick fixes on your device.

## Filling forms and attaching files

Pepper fills a form only when you click Fill, only in empty fields that you can see on the screen, and never submits anything. Fields a page hides from view are never filled. It attaches a file only when you click Attach or drag it onto the page yourself. Whatever you then submit goes to that website under its own terms. [needs review]

Pepper refuses to keep passwords, payment card numbers and government ID numbers in your details, and never fills password, payment or ID fields.

## What happens on the AI sites

When you click Insert, or send a prompt from another page, Pepper places the prompt in the site's own prompt box. It never presses send. When you press send, the prompt goes to that site under that site's own terms and privacy policy, exactly as if you had typed it. [needs review]

If Pepper can't place the prompt in the box, it copies it to your clipboard and tells you.

## Reminders

If you turn on reminders, Pepper asks your browser for permission to show notifications and shows them at the times you set. Reminders are scheduled inside your browser; nothing is sent anywhere.

## What Pepper never collects

- No analytics, telemetry, crash reports or usage statistics.
- No account. No name or email, unless you type them into your own profile or details.
- No browsing history. Pepper doesn't keep a record of the pages you visit.
- Nothing is recorded while Pepper is switched off, or on an AI site where learning is off.

## How you stay in control

In the dashboard you can:

- turn learning on or off for each AI site, or for all five at once (turning it off mid-reply discards the pending record);
- choose where Pepper floats, hide it on any site, or switch it off everywhere;
- turn each feature (Pocket, writing helper, autofill, reminders) on or off;
- edit or delete any detail, Pocket item, memory, reminder or history record, or all history;
- export your data as a JSON file (your API key and file contents are left out);
- remove your API key;
- delete everything Pepper has stored.

Under **History → What Pepper learned** you can see what Pepper concluded and reset it for any kind of work.

## Permissions Pepper asks for

- **Storage:** to keep your data in this browser.
- **Scripting and active tab:** to open Pepper on a page when you ask for it, and on every site if you choose "Keep floating everywhere".
- **Context menus:** for the right-click "Save to Pepper's Pocket" and "Fix or improve with Pepper".
- **Alarms:** to schedule your reminders.
- **Notifications (asked only when you turn on reminders).**
- **Access to all sites (asked only when you choose "Keep floating everywhere").**
- **api.anthropic.com and api.openai.com:** to reach your model provider when you add a key.

## Uninstalling

Removing Pepper from your browser deletes everything in its extension storage on that device. [needs review: confirm current Chrome, Brave and Edge behaviour]

## Who this notice is from, and how to ask questions

[needs review: name of the publisher and a contact address, as required by the Chrome Web Store and Microsoft Edge Add-ons user-data policies]

## Changes to this notice

If this notice changes, the new version ships with the extension update and the date above changes. [needs review: whether material changes require renewed consent]
