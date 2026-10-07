# Interview guide — Pepper — The Personal AI Prompter

**Draft from Boondoggle step C13 (trust T3: Claude drafted it, the product owner decides). It must be approved before the first interview.**

30 minutes, one participant at a time. Participants: five graduate students who are looking for jobs and use two or more AI chat sites.

Each question is tagged with the signal it informs, from the SDD success conditions:

- **S-D**: share of the participant's sent prompts that went through Pepper (threshold ≥ 30% median).
- **S-E**: the participant names a specific time Pepper spared them re-pasting context (threshold ≥ 3 of 5).
- **S-F**: rating lift after learning is turned on vs. before, within one participant (threshold ≥ +0.5 stars).
- **S-G**: the participant can say what Pepper learned and agrees it is right (threshold ≥ 3 of 5).

Questions marked *context* support a signal by setting a baseline; they are not scored on their own.

## When to use which sections

- **H8 (before learning ships):** sections 1 and 2 in full. Section 3 only reads S-D if the participant has used Pepper for at least a week. Skip section 4.
- **H14 (after launch, participants who turned learning on):** all four sections. Section 3 and 4 need at least two weeks of use and at least 5 rated replies for one kind of work.

## Interviewer rules

- Ask the question as written, then wait. Follow-ups are "Can you say more about that?" or "What happened next?" Never suggest an answer.
- Don't name Pepper or describe it in section 1.
- Don't say whether an answer is good or expected.
- Ask before looking at anything on the participant's screen, and again before reading their dashboard. They read the figures aloud; you never take a copy of their data.
- Record answers in the participant's own words where you can.

## Opening (2 minutes)

Explain the session, how notes are kept, that they can skip any question or stop at any time, and ask for consent to take notes. No recording unless they agree separately.

## 1. How you prompt today (8 minutes)

Do not mention Pepper.

1.1 Which AI chat sites have you used in the last two weeks, and for what? *(context for S-D)*

1.2 Think of the last time you used one for something related to your job search. Walk me through what you typed, from opening the site to getting an answer you used. *(context for S-E)*

1.3 In that session, what did you tell the AI about yourself, if anything? How did you get that information into the chat? *(S-E baseline)*

1.4 How often do you find yourself giving an AI the same background you've given it before? Tell me about the most recent time. *(S-E baseline)*

1.5 When an answer isn't what you wanted, what do you usually do next? *(context for S-F)*

## 2. A real task with Pepper (10 minutes)

Ask the participant to pick a real application they are working on now. With permission, watch them use Pepper on their own machine. If Pepper is new to them, give a one-sentence description only: "It's an extension that rewrites your request before you send it."

2.1 Use it for something you actually need for this application. Talk me through what you're doing as you go. *(context for S-E)*

2.2 (After they insert and send) Compared with how you'd normally do this, what was different, if anything? *(S-E)*

2.3 Was there information about you in the final prompt that you would otherwise have typed or pasted yourself? Which parts? *(S-E)*

2.4 Was there anything in the prompt about you that wasn't right, or that you didn't expect to see? *(N6 check, context for S-G)*

2.5 Can you remember a time, before today, when Pepper saved you from re-entering background about yourself? What was it? *(S-E: counts only if they name a specific occasion)*

## 3. Your figures (5 minutes)

Ask: "Would you be willing to open your Pepper dashboard and read a few numbers aloud? You can say no, and I won't see your screen unless you show me." If they decline, skip to section 4.

3.1 On the Home page, under "How it's going", what does the first figure say? *(S-D: record the percentage)*

3.2 Does that figure match how often you feel you use Pepper? Why or why not? *(context for S-D)*

3.3 Open "What Pepper learned". Is there a section under "Since Pepper started choosing"? If so, read the two averages and the counts in brackets. *(S-F: record before, after, and both counts)*

3.4 How would you describe the replies you've had recently compared with when you started using Pepper? *(context for S-F)*

## 4. What Pepper learned about you (4 minutes)

Ask these before they look at the "What Pepper learned" page again, if possible.

4.1 In your own words, what do you think Pepper has picked up about how you like your prompts? *(S-G)*

4.2 Now look at "What Pepper learned". How does what it shows compare with what you just said? *(S-G)*

4.3 Is there anything on that page you disagree with? What would you change? *(S-G: any disagreement is logged as a defect in H14)*

## Close (1 minute)

4.4 Is there anything about how you use AI for your job search that we haven't talked about? *(context)*

Thank them and confirm how notes will be stored.

## Scoring sheet (one row per participant)

| Participant | S-D (%) | S-E: specific occasion named? (yes/no, quote) | S-F before (n) | S-F after (n) | S-F lift | S-G: can say what it learned? | S-G: agrees it's right? | Defects logged |
|---|---|---|---|---|---|---|---|---|
| P1 | | | | | | | | |
| P2 | | | | | | | | |
| P3 | | | | | | | | |
| P4 | | | | | | | | |
| P5 | | | | | | | | |

Kill criterion (from the SDD): if fewer than 3 of the first 5 participants confirm the context problem (S-E), the problem statement is reopened before further feature work.
