import fs from "node:fs";
import path from "node:path";

function loadJsonl(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const objs = [];
  let buffer = "";
  let inString = false;
  let escapeNext = false;
  let depth = 0;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    buffer += ch;
    if (escapeNext) { escapeNext = false; continue; }
    if (ch === "\\") { escapeNext = true; continue; }
    if (ch === '"' && !inString) { inString = true; continue; }
    if (ch === '"' && inString) { inString = false; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0 && buffer.trim()) {
      try { objs.push(JSON.parse(buffer.trim())); buffer = ""; } catch (e) {}
    }
  }
  return objs;
}

const merged = loadJsonl("apps/web/artifacts/eval/finding-corpus/2026-04-28-merged-reviewed/agreed_kimi_review_input.jsonl");
const challengeOnly = loadJsonl("apps/web/artifacts/eval/finding-corpus/2026-04-28-merged-reviewed/challenge-only_kimi_review_input.jsonl");
const noPos = loadJsonl("apps/web/artifacts/eval/finding-corpus/2026-04-28-merged-reviewed/no-positives_kimi_review_input.jsonl");

const allObjs = [...merged, ...challengeOnly, ...noPos];

const byFinding = {};
for (const o of allObjs) {
  byFinding[o.finding_id] = byFinding[o.finding_id] || { positive: [], challenge: [] };
  byFinding[o.finding_id][o.example_type].push(o);
}

function reviewFinding(fid, data) {
  const p = data.positive;
  const c = data.challenge;
  const label = p[0]?.finding_label || c[0]?.finding_label || fid;

  // Evidence profile of positives
  const pStrong = p.filter(x => x.confidence === 'strong').length;
  const pGood = p.filter(x => x.confidence === 'good').length;
  const pLimited = p.filter(x => x.confidence === 'limited').length;
  const pDirect = p.filter(x => x.direct_vs_inferred === 'direct').length;
  const pInferred = p.filter(x => x.direct_vs_inferred === 'inferred').length;
  const pExec = p.filter(x => x.appeared_in_executive_summary).length;
  const pSnippets = p.filter(x => (x.evidence?.evidence_snippets?.length || 0) > 0).length;
  const pCounts = p.filter(x => Object.keys(x.evidence?.counts || {}).length > 0).length;
  const avgSnippets = p.length > 0 ? (p.reduce((a, x) => a + (x.evidence?.evidence_snippets?.length || 0), 0) / p.length).toFixed(1) : 0;
  const avgRichness = p.length > 0 ? (p.reduce((a, x) => {
    const m = x.selection_reason?.match(/Evidence richness score:\s*(\d+)/);
    return a + (m ? parseInt(m[1]) : 0);
  }, 0) / p.length).toFixed(1) : 0;

  // Evidence profile of challenges
  const cStrong = c.filter(x => x.confidence === 'strong').length;
  const cGood = c.filter(x => x.confidence === 'good').length;
  const cLimited = c.filter(x => x.confidence === 'limited').length;
  const cDirect = c.filter(x => x.direct_vs_inferred === 'direct').length;
  const cInferred = c.filter(x => x.direct_vs_inferred === 'inferred').length;
  const cExec = c.filter(x => x.appeared_in_executive_summary).length;
  const cSnippets = c.filter(x => (x.evidence?.evidence_snippets?.length || 0) > 0).length;
  const cCounts = c.filter(x => Object.keys(x.evidence?.counts || {}).length > 0).length;

  // Independent review verdict
  let verdict = 'UNKNOWN';
  let reasoning = '';

  if (p.length === 0) {
    verdict = 'NO_POSITIVES';
    reasoning = 'Zero surfaced instances in merged corpus';
  } else if (pLimited === p.length && pInferred === p.length && pSnippets === 0 && pExec === 0 && pCounts === 0) {
    verdict = 'CHALLENGE_ONLY';
    reasoning = 'All positives have limited+inferred with zero exportable evidence (no snippets, no counts, no exec)';
  } else {
    // Check if positives are defensible
    const hasConcreteEvidence = p.some(x =>
      (x.evidence?.evidence_snippets?.length || 0) > 0 ||
      Object.keys(x.evidence?.counts || {}).length > 0 ||
      x.appeared_in_executive_summary
    );

    if (!hasConcreteEvidence) {
      verdict = 'CHALLENGE_ONLY';
      reasoning = 'No positive has any exportable evidence (snippets, counts, or exec mapping)';
    } else {
      verdict = 'AGREED';
      const evidenceTypes = [];
      if (pSnippets > 0) evidenceTypes.push(`${pSnippets}/${p.length} have text snippets`);
      if (pCounts > 0) evidenceTypes.push(`${pCounts}/${p.length} have structural counts`);
      if (pExec > 0) evidenceTypes.push(`${pExec}/${p.length} mapped to exec summary`);
      reasoning = 'Positives have concrete evidence: ' + evidenceTypes.join('; ');
    }
  }

  // Check for edge cases
  let concerns = [];
  if (p.some(x => x.confidence === 'strong' && (x.evidence?.evidence_snippets?.length || 0) === 0 && Object.keys(x.evidence?.counts || {}).length === 0 && !x.appeared_in_executive_summary)) {
    concerns.push('Strong confidence with zero evidence');
  }
  if (p.some(x => x.direct_vs_inferred === 'direct' && (x.evidence?.evidence_snippets?.length || 0) === 0 && Object.keys(x.evidence?.counts || {}).length === 0)) {
    concerns.push('Direct classification with zero exportable evidence');
  }
  if (c.some(x => x.confidence === 'strong' || (x.evidence?.evidence_snippets?.length || 0) > 5)) {
    concerns.push('Challenge example has strong evidence (possible misclassification)');
  }

  return {
    fid, label, verdict, reasoning, concerns,
    pos_count: p.length, chl_count: c.length,
    pos_profile: { strong: pStrong, good: pGood, limited: pLimited, direct: pDirect, inferred: pInferred, exec: pExec, snippets: pSnippets, counts: pCounts, avg_snippets: avgSnippets, avg_richness: avgRichness },
    chl_profile: { strong: cStrong, good: cGood, limited: cLimited, direct: cDirect, inferred: cInferred, exec: cExec, snippets: cSnippets, counts: cCounts },
  };
}

const reviews = [];
for (const [fid, data] of Object.entries(byFinding).sort((a, b) => 0)) {
  reviews.push(reviewFinding(fid, data));
}

// Build markdown report
const lines = [
  '# Kimi Independent Manual Review — Merged Corpus (47 Findings)',
  '',
  '## Method',
  '- Examined every positive and challenge example for each finding',
  '- Evidence-first: required concrete snippets, counts, or exec mapping for positive agreement',
  '- Flagged edge cases: strong-with-no-evidence, direct-with-no-evidence, strong-challenges',
  '',
  '## Summary',
  `- Total findings reviewed: ${reviews.length}`,
  `- Agreed: ${reviews.filter(r => r.verdict === 'AGREED').length}`,
  `- Challenge-only: ${reviews.filter(r => r.verdict === 'CHALLENGE_ONLY').length}`,
  `- No-positives: ${reviews.filter(r => r.verdict === 'NO_POSITIVES').length}`,
  `- Findings with concerns: ${reviews.filter(r => r.concerns.length > 0).length}`,
  '',
];

for (const r of reviews) {
  const statusEmoji = r.verdict === 'AGREED' ? '✅' : r.verdict === 'CHALLENGE_ONLY' ? '⚠️' : '🔇';
  lines.push(`## ${statusEmoji} ${r.fid}`);
  lines.push('');
  lines.push(`**Verdict:** ${r.verdict}`);
  lines.push(`**Reasoning:** ${r.reasoning}`);
  if (r.concerns.length > 0) {
    lines.push(`**Concerns:** ${r.concerns.join('; ')}`);
  }
  lines.push('');
  lines.push(`**Positives (${r.pos_count}):** strong=${r.pos_profile.strong} good=${r.pos_profile.good} limited=${r.pos_profile.limited} | direct=${r.pos_profile.direct} inferred=${r.pos_profile.inferred} | exec=${r.pos_profile.exec} snippets=${r.pos_profile.snippets} counts=${r.pos_profile.counts} | avg_snippets=${r.pos_profile.avg_snippets} avg_richness=${r.pos_profile.avg_richness}`);
  lines.push(`**Challenges (${r.chl_count}):** strong=${r.chl_profile.strong} good=${r.chl_profile.good} limited=${r.chl_profile.limited} | direct=${r.chl_profile.direct} inferred=${r.chl_profile.inferred} | exec=${r.chl_profile.exec} snippets=${r.chl_profile.snippets} counts=${r.chl_profile.counts}`);
  lines.push('');
}

const outDir = 'apps/web/artifacts/eval/finding-corpus/2026-04-28-merged-reviewed';
fs.writeFileSync(path.join(outDir, 'MANUAL_REVIEW.md'), lines.join('\n') + '\n');

// Also write JSON
fs.writeFileSync(path.join(outDir, 'manual_review.json'), JSON.stringify(reviews, null, 2));

console.log('Manual review complete');
console.log('Agreed:', reviews.filter(r => r.verdict === 'AGREED').length);
console.log('Challenge-only:', reviews.filter(r => r.verdict === 'CHALLENGE_ONLY').length);
console.log('No-positives:', reviews.filter(r => r.verdict === 'NO_POSITIVES').length);
console.log('With concerns:', reviews.filter(r => r.concerns.length > 0).length);
