# Our Story

A private family timeline — achievements, milestones, learnings, and failures for your kids — built with Firebase Auth + Firestore + Storage, deployable as a static site (Firebase Hosting or GitHub Pages). Built to sit alongside the Lean Canvas and Notes apps in the same `sids-lean-canvas` Firebase project; no Google Sheets, no separate backend.

## Features

- Vertical timeline grouped by year, filterable by child and category (achievement / milestone / learning / failure), free-text search over title/description/tags
- Add-entry bottom sheet: title, date, child, category, description, tags, and photo upload
- Photos stored in Firebase Storage, resized client-side (max 1600px, JPEG q0.82) before upload
- Admin screen (owner only): entry-count dashboard overall/per-year/per-child, add/remove child (soft-remove — hides the child, keeps their entries), invite a collaborator by email with a **Can edit** toggle so a spouse or child can add their own entries, revoke access
- Collaborators sign in with their own Google account — no magic links or Cloud Functions needed. On sign-in, the app runs a `collectionGroup('shares')` query to discover which journal(s) they've been granted access to, and a switcher appears if they have more than one (e.g. their own journal + one shared with them)

## Data model (Firestore)

Everything lives under `users/{ownerId}/...`, where `ownerId` is the journal owner's Firebase Auth uid:

```
users/{ownerId}/children/{childId}
  name          string
  birthdate     string | null   (YYYY-MM-DD)
  status        'active' | 'removed'
  createdAt     timestamp

users/{ownerId}/entries/{entryId}
  title         string
  date          string          (YYYY-MM-DD, the event date)
  childId       string          (-> children/{childId})
  category      'achievement' | 'milestone' | 'learning' | 'failure'
  description   string
  tags          array<string>
  mediaUrls     array<string>   (Storage download URLs)
  mediaPaths    array<string>   (Storage paths, used to delete files on entry delete)
  addedByUid    string
  addedByEmail  string
  createdAt     timestamp
  updatedAt     timestamp

users/{ownerId}/shares/{email}   (doc id = lowercased invitee email)
  email         string
  scope         'all' | childId
  canEdit       boolean
  status        'active' | 'revoked'
  invitedAt     timestamp
```

Media lives in Storage at `users/{ownerId}/entries/{entryId}/{timestamp}_{filename}`.

### Why `shares` is keyed by email, and why it matters

The owner is the only one who can write to `shares` (enforced in `firestore.rules`). Everyone else's read/write access to `children` and `entries` is derived from whether an **active** share doc exists for their signed-in email — the rules check `get()` on `users/{ownerId}/shares/{their email}`. This is what makes "view-only vs. can-edit vs. per-child scope" actually enforceable, rather than a UI toggle with no teeth behind it: even if someone knew the `ownerId`, they can't read or write anything until a share doc exists for their exact email.

A companion wildcard rule (`match /{path=**}/shares/{shareEmail}`) lets a signed-in user run a `collectionGroup` query filtered to `email == <their email>` — that's how the app finds journals shared with them without needing a magic link.

**Note:** invites currently take effect immediately (`status: 'active'` as soon as the owner sends one) — there's no separate "pending until accepted" step. That's a deliberate simplification; add an accept flow later if you want the invitee to have to confirm before being granted access.

## End-to-end encryption

Entry `title`/`description`/`tags` and photos are encrypted client-side (AES-GCM via WebCrypto) before they ever reach Firestore/Storage — the Firebase project owner, or anyone with database/bucket access, sees ciphertext, not content. `childId`/`category`/`date`/timestamps/author fields stay plaintext by design, so Firestore can still filter, sort, and paginate server-side (the app's search/filtering already ran client-side on decrypted data before this, so nothing new is exposed there).

- **Keys:** each signed-in user gets an RSA-OAEP keypair on first sign-in — the private key is generated non-extractable and stored only in that browser's IndexedDB, never transmitted. The journal itself has one AES-GCM data key, wrapped separately for the owner and each active collaborator (`publicKeys/{email}`, `users/{ownerId}/keys/journal`, and new fields on each `shares/{email}` doc — see `firestore.rules`). Photos are further encrypted under a per-entry media key, itself wrapped by the journal key, so rotating the journal key never requires re-uploading photo bytes.
- **New collaborators:** if an owner shares with someone who's never signed in (no public key published yet), the share is written with `keyPending: true`; it's completed automatically the next time the owner opens the journal after that person has signed in once. Until then, the invitee sees the app but not entry content.
- **Revoke:** revoking a share now also rotates the journal key and re-wraps it for everyone still active, so a former collaborator's cached key stops working for anything going forward. It does **not** retroactively re-encrypt photo bytes already in Storage (would mean re-uploading everything) — someone who already downloaded and decrypted a specific photo before being revoked keeps that one item, same as any sharing system.
- **Migrating existing data:** entries written before this shipped have no `contentEnc` field and still render fine (legacy plaintext passthrough). Admin → Encryption → "Encrypt existing entries" does a one-time, resumable in-place migration (re-encrypts text, re-uploads each photo encrypted to the same Storage path).
- **Not covered:** no key-loss recovery — if a browser's IndexedDB is cleared and that was the only device holding a given key, that access is gone. Accepted as a reasonable trade-off at family-journal scale; a passphrase-based backup key could be added later if needed.

## Firebase setup (one-time)

Reuses the existing `sids-lean-canvas` project / auth setup — no new project needed.

1. **Enable Google as a sign-in provider** if not already (Firebase Console → Authentication → Sign-in method). This app only offers Google sign-in, since permission checks rely on `request.auth.token.email`, which Google sign-in always populates and verifies.

2. **Deploy rules and indexes** (from this folder):

   ```bash
   firebase deploy --only firestore:rules,firestore:indexes,storage
   ```

   `firestore.rules` and `storage.rules` now include Lore-app-specific rules alongside the existing `canvases`/`notes` rules — nothing there was touched.

   > Note: the earlier `firestore_indexes.json` (underscore) didn't actually match what `firebase.json` was looking for (`firestore.indexes.json`, with a dot) — this bundle uses the dotted filename so the indexes actually get picked up.

3. A composite index is required for filtering entries by child (`childId ==`, `date desc`), and another for the collaborator lookup (`collectionGroup('shares')` on `email` + `status`) — both are declared in `firestore.indexes.json`. If you ever see a "requires an index" error in the console with a link, that link will offer to create the exact index needed — safe to click.

## GitHub Pages / static hosting

Publish `index.html` and `firebase-config.js` together, same as the other apps in this project — a separate path/repo, or a subfolder like `/lore/`, both work.

`https://<username>.github.io/<repo>/index.html` (or `/lore/index.html` if in a subfolder)

## Local preview

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/index.html`

## Notes on the design

- **All of the current journal's children and entries load into memory** on open (two Firestore queries). Fine at family-journal scale (tens to low thousands of entries); would need pagination well before that becomes a problem.
- **Removing a child is a soft-delete** (`status: 'removed'`) specifically so existing entries referencing that child never become orphaned — this was a deliberate choice discussed up front, not an afterthought.
- **Deleting an entry is a hard delete**, including its Storage files, with a confirm-dialog warning — only the owner can do this (collaborators with edit access can add/update, not delete).
- **No email is actually sent** when you "send" a share invite — there's no backend to send it from. The button grants access immediately and offers to copy the app link so you can send it yourself (text, email, however). Wiring up real email delivery would mean adding a Cloud Function.
- **Photos are resized client-side** before upload (canvas-based, max 1600px) to keep uploads fast on a phone connection — the tradeoff discussed earlier when comparing Drive vs. Storage.
