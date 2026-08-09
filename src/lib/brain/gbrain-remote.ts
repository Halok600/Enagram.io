export type BrainSearchHit = {
  slug: string;
  type: string;
  title: string;
  score: number;
  snippet: string;
  url?: string;
  date?: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

/**
 * gbrain's HTTP MCP transport returns a single SSE "message" event per
 * JSON-RPC call rather than a plain JSON body, so the "data:" line has to be
 * pulled out before treating it as JSON-RPC. Discovered by probing the raw
 * endpoint directly — see JOURNAL.md 2026-08-04.
 */
async function mcpCall<T = unknown>(toolName: string, args: Record<string, unknown>): Promise<T> {
  const url = requireEnv("GBRAIN_REMOTE_URL");
  const token = requireEnv("GBRAIN_REMOTE_TOKEN");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  const raw = await res.text();
  const dataLine = raw.split("\n").find((line) => line.startsWith("data:"));
  if (!dataLine) {
    throw new Error(`Unexpected gbrain MCP response calling ${toolName}: ${raw.slice(0, 300)}`);
  }

  const rpc = JSON.parse(dataLine.slice(5));
  if (rpc.error) {
    throw new Error(`gbrain MCP error calling ${toolName}: ${rpc.error.message}`);
  }

  return JSON.parse(rpc.result.content[0].text) as T;
}

type RawSearchHit = {
  slug?: string;
  type?: string;
  title?: string;
  score?: number;
  chunk_text?: string;
};

/**
 * The url (and date) we cite live in each page's frontmatter, which `search`
 * never returns (only chunked body text) — fetch it per-hit via `get_page`.
 * This is what lets local dev and the Vercel deployment share one
 * implementation: neither needs local filesystem access to brain/*.md
 * anymore. `date` was added after an eval run (evals/EVAL_LOG.md,
 * JOURNAL.md 2026-08-05) surfaced that recency-based queries ("last week")
 * were structurally unanswerable — the model had no timestamp on any
 * result at all.
 */
async function getPageMeta(slug: string): Promise<{ url?: string; date?: string }> {
  try {
    const page = await mcpCall<{ frontmatter?: { url?: string; date?: string } }>("get_page", { slug });
    return { url: page.frontmatter?.url, date: page.frontmatter?.date };
  } catch (err) {
    console.error(`Failed to fetch frontmatter for ${slug}`, err);
    return {};
  }
}

/**
 * `search`'s own `type` filter doesn't exist in its tool schema at all
 * (confirmed via tools/list) — over-fetch and filter on the `type` field
 * already present in each result instead.
 */
export async function searchBrain(
  query: string,
  options: { limit?: number; type?: "email" | "source" | "event" } = {},
): Promise<BrainSearchHit[]> {
  const { limit = 10, type } = options;
  const overFetchLimit = type ? Math.max(limit * 4, 20) : limit;

  const results = await mcpCall<RawSearchHit[]>("search", { query, limit: overFetchLimit });

  const hits = results.map((r) => ({
    slug: r.slug ?? "",
    type: r.type ?? "",
    title: r.title ?? "",
    score: r.score ?? 0,
    snippet: r.chunk_text ?? "",
  }));

  const filtered = (type ? hits.filter((h) => h.type === type) : hits).slice(0, limit);

  // Each URL lookup is a separate round-trip to the remote gbrain server.
  // The model can call search_gmail/search_drive several times per turn
  // (observed: 3-4x with rephrased queries), and each call used to enrich
  // every one of its results — enough round-trips stacked up to blow past
  // Vercel's function timeout entirely. Snippets (already in the single
  // search response, no extra cost) still cover every hit for grounding;
  // only the top few most-relevant results get a clickable citation link.
  const MAX_URL_LOOKUPS = 3;
  const enriched = await Promise.all(
    filtered.map(async (hit, i) => {
      if (i >= MAX_URL_LOOKUPS) return hit;
      const meta = await getPageMeta(hit.slug);
      return { ...hit, url: meta.url, date: meta.date };
    }),
  );
  return enriched;
}

export const searchGmail = (query: string, limit = 10) => searchBrain(query, { limit, type: "email" });
export const searchDrive = (query: string, limit = 10) => searchBrain(query, { limit, type: "source" });
export const searchCalendar = (query: string, limit = 10) => searchBrain(query, { limit, type: "event" });

/**
 * Feature #6 (preference memory). One dedicated page holds every saved
 * preference as a bullet line — deliberately NOT gbrain's own native
 * extract_facts/recall system (its entity-graph/notability-scored pipeline,
 * tested live, silently extracted zero facts from plain first-person
 * preference text with no visible error — too opaque to build on reliably
 * for a demo). put_page/get_page are the same primitives the rest of this
 * app already uses, fully predictable and inspectable (`gbrain get
 * notes/user-preferences`). See JOURNAL.md 2026-08-10.
 */
const PREFERENCES_SLUG = "notes/user-preferences";
const MAX_PREFERENCES = 30;

type PageResult = { compiled_truth?: string; error?: string };

async function getPreferencesPage(): Promise<string[]> {
  try {
    const page = await mcpCall<PageResult>("get_page", { slug: PREFERENCES_SLUG });
    if (page.error === "page_not_found") return [];
    return (page.compiled_truth ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "));
  } catch (err) {
    console.error("Failed to read preferences page", err);
    return [];
  }
}

function buildPreferencesPageContent(lines: string[]): string {
  return `---\ntype: note\ntitle: User Preferences\n---\n\n${lines.slice(-MAX_PREFERENCES).join("\n")}\n`;
}

export async function getPreferences(): Promise<string[]> {
  const lines = await getPreferencesPage();
  return lines.map((line) => line.replace(/^- \[\d{4}-\d{2}-\d{2}\]\s*/, ""));
}

export async function savePreference(fact: string): Promise<{ status: "saved" | "already_known" }> {
  const existing = await getPreferencesPage();
  const normalized = fact.trim().toLowerCase();
  if (existing.some((line) => line.toLowerCase().includes(normalized))) {
    return { status: "already_known" };
  }

  const today = new Date().toISOString().slice(0, 10);
  const updated = [...existing, `- [${today}] ${fact.trim()}`];
  await mcpCall("put_page", { slug: PREFERENCES_SLUG, content: buildPreferencesPageContent(updated) });
  return { status: "saved" };
}

export async function forgetPreference(fact: string): Promise<{ status: "removed" | "not_found" }> {
  const existing = await getPreferencesPage();
  const normalized = fact.trim().toLowerCase();
  const remaining = existing.filter((line) => !line.toLowerCase().includes(normalized));
  if (remaining.length === existing.length) return { status: "not_found" };

  await mcpCall("put_page", { slug: PREFERENCES_SLUG, content: buildPreferencesPageContent(remaining) });
  return { status: "removed" };
}

/**
 * Feature #7 (graph-based cross-source linking). Auto-links pages across
 * DIFFERENT sources that share a participant email — e.g. a Gmail thread,
 * a Calendar event, and a Drive file all involving nirmit@skilllayer.tech
 * are almost certainly the same real-world thread, a much stronger signal
 * than re-running semantic search per source. Deliberately deterministic
 * (no LLM judgment call) after feature #6's extract_facts detour showed
 * how costly an opaque LLM-based pipeline is to debug for a graded demo.
 * `relates_to` (gbrain-base-v2's generic bidirectional link type) is the
 * closest fit — no type in the schema pack is cross-source-relationship
 * specific.
 */
const RELATES_TO = "relates_to";
const MAX_DOCS_PER_PARTICIPANT = 6; // drop overly-common participants (mailing lists, frequent coworkers) — not a meaningful signal
const MAX_LINKS_PER_SYNC = 30; // ingestion is local-only but still shouldn't hang for minutes on link creation

export async function linkRelatedDocuments(
  docs: { slug: string; source: string; participants: string[] }[],
  ownEmail: string,
): Promise<{ linksCreated: number; linksAttempted: number }> {
  const bySource = new Map<string, { slug: string; source: string }[]>();
  for (const doc of docs) {
    for (const participant of doc.participants) {
      if (participant.toLowerCase() === ownEmail.toLowerCase()) continue; // present on nearly everything — not a signal
      const list = bySource.get(participant) ?? [];
      list.push({ slug: doc.slug, source: doc.source });
      bySource.set(participant, list);
    }
  }

  const seenPairs = new Set<string>();
  const pairs: { from: string; to: string }[] = [];
  for (const entries of bySource.values()) {
    if (entries.length < 2 || entries.length > MAX_DOCS_PER_PARTICIPANT) continue;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[i].source === entries[j].source) continue; // cross-source only
        const key = [entries[i].slug, entries[j].slug].sort().join("|");
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        pairs.push({ from: entries[i].slug, to: entries[j].slug });
      }
    }
  }

  const capped = pairs.slice(0, MAX_LINKS_PER_SYNC);
  let linksCreated = 0;
  // Sequential, not Promise.all: this is a write burst against the shared
  // remote server, not latency-sensitive like the Vercel-side search path.
  for (const { from, to } of capped) {
    try {
      await mcpCall("add_link", { from, to, link_type: RELATES_TO, link_source: "shared-participant" });
      linksCreated++;
    } catch (err) {
      console.error(`Failed to link ${from} -> ${to}`, err);
    }
  }
  return { linksCreated, linksAttempted: capped.length };
}

type GraphEdge = { from_slug: string; to_slug: string; link_type: string };
type RelatedPage = { slug: string; title: string; type: string; url?: string; date?: string };

/**
 * The model's read-side counterpart: given a slug from a prior search
 * result, return whatever's linked to it (one hop, either direction —
 * `relates_to` is its own inverse, but checking both directions explicitly
 * doesn't depend on gbrain materializing the reverse edge automatically).
 */
export async function findRelated(slug: string): Promise<{ count: number; results: RelatedPage[] }> {
  try {
    const edges = await mcpCall<GraphEdge[]>("traverse_graph", {
      slug,
      direction: "both",
      depth: 1,
      link_type: RELATES_TO,
    });

    const relatedSlugs = Array.from(
      new Set(edges.map((e) => (e.from_slug === slug ? e.to_slug : e.from_slug))),
    ).slice(0, 10);

    const results = await Promise.all(
      relatedSlugs.map(async (relatedSlug): Promise<RelatedPage | null> => {
        try {
          const page = await mcpCall<{
            title?: string;
            type?: string;
            frontmatter?: { url?: string; date?: string };
          }>("get_page", { slug: relatedSlug });
          return {
            slug: relatedSlug,
            title: page.title ?? relatedSlug,
            type: page.type ?? "",
            url: page.frontmatter?.url,
            date: page.frontmatter?.date,
          };
        } catch (err) {
          console.error(`Failed to fetch related page ${relatedSlug}`, err);
          return null;
        }
      }),
    );

    const filtered = results.filter((r): r is RelatedPage => r !== null);
    return { count: filtered.length, results: filtered };
  } catch (err) {
    console.error(`Failed to traverse graph from ${slug}`, err);
    return { count: 0, results: [] };
  }
}
