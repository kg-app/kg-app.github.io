// ═══════════════════════════════════════════════════════════
// ai.js — STUB IMPLEMENTATION
// Replace each function body with a fetch() call to a
// serverless backend endpoint holding the Anthropic key.
// Signatures are the contract; keep them stable across swaps.
// ═══════════════════════════════════════════════════════════

const AI = {

  // Document / paste ingestion → starting claim set.
  // Stub returns the seeded generic dataset (keyword-extracted from pitch text).
  async extractClaims({ text, fileNames }) {
    await delay(1500);
    return makeGenericDataset();
  },

  // Per-claim critique + counterfactual discovery.
  // Stub returns canned HTML critique + one derived counterfactual.
  async critiqueClaim({ claim, analysisContext }) {
    await delay(1000);
    return {
      crit: '<ul><li><strong>Specificity gap.</strong> This claim lacks a measurable baseline — without one it is not falsifiable as written.</li><li><strong>Source risk.</strong> The evidence base appears attitudinal rather than behavioral, which typically overstates urgency.</li></ul><em>Falsification condition: if an independent survey of the target population contradicts this claim at a statistically significant level, it does not hold as stated.</em>',
      counterfactuals: [{
        statement: 'If the problem described here is addressable by existing tools with minor configuration changes, this claim does not constitute a genuine market gap.',
        severity: 'invalidate'
      }]
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

// ── Delay helper ──────────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Generic stub dataset (used by extractClaims) ─────────
// Moved here so the AI seam owns the "fake extraction" data.
function makeGenericDataset() {
  return {
    claims: [
      { id: 'G1', cat: 'Pain',
        text: '"Mid-market SaaS buyers churn within 90 days primarily due to unclear pricing tiers"',
        fw: 'BLAC: Blatant', fw2: 'VPD: Customer pain', status: 'assumed',
        ev: ['GE1'], tn: ['GT1'], cf: [], exp: [],
        note: 'Based on a small sample of churn interviews. Needs validation against churn data, not just stated reasons.',
        prov: { src: 'northwind-pitch.pdf · slide 3', extracted: 'AI extraction · pass 1',
                creator: 'AI auto-extraction', confidence: 0.7,
                srcQuote: 'Customers frequently cite confusion about which tier covers their usage as a reason for cancelling within the first quarter.',
                trail: [{ when: '2025-05-02 09:10', who: 'AI extraction', what: 'Extracted from pitch deck' }] },
        crit: 'This claim conflates two distinct problems: pricing confusion at signup versus pricing confusion at renewal. The 90-day window suggests an onboarding issue more than a pricing-structure issue. Needs a churn survey with a forced-choice reason, not open text.' },

      { id: 'G2', cat: 'Solution',
        text: '"Usage-based pricing increases expansion revenue by 20 percent or more versus flat-rate plans"',
        fw: '4U: Unworkable (current)', fw2: 'Lean Canvas: Solution', status: 'assumed',
        ev: [], tn: ['GT1'], cf: [], exp: [],
        note: 'No internal data yet. This is an industry benchmark claim, not yet tested on this product.',
        prov: { src: 'northwind-pitch.pdf · slide 7', extracted: 'AI extraction · pass 1',
                creator: 'AI auto-extraction', confidence: 0.55,
                srcQuote: 'Industry data suggests usage-based pricing models can drive 20%+ higher expansion revenue compared to flat-rate plans.',
                trail: [{ when: '2025-05-02 09:10', who: 'AI extraction', what: 'Extracted from pitch deck' }] },
        crit: 'This is an industry-wide statistic, not evidence specific to this product or customer base. Needs a controlled pricing experiment with a subset of customers before being treated as a product claim.' },

      { id: 'G3', cat: 'Persona',
        text: '"Procurement teams require SOC 2 Type II certification before signing annual contracts"',
        fw: 'BLAC: Blatant', fw2: 'Regulatory driver', status: 'supported',
        ev: ['GE2'], tn: [], cf: [], exp: [],
        note: 'Confirmed in 9 of 10 enterprise deals reviewed. Strong behavioral evidence.',
        prov: { src: 'Sales call notes · Q2 2025', extracted: 'Manual entry',
                creator: 'Sales lead', confidence: 1.0,
                srcQuote: 'SOC 2 report requested in 9 of 10 enterprise deals reviewed this quarter, typically at the contract-redline stage.',
                trail: [{ when: '2025-05-10 14:00', who: 'Sales lead (manual)', what: 'Added from CRM deal review' }] },
        crit: 'Strong evidence. Consider whether SOC 2 Type I is sufficient at the pilot stage to reduce sales cycle friction before Type II is complete.' }
    ],
    evidence: [
      { id: 'GE1', claims: ['G1'],
        text: '3 of 5 churned customers cited pricing-tier confusion in exit interviews.',
        src: 'Exit interview notes · 2025', type: 'attitudinal', cls: 'qualifies', str: 1,
        prov: { src: 'Exit interview log · Q1 2025', extracted: 'Manual entry',
                creator: 'Customer success lead', confidence: 1.0,
                srcQuote: 'Exit interview summary: of 5 churned accounts contacted, 3 mentioned being unsure which plan tier matched their usage.',
                trail: [{ when: '2025-04-28 11:00', who: 'CS lead (manual)', what: 'Logged from exit interview calls' }] } },

      { id: 'GE2', claims: ['G3'],
        text: 'CRM review: SOC 2 report requested in 9 of 10 enterprise deals this quarter.',
        src: 'CRM deal review · Q2 2025', type: 'behavioral', cls: 'supports', str: 3,
        prov: { src: 'Salesforce deal review export', extracted: 'Manual entry',
                creator: 'Sales lead', confidence: 1.0,
                srcQuote: 'Deal stage notes across 10 enterprise opportunities show SOC 2 documentation requested in 9 cases prior to signature.',
                trail: [{ when: '2025-05-10 14:05', who: 'Sales lead (manual)', what: 'Compiled from CRM export' }] } }
    ],
    tensions: [
      { id: 'GT1', title: 'Pricing model vs. revenue claim', claims: ['G1', 'G2'],
        type: 'com', pri: 'p1', status: 'assumed',
        desc: 'G1 says pricing confusion drives churn. G2 says usage-based pricing increases expansion revenue. Usage-based pricing is often less predictable for buyers, which could increase confusion rather than reduce it.',
        path: 'Run a small pilot comparing churn and expansion on usage-based versus flat-rate cohorts before committing to a single pricing direction.',
        prov: { src: 'Auto-detected · cross-claim analysis', extracted: 'AI tension detection',
                creator: 'AI auto-detection', confidence: 0.68,
                srcQuote: 'Cross-claim analysis: G1 and G2 may conflict if usage-based pricing increases perceived complexity.',
                trail: [{ when: '2025-05-02 09:15', who: 'AI tension detection', what: 'Auto-detected from G1 and G2' }] } }
    ],
    counterfactuals: [],
    experiments: [],
    sources: [
      { name: 'northwind-pitch.pdf',        added: '2025-05-02', size: '2.4 MB' },
      { name: 'customer-interviews.docx',   added: '2025-05-10', size: '180 KB' }
    ]
  };
}
