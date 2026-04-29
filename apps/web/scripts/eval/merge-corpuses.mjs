import fs from "node:fs";
import path from "node:path";

function getArgValue(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

function loadJsonl(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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
  if ((o.known_limitations || []).some((entry) => /partial_scan|incomplete_pages/i.test(entry))) score += 5;
  if (o.source === "prod") score += 3;
  return score;
}

function loadCorpus(inputDir, source) {
  const jsonlPath = path.join(inputDir, "kimi_review_input.jsonl");
  const objects = loadJsonl(jsonlPath);
  return objects.map((object) => ({ ...object, source }));
}

const prodDir = getArgValue("--prod-dir", "apps/web/artifacts/eval/finding-corpus/2026-04-29-prod-refresh");
const devDir = getArgValue("--dev-dir", "apps/web/artifacts/eval/finding-corpus/2026-04-29-refresh");
const outDir = getArgValue("--out-dir", "apps/web/artifacts/eval/finding-corpus/2026-04-29-merged-refresh");

const prodObjs = loadCorpus(prodDir, "prod");
const devObjs = loadCorpus(devDir, "dev");
const allObjs = [...prodObjs, ...devObjs];

const byFinding = {};
for (const object of allObjs) {
  byFinding[object.finding_id] ??= { positive: [], challenge: [] };
  byFinding[object.finding_id][object.example_type].push(object);
}

const selected = [];
const findingStats = [];

for (const [findingId, data] of Object.entries(byFinding)) {
  const positive = data.positive.sort((a, b) => scorePositive(b) - scorePositive(a)).slice(0, 5);
  const challenge = data.challenge.sort((a, b) => scoreChallenge(b) - scoreChallenge(a)).slice(0, 5);
  selected.push(...positive, ...challenge);
  findingStats.push({
    finding_id: findingId,
    finding_label: positive[0]?.finding_label || challenge[0]?.finding_label || findingId,
    positive_total: data.positive.length,
    challenge_total: data.challenge.length,
    positive_selected: positive.length,
    challenge_selected: challenge.length,
    prod_positive_selected: positive.filter((entry) => entry.source === "prod").length,
    prod_challenge_selected: challenge.filter((entry) => entry.source === "prod").length,
    dev_positive_selected: positive.filter((entry) => entry.source === "dev").length,
    dev_challenge_selected: challenge.filter((entry) => entry.source === "dev").length,
    pos_shortfall: Math.max(0, 5 - positive.length),
    chl_shortfall: Math.max(0, 5 - challenge.length)
  });
}

selected.sort((a, b) => {
  if (a.finding_id !== b.finding_id) return a.finding_id.localeCompare(b.finding_id);
  if (a.example_type !== b.example_type) return a.example_type === "positive" ? -1 : 1;
  return a.source.localeCompare(b.source);
});

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "kimi_review_input.jsonl"), selected.map((object) => JSON.stringify(object)).join("\n") + "\n");

const summary = [
  "# Merged Corpus Summary (Prod + Dev)",
  "",
  `- Source corpuses: ${prodDir} + ${devDir}`,
  `- Prod examples in pool: ${prodObjs.length}`,
  `- Dev examples in pool: ${devObjs.length}`,
  `- Unique findings in merged corpus: ${Object.keys(byFinding).length}`,
  `- Total selected examples: ${selected.length}`,
  `- Selected prod examples: ${selected.filter((entry) => entry.source === "prod").length}`,
  `- Selected dev examples: ${selected.filter((entry) => entry.source === "dev").length}`,
  "",
  "## Selection Logic",
  "- Positives scored by confidence, directness, executive mapping, evidence richness, and a small prod preference.",
  "- Challenges scored by weak confidence, inferred status, missing evidence, coverage issues, and a small prod preference.",
  "- Max 5 positive + 5 challenge per finding.",
  "- `source` is preserved on every JSONL row.",
  "",
  "## Per-Finding Counts",
  ...findingStats
    .sort((a, b) => a.finding_id.localeCompare(b.finding_id))
    .map((stat) =>
      `- ${stat.finding_id}: ${stat.positive_selected} pos (${stat.positive_total} available, ${stat.pos_shortfall} short; prod/dev selected ${stat.prod_positive_selected}/${stat.dev_positive_selected}), ${stat.challenge_selected} chl (${stat.challenge_total} available, ${stat.chl_shortfall} short; prod/dev selected ${stat.prod_challenge_selected}/${stat.dev_challenge_selected})`
    )
];
fs.writeFileSync(path.join(outDir, "corpus_summary.md"), summary.join("\n") + "\n");

const csvHeaders = [
  "finding_id",
  "finding_label",
  "positive_available",
  "challenge_available",
  "positive_selected",
  "challenge_selected",
  "prod_positive_selected",
  "prod_challenge_selected",
  "dev_positive_selected",
  "dev_challenge_selected",
  "pos_shortfall",
  "chl_shortfall"
];
const csvRows = findingStats
  .sort((a, b) => a.finding_id.localeCompare(b.finding_id))
  .map((stat) =>
    [
      stat.finding_id,
      JSON.stringify(stat.finding_label),
      stat.positive_total,
      stat.challenge_total,
      stat.positive_selected,
      stat.challenge_selected,
      stat.prod_positive_selected,
      stat.prod_challenge_selected,
      stat.dev_positive_selected,
      stat.dev_challenge_selected,
      stat.pos_shortfall,
      stat.chl_shortfall
    ].join(",")
  );
fs.writeFileSync(path.join(outDir, "finding_counts.csv"), [csvHeaders.join(","), ...csvRows].join("\n") + "\n");

console.log("Merged corpus exported to:", outDir);
console.log("Total selected examples:", selected.length);
console.log("Unique findings:", Object.keys(byFinding).length);
console.log("Selected prod examples:", selected.filter((entry) => entry.source === "prod").length);
console.log("Selected dev examples:", selected.filter((entry) => entry.source === "dev").length);
