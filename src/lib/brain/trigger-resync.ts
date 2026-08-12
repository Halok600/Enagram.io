/**
 * Fire-and-forget re-sync trigger, called after any live Calendar
 * mutation from the /calendar page (create/update/delete) so the chat
 * agent can find the change without waiting for an unrelated sync —
 * same pattern Workspace.tsx already uses client-side for auto-sync-on-
 * load, just triggered server-side here since the mutation itself is a
 * server route. `origin` must come from the incoming request (server-side
 * fetch can't resolve a relative path against the app's own origin).
 * Gated by `ingestionEnabled` — same local-dev-only limitation as every
 * other ingestion-touching feature (Vercel has no local gbrain/git repo).
 */
export function triggerResync(origin: string, ingestionEnabled: boolean): void {
  if (!ingestionEnabled) return;
  fetch(`${origin}/api/ingest/sync`, { method: "POST" }).catch((err) => {
    console.error("Background re-sync after calendar mutation failed", err);
  });
}
