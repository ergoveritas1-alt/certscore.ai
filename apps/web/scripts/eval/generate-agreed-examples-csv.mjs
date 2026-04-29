import fs from "node:fs";
import path from "node:path";

const baseDir = "apps/web/artifacts/eval/finding-corpus/2026-04-28-merged-reviewed";

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

function escapeCSV(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toJson(v) {
  if (v === null || v === undefined) return "";
  return JSON.stringify(v);
}

function getCounts(o) {
  const c = o.evidence?.counts || {};
  return Object.entries(c).map(([k, v]) => k + "=" + v).join(";");
}

function getSnippets(o) {
  const s = o.evidence?.evidence_snippets || [];
  return s.map((t, i) => "[SNIP" + (i + 1) + "]" + String(t).substring(0, 200)).join(" | ");
}

function getFirstSnippet(o) {
  const s = o.evidence?.evidence_snippets || [];
  return s[0] || "";
}

function getSnippetCount(o) {
  return (o.evidence?.evidence_snippets || []).length;
}

function getVendors(o) {
  return (o.evidence?.vendors || []).join(";");
}

function getRequestDomains(o) {
  return (o.evidence?.request_domains || []).join(";");
}

function getCookieSamples(o) {
  return (o.evidence?.cookie_samples || []).map(c => c.name || String(c)).join(";");
}

function getPolicyAnchors(o) {
  return (o.evidence?.policy_anchors || []).map(p => p.text || String(p)).join(" | ").substring(0, 500);
}

function getRuntimeAnchors(o) {
  return (o.evidence?.runtime_anchors || []).map(r => r.text || String(r)).join(" | ").substring(0, 500);
}

function getConflictBridge(o) {
  const b = o.evidence?.conflict_bridge;
  if (!b) return "";
  return (b.text || String(b)).substring(0, 500);
}

function getConsentSummary(o) {
  const c = o.evidence?.consent_summary;
  if (!c) return "";
  return JSON.stringify(c).substring(0, 500);
}

function getFingerprintingSignals(o) {
  const f = o.evidence?.fingerprinting_or_device_signals;
  if (!f) return "";
  return JSON.stringify(f).substring(0, 500);
}

const objs = loadJsonl(path.join(baseDir, "agreed_kimi_review_input.jsonl"));

const headers = [
  "example_type",
  "scan_id",
  "domain",
  "requested_url",
  "final_url",
  "created_at",
  "scanned_at",
  "finding_id",
  "finding_label",
  "section",
  "confidence",
  "direct_vs_inferred",
  "surface_priority",
  "appeared_in_executive_summary",
  "regulatory_lanes",
  "normalized_concern_ids",
  "concern_policy_rule_ids",
  "coverage_flags",
  "known_limitations",
  "selection_reason",
  "snippet_count",
  "first_snippet",
  "all_snippets_truncated",
  "counts_kv",
  "vendors",
  "request_domains",
  "cookie_samples",
  "policy_anchors_truncated",
  "runtime_anchors_truncated",
  "conflict_bridge_truncated",
  "consent_summary_truncated",
  "fingerprinting_signals_truncated",
];

const rows = objs.map(o => {
  return [
    o.example_type,
    o.scan_id,
    o.domain,
    o.requested_url,
    o.final_url,
    o.created_at,
    o.scanned_at,
    o.finding_id,
    o.finding_label,
    o.section,
    o.confidence,
    o.direct_vs_inferred,
    o.surface_priority,
    o.appeared_in_executive_summary,
    toJson(o.regulatory_lanes),
    toJson(o.normalized_concern_ids),
    toJson(o.concern_policy_rule_ids),
    toJson(o.coverage_flags),
    toJson(o.known_limitations),
    o.selection_reason,
    getSnippetCount(o),
    getFirstSnippet(o),
    getSnippets(o),
    getCounts(o),
    getVendors(o),
    getRequestDomains(o),
    getCookieSamples(o),
    getPolicyAnchors(o),
    getRuntimeAnchors(o),
    getConflictBridge(o),
    getConsentSummary(o),
    getFingerprintingSignals(o),
  ].map(escapeCSV);
});

const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n") + "\n";
fs.writeFileSync(path.join(baseDir, "agreed_examples.csv"), csv);
console.log("CSV written:", path.join(baseDir, "agreed_examples.csv"));
console.log("Rows:", rows.length);
console.log("Columns:", headers.length);
