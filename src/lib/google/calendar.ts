import { google, calendar_v3 } from "googleapis";

export type CalendarEvent = {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: string; // ISO 8601 (or YYYY-MM-DD for all-day events)
  end: string;
  attendees: string[];
  organizer: string;
  htmlLink: string;
};

function getClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth });
}

function toCalendarEvent(event: calendar_v3.Schema$Event): CalendarEvent {
  return {
    id: event.id!,
    summary: event.summary || "(no title)",
    description: event.description ?? "",
    location: event.location ?? "",
    start: event.start?.dateTime ?? event.start?.date ?? "",
    end: event.end?.dateTime ?? event.end?.date ?? "",
    attendees: (event.attendees ?? [])
      .map((a) => a.email)
      .filter((email): email is string => Boolean(email)),
    organizer: event.organizer?.email ?? "",
    htmlLink: event.htmlLink ?? "",
  };
}

/**
 * Calendar has no natural "most recent N" like Gmail/Drive — events are
 * relative to now, not to when they were created/modified — so this windows
 * by time instead: 30 days back (covers "what did I have last week")
 * through 90 days forward (covers "what's my next X"). singleEvents expands
 * recurring events into individual instances so each occurrence is its own
 * searchable page rather than one opaque recurrence rule.
 */
export async function listEvents(accessToken: string, maxResults = 100): Promise<CalendarEvent[]> {
  const calendar = getClient(accessToken);
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: new Date(now - 30 * DAY_MS).toISOString(),
    timeMax: new Date(now + 90 * DAY_MS).toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: "startTime",
  });

  return (res.data.items ?? [])
    .filter((e) => e.status !== "cancelled")
    .map(toCalendarEvent);
}

/**
 * Personal events only — no `attendees` field anywhere in this file's
 * write path. Google Calendar sends real invite emails the moment an
 * event with attendees is created/updated, the same class of
 * "sends something to a real third party" risk this app deliberately
 * avoids for Gmail (drafts are never auto-sent). Confirmed with the user
 * (2026-08-10) before building this: these tools only ever touch the
 * user's own calendar.
 */
export async function createEvent(
  accessToken: string,
  { summary, startDateTime, endDateTime, description, location }: {
    summary: string;
    startDateTime: string;
    endDateTime: string;
    description?: string;
    location?: string;
  },
): Promise<CalendarEvent> {
  const calendar = getClient(accessToken);
  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary,
      description,
      location,
      start: { dateTime: startDateTime },
      end: { dateTime: endDateTime },
    },
  });
  return toCalendarEvent(res.data);
}

export async function updateEvent(
  accessToken: string,
  { eventId, summary, startDateTime, endDateTime, description, location }: {
    eventId: string;
    summary?: string;
    startDateTime?: string;
    endDateTime?: string;
    description?: string;
    location?: string;
  },
): Promise<CalendarEvent> {
  const calendar = getClient(accessToken);
  const res = await calendar.events.patch({
    calendarId: "primary",
    eventId,
    requestBody: {
      ...(summary !== undefined ? { summary } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(location !== undefined ? { location } : {}),
      ...(startDateTime !== undefined ? { start: { dateTime: startDateTime } } : {}),
      ...(endDateTime !== undefined ? { end: { dateTime: endDateTime } } : {}),
    },
  });
  return toCalendarEvent(res.data);
}

export async function deleteEvent(accessToken: string, eventId: string): Promise<void> {
  const calendar = getClient(accessToken);
  await calendar.events.delete({ calendarId: "primary", eventId });
}
