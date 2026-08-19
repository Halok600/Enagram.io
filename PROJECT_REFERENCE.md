# COMPLETE PROJECT REFERENCE FOR AI AGENTS

This file is meant to be pasted into another AI's context (or read by an
agent) so it can accurately answer questions about this codebase WITHOUT
re-reading every file. It was produced by directly reading every backend
file and every meaningfully-sized frontend file in the repository on
2026-08-16, at git commit `408a9a5`. It is a factual snapshot, not a design
proposal — everything described below exists in the code as stated, with
exact file paths and line references so any claim can be re-verified. If
the repo has moved past this commit, line numbers may have drifted — verify
against current `git log` before trusting an exact line number for anything
load-bearing.

---

## 1. What this project is

**Enagram.io** — a conversational AI agent (Next.js web app) that answers
natural-language questions by retrieving and reasoning across the user's own
Gmail, Google Drive, and Google Calendar in a single grounded answer. Built
for a take-home assignment (SkillLayer SDE I) following spec-driven
development — `SPEC.md` (repo root) was commit #1, before any application
code. `JOURNAL.md` (repo root) is a dated build log covering every
architectural decision, feature, and bug from project kickoff (2026-08-03)
to present.

Single-tenant by design: one Google account, one shared "brain" (search
index). No multi-user auth, no per-user data isolation.

---

## 2. Architecture — three separately-hosted systems

```
 Browser
    │
    ▼
 Next.js app (Vercel, serverless)  ──OAuth──▶  Google APIs (Gmail/Drive/Calendar)
    │
    │  HTTP (JSON-RPC over a protocol called MCP)
    ▼
 gbrain server (Render, always-on)  ────────▶  Supabase (Postgres + pgvector)
```

- **The Next.js app** (this repo) is deployed on Vercel. Vercel's functions
  are stateless serverless — no persistent filesystem, no installed
  binaries beyond the deployed JS/TS bundle, hard request-duration ceiling
  (60s on the Hobby/free plan — see `src/app/api/chat/route.ts:20`).
- **gbrain** (https://github.com/garrytan/gbrain) is a separate open-source
  CLI + MCP (Model Context Protocol) server. It is NOT an npm library
  imported into this app — it runs as its own long-lived process, hosted
  separately on Render, backed by a Supabase Postgres database (with the
  `pgvector` extension) for hybrid vector+keyword search and storage.
- **Reasoning/synthesis happens in THIS app's own code**, not inside
  gbrain's own built-in "think"/"agent" LLM features — the app calls Google
  Gemini directly via the Vercel AI SDK (`@ai-sdk/google`), using gbrain
  purely for retrieval (search) and simple page storage (`put_page`/
  `get_page`, used for preferences and cross-source links).

**Two structurally different data paths, not one:**
- **Search/query** (`src/lib/brain/gbrain-remote.ts`) — a plain HTTP call
  to gbrain's remote server. Works identically from local dev and the
  deployed Vercel site, since it's just an HTTP request either way.
- **Ingestion/write** (`src/lib/brain/gbrain-cli.ts`, `src/lib/brain/write.ts`,
  `src/app/api/ingest/sync/route.ts`) — writes markdown files to a LOCAL
  git-tracked folder (`brain/`, gitignored) and shells out to a
  locally-installed `gbrain.exe` CLI binary. This is **local-dev-only** —
  it does not and cannot run on Vercel (see §9 for why, and for a note on
  an abandoned attempt to make this remote too).

---

## 3. Tech stack (exact versions, from `package.json`)

| Package | Version | Role |
|---|---|---|
| `next` | 16.2.12 | App framework (App Router) |
| `react` / `react-dom` | 19.2.4 | UI library |
| `typescript` | ^5 | Type checking |
| `next-auth` | ^5.0.0-beta.32 | OAuth/session (Auth.js v5) |
| `ai` | ^7.0.48 | Vercel AI SDK — `streamText`, `generateText`, `tool()` |
| `@ai-sdk/google` | ^4.0.31 | Gemini provider for the AI SDK |
| `@ai-sdk/react` | ^4.0.53 | `useChat` hook (separate package from `ai` in this SDK version) |
| `googleapis` | ^174.0.0 | Official Google API client (Gmail/Drive/Calendar) |
| `zod` | ^4.4.3 | Schema validation, used for every AI SDK tool's `inputSchema` |
| `framer-motion` | ^13.0.0 | Animation |
| `react-markdown` | ^10.1.0 | Renders the AI's markdown-formatted answers |
| `unpdf` | ^1.8.0 | PDF text extraction (pdfjs-based, no canvas/worker dep — Vercel-compatible) |
| `yaml` | ^2.9.0 | Frontmatter serialization for gbrain pages |
| `lucide-react` | ^1.28.0 | Icons |
| `tailwindcss` | ^4 | Styling |

Scripts (`package.json:5-11`): `dev`, `build`, `start`, `lint`, and
`eval` → `bun run evals/run-evals.ts`.

---

## 4. Environment variables (names only; values are secrets, not in repo)

From `.env.local` (gitignored):

| Variable | Used by | Purpose |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `src/auth.ts` | Google OAuth client credentials |
| `NEXTAUTH_URL` | NextAuth internals | Base URL for the OAuth callback |
| `NEXTAUTH_SECRET` | NextAuth internals | Session/JWT encryption |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `@ai-sdk/google` (implicit) | Gemini API key — also used by gbrain itself for embeddings (set on Render, not here) |
| `GBRAIN_REMOTE_URL` | `src/lib/brain/gbrain-remote.ts:25` (`requireEnv`) | The gbrain server's MCP HTTP endpoint URL |
| `GBRAIN_REMOTE_TOKEN` | `src/lib/brain/gbrain-remote.ts:26` | Bearer token for the gbrain server |

Also read directly via `process.env` elsewhere:
- `process.env.VERCEL` — auto-set by Vercel (always `"1"` there, never set
  locally) — the gate used to disable ingestion-related UI/routes on the
  deployed site. Checked in `src/app/page.tsx:15`,
  `src/app/api/ingest/sync/route.ts:22`,
  `src/app/api/calendar/events/route.ts:50`,
  `src/app/api/calendar/events/[eventId]/route.ts:27,46`.
- `GBRAIN_BIN_PATH` (optional override) — `src/lib/brain/gbrain-cli.ts:33`,
  path to the local `gbrain.exe` binary if not at the default
  `~/.bun/bin/gbrain.exe`.

---

## 5. Directory tree with one-line purpose per file

```
src/
├── auth.ts                                    OAuth config + token refresh
├── types/next-auth.d.ts                       TS module augmentation for session.accessToken etc.
├── actions.ts                                 Server action: disconnect() = signOut()
├── lib/
│   ├── auth-guard.ts                          Shared requireSession() check, used by every API route
│   ├── calendar-date.ts                       Date-only ("YYYY-MM-DD") parsing/shifting helpers
│   ├── google/
│   │   ├── gmail.ts                           Gmail API client: search, list, extract text, create draft reply
│   │   ├── drive.ts                           Drive API client: search, list, extract text (incl. PDF)
│   │   ├── calendar.ts                        Calendar API client: list/create/update/delete events
│   │   └── friendly-error.ts                  Maps Google API 403s to an actionable message
│   ├── brain/
│   │   ├── types.ts                           BrainDocument — the common shape all 3 sources normalize to
│   │   ├── normalize.ts                       Gmail/Drive/Calendar raw data → BrainDocument
│   │   ├── markdown.ts                        BrainDocument → gbrain's markdown+frontmatter page format
│   │   ├── write.ts                           Writes markdown pages to the local brain/ folder (ingestion, local-only)
│   │   ├── gbrain-cli.ts                      Shells out to local git + gbrain.exe (ingestion, local-only)
│   │   ├── gbrain-remote.ts                   HTTP/MCP client for gbrain's remote server (search, preferences, links)
│   │   └── trigger-resync.ts                  Fire-and-forget re-sync trigger after a calendar mutation
│   └── query/
│       ├── config.ts                          getSystemPrompt() — the AI's rules
│       └── tools.ts                           Every AI SDK tool definition (search, calendar CRUD, drafts, memory)
└── app/
    ├── layout.tsx                             Root layout, fonts, theme no-flash script
    ├── page.tsx                               Home route — login screen or <Workspace>
    ├── globals.css                            Design tokens (CSS custom properties), Tailwind v4 @theme
    ├── ThemeProvider.tsx                       Theme context (dark/light), localStorage persistence
    ├── ThemeTransitionOverlay.tsx              Cosmetic overlay shown briefly on theme toggle
    ├── PageTransition.tsx                      Route-change fade wrapper
    ├── SyncButton.tsx                          Manual "Sync now" button (local-dev-only UI)
    ├── actions.ts                              (see above)
    ├── api/
    │   ├── auth/[...nextauth]/route.ts         NextAuth handler (GET/POST)
    │   ├── chat/route.ts                       Main chat endpoint — calls Gemini with tools
    │   ├── ingest/
    │   │   ├── sync/route.ts                   "Sync now" endpoint (local-only, 501s on Vercel)
    │   │   ├── gmail/route.ts                  Gmail search preview endpoint (unrelated to ingestion pipeline)
    │   │   └── drive/route.ts                  Drive search preview endpoint (unrelated to ingestion pipeline)
    │   └── calendar/
    │       ├── summary/route.ts                Live calendar summary for the sidebar hover card
    │       ├── events/route.ts                 GET (list) / POST (create) for the /calendar page
    │       └── events/[eventId]/route.ts       PATCH (update) / DELETE for the /calendar page
    ├── chat/
    │   ├── Workspace.tsx                       Owns useChat() state, auto-sync effect, top-level layout
    │   ├── Sidebar.tsx                         Connected-sources list, active-tool indicator, sync/disconnect
    │   ├── Chat.tsx                             Message list + input box
    │   ├── EmptyState.tsx                      Hero greeting + suggestion pills (shown when no messages yet)
    │   ├── HeroLogo.tsx                         Theme-aware crossfading logo (bat/brain)
    │   ├── ThemeToggle.tsx                      Dark/light switch UI
    │   ├── MessageBubble.tsx                    One chat message (markdown-rendered, avatar, sources)
    │   ├── SourceChip.tsx                       One clickable citation chip
    │   ├── SystemErrorBanner.tsx                Error banner with Retry button
    │   ├── ThinkingIndicator.tsx                Animated "..." shown while a response streams
    │   └── extractSources.ts                    Dedupes/filters tool results into citation chips
    ├── components/
    │   └── CalendarHoverCard.tsx               Sidebar's Calendar-row hover popover
    └── calendar/
        ├── page.tsx                            /calendar route — auth check, renders <CalendarBoard>
        ├── CalendarBoard.tsx                    Month/week grid, drag-and-drop, fetch logic
        └── EventModal.tsx                       Create/view/edit/delete modal
evals/
├── cases.ts                                    7 eval cases (queries + expected tools/content)
└── run-evals.ts                                Eval runner — real generateText() calls, writes EVAL_LOG.md
```

---

## 6. File-by-file catalog

### Auth layer

**`src/auth.ts`** — NextAuth v5 config. Defines 4 OAuth scopes as constants
(`:5-19`): `gmail.readonly`, `drive.readonly`, `calendar.events` (full
read/write, replaces an earlier `calendar.readonly`), `gmail.compose`
(needed for draft creation; the code comment at `:14-18` notes this
technically also permits sending, so "never sends" is enforced in app code,
not by the scope). `refreshAccessToken()` (`:23-55`) POSTs to Google's token
endpoint with the stored refresh token to get a new access token ~60s before
expiry (`TOKEN_REFRESH_SKEW_MS`, `:21`). The `jwt` callback (`:72-86`) stores
`accessToken`/`refreshToken`/`accessTokenExpiresAt` on first login (when
`account` is present) and calls `refreshAccessToken` on subsequent requests
if expiring soon. The `session` callback (`:87-92`) copies `accessToken`,
`accessTokenExpiresAt`, and `error` onto the session object. Exports
`handlers`, `auth`, `signIn`, `signOut` (NextAuth's standard exports).

**`src/types/next-auth.d.ts`** — TypeScript module augmentation adding
`accessToken`, `accessTokenExpiresAt`, `error` (`"MissingRefreshToken" |
"RefreshAccessTokenError"`) to both `Session` and `JWT` interfaces.

**`src/lib/auth-guard.ts`** — `requireSession()` (`:17-28`): the single
shared auth check used by every API route. Calls `auth()`, returns a 401
`NextResponse` if no `accessToken` or if `session.error` is set, otherwise
returns `{ session, error: null }` with `session` typed as `AuthedSession`
(= `Session & { accessToken: string }`, `:5`). Every route handler in the
app starts with `const { session, error } = await requireSession(); if
(error) return error;`. Per the comment at `:8-16`, this was factored out
during a 2026-08-13 code review after being found duplicated across 8 route
files.

**`src/app/api/auth/[...nextauth]/route.ts`** — 3 lines, exports `{ GET,
POST } = handlers` from `src/auth.ts`. This is what makes NextAuth's
internal routes (sign-in, callback, sign-out) actually reachable.

**`src/app/actions.ts`** — `"use server"` file. `disconnect()` (`:5-7`)
just calls `signOut()`. Used by `Sidebar.tsx`'s disconnect form.

### Google API clients (`src/lib/google/`)

**`gmail.ts`** — `GmailMessage` type (`:3-15`: id, threadId, subject, from,
to[], cc[], date, snippet, body, attachments[], labelIds[]).
`searchMessages(accessToken, query, maxResults=25)` (`:136-159`) — calls
`gmail.users.messages.list` then `.get` per message (`format: "full"`).
`listRecentMessages` (`:161-163`) = `searchMessages` with an empty query.
Body extraction (`extractPlainText`, `:61-89`) prefers `text/plain`, falls
back to stripping `<style>`/`<script>`/comments then all tags from
`text/html` (`htmlToText`, `:52-58`) and decoding HTML entities
(`decodeHtmlEntities`, `:41-50`, table at `:31-39`).
`createDraftReply(accessToken, {threadId, body})` (`:199-237`) — reads the
thread's last message's `From`/`Subject`/`Message-ID` headers, builds a
`Re:`-prefixed reply with correct `In-Reply-To`/`References` headers (using
the real RFC 2822 `Message-ID`, not Gmail's API `id` — comment at `:181-183`),
calls `gmail.users.drafts.create`. **Never calls `drafts.send` or
`messages.send` anywhere in this file or the codebase.**

**`drive.ts`** — `DriveFile` type (`:4-12`). `searchFiles(accessToken,
query, maxResults=25)` (`:74-101`) — `drive.files.list`, `orderBy:
"modifiedTime desc"`. `extractContent()` (`:22-67`) branches on MIME type:
Google Docs exported as plain text (`:28-34`), `text/*`/JSON read directly
(`:36-42`), **PDF** parsed via `unpdf`'s `getDocumentProxy`+`extractText`
(`:50-58`, comment explains `unpdf` was chosen specifically for having no
canvas/worker dependency, since those don't exist on Vercel). Other binary
formats (images, Slides, Sheets) return empty content — metadata only
(`:60-62`). `listRecentFiles` (`:103-105`) = `searchFiles` with empty query.

**`calendar.ts`** — `CalendarEvent` type (`:4-15`) including `isAllDay:
boolean`. `toCalendarEvent()` (`:31-48`) — the ONE place that converts
between Google's exclusive all-day `end.date` and this app's inclusive
convention (comment `:23-29`); uses `shiftDateOnly` from
`src/lib/calendar-date.ts`. `listEvents(accessToken, {timeMin?, timeMax?,
maxResults?})` (`:66-90`) — default window 30 days back / 90 days forward
(`:73-74`), `singleEvents: true` expands recurring events. `createEvent`
(`:101-125`) and `updateEvent` (`:127-157`) both accept an `allDay?: boolean`
flag; when true, `startDateTime`/`endDateTime` are treated as inclusive
`YYYY-MM-DD` strings and the end gets `shiftDateOnly(endDateTime, 1)`
applied before sending to Google (converting to Google's exclusive form).
**No `attendees` field anywhere in `createEvent`/`updateEvent`'s request
body** — comment at `:92-99` states this is deliberate: these tools can
never send a real calendar invite to a third party. `deleteEvent` (`:159-162`)
is a straightforward `calendar.events.delete`.

**`friendly-error.ts`** — `friendlyGoogleErrorMessage(err)` (`:12-19`):
checks for HTTP 403 specifically (reading either `err.code` or
`err.response.status`) and returns an explanatory message about
reconnecting to pick up a newer OAuth scope grant (see §9's OAuth-scope
note). Returns `null` for anything else, so callers fall back to a generic
message.

### `src/lib/calendar-date.ts`

Three exports: `isDateOnly(value)` (`:4-6`, regex `^\d{4}-\d{2}-\d{2}$`),
`parseEventDate(value)` (`:19-25`) — builds a `Date` from local Y/M/D
components for date-only strings instead of going through the standard
`Date` constructor (which parses bare `"YYYY-MM-DD"` as **UTC midnight**
per the ECMA-262 spec, then local getters silently shift the date by the
viewer's UTC offset — documented bug/fix, comment `:8-17`), and
`shiftDateOnly(value, days)` (`:30-35`) — pure UTC-anchored date-only
arithmetic for shifting a date-only string by N days, used for all-day
event drag-and-drop and the exclusive/inclusive end-date conversion in
`calendar.ts`.

### `src/lib/brain/` — the data pipeline

**`types.ts`** — `BrainDocument` (`:1-11`): `id`, `source: "gmail" |
"drive" | "calendar"`, `title`, `body`, `participants: string[]`,
`attachments`, `timestamp`, `url?`, `raw`. The common shape all 3 sources
get normalized into.

**`normalize.ts`** — `gmailMessageToBrainDocument` (`:11-27`),
`calendarEventToBrainDocument` (`:40-65`), `driveFileToBrainDocument`
(`:67-79`). Each extracts a `participants` list (the field cross-source
linking matches on) and builds a `url` back to the original item
(`mail.google.com/.../#all/<threadId>` for Gmail, the event's `htmlLink`
for Calendar, the file's `webViewLink` for Drive).

**`markdown.ts`** — `TYPE_BY_SOURCE` (`:12-16`): maps `gmail→"email"/emails/`,
`drive→"source"/sources/`, `calendar→"event"/life/events/` — these are
gbrain's own schema-pack type names (`gbrain-base-v2`), reused because
gbrain has no dedicated "drive file" or "calendar event" type.
`brainDocumentToMarkdown(doc)` (`:26-56`) renders YAML frontmatter (via the
`yaml` package) plus a body that **restates title/participants/attachments
as visible text** before the real body (`:47-53`) — comment explains gbrain
search only ever returns indexed body text, never frontmatter, so anything
that needs to be searchable/visible to the model has to be repeated in the
body. `brainDocumentPagePath(doc)` (`:58-61`) builds the page's slug path,
e.g. `emails/gmail-19fc76dd1908a913.md`.

**`write.ts`** — `writeBrainPage`/`writeBrainPages` (`:10-22`). Writes a
`BrainDocument`, rendered via `markdown.ts`, to a local file under
`BRAIN_REPO_DIR` (= `path.join(process.cwd(), "brain")`, `:8`). **Local
filesystem write — part of the local-only ingestion path.**

**`gbrain-cli.ts`** — Shells out to `git` and the local `gbrain.exe` binary
via Node's `execFile` (explicitly NOT `shell: true` — comment `:17-25`
explains a real bug this avoided: cmd.exe would otherwise mangle commit
messages containing parentheses). `gbrainBin()` (`:27-38`) resolves an
absolute path to the binary rather than relying on `PATH` (another
documented past bug). `commitBrainRepo(message)` (`:50-68`) — `git add -A`
then commit if there are changes. `syncBrain()` (`:70-87`) — runs `gbrain
sync --source personal-brain`; specifically catches gbrain's own "Another
sync is in progress" lock error and treats it as a benign no-op rather than
a failure (comment `:75-80`, fixing a real race between auto-sync-on-load
and manual re-sync).

**`gbrain-remote.ts`** — the HTTP/MCP client, used by BOTH local dev and
Vercel (this is the part that DOES work everywhere). `mcpCall(toolName,
args)` (`:24-55`) — POSTs a JSON-RPC envelope (`{jsonrpc, id, method:
"tools/call", params: {name, arguments}}`) to `GBRAIN_REMOTE_URL` with a
Bearer token; the response comes back as a single SSE `event: message`
frame, so the `data:` line has to be extracted before JSON-parsing
(`:43-49`) — documented as reverse-engineered from the real server's actual
behavior. `searchBrain(query, {limit, type})` (`:101-141`) over-fetches
(4x, min 20) when a `type` filter is requested since gbrain's own `search`
tool silently ignores a `type` argument (comment `:96-99`), then filters
client-side. `MAX_URL_LOOKUPS = 3` (`:132`) caps how many results get their
citation URL enriched via a `get_page` call each (a real round-trip cost
that once caused Vercel timeouts) — except `type === "event"` hits, which
are always enriched regardless of position, since `eventId` isn't optional
metadata for calendar hits, it's the only handle
`update_calendar_event`/`delete_calendar_event` have on the event (`:127-131`).
`searchGmail`/`searchDrive`/`searchCalendar` (`:143-145`) are thin wrappers.
`savePreference`/`forgetPreference`/`getPreferences` (`:180-206`) read/write
one dedicated gbrain page (`notes/user-preferences`, `:157`) holding dated
bullet lines, capped at 30 entries (`MAX_PREFERENCES`, `:158`).
`linkRelatedDocuments(docs, ownEmail)` (`:224-266`) — the cross-source
graph-linking logic: groups documents by shared participant (excluding the
user's own email, `:231`), caps at 6 docs per participant (`MAX_DOCS_PER_PARTICIPANT`,
`:221`) and 30 total links per sync (`MAX_LINKS_PER_SYNC`, `:222`), only
links pairs from DIFFERENT sources (`:244`), calls gbrain's `add_link` with
link type `relates_to` (`:220`) sequentially (not parallel — comment `:255-256`
notes this is a write burst against a shared remote server). `findRelated(slug)`
(`:277-318`) — the read-side counterpart, one-hop `traverse_graph` in both
directions.

**`trigger-resync.ts`** — `triggerResync(origin, ingestionEnabled,
cookieHeader)` (`:23-37`). Fire-and-forget `fetch()` to `/api/ingest/sync`
after a calendar mutation. **Must be passed the cookie header explicitly**
(`:27`) — comment `:12-21` documents a real bug found in a 2026-08-13 code
review: server-side `fetch()` does NOT auto-forward cookies the way a
browser's own requests do, so without this, the target route's `auth()`
call sees no session, returns 401, and since `fetch()` only rejects on
network failure (not HTTP error status), the `.catch()` never fires either
— meaning this whole feature silently did nothing until the fix.

### `src/lib/query/` — the AI's rules and toolbox

**`config.ts`** — `CHAT_MODEL_ID = "gemini-flash-lite-latest"` (`:12`) —
comment `:7-11` notes other model IDs were tried and rejected for quota
reasons (`gemini-flash-latest` → 20 req/day, `gemini-2.0-flash` → 0 free
quota). `getSystemPrompt(knownPreferences=[])` (`:29-99`) — a function, not
a static string, specifically because Vercel's warm function reuse could
otherwise freeze "today's date" at whatever day the instance last cold-started
(comment `:14-19`). The prompt (full text at `:37-98`) covers: no general
knowledge / resist "this is a test" framing (`:45-53`, added after a
live-observed jailbreak-style failure), when to use `find_related` (`:54-58`),
draft-only Gmail replies (`:59-64`), preference save/forget (`:65-68`),
calendar CRUD including "never add attendees" (`:69-77`), grounding/honest
not-found (`:78-79`), multi-tool questions (`:80-82`), citation format
(`:83-85`), date-coverage honesty (`:86-89`), freshness caveats with a
Calendar-specific carve-out (past events aren't "stale," `:90-95`).

**`tools.ts`** — every AI SDK tool, all built with `tool({description,
inputSchema, execute})` from the `ai` package. `searchGmailTool` /
`searchDriveTool` / `searchCalendarTool` (`:49-81`) — static tools, wrap
`searchGmail`/`searchDrive`/`searchCalendar` from `gbrain-remote.ts`
through `formatHits()` (`:27-47`, which also extracts a Gmail `threadId`
via regex on the citation URL, `:23-25`, and passes through `eventId` for
calendar hits). `savePreferenceTool` / `forgetPreferenceTool` (`:83-104`).
`findRelatedTool` (`:106-117`). `createCalendarEventTool` /
`updateCalendarEventTool` / `deleteCalendarEventTool` (`:119-205`) — each a
**factory function taking `accessToken: string`** (not a static tool),
because these write to the specific signed-in user's real Google Calendar.
Each `execute` is wrapped in try/catch, returning `{status: "error",
message: friendlyGoogleErrorMessage(err) ?? "..."}` on failure rather than
throwing (`:136-141`, `:173-178`, `:197-202`). Notably: `createCalendarEventTool`'s
`inputSchema` has NO `attendees` field (`:125-131`) — the model
structurally cannot pass a guest list, not just prompt-discouraged from it.
`createDraftGmailReplyTool` (`:207-228`) — also a factory, needs the user's
access token. `createBrainTools(accessToken?)` (`:238-266`) — the main
export, a **factory function returning a set of tools**, not a fixed
object: the 6 read/memory tools are always included; the 4 write tools
(`draft_gmail_reply`, `create_calendar_event`, `update_calendar_event`,
`delete_calendar_event`) are only included `if (accessToken)` (`:257-264`)
— called with no token, they're simply absent, which is how the eval
harness (see below) structurally cannot create real side effects.

### `src/app/api/` — backend routes

**`chat/route.ts`** — the main endpoint. `export const maxDuration = 60`
(`:20`) — Vercel Hobby plan's max allowed duration, called out because the
model can make multiple tool-calling round-trips per turn. `friendlyErrorMessage()`
(`:33-49`) classifies Gemini failures: unwraps `RetryError.lastError` to
find the real `APICallError.statusCode` (`:34-35`), maps 429→"high demand",
500/503→"service overload", other codes→generic with the code shown, else
a generic fallback (logged server-side, `:47`). `POST` handler (`:51-78`):
`requireSession()` → parse `messages` from the request body → fetch
`getPreferences()` fresh (`:57`) → `streamText({model: google(CHAT_MODEL_ID),
system: getSystemPrompt(preferences), messages: convertToModelMessages(messages),
tools: createBrainTools(session.accessToken), stopWhen: stepCountIs(5)})`
(`:59-65`) → `result.toUIMessageStreamResponse({onError: friendlyErrorMessage})`
(`:67`). Outer try/catch (`:52-77`) only for genuinely synchronous failures
(bad request, not authenticated) — comment `:22-32` explains most Gemini
errors surface DURING streaming, which is why `onError` (not just the outer
catch) is needed.

**`ingest/sync/route.ts`** — the "Sync now" endpoint. `DEFAULT_MAX_PER_SOURCE
= 50` (`:16`). Guards itself with `if (process.env.VERCEL) return
NextResponse.json({error: "..."}, {status: 501})` (`:22-27`) — belt-and-suspenders
alongside the UI-level hiding in `page.tsx`. Fetches all 3 sources in
parallel (`Promise.all`, `:33-37`), normalizes, `writeBrainPages` (local fs
write), `commitBrainRepo` (local git commit), `syncBrain` (local CLI),
then `linkRelatedDocuments` — but ONLY if `commit.committed` is true
(`:55-64`, skips the linking pass entirely on a no-op sync, since
auto-sync fires on every page load and most of those find nothing new).

**`ingest/gmail/route.ts`** / **`ingest/drive/route.ts`** — simple
session-gated search-preview endpoints (`GET ?q=&max=`), calling
`searchMessages`/`searchFiles` directly. **Not part of the ingestion
pipeline** — a separate, smaller pair of routes for ad hoc lookups.

**`calendar/summary/route.ts`** — powers the sidebar's hover card. Live
data (current-month window via `listEvents`), not gbrain's indexed
snapshot — always accurate even if a sync hasn't run recently. Filters to
upcoming events (`parseEventDate(e.start).getTime() >= now.getTime()`,
`:26`), takes the next 3.

**`calendar/events/route.ts`** — `GET` lists events for an arbitrary
`?start=&end=` range (used by the `/calendar` page's grid). `POST` creates
an event; on success, calls `triggerResync(origin, !process.env.VERCEL,
req.headers.get("cookie"))` (`:50`) so the chat agent can find the new
event promptly.

**`calendar/events/[eventId]/route.ts`** — `PATCH` (update) and `DELETE`,
same `triggerResync` pattern after each (`:27`, `:46`).

### `src/app/` — root layout and top-level components

**`layout.tsx`** — Two fonts loaded via `next/font/google`: `Inter` (body
text, `--font-sans`) and `Space_Grotesk` (brand name only, `--font-display`,
weights 500/700 — comment `:7-11` explains the split: legibility for
content read at length vs. character for the one place the brand name
renders). `NO_FLASH_THEME_SCRIPT` (from `ThemeProvider.tsx`) is injected as
a raw `<script>` in `<head>` (`:47`) so `[data-theme]` is set before
hydration — paired with `suppressHydrationWarning` on `<html>` (`:42`),
since this is a deliberate, expected server/client mismatch on that one
attribute.

**`page.tsx`** — `Home()`: `auth()` → if no session, `<LoginScreen>`
(`:26-56`, a Server Component with a `"use server"` form action calling
`signIn("google")`); else computes `ingestionEnabled = !process.env.VERCEL`
(`:15`) and renders `<Workspace email name ingestionEnabled>`.

**`ThemeProvider.tsx`** — React context holding `theme: "dark"|"light"`,
`toggleTheme()`, and `mounted: boolean`. Both server render and the
client's first hydration pass hardcode `theme = "dark"` (`:48`) — no
`document` read during render, avoiding a real hydration mismatch that was
found and fixed live (comment `:25-38` documents the bug: reading
`localStorage` as a `useState` lazy initializer caused server/client to
diverge whenever the real preference was "light"). A post-mount effect
(`:66-71`) wrapped in `Promise.resolve().then()` (a deliberate microtask
deferral purely to dodge the project's `react-hooks/set-state-in-effect`
lint rule — comment `:59-65` is explicit that there's no real async work
here, unlike `CalendarBoard.tsx`'s genuine fetch) corrects `theme` to the
real stored value and sets `mounted = true`. `mounted` is exposed
specifically so consumers (`HeroLogo.tsx`, `ThemeToggle.tsx`) can wait for
it before rendering anything theme-dependent, avoiding a visible
flash-then-correct (comment `:15-22`).

**`ThemeTransitionOverlay.tsx`** — purely cosmetic full-screen overlay
shown for 550ms (`TRANSITION_OVERLAY_MS` in `ThemeProvider.tsx:10`) on
toggle; the actual color change is a CSS transition in `globals.css`, this
just bridges it visually.

**`PageTransition.tsx`** — wraps route children in a `motion.div key=
{pathname}` with only `initial`/`animate` (no `exit`, no `AnimatePresence`).
Comment `:7-23` documents a real bug this fixes: an earlier
`AnimatePresence mode="wait"` version could leave the page blank after
navigating away from `/calendar`, because that page's complex nested
motion/modal tree could fail to signal "exit complete," blocking the new
page from ever mounting.

**`SyncButton.tsx`** — client component, `handleSync()` POSTs to
`/api/ingest/sync`, shows loading/done/error states. `SyncResult` type
(`:6-14`) matches the ingest route's response shape (`gmailCount`,
`driveCount`, `calendarCount`, `pagesWritten`, `committed`, `linksCreated`,
`syncLog`).

### `src/app/chat/` — chat UI

**`Workspace.tsx`** — top-level client component owning `useChat()`
(`:69-82`) from `@ai-sdk/react`, transport pointed at `/api/chat`. Tracks
`userTimestamps`/`assistantTimestamps` separately (comment `:59-64`
explains why: `sendMessage({messageId})` REPLACES an existing message by
that id rather than assigning a new one, so user messages are timestamped
by send-order position instead). `computeActiveTools()` (`:36-48`) scans
the last assistant message's parts for any tool call not yet in a terminal
state, feeding the Sidebar's live activity indicator. Auto-sync effect
(`:92-100`) fires `POST /api/ingest/sync` once per mount if
`ingestionEnabled`, guarded by a `useRef` (not state, to avoid re-firing on
re-render).

**`Sidebar.tsx`** — `TOOL_META` (`:25-36`) maps every tool name to a label
+ icon for the activity indicator. `CalendarStatusRow` (`:67-82`) is the
only one of the three connected-source rows that's an internal `Link`
(to `/calendar`) with a hover-triggered `<CalendarHoverCard>`; Gmail/Drive
rows are external `<a target="_blank">` links to the real Gmail/Drive
apps (`ExternalStatusLink`, `:57-63`). Bottom section conditionally renders
`<SyncButton>` or a "local dev only" disclosure paragraph based on
`ingestionEnabled` (`:159-165`).

**`Chat.tsx`** — `isEmpty = messages.length === 0 && !systemError`
(`:33`) — renders `<EmptyState>` when true, else the scrollable message
list. Each message's timestamp is looked up by position for user messages,
by id for assistant messages (`:72-76`). A failed generation can leave a
real-but-empty assistant message in the transcript; once no longer busy,
that renders as nothing rather than an empty bubble (`:58-63`).

**`EmptyState.tsx`** — 4 hardcoded suggestion pills (`SUGGESTIONS`,
`:7-12`), each just calls `onSend(text)` on click. `disabled={isBusy}`
(`:51`) prevents double-submit. Greets by first name if available
(`firstName()`, `:14-16`).

**`HeroLogo.tsx`** — crossfades between an **original hand-drawn bat
silhouette** SVG (`BatSilhouette`, `:15-34`, comment explicitly notes this
is NOT a recreation of DC/Warner Bros' Batman trademark) for dark mode and
a `Brain` icon for light mode, gated on `mounted` from `ThemeProvider`
(`:50`, `!mounted ? null : ...`).

**`ThemeToggle.tsx`** — animated sliding switch, thumb position/icon
gated on `mounted` (`:39`) for the same reason as `HeroLogo`.

**`MessageBubble.tsx`** — renders markdown via `react-markdown` with
custom component overrides (`markdownComponents`, `:7-31`: links open in a
new tab, bullets get custom styling, `<strong>`/`<code>` themed). Shows
`<ThinkingIndicator>` when `pending && !text` (`:97`).

**`SourceChip.tsx`** — `Source` type (`:4-10`: tool, title, slug, score,
url?). Renders as a plain span if no `url`, else a clickable
`target="_blank"` link.

**`SystemErrorBanner.tsx`** — message + Retry button, shown by `Chat.tsx`
when `systemError` is set.

**`ThinkingIndicator.tsx`** — 3 staggered bouncing dots (`DOT_COUNT = 3`,
`:1`), pure CSS animation via `animationDelay`.

**`extractSources.ts`** — `extractSources(parts)` (`:24-46`): scans
`tool-search_gmail`/`tool-search_drive` message parts with `state ===
"output-available"`, dedupes by slug keeping the best score (`:36-39`),
drops anything below `RELEVANCE_THRESHOLD = 0.5` (`:3`), caps at
`MAX_SOURCES_SHOWN = 6` (`:4`). (Note: `search_calendar` results are NOT
included in the citation-chip footnote by this function — only Gmail/Drive.)

### `src/app/components/` and `src/app/calendar/`

**`CalendarHoverCard.tsx`** — fetches `/api/calendar/summary` on mount
(own component, not gated by a `visible` prop — parent only mounts it
while hovering). Shows event count + up to 3 upcoming, or the real error
message from the API (not a generic fallback — this was itself a fix for a
bug where the real diagnostic message was being discarded).

**`calendar/page.tsx`** — server component, `auth()` → redirect to `/` if
no session, else `<CalendarBoard>`. No props threaded through — the
ingestion-resync gating happens server-side in the mutating API routes
themselves.

**`calendar/CalendarBoard.tsx`** — the full month/week grid. `viewMode:
"month"|"week"` state; month grid = `MONTH_GRID_WEEKS * 7` = 42 days
(`:40`, `:56`), week = 7 days. `fetchEvents()` (`:83-102`) — deliberately
NOT `async`/`await` at the top level (comment `:59-68` explains this
dodges the same lint rule as `ThemeProvider`), guarded by a monotonic
`requestIdRef` counter (not a single cancelled flag) since `fetchEvents` is
called from multiple places (the range-change effect, `EventModal`'s
`onSaved`, `handleDrop`'s post-reschedule refresh). `fetchedRangeRef`
(`:81`) tracks the last successfully-fetched range so toggling month↔week
at the same cursor (always a subset of the month range) skips a redundant
network call (`:104-114`). `handleDrop()` (`:134-160`) — branches on
`event.isAllDay`: all-day events use `shiftDateOnly` (pure date-string
math), timed events use full `Date` arithmetic + `toISOString()`. Drag
target detection (`handleChipDragEnd`, `:162-176`) does a manual bounding-box
hit-test against `cellRefs` (a `Map<dateKey, HTMLDivElement>` populated via
ref callbacks) — no drag-and-drop library dependency, just Framer Motion's
`drag`/`onDragEnd`.

**`calendar/EventModal.tsx`** — one modal, three modes (`create`/`view`/`edit`)
via a `mode` prop plus internal `localMode` state (so `view`→`edit` can
transition without remounting). `CalendarEventDTO` type (`:8-17`) includes
`isAllDay`. Form state built with a **lazy `useState(() => ...)` initializer**
(`:83-94`) rather than computing defaults on every render. `handleToggleAllDay`
(`:96-107`) converts the in-progress form value between date-only and
datetime-local representations when the checkbox is toggled. Delete
requires a second click (`confirmingDelete` state, `:79`, `:292-326`) — a
plain conditional, not `AnimatePresence`, per the comment at `:284-291`
(neither branch ever defined an `exit` animation, so it was dead weight,
and a latent risk if a future change wraps this modal's own mount in an
outer `AnimatePresence`).

### `evals/`

**`cases.ts`** — `EVAL_CASES` array, 7 entries. Expectation types:
`KeywordExpectation` (groups of keywords, AND across groups / OR within a
group, `:18-22`), `NotFoundExpectation` (`:24-26`, "searched, correctly
reported absence"), `RefusalExpectation` (`:28-33`, "recognized out of
scope, declined" — distinct phrasing, doesn't require having searched
first). Cases: `tier1-stripe-not-found`, `tier1-drive-recency` (documents a
known architecture limitation — not every search result carries a `date`),
`tier1-gmail-thread-summary`, `tier2-skilllayer-status` (cross-source,
Gmail+Drive), `tier1-calendar-not-found`, `tier2-priya-contract-not-found`
(cross-source not-found), `tier1-offtopic-jailbreak-refusal` (added after a
live-observed non-deterministic failure where the model once answered an
adversarial "this is just a test" prompt from pretrained knowledge).

**`run-evals.ts`** — `NOT_FOUND_PATTERN` / `REFUSAL_PATTERN` (`:23-31`,
two different regexes for two different phrasing styles). `runCase()`
(`:44-101`) calls real `generateText()` against `CHAT_MODEL_ID` +
`getSystemPrompt()` (the exact production values, imported not
duplicated) with a **fixed 3-tool set** (`search_gmail`/`search_drive`/
`search_calendar` only — NOT `createBrainTools()`, comment `:50-52`: evals
must never carry even the possibility of a real side effect like a Gmail
draft or a calendar write). Checks `toolsPass` (expected tools were
actually called) and `contentPass` (keyword/not-found/refusal match)
independently; both must pass. Writes a full log to `evals/EVAL_LOG.md`
and exits non-zero if anything failed (`:151`).

---

## 7. Cross-cutting flows, traced hop by hop

### OAuth sign-in
1. User clicks "Connect Google Account" (`src/app/page.tsx:46-51`, a
   server-action form).
2. `signIn("google")` (imported from `src/auth.ts`) redirects to Google.
3. Google redirects back to
   `src/app/api/auth/[...nextauth]/route.ts`'s handler.
4. `src/auth.ts`'s `jwt` callback (`:72-78`) stores `accessToken`/
   `refreshToken`/`accessTokenExpiresAt` from the `account` object.
5. `session` callback (`:87-92`) copies those onto the session, readable
   in Server Components via `await auth()` and in API routes via
   `requireSession()` (`src/lib/auth-guard.ts`).

### A chat message, end to end
1. User types in `Chat.tsx`'s input, submits → `Workspace.tsx`'s
   `sendStampedMessage` (`:102-106`) → `chat.sendMessage({text})`
   (from `useChat`, `@ai-sdk/react`).
2. POST to `/api/chat` (`src/app/api/chat/route.ts:51`).
3. `requireSession()` → `getPreferences()` (`gbrain-remote.ts:180-183`) →
   `streamText({model, system: getSystemPrompt(preferences), messages,
   tools: createBrainTools(session.accessToken), stopWhen: stepCountIs(5)})`
   (`:59-65`).
4. Gemini decides which tool(s) to call (if any) — e.g. `search_gmail`
   (`tools.ts:49-58`) → `searchGmail()` (`gbrain-remote.ts:143`) →
   `searchBrain()` (`:101-141`) → `mcpCall("search", {...})` (`:24-55`) →
   real HTTP POST to the gbrain server.
5. Result streams back through `toUIMessageStreamResponse` (`route.ts:67`)
   to `useChat`, rendered token-by-token in `MessageBubble.tsx`.
6. `extractSources.ts` pulls citation chips out of the `tool-search_gmail`/
   `tool-search_drive` message parts for the sources footnote.

### Ingestion ("Sync now") — local dev only
1. `SyncButton.tsx`'s `handleSync` → `POST /api/ingest/sync`.
2. `src/app/api/ingest/sync/route.ts:22-27` — 501s immediately if
   `process.env.VERCEL` is set.
3. `Promise.all([listRecentMessages, listRecentFiles, listEvents])`
   (`:33-37`) — direct Google API calls using the session's access token.
4. `normalize.ts`'s 3 converter functions → `BrainDocument[]`.
5. `write.ts`'s `writeBrainPages` — local filesystem write to `brain/`.
6. `gbrain-cli.ts`'s `commitBrainRepo` (local `git commit`) then
   `syncBrain` (shells out to local `gbrain.exe sync`).
7. If the commit had real changes: `gbrain-remote.ts`'s
   `linkRelatedDocuments` (remote HTTP calls to `add_link`).

### Calendar CRUD from chat
1. Model calls e.g. `create_calendar_event` (`tools.ts:119-144`, a
   per-request closure over the user's `accessToken`).
2. `createEvent()` (`src/lib/google/calendar.ts:101-125`) — direct Google
   Calendar API call, `attendees` never included.
3. On success, the tool returns `{status: "created", ...}` to the model,
   which relays it in its answer. (Note: this path — unlike the
   `/calendar` page's own mutations — does NOT call `triggerResync`; only
   the `/api/calendar/events*` routes used by the `/calendar` page do.)

### Calendar CRUD from the `/calendar` page
1. `EventModal.tsx`'s `handleSave`/`handleDelete` → `POST`/`PATCH`/`DELETE`
   to `/api/calendar/events` or `/api/calendar/events/[eventId]`.
2. Route calls `createEvent`/`updateEvent`/`deleteEvent`
   (`src/lib/google/calendar.ts`) directly.
3. On success, calls `triggerResync(origin, !process.env.VERCEL,
   cookieHeader)` (`trigger-resync.ts`) — fire-and-forget re-sync so the
   chat agent can find the change promptly (local-dev only; no-ops on
   Vercel).
4. `CalendarBoard.tsx`'s `onSaved` callback re-fetches the visible range.

---

## 8. Known architectural facts and caveats (state as of this snapshot)

- **Ingestion is local-dev-only, deliberately, not an oversight.** The
  write path (`write.ts` + `gbrain-cli.ts`) requires a local git-tracked
  folder and a locally-installed CLI binary, neither of which exist on
  Vercel's serverless functions. This was investigated for a full rewrite
  to a fully-remote design (using gbrain's `put_page` MCP operation
  instead of the local git+CLI pipeline) and the rewrite was **built,
  tested against the live gbrain server, and then reverted** after
  measuring real latency: a single remote write took ~24.5s, and 10
  concurrent writes showed real failures even with a 35s timeout — given
  Vercel's 60s hard request ceiling and a full sync needing ~30 documents,
  the numbers didn't reliably fit. The code as it exists in this snapshot
  reflects the ORIGINAL local-only design (that rewrite's diff was
  `git stash`'d, not merged). `write.ts` and `gbrain-cli.ts` are therefore
  live, in-use files, not dead code, despite the exploration.
- **Single-tenant.** One shared brain behind one Google account. A second
  Google account signing in and syncing would mix its data into the same
  shared brain, not get its own isolated space.
- **`search_calendar` results are not included in the citation-chip
  footnote** — `extractSources.ts:28` only checks `tool-search_gmail`/
  `tool-search_drive` part types.
- **PDF text extraction only** among binary Drive formats — Slides,
  Sheets, images are indexed by metadata (name, owner, dates) only, no
  content extraction (`drive.ts:60-62`).
- **OAuth scopes are not retroactive.** A session that authenticated
  before `calendar.events` (full read/write) replaced the earlier
  `calendar.readonly` scope keeps whatever was originally granted until
  the user disconnects and reconnects — Google's refresh-token grant
  reissues at the originally-consented scope, it never silently upgrades.
  This is exactly what `friendly-error.ts` detects and explains.
- **Voice input was built, debugged, and removed.** A `useSpeechRecognition`
  hook existed at one point (commit `d8d17d4`, kept in git history) but was
  reverted after live testing hit a "No speech detected" failure that
  survived three rounds of debugging (hardware/permissions ruled out, a
  known Chrome `continuous`-mode bug worked around, browser extensions
  ruled out via Incognito) — no code for this feature exists in the
  current tree.
- **The write-action tools (`create_calendar_event`, `update_calendar_event`,
  `delete_calendar_event`, `draft_gmail_reply`) are deliberately absent
  from the eval harness's tool set** (`evals/run-evals.ts:54-58` uses a
  fixed 3-tool object, not `createBrainTools()`) — an automated eval run
  can never create a real side effect as a matter of construction, not
  just because no token happens to be present.
