"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

type Summary = {
  eventCountThisMonth: number;
  upcoming: { summary: string; start: string; htmlLink: string }[];
};

function formatEventTime(start: string): string {
  const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(start);
  const date = new Date(start);
  return isAllDay
    ? date.toLocaleDateString([], { month: "short", day: "numeric" })
    : date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Rendered by Sidebar.tsx on hover over the Calendar row — fetches its
 * own data on mount since the parent only mounts it while hovering, so
 * there's no need for a separate "visible" prop to gate the fetch. */
export function CalendarHoverCard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/calendar/summary")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) setFailed(true);
        else setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 4 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="absolute left-full top-0 z-20 ml-3 w-72 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-panel-raised)] p-4"
      style={{ boxShadow: "var(--shadow-md)" }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
        This month&apos;s activity
      </p>

      {!summary && !failed && <p className="mt-2 text-sm text-[var(--text-tertiary)]">Loading…</p>}
      {failed && <p className="mt-2 text-sm text-[var(--danger)]">Couldn&apos;t load calendar summary</p>}

      {summary && (
        <>
          <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{summary.eventCountThisMonth}</p>
          <p className="text-xs text-[var(--text-tertiary)]">events this month</p>

          {summary.upcoming.length > 0 ? (
            <div className="mt-3 flex flex-col gap-1.5 border-t border-[var(--border)] pt-3">
              {summary.upcoming.map((e) => (
                <div key={e.htmlLink} className="text-xs text-[var(--text-secondary)]">
                  <span className="font-medium text-[var(--text-primary)]">{e.summary}</span>
                  {" — "}
                  {formatEventTime(e.start)}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-tertiary)]">
              Nothing upcoming this month.
            </p>
          )}
        </>
      )}
    </motion.div>
  );
}
