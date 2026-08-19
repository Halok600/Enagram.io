# Running the sync worker from Colab

Ingestion ("Sync now", auto-sync-on-load, post-calendar-edit resync) needs a
locally-installed gbrain binary + a local git-tracked `brain/` folder —
neither exists on Vercel. Since the PC this was built on gets reset, that
machine is now a Colab notebook instead, reachable through an ngrok tunnel.
See `src/lib/brain/ingest-tunnel.ts` and `scripts/ingest-worker.ts` for the
code side of this; this doc is the operational checklist for the Colab side.

**Before wiping the old PC**, copy its `GBRAIN_DIRECT_DATABASE_URL` value
somewhere safe (it's a Windows user env var — `echo $env:GBRAIN_DIRECT_DATABASE_URL`
in PowerShell, or check `.env.local` if it was set there too). The Colab
worker needs this so it points at the *same* Supabase-backed brain (152
pages, already embedded) instead of initializing a fresh empty one.

## Every fresh Colab runtime — realistically, every session

Colab's free tier wipes the entire VM on disconnect (~90 min idle, ~12h
max), so in practice this whole section runs from scratch nearly every time
you sit down to work, not just occasionally. Budget a few minutes for it.

**1. Add four Colab secrets** (key icon 🔑 in the left sidebar → "+ Add new
secret," toggle Notebook access ON for each):
- `GBRAIN_DIRECT_DATABASE_URL` — the value saved before the PC wipe.
- `INGEST_TUNNEL_SECRET` — any random string, picked once; the *same* value
  also goes into Vercel's env vars. Doesn't need to change on restart, only
  `INGEST_TUNNEL_URL` does.
- `NGROK_AUTHTOKEN` — from ngrok.com → Getting Started → Your Authtoken
  (probably the same one already used for other projects on this account).
- `GOOGLE_GENERATIVE_AI_API_KEY` — same value as `.env.local`'s line of the
  same name. gbrain's embed step calls Google's embedding API directly; sync
  fails without this.

**2. First cell — load secrets and fix PATH, both at the Python/kernel
level:**

```python
import os
from google.colab import userdata

os.environ["GBRAIN_DIRECT_DATABASE_URL"] = userdata.get("GBRAIN_DIRECT_DATABASE_URL")
os.environ["INGEST_TUNNEL_SECRET"] = userdata.get("INGEST_TUNNEL_SECRET")
os.environ["NGROK_AUTHTOKEN"] = userdata.get("NGROK_AUTHTOKEN")
os.environ["GOOGLE_GENERATIVE_AI_API_KEY"] = userdata.get("GOOGLE_GENERATIVE_AI_API_KEY")

# Each `!` cell spawns a fresh subprocess, so a shell `source ~/.bashrc` in
# one cell does NOT carry PATH forward to the next `!` cell — but changes to
# os.environ made here, at the Python/kernel level, DO persist across every
# subsequent cell for the rest of the session. Set this once, here, instead
# of repeating `source ~/.bashrc` or a full ~/.bun/bin/ path on every command.
os.environ["PATH"] = "/root/.bun/bin:" + os.environ["PATH"]

print("secrets loaded")
```

Run it, allow Colab's permission prompt the first time. From here on, plain
`bun` and `gbrain` (no path prefix) work in every `!` cell for the rest of
this session.

**3. Second cell — install bun and gbrain:**

```
!curl -fsSL https://bun.sh/install | bash
!bun add -g github:garrytan/gbrain
```

No `--trust` flag. gbrain's actual postinstall script
(`scripts/postinstall.ts` in the package) only tries to run `gbrain
apply-migrations` on an *already-linked* binary, and no-ops cleanly if
gbrain isn't on PATH yet — always true on a fresh install, so it's a no-op
for us either way. It never fetches a binary itself; that happens through
bun's normal global-install linking regardless of `--trust`. Passing
`--trust` was observed to make this no-op step crash with exit 127 instead
of skipping quietly — leaving it off avoids that failure with no functional
loss.

Verify it actually installed:
```
!gbrain --version
```

**4. Third cell — get the code, and git-init `brain/` as its own standalone
repo:**

```
!git clone https://github.com/Halok600/Enagram.io.git
%cd Enagram.io
!bun install
!git init brain
```

The last line matters and is easy to skip: `brain/` is gitignored, so
cloning the app repo does **not** bring it along or make it a repo of its
own. Without this, `commitBrainRepo`'s `git add`/`commit` calls silently
fall back to the *outer* app repo (git searches upward for `.git` when the
cwd doesn't have one), and `gbrain sync` — which checks specifically for
`local_path/.git`, not an inherited one — ends up trying to `git pull` the
wrong repository entirely and fails. Confirmed live 2026-08-19: this exact
gap produced `sync.discover_git_root` resolving to `/content/Enagram.io`
instead of `/content/Enagram.io/brain`, then a failed pull against GitHub.
`git init` here, before anything gets written, avoids it entirely.

**5. Fourth cell — initialize gbrain's local config against the existing
database**, explicitly locking in the same engine and embedding settings the
existing 152 pages were already embedded with (confirmed via `gbrain config
show` on the original machine: `engine: postgres`, `embedding_model:
google:gemini-embedding-001`, `embedding_dimensions: 768`) — letting `init`
guess instead risks a silent mismatch that breaks search consistency:

```
!gbrain init --url "$GBRAIN_DIRECT_DATABASE_URL" --embedding-model google:gemini-embedding-001 --embedding-dimensions 768 --non-interactive
```

**6. Fifth cell — point the existing brain source at this new path:**

```
!gbrain sources status
```

This should show `personal-brain` with its existing page count. **Do NOT run
`gbrain sources add personal-brain --path ...`** — proven live on
2026-08-19: the source already exists every time after the first setup, and
`sources add`'s "already registered" check fires unconditionally (even with
`--force`), with its own suggested fix being `sources remove
--confirm-destructive`. Checked `schema.sql` directly: `pages.source_id`
has `REFERENCES sources(id) ON DELETE CASCADE` — that command would delete
every page and embedding, not just re-point the path.

The actual fix is a single-column SQL update, run from a Colab cell (it
already has `GBRAIN_DIRECT_DATABASE_URL` loaded):

```python
import subprocess
result = subprocess.run(
    ["bun", "-e", """
import { SQL } from "bun";
const sql = new SQL(process.env.GBRAIN_DIRECT_DATABASE_URL);
const r = await sql`UPDATE sources SET local_path = '/content/Enagram.io/brain' WHERE id = 'personal-brain' RETURNING id, local_path`;
console.log(r);
await sql.end();
"""],
    capture_output=True, text=True
)
print(result.stdout, result.stderr)
```

Adjust the path if your clone doesn't land at `/content/Enagram.io` — confirm
with `!pwd` first. Re-run `gbrain sources status` afterward and confirm the
page count is unchanged before moving on.

**7. Sixth cell — start the worker:**

```
%cd /content/Enagram.io
!nohup bun run scripts/ingest-worker.ts > worker.log 2>&1 &
!sleep 2 && cat worker.log
```
Should print `Ingest worker listening on :8787`.

**8. Seventh cell — start the ngrok tunnel:**

```python
!pip install pyngrok -q
from pyngrok import ngrok
ngrok.set_auth_token(os.environ["NGROK_AUTHTOKEN"])
tunnel = ngrok.connect(8787)
print(tunnel.public_url)
```

Copy the printed `https://*.ngrok-free.app` URL — that goes into Vercel next.

## Every time, in Vercel

1. Vercel dashboard → this project → Settings → Environment Variables.
2. First time only: add `INGEST_TUNNEL_SECRET` (same value as the Colab
   secret above).
3. Every time: set/update `INGEST_TUNNEL_URL` to the ngrok URL just copied.
4. **Trigger a redeploy** — Deployments tab → "⋯" on the latest → Redeploy.
   Editing an env var alone does not apply it; a redeploy is required every
   single time the URL changes.
5. Wait about a minute, then click "Sync now" on the deployed site and
   confirm it completes instead of erroring "Sync worker unreachable."

## Keeping it running

As long as the Colab tab stays open and connected, the worker + tunnel keep
running and nothing above needs repeating. The moment Colab disconnects
(closing the tab, ~90 min idle, or the ~12h cap), the worker goes down and
the whole notebook section needs to be re-run from the top — including
reinstalling bun/gbrain and re-cloning, since the VM itself is gone, not
just the process.

## Known limits

- Ingestion is simply unavailable outside an active Colab session — the UI
  surfaces this as a clear "Sync worker unreachable" error rather than
  hanging or failing silently (see `syncViaTunnel` in `ingest-tunnel.ts`).
- Free ngrok gives a new random subdomain every session unless you claim a
  static domain (ngrok's free tier allows one permanently free) — worth
  doing if the manual URL-copy step becomes annoying, but not required.
