import fs from "node:fs";
import path from "node:path";

const baseDir = "apps/web/artifacts/eval/finding-corpus/2026-04-28-merged-reviewed";

// Load manual review
const reviews = JSON.parse(fs.readFileSync(path.join(baseDir, "manual_review.json"), "utf8"));

// Load merged finding counts
const mergedCounts = fs.readFileSync("apps/web/artifacts/eval/finding-corpus/2026-04-28-merged/finding_counts.csv", "utf8")
  .trim().split("\n").slice(1).map(line => {
    const [finding_id, finding_label, positive_available, challenge_available, positive_selected, challenge_selected, pos_shortfall, chl_shortfall] = line.split(",");
    return { finding_id, finding_label, positive_available: +positive_available, challenge_available: +challenge_available, positive_selected: +positive_selected, challenge_selected: +challenge_selected, pos_shortfall: +pos_shortfall, chl_shortfall: +chl_shortfall };
  });

// Load full prod stats
const prodStats = {};
const prodLines = fs.readFileSync("apps/web/artifacts/eval/finding-corpus/2026-04-28-prod-full/full_finding_stats.csv", "utf8")
  .trim().split("\n").slice(1);
for (const line of prodLines) {
  const cols = line.split(",");
  prodStats[cols[0]] = {
    total_encounters: +cols[2],
    surfaced: +cols[3],
    suppressed: +cols[4],
    audit_only: +cols[5],
    review: +cols[6],
    surface_rate: cols[7],
    suppression_rate: cols[8],
    audit_only_rate: cols[9],
    unique_scans: +cols[18],
    unique_domains: +cols[19],
  };
}

// Build CSV
const headers = [
  "finding_id",
  "finding_label",
  "manual_verdict",
  "manual_reasoning",
  "concerns",
  "pos_count",
  "chl_count",
  "pos_shortfall",
  "chl_shortfall",
  "pos_available_in_pool",
  "chl_available_in_pool",
  "pos_strong",
  "pos_good",
  "pos_limited",
  "pos_direct",
  "pos_inferred",
  "pos_exec_mapped",
  "pos_with_snippets",
  "pos_with_counts",
  "pos_avg_snippets",
  "pos_avg_richness",
  "chl_strong",
  "chl_good",
  "chl_limited",
  "chl_direct",
  "chl_inferred",
  "chl_exec_mapped",
  "chl_with_snippets",
  "chl_with_counts",
  "prod_total_encounters",
  "prod_surfaced",
  "prod_surface_rate",
  "prod_audit_only",
  "prod_audit_only_rate",
  "prod_unique_scans",
  "prod_unique_domains",
];

function escapeCSV(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const rows = [];
for (const r of reviews) {
  const counts = mergedCounts.find(c => c.finding_id === r.fid) || {};
  const ps = prodStats[r.fid] || { total_encounters: 0, surfaced: 0, surface_rate: "0", audit_only: 0, audit_only_rate: "0", unique_scans: 0, unique_domains: 0 };

  rows.push([
    r.fid,
    r.label,
    r.verdict,
    r.reasoning,
    r.concerns.join("; ") || "none",
    r.pos_count,
    r.chl_count,
    counts.pos_shortfall ?? "",
    counts.chl_shortfall ?? "",
    counts.positive_available ?? "",
    counts.challenge_available ?? "",
    r.pos_profile.strong,
    r.pos_profile.good,
    r.pos_profile.limited,
    r.pos_profile.direct,
    r.pos_profile.inferred,
    r.pos_profile.exec,
    r.pos_profile.snippets,
    r.pos_profile.counts,
    r.pos_profile.avg_snippets,
    r.pos_profile.avg_richness,
    r.chl_profile.strong,
    r.chl_profile.good,
    r.chl_profile.limited,
    r.chl_profile.direct,
    r.chl_profile.inferred,
    r.chl_profile.exec,
    r.chl_profile.snippets,
    r.chl_profile.counts,
    ps.total_encounters,
    ps.surfaced,
    ps.surface_rate,
    ps.audit_only,
    ps.audit_only_rate,
    ps.unique_scans,
    ps.unique_domains,
  ].map(escapeCSV));
}

const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n") + "\n";
fs.writeFileSync(path.join(baseDir, "finding_review.csv"), csv);
console.log("CSV written:", path.join(baseDir, "finding_review.csv"));
console.log("Rows:", rows.length);
console.log("Columns:", headers.length);
