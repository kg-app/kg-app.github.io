// ═══════════════════════════════════════════════════════════
// ai.js — AI seam
//
// Claims are the primary artifact. extractClaims produces claims + directly
// text-grounded evidence only. Everything else — evidence gaps, counter-
// factuals, tensions, and a recommended status — is discovered by
// critiqueClaim(), which reasons over the claim plus the rest of the
// analysis graph. generateExperiments reviews P0/P1 tensions, confirmed
// counterfactuals, and disputed claims holistically. All three call a
// serverless proxy (see functions/index.js) which holds the real Anthropic
// API key — the browser never sees it. Configure the proxy URL in
// ai-config.js.
//
// classifyEvidence, classifyTension, clarifyForClaim, and
// clarifyForCounterfactual remain heuristic stubs for the manual-add path —
// swap their bodies for proxy calls the same way when ready.
// Signatures are the contract; keep them stable across swaps.
// ═══════════════════════════════════════════════════════════

// ── Proxy call helper ─────────────────────────────────────
async function callAiProxy(action, payload, idToken) {
  if (!idToken) throw new Error('You must be signed in to use AI features.');
  if (!AI_CONFIG || !AI_CONFIG.endpoint || /YOUR_PROJECT_ID/.test(AI_CONFIG.endpoint)) {
    throw new Error('AI backend not configured — set AI_CONFIG.endpoint in ai-config.js (see functions/README).');
  }
  async function doFetch(token) {
    return fetch(AI_CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ action, payload })
    });
  }
  let res;
  try {
    res = await doFetch(idToken);
  } catch (e) {
    throw new Error('Could not reach AI backend: ' + e.message);
  }
  if (res.status === 401 && window.currentUser) {
    try {
      const fresh = await window.currentUser.getIdToken(true);
      if (fresh) res = await doFetch(fresh);
    } catch (_) {}
  }
  if (!res.ok) {
    let msg = 'AI request failed (' + res.status + ')';
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

const AI = {

  // Document / paste ingestion → starting claim set + directly-grounded
  // evidence only. Tensions and counterfactuals are deliberately NOT
  // produced here — see critiqueClaim() below, which is where they get
  // discovered once claims (and their evidence) actually exist.
  async extractClaims({ text, fileNames, idToken }) {
    const raw = await callAiProxy('extractClaims', { text, fileNames }, idToken);
    const ts = nowISOStr();
    const srcLabel = (fileNames && fileNames.length) ? fileNames.join(', ') : 'Pasted text';

    const claims = (raw.claims || []).map(c => ({
      id: newId('C'),
      cat: c.cat || 'Pain',
      text: '"' + (c.text || '').replace(/^"|"$/g, '') + '"',
      fw: FW_MAP[c.cat] || 'Lean Canvas: General',
      fw2: 'AI-extracted',
      status: c.status === 'supported' ? 'supported' : 'assumed',
      ev: [], tn: [], cf: [], exp: [],
      note: c.note || '',
      evidenceGaps: [],
      recommendedStatus: null,
      statusRationale: '',
      prov: {
        src: srcLabel, extracted: 'AI extraction · pass 1', creator: 'AI auto-extraction',
        confidence: typeof c.confidence === 'number' ? c.confidence : 0.6,
        srcQuote: c.sourceQuote || '',
        trail: appendTrail([], { when: ts, who: 'AI extraction', what: 'Extracted from ' + srcLabel })
      },
      crit: 'This claim has not yet been critiqued. Open it and run "Critique with AI" to discover evidence gaps, counterfactuals, tensions, and a recommended status.'
    }));

    const evidence = (raw.evidence || []).map(e => {
      const id = newId('E');
      const claimIds = (e.claimIndexes || []).map(i => claims[i] && claims[i].id).filter(Boolean);
      claimIds.forEach(cid => { const c = claims.find(x => x.id === cid); if (c) c.ev.push(id); });
      return {
        id, claims: claimIds, text: e.text || '', src: srcLabel,
        type: e.type || 'attitudinal', cls: e.cls || 'supports', str: 1,
        prov: {
          src: srcLabel, extracted: 'AI extraction · pass 1', creator: 'AI auto-extraction',
          confidence: typeof e.confidence === 'number' ? e.confidence : 0.6,
          srcQuote: e.sourceQuote || '',
          trail: appendTrail([], { when: ts, who: 'AI extraction', what: 'Extracted from ' + srcLabel })
        }
      };
    });

    return { claims, evidence, tensions: [], counterfactuals: [], experiments: [] };
  },

  // The discovery engine. Given one claim plus the rest of the analysis
  // graph, returns evidence gaps, a recommended status, counterfactuals,
  // and (at most one) genuine tension with another claim — all grounded in
  // claims/evidence that already exist, not raw source text.
  async critiqueClaim({ claim, analysisContext, idToken }) {
    const raw = await callAiProxy('critiqueClaim', { claim, analysisContext }, idToken);
    return {
      crit: raw.crit || 'AI did not return a critique.',
      evidenceGaps: raw.evidence_gaps || raw.evidenceGaps || [],
      recommendedStatus: raw.recommended_status || raw.recommendedStatus || null,
      statusRationale: raw.status_rationale || raw.statusRationale || '',
      counterfactuals: raw.counterfactuals || [],
      tensions: raw.tensions || []
    };
  },

  // Cross-entity confidence summary for the whole analysis.
  async summariseAnalysis({ claims, evidence, tensions, counterfactuals, experiments, idToken }) {
    const raw = await callAiProxy('summariseAnalysis', { claims, evidence, tensions, counterfactuals, experiments }, idToken);
    return {
      overallConfidence: raw.overall_confidence || 'medium',
      overallSummary: raw.overall_summary || ''
    };
  },

  // Auto-classify manually-added evidence.
  // Stub: keyword heuristic (ported from mock).
  async classifyEvidence({ text }) {
    await delay(1100);
    const lower = (text || '').toLowerCase();
    let cls = 'supports';
    if (/\bnot\b|\bnever\b|\bno\b|contradict|fail/.test(lower)) cls = 'contradicts';
    else if (/\bbut\b|\bonly\b|partial|however|\bsome\b/.test(lower)) cls = 'qualifies';
    let type = 'attitudinal';
    if (/data|measured|logged|survey|recorded|signed|confirmed/.test(lower)) type = 'behavioral';
    if (/regulat|standard|\bform\b|\bact\b|rp \d|recommended practice/.test(lower)) type = 'document';
    return { type, cls, str: 1 };
  },

  // Auto-classify manually-added tension.
  // Stub: keyword heuristic (ported from mock).
  async classifyTension({ text }) {
    await delay(1100);
    const lower = (text || '').toLowerCase();
    let type = 'fra';
    if (/pay|price|revenue|budget|\bcost\b/.test(lower)) type = 'com';
    else if (/accura|technical|\bbug\b|sizing|\bmodel\b/.test(lower)) type = 'tec';
    else if (/persona|buyer|\buser\b|customer/.test(lower)) type = 'per';
    else if (/\brisk\b|complian|legal|disclos/.test(lower)) type = 'risk';
    let pri = 'p2';
    if (/block|critical|\bp0\b/.test(lower)) pri = 'p0';
    else if (/important|\bp1\b|high/.test(lower)) pri = 'p1';
    return { type, pri };
  },

  // Clarifying-question flow for new claims.
  // Stub returns the fixed question + option set.
  async clarifyForClaim({ text }) {
    await delay(1000);
    return {
      question: 'What is the source of this claim — a document, something you observed or were told, or your own inference?',
      options: [
        { value: 'document',   label: '📄 A document' },
        { value: 'observed',   label: '👂 Observed / told' },
        { value: 'inference',  label: '🧠 My inference' }
      ]
    };
  },

  // Clarifying-question flow for new counterfactuals.
  async clarifyForCounterfactual({ text }) {
    await delay(1000);
    return {
      question: 'If this turned out to be true, would it invalidate the claim entirely, or just weaken it?',
      options: [
        { value: 'invalidate', label: '⛔ Would invalidate it' },
        { value: 'weaken',     label: '◐ Would just weaken it' }
      ]
    };
  },

  // Holistic experiment synthesis: reviews P0/P1 tensions, confirmed
  // counterfactuals, and disputed claims together and proposes up to 3
  // ranked candidate experiments. Returns an empty array when there's
  // nothing worth testing. The caller presents candidates for the user to
  // pick from — nothing is auto-inserted.
  async generateExperiments({ claims, tensions, counterfactuals, experiments, idToken }) {
    const usedTensionIds = new Set(experiments.flatMap(e => (e.derivedFrom && e.derivedFrom.tensions) || []));
    const usedCfIds = new Set(experiments.flatMap(e => (e.derivedFrom && e.derivedFrom.counterfactuals) || []));

    const p0p1Tensions = tensions
      .filter(t => (t.pri === 'p0' || t.pri === 'p1') && !usedTensionIds.has(t.id))
      .map(t => ({ id: t.id, pri: t.pri, title: t.title, desc: t.desc }));
    const confirmedCounterfactuals = counterfactuals
      .filter(c => c.status === 'confirmed' && !usedCfIds.has(c.id))
      .map(c => ({ id: c.id, severity: c.severity, statement: c.statement }));
    const disputedClaims = claims
      .filter(c => c.status === 'disputed')
      .map(c => ({ id: c.id, cat: c.cat, text: c.text }));
    const existingExperiments = experiments.map(e => ({ id: e.id, title: e.title }));

    const raw = await callAiProxy('generateExperiments', {
      p0p1Tensions, confirmedCounterfactuals, disputedClaims, existingExperiments
    }, idToken);

    return { experiments: raw.experiments || [] };
  }
};

// ── Category → framework label map (used by extractClaims) ──
const FW_MAP = {
  Pain: 'BLAC: Blatant', Alternatives: 'Lean Canvas: Alternatives',
  Solution: '4U: Unworkable (current)', Persona: 'Skok: MVS', Commercial: 'Lean Canvas: Revenue'
};

// ── Delay helper (used by remaining heuristic stubs) ─────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
