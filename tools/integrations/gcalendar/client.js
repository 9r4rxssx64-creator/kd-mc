// kdmc-gcalendar — Client Google Calendar (ES Module)
// Auteur : Kevin DESARZENS (U11804) — Casino de Monte-Carlo
//
// Variables d'environnement requises :
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REDIRECT_URI
//   GOOGLE_OAUTH_TOKEN   (JSON stringifié des tokens OAuth avec scope calendar.events)
//   GCAL_CALENDAR_ID     (optionnel — "primary" par défaut)
//
// Scope : https://www.googleapis.com/auth/calendar.events

import { google } from "googleapis";

const CAL_ID = process.env.GCAL_CALENDAR_ID || "primary";
const TZ = process.env.GCAL_TIMEZONE || "Europe/Monaco";

// ---------- Auth ----------
function _getAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/oauth2callback";
  const tokenJson = process.env.GOOGLE_OAUTH_TOKEN;

  if (!clientId || !clientSecret) {
    throw new Error("[gcalendar] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants — voir setup.md");
  }
  if (!tokenJson) {
    throw new Error("[gcalendar] GOOGLE_OAUTH_TOKEN manquant — lancer le flow OAuth (voir setup.md)");
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  try {
    oauth2.setCredentials(JSON.parse(tokenJson));
  } catch (e) {
    throw new Error("[gcalendar] GOOGLE_OAUTH_TOKEN invalide : " + e.message);
  }
  return oauth2;
}

function _cal() {
  return google.calendar({ version: "v3", auth: _getAuthClient() });
}

// ---------- Helpers ----------
function _toRFC3339(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  if (typeof d === "string") return new Date(d).toISOString();
  throw new Error("Date invalide (Date ou ISO string attendu)");
}

function _startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function _endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// ---------- Public API ----------

/**
 * Crée un événement sur l'agenda.
 * @param {object} params
 * @param {string} params.summary - Titre
 * @param {Date|string} params.start - Date/heure début
 * @param {Date|string} params.end - Date/heure fin
 * @param {string} [params.description]
 * @param {Array<string>} [params.attendees] - Emails
 * @returns {Promise<object>} Event
 */
export async function createEvent({ summary, start, end, description, attendees } = {}) {
  try {
    if (!summary || !start || !end) {
      throw new Error("summary, start, end requis");
    }
    const cal = _cal();
    const res = await cal.events.insert({
      calendarId: CAL_ID,
      sendUpdates: attendees?.length ? "all" : "none",
      requestBody: {
        summary,
        description,
        start: { dateTime: _toRFC3339(start), timeZone: TZ },
        end: { dateTime: _toRFC3339(end), timeZone: TZ },
        attendees: (attendees || []).map(email => ({ email })),
      },
    });
    return res.data;
  } catch (e) {
    throw new Error(`[gcalendar.createEvent] ${e.message}`);
  }
}

/**
 * Liste les événements entre deux dates.
 * @param {Date|string} timeMin
 * @param {Date|string} timeMax
 * @returns {Promise<Array<object>>}
 */
export async function listEvents(timeMin, timeMax) {
  try {
    const cal = _cal();
    const res = await cal.events.list({
      calendarId: CAL_ID,
      timeMin: _toRFC3339(timeMin || new Date()),
      timeMax: timeMax ? _toRFC3339(timeMax) : undefined,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
    });
    return res.data.items || [];
  } catch (e) {
    throw new Error(`[gcalendar.listEvents] ${e.message}`);
  }
}

/**
 * Met à jour un événement (patch partiel).
 * @param {string} eventId
 * @param {object} updates - {summary?, start?, end?, description?, attendees?}
 */
export async function updateEvent(eventId, updates = {}) {
  try {
    if (!eventId) throw new Error("eventId requis");
    const cal = _cal();
    const body = {};
    if (updates.summary !== undefined) body.summary = updates.summary;
    if (updates.description !== undefined) body.description = updates.description;
    if (updates.start) body.start = { dateTime: _toRFC3339(updates.start), timeZone: TZ };
    if (updates.end) body.end = { dateTime: _toRFC3339(updates.end), timeZone: TZ };
    if (updates.attendees) body.attendees = updates.attendees.map(email => ({ email }));

    const res = await cal.events.patch({
      calendarId: CAL_ID,
      eventId,
      sendUpdates: updates.attendees?.length ? "all" : "none",
      requestBody: body,
    });
    return res.data;
  } catch (e) {
    throw new Error(`[gcalendar.updateEvent] ${e.message}`);
  }
}

/**
 * Supprime un événement.
 * @param {string} eventId
 */
export async function deleteEvent(eventId) {
  try {
    if (!eventId) throw new Error("eventId requis");
    const cal = _cal();
    await cal.events.delete({ calendarId: CAL_ID, eventId, sendUpdates: "all" });
    return { deleted: true, eventId };
  } catch (e) {
    throw new Error(`[gcalendar.deleteEvent] ${e.message}`);
  }
}

/**
 * Événements d'aujourd'hui (timezone Europe/Monaco).
 */
export async function getEventsToday() {
  try {
    return await listEvents(_startOfDay(), _endOfDay());
  } catch (e) {
    throw new Error(`[gcalendar.getEventsToday] ${e.message}`);
  }
}

/**
 * Événements des 7 prochains jours.
 */
export async function getEventsThisWeek() {
  try {
    const start = _startOfDay();
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return await listEvents(start, _endOfDay(end));
  } catch (e) {
    throw new Error(`[gcalendar.getEventsThisWeek] ${e.message}`);
  }
}

export default {
  createEvent, listEvents, updateEvent, deleteEvent,
  getEventsToday, getEventsThisWeek,
};
