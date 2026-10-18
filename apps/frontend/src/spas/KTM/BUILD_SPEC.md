# Personal Kanban: Build Spec (v2, aligned to my app template)

Handoff for Claude Code in VS Code. Read this whole file, then work through the phases at the bottom. Stop at the end of each phase and show me what works.

This spec replaces an earlier React/Vite draft. I have an existing app template (a no-build, single-file vanilla JS app on Firebase). The kanban must follow that template's conventions. The template's own files are in `template/` and `reference/template-app.html`.

## 0. Read first: what the template is

Files, all served statically (no bundler, no npm for the app):

| File | Role | Kanban plan |
|---|---|---|
| `index.html` | Redirects to `app.html`, keeping query and hash | Copy as is |
| `app.html` | The whole app: inline CSS (CSS variables), markup, inline `<script>` | New app, same structure and conventions |
| `firebase-config.js` | `const firebaseConfig = {...}` | Placeholder only. I paste my own config. |
| `dev-middleware.js` | Dev-server middleware fixing `app.html/<uuid>` URLs | Copy as is (needed when sharing is built) |
| `firebase.json` | Firestore only, `nam5`, no hosting, plus a `functions` block | Firestore only. Drop `functions`. |
| `firestore.rules`, `firestore.indexes.json` | Owner-only private docs, token-based public docs | New rules, see §5 |
| `ai.js`, `ai-config.js` | Anthropic proxy seam for the other app | **Do not use.** No AI in this app. |

Conventions in `reference/template-app.html` to follow (read these parts before coding):

- **Libraries:** Firebase JS SDK **compat 11.6.0** via `<script>` tags from `gstatic.com` (app, auth, firestore). DOMPurify 3.1.5 from jsdelivr. Nothing else.
- **Boot:** `body.auth-pending` hides the UI until `onAuthStateChanged` fires. `showState('app' | 'signin' | 'error')` switches screens. Signed-out view is a centered card with a Google button and an error line.
- **Auth:** Google via `signInWithPopup` (preferred; the template documents why redirect silently fails on localhost with blocked third-party storage). Falls back to redirect only on `auth/popup-blocked`. `fmtAuthErr` explains `auth/unauthorized-domain`. `signOut` flushes any pending save first.
- **State and rendering:** module-level `STATE` object plus a `render()` that builds HTML strings. All user text goes through `escapeHtml()` or `safe()` (DOMPurify). Never put raw user text into `innerHTML`.
- **Saving:** debounce timer → `saveNow()`, `cloudReady` gate, ids captured before any `await`, and a top-bar sync indicator (`syncStatus('Saving…'|'Saved'|'Save failed'|'Synced'|'Local only', 'warn'|'ok'|'err')`). Reuse that indicator.
- **Chrome:** 48px dark top bar (`.gbar`: brand, sync status, avatar menu), `.btn` / `.btn-p` / `.btn-sm`, `.dd-pop` dropdown, modals, and a toast (`#toast`, `toast(msg)`).
- **Sharing plumbing:** `genToken()` / `isToken()`, `?share=<uuid>` parsing, an inline path-fix script, `readonlyMode` + `body.readonly` CSS + a read-only banner, and `publicDocuments/{token}` snapshots keyed by an unguessable UUID.

Known problems in the template. Do not copy them:

1. **UTC date bug.** `todayStr()` and `nowISOStr()` use `toISOString()`, which returns tomorrow's date after about 8pm Eastern. Kanban due dates and "today" must use the browser's **local** date. Write a local `todayLocal()` and `toLocalISODate()`; never derive a due date from `toISOString()`.
2. **Whole-document saves with last-write-wins** (the template has a TODO about it). I use phone and desktop, so cards are **one Firestore doc each**, not an array inside one doc.
3. **`publicDocuments` allows `read: if true`,** which also allows *listing* every shared doc. In the kanban rules, split into `get: if true` and `list: if false`.

## 1. Product in one paragraph

A single-user, custom-built personal kanban app. One board collates work, ventures, personal and kids' stuff via editable **contexts** that can be filtered one at a time or mixed. Hard due dates matter and push one-way to Google Calendar. WIP limits only warn, never block. Manual capture and manual weekly review. Responsive web (desktop and phone), online only. Sharing is not a feature yet, but scaffolding must exist (§5.3).

Reference wireframes (clickable) are in `reference/`. They show layout and behavior; the template shows code conventions and look. The `.dc.html` files need their editor runtime to render, so read them as source (see `renderVals()` in each for the interaction logic and sample data).

## 2. Non-goals (do not build)

- AI of any kind (no `ai.js`, no proxy, no Cloud Functions)
- Cycle-time, throughput or burndown metrics
- Email/Slack/chat-to-card capture
- Offline mode or PWA install (do not call `enablePersistence`)
- Assignees, comments, story points, sprints
- Any sharing UI (scaffolding only, §5.3)
- Custom fields beyond §6. Past tools failed for being too thin, so build all of §6, but nothing more.
- Email/password sign-in (the template has it; kanban is Google only)

## 3. Stack and rules

- Plain HTML/CSS/JS in the template's style. **No build step, no framework, no npm dependencies for the app.** Ask me before adding any library.
- Firebase compat 11.6.0 and DOMPurify 3.1.5 exactly as the template loads them.
- Drag-and-drop: native HTML5 drag events on desktop (no library). Phone uses the Move sheet instead.
- Tests: pure logic lives in `kanban-logic.js` (plain functions, attached to `window.KB` and also `module.exports` when `module` exists) and is tested with Node's built-in runner: `node --test`. No test dependencies.
- Dates: `dueDate` is a local `YYYY-MM-DD` string. Timestamps use `firebase.firestore.FieldValue.serverTimestamp()`.
- Do not hard-code my timezone; use the browser's.

## 4. Information architecture

Template top bar on every screen (brand, sync status, avatar menu with Sign out). Below it, the wireframe layout:

- **Desktop (≥1024px):** left rail (Board, Today, Calendar, Review, Contexts), header row with context filter chips and quick add, content area.
- **Phone (<1024px):** header, filter chips row, content, bottom tabs (Board, Today, Calendar, Review), FAB for quick add, sliders icon for Contexts.

Default landing: Board. Views are switched via `STATE.view`; no router. Brand name is a placeholder, `Kanban`, until I decide.

## 5. Data model (Firestore)

Follows the template's `users/{uid}/documents/{docId}` path so the existing ownership pattern carries over.

### 5.1 Documents

```
users/{uid}/documents/{boardId}                       // v1: exactly one with type "kanban-board"
  type: "kanban-board"
  name: "My Board"
  schemaVersion: 1
  columns: [ {id, name, wipLimit|null} ]               // backlog, ready, doing(3), waiting, done
  contexts: [ {id, name, color, visible} ]             // array order = display order
  aging: { doingDays: 5, waitingDays: 4 }
  calendar: { calendarId: string|null, lastSyncAt: ts|null }
  shareToken: uuid                                     // generated at creation, unused in v1 (§5.3)
  createdAt, updatedAt

users/{uid}/documents/{boardId}/cards/{cardId}         // one doc per card
  title
  contextId
  status: "backlog" | "ready" | "doing" | "waiting" | "done"
  rank: number                                         // order within column; midpoint insertion
  dueDate: "YYYY-MM-DD" | null                         // LOCAL date string
  priority: "expedite" | "fixed" | "standard" | "someday"
  blocked: bool
  waitingOn: string
  statusChangedAt: ts                                  // drives aging; reset on every status change
  checklist: [ {id, text, done} ]
  recurrence: null | { freq: "daily"|"weekly"|"monthly", interval: number }
  calendarSync: bool                                   // default true when dueDate set
  calendarEventId: string|null
  calSig: string|null                                  // hash of title+dueDate+context at last push; skip no-op updates
  notes: string
  completedAt: ts|null
  archived: bool                                       // "Drop" = archived:true, never a hard delete
  createdAt, updatedAt
```

Defaults on first sign-in (no board found): create the board with columns Backlog, Ready, Doing (wipLimit 3), Waiting, Done and contexts Work `#2F6FDB`, Ventures `#7A4FC2`, Personal `#1F8A70`, Kids `#C2467A` (all visible). Find the board with `where('type','==','kanban-board').limit(1)`. No sample cards.

Data loading: one `onSnapshot` on the board doc and one on `cards` where `archived == false`. All cards in memory (personal scale). Done cards older than 14 days are hidden from the board, not deleted. Writes are per-field `set(..., {merge:true})` with a short debounce (~600ms) for text inputs and immediate for clicks.

### 5.2 Security rules

`template/firestore.rules` is written for this model: owner-only recursive match on `users/{uid}/documents/**`, and `publicDocuments` with `get` open, `list` closed, owner-only create/update/delete. Do not weaken it.

**Firebase project:** use a **new** Firebase project for the kanban. Deploying `firestore.rules` replaces the project's entire ruleset, and the template's `firebase-config.js` points at the other app's project. If I tell you to reuse an existing project, stop and merge the rules instead of overwriting.

### 5.3 Sharing scaffolding (build the plumbing, not the feature)

- Generate and store `shareToken` on the board (copy `genToken`/`isToken`).
- Add `const SHARING_ENABLED = false;`. Write `buildShareUrl`, `parseShareFromUrl`, and a `syncPublic()` that would write `{ownerUid, docId, payload:{board, cards (non-archived)}, updatedAt}` to `publicDocuments/{token}`. While the flag is false, nothing may read `?share=` and **nothing may write to `publicDocuments`.** Personal data must not be exposed in v1.
- Keep the template's inline path-fix script, `body.readonly` CSS and a hidden `#ro-banner`, so a read-only viewer can be added later.
- Cards carry `contextId`, so a future "share only Work" snapshot is a filter, not a migration.
- No share button or menu item in v1.

## 6. Features and behavior

### 6.1 Board view
- Five columns with name and count; Doing shows `count/limit`.
- **WIP warning:** if the column's total (all contexts, ignoring filters) exceeds `wipLimit`, the header turns amber and shows "Over limit (warn only)". Never block a move.
- Cards respect the active context filter. WIP counts do not.
- **Card face:** context dot and name, title, due date (red and "(overdue)" if past and not done), checklist progress, REPEATS tag, BLOCKED tag, EXPEDITE tag, amber aging badge when status is doing or waiting and age ≥ threshold, and "Waiting on X / Nd" in the Waiting column.
- Desktop: native drag between and within columns, plus ← → buttons on each card (the keyboard path).
- Phone: column tabs with counts (one column at a time), "Move to…" bottom sheet, "Mark done". No drag.
- Moving a card sets `statusChangedAt = now`. Moving to Done sets `completedAt`; moving out clears it.

### 6.2 Card detail (drawer on desktop, bottom sheet on phone)
Title (inline edit), context chips, status chips, waiting-on field (Waiting only; shows "In this column for N days"), due date with -1d / +1d / +1w / Clear and a native `<input type="date">`, class-of-service chips (Expedite / Fixed date / Standard / Someday), toggles for Blocked, Repeats weekly, On calendar, checklist (add, toggle, rename, delete), notes, Drop and Mark done. Autosave (no Save button) with the sync indicator.

### 6.3 Quick add
- Desktop: header input, context select, Add button; Enter submits. Phone: FAB opens a sheet with title input, context chips, due chips (No date / Today / Tomorrow / Next week).
- New cards land in Backlog.
- **Shorthand parser** (pure, unit-tested): `#ctx` matches a context by case-insensitive prefix; `!today`, `!tom`/`!tomorrow`, `!mon`…`!sun` (next occurrence, never today), `!+Nd` / `!Nd`. Matched tokens are removed from the title; unmatched `#` or `!` tokens stay. Shorthand overrides the selected chip. Weekday math uses the **local** date.
- Empty title: do nothing, show a toast.

### 6.4 Today view
Sections, hidden when empty: **Overdue**, **Due today**, **In progress** (Doing cards not already listed), **Next 3 days**. Rows: checkbox (mark done), context, status, title, BLOCKED tag, due. Row click opens the card. Empty state: "All clear."

### 6.5 Calendar view
Month grid with prev / next / Today. Cards with a `dueDate` and not done appear as context-colored chips (max 3 per day, then "+n more"); clicking a chip opens the card. Phone: compact month with dots; tapping a day lists its cards below. Sync panel: "One-way push" toggle, "Sync now (N cards)", and a disabled "Two-way sync (later)" button.

### 6.6 Google Calendar sync (one-way push)
Rules: only cards with `dueDate`, `calendarSync`, `status != done`, `archived == false` have events. Events are **all-day** (Calendar's all-day `end.date` is exclusive, so end = due + 1 day), titled with the card title, with the context name in the description. Completing, dropping, clearing the date, or turning the toggle off deletes the event and clears `calendarEventId`. A changed title/date/context updates it (compare `calSig`). Details in Phase 3.

### 6.7 Weekly review (manual, step-through)
Five steps with a clickable stepper showing counts, Back / Next, and a completion screen:
1. **Overdue** (not done, due before today)
2. **Stale in Doing** (age ≥ `aging.doingDays`)
3. **Long in Waiting** (age ≥ `aging.waitingDays`)
4. **Backlog triage** (all Backlog)
5. **Next 7 days** (due today through +7d)

Actions: steps 1, 2, 3, 5 → Done / Push +7d (from today if overdue) / To Backlog. Step 4 → To Ready / Drop. Rows disappear as handled. Review ignores the context filter. No reminders or scheduling.

### 6.8 Contexts management
List with swatch (tap cycles the 6-color palette), editable name, card count, up/down reorder, Shown/Hidden toggle, and a "New context" button. Stored in the board doc's `contexts` array. Hidden contexts drop off Board, Today and Calendar but keep their cards and still appear in Review. No delete in v1. Filter chips are local UI state: with All active, tapping a chip solos it; otherwise tapping toggles; if the last chip is turned off, revert to All. Effective visibility = filter state AND `visible`.

### 6.9 Recurring cards
When a recurring card moves to Done, create the next instance (Backlog, or Ready if the original was Ready or Doing) with `dueDate` advanced by the rule (clamp month ends), same context, title and checklist (all unchecked), `statusChangedAt = now`. Keep the completed card in Done. Unit-test the date advance. UI offers a weekly toggle in v1; the model supports daily/weekly/monthly.

### 6.10 Auth
Google sign-in only, per the template. First sign-in seeds per §5.1.

## 7. Visual design

Look and feel: **match the template** (system-ui, 13px base, the CSS variables in `reference/template-app.html`, dark `.gbar`, its buttons, dropdowns, modals and toast). Use the wireframe for layout and behavior. Where a wireframe hex differs from the template's tokens, the template wins. Add only these tokens:

```
--wip-bg:#fef3c7; --wip-line:#d69e2e; --wip-ink:#7a4b00;      /* WIP warning, aging badge */
--ctx-1:#2f6fdb; --ctx-2:#7a4fc2; --ctx-3:#1f8a70; --ctx-4:#c2467a; --ctx-5:#b7791f; --ctx-6:#5b6770;
```

Use the template's `--warn` family for overdue, blocked and Drop. Always show the context name next to its dot (color alone is not enough). Light theme only; keep every color a CSS variable so dark mode is a later override. No emoji, no gradients.

Accessibility (stricter than the template): real `<button>`, `<a>` and `<input>` elements instead of clickable `div`/`tr`; visible focus; `aria-label` on icon buttons; contrast ≥ 4.5:1; touch targets ≥ 44px on phone; full keyboard path to move a card (the ← → buttons) and to use the drawer.

## 8. File layout

```
index.html                 (template, unchanged)
app.html                   (UI, CSS, wiring; follow template structure)
kanban-logic.js            (pure: parseQuickAdd, rankBetween, nextRecurrence, agingOf, reviewSteps, todaySections, syncPlan)
gcal.js                    (Calendar REST helpers; no UI)
firebase-config.js         (I paste my own config)
dev-middleware.js          (template, unchanged)
firebase.json  firestore.rules  firestore.indexes.json
tests/kanban-logic.test.js (node --test)
```

`app.html` will be large like the template's, which is fine. Keep sections banner-commented the way the template does.

## 9. Build phases

**Phase 0: Setup.** Copy everything from `template/` into the repo root. Walk me through creating a new Firebase project: enable Google sign-in, add `localhost` and `127.0.0.1` to Auth authorized domains, create Firestore in `nam5`, paste the web config into `firebase-config.js`, `firebase deploy --only firestore`. Confirm sign-in works on a bare page before building UI.

**Phase 1: Core board.** Boot/auth flow per template, board seed, snapshots, Board view, native drag-and-drop plus ← → buttons, WIP warning, card drawer (desktop) and sheet (phone) with autosave and sync indicator, quick add with parser, context filter chips, responsive layout (column tabs, Move sheet, FAB). Tests for parser, rank, aging. **Stop and demo.**

**Phase 2: Views.** Today, Calendar (grid only), Contexts management, Review flow, recurring cards. Tests for recurrence, review and today selectors. **Stop and demo.**

**Phase 3: Google Calendar sync (client-side, one-way).** The template has no Cloud Functions requirement and neither should this.
- Add a second `GoogleAuthProvider` with the narrow scope `https://www.googleapis.com/auth/calendar.app.created` (verify the current scope name in Google's docs before using it).
- "Sync now" is a user click, so it can open a popup: call `currentUser.reauthenticateWithPopup(calProvider)` and read `result.credential.accessToken`. Keep the token **in memory only**. Never write it to Firestore or localStorage. If the popup is blocked, toast and stop.
- Create or reuse a secondary calendar named "Kanban" and store its id in `board.calendar.calendarId`.
- `syncPlan(cards)` is pure and unit-tested: returns create / update / delete operations from the rules in §6.6. Execute with small concurrency; on a 404 for an existing event id, recreate it. Show last sync time and any error in the sync panel.
- Tell me what to switch on in Google Cloud: enable the Calendar API, add the scope under the OAuth consent screen, and add me as a test user if the app is in testing mode.
- Background sync would need a Cloud Function and a stored refresh token. Do not build it unless I ask.

**Phase 4: Hardening.** Empty/error/loading states, toasts, keyboard pass, a manual accessibility check, README (setup, config, how to run tests, how I run the dev server). Ask me where this should be hosted before touching deploy config; the template's `firebase.json` has no hosting block.

## 10. Working agreements

- Ask before adding any library or file type not listed here.
- Do not add features outside §6; list anything missing at the end of the phase instead.
- Small, reviewable commits per feature.
- After each phase tell me: what works, what is stubbed, how to run it, what you were unsure about.
- If the wireframe, the template and this spec disagree: this spec wins on behavior, the template wins on code conventions and look. Flag the conflict.
- Never commit secrets. Treat anything in `firebase-config.js` as mine.

## 11. Decisions I still owe you (defaults assumed)

- Firebase project: new one (recommended). Tell me if you should reuse an existing one.
- Hosting location: unknown; Phase 4 asks.
- Brand name: `Kanban` placeholder.
- Landing screen: Board. Theme: light only.
- Calendar sync starts one-way; two-way is later.
