import { tool } from "ai";
import { z } from "zod";
import { searchGmail, searchDrive, searchCalendar } from "@/lib/brain/gbrain-remote";
import { createDraftReply } from "@/lib/google/gmail";

/**
 * The url search_gmail already returns for citations
 * (https://mail.google.com/mail/u/0/#all/<threadId>) also carries the one
 * thing draft_gmail_reply needs to target the right conversation — pull it
 * out server-side so the model just passes threadId through verbatim
 * instead of parsing a URL itself. Drive urls never match, so this is a
 * no-op (field omitted) for search_drive results.
 */
function extractGmailThreadId(url?: string): string | undefined {
  return url?.match(/#all\/([^/?]+)$/)?.[1];
}

function formatHits(hits: Awaited<ReturnType<typeof searchGmail>>) {
  if (hits.length === 0) {
    return { count: 0, results: [] };
  }
  return {
    count: hits.length,
    results: hits.map((h) => {
      const threadId = extractGmailThreadId(h.url);
      return {
        slug: h.slug,
        title: h.title,
        score: h.score,
        snippet: h.snippet,
        url: h.url,
        date: h.date,
        ...(threadId ? { threadId } : {}),
      };
    }),
  };
}

export const searchGmailTool = tool({
  description:
    "Search the user's Gmail (already ingested into the brain) for emails matching a query. " +
    "Use natural-language or keyword queries, e.g. 'Stripe failed payment', 'job application status'.",
  inputSchema: z.object({
    query: z.string().describe("What to search for in the user's emails"),
    limit: z.number().int().min(1).max(20).default(8),
  }),
  execute: async ({ query, limit }) => formatHits(await searchGmail(query, limit)),
});

export const searchDriveTool = tool({
  description:
    "Search the user's Google Drive files (already ingested into the brain) for documents matching a query. " +
    "Use natural-language or keyword queries, e.g. 'contract draft', 'take-home submission'.",
  inputSchema: z.object({
    query: z.string().describe("What to search for in the user's Drive files"),
    limit: z.number().int().min(1).max(20).default(8),
  }),
  execute: async ({ query, limit }) => formatHits(await searchDrive(query, limit)),
});

export const searchCalendarTool = tool({
  description:
    "Search the user's Google Calendar (already ingested into the brain) for events matching a query. " +
    "Use natural-language or keyword queries, e.g. 'meeting with Nirmit', 'interview'. Covers roughly " +
    "the past month through the next 3 months of events.",
  inputSchema: z.object({
    query: z.string().describe("What to search for in the user's calendar events"),
    limit: z.number().int().min(1).max(20).default(8),
  }),
  execute: async ({ query, limit }) => formatHits(await searchCalendar(query, limit)),
});

function createDraftGmailReplyTool(accessToken: string) {
  return tool({
    description:
      "Create a DRAFT reply in the user's Gmail for a specific email thread. This ONLY saves a draft " +
      "for the user to review — it can NEVER send anything. Only call this when the user explicitly asks " +
      "you to draft/write/compose a reply to a specific email. Requires the threadId field returned on " +
      "that email's search_gmail result — call search_gmail first if you don't already have it.",
    inputSchema: z.object({
      threadId: z.string().describe("The threadId field from the search_gmail result for the email being replied to"),
      body: z.string().describe("The full plain-text body of the reply to draft"),
    }),
    execute: async ({ threadId, body }) => {
      const draft = await createDraftReply(accessToken, { threadId, body });
      return {
        status: "draft_created" as const,
        to: draft.to,
        subject: draft.subject,
        webLink: draft.webLink,
      };
    },
  });
}

/**
 * A factory, not a static object: draft_gmail_reply needs the requesting
 * user's live OAuth access token (it writes to their real Gmail), unlike
 * the two search tools which go through the shared remote gbrain server
 * with its own static token. Called with no token (the eval harness has no
 * real user session) simply omits the draft tool — automated eval runs
 * should never create real Gmail drafts as a side effect.
 */
export function createBrainTools(accessToken?: string): {
  search_gmail: typeof searchGmailTool;
  search_drive: typeof searchDriveTool;
  search_calendar: typeof searchCalendarTool;
  draft_gmail_reply?: ReturnType<typeof createDraftGmailReplyTool>;
} {
  return {
    search_gmail: searchGmailTool,
    search_drive: searchDriveTool,
    search_calendar: searchCalendarTool,
    ...(accessToken ? { draft_gmail_reply: createDraftGmailReplyTool(accessToken) } : {}),
  };
}
