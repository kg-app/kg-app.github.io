# Notes

Single-page, Zettelkasten-style markdown notes app with Firebase Auth + Firestore sync + Storage for images, deployable to GitHub Pages. Built to sit alongside the Lean Canvas app in the same `sids-awesome-notes` Firebase project.

## Features

- Create / read / update / delete notes. A note's title is derived from its content: the first heading (`# Title`), or the first few words of its first line. There is no separate title field; the list shows it with a body snippet and a muted date, grouped Pinned / Today / Yesterday / Earlier
- **Groups** (folders, one level): create / rename / delete from the sidebar (`+ New group`, group header `…`). Drag notes into a group, between groups, or onto the Ungrouped area; drag group headers to reorder; collapse a group (remembered per device). Ungrouped notes sit below a divider, in their own collapsible section. The `+ New note` button makes an ungrouped note and its ▾ caret lists groups to create one inside (each group header also has a `+`). `Move to group…` in a note's `…` menu is the touch / keyboard path. **Multi-select:** ⌘/Ctrl-click toggles a note, Shift-click selects a range, Space toggles the focused row (Enter opens it), Esc clears. The editor keeps showing the note that was opened first; dragging any selected note moves the whole selection in one write, and the selection bar's `Move to…` does the same without dragging. Pinned notes are listed once, in the global Pinned section (with a group chip). Deleting a group asks first and moves its notes to Ungrouped; it never deletes notes. Search and tag filters show a flat list with a group chip per note
- Markdown editor: single centered column by default, with an Edit / Split / Preview toggle (remembered) and an autosave indicator
- Drag-paste or file-picker image uploads, stored in Firebase Storage
- `[[` opens a note picker (arrow keys + Enter) with create-on-miss
- **Related** panel, shown whenever a note is open (collapse it with the chevron or the Related button; the choice is remembered): backlinks, unlinked mentions and similar notes, each with a context snippet. Similar notes are matched by meaning using on-device embeddings of each bullet/paragraph (transformers.js + MiniLM in a Web Worker, vectors cached in IndexedDB, switch in Settings), falling back to shared tags / keywords while the model loads. Console helper `relatedDebug()` shows scores for tuning `SEM.MIN`
- **Tags and tag colors.** A note's tags are the ones in its tag row plus any `#tag` typed in the text (shown as read-only dashed pills; click a `#tag` in the preview to filter by it). An inline tag starts a line or follows a space or `(`, and begins with a letter, so `# headings`, `#123`, `page#anchor`, hex colours like `#ff8800`, code spans/blocks and `[[links]]` are ignored. Tags match case-insensitively. **Settings** (gear next to the avatar) → **Tag colors…** opens a popover that gives each tag one of six colors (or none): the ColorBrewer Set2 palette `#66c2a5 #fc8d62 #8da0cb #e78ac3 #a6d854 #ffd92f`; tags can share a color. A note's left border in the sidebar takes the color of its tags (up to three stacked segments when its tags have different colors, in tag order), and the same colors appear on tag chips, pills and inline tags. The same hex values are used in both themes; a thin dark rim keeps the pastels visible on white. `#important`/`#revisit` (pink) and `#warning`/`#remember` (orange) are preset on first run and can be changed or cleared
- Clicking a tag chip filters the list and opens the top (most recent) matching note on desktop
- Search (all words must match, highlighted snippets, combines with the tag filter)
- Delete lives in the "…" menu and uses an undo toast (the real delete runs after ~7s); Private/Shared lock toggle; Pin (click the pin icon in the Pinned list to unpin)
- Settings (gear) holds Tag colors… and on/off switches for dark mode and semantic matching; the avatar menu holds the account email and Sign out
- Resizable sidebar (drag, or arrow keys on the handle; double-click resets)
- View-only share links (`?u=<uid>&n=<noteId>`) — no sign-in required to view, no Cloud Function needed
- Responsive: sidebar and Related panel become slide-over panels below 760px

## Firebase setup (one-time)

This reuses your existing `sids-awesome-notes` project and auth setup — no new project needed.

1. **Enable Storage** (if not already): [Firebase Console → Storage](https://console.firebase.google.com/project/sids-awesome-notes/storage) → Get started, same region as Firestore.

2. **Deploy the updated rules** (from this folder):

   ```bash
   firebase deploy --only firestore:rules,storage
   ```

   `firestore.rules` now has four collections: the existing `canvases` rule is untouched, plus `folders` (note groups, owner-only), `settings` (per-user preferences such as tag colors, owner-only) and a `notes` rule that allows anonymous read when a note's `public` field is `true`. `storage.rules` mirrors that same check via a cross-service `firestore.get()` lookup, so shared notes' images are viewable without exposing the whole bucket.

3. Authentication providers and authorized domains are already configured from the Lean Canvas setup — no changes needed there.

## GitHub Pages

Publish `index.html`, `firebase-config.js` together (same as the Lean Canvas app — a separate path/repo, or a subfolder like `/notes/`, both work).

`https://<username>.github.io/<repo>/index.html` (or `/notes/index.html` if in a subfolder)

## Local preview

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/index.html`

## Notes on the design

- **All of a user's note content loads into memory on sign-in** (one Firestore query). This is what makes `[[link]]` resolution and the backlinks panel simple — both are just in-memory scans, no extra reads or stored link index. Fine at personal-wiki scale; would need rethinking past a few thousand notes.
- **Links resolve by title text**, not a stable ID. A note answers to its derived title (first heading, or first ~8 words of its first line; the whole first line also works). Editing the heading or first line silently breaks existing `[[links]]` to it. The fix later is ID-based link resolution with an index if it starts to bite. The old per-note "Link name" field was retired: on first load after the change the app offers to delete it from existing notes, rewriting any `[[link]]` that used a link name to the note's title first.
- **Delete is a hard delete**, deferred ~7s behind an undo toast instead of a confirm dialog. Closing the tab inside that window leaves the note intact.
- **Groups** live in `users/{uid}/folders` (`name`, `order`); a note's group is its `folderId` (missing/null = ungrouped, and a `folderId` pointing at a deleted group counts as ungrouped). Moving a note only writes `folderId`, so its date and list position don't change. Needs the updated `firestore.rules` (a `folders` match) deployed, otherwise group writes fail with permission-denied.
- **Tag colors** are stored per user in `users/{uid}/settings/tagColors` (`entries: [{tag, color}]`, tag lower-cased) and mirrored in localStorage (`notes-tag-colors:<uid>`). The cloud copy wins on load; a device-only copy is pushed up. If the `settings` rule isn't deployed yet, colors still work and persist on that device, with a one-time toast. Colors are stored as names (`teal`, `orange`, `blue`, `pink`, `green`, `amber`), never hex. Names from the old nine-color palette are migrated on load (`red`→`pink`, `purple`→`blue`; `gray` is dropped). Inline `#tags` are derived from the text on the fly and are never written to a note's `tags` field.
- **`pinned`** is a new optional field on note docs; older notes without it are treated as unpinned.
- **Colour contrast**: muted text tokens (`--ink-3`, `--ink-mute`) were darkened to meet WCAG AA 4.5:1 on the surface/page/subtle backgrounds in both themes.
- **Share links skip Cloud Functions entirely** — a note's `public: true` field plus matching Firestore/Storage rules is enough for anonymous read access. `[[links]]` inside a shared note render as plain text (not clickable), so a read-only link can't be used to discover the titles of your other, unshared notes.
