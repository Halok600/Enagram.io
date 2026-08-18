# Running the sync worker from Colab

Ingestion ("Sync now", auto-sync-on-load, post-calendar-edit resync) needs a
locally-installed gbrain binary + a local git-tracked `brain/` folder —
neither exists on Vercel. Since the PC this was built on gets reset, that
machine is now a Colab notebook instead, reachable through an ngrok tunnel.
See `src/lib/brain/ingest-tunnel.ts` and `scripts/ingest-worker.ts` for the
code side of this; this doc is the operational checklist for the Colab side.

**Before wiping the old PC**, copy its `GBRAIN_DIRECT_DATABASE_URL` value
somewhere safe (it's a Windows user env var — `echo %GBRAIN_DIRECT_DATABASE_URL%`
in cmd, or check `.env.local`/shell profile if it was set there too). The
Colab worker needs this so it points at the *same* Supabase-backed brain
(152 pages, already embedded) instead of initializing a fresh empty one.

## One-time setup, every time you spin up a fresh Colab runtime

Run in a Colab code cell (`!` prefix for shell commands):

```bash
!curl -fsSL https://bun.sh/install | bash
!source ~/.bashrc && bun install -g gbrain
!git clone https://github.com/Halok600/Enagram.io.git
%cd Enagram.io
!~/.bun/bin/bun install
```

Set env vars for the notebook process (Colab's "Secrets" panel — the key
icon in the left sidebar — is safer than pasting these directly into a
cell, since cell contents can end up in notebook history):

- `GBRAIN_DIRECT_DATABASE_URL` — the value saved before the PC wipe.
- `INGEST_TUNNEL_SECRET` — pick any random string once; use the *same* value
  in Vercel's env vars. Doesn't need to change on restart, only the URL does.

**Verify the existing `personal-brain` source will actually sync from this
new path** before relying on it — this is the one step not yet proven
end-to-end, since it needs a live Colab session to test:

```bash
!~/.bun/bin/gbrain sources status
!~/.bun/bin/gbrain sources add personal-brain --path $(pwd)/brain
```
If `sources add` errors because the source already exists rather than
updating its `local_path`, check `gbrain sources --help` for a rename/update
form — don't guess past an error here, since getting this wrong risks a
duplicate source or an orphaned sync target.

## Starting the worker (every restart)

```bash
%cd Enagram.io
!INGEST_TUNNEL_SECRET=$INGEST_TUNNEL_SECRET GBRAIN_DIRECT_DATABASE_URL=$GBRAIN_DIRECT_DATABASE_URL nohup ~/.bun/bin/bun run scripts/ingest-worker.ts > worker.log 2>&1 &
!sleep 2 && cat worker.log
```

Then start ngrok (install once per fresh runtime the same way — `pip install
pyngrok` is the easiest path from a Colab cell, or the standalone `ngrok`
binary if you already have a preferred install pattern from your other
projects):

```python
from pyngrok import ngrok
tunnel = ngrok.connect(8787)
print(tunnel.public_url)
```

## Every time you restart (the actual recurring workflow)

1. Re-run the "Starting the worker" cell above (setup only needs to happen
   once per fresh Colab runtime, not every restart, as long as the runtime
   itself didn't recycle).
2. Copy the new `tunnel.public_url` printed above.
3. In Vercel → Settings → Environment Variables, update `INGEST_TUNNEL_URL`
   to that URL.
4. **Trigger a redeploy** — editing a Vercel env var alone does not apply it
   to the running deployment, a redeploy is required every time.
5. Click "Sync now" on the deployed site and confirm it completes instead of
   erroring "Sync worker unreachable."

## Known limits

- Colab free tier disconnects after ~90 min idle or ~12h max session, and
  the browser tab generally needs to stay open. Ingestion is simply
  unavailable outside an active Colab session — the UI surfaces this as a
  clear "Sync worker unreachable" error rather than hanging or failing
  silently (see `syncViaTunnel` in `ingest-tunnel.ts`).
- Free ngrok gives a new random subdomain every session unless you claim a
  static domain (ngrok's free tier allows one permanently free) — worth
  doing if the manual URL-copy step becomes annoying, but not required.
