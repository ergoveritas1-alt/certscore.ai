import fs from "node:fs";

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

const agreed = loadJsonl("apps/web/artifacts/eval/finding-corpus/2026-04-28-merged-reviewed/agreed_kimi_review_input.jsonl");

function examine(findingId) {
  const examples = agreed.filter(o => o.finding_id === findingId);
  console.log(`\n=== ${findingId} ===`);
  for (const o of examples) {
    console.log(`\n[${o.example_type}] ${o.domain}`);
    console.log('  confidence:', o.confidence, '| direct:', o.direct_vs_inferred, '| exec:', o.appeared_in_executive_summary);
    console.log('  snippets:', (o.evidence?.evidence_snippets || []).length);
    console.log('  counts:', JSON.stringify(o.evidence?.counts || {}));
    console.log('  selection_reason:', o.selection_reason);
    if (o.known_limitations?.length) console.log('  limitations:', o.known_limitations);
  }
}

examine('rights_fulfillment_friction');
examine('missing_transfer_disclosure');
examine('affiliate_disclosure_scope_limited');
examine('guaranteed_outcome_claim_detected');
