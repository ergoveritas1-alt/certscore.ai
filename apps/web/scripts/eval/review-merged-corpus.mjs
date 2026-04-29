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

function classifyFinding(positives) {
  if (positives.length === 0) return "no_positives";
  const allLimited = positives.every(p => p.confidence === "limited");
  const allInferred = positives.every(p => p.direct_vs_inferred === "inferred");
  const allNoSnippets = positives.every(p => (p.evidence?.evidence_snippets?.length || 0) === 0);
  const allNoExec = positives.every(p => !p.appeared_in_executive_summary);
  const allNoCounts = positives.every(p => Object.keys(p.evidence?.counts || {}).length === 0);
  if (allLimited && allInferred && allNoSnippets && allNoExec && allNoCounts) return "challenge_only";
  const hasAnyEvidence = positives.some(p =>
    (p.evidence?.evidence_snippets?.length || 0) > 0 ||
    Object.keys(p.evidence?.counts || {}).length > 0 ||
    p.appeared_in_executive_summary
  );
  if (!hasAnyEvidence) return "challenge_only";
  return "agreed";
}

const objs = loadJsonl("apps/web/artifacts/eval/finding-corpus/2026-04-28-merged/kimi_review_input.jsonl");
const byFinding = {};
for (const o of objs) {
  byFinding[o.finding_id] = byFinding[o.finding_id] || { positive: [], challenge: [] };
  byFinding[o.finding_id][o.example_type].push(o);
}

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

const outDir = "apps/web/artifacts/eval/finding-corpus/2026-04-28-merged-reviewed";
ensureDir(path.join(outDir, "agreed"));
ensureDir(path.join(outDir, "challenge-only"));
ensureDir(path.join(outDir, "no-positives"));

const agreedObjs = [];
const challengeOnlyObjs = [];
const noPositivesObjs = [];
const report = {
  reviewed_at: new Date().toISOString(),
  reviewer: "kimi-think-mode-independent",
  source: "merged prod (1066 scans) + dev (442 scans)",
  total_scans: 1508,
  total_examples: objs.length,
  findings_reviewed: [],
};

for (const [fid, data] of Object.entries(byFinding)) {
  const classification = classifyFinding(data.positive);

  report.findings_reviewed.push({
    finding_id: fid,
    finding_label: data.positive[0]?.finding_label || data.challenge[0]?.finding_label || fid,
    verdict: classification,
    positive_count: data.positive.length,
    challenge_count: data.challenge.length,
  });

  const categoryDir = classification === "agreed"
    ? path.join(outDir, "agreed", "findings", fid)
    : classification === "challenge_only"
    ? path.join(outDir, "challenge-only", "findings", fid)
    : path.join(outDir, "no-positives", "findings", fid);

  if (data.positive.length > 0) {
    ensureDir(path.join(categoryDir, "positive"));
    data.positive.forEach((o, i) => {
      fs.writeFileSync(path.join(categoryDir, "positive", (i + 1) + ".json"), JSON.stringify(o, null, 2));
    });
  }
  if (data.challenge.length > 0) {
    ensureDir(path.join(categoryDir, "challenge"));
    data.challenge.forEach((o, i) => {
      fs.writeFileSync(path.join(categoryDir, "challenge", (i + 1) + ".json"), JSON.stringify(o, null, 2));
    });
  }

  if (classification === "agreed") {
    for (const o of data.positive) agreedObjs.push(o);
    for (const o of data.challenge) agreedObjs.push(o);
  } else if (classification === "challenge_only") {
    for (const o of data.positive) challengeOnlyObjs.push(o);
    for (const o of data.challenge) challengeOnlyObjs.push(o);
  } else {
    for (const o of data.challenge) noPositivesObjs.push(o);
  }
}

fs.writeFileSync(path.join(outDir, "agreed_kimi_review_input.jsonl"), agreedObjs.map(o => JSON.stringify(o, null, 2)).join("\n") + "\n");
fs.writeFileSync(path.join(outDir, "challenge-only_kimi_review_input.jsonl"), challengeOnlyObjs.map(o => JSON.stringify(o, null, 2)).join("\n") + "\n");
fs.writeFileSync(path.join(outDir, "no-positives_kimi_review_input.jsonl"), noPositivesObjs.map(o => JSON.stringify(o, null, 2)).join("\n") + "\n");
fs.writeFileSync(path.join(outDir, "review_report.json"), JSON.stringify(report, null, 2));

const agreedCount = report.findings_reviewed.filter(f => f.verdict === "agreed").length;
const challengeOnlyCount = report.findings_reviewed.filter(f => f.verdict === "challenge_only").length;
const noPositivesCount = report.findings_reviewed.filter(f => f.verdict === "no_positives").length;

console.log("=== MERGED REVIEW SUMMARY ===");
console.log("Agreed findings:", agreedCount, "(" + agreedObjs.length + " examples)");
console.log("Challenge-only findings:", challengeOnlyCount, "(" + challengeOnlyObjs.length + " examples)");
console.log("No-positives findings:", noPositivesCount, "(" + noPositivesObjs.length + " examples)");
console.log("\n=== AGREED ===");
for (const f of report.findings_reviewed.filter(f => f.verdict === "agreed")) {
  console.log(f.finding_id, "- pos:", f.positive_count, "chl:", f.challenge_count);
}
console.log("\n=== CHALLENGE-ONLY ===");
for (const f of report.findings_reviewed.filter(f => f.verdict === "challenge_only")) {
  console.log(f.finding_id, "- pos:", f.positive_count, "chl:", f.challenge_count);
}
console.log("\n=== NO-POSITIVES ===");
for (const f of report.findings_reviewed.filter(f => f.verdict === "no_positives")) {
  console.log(f.finding_id, "- pos:", f.positive_count, "chl:", f.challenge_count);
}
