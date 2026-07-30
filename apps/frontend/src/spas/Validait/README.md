# Firebase SPA Template

Single-file SPA with Firebase Auth (Google + Email) and Firestore persistence.
Deployable to GitHub Pages or any static host. No build step required.

## File structure

```
app.html             Main SPA — all infra + UI shell + TODO hooks
firebase-config.js   Your Firebase client keys (replace placeholder values)
ai-config.js         Your deployed AI proxy Cloud Function URL (replace placeholder)
ai.js                AI seam — extractClaims/critiqueClaim/summariseAnalysis/generateExperiments
                     call the proxy; the rest remain local heuristic stubs
functions/           Firebase Cloud Function — holds the real Anthropic API key server-side
firebase.json        Firebase CLI config (Firestore rules + indexes + functions)
firestore.rules      Security rules (private user docs + public share docs)
firestore.indexes.json
index.html           Redirects / → app.html
dev-middleware.js    Live Server middleware (fixes app.html/<uuid> URLs)
.vscode/settings.json
```

## Quick start

### 1. Firebase project

1. Create a project at https://console.firebase.google.com
2. Enable **Firestore Database** (nam5 or your preferred region)
3. Enable **Authentication → Sign-in method → Google** (and optionally Email/Password)
4. Go to **Project settings → Your apps → Add web app**, copy the config object
5. Paste the values into `firebase-config.js`

### 2. Authorised domains

Firebase blocks sign-in from unlisted hosts.
Add each host you deploy to under **Authentication → Settings → Authorised domains**.
- Local dev: `localhost` (not `127.0.0.1` unless you add both)
- GitHub Pages: `<username>.github.io`
- Custom domain: your exact hostname

If Google sign-in still fails, also add `https://YOUR-HOST` under
**Google Cloud Console → APIs & Credentials → OAuth 2.0 Client → Authorised JavaScript origins**.

### 3. Deploy Firestore rules

Rules in `firestore.rules` must be deployed or reads/writes return `permission-denied`:

```bash
cd apps/frontend/src/spas/Validait
npm install -g firebase-tools
firebase login
firebase use validait-ideas
firebase deploy --only firestore:rules
```

Verify in Firebase console → Firestore → Rules that `users/{userId}/documents/{docId}` allows owner read/write.

### 4. Local development

Open the folder in VS Code and click **Go Live** (Live Server extension).
Opens at `http://localhost:5500/app.html`.

`dev-middleware.js` handles redirect from `app.html/<uuid>` → `app.html?share=<uuid>`.
Restart Live Server after any changes to the middleware.

### 5. GitHub Pages

Push to `main`, enable Pages on branch `main` folder `/`.
Both `app.html` and `firebase-config.js` must be in the same directory.

### 6. AI proxy (Cloud Function)

`ai.js` calls a Cloud Function (`functions/`) for real AI features (claim extraction,
critique, analysis summary) so the Anthropic API key never reaches the browser.

```bash
cd apps/frontend/src/spas/Validait

# One-time: set your Anthropic key as a Cloud Functions secret
firebase functions:secrets:set ANTHROPIC_API_KEY
# (paste your key from https://console.anthropic.com when prompted)

# Install function dependencies and deploy
cd functions && npm install && cd ..
firebase deploy --only functions
```

The deploy prints a URL like:
```
https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/aiProxy
```
Paste that into `ai-config.js`:
```js
const AI_CONFIG = { endpoint: "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/aiProxy" };
```

The function verifies the caller's Firebase ID token before calling Anthropic, so only
signed-in users of your app can invoke it. If `ai-config.js` still has the placeholder
URL, AI-backed actions show an error toast instead of silently faking results.

To change the Claude model, set the `ANTHROPIC_MODEL` env var on the function
(defaults to `claude-sonnet-4-5-20250929`) via `firebase functions:config` or a
`.env` file in `functions/` (see [Firebase Functions env config docs](https://firebase.google.com/docs/functions/config-env)).

---

## Implementing your app

Open `app.html` and implement the three TODO functions at the bottom of the script:

### `getDocData() → object`
Return your app's current state. This is saved to Firestore.

### `applyDocData(data)`
Apply a loaded Firestore document to your UI. Called on load and on sign-out.

### `onDocLoaded()`
Called after a document is fully loaded. Update titles, dropdowns, etc.

Then replace the `#app-placeholder` div with your actual UI.

Call `scheduleSave()` any time the user edits something to trigger a debounced 1.5s save.

---

## Data model

**Private** (authenticated owner only):
```
users/{uid}/documents/{docId}
  shareToken   string   UUID for the public share link
  updatedAt    timestamp
  createdAt    timestamp
  ...          your getDocData() fields
```

**Public** (anyone can read, owner writes):
```
publicDocuments/{shareToken}
  ownerUid   string
  docId      string
  payload    object   copy of getDocData()
  updatedAt  timestamp
```

---

## Share links

Share URLs use `?share=<uuid>`. Anonymous visitors see a read-only view.
If the signed-in user is the owner of the shared doc, they are automatically
upgraded to edit mode without leaving the page.

Call `copyShareLink()` from any UI element to copy the current doc's share URL.

---

## Extending

- **Multiple documents per user**: `docList` is already populated from Firestore.
  Add a document picker in your UI and call `loadDoc(uid, id)` on selection.
- **Create new doc**: call `privateCol(uid).doc()`, set initial data, push to `docList`.
- **Delete doc**: delete from `privateCol(uid)` and from `publicDocuments/{shareToken}`.
- **Real-time sync**: replace `privateRef().get()` with `onSnapshot()` for live updates.
