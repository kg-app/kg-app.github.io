const test = require('node:test');
const assert = require('node:assert/strict');
const KB = require('../kanban-logic.js');

const CONTEXTS = [
  { id: 'work', name: 'Work' },
  { id: 'ventures', name: 'Ventures' },
  { id: 'personal', name: 'Personal' },
  { id: 'kids', name: 'Kids' }
];

// Wednesday, 2026-10-07
const WED = new Date(2026, 9, 7);

test('parseQuickAdd: plain title, no tokens', () => {
  const r = KB.parseQuickAdd('Call the vendor', CONTEXTS, 'work', WED);
  assert.equal(r.title, 'Call the vendor');
  assert.equal(r.contextId, 'work');
  assert.equal(r.dueDate, null);
});

test('parseQuickAdd: #ctx matches by case-insensitive prefix and overrides default', () => {
  const r = KB.parseQuickAdd('Call vendor #ven', CONTEXTS, 'work', WED);
  assert.equal(r.title, 'Call vendor');
  assert.equal(r.contextId, 'ventures');
});

test('parseQuickAdd: unmatched #ctx token is left in the title', () => {
  const r = KB.parseQuickAdd('Call vendor #nonexistent', CONTEXTS, 'work', WED);
  assert.equal(r.title, 'Call vendor #nonexistent');
  assert.equal(r.contextId, 'work');
});

test('parseQuickAdd: unmatched !token is left in the title', () => {
  const r = KB.parseQuickAdd('Call vendor !whenever', CONTEXTS, 'work', WED);
  assert.equal(r.title, 'Call vendor !whenever');
  assert.equal(r.dueDate, null);
});

test('parseQuickAdd: !today', () => {
  const r = KB.parseQuickAdd('Ping Sam !today', CONTEXTS, 'work', WED);
  assert.equal(r.title, 'Ping Sam');
  assert.equal(r.dueDate, KB.toLocalISODate(WED));
});

test('parseQuickAdd: !tom and !tomorrow', () => {
  const r1 = KB.parseQuickAdd('Ping Sam !tom', CONTEXTS, 'work', WED);
  const r2 = KB.parseQuickAdd('Ping Sam !tomorrow', CONTEXTS, 'work', WED);
  const expected = KB.toLocalISODate(KB.addDays(WED, 1));
  assert.equal(r1.dueDate, expected);
  assert.equal(r2.dueDate, expected);
});

test('parseQuickAdd: !+Nd and !Nd', () => {
  const r1 = KB.parseQuickAdd('Follow up !+3d', CONTEXTS, 'work', WED);
  const r2 = KB.parseQuickAdd('Follow up !5d', CONTEXTS, 'work', WED);
  assert.equal(r1.dueDate, KB.toLocalISODate(KB.addDays(WED, 3)));
  assert.equal(r2.dueDate, KB.toLocalISODate(KB.addDays(WED, 5)));
});

test('parseQuickAdd: weekday shorthand never returns today', () => {
  // WED is a Wednesday; !wed must resolve to next Wednesday (+7), not today.
  const r = KB.parseQuickAdd('Standup !wed', CONTEXTS, 'work', WED);
  assert.equal(r.dueDate, KB.toLocalISODate(KB.addDays(WED, 7)));
});

test('parseQuickAdd: weekday shorthand finds the next occurrence forward', () => {
  // WED is Wednesday; !fri should be +2 days.
  const r = KB.parseQuickAdd('Report due !fri', CONTEXTS, 'work', WED);
  assert.equal(r.dueDate, KB.toLocalISODate(KB.addDays(WED, 2)));
});

test('parseQuickAdd: shorthand tokens can appear in any order and combine', () => {
  const r = KB.parseQuickAdd('#kids Buy gift !tom', CONTEXTS, 'work', WED);
  assert.equal(r.title, 'Buy gift');
  assert.equal(r.contextId, 'kids');
  assert.equal(r.dueDate, KB.toLocalISODate(KB.addDays(WED, 1)));
});

test('parseQuickAdd: empty/whitespace input yields empty title', () => {
  const r = KB.parseQuickAdd('   ', CONTEXTS, 'work', WED);
  assert.equal(r.title, '');
});

test('rankBetween: empty column', () => {
  assert.equal(KB.rankBetween(null, null), 1000);
});

test('rankBetween: insert at start', () => {
  const r = KB.rankBetween(null, 500);
  assert.ok(r < 500);
});

test('rankBetween: insert at end', () => {
  const r = KB.rankBetween(500, null);
  assert.ok(r > 500);
});

test('rankBetween: insert between two cards', () => {
  const r = KB.rankBetween(100, 200);
  assert.ok(r > 100 && r < 200);
});

test('agingOf: same local day is zero', () => {
  const now = new Date(2026, 9, 7, 23, 0);
  const changed = new Date(2026, 9, 7, 2, 0);
  assert.equal(KB.agingOf(changed, now), 0);
});

test('agingOf: counts whole calendar days, not 24h windows', () => {
  const now = new Date(2026, 9, 10, 1, 0);
  const changed = new Date(2026, 9, 5, 23, 0);
  assert.equal(KB.agingOf(changed, now), 5);
});

test('agingOf: accepts a Firestore-Timestamp-like object', () => {
  const now = new Date(2026, 9, 10);
  const fakeTimestamp = { toDate: () => new Date(2026, 9, 8) };
  assert.equal(KB.agingOf(fakeTimestamp, now), 2);
});

test('toLocalISODate: zero-pads month and day', () => {
  assert.equal(KB.toLocalISODate(new Date(2026, 0, 5)), '2026-01-05');
});

// ─── Google Calendar sync (Phase 3) ───

function makeCard(overrides) {
  return Object.assign({
    id: 'c1', title: 'Call vendor', contextId: 'work', status: 'backlog',
    dueDate: null, calendarSync: false, archived: false,
    calendarEventId: null, calSig: null
  }, overrides);
}

test('eligibleForCalendar: needs dueDate, calendarSync, not done, not archived', () => {
  assert.equal(KB.eligibleForCalendar(makeCard({ dueDate: '2026-10-10', calendarSync: true })), true);
  assert.equal(KB.eligibleForCalendar(makeCard({ dueDate: null, calendarSync: true })), false);
  assert.equal(KB.eligibleForCalendar(makeCard({ dueDate: '2026-10-10', calendarSync: false })), false);
  assert.equal(KB.eligibleForCalendar(makeCard({ dueDate: '2026-10-10', calendarSync: true, status: 'done' })), false);
  assert.equal(KB.eligibleForCalendar(makeCard({ dueDate: '2026-10-10', calendarSync: true, archived: true })), false);
});

test('computeCalSig: stable for identical input, changes when title/date/context change', () => {
  const card = makeCard({ dueDate: '2026-10-10' });
  const sig1 = KB.computeCalSig(card, CONTEXTS);
  const sig2 = KB.computeCalSig(makeCard({ dueDate: '2026-10-10' }), CONTEXTS);
  assert.equal(sig1, sig2);
  assert.notEqual(sig1, KB.computeCalSig(makeCard({ dueDate: '2026-10-10', title: 'Different' }), CONTEXTS));
  assert.notEqual(sig1, KB.computeCalSig(makeCard({ dueDate: '2026-10-11' }), CONTEXTS));
  assert.notEqual(sig1, KB.computeCalSig(makeCard({ dueDate: '2026-10-10', contextId: 'kids' }), CONTEXTS));
});

test('buildEventBody: all-day end date is due + 1 day (Calendar end.date is exclusive)', () => {
  const body = KB.buildEventBody(makeCard({ dueDate: '2026-10-10', title: 'Call vendor', contextId: 'ventures' }), CONTEXTS);
  assert.equal(body.start.date, '2026-10-10');
  assert.equal(body.end.date, '2026-10-11');
  assert.equal(body.summary, 'Call vendor');
  assert.equal(body.description, 'Ventures');
});

test('buildEventBody: end date rolls over a month boundary correctly', () => {
  const body = KB.buildEventBody(makeCard({ dueDate: '2026-10-31' }), CONTEXTS);
  assert.equal(body.end.date, '2026-11-01');
});

test('syncPlan: new eligible card with no event yet is a create', () => {
  const plan = KB.syncPlan([makeCard({ dueDate: '2026-10-10', calendarSync: true })], CONTEXTS);
  assert.equal(plan.create.length, 1);
  assert.equal(plan.update.length, 0);
  assert.equal(plan.delete.length, 0);
  assert.equal(plan.create[0].cardId, 'c1');
});

test('syncPlan: eligible card with matching calSig is left alone', () => {
  const card = makeCard({ dueDate: '2026-10-10', calendarSync: true, calendarEventId: 'ev1' });
  card.calSig = KB.computeCalSig(card, CONTEXTS);
  const plan = KB.syncPlan([card], CONTEXTS);
  assert.equal(plan.create.length, 0);
  assert.equal(plan.update.length, 0);
  assert.equal(plan.delete.length, 0);
});

test('syncPlan: eligible card with stale calSig is an update', () => {
  const card = makeCard({ dueDate: '2026-10-10', calendarSync: true, calendarEventId: 'ev1', calSig: 'stale' });
  const plan = KB.syncPlan([card], CONTEXTS);
  assert.equal(plan.update.length, 1);
  assert.equal(plan.update[0].eventId, 'ev1');
});

test('syncPlan: card with an event that is no longer eligible (done) is a delete', () => {
  const card = makeCard({ dueDate: '2026-10-10', calendarSync: true, calendarEventId: 'ev1', calSig: 'x', status: 'done' });
  const plan = KB.syncPlan([card], CONTEXTS);
  assert.equal(plan.delete.length, 1);
  assert.equal(plan.delete[0].eventId, 'ev1');
});

test('syncPlan: card with an event that had its date cleared is a delete', () => {
  const card = makeCard({ dueDate: null, calendarSync: true, calendarEventId: 'ev1', calSig: 'x' });
  const plan = KB.syncPlan([card], CONTEXTS);
  assert.equal(plan.delete.length, 1);
});

test('syncPlan: never-synced, never-eligible card produces no operations', () => {
  const plan = KB.syncPlan([makeCard()], CONTEXTS);
  assert.equal(plan.create.length, 0);
  assert.equal(plan.update.length, 0);
  assert.equal(plan.delete.length, 0);
});
