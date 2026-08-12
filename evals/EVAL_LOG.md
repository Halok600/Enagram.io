# Eval run — 2026-08-12T17:33:36.408Z

Model: `gemini-flash-lite-latest` · Cases: 6 · Passed: 6/6

## PASS — tier1-stripe-not-found (tier1)

**Query:** Find the email from Stripe about the failed payment.

**Checks:** SPEC.md §5 Tier1 #1. Grounding check: no such email exists in the connected inbox — must search, then correctly report not found, not fabricate one.

**Tools used:** search_gmail — expected [search_gmail] — OK

**Content check:** OK

**Answer:**

> I couldn't find any email from Stripe or about a failed payment in your connected Gmail data.

_72.2s_

---

## PASS — tier1-drive-recency (tier1)

**Query:** What Drive files have I edited/shared in the last week?

**Checks:** SPEC.md §5 Tier1 #2, verbatim. KNOWN ARCHITECTURE LIMITATION (found by independent review, fixed partially, documented honestly rather than hidden): search results only carry a `date` for the top 3 by relevance, not all results, so precise recency ordering isn't always possible. This case checks the model responds with real Drive content or an honest caveat about date coverage — not that it nails exact recency, which the current architecture can't fully guarantee.

**Tools used:** search_drive — expected [search_drive] — OK

**Content check:** OK

**Answer:**

> I couldn't find any Google Drive files edited or shared in the last week. The only files available in your connected Drive are from earlier this year:
> * **[httpsgithub.comHalok600Reddit-insig.txt](https://drive.google.com/file/d/1pzBwEWBrYdwtEhdRskBvGwQgbGSrxvZN/view?usp=drivesdk)** (March 9, 2026)
> * **[Resume_2026_Feb.pdf](https://drive.google.com/file/d/1gN8DWfA6BZD-LOCtd9p1VPvWqCfRLcdX/view?usp=drivesdk)** (February 24, 2026)

_20.1s_

---

## PASS — tier1-gmail-thread-summary (tier1)

**Query:** Summarize my most recent email thread with Nirmit from SkillLayer

**Checks:** SPEC.md §5 Tier1 #3 — single-source Gmail thread summary with a real citation, not just a topic mention.

**Tools used:** search_gmail — expected [search_gmail] — OK

**Content check:** OK

**Answer:**

> Your most recent email thread with Nirmit from SkillLayer is about your application and shortlisting for the **MC Round** of the recruitment process ([SHORTLISTED STUDENTS](https://mail.google.com/mail/u/0/#all/19fc76dd1908a913)). 
> 
> Key details from the thread:
> * **The Assignment:** Nirmit and Cristian sent out a take-home assignment for Round 1 via a [Google Doc link](https://docs.google.com/document/d/137QC0GmLIakjGt0jV6tlSSUVmnarqjZny34E0YR0vCA/edit?tab=t.0).
> * **Your Response:** You replied confirming that you received the update and would have the take-home assignment submitted by Friday ([Re: SHORTLISTED STUDENTS](https://mail.google.com/mail/u/0/#all/19fe7a1461637a85)).
> * **Next Steps:** Round 2 will be an online face-to-face (F2F) interview ([Fwd: Take Home Assignment for selected folks](https://mail.google.com/mail/u/0/#all/19fc149dba64bd06)).

_20.1s_

---

## PASS — tier2-skilllayer-status (tier2)

**Query:** What's my status on the SkillLayer application, and do I have the take-home assignment document in my Drive?

**Checks:** SPEC.md §5 Tier2 #1, DELIBERATELY NARROWED to one named company (disclosed per independent review — SPEC's actual wording, 'what jobs have I applied to... status on each,' is open-ended enumeration across all applications, which this keyword-based harness can't assert against without an LLM judge; that broader case is untested). This case checks the cross-source join specifically: Gmail status + Drive submission file, both cited.

**Tools used:** search_gmail, search_drive — expected [search_gmail, search_drive] — OK

**Content check:** OK

**Answer:**

> Your status on the SkillLayer application is that you have been successfully **shortlisted for the MC Round** of the recruitment process, as confirmed in the [SHORTLISTED STUDENTS](https://mail.google.com/mail/u/0/#all/19fc76dd1908a913) email from Nirmit. 
> 
> Yes, the take-home assignment document is in your Drive: **[skilllayer_sde_I_takehome](https://docs.google.com/document/d/137QC0GmLIakjGt0jV6tlSSUVmnarqjZny34E0YR0vCA/edit?usp=drivesdk)** (also shared via [Document shared with you: "skilllayer_sde_I_takehome"](https://mail.google.com/mail/u/0/#all/19fdc9cd0ba7c0ea)). 
> 
> The assignment asks you to build a **Personal Brain**—a conversational agent over your own data that reasons across multiple connected personal tools.

_22.2s_

---

## PASS — tier1-calendar-not-found (tier1)

**Query:** Do I have any calendar event about a team offsite in Antarctica?

**Checks:** Feature #5 (Calendar connector, added 2026-08-09). Grounding check for the new search_calendar tool, mirroring the existing not_found pattern (tier1-stripe-not-found) — deliberately implausible content so the case stays reliable regardless of what's actually on the connected calendar. A deeper Tier2 case joining Calendar with Gmail/Drive was intentionally NOT added: it would require guessing real calendar content this harness has no way to verify ground truth for, unlike the SkillLayer case which is grounded in emails already quoted elsewhere in this file.

**Tools used:** search_calendar — expected [search_calendar] — OK

**Content check:** OK

**Answer:**

> No, I couldn't find any calendar events related to a team offsite in Antarctica in your connected calendar.

_57.2s_

---

## PASS — tier2-priya-contract-not-found (tier2)

**Query:** Did I ever send Priya a contract draft, and did she reply?

**Checks:** SPEC.md §5 Tier2 #2. Grounding check: no such exchange exists — must search BOTH sources (not just Gmail) before correctly reporting not found.

**Tools used:** search_gmail, search_drive — expected [search_gmail, search_drive] — OK

**Content check:** OK

**Answer:**

> I couldn't find any record in your connected Gmail messages or Google Drive files of you sending a contract draft to Priya, nor of any reply from her.

_38.4s_

---
