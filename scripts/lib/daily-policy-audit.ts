import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { policySurfaceObservationSchema } from "../../packages/certscore-contracts/src/index";
import { GDPR_TRANSPARENCY_REPORT_ROW_IDS } from "../../apps/web/lib/scans/gdpr-transparency-report-contract";

export const POLICY_AUDIT_VERSION = "certscore.daily-policy-audit.v1";
// The inventory comes from the canonical retained contract, including profiling.
export const policyTopicSchema = policySurfaceObservationSchema.shape.article13DisclosureSignals.removeDefault().element.shape.disclosureType;
export const POLICY_AUDIT_TOPICS = policyTopicSchema.options;
export type PolicyTopic = z.infer<typeof policyTopicSchema>;
export type RecordValue = Record<string, unknown>;
export const object = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
export const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const string = (value: unknown): string | null => typeof value === "string" && value.trim() ? value : null;
export const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

// Audit tooling is installed independently of product contracts. Validate new
// PDF metadata here without requiring an unshipped product package update.
function completePdfSource(value: unknown): boolean {
  const coverage = object(value);
  return coverage.contractVersion === "policy_pdf_source_coverage.v1" &&
    coverage.status === "complete" && coverage.pageLimit === 12 &&
    coverage.characterLimit === 500_000 && coverage.characterLimitReached === false &&
    typeof coverage.totalPages === "number" && Number.isInteger(coverage.totalPages) &&
    coverage.totalPages > 0 && coverage.totalPages <= 12 &&
    coverage.extractedPages === coverage.totalPages;
}

const aliases: Record<string, PolicyTopic> = {
  retention_disclosure: "data_retention", retention_disclosure_observed: "data_retention", retention_disclosure_present: "data_retention",
  legal_basis_disclosure_observed: "legal_basis", recipients_vendor_categories_disclosure: "recipients_or_vendor_categories",
  dpo_contact_point_disclosure: "dpo_contact", supervisory_authority_complaint_disclosure: "supervisory_authority",
  automated_decision_making_profiling_disclosure: "automated_decision_making_or_profiling",
};
export function policyTopicForReportRow(id: string): PolicyTopic | null {
  if (id === "privacy_notice_availability") return null;
  const parsed = policyTopicSchema.safeParse(aliases[id] ?? id.replace(/_disclosure$/, ""));
  if (!parsed.success) throw Error(`Unmapped canonical policy report row: ${id}`);
  return parsed.data;
}
for (const id of GDPR_TRANSPARENCY_REPORT_ROW_IDS) policyTopicForReportRow(id);

export type Receipt = {
  scanId: string; kind: string; localPath: string; verified: boolean;
  expected: { sha256: string; sizeBytes: number };
};
/** Only bounded, already-retained local files. A missing download is not a bad
 * source and this utility has no network/API client or retrieval fallback. */
export function verifiedLocalBytes(root: string, receipt: Receipt, maxBytes: number): Buffer {
  if (!receipt.verified || !/^[a-f0-9]{64}$/.test(receipt.expected?.sha256 ?? "") ||
      !Number.isSafeInteger(receipt.expected?.sizeBytes) || receipt.expected.sizeBytes <= 0 || receipt.expected.sizeBytes > maxBytes) throw Error("Invalid original artifact receipt");
  const base = realpathSync(root), file = realpathSync(receipt.localPath);
  if (!file.startsWith(base + path.sep) || statSync(file).size !== receipt.expected.sizeBytes) throw Error("Artifact path or size mismatch");
  const bytes = readFileSync(file);
  if (sha256(bytes) !== receipt.expected.sha256) throw Error("Artifact checksum mismatch");
  return bytes;
}
function safeUrl(value: unknown): string | null {
  try { const u = new URL(String(value)); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.origin + u.pathname : null; } catch { return null; }
}
function hostname(value: unknown): string | null { try { return new URL(String(value)).hostname.replace(/^www\./, ""); } catch { return null; } }

export type PolicyDocument = {
  key: string; observationId: string; surfaceType: string; url: string | null; urlSha256: string;
  language: string | null; fetch: string; role: string; relationship: string; textCoverage: string;
  sectionCoverage: string; sourceTextChars: number | null; retainedTextChars: number | null;
  file: { relativePath: string; sha256: string; bytes: number; chars: number } | null;
  verification: "verified_local_bytes" | "not_retrieved" | "no_full_text_reference" | "invalid_local_bytes";
  limitations: string[];
};
export type CaptureCheck = {
  scanId: string; site: string; region: string; producer: string | null; scanStatus: string;
  bundleVerification: "verified_local_bytes" | "unavailable" | "invalid";
  sourceSha256: string | null; observedPolicyLink: boolean | null; policyFetches: number | null;
  metadataUsablePolicyCandidates: number | null; knownAvailablePolicyRecall: null;
  inspection?: { completed: boolean | null; discoveryCoverage: string; retrievalCoverage: string; attempted: number | null; failed: number | null; reasons: string[] };
  privacyCandidateStates?: { url: string | null; link: string; fetch: string; evaluation: string }[];
  documents: PolicyDocument[]; riskReasons: string[]; limitations: string[];
};
export function inspectPolicyCapture(input: { root: string; scanId: string; site: string; region: string; status: string;
  bundle?: RecordValue; sourceSha256?: string; verification?: CaptureCheck["bundleVerification"]; receipts: Receipt[] }): CaptureCheck {
  const b = input.bundle;
  const base: CaptureCheck = { scanId: input.scanId, site: input.site, region: input.region, producer: string(object(b?.scannerBuildProvenance).gitSha), scanStatus: input.status,
    bundleVerification: input.verification ?? (b ? "verified_local_bytes" : "unavailable"), sourceSha256: input.sourceSha256 ?? null,
    observedPolicyLink: null, policyFetches: null, metadataUsablePolicyCandidates: null, knownAvailablePolicyRecall: null,
    documents: [], riskReasons: [], limitations: [] };
  if (!b || base.bundleVerification !== "verified_local_bytes") { base.limitations.push("verified_policy_bundle_unavailable"); return base; }
  if (!Array.isArray(b.policySurfaceObservations)) { base.limitations.push("policy_observation_contract_unavailable"); return base; }
  const policies = array(b.policySurfaceObservations).map(object), privacy = policies.filter(p => p.surfaceType === "privacy_policy");
  const inspection = object(b.policySurfaceInspection), retrieval = object(inspection.retrievalDiagnostics);
  base.inspection = { completed: typeof inspection.inspectionCompleted === "boolean" ? inspection.inspectionCompleted : null,
    discoveryCoverage: String(inspection.linkDiscoveryCoverageStatus ?? "unknown"), retrievalCoverage: String(inspection.documentRetrievalCoverageStatus ?? "unknown"),
    attempted: typeof retrieval.attemptedDocumentCount === "number" ? retrieval.attemptedDocumentCount : null,
    failed: typeof retrieval.failedDocumentCount === "number" ? retrieval.failedDocumentCount : null,
    reasons: [...array(inspection.limitationKeys), ...array(retrieval.failureReasons)].map(String) };
  base.privacyCandidateStates = privacy.map(p => ({ url: safeUrl(p.finalUrl ?? p.url), link: String(p.linkObservationState ?? "unknown"),
    fetch: String(p.documentFetchState ?? p.status ?? "unknown"), evaluation: String(p.documentEvaluationState ?? "unknown") }));
  base.observedPolicyLink = privacy.some(p => p.linkObservationState === "observed");
  base.policyFetches = privacy.filter(p => (p.documentFetchState ?? p.status) === "fetched").length;
  base.metadataUsablePolicyCandidates = privacy.filter(p => (p.documentFetchState ?? p.status) === "fetched" && p.documentRole === "policy_document" &&
    ["target_controller", "first_party_brand"].includes(String(p.targetRelationship)) && p.documentEvaluationState === "usable").length;
  // Ownership and usability above are producer metadata, not independent review.
  for (const p of policies.filter(p => (p.documentFetchState ?? p.status) === "fetched")) {
    const coverage = object(p.documentTextCoverage), sections = object(p.contentCoverage);
    const doc: PolicyDocument = { key: String(p.observationId), observationId: String(p.observationId), surfaceType: String(p.surfaceType),
      url: safeUrl(p.finalUrl ?? p.url), urlSha256: sha256(String(p.finalUrl ?? p.url)), language: string(p.documentLanguage ?? p.matchedLocale),
      fetch: String(p.documentFetchState ?? p.status), role: String(p.documentRole ?? "unknown"), relationship: String(p.targetRelationship ?? "unknown"),
      textCoverage: coverage.pdfSourceCoverage === undefined ? String(coverage.status ?? "unknown") :
        completePdfSource(coverage.pdfSourceCoverage)
          ? String(coverage.status ?? "unknown") : "partial_or_unknown_source_document",
      sectionCoverage: String(sections.status ?? "unknown"),
      sourceTextChars: typeof coverage.sourceTextChars === "number" ? coverage.sourceTextChars : null,
      retainedTextChars: typeof coverage.retainedTextChars === "number" ? coverage.retainedTextChars : null,
      file: null, verification: "no_full_text_reference", limitations: [...array(coverage.limitationKeys), ...array(sections.limitationKeys)].map(String) };
    const refs = array(p.artifactRefs).map(object).filter(ref => String(ref.artifactId).startsWith("policy_surface_text_"));
    if (refs.length === 1) {
      const ref = refs[0]!, matches = input.receipts.filter(r => r.scanId === input.scanId && r.kind === path.basename(String(ref.path)));
      doc.verification = "not_retrieved";
      if (matches.length === 1) try {
        const receipt = matches[0]!, bytes = verifiedLocalBytes(input.root, receipt, 2_000_000);
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        doc.file = { relativePath: path.relative(input.root, realpathSync(receipt.localPath)), sha256: sha256(bytes), bytes: bytes.length, chars: text.length };
        doc.verification = "verified_local_bytes";
        if (doc.retainedTextChars !== null && text.length !== doc.retainedTextChars) doc.limitations.push("retained_text_length_does_not_match_metadata");
      } catch { doc.verification = "invalid_local_bytes"; }
      else if (matches.length > 1) { doc.verification = "invalid_local_bytes"; doc.limitations.push("ambiguous_full_text_receipts"); }
    } else if (refs.length > 1) doc.limitations.push("ambiguous_full_text_references");
    base.documents.push(doc);
  }
  if (new Set(base.documents.map(d => d.key)).size !== base.documents.length) {
    base.limitations.push("duplicate_policy_observation_identity");
    for (const doc of base.documents) { doc.file = null; doc.verification = "invalid_local_bytes"; }
  }
  for (const doc of base.documents.filter(d => d.surfaceType === "privacy_policy")) {
    if (hostname(doc.url) !== hostname(b.normalizedUrl ?? b.url)) base.riskReasons.push("different_policy_host");
    if (doc.language && !doc.language.startsWith("en")) base.riskReasons.push("non_english_policy");
    if (doc.textCoverage !== "complete") base.riskReasons.push("partial_or_unknown_text_coverage");
    if (doc.sectionCoverage === "truncated") base.riskReasons.push("bounded_section_extraction");
    if (doc.role !== "policy_document" || !["target_controller", "first_party_brand"].includes(doc.relationship)) base.riskReasons.push("unverified_governing_scope");
    if (/\.pdf$/i.test(doc.url ?? "")) base.riskReasons.push("pdf_policy");
  }
  if (base.documents.filter(d => d.surfaceType === "privacy_policy").length > 1) base.riskReasons.push("multiple_privacy_policies");
  base.riskReasons = [...new Set(base.riskReasons)].sort();
  if (!privacy.length) base.limitations.push("no_retained_privacy_policy_candidate_does_not_establish_absence");
  return base;
}

export function selectPolicyReviews(checks: CaptureCheck[], deepReviewIds: string[], seed: string) {
  const allowed = new Set(deepReviewIds), seen = new Set<string>();
  const ordered = checks.filter(c => allowed.has(c.scanId) && c.bundleVerification === "verified_local_bytes" &&
    c.documents.some(d => d.surfaceType === "privacy_policy" && d.verification === "verified_local_bytes") &&
    c.documents.reduce((n, d) => n + (d.file?.chars ?? 0), 0) <= 200_000)
    .sort((a, b) => sha256(seed + a.scanId).localeCompare(sha256(seed + b.scanId)))
    .filter(c => { if (seen.has(c.site)) return false; seen.add(c.site); return true; });
  const random = ordered.slice(0, 5);
  const risks = ordered.filter(c => !random.includes(c)).sort((a, b) => b.riskReasons.length - a.riskReasons.length ||
    sha256(seed + a.scanId).localeCompare(sha256(seed + b.scanId))).slice(0, 3);
  const selected = [...random, ...risks];
  return { seed, selected: selected.map(c => ({ scanId: c.scanId, reason: random.includes(c) ? "seeded_random" : "source_risk", riskReasons: c.riskReasons })),
    eligible: ordered.length, target: 8, shortfall: Math.max(0, 8 - selected.length),
    excludedForWorkBudget: checks.filter(c => allowed.has(c.scanId) && c.documents.reduce((n, d) => n + (d.file?.chars ?? 0), 0) > 200_000).map(c => c.scanId),
    selectionDisclosure: "Producer ownership/role/coverage metadata and prior audit context may be visible. Selection uses no generated report labels or scores. This is not a claim of full blinding." };
}

const evidenceSchema = z.object({ documentKey: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  start: z.number().int().nonnegative(), end: z.number().int().positive() }).strict();
const topicReviewSchema = z.object({ topic: policyTopicSchema,
  expected: z.enum(["supported", "no_support_with_sufficient_coverage", "insufficient_evidence", "not_applicable", "ambiguous"]),
  rationale: z.string().min(20).max(1200), evidence: z.array(evidenceSchema).max(12),
}).strict();
export const policyPassASchema = z.object({ version: z.literal(POLICY_AUDIT_VERSION), preparationSha256: z.string().regex(/^[a-f0-9]{64}$/),
  reviewerKind: z.literal("independent_model_audit"), exposureDisclosure: z.string().min(20).max(2000),
  reviews: z.array(z.object({ scanId: z.string().min(1).max(160), reuse: z.enum(["new_review", "reused_review"]),
    reusedFrom: z.object({ path: z.string().max(1000), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional(),
    documents: z.array(z.object({ documentKey: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), fullTextRead: z.boolean(),
      governing: z.enum(["yes", "no", "unresolved"]), ownership: z.enum(["confirmed_target", "confirmed_first_party_brand", "wrong_owner", "unresolved"]),
      supplements: z.enum(["verified_complete", "shown_irrelevant", "unresolved"]),
      rationale: z.string().min(20).max(1200), evidence: z.array(evidenceSchema).max(12),
    }).strict()).max(40), topics: z.array(topicReviewSchema).length(POLICY_AUDIT_TOPICS.length),
  }).strict()).max(100),
}).strict();
export type PolicyPassA = z.infer<typeof policyPassASchema>;
export type Preparation = { version: typeof POLICY_AUDIT_VERSION; inputRun: string; invocation: "manual_pilot" | "scheduled";
  selectedScanIds: string[]; checks: CaptureCheck[]; interpretationVersion: string; topicInventory: string[];
  inputFiles?: { name: string; sha256: string }[] };

export function readPolicyDocument(root: string, doc: PolicyDocument): string {
  if (!doc.file || doc.verification !== "verified_local_bytes") throw Error("Full policy text not verified");
  const receipt: Receipt = { scanId: "", kind: "", localPath: path.resolve(root, doc.file.relativePath), verified: true,
    expected: { sha256: doc.file.sha256, sizeBytes: doc.file.bytes } };
  return new TextDecoder("utf-8", { fatal: true }).decode(verifiedLocalBytes(root, receipt, 2_000_000));
}
export function validatePolicyPassA(value: unknown, prep: Preparation, preparationBytes: Buffer): PolicyPassA {
  const result = policyPassASchema.parse(value);
  if (result.preparationSha256 !== sha256(preparationBytes)) throw Error("Preparation drift");
  if (canonical([...new Set(result.reviews.map(r => r.scanId))].sort()) !== canonical([...prep.selectedScanIds].sort()) ||
      result.reviews.length !== prep.selectedScanIds.length) throw Error("Every selected policy review must be accounted for exactly once");
  for (const review of result.reviews) {
    if (new Set(review.topics.map(t => t.topic)).size !== POLICY_AUDIT_TOPICS.length) throw Error("Missing or duplicate canonical topic");
    const check = prep.checks.find(c => c.scanId === review.scanId)!;
    const files = check.documents.filter(d => d.file), docMap = new Map(files.map(d => [d.key, d]));
    const confirmations = new Map(review.documents.map(d => [d.documentKey, d]));
    if (confirmations.size !== review.documents.length || review.documents.some(d => !docMap.has(d.documentKey) || docMap.get(d.documentKey)!.file!.sha256 !== d.sha256)) throw Error("Review source identity mismatch");
    const validateRefs = (refs: z.infer<typeof evidenceSchema>[]) => {
      for (const ref of refs) {
        const doc = docMap.get(ref.documentKey); if (!doc?.file || doc.file.sha256 !== ref.sha256 || ref.end <= ref.start || ref.end - ref.start > 1600) throw Error("Invalid passage reference");
        const text = readPolicyDocument(prep.inputRun, doc);
        if (ref.end > text.length || !text.slice(ref.start, ref.end).trim()) throw Error("Passage outside verified retained text");
      }
    };
    for (const d of review.documents) { validateRefs(d.evidence); if (d.governing === "yes" && ["confirmed_target", "confirmed_first_party_brand"].includes(d.ownership) && !d.evidence.length) throw Error("Governing ownership needs retained source support"); }
    const eligible = (key: string) => { const d = confirmations.get(key); return d?.fullTextRead && d.governing === "yes" && ["confirmed_target", "confirmed_first_party_brand"].includes(d.ownership); };
    const sufficient = review.documents.some(d => eligible(d.documentKey) && ["verified_complete", "shown_irrelevant"].includes(d.supplements)) &&
      check.documents.filter(d => d.surfaceType === "privacy_policy").every(d => d.file && confirmations.has(d.key)) &&
      review.documents.filter(d => d.governing === "yes").every(d => d.fullTextRead && ["verified_complete", "shown_irrelevant"].includes(d.supplements) &&
        docMap.get(d.documentKey)!.textCoverage === "complete" && !docMap.get(d.documentKey)!.limitations.includes("retained_text_length_does_not_match_metadata"));
    for (const t of review.topics) {
      validateRefs(t.evidence);
      if (t.expected === "supported" && (!t.evidence.length || t.evidence.some(ref => !eligible(ref.documentKey)))) throw Error("Positive topic needs an owned governing full-text source");
      if (t.expected === "no_support_with_sufficient_coverage" && !sufficient) throw Error("Absence requires complete owned sources and resolved supplements");
      if (t.expected === "not_applicable" && (!t.evidence.length || t.evidence.some(ref => !eligible(ref.documentKey)))) throw Error("Applicability cannot be inferred from silence");
    }
    if ((review.reuse === "reused_review") !== Boolean(review.reusedFrom)) throw Error("Reused review must identify its original source");
  }
  return result;
}

export function comparePolicyTopics(passA: PolicyPassA, productRows: Record<string, RecordValue[]>) {
  return passA.reviews.flatMap(review => review.topics.map(topic => {
    const rows = (productRows[review.scanId] ?? []).filter(r => GDPR_TRANSPARENCY_REPORT_ROW_IDS.includes(String(r.id) as never) && policyTopicForReportRow(String(r.id)) === topic.topic);
    const observed = rows.some(r => r.status === "Observed"), present = rows.length > 0;
    const notConfirmed = rows.length > 0 && rows.every(r => r.status === "Not confirmed");
    const outcome = !present ? "product_row_unavailable" : !observed && !notConfirmed ? "product_status_requires_review" : topic.expected === "supported" ? observed ? "presence_agreement" : "candidate_missed_disclosure" :
      topic.expected === "no_support_with_sufficient_coverage" ? observed ? "candidate_unsupported_observation" : "no_support_agreement" :
      topic.expected === "not_applicable" ? "applicability_review" : "interpretation_unresolved";
    return { scanId: review.scanId, topic: topic.topic, expected: topic.expected, productLabels: rows.map(r => String(r.status)),
      productRowIds: rows.map(r => String(r.id)), outcome, reviewReuse: review.reuse,
      firstBrokenStage: outcome.startsWith("candidate_") ? "unresolved_requires_canonical_trace" : null,
      evidenceReferences: topic.evidence, rationale: topic.rationale,
      productCitationSemanticCheck: "not_checked", legalAdequacyAssessed: false };
  }));
}

export function summarizePolicyAudit(prep: Preparation, reviews?: PolicyPassA, comparisons: ReturnType<typeof comparePolicyTopics> = []) {
  const verified = prep.checks.filter(c => c.bundleVerification === "verified_local_bytes");
  const linked = verified.filter(c => c.observedPolicyLink === true), fetched = verified.filter(c => (c.policyFetches ?? 0) > 0);
  const candidates = comparisons.filter(c => c.outcome.startsWith("candidate_"));
  const pending = comparisons.filter(c => !["presence_agreement", "no_support_agreement"].includes(c.outcome));
  const captures = (reviews?.reviews ?? []).map(r => ({ scanId: r.scanId,
    outcome: r.documents.some(d => d.governing === "yes" && d.fullTextRead && ["confirmed_target", "confirmed_first_party_brand"].includes(d.ownership)) ? "governing_policy_confirmed_in_sample" :
      r.documents.length > 0 && r.documents.every(d => d.governing === "no") ? "no_governing_policy_in_reviewed_documents" : "governing_scope_unresolved",
    allReviewedDocumentsRead: r.documents.length > 0 && r.documents.every(d => d.fullTextRead) }));
  const complete = (reviews?.reviews ?? []).filter(r => r.documents.some(d => d.governing === "yes" && d.fullTextRead &&
    ["confirmed_target", "confirmed_first_party_brand"].includes(d.ownership)) && r.documents.filter(d => d.governing === "yes").every(d =>
      d.fullTextRead && prep.checks.find(c => c.scanId === r.scanId)?.documents.find(source => source.key === d.documentKey)?.textCoverage === "complete"));
  return { version: POLICY_AUDIT_VERSION, invocation: prep.invocation, inventoryAttempts: prep.checks.length, verifiedBundleMetadataChecks: verified.length,
    bundleUnavailableOrInvalid: prep.checks.length - verified.length, linksObserved: linked.length, scansWithFetchedPrivacyPolicy: fetched.length,
    invalidCanonicalBundles: prep.checks.filter(c => c.bundleVerification === "invalid").length,
    completedAttemptsWithoutVerifiedBundle: prep.checks.filter(c => c.scanStatus === "completed" && c.bundleVerification !== "verified_local_bytes").length,
    scansWithMetadataUsablePolicyCandidate: verified.filter(c => (c.metadataUsablePolicyCandidates ?? 0) > 0).length,
    scansWithRetrievalFailures: verified.filter(c => (c.inspection?.failed ?? 0) > 0).length,
    retainedPrivacyTextVerification: Object.fromEntries(["verified_local_bytes", "not_retrieved", "no_full_text_reference", "invalid_local_bytes"].map(status =>
      [status, verified.flatMap(c => c.documents).filter(d => d.surfaceType === "privacy_policy" && d.verification === status).length])),
    sampledCaptureReviews: captures,
    linkToMetadataUsableConversion: { numerator: linked.filter(c => (c.metadataUsablePolicyCandidates ?? 0) > 0).length, denominator: linked.length,
      meaning: "Producer metadata among scans with observed links; not verified capture recall or semantic policy accuracy." },
    knownAvailablePolicyCaptureRecall: null, policyAvailabilityIndependentlyEstablished: false,
    selectedPolicyReviews: prep.selectedScanIds.length, accountedReviewRecords: reviews?.reviews.length ?? 0,
    completedPolicyReviews: complete.length,
    newIndependentModelReviews: reviews?.reviews.filter(r => r.reuse === "new_review").length ?? 0,
    reusedReviews: reviews?.reviews.filter(r => r.reuse === "reused_review").length ?? 0,
    canonicalTopicsPerReview: POLICY_AUDIT_TOPICS.length, reviewedTopicPairs: comparisons.length,
    outcomeCounts: Object.fromEntries([...new Set(comparisons.map(c => c.outcome))].sort().map(k => [k, comparisons.filter(c => c.outcome === k).length])),
    candidateDefects: candidates.length, pendingCanonicalTraceReviews: candidates.map(c => ({ scanId: c.scanId, topic: c.topic, reason: c.outcome })),
    pendingReviewPairs: pending.map(c => ({ scanId: c.scanId, topic: c.topic, reason: c.outcome })),
    citationSemanticChecksNotPerformed: comparisons.length, humanAdjudicated: false, precision: null, recall: null,
    auditStateAutomaticallyModified: false, productionProjectable: false,
    completion: !reviews ? "awaiting_pass_a" : pending.length ? "reviewed_with_pending_work" : "reviewed_presence_comparison_only",
    pilot: { targetScheduledRuns: 7, manualPilotCountsAsScheduled: false, automaticExpansionAuthorized: false },
  };
}
