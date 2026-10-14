import assert from "node:assert/strict";
import test from "node:test";
import { projectPostAcceptEvidenceForReport, cmpCookieExpiryEvidenceSchema, cmpPreferencesEvidenceSchema, consentControlAssessmentSchema, postAcceptEvidencePacketSchema, postRefusalEvidencePacketSchema, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { deriveCmpAuditAssessment } from "./cmp-audit-assessment-projector";
import { observedControlAssessment } from "../../lib/scans/test-fixtures/observed-control-assessment";
import { buildNormalizedConcerns } from "../../lib/scans/normalized-concerns";
import { projectCmpAudit } from "../../lib/scans/cmp-audit-projection";
import { withCanonicalConsentAssessmentSnapshot, withPersistedFirstLayerConsentEvidence } from "./scan-report-consent-projection";

function bundle() {
  const url = "https://example.com/";
  return { scanId: "scan-1", url, startedAt: "2026-10-13T00:00:00.000Z", runtimeCoverage: { coverageStatus: "usable" }, cookieEvents: [],
    policySurfaceObservations: [{ url: `${url}privacy`, documentFetchState: "fetched", documentEvaluationState: "usable" }],
    cmpPreferencesEvidence: cmpPreferencesEvidenceSchema.parse({ contractVersion: "certscore.cmp-preferences-evidence.v1", policyVersion: "bounded_cmp_preferences.v1", scanId: "scan-1", parentDispatchSha256: "a".repeat(64), targetUrl: url, finalUrl: url, documentToken: "loader-1", startedAt: "2026-10-13T00:00:00.000Z", completedAt: "2026-10-13T00:00:02.000Z", status: "completed", support: { state: "partial", provider: "OneTrust", recipeVersion: "bounded_cmp_preferences.v1", reason: "bounded_visible_preference_inspection" }, action: { count: 1, intent: "options", label: "Manage options", opened: true }, controls: [{ label: "Analytics", kind: "category", enabled: true, checked: false }], controlInventoryComplete: true, privacyLinks: [{ url: `${url}privacy`, hitTargetBeforeAction: true }], declarations: [{ name: "_ga", purpose: "Audience measurement", duration: "1 day", source: "cmp_visible_inventory" }], declarationInventoryComplete: false, limitations: [] })
  } as unknown as CanonicalEvidenceBundle;
}

test("verified preferences persist and reach checklist results only through concern policy, without scoring", () => {
  const audit = deriveCmpAuditAssessment(bundle())!;
  assert.equal(audit.rows.find(row => row.id === "categories")?.status, "observed");
  assert.equal(audit.rows.find(row => row.id === "services")?.status, "not_assessed");
  assert.equal(audit.rows.find(row => row.id === "privacy_access")?.status, "observed");
  assert.equal(audit.rows.find(row => row.id === "found_not_declared")?.status, "not_assessed");
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const old = { ...assessment, cmpAudit: undefined };
  const snapshot = withCanonicalConsentAssessmentSnapshot({ consentControlAssessment: old, consent_control_assessment: old }, assessment);
  assert.deepEqual(snapshot.consentControlAssessment, assessment);
  assert.deepEqual(snapshot.consent_control_assessment, assessment);
  const artifacts = withPersistedFirstLayerConsentEvidence({ consentControlAssessment: assessment }, { consent_control_assessment: assessment })!;
  assert.deepEqual((artifacts.consent_control_assessment as typeof assessment).cmpAudit, audit);
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: artifacts, reviewFindingCandidates: [], validationFindings: [] });
  const cmpConcerns = concerns.filter(concern => concern.originKey.startsWith("consent.cmp_audit."));
  assert.equal(cmpConcerns.length, 10);
  assert.ok(cmpConcerns.every(concern => concern.promotionEligibility === "internal_only" && concern.externalSurfacingEligibility === "eligible" && (concern.scoreEffects?.length ?? 0) === 0), JSON.stringify(cmpConcerns.map(c => ({ policy: c.promotionEligibility, external: c.externalSurfacingEligibility, effects: c.scoreEffects, raw: c.evidenceBundle.rawEvidence }))));
  assert.ok(cmpConcerns.every(concern => concern.evidenceBundle.flags.length === 0 && concern.evidenceBundle.policySnippets.length === 0));
  const result = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: assessment, normalizedConcerns: concerns });
  assert.equal(result.rows.find(row => row.id === "categories")?.status, "Observed");
  assert.equal(result.inspectionSupport?.state, "partial");
  const reorder = (value: unknown): unknown => Array.isArray(value) ? value.map(reorder) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, reorder(item)])) : value;
  const transported = reorder({ assessment, concerns }) as { assessment: typeof assessment; concerns: typeof concerns };
  assert.equal(projectCmpAudit({ scanId: "scan-1", consentControlAssessment: transported.assessment, normalizedConcerns: transported.concerns }).rows.find(row => row.id === "categories")?.status, "Observed");
  assert.ok(result.rows.every(row => !row.deductionPoints));
  // A typed assessment alone is not a shortcut around policy evaluation.
  assert.equal(projectCmpAudit({ scanId: "scan-1", consentControlAssessment: assessment }).rows.find(row => row.id === "categories")?.status, "Not assessed");
  cmpConcerns[0]!.evidenceBundle.rawEvidence!.cmpAuditSourceSha256 = "b".repeat(64);
  assert.equal(projectCmpAudit({ scanId: "scan-1", consentControlAssessment: assessment, normalizedConcerns: cmpConcerns }).rows.find(row => row.id === "categories")?.status, "Not assessed");
});

test("partial, failed, foreign and historical evidence cannot establish feature absence", () => {
  for (const mutate of [
    (b: CanonicalEvidenceBundle) => { b.cmpPreferencesEvidence!.controlInventoryComplete = false; b.cmpPreferencesEvidence!.controls = []; },
    (b: CanonicalEvidenceBundle) => { b.cmpPreferencesEvidence!.status = "limited"; },
    (b: CanonicalEvidenceBundle) => { b.cmpPreferencesEvidence!.scanId = "wrong-scan"; },
    (b: CanonicalEvidenceBundle) => { delete b.cmpPreferencesEvidence; },
  ]) {
    const b = bundle(); mutate(b);
    const audit = deriveCmpAuditAssessment(b);
    assert.ok(!audit || audit.rows.every(row => !["feature_not_supported", "not_observed"].includes(row.status)));
  }
});

test("retained timeout projects an inspection outcome without inventing vendor unsupported or feature absence", () => {
  const input = bundle();
  Object.assign(input.cmpPreferencesEvidence!, { status: "limited", controls: [], controlInventoryComplete: false,
    support: { state: "unknown", provider: null, recipeVersion: null, reason: "inspection_incomplete" },
    limitations: ["preference_budget_exhausted"] });
  const audit = deriveCmpAuditAssessment(input)!;
  assert.equal(audit.support.reason, "preference_budget_exhausted");
  assert.equal(audit.support.state, "unknown");
  assert.ok(audit.rows.every(row => ["not_assessed", "incomplete"].includes(row.status)));
  assert.equal(input.cmpPreferencesEvidence!.support.reason, "inspection_incomplete", "original evidence is preserved");
});


test("coordinator timeout without a worker packet remains a score-neutral coverage outcome", () => {
  const input = bundle(); delete input.cmpPreferencesEvidence;
  input.cmpPreferenceLaneOutcome = { status: "limited", startedAt: "2026-10-13T00:00:00.000Z", completedAt: "2026-10-13T00:00:17.000Z", limitationCode: "preference_budget_exhausted" };
  const audit = deriveCmpAuditAssessment(input)!;
  assert.equal(audit.support.reason, "preference_budget_exhausted");
  assert.ok(audit.rows.every(row => row.status === "not_assessed" || (row.status === "incomplete" && row.limitation?.group === "preferences")));
  input.cmpPreferenceLaneOutcome.limitationCode = "preference_worker_failed";
  assert.equal(deriveCmpAuditAssessment(input)!.support.reason, "preference_worker_failed");
});


test("new document-bound checkpoints survive a later timeout; historical and drifted packets do not", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  packet.status = "limited"; packet.limitations = ["preference_budget_exhausted"];
  packet.controlInventoryComplete = false;
  packet.action = { count: 1, intent: "options", label: "Manage options", opened: false };
  packet.checkpoints = { version: "cmp_partial_capture.v1", documentToken: "loader-1", privacyLinks: true, declarations: true, controls: true, controlsSurface: "first_layer" };
  const audit = deriveCmpAuditAssessment(input)!;
  for (const id of ["categories", "privacy_access", "cookie_information"]) assert.equal(audit.rows.find(row => row.id === id)?.status, "observed");
  assert.equal(audit.rows.find(row => row.id === "services")?.status, "not_assessed");
  packet.checkpoints.documentToken = "wrong-loader";
  assert.equal(deriveCmpAuditAssessment(input), undefined);
  packet.checkpoints.documentToken = "loader-1";
  packet.limitations.push("preference_document_changed");
  assert.ok(deriveCmpAuditAssessment(input)!.rows.every(row => row.status === "not_assessed"));
});

test("complete configured declarations compare bounded globs to observed cookies without requiring an Accept click", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  packet.checkpoints = { version: "cmp_partial_capture.v1", documentToken: "loader-1", privacyLinks: true, declarations: true, controls: true, controlsSurface: "preferences" };
  packet.declarationCoverage = { scope: "configured_services", configured: 1, resolved: 1, unresolved: 0, truncated: false };
  packet.declarationInventoryComplete = true;
  packet.declarations[0]!.name = "_ga_*";
  input.cookieEvents = [{ cookieName: "_ga_123" }] as any;
  let audit = deriveCmpAuditAssessment(input)!;
  assert.equal(audit.rows.find(row => row.id === "found_not_declared")?.status, "not_observed");
  assert.equal(audit.rows.find(row => row.id === "declared_not_found")?.status, "not_assessed");
  input.cookieEvents.push({ cookieName: "other" } as any);
  assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "found_not_declared")?.status, "review");
  packet.declarationInventoryComplete = false; packet.declarationCoverage.unresolved = 1;
  assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "found_not_declared")?.status, "partially_assessed");
  packet.declarationInventoryComplete = true;
  assert.equal(cmpPreferencesEvidenceSchema.safeParse(packet).success, false);
});

test("v2 narrow facts stay informational, source-bound and neutral when proof is missing", () => {
  const b = bundle();
  b.runtimeCoverage = { coverageStatus: "usable" } as any;
  b.cookieSnapshots = [{ consentStateAtTime: "pre_consent", cookies: [{ name: "_ga" }] }] as any;
  b.postRefusalEvidence = { parentScanId: b.scanId, normalizedUrl: b.url, productionProjectable: true,
    refusalRegistration: { status: "confirmed" }, decisionEvidence: { basis: "verified_state", decision: "denied", observedAtMs: 1000, observedStateSha256: "a".repeat(64) },
    storage: { postAction: [{ storageType: "cookie", name: "borlabs-cookie", identityHash: "a".repeat(64), valueHash: "b".repeat(64), expiresAtEpochSeconds: 5184100, capturedAtEpochSeconds: 100 }] } } as any;
  const audit = deriveCmpAuditAssessment(b)!;
  assert.equal(audit.version, "cmp_audit_assessment.v5");
  for (const id of ["consent_record", "duration", "declared_not_found"]) assert.equal(audit.rows.find(row => row.id === id)?.status, "observed");
  assert.equal(audit.rows.find(row => row.id === "duration")!.inventory!.expiries![0]!.remainingSeconds, 5184000);
  assert.match(audit.rows.find(row => row.id === "declared_not_found")!.detail, /1 of 1/);
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: { consentControlAssessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
  const projection = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: assessment, normalizedConcerns: concerns });
  assert.equal(projection.rows.find(row => row.id === "duration")!.label, "CMP cookie expiry");
  assert.ok(concerns.filter(c => c.originKey.startsWith("consent.cmp_audit.")).every(c => !c.scoreEffects?.length));
  const legacy = { ...assessment, cmpAudit: { ...audit, version: "cmp_audit_assessment.v1" as const, rows: audit.rows.filter(row => row.id !== "implementation" && row.id !== "prominence") } };
  assert.equal(projectCmpAudit({ scanId: "scan-1", consentControlAssessment: legacy }).rows.find(row => row.id === "duration")!.label, "Duration of consent or rejection is appropriate");
  b.postRefusalEvidence!.decisionEvidence!.decision = "unknown";
  assert.equal(deriveCmpAuditAssessment(b)!.rows.find(row => row.id === "consent_record")!.status, "not_assessed");
  b.postRefusalEvidence!.parentScanId = "foreign";
  b.runtimeCoverage!.coverageStatus = "limited" as any;
  const limited = deriveCmpAuditAssessment(b)!;
  for (const id of ["consent_record", "duration", "declared_not_found"]) assert.equal(limited.rows.find(row => row.id === id)!.status, "not_assessed");
});

test("v4 privacy reachability is independent of document retrieval through canonical concern projection", () => {
  for (const mode of ["different_url", "timeout", "failed", "not_retrieved", "not_reachable"] as const) {
    const input = bundle();
    if (mode === "different_url") input.policySurfaceObservations![0]!.url = "https://example.com/de/privacy";
    if (mode === "timeout" || mode === "failed") Object.assign(input.policySurfaceObservations![0]!, { documentFetchState: "failed", documentEvaluationState: "not_attempted", fetchFailureReason: mode === "timeout" ? "timeout" : "network_error" });
    if (mode === "not_retrieved") input.policySurfaceObservations = [];
    if (mode === "not_reachable") input.cmpPreferencesEvidence!.privacyLinks[0]!.hitTargetBeforeAction = false;
    const audit = deriveCmpAuditAssessment(input)!;
    const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
    const concerns = buildNormalizedConcerns({ runtimeArtifacts: { consentControlAssessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
    const row = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns }).rows.find(row => row.id === "privacy_access")!;
    assert.equal(row.status, mode === "not_reachable" ? "Not assessed" : "Observed");
    assert.match(row.detail!, mode === "not_reachable" ? /No privacy-policy link was verified/ : /unobstructed click target/);
    assert.ok(!row.deductionPoints);
  }
});

test("preference readiness timeout explains unassessed reachability even when the policy was retrieved", () => {
  const input = bundle();
  Object.assign(input.cmpPreferencesEvidence!, { status: "limited", limitations: ["preference_budget_exhausted"], controls: [], privacyLinks: [], controlInventoryComplete: false });
  const audit = deriveCmpAuditAssessment(input)!;
  assert.match(audit.rows.find(row => row.id === "privacy_access")!.detail, /timed out before pre-choice privacy-link reachability/);
  assert.match(audit.rows.find(row => row.id === "services")!.detail, /timed out before individual-service/);
});

test("v3 identifies configured services through retained source accounting, persistence and concern policy", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  packet.controlInventoryComplete = false;
  packet.checkpoints = { version: "cmp_partial_capture.v1", documentToken: "loader-1", privacyLinks: true, declarations: true, controls: true, controlsSurface: "preferences" };
  packet.serviceNames = Array.from({ length: 11 }, (_, index) => `Named service ${index + 1}`);
  packet.declarationCoverage = { scope: "configured_services", configured: 11, resolved: 11, unresolved: 0, truncated: false };
  const audit = deriveCmpAuditAssessment(input)!;
  const row = audit.rows.find(row => row.id === "services")!;
  assert.equal(audit.version, "cmp_audit_assessment.v5");
  assert.equal(row.status, "observed");
  assert.match(row.detail, /11 services identified/);
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const persisted = withCanonicalConsentAssessmentSnapshot({}, assessment);
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: persisted, reviewFindingCandidates: [], validationFindings: [] });
  const projected = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns }).rows.find(row => row.id === "services")!;
  assert.equal(projected.label, "Individual services identified in the CMP");
  assert.equal(projected.status, "Observed");
  assert.equal(projected.detail, row.detail);
  assert.ok(concerns.filter(c => c.originKey.startsWith("consent.cmp_audit.")).every(c => !c.scoreEffects?.length));
  assert.equal(projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment }).rows.find(row => row.id === "services")!.status, "Not assessed");
  const legacy = { ...assessment, cmpAudit: { ...audit, version: "cmp_audit_assessment.v2" as const, rows: audit.rows.filter(row => row.id !== "implementation" && row.id !== "prominence") } };
  assert.equal(projectCmpAudit({ scanId: input.scanId, consentControlAssessment: legacy }).rows.find(row => row.id === "services")!.label, "Individual service checkboxes or toggles observed");
  assert.equal(legacy.cmpAudit.version, "cmp_audit_assessment.v2");
});

test("service identification cannot be inferred from cookie declarations, categories or incomplete accounting", () => {
  for (const mode of ["no_accounting", "unresolved", "truncated", "mismatched_counts", "empty", "no_checkpoint", "failed", "unbound"] as const) {
    const input = bundle(), packet = input.cmpPreferencesEvidence!;
    packet.checkpoints = { version: "cmp_partial_capture.v1", documentToken: "loader-1", privacyLinks: true, declarations: true, controls: true, controlsSurface: "preferences" };
    packet.declarationCoverage = { scope: "configured_services", configured: 11, resolved: 11, unresolved: 0, truncated: false };
    const coverage = packet.declarationCoverage;
    if (mode === "no_accounting") delete packet.declarationCoverage;
    if (mode === "unresolved") coverage.unresolved = 1;
    if (mode === "truncated") coverage.truncated = true;
    if (mode === "mismatched_counts") coverage.resolved = 10;
    if (mode === "empty") coverage.configured = coverage.resolved = 0;
    if (mode === "no_checkpoint") packet.checkpoints.declarations = false;
    if (mode === "failed") packet.status = "failed";
    if (mode === "unbound") packet.limitations.push("preference_document_changed");
    const row = deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "services")!;
    assert.equal(row.status, "not_assessed", mode);
  }
});

test("retained service identities survive unrelated timeout; labelled service controls also identify services", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  packet.status = "limited";
  packet.limitations = ["preference_budget_exhausted"];
  packet.checkpoints = { version: "cmp_partial_capture.v1", documentToken: "loader-1", privacyLinks: false, declarations: true, controls: false, controlsSurface: "preferences" };
  packet.declarationCoverage = { scope: "configured_services", configured: 1, resolved: 1, unresolved: 0, truncated: false };
  packet.serviceNames = ["Named service"];
  assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "services")!.status, "observed");
  delete packet.declarationCoverage;
  packet.status = "completed";
  packet.controls = [{ label: "Example Analytics", kind: "service", enabled: false, checked: true }];
  const row = deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "services")!;
  assert.equal(row.status, "observed");
  assert.match(row.detail, /1 individual service was identified/);
  assert.match(row.detail, /functionality was not tested/);
});

function choicePacket(action: "accept" | "reject") {
  const shared = { artifactOnly: true, productionProjectable: true, scanId: `scan-${action}`, parentScanId: "scan-1",
    targetUrl: "https://example.com/", normalizedUrl: "https://example.com/", phase: "post_action", consentAction: action,
    startedAt: "2026-10-13T00:00:00.000Z", completedAt: "2026-10-13T00:00:02.000Z",
    resolver: { found: true, method: "cmp_registry_recipe", confidence: 1, recipeId: `fixture-${action}`, cmpId: "fixture" },
    actionControlProof: { contractVersion: "certscore.consent_action_control_proof.v1", action, observedAtMs: 95,
      accessibleLabel: action === "accept" ? "Accept all" : "Reject all", labelSource: "visible_text", actionSemantics: "direct_label",
      classifierIntent: action, classifierConfidence: 1, matchedLocale: "en", matchStrength: "direct", classifierReasonCodes: [],
      cmpId: "fixture", recipeId: `fixture-${action}`, selectorHint: `#${action}`, visible: true, enabled: true, uniquelyActionable: true },
    observationWindowMs: 500, timing: { dispatchDelayMs: 0, navigationMs: 40, resolverMs: 10, confirmationMs: 20,
      observationMs: 500, observationExitReason: "window_elapsed", observationEndedAtMs: 620, totalMs: 650, readyAtMs: 650 },
    observations: [], cancellation: { requested: false, outcome: "not_requested" }, limitations: [] };
  const registration = { status: "confirmed", actionDispatchedAtMs: 100, witnesses: [{ witnessType: "cmp_storage_state", observedAtMs: 120,
    key: "fixture", expectedState: action === "accept" ? "granted" : "denied", observedStateHash: "a".repeat(64), corroboratingOnly: false }] };
  return action === "accept" ? postAcceptEvidencePacketSchema.parse({ ...shared, artifactVersion: "certscore.post_accept_evidence.v1", observationBranch: "accept_only",
    acceptanceRegistration: { ...registration, acceptanceExercised: true, acceptanceRegisteredAtMs: 120 },
    network: { requests: [], postAcceptNonEssentialRequests: [], activeRequestIdsAtAcceptanceRegistration: [] },
    storage: { preAction: [], postAction: [], writesAfterAccept: [], itemsCreatedOrChangedAfterAccept: [] } })
    : postRefusalEvidencePacketSchema.parse({ ...shared, artifactVersion: "certscore.post_refusal_evidence.v1", observationBranch: "reject_only",
    refusalRegistration: { ...registration, refusalExercised: true, refusalRegisteredAtMs: 120 },
    network: { requests: [], postRefusalNonEssentialRequests: [], activeRequestIdsAtRefusalRegistration: [] },
    storage: { preActionCapturedAtMs: 90, postActionCapturedAtMs: 620, preAction: [], postAction: [], writesAfterRefusal: [], nonEssentialItemsPersistingAfterRefusal: [] } });
}

test("v4 partial action coverage persists through concern policy; review still takes precedence", () => {
  const input = bundle();
  input.postAcceptEvidence = postAcceptEvidencePacketSchema.parse(choicePacket("accept"));
  const project = (review = false) => {
    const audit = deriveCmpAuditAssessment(input)!;
    const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
    const artifacts = withCanonicalConsentAssessmentSnapshot({}, assessment);
    const concerns = buildNormalizedConcerns({ runtimeArtifacts: artifacts, reviewFindingCandidates: [], validationFindings: [] });
    assert.ok(concerns.filter(c => c.originKey.startsWith("consent.cmp_audit.")).every(c => !c.scoreEffects?.length));
    return projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns,
      checklistRows: review ? [{ id: "post_reject_tracking_reduction", evidenceState: "observed", status: "Review signal",
        assessmentStatus: "review_signal", note: "Eligible activity after Reject." } as any] : [] }).rows.find(row => row.id === "implementation")!;
  };
  assert.equal(project().label, "Activity after Accept / Reject");
  assert.equal(project().status, "Partially assessed");
  assert.match(project().detail!, /Accept: observation captured; consent confirmed.*other action was not assessed/);
  assert.equal(project(true).status, "Review recommended");
  input.postRefusalEvidence = postRefusalEvidencePacketSchema.parse(choicePacket("reject"));
  assert.equal(project().status, "Observed");
  assert.match(project().detail!, /does not establish correct enforcement/);
  assert.equal(project(true).status, "Review recommended");
  delete input.cmpPreferencesEvidence;
  input.cmpPreferenceLaneOutcome = { status: "limited", startedAt: "2026-10-13T00:00:00.000Z", completedAt: "2026-10-13T00:00:17.000Z", limitationCode: "preference_budget_exhausted" };
  assert.equal(project().status, "Observed", "independent action coverage does not require preference success");
});

test("missing completion, malformed, foreign and unconfirmed actions do not create partial coverage", () => {
  for (const mode of ["incomplete", "foreign", "wrong_url", "no_proof", "no_witness", "unprojectable"] as const) {
    const input = bundle();
    const packet = postAcceptEvidencePacketSchema.parse(choicePacket("accept"));
    if (mode === "incomplete") delete packet.timing.observationExitReason;
    if (mode === "foreign") packet.parentScanId = "foreign";
    if (mode === "wrong_url") packet.normalizedUrl = "https://other.example/";
    if (mode === "no_proof") delete packet.actionControlProof;
    if (mode === "no_witness") packet.acceptanceRegistration.witnesses = [];
    if (mode === "unprojectable") packet.productionProjectable = false;
    input.postAcceptEvidence = packet;
    assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "implementation")!.status, "not_assessed", mode);
  }
});

test("cookie omission review matches exact names and globs without claiming missing services or pre-consent use", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  packet.declarationInventoryComplete = true;
  packet.declarations = ["_ga_*", "_pk_id.*.*", "borlabs-cookie"].map(name => ({ name, purpose: "", duration: "", source: "cmp_api_inventory" }));
  const accept = choicePacket("accept") as NonNullable<CanonicalEvidenceBundle["postAcceptEvidence"]>;
  accept.storage.postAction = ["_ga_123", "_pk_id.1.abc", "borlabs-cookie", "borlabs-cookie-gcs", "hubspotutk"].map(name => ({ storageType: "cookie", name, nonEssential: false, identityHash: "a".repeat(64), valueHash: "b".repeat(64) }));
  input.postAcceptEvidence = accept;
  const audit = deriveCmpAuditAssessment(input)!;
  const row = audit.rows.find(row => row.id === "found_not_declared")!;
  assert.equal(row.status, "review");
  assert.match(row.detail, /2 observed cookie names did not match 3 retained CMP declaration patterns/);
  assert.deepEqual(row.cookieComparison?.unmatchedNames, ["borlabs-cookie-gcs", "hubspotutk"]);
  assert.equal(row.cookieComparison?.allUnmatchedOnlyAfterAccept, true);
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: { consentControlAssessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
  const report = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns });
  const displayed = report.rows.find(row => row.id === "found_not_declared")!;
  assert.equal(displayed.label, "Unmatched cookie names");
  assert.equal(displayed.status, "Review recommended");
  assert.equal(displayed.detail, row.detail);
  assert.deepEqual(displayed.supportingEvidence?.cookieComparison, row.cookieComparison);
  const altered = structuredClone(concerns);
  altered.find(c => c.originKey === "consent.cmp_audit.found_not_declared")!.evidenceBundle.rawEvidence!.cmpAuditRow = { ...row, cookieComparison: { ...row.cookieComparison!, unmatchedNames: ["invented", "hubspotutk"] } };
  assert.equal(projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: altered }).rows.find(r => r.id === "found_not_declared")?.supportingEvidence, undefined);
  assert.equal(consentControlAssessmentSchema.safeParse({ ...assessment, cmpAudit: { ...audit, rows: audit.rows.map(r => r.id === "found_not_declared" ? { ...r, cookieComparison: { ...r.cookieComparison!, unmatchedNameCount: 0 } } : r) } }).success, false);

  assert.ok(concerns.filter(c => c.originKey.startsWith("consent.cmp_audit.")).every(c => !c.scoreEffects?.length));
  accept.storage.postAction = Array.from({ length: 100 }, (_, i) => ({ storageType: "cookie", name: `cookie_${i}_${"x".repeat(130)}`, nonEssential: false, identityHash: "a".repeat(64), valueHash: "b".repeat(64) }));
  const bounded = deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "found_not_declared")!;
  assert.ok(bounded.detail.length <= 500);
  assert.equal(bounded.cookieComparison?.unmatchedNames.length, 3);
  assert.equal(bounded.cookieComparison?.unmatchedNameCount, 100);
});

test("inventory tables preserve canonical names, wildcard matches and capture scope through policy", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  packet.checkpoints = { version: "cmp_partial_capture.v1", documentToken: "loader-1", privacyLinks: true, declarations: true, controls: true, controlsSurface: "preferences" };
  packet.serviceNames = ["Google Analytics", "Consent preferences"];
  packet.declarationCoverage = { scope: "configured_services", configured: 2, resolved: 2, unresolved: 0, truncated: false };
  packet.declarations = [
    { name: "_ga_*", purpose: "Audience measurement", duration: "2 years", source: "cmp_api_inventory" },
    { name: "consent", purpose: "Preferences", duration: "60 days", source: "cmp_api_inventory" },
  ];
  packet.declarationInventoryComplete = true;
  input.cookieEvents = [{ cookieName: "_ga_123" }, { cookieName: "unexpected" }] as any;
  const before = structuredClone(input);
  const audit = deriveCmpAuditAssessment(input)!;
  assert.deepEqual(input, before, "retained source is never rewritten");
  assert.deepEqual(audit.rows.find(row => row.id === "services")!.inventory!.services!.map(row => row.name), packet.serviceNames);
  assert.deepEqual(audit.rows.find(row => row.id === "cookie_information")!.inventory!.declarations, packet.declarations);
  const comparison = audit.rows.find(row => row.id === "found_not_declared")!;
  assert.equal(comparison.status, "review");
  assert.deepEqual(comparison.inventory!.cookies, [
    { name: "_ga_123", matchedPattern: "_ga_*", observedIn: ["before_choice"] },
    { name: "unexpected", matchedPattern: null, observedIn: ["before_choice"] },
  ]);
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: { consentControlAssessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
  const projected = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns });
  assert.deepEqual(projected.rows.find(row => row.id === "found_not_declared")!.supportingEvidence!.inventory, comparison.inventory);
  assert.ok(concerns.filter(row => row.originKey.startsWith("consent.cmp_audit.")).every(row => !row.scoreEffects?.length));
  assert.equal(projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment }).rows.find(row => row.id === "services")!.supportingEvidence, undefined);
  const corrupted = structuredClone(concerns);
  const raw = corrupted.find(row => row.originKey === "consent.cmp_audit.services")!.evidenceBundle.rawEvidence as any;
  raw.cmpAuditRow.inventory.services[0].name = "Wrong retained name";
  assert.equal(projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: corrupted }).rows.find(row => row.id === "services")!.supportingEvidence, undefined);
  packet.status = "limited"; packet.checkpoints!.declarations = false; packet.checkpoints!.controls = false;
  const limited = deriveCmpAuditAssessment(input);
  assert.ok(!limited || limited.rows.every(row => !row.inventory), "unverified sub-observations cannot populate tables");
});

test("category table retains selectable controls and captured settings through canonical policy", () => {
  const input = bundle();
  input.cmpPreferencesEvidence!.controls = [
    { label: "Essential", kind: "category", enabled: false, checked: true },
    { label: "Statistics", kind: "category", enabled: true, checked: false },
    { label: "Marketing", kind: "category", enabled: true, checked: true },
    { label: "External media", kind: "category", enabled: true, checked: null },
  ];
  const before = structuredClone(input);
  const audit = deriveCmpAuditAssessment(input)!;
  const expected = [{ name: "Statistics", checked: false }, { name: "Marketing", checked: true }, { name: "External media", checked: null }];
  assert.deepEqual(audit.rows.find(row => row.id === "categories")!.inventory!.categories, expected);
  assert.deepEqual(input, before);
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: { consentControlAssessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
  const row = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns }).rows.find(row => row.id === "categories")!;
  assert.equal(row.status, "Observed");
  assert.equal(row.detail, "3 categories were available.");
  assert.deepEqual(row.supportingEvidence!.inventory!.categories, expected);
  assert.equal(projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment }).rows.find(row => row.id === "categories")!.supportingEvidence, undefined);
  const corrupted = structuredClone(concerns);
  (corrupted.find(row => row.originKey === "consent.cmp_audit.categories")!.evidenceBundle.rawEvidence!.cmpAuditRow as any).inventory.categories[0].checked = true;
  assert.equal(projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: corrupted }).rows.find(row => row.id === "categories")!.supportingEvidence, undefined);
  delete assessment.cmpAudit!.rows.find(row => row.id === "categories")!.inventory;
  const legacyConcerns = buildNormalizedConcerns({ runtimeArtifacts: { consentControlAssessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
  const historical = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: legacyConcerns }).rows.find(row => row.id === "categories")!;
  assert.match(historical.detail!, /Statistics; Marketing; External media/);
  assert.equal(historical.supportingEvidence, undefined);
  assert.ok(concerns.filter(row => row.originKey.startsWith("consent.cmp_audit.")).every(row => !row.scoreEffects?.length));
});

test("expiry tables preserve timestamp precision through policy without claiming original storage life", () => {
  const input = bundle();
  input.postRefusalEvidence = { parentScanId: input.scanId, normalizedUrl: input.url, productionProjectable: true,
    refusalRegistration: { status: "confirmed" }, decisionEvidence: { basis: "verified_state", decision: "denied", observedAtMs: 1000, observedStateSha256: "a".repeat(64) },
    storage: { postAction: [{ storageType: "cookie", name: "borlabs-cookie", identityHash: "a".repeat(64), valueHash: "b".repeat(64), expiresAtEpochSeconds: 1797130216, capturedAtEpochSeconds: 1791946219.865 }] } } as any;
  const before = structuredClone(input);
  const audit = deriveCmpAuditAssessment(input)!;
  const expected = { visit: "Reject", name: "borlabs-cookie", capturedAtEpochSeconds: 1791946219.865, expiresAtEpochSeconds: 1797130216, remainingSeconds: 1797130216 - 1791946219.865 };
  const duration = audit.rows.find(row => row.id === "duration")!;
  assert.equal(duration.status, "observed"); assert.match(duration.detail, /CMP cookie expiry was captured/);
  assert.deepEqual(duration.inventory!.expiries, [expected]); assert.deepEqual(input, before);
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: { consentControlAssessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
  const row = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns }).rows.find(row => row.id === "duration")!;
  assert.equal(row.status, "Observed");
  assert.equal(row.detail, "CMP cookie expiry was captured. Time remaining is shown below.");
  assert.deepEqual(row.supportingEvidence!.inventory!.expiries, [expected]);
  const corrupted = structuredClone(concerns);
  const expiry = (corrupted.find(row => row.originKey === "consent.cmp_audit.duration")!.evidenceBundle.rawEvidence!.cmpAuditRow as any).inventory.expiries[0];
  expiry.expiresAtEpochSeconds += 1; expiry.remainingSeconds += 1;
  assert.equal(projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: corrupted }).rows.find(row => row.id === "duration")!.supportingEvidence, undefined);
  assert.ok(concerns.filter(row => row.originKey.startsWith("consent.cmp_audit.")).every(row => !row.scoreEffects?.length));
  delete input.cmpPreferencesEvidence;
  input.cmpPreferenceLaneOutcome = { status: "limited", limitationCode: "preference_budget_exhausted", startedAt: "2026-10-13T00:00:00.000Z", completedAt: "2026-10-13T00:00:17.000Z" };
  assert.deepEqual(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "duration")!.inventory!.expiries, [expected], "independent expiry survives preference failure");
  for (const mutate of [
    () => { input.postRefusalEvidence!.parentScanId = "foreign"; },
    () => { input.postRefusalEvidence!.productionProjectable = false; },
    () => { Reflect.deleteProperty(input.postRefusalEvidence!.storage.postAction[0]!, "valueHash"); },
    () => { delete input.postRefusalEvidence!.storage.postAction[0]!.capturedAtEpochSeconds; },
    () => { input.postRefusalEvidence!.storage.postAction[0]!.expiresAtEpochSeconds = -1; },
    () => { input.postRefusalEvidence!.storage.postAction[0]!.expiresAtEpochSeconds = 10; },
  ]) {
    input.postRefusalEvidence = structuredClone(before.postRefusalEvidence); mutate();
    assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "duration")!.inventory, undefined);
  }
});


test("expiry evidence rejects inconsistent arithmetic and nonpersistent timestamps", () => {
  const valid = { visit: "Accept", name: "borlabs-cookie", capturedAtEpochSeconds: 100, expiresAtEpochSeconds: 5184100, remainingSeconds: 5184000 };
  assert.equal(cmpCookieExpiryEvidenceSchema.safeParse(valid).success, true);
  for (const change of [{ remainingSeconds: 60 }, { expiresAtEpochSeconds: -1 }, { capturedAtEpochSeconds: NaN }, { expiresAtEpochSeconds: 10 }, { cookieValue: "private" }]) {
    assert.equal(cmpCookieExpiryEvidenceSchema.safeParse({ ...valid, ...change }).success, false);
  }
});

test("preference binding diagnostics do not promote a limited IKEA-style pre-click packet", () => {
  const input=bundle(),packet=input.cmpPreferencesEvidence!;
  Object.assign(packet,{status:"limited",support:{state:"partial",provider:"OneTrust",recipeVersion:"onetrust_preferences.v2",reason:"preference_surface_missing"},
    action:{count:0,intent:"options",label:null,opened:false},controls:[],privacyLinks:[],declarations:[],controlInventoryComplete:false,declarationInventoryComplete:false,
    limitations:["preference_surface_missing"],inspectionDiagnostic:{revision:"cmp_preferences.v2",budgetMs:17000,phase:"surface_binding",
      surfaceBinding:{version:"cmp_surface_binding.v1",mode:"registered_existing",priorMatches:0,priorVisible:false,outcome:"missing"}}});
  const before=structuredClone(input);
  const audit=deriveCmpAuditAssessment(input)!;
  assert.ok(audit.rows.every(row=>["not_assessed", "incomplete"].includes(row.status)));
  assert.equal(audit.support.reason,"preference_surface_missing");
  assert.deepEqual(input,before);
  packet.inspectionDiagnostic!.surfaceBinding!.outcome="opened";
  assert.ok(deriveCmpAuditAssessment(input)!.rows.every(row=>["not_assessed", "incomplete"].includes(row.status)),"Diagnostics cannot substitute for retained controls or opening proof");
});

test("operation timeout keeps its specific cause and does not create missing-feature findings", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  Object.assign(packet, { status: "limited", controls: [], declarations: [], privacyLinks: [], controlInventoryComplete: false,
    action: { count: 0, intent: "options", label: null, opened: false }, limitations: ["preference_operation_timed_out"],
    support: { state: "partial", provider: "OneTrust", recipeVersion: "onetrust_preferences.v2", reason: "preference_operation_timed_out" } });
  const original = structuredClone(packet);
  const audit = deriveCmpAuditAssessment(input)!;
  assert.equal(audit.support.reason, "preference_operation_timed_out");
  for (const id of ["categories", "services", "privacy_access", "cookie_information"]) {
    const row = audit.rows.find(row => row.id === id)!;
    assert.equal(row.status, "incomplete");
    assert.equal(row.limitation?.code, "preference_operation_timed_out");
  }
  assert.deepEqual(packet, original);
  assert.ok(audit.rows.every(row => !["feature_not_supported", "not_observed", "review"].includes(row.status)));
});

test("v5 baseline CMP expiry survives preference/action failure with exact identity, timing and source hash", () => {
  const input = bundle();
  input.cookieSnapshots = [{ artifactId: "cookies-before", capturedAtMs: 1500, consentStateAtTime: "pre_consent", evidenceRefs: [],
    cookieNames: ["OptanonConsent"], cookies: [{ name: "OptanonConsent", domain: ".example.com", path: "/", expires: Date.parse(input.startedAt) / 1000 + 86400 }] }];
  delete input.cmpPreferencesEvidence;
  input.cmpPreferenceLaneOutcome = { status: "limited", startedAt: input.startedAt, completedAt: "2026-10-13T00:00:17.000Z", limitationCode: "preference_budget_exhausted" };
  const before = structuredClone(input), audit = deriveCmpAuditAssessment(input)!;
  const row = audit.rows.find(row => row.id === "duration")!;
  assert.equal(row.status, "observed");
  assert.deepEqual(row.inventory!.expiries![0], { visit: "Before choice", name: "OptanonConsent", domain: ".example.com", path: "/",
    capturedAtEpochSeconds: Date.parse(input.startedAt) / 1000 + 1.5, expiresAtEpochSeconds: Date.parse(input.startedAt) / 1000 + 86400, remainingSeconds: 86398.5 });
  assert.equal(audit.rows.find(row => row.id === "consent_record")!.status, "not_assessed", "Cookie presence cannot confirm a choice");
  assert.deepEqual(input, before);
  input.startedAt = "2026-10-13T00:00:01.000Z";
  assert.notEqual(deriveCmpAuditAssessment(input)!.sourceSha256, audit.sourceSha256, "Capture arithmetic participates in provenance");
  for (const change of [{ domain: ".foreign.test" }, { name: "_ga" }, { expires: -1 }, { expires: NaN }, { path: "bad" }, { expires: 10 }]) {
    Object.assign(input, structuredClone(before)); Object.assign(input.cookieSnapshots![0]!.cookies[0]!, change);
    assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "duration")!.inventory, undefined);
  }
  Object.assign(input, structuredClone(before)); input.runtimeCoverage!.coverageStatus = "limited_partial";
  assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "duration")!.inventory, undefined);
});

test("v5 partial inventories retain named services, incomplete details and neutral matches through policy", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  packet.checkpoints = { version: "cmp_partial_capture.v1", documentToken: packet.documentToken!, declarations: true, controls: true, controlsSurface: "preferences", privacyLinks: true };
  packet.declarationCoverage = { scope: "configured_services", configured: 3, resolved: 2, unresolved: 1, truncated: false };
  packet.serviceNames = ["Named Analytics", "Named Media"];
  packet.declarations = [{ name: "_ga_*", purpose: "Analytics", duration: "1 year", source: "cmp_api_inventory" }, { name: "media_id", purpose: "", duration: "", source: "cmp_api_inventory" }];
  input.cookieEvents = [{ cookieName: "_ga_123" }, { cookieName: "unknown_name" }] as any;
  const before = structuredClone(input), audit = deriveCmpAuditAssessment(input)!;
  assert.equal(audit.rows.find(row => row.id === "services")!.status, "observed");
  assert.match(audit.rows.find(row => row.id === "services")!.detail, /2 services identified.*Additional services/);
  assert.equal(audit.rows.find(row => row.id === "cookie_information")!.status, "partially_assessed");
  assert.deepEqual(audit.rows.find(row => row.id === "cookie_information")!.inventory!.declarations, packet.declarations);
  const comparison = audit.rows.find(row => row.id === "found_not_declared")!;
  assert.equal(comparison.status, "partially_assessed");
  assert.equal(comparison.cookieComparison!.declarationInventoryComplete, false);
  assert.equal(comparison.inventory!.cookies![0]!.matchedPattern, "_ga_*");
  assert.equal(comparison.inventory!.cookies![1]!.matchedPattern, null);
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: withCanonicalConsentAssessmentSnapshot({}, assessment), reviewFindingCandidates: [], validationFindings: [] });
  const projected = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns });
  assert.equal(projected.version, "cmp_audit_report.v2");
  assert.equal(projected.rows.find(row => row.id === "found_not_declared")!.status, "Partially assessed");
  assert.deepEqual(projected.rows.find(row => row.id === "found_not_declared")!.supportingEvidence!.inventory, comparison.inventory);
  assert.ok(concerns.filter(c => c.originKey.startsWith("consent.cmp_audit.")).every(c => !c.scoreEffects?.length));
  assert.deepEqual(input, before);
  packet.checkpoints.declarations = false; packet.status = "limited";
  assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "services")!.inventory, undefined);
  packet.checkpoints.declarations = true; packet.declarationInventoryComplete = true; packet.declarationCoverage.unresolved = 0; packet.declarationCoverage.configured = 2;
  assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "found_not_declared")!.status, "review", "A verified complete inventory keeps genuine Review results");
});

function completedUnconfirmedPacket(action: "accept" | "reject") {
  const packet: any = structuredClone(choicePacket(action));
  const registration = action === "accept" ? "acceptanceRegistration" : "refusalRegistration";
  packet[registration] = { status: "unconfirmed", reason: "decision_not_verified", actionDispatchedAtMs: 100, witnesses: [],
    ...(action === "accept" ? { acceptanceExercised: false } : { refusalExercised: false }) };
  packet.productionProjectable = false; packet.decisionEvidence = { policyVersion: "semantic_consent_registration.v2", decision: "unknown", basis: "unverified" };
  packet.captureCoverage = { requestsDroppedBeforeAction: 0, requestsDroppedAfterAction: 0 };
  packet.interactionDiagnostics = { resolver: { snapshots: [], truncated: false },
    navigation: { outcome: "completed", documentCommitted: true, finalUrlAuthorized: true },
    click: { outcome: "completed", reResolvedBeforeDispatch: false, confirmationCheckedAfterError: false } };
  packet.storage.postActionCapturedAtMs = 600;
  packet.afterActionCapture = { policyVersion: "bounded_after_action_capture.v2", action, activationStatus: "completed", actionDispatchedAtMs: 100,
    captureEndedAtMs: 600, requestedWindowMs: 500, stopReason: "window_elapsed", requestsDropped: 0, storageSnapshotRetained: true,
    storageWriteCoverage: "bounded_main_document_sample", storageWrites: [], requestIds: [], requestAncestry: [] };
  return action === "accept" ? postAcceptEvidencePacketSchema.parse(packet) : postRefusalEvidencePacketSchema.parse(packet);
}

test("v5 completed after-click capture is assessable without claiming registered consent", () => {
  const input = bundle(); input.postAcceptEvidence = completedUnconfirmedPacket("accept") as any;
  const direct = projectPostAcceptEvidenceForReport({ packet: input.postAcceptEvidence! });
  assert.equal(direct.afterActionCapture?.activationStatus, "completed");
  assert.equal(direct.interactionDiagnostics?.click.outcome, "completed");
  let audit = deriveCmpAuditAssessment(input)!;
  assert.equal(audit.rows.find(row => row.id === "implementation")!.status, "partially_assessed");
  assert.match(audit.rows.find(row => row.id === "implementation")!.detail, /Accept: observation captured; consent not confirmed/);
  assert.equal(audit.rows.find(row => row.id === "consent_record")!.status, "not_assessed");
  input.postRefusalEvidence = completedUnconfirmedPacket("reject") as any;
  audit = deriveCmpAuditAssessment(input)!;
  assert.equal(audit.rows.find(row => row.id === "implementation")!.status, "observed");
  assert.equal(audit.rows.find(row => row.id === "consent_record")!.status, "not_assessed");
  assert.equal(input.postRefusalEvidence!.productionProjectable, false);
  for (const change of [{ storageSnapshotRetained: false }, { stopReason: "aborted" }, { requestsDropped: 1 }, { activationStatus: "uncertain", stopReason: "click_uncertain" }]) {
    const altered = structuredClone(input); delete altered.postAcceptEvidence;
    Object.assign(altered.postRefusalEvidence!.afterActionCapture!, change);
    assert.equal(deriveCmpAuditAssessment(altered)!.rows.find(row => row.id === "implementation")!.status, "not_assessed");
  }
  const foreign = structuredClone(input); delete foreign.postAcceptEvidence; foreign.postRefusalEvidence!.normalizedUrl = "https://foreign.test/";
  assert.equal(deriveCmpAuditAssessment(foreign)!.rows.find(row => row.id === "implementation")!.status, "not_assessed");
});

test("v5 paired-image limitations require verified source and loader binding, independently of other available images", async () => {
  const { consentVisualFixture } = await import("../../../../packages/certscore-scan-core/src/test-fixtures/consent-visual-comparison");
  const { geometry } = await consentVisualFixture();
  const input = bundle();
  geometry.pageUrl = input.url; geometry.candidates.forEach(candidate => { candidate.frameContext.frameUrl = input.url; });
  input.startedAt = new Date(Date.parse(geometry.capturedAt) - 1000).toISOString();
  input.consentUiObservations = [{ documentUrl: input.url, documentIdentity: geometry.documentIdentity }] as CanonicalEvidenceBundle["consentUiObservations"];
  input.screenshots = [
    { artifactId: "selected", capturedAtMs: 1000, path: geometry.screenshotArtifactRef!, url: input.url, documentIdentity: geometry.documentIdentity, consentStateAtTime: "pre_consent", retentionStatus: "withheld", displayStatus: "withheld", safetyFailureCode: "finalization_deadline_exceeded" },
    { artifactId: "other", path: "other.png", url: input.url, documentIdentity: geometry.documentIdentity, consentStateAtTime: "pre_consent", retentionStatus: "available", displayStatus: "available" },
  ] as CanonicalEvidenceBundle["screenshots"];
  const original = structuredClone({ input, geometry });
  const row = deriveCmpAuditAssessment(input, geometry as unknown as Record<string, unknown>)!.rows.find(row => row.id === "prominence")!;
  assert.equal(row.status, "incomplete");
  assert.deepEqual(row.limitation, { group: "visual", code: "finalization_deadline_exceeded" });
  assert.deepEqual({ input, geometry }, original);
  for (const mutate of [
    (g: typeof geometry) => { g.documentIdentity!.token = "other-loader"; },
    (g: typeof geometry) => { g.sourceScanner = "foreign" as typeof g.sourceScanner; },
    (g: typeof geometry) => { g.controlInspection!.retainedCandidateCount++; },
    (g: typeof geometry) => { g.candidates[1]!.screenshotArtifactRef = "other.png"; },
    (g: typeof geometry) => { g.candidates[0]!.frameContext.frameUrl = "https://foreign.test/"; },
  ]) {
    const changed = structuredClone(geometry); mutate(changed);
    assert.equal(deriveCmpAuditAssessment(input, changed as unknown as Record<string, unknown>)!.rows.find(row => row.id === "prominence")!.status, "not_assessed");
  }
  input.screenshots[0]!.retentionStatus = "available"; input.screenshots[0]!.displayStatus = "available";
  assert.equal(deriveCmpAuditAssessment(input, geometry as unknown as Record<string, unknown>)!.rows.find(row => row.id === "prominence")!.limitation!.code, "visual_measurement_unavailable");
});

test("scanner adapter absence stays separate from failed inspection and CMP feature absence", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  Object.assign(packet, { status: "unsupported", support: { state: "unsupported", provider: "Unknown CMP", recipeVersion: null, reason: "adapter_not_available" }, controls: [], declarations: [], privacyLinks: [], controlInventoryComplete: false });
  const rows = deriveCmpAuditAssessment(input)!.rows;
  assert.ok(rows.every(row => row.status === "not_assessed"));
  assert.ok(rows.every(row => !row.limitation));
});

test("v3 basic checkpoints retain verified page facts when CMP readiness cannot complete", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  Object.assign(packet, { status: "limited", action: { count: 0, intent: "options", label: null, opened: false },
    support: { state: "partial", provider: "OneTrust", recipeVersion: "bounded_cmp_preferences.v1", reason: "preference_readiness_incomplete" },
    controlInventoryComplete: false, declarationInventoryComplete: false,
    declarations: [{ name: "_ga", purpose: "", duration: "1 day", source: "cmp_api_inventory" }],
    checkpoints: { version: "cmp_partial_capture.v1", documentToken: packet.documentToken, privacyLinks: true, declarations: true, controls: true, controlsSurface: "first_layer" },
    inspectionDiagnostic: { revision: "cmp_preferences.v3", budgetMs: 3600, basicCaptureReserveMs: 1000, phase: "control_inventory",
      configuration: { version: "onetrust_loaded_configuration.v1", status: "available", groupCount: 1, retainedCookieCount: 1, truncated: false } },
    limitations: ["preference_readiness_incomplete"],
  });
  const audit = deriveCmpAuditAssessment(input)!;
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: withCanonicalConsentAssessmentSnapshot({}, assessment), reviewFindingCandidates: [], validationFindings: [] });
  const projected = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns });
  assert.equal(projected.rows.find(row => row.id === "categories")!.status, "Observed");
  assert.equal(projected.rows.find(row => row.id === "categories")!.detail, "1 category was available.");
  assert.equal(projected.rows.find(row => row.id === "privacy_access")!.status, "Observed");
  assert.equal(projected.rows.find(row => row.id === "cookie_information")!.status, "Partially assessed");
  assert.equal(projected.rows.find(row => row.id === "services")!.status, "Not assessed");
  assert.ok(concerns.filter(c => c.originKey.startsWith("consent.cmp_audit.")).every(c => !c.scoreEffects?.length));
});
