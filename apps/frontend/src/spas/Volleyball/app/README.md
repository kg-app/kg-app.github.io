# SportSquad — Practice Schedule Calendar

Firebase-backed SPA for tracking attendance across Nishka's summer 2026
volleyball calendar (camps, group/private training, school workouts, tryouts).
Sign in, create one or more named schedules, click blocks to mark attendance,
and everything auto-saves to Firestore. Deployable to GitHub Pages or any
static host — no build step required.

## File structure

```
app.html             Main SPA — top bar, dashboard, calendar view, Firebase wiring
firebase-config.js   Firebase client keys for the sportsquad-hq project
firebase.json        Firebase CLI config (Firestore rules + indexes)
firestore.rules      Security rules (private per-user schedules + public share docs)
firestore.indexes.json
index.html           Redirects / → app.html
dev-middleware.js    Live Server middleware (fixes app.html/<uuid> URLs)
.vscode/settings.json
crazy_practice_schedular.html   Original standalone (file-based save/load) version, kept for reference
```

## Quick start

### 1. Firebase project

SportSquad is a fully standalone Firebase project, `sportsquad-hq` —
independent of Validait/Lean_Canvas, no shared collections or rules.

1. https://console.firebase.google.com/project/sportsquad-hq/overview
2. Enable **Firestore Database** (nam5 or your preferred region) if not already enabled
3. Enable **Authentication → Sign-in method → Google** (and optionally Email/Password)

### 2. Authorised domains

Firebase blocks sign-in from unlisted hosts.
Add each host you deploy to under **Authentication → Settings → Authorised domains**.
- Local dev: `localhost` (not `127.0.0.1` unless you add both)
- GitHub Pages: `<username>.github.io`
- Custom domain: your exact hostname

If Google sign-in still fails, also add `https://YOUR-HOST` under
**Google Cloud Console → APIs & Credentials → OAuth 2.0 Client → Authorised JavaScript origins**.

### 3. Deploy Firestore rules

```bash
cd apps/frontend/src/spas/Volleyball/app
firebase login
firebase use sportsquad-hq
firebase deploy --only firestore:rules
```

### 4. Local development

Open the folder in VS Code and click **Go Live** (Live Server extension).
Opens at `http://localhost:5500/app.html`.

### 5. GitHub Pages

Push to `main`, enable Pages on branch `main` folder `/`.
`app.html` and `firebase-config.js` must be in the same directory.

---

## Data model

Standalone `sportsquad-hq` project, no dependency on Validait/Lean_Canvas.
Every named schedule shares the same fixed base calendar (defined in
`app.html`'s `events` array) — a "schedule" is really just an independent
attendance selection set, so you can create one per family member or per
season without duplicating event data.

**Private** (authenticated owner only):
```
users/{uid}/documents/{docId}
  name             string   schedule name shown on the dashboard
  shareToken       string   UUID for the public share link
  selectionCount   number
  updatedAt/createdAt   timestamp
  payload: { selected: string[] }   attendance keys ("date|start|label")
```

**Public** (anyone can read, owner writes):
```
publicDocuments/{shareToken}
  ownerUid   string
  docId      string
  name       string
  payload    object   copy of the private payload
  updatedAt  timestamp
```

## Share links

Share URLs use `?share=<uuid>` and open directly into the calendar view,
read-only. If the signed-in visitor owns that schedule, they're upgraded
to edit mode automatically. Copy the current schedule's link from the
user menu ("Copy share link").
