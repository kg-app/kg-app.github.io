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
const admin = require('firebase-admin');

admin.initializeApp();

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
    return await admin.auth().verifyIdToken(m[1]);
  } catch (e) {
    const err = new Error('Invalid or expired ID token.');
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
function buildExtractClaimsPrompt({ text, fileNames }) {
  const source = (text || '').trim();
  const fileList = (fileNames || []).join(', ') || 'none';

  const system = `You are a rigorous, skeptical venture/claim analyst. You extract falsifiable claims from source material — you do not invent claims that are not grounded in the provided text. If no usable text is provided, return empty arrays rather than fabricating content.`;

  const prompt = `SOURCE DOCUMENT NAMES: ${fileList}

SOURCE TEXT:
${source || '(no text content was extracted from the uploaded file(s) — if this is empty, return empty arrays)'}

Extract a starting set of falsifiable claims from the source text, plus any evidence, tensions (contradictions between claims), and counterfactuals (conditions that would falsify a claim) that are directly supported by the text.

Respond with ONLY valid JSON, no markdown fences, no preamble, in exactly this shape:
{
  "claims": [
    {"cat": "Pain"|"Alternatives"|"Solution"|"Persona"|"Commercial", "text": "falsifiable assertion, no surrounding quotes", "status": "assumed"|"supported", "note": "1 sentence analyst note", "confidence": 0.0-1.0, "sourceQuote": "short verbatim excerpt this was extracted from"}
  ],
  "evidence": [
    {"text": "short evidence statement", "type": "behavioral"|"attitudinal"|"document"|"analytical", "cls": "supports"|"contradicts"|"qualifies", "confidence": 0.0-1.0, "sourceQuote": "short verbatim excerpt", "claimIndexes": [0-based indexes into the claims array above this evidence relates to]}
  ],
  "tensions": [
    {"title": "short title, max 8 words", "desc": "1-2 sentence description of the contradiction", "type": "fra"|"com"|"tec"|"per"|"risk", "pri": "p0"|"p1"|"p2", "claimIndexes": [0-based indexes of the 2+ conflicting claims]}
  ],
  "counterfactuals": [
    {"statement": "what would have to be true for the claim to be false", "severity": "invalidate"|"weaken", "claimIndexes": [0-based index of the claim this applies to]}
  ]
}
Return at most 8 claims. Omit evidence/tensions/counterfactuals arrays' entries you are not confident about rather than guessing.`;

  return { system, prompt, maxTokens: 2500 };
}

function buildCritiqueClaimPrompt({ claim, analysisContext }) {
  const evidenceTexts = (analysisContext && analysisContext.evidenceTexts) || [];
  const system = `You are a rigorous decision-analysis assistant. Your job is to find the weakest point in a claim, not to confirm it. Be specific and concise.`;

  const prompt = `CLAIM: ${claim && claim.text}
CATEGORY: ${claim && claim.cat}
CURRENT STATUS: ${claim && claim.status}

ATTACHED EVIDENCE:
${evidenceTexts.length ? evidenceTexts.map((e, i) => `${i + 1}. ${e}`).join('\n') : '(none attached yet)'}

Critique this claim as rigorously as possible. Identify specificity gaps, source-quality risk, and anything that would need to be true for the claim to fail. Also identify what evidence is currently missing that would meaningfully change confidence in this claim, and propose at most 2 counterfactuals (conditions that would invalidate or weaken the claim).

Respond with ONLY valid JSON, no markdown fences, no preamble, in exactly this shape:
{
  "crit": "HTML string using only <ul><li> and <em> tags — 1-3 bullet points, ending with an <em>Falsification condition: ...</em> sentence",
  "evidence_gaps": ["short phrase describing missing evidence", "..."],
  "counterfactuals": [{"statement": "...", "severity": "invalidate"|"weaken"}]
}`;

  return { system, prompt, maxTokens: 1000 };
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
