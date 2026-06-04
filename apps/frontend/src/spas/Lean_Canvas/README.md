# Lean Canvas

Single-page Lean Canvas editor with Firebase Auth and Firestore sync, deployable to GitHub Pages.

## Firebase setup (one-time)

1. **Authentication providers** — [Firebase Console → Authentication → Sign-in method](https://console.firebase.google.com/project/sids-lean-canvas/authentication/providers):
   - Enable **Google**
   - Enable **Email/Password** (optional, for email sign-in)

2. **Authorized domains** — [Authentication → Settings → Authorized domains](https://console.firebase.google.com/project/sids-lean-canvas/authentication/settings):
   - Add the **exact host** from your browser address bar when the app is open (click Sign in to see it in the modal).
   - Example: `kg-app.github.io` only works if the URL is `https://kg-app.github.io/...` — not `github.com`, `raw.githubusercontent.com`, or `127.0.0.1` (use `localhost` or add `127.0.0.1` separately).
   - If Google sign-in still fails after adding the domain, open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials?project=sids-lean-canvas), edit the **Web client (auto created by Google service)** OAuth client, and add `https://YOUR-HOST` under **Authorized JavaScript origins**.

3. **Deploy Firestore rules** (from this repo):

   ```bash
   firebase deploy --only firestore:rules
   ```

   Rules must include the `publicCanvases` collection so share links work without sign-in.

## Share links (read-only)

Each canvas gets a stable **share token** (UUID). When you save, a public copy is written to `publicCanvases/{shareToken}` for anonymous read access.

**URL formats** (all open the same canvas):

- **Recommended:** `LeanCanvas.html?share=<share-token>` — works on hard refresh with static servers (Live Server, GitHub Pages).
- Hash: `LeanCanvas.html#<share-token>`
- Legacy path `LeanCanvas.html/<share-token>` is still parsed if the server serves the page, but **do not use for new links** — refresh often fails with `ENOTDIR` because `LeanCanvas.html` is a file, not a folder.

Visitors see a **read-only** canvas (no edit, no sign-in required). Owners can use **Sign in to edit** on that page if the canvas is theirs.

Copy a link from the account menu → **Copy share link**.

## GitHub Pages

Publish `sample.html` (and `firebase-config.js`) from the repo root or `docs/` folder. Both files must be served together so the config script loads.

Example: enable Pages on branch `main`, folder `/` (root), then open:

`https://<username>.github.io/<repo>/sample.html`

## Local preview

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/sample.html`
