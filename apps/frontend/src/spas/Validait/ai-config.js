// ─── Replace with your deployed AI proxy Cloud Function URL ───────────────
// After `firebase deploy --only functions`, the CLI prints a URL like:
//   https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/aiProxy
// Paste it below. Until this is a real URL, AI-backed features
// (document extraction, claim critique, analysis summary) will show an
// error toast instead of silently faking results.
const AI_CONFIG = {
  endpoint: "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/aiProxy"
};
