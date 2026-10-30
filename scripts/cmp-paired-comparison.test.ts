import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assessConsentActionStages, postAcceptEvidencePacketSchema, projectPostAcceptEvidenceForReport } from "../packages/certscore-contracts/src/index";
import { buildPairedComparison, reconcileArmStages, summarizePairedComparison, validatePairedPlan, validatePairedSummary,
  type PairedPlan, type AnalyzedRow, type FileRef } from "./cmp-paired-comparison";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const weights = [{ provider: "OneTrust", completedClicks: 449 }, { provider: "Cookiebot", completedClicks: 129 }, { provider: "Other retained strata", completedClicks: 998 }];
function fixture() {
  const ref = { path: "fixture.json", sha256: "a".repeat(64), bytes: 1 };
  const targets: PairedPlan["targets"] = [
    { targetId: "one", url: "https://one.example/", providerStratum: "OneTrust", phase: "diagnostic", eligible: true, eligibilityReason: "fixture", armOrder: ["reference", "candidate"] },
    { targetId: "two", url: "https://two.example/", providerStratum: "Cookiebot", phase: "holdout", eligible: true, eligibilityReason: "fixture", armOrder: ["candidate", "reference"] },
  ];
  const plan: PairedPlan = {
    schemaVersion: "cmp_paired_runtime_plan.v1", runId: "fixture", maxContacts: 4, concurrency: 1,
    historicalBaseline: ref, eligibility: { ...ref, checkedAt: "2026-10-28T23:00:00Z", expiresAt: "2026-10-29T23:00:00Z" }, targets,
    arms: { reference: { root: "/reference", sourceFingerprint: "a".repeat(64), buildFingerprint: "b".repeat(64) },
      candidate: { root: "/candidate", sourceFingerprint: "c".repeat(64), buildFingerprint: "d".repeat(64) } },
    slots: targets.flatMap(target => (["reference", "candidate"] as const).map(arm => ({ slotId: `${target.targetId}-${arm}`, pairId: target.targetId,
      targetId: target.targetId, url: target.url, providerStratum: target.providerStratum, phase: target.phase, action: "accept", arm }))),
    runtime: { nodeVersion: "22.22.1", playwrightVersion: "1.55.1", browserExecutablePath: "/fixture/chromium", browserExecutableSha256: "e".repeat(64), lockfileSha256: "f".repeat(64) },
    budgets: { searchMs: 14000, confirmationMs: 2000, resultMs: 20000, acceptObservationMs: 3000, rejectObservationMs: 8000 }, holdoutUsedForRepair: false,
  };
  const rows: AnalyzedRow[] = plan.slots.map(slot => {
    const stages = assessConsentActionStages({} as any);
    stages.provider = slot.providerStratum; stages.outcome = "completed_unconfirmed";
    stages.measures = { providerAttributed: true, controlResolved: true, clickCompleted: true, observationCompleted: true, categoryScopeVerified: null, decisionVerified: false };
    stages.evidenceStages = { ...stages.evidenceStages, initialChoiceRegistrationSupported: false, registrationStatus: "unconfirmed", cmpIdentity: "verified", actionAttempted: true };
    return { ...slot, status: "finished", contacted: true, scanId: slot.slotId, sourceFingerprint: plan.arms[slot.arm].sourceFingerprint,
      buildFingerprint: plan.arms[slot.arm].buildFingerprint, stages, commonStages: structuredClone(stages), nativeStages: structuredClone(stages),
      evidenceIssues: [], measurementDisagreements: [], packetVerified: true };
  });
  return { plan, rows };
}
function confirm(row: AnalyzedRow, terminalOnly = false) {
  row.stages.measures.decisionVerified = true; row.stages.outcome = "consent_decision_confirmed";
  row.stages.evidenceStages.initialChoiceRegistrationSupported = !terminalOnly;
  row.stages.evidenceStages.terminalChoiceStateVerified = terminalOnly ? true : null;
  row.stages.evidenceStages.registrationStatus = terminalOnly ? "unconfirmed" : "confirmed";
  row.commonStages = structuredClone(row.stages); row.nativeStages = structuredClone(row.stages);
}

test("fixed provider weights report selected coverage and never invent unrepresented performance", () => {
  const { plan, rows } = fixture(); confirm(rows[1]!);
  const result = summarizePairedComparison(plan, rows, weights);
  const metric = result.weightedMetrics.confirmedPerCompletedPct!;
  assert.equal(result.overall.reference.confirmed, 0); assert.equal(result.overall.candidate.confirmed, 1);
  assert.ok(Math.abs(metric.representedWeight - 578 / 1576) < 1e-15);
  assert.ok(Math.abs(metric.selectedStrataChangePp! - 100 * 449 / 578) < 1e-10);
  assert.equal(metric.fullPopulationEstimatePct, null);
  assert.deepEqual(metric.unrepresentedProviders, ["Other retained strata"]);
  assert.equal(result.providers[2]!.reference.rates.confirmedPerCompletedPct, null);
  assert.deepEqual(result.paired.gainedSites, ["one.example"]);
  assert.equal(result.preliminaryTarget.met, true);
});

test("unknown and uncontacted rows survive and block a complete-pair success claim", () => {
  const { plan, rows } = fixture(); confirm(rows[1]!);
  rows[3]!.contacted = null; rows[3]!.status = "interrupted"; rows[3]!.stages = assessConsentActionStages({} as any);
  const result = summarizePairedComparison(plan, rows, weights);
  assert.equal(result.overall.candidate.planned, 2); assert.equal(result.overall.candidate.contacted, 1);
  assert.equal(result.overall.candidate.contactUnknown, 1);
  assert.equal(result.paired.states.incomplete_contact_pair, 1);
  assert.equal(result.paired.planned, 2); assert.equal(result.preliminaryTarget.met, false);
  assert.equal(result.weightedMetrics.confirmedPerCompletedPct!.selectedStrataChangePp, null);
  assert.deepEqual(result.weightedMetrics.confirmedPerCompletedPct!.selectedStrataWithoutBothDenominators, ["Cookiebot"]);
});

test("notification, aborted observation and terminal-only confirmation remain separate", () => {
  const { plan, rows } = fixture(); confirm(rows[1]!, true);
  rows[3]!.stages.evidenceStages.notificationAcknowledged = true;
  rows[3]!.stages.evidenceStages.registrationStatus = "aborted";
  rows[3]!.stages.outcome = "notification_acknowledged";
  rows[3]!.stages.measures.decisionVerified = true; // Even a contradictory diagnostic input is not a consent decision.
  rows[3]!.stages.measures.observationCompleted = false;
  const result = summarizePairedComparison(plan, rows, weights);
  assert.equal(result.overall.candidate.confirmed, 1);
  assert.equal(result.overall.candidate.initialConfirmed, 0);
  assert.equal(result.overall.candidate.terminalOnlyConfirmed, 1);
  assert.equal(result.overall.candidate.notificationAcknowledged, 1);
  assert.equal(result.overall.candidate.unresolvedCompleted, 1);
  assert.equal(result.overall.percentagePointChange.observationPerContactedPct, -50);
  assert.equal(result.preliminaryTarget.met, false);
});

test("a higher conditional rate cannot hide lost confirmations per contact", () => {
  const { plan, rows } = fixture(); confirm(rows[0]!); confirm(rows[2]!); confirm(rows[1]!);
  rows[3]!.stages.measures.clickCompleted = false;
  rows[3]!.stages.evidenceStages.registrationStatus = "not_attempted";
  const result = summarizePairedComparison(plan, rows, weights);
  assert.equal(result.overall.candidate.rates.confirmedPerCompletedPct, 100);
  assert.equal(result.overall.percentagePointChange.confirmedPerContactedPct, -50);
  assert.equal(result.preliminaryTarget.met, false);
  assert.deepEqual(result.paired.lostSites, ["two.example"]);
});

test("native/common disagreement stays measurement-limited and never reconstructs missing proof", () => {
  const { plan, rows } = fixture(); confirm(rows[1]!);
  const native = structuredClone(rows[1]!.stages); native.measures.decisionVerified = false;
  native.evidenceStages.initialChoiceRegistrationSupported = null;
  const reconciled = reconcileArmStages(rows[1]!.stages, native);
  assert.equal(reconciled.stages.measures.decisionVerified, null);
  assert.equal(reconciled.stages.measures.clickCompleted, true);
  rows[1]!.nativeStages = native; rows[1]!.stages = reconciled.stages; rows[1]!.measurementDisagreements = reconciled.disagreements;
  const result = summarizePairedComparison(plan, rows, weights);
  assert.equal(result.overall.candidate.confirmed, 0);
  assert.equal(result.overall.candidate.commonVerifierConfirmed, 1);
  assert.equal(result.paired.states.unknown_evidence_pair, 1);
  assert.equal(result.preliminaryTarget.met, false);
  assert.equal(reconcileArmStages(rows[0]!.stages, null).stages.measures.decisionVerified, null);
  assert.equal(reconcileArmStages(rows[0]!.stages, null).stages.measures.clickCompleted, true);
});

test("additive legacy diagnostic absence does not erase mutually verified terminal consent", () => {
  const { rows } = fixture(); confirm(rows[0]!, true);
  const native = structuredClone(rows[0]!.stages);
  native.evidenceStages.initialDiagnosticReasons = null;
  native.evidenceStages.terminalDiagnosticReasons = null;
  rows[0]!.stages.evidenceStages.initialDiagnosticReasons = ["api_unavailable"];
  rows[0]!.stages.evidenceStages.terminalDiagnosticReasons = [];
  const reconciled = reconcileArmStages(rows[0]!.stages, native);
  assert.equal(reconciled.stages.measures.decisionVerified, true);
  assert.equal(reconciled.stages.evidenceStages.terminalChoiceStateVerified, true);
  assert.deepEqual(reconciled.disagreements, []);
});

test("missing arm-native measurement preserves known completed denominator as unresolved", () => {
  const { plan, rows } = fixture();
  const reconciled = reconcileArmStages(rows[1]!.commonStages, null);
  rows[1]!.stages = reconciled.stages; rows[1]!.nativeStages = null; rows[1]!.measurementDisagreements = reconciled.disagreements;
  const result = summarizePairedComparison(plan, rows, weights);
  assert.equal(result.overall.candidate.completed, 2);
  assert.equal(result.overall.candidate.unconfirmed, 1);
  assert.equal(result.overall.candidate.unresolvedCompleted, 1);
  assert.equal(result.paired.states.unknown_evidence_pair, 1);
});

test("inapplicable categories and missing receipts remain unconfirmed without denominator exclusions", () => {
  const { plan, rows } = fixture();
  rows[1]!.commonStages.categoryCheck = "no_optional_categories";
  rows[1]!.commonStages.diagnosticReasons = ["category_no_optional", "api_receipt_missing"];
  const result = summarizePairedComparison(plan, rows, weights);
  assert.equal(result.overall.candidate.completed, 2);
  assert.equal(result.overall.candidate.confirmed, 0);
  assert.equal(result.overall.candidate.unconfirmed, 2);
  assert.equal(result.overall.candidate.categoryChecks.no_optional_categories, 1);
  assert.equal(result.overall.candidate.diagnosticReasons.api_receipt_missing, 1);
});

test("attribution changes do not move the selection stratum or create a gain", () => {
  const { plan, rows } = fixture(); rows[1]!.stages.provider = "HubSpot Consent Banner";
  const result = summarizePairedComparison(plan, rows, weights);
  assert.equal(result.providers[0]!.candidate.contacted, 1);
  assert.equal(result.overall.candidate.confirmed, 0);
  assert.equal(result.paired.pairs[0]!.stableVerifiedProvider, false);
  assert.ok(result.observedActionProviders.some(row => row.provider === "HubSpot Consent Banner"));
});

test("duplicates, missing pairs, source mixing, cap drift and holdout leakage fail closed", () => {
  const { plan, rows } = fixture();
  assert.throws(() => validatePairedSummary(plan, rows.slice(1)), /retain every/);
  assert.throws(() => validatePairedSummary(plan, [rows[0]!, rows[0]!, ...rows.slice(2)]), /Duplicate/);
  assert.throws(() => validatePairedSummary(plan, [{ ...rows[0]!, buildFingerprint: "0".repeat(64) }, ...rows.slice(1)]), /source\/build/);
  assert.throws(() => validatePairedPlan({ ...plan, maxContacts: 3 }, weights), /contact cap/);
  assert.throws(() => validatePairedPlan({ ...plan, budgets: { ...plan.budgets, resultMs: 21000 } }, weights), /capture budget/);
  assert.throws(() => validatePairedPlan(plan, [{ provider: "OneTrust", completedClicks: 1575 }]), /1,576/);
  const leakage = structuredClone(plan); leakage.targets[1]!.url = leakage.targets[0]!.url;
  assert.throws(() => validatePairedPlan(leakage, weights), /diagnostic\/holdout/);
  const exposed = summarizePairedComparison({ ...plan, holdoutUsedForRepair: true }, rows, weights);
  assert.equal(exposed.phases.find(row => row.phase === "holdout")!.usableAsUntouchedHoldout, false);
});

function diskFixture(t: test.TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "cmp-paired-analysis-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const write = (name: string, value: unknown): FileRef => {
    const path = join(dir, name), bytes = JSON.stringify(value); writeFileSync(path, bytes);
    return { path, sha256: hash(bytes), bytes: Buffer.byteLength(bytes) };
  };
  const { plan, rows } = fixture();
  plan.historicalBaseline = write("historical.json", { providers: weights }); Object.assign(plan.eligibility, write("eligibility.json", { frozen: true }));
  const events = rows.map(row => ({ event: "contact_started", slotId: row.slotId, scanId: row.scanId,
    url: row.url, action: row.action, arm: row.arm, sourceFingerprint: row.sourceFingerprint, buildFingerprint: row.buildFingerprint,
    dispatchTargetSha256: hash(new URL(row.url).toString()), time: "2026-10-29T00:00:00Z" }));
  const planRef = write("plan.json", plan);
  const sourcedEvents = events.map((event, index) => ({ ...event, source: write(`contact-${index}.json`, { ...event, at: event.time, planSha256: planRef.sha256 }) }));
  const claims = events.map((event, index) => ({ ...event, event: "claimed", source: write(`claim-${index}.json`, { ...event, claimedAt: event.time, planSha256: planRef.sha256 }) }));
  const ledger = write("contacts.json", { schemaVersion: "cmp_paired_local_contact_ledger.v1", planSha256: planRef.sha256, events: [...sourcedEvents, ...claims] });
  const summaries = rows.map((row, index) => {
    const packet = postAcceptEvidencePacketSchema.parse({ artifactVersion: "certscore.post_accept_evidence.v1", artifactOnly: true,
      productionProjectable: false, scanId: `action-${row.scanId}`, parentScanId: row.scanId, targetUrl: row.url, normalizedUrl: row.url,
      observationBranch: "accept_only", phase: "post_action", consentAction: "accept", startedAt: "2026-10-29T00:00:00Z", completedAt: "2026-10-29T00:00:01Z",
      resolver: { found: false, method: "local_fixture_recipe", confidence: 0, recipeId: "fixture" },
      acceptanceRegistration: { status: "not_attempted", acceptanceExercised: false, witnesses: [], reason: "control_not_found" },
      observationWindowMs: 3000, timing: { dispatchDelayMs: 0, navigationMs: 10, resolverMs: 2, confirmationMs: 0, observationMs: 0, totalMs: 12, readyAtMs: 12 },
      network: { requests: [], postAcceptNonEssentialRequests: [], activeRequestIdsAtAcceptanceRegistration: [] },
      storage: { preAction: [], postAction: [], writesAfterAccept: [], itemsCreatedOrChangedAfterAccept: [] }, observations: [],
      cancellation: { requested: false, outcome: "not_requested" }, limitations: [] });
    const receipt = write(`packet-${index}.json`, packet);
    const projection = projectPostAcceptEvidenceForReport({ packet, packetSha256: receipt.sha256 });
    return { ...row, packetPath: receipt.path, packetSha256: receipt.sha256, packetBytes: receipt.bytes,
      dispatchTargetSha256: events[index]!.dispatchTargetSha256, nativeProjection: write(`projection-${index}.json`, projection),
      contactLedgerReceipt: { ledgerSha256: ledger.sha256, eventIndex: index } };
  });
  const summary = { schemaVersion: "cmp_paired_runtime_summary.v1", planSha256: planRef.sha256, localContactLedger: ledger, rows: summaries };
  const summaryRef = write("summary.json", summary);
  return { dir, write, plan, planRef, summary, summaryRef };
}

test("offline loader verifies receipts and derives outcomes from canonical packet bytes", t => {
  const f = diskFixture(t);
  const result = buildPairedComparison(f.planRef.path, f.summaryRef.path, join(f.dir, "output"));
  assert.equal(result.rows.length, 4); assert.equal(result.rows.every(row => row.packetVerified), true);
  assert.equal(result.rows.every(row => row.evidenceIssues.length === 0 && row.measurementDisagreements.length === 0), true);
  assert.equal(result.overall.candidate.confirmed, 0); // Summary fixture claimed completed; raw packet did not.
  assert.equal(result.overall.candidate.completed, 0);
  assert.throws(() => buildPairedComparison(f.planRef.path, f.summaryRef.path, join(f.dir, "output")), /immutable/);
});

test("wrong-session packet, missing native receipt and wrong source ledger remain unresolved rows", t => {
  const f = diskFixture(t);
  const raw = JSON.parse(readFileSync(f.summary.rows[0]!.packetPath, "utf8")); raw.parentScanId = "wrong-session";
  const wrong = f.write("wrong.json", raw); Object.assign(f.summary.rows[0]!, { packetPath: wrong.path, packetSha256: wrong.sha256, packetBytes: wrong.bytes });
  f.summary.rows[1]!.nativeProjection = null as any;
  f.summary.rows[2]!.contactLedgerReceipt = { ledgerSha256: "0".repeat(64), eventIndex: 2 };
  const summary = f.write("changed-summary.json", f.summary);
  const result = buildPairedComparison(f.planRef.path, summary.path, join(f.dir, "output"));
  assert.equal(result.rows.length, 4);
  assert.match(result.rows[0]!.evidenceIssues[0]!, /session\/action mismatch/);
  assert.deepEqual(result.rows[1]!.measurementDisagreements, ["native_projection_unavailable"]);
  assert.deepEqual(result.rows[2]!.evidenceIssues, ["contact_ledger_receipt_unverified"]);
  assert.equal(result.rows.slice(0, 3).every(row => row.stages.measures.decisionVerified === null), true);
  assert.equal(result.preliminaryTarget.met, false);
});

test("summary plan drift and contact omissions fail before any report is written", t => {
  const f = diskFixture(t);
  const changed = f.write("changed-summary.json", { ...f.summary, planSha256: "0".repeat(64) });
  assert.throws(() => buildPairedComparison(f.planRef.path, changed.path, join(f.dir, "output")), /plan hash/);
  f.summary.rows[0]!.contacted = false; f.summary.rows[0]!.packetPath = null as any;
  const omitted = f.write("omitted-summary.json", f.summary);
  assert.throws(() => buildPairedComparison(f.planRef.path, omitted.path, join(f.dir, "output")), /omitted or over-cap/);
});

test("authorized resolved targets stay distinct from initial dispatch and wrong starting targets fail", t => {
  const f = diskFixture(t);
  for (const index of [0, 1]) {
    const row = f.summary.rows[index]!, packet = JSON.parse(readFileSync(row.packetPath, "utf8"));
    packet.targetUrl = "https://resolved.example/"; packet.exactTargetSha256 = hash(packet.targetUrl);
    if (index === 1) packet.normalizedUrl = "https://wrong.example/";
    const ref = f.write(`redirect-${index}.json`, packet);
    Object.assign(row, { packetPath: ref.path, packetSha256: ref.sha256, packetBytes: ref.bytes,
      nativeProjection: f.write(`redirect-projection-${index}.json`, projectPostAcceptEvidenceForReport({ packet: postAcceptEvidencePacketSchema.parse(packet), packetSha256: ref.sha256 })) });
  }
  const summary = f.write("redirect-summary.json", f.summary);
  const result = buildPairedComparison(f.planRef.path, summary.path, join(f.dir, "output"));
  assert.equal(result.rows[0]!.packetVerified, true); assert.deepEqual(result.rows[0]!.evidenceIssues, []);
  assert.equal(result.rows[0]!.stages.measures.decisionVerified, false); // Redirect presence supplies no action or consent proof.
  assert.match(result.rows[1]!.evidenceIssues[0]!, /starting target mismatch/);
});
