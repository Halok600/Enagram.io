import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { updateEvent, deleteEvent } from "@/lib/google/calendar";
import { triggerResync } from "@/lib/brain/trigger-resync";

type RouteContext = { params: Promise<{ eventId: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: 401 });
  }

  const { eventId } = await params;
  const body = await req.json();
  const { summary, startDateTime, endDateTime, description, location } = body ?? {};

  try {
    const event = await updateEvent(session.accessToken, {
      eventId,
      summary,
      startDateTime,
      endDateTime,
      description,
      location,
    });
    triggerResync(new URL(req.url).origin, !process.env.VERCEL);
    return NextResponse.json({ event });
  } catch (err) {
    console.error("Calendar event update failed", err);
    return NextResponse.json({ error: "Failed to update calendar event" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: 401 });
  }

  const { eventId } = await params;

  try {
    await deleteEvent(session.accessToken, eventId);
    triggerResync(new URL(req.url).origin, !process.env.VERCEL);
    return NextResponse.json({ status: "deleted" });
  } catch (err) {
    console.error("Calendar event delete failed", err);
    return NextResponse.json({ error: "Failed to delete calendar event" }, { status: 500 });
  }
}
