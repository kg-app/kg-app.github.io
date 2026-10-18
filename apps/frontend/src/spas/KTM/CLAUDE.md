# CLAUDE.md

This repo builds a personal kanban app on my existing no-build Firebase template. Read `BUILD_SPEC.md` fully before doing anything and follow its phases in order. Layout and behavior wireframes are in `reference/`; the template's patterns are in `reference/template-app.html`.

Always:
- Plain HTML/CSS/JS in the template's style. No frameworks, no bundler, no npm dependencies for the app. Ask before adding any library.
- Firebase compat 11.6.0 and DOMPurify 3.1.5 loaded the way the template loads them.
- Escape or sanitize all user text before it touches `innerHTML` (`escapeHtml` / `safe`).
- Use the browser's LOCAL date for "today" and due dates. Never `toISOString()` for dates (the template's `todayStr()` has this bug).
- One Firestore doc per card. Do not store cards as an array in one document.
- WIP limits warn only. Never block a move.
- No AI, no metrics, no sharing UI, no offline mode, no email/password sign-in.
- Do not write to `publicDocuments` and do not read `?share=` while `SHARING_ENABLED` is false.
- Keep pure logic in `kanban-logic.js` with `node --test` tests, separate from DOM code.
- Never commit secrets. `firebase-config.js` is mine to fill in.
- Do not deploy `firestore.rules` to a Firebase project other than the new kanban project.
