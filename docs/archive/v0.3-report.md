# Pepper — The Personal AI Prompter: v0.2 → v0.3

Built against the SDD and Boondoggle Score r6 in `Pepper-The-Personal-AI-Prompter-SDD-and-Reflection.pdf`. October 2026.

**How to read the status words.** *Done* means the code is written and the step's handoff test was executed and passed, against local mock pages where a site is involved. *Needs human evidence* means a condition can only be checked on the live sites, with a real model, or by a person. Nothing below is marked passed unless a named test ran. The mock pages are built from Pepper's own selectors, so they say nothing about whether those selectors match the live sites; that is what H7 is for.

Test totals at packaging: **75 unit tests and 20 browser checks, all passing** (`pepper-tests/`).

## What you asked for, and what changed

**"Make sure all recorded prompts and responses are being saved for Pepper itself, to learn more about the user and tailor content."**

On every site where learning is on, Pepper saves the prompt you send, the reply (up to 4,000 characters, completed even for replies over 45 seconds), whether it went through Pepper, the approach and project, and your rating. All of it is now used:

- the approach with your best average rating becomes the default for that kind of work (N7);
- the median length of your 4–5 star prompts tunes the target length, inside your Q15 range;
- your best-rated past requests appear as suggestions in the panel;
- with a key, Pepper reads your past prompts and offers facts you stated about yourself as memories;
- assumptions you confirm can be saved as memories in one click.

The dashboard shows every number behind these, with a Reset per kind of work.

Recording still requires per-site learning to be on. Your SDD makes that a principle (P2), and v0.2 recording without consent was finding F-1/F-2, a release blocker. Recording everywhere by default would undo that, so instead turning learning on is one click: "Turn on for all five" in onboarding and in Privacy and data. Pepper also never puts your past prompts or replies into new prompts. That would bring in facts you never confirmed, which N6 forbids.

**"Make the UI more user friendly."**

- **Look:** a new design built on peppercorn colours. Green marks actions; pink marks things Pepper learned or guessed for you to check.
- **Panel:** shows the prompt as six labelled parts, follows the page's light or dark theme, has a draggable peppercorn and the Alt+Shift+P shortcut. It also offers suggestions, approach chips that mark your learned best, and assumptions you can edit before adding.
- **New pages:** a welcome page (consent, optional key, three questions, and a note for v0.2 users about their old history) and a toolbar popup with a learning switch for the current site.
- **Dashboard:** rebuilt with nine sections and a setup checklist.

**"Go through the Boondoggle report and improve everything that could be."** Every Claude step C1–C17 is addressed below. The ones that are drafting work (C10, C13, C15, C16, C17) are written for your decision.

## Boondoggle step status

### Claude steps

| Step | What it asked | Status | Evidence |
|---|---|---|---|
| C1 | On/off switch gates every recording path; orb hidden | Done. Needs human evidence (H5) | Unit "C1/N5 global switch off…"; browser "C1 global switch off: orb gone, nothing recorded…". Entry points: Enter key (`onKeyDownCapture`) and the per-site send button (`onClickCapture`), both unbound by `unbind()`; `canRecord()` re-reads storage at send time and again before saving |
| C2 | Least-privilege manifest; framing fails; orb on five sites, not poe.com | Done | Unit "N8 manifest…"; browser "C2 not injected on… poe.com", "C2 framing the dashboard from a website fails" (iframe ends at `chrome-error://`) |
| C3 | Closed shadow root; ignore foreign senders | Done | Browser "C3 shadow root is closed: the page sees null"; unit "C3 a message from another extension gets no response" |
| C4 | Storage integrity, UUIDs, no `_done`, schema 1 migration, retention | Done, with deviation D6 | Unit "C4 two tabs… (40 concurrent writes)", its control test, "C4 no stored record contains _done", "C4 migration keeps every v0.2 record…", "C4 migration is idempotent", "C4 prune…", "C4 update from v0.2…" |
| C5 | Assumption separator; Insert uses prompt only; missing-marker warning | Done. N6 needs H6 | Unit: six parseReply tests, "C5 insert text never contains an assumption line", "C5 confirmed assumption goes into CONTEXT…"; browser "model path… assumptions shown, never inserted", "model reply without the marker shows the SDD warning" |
| C6 | Every question changes the output; Q1–Q15 table; Pro first click | Done, with deviation D5 | Unit: 15 "N2 Qn… changes the template and the model instruction" tests plus Q7, Q15, Q2, Q11, Q12 specifics; browser "C6 rewrite buttons…"; Q1–Q15 table in `pepper-extension/README.md` |
| C7 | Files as data blocks, budgets, [truncated], file names shown | Done, with deviation D8. Model-path ROLE check needs human evidence | Unit "N3 file text is in the user message…", "N3 an injection file leaves the ROLE section unchanged…" (template, all six approaches), "N3 budgets…"; browser "model path…" checks the request body and `#filesUsed` |
| C8 | Per-site insert; read-back; clipboard fallback; never Enter or send | Done in code. Live rate needs H7 | Browser "Insert puts the prompt in ChatGPT's box without sending…", "Claude, Gemini (contenteditable), Perplexity and Copilot (textarea)…", "no reachable box: Insert copies instead and says so". Code: `insertIntoSite` in `content.js` dispatches no key events and clicks nothing |
| C9 | Per-site send selector; capture the new reply; 250 ms throttle; 2 s dedupe; `canRecord` | Done | Browser "M6 learning on for ChatGPT: one send records the NEW reply…", "C9 clicking 'Send feedback' creates no record". `canRecord` is the real consent check, not a stub |
| C10 | Live-test protocol | Draft for your approval | `docs/LIVE-TEST-PROTOCOL.md`. Every N4, N5 and N6 condition maps to rows; one evidence table per site; no predicted results |
| C11 | Consent manager, onboarding, per-site toggles, discard on revoke, default memory inactive | Done, with deviation D4. Confirm in H7 | Unit "C11 fresh install…", "N5/C11 fresh install: 3 sends on each of 2 sites…", "C11 learning on for one site records only there", "Writer check…", "Content scripts are limited to a whitelist of writes"; browser "N5 fresh install…", "M5 revoking learning mid-reply discards the pending record" |
| C12 | Attribution by similarity; migrate `enhanced` | Done ahead of H7 (deviation D1), with deviation D3 | Unit: five "C12…" tests and the migration tests; browser insert tests on all five mock sites record `assisted: true` |
| C13 | Interview guide | Draft for your approval | `docs/INTERVIEW-GUIDE.md`. Every question tagged S-D to S-G or context; Pepper not mentioned in section 1 |
| C14 | Learning engine | Done ahead of H2 and H8 (deviation D1); scope extended (deviation D2) | Unit: seven "C14…" tests, "M7 learning recomputes in the writer…"; browser "M7 learned lens is preselected with the reason shown" |
| C15 | Privacy notice draft | Draft for H9 | `pepper-extension/PRIVACY.md` and `privacy.html`: every storage key and all four outbound flows; six [needs review] markers; no compliance claim |
| C16 | Truthful-claims table | Table below; strings applied for H10 to approve (deviation D9) | See "C16 truthful-claims table" |
| C17 | Needs verification report | Table below | See "C17 needs verification" |

### Human steps

| Step | Status now |
|---|---|
| H1 Confirm /v0 and five sites | Done per the score. The manifest and `SITES` list the same five sites (unit "N8 manifest…") |
| H2 Confirm N7 | **Open, and now urgent:** the learning engine is built (D1), and it goes beyond lens choice (D2) |
| H3 Confirm the consent model | Open. The build follows P2 and M5 as written: learning on means capture on, per site, off by default |
| H4 Audit trust levels and order | Open. The order was not followed for C12 and C14 (D1); please rule on it |
| H5 Run the C1 test yourself on ChatGPT and Claude | Open |
| H6 Trace facts in 10 real P-1 outputs | Open. Rows T-01 to T-10 in the live-test protocol |
| H7 Run the protocol on all five sites | Open. Needs C10 approval first |
| H8 Five interviews before learning code | Open. Learning code exists already (D1) |
| H9 Legal review of the privacy notice | Open |
| H10 Approve the C16 strings | Open |
| H11 Independent security review | Open |
| H12 Release decision | Open |
| H13 Day 14 and week 8 store figures | Open (post-launch) |
| H14 Post-launch interviews | Open (post-launch). The interview guide covers it |

## Deviations that need your sign-off

**D1. Built out of order (rule on this in H4; H2 and H8 decide the substance).** The score gates C14 on H2 and on H8, and gates C12 on H7. I built them now because you asked for everything to be improved, and because learning is what makes recorded prompts useful. Learning only acts on sites where the user turned it on. If you want to keep to the score's order, I can put the learning features behind a setting that stays off until H8 and H2 are done; history would still be recorded where consented.

**D2. N7 scope extended (H2).** N7 as drafted covers the default lens per project type only. v0.3 also learns:
- a target length, from the median of 4–5 star prompts, kept inside the Q15 range;
- "worked well before" suggestions in the panel;
- with a key, fact suggestions for memories.

All of these are visible and resettable, and none adds unconfirmed facts to a prompt. H2 should confirm, cut, or rewrite N7 to cover them.

**D3. "Assisted" needs at least 50% similarity (H2).** C12 says any send within 10 minutes of an Insert is assisted, with the similarity recorded. That would count an unrelated send as written with Pepper, and let it influence learning. v0.3 requires a send within 10 minutes and a similarity of at least 0.5. The similarity is still stored on every record, so the threshold can change later without losing data.

**D4. Consent is keyed by site, not by host.** C11 specifies `pepper_consent = { host: { learning } }`. ChatGPT and Perplexity each have two hosts, so v0.3 keys by site (`chatgpt`, `claude`, `gemini`, `perplexity`, `copilot`): one switch per site, as the user sees it. `canRecord` maps the host to its site.

**D5. Pro/Casual toggle replaced.** Instead of fixing the toggle, there are two buttons, More formal and More casual. The handoff ("the first click yields Pro") is met: the first click of either applies it.

**D6. Write queue in the worker instead of an `update(key, fn)` helper.** C4 asked for a helper that re-reads before writing, used by content.js and dashboard.js. Re-reading alone still lets two tabs read the same old list and overwrite each other. In v0.3, every list write from every tab and page goes through one serialized queue in the background worker. That queue also re-checks consent before storing any record from a web page, and limits what web pages may write. The control test shows the same race without the queue loses records.

**D7. Assumption actions.** C5 asks for Confirm and Dismiss. v0.3 has three actions: Add to prompt (Confirm), Add and remember (also saves it as a memory), and Dismiss. You can also edit the wording before adding.

**D8. File text goes into the inserted prompt too.** C7 moves file text into the user message to the model, which v0.3 does. But the AI site the prompt is pasted into also needs the files, or the prompt's "use my resume" has nothing to point at. So Insert appends the same labelled data blocks under "SOURCE FILES". A visible "Attach file text" checkbox turns this off.

**D9. C16 said "change no files".** I applied the fixes listed in the C16 table, because they correct strings that were false. Each row gives the old and new text so H10 can approve or revert.

**D10. Rebuilt, not patched.** The score's steps ask for diffs against v0.2. The v0.3 code is a rebuild, so per-step diffs don't exist. Review should be against the full files. `lib/core.js` holds all the logic the steps name, each module labelled M1–M10.

**D11. Default model names need checking.** The defaults are `claude-sonnet-5-5` (Anthropic) and `gpt-5.6-sol` (OpenAI's recommended model as of August 2026, from a web search during the build). Model names change. Users can type another in Model and settings, and Test connection shows any error.

## C16 truthful-claims table

Behaviour-describing strings in the manifest, dashboard, popup, panel and README. "Changed" rows were false or overstated and have been replaced. H10 approves or rewrites each row. This covers the strings I identified; H10 should also look for any I missed.

| File | String (short) | True in v0.3? | Code | Action |
|---|---|---|---|---|
| manifest.json | name "Pepper — The Personal AI Prompter" | Yes | unit "N8 manifest…" | — |
| manifest.json | "Turns your rough prompt into a clear six-part prompt on ChatGPT, Claude, Gemini, Perplexity and Copilot, using only context you store in this browser." | Yes. Facts about the user come only from stored profile, memories and files | `buildContext`, `template`, `buildSystemPrompt` | — |
| dashboard.html (Home) | "It never sends anything for you; you always press send." | Yes | `insertIntoSite` | — |
| dashboard.html (About you) | "Every answer changes the prompts Pepper writes." | Yes (template and model instruction) | 15 N2 unit tests | — |
| dashboard.html (Memories) | "Nothing becomes a memory until you add it. This sends those prompts to your model provider." | Yes | `factsBtn` handler, `factPromptFrom` | — |
| dashboard.html (Files) | "Pepper uses up to 2,500 characters per file and 6,000 per prompt, and marks anything trimmed." | Yes | `projectFiles`, `fileBlocks` | — |
| dashboard.html (Saved) | "They show up as suggestions in the panel for the same project." | Yes. With no project, all saved prompts can appear | `suggestions` | — |
| dashboard.html (History) | "Kept for 90 days or 2,000 prompts." | Yes | `prune` | — |
| dashboard.html (Learned) | Old: "Pepper changes only two things: which approach it picks first, and how long it aims. Your profile, memories and files stay exactly as you wrote them." | Was overstated: suggestions also use history | `computeLearning`, `suggestions` | **Changed:** "…Pepper works out which approach to pick first and how long to aim for each kind of work, and it suggests your best past requests. Your profile and memories change only when you confirm a suggestion." |
| dashboard.html (Privacy) | Old: "The only thing that leaves is the request sent to the model provider you chose, and only when you click Write my prompt." | Was false: rewrites, fact-finding and the connection test also send | `callLLM` callers | **Changed:** "If you add a model key, the text Pepper needs goes to that provider when you ask it to write, rewrite or find facts. Nothing else leaves." |
| dashboard.html (Privacy) | "Your API key is never included." (export) | Yes | `export` handler deletes `pepper_settings`; browser "N5 dashboard data controls…" | — |
| dashboard.html (Privacy) | "Uninstalling Pepper does the same." | Browser behaviour, not tested here | — | Keep; H9 to confirm (marked [needs review] in the notice) |
| dashboard.html (Settings) | "Stored only in this browser and sent only to the provider above. Never exported." | Yes | `callLLM`, `redactKey`, export | — |
| dashboard.html (Settings) | "Alt+Shift+P opens Pepper on any of the five sites." | Declared in the manifest; pressing it was not exercised in tests | `commands`, `TOGGLE_PANEL` | Keep; H7 to check |
| dashboard.html (checklist) | "Your own model writes much fuller prompts than the built-in template." | An expectation, not a measured result | — | H10: consider "can write fuller, more tailored prompts" |
| popup.html/js | "Saving prompts you send here, replies and ratings" / "Off. Pepper writes prompts here but saves nothing" | Yes | `consentAllows`, worker consent check | — |
| content.js | "Inserted. Read it over in [site], then press send." / "Copied — paste it into the box." | Yes | `insertIntoSite`, `clipboardFallback` | — |
| content.js | "No API key — used the local template." / "The model did not list assumptions — review before inserting." | Yes (SDD wording) | `renderResult` | — |
| content.js | "Pepper chose X: your average N.N stars across M ratings." | Yes | `computeLearning`, `renderLenses` | — |
| content.js (rating card) | Old: "Your ratings teach Pepper which approach works for you." | Was overstated: ratings on prompts Pepper didn't write never change the approach | `computeLearning` skips unassisted | **Changed:** shows "You sent a prompt Pepper wrote. Your rating teaches Pepper which approach works for you." or "Pepper keeps this rating with the prompt. Only prompts Pepper wrote change the approach it picks." |
| content.js (assumptions) | "None of them are in your prompt." | Yes | `parseReply`, `composeInsert` | — |
| onboarding.html | Old: "…to suggest prompts that worked before, and to offer facts about you to remember." | Was overstated: fact-finding needs a key | `factsBtn` disabled without a key | **Changed:** "…and, if you add a model key, to offer facts about you to remember." |
| onboarding.html | "When a key is set, what you type, your profile answers, active memories and the text of your project's files are sent to that provider" | Yes | `buildSystemPrompt`, `buildUserMessage` | — |
| README.md | "Pepper never sends anything for you." / "Pepper does not paste your past prompts or replies into new prompts." | Yes | `insertIntoSite`; no history in `buildContext` | — |
| README.md | "tested against local mock pages only" (selectors) | Yes, stated as a limit | — | — |

Name check: "Pepper — The Personal AI Prompter" appears exactly in the manifest and every page title (unit "N8 product name is exact…").

## C17 needs verification

Only conditions checkable without a live site were run. "Pass" means a named test executed and passed at packaging.

| Need | Condition | Result | Evidence |
|---|---|---|---|
| N1 | 2+ word prompt returns all six labelled sections | Pass (template, all tiers and approaches); pass on the five mock sites | Unit "N1 template: every tier and lens…"; browser "compose…", insert tests on five mocks |
| N1 | ≤ 100 ms without a key | Pass for the template function (each call under 100 ms); click-to-display time not measured | Unit "N1 template… in < 100 ms" |
| N1 | p95 ≤ 25 s with a key; on each live tier-1 site | **Needs human evidence** (H7 with a real key) | — |
| N2 | Changing only one answer changes the prompt, for all 15 | Pass (template and model instruction) | 15 unit tests "N2 Qn…"; browser "C6 rewrite buttons…" |
| N3 | File text inside a labelled data block | Pass | Unit "N3 file text is in the user message…"; browser "model path…" (request body and inserted text) |
| N3 | "Ignore previous instructions" file leaves ROLE unchanged | Pass for the template (all six approaches); **needs human evidence** for a real model's output | Unit "N3 an injection file…" |
| N4 | Pepper never submits | Pass on mocks; code read | Browser insert tests check the page received no send; `insertIntoSite` |
| N4 | Failure falls back to clipboard with a visible message | Pass on a mock | Browser "no reachable box…" |
| N4 | ≥ 99% of 20 inserts per live site | **Needs human evidence** (H7) | Protocol rows I-01 to I-20 |
| N5 | Learning off: 3 sends on each of 2 sites leave history unchanged | Pass (worker and mocks) | Unit "N5/C11 fresh install…"; browser "N5 fresh install…" |
| N5 | Pepper off: same | Pass (worker and mock) | Unit "C1/N5…"; browser "C1 global switch off…" |
| N5 | Per-record delete, clear-all, export without key, remove key | Pass | Browser "N5 dashboard data controls…"; unit "Export excludes pepper_settings…" |
| N5 | All of the above on the live sites | **Needs human evidence** (H5, H7) | Protocol rows LO, OFF, D |
| N6 | Assumptions are never inserted | Pass | Unit "C5 insert text never contains…"; browser "model path…" |
| N6 | 10 reviewed real outputs, every user fact traced | **Needs human evidence** (H6) | Protocol rows T-01 to T-10 |
| N7 | ≥ 5 ratings → highest-mean lens, reason shown; Reset restores auto; seeded ratings give the expected default | Pass | Unit: seven "C14…" tests; browser "M7 learned lens is preselected…" |
| N7 | Definition confirmed | **Needs human sign-off** (H2), including D2 and D3 | — |
| N8 | Manifest: only storage and unlimitedStorage, two provider hosts, five sites | Pass | Unit "N8 manifest…" |
| N8 | No web-accessible page | Pass | Unit "N8 manifest…"; browser "C2 framing the dashboard…" |
| N8 | Privacy notice published and linked | Drafted and linked from onboarding and the dashboard; **publishing needs H9** | `PRIVACY.md`, `privacy.html` |
| N8 | No UI or store text claims unbuilt behaviour | C16 table done; **needs H10** | Above |

## Bugs found by testing and fixed before packaging

- **Pepper blocked clicks on the site's own buttons.** The invisible area around the peppercorn intercepted clicks; on the mock it blocked a button next to the send button. The host and wrapper are now click-through and only visible surfaces take clicks.
- **Narrow prompt boxes were ignored.** A box under 200 px wide wasn't recognised, so Pepper copied instead of inserting. The threshold is now 100 px.
- **The dashboard scrolled sideways on phones**, because the scrolling nav widened its grid column to 980 px. Fixed; checked at 390 px.
- **History could list oldest first** if storage order was off. It's now sorted by time.
- **Grammar in the template:** "anticipate what a thoughtful recruiters will need". Fixed.
- **Empty stars were nearly invisible on dark sites.** Contrast raised.
- **A long assumptions list pushed the Insert button out of view.** The action row is now pinned to the bottom of the panel.

## Other changes worth knowing

- **Upgrading from v0.2:** all data is kept and converted. IDs become strings, `enhanced` becomes `assisted` with `similarity`, and `_done` is stripped. Learning starts off on every site, and the welcome page offers to keep or delete old history.
- **Long replies:** after 45 seconds the record is saved as partial, then completed when the reply finishes (up to 3 minutes).
- **Web pages can't write freely:** content scripts may only add history, ratings, saved prompts and memories, and set the active project and orb position. Settings, consent and deletion are dashboard-only.
- **Model calls** happen only in the worker, to the two provider hosts, with a 30-second timeout. Page scripts on the AI sites can't read the key: the panel runs in an isolated world and keeps only whether a key is set.
- **Templates:** with no key, the template now honours all 15 answers, the six approaches and the three length tiers.

## Not tested, or known limits

- Live sites: everything in the "needs human evidence" rows.
- A real model's output (the model was mocked). A real model may not follow the six-section layout or the assumptions marker. Pepper warns and shows the reply in full when it doesn't.
- Microsoft Edge (only Chromium was run), screen readers, pressing Alt+Shift+P, dragging the orb, and sites whose theme switches mid-session.
- PDF and Word files are not parsed; users paste the text.
- **For H11 (security review):** the content script loads settings, key included, from extension storage at start-up and at each send, then keeps only whether a key is set. Page scripts can't reach it, but the key does pass through memory in the AI site's tab. Moving the key to its own storage entry that the content script never reads would close that; I'd recommend it as a small follow-up.
