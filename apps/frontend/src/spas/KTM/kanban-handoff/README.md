# Kanban handoff (v2)

1. Unzip into an empty repo folder and open it in VS Code.
2. Move CLAUDE.md and BUILD_SPEC.md to the repo root. Copy everything in template/ to the repo root too (Claude Code does this in Phase 0).
3. Start Claude Code and say: "Read BUILD_SPEC.md and start Phase 0."

Contents
- BUILD_SPEC.md   full spec and phases
- CLAUDE.md       standing rules
- template/       index.html, dev-middleware.js, firestore.indexes.json (from your template, unchanged);
                  firebase-config.js (placeholder), firebase.json (Firestore only), firestore.rules (new)
- reference/      your template app.html + the two wireframes

Deliberately left out: ai.js, ai-config.js and the functions/ block (no AI in the kanban), and your existing
firebase-config.js (it points at the other app's Firebase project).
