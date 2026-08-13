import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-guard";
import { listRecentMessages } from "@/lib/google/gmail";
import { listRecentFiles } from "@/lib/google/drive";
import { listEvents } from "@/lib/google/calendar";
import {
  gmailMessageToBrainDocument,
  driveFileToBrainDocument,
  calendarEventToBrainDocument,
} from "@/lib/brain/normalize";
import { writeBrainPages } from "@/lib/brain/write";
import { brainDocumentPagePath } from "@/lib/brain/markdown";
import { commitBrainRepo, syncBrain } from "@/lib/brain/gbrain-cli";
import { linkRelatedDocuments } from "@/lib/brain/gbrain-remote";

const DEFAULT_MAX_PER_SOURCE = 50;

export async function POST() {
  // Ingestion shells out to a local gbrain binary + local brain/ git repo —
  // neither exists on Vercel's serverless functions. The UI hides the
  // re-sync button there (see page.tsx), but guard the route itself too.
  if (process.env.VERCEL) {
    return NextResponse.json(
      { error: "Ingestion only runs from local dev — this deployment reads the same shared brain." },
      { status: 501 },
    );
  }

  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const [messages, files, events] = await Promise.all([
      listRecentMessages(session.accessToken, DEFAULT_MAX_PER_SOURCE),
      listRecentFiles(session.accessToken, DEFAULT_MAX_PER_SOURCE),
      listEvents(session.accessToken),
    ]);

    const docs = [
      ...messages.map(gmailMessageToBrainDocument),
      ...files.map(driveFileToBrainDocument),
      ...events.map(calendarEventToBrainDocument),
    ];

    const paths = await writeBrainPages(docs);
    const commit = await commitBrainRepo(
      `ingest: ${messages.length} gmail message(s), ${files.length} drive file(s), ${events.length} calendar event(s)`,
    );
    const syncLog = await syncBrain();

    // Only worth relinking when something actually changed — most auto-syncs
    // (feature #3, fires on every page load) find nothing new, and linking
    // is a sequential write burst against the remote server that shouldn't
    // run on every no-op sync.
    const linking = commit.committed
      ? await linkRelatedDocuments(
          docs.map((doc) => ({
            slug: brainDocumentPagePath(doc).replace(/\.md$/, ""),
            source: doc.source,
            participants: doc.participants,
          })),
          session.user?.email ?? "",
        )
      : { linksCreated: 0, linksAttempted: 0 };

    return NextResponse.json({
      gmailCount: messages.length,
      driveCount: files.length,
      calendarCount: events.length,
      pagesWritten: paths.length,
      committed: commit.committed,
      linksCreated: linking.linksCreated,
      syncLog,
    });
  } catch (err) {
    console.error("Ingestion sync failed", err);
    return NextResponse.json({ error: "Ingestion sync failed" }, { status: 500 });
  }
}
