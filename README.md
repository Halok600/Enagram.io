# Enagram.io

A conversational AI agent over your own Gmail, Google Drive, and Google
Calendar — ask it questions in plain language and it searches, correlates,
and reasons across all three in a single answer, instead of making you
search each one separately.

**Live:** [enagram-io.vercel.app](https://enagram-io.vercel.app)

Built as a SkillLayer SDE I take-home assignment.

## What it does

- **Cross-source Q&A** — "What jobs have I applied to, and what's my status
  on each?" pulls from Gmail *and* Drive *and* Calendar in one answer, not
  three separate searches.
- **Calendar CRUD from chat** — create, update, and delete real Google
  Calendar events conversationally, plus a full `/calendar` page (month/week
  view, drag-and-drop rescheduling) backed by the same functions the chat
  agent uses, so both stay in sync.
- **Gmail reply drafting** — drafts (never auto-sends) a reply to an existing
  thread, threaded correctly via `In-Reply-To`/`References`.
- **Preference memory** — "remember that I prefer concise answers" persists
  across sessions and gets injected into every future conversation.
- **Cross-source linking** — pages from different sources that share a
  participant (a Gmail thread, a Calendar invite, and a Drive file all
  involving the same person) are automatically graph-linked, so the agent
  can follow an explicit connection instead of guessing a new search.
- **Streaming chat UI** — Gemini/ChatGPT-style empty state, animated tool
  activity indicators, dark/light theme.

## Stack

Next.js 16 (App Router) · TypeScript · Vercel AI SDK + Gemini · NextAuth v5
(Google OAuth) · [gbrain](https://github.com/garrytan/gbrain) (Postgres +
pgvector-backed hybrid search/storage) · Tailwind v4 · Framer Motion

## Architecture, in short

Two systems: this Next.js app (deployed on Vercel) handles the UI, chat
agent, and all Gmail/Drive/Calendar API calls; a separate
[gbrain](https://github.com/garrytan/gbrain) server (Postgres + pgvector)
handles storage, embedding, and hybrid search, reached over its remote MCP
HTTP API. Search and chat work identically whether run locally or deployed.

Ingestion (writing newly-fetched data into gbrain) needs a git-tracked
working copy and a local `gbrain` binary — infrastructure a serverless
Vercel function doesn't have. Locally that runs directly; in production, the
deployed app proxies ingestion requests to a small standalone worker
(`scripts/ingest-worker.ts`) running wherever those are available — see
[`COLAB_RUNBOOK.md`](COLAB_RUNBOOK.md) for the current setup.

For a full, file-by-file, line-referenced breakdown of the codebase, see
[`PROJECT_REFERENCE.md`](PROJECT_REFERENCE.md). For the day-by-day build log
— decisions, trade-offs, and dead ends — see [`JOURNAL.md`](JOURNAL.md). For
the original spec, see [`SPEC.md`](SPEC.md).

## Local development

```bash
npm install
npm run dev
```

Requires a `.env.local` with Google OAuth credentials, a Gemini API key, and
gbrain remote server credentials — see `src/lib/**` for the exact env var
names each integration reads.

## Evals

```bash
npm run eval
```

Runs the fixed eval suite in `evals/cases.ts` against the live system —
Tier 1 (single-source) and Tier 2 (cross-source) question/answer pairs,
plus a few adversarial/refusal cases.
