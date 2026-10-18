// Google Calendar REST helpers. No UI, no app state — just fetch() calls
// against the Calendar v3 API using a Bearer access token obtained elsewhere
// (via the calendar-scoped OAuth popup in app.html). Not unit-tested here
// since it's pure network I/O; the pure diff/decision logic it's driven by
// (syncPlan, buildEventBody, computeCalSig) lives in kanban-logic.js instead.
(function (global) {
  'use strict';

  const API_BASE = 'https://www.googleapis.com/calendar/v3';
  const CALENDAR_SUMMARY = 'Kanban';

  async function gcalRequest(accessToken, method, path, body) {
    const res = await fetch(API_BASE + path, {
      method,
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 204) return null;
    let data = null;
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) {
      const err = new Error((data && data.error && data.error.message) || ('Calendar API error ' + res.status));
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  // Verifies the stored calendar id still exists; if missing or not yet
  // created, creates a new one. Deliberately does NOT search the user's
  // calendarList first — the calendar.app.created scope only grants access
  // to calendars this app itself created, not the ability to enumerate the
  // user's full calendar list (that 403s with "insufficient authentication
  // scopes" even though the token is otherwise valid). Storing the id on the
  // board doc the first time is what lets later syncs skip calendar creation.
  async function findOrCreateCalendar(accessToken, existingCalendarId) {
    if (existingCalendarId) {
      try {
        await gcalRequest(accessToken, 'GET', '/calendars/' + encodeURIComponent(existingCalendarId));
        return existingCalendarId;
      } catch (e) {
        if (e.status !== 404) throw e;
        // stored calendar is gone — fall through and create another
      }
    }
    const created = await gcalRequest(accessToken, 'POST', '/calendars', { summary: CALENDAR_SUMMARY });
    return created.id;
  }

  function insertEvent(accessToken, calendarId, body) {
    return gcalRequest(accessToken, 'POST', '/calendars/' + encodeURIComponent(calendarId) + '/events', body);
  }
  function updateEvent(accessToken, calendarId, eventId, body) {
    return gcalRequest(accessToken, 'PATCH', '/calendars/' + encodeURIComponent(calendarId) + '/events/' + encodeURIComponent(eventId), body);
  }
  async function deleteEvent(accessToken, calendarId, eventId) {
    try {
      await gcalRequest(accessToken, 'DELETE', '/calendars/' + encodeURIComponent(calendarId) + '/events/' + encodeURIComponent(eventId));
    } catch (e) {
      if (e.status === 404 || e.status === 410) return; // already gone — fine
      throw e;
    }
  }

  // Runs async thunks with limited concurrency (spec: "execute with small concurrency").
  async function runWithConcurrency(thunks, limit) {
    const queue = thunks.slice();
    const workers = new Array(Math.min(limit, queue.length) || 0).fill(0).map(async () => {
      while (queue.length) {
        const thunk = queue.shift();
        await thunk();
      }
    });
    await Promise.all(workers);
  }

  global.GCAL = { findOrCreateCalendar, insertEvent, updateEvent, deleteEvent, runWithConcurrency };
})(typeof window !== 'undefined' ? window : globalThis);
