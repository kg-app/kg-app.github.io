// ═══════════════════════════════════════════════════════════
// ValidAIt — AI proxy (Firebase Cloud Function)
//
// Holds the Anthropic API key server-side. The browser never sees it.
// The client (ai.js) sends { action, payload } + a Firebase ID token;
// this function verifies the token, builds the right prompt, calls
// Anthropic's Messages API, and returns parsed JSON back to the client.
//
// Deploy:
//   firebase functions:secrets:set ANTHROPIC_API_KEY
//   firebase deploy --only functions
// ═══════════════════════════════════════════════════════════

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Gen 2 Cloud Functions don't always auto-populate projectId on the default Admin app,
// which makes verifyIdToken() throw a TypeError instead of a proper auth error.
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'validait-ideas';
initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID
});
logger.info('aiProxy initialized', { projectId: PROJECT_ID });

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
const ANTHROPIC_VERSION = '2023-06-01';

// ── Auth ──────────────────────────────────────────────────
async function requireUser(req) {
  const header = req.get('Authorization') || '';
  const m = header.match(/^Bearer (.+)$/);
  if (!m) {
    const err = new Error('Missing Authorization: Bearer <idToken> header.');
    err.statusCode = 401;
    throw err;
  }
  try {
    return await getAuth().verifyIdToken(m[1], false);
  } catch (e) {
    logger.error('requireUser: ID token verification failed', {
      code: e.code,
      message: e.message,
      projectId: PROJECT_ID
    });
    const err = new Error('Invalid or expired ID token' + (e.code ? ' (' + e.code + ')' : '') + '. Sign out and sign in again.');
    err.statusCode = 401;
    throw err;
  }
}

// ── Anthropic call + JSON extraction ─────────────────────────
async function callClaude(apiKey, { system, prompt, maxTokens }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens || 1500,
      system,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic API error (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const textBlock = (data.content || []).find(b => b.type === 'text');
  if (!textBlock) throw new Error('Anthropic response contained no text block.');

  const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error('Failed to parse AI response as JSON: ' + e.message);
  }
}

// ── Prompt builders ──────────────────────────────────────────
// Extraction is intentionally scoped to claims + evidence only. Claims are the
// primary artifact; evidence is grounded directly in the source text so it is
// extracted alongside claims here. Tensions and counterfactuals require
// cross-claim / falsification reasoning over the analysis graph rather than
// raw text, so they are deliberately NOT produced here — they are discovered
// later via critiqueClaim() once claims (and their evidence) exist, or added
// manually. This avoids inventing tensions/counterfactuals before any claim
// has actually been critiqued.
function buildExtractClaimsPrompt({ text, fileNames }) {
  const source = (text || '').trim();
  const fileList = (fileNames || []).join(', ') || 'none';

  const system = `You are a rigorous, skeptical venture/claim analyst. You extract falsifiable claims and directly-grounded evidence from source material — you do not invent claims that are not grounded in the provided text. If no usable text is provided, return empty arrays rather than fabricating content.`;

  const prompt = `SOURCE DOCUMENT NAMES: ${fileList}

SOURCE TEXT:
${source || '(no text content was extracted from the uploaded file(s) — if this is empty, return empty arrays)'}

Extract a starting set of falsifiable claims from the source text, plus any evidence directly supported by the text that bears on those claims. Do NOT identify tensions between claims or counterfactuals here — those come from a later per-claim critique step once the claim set exists.

Respond with ONLY valid JSON, no markdown fences, no preamble, in exactly this shape:
{
  "claims": [
    {"cat": "Pain"|"Alternatives"|"Solution"|"Persona"|"Commercial", "text": "falsifiable assertion, no surrounding quotes", "status": "assumed"|"supported", "note": "1 sentence analyst note", "confidence": 0.0-1.0, "sourceQuote": "short verbatim excerpt this was extracted from"}
  ],
  "evidence": [
    {"text": "short evidence statement", "type": "behavioral"|"attitudinal"|"document"|"analytical", "cls": "supports"|"contradicts"|"qualifies", "confidence": 0.0-1.0, "sourceQuote": "short verbatim excerpt", "claimIndexes": [0-based indexes into the claims array above this evidence relates to]}
  ]
}
Return at most 8 claims. Omit evidence entries you are not confident about rather than guessing.`;

  return { system, prompt, maxTokens: 2000 };
}

// The single discovery engine: critiquing a claim is where evidence gaps,
// counterfactuals, tensions with other claims, and a status recommendation
// all get produced together, grounded in the current analysis graph (not
// raw source text). This is the fix for tensions/counterfactuals previously
// being invented independently of claim critique.
function buildCritiqueClaimPrompt({ claim, analysisContext }) {
  const ctx = analysisContext || {};
  const evidenceTexts = ctx.evidenceTexts || [];
  const otherClaims = ctx.otherClaims || [];
  const existingCounterfactuals = ctx.existingCounterfactuals || [];
  const existingTensionClaimIds = ctx.existingTensionClaimIds || [];

  const system = `You are a rigorous decision-analysis assistant. Your job is to find the weakest point in a claim, not to confirm it. Be specific and concise. Only propose a tension against another claim if there is a real, direct conflict — do not force one.`;

  const prompt = `CLAIM [${claim && claim.id}]: ${claim && claim.text}
CATEGORY: ${claim && claim.cat}
CURRENT STATUS: ${claim && claim.status}

ATTACHED EVIDENCE:
${evidenceTexts.length ? evidenceTexts.map((e, i) => `${i + 1}. ${e}`).join('\n') : '(none attached yet)'}

EXISTING COUNTERFACTUALS FOR THIS CLAIM (do not repeat these):
${existingCounterfactuals.length ? existingCounterfactuals.map(c => `- ${c.statement}`).join('\n') : '(none)'}

OTHER CLAIMS IN THIS ANALYSIS (for tension detection — reference by id):
${otherClaims.length ? otherClaims.map(c => `- [${c.id}] (${c.status}) ${c.text}`).join('\n') : '(no other claims yet)'}

CLAIM IDS ALREADY LINKED TO THIS CLAIM VIA AN EXISTING TENSION (do not repropose these pairs):
${existingTensionClaimIds.length ? existingTensionClaimIds.join(', ') : '(none)'}

Critique this claim as rigorously as possible:
1. Identify specificity gaps, source-quality risk, and anything that would need to be true for the claim to fail.
2. Identify what evidence is currently missing that would meaningfully change confidence in this claim.
3. Recommend a status for this claim given the evidence above: "assumed" (default/no evidence yet), "supported" (evidence backs it), "disputed" (evidence conflicts or critique found a serious flaw), "validated" (strong multi-source evidence), "revised" (claim needs rewording given evidence), or "gap" (critical unaddressed gap, high risk). Justify briefly.
4. Propose at most 2 counterfactuals — conditions that would invalidate or weaken the claim.
5. Check the other claims listed above for a genuine, direct tension with this claim (e.g. they assume mutually exclusive things, or evidence for one undercuts the other). Propose at most 1 tension only if a real conflict exists.

Respond with ONLY valid JSON, no markdown fences, no preamble, in exactly this shape:
{
  "crit": "HTML string using only <ul><li> and <em> tags — 1-3 bullet points, ending with an <em>Falsification condition: ...</em> sentence",
  "evidence_gaps": ["short phrase describing missing evidence", "..."],
  "recommended_status": "assumed"|"supported"|"disputed"|"validated"|"revised"|"gap",
  "status_rationale": "1 sentence explaining the recommended status",
  "counterfactuals": [{"statement": "...", "severity": "invalidate"|"weaken"}],
  "tensions": [{"withClaimId": "id from the OTHER CLAIMS list above", "title": "short title, max 8 words", "desc": "1-2 sentence description of the conflict", "type": "fra"|"com"|"tec"|"per"|"risk", "pri": "p0"|"p1"|"p2"}]
}
Omit "tensions" entries entirely (return an empty array) if no other claim genuinely conflicts.`;

  return { system, prompt, maxTokens: 1200 };
}

function buildSummariseAnalysisPrompt({ claims, evidence, tensions, counterfactuals, experiments }) {
  const system = `You are a rigorous decision-analysis assistant producing an executive-level confidence assessment of a claim-validation analysis. Be honest about weaknesses — do not default to reassuring language.`;

  const prompt = `Evaluate the overall health of this claim-validation analysis.

CLAIMS (${(claims || []).length}):
${(claims || []).map(c => `- [${c.id}] (${c.status}) ${c.text}`).join('\n') || '(none)'}

EVIDENCE (${(evidence || []).length}):
${(evidence || []).map(e => `- [${e.id}] ${e.cls}/${e.type}: ${e.text}`).join('\n') || '(none)'}

TENSIONS (${(tensions || []).length}):
${(tensions || []).map(t => `- [${t.id}] (${t.pri}, ${t.status}) ${t.title}`).join('\n') || '(none)'}

COUNTERFACTUALS (${(counterfactuals || []).length}):
${(counterfactuals || []).map(c => `- [${c.id}] (${c.severity}, ${c.status}) ${c.statement}`).join('\n') || '(none)'}

EXPERIMENTS (${(experiments || []).length}):
${(experiments || []).map(e => `- [${e.id}] (${e.status}) ${e.title}`).join('\n') || '(none)'}

For each claim, weigh how load-bearing it is against how well it is supported by the listed evidence. Flag unresolved high-priority tensions and unaddressed counterfactuals as risks to overall confidence.

Respond with ONLY valid JSON, no markdown fences, no preamble, in exactly this shape:
{
  "overall_confidence": "high"|"medium"|"low",
  "overall_summary": "2-3 sentence plain-language summary of the analysis's overall health and the biggest open risk"
}`;

  return { system, prompt, maxTokens: 500 };
}

// Holistic experiment synthesis: reviews P0/P1 tensions, confirmed
// counterfactuals, and disputed claims together (not just tensions/CFs) and
// proposes concrete tests. Returns multiple candidates — the user picks
// which to add, or adds their own instead.
function buildGenerateExperimentsPrompt({ p0p1Tensions, confirmedCounterfactuals, disputedClaims, existingExperiments }) {
  const tensions = p0p1Tensions || [];
  const cfs = confirmedCounterfactuals || [];
  const disputed = disputedClaims || [];
  const existing = existingExperiments || [];

  const system = `You are a rigorous decision-analysis assistant designing the highest-leverage validation experiments. Prefer cheap, fast, directionally-conclusive tests over expensive ones. Do not propose an experiment for something already covered by an existing experiment.`;

  const prompt = `Review the following unresolved risk items and propose validation experiments.

P0/P1 TENSIONS (unresolved, no experiment yet):
${tensions.length ? tensions.map(t => `- [${t.id}] (${t.pri}) ${t.title}: ${t.desc || ''}`).join('\n') : '(none)'}

CONFIRMED COUNTERFACTUALS:
${cfs.length ? cfs.map(c => `- [${c.id}] (${c.severity}) ${c.statement}`).join('\n') : '(none)'}

DISPUTED CLAIMS:
${disputed.length ? disputed.map(c => `- [${c.id}] (${c.cat}) ${c.text}`).join('\n') : '(none)'}

EXISTING EXPERIMENTS (do not duplicate):
${existing.length ? existing.map(e => `- [${e.id}] ${e.title}`).join('\n') : '(none)'}

If there is nothing above worth testing (all empty, or everything already has a good existing experiment), return {"experiments": []}.

Otherwise propose up to 3 experiments, ranked by leverage (highest first). Respond with ONLY valid JSON, no markdown fences, no preamble, in exactly this shape:
{
  "experiments": [
    {
      "title": "short imperative title",
      "derivedFromTensionIds": ["ids from P0/P1 TENSIONS this addresses, or []"],
      "derivedFromCounterfactualIds": ["ids from CONFIRMED COUNTERFACTUALS this addresses, or []"],
      "derivedFromClaimIds": ["ids from DISPUTED CLAIMS this addresses, or []"],
      "hypothesis": "what we expect to find and why",
      "method": "e.g. Customer interview, Landing page test, Pricing experiment, Prototype test",
      "timeline": "e.g. 2 weeks",
      "metric": "the specific signal that would count as directional evidence",
      "reasoning": "1-2 sentences on why this is the highest-leverage test for the items it addresses"
    }
  ]
}`;

  return { system, prompt, maxTokens: 1800 };
}

// ── HTTP entrypoint ───────────────────────────────────────────
exports.aiProxy = onRequest(
  { cors: true, secrets: [ANTHROPIC_API_KEY], region: 'us-central1', timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Use POST.' });
      return;
    }

    try {
      await requireUser(req);
    } catch (e) {
      res.status(e.statusCode || 401).json({ error: e.message });
      return;
    }

    const { action, payload } = req.body || {};
    if (!action) {
      res.status(400).json({ error: 'Missing "action" in request body.' });
      return;
    }

    let built;
    try {
      if (action === 'extractClaims') built = buildExtractClaimsPrompt(payload || {});
      else if (action === 'critiqueClaim') built = buildCritiqueClaimPrompt(payload || {});
      else if (action === 'summariseAnalysis') built = buildSummariseAnalysisPrompt(payload || {});
      else if (action === 'generateExperiments') built = buildGenerateExperimentsPrompt(payload || {});
      else {
        res.status(400).json({ error: `Unknown action "${action}".` });
        return;
      }
    } catch (e) {
      res.status(400).json({ error: 'Bad payload: ' + e.message });
      return;
    }

    try {
      const result = await callClaude(ANTHROPIC_API_KEY.value(), built);
      res.status(200).json(result);
    } catch (e) {
      logger.error('aiProxy action=' + action, e);
      res.status(502).json({ error: e.message || 'AI request failed.' });
    }
  }
);
