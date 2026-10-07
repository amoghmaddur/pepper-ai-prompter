# Pepper — The Personal AI Prompter: privacy notice

**Draft for review (Boondoggle step C15). Not yet approved. Every statement marked [needs review] must be checked by a qualified reviewer (step H9) before this notice is published. This draft does not claim compliance with any law.**

Version 0.3.0. Last updated 2026-10-01.

## The short version

Pepper keeps everything in your own browser. There is no Pepper server, no account, no analytics and no tracking. The only time anything leaves your browser is when you have added your own model key: then the text Pepper needs to write a prompt goes to the provider you chose (Anthropic or OpenAI), and nowhere else.

Pepper saves the prompts you send, the replies and your ratings only on sites where you have turned learning on. Learning is off on all five sites until you turn it on.

## What Pepper stores, and where

Everything below is kept in your browser's extension storage (`chrome.storage.local`) on this device. It is not synced to other devices.

| Storage key | What it holds | When it is written |
|---|---|---|
| `pepper_settings` | Whether Pepper is on, your provider, your API key, the model name, the typing-hint length, whether you finished onboarding | When you change a setting |
| `pepper_profile` | Your answers to the up-to-15 "About you" questions | When you answer them |
| `pepper_memories` | Facts you asked Pepper to remember, each on or off | When you add, edit, confirm or delete one |
| `pepper_projects` | Your projects: name, type, description, which files are attached | When you create or edit a project |
| `pepper_active_project` | Which project is active | When you pick one |
| `pepper_files` | Files you added: name, size, type and their text (up to 200,000 characters each) | When you add a file or paste its text |
| `pepper_saved_prompts` | Prompts you clicked Save on | When you click Save |
| `pepper_consent` | Whether learning is on for each of the five sites | When you change it |
| `pepper_history` | Only on sites with learning on: each prompt you sent, the rough request you typed into Pepper (if you used it), whether it went through Pepper and how closely it matched, the approach used, the project, the site, the time, the reply (up to 4,000 characters) and your star rating | When you press send on that site, and when the reply finishes |
| `pepper_learning` | What Pepper worked out from your rated history: the best approach and typical length per kind of work, the numbers behind it, when you last reset it, and facts you dismissed so they aren't suggested again | Recalculated whenever history or consent changes |
| `pepper_ui` | Where you dragged the peppercorn on each site | When you move it |
| `pepper_schema` | The storage format version, used to upgrade your data safely | On install and update |

Pepper never reads the rest of the page you are on. On the five AI sites it reads the prompt box, and, only where learning is on, the newest reply after you press send.

## How long it is kept

History older than 90 days is deleted automatically, and Pepper keeps at most 2,000 history records, removing the oldest first. Everything else stays until you delete it or uninstall Pepper.

## What is sent to your model provider

Only if you have added an API key. Pepper sends these to the one provider you chose (`api.anthropic.com` or `api.openai.com`), using your key:

1. **When you click "Write my prompt":** what you typed into Pepper; your profile answers; your active memories; the active project's name, type and description; the text of that project's attached files (up to 2,500 characters per file and 6,000 in total); the approach selected; a target length; any assumptions you added.
2. **When you click Shorter, Longer, More formal or More casual:** the current prompt.
3. **When you click "Find facts in my prompts" in Memories:** up to 30 of your recorded prompts (the rough request where you used Pepper), each cut to 800 characters.
4. **When you click "Test connection":** the word "ping".

**Your profile and the text of your files, including a resume, go to that provider whenever you write a prompt with a key set.** What the provider does with that data is governed by your agreement with them, not by Pepper. [needs review]

Your API key is sent only to the provider it belongs to. It is never sent anywhere else, never logged, never shown on the AI sites and never included in an export.

Without a key, nothing leaves your browser. Pepper writes the prompt with its built-in template on your device.

## What happens on the AI sites

When you click Insert, Pepper places the prompt in the site's own prompt box. It never presses send. When you press send, the prompt goes to that site under that site's own terms and privacy policy, exactly as if you had typed it. [needs review]

If Pepper can't place the prompt in the box, it copies it to your clipboard and tells you.

## What Pepper never collects

- No analytics, telemetry, crash reports or usage statistics.
- No account, email address or name, unless you type them into your own profile or files.
- No browsing history. Pepper runs only on chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, perplexity.ai and copilot.microsoft.com.
- Nothing is recorded while Pepper is switched off, or on a site where learning is off.

## How you stay in control

In the dashboard under **Privacy and data** you can:

- turn learning on or off for each site, or for all five at once (turning it off mid-reply discards the pending record);
- switch Pepper off everywhere, which hides it and stops all recording;
- delete any single history record, or all history;
- export everything as a JSON file (your API key and settings are left out);
- remove your API key;
- delete everything Pepper has stored.

Under **What Pepper learned** you can see what Pepper concluded and reset it for any kind of work.

## Uninstalling

Removing Pepper from your browser deletes everything in its extension storage on that device. [needs review: confirm current Chrome and Edge behaviour]

## Who this notice is from, and how to ask questions

[needs review: name of the publisher and a contact address, as required by the Chrome Web Store and Microsoft Edge Add-ons user-data policies]

## Changes to this notice

If this notice changes, the new version ships with the extension update and the date above changes. [needs review: whether material changes require renewed consent]
