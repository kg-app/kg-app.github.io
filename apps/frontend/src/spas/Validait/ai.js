// ═══════════════════════════════════════════════════════════
// ai.js — AI seam
//
// extractClaims, critiqueClaim, and summariseAnalysis call a serverless
// proxy (see functions/index.js) which holds the real Anthropic API key —
// the browser never sees it. Configure the proxy URL in ai-config.js.
//
// classifyEvidence, classifyTension, clarifyForClaim,
// clarifyForCounterfactual, and generateExperiments remain heuristic
// stubs — swap their bodies for proxy calls the same way when ready.
// Signatures are the contract; keep them stable across swaps.
// ═══════════════════════════════════════════════════════════

// ── Proxy call helper ─────────────────────────────────────
async function callAiProxy(action, payload, idToken) {
  if (!idToken) throw new Error('You must be signed in to use AI features.');
  if (!AI_CONFIG || !AI_CONFIG.endpoint || /YOUR_PROJECT_ID/.test(AI_CONFIG.endpoint)) {
    throw new Error('AI backend not configured — set AI_CONFIG.endpoint in ai-config.js (see functions/README).');
  }
  let res;
  try {
    res = await fetch(AI_CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
      body: JSON.stringify({ action, payload })
    });
  } catch (e) {
    throw new Error('Could not reach AI backend: ' + e.message);
  }
  if (!res.ok) {
    let msg = 'AI request failed (' + res.status + ')';
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

const AI = {

  // Document / paste ingestion → starting claim set.
  // Calls the AI proxy with source text (and/or file names); the proxy
  // returns claim/evidence/tension/counterfactual drafts referencing each
  // other by array index, which we convert into ds-ready entities with
  // real IDs, provenance, and cross-reference arrays here.
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
      prov: {
        src: srcLabel, extracted: 'AI extraction · pass 1', creator: 'AI auto-extraction',
        confidence: typeof c.confidence === 'number' ? c.confidence : 0.6,
        srcQuote: c.sourceQuote || '',
        trail: appendTrail([], { when: ts, who: 'AI extraction', what: 'Extracted from ' + srcLabel })
      },
      crit: 'This claim has not yet been critiqued. Open it and run "Critique with AI" to generate a full challenge.'
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

    const tensions = (raw.tensions || []).map(t => {
      const id = newId('T');
      const claimIds = (t.claimIndexes || []).map(i => claims[i] && claims[i].id).filter(Boolean);
      claimIds.forEach(cid => { const c = claims.find(x => x.id === cid); if (c) c.tn.push(id); });
      return {
        id, title: t.title || 'Untitled tension', claims: claimIds,
        desc: t.desc || '', type: t.type || 'fra', pri: t.pri || 'p2', status: 'assumed',
        path: 'Not yet resolved — review and choose a resolution path.',
        prov: {
          src: 'Auto-detected · cross-claim analysis', extracted: 'AI tension detection', creator: 'AI auto-detection',
          confidence: 0.6, srcQuote: t.desc || '',
          trail: appendTrail([], { when: ts, who: 'AI tension detection', what: 'Auto-detected during extraction' })
        }
      };
    });

    const counterfactuals = (raw.counterfactuals || []).map(cf => {
      const id = newId('CF');
      const claimIds = (cf.claimIndexes || []).map(i => claims[i] && claims[i].id).filter(Boolean);
      claimIds.forEach(cid => { const c = claims.find(x => x.id === cid); if (c) c.cf.push(id); });
      return {
        id, claims: claimIds, statement: cf.statement || '', severity: cf.severity === 'weaken' ? 'weaken' : 'invalidate',
        status: 'proposed',
        prov: {
          src: 'Auto-detected · cross-claim analysis', extracted: 'AI auto-discovery', creator: 'AI auto-discovery',
          confidence: 0.6, srcQuote: cf.statement || '',
          trail: appendTrail([], { when: ts, who: 'AI auto-discovery', what: 'Proposed during extraction' })
        }
      };
    });

    return { claims, evidence, tensions, counterfactuals, experiments: [] };
  },

  // Per-claim critique + evidence-gap + counterfactual discovery.
  async critiqueClaim({ claim, analysisContext, idToken }) {
    const raw = await callAiProxy('critiqueClaim', { claim, analysisContext }, idToken);
    return {
      crit: raw.crit || 'AI did not return a critique.',
      evidenceGaps: raw.evidence_gaps || raw.evidenceGaps || [],
      counterfactuals: raw.counterfactuals || []
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

  // Experiment synthesis from the analysis graph.
  // Stub: port of mock's selection logic — picks highest-priority unaddressed tension /
  // confirmed counterfactual that has no existing experiment linked.
  // Returns null when nothing to propose.
  async generateExperiments({ claims, tensions, counterfactuals, experiments }) {
    await delay(1500);

    const usedTensionIds = new Set(experiments.flatMap(e => (e.derivedFrom && e.derivedFrom.tensions) || []));
    const usedCfIds = new Set(experiments.flatMap(e => (e.derivedFrom && e.derivedFrom.counterfactuals) || []));

    const candidateTension = tensions.find(
      t => (t.pri === 'p0' || t.pri === 'p1') && !usedTensionIds.has(t.id)
    );
    const candidateCf = counterfactuals.find(
      c => (c.status === 'confirmed' || c.status === 'investigating') && !usedCfIds.has(c.id)
    );

    if (!candidateTension && !candidateCf) return null;

    const relatedClaims = new Set();
    if (candidateTension) candidateTension.claims.forEach(c => relatedClaims.add(c));
    if (candidateCf) candidateCf.claims.forEach(c => relatedClaims.add(c));
    const claimsArr = Array.from(relatedClaims);

    const titleSrc = candidateTension
      ? candidateTension.title
      : (candidateCf.statement.substring(0, 55) + '…');

    const reasoningParts = [];
    if (candidateTension) reasoningParts.push('Tension ' + candidateTension.id);
    if (candidateCf)      reasoningParts.push('Counterfactual ' + candidateCf.id);

    return {
      experiment: {
        title: 'Investigate: ' + titleSrc,
        claims: claimsArr,
        derivedFrom: {
          tensions:        candidateTension ? [candidateTension.id] : [],
          counterfactuals: candidateCf      ? [candidateCf.id]      : [],
          claims:          []
        },
        hypothesis:
          'Gather direct evidence to resolve whether this ' +
          (candidateTension ? 'tension' : 'counterfactual') +
          ' holds, using a structured test rather than continued analysis.',
        method:   'Customer interview',
        timeline: '3 weeks',
        metric:   'Clear directional evidence (supports or contradicts) gathered from at least 2 independent sources',
        status:   'proposed',
        reasoning:
          'Synthesised from ' + reasoningParts.join(' and ') +
          '. This was the highest-priority unaddressed item with no experiment currently proposed against it.'
      }
    };
  }
};

// ── Category → framework label map (used by extractClaims) ──
const FW_MAP = {
  Pain: 'BLAC: Blatant', Alternatives: 'Lean Canvas: Alternatives',
  Solution: '4U: Unworkable (current)', Persona: 'Skok: MVS', Commercial: 'Lean Canvas: Revenue'
};

// ── Delay helper (used by remaining heuristic stubs) ─────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
