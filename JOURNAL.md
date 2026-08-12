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

---

## 2026-08-03 22:30 — Repo pushed; Next.js scaffolded; gbrain reality check

**Context:** User pushed the initial commit to
https://github.com/Halok600/PROJECT_MAIN_AI (main branch). Started Phase 1
step 1: scaffolded Next.js (App Router, TS, Tailwind, src dir) via
`create-next-app`. `npm` rejected the project name because the directory
name (`PROJECT_MAIN_AI`) has capital letters, so the app was scaffolded into
a temp subfolder and moved up into the repo root.

**Decision — gbrain integration:** Cloned gbrain
(https://github.com/garrytan/gbrain) to inspect its actual interface before
writing integration code, since SPEC.md v1 assumed it was an embeddable
storage/retrieval library. It is not: gbrain is a Bun-based CLI + MCP server,
backed by Postgres or PGLite, that treats a git repo of markdown files
("brain repo") as the system of record and syncs it into a DB for hybrid
(vector + BM25 + graph) retrieval and LLM-synthesized answers (`gbrain
search` vs `gbrain think`). It expects to run as a long-lived process/daemon,
not to be imported into a serverless function.

**Trade-off surfaced to user:** Vercel serverless functions can't host a
Bun CLI with a local PGLite file or a long-running MCP server. Three options
were laid out: (a) demo everything locally, skip Vercel; (b) deploy the
Next.js app to Vercel and run gbrain separately as `gbrain serve --http` on
an always-on host (Railway/Fly.io free tier), calling it remotely over HTTP
with a bearer token; (c) drop gbrain entirely for a lightweight SQLite+
embeddings store, documented as a deliberate SDD deviation.

**Decision:** User chose (b) — Vercel app + separately hosted gbrain server.
This is the higher-effort path but keeps us honest to the assignment's
explicit "store data in gbrain" requirement while still getting a real
Vercel deploy link. SPEC.md §3 architecture diagram updated to show the
split: Next.js/Vercel talks to gbrain over HTTP/MCP rather than importing it
in-process. Ingestion pipeline now renders normalized data as gbrain-native
markdown pages (frontmatter + body) rather than assuming a JS API.

**Risk noted:** This adds real infra work (hosting choice, token auth, two
deploy targets to keep in sync) on top of an already tight 6-day timeline.
If gbrain hosting eats too much time, fallback is to demo locally with
`gbrain serve` running alongside `next dev` and treat the Vercel deploy as
best-effort, not required — success criteria in SPEC.md §9 only requires a
"reliably local-runnable" UI at minimum.

**Current state:** Next.js app scaffolded and building at repo root. Bun
1.3.14 and gbrain 0.42.72.1 installed. Local PGLite brain initialized at
`D:\Projects\PROJECT_MAIN_AI\brain` (config/DB live in `~/.gbrain`, which is
normal for gbrain — the brain repo directory in the project is where our
ingested markdown pages will live). `/brain/` added to `.gitignore` since
it will hold real personal Gmail/Drive content once ingestion starts —
should never be pushed to the public GitHub repo.

**Embedding provider setup (Gemini):** User chose Google Gemini for
embeddings. Two gotchas hit and resolved:
1. `setx` writes to the registry but does not propagate to already-running
   shells (this agent's Bash/PowerShell tool sessions started before the
   `setx` call). Workaround: read the value out of the registry
   (`[System.Environment]::GetEnvironmentVariable(name, "User")`) inside
   each command that needs it, without ever printing the value.
2. The correct config is model `google:gemini-embedding-001` (not
   `text-embedding-004`, which doesn't exist on the embedContent endpoint)
   and env var `GOOGLE_GENERATIVE_AI_API_KEY` (not `GEMINI_API_KEY` — gbrain
   doesn't recognize that name). Also: `gbrain config set embedding_model`
   is rejected as a no-op by the CLI itself ("file-plane field that sizes
   the schema") — changing it requires wiping `~/.gbrain/brain.pglite` and
   re-running `gbrain init --pglite --embedding-model ...`, safe here only
   because the brain was still empty.

`gbrain doctor` now passes the embedding_provider check cleanly. Remaining
warnings (no embeddings yet, no skills dir, no ANTHROPIC_API_KEY for
gbrain's internal chat features) are expected/non-blocking — we're using
gbrain only for `search` (retrieval), doing synthesis and cross-source
reasoning with Claude in our own Next.js app, not gbrain's built-in `think`/
`dream`/`agent` commands.

**Next:** Google Cloud OAuth setup for Gmail + Drive scopes, then start the
ingestion pipeline (Gmail/Drive API clients → normalize → write markdown
pages into `brain/` → `gbrain sync`).

---

## 2026-08-04 — OAuth credentials created; reasoning model switched to Gemini

**Context:** User confirmed two Google accounts are in play — Account A
(Gemini API key, used only for gbrain embeddings) and Account B (the actual
Gmail/Drive account being connected via OAuth). Clarified that the OAuth
consent screen + test-user list must be set up under whichever Cloud project
manages Account B's login, independent of the Gemini key's account. User
created the Google Cloud project, enabled Gmail + Drive APIs, configured the
OAuth consent screen (External, Testing mode, readonly scopes), and created
a Web application OAuth Client ID/Secret.

**`.env.local` created** (gitignored, confirmed via `git check-ignore`) with
placeholders for `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, a generated
`NEXTAUTH_SECRET`, and `NEXTAUTH_URL=http://localhost:3000`. User fills in
the real OAuth values themselves — Claude never handles the client secret
directly, per the credential-handling rule.

**Decision — drop Anthropic, use Gemini for reasoning too:** User doesn't
want an Anthropic API key at all; asked to use the existing Gemini key for
the query routing / cross-source reasoning / answer synthesis layer as well
as embeddings. Agreed — one Google AI API key now covers everything on the
model side. SPEC.md §3 and §6 updated: the query engine's function-calling
loop (`search_gmail` / `search_drive` tools + correlate step) now runs on
Gemini via the Vercel `ai` SDK's Google provider, not Claude/Anthropic.
`ANTHROPIC_API_KEY` removed from `.env.local`.

**Trade-off note:** Gemini function-calling works fine for this use case
(tool-use loop over two simple search tools), so no capability loss expected
for Tier 1/2 correctness. Slight risk: less hands-on experience with Gemini's
tool-calling quirks vs. Claude's, so Phase 2 should budget a little extra
time for prompt iteration if grounding/citation behavior needs tuning.

**Current state:** `.env.local` exists with `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET` placeholders awaiting user's real values, plus
`GOOGLE_GENERATIVE_AI_API_KEY` placeholder (same Gemini key used for gbrain
embeddings, reused here for chat/reasoning). SPEC.md updated to reflect
Gemini-only model stack. Next: user fills in `.env.local`, then wire up
NextAuth with the Google provider (Gmail/Drive readonly scopes) in the
Next.js app.

---

## 2026-08-04 — NextAuth + Google OAuth wired up, verified live in browser

**Context:** User confirmed `.env.local` filled in with real
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_GENERATIVE_AI_API_KEY`.
Installed `next-auth@5.0.0-beta.32` (Auth.js, App Router native) and
`googleapis` (for the Gmail/Drive API clients in Phase 1's next step).

**Implementation:**
- [`src/auth.ts`](src/auth.ts) — NextAuth config with a Google provider
  requesting `gmail.readonly` + `drive.readonly` scopes,
  `access_type: offline` + `prompt: consent` to force a refresh token on
  every consent (needed since we'll call these APIs outside the login
  request, from the ingestion pipeline).
- `jwt`/`session` callbacks persist `accessToken` / `refreshToken` /
  `accessTokenExpiresAt` — refresh-on-expiry logic deferred to the ingestion
  pipeline step, not needed yet.
- [`src/types/next-auth.d.ts`](src/types/next-auth.d.ts) — module
  augmentation so `session.accessToken` is typed.
- [`src/app/api/auth/[...nextauth]/route.ts`](src/app/api/auth/%5B...nextauth%5D/route.ts) — route handler.
- [`src/app/page.tsx`](src/app/page.tsx) — replaced the create-next-app
  template with a minimal "Connect Google Account" / "Connected as
  {email}" landing page using server actions (`signIn("google")` /
  `signOut()`).
- Created `.claude/launch.json` so the dev server can be previewed in the
  agent's browser tool.

**Bug hit and fixed:** First live test hit `Error 401: invalid_client` —
Auth.js v5 auto-reads Google credentials from `AUTH_GOOGLE_ID` /
`AUTH_GOOGLE_SECRET` by convention, not the v4-style `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET` used in `.env.local`. Fixed by passing
`clientId: process.env.GOOGLE_CLIENT_ID` / `clientSecret: process.env.GOOGLE_CLIENT_SECRET`
explicitly in the provider config rather than renaming the env vars (kept
the more descriptive names). Also had to restart the dev server after
editing `.env.local` — Next.js only loads env files at server start.

**Verified live:** started the dev server, clicked "Connect Google
Account" in the browser tool, confirmed the redirect reaches Google's real
consent screen ("Sign in to continue to Personal Brain") rather than an
error. Did not complete the actual login — that needs the user's real
Google credentials/2FA.

**Current state:** OAuth wiring is in place and reaches Google correctly.
Not yet verified: a full login completing and the session showing
`Connected as <email>` on the landing page, and that the granted scopes
actually include Gmail + Drive readonly (should show on Google's consent
screen once the user gets past the email/password step). Next: user
completes a real login locally to confirm end-to-end, then Phase 1 moves
to building the Gmail + Drive API clients and the ingestion/normalization
pipeline into `brain/`.

---

## 2026-08-04 — OAuth end-to-end verified live; bug: test user not saved

**Context:** First live login attempt hit `Error 403: access_denied` — "Personal
Brain has not completed the Google verification process... can only be
accessed by developer-approved testers." Root cause: the OAuth consent
screen's Test users list showed "No rows to display" / "0 users" despite the
user believing they'd already added `pkt.codes@gmail.com` — the earlier
add wasn't saved (the Add Users panel has its own Save action separate from
typing the email in). Confirmed it wasn't a wrong-project issue first (the
Client ID prefix `1036794513123` matched the `personal-brain-dev` project
number exactly). Re-added the test user and saved properly; login then
succeeded.

**Verified live end-to-end:** full OAuth round trip completed — Google
login → consent → callback → session. Landing page correctly shows
"Connected as pkt.codes@gmail.com" with a working Disconnect button. This
closes out OAuth for Phase 1.

**User request handled:** user asked to exclude SPEC.md/JOURNAL.md from
git to "hide AI meta-tracking," plus a standing auto-commit/push
instruction. Declined the exclusion — explained that SPEC.md and
JOURNAL.md are literally the deliverables the assignment's own rubric asks
for (SDD spec + harness-engineering evidence are both named judged
criteria), so hiding them costs points rather than helping. User agreed to
keep both files tracked. Agreed instead to append ready-to-run git
commands after each milestone, but push still requires the user's
explicit go-ahead each time rather than fully automatic pushing.

**Current state:** Phase 1 OAuth is complete and verified live. Ready to
commit. Next: build the Gmail + Drive API clients (using the session's
`accessToken`/`refreshToken`) and the ingestion/normalization pipeline that
writes markdown pages into `brain/`, per SPEC.md §4.

---

## 2026-08-04 — Gmail + Drive API clients built and verified against real data

**Implementation:**
- [`src/auth.ts`](src/auth.ts) — added automatic access-token refresh in the
  `jwt` callback (Google access tokens expire in ~1hr; ingestion needs to
  keep working past that). Refreshes ~60s before expiry using the stored
  refresh token via a direct POST to Google's token endpoint (no extra
  dependency needed). Surfaces `MissingRefreshToken` /
  `RefreshAccessTokenError` on `session.error` so callers can detect a dead
  session instead of silently failing.
- [`src/lib/google/gmail.ts`](src/lib/google/gmail.ts) — `searchMessages` /
  `listRecentMessages`. Parses Gmail's MIME payload tree, prefers
  `text/plain`, falls back to `text/html` stripped to text. Extracts
  subject/from/to/cc/date/snippet/attachments (filename + attachmentId, not
  content — attachment bytes fetched on demand later if a query needs them).
- [`src/lib/google/drive.ts`](src/lib/google/drive.ts) — `searchFiles` /
  `listRecentFiles`. Exports Google Docs as plain text via the Drive export
  endpoint; reads `text/*` and JSON files directly; binary formats (PDF,
  Sheets, Slides, images) are skipped for now — out of scope per SPEC.md,
  metadata (name/owner/dates) still indexed.
- Test routes `/api/ingest/gmail` and `/api/ingest/drive` (session-gated)
  to verify against real data before building the full normalizer.

**Bug hit and fixed:** first live Gmail test returned readable JSON but
HTML-only email bodies were full of raw CSS (`.container { width: 100%
!important; ... }`) and HTML entities (`&#8199;`) — the naive
strip-tags-with-regex fallback didn't remove `<style>`/`<script>` blocks or
decode entities. Added `htmlToText()`: strips style/script/comment blocks
before stripping remaining tags, then decodes named + numeric HTML
entities. Re-verified live — bodies now read as clean plain text. This
mattered enough to fix immediately rather than deferring, since gbrain's
retrieval/synthesis quality depends directly on ingested text being clean.

**Verified live (real data, both fixes confirmed by the user):**
- Gmail: real inbox messages (shortlisted-candidate email, internship spam,
  etc.) returned with clean subject/from/to/date/body text matching the
  actual Gmail UI.
- Drive: real files returned including the user's own SkillLayer take-home
  assignment Google Doc (content correctly exported) and an unrelated
  internship JD doc — confirms Drive export path and content extraction
  both work end-to-end.

**Current state:** Both connector clients work against real, authenticated
data with clean text extraction. Phase 1 remaining piece: the
normalizer (raw Gmail/Drive results → `BrainDocument` → markdown page with
frontmatter) and writing those pages into `brain/`, then `gbrain sync` to
index them — this is what turns "we can fetch data" into "gbrain can
retrieve it."

---

## 2026-08-04 — Ingestion/normalization pipeline built and verified live end-to-end

**Implementation:**
- [`src/lib/brain/types.ts`](src/lib/brain/types.ts) — `BrainDocument`, matching SPEC.md §4.
- [`src/lib/brain/normalize.ts`](src/lib/brain/normalize.ts) — `gmailMessageToBrainDocument`
  / `driveFileToBrainDocument`. Extracts bare email addresses from `From`/`To`/`Cc`
  headers and Drive owner fields into a unified `participants` list — this is
  the field Tier 2 cross-source joins will match on.
- [`src/lib/brain/markdown.ts`](src/lib/brain/markdown.ts) — renders a
  `BrainDocument` to gbrain's native page format (YAML frontmatter + body).
  Mapped `gmail` → gbrain's built-in `email` type (`emails/` prefix) and
  `drive` → gbrain's `source` type (`sources/` prefix) — gbrain's
  `gbrain-base-v2` schema pack (confirmed by reading
  `src/core/schema-pack/base/gbrain-base-v2.yaml` in the cloned repo) has no
  dedicated "drive file" type, and `source` (generic document/citation,
  extractable) is the closest semantic fit. Used the `yaml` package for
  frontmatter serialization rather than hand-rolling it — subjects/titles
  routinely contain colons, quotes, parens that break naive YAML.
- [`src/lib/brain/write.ts`](src/lib/brain/write.ts) — writes pages into
  `brain/<type-dir>/<slugified-id>.md`.
- [`src/lib/brain/gbrain-cli.ts`](src/lib/brain/gbrain-cli.ts) — shells out
  to `git` (commit pending brain-repo changes) and `gbrain` (sync + search).
- `POST /api/ingest/sync` ties it together: fetch Gmail + Drive → normalize
  → write pages → commit → `gbrain sync`.
- Added a real "Re-sync Gmail + Drive" button to the landing page
  ([`src/app/SyncButton.tsx`](src/app/SyncButton.tsx)) — this doubles as
  the manual re-sync UI already planned in SPEC.md §7, not just a test
  harness.

**Discovery — the brain repo needs to be its own git repository.** First
`gbrain sync` attempt failed: `Source "default" has no local_path` (the
legacy default source can't be repointed — `gbrain sources remove default`
is blocked as "backs the pre-v0.17 brain"). Registered a new named source
instead (`gbrain sources add personal-brain --path .`), which then refused
with a clearer error: gbrain requires every `--path` source to be a real
git repo with committed files (it walks git objects, so untracked files are
invisible to it — an empty commit isn't enough either). `git init`'d
`brain/` as its own **local-only** git repo, nested inside (and gitignored
by) the app's repo — never pushed anywhere, purely to satisfy gbrain's
sync mechanism. Also had to run `gbrain sources federate personal-brain` so
default cross-source search picks it up without needing `--source` on
every call.

**Discovery — `gbrain search` has no `--json`; use `gbrain call <tool> <json>`
instead.** The plain-text `search` command only prints `[score] slug --
snippet`. `gbrain call search '{"query":...,"source":...,"limit":...}'`
invokes gbrain's MCP tool surface directly and returns full structured JSON
(slug, type, title, score, chunk_text, evidence, etc.) — much better for
programmatic use. Discovered by testing against a throwaway page before
wiring real ingestion on top of it.

**Bug hit and fixed — Windows `shell: true` silently corrupts args with
special characters.** First live sync from the UI failed: `git: 'Brain' is
not a git command`. Root cause: `execFile` was called with `shell: true`
on Windows to let a `.cmd` shim resolve, but Node's shell mode does NOT
escape special characters in array args — a commit message like `"ingest:
50 gmail message(s), 48 drive file(s)"` has parentheses, which cmd.exe
interprets as command-grouping syntax, silently splitting the "command"
into multiple statements. Fixed by dropping `shell: true` entirely: bun
installs a real `gbrain.exe` (not a `.cmd`) on Windows, and `git` is a real
`.exe` too, so neither needs a shell — `execFile` passes args to
`CreateProcess` verbatim, no escaping required or possible to get wrong.

**Bug hit and fixed — `spawn gbrain.exe ENOENT`.** After removing
`shell: true`, resolving `"gbrain.exe"` by bare name via `PATH` still
failed, because the already-running `next dev` process's inherited `PATH`
predates the bun install — the same class of stale-environment issue as
the earlier `GEMINI_API_KEY`/`setx` gotcha. Fixed by resolving an absolute
path (`%USERPROFILE%\.bun\bin\gbrain.exe`) instead of relying on `PATH`,
with a `GBRAIN_BIN_PATH` env override for other machines/deploy targets.

**Verified live end-to-end (real data):** ingested 50 Gmail messages + 48
Drive files → wrote 98 markdown pages → committed to the local brain repo
→ `gbrain sync` imported + embedded them (93 pages after de-dup/filtering)
→ confirmed via `gbrain sources status` (100% embedded, 0 fails) and a
real `gbrain call search` query for "SkillLayer take home assignment",
which correctly surfaced: the actual assignment Google Doc (score 0.93),
the forwarded "Take Home Assignment" email pointing at that doc (score
0.91), and the "Shortlisted Students" email with the assignment link
(score 0.42) — top 3 results are exactly the cross-source cluster a Tier 2
query would need to correlate. Good early signal for Phase 2.

**Current state:** Phase 1 (backend: OAuth, connectors, ingestion,
gbrain-backed storage) is functionally complete and verified against real
data. Ready to commit. Next: Phase 2 — retrieval + Gemini function-calling
router for Tier 1/Tier 2 queries, per SPEC.md §6.

---

## 2026-08-04 — Phase 2: query engine built, all 3 example queries verified live

**Implementation:**
- Installed `ai` (v7.0.48), `@ai-sdk/google` (v4.0.31), `zod`.
- [`src/lib/brain/gbrain-cli.ts`](src/lib/brain/gbrain-cli.ts) —
  `searchBrain` now takes an options object with an optional `type` filter,
  plus `searchGmail`/`searchDrive` convenience wrappers. **Discovery:**
  `gbrain call search`'s own `type` parameter is silently ignored
  server-side — a `type: "email"` call still returned `source`-typed pages
  mixed in. Worked around by over-fetching (4x the requested limit, min 20)
  and filtering client-side on the `type` field already present in each
  result, then truncating to the requested limit.
- [`src/lib/query/tools.ts`](src/lib/query/tools.ts) — `search_gmail` /
  `search_drive` as AI SDK `tool()` definitions wrapping the above, per
  SPEC.md §6's two-tool router design.
- [`src/app/api/chat/route.ts`](src/app/api/chat/route.ts) — `streamText`
  with Gemini, both tools, `stopWhen: stepCountIs(5)` (multi-step tool
  loop), and a system prompt encoding the grounding rule (answer only from
  tool results; say "couldn't find it" rather than guess; call both tools
  when a question could plausibly span sources; cite which
  email/file an answer came from).

**Bug hit and fixed — `gemini-2.5-flash` is blocked for this API key.**
First live test failed: `This model models/gemini-2.5-flash is no longer
available to new users` (HTTP 404), despite the model still being listed
by the `ListModels` endpoint for this key — Google restricts some model
IDs to previously-grandfathered accounts. Queried `ListModels` directly to
see what this key can actually call, and switched to `gemini-flash-latest`
(an alias Google keeps pointed at their current recommended flash model,
so it shouldn't need revisiting as models rotate).

**Verified live against real data (bypassing the HTTP/auth layer via a
throwaway Node script calling `generateText` directly with the same tools
— only the user's own browser session is authenticated, so this was the
fastest way to test the reasoning loop before Phase 3's UI exists):**
- **Tier 1** ("find the email about being shortlisted") — correctly
  retrieved both relevant emails via `search_gmail`, and proactively also
  called `search_drive` and connected them to the linked assignment doc.
- **Tier 2** ("what's my status on the SkillLayer application, and do I
  have the take-home doc in Drive") — called both tools and produced a
  single synthesized answer correctly combining Gmail (shortlist status,
  round structure) with Drive (the actual assignment doc, deadline)  — this
  is the exact cross-source correlation shape the assignment names as "the
  actual point of the assignment."
- **Grounding / no-hallucination** ("did I send Priya a contract draft") —
  tried 7 different tool calls across both sources with varied phrasings,
  found nothing, and correctly answered "I couldn't find it" instead of
  fabricating an answer. This is the assignment's explicitly named judged
  criterion ("wrong or 'I don't know' beats confident hallucination").

**Current state:** The reasoning engine works end-to-end against real
data for all three example queries in the assignment brief. Not yet built:
the chat UI itself (Phase 3) — right now `/api/chat` exists and works, but
there's no frontend calling it yet (the landing page still only has the
re-sync button). Next: Phase 3, wire a chat UI to `/api/chat` using the AI
SDK's `useChat` hook.

---

## 2026-08-04 — Phase 3: chat UI built; hit and fixed 3 real bugs live

**Implementation:**
- Installed `@ai-sdk/react` (separate package from `ai` in this SDK
  version — `useChat` isn't exported from `ai` itself).
- [`src/app/Chat.tsx`](src/app/Chat.tsx) — client component: message list,
  streaming assistant text, input box, and a sources footnote per message
  built from the `tool-search_gmail`/`tool-search_drive` UI message parts
  (`state === "output-available"`).
- [`src/app/page.tsx`](src/app/page.tsx) — restructured the authenticated
  view into a proper app shell (header with email/re-sync/disconnect, full
  chat below) instead of the small centered auth card, which only made
  sense for the pre-chat state.

**Bug 1 (real, user-facing) — duplicate React keys crashed the page.**
First live test: the assistant response was invisible, only sources chips
showed, then the page crashed. Console: "Encountered two children with the
same key `search_gmail-emails/gmail-...`". Root cause: the model often
calls the same search tool multiple times per turn with overlapping
results, so naively flattening every tool-result across every part
produces duplicate slugs — which also meant the crash was hiding a
perfectly good answer underneath the Next.js dev error overlay. Fixed
`extractSources` in Chat.tsx to dedupe by slug (keeping the best score),
drop anything below a 0.5 relevance floor, sort by score, and cap at 6 —
this also fixed a second real UX problem (a wall of irrelevant promotional
emails in the footnote from broad low-relevance tool calls).

**Bug 2 (real, would have blocked the live demo) — the model alias
resolves to a model with a 20-request/DAY free quota.** Re-running the
exact same query that worked earlier in a plain script now failed via the
chat UI with no visible error (just "couldn't find it"), and a direct
repro hit `429 RESOURCE_EXHAUSTED`: `gemini-flash-latest` currently
resolves to `gemini-3.6-flash`, whose free tier is capped at **20
requests/day** — one multi-step tool-calling chat turn can burn 3-6 of
those alone. Probed several other model IDs directly against the
`generateContent` endpoint to find one with real headroom on this key:
`gemini-2.0-flash` came back `limit: 0` (this key has zero free quota for
it, not just exhausted), `gemini-2.5-flash-lite` is blocked entirely for
new users (404), `gemini-2.0-flash-lite` also 429'd immediately.
`gemini-flash-lite-latest` was the one model that actually worked.
Switched `/api/chat` to it and documented why in a code comment so a
future model swap doesn't reintroduce this blindly.

**Bug 3 (real, correctness-affecting) — the model correctly refused to
confirm a match it couldn't literally verify, because we withheld the
evidence.** With the lite model, "what's my status on the SkillLayer
application" reproducibly answered "couldn't find any information" *despite*
`search_gmail` returning the exact right emails at 0.86 top score. Root
cause: our `search_gmail`/`search_drive` tool output only returns
title/score/body-snippet — never the `participants` frontmatter field. The
"SHORTLISTED STUDENTS" email's body never restates "SkillLayer" (it just
says "shortlisted for the MC Round"); that context only exists as the
sender's domain (`nirmit@skillayer.tech`) in frontmatter, which gbrain
chunks from body text only — frontmatter never reaches search results or
the model. The lite model, correctly per our own grounding instructions,
declined to assert a connection it had no textual evidence for. Fixed at
the source rather than papering over it in the prompt: added a metadata
header (title + participants + attachments) into the actual page BODY in
[`markdown.ts`](src/lib/brain/markdown.ts), so this information is both
indexed for search and visible to the model in results. Required a full
re-ingestion (all 98 pages rewritten with the new body format) — the
existing pipeline handled this cleanly since writes are idempotent by id
and gbrain's sync only re-embeds changed content.

**Verified live end-to-end after both fixes, via the real chat UI (not the
bypass script) with the user's own session:** "What's my status on the
SkillLayer application, and do I have the take-home assignment document in
my Drive?" now correctly synthesizes shortlist status (from 2 emails) +
the actual Drive document (title, contents, deadline) into one coherent
answer, with a clean 3-item sources footnote (2 emails + 1 Drive doc, no
duplicates, no irrelevant junk). Also re-verified via script:
Tier 1 (Stripe failed-payment email — correctly "not found", no such email
exists) and the Priya-contract grounding case (correctly "not found") both
still hold with the new model + pipeline.

**Current state:** All three phases are functionally complete and verified
against real, live data through the actual UI: OAuth, ingestion, gbrain
storage, Gemini-based retrieval + reasoning, and a working chat frontend
with source citations. Remaining before submission: a final end-to-end
pass through the assignment's own example queries in the live UI, then
recording the demo video and preparing the submission per SPEC.md §9's
definition-of-done checklist.

---

## 2026-08-04 — Final verification pass: all definition-of-done criteria met

**Context:** Ran a structured final pass through the live chat UI (not the
bypass script) against 4 queries spanning both tiers, per SPEC.md §9.
User ran each query in their own authenticated browser session and shared
results.

**Results:**
1. **Tier 1, Gmail** — "Summarize my most recent email thread with Nirmit
   from SkillLayer" → correct summary of the shortlist notification and
   take-home assignment forward, 3 cited sources, conversational
   formatting (not a raw dump).
2. **Tier 1, Drive** — "What Drive files do I have related to
   internships?" → correctly listed both real internship JDs
   (GoMarble Growth Intern, Revrag Full Stack Developer Intern) with
   accurate one-line descriptions.
3. **Tier 2** — "What's the status of my GoMarble internship application,
   and do I have the JD saved in Drive?" → correctly reported no Gmail
   correspondence exists for this one (honest partial answer) while
   confirming the real Drive JD with accurate content — a clean
   demonstration of "wrong or 'I don't know' beats confident
   hallucination" since it didn't invent an application-status email that
   doesn't exist.
4. **Tier 2, repeat** — SkillLayer application status + take-home doc,
   re-run on a fresh page load → same correct, stable result as the
   earlier session (confirms Bug 3's fix wasn't a fluke).

All four SPEC.md §9 checkboxes now pass. Marked them `[x]` with brief
verification notes inline.

**Current state:** All three phases complete and verified live end-to-end.
Remaining before the 2026-08-09 00:00 deadline: optional Vercel deployment
of the Next.js app (gbrain itself stays local per the architecture
decision — see 2026-08-03 entry), recording the demo video, and sending
the submission email to nirmit@skilllayer.tech (cc cristian@skilllayer.tech)
replying to the original application thread.

---

## 2026-08-04 — Cyberpunk UI overhaul (two passes) + real markdown/link fixes

**Context:** After the working chat UI was verified, user requested a full
visual redesign: cyberpunk/Night City terminal aesthetic, clickable source
hyperlinks, and a code cleanup pass. Delivered in two rounds — the second
in response to feedback that the first pass was too visually minimal.

**Real bugs fixed alongside the reskin (not just styling):**
1. **`**bold**` rendered as literal asterisks.** The original Chat.tsx just
   dumped raw assistant text with `whitespace-pre-wrap` — never parsed
   markdown at all, so the model's own `**Status:**` / bullet-list output
   showed asterisks literally. Fixed by adding `react-markdown` with custom
   component overrides (bold, links, lists, code) instead of raw text.
2. **Source citations had no real links.** `search_gmail`/`search_drive`
   tool output only ever returned title/score/snippet — never the actual
   Gmail thread / Drive `webViewLink` stored in each page's frontmatter.
   gbrain's search results don't carry frontmatter (chunked body text
   only), so fixed at the source: `searchBrain()` in `gbrain-cli.ts` now
   reads each hit's `brain/<slug>.md` file directly off disk after search
   returns, parses the YAML frontmatter, and attaches the real `url`. The
   system prompt now instructs the model to cite using markdown link
   syntax when a url is present, so citations in the answer text AND the
   sources footnote are both genuinely clickable, opening the real
   Gmail/Drive item.

**Round 1 — base cyberpunk theme:**
- Fixed neon color system (cyan/pink/yellow) as CSS custom properties,
  glow utilities (multi-layer text/box-shadow), Share Tech Mono terminal
  font, subtle static scanline/grid background (deliberately static, not
  animated — flashing/scrolling backgrounds are an accessibility hazard).
- Split the monolithic Chat.tsx into modular pieces:
  `src/app/chat/{Chat,MessageBubble,SourceChip,extractSources}` — matches
  the "clean modular structure" ask.

**Round 2 — user feedback "too small/minimal, want it chunkier + icons":**
Notably, the user's feedback screenshot showed a UI with Notion/Calendar
connectors, a "Query History" panel, and a route (`/personal-brain-ui`)
that don't exist anywhere in this codebase — evidently a separate
reference mockup, not actual output of this app. Flagged this to the user
and deliberately did NOT add fake Notion/Calendar connector chrome, since
we don't have those integrations — showing a "Disconnected" badge for a
service we never built would misrepresent the system's real capabilities
during the graded demo. Implemented the explicit, real requests instead:
- Scaled up base font size (18px root), all padding/buttons/input chunkier.
- Locked the palette to the user's exact specified hex values (`#0a0a0c`
  bg, `#00f0ff` cyan, `#fcee0a` yellow, `#ff003c` pink) with much stronger
  3-layer glow shadows.
- Added `lucide-react` icons (Mail for Gmail, HardDrive for Drive) with
  neon drop-shadow tint, replacing plain text status labels.
- Deeper `clip-path` cut corners on all panels/buttons/chips.
- Source links: cyan by default, glow yellow on hover, per spec.

**Also restructured the layout during round 2** (full-viewport sidebar +
chat split, replacing the earlier centered-box layout) — `Sidebar.tsx`
(connection status, live pulsing "active tool" indicators sourced from the
in-flight tool-call parts of the last message, sync/disconnect) +
`Workspace.tsx` (top-level client shell owning `useChat` state) +
`Chat.tsx` (message list + input, now a pure props-driven presentational
component). `src/app/actions.ts` added as a standalone `"use server"`
module for the disconnect action, so the client-side `Workspace` tree can
import a server action directly without prop-drilling it down from a
server component.

**Lint caught 3 genuine React correctness bugs during round 2's
refactor** (this project's eslint config includes the newer React
Compiler-aligned purity rules): calling `Date.now()` inside a JSX prop
expression during render (impure), writing to a `ref.current` during
render to shadow state for an effect closure (also impure — effects
should read fresh state via the functional `setState` updater instead),
and calling `setState` directly inside a bare `useEffect` body (flagged
as an unnecessary cascading-render pattern). Fixed by moving all
`Date.now()` timestamp-stamping into genuine event callbacks instead of
render/effects: `onFinish` on `useChat` (fires once per completed
assistant response) stamps the assistant message, and the chat submit
handler stamps the user message immediately using a client-generated
`messageId` passed through to `sendMessage`.

**Verified:** `tsc --noEmit`, `eslint src`, and `next build` all clean
after every round; no console errors in a live page load. Full manual
click-through (login screen, sidebar, live chat with tool activity and
clickable sources) still pending user confirmation in their own browser.

**Current state:** UI overhaul complete pending the user's final visual
sign-off. All backend/reasoning functionality from the earlier verified
pass is untouched — this was a frontend-only change.

---

## 2026-08-04 — Bug: sending a message crashed with "message with id ... not found"

**Context:** User tried the new UI live and hit a Next.js runtime error
overlay immediately on send: `message with id <uuid> not found`.

**Root cause:** Misread `useChat().sendMessage`'s `messageId` option. Its
actual contract (confirmed from `node_modules/ai/dist/index.d.ts`'s doc
comment: "If a messageId is provided, the message will be replaced.") is
to **replace an existing message**, not to assign an id to a brand-new
one. The earlier timestamp-tracking implementation generated a fresh
`crypto.randomUUID()` and passed it as `messageId` hoping to pre-assign
the new user message's id — instead the SDK tried to find-and-replace a
message with that id, found none, and threw.

**Fix:** Dropped the fabricated-id approach entirely. User message
timestamps are now tracked by **send order**, not id: `Workspace.tsx`
keeps a plain `number[]` (`userTimestamps`), appending `Date.now()` in the
submit handler (a real event callback) before calling
`chat.sendMessage({ text })` with no `messageId`. `Chat.tsx` matches each
rendered user message to its timestamp by computing
`userMessageIds.indexOf(message.id)` against the list of user message ids
in the current `messages` array — no fabricated id needed anywhere.
Assistant timestamps are unaffected (they already used the real id
supplied by `onFinish`, which was never the problem).

**Lint caught another purity violation while fixing this:** an IIFE
computing render output used a mutable `let userIndex = -1` counter
incremented while mapping — flagged as "cannot reassign variable after
render completes" by the same React Compiler-aligned purity rules from
the earlier refactor. Rewrote without any mutable state: build an
immutable `userMessageIds` array first via `.filter().map()`, then look
up each user message's position with `.indexOf()` — O(n²) for a chat
transcript that's realistically dozens of messages, not worth optimizing.

**Verified:** `tsc --noEmit`, `eslint src`, `next build` all clean.
Live click-through re-requested from the user.

---

## 2026-08-04 — Vercel deployment prep: migrated gbrain to Supabase + remote MCP

**Context:** User asked to deploy to Vercel, with an explicit ask to keep
API keys out of the public repo. Flagged upfront that the current
implementation can't run on Vercel as-is: `/api/chat` and
`/api/ingest/sync` shell out to a locally-installed Windows `gbrain.exe`
binary and read/write a local git repo (`brain/`) — none of which exist on
Vercel's stateless Linux serverless functions. Presented three options
(skip Vercel / build real remote-gbrain hosting / UI-only broken-demo
shell); user chose to build it properly.

**Scope decision:** Ingestion stays local-only (already fully built,
inherently about reading the user's private Gmail/Drive — arguably
shouldn't be triggerable from a public URL anyway). What moves remote is
the shared data store and the query/search path, so both local dev and the
eventual Vercel deployment read the same brain.

**Step 1 — Supabase.** User created a Supabase project, enabled the
`vector` extension (required — gbrain's schema migrations refuse to run
without it), and got both the Transaction pooler (port 6543, main
read/write) and Session pooler (port 5432, IPv4 workaround for
DDL/migrations/locks) connection strings per gbrain's own documented
gotchas (`docs/tutorials/personal-brain.md` §7a-7c in the cloned repo).

**Step 2 — migrated local gbrain from PGLite to Postgres.**
- `gbrain config set database_url "<transaction pooler>"` — first attempt
  appeared to silently fail (`gbrain config show` didn't list it
  afterward), but a second attempt printed explicit confirmation
  (`Set database_url = postgresql://...`); turned out `config show`
  deliberately omits `database_url` from its display rather than the value
  never having saved.
- `setx GBRAIN_DIRECT_DATABASE_URL "<session pooler>"` — the IPv4 fix.
- `gbrain migrate --to supabase` initially failed ("no connection string
  provided") despite `database_url` being configured — the migrate command
  doesn't read it from config automatically and needs `--url` passed
  explicitly. Retrieved the already-configured value via
  `gbrain config get database_url` (never displayed in chat) and passed it
  as `--url`.
- Migration succeeded: all 98 pages + links + embeddings copied, verified
  matching count and 100% embedding coverage. `config.json` now shows
  `"engine": "postgres"`. Local dev's search/chat continues working
  unchanged against the new backend — gbrain's own config file abstracts
  the engine switch away from our app code entirely.

**Step 3 — hosting `gbrain serve --http` and the auth gotcha that cost the
most time.** Created a legacy bearer token via `gbrain auth create
"test-client"` (simpler than the full OAuth 2.1 client_credentials flow
for a server-to-server use case, and Postgres-only — which we now have).
First few `tools/call` requests against the local HTTP server (tested
before touching Railway, to de-risk the remote deploy) all returned empty
results (`"[]"`) despite the exact same query working via local CLI
against the same Supabase database. Root cause, found by reading
`src/core/oauth-provider.ts` in the cloned repo: **legacy bearer tokens
default to the `default` source (0 pages) unless a `permissions.source_id`
grant is explicitly set** — no CLI flag exists for this on `gbrain auth
create` (only `register-client`, the OAuth path, has `--source`). Fixed by
UPDATE-ing the token's `permissions` JSONB directly in Supabase (via a
throwaway Node script using the `postgres` package, run once, not added as
a project dependency) to add `source_id: "personal-brain"`. Search then
worked correctly and matched local CLI results exactly.

**Also discovered while probing the raw HTTP endpoint:**
- The MCP HTTP transport requires `Accept: application/json,
  text/event-stream` or it 406s.
- Responses come back as a single SSE `event: message` frame, not a plain
  JSON body — the `data:` line has to be extracted before parsing as
  JSON-RPC.
- The `search` tool's schema (confirmed via `tools/list`) has no `source`
  parameter at all — scoping is entirely by the authenticated token's
  grant, not a per-call argument.
- `search` still returns only chunked body text, no frontmatter — so the
  real Gmail/Drive `url` we cite still needs a second call per hit, now to
  the remote `get_page` tool (confirmed it returns
  `frontmatter.url`) instead of reading a local file. This is what makes
  the same code path work identically from Vercel, which has no
  filesystem access to `brain/*.md` at all.

**Code changes:**
- [`src/lib/brain/gbrain-remote.ts`](src/lib/brain/gbrain-remote.ts) (new)
  — the unified MCP HTTP client (`mcpCall`, `searchBrain`, `searchGmail`,
  `searchDrive`, `get_page`-based URL lookup). Used by BOTH local dev and
  the eventual Vercel deployment — no more dual code paths.
- [`src/lib/query/tools.ts`](src/lib/query/tools.ts) — now imports search
  from `gbrain-remote` instead of `gbrain-cli`.
- [`src/lib/brain/gbrain-cli.ts`](src/lib/brain/gbrain-cli.ts) — trimmed
  to only `commitBrainRepo` / `syncBrain` (ingestion, still local-only by
  design). All search-related code removed.
- `.env.local` gained `GBRAIN_REMOTE_URL` (currently
  `http://localhost:3131/mcp` for local testing) and `GBRAIN_REMOTE_TOKEN`
  (written directly to the file, never displayed in chat, same pattern as
  `NEXTAUTH_SECRET`).

**Verified:** `tsc --noEmit`, `eslint src` both clean. Raw curl tests
against the local `gbrain serve --http` (pointed at Supabase) confirm
`search` and `get_page` both return correct, real data matching local CLI
results exactly.

**Current state:** Local gbrain fully migrated to Supabase; local HTTP MCP
server validated end-to-end at the protocol level. Not yet done: full
chat-UI click-through against the new remote-search code path (should be
transparent to the user, but not yet confirmed), then deploying `gbrain
serve --http` to Railway (currently only running on the dev machine),
then deploying the Next.js app itself to Vercel with all secrets set via
Vercel's Environment Variables dashboard.

---

## 2026-08-04 — gbrain hosted remotely on Render (not Railway); fixed embedding-dimension crash

**Context:** Before deploying, user asked how to make hosting last "at
least a year or two" without ongoing cost — flagged that Railway's free
tier is a one-time trial credit (~$5), not perpetual, so it wouldn't meet
that goal even though it's the easiest setup. Laid out three real options
(Render free tier / Railway now + migrate later / Oracle Cloud Always
Free) with honest trade-offs (cold-starts vs. setup effort vs. true
permanence). User chose Render — genuinely free indefinitely, similar
ease of setup to Railway, at the cost of occasional cold-start latency
after inactivity.

**Deploy setup:** Added [`gbrain-server/Dockerfile`](gbrain-server/Dockerfile)
— a minimal `oven/bun:1` image that installs gbrain globally and runs
`gbrain serve --http --port ${PORT:-3131} --bind 0.0.0.0`. Deliberately no
`config.json` baked into the image and no `--public-url` flag: engine
auto-detects to `postgres` when no config file exists and
`GBRAIN_DATABASE_URL` is set (confirmed by reading `src/core/config.ts` in
the cloned repo), and `--public-url` is only needed for OAuth 2.1 issuer
discovery, which this deployment doesn't use (legacy bearer tokens
instead). Render service created with root directory `gbrain-server`,
Docker runtime, free instance type, and env vars `GBRAIN_DATABASE_URL`
(transaction pooler), `GBRAIN_DIRECT_DATABASE_URL` (session pooler),
`GOOGLE_GENERATIVE_AI_API_KEY`.

**Bug hit and fixed — search silently 404'd on the deployed instance
(GET worked, POST didn't).** First live test against the Render URL:
`GET /mcp` correctly returned 405 (route exists, wrong method), but
`POST /mcp` with a real `tools/call` search request returned a bare
`Not Found` — even with no Authorization header at all, ruling out an
auth-scoping issue. Checked Render's server logs (user shared
screenshots) and found the actual cause spelled out in gbrain's own
startup output: *"Stateless hosts: embedding_model/embedding_dimensions
resolve from env/config.json only — set GBRAIN_EMBEDDING_MODEL /
GBRAIN_EMBEDDING_DIMENSIONS... to match the brain's schema."* Neither var
was set, so the server fell back to gbrain's default embedder
(`zeroentropyai:zembed-1`, 1280 dimensions) instead of the actual brain's
schema (`google:gemini-embedding-001`, 768 dimensions) — `search` has to
embed the query text before it can do vector search, so the dimension
mismatch crashed that code path specifically while dimension-agnostic
routes (bare GET) stayed fine. Fixed by adding `GBRAIN_EMBEDDING_MODEL=
google:gemini-embedding-001` and `GBRAIN_EMBEDDING_DIMENSIONS=768` to
Render's env vars; Render auto-redeployed and the very same search query
returned correct real results afterward (score 1.0 on the exact-match
Drive doc — even better ranked than local, interesting but not
investigated further).

**Also noted, not acted on:** startup logs also warned
`GBRAIN_HTTP_CORS_ORIGIN is unset — OAuth endpoints will reject ALL
cross-origin requests`. Not relevant here — our Next.js API routes call
gbrain server-side (Node `fetch`, not browser JS), so browser CORS policy
never applies to this traffic. Left unset.

**Cleanup:** killed the temporary local `gbrain serve --http` process
(was only running in this session's own background shell for
pre-deployment testing) and updated `.env.local`'s `GBRAIN_REMOTE_URL`
from `http://localhost:3131/mcp` to the live Render URL — local dev now
talks to the same remote brain the eventual Vercel deployment will use.

**Verified:** live `curl` against `https://personal-brain-gbrain.onrender.com`
— `/health` returns `{"status":"ok","engine":"postgres"}`, and a real
`tools/call` search request returns correct, real results matching local
CLI output.

**Current state:** gbrain is fully hosted and working remotely. Remaining
for the Vercel deployment itself: create the Vercel project from the
GitHub repo, set all secrets via Vercel's Environment Variables dashboard
(Google OAuth client, Gemini key, NextAuth secret + production URL,
`GBRAIN_REMOTE_URL`/`GBRAIN_REMOTE_TOKEN`), add the production URL as an
authorized redirect URI in Google Cloud Console (OAuth will 401 otherwise),
deploy, and verify live.

---

## 2026-08-05 — Deployed to Vercel; live at project-main-ai.vercel.app

**Deploy steps:** created the Vercel project from the GitHub repo, set all
6 secrets (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`,
`GOOGLE_GENERATIVE_AI_API_KEY`, `GBRAIN_REMOTE_URL`, `GBRAIN_REMOTE_TOKEN`)
via Vercel's Environment Variables dashboard (never committed to the
repo), deployed.

**Bug hit and fixed — OAuth `redirect_uri_mismatch`.** First live login
attempt failed with Google's `Error 400: redirect_uri_mismatch`, since the
Google Cloud OAuth client only had `localhost:3000`'s callback URL
registered. Added
`https://project-main-ai.vercel.app/api/auth/callback/google` to
Authorized redirect URIs, added `NEXTAUTH_URL` to Vercel's env vars,
redeployed. Verified live — reaches Google's real sign-in screen
correctly afterward.

**Bug hit and fixed — the "Re-sync" button is broken on the deployed
site (as expected, but was never actually disabled there).** User tested
the deployed app and hit "Ingestion sync failed" clicking re-sync. This
is the exact limitation flagged at the very start of the Vercel work:
`/api/ingest/sync` shells out to a local gbrain binary and a local
`brain/` git repo, neither of which exist on Vercel's serverless
functions — only the search/chat path was ever migrated to work
remotely, but the sync button was still visible and wired to the
local-exec code path everywhere. Fixed properly instead of just
explaining it away, since a visibly-broken button in a graded demo looks
bad: `page.tsx` now computes `ingestionEnabled = !process.env.VERCEL`
(Vercel always sets `VERCEL=1`; local `next dev`/`next start` never do)
and threads it down through `Workspace` to `Sidebar`, which shows the
real re-sync button locally but a plain explanatory note
("re-sync runs from local dev only — this deployment reads the same
shared brain") on the deployed site instead. Also added a server-side
guard directly in `/api/ingest/sync` (returns 501 with a clear message
if `process.env.VERCEL` is set) as defense-in-depth, independent of
whatever the UI shows.

**Also clarified for the user:** this app is single-tenant by design
(SPEC.md's explicit "single user" scope) — there's one shared brain in
Supabase, not one per Google account. Logging in with a second Google
account and re-syncing would mix that account's data into the same
brain, not keep it separate. No architecture change made here since it's
out of scope for the assignment; just made sure the user understood the
behavior before they tried it.

**Verified:** `tsc --noEmit`, `eslint src`, `next build` all clean.

**Current state:** App fully deployed and live at
https://project-main-ai.vercel.app — OAuth, chat, and remote-gbrain
search all confirmed working in earlier steps; the ingestion-button fix
above is committed and pushed, awaiting Vercel's auto-redeploy (GitHub
integration) and a final live click-through to confirm the sidebar shows
the correct state on production.

---

## 2026-08-05 — Chat timing out on Vercel; root cause was Render's region

**Context:** User confirmed the ingestion-button fix deployed correctly,
but then hit a real bug testing chat live: a query just hung forever
("BRAIN · 12:17 AM" with an empty pending cursor, no response ever
arrived).

**Diagnosis:** User checked Vercel's Runtime Logs (same technique as the
Render embedding-dimension bug earlier) and found the real error:
`Vercel Runtime Timeout Error: Task timed out after 30 seconds` on
`/api/chat`, repeated across multiple requests. (Also visible in the same
log: `/api/ingest/sync` correctly returned 501 — confirming the earlier
fix worked.)

**First fix attempt — reduce URL-lookup round-trips.** Hypothesis: each
`get_page` call (used to fetch the citation URL) is a separate network
round-trip to the remote gbrain server, and the model can call
`search_gmail`/`search_drive` multiple times per turn with rephrased
queries (observed up to 4x in earlier testing) — each call enriching
every one of its results. Capped URL lookups to the top 3 results by
relevance per call in
[`gbrain-remote.ts`](src/lib/brain/gbrain-remote.ts) (snippets, already
free since they come from the single search response, still cover every
hit for grounding — only the citation *link* is capped). Also bumped
`/api/chat`'s `maxDuration` from 30 to 60 (Vercel Hobby plan's max) as
headroom.

**Verified the fix was insufficient on its own.** A throwaway timed test
script (`generateText` with the same tools, instrumented with per-call
timing) showed the real query — "what are the skills from my
Resume_2026_APRIL" — still took **59-70 seconds** end to end even with
the URL-lookup cap. Per-call timing logs showed why: the `search` MCP
call itself was taking **10-25 seconds per call**, completely dominating
the total — `get_page` calls were only ~2s each and already capped.

**Root cause — Render (Oregon, US West) talking to Supabase (Sydney,
ap-southeast-2) on every single query.** Confirmed by having the user
check Render's Settings → Region. A raw curl timing sweep across
different `limit` values showed latency didn't correlate with result
count (5 results was *slower* than 32), ruling out overfetch size as the
driver and pointing at fixed network/infra latency instead — consistent
with a full US↔Australia round trip (DB query + the Gemini embedding API
call) on every request.

**Render doesn't support changing an existing service's region** (```
"Render doesn't currently support changing the region for an existing
service or database. Instead, create a new service..." ```) — created a
second Render service (`gbrain-server`, same Dockerfile, same env vars)
in **Singapore** (closest available Render region to Sydney) rather than
Oregon. Re-verified timing directly: raw `search` calls dropped from
10-25s to ~7s once warm (first call after deploy was still ~15-17s —
cold start), and the same full end-to-end integration test that took
59-70s against Oregon completed in **30.8s** against Singapore —
comfortably under the 60s ceiling.

**Note:** the new service's hostname is `ersonal-brain-gbrain-sg.onrender.com`
(missing the leading "p") — a naming typo the user made when creating it
in Render, not a copy-paste error (confirmed by checking the exact string
shown in Render's own UI). Harmless since it's just a hostname, but worth
remembering if this needs to be referenced again — it is NOT a typo to
"fix."

**Updated:** `.env.local`'s `GBRAIN_REMOTE_URL` now points at the
Singapore service. Vercel's `GBRAIN_REMOTE_URL` env var needs the same
update (user to do next), followed by a redeploy and final live retest.
The original Oregon Render service is still running but unused — fine to
delete later, not urgent (free tier, no cost either way).

**Current state:** Both the code-level fix (capped URL lookups, 60s
ceiling) and the infra-level fix (Singapore region) are needed together —
neither alone brought total latency reliably under the timeout. Verified
via direct script, not yet reverified through the actual deployed Vercel
app end-to-end (pending Vercel env var update + redeploy + live retest).

---

## 2026-08-05 — Vercel + Singapore fix confirmed live; polished loading state

**Verified live:** user updated Vercel's `GBRAIN_REMOTE_URL` to the
Singapore Render service, redeployed, and confirmed a real chat query
("Summarize Work at Adobe at a stipend mail") completed correctly on the
deployed app — response, formatting, and sources footnote all working.
Also confirmed local dev works identically after restarting with the
updated `.env.local`, since it's the exact same code path. This closes
out the Vercel deployment + latency work.

**UI polish — replaced the loading indicator.** User asked for the
"thinking" state (previously a plain blinking `▌` block) to be replaced
with a smoother, on-theme animation: a sequential-pulse scanner bar
(5 thin cyan bars, staggered `animation-delay` creating a wave via CSS
`@keyframes`, glowing at peak using the existing `--glow-cyan` shadow
token) next to a `[ PROCESSING_DATA... ]` label with a smooth opacity
pulse, the whole thing fading in via a `thinking-fade-in` keyframe rather
than popping in abruptly. Pure CSS (`@keyframes` + `animation-delay`
stagger), no JS animation loop or interval, per the explicit ask.
New [`ThinkingIndicator.tsx`](src/app/chat/ThinkingIndicator.tsx)
component, styles added to
[`globals.css`](src/app/globals.css), wired into
[`MessageBubble.tsx`](src/app/chat/MessageBubble.tsx) in place of the old
inline `▌` span.

**Verified:** `tsc --noEmit`, `eslint src`, `next build` all clean; no
console errors on a live page load. User confirmed visually: "Looks
clean and good."

**Current state:** App is fully deployed, functionally verified end to
end (OAuth, ingestion, remote gbrain search, Gemini reasoning, citations),
and now visually polished. All work from today's Vercel deployment push
is complete.

---

## 2026-08-05 — Declined BYOK; implemented rate-limit/overload error handling

**BYOK declined mid-implementation.** User asked for a "Bring Your Own
Key" architecture so the deployed site could be shared with external
users without burning their personal Gemini quota. Before writing code,
flagged a real gap: the Google OAuth consent screen is still in Testing
mode with a one-email allowlist, and `gmail.readonly`/`drive.readonly`
are Google's restricted-scope tier — going public requires their formal
verification process (privacy policy, security assessment), commonly
weeks, not something achievable before the submission deadline. Even if
login worked, every visitor would be querying the *owner's* shared
Gmail/Drive brain, not their own — no per-user data isolation exists.
User then asked directly whether real multi-tenancy is possible (gbrain
does support the underlying primitives — per-user sources, scoped tokens,
same as their documented "company brain" pattern — but wiring it up is a
genuine re-architecture of auth + ingestion + query-scoping together).
Recommended against pursuing either before the deadline. User agreed and
said to scrap BYOK entirely — no code had been written yet (only research
into the AI SDK's transport header API), so nothing to revert.

**Implemented instead: graceful rate-limit/overload error handling.**
Real problem worth solving regardless of BYOK — Gemini's free tier is
easy to rate-limit into (we hit this ourselves multiple times testing
model choices on 2026-08-04), and the app previously had no handling for
it: a 429/503 mid-stream would just hang the UI forever (empty pending
cursor, no feedback, no way to recover without a page reload).

- [`src/app/api/chat/route.ts`](src/app/api/chat/route.ts) — most Gemini
  failures surface *during* streaming, not as a synchronous throw from
  `streamText()` (it returns immediately; the model call happens lazily
  as the stream is consumed) — confirmed by reading the AI SDK's own
  types. Wired a `friendlyErrorMessage()` classifier into
  `toUIMessageStreamResponse({ onError })`, which controls the error text
  embedded directly in the response stream. Classifier unwraps `RetryError`
  (the SDK's own wrapper after exhausting its internal retries) via
  `.lastError` to reach the underlying `APICallError` and its
  `statusCode`: 429 → "high demand" message, 500/503 → "service overload"
  message, other codes → generic upstream-error message with the code
  included, non-API errors → generic fallback (logged server-side for
  debugging). Kept the outer `try/catch` too, for genuinely synchronous
  failures (bad request body, auth) that occur before `streamText` is
  even reached.
- [`src/app/chat/Workspace.tsx`](src/app/chat/Workspace.tsx) — added
  `onError` to `useChat` (fires with an `Error` whose `.message` is
  exactly the string the server crafted — no need to re-classify
  client-side), storing it in a `systemError` state slot; cleared on
  every new send and on retry. Added `retryLastMessage()` using `useChat`'s
  built-in `regenerate()` rather than resending text manually.
- [`src/app/chat/SystemErrorBanner.tsx`](src/app/chat/SystemErrorBanner.tsx)
  (new) — pink/magenta glowing banner matching the existing alert-color
  convention (already used for Send/Disconnect), with a Retry button.
- [`src/app/chat/Chat.tsx`](src/app/chat/Chat.tsx) — renders the banner
  after the message list when `systemError` is set. Also fixed a related
  cosmetic edge case: a failed generation can leave a real-but-empty
  assistant message in the transcript (request errored before any tokens
  arrived) — now skipped once no longer busy, so the error banner isn't
  preceded by an empty floating box.

**Verified:** a standalone script constructing synthetic `APICallError`/
`RetryError` instances (429, 503, 500-wrapped-in-RetryError, and a plain
unclassified `Error`) confirmed all four classification branches produce
the correct message — couldn't reliably force a real 429 from Gemini on
demand without burning quota, so this was the practical way to verify the
logic itself. `tsc --noEmit`, `eslint src`, `next build` all clean; no
console errors on a live page load. Live click-through (including
whether rapid-fire messages naturally trip a real rate limit) requested
from the user.

**Current state:** Error handling implemented and verified at the logic
level; awaiting the user's live confirmation of both the normal path and
(if it naturally triggers) the error path.

---

## 2026-08-05 — Unified the app to one font (was two)

**Context:** User confirmed error handling deployed and working, but
flagged a visual regression: message text in the chat rendered in a
different (sans-serif) font from the sidebar's mono labels/timestamps —
visibly inconsistent side by side in a screenshot. This was a deliberate
dual-font setup from an earlier design pass (mono for "system" chrome,
sans-serif for "conversation" text, per that request's explicit spec at
the time) — reversing course now that both were visible together and
read as a mismatch rather than an intentional distinction.

**Fix:** Removed the `Inter` font entirely from
[`layout.tsx`](src/app/layout.tsx) — only `Share_Tech_Mono` remains.
Updated [`globals.css`](src/app/globals.css): `--font-sans` now points at
`--font-terminal` instead of the removed `--font-body`, and `body`'s
`font-family` declaration updated to match. Grepped for any other
`--font-body`/`font-sans` references first to make sure nothing else
depended on the removed variable — none did.

**Also raised, not yet resolved:** user reported the deployed Vercel site
"looks bigger" than local. Font loading is identical between environments
(same self-hosted font files, same build), so this isn't a font/CSS
difference between the two — most likely a browser zoom-level difference
between the two tabs being compared. Asked the user to check
(`Ctrl+0` to reset zoom) rather than guessing at a CSS fix for an
unconfirmed cause.

**Verified:** `tsc --noEmit`, `eslint src`, `next build` all clean; no
console errors; confirmed via `getComputedStyle(document.body).fontFamily`
in a live page load that the entire app now resolves to
`"Share Tech Mono", ... monospace` with no Inter fallback anywhere.

---

## 2026-08-05 — Real eval loop + genuine subagent verification (harness-engineering bonus)

**Context:** User asked whether every requirement and bonus in the
assignment brief had been achieved. Answered honestly: everything
required was done and verified, but the optional "harness engineering"
bonus (subagents, structured tool definitions, eval loops, prompt
iteration logs) was only half-true as claimed — tool definitions and
prompt-iteration evidence were genuinely strong (this JOURNAL), but no
subagent had actually been used in building the project, and no
automated eval loop existed (verification so far had all been manual,
logged after the fact). User asked to fully close both gaps rather than
leave them as acknowledged bonus gaps — and explicitly not by faking
either one.

**Refactor first — single source of truth for the model config.**
Extracted `SYSTEM_PROMPT` and `CHAT_MODEL_ID` out of
[`src/app/api/chat/route.ts`](src/app/api/chat/route.ts) into a new
[`src/lib/query/config.ts`](src/lib/query/config.ts), imported by both
the real route and the new eval harness. Deliberate: an eval suite that
imports a hand-copied duplicate of the prompt/model would only prove the
duplicate works, not the deployed system — this way a real drift between
what's tested and what's deployed is structurally impossible.

**Built the eval loop for real.**
[`evals/cases.ts`](evals/cases.ts) — 5 cases mirroring SPEC.md §5's exact
target queries (3 Tier 1, 2 Tier 2), using the concrete versions already
manually verified earlier (e.g. "[X]" → "Nirmit from SkillLayer").
[`evals/run-evals.ts`](evals/run-evals.ts) — imports the actual
`brainTools` (`src/lib/query/tools.ts`) and the shared config above, runs
each query through real `generateText`, and checks two independent things
per case: whether the expected tools were actually invoked (proof of
real single-/cross-source retrieval, not just plausible text) and whether
the answer matches expected keywords or correctly reports "not found" for
the two grounding/negative cases. Writes a full timestamped log to
`evals/EVAL_LOG.md`. Wired up as `npm run eval`
([`package.json`](package.json)).

First real run against live data (not mocked): **5/5 passed.**

**Genuine subagent dispatch — not just claimed.** Rather than assert the
subagent-usage bonus was satisfied, actually spawned a `general-purpose`
subagent (fresh context, no knowledge of how any of this was built) with
one job: independently verify the eval suite is legitimate evidence, not
a self-congratulatory checkbox. It read SPEC.md, the eval files, the
production tool/config modules, and the actual EVAL_LOG.md, then reported
back real findings rather than a rubber stamp:

- **SPEC §5 Tier1 #2 (the recency query, "edited/shared in the last
  week") wasn't tested at all** — silently swapped for an unrelated
  topic-based query without disclosing the substitution.
- **SPEC §5 Tier2 #1 was narrowed** to one named company without
  disclosing it — SPEC's actual wording is an open-ended "what jobs have
  I applied to" enumeration, untestable with simple keyword checks.
- **The Priya not-found case's `expectedTools` only required
  `search_gmail`**, despite its own description claiming both sources
  must be searched — would have passed even if `search_drive` was never
  called.
- **Two keyword checks were too loose** (`tier1-drive-internships`,
  `tier1-gmail-thread-summary`) — a single topic-word match could pass
  even on a wrong or evasive answer, since neither required an actual
  citation link.
- **Process gap**: at review time, all of the above work (evals/*,
  config.ts, the route.ts refactor) was uncommitted and this very
  JOURNAL.md entry didn't exist yet, even though the same uncommitted
  diff had already flipped SPEC.md §9's "changes logged in JOURNAL.md"
  checkbox to done. Correctly caught as premature.

**Fixed every finding for real, not cosmetically:**
- Discovered *why* the recency case was skipped in the first place: our
  own tool output ([`src/lib/query/tools.ts`](src/lib/query/tools.ts))
  never exposed any date/timestamp field to the model at all — a real,
  previously-undiscovered gap, not just a missing test. Fixed at the
  source: [`gbrain-remote.ts`](src/lib/brain/gbrain-remote.ts)'s existing
  `get_page` frontmatter lookup (already fetched for the citation URL, on
  the top 3 results by relevance) now also pulls `date`, threaded through
  to the tool output. Added an honest instruction to
  [`config.ts`](src/lib/query/config.ts)'s system prompt: dates are only
  present on some results, so their absence isn't evidence of "no date" —
  the model should use what dates it has and say so plainly if that's not
  enough to answer confidently, rather than guessing at an order.
- Added `tier1-drive-recency` as SPEC §5 Tier1 #2's actual verbatim query,
  with its expectation deliberately scoped to the documented limitation
  (real Drive content or an honest caveat, not exact recency ranking —
  which the architecture genuinely can't fully guarantee yet) rather than
  asserting something we knew wasn't reliably achievable.
- Added an explicit disclosure paragraph to `tier2-skilllayer-status`'s
  description instead of a silent narrowing.
- `tier2-priya-contract-not-found`'s `expectedTools` now requires both
  `search_gmail` and `search_drive`, matching its own claim.
- Both loose keyword checks now additionally require an actual citation
  link (`mail.google.com` / real Drive/Doc URL) in a second required
  group, not just the topic word.

**Re-ran after all fixes: 5/5 still passed**, including the newly-added
recency case, which produced genuinely honest output — the model reported
no Drive files with confirmable edits "within the last week" and listed
the most recent dated files it did have, rather than fabricating a
precise weekly cutoff. Also re-confirmed via this run: the
`tier1-stripe-not-found` and `priya` cases both explicitly noted (on
their own, unprompted) that those exact phrases appear only as *example
queries inside the assignment brief document itself* (now ingested as a
Drive file) rather than being real inbox content — a subtle, correct
distinction the model drew entirely on its own from the retrieved data.

**Verified:** `tsc --noEmit`, `eslint src evals`, `next build` all clean
after every change. Both eval runs were against live production
infrastructure (real Render-hosted gbrain, real Supabase data, real
Gemini calls) — no mocking anywhere in this harness.

**Current state:** Both previously-acknowledged bonus gaps are now
genuinely closed: a real, independently-verified, currently-passing eval
loop exists and is runnable via `npm run eval`, and a real subagent was
used during development with real findings that materially improved the
work (not a symbolic invocation). `evals/EVAL_LOG.md` contains excerpts
of the user's real personal Gmail/Drive content (shortlist status, real
document names/links) — flagged to the user before deciding whether to
commit it as public evidence or gitignore it for privacy. User chose to
commit it (same sensitivity level as what's already visible in the
deployed demo).

---

## 2026-08-05/06 — Framer Motion micro-interactions + light/dark theme switcher

**Context:** User's earlier Framer Motion + theme-switcher request
(paused mid-conversation to check priority against the submission
deadline) was reconfirmed after all required-and-bonus assignment work
was independently verified complete. Implemented in full.

**Framer Motion (`npm install framer-motion`):**
- [`MessageBubble.tsx`](src/app/chat/MessageBubble.tsx) — root converted
  to `motion.div` with `initial={{opacity:0,y:16}}` → `animate` on mount;
  since each message has a stable `key={message.id}` and only NEW messages
  mount, this naturally staggers in a live chat without needing explicit
  `staggerChildren` orchestration (which only matters for batch-mounted
  lists, not one-at-a-time streaming).
- Hover/tap (`whileHover={{scale:1.02}}` / `whileTap={{scale:0.98}}`) on:
  [`SyncButton`](src/app/SyncButton.tsx), Sidebar's Disconnect button,
  Chat's Send button, [`SourceChip`](src/app/chat/SourceChip.tsx),
  [`SystemErrorBanner`](src/app/chat/SystemErrorBanner.tsx)'s Retry button
  (which also got a slide-up+fade-in entrance animation — fits naturally
  now that Motion is already a dependency).
- Sidebar's active-tool pulsing dot converted from Tailwind's
  `animate-pulse` (a harsher linear blink) to a smooth Motion
  `animate={{opacity:[...], scale:[...]}}` loop, consistent with the
  earlier "smooth cyberpunk, not harsh blink" direction from the loading-
  indicator work (JOURNAL.md 2026-08-05).
- Login screen's Connect button deliberately NOT converted to
  Framer Motion — it's a Server Component with a server-action form;
  converting just for one hover effect would mean pulling the whole
  login screen into the client bundle for no real benefit. Used
  Tailwind's `hover:scale-[1.02] active:scale-[0.98]` instead, same
  visual result, honest scoping trade-off.

**Real bug found and fixed while wiring up hover states — `hover:glow-border-*` never worked, anywhere, until now.**
Every button across the app already used `hover:glow-border-cyan` /
`hover:glow-border-pink` (SyncButton, Send, Disconnect, chips, etc.), but
`.glow-border-cyan` was declared as a **plain CSS class** in globals.css,
not a Tailwind-registered utility — Tailwind v4 only generates variant
rules (`hover:`, `focus:`, ...) for classes it recognizes as utilities
(built-in, or declared via `@utility`). Verified empirically: grepped the
actual compiled dev CSS for `glow-border-cyan` and found exactly one
occurrence (the base class itself) — no `:hover` rule existed anywhere.
Every hover-glow across the entire app had been silently inert since it
was first written. Fixed by redeclaring the glow/clip-corner utilities
with `@utility` instead of plain classes; re-verified by grepping the
rebuilt CSS, which now shows both the base rule AND
`.glow-border-cyan:hover{...}`. Also fixed a smaller latent bug in the
same block: `.glow-border-pink`'s border-color was a hardcoded
`rgba(255,46,166,.6)` instead of deriving from `--neon-pink` — harmless
in the dark-only single-theme world it was written in, but would have
shown the wrong (dark-mode) magenta on light-mode panels. Now uses
`color-mix(in srgb, var(--neon-pink) 60%, transparent)`, which adapts
with the theme.

**Light/dark theme switcher:**
- [`ThemeProvider.tsx`](src/app/ThemeProvider.tsx) — context +
  `localStorage` persistence (`personal-brain:theme`) + `[data-theme]` on
  `<html>`. An inline script (`NO_FLASH_THEME_SCRIPT`) is injected into
  `<head>` in [`layout.tsx`](src/app/layout.tsx) and sets `[data-theme]`
  from `localStorage` *before* hydration, so switching themes doesn't
  flash the wrong palette on load — the standard pattern (same one
  `next-themes` uses).
- [`ThemeToggle.tsx`](src/app/chat/ThemeToggle.tsx) — a Motion-animated
  sliding switch (spring transition, crossfading Sun/Moon icons) in the
  Sidebar header.
- [`globals.css`](src/app/globals.css) — every themed token (`--bg`,
  `--bg-panel`, `--neon-cyan/yellow/pink`, `--text-primary/dim`,
  `--border-dim/glow`, all three `--glow-*` shadows, and the scanline/grid
  overlay's tint) now has a `:root[data-theme="light"]` override. Since
  zero components use hardcoded hex colors (confirmed via grep before
  starting — everything already routed through these CSS variables), the
  whole app re-themes correctly with **no component-level changes**
  needed anywhere except the toggle switch itself, which needs to know
  the current value to animate correctly.
- Light palette ("Neo-Tokyo lab," not generic white, per spec): background
  `#f0f3f8`, panels `#e2e8f0`/`#d3dbe6`, text `#0f172a`, accents recomputed
  for legibility on light — electric blue `#0055ff`, acid green `#4a9e00`,
  hot magenta `#d6009e` (dark-mode's raw neon hex values would have had
  poor contrast against a light background, so these aren't just the same
  colors reused — recomputed specifically for this palette).
- Global smooth transition (`background-color`/`border-color`/`color`,
  220ms) added on `*` so toggling is a cross-fade, not a flash — scoped to
  exclude `box-shadow`/`transform` so it doesn't fight with Motion's own
  hover/tap animations or the thinking-indicator's keyframes, which
  animate different properties.

**Bug hit and fixed — hydration mismatch from the no-flash script.**
First live check (browser console) showed a real React hydration warning:
server-rendered `<html>` has no `[data-theme]` (the server can't know the
client's localStorage value), but the inline script sets it before
hydration, so client and server HTML genuinely differ on that one
attribute — expected with this pattern, but I'd forgotten the
`suppressHydrationWarning` prop that's required alongside it (confirmed
via curl against the raw SSR payload that the fix was actually served,
and via a **fresh browser tab** that the warning was gone — an existing
tab kept showing the same cached warning + a stale WebSocket HMR id after
a server restart, which was leftover console-log accumulation from before
the fix, not a real ongoing failure; closed that tab to avoid confusion).

**Verified:**
- `tsc --noEmit`, `eslint src evals`, `next build` all clean.
- Compiled CSS re-checked directly: `hover:glow-border-cyan` now
  generates a real `:hover` rule (it never did before).
- Theme mechanism verified end-to-end via direct browser JS (no
  authenticated session available to click the actual toggle switch,
  which only renders in the logged-in sidebar): set
  `localStorage["personal-brain:theme"]="light"`, reloaded, confirmed
  `document.documentElement.dataset.theme === "light"`,
  `getComputedStyle(body).backgroundColor === "rgb(240, 243, 248)"`
  (exactly `#f0f3f8`), and both `--neon-cyan`/`--neon-pink` resolved to
  the correct light-mode hex values — persistence, the no-flash script,
  and the full CSS variable cascade all confirmed working together. Zero
  console errors in either theme, in a genuinely fresh tab.
- Not yet visually confirmed: the toggle switch's own click/slide
  animation, message entrance animations, and hover glows in the actual
  authenticated UI — requires the user's login session, requested from
  them directly.

**Current state:** Full scope of the original request implemented and
verified as far as possible without an authenticated session, plus two
real bugs found and fixed along the way (the hover-glow no-op and the
hydration mismatch) that weren't part of the original ask but directly
affect it.

---

## 2026-08-09 — Deadline extended to Aug 18; shipped #1 PDF extraction, #2 freshness callouts, #3 auto-sync-on-load

**Context:** Submission deadline extended from Aug 9 to **2026-08-18**
(user confirmed directly). Used the extra runway to research feature
ideas from comparable open-source "personal assistant over your data"
projects, proposed 8 candidates, and the user picked three to build now:
(1) PDF text extraction for Drive files, (2) data-freshness callouts in
answers, (3) auto-sync on server startup.

**#1 — PDF content extraction ([`drive.ts`](src/lib/google/drive.ts)).**
Real files like `Resume_2026_Feb.pdf` were previously only findable by
filename — PDFs hit the same "binary format, skip content" branch as
images/Slides/Sheets, so nothing inside them was ever searchable. Added
`unpdf` (chosen specifically because it's pdfjs-based but built to avoid
canvas/worker native deps that don't exist on Vercel's serverless
functions — a real constraint, not a hypothetical one, given the whole
architecture already routes around exactly this class of problem for
gbrain itself). New branch in `extractContent()`: fetch the file as
`arraybuffer`, `getDocumentProxy()` + `extractText({ mergePages: true })`.

**#2 — Freshness callouts + `SYSTEM_PROMPT` → `getSystemPrompt()`
([`config.ts`](src/lib/query/config.ts)).** The model previously had no
anchor for "today" at all, so it could never reason about staleness (a
March result would be presented with the same confidence as a same-day
one). Converting the prompt to a function computed per-call (rather than
a module-level constant computed once at import time) matters
specifically because of Vercel's warm-reuse behavior: a serverless
function instance can stay warm and serve many requests across real
calendar days without a fresh cold start, so a string built once with
`new Date()` at import time would silently freeze "today" at whatever
date the instance last cold-started, going stale for every request after
without erroring. Added an explicit "Freshness" rule instructing the
model to say so plainly when the most relevant result predates today by
a wide margin, rather than presenting old data as current. Updated both
call sites — [`route.ts`](src/app/api/chat/route.ts) and
[`run-evals.ts`](evals/run-evals.ts) — to call `getSystemPrompt()` so the
eval harness keeps exercising the exact prompt production uses.

**#3 — Auto-sync on load ([`Workspace.tsx`](src/app/chat/Workspace.tsx)).**
Literal "sync on server startup" isn't reachable in this architecture —
Next's server lifecycle has no authenticated user session at that point,
and ingestion needs one (it's local-only by design, see 2026-08-04
entry). Built the practical equivalent instead: a `useEffect` gated on
`ingestionEnabled` (same flag that hides the button entirely on Vercel)
fires `POST /api/ingest/sync` once per page load via a `useRef` guard,
silently, the moment an authenticated session mounts — so local-dev demo
data is fresh without a manual click first. The visible Re-sync button is
unchanged and still available for a manual re-sync with its own
success/failure UI.

**Verified:**
- `tsc --noEmit`, `eslint src evals`, `next build` all clean.
- `bun run evals/run-evals.ts` against live Render/Supabase/Gemini:
  **5/5 passed.** [`EVAL_LOG.md`](evals/EVAL_LOG.md) confirms the
  freshness rule is genuinely working, not just present in the prompt
  text: `tier1-drive-recency`'s answer explicitly reasons about "the week
  leading up to August 9, 2026" and correctly reports the most recent
  Drive activity it has is from May — proof `getSystemPrompt()` is
  injecting the real current date per-call, not a frozen one.
- Not yet covered by the eval suite (no case queries PDF-internal content
  specifically, only filenames/metadata) — flagged to the user to verify
  live: run a query whose answer only exists inside a PDF's actual text
  (e.g. a skill or detail from inside a resume PDF, not in its filename),
  and confirm auto-sync fires on page load (visible via `console.log
  ("Auto-sync on load:", ...)` in the browser devtools console) without
  clicking Re-sync.

**Current state:** All three features implemented, type/lint/build clean,
and the full eval suite passing live against production infra. PDF
content-extraction correctness specifically still needs one live
user-run query to confirm end-to-end, since it's the one piece the
automated eval suite doesn't exercise.

---

## 2026-08-09 — Live user testing found a real bug: auto-sync races against gbrain's own sync lock

**Context:** User verified all three features live. #1 (PDF extraction)
confirmed correct on the first try — a query about details only present
inside a resume PDF's body text answered correctly. #3 (auto-sync)
initially looked broken (zero `/api/ingest/sync` requests in the Network
tab), which turned out to be a red herring — the user was checking
before the effect had fired, not an actual failure. On a proper check
(Network tab open before reload) the auto-sync request appeared, but
failed with `500 Internal Server Error` / `{error: "Ingestion sync
failed"}`.

**Diagnosis:** The route's catch-all swallows the real error before
sending it to the browser (`console.error` server-side only, generic
message to the client — deliberate, not a bug, since exposing raw stack
traces to the client isn't good practice, but it meant I had to ask the
user to paste their `next dev` terminal output to see the real cause).
The actual error: `gbrain sync` failed with exit code 1 — `Another sync
is in progress (lock gbrain-sync:personal-brain held by pid 16704...)`.
Checked whether that pid was a stale/orphaned process before considering
`--break-lock` (`tasklist /FI "PID eq 16704"` — confirmed as a live
`bun.exe` process, i.e. a real sync genuinely still running, not a dead
lock). Root cause: auto-sync-on-load fires once per full page
mount/reload by design, but the user reloaded the page multiple times in
quick succession while checking DevTools — each reload is a fresh
`Workspace` mount, so each one fired its own sync attempt, and
ingest+embed of real Gmail/Drive content takes a few minutes, so later
reloads collided with an earlier sync still in flight. This is a genuine
interaction bug introduced by feature #3: the manual Re-sync button was
only ever clicked deliberately and rarely hit this lock in practice;
auto-firing on every page load makes the collision easy to trigger.

**Fix ([`gbrain-cli.ts`](src/lib/brain/gbrain-cli.ts)):** gbrain's lock
is a correct safety mechanism, not something to bypass — `syncBrain()`
now catches specifically the "Another sync is in progress" case from
gbrain's stderr and treats it as a benign no-op (returns a descriptive
string) instead of re-throwing, so the route responds 200 with a clear
"skipped, already running" message rather than a 500. Any other gbrain
failure still throws and surfaces as a real error, unchanged — this is a
targeted fix for the one specific race actually observed, not a blanket
swallow-all-errors change.

**Verified:** `tsc --noEmit`, `eslint src evals` clean. Not yet
re-verified live (requires the user to trigger a real overlapping sync,
or simply reload again after the in-flight sync from this testing
session finishes) — asked the user to retry.

**Current state:** Fix implemented and statically verified; awaiting one
more live confirmation from the user that a collided auto-sync now
degrades gracefully instead of surfacing as a 500.

---

## 2026-08-09 — Feature #4: draft-only Gmail replies

**Context:** Continuing the 8-feature list from the earlier deadline
extension, user asked to build #4 next: let the agent draft a reply to a
specific email when asked, without ever sending anything. This is the
first genuine write capability in the app — SPEC.md §2 previously scoped
the whole agent as read-only, so this needed an explicit, narrow,
documented exception rather than a silent scope change.

**Safety design, decided before writing code:** Google has no OAuth scope
that grants draft-creation without also technically permitting send —
`gmail.compose` covers both `drafts.create` and `drafts.send`/
`messages.send`. Rather than pretend the scope itself enforces
"draft-only," made it an application-code guarantee instead: grepped to
confirm `drafts.send`/`messages.send` are called nowhere in the codebase,
only `drafts.create`. Documented this plainly in both
[`auth.ts`](src/auth.ts) (scope comment) and SPEC.md §2, rather than
overclaiming what the OAuth grant restricts.

**Implementation:**
- [`auth.ts`](src/auth.ts) — added `gmail.compose` to the requested scope
  list, alongside the existing readonly Gmail/Drive scopes.
- [`gmail.ts`](src/lib/google/gmail.ts) — new `createDraftReply(accessToken,
  { threadId, body })`. Fetches the thread's most recent message (`format:
  "metadata"`, just the headers needed) to find who to reply to and build
  correct `In-Reply-To`/`References` headers from the original message's
  real RFC 2822 `Message-ID` header (NOT Gmail's API `id` — a different
  value; needed for Gmail to attach the draft to the existing thread
  instead of starting a new one) and a `Re:`-prefixed subject, then calls
  `drafts.create`.
- [`tools.ts`](src/lib/query/tools.ts) — `brainTools` (a static object)
  became `createBrainTools(accessToken?)` (a factory), because the new
  `draft_gmail_reply` tool needs the requesting user's own live OAuth
  token to write to their real Gmail — unlike the two search tools, which
  always go through the shared remote gbrain server with its own static
  token. Also added `extractGmailThreadId()`: the citation `url`
  search_gmail already returns
  (`https://mail.google.com/mail/u/0/#all/<threadId>`) carries the exact
  id `draft_gmail_reply` needs, so it's parsed server-side into a
  `threadId` field on gmail results — the model passes it straight
  through from a prior search_gmail call instead of parsing a URL itself.
- [`config.ts`](src/lib/query/config.ts) — new system prompt rule: only
  draft when explicitly asked (never proactively), always say plainly
  that a DRAFT was created (never "sent"), and hand back the `webLink` so
  the user reviews and sends it themselves.
- [`route.ts`](src/app/api/chat/route.ts) — `createBrainTools(session.accessToken)`.
- UI: [`Workspace.tsx`](src/app/chat/Workspace.tsx) tracks
  `tool-draft_gmail_reply` alongside the two search tools for the sidebar's
  live-activity indicator; [`Sidebar.tsx`](src/app/chat/Sidebar.tsx) gets a
  `DRAFTING_REPLY` label + `PenLine` icon entry.

**Deliberate design choice — kept the eval harness on a fixed read-only
tool set, not `createBrainTools()`.** With no accessToken,
`createBrainTools()` already omits the draft tool, but
[`run-evals.ts`](evals/run-evals.ts) now imports `searchGmailTool`/
`searchDriveTool` directly and builds its own two-tool object instead of
calling the factory at all — evals should never even carry the
possibility of creating a real Gmail draft as an automated side effect,
by construction, not just by incidentally lacking a token.

**Bug hit and fixed — type error from an optional key in the tools
object.** `createBrainTools()`'s conditional spread
(`...(accessToken ? {draft_gmail_reply: ...} : {})`) produces an object
type with `draft_gmail_reply` as an optional property. The `ai` SDK
infers `step.toolCalls` per-call-site as `Array<TypedToolCall<TOOLS>>`,
and `TypedToolCall`'s mapped type over an optional tool key resolves
`InferToolInput<TOOLS[NAME]>` in a way that leaks `undefined` into the
whole union, so `evals/run-evals.ts`'s existing `for (const call of
step.toolCalls ?? [])` failed with `'call' is possibly 'undefined'` even
though `toolCalls` itself isn't optional. Root-caused by reading the SDK's
own `.d.ts` (`StaticToolCall<TOOLS>` in `node_modules/ai/dist/index.d.ts`)
rather than guessing. Fixed at the actual source — switching evals to the
fixed two-tool object (see above) sidesteps the optional key entirely,
which was the right design anyway, not just a type-error workaround.

**Verified:**
- `tsc --noEmit`, `eslint src evals`, `next build` all clean.
- `bun run evals/run-evals.ts`: **5/5 still passing** after the
  `tools.ts` factory refactor — confirms no regression to the existing
  search/grounding behavior.
- Not yet verified live: actually creating a real Gmail draft through the
  chat UI. This needs the user to log out and back in first (existing
  sessions only have the two readonly scopes cached in their JWT — the
  new `gmail.compose` scope isn't retroactively granted) and, since the
  OAuth consent screen is in Testing mode, the user may need to add
  `gmail.compose` to the consent screen's configured scope list in Google
  Cloud Console before Google will grant it at all (same requirement the
  original readonly scopes had — see 2026-08-04 entries).

**Current state:** Feature implemented and statically verified end to
end; live confirmation pending the user's re-consent (new OAuth scope
requires logging out/in) and a real "draft a reply to X" test in the
chat UI.

---

## 2026-08-09 — Feature #4 verified live end-to-end

**Context:** User re-consented (logged out/in, granting the new
`gmail.compose` scope) and asked the agent to "draft a reply to Nirmit's
shortlist email saying I'll have the take-home submitted by Friday."

**First attempt correctly failed closed.** Before re-consenting, the
model found the right thread via search_gmail, attempted
`draft_gmail_reply`, hit a real Gmail API permission error (old cached
session token, readonly scopes only), and reported the failure honestly
to the user instead of pretending to succeed — exactly the grounding
behavior the system prompt requires elsewhere, holding up for a tool
error too.

**Second attempt succeeded — real draft, correctly threaded, nothing
sent.** After re-consent: model called search_gmail, found "SHORTLISTED
STUDENTS," called draft_gmail_reply, and reported back a created draft
with a review link. Verified directly in the real Gmail UI: the draft
appears threaded under the original conversation (visible inline, not a
disconnected new email) with the correct body text and a "Draft" label.

**One nuance checked and confirmed correct, not a bug:** the draft was
addressed to **Isha Sharma** (`23102097@mail.jiit.ac.in`), not Nirmit.
`createDraftReply` always replies to whoever sent the thread's most
recent message (see 2026-08-09 implementation entry above) — flagged
this to the user as worth double-checking before trusting the default.
User confirmed it's actually correct: "SHORTLISTED STUDENTS" was a mass
email genuinely *sent by* Isha Sharma to a large distribution list
(visible in the Gmail UI: "to Vivek, Vansh, Mudit, ... nirmit, cristian
...") — Nirmit was only a cc'd recipient, not the sender, so replying to
the real sender was the right behavior, not a misfire. No design change
needed.

**Current state:** Feature #4 fully implemented and confirmed working
live end-to-end — real Gmail draft created and correctly threaded,
failure mode (stale scope) degrades honestly instead of silently, and
the recipient-selection logic verified correct on a real multi-participant
thread. Ready to push.

---

## 2026-08-09 — Feature #5: Google Calendar connector (third data source)

**Context:** Next pick off the 8-feature list, using the Aug 18 deadline
extension: add Google Calendar as a third connector, read-only (unlike
#4's narrow write exception). Mirrors the existing Gmail/Drive connector
shape end to end: API client → normalize → gbrain page type → search
tool → system prompt → UI status/activity indicators → eval case.

**Design decision — which gbrain page type to use.** gbrain-base-v2 (the
schema pack this brain runs on) has no dedicated "calendar event" type,
same situation Drive hit on 2026-08-04 (worked around by reusing
`source`). Read the schema pack directly
(`gbrain-base-v2.yaml` in the cached install, via `C:\Users\lenovo\.bun\install\cache\...`)
rather than guess: it has an `event` type (`primitive: temporal`, path
prefix `life/events/`) — its own comment frames it as "Life Chronicle"
personal-timeline/diary events (#2390), not calendar meetings
specifically, but `primitive: temporal` and the literal name make it the
closest available fit, same reasoning as the Drive/`source` precedent.
Used it — [`markdown.ts`](src/lib/brain/markdown.ts)'s `TYPE_BY_SOURCE`
now writes calendar pages to `life/events/` with `type: event`.

**Design decision — ingestion window.** Gmail/Drive ingest "most recent N
items" (a count), which doesn't fit Calendar: a query like "what did I
have last week" needs past events, "what's my next meeting" needs future
ones, and neither is about recency-of-modification the way an email or
file is. [`calendar.ts`](src/lib/google/calendar.ts)'s `listEvents`
windows by time instead — 30 days back through 90 days forward —
`singleEvents: true` expands recurring events into individual instances
so each occurrence is independently searchable, and cancelled instances
are filtered out as ingestion noise.

**Implementation:**
- [`calendar.ts`](src/lib/google/calendar.ts) (new) — `listEvents`,
  mirroring gmail.ts/drive.ts's client shape.
- [`normalize.ts`](src/lib/brain/normalize.ts) — `calendarEventToBrainDocument`.
  Restates when/where/what directly into the page body (not just
  frontmatter) for the same reason participants are restated for Gmail
  (2026-08-04 entry): gbrain's search only ever returns indexed body
  text to callers, never frontmatter, so anything the model needs to see
  or the index needs to match on has to actually be visible body text.
  `timestamp` = the event's start time (when it happens), not
  created/modified time — the semantically correct anchor for a calendar
  item.
- [`types.ts`](src/lib/brain/types.ts) — `BrainDocument.source` gained
  `"calendar"`.
- [`gbrain-remote.ts`](src/lib/brain/gbrain-remote.ts) — `searchBrain`'s
  type filter gained `"event"`; added `searchCalendar`.
- [`tools.ts`](src/lib/query/tools.ts) — new `search_calendar` tool,
  same shape as the other two search tools (reuses `formatHits`
  unchanged — the gmail-only `threadId` extraction already no-ops safely
  for non-Gmail urls, confirmed no special-casing needed).
- [`auth.ts`](src/auth.ts) — added `calendar.readonly` scope (a third
  scope alongside the #4 addition of `gmail.compose` — existing sessions
  need to re-consent again to pick this one up too, and it will likely
  also need adding to the Google Cloud OAuth consent screen's scope list
  in Testing mode, same requirement the original Gmail/Drive scopes had).
- [`route.ts`](src/app/api/ingest/sync/route.ts) — fetches events
  alongside messages/files during sync; response gained `calendarCount`.
- [`config.ts`](src/lib/query/config.ts) — system prompt now names all
  three tools, widened the "some questions need more than one tool" rule
  to a three-way example (Calendar + Gmail), and added a freshness-rule
  carve-out: a past calendar event isn't "stale information" the way an
  old email/doc might be — it's just a completed event — so the
  freshness caveat shouldn't misfire on it the way it correctly does for
  Gmail/Drive.
- UI: [`Workspace.tsx`](src/app/chat/Workspace.tsx) tracks
  `tool-search_calendar` for the live-activity indicator;
  [`Sidebar.tsx`](src/app/chat/Sidebar.tsx) gets a `CALENDAR` status row
  and a `SEARCH_CALENDAR` / `CalendarDays` active-tool entry;
  [`SyncButton.tsx`](src/app/SyncButton.tsx) shows the calendar count
  alongside gmail/drive counts and relabels to "RE-SYNC ALL SOURCES."
- [`SPEC.md`](SPEC.md) §2 — documented as a deliberate scope addition
  (originally "two connectors," extended deadline funded a third),
  including the type-mapping rationale.
- [`evals/cases.ts`](evals/cases.ts) — new `tier1-calendar-not-found`
  case, deliberately implausible content (mirrors the existing
  Stripe/Priya not-found pattern) so it stays reliable without needing
  to know real calendar ground truth. Documented in-file why a deeper
  Tier2 calendar+Gmail/Drive case was deliberately NOT added: unlike the
  SkillLayer case (grounded in emails already quoted elsewhere in the
  file), there's no way to verify real calendar content from here.
  [`run-evals.ts`](evals/run-evals.ts) updated to include
  `search_calendar` in its tool set.

**Verified:**
- `tsc --noEmit`, `eslint src evals`, `next build` all clean.
- `bun run evals/run-evals.ts`: **6/6 passed** (5 existing + the new
  calendar case), no regressions.
- The calendar eval case only proves the tool is correctly wired end to
  end (search_calendar called, empty result correctly reported as not
  found) — it does NOT yet prove real calendar event content is
  searchable, since no calendar data has been ingested yet (requires a
  re-sync with the new `calendar.readonly` scope granted first). Flagged
  to the user as the next live check needed, same pattern as #1's PDF
  extraction needing a dedicated content-based query to confirm.

**Current state:** Calendar connector implemented and statically
verified end to end; live confirmation pending the user's re-consent
(new scope) and a re-sync, then a real calendar-content query.

---

## 2026-08-10 — Feature #5 verified live end-to-end (with a real setup gap found and fixed)

**Bug hit and fixed — Calendar API wasn't enabled on the Google Cloud
project.** First live sync attempt failed: `403 Request had insufficient
authentication scopes` (visible in the `next dev` terminal, same
diagnostic pattern as the earlier gbrain-lock bug — asked the user to
paste the real server-side error rather than guess from the generic
"Ingestion sync failed" message). Initially suspected a stale session
(same class of issue #4 hit), but the user had already re-consented. Real
root cause, found by checking Google Cloud Console together: unlike
Gmail/Drive (enabled back on 2026-08-03/04), the **Google Calendar API
itself was never enabled** for this Cloud project — a separate step from
both OAuth scope configuration and consent-screen setup, and one I
missed calling out when building this feature (only flagged the
scope/re-consent side, not API enablement). User also checked the OAuth
consent screen's configured Scopes list as a first troubleshooting step;
turned out to be a red herring — it only listed default
BigQuery/Cloud-Platform/devstorage scopes, not even Gmail/Drive/Compose
despite those already working, confirming that list isn't the actual
gate for a Testing-mode app's scope requests. Fixed by the user enabling
"Google Calendar API" in APIs & Services → Library, then reconnecting
again for a fresh token.

**Verified live end-to-end:** after the API was enabled, sync correctly
returned `1 event(s)` once the user added a real test event
("Project Submission Skill Layer," Aug 17 2026, 12:30-1:30 PM) to their
connected Google Calendar. First query attempt ("do I have anything on
my calendar about SkillLayer?") answered "not found" — turned out to be
a genuine race (the query landed before that particular sync round had
actually finished committing), not a search bug; re-asking the identical
question immediately after confirmed sync completion correctly found
and cited the event with date and time. Confirms the full pipeline:
Calendar API → normalize → gbrain `event` type → search_calendar → cited
answer, all working with real data.

**Current state:** Feature #5 fully implemented and confirmed working
live end-to-end. 5 of the 8 originally-listed bonus features are now
shipped and verified (#1 PDF extraction, #2 freshness callouts, #3
auto-sync, #4 draft-only Gmail replies, #5 Calendar connector).
Remaining: #6 preference memory, #7 graph-based cross-source linking,
#8 voice input — none started. Ready to push.

---

## 2026-08-10 — Feature #6: preference memory (with a real design pivot mid-build)

**Context:** Next pick off the list: let the agent remember facts/
preferences about the user across sessions (e.g. "remember that I prefer
concise answers"), and have them silently inform every future
conversation — not just something the model can search for on request.

**Investigated gbrain's own native fact-memory system first, before
building anything custom.** `tools/list` on the remote MCP server
surfaced `extract_facts` / `recall` / `forget_fact` — "v0.31: extract
personal-knowledge facts (events, preferences, commitments, beliefs)
from a conversation turn into the per-source hot memory," purpose-built
for exactly this. Read the actual source
(`src/core/operations.ts`/`facts/*.ts` in the cached install) rather than
guess at behavior from the tool description alone, since building UI/
prompt work on top of a misunderstood contract would be expensive to
unwind. Found and fixed a real blocker before even testing: `extract_facts`
calls an internal chat model (default `anthropic:claude-sonnet-4-6`,
`facts.extraction_model` config key) — but this project has deliberately
carried no Anthropic key anywhere, including on the Render-hosted gbrain
server, since the 2026-08-04 "drop Anthropic, Gemini-only" decision.
Traced `resolveModel`'s config precedence chain (`model-config.ts`) and
confirmed the Google chat path reads the exact same `GOOGLE_GENERATIVE_AI_API_KEY`
already configured on Render for embeddings — so
`gbrain config set facts.extraction_model google:gemini-flash-lite-latest`
(run once locally against the shared Supabase DB, no Render redeploy
needed, since facts extraction resolves config at request-time rather
than at the embedding-dimension bootstrap point that forced the
Render-env-var-specific fix on 2026-08-04) should cover it with zero new
credentials.

**Also found, before writing app code: remote callers can only ever
`recall` `visibility: "world"` facts** — `recall`'s handler hardcodes
`ctx.remote === false ? undefined : ['world']`, i.e. v0.31 ships
world-only for remote MCP callers, all-visibility for local CLI only.
Since every call this app makes (local dev AND Vercel) goes through the
remote HTTP MCP path, `extract_facts` would need to be called with
`visibility: "world"` explicitly every time, or saved facts would be
invisible to `recall` forever — a silent, easy-to-get-wrong trap if not
caught by reading the source first.

**Live-tested `extract_facts`/`recall` directly against the remote
server before building anything on top of them (same probe-before-build
discipline as the original raw-HTTP-MCP work on 2026-08-04) — and hit a
real dead end.** `extract_facts({turn_text: "The user prefers concise,
bullet-pointed answers...", visibility: "world"})` returned a clean
`{inserted: 0, duplicate: 0, superseded: 0, fact_ids: []}` — no error, no
`skipped` reason (which the kill-switch/dream-generated paths both
return explicitly when they short-circuit), just silently extracted
nothing. Given the system is built around an entity-graph/notability-
scored model (claims ABOUT a resolved entity, salience-weighted) rather
than plain first-person user-preference statements, and the failure mode
was completely opaque (a real LLM call happening inside gbrain's own
infra that I can't inspect or debug from here), continuing down this
path risked building a demo-critical feature on something I couldn't
reliably verify — a bad trade for a graded live demo.

**Decision: pivoted to gbrain's simpler `put_page`/`get_page` primitives
instead** — the same tools this project already uses for citation-link
enrichment (`getPageMeta` in gbrain-remote.ts), fully predictable and
directly inspectable (`gbrain get notes/user-preferences`). This is also
more architecturally consistent with a standing project decision (2026-08-03):
"we're using gbrain only for search (retrieval)... not gbrain's built-in
think/dream/agent commands" — reaching for `extract_facts`'s own internal
LLM-based interpretation would have quietly broken that boundary anyway.
Live-tested the actual round-trip before wiring up app code: `get_page`
on a nonexistent slug returns a normal (non-error) result shaped
`{error: "page_not_found", message, suggestion}` — NOT a thrown MCP
error, an important and non-obvious distinction — confirmed via a direct
probe, then `put_page` + `get_page` round-tripped a real bullet line
through `compiled_truth` correctly.

**Implementation:**
- [`gbrain-remote.ts`](src/lib/brain/gbrain-remote.ts) — one dedicated
  page (`notes/user-preferences`, gbrain's `note` type — the generic
  catch-all, closest fit) holds every saved preference as a dated bullet
  line. `getPreferences()` (read, strips the date prefix for prompt
  injection), `savePreference()` (append, with a cheap case-insensitive
  substring dedup check so asking to remember the same thing twice
  doesn't duplicate it), `forgetPreference()` (substring-match removal).
  Capped at the last 30 entries.
- [`tools.ts`](src/lib/query/tools.ts) — new `save_preference` /
  `forget_preference` tools, unconditionally in `createBrainTools()`
  (unlike `draft_gmail_reply`, these don't need the user's Google OAuth
  token at all — only the existing static `GBRAIN_REMOTE_TOKEN` already
  used for search). Deliberately kept OUT of the eval harness's fixed
  tool set (same precedent as `draft_gmail_reply`) so automated eval runs
  can never write real preference data into the shared production brain
  as a side effect.
- [`config.ts`](src/lib/query/config.ts) — `getSystemPrompt()` gained an
  optional `knownPreferences: string[]` parameter, injected as a
  always-present "Known preferences/facts about the user" block — not a
  tool the model has to remember to call, the same reasoning as why
  freshness/today's-date is injected rather than fetched. Added rules for
  when to call save/forget (explicit request only, never proactive from
  casual mentions — same guardrail pattern as `draft_gmail_reply`).
- [`route.ts`](src/app/api/chat/route.ts) — fetches `getPreferences()`
  fresh per-request before building the prompt (same warm-Vercel-instance
  reasoning as `today`'s date — a value fetched once and cached across
  warm reuses would go stale after any save/forget).
- UI: [`Workspace.tsx`](src/app/chat/Workspace.tsx) tracks the two new
  tool-part types; [`Sidebar.tsx`](src/app/chat/Sidebar.tsx) gets
  `SAVING_MEMORY`/`FORGETTING` active-tool entries (`BookMarked`/`Eraser`
  icons). No dedicated preferences-list UI panel — consistent with how
  every other feature in this app surfaces results through the model's
  own conversational reply plus the existing tool-activity indicator,
  not a bespoke new panel per feature.
- [`SPEC.md`](SPEC.md) §2 — documented as a scope addition, including
  why the native fact system was tried and set aside.

**Verified:**
- `tsc --noEmit`, `eslint src evals`, `next build` all clean.
- `bun run evals/run-evals.ts`: **6/6 passed**, no regressions (evals
  correctly never touch the new tools).
- Not yet verified live through the actual chat UI: a real "remember
  that..." round trip, confirming the saved preference actually shows up
  injected into a LATER, separate conversation turn (not just that the
  page write succeeds) — the whole point of this feature over a one-off
  in-context mention.

**Current state:** Feature #6 implemented and statically verified;
live confirmation pending — asked the user to test a save + a fresh
question that should reflect it, plus a forget.

---

## 2026-08-10 — Feature #6 verified live end-to-end

**Verified live:** user asked the agent to remember a job-targeting
preference ("mainly targeting AI/SDE roles at early-stage startups") —
`save_preference` fired, confirmed in the reply. Reloaded the page (a
genuinely separate session/conversation, not just scrolling up) and
asked "what do you know about my preferences?" — the agent correctly
listed BOTH the new preference and the earlier one saved during this
feature's own live testing ("prefers concise, bullet-pointed answers"),
proving the injection-into-system-prompt design actually works across
sessions, not just within a single chat's context window. This was the
one thing the eval suite structurally couldn't test (no persistent
session across eval cases) — confirms the core value of this feature
over a one-off in-context mention.

**Current state:** Feature #6 fully implemented and confirmed working
live end-to-end. 6 of the 8 originally-listed bonus features are now
shipped (#1-#6). Remaining: #7 graph-based cross-source linking, #8
voice input — neither started. Ready to push.

---

## 2026-08-10 — Feature #7: graph-based cross-source linking

**Context:** Last of the readily-scoped items on the 8-feature list
before #8 (voice input, a different kind of work entirely). The idea:
instead of the model only ever discovering cross-source connections by
guessing new search queries per source (today's Tier 2 mechanism), give
gbrain explicit graph edges between pages that are provably the same
real-world thread, so the model can follow a link directly instead of
re-searching blind.

**Investigated gbrain's actual graph tool surface before designing
anything** (`tools/list`: `add_link`/`get_links`/`get_backlinks`/
`traverse_graph`), then read `operations.ts` directly for exact
input/output contracts rather than guess — paid off immediately: the
schema pack's `link_types` (gbrain-base-v2.yaml) has no cross-source-
relationship-specific type, but `relates_to` (self-inverse, generic) is
a clean fit. Live-tested `add_link` + `traverse_graph` against two real
already-ingested pages (a SkillLayer Gmail thread + the take-home Drive
doc) before writing any app code — worked cleanly and predictably on the
first try, a welcome contrast to feature #6's `extract_facts` dead end.
That test link is now real production data (harmless — it's a
genuinely correct connection).

**Design — what signal to link on, and why deterministic.** Every
BrainDocument across all three sources already carries a `participants`
list (Gmail from/to/cc, Drive owners, Calendar organizer/attendees) —
two documents from DIFFERENT sources sharing a participant email are a
strong, deterministic signal they're part of the same real-world thread
(a job application, a specific person's correspondence). Deliberately
NOT LLM-judged (no "does the model think these are related" step) —
after feature #6's opaque-extraction detour, a plain participant-overlap
computation is fully predictable, inspectable, and needs no gbrain-side
LLM call at all.

**Safety valves against a degenerate graph:**
- The user's OWN email is excluded from matching — it's a participant on
  nearly everything, so without this every document would spuriously
  link to every other document via "shared participant: me."
- Participants shared by more than 6 documents are dropped entirely
  (mailing lists, frequent senders) — not a meaningful "these are the
  same thread" signal past that point.
- Only CROSS-source pairs link (Gmail↔Drive, Gmail↔Calendar,
  Drive↔Calendar) — same-source pairs sharing a participant (e.g. two
  unrelated emails from the same person) aren't the "cross-source"
  linking this feature is named for.
- Capped at 30 link-creation calls per sync, and the whole pass is
  skipped entirely when `commit.committed` is false (nothing changed
  since last sync) — auto-sync (feature #3) fires on every page load, so
  an uncapped or always-running linking pass would add real latency to
  what's supposed to be a quick, silent background check most of the time.

**Implementation:**
- [`gbrain-remote.ts`](src/lib/brain/gbrain-remote.ts) — `linkRelatedDocuments()`
  (ingestion-time, called from the sync route) and `findRelated()` (the
  model-facing read: one-hop `traverse_graph` in both directions, then
  `get_page` per linked slug for title/url/date — same enrichment
  pattern already used for citations).
- [`route.ts`](src/app/api/ingest/sync/route.ts) — runs linking after a
  successful sync with real changes, using `session.user?.email` to
  exclude the user's own address. Response gained `linksCreated`.
- [`tools.ts`](src/lib/query/tools.ts) — new `find_related` tool,
  unconditional in `createBrainTools()` (no Google OAuth token needed,
  same as the other read tools) but deliberately NOT added to the eval
  harness's fixed tool set — none of the existing eval queries need
  graph traversal, and adding a case that depends on a specific link
  existing would make the suite fragile against exactly what data has
  been ingested, unlike the keyword/not-found checks used everywhere else.
- [`config.ts`](src/lib/query/config.ts) — new rule: after a relevant
  search result, consider `find_related` on its slug before re-searching
  blind; explicitly notes an empty result is normal (no link exists yet),
  not an error, so the model doesn't treat an empty graph as a dead end.
- UI: [`SyncButton.tsx`](src/app/SyncButton.tsx) shows the link count
  created per sync; [`Workspace.tsx`](src/app/chat/Workspace.tsx) /
  [`Sidebar.tsx`](src/app/chat/Sidebar.tsx) track `find_related` as an
  active tool (`MAPPING_LINKS`, `Network` icon).
- [`SPEC.md`](SPEC.md) — not yet updated at time of this entry; will add
  once live-verified (matching the pattern for every feature so far).

**Verified:**
- `tsc --noEmit`, `eslint src evals`, `next build` all clean.
- `bun run evals/run-evals.ts`: **6/6 passed**, no regressions.
- Not yet verified live: a real sync that creates NEW links from genuine
  ingested data (the one link in production right now was created by my
  own manual test script, not the app's actual ingestion-time linking
  code path), and the model actually calling `find_related` mid-
  conversation and getting a useful result back.

**Current state:** Feature #7 implemented and statically verified;
live confirmation pending — asked the user to trigger a real re-sync and
try a cross-source question that should benefit from graph traversal.

---

## 2026-08-10 — Feature #7 read side verified live

**Verified live:** user asked "What else is connected to my SkillLayer
shortlist email?" — the agent correctly surfaced the linked take-home
Drive doc (`skilllayer_sde_I_takehome`) via the graph connection created
during this feature's own manual pre-testing, alongside other genuinely
relevant items from additional search calls. Confirms `find_related` +
the underlying `traverse_graph` call work correctly end-to-end through
the real chat UI, not just the raw probe script from earlier.

**Not yet verified:** the ingestion-time auto-linking code path itself
(`linkRelatedDocuments`, called from the sync route) — the one existing
production link was created by this feature's own manual test script
during development, not by a real sync run. This only fires when a sync
finds genuinely new content (`commit.committed`), which doesn't exist to
test against on demand right now. Left for natural verification the
next time the user has real new Gmail/Drive/Calendar content to sync —
documented honestly as a known gap rather than glossed over, consistent
with how other structurally-hard-to-test pieces (e.g. tier1-drive-recency's
date-coverage limitation) have been handled throughout this project.

**Current state:** Feature #7's read side is fully confirmed working
live; the write (auto-linking) side is implemented, statically verified,
and was proven correct via a manual pre-test of the exact same
add_link/traverse_graph primitives it calls, but not yet exercised by
the real ingestion code path on genuinely new data. Ready to push.

---

## 2026-08-10 — Feature #8: voice input (last of the 8-feature list)

**Context:** Last feature on the original list. Fundamentally different
scope from #1-#7 — pure browser API (Web Speech API), zero backend/
gbrain/OAuth involvement, no new env vars or credentials.

**Implementation:**
- [`useSpeechRecognition.ts`](src/app/chat/useSpeechRecognition.ts) (new
  hook) — wraps `SpeechRecognition`/`webkitSpeechRecognition` (Chrome/Edge
  ship it prefixed; Firefox doesn't support it at all as of this writing,
  hence the explicit `isSupported` check). `continuous: true` +
  `interimResults: true`; final transcript segments accumulate into a
  running base string, interim (not-yet-finalized) text is appended live
  on top for real-time feedback, so the input box updates as the user
  speaks rather than only after each pause.
- [`Chat.tsx`](src/app/chat/Chat.tsx) — mic button between the input and
  Send, only rendered when `speech.isSupported` (hide entirely rather
  than show a control that would silently do nothing on Firefox). Click
  starts/stops listening; transcribed text lands in the same input box
  the user can still edit before sending — deliberately NOT auto-send on
  final transcript, so a misheard word doesn't get sent unreviewed.
  Listening state shown via a pulsing stop-icon button (same animation
  language as the sidebar's existing "active tool" pulse) and the input
  placeholder swaps to "listening...". Errors (mic permission denied, no
  speech detected) surface as inline text under the input.

**Bug hit and fixed — same React purity lint class as earlier rounds.**
The natural first implementation computed `isSupported` via
`useEffect(() => setIsSupported(...), [])` — the standard-looking pattern
for "browser API existence can only be checked client-side, avoid an SSR/
hydration mismatch by deferring to an effect." This project's strict
React-Compiler-aligned lint config rejected it: "Calling setState()
directly within an effect can trigger cascading renders." Root cause of
why the naive fix (a lazy `useState(() => hasSpeechRecognition())`
initializer) isn't safe either: that computes differently on the server
(no `window`, always false) vs. the client's first render, which for a
value that directly gates whether a whole button renders would be a real
hydration mismatch, not just a lint nag. Fixed with the textbook-correct
primitive for exactly this problem — `useSyncExternalStore` with a
never-firing subscribe (browser support doesn't change over a page's
lifetime) and a `getServerSnapshot` that safely returns `false` for SSR.
This is what the hook is actually designed for (reading external,
non-React state safely across server/client) and sidesteps the lint rule
entirely rather than fighting it.

**Verified:**
- `tsc --noEmit`, `eslint src evals`, `next build` all clean.
- Not verified live: the mic button only renders inside the authenticated
  chat UI (behind Google OAuth), which — same limitation noted throughout
  this entire project — can't be completed by the agent itself, and real
  speech input obviously can't be produced by an automated tool anyway.
  Asked the user to test directly: click the mic, grant the browser's
  microphone permission prompt, speak, confirm the transcript lands in
  the input box and can still be edited before sending. Also flagged:
  Firefox won't show the button at all (unsupported), Chrome/Edge should.

**Current state:** Feature #8 implemented and statically verified; live
confirmation pending. This is the last of the original 8-feature list —
once verified, all 8 bonus features are shipped.

---

## 2026-08-10 — Feature #8 removed after live testing found an unresolvable environment issue

**Context:** User tested voice input live and consistently hit "No speech
detected" despite genuinely speaking. Worked through this in three rounds
rather than giving up after the first failure:

1. **Ruled out hardware/permissions.** Site-level mic permission confirmed
   "Allow," Windows input device confirmed correct (USB Audio Device,
   input level 100/100) — the basic setup was fine.
2. **Applied the standard code fix.** `continuous: true` mode has
   documented Chrome reliability issues (can fire `no-speech` prematurely
   even with working audio input); rewrote the hook to chain short
   single-utterance (`continuous: false`) recognitions via `onend`
   instead, the well-established workaround. Confirmed via the visible
   "listening..." state and ambient fan noise being picked up that audio
   genuinely was reaching the browser — still failed.
3. **Ruled out extensions.** Tested in an Incognito window (no
   extensions loaded) — still failed identically.

**Diagnosis, not fully confirmed:** with hardware, permissions, browser
extensions, and the known `continuous`-mode bug all ruled out, the
remaining explanation is something at the network/environment level
between this Chrome install and Google's cloud speech-recognition
backend (the Web Speech API sends audio there for transcription; if
that specific connection is blocked or degraded — firewall, VPN,
regional restriction — while general internet/Google connectivity works
fine, "no-speech" is a plausible symptom). Chrome's DevTools Network tab
showed nothing relevant, but this isn't conclusive either way — the API
is implemented at the browser/OS level and its network traffic often
doesn't appear as a page-visible fetch/XHR request, so an empty Network
tab doesn't distinguish "working normally" from "silently blocked."

**Decision: removed rather than shipped with an unresolved question
mark.** Confirming the actual root cause would need lower-level
diagnostics (raw Chrome network export, testing on a different network
entirely) — disproportionate effort for the lowest-priority item on an
8-feature bonus list, with a hard Aug 18 deadline and a demo video +
submission email still outstanding. Explicitly asked the user how to
proceed (document as a known limitation and keep the code / keep
debugging / remove entirely) rather than deciding unilaterally — user
chose removal: don't ship a feature whose actual live behavior is an
open question, even though the code itself was implemented correctly to
the Web Speech API spec and passed two independent debugging rounds.

**Reverted:** deleted `useSpeechRecognition.ts`, restored `Chat.tsx` to
its pre-feature state (no mic button, no speech wiring), removed the
SPEC.md §2 scope-addition bullet. Kept `d8d17d4` (the original "add
voice input" commit) in git history rather than resetting it away — even
though it was never pushed and could have been erased cleanly, an
honest add-then-remove pair in the log is more consistent with this
project's whole documentation ethos than making it look like the
attempt never happened.

**Current state:** Back to 7 of the original 8 features shipped and
verified (#1-#7). #8 (voice input) is the one item on the original list
that was attempted, debugged in good faith, and consciously not shipped
— worth being able to explain this exact reasoning if asked in the
submission or an interview: knowing when to stop debugging a low-value
bonus item and ship what's solid is itself a real engineering judgment
call, not a gap to hide.

---

## 2026-08-10 — UI feedback: toned down the glow and scanlines

**Context:** User feedback on the overall look: "too busy, tone down the
glow and scanlines." Two-part fix rather than a blanket strip-everything
pass, to keep the theme's identity while cutting the noise.

**1. Reduced the shared glow tokens** (`--glow-cyan`/`-pink`/`-yellow`,
[`globals.css`](src/app/globals.css), both dark and light themes) — from
a 3-layer shadow spreading out to 48px at up to 0.9 opacity down to a
2-layer shadow maxing out at 10px and 0.5 opacity. Since every
`glow-text-*`/`glow-border-*` utility and every inline glow across the
app reads from these tokens, this single change proportionally reduces
roughly 15 different usages (headers, buttons, badges, the theme
toggle) at once, without touching each file individually.

**2. Removed the single highest-frequency glow usage specifically** —
[`MessageBubble.tsx`](src/app/chat/MessageBubble.tsx)'s `strong`
markdown renderer applied `glow-text-pink` to EVERY bold term in EVERY
chat response unconditionally. Given the model's own answers commonly
use several bold terms per message (status labels, key names, dates),
this was almost certainly the single biggest contributor to "busy" in
actual use — far more than any static header, which only appears once
per screen. Dropped the glow, kept the bold pink color for emphasis.

**3. Toned down the scanline/grid background overlay** — `--grid-line`/
`--grid-line-thin`/`--radial-a`/`--radial-b` (the `body::before`
texture) roughly halved in both themes.

**Verified:** `tsc --noEmit`, `eslint src evals`, `next build` all
clean. Confirmed live against the user's own already-running dev server
(reused rather than starting a second one on port 3000, which is
pinned by `NEXTAUTH_URL` for the OAuth callback) — read the landing
page's computed `box-shadow` directly via injected JS rather than a
screenshot (the Browser pane wasn't compositing frames in this session):
confirmed the rendered shadow matches the new 2-layer/10px/0.5-opacity
values exactly, not the old 3-layer/48px/0.9 ones. A full visual
screenshot wasn't available this round; asked the user to eyeball their
already-Fast-Refreshed session directly.

**Current state:** Glow/scanline intensity reduced app-wide via shared
tokens plus the one clearly over-applied per-message case; visual
sign-off from the user still pending.

---

## 2026-08-10 — Full redesign: cyberpunk terminal → modern production UI

**Context:** The glow/scanline toning-down above wasn't enough — user
asked for a full shift away from the cyberpunk aesthetic entirely:
"make it look like a modern website rather than cyberpunk style, make
it for production use, make it look good with all the animation and
stuff." Given the scope (touches ~11 files, a real visual-system
redesign that would be expensive to redo if the direction were wrong),
used `EnterPlanMode` rather than iterating blind — confirmed the one
genuinely subjective call (primary accent color) via `AskUserQuestion`
before writing the plan: **indigo/violet**, confirmed over blue/amber/
teal alternatives.

**Direction:** Linear/Notion-AI-adjacent — restrained neutral surfaces
(`#0b0d12` dark / `#fafafa` light, not near-black/pure-white), a single
indigo accent (`#6366f1`-ish) instead of the old cyan/pink/yellow trio,
standard `border-radius` instead of `clip-path` cut corners, soft
`box-shadow` elevation instead of multi-layer neon glow, `Inter`
(`next/font/google`) instead of monospace-everywhere, sentence-case copy
instead of ALL_CAPS/underscore terminal labels ("SYSTEM_STATUS" →
"Connected sources", "RE-SYNC ALL SOURCES" → "Sync now"). Framer Motion
kept throughout but retuned toward "premium micro-interaction" — button
hover became a subtle lift (`translateY` + shadow) instead of scale-only,
the 5-bar terminal-EQ thinking indicator became 3 bouncing dots (the
standard chat-app "typing" pattern).

**Scope:** `globals.css` (full token rewrite — removed every
`--neon-*`/`--glow-*`/`--clip-corner*`/`body::before` scanline token,
added `--accent`/`--text-*`/`--border`/`--shadow-*`/`--radius-*`),
`layout.tsx` (font swap), and all 9 chat/UI components restyled to the
new tokens (`page.tsx`'s `LoginScreen`, `Sidebar.tsx`, `Chat.tsx`,
`MessageBubble.tsx`, `SourceChip.tsx`, `ThinkingIndicator.tsx`,
`SystemErrorBanner.tsx`, `ThemeToggle.tsx`, `SyncButton.tsx`) —
`ThemeProvider.tsx`'s theme mechanism itself needed zero changes, same
as the very first dark/light rollout (2026-08-04): every component
already read colors from tokens, never hardcoded hex.

**Bug hit and fixed (a real, self-inflicted one, not a code defect) —
`rm -rf .next && next build` broke the user's live dev server.** After
implementing all 11 files, ran the usual verification sequence
(`tsc`/`eslint`/clean build) and the user's already-running `npm run
dev` started 500ing. Root cause: the user's dev server was actively
running against `.next` as a live dev-mode cache; `rm -rf .next`
deleted it out from under that live process, and the subsequent `next
build` regenerated `.next` in PRODUCTION mode — an incompatible
structure for a running dev-mode server. This had been safe every prior
round of this session because either no dev server was running or it
happened to get restarted between rounds; this was the first time
verification ran against an actively-live, continuously-used dev
session. Fixed by asking the user to restart `npm run dev` (regenerates
a clean dev-mode cache) — and adjusted practice going forward: no `rm
-rf .next` while a dev server is confirmed live. (Learned the hard way,
twice — see the calendar-CRUD entry below: even a bare `next build`
without the `rm -rf` first still overwrites the same directory and can
cause the identical problem, so the real fix is skipping the full build
step entirely once a dev server is known to be live, relying on
`tsc`/`eslint` alone since neither touches `.next`.)

**Verified:**
- `tsc --noEmit`, `eslint src evals`, `next build` all clean (pre-dev-
  server-conflict).
- Grepped the whole `src` tree for every removed token/class name
  (`clip-corner`, `glow-*`, `neon-*`, `border-dim`, `text-dim`,
  `font-terminal`, `grid-line`, `radial-*`) — zero stale references,
  confirming the reskin didn't leave orphaned classes anywhere.
- Read computed styles directly via injected JS against the login page
  (the one screen reachable pre-auth) since the Browser pane wasn't
  compositing screenshots this session — confirmed the live page
  actually reflects the new tokens, not just that the source changed.
- User confirmed live (after the dev-server restart) that it "looks good."

**Current state:** Full redesign shipped and confirmed live. Same
standing limitation as ever: the authenticated chat UI itself could
only be spot-checked via computed styles and the user's own eyes, not a
full agent screenshot, since it's behind Google OAuth.

---

## 2026-08-10 — Calendar CRUD: create, update, delete events from chat

**Context:** User asked to round out the Calendar connector (feature
#5, read-only since 2026-08-09) into a real two-way integration —
create, update, delete events directly from a chat request, "so it can
look good," i.e. feel like a complete feature rather than search-only.
Explicitly flagged by the user as real scope ("I know it too much of
work but I want to add this"). Used `EnterPlanMode` again given the
multi-file scope, and confirmed one safety-relevant design choice via
`AskUserQuestion` before planning: whether these tools should support
inviting other people (attendees) — user chose **no attendees,
personal events only**, matching the same caution already applied to
Gmail (drafts never auto-sent) — these tools can never email a real
third party.

**OAuth scope:** replaced `calendar.readonly` with
`https://www.googleapis.com/auth/calendar.events` ("View and edit
events on all your calendars") rather than requesting both — this app
only ever touches `calendarId: "primary"` events, never calendar
list/settings, so `calendar.events` alone is the narrowest scope
covering create+update+delete+read for events, same "narrowest
available" reasoning already used for `gmail.compose` (2026-08-09).
Same consequence as every prior scope change: existing sessions need to
re-consent, and the scope likely needs adding to the Google Cloud OAuth
consent screen's configured list first.

**Exposing the real Google eventId — a genuine design problem, not just
plumbing.** Update/delete need the live Calendar API's actual event id.
Unlike Gmail's `threadId` (extractable straight from the citation URL),
Calendar's `htmlLink` embeds a different base64 composite, not the raw
id. Fixed by extending `getPageMeta` in
[`gbrain-remote.ts`](src/lib/brain/gbrain-remote.ts) to also read
`frontmatter.source_id` (already stored as `calendar:<eventId>` by
`normalize.ts` since the connector was first built) and strip the
prefix — exposed as an `eventId` field on `search_calendar` results,
same `MAX_URL_LOOKUPS`-capped top-3 pattern already governing url/date
enrichment (an already-documented, accepted latency trade-off, not a
new one).

**Implementation:**
- [`calendar.ts`](src/lib/google/calendar.ts) — `createEvent`
  (`events.insert`), `updateEvent` (`events.patch` — partial update,
  only supplied fields change), `deleteEvent` (`events.delete`). No
  `attendees` field anywhere in the write path, by design.
- [`auth.ts`](src/auth.ts) — scope swap, documented inline.
- [`gbrain-remote.ts`](src/lib/brain/gbrain-remote.ts) — `eventId`
  enrichment described above.
- [`tools.ts`](src/lib/query/tools.ts) — three new tools
  (`create_calendar_event`/`update_calendar_event`/
  `delete_calendar_event`), modeled directly on `draft_gmail_reply`'s
  shape: need the user's live OAuth token, factory-gated in
  `createBrainTools`, excluded from the eval harness's fixed tool set
  (same precedent as every other write tool this session — automated
  evals must never mutate real Google data). `update`/`delete` require
  an `eventId`, not fuzzy title-matching, specifically to reduce the
  chance of silently acting on the wrong event.
- [`config.ts`](src/lib/query/config.ts) — new rules mirroring
  `draft_gmail_reply`'s guardrails: explicit-request-only, never
  proactive, confirm what changed plainly, and — specifically for
  delete — ask for clarification rather than guess when the target
  event is ambiguous, since deletion isn't easily undone.
- UI: [`Workspace.tsx`](src/app/chat/Workspace.tsx)/
  [`Sidebar.tsx`](src/app/chat/Sidebar.tsx) get three tool-activity
  entries ("Creating event"/"Updating event"/"Deleting event",
  `CalendarPlus`/`CalendarCog`/`CalendarX` icons) styled with the new
  modern-theme tokens from the redesign above, not the old cyberpunk ones.

**Verified:**
- `tsc --noEmit`, `eslint src evals` clean.
- `next build` — ran once more without first deleting `.next`, on the
  (correct) theory from the redesign entry above that the `rm -rf` wasn't
  the actual problem. It wasn't, but the plain `next build` alone was:
  it still overwrites the same directory in production mode, so this
  most likely broke the user's live dev server again the same way.
  Flagged directly rather than assuming it was fine — real fix going
  forward is skipping the full build step entirely once a dev server is
  known to be live (`tsc`/`eslint` alone are safe; neither touches
  `.next`).
- `bun run evals/run-evals.ts`: **6/6 passed**, no regression, and
  confirms the three new write tools are correctly excluded from the
  harness (same as `draft_gmail_reply`/`save_preference`/
  `forget_preference` before them).
- Not yet verified live: an actual create/update/delete round-trip
  against the user's real calendar. Needs re-consent (new scope) first,
  same standing pattern as every OAuth-scope change this session.

**Current state:** Calendar CRUD implemented and statically verified;
live confirmation pending — will need the user to re-consent, then test
create → update → delete against their real calendar.

---

## 2026-08-10 — Gemini/ChatGPT-style landing page + full interactive `/calendar` module

**Context:** User asked for a large two-part UI expansion, delivered as
a formal spec-style request: (1) a Gemini/ChatGPT-style empty-chat
landing state (hero greeting, animated suggestion pills, input bar that
animates from centered to bottom-pinned on first send), and (2) turning
the Calendar sidebar item into a real interactive module — a hover
preview card plus a full `/calendar` page with a month/week grid,
click-to-create, click-to-edit, delete-with-confirm, and drag-and-drop
rescheduling.

**Two things flagged before starting, not silently actioned.** The
request's "Version Control Update" section asked to gitignore
JOURNAL.md/SPEC.md going forward — this directly contradicts the
explicit decision made earlier in the project (2026-08-04: user asked
to hide them as "AI meta-files," was told this costs rubric points
since the assignment names SDD spec + harness-engineering evidence as
judged criteria, agreed to keep both tracked). Rather than silently
comply with an instruction that reverses a considered prior decision
and could cost real rubric points, asked directly via `AskUserQuestion`
— confirmed: **keep them tracked**, the gitignore line was boilerplate,
not a deliberate reversal. Also flagged the sheer size of the ask (a
full drag-and-drop calendar grid, a few days before the Aug 18 deadline,
with the demo video/submission still not started) and asked how to
scope it — user chose **full spec as written**, no trimming.

**Used `EnterPlanMode`** given the scope (11+ new/changed files, two
genuinely separate feature areas) — wrote a full design plan, disclosed
one deliberate implementation call before building rather than
deciding it silently: "weekly calendar grid" is implemented as a
7-day agenda-column view (each column lists that day's events by time),
not an hourly time-grid with minute-precision event positioning. A true
hourly week grid is substantially more work (vertical positioning by
time, overlapping-event layout) for comparatively low value against the
time available — flagged explicitly so it can be corrected if it's not
what was meant.

**Implementation:**
- [`calendar.ts`](src/lib/google/calendar.ts) — `listEvents` now takes
  an optional `{timeMin, timeMax, maxResults}` (defaulting to the
  existing -30/+90-day ingestion window when omitted), so the new
  summary/range routes and ingestion share one function instead of
  three copies of the same Calendar API call.
- Three new session-gated API routes mirroring the existing
  `/api/chat`/`/api/ingest/sync` auth pattern:
  [`/api/calendar/summary`](src/app/api/calendar/summary/route.ts) (GET,
  powers the hover card), [`/api/calendar/events`](src/app/api/calendar/events/route.ts)
  (GET range / POST create), [`/api/calendar/events/[eventId]`](src/app/api/calendar/events/%5BeventId%5D/route.ts)
  (PATCH / DELETE). All three mutating ones call the SAME
  `createEvent`/`updateEvent`/`deleteEvent` already built for the chat
  tools (2026-08-10, Calendar CRUD entry above) — one implementation,
  two callers, so the page and the chat agent are never touching the
  calendar through different code paths.
- [`trigger-resync.ts`](src/lib/brain/trigger-resync.ts) (new, small
  shared helper) — every mutating calendar route fires the same
  fire-and-forget re-sync pattern Workspace.tsx's auto-sync already
  uses client-side, just triggered server-side here since the mutation
  itself is a server route. This is what makes "the chat agent can find
  a change made on the page" actually true promptly, not just after an
  unrelated future sync — the concrete mechanism behind the "sync
  seamlessly" part of the request. Same accepted local-dev-only
  limitation as every other ingestion-touching feature.
- [`EmptyState.tsx`](src/app/chat/EmptyState.tsx) (new) — hero greeting
  (first name from `session.user?.name`, threaded through
  `page.tsx`→`Workspace.tsx`→`Chat.tsx`, previously unused) + 4
  suggestion pills with a staggered fade+rise entrance. "Cycling"
  interpreted as a smooth staggered reveal on mount rather than a
  live-rotating carousel — the latter trades reliability for marginal
  novelty and isn't actually how the real Gemini/ChatGPT empty states
  work (they show a fixed set, not literally rotating content).
- [`Chat.tsx`](src/app/chat/Chat.tsx) — swaps in `EmptyState` when
  `messages.length === 0`; the input `<motion.form>` gets Framer
  Motion's `layout` prop so its position (centered while empty, bottom-
  pinned once the transcript panel takes over via the parent's
  `justify-center`/default flex change) animates smoothly instead of
  snapping.
- [`CalendarHoverCard.tsx`](src/app/components/CalendarHoverCard.tsx)
  (new) — Framer Motion popover, fetches `/api/calendar/summary` on
  mount (parent only mounts it while hovering, so no separate
  visibility prop needed to gate the fetch).
- [`Sidebar.tsx`](src/app/chat/Sidebar.tsx) — Calendar's `StatusRow`
  wrapped in a `next/link` to `/calendar` plus hover handlers rendering
  the card — the only one of the three connected-source rows with this
  behavior, matching the original ask (Gmail/Drive stay plain).
- [`/calendar/page.tsx`](src/app/calendar/page.tsx) (new, server
  component) — same `auth()`-redirect pattern as the root page.
- [`CalendarBoard.tsx`](src/app/calendar/CalendarBoard.tsx) (new,
  client, the largest new piece) — month/week navigation, a hand-rolled
  6×7 day-cell grid (plain date math, no new dependency), week-view
  agenda columns, and drag-and-drop: event chips are `motion.div drag`
  (Framer Motion, already a dependency — deliberately not a new DnD
  library, consistent with the rest of the app and the "liquid-smooth
  Framer Motion" ask), `onDragEnd` hit-tests the pointer against a
  `Map` of day-cell `getBoundingClientRect()`s built via ref callbacks,
  computes the day delta, and calls the PATCH route shifting
  start/end by that many days (time-of-day preserved) — the same
  simplified "drag = move to a different day" semantics Google
  Calendar's own month view uses. Drag is intentionally month-view-only
  (the week view is an agenda list, not a spatial grid — dragging there
  has no unambiguous target).
- [`EventModal.tsx`](src/app/calendar/EventModal.tsx) (new) — one
  modal, three modes (create/view/edit) via local state, delete as a
  second-click inline confirmation ("Delete this event?" → "Yes,
  delete") rather than a new dialog primitive — consistent with how the
  rest of this app has never introduced a separate confirmation
  component. Converts between `datetime-local` input values (no
  timezone, browser means local wall-clock time) and the API's required
  ISO-with-timezone strings via plain `Date` construction/`toISOString()`
  — no date library needed.

**Bug hit and fixed — same React-purity lint class as `useSpeechRecognition`
earlier this session, in a new shape.** `CalendarBoard`'s first
`fetchEvents` implementation was `async () => { setLoading(true); ...
await fetch...; setEvents(...); }`, called via `void fetchEvents()`
inside a `useEffect`. Lint flagged it exactly like before: "Calling
setState() directly within an effect." Root cause understood precisely
this time before fixing (not just pattern-matched): a JS async
function's statements before its first `await` run SYNCHRONOUSLY the
moment the function is invoked — so `setLoading(true)`, sitting before
`await fetch(...)`, genuinely does execute synchronously within the
effect's call stack, same as a bare `setState(...)` written directly in
the effect body would. `CalendarHoverCard.tsx`'s fetch (written earlier
in this same round) never hit this because it was already `.then()`-
chained rather than async/await — confirmed by checking why THAT one
passed lint clean on the first try while this one didn't, not just
copying a fix blindly. Rewrote `fetchEvents` as a plain (non-async)
function whose only synchronous statement is the `fetch()` call itself;
every `setState` now lives inside a later `.then()` callback, which
runs asynchronously relative to the effect's own execution and doesn't
trip the rule. Also dropped an unused `ingestionEnabled` prop threaded
into `CalendarBoard` by an early draft of the plan — the real gating
lives server-side in `trigger-resync.ts`, so the client component never
needed it at all.

**Verified:**
- `tsc --noEmit`, `eslint src evals` both clean (no `next build` — the
  dev-server `.next` cache lesson from the last two rounds).
- `bun run evals/run-evals.ts`: **6/6 passed**, no regression — none of
  this touches the chat tool surface.
- Not yet verified live: both pieces are behind Google OAuth, the same
  standing limitation as every authenticated screen this whole session.
  Asked the user to check the empty-state hero/pills on the main chat
  page, and to exercise the full `/calendar` CRUD + drag-and-drop flow
  directly, including confirming the chat agent can find an event
  created/edited on the page afterward (the real test of whether the
  fire-and-forget re-sync actually keeps the two paths in sync).

**Current state:** Both pieces implemented and statically verified;
live confirmation pending for all of it — the empty state, the hover
card, and the full calendar page's CRUD + drag-and-drop.

---

## 2026-08-10 — Final UI polish: theme transition, page transitions, external source links

**Context:** Three smaller, well-specified tweaks to close out the UI
work: a more premium theme-toggle animation, animated route transitions
between chat and `/calendar`, and making the Gmail/Drive sidebar rows
open the real Gmail/Drive apps in a new tab. Well-specified enough
(clear single approach per item, few files) that this round skipped
`EnterPlanMode` and went straight to implementation, unlike the last
two larger rounds.

**Flagged, not silently actioned, again:** the request's "Version
Control Update" section again asked to gitignore JOURNAL.md/SPEC.md —
the same line from the previous round, already explicitly resolved
there (user confirmed: keep tracked, it's boilerplate). Noted this
briefly rather than either complying or re-running a full
`AskUserQuestion` cycle a second time for something already decided.

**Implementation:**
- [`ThemeTransitionOverlay.tsx`](src/app/ThemeTransitionOverlay.tsx)
  (new) — a fixed, full-screen, `pointer-events-none` overlay: a
  radial purple/indigo-tinted gradient fades in behind a centered
  lucide-react `Brain` icon (no brand logo asset exists in this
  project, so the existing thematically-apt icon stands in rather than
  inventing a new asset) that scales in with a slight overshoot easing.
  Purely decorative — the actual color change was already a smooth CSS
  transition on every custom property since the very first dark/light
  rollout (2026-08-04's `*, *::before, *::after { transition:
  background-color... }` rule); this bridges that transition with a
  deliberate flourish rather than being what makes the colors change.
- [`ThemeProvider.tsx`](src/app/ThemeProvider.tsx) — `toggleTheme` now
  also flips a `isTransitioning` state (with a ref-tracked timeout so
  rapid re-toggles reset cleanly instead of stacking), rendered via
  `AnimatePresence` as a sibling to `children` so the overlay covers
  the full viewport regardless of where the toggle button sits in the
  tree. All of this lives in a real click handler, not an effect — no
  "setState in effect" lint concern here, unlike the last two rounds'
  fixes.
- [`PageTransition.tsx`](src/app/PageTransition.tsx) (new) — wraps
  `{children}` in `layout.tsx`, keyed by `usePathname()` so
  `AnimatePresence` treats each route as a distinct element to
  cross-fade between (fade + 8px slide, `mode="wait"`) — the standard
  pattern for route transitions in the App Router, since Next's own
  navigation swaps `children` outright with no animation of its own.
- [`Sidebar.tsx`](src/app/chat/Sidebar.tsx) — new
  `ExternalStatusLink` wraps the Gmail/Drive `StatusRow`s in plain
  `<a href="https://mail.google.com"/"https://drive.google.com"
  target="_blank" rel="noopener noreferrer">` (a real `<a>`, not
  `next/link`, since these are external URLs — `next/link` is for
  internal routing). `rel="noopener noreferrer"` isn't just following
  the request literally — it's the correct security practice for any
  new-tab external link (stops the opened tab from reaching back via
  `window.opener`), already how this project treats every other
  external link (citation URLs, the Calendar hover card's "Open in
  Google Calendar"). Calendar's row is unchanged (still the one
  internal `next/link` + hover-card row).

**Verified:**
- `tsc --noEmit`, `eslint src evals` clean (confirms `Brain` exists in
  lucide-react's icon set as a side effect — no separate check needed).
- `bun run evals/run-evals.ts`: **6/6 passed**, no regression — none of
  this touches the chat tool surface.
- Not yet verified live: the overlay's actual animation feel, the
  route-transition smoothness, and that the Gmail/Drive links open the
  right destinations — all need the user's own browser, same standing
  limitation as every visual feature this session.

**Current state:** All three tweaks implemented and statically
verified; live confirmation pending.
