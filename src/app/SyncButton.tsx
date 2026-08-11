"use client";

import { useState } from "react";
import { motion } from "framer-motion";

type SyncResult = {
  gmailCount: number;
  driveCount: number;
  calendarCount: number;
  pagesWritten: number;
  committed: boolean;
  linksCreated: number;
  syncLog: string;
};

type SyncState = "idle" | "loading" | "done" | "error";

export function SyncButton() {
  const [state, setState] = useState<SyncState>("idle");
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/ingest/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setResult(data);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <motion.button
        type="button"
        onClick={handleSync}
        disabled={state === "loading"}
        whileHover={state === "loading" ? undefined : { y: -1, boxShadow: "var(--shadow-md)" }}
        whileTap={state === "loading" ? undefined : { scale: 0.98 }}
        transition={{ duration: 0.15 }}
        className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-panel)] px-4 py-3 text-sm font-medium text-[var(--text-primary)] disabled:opacity-40 disabled:hover:shadow-none"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        {state === "loading" ? "Syncing..." : "Sync now"}
      </motion.button>

      {state === "done" && result && (
        <p className="text-xs leading-snug text-[var(--text-tertiary)]">
          {result.gmailCount} email(s) + {result.driveCount} file(s) + {result.calendarCount} event(s) →{" "}
          {result.pagesWritten} page(s)
          {result.committed ? `, synced (${result.linksCreated} link(s))` : " (no changes)"}.
        </p>
      )}

      {state === "error" && <p className="text-xs leading-snug text-[var(--danger)]">{error}</p>}
    </div>
  );
}
