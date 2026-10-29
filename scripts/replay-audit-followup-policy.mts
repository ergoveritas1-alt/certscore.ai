/** Retained-only citation replay. No environment, model, browser or network work. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { article13DisclosureRejectReason } = require("../packages/certscore-contracts/src/article13-disclosure-rejection");
const { extractPolicySections, retainedArticle13SectionEvidenceFromSections, gdprTransparencyTopicCandidatesFromRetainedPolicySections } = require("../packages/certscore-scan-core/src/scanners/policy-surface-scanner");
const { adaptGdprTransparencyTopicCandidatesForProduction } = require("../apps/web/lib/scans/gdpr-transparency-topic-evidence-adapter");
const { buildNormalizedConcerns } = require("../apps/web/lib/scans/normalized-concerns");
const { deriveGdprEprivacyCoveragePolicyOutcomes } = require("../apps/web/lib/scans/gdpr-eprivacy-coverage-policy");
const { deriveGdprEprivacyCoverageChecklist } = require("../apps/web/lib/scans/gdpr-eprivacy-coverage-checklist");
const { inspectPolicyCapture, readPolicyDocument, verifiedLocalBytes } = require("./lib/daily-policy-audit");
const out = process.argv[2]; assert.ok(out, "Supply a fresh output JSON path");
const base = "/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/";
const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const cases = [
  { id: "bc72037c-5a39-41ff-ab5e-3ddccdd1b991", root: base + "20261027T044232Z-manual-audit-1e655977", key: "policy_surface_48c4ac5f", topic: "processing_purposes" },
  { id: "d4b559ea-87ca-46a9-9479-b24b35435689", root: base + "20261026T142223Z-scheduled-23dced66", key: "policy_surface_7cdd5719", topic: "processing_purposes" },
  { id: "eae5bc3f-da0c-4347-8d70-2a1a647330c5", root: base + "20261026T142223Z-scheduled-23dced66", key: "policy_surface_51cc0e8e", topic: "recipients_or_vendor_categories" },
  { id: "88e97dba-f21f-4f65-b5a8-bdf0aabe42c6", root: base + "20261026T142223Z-scheduled-23dced66", key: "policy_surface_b71ca2fc", topic: "data_retention" },
];
globalThis.fetch = async () => { throw new Error("Network disabled for retained policy replay"); };
const results: any[] = [];
for (const { id, root, key, topic } of cases) {
  const receipts = read(root + "/evidence-retrieval-receipts.json"), support = read(root + "/support-retrieval-receipts.json");
  const receipt = receipts.find((r: any) => r.scanId === id && r.kind === "scanArtifactUri" && r.eventIndex === 0);
  assert.ok(receipt);
  const bytes = verifiedLocalBytes(root, receipt, 20_000_000), bundle = JSON.parse(bytes.toString("utf8"));
  const original = bundle.policySurfaceObservations.find((row: any) => row.observationId === key); assert.ok(original);
  const inspection = inspectPolicyCapture({ root, scanId: id, site: new URL(bundle.url).hostname, region: bundle.region, status: "completed", bundle, receipts: support });
  const doc = inspection.documents.find((row: any) => row.key === key); assert.ok(doc?.file);
  const text = readPolicyDocument(root, doc);
  const rawBefore = createHash("sha256").update(bytes).digest("hex");
  if (id === cases[0]!.id) {
    const weak = read(root + "/policy-citation-trace.json").find((row: any) => row.scanId === id && row.topic === topic).selectedQuote;
    for (const mode of ["scan_core", "retained_report", "multilingual_classifier"]) assert.notEqual(article13DisclosureRejectReason(weak, topic, { mode }), null);
  }
  for (const [mode, sections] of [["retained", original.retainedPolicySections], ["text_reextract", extractPolicySections({ html: "", visibleText: text, sourceUrl: doc.url })]] as const) {
    const witnesses = retainedArticle13SectionEvidenceFromSections(sections, doc.url);
    const signals = witnesses.filter((row: any) => row.signalObserved === "observed").map((row: any) => ({ disclosureType: row.coverageArea,
      status: "observed", confidence: .9, source: "deterministic", evidenceText: row.selectedPolicySectionExcerpt.slice(0,640),
      selectedPolicySectionExcerpt: row.selectedPolicySectionExcerpt, selectedPolicySectionHeading: row.selectedPolicySectionHeading,
      selectedPolicySectionUrl: row.selectedPolicySectionUrl, selectedEvidenceStrength: row.selectedEvidenceStrength }));
    const candidates = gdprTransparencyTopicCandidatesFromRetainedPolicySections(sections);
    const adapted = adaptGdprTransparencyTopicCandidatesForProduction({ isTargetRelevantPrivacyPolicy: original.documentRole === "policy_document" &&
      ["target_controller", "first_party_brand"].includes(original.targetRelationship) && original.governingPolicySelection?.state !== "ineligible",
      policyTextQuality: { usable: true }, pageUrl: doc.url, targetUrl: bundle.url,
      surface: { ...original, article13DisclosureSignals: signals, gdprTransparencyTopicCandidates: candidates } });
    const accepted = adapted.acceptedProductionSignals.filter((row: any) => row.disclosureType === topic);
    // Old You.com retained sections lack the actual retention clause; only a
    // verified text re-extraction can recover it. Never invent absent context.
    if ((mode === "retained" && topic !== "data_retention" || mode === "text_reextract" && id !== cases[0]!.id) && !accepted.length) {
      writeFileSync(out + ".debug.json", JSON.stringify({ id, mode, witnesses, dispositions: adapted.dispositions }, null, 2));
      assert.fail(`${id} ${mode}: no supported replacement`);
    }
    const runtimeArtifacts = { policyDisclosureSummary: { article13DisclosureSignals: adapted.acceptedProductionSignals,
      gdprTransparencyEvidenceProfile: adapted.profile, gdprTransparencyProductionEvidenceEnabled: adapted.productionEvidenceEnabled } };
    const concerns = buildNormalizedConcerns({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [] });
    const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({ coverageLimited: false, events: [], normalizedConcerns: concerns, runtimeArtifacts, scanCompleted: true, snapshot: {} });
    const rows = deriveGdprEprivacyCoverageChecklist({ coverageLimited: false, coverageOutcomes: outcomes, projectedFindings: [], unifiedFindings: [], scanCompleted: true });
    const normalized = concerns.filter((row: any) => row.originKey === `gdpr_transparency.article13.${topic}`);
    if (accepted.length) assert.ok(normalized.length);
    results.push({ scanId: id, topic, mode, sourceSha256: doc.file.sha256, accepted: accepted.map((row: any) => ({ quote: row.evidenceText })),
      normalizedConcernCount: normalized.length, limitation: accepted.length ? null : "No supported bounded witness in this mode; retain unknown, never borrow context", checklist: rows.filter((row: any) => row.evidenceState === "observed").map((row: any) => row.id) });
  }
  assert.equal(createHash("sha256").update(bytes).digest("hex"), rawBefore);
}
writeFileSync(out, JSON.stringify({ results, productionCalls: 0, modelCalls: 0, historicalWrites: 0,
  scope: "Citation counterfactual only. Original no-go outcomes, scores, DPO ownership and unresolved legal-basis bindings are not reclassified." }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ policyDocuments: cases.length, replayModes: results.length, passed: true }));
