# Live-test protocol — Pepper — The Personal AI Prompter v0.3

**Draft from Boondoggle step C10 (trust T3: Claude drafted it, the product owner decides). It must be approved before H7 runs it. It predicts no results; every result cell is blank until a tester fills it.**

The automated tests in `pepper-tests/` ran against local mock pages built from Pepper's own selectors. They show the logic works, not that the selectors match the live sites. This protocol is how that gets checked, on the real ChatGPT, Claude, Gemini, Perplexity and Copilot.

## Coverage of the /v4 pass conditions

| Need | Pass condition in /v4 | Protocol rows |
|---|---|---|
| N4 | ≥ 99% of 20 inserts per tier-1 site are submitted correctly by the site's send button | I-01 to I-20 on each site (pass needs 20 of 20; 19 of 20 is 95%) |
| N4 | Every failure falls back to clipboard with a visible message | I-FB on each site, plus the fallback column of every failed I row |
| N4 | Pepper never submits | I-01 to I-20 "submitted by Pepper?" column; NS-1 on each site |
| N5 | With learning off, 3 sends on each of 2 sites leave history unchanged | LO-1 to LO-3 on each site |
| N5 | With Pepper off, 3 sends on each of 2 sites leave history unchanged | OFF-1 to OFF-3 on each site |
| N5 | Per-record delete, clear-all, export (without key) and remove-key all work | D-1 to D-4 (shared section) |
| N6 | In 10 reviewed outputs, every fact about the user in the inserted text traces to a profile answer, memory or file | T-01 to T-10 (shared section, run with H6) |
| C9, C11 handoffs | The stored response is the new reply; other buttons create no record; revoking consent mid-capture discards the record | CAP-1 to CAP-3, FP rows, REV-1 on each site |
| C12 handoff | Unedited Inserts are marked assisted on all five sites, including rich-editor sites | AT-1 to AT-3 on each site |

## Before you start

1. Use a fresh Chrome profile with only Pepper installed (Load unpacked, `pepper-extension/`). Record the Chrome version and the date.
2. Sign in to all five sites with test accounts. Use a plain window size of 1280 × 800 unless a row says otherwise.
3. In onboarding, leave learning **off** everywhere. Add no model key for sections 1–3 (the built-in template is enough to test insert and capture).
4. Fill **About you** with at least Q3, Q6 and Q15, and create one project with a text file attached.
5. Open the Pepper worker console: `chrome://extensions` → Pepper → *service worker* → Console. You will paste these two commands:

```js
// Count of history records
chrome.storage.local.get("pepper_history").then(r => (r.pepper_history || []).length)

// Fingerprint of the whole history (identical fingerprint = byte-identical history)
chrome.storage.local.get("pepper_history").then(async r => {
  const b = new TextEncoder().encode(JSON.stringify(r.pepper_history || []));
  const h = await crypto.subtle.digest("SHA-256", b);
  return [...new Uint8Array(h)].slice(0, 8).map(x => x.toString(16).padStart(2, "0")).join("");
})

// Newest record, to read what was stored
chrome.storage.local.get("pepper_history").then(r => r.pepper_history && r.pepper_history[0])
```

6. Name screenshots `<site>-<row>.png`, for example `claude-I-07.png`, and put the name in the Evidence column.

## Procedure for each site

Run sections A to E on every site, in order. Write the result as **pass**, **fail** or **blocked** (could not run), with a note for anything other than pass.

**A. Learning off and Pepper off (N5).** Learning is off for this site.
1. Note the fingerprint. Type a short prompt yourself and send it with the Enter key (LO-1), then with the site's send button (LO-2), then send a prompt inserted by Pepper (LO-3). After each, note the fingerprint. Pass: all three equal the starting fingerprint.
2. Turn learning **on** for this site, then switch Pepper **off** (toolbar popup). Confirm the peppercorn is gone. Send three prompts as in step 1 (OFF-1 to OFF-3). Pass: fingerprint unchanged and no peppercorn on the page. Turn Pepper back on.

**B. Insert (N4).** Learning stays on for this site.
1. For each of 20 trials, open the panel, type a different rough request (vary length: 3 words to 40 words; include one with a line break and one with quotation marks), click **Write my prompt**, then **Insert into [site]**.
2. Check: the full prompt is in the site's box, nothing was sent by Pepper, and the site's own send button is enabled. Then click the site's send button. Pass for the trial: the site submits the complete prompt as one message, and Pepper submitted nothing. If Pepper showed "Copied — paste it into the box." instead, the trial is a fail for insert, but record whether the clipboard held the prompt (fallback column).
3. I-FB: in the browser, make the box unreachable (for example, start a reply and click Insert while the site has replaced or disabled its box, or zoom the window until the box is hidden). Pass: Pepper shows a visible message and the prompt is on the clipboard.
4. NS-1: search the extension source for any code that dispatches Enter or clicks a send control (`content.js`, `insertIntoSite`). Pass: none. This row is a code read, not a site action; record it once per site for completeness.

**C. Capture and attribution.**
1. CAP-1: in a conversation that already has a reply on screen, send a new prompt. When the reply finishes, read the newest record. Pass: `response` is the start of the new reply, not the earlier one.
2. CAP-2: send a prompt that produces a long reply (ask for 1,500 words). Pass: the record appears; if the reply took longer than 45 seconds, `partial` is first true and later false with the fuller reply.
3. CAP-3: send a prompt whose reply contains a code block or a table. Pass: `response` contains the reply's text.
4. AT-1: Insert a prompt and send it unedited. Pass: newest record has `assisted: true` and `similarity` 1 or close to it.
5. AT-2: Insert, change a few words, send. Pass: `assisted: true`, `similarity` between 0.5 and 1.
6. AT-3: Insert, then delete it and send an unrelated prompt. Pass: `assisted: false`.
7. RT-1: rate the reply in Pepper's rating card. Pass: the record's `rating` is set.

**D. Send false positives.** Learning on. Note the count before each row; click the control; wait 5 seconds. Pass: count unchanged.

**E. Revoking consent mid-capture.** REV-1: send a prompt that gives a long reply. While it is still streaming, turn learning off for the site in the popup. Pass: no record for that prompt appears, then or later.

**Wide and narrow window.** WN-1: repeat one insert trial at a window width of 900 px and one with the site in its narrowest layout. Pass: insert works or falls back with the message.


## ChatGPT (chatgpt.com)

Tester: ______  Date: ______  Chrome version: ______  Account type: ______

| Row | What | Expected | Result | Submitted by Pepper? | Fallback message and clipboard OK? | Evidence | Note |
|---|---|---|---|---|---|---|---|
| LO-1 | Learning off, send with Enter | fingerprint unchanged | | | | | |
| LO-2 | Learning off, send with send button | fingerprint unchanged | | | | | |
| LO-3 | Learning off, send a Pepper insert | fingerprint unchanged | | | | | |
| OFF-1 | Pepper off, send with Enter | fingerprint unchanged, no peppercorn | | | | | |
| OFF-2 | Pepper off, send with send button | fingerprint unchanged, no peppercorn | | | | | |
| OFF-3 | Pepper off, paste a prompt and send | fingerprint unchanged, no peppercorn | | | | | |
| I-01 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-02 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-03 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-04 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-05 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-06 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-07 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-08 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-09 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-10 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-11 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-12 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-13 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-14 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-15 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-16 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-17 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-18 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-19 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-20 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-FB | Box unreachable, click Insert | visible message, prompt on clipboard | | | | | |
| NS-1 | Code read: no Enter or send click | none found | | | | | |
| WN-1 | Insert at 900 px and narrowest layout | insert or visible fallback | | | | | |
| CAP-1 | New reply below an old one | stored response is the new reply | | | | | |
| CAP-2 | Long reply (over 45 s) | record saved, partial then complete | | | | | |
| CAP-3 | Reply with code or table | response text stored | | | | | |
| AT-1 | Unedited insert | assisted, similarity ≈ 1 | | | | | |
| AT-2 | Lightly edited insert | assisted, similarity 0.5–1 | | | | | |
| AT-3 | Unrelated send after insert | not assisted | | | | | |
| RT-1 | Rate in the card | rating stored | | | | | |
| FP-1 | Click regenerate | no new record | | | | | |
| FP-2 | Click copy | no new record | | | | | |
| FP-3 | Click thumbs up | no new record | | | | | |
| FP-4 | Click thumbs down | no new record | | | | | |
| FP-5 | Click read aloud | no new record | | | | | |
| FP-6 | Click the model picker | no new record | | | | | |
| FP-7 | Click New chat | no new record | | | | | |
| FP-8 | Click Share | no new record | | | | | |
| REV-1 | Turn learning off while the reply streams | no record for that prompt | | | | | |

Insert rate for ChatGPT: ____ of 20 submitted correctly. N4 needs 20 of 20 (≥ 99%).


## Claude (claude.ai)

Tester: ______  Date: ______  Chrome version: ______  Account type: ______

| Row | What | Expected | Result | Submitted by Pepper? | Fallback message and clipboard OK? | Evidence | Note |
|---|---|---|---|---|---|---|---|
| LO-1 | Learning off, send with Enter | fingerprint unchanged | | | | | |
| LO-2 | Learning off, send with send button | fingerprint unchanged | | | | | |
| LO-3 | Learning off, send a Pepper insert | fingerprint unchanged | | | | | |
| OFF-1 | Pepper off, send with Enter | fingerprint unchanged, no peppercorn | | | | | |
| OFF-2 | Pepper off, send with send button | fingerprint unchanged, no peppercorn | | | | | |
| OFF-3 | Pepper off, paste a prompt and send | fingerprint unchanged, no peppercorn | | | | | |
| I-01 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-02 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-03 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-04 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-05 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-06 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-07 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-08 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-09 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-10 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-11 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-12 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-13 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-14 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-15 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-16 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-17 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-18 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-19 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-20 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-FB | Box unreachable, click Insert | visible message, prompt on clipboard | | | | | |
| NS-1 | Code read: no Enter or send click | none found | | | | | |
| WN-1 | Insert at 900 px and narrowest layout | insert or visible fallback | | | | | |
| CAP-1 | New reply below an old one | stored response is the new reply | | | | | |
| CAP-2 | Long reply (over 45 s) | record saved, partial then complete | | | | | |
| CAP-3 | Reply with code or table | response text stored | | | | | |
| AT-1 | Unedited insert | assisted, similarity ≈ 1 | | | | | |
| AT-2 | Lightly edited insert | assisted, similarity 0.5–1 | | | | | |
| AT-3 | Unrelated send after insert | not assisted | | | | | |
| RT-1 | Rate in the card | rating stored | | | | | |
| FP-1 | Click retry | no new record | | | | | |
| FP-2 | Click copy | no new record | | | | | |
| FP-3 | Click thumbs up | no new record | | | | | |
| FP-4 | Click thumbs down | no new record | | | | | |
| FP-5 | Click New chat | no new record | | | | | |
| FP-6 | Click project picker | no new record | | | | | |
| FP-7 | Click Share | no new record | | | | | |
| FP-8 | Click the attach button | no new record | | | | | |
| REV-1 | Turn learning off while the reply streams | no record for that prompt | | | | | |

Insert rate for Claude: ____ of 20 submitted correctly. N4 needs 20 of 20 (≥ 99%).


## Gemini (gemini.google.com)

Tester: ______  Date: ______  Chrome version: ______  Account type: ______

| Row | What | Expected | Result | Submitted by Pepper? | Fallback message and clipboard OK? | Evidence | Note |
|---|---|---|---|---|---|---|---|
| LO-1 | Learning off, send with Enter | fingerprint unchanged | | | | | |
| LO-2 | Learning off, send with send button | fingerprint unchanged | | | | | |
| LO-3 | Learning off, send a Pepper insert | fingerprint unchanged | | | | | |
| OFF-1 | Pepper off, send with Enter | fingerprint unchanged, no peppercorn | | | | | |
| OFF-2 | Pepper off, send with send button | fingerprint unchanged, no peppercorn | | | | | |
| OFF-3 | Pepper off, paste a prompt and send | fingerprint unchanged, no peppercorn | | | | | |
| I-01 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-02 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-03 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-04 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-05 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-06 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-07 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-08 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-09 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-10 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-11 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-12 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-13 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-14 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-15 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-16 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-17 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-18 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-19 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-20 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-FB | Box unreachable, click Insert | visible message, prompt on clipboard | | | | | |
| NS-1 | Code read: no Enter or send click | none found | | | | | |
| WN-1 | Insert at 900 px and narrowest layout | insert or visible fallback | | | | | |
| CAP-1 | New reply below an old one | stored response is the new reply | | | | | |
| CAP-2 | Long reply (over 45 s) | record saved, partial then complete | | | | | |
| CAP-3 | Reply with code or table | response text stored | | | | | |
| AT-1 | Unedited insert | assisted, similarity ≈ 1 | | | | | |
| AT-2 | Lightly edited insert | assisted, similarity 0.5–1 | | | | | |
| AT-3 | Unrelated send after insert | not assisted | | | | | |
| RT-1 | Rate in the card | rating stored | | | | | |
| FP-1 | Click regenerate (draft picker) | no new record | | | | | |
| FP-2 | Click copy | no new record | | | | | |
| FP-3 | Click thumbs up | no new record | | | | | |
| FP-4 | Click thumbs down | no new record | | | | | |
| FP-5 | Click Share and export | no new record | | | | | |
| FP-6 | Click New chat | no new record | | | | | |
| FP-7 | Click the microphone | no new record | | | | | |
| REV-1 | Turn learning off while the reply streams | no record for that prompt | | | | | |

Insert rate for Gemini: ____ of 20 submitted correctly. N4 needs 20 of 20 (≥ 99%).


## Perplexity (www.perplexity.ai)

Tester: ______  Date: ______  Chrome version: ______  Account type: ______

| Row | What | Expected | Result | Submitted by Pepper? | Fallback message and clipboard OK? | Evidence | Note |
|---|---|---|---|---|---|---|---|
| LO-1 | Learning off, send with Enter | fingerprint unchanged | | | | | |
| LO-2 | Learning off, send with send button | fingerprint unchanged | | | | | |
| LO-3 | Learning off, send a Pepper insert | fingerprint unchanged | | | | | |
| OFF-1 | Pepper off, send with Enter | fingerprint unchanged, no peppercorn | | | | | |
| OFF-2 | Pepper off, send with send button | fingerprint unchanged, no peppercorn | | | | | |
| OFF-3 | Pepper off, paste a prompt and send | fingerprint unchanged, no peppercorn | | | | | |
| I-01 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-02 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-03 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-04 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-05 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-06 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-07 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-08 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-09 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-10 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-11 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-12 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-13 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-14 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-15 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-16 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-17 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-18 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-19 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-20 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-FB | Box unreachable, click Insert | visible message, prompt on clipboard | | | | | |
| NS-1 | Code read: no Enter or send click | none found | | | | | |
| WN-1 | Insert at 900 px and narrowest layout | insert or visible fallback | | | | | |
| CAP-1 | New reply below an old one | stored response is the new reply | | | | | |
| CAP-2 | Long reply (over 45 s) | record saved, partial then complete | | | | | |
| CAP-3 | Reply with code or table | response text stored | | | | | |
| AT-1 | Unedited insert | assisted, similarity ≈ 1 | | | | | |
| AT-2 | Lightly edited insert | assisted, similarity 0.5–1 | | | | | |
| AT-3 | Unrelated send after insert | not assisted | | | | | |
| RT-1 | Rate in the card | rating stored | | | | | |
| FP-1 | Click Rewrite | no new record | | | | | |
| FP-2 | Click copy | no new record | | | | | |
| FP-3 | Click Share | no new record | | | | | |
| FP-4 | Click the related-question chips | no new record | | | | | |
| FP-5 | Click thumbs | no new record | | | | | |
| FP-6 | Click the focus or model picker | no new record | | | | | |
| FP-7 | Click New thread | no new record | | | | | |
| REV-1 | Turn learning off while the reply streams | no record for that prompt | | | | | |

Insert rate for Perplexity: ____ of 20 submitted correctly. N4 needs 20 of 20 (≥ 99%).


## Copilot (copilot.microsoft.com)

Tester: ______  Date: ______  Chrome version: ______  Account type: ______

| Row | What | Expected | Result | Submitted by Pepper? | Fallback message and clipboard OK? | Evidence | Note |
|---|---|---|---|---|---|---|---|
| LO-1 | Learning off, send with Enter | fingerprint unchanged | | | | | |
| LO-2 | Learning off, send with send button | fingerprint unchanged | | | | | |
| LO-3 | Learning off, send a Pepper insert | fingerprint unchanged | | | | | |
| OFF-1 | Pepper off, send with Enter | fingerprint unchanged, no peppercorn | | | | | |
| OFF-2 | Pepper off, send with send button | fingerprint unchanged, no peppercorn | | | | | |
| OFF-3 | Pepper off, paste a prompt and send | fingerprint unchanged, no peppercorn | | | | | |
| I-01 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-02 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-03 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-04 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-05 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-06 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-07 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-08 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-09 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-10 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-11 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-12 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-13 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-14 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-15 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-16 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-17 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-18 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-19 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-20 | Insert, then site's send | full prompt submitted once by the site | | | | | |
| I-FB | Box unreachable, click Insert | visible message, prompt on clipboard | | | | | |
| NS-1 | Code read: no Enter or send click | none found | | | | | |
| WN-1 | Insert at 900 px and narrowest layout | insert or visible fallback | | | | | |
| CAP-1 | New reply below an old one | stored response is the new reply | | | | | |
| CAP-2 | Long reply (over 45 s) | record saved, partial then complete | | | | | |
| CAP-3 | Reply with code or table | response text stored | | | | | |
| AT-1 | Unedited insert | assisted, similarity ≈ 1 | | | | | |
| AT-2 | Lightly edited insert | assisted, similarity 0.5–1 | | | | | |
| AT-3 | Unrelated send after insert | not assisted | | | | | |
| RT-1 | Rate in the card | rating stored | | | | | |
| FP-1 | Click regenerate | no new record | | | | | |
| FP-2 | Click copy | no new record | | | | | |
| FP-3 | Click thumbs up | no new record | | | | | |
| FP-4 | Click thumbs down | no new record | | | | | |
| FP-5 | Click Share | no new record | | | | | |
| FP-6 | Click the voice button | no new record | | | | | |
| FP-7 | Click New chat | no new record | | | | | |
| REV-1 | Turn learning off while the reply streams | no record for that prompt | | | | | |

Insert rate for Copilot: ____ of 20 submitted correctly. N4 needs 20 of 20 (≥ 99%).


## Shared: data controls (N5)

Run once, in the dashboard, after the site sections (so history has records). Set a test model key first so remove-key and export can be checked.

| Row | What | Expected | Result | Evidence |
|---|---|---|---|---|
| D-1 | History → Delete one record | that record is gone; count drops by one; others unchanged | | |
| D-2 | Privacy and data → Delete history | history empty; profile, memories, projects, files and saved prompts unchanged | | |
| D-3 | Privacy and data → Export, then search the file for the key | file contains history and profile; the key text appears nowhere; no `pepper_settings` | | |
| D-4 | Privacy and data → Remove key | key field empty in Model and settings; Write my prompt uses the template | | |
| D-5 | Uninstall, reinstall, check storage | storage empty before onboarding writes defaults [needs review: browser behaviour] | | |

## Shared: traced facts (N6, run with H6)

Use a real P-1 project (the user's own resume and a real application). Set a model key. Make 10 prompts across at least three sites, mixing Light, Moderate and Heavy. For each inserted prompt, the user marks every statement about themselves as **traced** (name the profile answer, memory or file it came from) or **untraced**. Assumptions the user added count as traced to that confirmation.

| Row | Site | Request | Facts about the user in the inserted text | Traced | Untraced (quote each) | Evidence |
|---|---|---|---|---|---|---|
| T-01 | | | | | | |
| T-02 | | | | | | |
| T-03 | | | | | | |
| T-04 | | | | | | |
| T-05 | | | | | | |
| T-06 | | | | | | |
| T-07 | | | | | | |
| T-08 | | | | | | |
| T-09 | | | | | | |
| T-10 | | | | | | |

N6 passes only with 0 untraced facts across all 10. Otherwise, C5 is re-issued with the failing examples.

## After the run (H7)

For every failed row, write the step to re-issue and its trust level, for example "Claude I-07 fails: insert loses line breaks → C8, T2". Selector failures are fixed in one place, the `SITES` table at the top of `lib/core.js`.
