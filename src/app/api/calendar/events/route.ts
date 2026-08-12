import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { listEvents, createEvent } from "@/lib/google/calendar";
import { triggerResync } from "@/lib/brain/trigger-resync";

/** Lists events for whatever month/week the /calendar page currently has displayed. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end) {
    return NextResponse.json({ error: "Missing start/end query params" }, { status: 400 });
  }

  try {
    const events = await listEvents(session.accessToken, { timeMin: start, timeMax: end, maxResults: 250 });
    return NextResponse.json({ events });
  } catch (err) {
    console.error("Calendar range fetch failed", err);
    return NextResponse.json({ error: "Failed to load calendar events" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: 401 });
  }

  const body = await req.json();
  const { summary, startDateTime, endDateTime, description, location } = body ?? {};
  if (!summary || !startDateTime || !endDateTime) {
    return NextResponse.json({ error: "summary, startDateTime, and endDateTime are required" }, { status: 400 });
  }

  try {
    const event = await createEvent(session.accessToken, {
      summary,
      startDateTime,
      endDateTime,
      description,
      location,
    });
    triggerResync(new URL(req.url).origin, !process.env.VERCEL);
    return NextResponse.json({ event });
  } catch (err) {
    console.error("Calendar event create failed", err);
    return NextResponse.json({ error: "Failed to create calendar event" }, { status: 500 });
  }
}
