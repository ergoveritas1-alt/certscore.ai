import fs from "node:fs";
import path from "node:path";

function loadJsonl(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const objs = [];
  let buffer = "", inString = false, escapeNext = false, depth = 0;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i]; buffer += ch;
    if (escapeNext) { escapeNext = false; continue; }
    if (ch === "\\") { escapeNext = true; continue; }
    if (ch === '"' && !inString) { inString = true; continue; }
    if (ch === '"' && inString) { inString = false; continue; }
    if (inString) continue;
    if (ch === "{") depth++; if (ch === "}") depth--;
    if (depth === 0 && buffer.trim()) {
      try { objs.push(JSON.parse(buffer.trim())); buffer = ""; } catch (e) {}
    }
  }
  return objs;
}

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

const baseDir = "apps/web/artifacts/eval/finding-corpus/2026-04-28-merged-reviewed";
const agreed = loadJsonl(path.join(baseDir, "agreed_kimi_review_input.jsonl"));
const challengeOnly = loadJsonl(path.join(baseDir, "challenge-only_kimi_review_input.jsonl"));
const noPos = loadJsonl(path.join(baseDir, "no-positives_kimi_review_input.jsonl"));
const all = [...agreed, ...challengeOnly, ...noPos];

// Manual overrides from Kimi independent review
const overrides = {
  // Downgrade from AGREED to CHALLENGE-ONLY
  "high_sensitivity_data_collection": "challenge_only",
  "reject_did_not_reduce_tracking": "challenge_only",
};

const byFinding = {};
for (const o of all) {
  byFinding[o.finding_id] = byFinding[o.finding_id] || { positive: [], challenge: [] };
  byFinding[o.finding_id][o.example_type].push(o);
}

// Rebuild directories
for (const dir of ['agreed', 'challenge-only', 'no-positives']) {
  const d = path.join(baseDir, dir, 'findings');
  if (fs.existsSync(d)) {
    fs.rmSync(d, { recursive: true });
  }
}

const finalAgreed = [];
const finalChallenge = [];
const finalNoPos = [];
const report = {
  reviewed_at: new Date().toISOString(),
  reviewer: "kimi-think-mode-independent-manual",
  source: "merged prod (1066 scans) + dev (442 scans)",
  total_scans: 1508,
  total_examples: all.length,
  findings_reviewed: [],
};

for (const [fid, data] of Object.entries(byFinding)) {
  // Determine verdict
  let verdict = 'agreed';
  if (data.positive.length === 0) {
    verdict = 'no_positives';
  } else {
    const allLimited = data.positive.every(p => p.confidence === 'limited');
    const allInferred = data.positive.every(p => p.direct_vs_inferred === 'inferred');
    const allNoSnippets = data.positive.every(p => (p.evidence?.evidence_snippets?.length || 0) === 0);
    const allNoExec = data.positive.every(p => !p.appeared_in_executive_summary);
    const allNoCounts = data.positive.every(p => Object.keys(p.evidence?.counts || {}).length === 0);
    if (allLimited && allInferred && allNoSnippets && allNoExec && allNoCounts) {
      verdict = 'challenge_only';
    }
  }
  // Apply manual overrides
  if (overrides[fid]) verdict = overrides[fid];

  report.findings_reviewed.push({
    finding_id: fid,
    finding_label: data.positive[0]?.finding_label || data.challenge[0]?.finding_label || fid,
    verdict,
    positive_count: data.positive.length,
    challenge_count: data.challenge.length,
  });

  const categoryDir = verdict === 'agreed'
    ? path.join(baseDir, 'agreed', 'findings', fid)
    : verdict === 'challenge_only'
    ? path.join(baseDir, 'challenge-only', 'findings', fid)
    : path.join(baseDir, 'no-positives', 'findings', fid);

  if (data.positive.length > 0) {
    ensureDir(path.join(categoryDir, 'positive'));
    data.positive.forEach((o, i) => {
      fs.writeFileSync(path.join(categoryDir, 'positive', (i + 1) + '.json'), JSON.stringify(o, null, 2));
    });
  }
  if (data.challenge.length > 0) {
    ensureDir(path.join(categoryDir, 'challenge'));
    data.challenge.forEach((o, i) => {
      fs.writeFileSync(path.join(categoryDir, 'challenge', (i + 1) + '.json'), JSON.stringify(o, null, 2));
    });
  }

  if (verdict === 'agreed') {
    for (const o of data.positive) finalAgreed.push(o);
    for (const o of data.challenge) finalAgreed.push(o);
  } else if (verdict === 'challenge_only') {
    for (const o of data.positive) finalChallenge.push(o);
    for (const o of data.challenge) finalChallenge.push(o);
  } else {
    for (const o of data.challenge) finalNoPos.push(o);
  }
}

fs.writeFileSync(path.join(baseDir, 'agreed_kimi_review_input.jsonl'), finalAgreed.map(o => JSON.stringify(o, null, 2)).join('\n') + '\n');
fs.writeFileSync(path.join(baseDir, 'challenge-only_kimi_review_input.jsonl'), finalChallenge.map(o => JSON.stringify(o, null, 2)).join('\n') + '\n');
fs.writeFileSync(path.join(baseDir, 'no-positives_kimi_review_input.jsonl'), finalNoPos.map(o => JSON.stringify(o, null, 2)).join('\n') + '\n');
fs.writeFileSync(path.join(baseDir, 'review_report.json'), JSON.stringify(report, null, 2));

const agreedCount = report.findings_reviewed.filter(f => f.verdict === 'agreed').length;
const challengeCount = report.findings_reviewed.filter(f => f.verdict === 'challenge_only').length;
const noPosCount = report.findings_reviewed.filter(f => f.verdict === 'no_positives').length;

console.log('=== FINAL MANUAL REVIEW ===');
console.log('Agreed:', agreedCount, '(' + finalAgreed.length + ' examples)');
console.log('Challenge-only:', challengeCount, '(' + finalChallenge.length + ' examples)');
console.log('No-positives:', noPosCount, '(' + finalNoPos.length + ' examples)');
console.log('\nManual overrides applied:');
for (const [fid, v] of Object.entries(overrides)) {
  console.log('  ' + fid + ' -> ' + v);
}
