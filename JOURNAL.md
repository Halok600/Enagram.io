# JOURNAL.md — Personal Brain build log

Format per entry: timestamp, context, decision/trade-off, prompt iteration
notes (if any), current system state.

---

## 2026-08-03 16:50 — Project kickoff, stack + spec decided

**Context:** SkillLayer SDE I take-home. Build a conversational agent over
≥2 personal data sources with cross-source reasoning, following SDD. Due
2026-08-09 00:00 (submit via reply to existing application email thread to
nirmit@skilllayer.tech, cc cristian@skilllayer.tech).

**Decision:** Stack = Next.js (App Router) + TypeScript, single deployable
app on Vercel. Connectors = Gmail + Google Drive (shared OAuth consent
screen and API client family — lowest auth overhead for a solo 6-day build,
and the assignment's own Tier 2 examples are Gmail×Drive shaped). Storage =
gbrain (https://github.com/garrytan/gbrain), interface TBD until we clone
and inspect it in Phase 1. Reasoning model = Claude via Anthropic API,
tool-use loop for retrieval routing. UI = Vercel AI SDK for streaming chat.

**Trade-off considered:** Python/FastAPI backend + separate frontend gives
more ingestion-pipeline flexibility but doubles deploy targets and plumbing
for no real benefit at this scope — rejected in favor of one Next.js app.

**Current state:** SPEC.md drafted and reviewed (v1). No code written yet.
Next: Phase 1, step 1 — scaffold Next.js project, clone/inspect gbrain,
set up Google Cloud OAuth credentials.

**Git guidance:** Repo not yet initialized. Once scaffold exists (end of
Phase 1 step 1), run:
```bash
git init
git add SPEC.md JOURNAL.md
git commit -m "Add SDD spec and journal for Personal Brain project"
```
Push commands will follow once a GitHub remote is set up (ask before
creating the remote — first time doing so this session).
