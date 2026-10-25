/** CertScore.ai local retained-evidence audit. No network or production writes. */
import { readFileSync, writeFileSync, mkdirSync, realpathSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  POLICY_AUDIT_VERSION, POLICY_AUDIT_TOPICS, array, object, sha256,
  inspectPolicyCapture, verifiedLocalBytes, selectPolicyReviews, readPolicyDocument,
  validatePolicyPassA, comparePolicyTopics, summarizePolicyAudit,
  type Receipt, type Preparation, type RecordValue,
} from "./lib/daily-policy-audit";

function jsonFile(file: string, max = 80_000_000): unknown {
  if (statSync(file).size > max) throw Error(`Oversize audit input: ${path.basename(file)}`);
  const bytes = readFileSync(file);
  return JSON.parse(bytes.toString("utf8"));
}
function save(dir: string, name: string, value: unknown) {
  writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
}
function validId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(value)) throw Error("Unsafe scan identity");
  return value;
}
export function preparePolicyAudit(input: { run: string; out: string; invocation: Preparation["invocation"] }) {
  const root = realpathSync(input.run), requestedOut = path.resolve(input.out);
  const out = path.join(realpathSync(path.dirname(requestedOut)), path.basename(requestedOut));
  // A completed source run is immutable. The audit goes in a new sibling/new run.
  if (out === root || out.startsWith(root + path.sep) || existsSync(out)) throw Error("Choose a new output directory outside the retained source run");
  if (!["manual_pilot", "scheduled"].includes(input.invocation)) throw Error("Unknown invocation kind");
  const inventory = array(jsonFile(path.join(root, "work-inventory-v2.json"))).map(object);
  if (!inventory.length || inventory.length > 20_000) throw Error("Invalid bounded inventory");
  const ids = inventory.map(row => validId(row.id));
  if (new Set(ids).size !== ids.length) throw Error("Duplicate scan identity in inventory");
  const receipts = array(jsonFile(path.join(root, "evidence-retrieval-receipts.json"))) as Receipt[];
  const support = array(jsonFile(path.join(root, "support-retrieval-receipts.json"))) as Receipt[];
  const selection = object(jsonFile(path.join(root, "full-review-selection.json")));
  if (typeof selection.seed !== "string" || !selection.seed) throw Error("Missing independent selection seed");
  const checks = inventory.map(row => {
    const scanId = validId(row.id), matching = receipts.filter(r => r.scanId === scanId && r.kind === "scanArtifactUri" && object(r).eventIndex === 0);
    let bundle: RecordValue | undefined, sourceSha256: string | undefined;
    let verification: "verified_local_bytes" | "unavailable" | "invalid" = "unavailable";
    if (matching.length) try {
      if (matching.length !== 1) throw Error("Ambiguous canonical source");
      const bytes = verifiedLocalBytes(root, matching[0]!, 20_000_000);
      bundle = object(JSON.parse(bytes.toString("utf8")));
      if (bundle.scanId !== scanId) throw Error("Canonical source scan identity mismatch");
      sourceSha256 = sha256(bytes); verification = "verified_local_bytes";
    } catch { bundle = undefined; verification = "invalid"; }
    return inspectPolicyCapture({ root, scanId, site: String(row.hostname ?? "unknown"), region: String(row.scan_from ?? "unknown"),
      status: String(row.status ?? "unknown"), bundle, sourceSha256, verification, receipts: support });
  });
  const selected = selectPolicyReviews(checks, array(selection.normalRandomScanIds).map(validId), selection.seed);
  const prep: Preparation = { version: POLICY_AUDIT_VERSION, inputRun: root, invocation: input.invocation,
    selectedScanIds: selected.selected.map(s => s.scanId), checks, interpretationVersion: "policy-disclosure-audit.v1", topicInventory: [...POLICY_AUDIT_TOPICS],
    inputFiles: ["work-inventory-v2.json", "evidence-retrieval-receipts.json", "support-retrieval-receipts.json", "full-review-selection.json"].map(name => ({ name, sha256: sha256(readFileSync(path.join(root, name))) })) };
  mkdirSync(out); // Parent must exist; never merge outputs or replace a prior run.
  save(out, "preparation.json", prep);
  const prepBytes = readFileSync(path.join(out, "preparation.json"));
  save(out, "policy-capture-checks.json", checks);
  save(out, "policy-review-selection.json", selected);
  save(out, "policy-review-template.json", { version: POLICY_AUDIT_VERSION, preparationSha256: sha256(prepBytes),
    reviewerKind: "independent_model_audit", exposureDisclosure: selected.selectionDisclosure,
    reviews: prep.selectedScanIds.map(scanId => ({ scanId, reuse: "new_review", documents: [],
      topics: POLICY_AUDIT_TOPICS.map(topic => ({ topic, expected: "insufficient_evidence", rationale: "Not reviewed yet; replace before sealing.", evidence: [] })) })) });
  save(out, "policy-audit-summary-preparation.json", summarizePolicyAudit(prep));
  return { out, ...summarizePolicyAudit(prep), selection: selected };
}
function preparation(out: string) {
  const bytes = readFileSync(path.join(out, "preparation.json"));
  const prep = JSON.parse(bytes.toString("utf8")) as Preparation;
  if (prep.version !== POLICY_AUDIT_VERSION || JSON.stringify(prep.topicInventory) !== JSON.stringify(POLICY_AUDIT_TOPICS)) throw Error("Unsupported audit preparation/topic inventory");
  for (const file of prep.inputFiles ?? []) {
    if (path.basename(file.name) !== file.name || sha256(readFileSync(path.join(prep.inputRun, file.name))) !== file.sha256) throw Error("Retained input manifest drift");
  }
  const receipts = array(jsonFile(path.join(prep.inputRun, "evidence-retrieval-receipts.json"))) as Receipt[];
  // Revalidate every selected source, even if the review claims no positive topics.
  for (const check of prep.checks.filter(c => prep.selectedScanIds.includes(c.scanId))) {
    const matching = receipts.filter(r => r.scanId === check.scanId && r.kind === "scanArtifactUri" && object(r).eventIndex === 0);
    if (matching.length !== 1 || sha256(verifiedLocalBytes(prep.inputRun, matching[0]!, 20_000_000)) !== check.sourceSha256) throw Error("Selected canonical source drift");
    for (const doc of check.documents.filter(d => d.file)) readPolicyDocument(prep.inputRun, doc);
  }
  return { prep, bytes };
}
export function sealPolicyAudit(out: string, reviewFile: string) {
  if (existsSync(path.join(out, "policy-pass-a.json")) || existsSync(path.join(out, "policy-pass-a-seal.json"))) throw Error("Pass A already saved; preserve it and use a new output directory for corrections");
  const { prep, bytes } = preparation(out);
  const passA = validatePolicyPassA(jsonFile(reviewFile, 2_000_000), prep, bytes);
  if (passA.reviews.some(r => r.topics.some(t => t.rationale === "Not reviewed yet; replace before sealing."))) throw Error("Review template has not been completed");
  // Reuse is accepted only from a verifiable earlier seal with identical complete
  // document inventories, interpretation version, and source/topic decisions.
  for (const review of passA.reviews.filter(r => r.reusedFrom)) {
    const source = realpathSync(review.reusedFrom!.path), sourceBytes = readFileSync(source);
    if (path.basename(source) !== "policy-pass-a.json" || sha256(sourceBytes) !== review.reusedFrom!.sha256) throw Error("Unverified reused Pass A");
    const priorDir = path.dirname(source), priorSeal = object(jsonFile(path.join(priorDir, "policy-pass-a-seal.json")));
    const priorPrepBytes = readFileSync(path.join(priorDir, "preparation.json")), priorPrep = JSON.parse(priorPrepBytes.toString("utf8")) as Preparation;
    if (priorSeal.passASha256 !== sha256(sourceBytes) || priorSeal.preparationSha256 !== sha256(priorPrepBytes) || priorPrep.interpretationVersion !== prep.interpretationVersion) throw Error("Reused interpretation/seal mismatch");
    const prior = validatePolicyPassA(JSON.parse(sourceBytes.toString("utf8")), priorPrep, priorPrepBytes);
    const inventory = (p: Preparation, id: string) => { const c = p.checks.find(c => c.scanId === id); return c ? {
      site: c.site, region: c.region, documents: c.documents.map(d => [d.urlSha256, d.file?.sha256, d.textCoverage, d.surfaceType, d.relationship, d.role]),
    } : null; };
    const normalized = (r: typeof review) => JSON.stringify({ documents: r.documents, topics: r.topics });
    if (!prior.reviews.some(r => normalized(r) === normalized(review) && JSON.stringify(inventory(priorPrep, r.scanId)) === JSON.stringify(inventory(prep, review.scanId)))) throw Error("Reused document scope or decisions differ");
  }
  save(out, "policy-pass-a.json", passA);
  save(out, "policy-pass-a-seal.json", { version: POLICY_AUDIT_VERSION, sealedAtUtc: new Date().toISOString(),
    preparationSha256: sha256(bytes), passASha256: sha256(readFileSync(path.join(out, "policy-pass-a.json"))),
    generatedProductOutputsReadByThisToolBeforeSeal: false, reviewerKind: passA.reviewerKind });
  return { sealed: true, reviews: passA.reviews.length };
}
export async function comparePolicyAudit(out: string) {
  if (existsSync(path.join(out, "policy-audit-summary.json"))) throw Error("Comparison already saved");
  const { prep, bytes } = preparation(out), passABytes = readFileSync(path.join(out, "policy-pass-a.json"));
  const seal = object(jsonFile(path.join(out, "policy-pass-a-seal.json")));
  if (seal.preparationSha256 !== sha256(bytes) || seal.passASha256 !== sha256(passABytes)) throw Error("Pass A seal mismatch");
  const passA = validatePolicyPassA(JSON.parse(passABytes.toString("utf8")), prep, bytes);
  // Import/read canonical output only after the source review is sealed.
  const { readPersistedScanReportProjection } = await import("../apps/web/server/scans/scan-report-projection-contract");
  const rows: Record<string, RecordValue[]> = {}, sources: unknown[] = [];
  for (const id of prep.selectedScanIds) {
    const file = path.join(prep.inputRun, "scans", validId(id), "persisted", "snapshot.json");
    try {
      const snapshot = object(jsonFile(file, 20_000_000));
      const record = { scan: { id }, snapshot } as Parameters<typeof readPersistedScanReportProjection>[0];
      const report = readPersistedScanReportProjection(record);
      if (!report) throw Error("Persisted canonical projection failed readiness/hash/identity checks");
      rows[id] = array(object(object(report).canonicalReportProjection).checklistRows).map(object)
        .filter(row => /privacy_notice_availability|_disclosure/.test(String(row.id)));
      if (!rows[id]!.length) throw Error("No persisted canonical checklist rows");
      sources.push({ scanId: id, projectionPayloadSha256: snapshot.report_projection_payload_sha256,
        projectionVersion: snapshot.report_projection_version, snapshotFileSha256: sha256(readFileSync(file)), verification: "canonical_persisted_reader", checklistRows: rows[id] });
    } catch (error) { rows[id] = []; sources.push({ scanId: id, verification: "unavailable", reason: String(error).slice(0, 300) }); }
  }
  const comparisons = comparePolicyTopics(passA, rows), summary = summarizePolicyAudit(prep, passA, comparisons);
  save(out, "policy-product-comparison-sources.json", sources);
  save(out, "policy-topic-review.json", comparisons);
  const columns = ["scanId", "topic", "expected", "productLabels", "outcome", "firstBrokenStage", "productCitationSemanticCheck"] as const;
  const csv = (value: unknown) => {
    const text = String(Array.isArray(value) ? value.join("|") : value ?? "");
    return '"' + (/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""') + '"';
  };
  writeFileSync(path.join(out, "policy-topic-review.csv"), [columns.join(","), ...comparisons.map(c => columns.map(k => csv(c[k])).join(","))].join("\n") + "\n", { flag: "wx" });
  save(out, "policy-audit-summary.json", summary);
  save(out, "policy-comparison-seal.json", { preparationSha256: sha256(bytes), passASha256: sha256(passABytes),
    sourcesSha256: sha256(readFileSync(path.join(out, "policy-product-comparison-sources.json"))),
    comparisonSha256: sha256(readFileSync(path.join(out, "policy-topic-review.json"))) });
  return summary;
}
export const policyPassBSchema = z.object({ comparisonSha256: z.string().regex(/^[a-f0-9]{64}$/), reviewerKind: z.literal("independent_model_audit"),
  pairs: z.array(z.object({ scanId: z.string(), topic: z.enum(POLICY_AUDIT_TOPICS),
    classification: z.enum(["expected_policy_behavior", "coverage_limitation", "unresolved", "confirmed_defect"]),
    citationCheck: z.enum(["supports_topic", "source_excerpt_inadequate", "source_binding_unresolved", "not_applicable", "not_checked"]),
    canonicalTrace: z.enum(["complete", "partial", "not_required", "not_checked"]), firstBrokenStage: z.string().min(3).max(500),
    rationale: z.string().min(20).max(2000), traceReferences: z.array(z.string().min(1).max(1000)).min(1).max(12),
  }).strict()).max(1000),
}).strict();
export function finalizePolicyAudit(out: string, reviewFile: string) {
  const { prep, bytes } = preparation(out), passABytes = readFileSync(path.join(out, "policy-pass-a.json"));
  const seal = object(jsonFile(path.join(out, "policy-pass-a-seal.json")));
  if (seal.preparationSha256 !== sha256(bytes) || seal.passASha256 !== sha256(passABytes)) throw Error("Pass A seal mismatch");
  const comparisonBytes = readFileSync(path.join(out, "policy-topic-review.json"));
  const comparisons = JSON.parse(comparisonBytes.toString("utf8")) as ReturnType<typeof comparePolicyTopics>;
  const sourcesBytes = readFileSync(path.join(out, "policy-product-comparison-sources.json"));
  const comparisonSeal = object(jsonFile(path.join(out, "policy-comparison-seal.json")));
  if (comparisonSeal.preparationSha256 !== sha256(bytes) || comparisonSeal.passASha256 !== sha256(passABytes) ||
      comparisonSeal.sourcesSha256 !== sha256(sourcesBytes) || comparisonSeal.comparisonSha256 !== sha256(comparisonBytes)) throw Error("Comparison seal drift");
  const sources = array(JSON.parse(sourcesBytes.toString("utf8"))).map(object);
  for (const source of sources.filter(s => s.snapshotFileSha256)) {
    const file = path.join(prep.inputRun, "scans", validId(source.scanId), "persisted", "snapshot.json");
    if (sha256(readFileSync(file)) !== source.snapshotFileSha256) throw Error("Persisted snapshot changed after comparison");
  }
  const rows = Object.fromEntries(sources.map(s => [String(s.scanId), array(s.checklistRows).map(object)]));
  const passA = validatePolicyPassA(JSON.parse(passABytes.toString("utf8")), prep, bytes);
  if (JSON.stringify(comparePolicyTopics(passA, rows)) !== JSON.stringify(comparisons)) throw Error("Comparison source drift");
  const passB = policyPassBSchema.parse(jsonFile(reviewFile, 2_000_000));
  if (passB.comparisonSha256 !== sha256(comparisonBytes)) throw Error("Pass B comparison drift");
  const key = (p: { scanId: string; topic: string }) => `${p.scanId}:${p.topic}`;
  const expected = new Map(comparisons.map(c => [key(c), c]));
  if (passB.pairs.length !== expected.size || new Set(passB.pairs.map(key)).size !== expected.size) throw Error("Every topic pair needs exactly one Pass B disposition");
  for (const pair of passB.pairs) {
    const comparison = expected.get(key(pair)); if (!comparison) throw Error("Unknown Pass B pair");
    if (comparison.productLabels.includes("Observed") && ["not_applicable", "not_checked"].includes(pair.citationCheck)) throw Error("Every Observed topic requires citation review or an explicit source-binding limitation");
    if (pair.classification === "confirmed_defect" && (pair.canonicalTrace !== "complete" || /unresolved|unknown/i.test(pair.firstBrokenStage))) throw Error("A confirmed defect needs a complete canonical trace");
  }
  const summary = summarizePolicyAudit(prep, passA, comparisons);
  save(out, "policy-pass-b.json", passB);
  save(out, "policy-audit-final.json", { ...summary, passBSha256: sha256(readFileSync(path.join(out, "policy-pass-b.json"))),
    comparisonSha256: sha256(comparisonBytes), completedAtUtc: new Date().toISOString(),
    observedTopicCitationReviews: passB.pairs.filter(p => expected.get(key(p))!.productLabels.includes("Observed")).length,
    citationOutcomeCounts: Object.fromEntries([...new Set(passB.pairs.map(p => p.citationCheck))].sort().map(k => [k, passB.pairs.filter(p => p.citationCheck === k).length])),
    backlogReconciliationRequired: true, confirmedDefects: passB.pairs.filter(p => p.classification === "confirmed_defect").length,
    pendingPairsAfterPassB: passB.pairs.filter(p => p.canonicalTrace === "partial" || p.classification === "unresolved" || p.citationCheck === "source_excerpt_inadequate" || p.citationCheck === "source_binding_unresolved").map(p => ({ scanId: p.scanId, topic: p.topic, reason: p.rationale })),
  });
  return { finalized: true, pairs: passB.pairs.length, observedTopicsReviewed: passB.pairs.filter(p => expected.get(key(p))!.productLabels.includes("Observed")).length };
}
async function main() {
  const [command, ...args] = process.argv.slice(2), options: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i]?.startsWith("--") || !args[i + 1] || args[i + 1]!.startsWith("--")) throw Error("Use paired --run, --out, --invocation or --review options");
    const key = args[i]!.slice(2); if (options[key]) throw Error("Duplicate option"); options[key] = args[i + 1]!;
  }
  if (!options.out) throw Error("--out is required");
  let result: unknown;
  if (command === "prepare" && options.run && options.invocation) result = preparePolicyAudit({ run: options.run, out: options.out, invocation: options.invocation as Preparation["invocation"] });
  else if (command === "seal" && options.review) result = sealPolicyAudit(options.out, options.review);
  else if (command === "compare") result = await comparePolicyAudit(options.out);
  else if (command === "finalize" && options.review) result = finalizePolicyAudit(options.out, options.review);
  else throw Error("Usage: daily-policy-audit.ts prepare --run PATH --out NEW_PATH --invocation manual_pilot|scheduled; seal --out PATH --review PATH; compare --out PATH; finalize --out PATH --review PATH");
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch(error => { process.stderr.write(String(error) + "\n"); process.exitCode = 1; });
