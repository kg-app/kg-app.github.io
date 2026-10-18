// Pure logic for the kanban app: no DOM, no Firebase. Attached to window.KB and
// exported for `node --test`. Keep everything here free of side effects.
(function (global) {
  'use strict';

  function todayLocal() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function toLocalISODate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function addDays(date, n) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + n);
    return d;
  }

  var WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  // Shorthand quick-add parser. `#ctx` matches a context by case-insensitive
  // name prefix; `!today`, `!tom`/`!tomorrow`, `!mon`..`!sun` (next occurrence,
  // never today), `!+Nd`/`!Nd` set a due date. Matched tokens are stripped from
  // the title; tokens that don't match anything are left in place.
  function parseQuickAdd(raw, contexts, defaultContextId, today) {
    today = today || todayLocal();
    var contextId = defaultContextId;
    var dueDate = null;
    var out = [];
    String(raw || '').trim().split(/\s+/).filter(Boolean).forEach(function (word) {
      if (word.charAt(0) === '#' && word.length > 1) {
        var needle = word.slice(1).toLowerCase();
        var match = (contexts || []).find(function (c) {
          return c.name.toLowerCase().indexOf(needle) === 0;
        });
        if (match) { contextId = match.id; return; }
      }
      if (word.charAt(0) === '!' && word.length > 1) {
        var token = word.slice(1).toLowerCase();
        if (token === 'today') { dueDate = toLocalISODate(today); return; }
        if (token === 'tom' || token === 'tomorrow') { dueDate = toLocalISODate(addDays(today, 1)); return; }
        if (token.length === 3 && WEEKDAYS.indexOf(token) >= 0) {
          var wd = WEEKDAYS.indexOf(token);
          var offset = ((wd - today.getDay() + 7) % 7) || 7;
          dueDate = toLocalISODate(addDays(today, offset));
          return;
        }
        var m = token.match(/^\+?(\d+)d$/);
        if (m) { dueDate = toLocalISODate(addDays(today, parseInt(m[1], 10))); return; }
      }
      out.push(word);
    });
    return { title: out.join(' '), contextId: contextId, dueDate: dueDate };
  }

  // Midpoint rank for ordering cards within a column. Pass the ranks of the
  // card immediately before/after the insertion point, or null at either end.
  function rankBetween(before, after) {
    if (before == null && after == null) return 1000;
    if (before == null) return after - 1000;
    if (after == null) return before + 1000;
    return (before + after) / 2;
  }

  // Whole local-calendar-day age of a status change, for aging badges and the
  // "Waiting on X / Nd" line. Accepts a Firestore Timestamp, Date, or ISO string.
  function agingOf(statusChangedAt, now) {
    now = now || new Date();
    var changed = (statusChangedAt && typeof statusChangedAt.toDate === 'function')
      ? statusChangedAt.toDate()
      : new Date(statusChangedAt);
    var a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var b = new Date(changed.getFullYear(), changed.getMonth(), changed.getDate());
    return Math.round((a - b) / 86400000);
  }

  // Small deterministic string hash (FNV-1a, 32-bit, hex). Not cryptographic —
  // just enough to detect "did title/date/context change" for calSig.
  function hashStr(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  }

  function contextNameOf(contexts, contextId) {
    var c = (contexts || []).find(function (x) { return x.id === contextId; });
    return c ? c.name : '';
  }

  // §6.6: only cards with a due date, calendarSync on, not done, not archived
  // get a calendar event.
  function eligibleForCalendar(card) {
    return !!card.dueDate && !!card.calendarSync && card.status !== 'done' && !card.archived;
  }

  // Hash of title+dueDate+context, compared against the card's stored calSig
  // to skip no-op pushes.
  function computeCalSig(card, contexts) {
    return hashStr((card.title || '') + '|' + (card.dueDate || '') + '|' + contextNameOf(contexts, card.contextId));
  }

  // All-day event body. Calendar's all-day end.date is exclusive, so a
  // one-day due date needs end = due + 1 day.
  function buildEventBody(card, contexts) {
    var start = card.dueDate;
    var end = toLocalISODate(addDays(new Date(card.dueDate + 'T00:00:00'), 1));
    return {
      summary: card.title || '',
      description: contextNameOf(contexts, card.contextId),
      start: { date: start },
      end: { date: end }
    };
  }

  // Pure diff between eligible cards and their current calendar-event state.
  // Returns { create: [{cardId,sig}], update: [{cardId,eventId,sig}], delete: [{cardId,eventId}] }.
  function syncPlan(cards, contexts) {
    var create = [], update = [], del = [];
    (cards || []).forEach(function (card) {
      if (eligibleForCalendar(card)) {
        var sig = computeCalSig(card, contexts);
        if (!card.calendarEventId) create.push({ cardId: card.id, sig: sig });
        else if (card.calSig !== sig) update.push({ cardId: card.id, eventId: card.calendarEventId, sig: sig });
      } else if (card.calendarEventId) {
        del.push({ cardId: card.id, eventId: card.calendarEventId });
      }
    });
    return { create: create, update: update, delete: del };
  }

  var KB = {
    todayLocal: todayLocal,
    toLocalISODate: toLocalISODate,
    addDays: addDays,
    parseQuickAdd: parseQuickAdd,
    rankBetween: rankBetween,
    agingOf: agingOf,
    eligibleForCalendar: eligibleForCalendar,
    computeCalSig: computeCalSig,
    buildEventBody: buildEventBody,
    syncPlan: syncPlan
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = KB;
  global.KB = KB;
})(typeof window !== 'undefined' ? window : globalThis);
