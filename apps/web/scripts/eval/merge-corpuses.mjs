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

function scorePositive(o) {
  let score = 0;
  if (o.confidence === "strong") score += 30;
  else if (o.confidence === "good") score += 20;
  if (o.direct_vs_inferred === "direct") score += 20;
  if (o.appeared_in_executive_summary) score += 15;
  score += (o.evidence?.evidence_snippets?.length || 0) * 2;
  score += Object.keys(o.evidence?.counts || {}).length * 2;
  if (o.source === "prod") score += 5;
  return score;
}

function scoreChallenge(o) {
  let score = 0;
  if (o.confidence === "limited") score += 20;
  if (o.direct_vs_inferred === "inferred") score += 15;
  if ((o.evidence?.evidence_snippets?.length || 0) === 0) score += 10;
  if (Object.keys(o.evidence?.counts || {}).length === 0) score += 5;
  const hasCoverage = (o.known_limitations || []).some(l => l.includes("partial_scan") || l.includes("incomplete_pages"));
  if (hasCoverage) score += 5;
  if (o.source === "prod") score += 3;
  return score;
}

const prodObjs = loadJsonl("apps/web/artifacts/eval/finding-corpus/2026-04-28-prod-unfiltered/kimi_review_input.jsonl");
const devObjs = loadJsonl("apps/web/artifacts/eval/finding-corpus/2026-04-28-dev-unfiltered/kimi_review_input.jsonl");

prodObjs.forEach(o => o.source = "prod");
devObjs.forEach(o => o.source = "dev");

const allObjs = [...prodObjs, ...devObjs];

const byFinding = {};
for (const o of allObjs) {
  byFinding[o.finding_id] = byFinding[o.finding_id] || { positive: [], challenge: [] };
  byFinding[o.finding_id][o.example_type].push(o);
}

const selected = [];
const findingStats = [];

for (const [fid, data] of Object.entries(byFinding)) {
  const pos = data.positive.sort((a, b) => scorePositive(b) - scorePositive(a)).slice(0, 5);
  const chl = data.challenge.sort((a, b) => scoreChallenge(b) - scoreChallenge(a)).slice(0, 5);

  for (const o of [...pos, ...chl]) {
    delete o.source;
    selected.push(o);
  }

  findingStats.push({
    finding_id: fid,
    finding_label: pos[0]?.finding_label || chl[0]?.finding_label || fid,
    positive_total: data.positive.length,
    challenge_total: data.challenge.length,
    positive_selected: pos.length,
    challenge_selected: chl.length,
    pos_shortfall: Math.max(0, 5 - pos.length),
    chl_shortfall: Math.max(0, 5 - chl.length),
  });
}

selected.sort((a, b) => {
  if (a.finding_id !== b.finding_id) return a.finding_id.localeCompare(b.finding_id);
  if (a.example_type !== b.example_type) return a.example_type === "positive" ? -1 : 1;
  return 0;
});

const outDir = "apps/web/artifacts/eval/finding-corpus/2026-04-28-merged";
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, "kimi_review_input.jsonl"), selected.map(o => JSON.stringify(o, null, 2)).join("\n") + "\n");

const summary = [
  "# Merged Corpus Summary (Prod + Dev)",
  "",
  `- Total source scans: ${1066 + 442} (1066 prod + 442 dev)`,
  `- Total source findings: ${6309 + 3589}`,
  `- Unique findings in merged corpus: ${Object.keys(byFinding).length}`,
  `- Total selected examples: ${selected.length}`,
  `- Prod examples in pool: ${prodObjs.length}`,
  `- Dev examples in pool: ${devObjs.length}`,
  "",
  "## Selection logic",
  "- Positives scored by: confidence + directness + exec mapping + evidence richness + prod preference",
  "- Challenges scored by: limited confidence + inferred + missing evidence + coverage issues + prod preference",
  "- Max 5 positive + 5 challenge per finding",
  "",
  "## Per-finding counts",
  ...findingStats.map(s => `- ${s.finding_id}: ${s.positive_selected} pos (${s.positive_total} available, ${s.pos_shortfall} short), ${s.challenge_selected} chl (${s.challenge_total} available, ${s.chl_shortfall} short)`),
];

fs.writeFileSync(path.join(outDir, "corpus_summary.md"), summary.join("\n") + "\n");

const csvHeaders = ["finding_id", "finding_label", "positive_available", "challenge_available", "positive_selected", "challenge_selected", "pos_shortfall", "chl_shortfall"];
const csvRows = findingStats.map(s => [s.finding_id, s.finding_label, s.positive_total, s.challenge_total, s.positive_selected, s.challenge_selected, s.pos_shortfall, s.chl_shortfall].join(","));
fs.writeFileSync(path.join(outDir, "finding_counts.csv"), [csvHeaders.join(","), ...csvRows].join("\n") + "\n");

console.log("Merged corpus exported to:", outDir);
console.log("Total selected examples:", selected.length);
console.log("Unique findings:", Object.keys(byFinding).length);
console.log("Findings with pos shortfall:", findingStats.filter(s => s.pos_shortfall > 0).length);
console.log("Findings with chl shortfall:", findingStats.filter(s => s.chl_shortfall > 0).length);
